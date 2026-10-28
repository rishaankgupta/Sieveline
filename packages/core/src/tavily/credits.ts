import type { CrawlRequest, ExtractRequest, MapRequest, SearchRequest } from "./types.ts";

/**
 * Worst-case credit cost per request, from Tavily's Credits & Pricing docs (read 2026-10-28).
 * Used to reserve credits before a call; the real amount comes back in `usage.credits`.
 */
export function maxSearchCredits(req: SearchRequest): number {
  return req.search_depth === "advanced" ? 2 : 1;
}

export function maxExtractCredits(req: ExtractRequest): number {
  return Math.ceil(req.urls.length / 5) * (req.extract_depth === "advanced" ? 2 : 1);
}

export function maxMapCredits(req: MapRequest): number {
  const pages = req.limit ?? 50;
  return Math.ceil(pages / 10) * (req.instructions ? 2 : 1);
}

export function maxCrawlCredits(req: CrawlRequest): number {
  const pages = req.limit ?? 50;
  return maxMapCredits(req) + Math.ceil(pages / 5) * (req.extract_depth === "advanced" ? 2 : 1);
}

export const RESEARCH_CREDIT_BOUNDS = {
  mini: { min: 4, max: 110 },
  pro: { min: 15, max: 250 },
} as const;

/** USD at Tavily list price, as a range (cheapest plan rate to pay-as-you-go rate). */
export function creditsToUsd(credits: number): { low: number; high: number } {
  return { low: round2(credits * 0.005), high: round2(credits * 0.008) };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
