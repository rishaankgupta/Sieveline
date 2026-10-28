import { PGlite } from "@electric-sql/pglite";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { beforeAll, describe, expect, it } from "vitest";
import {
  adminDailyCredits, adminGetUser, adminListAudit, adminListRuns, adminListUsers, adminListWorkspaces, adminOverview,
  adminPutSetting, adminRecentFailures, adminAudit, adminRevokeSessions, adminSetPlatformRole, adminSetUserSuspended,
  adminSettingHistory, adminUpdateWorkspace, AdminRuleError, createRunWithReservation, createWorkspaceForUser, getActiveSetting,
  InsufficientCredits, ResearchPaused, isResearchPausedFor, isResearchPausedPlatformWide, recordUsage,
} from "../src/index.ts";
import * as s from "../src/schema.ts";

let client: PGlite;
let db: ReturnType<typeof drizzle<typeof s>>;
let ws: string;
const actor = { userId: "admin1" };

async function as<T>(role: "sieveline_app" | "sieveline_admin", fn: () => Promise<T>) {
  await client.exec(`SET ROLE ${role}`);
  try {
    return await fn();
  } finally {
    await client.exec("RESET ROLE");
  }
}

beforeAll(async () => {
  client = new PGlite();
  db = drizzle(client, { schema: s });
  await migrate(db, { migrationsFolder: new URL("../migrations", import.meta.url).pathname });
  await db.insert(s.users).values([
    { id: "admin1", name: "Admin", email: "admin@x.com", platformRole: "owner", twoFactorEnabled: true },
    { id: "u1", name: "Buyer One", email: "buyer1@x.com" },
    { id: "u2", name: "Buyer 100%", email: "b2@x.com" },
  ]);
  ws = await as("sieveline_app", () => createWorkspaceForUser(db, { userId: "u1", name: "Acme Search", monthlyCreditCap: 100 }));
  await db.insert(s.sessions).values([
    { id: "s1", token: "t1", userId: "u1", expiresAt: new Date(Date.now() + 86_400_000) },
    { id: "s2", token: "t2", userId: "u1", expiresAt: new Date(Date.now() + 86_400_000) },
  ]);
  await as("sieveline_app", async () => {
    const { runId } = await createRunWithReservation(db, { userId: "u1", workspaceId: ws }, { thesisId: null, thesis: { name: "Labs" }, settings: {}, reserveCredits: 20, dailyCeiling: 10_000 });
    await recordUsage(db, { userId: "u1", workspaceId: ws }, { runId, provider: "tavily", endpoint: "search", credits: 7, costUsd: 0, cached: false });
  });
}, 60_000);

describe("admin data access (as sieveline_admin)", () => {
  it("sees every workspace, user and run, and totals match the ledger", async () => {
    await as("sieveline_admin", async () => {
      const o = await adminOverview(db);
      expect(o).toMatchObject({ users: 3, workspaces: 1, runs_today: 1, runs_active: 1, credits_today: 7, credits_month: 7, credits_reserved: 20 });
      const days = await adminDailyCredits(db, 3);
      expect(days).toHaveLength(3);
      expect(days.at(-1)!.credits).toBe(7);
      expect((await adminListWorkspaces(db, {}))[0]).toMatchObject({ name: "Acme Search", members: 1, runs: 1 });
      expect((await adminListRuns(db, { status: "queued" }))[0]).toMatchObject({ thesisName: "Labs", workspaceName: "Acme Search" });
      expect(await adminListRuns(db, { status: "bogus" })).toHaveLength(1); // unknown filter = no filter, not an error
    });
  });

  it("searches users with LIKE wildcards treated literally", async () => {
    await as("sieveline_admin", async () => {
      expect((await adminListUsers(db, { q: "100%" })).map((u) => u.id)).toEqual(["u2"]);
      // Only "Buyer 100%" contains a literal %; unescaped it would match everyone.
      expect((await adminListUsers(db, { q: "%" })).map((u) => u.id)).toEqual(["u2"]);
      expect((await adminListUsers(db, { q: "BUYER1" })).map((u) => u.id)).toEqual(["u1"]);
    });
  });

  it("suspends (ending sessions), unsuspends and audits with before/after", async () => {
    await as("sieveline_admin", async () => {
      expect(await adminSetUserSuspended(db, actor, "u1", true, "abuse report")).toBe(true);
      const u = await adminGetUser(db, "u1");
      expect(u!.user.suspendedAt).toBeTruthy();
      expect(u!.sessions).toHaveLength(0);
      expect(u!.workspaces).toEqual([{ id: ws, name: "Acme Search", role: "owner" }]);
      await adminSetUserSuspended(db, actor, "u1", false, "resolved");
      expect((await adminGetUser(db, "u1"))!.user.suspendedAt).toBeNull();
      await expect(adminSetUserSuspended(db, actor, "admin1", true, "x")).rejects.toBeInstanceOf(AdminRuleError);
      const log = await adminListAudit(db, { action: "admin.user" });
      expect(log.map((e) => e.action)).toEqual(["admin.user.unsuspended", "admin.user.suspended"]);
      expect(log[1]).toMatchObject({ actorIsAdmin: true, actorEmail: "admin@x.com", after: { reason: "abuse report" } });
      expect(await adminRevokeSessions(db, actor, "u1", "test")).toBe(0);
    });
  });

  it("caps and pauses a workspace; the app then refuses new runs", async () => {
    await as("sieveline_admin", () => adminUpdateWorkspace(db, actor, ws, { monthlyCreditCap: 25, researchPaused: true }, "trial ended"));
    await expect(as("sieveline_app", () => createRunWithReservation(db, { userId: "u1", workspaceId: ws }, { thesisId: null, thesis: {}, settings: {}, reserveCredits: 1, dailyCeiling: 10_000 })))
      .rejects.toBeInstanceOf(ResearchPaused);
    // Running lists check this at every stage (guarded() in the research workflow).
    expect(await as("sieveline_app", () => isResearchPausedFor(db, { userId: "u1", workspaceId: ws }))).toBe(true);
    await as("sieveline_admin", () => adminUpdateWorkspace(db, actor, ws, { researchPaused: false }, "back on"));
    expect(await as("sieveline_app", () => isResearchPausedFor(db, { userId: "u1", workspaceId: ws }))).toBe(false);
    // 25 cap - 20 reserved = 5 available
    await expect(as("sieveline_app", () => createRunWithReservation(db, { userId: "u1", workspaceId: ws }, { thesisId: null, thesis: {}, settings: {}, reserveCredits: 6, dailyCeiling: 10_000 })))
      .rejects.toBeInstanceOf(InsufficientCredits);
    const [entry] = await as("sieveline_admin", () => adminListAudit(db, { action: "admin.workspace" }));
    expect(entry).toMatchObject({ workspaceId: ws, before: { researchPausedAt: expect.any(String) }, after: { researchPausedAt: null, reason: "back on" } });
  });

  it("versions settings append-only; the newest version is what the app reads; kill switch works", async () => {
    await as("sieveline_admin", async () => {
      expect(await adminPutSetting(db, actor, "research_settings", { maxCandidates: 40 }, "more")).toBe(1);
      expect(await adminPutSetting(db, actor, "research_settings", { maxCandidates: 80 }, "even more")).toBe(2);
      const hist = await adminSettingHistory(db, "research_settings");
      expect(await adminPutSetting(db, actor, "research_settings", hist[1]!.value, "rollback to v1")).toBe(3);
      expect((await adminSettingHistory(db, "research_settings")).map((h) => h.version)).toEqual([3, 2, 1]);
      await adminPutSetting(db, actor, "research_paused", true, "incident");
    });
    await as("sieveline_app", async () => {
      expect(await getActiveSetting(db, "research_settings")).toEqual({ maxCandidates: 40 });
      expect(await isResearchPausedPlatformWide(db)).toBe(true);
      expect(await isResearchPausedFor(db, { userId: "u1", workspaceId: ws })).toBe(true);
      // The app role can read settings but never write them.
      await expect(db.insert(s.settings).values({ key: "research_paused", value: false, version: 99 })).rejects.toThrow();
    });
  });

  it("guards staff roles and counts failed step-ups", async () => {
    await as("sieveline_admin", async () => {
      await expect(adminSetPlatformRole(db, actor, "admin1", "viewer")).rejects.toBeInstanceOf(AdminRuleError);
      await expect(adminSetPlatformRole(db, actor, "u2", "owner")).rejects.toBeInstanceOf(AdminRuleError);
      expect(await adminSetPlatformRole(db, actor, "u2", "support")).toBe(true);
      await adminAudit(db, actor, { action: "admin.step_up.failed", targetType: "user", targetId: "admin1" });
      await adminAudit(db, actor, { action: "admin.step_up.failed", targetType: "user", targetId: "admin1" });
      expect(await adminRecentFailures(db, "admin1", "admin.step_up.failed", 60_000)).toBe(2);
    });
    const [u2] = await db.select().from(s.users).where(eq(s.users.id, "u2"));
    expect(u2!.platformRole).toBe("support");
  });

  it("the app role cannot read other workspaces through admin helpers", async () => {
    await as("sieveline_app", async () => {
      // No tenant context: RLS hides every workspace and run from the app role.
      expect(await adminListWorkspaces(db, {})).toHaveLength(0);
      expect(await adminListRuns(db, {})).toHaveLength(0);
    });
  });
});
