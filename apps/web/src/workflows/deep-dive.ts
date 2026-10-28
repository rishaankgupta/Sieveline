import { buildDeepDiveRequest, deepDiveReserve, parseDeepDiveResult, parseThesis, TavilyError, type DeepDiveModel } from "@sieveline/core";
import { finishDeepDive, getDeepDive, getRun, listCompanies, listFacts, updateDeepDive } from "@sieveline/db";
import { FatalError, sleep } from "workflow";
import { researchDeps, researchLog, tavilyUnmetered } from "../server/research-deps.ts";

export interface DeepDiveInput {
  deepDiveId: string;
  workspaceId: string;
  userId: string;
}

/** Tavily Research usually takes minutes; poll every 15 s for up to 30 minutes. */
const POLL_EVERY = "15s";
const MAX_POLLS = 120;

/**
 * One deep dive as a durable workflow: create the Tavily Research task once, then poll until
 * it finishes. Sleeping between polls costs nothing and survives redeploys.
 */
export async function deepDiveRun(input: DeepDiveInput) {
  "use workflow";
  try {
    const created = await createTaskStep(input);
    if (!created.ok) return { status: "failed" as const };
    for (let i = 0; i < MAX_POLLS; i++) {
      await sleep(POLL_EVERY);
      const r = await pollStep(input);
      if (r !== "pending") return { status: r };
    }
    await timeoutStep(input);
    return { status: "failed" as const };
  } catch (e) {
    await failStep(input, e instanceof Error ? e.message : "Deep dive failed");
    throw e;
  }
}

async function createTaskStep(input: DeepDiveInput): Promise<{ ok: boolean }> {
  "use step";
  const { db } = researchDeps();
  const dive = await getDeepDive(db, input, input.deepDiveId);
  if (!dive) throw new FatalError("deep dive not found");
  if (dive.tavilyRequestId) return { ok: true }; // already created by an earlier attempt
  if (dive.status !== "queued") return { ok: false };

  const run = dive.runId ? await getRun(db, input, dive.runId) : null;
  const company = run ? (await listCompanies(db, input, run.id)).find((c) => c.id === dive.companyId) : undefined;
  if (!run || !company) {
    await finishDeepDive(db, input, dive.id, { status: "failed", credits: 0, error: "Company no longer exists" });
    return { ok: false };
  }
  const facts = await listFacts(db, input, [company.id]);
  const req = buildDeepDiveRequest({
    company: { domain: company.domain, name: company.name },
    thesis: parseThesis(run.thesisSnapshot),
    facts: facts.map((f) => ({ kind: f.kind, key: f.key, value: f.value, quote: f.quote, sourceUrl: f.sourceUrl })),
    model: dive.model as DeepDiveModel,
  });

  let requestId: string;
  try {
    requestId = (await tavilyUnmetered().createResearch(req)).request_id;
  } catch (e) {
    // Never retried: if Tavily accepted the first POST, a retry would start and bill a second task.
    // An error before Tavily answered (timeout/network) is ambiguous, so it is recorded as such.
    const ambiguous = e instanceof TavilyError && (e.code === "timeout" || e.code === "network" || e.code === "server");
    await finishDeepDive(db, input, dive.id, {
      status: "failed",
      credits: 0,
      error: ambiguous ? "Tavily did not confirm the task; it may still have been charged" : e instanceof Error ? e.message : "Could not start research",
    });
    researchLog.warn("deep dive create failed", { deepDiveId: dive.id, ambiguous, err: e });
    return { ok: false };
  }
  await updateDeepDive(db, input, dive.id, { status: "running", tavilyRequestId: requestId });
  return { ok: true };
}

/** Checks the task once. Writing the result is idempotent, so a retried step can't bill twice. */
async function pollStep(input: DeepDiveInput): Promise<"pending" | "succeeded" | "failed"> {
  "use step";
  const { db } = researchDeps();
  const dive = await getDeepDive(db, input, input.deepDiveId);
  if (!dive || !dive.tavilyRequestId) throw new FatalError("deep dive has no Tavily task");
  if (dive.status === "succeeded" || dive.status === "failed") return dive.status;

  const res = await tavilyUnmetered().getResearch(dive.tavilyRequestId);
  if (res.status !== "completed" && res.status !== "failed") return "pending";
  if (res.status === "failed") {
    // Tavily's docs don't say whether failed tasks are billed; we record 0 and reconcile via /usage.
    await finishDeepDive(db, input, dive.id, { status: "failed", credits: 0, error: "Tavily research failed" });
    return "failed";
  }
  const parsed = parseDeepDiveResult(res);
  let credits = parsed.credits;
  if (credits === null) {
    credits = deepDiveReserve(dive.model as DeepDiveModel);
    researchLog.warn("deep dive usage missing; charged the worst case", { deepDiveId: dive.id, credits });
  }
  await finishDeepDive(db, input, dive.id, { status: "succeeded", credits, dossier: parsed.content, sources: parsed.sources });
  researchLog.info("deep dive finished", { deepDiveId: dive.id, credits, sources: parsed.sources.length, kind: parsed.content.kind });
  return "succeeded";
}

async function timeoutStep(input: DeepDiveInput) {
  "use step";
  const { db } = researchDeps();
  const dive = await getDeepDive(db, input, input.deepDiveId);
  if (!dive) return;
  // The task may still finish and bill on Tavily's side, so the reservation is charged in full.
  await finishDeepDive(db, input, dive.id, {
    status: "failed",
    credits: deepDiveReserve(dive.model as DeepDiveModel),
    error: "Research took longer than 30 minutes; charged the maximum because Tavily may still bill it",
  });
}

/** Last resort after a step gave up: never leave credits reserved. Charged in full if Tavily had the task. */
async function failStep(input: DeepDiveInput, message: string) {
  "use step";
  const { db } = researchDeps();
  const dive = await getDeepDive(db, input, input.deepDiveId);
  if (!dive) return;
  await finishDeepDive(db, input, dive.id, {
    status: "failed",
    credits: dive.tavilyRequestId ? deepDiveReserve(dive.model as DeepDiveModel) : 0,
    error: message,
  });
}
