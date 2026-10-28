import type { Thesis } from "../thesis.ts";
import { RESEARCH_CREDIT_BOUNDS } from "../tavily/credits.ts";
import type { ResearchSettings } from "./settings.ts";

export interface CreditEstimate {
  stages: { stage: string; maxCredits: number }[];
  maxCredits: number;
  /** A realistic figure for display; the reservation always uses maxCredits. */
  typicalCredits: number;
}

/**
 * Worst-case Tavily credits for one run, before any deep dives. Shown to the buyer before
 * starting and reserved against the workspace's monthly cap.
 */
export function estimateRunCredits(thesis: Thesis, s: ResearchSettings, seedCount = 0): CreditEstimate {
  // The planner never runs more than maxQueries searches.
  const queries = s.maxQueries;
  const perSearch = s.searchDepth === "advanced" ? 2 : 1;
  const candidates = s.maxCandidates + seedCount;
  const mapPer = Math.ceil(s.mapLimit / 10) * (s.mapInstructions ? 2 : 1);
  // Worst case: every page fails basic (1 credit / 5) and is retried advanced (2 credits / 5).
  const extract = Math.ceil((candidates * s.pagesPerCompany) / 5) * 3;
  const crawlPer = Math.ceil(s.crawlLimit / 10) * 2 + Math.ceil(s.crawlLimit / 5);
  const stages = [
    { stage: "search", maxCredits: queries * perSearch },
    { stage: "map", maxCredits: candidates * mapPer },
    { stage: "extract", maxCredits: extract },
    { stage: "news", maxCredits: s.newsCheckTop * 2 },
    { stage: "crawl", maxCredits: s.crawlTop * crawlPer },
  ];
  const maxCredits = stages.reduce((a, b) => a + b.maxCredits, 0);
  return { stages, maxCredits, typicalCredits: Math.round(maxCredits * 0.6) };
}

export function deepDiveBounds(model: "mini" | "pro"): { min: number; max: number } {
  return RESEARCH_CREDIT_BOUNDS[model];
}
