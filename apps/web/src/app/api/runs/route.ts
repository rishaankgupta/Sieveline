import {
  assertCan, DEFAULT_RESEARCH_SETTINGS, estimateRunCredits, researchSettingsSchema, thesisSchema, toDomain,
} from "@sieveline/core";
import { createRunWithReservation, schema, setRunStatus, withTenant } from "@sieveline/db";
import { and, eq, gt, sql } from "drizzle-orm";
import { start } from "workflow/api";
import { z } from "zod";
import { assertSameOrigin, handle, HttpError, readJson } from "@/server/api";
import { app } from "@/server/context";
import { requireWorkspace } from "@/server/session";
import { researchRun } from "@/workflows/research";

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  thesis: thesisSchema,
  seeds: z.array(z.string().max(2048)).max(500).default([]),
  /** Preview only: return the cost estimate without starting. */
  estimateOnly: z.boolean().default(false),
});

const RUNS_PER_HOUR = 10;

export function POST(request: Request): Promise<Response> {
  return handle(async () => {
    const { env, db } = app();
    assertSameOrigin(request, env.APP_URL);
    const ws = await requireWorkspace();
    assertCan(ws.role, "run.start");

    const body = bodySchema.parse(await readJson(request));
    const seeds = [...new Set(body.seeds.map(toDomain).filter((d): d is string => d !== null))];
    // Admin-tuned defaults (MA-T02) will be read here; for now the documented defaults.
    const settings = researchSettingsSchema.parse({ ...DEFAULT_RESEARCH_SETTINGS, shortlistSize: body.thesis.shortlistSize });
    const estimate = estimateRunCredits(body.thesis, settings, seeds.length);
    if (body.estimateOnly) return Response.json({ estimate });

    const recent = await withTenant(db, ws, (tx) =>
      tx.select({ n: sql<number>`count(*)::int` }).from(schema.runs)
        .where(and(eq(schema.runs.startedBy, ws.userId), gt(schema.runs.createdAt, new Date(Date.now() - 3_600_000)))),
    );
    if ((recent[0]?.n ?? 0) >= RUNS_PER_HOUR) throw new HttpError(429, "Too many lists started in the last hour. Please wait a bit.");

    const { runId } = await createRunWithReservation(db, ws, {
      thesisId: null,
      thesis: body.thesis,
      settings: { ...settings, seeds },
      reserveCredits: estimate.maxCredits,
      dailyCeiling: env.GLOBAL_DAILY_TAVILY_CREDIT_LIMIT,
    });
    const run = await start(researchRun, [{ runId, workspaceId: ws.workspaceId, userId: ws.userId }]);
    await setRunStatus(db, ws, runId, { workflowRunId: run.runId });
    return Response.json({ runId, estimate }, { status: 201 });
  });
}
