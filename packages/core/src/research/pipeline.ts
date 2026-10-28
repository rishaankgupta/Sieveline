import { findSignals, type Signals } from "../signals.ts";
import { pickShortlist, scoreCompany, type ScoreResult } from "../scoring.ts";
import type { TavilyClient } from "../tavily/client.ts";
import type { Thesis } from "../thesis.ts";
import { blockedDomainsFor, capCandidates, collectCandidates, type Candidate } from "./candidates.ts";
import type { LlmClient } from "./llm.ts";
import { classifyNews, newsQueries, type NewsFlag } from "./news.ts";
import { MAP_INSTRUCTIONS, pickPages } from "./pages.ts";
import { planQueries } from "./queries.ts";
import { shortlistReason } from "./reasons.ts";
import type { ResearchSettings } from "./settings.ts";
import { verifyCompany, type PageText, type VerifiedCompany } from "./verify.ts";

/**
 * Pipeline stages as plain functions. The Workflow layer (apps/web) calls each one as a durable
 * step and persists the result; nothing here knows about Vercel, so it can be tested and moved.
 */
export type TavilyLike = Pick<TavilyClient, "search" | "map" | "extract" | "crawl">;

export interface ScoredCompany extends Candidate {
  pages: PageText[];
  signals: Signals;
  verified: VerifiedCompany;
  result: ScoreResult;
  newsFlags: NewsFlag[];
}

/** Runs `fn` over items with at most `limit` in flight; keeps input order. */
export async function mapLimit<T, R>(items: readonly T[], limit: number, fn: (item: T, i: number) => Promise<R>): Promise<R[]> {
  const out = new Array<R>(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i]!, i);
    }
  });
  await Promise.all(workers);
  return out;
}

export function chunk<T>(items: readonly T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

// ------------------------------------------------------------------ stage 1-3: plan + discover
export async function stageDiscover(
  deps: { tavily: TavilyLike; llm?: LlmClient },
  thesis: Thesis,
  s: ResearchSettings,
  seeds: Candidate[] = [],
): Promise<{ queries: string[]; candidates: Candidate[]; llmCostUsd: number }> {
  const { queries, costUsd } = await planQueries(thesis, s.maxQueries, deps.llm);
  const blocked = blockedDomainsFor(thesis);
  const batches = await mapLimit(queries, 5, async (query) => {
    const res = await deps.tavily.search({
      query,
      search_depth: s.searchDepth,
      max_results: s.resultsPerQuery,
      chunks_per_source: 3,
      country: thesis.country,
      exclude_domains: blocked.slice(0, 150),
    });
    return { query, results: res.results };
  });
  const candidates = capCandidates(collectCandidates(batches, blocked, seeds, thesis.excludeDomains), s.maxCandidates);
  return { queries, candidates, llmCostUsd: costUsd };
}

// ------------------------------------------------------------------ stage 4-5: map + read
export async function stageRead(
  deps: { tavily: TavilyLike },
  thesis: Thesis,
  s: ResearchSettings,
  candidates: Candidate[],
): Promise<Map<string, PageText[]>> {
  const urlsByDomain = new Map<string, string[]>();
  await mapLimit(candidates, 8, async (c) => {
    try {
      const m = await deps.tavily.map({
        url: `https://${c.domain}`,
        max_depth: 2,
        limit: s.mapLimit,
        allow_external: false,
        ...(s.mapInstructions ? { instructions: MAP_INSTRUCTIONS } : {}),
      });
      urlsByDomain.set(c.domain, pickPages(c.domain, m.results, s.pagesPerCompany));
    } catch {
      urlsByDomain.set(c.domain, pickPages(c.domain, [], 1)); // homepage only
    }
  });

  const query = thesis.criteria.map((c) => c.question).join(" ").slice(0, 400);
  const allUrls = [...urlsByDomain.values()].flat();
  const pages = new Map<string, PageText[]>();
  const failed: string[] = [];
  const record = (url: string, text: string) => {
    const domain = [...urlsByDomain.entries()].find(([, us]) => us.includes(url))?.[0];
    if (domain && text.trim()) pages.set(domain, [...(pages.get(domain) ?? []), { url, text }]);
  };

  for (const batch of chunk(allUrls, s.extractBatchSize)) {
    const res = await deps.tavily.extract({ urls: batch, query, chunks_per_source: 5, extract_depth: "basic", format: "text" });
    const ok = new Set<string>();
    for (const r of res.results) {
      const url = batch.find((u) => sameUrl(u, r.url)) ?? r.url;
      ok.add(url);
      record(url, r.raw_content);
    }
    failed.push(...batch.filter((u) => !ok.has(u)));
  }
  // Escalate only what failed: advanced extraction handles tables, embedded and JS-heavy pages.
  for (const batch of chunk(failed, s.extractBatchSize)) {
    const res = await deps.tavily.extract({ urls: batch, query, chunks_per_source: 5, extract_depth: "advanced", format: "text" });
    for (const r of res.results) record(batch.find((u) => sameUrl(u, r.url)) ?? r.url, r.raw_content);
  }
  return pages;
}

function sameUrl(a: string, b: string): boolean {
  const n = (u: string) => u.replace(/^https?:\/\/(www\.)?/, "").replace(/\/$/, "").toLowerCase();
  return n(a) === n(b);
}

// ------------------------------------------------------------------ stage 6-8: signals + verify + score
export async function stageScore(
  deps: { llm?: LlmClient },
  thesis: Thesis,
  candidate: Candidate,
  pages: PageText[],
  currentYear?: number,
): Promise<ScoredCompany> {
  const text = pages.map((p) => p.text).join("\n\n");
  const signals = findSignals(text, { excludeIfMentions: thesis.excludeIfMentions, ...(currentYear ? { currentYear } : {}) });
  const verified = deps.llm
    ? await verifyCompany(deps.llm, thesis, candidate.domain, pages)
    : { name: null, summary: null, criteria: {}, notes: ["no LLM configured"], costUsd: 0 };
  const result = scoreCompany({ hasText: pages.length > 0, signals, criteria: verified.criteria }, thesis);
  return { ...candidate, name: verified.name ?? candidate.name, pages, signals, verified, result, newsFlags: [] };
}

// ------------------------------------------------------------------ stage 9: red-flag news
export async function stageNews(deps: { tavily: TavilyLike }, company: ScoredCompany): Promise<NewsFlag[]> {
  const results = await Promise.all(
    newsQueries(company.name).map((query) =>
      deps.tavily.search({ query, topic: "news", time_range: "year", max_results: 10, include_published_date: true }),
    ),
  );
  return classifyNews(results.flatMap((r) => r.results), company);
}

export function applyNewsFlags(company: ScoredCompany, flags: NewsFlag[], thesis: Thesis): ScoredCompany {
  const red = flags.filter((f) => f.kind !== "succession");
  if (!red.length) return { ...company, newsFlags: flags };
  const signals = { ...company.signals, parentFlags: [...company.signals.parentFlags, ...red.map((f) => f.quote)].slice(0, 5) };
  const result = scoreCompany({ hasText: company.pages.length > 0, signals, criteria: company.verified.criteria }, thesis);
  return { ...company, signals, result, newsFlags: flags };
}

// ------------------------------------------------------------------ stage 10: deep read (top only)
export async function stageCrawl(
  deps: { tavily: TavilyLike; llm?: LlmClient },
  thesis: Thesis,
  s: ResearchSettings,
  company: ScoredCompany,
  currentYear?: number,
): Promise<ScoredCompany> {
  const res = await deps.tavily.crawl({
    url: `https://${company.domain}`,
    instructions: `${MAP_INSTRUCTIONS} Focus on: ${thesis.criteria.map((c) => c.question).join(" ")}`.slice(0, 1000),
    max_depth: 2,
    limit: s.crawlLimit,
    allow_external: false,
    chunks_per_source: 5,
    extract_depth: "basic",
    format: "text",
    exclude_paths: ["/blog/.*", "/news/.*", "/shop/.*", "/cart.*", "/tag/.*"],
  });
  const known = new Set(company.pages.map((p) => p.url));
  const extra = res.results.filter((r) => !known.has(r.url) && r.raw_content.trim()).map((r) => ({ url: r.url, text: r.raw_content }));
  if (!extra.length) return company;
  const rescored = await stageScore(deps, thesis, company, [...company.pages, ...extra], currentYear);
  return applyNewsFlags(rescored, company.newsFlags, thesis);
}

// ------------------------------------------------------------------ stage 11: shortlist
export function buildShortlist(companies: ScoredCompany[], thesis: Thesis, size: number) {
  return pickShortlist(companies, size).map((c, i) => ({
    domain: c.domain,
    position: i + 1,
    reason: shortlistReason({ signals: c.signals, criteria: c.verified.criteria }, thesis),
  }));
}
