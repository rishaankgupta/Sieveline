import { PGlite } from "@electric-sql/pglite";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { beforeAll, describe, expect, it } from "vitest";
import {
  createRunWithReservation, createWorkspaceForUser, DeepDiveConflict, finishDeepDive, getDeepDive, InsufficientCredits,
  latestDeepDive, listCompanies, platformCreditsToday, recentDeepDiveCount, settleRun, startDeepDiveWithReservation,
  updateDeepDive, upsertCompanies, withTenant,
} from "../src/index.ts";
import * as s from "../src/schema.ts";

let client: PGlite;
let db: ReturnType<typeof drizzle<typeof s>>;
let ws: string;
let wsOther: string;
let runId: string;
let companyA: string;
let companyB: string;
const ctx = () => ({ userId: "u1", workspaceId: ws });
const other = () => ({ userId: "u2", workspaceId: wsOther });

async function workspaceCredits(id: string, c = ctx()) {
  const [w] = await withTenant(db, c, (tx) => tx.select().from(s.workspaces).where(eq(s.workspaces.id, id)));
  return { reserved: Number(w!.creditsReserved), used: Number(w!.creditsUsedThisMonth) };
}

beforeAll(async () => {
  client = new PGlite();
  db = drizzle(client, { schema: s });
  await migrate(db, { migrationsFolder: new URL("../migrations", import.meta.url).pathname });
  await db.insert(s.users).values([{ id: "u1", name: "U1", email: "u1@x.com" }, { id: "u2", name: "U2", email: "u2@x.com" }]);
  await client.exec("SET ROLE sieveline_app");
  ws = await createWorkspaceForUser(db, { userId: "u1", name: "W1", monthlyCreditCap: 300 });
  wsOther = await createWorkspaceForUser(db, { userId: "u2", name: "W2", monthlyCreditCap: 300 });
  runId = (await createRunWithReservation(db, ctx(), { thesisId: null, thesis: {}, settings: {}, reserveCredits: 10, dailyCeiling: 10_000 })).runId;
  await settleRun(db, ctx(), runId);
  await upsertCompanies(db, ctx(), runId, [
    { domain: "a.com", name: "A", source: "search", foundBy: "q" },
    { domain: "b.com", name: "B", source: "search", foundBy: "q" },
  ]);
  const rows = await listCompanies(db, ctx(), runId);
  companyA = rows.find((r) => r.domain === "a.com")!.id;
  companyB = rows.find((r) => r.domain === "b.com")!.id;
}, 60_000);

describe("deep dives", () => {
  it("reserves worst-case credits, allows one active per company, and settles real usage once", async () => {
    const { deepDiveId } = await startDeepDiveWithReservation(db, ctx(), { runId, companyId: companyA, model: "mini", reserveCredits: 110, dailyCeiling: 10_000 });
    expect(await workspaceCredits(ws)).toEqual({ reserved: 110, used: 0 });

    // A second click while the first is unfinished is refused, and reserves nothing.
    await expect(startDeepDiveWithReservation(db, ctx(), { runId, companyId: companyA, model: "mini", reserveCredits: 110, dailyCeiling: 10_000 }))
      .rejects.toMatchObject({ reason: "active" });
    expect((await workspaceCredits(ws)).reserved).toBe(110);

    await updateDeepDive(db, ctx(), deepDiveId, { status: "running", tavilyRequestId: "req-123456789" });
    expect(await finishDeepDive(db, ctx(), deepDiveId, { status: "succeeded", credits: 23, dossier: { overview: "x" }, sources: [{ url: "https://a.com" }] })).toBe(true);
    expect(await finishDeepDive(db, ctx(), deepDiveId, { status: "succeeded", credits: 23 })).toBe(false); // idempotent
    expect(await workspaceCredits(ws)).toEqual({ reserved: 0, used: 23 });
    expect(await platformCreditsToday(db)).toBe(23);

    const row = await getDeepDive(db, ctx(), deepDiveId);
    expect(row).toMatchObject({ status: "succeeded", creditsUsed: "23.00", creditsReserved: "0.00", dossier: { overview: "x" } });
    const usage = await withTenant(db, ctx(), (tx) => tx.select().from(s.usageEvents).where(eq(s.usageEvents.deepDiveId, deepDiveId)));
    expect(usage).toHaveLength(1);
    expect(usage[0]).toMatchObject({ endpoint: "research", credits: "23.00", requestId: "req-123456789", runId });

    // Finished, so a new one for the same company is allowed again.
    const again = await startDeepDiveWithReservation(db, ctx(), { runId, companyId: companyA, model: "mini", reserveCredits: 50, dailyCeiling: 10_000 });
    expect((await latestDeepDive(db, ctx(), runId, companyA))?.id).toBe(again.deepDiveId);
    await finishDeepDive(db, ctx(), again.deepDiveId, { status: "failed", credits: 0, error: "Tavily research failed" });
    expect(await workspaceCredits(ws)).toEqual({ reserved: 0, used: 23 });
    expect(await recentDeepDiveCount(db, ctx())).toBe(2);
  });

  it("refuses beyond the monthly cap", async () => {
    await expect(startDeepDiveWithReservation(db, ctx(), { runId, companyId: companyB, model: "pro", reserveCredits: 290, dailyCeiling: 10_000 }))
      .rejects.toBeInstanceOf(InsufficientCredits);
    expect(await latestDeepDive(db, ctx(), runId, companyB)).toBeNull();
  });

  it("cannot reach another workspace's companies or deep dives", async () => {
    await expect(startDeepDiveWithReservation(db, other(), { runId, companyId: companyB, model: "mini", reserveCredits: 10, dailyCeiling: 10_000 }))
      .rejects.toBeInstanceOf(DeepDiveConflict);
    expect((await workspaceCredits(wsOther, other())).reserved).toBe(0);
    const mine = await latestDeepDive(db, ctx(), runId, companyA);
    expect(await getDeepDive(db, other(), mine!.id)).toBeNull();
    expect(await finishDeepDive(db, other(), mine!.id, { status: "succeeded", credits: 5 })).toBe(false);
  });

  it("checks the company belongs to the run", async () => {
    const run2 = (await createRunWithReservation(db, ctx(), { thesisId: null, thesis: {}, settings: {}, reserveCredits: 1, dailyCeiling: 10_000 })).runId;
    await expect(startDeepDiveWithReservation(db, ctx(), { runId: run2, companyId: companyB, model: "mini", reserveCredits: 10, dailyCeiling: 10_000 }))
      .rejects.toMatchObject({ reason: "company_not_found" });
  });
});
