import { assertCan } from "@sieveline/core";
import { endRun, getRun } from "@sieveline/db";
import { getRun as getWorkflowRun } from "workflow/api";
import { assertSameOrigin, handle, HttpError, isUuid } from "@/server/api";
import { app, logger } from "@/server/context";
import { requireWorkspace } from "@/server/session";

export const dynamic = "force-dynamic";

/**
 * Cancels a running list. The reservation is settled first, which leaves the run a budget of 0,
 * so a step already in progress is refused at its next Tavily call. Credits already used stay
 * charged; the rest is released. Companies found so far are kept.
 */
export function POST(request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  return handle(async () => {
    const { db, env } = app();
    assertSameOrigin(request, env.APP_URL);
    const { id } = await params;
    if (!isUuid(id)) throw new HttpError(404, "Not found");
    const ws = await requireWorkspace();
    assertCan(ws.role, "run.cancel");
    const run = await getRun(db, ws, id);
    if (!run) throw new HttpError(404, "Not found");
    if (run.status !== "queued" && run.status !== "running") throw new HttpError(409, "This list has already finished");
    const ended = await endRun(db, { runId: id, workspaceId: ws.workspaceId, actorUserId: ws.userId, actorIsAdmin: false, status: "cancelled", message: "Cancelled by a team member" });
    if (run.workflowRunId) {
      try {
        await getWorkflowRun(run.workflowRunId).cancel({ cancelReason: "cancelled by user" });
      } catch (e) {
        logger.warn("workflow cancel failed", { runId: id, err: e });
      }
    }
    if (!ended) throw new HttpError(409, "This list has already finished");
    return new Response(null, { status: 204 });
  });
}
