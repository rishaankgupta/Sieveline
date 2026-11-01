// Usage: DATABASE_URL=… DATABASE_URL_ADMIN=… DATABASE_URL_OWNER=… node packages/db/scripts/stress-race.ts
// Concurrency tests against real Neon (pooled, truly parallel connections). Spends no Tavily credits.
import { createDb, createRunWithReservation, finishDeepDive, hitRateLimit, InsufficientCredits, listCompanies, settleRun, startDeepDiveWithReservation, DeepDiveConflict, upsertCompanies, withTenant, schema } from "../src/index.ts";
import { eq } from "drizzle-orm";

const app = createDb(process.env.DATABASE_URL!);
const admin = createDb(process.env.DATABASE_URL_ADMIN!);
const owner = createDb(process.env.DATABASE_URL_OWNER!);
const uid = `race-${Date.now()}`;
const results: Record<string, unknown> = {};

await owner.insert(schema.users).values({ id: uid, name: "Race", email: `${uid}@demo.sieveline.invalid` });
const { createWorkspaceForUser } = await import("../src/index.ts");
const ws = await createWorkspaceForUser(app, { userId: uid, name: "race", monthlyCreditCap: 100 });
const ctx = { userId: uid, workspaceId: ws };

// 1. 25 parallel reservations of 9 credits against a cap of 100: at most 11 can succeed.
const t0 = Date.now();
const r = await Promise.allSettled(Array.from({ length: 25 }, () => createRunWithReservation(app, ctx, { thesisId: null, thesis: {}, settings: {}, reserveCredits: 9, dailyCeiling: 1e9 })));
const ok = r.filter((x) => x.status === "fulfilled") as PromiseFulfilledResult<{ runId: string }>[];
const capErr = r.filter((x) => x.status === "rejected" && (x as PromiseRejectedResult).reason instanceof InsufficientCredits).length;
const other = r.filter((x) => x.status === "rejected" && !((x as PromiseRejectedResult).reason instanceof InsufficientCredits)).map((x) => String((x as PromiseRejectedResult).reason).slice(0, 120));
const [w] = await owner.select().from(schema.workspaces).where(eq(schema.workspaces.id, ws));
results.reservations = { attempted: 25, succeeded: ok.length, refusedByCap: capErr, otherErrors: other, reservedTotal: Number(w!.creditsReserved), cap: 100, ms: Date.now() - t0 };

// 2. 12 parallel deep-dive starts for one company: exactly 1 may succeed.
const runId = ok[0]!.value.runId;
await upsertCompanies(app, ctx, runId, [{ domain: "race.example", name: "Race", source: "seed", foundBy: "test" }]);
for (const x of ok) await settleRun(app, ctx, x.value.runId); // release run holds first
const [co] = await listCompanies(app, ctx, runId);
const d = await Promise.allSettled(Array.from({ length: 12 }, () => startDeepDiveWithReservation(app, ctx, { runId, companyId: co!.id, model: "mini", reserveCredits: 5, dailyCeiling: 1e9 })));
const dOk = d.filter((x) => x.status === "fulfilled") as PromiseFulfilledResult<{ deepDiveId: string }>[];
const dConflict = d.filter((x) => x.status === "rejected" && (x as PromiseRejectedResult).reason instanceof DeepDiveConflict).length;
const [w2] = await owner.select().from(schema.workspaces).where(eq(schema.workspaces.id, ws));
results.deepDiveDoubleStart = { attempted: 12, succeeded: dOk.length, conflicts: dConflict, otherErrors: 12 - dOk.length - dConflict, reservedAfter: Number(w2!.creditsReserved) };
// Settle it twice in parallel: must charge once.
const fin = await Promise.all([1, 2, 3].map(() => finishDeepDive(app, ctx, dOk[0]!.value.deepDiveId, { status: "succeeded", credits: 3 })));
const [w3] = await owner.select().from(schema.workspaces).where(eq(schema.workspaces.id, ws));
results.parallelSettle = { calls: 3, applied: fin.filter(Boolean).length, reserved: Number(w3!.creditsReserved), used: Number(w3!.creditsUsedThisMonth) };

// 3. 60 parallel hits on a limit of 10.
const key = `race:${uid}`;
const hits = await Promise.all(Array.from({ length: 60 }, () => hitRateLimit(app, key, 10, 60_000)));
results.rateLimit = { attempted: 60, allowed: hits.filter(Boolean).length, limit: 10 };

// 4. RLS under load: 40 parallel reads of this workspace's runs from another user's context see nothing.
const otherCtx = { userId: "nobody", workspaceId: "00000000-0000-4000-8000-000000000000" };
const leaks = await Promise.all(Array.from({ length: 40 }, () => withTenant(app, otherCtx, (tx) => tx.select().from(schema.runs).where(eq(schema.runs.workspaceId, ws)))));
results.rlsUnderLoad = { reads: 40, rowsLeaked: leaks.reduce((a, b) => a + b.length, 0) };

// Cleanup
await owner.delete(schema.workspaces).where(eq(schema.workspaces.id, ws));
await owner.delete(schema.users).where(eq(schema.users.id, uid));
await owner.delete(schema.rateLimits).where(eq(schema.rateLimits.key, `app:${key}`));
console.log(JSON.stringify(results, null, 1));
void admin;
process.exit(0);
