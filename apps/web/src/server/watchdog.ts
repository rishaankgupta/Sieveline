import "server-only";
import { deepDiveReserve, type DeepDiveModel } from "@sieveline/core";
import { endRun, findStaleWork, finishDeepDive, SYSTEM_ACTOR, type AnyDb } from "@sieveline/db";
import { getRun as getWorkflowRun } from "workflow/api";
import { logger } from "./context";

/** A run with no progress for 45 minutes is stuck (a free-tier LLM batch takes about 5). */
export const RUN_IDLE_MS = 45 * 60_000;
/** Deep dives poll for at most 30 minutes; 45 leaves room for retries. */
export const DEEP_DIVE_MAX_MS = 45 * 60_000;

async function cancelWorkflow(workflowRunId: string | null, reason: string) {
  if (!workflowRunId) return;
  try {
    await getWorkflowRun(workflowRunId).cancel({ cancelReason: reason.slice(0, 500) });
  } catch (e) {
    // Already finished or unknown to this world: the database state below is what matters.
    logger.warn("workflow cancel failed", { workflowRunId, err: e });
  }
}

/**
 * Ends stuck runs and deep dives and releases their credits. Uses the admin connection, so it
 * sees every workspace. Safe to run often: everything it does is idempotent.
 */
export async function sweepStaleWork(db: AnyDb) {
  const { runs, dives } = await findStaleWork(db, { runIdleMs: RUN_IDLE_MS, deepDiveMaxMs: DEEP_DIVE_MAX_MS });
  let endedRuns = 0;
  let endedDives = 0;
  for (const r of runs) {
    await cancelWorkflow(r.workflowRunId, "watchdog: no progress");
    if (await endRun(db, { runId: r.id, workspaceId: r.workspaceId, actorUserId: SYSTEM_ACTOR, actorIsAdmin: true, status: "failed", message: "Stopped: no progress for 45 minutes. Credits used so far were charged; the rest was released." })) endedRuns++;
  }
  for (const d of dives) {
    await cancelWorkflow(d.workflowRunId, "watchdog: deep dive overdue");
    // If Tavily accepted the task it may still bill it, so the worst case is charged.
    const credits = d.tavilyRequestId ? deepDiveReserve(d.model as DeepDiveModel) : 0;
    if (await finishDeepDive(db, { userId: SYSTEM_ACTOR, workspaceId: d.workspaceId }, d.id, { status: "failed", credits, error: "Stopped: took longer than 45 minutes" })) endedDives++;
  }
  if (endedRuns || endedDives) logger.warn("watchdog ended stale work", { endedRuns, endedDives });
  return { endedRuns, endedDives, checkedRuns: runs.length, checkedDives: dives.length };
}
