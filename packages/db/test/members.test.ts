import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { beforeAll, describe, expect, it } from "vitest";
import {
  acceptInvitation, changeMemberRole, createInvitation, createWorkspaceForUser, listAuditLog, listInvitations, listMembers,
  listUserWorkspaces, MembershipRuleError, removeMember, revokeInvitation,
} from "../src/index.ts";
import * as s from "../src/schema.ts";

let client: PGlite;
let db: ReturnType<typeof drizzle<typeof s>>;
let ws: string;
let wsOther: string;
const owner = () => ({ userId: "owner", workspaceId: ws });

beforeAll(async () => {
  client = new PGlite();
  db = drizzle(client, { schema: s });
  await migrate(db, { migrationsFolder: new URL("../migrations", import.meta.url).pathname });
  await db.insert(s.users).values([
    { id: "owner", name: "Olivia Owner", email: "olivia@x.com", emailVerified: true },
    { id: "bob", name: "Bob", email: "bob@x.com", emailVerified: true },
    { id: "eve", name: "Eve", email: "eve@x.com", emailVerified: true },
  ]);
  await client.exec("SET ROLE sieveline_app");
  ws = await createWorkspaceForUser(db, { userId: "owner", name: "Acme Search", monthlyCreditCap: 100 });
  wsOther = await createWorkspaceForUser(db, { userId: "eve", name: "Eve's", monthlyCreditCap: 100 });
}, 60_000);

describe("invitations", () => {
  it("stores only a hash and lets the right person join with the right role", async () => {
    const inv = await createInvitation(db, owner(), { email: "BOB@x.com", role: "member" });
    expect(inv.token.length).toBeGreaterThan(30);
    await client.exec("RESET ROLE");
    const raw = await client.query<{ token_hash: string; email: string }>("select token_hash, email from invitations");
    await client.exec("SET ROLE sieveline_app");
    expect(raw.rows[0]!.token_hash).not.toContain(inv.token);
    expect(raw.rows[0]!.email).toBe("bob@x.com");

    expect(await acceptInvitation(db, { token: inv.token, userId: "eve", verifiedEmail: "eve@x.com" })).toBeNull(); // wrong person
    expect(await acceptInvitation(db, { token: "x".repeat(43), userId: "bob", verifiedEmail: "bob@x.com" })).toBeNull(); // wrong token
    expect(await acceptInvitation(db, { token: inv.token, userId: "bob", verifiedEmail: "bob@x.com" })).toBe(ws);
    expect(await acceptInvitation(db, { token: inv.token, userId: "bob", verifiedEmail: "bob@x.com" })).toBeNull(); // single use
    expect((await listUserWorkspaces(db, "bob")).map((w) => [w.name, w.role])).toEqual([["Acme Search", "member"]]);
  });

  it("rejects revoked and expired invitations and keeps one live link per email", async () => {
    const a = await createInvitation(db, owner(), { email: "new@x.com", role: "viewer" });
    const b = await createInvitation(db, owner(), { email: "new@x.com", role: "member" });
    expect((await listInvitations(db, owner())).filter((i) => i.email === "new@x.com")).toHaveLength(1);
    await db.insert(s.users).values({ id: "newbie", name: "New", email: "new@x.com", emailVerified: true }).catch(async () => undefined);
    expect(await acceptInvitation(db, { token: a.token, userId: "newbie", verifiedEmail: "new@x.com" })).toBeNull(); // replaced
    expect(await revokeInvitation(db, owner(), b.id)).toBe(true);
    expect(await acceptInvitation(db, { token: b.token, userId: "newbie", verifiedEmail: "new@x.com" })).toBeNull(); // revoked

    const c = await createInvitation(db, owner(), { email: "late@x.com", role: "member" });
    await client.exec("RESET ROLE");
    await client.query("update invitations set expires_at = now() - interval '1 minute' where id = $1", [c.id]);
    await client.exec("SET ROLE sieveline_app");
    expect(await acceptInvitation(db, { token: c.token, userId: "eve", verifiedEmail: "late@x.com" })).toBeNull();
  });

  it("refuses to invite existing members", async () => {
    await expect(createInvitation(db, owner(), { email: "bob@x.com", role: "member" })).rejects.toBeInstanceOf(MembershipRuleError);
  });

  it("hides invitations from other workspaces", async () => {
    expect(await listInvitations(db, { userId: "eve", workspaceId: wsOther })).toEqual([]);
    expect(await revokeInvitation(db, { userId: "eve", workspaceId: wsOther }, (await listInvitations(db, owner()))[0]?.id ?? "00000000-0000-4000-8000-000000000000")).toBe(false);
  });
});

describe("members", () => {
  it("never leaves a workspace without an owner", async () => {
    await expect(changeMemberRole(db, owner(), "owner", "member")).rejects.toMatchObject({ reason: "last_owner" });
    await expect(removeMember(db, owner(), "owner")).rejects.toMatchObject({ reason: "last_owner" });
    await changeMemberRole(db, owner(), "bob", "owner");
    await changeMemberRole(db, owner(), "owner", "member"); // allowed now: bob is an owner
    await changeMemberRole(db, { userId: "bob", workspaceId: ws }, "owner", "owner");
  });

  it("removes members and records everything in the audit log", async () => {
    await removeMember(db, owner(), "bob");
    expect((await listMembers(db, owner())).map((m) => m.userId)).toEqual(["owner"]);
    await expect(removeMember(db, owner(), "bob")).rejects.toMatchObject({ reason: "not_member" });
    const actions = (await listAuditLog(db, owner())).map((a) => a.action);
    for (const a of ["workspace.created", "invitation.created", "invitation.accepted", "invitation.revoked", "member.role_changed", "member.removed"]) {
      expect(actions).toContain(a);
    }
    expect(await listAuditLog(db, { userId: "eve", workspaceId: wsOther })).toSatisfy((rows: { action: string }[]) => rows.every((r) => r.action === "workspace.created"));
  });
});
