import { allowedDeepDiveModels, assertCan, creditsToUsd, RESEARCH_CREDIT_BOUNDS } from "@sieveline/core";
import { DeepDiveConflict, latestDeepDive, recentDeepDiveCount, startDeepDiveWithReservation, updateDeepDive } from "@sieveline/db";
import { start } from "workflow/api";
import { z } from "zod";
import { assertSameOrigin, handle, HttpError, isUuid, readJson } from "@/server/api";
import { app } from "@/server/context";
import { requireWorkspace } from "@/server/session";
import { deepDiveRun } from "@/workflows/deep-dive";

export const dynamic = "force-dynamic";

const DEEP_DIVES_PER_HOUR = 5;

type Params = { params: Promise<{ id: string; companyId: string }> };

async function ids(params: Params["params"]) {
  const { id, companyId } = await params;
  if (!isUuid(id) || !isUuid(companyId)) throw new HttpError(404, "Not found");
  return { runId: id, companyId };
}

function offer(maxCredits: number) {
  return allowedDeepDiveModels(maxCredits).map((model) => {
    const b = RESEARCH_CREDIT_BOUNDS[model];
    return { model, minCredits: b.min, maxCredits: b.max, maxUsd: creditsToUsd(b.max).high };
  });
}

/** The latest deep dive for this company (or null), plus what a new one would cost. */
export function GET(_request: Request, { params }: Params): Promise<Response> {
  return handle(async () => {
    const { runId, companyId } = await ids(params);
    const ws = await requireWorkspace();
    assertCan(ws.role, "run.view");
    const { db, env } = app();
    const d = await latestDeepDive(db, ws, runId, companyId);
    return Response.json(
      {
        deepDive: d && {
          id: d.id, status: d.status, model: d.model, content: d.dossier, sources: d.sources, error: d.error,
          creditsUsed: Number(d.creditsUsed), createdAt: d.createdAt, finishedAt: d.finishedAt,
        },
        options: offer(env.DEEP_DIVE_MAX_CREDITS),
        canStart: ws.role !== "viewer",
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  });
}

const body = z.object({
  model: z.enum(["mini", "pro"]),
  /** The buyer saw and accepted the worst-case cost. */
  confirmMaxCredits: z.number().int().positive(),
});

/** Starts a deep dive after the buyer confirmed the worst-case cost. */
export function POST(request: Request, { params }: Params): Promise<Response> {
  return handle(async () => {
    const { runId, companyId } = await ids(params);
    const { db, env } = app();
    assertSameOrigin(request, env.APP_URL);
    const ws = await requireWorkspace();
    assertCan(ws.role, "deep_dive.start");
    const input = body.parse(await readJson(request));
    const choice = offer(env.DEEP_DIVE_MAX_CREDITS).find((o) => o.model === input.model);
    if (!choice) throw new HttpError(400, "That research depth isn't available");
    // The reservation must equal what the buyer agreed to; a stale page can't approve a higher cost.
    if (input.confirmMaxCredits !== choice.maxCredits) throw new HttpError(409, "The cost changed. Please review it and confirm again.");
    if ((await recentDeepDiveCount(db, ws)) >= DEEP_DIVES_PER_HOUR) throw new HttpError(429, "Too many deep dives in the last hour. Please wait a bit.");

    let deepDiveId: string;
    try {
      ({ deepDiveId } = await startDeepDiveWithReservation(db, ws, {
        runId, companyId, model: input.model, reserveCredits: choice.maxCredits, dailyCeiling: env.GLOBAL_DAILY_TAVILY_CREDIT_LIMIT,
      }));
    } catch (e) {
      if (e instanceof DeepDiveConflict) throw new HttpError(e.reason === "active" ? 409 : 404, e.reason === "active" ? e.message : "Not found");
      throw e;
    }
    const wf = await start(deepDiveRun, [{ deepDiveId, workspaceId: ws.workspaceId, userId: ws.userId }]);
    await updateDeepDive(db, ws, deepDiveId, { workflowRunId: wf.runId });
    return Response.json({ deepDiveId }, { status: 201 });
  });
}
