import { toDomain } from "../domain.ts";
import type { SearchResult } from "../tavily/types.ts";

export type NewsFlagKind = "acquired" | "merger" | "lawsuit" | "ownership_change" | "closure" | "succession" | "acquirer";

const RULES: { kind: NewsFlagKind; re: RegExp }[] = [
  { kind: "acquired", re: /\b(acquired|acquires|acquisition of|has been purchased|bought by)\b/i },
  { kind: "merger", re: /\b(merger|merges with|merged with)\b/i },
  { kind: "lawsuit", re: /\b(lawsuit|sued|litigation|settlement|indicted|osha citation|recall)\b/i },
  { kind: "ownership_change", re: /\b(new owner|new ownership|under new management|private equity|portfolio company)\b/i },
  { kind: "closure", re: /\b(bankrupt(cy)?|closing its doors|shut down|liquidation|ceases operations)\b/i },
  { kind: "succession", re: /\b(retir(es|ing|ement)|succession|steps down|passes the torch)\b/i },
];

/** True when the company name is the one doing the acquiring ("Acme acquires X", "Acme has acquired X"). */
function isSubjectOfAcquisition(text: string, name: string, verbAt: number): boolean {
  const before = text.slice(Math.max(0, verbAt - name.length - 25), verbAt).toLowerCase();
  const verb = text.slice(verbAt, verbAt + 20).toLowerCase();
  if (/^acquired by|^bought by|^has been purchased/.test(verb)) return false;
  return before.includes(name.toLowerCase()) && /(acquires|acquired|has acquired|completes acquisition)/.test(text.slice(verbAt - 15, verbAt + 25).toLowerCase());
}

export interface NewsFlag {
  kind: NewsFlagKind;
  title: string;
  url: string;
  quote: string;
  publishedAt: string | null;
}

/** Search queries for one company's red-flag check (2 searches, news topic, past year). */
export function newsQueries(name: string): string[] {
  const n = name.replace(/["]/g, "").slice(0, 80);
  return [`"${n}" acquired OR merger OR "new owner"`, `"${n}" lawsuit OR bankruptcy OR retirement`];
}

/**
 * Keeps only news that names the company (or is on its own site) and matches a flag rule.
 * Each flag carries the sentence that triggered it, so the buyer can judge it.
 * "Succession" is shown as a signal, not a red flag: an owner retiring can mean a willing seller.
 * "Acquirer" (the company buys others, e.g. "JM Test Systems Acquires Alltite", found on real data)
 * is also a signal, not a red flag: it often means a growing platform, possibly investor-backed.
 */
export function classifyNews(results: readonly SearchResult[], company: { name: string; domain: string }): NewsFlag[] {
  const nameLc = company.name.toLowerCase();
  const flags: NewsFlag[] = [];
  const seen = new Set<string>();
  for (const r of results) {
    const text = `${r.title ?? ""}. ${r.content ?? ""}`;
    const mentions = text.toLowerCase().includes(nameLc) || toDomain(r.url) === company.domain;
    if (!mentions || seen.has(r.url)) continue;
    for (const rule of RULES) {
      const m = rule.re.exec(text);
      if (!m) continue;
      let kind = rule.kind;
      if (kind === "acquired" && isSubjectOfAcquisition(text, company.name, m.index)) kind = "acquirer";
      const start = Math.max(0, text.lastIndexOf(".", m.index) + 1);
      const end = text.indexOf(".", m.index + m[0].length);
      flags.push({
        kind,
        title: (r.title ?? "").slice(0, 200),
        url: r.url,
        quote: text.slice(start, end === -1 ? undefined : end + 1).trim().slice(0, 400),
        publishedAt: r.published_date ?? null,
      });
      seen.add(r.url);
      break;
    }
  }
  return flags;
}
