import { endRun, schema } from "@sieveline/db";
import { eq } from "drizzle-orm";
import { getRun as getWorkflowRun } from "workflow/api";
import { z } from "zod";
import { actorOf, adminDb, requireStaff } from "@/server/admin";
import { assertSameOrigin, handle, HttpError, isUuid, readJson } from "@/server/api";
import { app, logger } from "@/server/context";

export const dynamic = "force-dynamic";

const body = z.object({ reason: z.string().trim().min(3, "Give a short reason").max(500) });

/** Admin stop for any workspace's running list: same settlement as the buyer's Stop button. */
export function POST(request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  return handle(async () => {
    assertSameOrigin(request, app().env.APP_URL);
    const { id } = await params;
    if (!isUuid(id)) throw new HttpError(404, "Not found");
    const { reason } = body.parse(await readJson(request));
    const staff = await requireStaff("runs.cancel");
    const db = adminDb();
    const [run] = await db.select({ workspaceId: schema.runs.workspaceId, workflowRunId: schema.runs.workflowRunId }).from(schema.runs).where(eq(schema.runs.id, id));
    if (!run) throw new HttpError(404, "Not found");
    const ended = await endRun(db, { runId: id, workspaceId: run.workspaceId, actorUserId: actorOf(staff).userId, actorIsAdmin: true, status: "cancelled", message: `Stopped by Sieveline support: ${reason}` });
    if (!ended) throw new HttpError(409, "This list has already finished");
    if (run.workflowRunId) {
      try {
        await getWorkflowRun(run.workflowRunId).cancel({ cancelReason: "admin cancel" });
      } catch (e) {
        logger.warn("workflow cancel failed", { runId: id, err: e });
      }
    }
    return new Response(null, { status: 204 });
  });
}
