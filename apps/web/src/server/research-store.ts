import { findSignals, scoreCompany, type NewsFlag, type ScoredCompany, type Thesis } from "@sieveline/core";
import type { FactInput, schema } from "@sieveline/db";

type CompanyRow = typeof schema.companies.$inferSelect;
type FactRow = typeof schema.facts.$inferSelect;

/** Converts a scored company into facts, each with its quote and source page. */
export function factsFor(c: ScoredCompany): FactInput[] {
  const facts: FactInput[] = [];
  const firstUrl = c.pages[0]?.url ?? null;
  if (c.signals.foundedYear !== null) {
    facts.push({ kind: "founded_year", value: String(c.signals.foundedYear), quote: c.signals.foundedEvidence, sourceUrl: pageWith(c, c.signals.foundedEvidence) ?? firstUrl });
  }
  if (c.signals.ownershipEvidence) {
    facts.push({ kind: "ownership", value: "described", quote: c.signals.ownershipEvidence, sourceUrl: pageWith(c, c.signals.ownershipEvidence) ?? firstUrl });
  }
  for (const flag of c.signals.parentFlags) {
    if (c.newsFlags.some((n) => n.quote === flag)) continue;
    facts.push({ kind: "parent_flag", value: "possible parent company", quote: flag, sourceUrl: pageWith(c, flag) ?? firstUrl });
  }
  for (const [key, r] of Object.entries(c.verified.criteria)) {
    facts.push({ kind: "criterion", key, value: r.answer, quote: r.quote, sourceUrl: r.sourceUrl });
  }
  for (const n of c.newsFlags) {
    facts.push({ kind: "news_flag", key: n.kind, value: n.title || n.kind, quote: n.quote, sourceUrl: n.url, publishedAt: n.publishedAt ? safeDate(n.publishedAt) : null });
  }
  if (c.verified.summary) facts.push({ kind: "summary", value: c.verified.summary, sourceUrl: firstUrl });
  return facts;
}

function pageWith(c: ScoredCompany, snippet: string | null): string | null {
  if (!snippet) return null;
  const probe = snippet.slice(0, 40).toLowerCase();
  return c.pages.find((p) => p.text.replace(/\s+/g, " ").toLowerCase().includes(probe))?.url ?? null;
}

function safeDate(s: string): Date | null {
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Rebuilds a scored company from stored rows so later steps (news, deep read) can continue. */
export function scoredFromRows(row: CompanyRow, facts: FactRow[], thesis: Thesis, currentYear?: number): ScoredCompany {
  const pages = (row.pages as { url: string; text: string }[]) ?? [];
  const signals = findSignals(pages.map((p) => p.text).join("\n\n"), { excludeIfMentions: thesis.excludeIfMentions, ...(currentYear ? { currentYear } : {}) });
  const criteria = Object.fromEntries(
    facts.filter((f) => f.kind === "criterion" && f.key).map((f) => [f.key!, { answer: f.value as "yes" | "no" | "unknown", quote: f.quote, sourceUrl: f.sourceUrl }]),
  );
  const newsFlags: NewsFlag[] = facts
    .filter((f) => f.kind === "news_flag")
    .map((f) => ({ kind: (f.key ?? "acquired") as NewsFlag["kind"], title: f.value, url: f.sourceUrl ?? "", quote: f.quote ?? "", publishedAt: f.publishedAt?.toISOString() ?? null }));
  const red = newsFlags.filter((n) => n.kind !== "succession").map((n) => n.quote);
  const allSignals = { ...signals, parentFlags: [...signals.parentFlags, ...red].slice(0, 5) };
  const summary = facts.find((f) => f.kind === "summary")?.value ?? null;
  const result = scoreCompany({ hasText: pages.length > 0, signals: allSignals, criteria }, thesis);
  return {
    domain: row.domain, name: row.name ?? row.domain, snippet: "", foundBy: row.foundBy ?? "", source: row.source as "search" | "seed", relevance: 0,
    pages, signals: allSignals, verified: { name: row.name, summary, criteria, notes: [], costUsd: 0 }, result, newsFlags,
  };
}
