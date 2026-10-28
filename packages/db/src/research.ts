import { and, desc, eq, inArray, sql } from "drizzle-orm";
import * as s from "./schema.ts";
import { withTenant, type TenantContext } from "./tenant.ts";
import type { AnyDb } from "./workspaces.ts";

/**
 * Persistence for research runs. Every function runs under the caller's tenant context, so
 * row-level security guarantees it can only touch that workspace's rows.
 * Plain data in, plain data out: no core types, so this package stays independent.
 */

export class InsufficientCredits extends Error {
  readonly available: number;
  readonly needed: number;
  constructor(available: number, needed: number) {
    super(`Not enough credits: ${needed} needed, ${available} available this month`);
    this.available = available;
    this.needed = needed;
    this.name = "InsufficientCredits";
  }
}

export class ResearchPaused extends Error {
  constructor(reason: "platform" | "workspace" | "daily_limit") {
    super(`Research is paused (${reason})`);
    this.name = "ResearchPaused";
  }
}

const num = (v: string | number | null | undefined) => Number(v ?? 0);

/** Raw query results differ by driver (pg/neon/pglite return { rows }); normalize to rows. */
function rowsOf<T>(result: unknown): T[] {
  if (Array.isArray(result)) return result as T[];
  return ((result as { rows?: T[] } | null)?.rows ?? []) as T[];
}

/** Resets the monthly counter when a new calendar month (UTC) has started. */
function monthStart(d = new Date()): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
}

export async function platformCreditsToday(db: AnyDb): Promise<number> {
  const r = await db.execute(sql`select reporting.platform_tavily_credits_today() as n`);
  return num(rowsOf<{ n: string }>(r)[0]?.n);
}

export async function isResearchPausedPlatformWide(db: AnyDb): Promise<boolean> {
  const [row] = await db
    .select({ value: s.settings.value })
    .from(s.settings)
    .where(and(eq(s.settings.key, "research_paused"), eq(s.settings.active, true)))
    .orderBy(desc(s.settings.version))
    .limit(1);
  return row?.value === true;
}

/**
 * Creates a run and reserves its worst-case credits in one transaction. The workspace row is
 * locked (FOR UPDATE) so two runs started at once can't both pass the cap check.
 */
export async function createRunWithReservation(
  db: AnyDb,
  ctx: TenantContext & { workspaceId: string },
  input: { thesisId: string | null; thesis: unknown; settings: unknown; reserveCredits: number; dailyCeiling: number },
): Promise<{ runId: string }> {
  if (await isResearchPausedPlatformWide(db)) throw new ResearchPaused("platform");
  if ((await platformCreditsToday(db)) + input.reserveCredits > input.dailyCeiling) throw new ResearchPaused("daily_limit");

  return withTenant(db, ctx, async (tx) => {
    const locked = await tx.execute(sql`select * from workspaces where id = ${ctx.workspaceId} for update`);
    const ws = rowsOf<{ monthly_credit_cap: number; credits_used_this_month: string; credits_reserved: string; usage_period_start: string | Date; research_paused_at: unknown; suspended_at: unknown }>(locked)[0];
    if (!ws) throw new Error("workspace not found");
    if (ws.research_paused_at || ws.suspended_at) throw new ResearchPaused("workspace");

    let used = num(ws.credits_used_this_month);
    const start = monthStart();
    if (new Date(ws.usage_period_start) < start) {
      used = 0;
      await tx.update(s.workspaces).set({ creditsUsedThisMonth: "0", usagePeriodStart: start }).where(eq(s.workspaces.id, ctx.workspaceId));
    }
    const available = ws.monthly_credit_cap - used - num(ws.credits_reserved);
    if (input.reserveCredits > available) throw new InsufficientCredits(Math.max(0, available), input.reserveCredits);

    await tx
      .update(s.workspaces)
      .set({ creditsReserved: sql`${s.workspaces.creditsReserved} + ${input.reserveCredits}` })
      .where(eq(s.workspaces.id, ctx.workspaceId));
    const [run] = await tx
      .insert(s.runs)
      .values({
        workspaceId: ctx.workspaceId,
        thesisId: input.thesisId,
        thesisSnapshot: input.thesis,
        settingsSnapshot: input.settings,
        creditsReserved: String(input.reserveCredits),
        startedBy: ctx.userId,
      })
      .returning({ id: s.runs.id });
    await tx.insert(s.auditLog).values({
      workspaceId: ctx.workspaceId, actorUserId: ctx.userId, action: "run.created", targetType: "run", targetId: run!.id,
      after: { reserveCredits: input.reserveCredits },
    });
    return { runId: run!.id };
  });
}

export async function getRun(db: AnyDb, ctx: TenantContext & { workspaceId: string }, runId: string) {
  return withTenant(db, ctx, async (tx) => {
    const [run] = await tx.select().from(s.runs).where(eq(s.runs.id, runId));
    return run ?? null;
  });
}

export async function setRunStatus(
  db: AnyDb,
  ctx: TenantContext & { workspaceId: string },
  runId: string,
  patch: { status?: (typeof s.runStatus.enumValues)[number]; workflowRunId?: string; error?: string | null; started?: boolean; finished?: boolean },
) {
  await withTenant(db, ctx, (tx) =>
    tx
      .update(s.runs)
      .set({
        ...(patch.status ? { status: patch.status } : {}),
        ...(patch.workflowRunId ? { workflowRunId: patch.workflowRunId } : {}),
        ...(patch.error !== undefined ? { error: patch.error?.slice(0, 500) ?? null } : {}),
        ...(patch.started ? { startedAt: new Date() } : {}),
        ...(patch.finished ? { finishedAt: new Date() } : {}),
        lastHeartbeatAt: new Date(),
      })
      .where(eq(s.runs.id, runId)),
  );
}

export async function recordStep(
  db: AnyDb,
  ctx: TenantContext & { workspaceId: string },
  input: { runId: string; step: string; batch: number; status: (typeof s.stepStatus.enumValues)[number]; error?: string | null },
) {
  await withTenant(db, ctx, (tx) =>
    tx
      .insert(s.runSteps)
      .values({
        workspaceId: ctx.workspaceId, runId: input.runId, step: input.step, batch: input.batch, status: input.status,
        attempts: 1, startedAt: new Date(), ...(input.status === "succeeded" || input.status === "failed" ? { finishedAt: new Date() } : {}),
        error: input.error?.slice(0, 500) ?? null,
      })
      .onConflictDoUpdate({
        target: [s.runSteps.runId, s.runSteps.step, s.runSteps.batch],
        set: {
          status: input.status,
          attempts: sql`${s.runSteps.attempts} + 1`,
          error: input.error?.slice(0, 500) ?? null,
          ...(input.status === "succeeded" || input.status === "failed" ? { finishedAt: new Date() } : {}),
        },
      }),
  );
}

/** Usage event + running totals, in one transaction. */
export async function recordUsage(
  db: AnyDb,
  ctx: TenantContext & { workspaceId: string },
  input: { runId: string | null; provider: "tavily" | "llm"; endpoint: string; credits: number; costUsd: number; cached: boolean; requestId?: string },
) {
  await withTenant(db, ctx, async (tx) => {
    await tx.insert(s.usageEvents).values({
      workspaceId: ctx.workspaceId, runId: input.runId, provider: input.provider, endpoint: input.endpoint,
      credits: String(input.credits), costUsd: String(input.costUsd), cached: input.cached, requestId: input.requestId ?? null,
    });
    if (input.runId && (input.credits > 0 || input.costUsd > 0)) {
      await tx
        .update(s.runs)
        .set({
          creditsUsed: sql`${s.runs.creditsUsed} + ${input.credits}`,
          llmCostUsd: sql`${s.runs.llmCostUsd} + ${input.costUsd}`,
          lastHeartbeatAt: new Date(),
        })
        .where(eq(s.runs.id, input.runId));
    }
  });
}

/** Credits still available to this run: reservation minus what it has used. */
export async function runCreditsRemaining(db: AnyDb, ctx: TenantContext & { workspaceId: string }, runId: string): Promise<number> {
  const run = await getRun(db, ctx, runId);
  if (!run) return 0;
  return Math.max(0, num(run.creditsReserved) - num(run.creditsUsed));
}

/**
 * Ends a run's reservation: real usage moves into the monthly total and the rest is released.
 * Idempotent: a run whose reservation is already 0 changes nothing.
 */
export async function settleRun(db: AnyDb, ctx: TenantContext & { workspaceId: string }, runId: string) {
  await withTenant(db, ctx, async (tx) => {
    const locked = await tx.execute(sql`select credits_reserved, credits_used from runs where id = ${runId} for update`);
    const run = rowsOf<{ credits_reserved: string; credits_used: string }>(locked)[0];
    if (!run || num(run.credits_reserved) === 0) return;
    await tx
      .update(s.workspaces)
      .set({
        creditsReserved: sql`greatest(0, ${s.workspaces.creditsReserved} - ${num(run.credits_reserved)})`,
        creditsUsedThisMonth: sql`${s.workspaces.creditsUsedThisMonth} + ${num(run.credits_used)}`,
      })
      .where(eq(s.workspaces.id, ctx.workspaceId));
    await tx.update(s.runs).set({ creditsReserved: "0" }).where(eq(s.runs.id, runId));
  });
}

// ------------------------------------------------------------------ companies and facts
export interface CompanyInput {
  domain: string;
  name: string;
  source: "search" | "seed";
  foundBy: string;
}

export async function upsertCompanies(db: AnyDb, ctx: TenantContext & { workspaceId: string }, runId: string, companies: CompanyInput[]) {
  if (!companies.length) return;
  await withTenant(db, ctx, (tx) =>
    tx
      .insert(s.companies)
      .values(companies.map((c) => ({ workspaceId: ctx.workspaceId, runId, domain: c.domain, name: c.name, source: c.source, foundBy: c.foundBy.slice(0, 300) })))
      .onConflictDoNothing(),
  );
}

export async function listCompanies(db: AnyDb, ctx: TenantContext & { workspaceId: string }, runId: string) {
  return withTenant(db, ctx, (tx) => tx.select().from(s.companies).where(eq(s.companies.runId, runId)).orderBy(s.companies.domain));
}

export async function listFacts(db: AnyDb, ctx: TenantContext & { workspaceId: string }, companyIds: string[]) {
  if (!companyIds.length) return [];
  return withTenant(db, ctx, (tx) => tx.select().from(s.facts).where(inArray(s.facts.companyId, companyIds)));
}

export interface FactInput {
  kind: (typeof s.factKind.enumValues)[number];
  key?: string | null;
  value: string;
  quote?: string | null;
  sourceUrl?: string | null;
  publishedAt?: Date | null;
}

const MAX_PAGE_TEXT = 8_000;

/** Saves a scored company and replaces its facts (a re-score never leaves stale facts behind). */
export async function saveScoredCompany(
  db: AnyDb,
  ctx: TenantContext & { workspaceId: string },
  runId: string,
  input: {
    domain: string; name: string; score: number; status: (typeof s.fitStatus.enumValues)[number]; failedRule: string | null;
    summary: string | null; pages: { url: string; text: string }[]; facts: FactInput[];
  },
) {
  await withTenant(db, ctx, async (tx) => {
    const [company] = await tx
      .update(s.companies)
      .set({
        name: input.name.slice(0, 200), score: String(input.score), status: input.status, failedRule: input.failedRule,
        summary: input.summary?.slice(0, 400) ?? null,
        pages: input.pages.map((p) => ({ url: p.url, text: p.text.slice(0, MAX_PAGE_TEXT) })),
        updatedAt: new Date(),
      })
      .where(and(eq(s.companies.runId, runId), eq(s.companies.domain, input.domain)))
      .returning({ id: s.companies.id });
    if (!company) return;
    await tx.delete(s.facts).where(eq(s.facts.companyId, company.id));
    if (input.facts.length) {
      await tx.insert(s.facts).values(
        input.facts.map((f) => ({
          workspaceId: ctx.workspaceId, companyId: company.id, kind: f.kind, key: f.key ?? null, value: f.value.slice(0, 500),
          quote: f.quote?.slice(0, 600) ?? null, sourceUrl: f.sourceUrl?.slice(0, 2048) ?? null, publishedAt: f.publishedAt ?? null,
        })),
      );
    }
  });
}

export async function saveShortlist(
  db: AnyDb,
  ctx: TenantContext & { workspaceId: string },
  runId: string,
  items: { domain: string; position: number; reason: string }[],
) {
  await withTenant(db, ctx, async (tx) => {
    await tx.delete(s.shortlistItems).where(eq(s.shortlistItems.runId, runId));
    const rows = await tx.select({ id: s.companies.id, domain: s.companies.domain }).from(s.companies).where(eq(s.companies.runId, runId));
    const ids = new Map(rows.map((r) => [r.domain, r.id]));
    const values = items
      .filter((i) => ids.has(i.domain))
      .map((i) => ({ workspaceId: ctx.workspaceId, runId, companyId: ids.get(i.domain)!, position: i.position, reason: i.reason.slice(0, 300) }));
    if (values.length) await tx.insert(s.shortlistItems).values(values);
  });
}

export async function getShortlist(db: AnyDb, ctx: TenantContext & { workspaceId: string }, runId: string) {
  return withTenant(db, ctx, (tx) =>
    tx
      .select({ position: s.shortlistItems.position, reason: s.shortlistItems.reason, domain: s.companies.domain, name: s.companies.name, score: s.companies.score, status: s.companies.status })
      .from(s.shortlistItems)
      .innerJoin(s.companies, eq(s.companies.id, s.shortlistItems.companyId))
      .where(eq(s.shortlistItems.runId, runId))
      .orderBy(s.shortlistItems.position),
  );
}

/** Response cache shared by all workspaces (it holds public web data only, never customer input). */
export function postgresTavilyCache(db: AnyDb) {
  return {
    async get(key: string) {
      const [row] = await db.select({ response: s.apiCache.response, expiresAt: s.apiCache.expiresAt }).from(s.apiCache).where(eq(s.apiCache.key, key));
      return row && row.expiresAt > new Date() ? row.response : undefined;
    },
    async set(key: string, value: unknown, ttlSeconds: number) {
      if (ttlSeconds <= 0) return;
      const expiresAt = new Date(Date.now() + ttlSeconds * 1000);
      await db
        .insert(s.apiCache)
        .values({ key, provider: "tavily", response: value, expiresAt })
        .onConflictDoUpdate({ target: s.apiCache.key, set: { response: value, expiresAt, createdAt: new Date() } });
    },
  };
}

/** Newest active version of an admin setting (admin panel MA-T02 writes these; the app only reads). */
export async function getActiveSetting<T = unknown>(db: AnyDb, key: string): Promise<T | undefined> {
  const [row] = await db
    .select({ value: s.settings.value })
    .from(s.settings)
    .where(and(eq(s.settings.key, key), eq(s.settings.active, true)))
    .orderBy(desc(s.settings.version))
    .limit(1);
  return row?.value as T | undefined;
}
