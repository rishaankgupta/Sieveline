import { describe, expect, it, vi } from "vitest";
import { SlidingWindowLimiter, TavilyClient, TavilyError, type Clock, type TavilyCache } from "../src/index.ts";

function fakeClock(): Clock & { t: number; sleeps: number[] } {
  const c = {
    t: 0,
    sleeps: [] as number[],
    now: () => c.t,
    sleep: async (ms: number) => {
      c.sleeps.push(ms);
      c.t += ms;
    },
  };
  return c;
}

function json(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", ...headers } });
}

function memoryCache(): TavilyCache & { store: Map<string, unknown> } {
  const store = new Map<string, unknown>();
  return { store, get: async (k) => store.get(k), set: async (k, v) => void store.set(k, v) };
}

describe("TavilyClient", () => {
  it("sends auth, always asks for usage, and reports Tavily's credits", async () => {
    const fetch = vi.fn(async () => json({ query: "q", results: [], usage: { credits: 2 }, request_id: "r1" }));
    const onUsage = vi.fn();
    const c = new TavilyClient({ apiKey: "tvly-test", fetch, onUsage, clock: fakeClock() });
    await c.search({ query: "calibration labs texas", search_depth: "advanced" });
    const [url, init] = fetch.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://api.tavily.com/search");
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer tvly-test");
    expect(JSON.parse(init.body as string)).toMatchObject({ include_usage: true, search_depth: "advanced" });
    expect(onUsage).toHaveBeenCalledWith({ endpoint: "search", credits: 2, requestId: "r1", cached: false });
  });

  it("serves repeat calls from cache at zero cost", async () => {
    const fetch = vi.fn(async () => json({ results: [], usage: { credits: 1 } }));
    const onUsage = vi.fn();
    const cache = memoryCache();
    const c = new TavilyClient({ apiKey: "tvly-t", fetch, cache, onUsage, clock: fakeClock() });
    await c.extract({ urls: ["https://a.com"] });
    await c.extract({ urls: ["https://a.com"] });
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(onUsage).toHaveBeenLastCalledWith(expect.objectContaining({ credits: 0, cached: true }));
  });

  it("never caches research or usage", async () => {
    const fetch = vi.fn(async () => json({ request_id: "123e4567-e89b", created_at: "x", status: "pending" }));
    const cache = memoryCache();
    const c = new TavilyClient({ apiKey: "tvly-t", fetch, cache, clock: fakeClock() });
    await c.createResearch({ input: "dossier" });
    await c.createResearch({ input: "dossier" });
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(cache.store.size).toBe(0);
  });

  it("honors Retry-After on 429 then succeeds", async () => {
    const clock = fakeClock();
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(json({ detail: {} }, 429, { "retry-after": "7" }))
      .mockResolvedValueOnce(json({ base_url: "a.com", results: ["https://a.com/about"] }));
    const c = new TavilyClient({ apiKey: "tvly-t", fetch, clock });
    const r = await c.map({ url: "a.com" });
    expect(r.results).toEqual(["https://a.com/about"]);
    expect(clock.sleeps).toContain(7000);
  });

  it("does not retry non-retryable errors and hides response bodies", async () => {
    const fetch = vi.fn(async () => json({ detail: { error: "secret echo tvly-xyz" } }, 432));
    const c = new TavilyClient({ apiKey: "tvly-t", fetch, clock: fakeClock() });
    const err = await c.search({ query: "x" }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(TavilyError);
    expect((err as TavilyError).code).toBe("plan_limit");
    expect((err as Error).message).not.toMatch(/secret|tvly-xyz/);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("retries server errors with backoff, up to maxRetries", async () => {
    const fetch = vi.fn(async () => json({}, 502));
    const c = new TavilyClient({ apiKey: "tvly-t", fetch, clock: fakeClock(), maxRetries: 2 });
    await expect(c.search({ query: "x" })).rejects.toMatchObject({ code: "server" });
    expect(fetch).toHaveBeenCalledTimes(3);
  });

  it("does not retry research creation on server errors (avoids double billing)", async () => {
    const fetch = vi.fn(async () => json({}, 500));
    const c = new TavilyClient({ apiKey: "tvly-t", fetch, clock: fakeClock() });
    await expect(c.createResearch({ input: "x" })).rejects.toMatchObject({ code: "server" });
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("turns network failures into retryable errors", async () => {
    const fetch = vi.fn(async () => {
      throw new TypeError("fetch failed");
    });
    const c = new TavilyClient({ apiKey: "tvly-t", fetch, clock: fakeClock(), maxRetries: 1 });
    await expect(c.search({ query: "x" })).rejects.toMatchObject({ code: "network" });
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("validates inputs before spending", () => {
    const c = new TavilyClient({ apiKey: "tvly-t", fetch: vi.fn(), clock: fakeClock() });
    expect(() => c.extract({ urls: [] })).toThrow();
    expect(() => c.createResearch({ input: "x", files: Array(6).fill({ filename: "a.md", content: "" }) })).toThrow(/5 files/);
    expect(() => c.getResearch("../../etc")).toThrow();
    expect(() => new TavilyClient({ apiKey: "" })).toThrow();
  });

  it("polls research status by id", async () => {
    const fetch = vi.fn(async () => json({ request_id: "123e4567-e89b", status: "completed", content: { a: 1 } }));
    const c = new TavilyClient({ apiKey: "tvly-t", fetch, clock: fakeClock() });
    const r = await c.getResearch("123e4567-e89b");
    expect(r.status).toBe("completed");
    expect((fetch.mock.calls[0] as unknown as [string, RequestInit])[1].method).toBe("GET");
  });
});

describe("SlidingWindowLimiter", () => {
  it("waits when the window is full", async () => {
    const clock = fakeClock();
    const l = new SlidingWindowLimiter(2, 1000, clock);
    await l.acquire();
    await l.acquire();
    await l.acquire();
    expect(clock.sleeps.length).toBe(1);
    expect(clock.t).toBeGreaterThanOrEqual(1000);
  });
});
