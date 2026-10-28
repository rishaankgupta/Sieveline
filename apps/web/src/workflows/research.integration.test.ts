import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import { PGlite } from "@electric-sql/pglite";
import { PGLiteSocketServer } from "@electric-sql/pglite-socket";
import { createRunWithReservation, createWorkspaceForUser, schema } from "@sieveline/db";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { start } from "workflow/api";
import calibration from "../../../../packages/core/templates/calibration-labs-us.json" with { type: "json" };
import { researchRun } from "./research";

/**
 * End-to-end test of the research workflow with real Postgres (PGlite over a socket), a fake
 * Tavily API and a fake OpenAI-compatible LLM, both over HTTP. Nothing is mocked inside the app.
 */
let pg: PGlite;
let pgServer: PGLiteSocketServer;
let tavily: Server;
let llm: Server;
const calls: Record<string, number> = {};
let db: ReturnType<typeof drizzle<typeof schema>>;

const ACME_ABOUT =
  "Acme Calibration was founded in 1987 and is a family-owned business. We are ISO/IEC 17025 accredited and provide on-site calibration for aerospace and medical device manufacturers.";

async function body(req: IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = [];
  for await (const c of req) chunks.push(c as Buffer);
  return chunks.length ? JSON.parse(Buffer.concat(chunks).toString()) : {};
}

function send(res: ServerResponse, status: number, data: unknown) {
  res.writeHead(status, { "content-type": "application/json" });
  res.end(JSON.stringify(data));
}

function listen(server: Server): Promise<string> {
  return new Promise((r) => server.listen(0, "127.0.0.1", () => r(`http://127.0.0.1:${(server.address() as AddressInfo).port}`)));
}

beforeAll(async () => {
  pg = new PGlite();
  db = drizzle(pg, { schema });
  await migrate(db, { migrationsFolder: new URL("../../../../packages/db/migrations", import.meta.url).pathname });
  await db.insert(schema.users).values({ id: "u1", name: "U", email: "u@x.com" });

  pgServer = new PGLiteSocketServer({ db: pg, port: 0, host: "127.0.0.1" });
  await pgServer.start();
  const pgPort = (pgServer as unknown as { server: Server }).server.address() as AddressInfo;

  tavily = createServer(async (req, res) => {
    const b = await body(req);
    const path = req.url ?? "";
    calls[path] = (calls[path] ?? 0) + 1;
    if (req.headers.authorization !== "Bearer tvly-test-key") return send(res, 401, {});
    if (path === "/search") {
      if (b.topic === "news") return send(res, 200, { query: b.query, results: [], usage: { credits: 1 } });
      return send(res, 200, {
        query: b.query,
        usage: { credits: 1 },
        results: [
          { url: "https://www.acmecal.com/", title: "Acme Calibration | Home", content: "Calibration lab", score: 0.9 },
          { url: "https://bigcal.com/", title: "BigCal", content: "Calibration", score: 0.6 },
          { url: "https://www.linkedin.com/company/x", title: "LinkedIn", score: 1 },
        ],
      });
    }
    if (path === "/map") return send(res, 200, { base_url: b.url, results: [`${b.url}/about-us`], usage: { credits: 2 } });
    if (path === "/extract") {
      const urls = b.urls as string[];
      return send(res, 200, {
        usage: { credits: Math.ceil(urls.length / 5) },
        failed_results: [],
        results: urls.map((u) => ({ url: u, raw_content: u.includes("acmecal") ? (u.includes("about") ? ACME_ABOUT : "Acme home page.") : "BigCal, established 2019, is now part of Accredited Labs." })),
      });
    }
    if (path === "/crawl") return send(res, 200, { base_url: b.url, results: [], usage: { credits: 3 } });
    send(res, 404, {});
  });

  llm = createServer(async (req, res) => {
    const b = (await body(req)) as { messages: { role: string; content: string }[] };
    calls["llm"] = (calls["llm"] ?? 0) + 1;
    const prompt = b.messages.map((m) => m.content).join("\n");
    let content: unknown;
    if (prompt.includes("web search queries")) content = { queries: ["metrology laboratory texas"] };
    else if (prompt.includes("acmecal")) {
      content = {
        company_name: "Acme Calibration",
        summary: "Independent calibration lab.",
        criteria: {
          calibration_is_core: { answer: "yes", quote: "Acme Calibration was founded in 1987", sourceUrl: "https://acmecal.com/about-us" },
          iso_17025: { answer: "yes", quote: "We are ISO/IEC 17025 accredited", sourceUrl: "https://acmecal.com/about-us" },
          independent: { answer: "yes", quote: "Acme is owned by aliens according to nobody", sourceUrl: "https://acmecal.com/about-us" },
        },
      };
    } else content = { company_name: "BigCal", criteria: {} };
    send(res, 200, {
      id: "c1", object: "chat.completion", created: 0, model: "fake",
      choices: [{ index: 0, finish_reason: "stop", message: { role: "assistant", content: JSON.stringify(content) } }],
      usage: { prompt_tokens: 1000, completion_tokens: 100, total_tokens: 1100 },
    });
  });

  const tavilyUrl = await listen(tavily);
  const llmUrl = await listen(llm);
  Object.assign(process.env, {
    APP_URL: "http://localhost:3000",
    AUTH_SECRET: "x".repeat(40),
    DATABASE_URL: `postgres://postgres:postgres@127.0.0.1:${pgPort.port}/postgres?sslmode=disable`,
    DB_POOL_MAX: "1",
    TAVILY_API_KEY: "tvly-test-key",
    TAVILY_BASE_URL: tavilyUrl,
    LLM_PROVIDER: "fake",
    LLM_API_KEY: "k",
    LLM_BASE_URL: `${llmUrl}/v1`,
    LLM_MODEL_SCORING: "fake-model",
    LLM_STRUCTURED_OUTPUTS: "false",
    LLM_PRICE_INPUT_PER_MTOK: "1",
    LLM_PRICE_OUTPUT_PER_MTOK: "2",
  });
}, 60_000);

afterAll(async () => {
  tavily?.close();
  llm?.close();
  await pgServer?.stop();
});

describe("research workflow end to end", () => {
  it("finds, reads, scores and shortlists companies, metering every credit", async () => {
    const workspaceId = await createWorkspaceForUser(db, { userId: "u1", name: "W", monthlyCreditCap: 10_000 });
    const ctx = { userId: "u1", workspaceId };
    const thesis = { ...calibration, places: ["Texas"], searchTerms: ["calibration laboratory"] };
    const settings = { maxQueries: 3, maxCandidates: 10, pagesPerCompany: 2, newsCheckTop: 2, crawlTop: 1, shortlistSize: 5, seeds: [] };
    const { runId } = await createRunWithReservation(db, ctx, { thesisId: null, thesis, settings, reserveCredits: 500, dailyCeiling: 10_000 });

    const run = await start(researchRun, [{ runId, ...ctx }]);
    const out = await run.returnValue;
    expect(out).toMatchObject({ companies: 2, stoppedEarly: false });

    const [row] = await db.select().from(schema.runs).where(eq(schema.runs.id, runId));
    expect(row?.status).toBe("succeeded");
    expect(Number(row?.creditsReserved)).toBe(0); // settled
    const usage = await db.select().from(schema.usageEvents).where(eq(schema.usageEvents.runId, runId));
    const tavilyCredits = usage.filter((u) => u.provider === "tavily").reduce((a, u) => a + Number(u.credits), 0);
    expect(Number(row?.creditsUsed)).toBe(tavilyCredits);
    expect(tavilyCredits).toBeGreaterThan(0);
    expect(Number(row?.llmCostUsd)).toBeGreaterThan(0);

    const [ws] = await db.select().from(schema.workspaces).where(eq(schema.workspaces.id, workspaceId));
    expect(Number(ws?.creditsReserved)).toBe(0);
    expect(Number(ws?.creditsUsedThisMonth)).toBe(tavilyCredits);

    const companies = await db.select().from(schema.companies).where(eq(schema.companies.runId, runId));
    const acme = companies.find((c) => c.domain === "acmecal.com");
    expect(acme?.status).toBe("strong_fit");
    expect(companies.find((c) => c.domain === "bigcal.com")?.status).toBe("verify_ownership");
    expect(companies.some((c) => c.domain.includes("linkedin"))).toBe(false);

    const facts = await db.select().from(schema.facts).where(eq(schema.facts.companyId, acme!.id));
    const iso = facts.find((f) => f.kind === "criterion" && f.key === "iso_17025");
    expect(iso).toMatchObject({ value: "yes", sourceUrl: "https://acmecal.com/about-us" });
    expect(facts.find((f) => f.key === "independent")?.value).toBe("unknown"); // invented quote dropped
    expect(facts.find((f) => f.kind === "founded_year")?.value).toBe("1987");

    const shortlist = await db.select().from(schema.shortlistItems).where(eq(schema.shortlistItems.runId, runId));
    expect(shortlist.length).toBe(2);
    expect(shortlist.find((s) => s.position === 1)?.companyId).toBe(acme!.id);

    const steps = await db.select().from(schema.runSteps).where(eq(schema.runSteps.runId, runId));
    expect(steps.every((s) => s.status === "succeeded")).toBe(true);
    expect(calls["/crawl"]).toBe(1);
  });

  it("serves a second identical run from cache and stops early when credits run out", async () => {
    const workspaceId = await createWorkspaceForUser(db, { userId: "u1", name: "W2", monthlyCreditCap: 10_000 });
    const ctx = { userId: "u1", workspaceId };
    const thesis = { ...calibration, places: ["Texas"], searchTerms: ["calibration laboratory"] };
    const before = { ...calls };
    const settings = { maxQueries: 3, maxCandidates: 10, pagesPerCompany: 2, newsCheckTop: 2, crawlTop: 1, shortlistSize: 5, seeds: [] };
    const { runId } = await createRunWithReservation(db, ctx, { thesisId: null, thesis, settings, reserveCredits: 500, dailyCeiling: 10_000 });
    await (await start(researchRun, [{ runId, ...ctx }])).returnValue;
    expect(calls["/search"]).toBe(before["/search"]); // all cached
    const cached = await db.select().from(schema.usageEvents).where(eq(schema.usageEvents.runId, runId));
    expect(cached.filter((u) => u.provider === "tavily").every((u) => u.cached && Number(u.credits) === 0)).toBe(true);

    // A tiny reservation: discovery can't fit, so the run ends early but cleanly.
    const tiny = await createRunWithReservation(db, ctx, { thesisId: null, thesis: { ...thesis, searchTerms: ["brand new terms"] }, settings, reserveCredits: 1, dailyCeiling: 10_000 });
    const out = await (await start(researchRun, [{ runId: tiny.runId, ...ctx }])).returnValue;
    expect(out.stoppedEarly).toBe(true);
    const [row] = await db.select().from(schema.runs).where(eq(schema.runs.id, tiny.runId));
    expect(row?.status).toBe("succeeded");
    expect(row?.error).toMatch(/Stopped early/);
    expect(Number(row?.creditsUsed)).toBeLessThanOrEqual(1);
  });
});
