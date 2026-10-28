import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import * as s from "./schema";
import { withTenant } from "./tenant";

/** Any Drizzle Postgres database using this schema (Neon in production, PGlite in tests). */
export type AnyDb = PgDatabase<PgQueryResultHKT, typeof s>;

/**
 * Creates a workspace owned by the user. Runs under the new workspace's tenant context so the
 * row-level security policies (which only allow writes to the selected workspace) permit it.
 */
export async function createWorkspaceForUser(
  db: AnyDb,
  input: { userId: string; name: string; monthlyCreditCap: number },
): Promise<string> {
  const workspaceId = randomUUID();
  await withTenant(db, { userId: input.userId, workspaceId }, async (tx) => {
    await tx.insert(s.workspaces).values({
      id: workspaceId,
      name: input.name.slice(0, 80),
      monthlyCreditCap: input.monthlyCreditCap,
    });
    await tx.insert(s.memberships).values({ workspaceId, userId: input.userId, role: "owner" });
    await tx.insert(s.auditLog).values({
      workspaceId,
      actorUserId: input.userId,
      action: "workspace.created",
      targetType: "workspace",
      targetId: workspaceId,
    });
  });
  return workspaceId;
}

/** The workspaces a user belongs to, for the workspace picker. */
export async function listUserWorkspaces(db: AnyDb, userId: string) {
  return withTenant(db, { userId, workspaceId: null }, (tx) =>
    tx
      .select({ id: s.workspaces.id, name: s.workspaces.name, role: s.memberships.role, plan: s.workspaces.plan })
      .from(s.memberships)
      .innerJoin(s.workspaces, eq(s.workspaces.id, s.memberships.workspaceId))
      .where(eq(s.memberships.userId, userId)),
  );
}
