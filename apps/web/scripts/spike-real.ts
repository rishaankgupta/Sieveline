/**
 * M3-T10 real-data spike (no LLM yet): runs discovery + reading + rule-based signals against the
 * real Tavily API for the calibration-lab thesis, under a hard credit cap, and writes a report.
 * Usage (from apps/web, with .env.local loaded): node scripts/spike-real.ts [maxCredits]
 */
import { writeFileSync } from "node:fs";
import {
  budgetedTavily, CreditLimitReached, DEFAULT_RESEARCH_SETTINGS, findSignals, parseThesis, stageDiscover, stageRead,
  TavilyClient, type ResearchSettings,
} from "@sieveline/core";
import calibration from "../../../packages/core/templates/calibration-labs-us.json" with { type: "json" };

const cap = Number(process.argv[2] ?? 200);
const thesis = parseThesis(calibration);
const settings: ResearchSettings = { ...DEFAULT_RESEARCH_SETTINGS, maxQueries: 8, maxCandidates: 30, pagesPerCompany: 3, mapLimit: 20 };

const byEndpoint: Record<string, { calls: number; credits: number }> = {};
const client = new TavilyClient({
  apiKey: process.env.TAVILY_API_KEY!,
  environment: "development",
  onUsage: (e) => {
    const s = (byEndpoint[e.endpoint] ??= { calls: 0, credits: 0 });
    s.calls += 1;
    s.credits += e.credits;
  },
});
const tavily = budgetedTavily(client, cap);

const t0 = Date.now();
const { queries, candidates } = await stageDiscover({ tavily }, thesis, settings);
const tDiscover = Date.now() - t0;
let pages = new Map<string, { url: string; text: string }[]>();
let stopped = false;
try {
  pages = await stageRead({ tavily }, thesis, settings, candidates);
} catch (e) {
  if (!(e instanceof CreditLimitReached)) throw e;
  stopped = true;
}
const tRead = Date.now() - t0 - tDiscover;

const rows = candidates.map((c) => {
  const p = pages.get(c.domain) ?? [];
  const text = p.map((x) => x.text).join("\n\n");
  const s = findSignals(text, { excludeIfMentions: thesis.excludeIfMentions });
  return {
    domain: c.domain, name: c.name, foundBy: c.foundBy, pages: p.length, chars: text.length,
    founded: s.foundedYear, foundedEvidence: s.foundedEvidence, ownership: s.ownershipEvidence, parentFlags: s.parentFlags,
    mentionsCalibration: /calibrat/i.test(text), mentions17025: /17025/.test(text),
  };
});
const withText = rows.filter((r) => r.chars > 200);
const pct = (n: number) => (rows.length ? Math.round((n / rows.length) * 100) : 0);
const report = {
  ranAt: new Date().toISOString(),
  creditCap: cap,
  creditsSpent: tavily.spent(),
  stoppedEarly: stopped,
  byEndpoint,
  seconds: { discover: Math.round(tDiscover / 1000), read: Math.round(tRead / 1000) },
  queries,
  companies: rows.length,
  websiteTextRate: pct(withText.length),
  foundedYearRate: pct(rows.filter((r) => r.founded).length),
  ownershipWordsRate: pct(rows.filter((r) => r.ownership).length),
  parentFlagRate: pct(rows.filter((r) => r.parentFlags.length).length),
  mentionsCalibrationRate: pct(rows.filter((r) => r.mentionsCalibration).length),
  mentions17025Rate: pct(rows.filter((r) => r.mentions17025).length),
  rows,
};
writeFileSync(new URL("../../../docs/03-quality/spike-m3-t10-raw.json", import.meta.url), JSON.stringify(report, null, 2));
console.log(JSON.stringify({ ...report, rows: `${report.rows.length} rows in the raw report file` }, null, 2));
