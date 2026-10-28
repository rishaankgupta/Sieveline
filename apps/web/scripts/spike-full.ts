/**
 * M3-T10 part 2: the full pipeline on real data with a real LLM. Uses the Postgres response cache
 * in Neon so re-runs don't spend Tavily credits again. Writes a report for hand review.
 * Usage (from apps/web, .env.local loaded): node scripts/spike-full.ts [maxCredits] [maxCompanies]
 */
import { writeFileSync } from "node:fs";
import {
  applyNewsFlags, budgetedTavily, buildShortlist, DEFAULT_RESEARCH_SETTINGS, loadServerEnv, parseThesis, stageCrawl,
  stageDiscover, stageNews, stageRead, stageScore, TavilyClient, type LlmClient, type ResearchSettings, type ScoredCompany,
} from "@sieveline/core";
import { createDb, postgresTavilyCache } from "@sieveline/db";
import calibration from "../../../packages/core/templates/calibration-labs-us.json" with { type: "json" };
import { createLlm } from "../src/server/llm.ts";

const cap = Number(process.argv[2] ?? 150);
const maxCompanies = Number(process.argv[3] ?? 20);
const env = loadServerEnv();
const thesis = parseThesis(calibration);
const s: ResearchSettings = { ...DEFAULT_RESEARCH_SETTINGS, maxQueries: 8, maxCandidates: maxCompanies, pagesPerCompany: 3, mapLimit: 20, crawlLimit: 15 };

const credits: Record<string, number> = {};
let llmCalls = 0;
let llmCost = 0;
const base = createLlm(env);
if (!base) throw new Error("LLM not configured");
const llm: LlmClient = {
  async json(input) {
    const t = Date.now();
    const out = await base.json(input);
    llmCalls++;
    llmCost += out.costUsd;
    process.stderr.write(`  llm ${input.task} ${Math.round((Date.now() - t) / 1000)}s\n`);
    return out;
  },
};
const db = createDb(process.env.DATABASE_URL_OWNER_POOLED!); // owner: the cache table is shared platform data
const tavily = budgetedTavily(
  new TavilyClient({
    apiKey: env.TAVILY_API_KEY!, environment: "development", cache: postgresTavilyCache(db), cacheTtlSeconds: 30 * 86_400,
    onUsage: (e) => void (credits[e.endpoint] = (credits[e.endpoint] ?? 0) + e.credits),
  }),
  cap,
);

const t0 = Date.now();
const { queries, candidates } = await stageDiscover({ tavily, llm }, thesis, s);
process.stderr.write(`discovered ${candidates.length} from ${queries.length} queries\n`);
const pages = await stageRead({ tavily }, thesis, s, candidates);
process.stderr.write(`read pages for ${pages.size}\n`);
let scored: ScoredCompany[] = [];
for (const c of candidates) scored.push(await stageScore({ llm }, thesis, c, pages.get(c.domain) ?? []));
const ranked = buildShortlist(scored, thesis, 25).map((x) => x.domain);
for (const d of ranked.slice(0, 5)) {
  const i = scored.findIndex((c) => c.domain === d);
  scored[i] = applyNewsFlags(scored[i]!, await stageNews({ tavily }, scored[i]!), thesis);
}
for (const d of ranked.slice(0, 2)) {
  const i = scored.findIndex((c) => c.domain === d);
  scored[i] = await stageCrawl({ tavily, llm }, thesis, s, scored[i]!);
}
scored = [...scored];
const shortlist = buildShortlist(scored, thesis, 10);

const answers = scored.flatMap((c) => Object.entries(c.verified.criteria).map(([k, v]) => ({ k, ...v })));
const report = {
  ranAt: new Date().toISOString(),
  model: env.LLM_MODEL_SCORING,
  minutes: Math.round((Date.now() - t0) / 6000) / 10,
  creditsSpent: tavily.spent(),
  creditsByEndpoint: credits,
  llmCalls,
  llmCostUsd: llmCost,
  queries,
  companies: scored.length,
  answers: {
    total: answers.length,
    yes: answers.filter((a) => a.answer === "yes").length,
    no: answers.filter((a) => a.answer === "no").length,
    unknown: answers.filter((a) => a.answer === "unknown").length,
    droppedForBadQuote: scored.reduce((n, c) => n + c.verified.notes.filter((x) => x.includes("answer dropped")).length, 0),
    scoringFailures: scored.filter((c) => c.verified.notes.some((x) => x.startsWith("scoring failed"))).length,
  },
  shortlist,
  companiesDetail: scored.map((c) => ({
    domain: c.domain, name: c.name, status: c.result.status, score: c.result.score, summary: c.verified.summary,
    founded: c.signals.foundedYear, parentFlags: c.signals.parentFlags, news: c.newsFlags, notes: c.verified.notes,
    criteria: c.verified.criteria,
  })),
};
writeFileSync(new URL("../../../docs/03-quality/spike-m3-t10-full-raw.json", import.meta.url), JSON.stringify(report, null, 2));
console.log(JSON.stringify({ ...report, companiesDetail: `${report.companiesDetail.length} in raw file` }, null, 2));
process.exit(0);
