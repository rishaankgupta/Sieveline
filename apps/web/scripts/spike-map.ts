/**
 * Compares Tavily Map with and without natural-language instructions on the same companies:
 * do instructions change which pages we end up reading, and is that worth double the cost?
 */
import { MAP_INSTRUCTIONS, pickPages, TavilyClient } from "@sieveline/core";

const domains = process.argv.slice(2);
const credits = { with: 0, without: 0 };
const client = new TavilyClient({ apiKey: process.env.TAVILY_API_KEY!, environment: "development" });
let same = 0;
for (const d of domains) {
  const base = { url: `https://${d}`, max_depth: 2, limit: 20, allow_external: false } as const;
  const [a, b] = await Promise.all([client.map({ ...base, instructions: MAP_INSTRUCTIONS }), client.map(base)]);
  credits.with += Number(a.usage?.credits ?? 0);
  credits.without += Number(b.usage?.credits ?? 0);
  const pa = pickPages(d, a.results, 3);
  const pb = pickPages(d, b.results, 3);
  const identical = JSON.stringify(pa) === JSON.stringify(pb);
  if (identical) same++;
  console.log(`${d}\n  with:    ${pa.join("  ")}\n  without: ${pb.join("  ")}${identical ? "  (same)" : ""}`);
}
console.log(JSON.stringify({ companies: domains.length, samePagePicks: same, credits }));
