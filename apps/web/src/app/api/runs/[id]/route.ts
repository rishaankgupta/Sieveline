import { assertCan } from "@sieveline/core";
import { endRun, getRun, getShortlist, schema, withTenant } from "@sieveline/db";
import { eq } from "drizzle-orm";
import { handle, HttpError, isUuid } from "@/server/api";
import { app } from "@/server/context";
import { requireWorkspace } from "@/server/session";
import { RUN_IDLE_MS } from "@/server/watchdog";

export const dynamic = "force-dynamic";

/** Run status, step progress and (when finished) the shortlist. Polled by the run page. */
export function GET(_request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  return handle(async () => {
    const { id } = await params;
    if (!isUuid(id)) throw new HttpError(404, "Not found");
    const ws = await requireWorkspace();
    assertCan(ws.role, "run.view");
    const { db } = app();
    let run = await getRun(db, ws, id);
    if (!run) throw new HttpError(404, "Not found");
    // Self-healing: a run with no progress for too long is ended here, releasing its credits,
    // so the buyer is not left watching a spinner (the daily cron catches runs nobody watches).
    const beat = (run.lastHeartbeatAt ?? run.createdAt).getTime();
    if ((run.status === "running" || run.status === "queued") && Date.now() - beat > RUN_IDLE_MS) {
      await endRun(db, { runId: id, workspaceId: ws.workspaceId, actorUserId: ws.userId, actorIsAdmin: false, status: "failed",
        message: "Stopped: no progress for 45 minutes. Credits used so far were charged; the rest was released." });
      run = (await getRun(db, ws, id)) ?? run;
    }
    const steps = await withTenant(db, ws, (tx) =>
      tx.select({ step: schema.runSteps.step, batch: schema.runSteps.batch, status: schema.runSteps.status }).from(schema.runSteps).where(eq(schema.runSteps.runId, id)),
    );
    const shortlist = run.status === "succeeded" ? await getShortlist(db, ws, id) : [];
    return Response.json(
      {
        id: run.id, status: run.status, error: run.error, creditsUsed: Number(run.creditsUsed), createdAt: run.createdAt,
        startedAt: run.startedAt, finishedAt: run.finishedAt, steps, shortlist,
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  });
}
