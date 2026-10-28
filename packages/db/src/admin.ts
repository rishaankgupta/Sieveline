import { and, desc, eq, gte, ilike, inArray, lt, or, sql } from "drizzle-orm";
import * as s from "./schema.ts";
import type { AnyDb } from "./workspaces.ts";

/**
 * Admin panel data access. Must be called with the admin connection (a login role in
 * `sieveline_admin`), whose policies see every workspace. Every change writes an audit row with
 * before/after values and actor_is_admin = true, in the same transaction as the change.
 */

export interface AdminActor {
  userId: string;
  ipHash?: string | null;
}

const num = (v: string | number | null | undefined) => Number(v ?? 0);

function rowsOf<T>(result: unknown): T[] {
  if (Array.isArray(result)) return result as T[];
  return ((result as { rows?: T[] } | null)?.rows ?? []) as T[];
}

async function audit(
  tx: AnyDb,
  actor: AdminActor,
  entry: { action: string; workspaceId?: string | null; targetType: string; targetId: string; before?: unknown; after?: unknown },
) {
  await tx.insert(s.auditLog).values({
    workspaceId: entry.workspaceId ?? null, actorUserId: actor.userId, actorIsAdmin: true, action: entry.action,
    targetType: entry.targetType, targetId: entry.targetId, before: entry.before ?? null, after: entry.after ?? null,
    ipHash: actor.ipHash ?? null,
  });
}

/** Records an admin event that changes nothing (e.g. failed step-up, connection test). */
export async function adminAudit(db: AnyDb, actor: AdminActor, entry: Parameters<typeof audit>[2]) {
  await audit(db, actor, entry);
}

/** Failed step-up attempts by this admin in the window (brute-force guard). */
export async function adminRecentFailures(db: AnyDb, userId: string, action: string, sinceMs: number): Promise<number> {
  const [row] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(s.auditLog)
    .where(and(eq(s.auditLog.actorUserId, userId), eq(s.auditLog.action, action), gte(s.auditLog.createdAt, new Date(Date.now() - sinceMs))));
  return row?.n ?? 0;
}

// ---------------------------------------------------------------- overview
export async function adminOverview(db: AnyDb) {
  const r = await db.execute(sql`
    select
      (select count(*)::int from users) as users,
      (select count(*)::int from users where created_at >= now() - interval '7 days') as users_7d,
      (select count(*)::int from users where suspended_at is not null) as users_suspended,
      (select count(*)::int from workspaces) as workspaces,
      (select count(*)::int from runs where created_at >= date_trunc('day', now())) as runs_today,
      (select count(*)::int from runs where status in ('queued','running')) as runs_active,
      (select count(*)::int from runs where status = 'failed' and created_at >= now() - interval '7 days') as runs_failed_7d,
      (select count(*)::int from deep_dives where created_at >= now() - interval '30 days') as deep_dives_30d,
      (select coalesce(sum(credits),0) from usage_events where provider='tavily' and created_at >= date_trunc('day', now())) as credits_today,
      (select coalesce(sum(credits),0) from usage_events where provider='tavily' and created_at >= date_trunc('month', now())) as credits_month,
      (select coalesce(sum(cost_usd),0) from usage_events where provider='llm' and created_at >= date_trunc('month', now())) as llm_usd_month,
      (select coalesce(sum(credits_reserved),0) from workspaces) as credits_reserved,
      (select count(*)::int from runs where status = 'running' and last_heartbeat_at < now() - interval '30 minutes') as runs_stuck
  `);
  const o = rowsOf<Record<string, string | number>>(r)[0] ?? {};
  return Object.fromEntries(Object.entries(o).map(([k, v]) => [k, num(v)])) as Record<
    "users" | "users_7d" | "users_suspended" | "workspaces" | "runs_today" | "runs_active" | "runs_failed_7d" | "deep_dives_30d" |
    "credits_today" | "credits_month" | "llm_usd_month" | "credits_reserved" | "runs_stuck",
    number
  >;
}

/** Tavily credits per day for the last `days` days (UTC), oldest first. */
export async function adminDailyCredits(db: AnyDb, days = 14) {
  const r = await db.execute(sql`
    select to_char(d, 'YYYY-MM-DD') as day, coalesce(sum(u.credits), 0) as credits
    from generate_series(date_trunc('day', now()) - make_interval(days => ${Math.max(0, Math.floor(days) - 1)}::int), date_trunc('day', now()), interval '1 day') d
    left join usage_events u on u.provider = 'tavily' and u.created_at >= d and u.created_at < d + interval '1 day'
    group by d order by d`);
  return rowsOf<{ day: string; credits: string }>(r).map((x) => ({ day: x.day, credits: num(x.credits) }));
}

// ---------------------------------------------------------------- users
export async function adminListUsers(db: AnyDb, opts: { q?: string; limit?: number }) {
  const q = opts.q?.trim();
  return db
    .select({
      id: s.users.id, email: s.users.email, name: s.users.name, emailVerified: s.users.emailVerified,
      twoFactorEnabled: s.users.twoFactorEnabled, platformRole: s.users.platformRole, suspendedAt: s.users.suspendedAt,
      createdAt: s.users.createdAt,
    })
    .from(s.users)
    .where(q ? or(ilike(s.users.email, `%${q.replace(/[%_\\]/g, "\\$&")}%`), ilike(s.users.name, `%${q.replace(/[%_\\]/g, "\\$&")}%`)) : undefined)
    .orderBy(desc(s.users.createdAt))
    .limit(Math.min(opts.limit ?? 50, 200));
}

export async function adminGetUser(db: AnyDb, userId: string) {
  const [user] = await db.select().from(s.users).where(eq(s.users.id, userId));
  if (!user) return null;
  const workspaces = await db
    .select({ id: s.workspaces.id, name: s.workspaces.name, role: s.memberships.role })
    .from(s.memberships)
    .innerJoin(s.workspaces, eq(s.workspaces.id, s.memberships.workspaceId))
    .where(eq(s.memberships.userId, userId));
  const sessions = await db
    .select({ id: s.sessions.id, createdAt: s.sessions.createdAt, updatedAt: s.sessions.updatedAt, expiresAt: s.sessions.expiresAt, userAgent: s.sessions.userAgent })
    .from(s.sessions)
    .where(and(eq(s.sessions.userId, userId), gte(s.sessions.expiresAt, new Date())))
    .orderBy(desc(s.sessions.updatedAt));
  return { user, workspaces, sessions };
}

/** Suspending also signs the user out everywhere (sessions deleted). */
export async function adminSetUserSuspended(db: AnyDb, actor: AdminActor, userId: string, suspended: boolean, reason: string) {
  return db.transaction(async (tx) => {
    const [before] = await tx.select({ suspendedAt: s.users.suspendedAt, platformRole: s.users.platformRole }).from(s.users).where(eq(s.users.id, userId)).for("update");
    if (!before) return false;
    if (suspended && before.platformRole === "owner") throw new AdminRuleError("Platform owners can't be suspended from the panel");
    const suspendedAt = suspended ? new Date() : null;
    await tx.update(s.users).set({ suspendedAt }).where(eq(s.users.id, userId));
    if (suspended) await tx.delete(s.sessions).where(eq(s.sessions.userId, userId));
    await audit(tx as unknown as AnyDb, actor, {
      action: suspended ? "admin.user.suspended" : "admin.user.unsuspended", targetType: "user", targetId: userId,
      before: { suspendedAt: before.suspendedAt }, after: { suspendedAt, reason },
    });
    return true;
  });
}

export async function adminRevokeSessions(db: AnyDb, actor: AdminActor, userId: string, reason: string) {
  return db.transaction(async (tx) => {
    const deleted = await tx.delete(s.sessions).where(eq(s.sessions.userId, userId)).returning({ id: s.sessions.id });
    await audit(tx as unknown as AnyDb, actor, { action: "admin.user.sessions_revoked", targetType: "user", targetId: userId, after: { count: deleted.length, reason } });
    return deleted.length;
  });
}

export class AdminRuleError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AdminRuleError";
  }
}

// ---------------------------------------------------------------- workspaces
export async function adminListWorkspaces(db: AnyDb, opts: { q?: string; limit?: number }) {
  const q = opts.q?.trim();
  return db
    .select({
      id: s.workspaces.id, name: s.workspaces.name, plan: s.workspaces.plan, monthlyCreditCap: s.workspaces.monthlyCreditCap,
      creditsUsedThisMonth: s.workspaces.creditsUsedThisMonth, creditsReserved: s.workspaces.creditsReserved,
      researchPausedAt: s.workspaces.researchPausedAt, suspendedAt: s.workspaces.suspendedAt, createdAt: s.workspaces.createdAt,
      members: sql<number>`(select count(*)::int from memberships m where m.workspace_id = "workspaces"."id")`,
      runs: sql<number>`(select count(*)::int from runs r where r.workspace_id = "workspaces"."id")`,
    })
    .from(s.workspaces)
    .where(q ? ilike(s.workspaces.name, `%${q.replace(/[%_\\]/g, "\\$&")}%`) : undefined)
    .orderBy(desc(s.workspaces.createdAt))
    .limit(Math.min(opts.limit ?? 50, 200));
}

export async function adminUpdateWorkspace(
  db: AnyDb,
  actor: AdminActor,
  workspaceId: string,
  patch: { monthlyCreditCap?: number; researchPaused?: boolean },
  reason: string,
) {
  return db.transaction(async (tx) => {
    const [before] = await tx
      .select({ monthlyCreditCap: s.workspaces.monthlyCreditCap, researchPausedAt: s.workspaces.researchPausedAt })
      .from(s.workspaces).where(eq(s.workspaces.id, workspaceId)).for("update");
    if (!before) return false;
    const set: Partial<typeof s.workspaces.$inferInsert> = {};
    if (patch.monthlyCreditCap !== undefined) set.monthlyCreditCap = patch.monthlyCreditCap;
    if (patch.researchPaused !== undefined) set.researchPausedAt = patch.researchPaused ? (before.researchPausedAt ?? new Date()) : null;
    await tx.update(s.workspaces).set({ ...set, updatedAt: new Date() }).where(eq(s.workspaces.id, workspaceId));
    await audit(tx as unknown as AnyDb, actor, {
      action: "admin.workspace.updated", workspaceId, targetType: "workspace", targetId: workspaceId,
      before, after: { ...set, reason },
    });
    return true;
  });
}

// ---------------------------------------------------------------- runs
export async function adminListRuns(db: AnyDb, opts: { status?: string; limit?: number }) {
  const statuses = s.runStatus.enumValues as readonly string[];
  const status = opts.status && statuses.includes(opts.status) ? (opts.status as (typeof s.runStatus.enumValues)[number]) : undefined;
  return db
    .select({
      id: s.runs.id, workspaceId: s.runs.workspaceId, workspaceName: s.workspaces.name, status: s.runs.status,
      creditsReserved: s.runs.creditsReserved, creditsUsed: s.runs.creditsUsed, llmCostUsd: s.runs.llmCostUsd, error: s.runs.error,
      createdAt: s.runs.createdAt, finishedAt: s.runs.finishedAt, lastHeartbeatAt: s.runs.lastHeartbeatAt,
      thesisName: sql<string>`${s.runs.thesisSnapshot}->>'name'`,
    })
    .from(s.runs)
    .innerJoin(s.workspaces, eq(s.workspaces.id, s.runs.workspaceId))
    .where(status ? eq(s.runs.status, status) : undefined)
    .orderBy(desc(s.runs.createdAt))
    .limit(Math.min(opts.limit ?? 50, 200));
}

export async function adminListDeepDives(db: AnyDb, limit = 50) {
  return db
    .select({
      id: s.deepDives.id, workspaceName: s.workspaces.name, domain: s.companies.domain, status: s.deepDives.status,
      model: s.deepDives.model, creditsUsed: s.deepDives.creditsUsed, creditsReserved: s.deepDives.creditsReserved,
      error: s.deepDives.error, createdAt: s.deepDives.createdAt, finishedAt: s.deepDives.finishedAt,
    })
    .from(s.deepDives)
    .innerJoin(s.workspaces, eq(s.workspaces.id, s.deepDives.workspaceId))
    .innerJoin(s.companies, eq(s.companies.id, s.deepDives.companyId))
    .orderBy(desc(s.deepDives.createdAt))
    .limit(Math.min(limit, 200));
}

// ---------------------------------------------------------------- settings (versioned)
export async function adminSettingHistory(db: AnyDb, key: string, limit = 20) {
  return db.select().from(s.settings).where(eq(s.settings.key, key)).orderBy(desc(s.settings.version)).limit(limit);
}

/**
 * Saves a new version of a setting. History is append-only: rolling back saves the old value as
 * a new version, so the record of who changed what is never rewritten.
 */
export async function adminPutSetting(db: AnyDb, actor: AdminActor, key: string, value: unknown, note: string) {
  return db.transaction(async (tx) => {
    // Serialize writers of the same key so two admins can't create the same version number.
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`settings:${key}`}))`);
    const [prev] = await tx.select().from(s.settings).where(and(eq(s.settings.key, key), eq(s.settings.active, true))).orderBy(desc(s.settings.version)).limit(1);
    const [last] = await tx.select({ v: s.settings.version }).from(s.settings).where(eq(s.settings.key, key)).orderBy(desc(s.settings.version)).limit(1);
    const version = (last?.v ?? 0) + 1;
    await tx.insert(s.settings).values({ key, value: value as object, version, active: true, changedBy: actor.userId, note: note.slice(0, 500) });
    await audit(tx as unknown as AnyDb, actor, {
      action: "admin.setting.changed", targetType: "setting", targetId: key,
      before: prev ? { version: prev.version, value: prev.value } : null, after: { version, value, note },
    });
    return version;
  });
}

// ---------------------------------------------------------------- audit
export async function adminListAudit(db: AnyDb, opts: { action?: string; actor?: string; beforeId?: number; limit?: number }) {
  const conds = [
    opts.action ? ilike(s.auditLog.action, `${opts.action.replace(/[%_\\]/g, "\\$&")}%`) : undefined,
    opts.actor ? eq(s.auditLog.actorUserId, opts.actor) : undefined,
    opts.beforeId ? lt(s.auditLog.id, opts.beforeId) : undefined,
  ].filter(Boolean);
  return db
    .select({
      id: s.auditLog.id, createdAt: s.auditLog.createdAt, action: s.auditLog.action, actorUserId: s.auditLog.actorUserId,
      actorEmail: s.users.email, actorIsAdmin: s.auditLog.actorIsAdmin, workspaceId: s.auditLog.workspaceId,
      targetType: s.auditLog.targetType, targetId: s.auditLog.targetId, before: s.auditLog.before, after: s.auditLog.after,
    })
    .from(s.auditLog)
    .leftJoin(s.users, eq(s.users.id, s.auditLog.actorUserId))
    .where(conds.length ? and(...conds) : undefined)
    .orderBy(desc(s.auditLog.id))
    .limit(Math.min(opts.limit ?? 50, 200));
}

/** Staff list for the owner. */
export async function adminListStaff(db: AnyDb) {
  return db
    .select({ id: s.users.id, email: s.users.email, platformRole: s.users.platformRole, twoFactorEnabled: s.users.twoFactorEnabled })
    .from(s.users)
    .where(inArray(s.users.platformRole, ["viewer", "finance", "support", "admin", "owner"]));
}

export async function adminSetPlatformRole(db: AnyDb, actor: AdminActor, userId: string, role: (typeof s.platformRole.enumValues)[number]) {
  return db.transaction(async (tx) => {
    const [before] = await tx.select({ platformRole: s.users.platformRole }).from(s.users).where(eq(s.users.id, userId)).for("update");
    if (!before) return false;
    if (userId === actor.userId) throw new AdminRuleError("You can't change your own platform role");
    if (before.platformRole === "owner" || role === "owner") throw new AdminRuleError("Owners are set only through PLATFORM_OWNER_EMAILS");
    await tx.update(s.users).set({ platformRole: role }).where(eq(s.users.id, userId));
    // A role change ends the user's sessions, so new limits apply immediately.
    await tx.delete(s.sessions).where(eq(s.sessions.userId, userId));
    await audit(tx as unknown as AnyDb, actor, { action: "admin.staff.role_changed", targetType: "user", targetId: userId, before, after: { platformRole: role } });
    return true;
  });
}
