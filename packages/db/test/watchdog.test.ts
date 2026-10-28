import { PGlite } from "@electric-sql/pglite";
import { eq, inArray } from "drizzle-orm";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { beforeAll, describe, expect, it } from "vitest";
import {
  createRunWithReservation, createWorkspaceForUser, endRun, findStaleWork, finishDeepDive, recordStep, recordUsage,
  startDeepDiveWithReservation, SYSTEM_ACTOR, upsertCompanies, listCompanies, withTenant,
} from "../src/index.ts";
import * as s from "../src/schema.ts";

let client: PGlite;
let db: ReturnType<typeof drizzle<typeof s>>;
let ws: string;
const ctx = () => ({ userId: "u1", workspaceId: ws });

async function as<T>(role: string, fn: () => Promise<T>) {
  await client.exec(`SET ROLE ${role}`);
  try {
    return await fn();
  } finally {
    await client.exec("RESET ROLE");
  }
}
const credits = async () => {
  const [w] = await db.select().from(s.workspaces).where(eq(s.workspaces.id, ws));
  return { reserved: Number(w!.creditsReserved), used: Number(w!.creditsUsedThisMonth) };
};

beforeAll(async () => {
  client = new PGlite();
  db = drizzle(client, { schema: s });
  await migrate(db, { migrationsFolder: new URL("../migrations", import.meta.url).pathname });
  await db.insert(s.users).values({ id: "u1", name: "U1", email: "u1@x.com" });
  ws = await as("sieveline_app", () => createWorkspaceForUser(db, { userId: "u1", name: "W", monthlyCreditCap: 500 }));
}, 60_000);

describe("stuck work and cancel", () => {
  it("a buyer cancels their own run: used credits charged, the rest released, audited", async () => {
    const { runId } = await as("sieveline_app", () => createRunWithReservation(db, ctx(), { thesisId: null, thesis: {}, settings: {}, reserveCredits: 50, dailyCeiling: 10_000 }));
    await as("sieveline_app", () => recordUsage(db, ctx(), { runId, provider: "tavily", endpoint: "search", credits: 4, costUsd: 0, cached: false }));
    expect(await as("sieveline_app", () => endRun(db, { runId, workspaceId: ws, actorUserId: "u1", actorIsAdmin: false, status: "cancelled", message: "Cancelled" }))).toBe(true);
    expect(await as("sieveline_app", () => endRun(db, { runId, workspaceId: ws, actorUserId: "u1", actorIsAdmin: false, status: "cancelled", message: "again" }))).toBe(false);
    expect(await credits()).toEqual({ reserved: 0, used: 4 });
    const [run] = await db.select().from(s.runs).where(eq(s.runs.id, runId));
    expect(run).toMatchObject({ status: "cancelled", error: "Cancelled", creditsReserved: "0.00" });
    const audit = await db.select().from(s.auditLog).where(eq(s.auditLog.targetId, runId));
    expect(audit.map((a) => a.action)).toContain("run.cancelled");
  });

  it("progress of any kind moves the heartbeat; only idle runs and overdue deep dives are found", async () => {
    const { runId: idle } = await as("sieveline_app", () => createRunWithReservation(db, ctx(), { thesisId: null, thesis: {}, settings: {}, reserveCredits: 30, dailyCeiling: 10_000 }));
    const { runId: busy } = await as("sieveline_app", () => createRunWithReservation(db, ctx(), { thesisId: null, thesis: {}, settings: {}, reserveCredits: 20, dailyCeiling: 10_000 }));
    await db.update(s.runs).set({ status: "running", lastHeartbeatAt: new Date(Date.now() - 3_600_000) }).where(inArray(s.runs.id, [idle, busy]));
    // A step start and a free LLM call both count as progress.
    await as("sieveline_app", () => recordStep(db, ctx(), { runId: busy, step: "read_score", batch: 0, status: "running" }));
    await as("sieveline_app", () => recordUsage(db, ctx(), { runId: busy, provider: "llm", endpoint: "scoring", credits: 0, costUsd: 0, cached: false }));

    await as("sieveline_app", () => upsertCompanies(db, ctx(), busy, [{ domain: "a.com", name: "A", source: "search", foundBy: "q" }]));
    const [co] = await as("sieveline_app", () => listCompanies(db, ctx(), busy));
    const { deepDiveId } = await as("sieveline_app", () => startDeepDiveWithReservation(db, ctx(), { runId: busy, companyId: co!.id, model: "mini", reserveCredits: 110, dailyCeiling: 10_000 }));
    await db.update(s.deepDives).set({ status: "running", tavilyRequestId: "req-abcdefgh", createdAt: new Date(Date.now() - 3_600_000) }).where(eq(s.deepDives.id, deepDiveId));

    const found = await as("sieveline_admin", () => findStaleWork(db, { runIdleMs: 45 * 60_000, deepDiveMaxMs: 45 * 60_000 }));
    expect(found.runs.map((r) => r.id)).toEqual([idle]);
    expect(found.dives.map((d) => d.id)).toEqual([deepDiveId]);

    // The watchdog (admin role) ends them and releases holds; an overdue accepted dive is charged in full.
    await as("sieveline_admin", async () => {
      expect(await endRun(db, { runId: idle, workspaceId: ws, actorUserId: SYSTEM_ACTOR, actorIsAdmin: true, status: "failed", message: "stuck" })).toBe(true);
      expect(await finishDeepDive(db, { userId: SYSTEM_ACTOR, workspaceId: ws }, deepDiveId, { status: "failed", credits: 110, error: "overdue" })).toBe(true);
    });
    // Remaining hold = the busy run's 20 only.
    expect(await credits()).toEqual({ reserved: 20, used: 4 + 110 });
    const audit = await withTenant(db, ctx(), (tx) => tx.select().from(s.auditLog).where(eq(s.auditLog.targetId, idle)));
    expect(audit.find((a) => a.action === "run.ended_stuck")).toMatchObject({ actorUserId: SYSTEM_ACTOR, actorIsAdmin: true });
  });
});

describe("shared rate limit", () => {
  it("allows up to max per window, then refuses; keys are independent", async () => {
    const { hitRateLimit } = await import("../src/index.ts");
    await as("sieveline_app", async () => {
      for (let i = 0; i < 3; i++) expect(await hitRateLimit(db, "t:u1", 3, 60_000)).toBe(true);
      expect(await hitRateLimit(db, "t:u1", 3, 60_000)).toBe(false);
      expect(await hitRateLimit(db, "t:u2", 3, 60_000)).toBe(true);
      // A window of 0 ms has always expired, so the count restarts.
      expect(await hitRateLimit(db, "t:u1", 3, 0)).toBe(true);
    });
  });
});
