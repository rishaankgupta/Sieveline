import { assertCan } from "@sieveline/core";
import { getRun, getShortlist, schema, withTenant } from "@sieveline/db";
import { eq } from "drizzle-orm";
import { handle, HttpError, isUuid } from "@/server/api";
import { app } from "@/server/context";
import { requireWorkspace } from "@/server/session";

export const dynamic = "force-dynamic";

/** Run status, step progress and (when finished) the shortlist. Polled by the run page. */
export function GET(_request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  return handle(async () => {
    const { id } = await params;
    if (!isUuid(id)) throw new HttpError(404, "Not found");
    const ws = await requireWorkspace();
    assertCan(ws.role, "run.view");
    const { db } = app();
    const run = await getRun(db, ws, id);
    if (!run) throw new HttpError(404, "Not found");
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
