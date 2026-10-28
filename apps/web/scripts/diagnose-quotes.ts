/**
 * Re-scores a few companies (Tavily reads come from the cache) and prints every dropped quote with
 * the closest matching text on the page, to see why quotes fail verification.
 */
import { DEFAULT_RESEARCH_SETTINGS, loadServerEnv, normalizeForMatch, parseThesis, stageRead, stageScore, TavilyClient } from "@sieveline/core";
import { createDb, postgresTavilyCache } from "@sieveline/db";
import calibration from "../../../packages/core/templates/calibration-labs-us.json" with { type: "json" };
import { createLlm } from "../src/server/llm.ts";

const env = loadServerEnv();
const thesis = parseThesis(calibration);
const s = { ...DEFAULT_RESEARCH_SETTINGS, pagesPerCompany: 3, mapLimit: 20 };
const db = createDb(process.env.DATABASE_URL_OWNER_POOLED!);
const tavily = new TavilyClient({ apiKey: env.TAVILY_API_KEY!, environment: "development", cache: postgresTavilyCache(db), cacheTtlSeconds: 30 * 86_400 });
const llm = createLlm(env)!;
const candidates = process.argv.slice(2).map((domain) => ({ domain, name: domain, snippet: "", foundBy: "", source: "seed" as const, relevance: 1 }));
const pages = await stageRead({ tavily }, thesis, s, candidates);
for (const c of candidates) {
  const p = pages.get(c.domain) ?? [];
  const scored = await stageScore({ llm }, thesis, c, p);
  const all = normalizeForMatch(p.map((x) => x.text).join(" "));
  for (const n of scored.verified.notes.filter((x) => x.includes("dropped"))) {
    const quote = n.match(/: "(.*)"$/)?.[1] ?? "";
    const q = normalizeForMatch(quote);
    // longest prefix of the quote that does appear on the page
    let k = q.length;
    while (k > 10 && !all.includes(q.slice(0, k))) k -= 5;
    const at = all.indexOf(q.slice(0, k));
    console.log(`\n${c.domain} ${n.split(":")[0]}\n  model : ${quote}\n  page  : ${at >= 0 ? all.slice(at, at + 200) : "(no 10+ char prefix found)"}`);
  }
}
process.exit(0);
