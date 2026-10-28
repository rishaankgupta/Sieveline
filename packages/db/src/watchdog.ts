import { and, eq, inArray, lt, or, sql } from "drizzle-orm";
import { setRunStatus, settleRun } from "./research.ts";
import * as s from "./schema.ts";
import { withTenant } from "./tenant.ts";
import type { AnyDb } from "./workspaces.ts";

/**
 * Stuck work: runs with no progress for a long time and deep dives past their deadline. Needs a
 * connection that sees every workspace (admin role). Ending work always releases its credit
 * reservation, so a crashed workflow can't hold a workspace's credits forever.
 */

export const SYSTEM_ACTOR = "system:watchdog";

export async function findStaleWork(db: AnyDb, opts: { runIdleMs: number; deepDiveMaxMs: number; limit?: number }) {
  const runCutoff = new Date(Date.now() - opts.runIdleMs);
  const diveCutoff = new Date(Date.now() - opts.deepDiveMaxMs);
  const limit = opts.limit ?? 25;
  const runs = await db
    .select({ id: s.runs.id, workspaceId: s.runs.workspaceId, workflowRunId: s.runs.workflowRunId, status: s.runs.status })
    .from(s.runs)
    .where(and(
      inArray(s.runs.status, ["queued", "running"]),
      or(lt(s.runs.lastHeartbeatAt, runCutoff), and(sql`${s.runs.lastHeartbeatAt} is null`, lt(s.runs.createdAt, runCutoff))),
    ))
    .limit(limit);
  const dives = await db
    .select({
      id: s.deepDives.id, workspaceId: s.deepDives.workspaceId, workflowRunId: s.deepDives.workflowRunId,
      tavilyRequestId: s.deepDives.tavilyRequestId, model: s.deepDives.model, createdAt: s.deepDives.createdAt,
    })
    .from(s.deepDives)
    .where(and(inArray(s.deepDives.status, ["queued", "running"]), lt(s.deepDives.createdAt, diveCutoff)))
    .limit(limit);
  return { runs, dives };
}

/**
 * Ends a run that will not finish by itself: releases the reservation (charging what it used),
 * records why, and writes an audit row. Idempotent: an already-finished run is left alone.
 */
export async function endRun(
  db: AnyDb,
  input: { runId: string; workspaceId: string; actorUserId: string; actorIsAdmin: boolean; status: "failed" | "cancelled"; message: string },
): Promise<boolean> {
  const ctx = { userId: input.actorUserId, workspaceId: input.workspaceId };
  // Under the tenant context so this works for the app role too (a buyer cancelling their own run).
  const [run] = await withTenant(db, ctx, (tx) => tx.select({ status: s.runs.status }).from(s.runs).where(eq(s.runs.id, input.runId)));
  if (!run || (run.status !== "queued" && run.status !== "running")) return false;
  // Settling first sets the run's remaining budget to 0, so any step still in flight is refused
  // at its next Tavily call (guarded() reads the remaining reservation).
  await settleRun(db, ctx, input.runId);
  await setRunStatus(db, ctx, input.runId, { status: input.status, finished: true, error: input.message });
  await withTenant(db, ctx, (tx) =>
    tx.insert(s.auditLog).values({
      workspaceId: input.workspaceId, actorUserId: input.actorUserId, actorIsAdmin: input.actorIsAdmin,
      action: input.status === "cancelled" ? "run.cancelled" : "run.ended_stuck", targetType: "run", targetId: input.runId,
      after: { message: input.message },
    }),
  );
  return true;
}
