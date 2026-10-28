import { z } from "zod";
import type { Thesis } from "../thesis.ts";
import type { LlmClient } from "./llm.ts";

/** Search operators and control characters are stripped so model output can't steer search syntax. */
function cleanQuery(q: string): string {
  return q
    // eslint-disable-next-line no-control-regex -- stripping control characters is the point
    .replace(/[\u0000-\u001f]/g, " ")
    .replace(/\b(site|inurl|intitle|filetype|related|cache):\S*/gi, " ")
    .replace(/["“”]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 200);
}

function dedupe(queries: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const q of queries.map(cleanQuery)) {
    const key = q.toLowerCase();
    if (q.length >= 8 && !seen.has(key)) {
      seen.add(key);
      out.push(q);
    }
  }
  return out;
}

/**
 * Deterministic baseline: every search term crossed with every place. Always runs, so a run
 * still finds companies if the LLM is unavailable.
 */
export function templateQueries(thesis: Thesis): string[] {
  const terms = thesis.searchTerms.length ? thesis.searchTerms : [thesis.name];
  const places = thesis.places.length ? thesis.places : [""];
  return dedupe(terms.flatMap((t) => places.map((p) => `${t} ${p}`)));
}

const planSchema = z.object({
  // Lenient on purpose: one bad item must not discard the whole plan; dedupe() filters items.
  queries: z.array(z.string()).max(100),
});

/**
 * Query fan-out: the LLM proposes wording a buyer wouldn't think of (synonyms, services,
 * customer industries). Templates go first so the most predictable queries are never dropped.
 */
export async function planQueries(
  thesis: Thesis,
  maxQueries: number,
  llm?: LlmClient,
): Promise<{ queries: string[]; costUsd: number }> {
  const base = templateQueries(thesis);
  if (!llm || base.length >= maxQueries) return { queries: base.slice(0, maxQueries), costUsd: 0 };
  try {
    const { value, costUsd } = await llm.json({
      task: "query_plan",
      schema: planSchema,
      system:
        "You write web search queries that find the official websites of small private companies matching an acquisition thesis. " +
        "Each query should find company homepages, not directories, news or job boards. Vary wording: synonyms, specific services, " +
        "customer industries, certifications, and the places given. No search operators. Return JSON only.",
      prompt: JSON.stringify({
        thesis: thesis.description,
        searchTerms: thesis.searchTerms,
        places: thesis.places,
        country: thesis.country,
        count: maxQueries,
      }),
      maxOutputTokens: 1500,
    });
    return { queries: dedupe([...base, ...value.queries]).slice(0, maxQueries), costUsd };
  } catch {
    return { queries: base.slice(0, maxQueries), costUsd: 0 };
  }
}
