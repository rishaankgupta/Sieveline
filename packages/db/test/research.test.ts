import { PGlite } from "@electric-sql/pglite";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { beforeAll, describe, expect, it } from "vitest";
import {
  createRunWithReservation, createWorkspaceForUser, getShortlist, InsufficientCredits, listCompanies, platformCreditsToday,
  postgresTavilyCache, recordStep, recordUsage, ResearchPaused, runCreditsRemaining, saveScoredCompany, saveShortlist,
  settleRun, upsertCompanies, withTenant,
} from "../src/index.ts";
import * as s from "../src/schema.ts";

let client: PGlite;
let db: ReturnType<typeof drizzle<typeof s>>;
let ws: string;
let wsOther: string;
const ctx = () => ({ userId: "u1", workspaceId: ws });

async function asOwner<T>(fn: () => Promise<T>) {
  await client.exec("RESET ROLE");
  try {
    return await fn();
  } finally {
    await client.exec("SET ROLE sieveline_app");
  }
}

beforeAll(async () => {
  client = new PGlite();
  db = drizzle(client, { schema: s });
  await migrate(db, { migrationsFolder: new URL("../migrations", import.meta.url).pathname });
  await db.insert(s.users).values([{ id: "u1", name: "U1", email: "u1@x.com" }, { id: "u2", name: "U2", email: "u2@x.com" }]);
  await client.exec("SET ROLE sieveline_app");
  ws = await createWorkspaceForUser(db, { userId: "u1", name: "W1", monthlyCreditCap: 100 });
  wsOther = await createWorkspaceForUser(db, { userId: "u2", name: "W2", monthlyCreditCap: 100 });
}, 60_000);

describe("runs and credits", () => {
  it("reserves credits atomically and refuses beyond the monthly cap", async () => {
    const a = await createRunWithReservation(db, ctx(), { thesisId: null, thesis: { n: 1 }, settings: {}, reserveCredits: 60, dailyCeiling: 10_000 });
    expect(a.runId).toBeTruthy();
    await expect(createRunWithReservation(db, ctx(), { thesisId: null, thesis: {}, settings: {}, reserveCredits: 41, dailyCeiling: 10_000 })).rejects.toBeInstanceOf(InsufficientCredits);
    expect(await runCreditsRemaining(db, ctx(), a.runId)).toBe(60);

    await recordUsage(db, ctx(), { runId: a.runId, provider: "tavily", endpoint: "search", credits: 12, costUsd: 0, cached: false });
    await recordUsage(db, ctx(), { runId: a.runId, provider: "llm", endpoint: "scoring", credits: 0, costUsd: 0.01, cached: false });
    expect(await runCreditsRemaining(db, ctx(), a.runId)).toBe(48);
    expect(await platformCreditsToday(db)).toBe(12);

    await settleRun(db, ctx(), a.runId);
    await settleRun(db, ctx(), a.runId); // idempotent
    const [w] = await withTenant(db, ctx(), (tx) => tx.select().from(s.workspaces).where(eq(s.workspaces.id, ws)));
    expect(Number(w!.creditsReserved)).toBe(0);
    expect(Number(w!.creditsUsedThisMonth)).toBe(12);
    // 88 left now
    await expect(createRunWithReservation(db, ctx(), { thesisId: null, thesis: {}, settings: {}, reserveCredits: 88, dailyCeiling: 10_000 })).resolves.toBeTruthy();
  });

  it("enforces the platform daily ceiling and the kill switch", async () => {
    await expect(createRunWithReservation(db, { userId: "u2", workspaceId: wsOther }, { thesisId: null, thesis: {}, settings: {}, reserveCredits: 5, dailyCeiling: 15 })).rejects.toBeInstanceOf(ResearchPaused);
    await asOwner(() => client.exec("SET ROLE sieveline_admin; INSERT INTO settings (key, value, version) VALUES ('research_paused', 'true', 2);"));
    await expect(createRunWithReservation(db, { userId: "u2", workspaceId: wsOther }, { thesisId: null, thesis: {}, settings: {}, reserveCredits: 1, dailyCeiling: 10_000 })).rejects.toThrow(/paused \(platform\)/);
    await asOwner(() => client.exec("SET ROLE sieveline_admin; INSERT INTO settings (key, value, version) VALUES ('research_paused', 'false', 3);"));
  });

  it("platform spend function reveals a total but no rows from other workspaces", async () => {
    const rows = await withTenant(db, { userId: "u2", workspaceId: wsOther }, (tx) => tx.select().from(s.usageEvents));
    expect(rows).toEqual([]);
    expect(await platformCreditsToday(db)).toBe(12);
  });
});

describe("companies, facts and shortlist", () => {
  it("stores companies, replaces facts on re-score, and builds a shortlist", async () => {
    const { runId } = await createRunWithReservation(db, { userId: "u2", workspaceId: wsOther }, { thesisId: null, thesis: {}, settings: {}, reserveCredits: 10, dailyCeiling: 10_000 });
    const c2 = { userId: "u2", workspaceId: wsOther };
    await upsertCompanies(db, c2, runId, [
      { domain: "acme.com", name: "Acme", source: "search", foundBy: "q" },
      { domain: "acme.com", name: "Dup", source: "search", foundBy: "q" },
      { domain: "big.com", name: "Big", source: "seed", foundBy: "seed file" },
    ]);
    expect((await listCompanies(db, c2, runId)).map((c) => c.domain)).toEqual(["acme.com", "big.com"]);
    const base = { domain: "acme.com", name: "Acme Calibration", score: 9, status: "strong_fit" as const, failedRule: null, summary: "Lab", pages: [{ url: "https://acme.com", text: "x".repeat(20_000) }] };
    await saveScoredCompany(db, c2, runId, { ...base, facts: [{ kind: "founded_year", value: "1987", quote: "founded in 1987", sourceUrl: "https://acme.com" }, { kind: "criterion", key: "iso", value: "yes", quote: "ISO accredited" }] });
    await saveScoredCompany(db, c2, runId, { ...base, facts: [{ kind: "founded_year", value: "1987", quote: "founded in 1987" }] });
    const facts = await withTenant(db, c2, (tx) => tx.select().from(s.facts));
    expect(facts).toHaveLength(1);
    const [acme] = (await listCompanies(db, c2, runId)).filter((c) => c.domain === "acme.com");
    expect((acme!.pages as { text: string }[])[0]!.text.length).toBe(8000);

    await saveShortlist(db, c2, runId, [{ domain: "acme.com", position: 1, reason: "39 years" }, { domain: "ghost.com", position: 2, reason: "x" }]);
    const sl = await getShortlist(db, c2, runId);
    expect(sl).toHaveLength(1);
    expect(sl[0]).toMatchObject({ domain: "acme.com", name: "Acme Calibration", position: 1 });

    // other workspace sees none of it
    expect(await listCompanies(db, ctx(), runId)).toEqual([]);
    await recordStep(db, c2, { runId, step: "read", batch: 0, status: "running" });
    await recordStep(db, c2, { runId, step: "read", batch: 0, status: "succeeded" });
    const steps = await withTenant(db, c2, (tx) => tx.select().from(s.runSteps));
    expect(steps[0]).toMatchObject({ status: "succeeded", attempts: 2 });
  });
});

describe("tavily cache", () => {
  it("returns fresh entries and ignores expired ones", async () => {
    const cache = postgresTavilyCache(db);
    await cache.set("k1", { a: 1 }, 60);
    expect(await cache.get("k1")).toEqual({ a: 1 });
    await cache.set("k2", { b: 1 }, 0);
    expect(await cache.get("k2")).toBeUndefined();
    await asOwner(() => db.update(s.apiCache).set({ expiresAt: new Date(Date.now() - 1000) }).where(eq(s.apiCache.key, "k1")));
    expect(await cache.get("k1")).toBeUndefined();
  });
});
