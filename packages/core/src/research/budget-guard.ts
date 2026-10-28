import type { CrawlRequest, ExtractRequest, MapRequest, SearchRequest } from "../tavily/types.ts";
import { maxCrawlCredits, maxExtractCredits, maxMapCredits, maxSearchCredits } from "../tavily/credits.ts";
import type { TavilyLike } from "./pipeline.ts";

export class CreditLimitReached extends Error {
  readonly needed: number;
  readonly remaining: number;
  constructor(needed: number, remaining: number) {
    super(`Credit limit reached: next call needs up to ${needed}, ${remaining} left`);
    this.needed = needed;
    this.remaining = remaining;
    this.name = "CreditLimitReached";
  }
}

/**
 * Wraps a Tavily client so no call starts unless its worst-case cost fits in what is left of
 * the run's reservation. Remaining credits are tracked from Tavily's reported usage.
 * One guard per step: steps that run in sequence see each other's spending through the database.
 */
export function budgetedTavily(inner: TavilyLike, remainingAtStart: number): TavilyLike & { spent(): number; remaining(): number } {
  let reserved = 0;
  let spent = 0;
  const left = () => remainingAtStart - spent - reserved;
  async function guard<T extends { usage?: { credits?: number } }>(worst: number, call: () => Promise<T>): Promise<T> {
    if (worst > left()) throw new CreditLimitReached(worst, Math.max(0, left()));
    reserved += worst;
    try {
      const res = await call();
      spent += Number(res.usage?.credits ?? worst) || 0;
      return res;
    } finally {
      reserved -= worst;
    }
  }
  return {
    search: (r: SearchRequest) => guard(maxSearchCredits(r), () => inner.search(r)),
    extract: (r: ExtractRequest) => guard(maxExtractCredits(r), () => inner.extract(r)),
    map: (r: MapRequest) => guard(maxMapCredits(r), () => inner.map(r)),
    crawl: (r: CrawlRequest) => guard(maxCrawlCredits(r), () => inner.crawl(r)),
    spent: () => spent,
    remaining: () => Math.max(0, left()),
  };
}
