import { createHash, randomBytes } from "node:crypto";
import { and, eq, isNull, sql } from "drizzle-orm";
import * as s from "./schema.ts";
import { withTenant, type TenantContext } from "./tenant.ts";
import type { AnyDb } from "./workspaces.ts";

type Ctx = TenantContext & { workspaceId: string };
type Role = (typeof s.memberRole.enumValues)[number];

export const INVITE_TTL_DAYS = 7;
export const MAX_PENDING_INVITES = 50;

export class MembershipRuleError extends Error {
  readonly reason: "last_owner" | "not_member" | "too_many_invites" | "already_member";
  constructor(reason: MembershipRuleError["reason"]) {
    super(
      {
        last_owner: "A workspace must keep at least one owner.",
        not_member: "That person is not a member of this workspace.",
        too_many_invites: `This workspace has too many pending invitations (max ${MAX_PENDING_INVITES}).`,
        already_member: "That person is already a member.",
      }[reason],
    );
    this.name = "MembershipRuleError";
    this.reason = reason;
  }
}

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

const rowsOf = <T>(r: unknown): T[] => (Array.isArray(r) ? (r as T[]) : (((r as { rows?: T[] })?.rows ?? []) as T[]));

/**
 * Creates (or replaces) an invitation and returns the one-time token for the email link.
 * Only the hash is stored, so a database leak can't be used to join workspaces.
 */
export async function createInvitation(db: AnyDb, ctx: Ctx, input: { email: string; role: Role }): Promise<{ id: string; token: string; expiresAt: Date }> {
  const email = input.email.trim().toLowerCase();
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + INVITE_TTL_DAYS * 86_400_000);
  return withTenant(db, ctx, async (tx) => {
    const members = await tx
      .select({ email: s.users.email })
      .from(s.memberships)
      .innerJoin(s.users, eq(s.users.id, s.memberships.userId))
      .where(eq(s.memberships.workspaceId, ctx.workspaceId));
    if (members.some((m) => m.email.toLowerCase() === email)) throw new MembershipRuleError("already_member");
    const pending = await tx
      .select({ n: sql<number>`count(*)::int` })
      .from(s.invitations)
      .where(and(eq(s.invitations.workspaceId, ctx.workspaceId), isNull(s.invitations.acceptedAt), isNull(s.invitations.revokedAt)));
    if ((pending[0]?.n ?? 0) >= MAX_PENDING_INVITES) throw new MembershipRuleError("too_many_invites");
    // One live invitation per email: revoke older ones so only the newest link works.
    await tx
      .update(s.invitations)
      .set({ revokedAt: new Date() })
      .where(and(eq(s.invitations.workspaceId, ctx.workspaceId), sql`lower(${s.invitations.email}) = ${email}`, isNull(s.invitations.acceptedAt), isNull(s.invitations.revokedAt)));
    const [row] = await tx
      .insert(s.invitations)
      .values({ workspaceId: ctx.workspaceId, email, role: input.role, tokenHash: hashToken(token), invitedBy: ctx.userId, expiresAt })
      .returning({ id: s.invitations.id });
    await tx.insert(s.auditLog).values({
      workspaceId: ctx.workspaceId, actorUserId: ctx.userId, action: "invitation.created", targetType: "invitation", targetId: row!.id,
      after: { email, role: input.role },
    });
    return { id: row!.id, token, expiresAt };
  });
}

export async function listInvitations(db: AnyDb, ctx: Ctx) {
  return withTenant(db, ctx, (tx) =>
    tx
      .select({ id: s.invitations.id, email: s.invitations.email, role: s.invitations.role, expiresAt: s.invitations.expiresAt, createdAt: s.invitations.createdAt })
      .from(s.invitations)
      .where(and(eq(s.invitations.workspaceId, ctx.workspaceId), isNull(s.invitations.acceptedAt), isNull(s.invitations.revokedAt), sql`${s.invitations.expiresAt} > now()`))
      .orderBy(s.invitations.createdAt),
  );
}

export async function revokeInvitation(db: AnyDb, ctx: Ctx, invitationId: string): Promise<boolean> {
  return withTenant(db, ctx, async (tx) => {
    const r = await tx
      .update(s.invitations)
      .set({ revokedAt: new Date() })
      .where(and(eq(s.invitations.id, invitationId), isNull(s.invitations.acceptedAt), isNull(s.invitations.revokedAt)))
      .returning({ id: s.invitations.id });
    if (r.length) {
      await tx.insert(s.auditLog).values({ workspaceId: ctx.workspaceId, actorUserId: ctx.userId, action: "invitation.revoked", targetType: "invitation", targetId: invitationId });
    }
    return r.length > 0;
  });
}

/** Joins the workspace if the token is valid, unexpired, unused and addressed to this verified email. */
export async function acceptInvitation(db: AnyDb, input: { token: string; userId: string; verifiedEmail: string }): Promise<string | null> {
  if (!/^[A-Za-z0-9_-]{20,100}$/.test(input.token)) return null;
  const r = await db.execute(sql`select invites.accept_invitation(${hashToken(input.token)}, ${input.userId}, ${input.verifiedEmail}) as ws`);
  return rowsOf<{ ws: string | null }>(r)[0]?.ws ?? null;
}

export async function listMembers(db: AnyDb, ctx: Ctx) {
  return withTenant(db, ctx, (tx) =>
    tx
      .select({ userId: s.users.id, name: s.users.name, email: s.users.email, role: s.memberships.role, joinedAt: s.memberships.createdAt })
      .from(s.memberships)
      .innerJoin(s.users, eq(s.users.id, s.memberships.userId))
      .where(eq(s.memberships.workspaceId, ctx.workspaceId))
      .orderBy(s.memberships.createdAt),
  );
}

/** Changes a member's role. The workspace row is locked so two owners can't demote each other at once. */
export async function changeMemberRole(db: AnyDb, ctx: Ctx, targetUserId: string, role: Role) {
  await withTenant(db, ctx, async (tx) => {
    await tx.execute(sql`select 1 from workspaces where id = ${ctx.workspaceId} for update`);
    const all = await tx.select().from(s.memberships).where(eq(s.memberships.workspaceId, ctx.workspaceId));
    const target = all.find((m) => m.userId === targetUserId);
    if (!target) throw new MembershipRuleError("not_member");
    if (target.role === "owner" && role !== "owner" && all.filter((m) => m.role === "owner").length === 1) {
      throw new MembershipRuleError("last_owner");
    }
    await tx.update(s.memberships).set({ role }).where(and(eq(s.memberships.workspaceId, ctx.workspaceId), eq(s.memberships.userId, targetUserId)));
    await tx.insert(s.auditLog).values({
      workspaceId: ctx.workspaceId, actorUserId: ctx.userId, action: "member.role_changed", targetType: "user", targetId: targetUserId,
      before: { role: target.role }, after: { role },
    });
  });
}

export async function removeMember(db: AnyDb, ctx: Ctx, targetUserId: string) {
  await withTenant(db, ctx, async (tx) => {
    await tx.execute(sql`select 1 from workspaces where id = ${ctx.workspaceId} for update`);
    const all = await tx.select().from(s.memberships).where(eq(s.memberships.workspaceId, ctx.workspaceId));
    const target = all.find((m) => m.userId === targetUserId);
    if (!target) throw new MembershipRuleError("not_member");
    if (target.role === "owner" && all.filter((m) => m.role === "owner").length === 1) throw new MembershipRuleError("last_owner");
    await tx.delete(s.memberships).where(and(eq(s.memberships.workspaceId, ctx.workspaceId), eq(s.memberships.userId, targetUserId)));
    await tx.insert(s.auditLog).values({
      workspaceId: ctx.workspaceId, actorUserId: ctx.userId, action: "member.removed", targetType: "user", targetId: targetUserId, before: { role: target.role },
    });
  });
}

export async function listAuditLog(db: AnyDb, ctx: Ctx, opts: { limit?: number; before?: number } = {}) {
  const limit = Math.min(Math.max(opts.limit ?? 50, 1), 200);
  return withTenant(db, ctx, (tx) =>
    tx
      .select({ id: s.auditLog.id, action: s.auditLog.action, actorUserId: s.auditLog.actorUserId, actorName: s.users.name, targetType: s.auditLog.targetType, targetId: s.auditLog.targetId, before: s.auditLog.before, after: s.auditLog.after, createdAt: s.auditLog.createdAt })
      .from(s.auditLog)
      .leftJoin(s.users, eq(s.users.id, s.auditLog.actorUserId))
      .where(opts.before ? and(eq(s.auditLog.workspaceId, ctx.workspaceId), sql`${s.auditLog.id} < ${opts.before}`) : eq(s.auditLog.workspaceId, ctx.workspaceId))
      .orderBy(sql`${s.auditLog.id} desc`)
      .limit(limit),
  );
}
