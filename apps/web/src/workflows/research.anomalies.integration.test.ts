import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import { PGlite } from "@electric-sql/pglite";
import { PGLiteSocketServer } from "@electric-sql/pglite-socket";
import { createRunWithReservation, createWorkspaceForUser, schema } from "@sieveline/db";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { start } from "workflow/api";
import calibration from "../../../../packages/core/templates/calibration-labs-us.json" with { type: "json" };
import { researchRun } from "./research";

/**
 * How a run behaves when the outside world misbehaves. Fake Tavily and LLM servers over HTTP whose
 * behaviour each test switches; real Postgres; the real workflow runtime. Every test also checks
 * the money: the reservation is always released and only real usage is charged.
 */
let pg: PGlite;
let pgServer: PGLiteSocketServer;
let tavily: Server;
let llm: Server;
let db: ReturnType<typeof drizzle<typeof schema>>;

type TavilyMode = "ok" | "empty_search" | "plan_limit_on_extract" | "bad_key" | "rate_limited_once" | "null_content";
type LlmMode = "ok" | "garbage" | "http_500";
const mode: { tavily: TavilyMode; llm: LlmMode; pauseAfterSearch: boolean } = { tavily: "ok", llm: "ok", pauseAfterSearch: false };
let calls: Record<string, number> = {};

const ABOUT = "Acme Calibration was founded in 1987 and is a family-owned business. We are ISO/IEC 17025 accredited and provide on-site calibration for aerospace manufacturers.";

async function body(req: IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = [];
  for await (const c of req) chunks.push(c as Buffer);
  return chunks.length ? JSON.parse(Buffer.concat(chunks).toString()) : {};
}
const send = (res: ServerResponse, status: number, data: unknown, headers: Record<string, string> = {}) => {
  res.writeHead(status, { "content-type": "application/json", ...headers });
  res.end(typeof data === "string" ? data : JSON.stringify(data));
};
const listen = (server: Server) => new Promise<string>((r) => server.listen(0, "127.0.0.1", () => r(`http://127.0.0.1:${(server.address() as AddressInfo).port}`)));

beforeAll(async () => {
  pg = new PGlite();
  db = drizzle(pg, { schema });
  await migrate(db, { migrationsFolder: new URL("../../../../packages/db/migrations", import.meta.url).pathname });
  await db.insert(schema.users).values({ id: "u1", name: "U", email: "u@x.com" });
  pgServer = new PGLiteSocketServer({ db: pg, port: 0, host: "127.0.0.1" });
  await pgServer.start();
  const pgPort = ((pgServer as unknown as { server: Server }).server.address() as AddressInfo).port;

  tavily = createServer(async (req, res) => {
    const b = await body(req);
    const path = req.url ?? "";
    calls[path] = (calls[path] ?? 0) + 1;
    if (mode.tavily === "bad_key") return send(res, 401, { detail: { error: "Unauthorized" } });
    if (path === "/search") {
      if (mode.pauseAfterSearch) await db.insert(schema.settings).values({ key: "research_paused", value: true, version: 1, active: true, note: "test" }).onConflictDoNothing();
      if (b.topic === "news" || mode.tavily === "empty_search") return send(res, 200, { query: b.query, results: [], usage: { credits: 1 } });
      return send(res, 200, {
        query: b.query, usage: { credits: 1 },
        results: [
          { url: `https://acme-${String(b.query).length}.com/`, title: "Acme Calibration", content: "Calibration lab", score: 0.9 },
          { url: "https://other-cal.com/", title: "Other Cal", content: "Calibration", score: 0.7 },
        ],
      });
    }
    if (path === "/map") return send(res, 200, { base_url: b.url, results: [`${b.url}/about-us`], usage: { credits: 2 } });
    if (path === "/extract") {
      if (mode.tavily === "plan_limit_on_extract") return send(res, 432, { detail: { error: "This request exceeds your plan's set usage limit." } });
      if (mode.tavily === "rate_limited_once" && calls[path] === 1) return send(res, 429, { detail: { error: "rate limited" } }, { "retry-after": "1" });
      const urls = b.urls as string[];
      return send(res, 200, {
        usage: { credits: Math.ceil(urls.length / 5) }, failed_results: [],
        results: urls.map((u) => ({ url: u, raw_content: mode.tavily === "null_content" ? null : ABOUT })),
      });
    }
    if (path === "/crawl") return send(res, 200, { base_url: b.url, results: [], usage: { credits: 3 } });
    send(res, 404, {});
  });

  llm = createServer(async (req, res) => {
    const b = (await body(req)) as { messages: { role: string; content: string }[] };
    calls.llm = (calls.llm ?? 0) + 1;
    const prompt = b.messages.map((m) => m.content).join("\n");
    if (prompt.includes("web search queries")) return reply(res, { queries: ["calibration laboratory texas"] });
    if (mode.llm === "http_500") return send(res, 500, { error: { message: "upstream exploded" } });
    if (mode.llm === "garbage") return reply(res, "Sure! Here is my answer: the company looks great :)", true);
    return reply(res, {
      company_name: "Acme Calibration", summary: "Independent calibration lab.",
      criteria: { iso_17025: { answer: "yes", quote: "We are ISO/IEC 17025 accredited", sourceUrl: "x" } },
    });
  });
  function reply(res: ServerResponse, content: unknown, raw = false) {
    send(res, 200, {
      id: "c1", object: "chat.completion", created: 0, model: "fake",
      choices: [{ index: 0, finish_reason: "stop", message: { role: "assistant", content: raw ? String(content) : JSON.stringify(content) } }],
      usage: { prompt_tokens: 100, completion_tokens: 10, total_tokens: 110 },
    });
  }

  Object.assign(process.env, {
    APP_URL: "http://localhost:3000", AUTH_SECRET: "x".repeat(40),
    DATABASE_URL: `postgres://postgres:postgres@127.0.0.1:${pgPort}/postgres?sslmode=disable`, DB_POOL_MAX: "1",
    TAVILY_API_KEY: "tvly-test-key", TAVILY_BASE_URL: await listen(tavily),
    LLM_PROVIDER: "fake", LLM_API_KEY: "k", LLM_BASE_URL: `${await listen(llm)}/v1`, LLM_MODEL_SCORING: "fake-model",
    LLM_STRUCTURED_OUTPUTS: "false", SCORING_RETRY_SECONDS: "1", LLM_MAX_RETRIES: "0",
  });
}, 60_000);

afterAll(async () => {
  tavily?.close();
  llm?.close();
  await pgServer?.stop();
});

beforeEach(async () => {
  Object.assign(mode, { tavily: "ok", llm: "ok", pauseAfterSearch: false });
  calls = {};
  await db.delete(schema.settings).where(eq(schema.settings.key, "research_paused"));
  await db.delete(schema.apiCache); // every test reaches the fake servers
});

let n = 0;
async function runOnce() {
  const workspaceId = await createWorkspaceForUser(db, { userId: "u1", name: `W${++n}`, monthlyCreditCap: 10_000 });
  const ctx = { userId: "u1", workspaceId };
  const thesis = { ...calibration, places: ["Texas"], searchTerms: [`calibration laboratory ${n}`] };
  const settings = { maxQueries: 2, maxCandidates: 5, pagesPerCompany: 1, newsCheckTop: 1, crawlTop: 1, shortlistSize: 3, seeds: [] };
  const { runId } = await createRunWithReservation(db, ctx, { thesisId: null, thesis, settings, reserveCredits: 200, dailyCeiling: 10_000 });
  const handle = await start(researchRun, [{ runId, ...ctx }]);
  const out = await handle.returnValue.then((v) => ({ ok: true as const, v }), (e: unknown) => ({ ok: false as const, e }));
  const [run] = await db.select().from(schema.runs).where(eq(schema.runs.id, runId));
  const [ws] = await db.select().from(schema.workspaces).where(eq(schema.workspaces.id, workspaceId));
  const usage = await db.select().from(schema.usageEvents).where(eq(schema.usageEvents.runId, runId));
  const tavilyCredits = usage.filter((u) => u.provider === "tavily").reduce((a, u) => a + Number(u.credits), 0);
  const companies = await db.select().from(schema.companies).where(eq(schema.companies.runId, runId));
  // Money invariants, whatever happened: nothing still held, and the workspace was charged exactly what Tavily reported.
  expect(Number(run!.creditsReserved)).toBe(0);
  expect(Number(ws!.creditsReserved)).toBe(0);
  expect(Number(ws!.creditsUsedThisMonth)).toBe(tavilyCredits);
  expect(Number(run!.creditsUsed)).toBe(tavilyCredits);
  if (process.env.DEBUG_RUNS) console.error("RUN", run!.status, JSON.stringify(run!.error));
  return { out, run: run!, companies, tavilyCredits };
}

describe("research run when providers misbehave", () => {
  it("no search results: finishes cleanly with an empty list", async () => {
    mode.tavily = "empty_search";
    const { out, run, companies } = await runOnce();
    expect(out.ok).toBe(true);
    expect(run.status).toBe("succeeded");
    expect(companies).toHaveLength(0);
    expect(calls["/extract"] ?? 0).toBe(0);
  });

  it("Tavily plan limit mid-run: stops early, keeps what it found, says why, no retries", async () => {
    mode.tavily = "plan_limit_on_extract";
    const { out, run, companies } = await runOnce();
    expect(out.ok).toBe(true);
    expect(run.status).toBe("succeeded");
    expect(run.error).toMatch(/research provider's monthly credits ran out/);
    expect(companies.length).toBeGreaterThan(0); // found by search, kept for the buyer
    expect(calls["/extract"]).toBe(1); // a 432 is not retried
  });

  it("rejected Tavily key: fails at once with an operator message, no retries", async () => {
    mode.tavily = "bad_key";
    const { out, run } = await runOnce();
    expect(out.ok).toBe(false);
    expect(run.status).toBe("failed");
    expect(run.error).toMatch(/rejected Sieveline's API key/);
    expect(calls["/search"]).toBeLessThanOrEqual(2); // the planned queries, sent once each: no retries
  });

  it("Tavily 429 once: retried after Retry-After, run succeeds", async () => {
    mode.tavily = "rate_limited_once";
    const { out, run, companies } = await runOnce();
    expect(out.ok).toBe(true);
    expect(run.status).toBe("succeeded");
    expect(calls["/extract"]).toBeGreaterThanOrEqual(2);
    expect(companies.some((c) => c.status !== "unscored")).toBe(true);
  });

  it("pages with no text (raw_content null): no crash, companies marked as having no website text", async () => {
    mode.tavily = "null_content";
    const { out, run, companies } = await runOnce();
    expect(out.ok).toBe(true);
    expect(run.status).toBe("succeeded");
    expect(companies.length).toBeGreaterThan(0);
    expect(companies.every((c) => c.status === "no_website_text")).toBe(true);
  });

  it("AI returns prose instead of JSON for every company: batch retried, then the run fails clearly", async () => {
    mode.llm = "garbage";
    const { out, run, companies } = await runOnce();
    expect(out.ok).toBe(false);
    expect(run.status).toBe("failed");
    expect(run.error).toMatch(/AI that checks companies kept failing/);
    expect(run.error).not.toMatch(/step\/\//); // no internal step ids shown to buyers
    // Nothing half-scored was saved as if it were a result.
    expect(companies.every((c) => c.status === "unscored")).toBe(true);
  }, 120_000);

  it("AI provider down (HTTP 500): same as above, never a list full of made-up 'unknown's", async () => {
    mode.llm = "http_500";
    const { out, run } = await runOnce();
    expect(out.ok).toBe(false);
    expect(run.status).toBe("failed");
    expect(run.error).toMatch(/AI that checks companies kept failing/);
  }, 120_000);

  it("kill switch flipped mid-run: later stages spend nothing, the run ends early and says why", async () => {
    mode.pauseAfterSearch = true;
    const { out, run } = await runOnce();
    expect(out.ok).toBe(true);
    expect(run.status).toBe("succeeded");
    expect(run.error).toMatch(/paused by an operator/);
    expect(calls["/map"] ?? 0).toBe(0);
    expect(calls["/extract"] ?? 0).toBe(0);
  });
});
