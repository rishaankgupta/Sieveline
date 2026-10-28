/**
 * Sliding-window limiter, one window per endpoint group.
 * In-process only: it smooths bursts inside one function instance. Tavily's own 429 +
 * Retry-After handling (client.ts) is the authority across instances.
 */
export interface Clock {
  now(): number;
  sleep(ms: number): Promise<void>;
}

export const realClock: Clock = {
  now: () => Date.now(),
  sleep: (ms) => new Promise((r) => setTimeout(r, ms)),
};

export class SlidingWindowLimiter {
  private readonly stamps: number[] = [];

  private readonly limit: number;
  private readonly windowMs: number;
  private readonly clock: Clock;

  constructor(limit: number, windowMs: number, clock: Clock = realClock) {
    this.limit = limit;
    this.windowMs = windowMs;
    this.clock = clock;
    if (limit < 1 || windowMs < 1) throw new Error("limit and windowMs must be positive");
  }

  async acquire(): Promise<void> {
    for (;;) {
      const now = this.clock.now();
      while (this.stamps.length && now - (this.stamps[0] ?? 0) >= this.windowMs) this.stamps.shift();
      if (this.stamps.length < this.limit) {
        this.stamps.push(now);
        return;
      }
      await this.clock.sleep(this.windowMs - (now - (this.stamps[0] ?? now)) + 1);
    }
  }
}

export type EndpointGroup = "general" | "crawl" | "research" | "usage";

/** Limits from Tavily's Rate Limits docs (read 2026-10-28). Development keys use 100/min general. */
export const TAVILY_LIMITS: Record<"production" | "development", Record<EndpointGroup, [number, number]>> = {
  production: { general: [1000, 60_000], crawl: [100, 60_000], research: [20, 60_000], usage: [10, 600_000] },
  development: { general: [100, 60_000], crawl: [100, 60_000], research: [20, 60_000], usage: [10, 600_000] },
};
