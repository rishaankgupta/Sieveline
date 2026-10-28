import { and, desc, eq, gt, inArray, sql } from "drizzle-orm";
import * as s from "./schema.ts";
import { withTenant, type TenantContext } from "./tenant.ts";
import type { AnyDb } from "./workspaces.ts";

type Ctx = TenantContext & { workspaceId: string };

/** Credits for the dashboard. */
export async function getWorkspaceUsage(db: AnyDb, ctx: Ctx) {
  const [w] = await withTenant(db, ctx, (tx) =>
    tx
      .select({ cap: s.workspaces.monthlyCreditCap, used: s.workspaces.creditsUsedThisMonth, reserved: s.workspaces.creditsReserved, periodStart: s.workspaces.usagePeriodStart })
      .from(s.workspaces)
      .where(eq(s.workspaces.id, ctx.workspaceId)),
  );
  if (!w) return { cap: 0, used: 0, reserved: 0, available: 0 };
  const used = Number(w.used);
  const reserved = Number(w.reserved);
  return { cap: w.cap, used, reserved, available: Math.max(0, w.cap - used - reserved) };
}

/** Recent runs with counts, newest first. */
export async function listRuns(db: AnyDb, ctx: Ctx, limit = 20) {
  return withTenant(db, ctx, (tx) =>
    tx
      .select({
        id: s.runs.id,
        status: s.runs.status,
        name: sql<string>`${s.runs.thesisSnapshot}->>'name'`,
        createdAt: s.runs.createdAt,
        finishedAt: s.runs.finishedAt,
        creditsUsed: s.runs.creditsUsed,
        error: s.runs.error,
        companies: sql<number>`(select count(*)::int from companies c where c.run_id = ${s.runs.id})`,
        shortlisted: sql<number>`(select count(*)::int from shortlist_items i where i.run_id = ${s.runs.id})`,
      })
      .from(s.runs)
      .orderBy(desc(s.runs.createdAt))
      .limit(Math.min(Math.max(limit, 1), 100)),
  );
}

/**
 * Everything the results screens need for one run, without the stored page text (which can be
 * large and is only needed by the pipeline). Facts carry their quote and source URL.
 */
export async function getRunResults(db: AnyDb, ctx: Ctx, runId: string) {
  return withTenant(db, ctx, async (tx) => {
    const [run] = await tx.select({ id: s.runs.id, status: s.runs.status, thesis: s.runs.thesisSnapshot }).from(s.runs).where(eq(s.runs.id, runId));
    if (!run) return null;
    const companies = await tx
      .select({ id: s.companies.id, domain: s.companies.domain, name: s.companies.name, status: s.companies.status, score: s.companies.score, summary: s.companies.summary, failedRule: s.companies.failedRule, source: s.companies.source })
      .from(s.companies)
      .where(eq(s.companies.runId, runId));
    const ids = companies.map((c) => c.id);
    const facts = ids.length
      ? await tx
          .select({ id: s.facts.id, companyId: s.facts.companyId, kind: s.facts.kind, key: s.facts.key, value: s.facts.value, quote: s.facts.quote, sourceUrl: s.facts.sourceUrl, publishedAt: s.facts.publishedAt })
          .from(s.facts)
          .where(inArray(s.facts.companyId, ids))
      : [];
    const shortlist = await tx
      .select({ companyId: s.shortlistItems.companyId, position: s.shortlistItems.position, reason: s.shortlistItems.reason, pinned: s.shortlistItems.pinned, hidden: s.shortlistItems.hidden })
      .from(s.shortlistItems)
      .where(eq(s.shortlistItems.runId, runId));
    const reviews = ids.length
      ? await tx
          .select({ companyId: s.reviews.companyId, userId: s.reviews.userId, decision: s.reviews.decision, note: s.reviews.note })
          .from(s.reviews)
          .where(inArray(s.reviews.companyId, ids))
      : [];
    return { run, companies, facts, shortlist, reviews };
  });
}

export async function setShortlistFlags(db: AnyDb, ctx: Ctx, runId: string, companyId: string, flags: { pinned?: boolean; hidden?: boolean }) {
  return withTenant(db, ctx, async (tx) => {
    const existing = await tx
      .select({ position: s.shortlistItems.position })
      .from(s.shortlistItems)
      .where(and(eq(s.shortlistItems.runId, runId), eq(s.shortlistItems.companyId, companyId)));
    if (existing.length) {
      await tx
        .update(s.shortlistItems)
        .set({ ...flags, updatedAt: new Date() })
        .where(and(eq(s.shortlistItems.runId, runId), eq(s.shortlistItems.companyId, companyId)));
      return true;
    }
    // Pinning a company that wasn't shortlisted adds it at the end.
    if (!flags.pinned) return false;
    const [company] = await tx.select({ id: s.companies.id }).from(s.companies).where(and(eq(s.companies.id, companyId), eq(s.companies.runId, runId)));
    if (!company) return false;
    const [max] = await tx.select({ n: sql<number>`coalesce(max(position), 0)::int` }).from(s.shortlistItems).where(eq(s.shortlistItems.runId, runId));
    await tx.insert(s.shortlistItems).values({ workspaceId: ctx.workspaceId, runId, companyId, position: (max?.n ?? 0) + 1, reason: "Added by you", pinned: true });
    return true;
  });
}

export async function setReview(db: AnyDb, ctx: Ctx, companyId: string, input: { decision: (typeof s.reviewDecision.enumValues)[number]; note: string | null }) {
  return withTenant(db, ctx, async (tx) => {
    const [company] = await tx.select({ id: s.companies.id }).from(s.companies).where(eq(s.companies.id, companyId));
    if (!company) return false;
    await tx
      .insert(s.reviews)
      .values({ workspaceId: ctx.workspaceId, companyId, userId: ctx.userId, decision: input.decision, note: input.note })
      .onConflictDoUpdate({ target: [s.reviews.companyId, s.reviews.userId], set: { decision: input.decision, note: input.note, updatedAt: new Date() } });
    return true;
  });
}

// ------------------------------------------------------------------ chat
export async function getChat(db: AnyDb, ctx: Ctx, runId: string) {
  return withTenant(db, ctx, async (tx) => {
    const [thread] = await tx
      .select({ id: s.chatThreads.id })
      .from(s.chatThreads)
      .where(and(eq(s.chatThreads.runId, runId), eq(s.chatThreads.userId, ctx.userId)));
    if (!thread) return { threadId: null, messages: [] };
    const messages = await tx
      .select({ id: s.chatMessages.id, role: s.chatMessages.role, content: s.chatMessages.content, toolCalls: s.chatMessages.toolCalls, citationCheckPassed: s.chatMessages.citationCheckPassed, createdAt: s.chatMessages.createdAt })
      .from(s.chatMessages)
      .where(eq(s.chatMessages.threadId, thread.id))
      .orderBy(s.chatMessages.createdAt);
    return { threadId: thread.id, messages };
  });
}

export async function appendChat(
  db: AnyDb,
  ctx: Ctx,
  runId: string,
  messages: { role: "user" | "assistant"; content: string; citedFactIds?: string[]; toolCalls?: unknown; citationCheckPassed?: boolean; llmCostUsd?: number }[],
) {
  return withTenant(db, ctx, async (tx) => {
    let [thread] = await tx
      .select({ id: s.chatThreads.id })
      .from(s.chatThreads)
      .where(and(eq(s.chatThreads.runId, runId), eq(s.chatThreads.userId, ctx.userId)));
    if (!thread) [thread] = await tx.insert(s.chatThreads).values({ workspaceId: ctx.workspaceId, runId, userId: ctx.userId }).returning({ id: s.chatThreads.id });
    for (const m of messages) {
      await tx.insert(s.chatMessages).values({
        workspaceId: ctx.workspaceId, threadId: thread!.id, role: m.role, content: m.content.slice(0, 4000),
        citedFactIds: m.citedFactIds ?? [], toolCalls: m.toolCalls ?? null, citationCheckPassed: m.citationCheckPassed ?? null,
        llmCostUsd: String(m.llmCostUsd ?? 0),
      });
    }
    return thread!.id;
  });
}

/** User chat messages in the last hour, for rate limiting. */
export async function recentChatCount(db: AnyDb, ctx: Ctx): Promise<number> {
  const [r] = await withTenant(db, ctx, (tx) =>
    tx
      .select({ n: sql<number>`count(*)::int` })
      .from(s.chatMessages)
      .innerJoin(s.chatThreads, eq(s.chatThreads.id, s.chatMessages.threadId))
      .where(and(eq(s.chatThreads.userId, ctx.userId), eq(s.chatMessages.role, "user"), gt(s.chatMessages.createdAt, new Date(Date.now() - 3_600_000)))),
  );
  return r?.n ?? 0;
}
