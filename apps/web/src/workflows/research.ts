import {
  applyNewsFlags, budgetedTavily, buildShortlist, CreditLimitReached, parseThesis, rankCompanies, researchSettingsSchema,
  stageCrawl, stageDiscover, stageNews, stageRead, stageScore, TavilyError, type Candidate,
} from "@sieveline/core";
import {
  getRun, isResearchPausedFor, listCompanies, listFacts, recordStep, runCreditsRemaining, saveScoredCompany, saveShortlist, setRunStatus, settleRun,
  upsertCompanies,
} from "@sieveline/db";
import { FatalError, RetryableError } from "workflow";
import { llmForRun, researchDeps, researchLog, tavilyForRun } from "../server/research-deps.ts";
import { factsFor, scoredFromRows } from "../server/research-store.ts";

export interface RunInput {
  runId: string;
  workspaceId: string;
  userId: string;
}

const READ_BATCH = 10;
const DEEP_BATCH = 3;

/**
 * The research pipeline as a durable workflow. Each step is short and saves its results, so a
 * crash or redeploy resumes at the last finished step, and a failure retries only that step.
 * Running out of reserved credits ends the run early with what was found, never mid-write.
 */
export async function researchRun(input: RunInput) {
  "use workflow";
  await markRunning(input);
  try {
    const discovered = await discoverStep(input);
    let stop: StepOut = discovered;
    const domains = discovered.domains;
    for (let i = 0; i < domains.length && !stop.stopped; i += READ_BATCH) {
      stop = await readAndScoreStep(input, domains.slice(i, i + READ_BATCH), i / READ_BATCH);
    }
    const top = await pickTopStep(input);
    for (let i = 0; i < top.news.length && !stop.stopped; i += READ_BATCH) {
      stop = await newsStep(input, top.news.slice(i, i + READ_BATCH), i / READ_BATCH);
    }
    for (let i = 0; i < top.crawl.length && !stop.stopped; i += DEEP_BATCH) {
      stop = await crawlStep(input, top.crawl.slice(i, i + DEEP_BATCH), i / DEEP_BATCH);
    }
    return await finalizeStep(input, stop.stopped ? (stop.why ?? "credits") : null);
  } catch (e) {
    await failRun(input, e instanceof Error ? e.message : "Research failed");
    throw e;
  }
}

/** Why a run ended before its last stage. Both keep everything found so far. */
type StopReason = "credits" | "tavily_limit";
interface StepOut {
  stopped: boolean;
  why?: StopReason;
}

/**
 * Failures that should end the run early with its results (not retried): our own credit budget
 * (which is also how a paused platform or workspace shows up) and Tavily's account limits.
 */
function stopReason(e: unknown): StopReason | null {
  if (e instanceof CreditLimitReached) return "credits";
  if (e instanceof TavilyError && (e.code === "plan_limit" || e.code === "paygo_limit")) return "tavily_limit";
  return null;
}

/** A rejected API key won't fix itself, so fail now instead of after three retries. */
function failFastOn(e: unknown): void {
  if (e instanceof TavilyError && (e.code === "unauthorized" || e.code === "forbidden")) {
    throw new FatalError("The research provider rejected Sieveline's API key. An operator needs to check TAVILY_API_KEY.");
  }
}

/** Wait before retrying a batch whose AI scoring failed entirely (free models allow ~2 requests a minute). */
const scoringRetryMs = () => (Number(process.env.SCORING_RETRY_SECONDS ?? 60) || 60) * 1000;

// ---------------------------------------------------------------- shared helpers (step context)
async function loadRun(input: RunInput) {
  const { db } = researchDeps();
  const run = await getRun(db, input, input.runId);
  if (!run) throw new FatalError("run not found");
  return { db, run, thesis: parseThesis(run.thesisSnapshot), settings: researchSettingsSchema.parse(run.settingsSnapshot ?? {}) };
}

/**
 * Tavily client limited to what the run may still spend. A paused platform or workspace gives
 * it a budget of 0, so the stage stops at its first call and the run ends with what it has
 * (the kill switch takes effect at the next stage, not only for new runs).
 */
async function guarded(input: RunInput, ttlDays: number) {
  const { db } = researchDeps();
  const remaining = (await isResearchPausedFor(db, input)) ? 0 : await runCreditsRemaining(db, input, input.runId);
  return budgetedTavily(tavilyForRun(input, input.runId, ttlDays), remaining);
}

async function trackStep<T>(input: RunInput, step: string, batch: number, fn: () => Promise<T>): Promise<T> {
  const { db } = researchDeps();
  await recordStep(db, input, { runId: input.runId, step, batch, status: "running" });
  try {
    const out = await fn();
    await recordStep(db, input, { runId: input.runId, step, batch, status: "succeeded" });
    return out;
  } catch (e) {
    await recordStep(db, input, { runId: input.runId, step, batch, status: "failed", error: e instanceof Error ? e.message : "error" });
    throw e;
  }
}

async function loadScored(input: RunInput, domains: string[]) {
  const { db, thesis, settings } = await loadRun(input);
  const rows = (await listCompanies(db, input, input.runId)).filter((r) => domains.includes(r.domain));
  const ids = rows.map((r) => r.id);
  const facts = await listFacts(db, input, ids);
  return { db, thesis, settings, scored: rows.map((r) => scoredFromRows(r, facts.filter((f) => f.companyId === r.id), thesis)) };
}

// ---------------------------------------------------------------- steps
async function markRunning(input: RunInput) {
  "use step";
  const { db } = researchDeps();
  await setRunStatus(db, input, input.runId, { status: "running", started: true });
}

async function discoverStep(input: RunInput): Promise<StepOut & { domains: string[] }> {
  "use step";
  return trackStep(input, "discover", 0, async () => {
    const { db, run, thesis, settings } = await loadRun(input);
    const tavily = await guarded(input, settings.cacheTtlDays);
    const seeds = ((run.settingsSnapshot as { seeds?: string[] })?.seeds ?? []).map(
      (d): Candidate => ({ domain: d, name: d, snippet: "", foundBy: "seed list", source: "seed", relevance: 1 }),
    );
    try {
      const { candidates } = await stageDiscover({ tavily, llm: llmForRun(input, input.runId) }, thesis, settings, seeds);
      await upsertCompanies(db, input, input.runId, candidates.map((c) => ({ domain: c.domain, name: c.name, source: c.source, foundBy: c.foundBy })));
      return { domains: candidates.map((c) => c.domain), stopped: false };
    } catch (e) {
      const why = stopReason(e);
      if (why) {
        if (seeds.length) await upsertCompanies(db, input, input.runId, seeds);
        return { domains: seeds.map((s) => s.domain), stopped: true, why };
      }
      failFastOn(e);
      throw e;
    }
  });
}

async function readAndScoreStep(input: RunInput, domains: string[], batch: number): Promise<StepOut> {
  "use step";
  return trackStep(input, "read_score", batch, async () => {
    const { db, thesis, settings } = await loadRun(input);
    const rows = (await listCompanies(db, input, input.runId)).filter((r) => domains.includes(r.domain));
    const candidates: Candidate[] = rows.map((r) => ({ domain: r.domain, name: r.name ?? r.domain, snippet: "", foundBy: r.foundBy ?? "", source: r.source as Candidate["source"], relevance: 0 }));
    const tavily = await guarded(input, settings.cacheTtlDays);
    let pages;
    try {
      pages = await stageRead({ tavily }, thesis, settings, candidates);
    } catch (e) {
      const why = stopReason(e);
      if (why) return { stopped: true, why };
      failFastOn(e);
      throw e;
    }
    const llm = llmForRun(input, input.runId);
    const all = [];
    for (const c of candidates) all.push(await stageScore({ ...(llm ? { llm } : {}) }, thesis, c, pages.get(c.domain) ?? []));
    // If the AI failed for every company, saving would fill the list with "unknown" answers.
    // Retry the batch later instead (re-reading pages is free: they are cached).
    const failed = all.filter((x) => x.verified.notes.some((n) => n.startsWith("scoring failed")));
    if (llm && all.length > 0 && failed.length === all.length) {
      researchLog.warn("AI scoring failed for a whole batch; retrying", { runId: input.runId, batch, note: failed[0]?.verified.notes[0]?.slice(0, 160) });
      throw new RetryableError(`AI scoring failed for all ${all.length} companies in a batch`, { retryAfter: scoringRetryMs() });
    }
    for (const scored of all) {
      await saveScoredCompany(db, input, input.runId, {
        domain: scored.domain, name: scored.name, score: scored.result.score, status: scored.result.status,
        failedRule: scored.result.failedRule, summary: scored.verified.summary, pages: scored.pages, facts: factsFor(scored),
      });
    }
    return { stopped: false };
  });
}

async function pickTopStep(input: RunInput): Promise<{ news: string[]; crawl: string[] }> {
  "use step";
  const { db, settings } = await loadRun(input);
  const rows = await listCompanies(db, input, input.runId);
  const ranked = rankCompanies(
    rows.map((r) => ({ domain: r.domain, result: { status: (r.status === "unscored" ? "weak_fit" : r.status), score: Number(r.score ?? 0), failedRule: r.failedRule, reasons: [] } })),
  ).filter((r) => !["fails_rule", "no_website_text"].includes(r.result.status));
  return {
    news: ranked.slice(0, settings.newsCheckTop).map((r) => r.domain),
    crawl: ranked.slice(0, settings.crawlTop).map((r) => r.domain),
  };
}

async function newsStep(input: RunInput, domains: string[], batch: number): Promise<StepOut> {
  "use step";
  return trackStep(input, "news", batch, async () => {
    const { db, thesis, settings, scored } = await loadScored(input, domains);
    const tavily = await guarded(input, settings.cacheTtlDays);
    for (const c of scored) {
      let flags;
      try {
        flags = await stageNews({ tavily }, c);
      } catch (e) {
        const why = stopReason(e);
        if (why) return { stopped: true, why };
        failFastOn(e);
        throw e;
      }
      const updated = applyNewsFlags(c, flags, thesis);
      await saveScoredCompany(db, input, input.runId, {
        domain: c.domain, name: updated.name, score: updated.result.score, status: updated.result.status, failedRule: updated.result.failedRule,
        summary: updated.verified.summary, pages: updated.pages, facts: factsFor(updated),
      });
    }
    return { stopped: false };
  });
}

async function crawlStep(input: RunInput, domains: string[], batch: number): Promise<StepOut> {
  "use step";
  return trackStep(input, "crawl", batch, async () => {
    const { db, thesis, settings, scored } = await loadScored(input, domains);
    const tavily = await guarded(input, settings.cacheTtlDays);
    const llm = llmForRun(input, input.runId);
    for (const c of scored) {
      let deep;
      try {
        deep = await stageCrawl({ tavily, ...(llm ? { llm } : {}) }, thesis, settings, c);
      } catch (e) {
        const why = stopReason(e);
        if (why) return { stopped: true, why };
        failFastOn(e);
        throw e;
      }
      await saveScoredCompany(db, input, input.runId, {
        domain: c.domain, name: deep.name, score: deep.result.score, status: deep.result.status, failedRule: deep.result.failedRule,
        summary: deep.verified.summary, pages: deep.pages, facts: factsFor(deep),
      });
    }
    return { stopped: false };
  });
}

async function finalizeStep(input: RunInput, why: StopReason | null) {
  "use step";
  const stoppedEarly = why !== null;
  const { db, thesis, settings } = await loadRun(input);
  const rows = await listCompanies(db, input, input.runId);
  const { scored } = await loadScored(input, rows.map((r) => r.domain));
  const shortlist = buildShortlist(scored, thesis, settings.shortlistSize);
  await saveShortlist(db, input, input.runId, shortlist);
  await settleRun(db, input, input.runId);
  const reason =
    why === null ? null
    : why === "tavily_limit" ? "Stopped early: the research provider's monthly credits ran out. Companies found so far are kept."
    : (await isResearchPausedFor(db, input)) ? "Stopped early: research was paused by an operator"
    : "Stopped early: credit reservation used up";
  if (why === "tavily_limit") researchLog.error("Tavily account limit reached during a run", { runId: input.runId });
  await setRunStatus(db, input, input.runId, { status: "succeeded", finished: true, error: reason });
  researchLog.info("run finished", { runId: input.runId, companies: rows.length, shortlist: shortlist.length, stoppedEarly });
  return { companies: rows.length, shortlist: shortlist.length, stoppedEarly };
}

async function failRun(input: RunInput, message: string) {
  "use step";
  const { db } = researchDeps();
  await settleRun(db, input, input.runId);
  await setRunStatus(db, input, input.runId, { status: "failed", finished: true, error: userFacingError(message) });
  researchLog.warn("run failed", { runId: input.runId, error: message.slice(0, 500) });
}

/**
 * What the buyer sees when a run fails. The runtime wraps step errors as
 * `Step "<internal id>" failed after 3 retries: <message>`; internal ids and unexpected errors
 * (database, bugs) are not shown, only messages written for people.
 */
export function userFacingError(message: string): string {
  const core = (message.match(/^Step "[^"]*" (?:failed after \d+ retr(?:y|ies)|exceeded max retries[^:]*): ([\s\S]*)$/)?.[1] ?? message).trim();
  if (/AI scoring failed/.test(core)) return "The AI that checks companies kept failing, so this list was stopped. Unused credits were returned; please try again later.";
  if (/rejected Sieveline's API key/.test(core)) return core;
  return "Something went wrong while researching, so this list was stopped. Unused credits were returned.";
}
