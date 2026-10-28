import {
  applyNewsFlags, budgetedTavily, buildShortlist, CreditLimitReached, parseThesis, rankCompanies, researchSettingsSchema,
  stageCrawl, stageDiscover, stageNews, stageRead, stageScore, type Candidate,
} from "@sieveline/core";
import {
  getRun, isResearchPausedFor, listCompanies, listFacts, recordStep, runCreditsRemaining, saveScoredCompany, saveShortlist, setRunStatus, settleRun,
  upsertCompanies,
} from "@sieveline/db";
import { FatalError } from "workflow";
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
    let stopped = discovered.stopped;
    const domains = discovered.domains;
    for (let i = 0; i < domains.length && !stopped; i += READ_BATCH) {
      stopped = (await readAndScoreStep(input, domains.slice(i, i + READ_BATCH), i / READ_BATCH)).stopped;
    }
    const top = await pickTopStep(input);
    for (let i = 0; i < top.news.length && !stopped; i += READ_BATCH) {
      stopped = (await newsStep(input, top.news.slice(i, i + READ_BATCH), i / READ_BATCH)).stopped;
    }
    for (let i = 0; i < top.crawl.length && !stopped; i += DEEP_BATCH) {
      stopped = (await crawlStep(input, top.crawl.slice(i, i + DEEP_BATCH), i / DEEP_BATCH)).stopped;
    }
    return await finalizeStep(input, stopped);
  } catch (e) {
    await failRun(input, e instanceof Error ? e.message : "Research failed");
    throw e;
  }
}

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

async function discoverStep(input: RunInput): Promise<{ domains: string[]; stopped: boolean }> {
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
      if (e instanceof CreditLimitReached) {
        if (seeds.length) await upsertCompanies(db, input, input.runId, seeds);
        return { domains: seeds.map((s) => s.domain), stopped: true };
      }
      throw e;
    }
  });
}

async function readAndScoreStep(input: RunInput, domains: string[], batch: number): Promise<{ stopped: boolean }> {
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
      if (e instanceof CreditLimitReached) return { stopped: true };
      throw e;
    }
    const llm = llmForRun(input, input.runId);
    for (const c of candidates) {
      const scored = await stageScore({ ...(llm ? { llm } : {}) }, thesis, c, pages.get(c.domain) ?? []);
      await saveScoredCompany(db, input, input.runId, {
        domain: c.domain, name: scored.name, score: scored.result.score, status: scored.result.status,
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

async function newsStep(input: RunInput, domains: string[], batch: number): Promise<{ stopped: boolean }> {
  "use step";
  return trackStep(input, "news", batch, async () => {
    const { db, thesis, settings, scored } = await loadScored(input, domains);
    const tavily = await guarded(input, settings.cacheTtlDays);
    for (const c of scored) {
      let flags;
      try {
        flags = await stageNews({ tavily }, c);
      } catch (e) {
        if (e instanceof CreditLimitReached) return { stopped: true };
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

async function crawlStep(input: RunInput, domains: string[], batch: number): Promise<{ stopped: boolean }> {
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
        if (e instanceof CreditLimitReached) return { stopped: true };
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

async function finalizeStep(input: RunInput, stoppedEarly: boolean) {
  "use step";
  const { db, thesis, settings } = await loadRun(input);
  const rows = await listCompanies(db, input, input.runId);
  const { scored } = await loadScored(input, rows.map((r) => r.domain));
  const shortlist = buildShortlist(scored, thesis, settings.shortlistSize);
  await saveShortlist(db, input, input.runId, shortlist);
  await settleRun(db, input, input.runId);
  const reason = stoppedEarly
    ? (await isResearchPausedFor(db, input)) ? "Stopped early: research was paused by an operator" : "Stopped early: credit reservation used up"
    : null;
  await setRunStatus(db, input, input.runId, { status: "succeeded", finished: true, error: reason });
  researchLog.info("run finished", { runId: input.runId, companies: rows.length, shortlist: shortlist.length, stoppedEarly });
  return { companies: rows.length, shortlist: shortlist.length, stoppedEarly };
}

async function failRun(input: RunInput, message: string) {
  "use step";
  const { db } = researchDeps();
  await settleRun(db, input, input.runId);
  await setRunStatus(db, input, input.runId, { status: "failed", finished: true, error: message });
}
