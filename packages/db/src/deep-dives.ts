import { and, desc, eq, gt, sql } from "drizzle-orm";
import { assertPlatformCanSpend, reserveWorkspaceCredits } from "./research.ts";
import * as s from "./schema.ts";
import { withTenant, type TenantContext } from "./tenant.ts";
import type { AnyDb } from "./workspaces.ts";

/**
 * Deep dives: one Tavily Research task per company, paid from the workspace's monthly credits.
 * Each holds its own worst-case reservation until it settles, exactly like a run.
 */

type Ctx = TenantContext & { workspaceId: string };

export class DeepDiveConflict extends Error {
  readonly reason: "active" | "company_not_found";
  constructor(reason: DeepDiveConflict["reason"]) {
    super(reason === "active" ? "A deep dive for this company is already running" : "Company not found");
    this.reason = reason;
    this.name = "DeepDiveConflict";
  }
}

const num = (v: string | number | null | undefined) => Number(v ?? 0);

function rowsOf<T>(result: unknown): T[] {
  if (Array.isArray(result)) return result as T[];
  return ((result as { rows?: T[] } | null)?.rows ?? []) as T[];
}

function isUniqueViolation(e: unknown): boolean {
  for (let x: unknown = e; x; x = (x as { cause?: unknown }).cause) {
    if ((x as { code?: string }).code === "23505") return true;
  }
  return false;
}

/**
 * Creates a queued deep dive and reserves `reserveCredits` in one transaction. The company must
 * belong to `runId` in this workspace (RLS hides other workspaces' rows). A unique partial index
 * guarantees at most one unfinished deep dive per company, even under concurrent requests.
 */
export async function startDeepDiveWithReservation(
  db: AnyDb,
  ctx: Ctx,
  input: { runId: string; companyId: string; model: "mini" | "pro"; reserveCredits: number; dailyCeiling: number },
): Promise<{ deepDiveId: string }> {
  await assertPlatformCanSpend(db, input.reserveCredits, input.dailyCeiling);
  try {
    return await withTenant(db, ctx, async (tx) => {
      const [company] = await tx
        .select({ id: s.companies.id })
        .from(s.companies)
        .where(and(eq(s.companies.id, input.companyId), eq(s.companies.runId, input.runId)));
      if (!company) throw new DeepDiveConflict("company_not_found");
      await reserveWorkspaceCredits(tx, ctx, input.reserveCredits);
      const [row] = await tx
        .insert(s.deepDives)
        .values({
          workspaceId: ctx.workspaceId, companyId: input.companyId, runId: input.runId, model: input.model,
          creditsReserved: String(input.reserveCredits), requestedBy: ctx.userId,
        })
        .returning({ id: s.deepDives.id });
      await tx.insert(s.auditLog).values({
        workspaceId: ctx.workspaceId, actorUserId: ctx.userId, action: "deep_dive.started", targetType: "company",
        targetId: input.companyId, after: { deepDiveId: row!.id, model: input.model, reserveCredits: input.reserveCredits },
      });
      return { deepDiveId: row!.id };
    });
  } catch (e) {
    if (isUniqueViolation(e)) throw new DeepDiveConflict("active");
    throw e;
  }
}

export async function getDeepDive(db: AnyDb, ctx: Ctx, deepDiveId: string) {
  return withTenant(db, ctx, async (tx) => {
    const [row] = await tx.select().from(s.deepDives).where(eq(s.deepDives.id, deepDiveId));
    return row ?? null;
  });
}

/** The newest deep dive for a company in a run, or null. */
export async function latestDeepDive(db: AnyDb, ctx: Ctx, runId: string, companyId: string) {
  return withTenant(db, ctx, async (tx) => {
    const [row] = await tx
      .select()
      .from(s.deepDives)
      .where(and(eq(s.deepDives.companyId, companyId), eq(s.deepDives.runId, runId)))
      .orderBy(desc(s.deepDives.createdAt))
      .limit(1);
    return row ?? null;
  });
}

/** Deep dives this user started in the last hour (rate limit). */
export async function recentDeepDiveCount(db: AnyDb, ctx: Ctx): Promise<number> {
  const [row] = await withTenant(db, ctx, (tx) =>
    tx
      .select({ n: sql<number>`count(*)::int` })
      .from(s.deepDives)
      .where(and(eq(s.deepDives.requestedBy, ctx.userId), gt(s.deepDives.createdAt, new Date(Date.now() - 3_600_000)))),
  );
  return row?.n ?? 0;
}

export async function updateDeepDive(
  db: AnyDb,
  ctx: Ctx,
  deepDiveId: string,
  patch: { status?: "running"; tavilyRequestId?: string; workflowRunId?: string },
) {
  await withTenant(db, ctx, (tx) =>
    tx
      .update(s.deepDives)
      .set({
        ...(patch.status ? { status: patch.status } : {}),
        ...(patch.tavilyRequestId ? { tavilyRequestId: patch.tavilyRequestId } : {}),
        ...(patch.workflowRunId ? { workflowRunId: patch.workflowRunId } : {}),
      })
      .where(eq(s.deepDives.id, deepDiveId)),
  );
}

/**
 * Ends a deep dive: stores the result, records the credits Tavily charged as a usage event,
 * moves them into the monthly total and releases the reservation, all in one transaction.
 * Idempotent: once settled (reservation 0) a second call changes nothing, so a retried
 * workflow step can't bill twice.
 */
export async function finishDeepDive(
  db: AnyDb,
  ctx: Ctx,
  deepDiveId: string,
  result: {
    status: "succeeded" | "failed";
    credits: number;
    dossier?: unknown;
    sources?: unknown;
    error?: string | null;
  },
): Promise<boolean> {
  return withTenant(db, ctx, async (tx) => {
    const locked = await tx.execute(
      sql`select credits_reserved, tavily_request_id, run_id from deep_dives where id = ${deepDiveId} for update`,
    );
    const row = rowsOf<{ credits_reserved: string; tavily_request_id: string | null; run_id: string | null }>(locked)[0];
    if (!row || num(row.credits_reserved) === 0) return false;
    const credits = Math.max(0, result.credits);
    if (credits > 0 || row.tavily_request_id) {
      await tx.insert(s.usageEvents).values({
        workspaceId: ctx.workspaceId, runId: row.run_id, deepDiveId, provider: "tavily", endpoint: "research",
        credits: String(credits), costUsd: "0", cached: false, requestId: row.tavily_request_id,
      });
    }
    await tx
      .update(s.workspaces)
      .set({
        creditsReserved: sql`greatest(0, ${s.workspaces.creditsReserved} - ${num(row.credits_reserved)})`,
        creditsUsedThisMonth: sql`${s.workspaces.creditsUsedThisMonth} + ${credits}`,
      })
      .where(eq(s.workspaces.id, ctx.workspaceId));
    await tx
      .update(s.deepDives)
      .set({
        status: result.status, creditsUsed: String(credits), creditsReserved: "0", finishedAt: new Date(),
        ...(result.dossier !== undefined ? { dossier: result.dossier } : {}),
        ...(result.sources !== undefined ? { sources: result.sources } : {}),
        error: result.error?.slice(0, 500) ?? null,
      })
      .where(eq(s.deepDives.id, deepDiveId));
    return true;
  });
}
