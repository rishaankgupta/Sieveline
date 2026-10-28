import { createHash } from "node:crypto";
import { type Clock, type EndpointGroup, realClock, SlidingWindowLimiter, TAVILY_LIMITS } from "./ratelimit";
import type {
  CrawlRequest, CrawlResponse, ExtractRequest, ExtractResponse, MapRequest, MapResponse,
  ResearchCreated, ResearchRequest, ResearchStatus, SearchRequest, SearchResponse, UsageResponse,
} from "./types";

export const TAVILY_BASE_URL = "https://api.tavily.com";

/** Response cache. Implemented with Postgres in the db package; in-memory in tests. */
export interface TavilyCache {
  get(key: string): Promise<unknown | undefined>;
  set(key: string, value: unknown, ttlSeconds: number): Promise<void>;
}

/** Called after every billable network call with Tavily's own credit count. */
export type UsageListener = (event: {
  endpoint: string;
  credits: number;
  requestId: string | undefined;
  cached: boolean;
}) => void | Promise<void>;

export class TavilyError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly retryable: boolean,
    readonly code: "bad_request" | "unauthorized" | "forbidden" | "rate_limited" | "plan_limit" | "paygo_limit" | "server" | "network" | "timeout",
  ) {
    super(message);
    this.name = "TavilyError";
  }
}

export interface TavilyClientOptions {
  apiKey: string;
  environment?: "production" | "development";
  fetch?: typeof fetch;
  cache?: TavilyCache;
  cacheTtlSeconds?: number;
  onUsage?: UsageListener;
  maxRetries?: number;
  timeoutMs?: number;
  clock?: Clock;
  baseUrl?: string;
}

const NON_CACHEABLE = new Set(["research", "usage"]);

export class TavilyClient {
  private readonly fetchImpl: typeof fetch;
  private readonly limiters: Record<EndpointGroup, SlidingWindowLimiter>;
  private readonly clock: Clock;

  constructor(private readonly opts: TavilyClientOptions) {
    if (!opts.apiKey) throw new Error("Tavily API key is required");
    this.fetchImpl = opts.fetch ?? globalThis.fetch;
    this.clock = opts.clock ?? realClock;
    const l = TAVILY_LIMITS[opts.environment ?? "production"];
    this.limiters = {
      general: new SlidingWindowLimiter(...l.general, this.clock),
      crawl: new SlidingWindowLimiter(...l.crawl, this.clock),
      research: new SlidingWindowLimiter(...l.research, this.clock),
      usage: new SlidingWindowLimiter(...l.usage, this.clock),
    };
  }

  search(req: SearchRequest): Promise<SearchResponse> {
    return this.call("POST", "search", "general", req);
  }

  extract(req: ExtractRequest): Promise<ExtractResponse> {
    if (req.urls.length === 0) throw new Error("extract needs at least one URL");
    return this.call("POST", "extract", "general", req);
  }

  map(req: MapRequest): Promise<MapResponse> {
    return this.call("POST", "map", "general", req);
  }

  crawl(req: CrawlRequest): Promise<CrawlResponse> {
    return this.call("POST", "crawl", "crawl", req, 160_000);
  }

  createResearch(req: ResearchRequest): Promise<ResearchCreated> {
    if (req.files && req.files.length > 5) throw new Error("Tavily Research accepts at most 5 files");
    if ((req.include_domains?.length ?? 0) > 20 || (req.exclude_domains?.length ?? 0) > 20) {
      throw new Error("Tavily Research accepts at most 20 include/exclude domains");
    }
    // A retried POST after a server/network error could start (and bill) a second task,
    // so research creation is retried only when Tavily says "rate limited".
    return this.call("POST", "research", "research", { ...req, stream: false }, undefined, true);
  }

  getResearch(requestId: string): Promise<ResearchStatus> {
    if (!/^[\w-]{8,64}$/.test(requestId)) throw new Error("invalid research request id");
    return this.call("GET", `research/${requestId}`, "general", undefined);
  }

  usage(): Promise<UsageResponse> {
    return this.call("GET", "usage", "usage", undefined);
  }

  private cacheKey(path: string, body: unknown): string {
    return createHash("sha256").update(JSON.stringify([path, body])).digest("hex");
  }

  private async call<T>(
    method: "GET" | "POST",
    path: string,
    group: EndpointGroup,
    body: object | undefined,
    timeoutMs = this.opts.timeoutMs ?? 60_000,
    retryOnlyRateLimit = false,
  ): Promise<T> {
    const endpoint = path.split("/")[0] ?? path;
    const payload = body === undefined ? undefined : { ...body, include_usage: true };
    const cacheable = method === "POST" && !NON_CACHEABLE.has(endpoint) && this.opts.cache;
    const key = cacheable ? this.cacheKey(path, payload) : "";

    if (cacheable) {
      const hit = await this.opts.cache!.get(key);
      if (hit !== undefined) {
        await this.opts.onUsage?.({ endpoint, credits: 0, requestId: undefined, cached: true });
        return hit as T;
      }
    }

    const maxRetries = this.opts.maxRetries ?? 3;
    for (let attempt = 0; ; attempt++) {
      await this.limiters[group].acquire();
      try {
        const data = await this.send<T>(method, path, payload, timeoutMs);
        const credits = Number((data as { usage?: { credits?: unknown } }).usage?.credits ?? 0) || 0;
        if (method === "POST" || credits > 0) {
          await this.opts.onUsage?.({
            endpoint,
            credits,
            requestId: (data as { request_id?: string }).request_id,
            cached: false,
          });
        }
        if (cacheable) await this.opts.cache!.set(key, data, this.opts.cacheTtlSeconds ?? 7 * 86_400);
        return data;
      } catch (err) {
        if (!(err instanceof TavilyError) || !err.retryable || attempt >= maxRetries) throw err;
        if (retryOnlyRateLimit && err.code !== "rate_limited") throw err;
        const retryAfter = (err as TavilyError & { retryAfterMs?: number }).retryAfterMs;
        const backoff = retryAfter ?? Math.min(30_000, 1000 * 2 ** attempt) + Math.floor(Math.random() * 250);
        await this.clock.sleep(backoff);
      }
    }
  }

  private async send<T>(method: string, path: string, payload: unknown, timeoutMs: number): Promise<T> {
    let res: Response;
    try {
      res = await this.fetchImpl(`${this.opts.baseUrl ?? TAVILY_BASE_URL}/${path}`, {
        method,
        headers: {
          Authorization: `Bearer ${this.opts.apiKey}`,
          ...(payload === undefined ? {} : { "Content-Type": "application/json" }),
        },
        body: payload === undefined ? null : JSON.stringify(payload),
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (e) {
      const timeout = e instanceof Error && (e.name === "TimeoutError" || e.name === "AbortError");
      throw new TavilyError(timeout ? "Tavily request timed out" : "Network error calling Tavily", 0, true, timeout ? "timeout" : "network");
    }
    if (res.ok) return (await res.json()) as T;

    // Never include the response body verbatim in errors: it may echo request content.
    const status = res.status;
    const map: Record<number, [TavilyError["code"], boolean]> = {
      400: ["bad_request", false],
      401: ["unauthorized", false],
      403: ["forbidden", false],
      429: ["rate_limited", true],
      432: ["plan_limit", false],
      433: ["paygo_limit", false],
    };
    const [code, retryable] = map[status] ?? (status >= 500 ? ["server", true] : ["bad_request", false]);
    const err = new TavilyError(`Tavily ${path.split("/")[0]} failed with HTTP ${status} (${code})`, status, retryable, code);
    const ra = Number(res.headers.get("retry-after"));
    if (status === 429 && Number.isFinite(ra) && ra > 0) {
      (err as TavilyError & { retryAfterMs?: number }).retryAfterMs = Math.min(ra, 300) * 1000;
    }
    throw err;
  }
}
