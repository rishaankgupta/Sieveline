import { DIRECTORY_DOMAINS, isBlocked, isBlockedBrand, toDomain } from "../domain.ts";
import type { Thesis } from "../thesis.ts";
import type { SearchResult } from "../tavily/types.ts";

export interface Candidate {
  domain: string;
  name: string;
  snippet: string;
  foundBy: string;
  source: "search" | "seed";
  /** Best Tavily relevance score across queries that found it. */
  relevance: number;
}

function nameFromTitle(title: string | undefined, domain: string): string {
  const cleaned = (title ?? "").split(/\s[|\u2013\u2014-]\s/)[0]?.trim() ?? "";
  if (cleaned.length >= 2 && cleaned.length <= 80 && !/^(home|welcome|about us)$/i.test(cleaned)) return cleaned;
  return domain.split(".")[0]!.replace(/[-_]/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

export function blockedDomainsFor(thesis: Thesis, extra: readonly string[] = []): string[] {
  return [...new Set([...DIRECTORY_DOMAINS, ...thesis.excludeDomains, ...extra])];
}

/**
 * Turns search results into unique companies (one per domain), dropping directories,
 * excluded domains and government sites. When several queries find the same company,
 * the highest relevance and the first query that found it are kept.
 */
export function collectCandidates(
  batches: { query: string; results: SearchResult[] }[],
  blocked: readonly string[],
  existing: readonly Candidate[] = [],
  /** Buyer-excluded competitors: also blocks their sites in other countries (trescal.com -> trescal.dk). */
  blockedBrands: readonly string[] = [],
): Candidate[] {
  const byDomain = new Map(existing.map((c) => [c.domain, { ...c }]));
  for (const { query, results } of batches) {
    for (const r of results) {
      const domain = toDomain(r.url);
      if (!domain || isBlocked(domain, blocked) || isBlockedBrand(domain, blockedBrands)) continue;
      const score = typeof r.score === "number" ? r.score : 0;
      const prev = byDomain.get(domain);
      if (prev) {
        prev.relevance = Math.max(prev.relevance, score);
        continue;
      }
      byDomain.set(domain, {
        domain,
        name: nameFromTitle(r.title, domain),
        snippet: (r.content ?? "").slice(0, 600),
        foundBy: query,
        source: "search",
        relevance: score,
      });
    }
  }
  return [...byDomain.values()];
}

/** Seeds first (the buyer asked for them), then by relevance, then domain for stable order. */
export function capCandidates(candidates: Candidate[], max: number): Candidate[] {
  return [...candidates]
    .sort((a, b) =>
      (a.source === "seed" ? 0 : 1) - (b.source === "seed" ? 0 : 1) ||
      b.relevance - a.relevance ||
      a.domain.localeCompare(b.domain),
    )
    .slice(0, max);
}
