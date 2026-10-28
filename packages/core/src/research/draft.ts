import { z } from "zod";
import { thesisSchema, type Thesis } from "../thesis.ts";
import type { LlmClient } from "./llm.ts";

/**
 * Turns a buyer's plain-words description into editable rules. The draft is always re-validated
 * with the real thesis schema; anything invalid is repaired or dropped, never trusted.
 */
const draftSchema = z.object({
  name: z.string().default("New search"),
  description: z.string().default(""),
  country: z.string().default("united states"),
  places: z.array(z.string()).default([]),
  searchTerms: z.array(z.string()).default([]),
  minYearsInBusiness: z.number().nullable().default(null),
  excludeIfMentions: z.array(z.string()).default([]),
  criteria: z
    .array(z.object({ question: z.string(), label: z.string().optional(), weight: z.number().optional(), required: z.boolean().optional() }))
    .default([]),
});

const SYSTEM = [
  "You turn a business buyer's description of the kind of small company they want to acquire into search rules.",
  "searchTerms: 2-4 short phrases describing the company type as it would appear on its own website.",
  "places: states, regions or cities mentioned (empty if none). country: lowercase English country name.",
  "criteria: 3-6 yes/no questions that can be answered from a company's own website, each starting with 'Does' or 'Is'.",
  "The first criterion should check the company's main business and be required. Give each a label of 2-5 words.",
  "weight: 1-3 by importance. minYearsInBusiness only if the buyer states an age. excludeIfMentions: competitor or owner names to avoid.",
  "Return JSON only.",
].join(" ");

const slug = (s: string, i: number) =>
  (s.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").replace(/^[^a-z]+/, "").slice(0, 30) || `rule_${i + 1}`).padEnd(2, "x");

export function repairDraft(raw: z.infer<typeof draftSchema>, original: string): Thesis {
  const ids = new Set<string>();
  const criteria = raw.criteria
    .filter((c) => c.question.trim().length >= 10)
    .slice(0, 8)
    .map((c, i) => {
      let id = slug(c.label ?? c.question, i);
      while (ids.has(id)) id = `${id.slice(0, 36)}_${i}`;
      ids.add(id);
      return {
        id,
        question: c.question.trim().slice(0, 300),
        label: (c.label ?? "").trim().slice(0, 40) || undefined,
        weight: Math.min(3, Math.max(1, Math.round(c.weight ?? 1))),
        required: i === 0 ? true : Boolean(c.required),
      };
    });
  const description = raw.description.trim().length >= 20 ? raw.description.trim() : original.trim();
  const candidate = {
    name: raw.name.trim().length >= 3 ? raw.name.trim().slice(0, 120) : "New search",
    description: description.slice(0, 2000).padEnd(20, "."),
    country: raw.country.trim().toLowerCase().slice(0, 60) || "united states",
    places: raw.places.map((p) => p.trim()).filter((p) => p.length >= 2).slice(0, 20),
    searchTerms: raw.searchTerms.map((p) => p.trim()).filter((p) => p.length >= 3).slice(0, 6),
    minYearsInBusiness: raw.minYearsInBusiness && raw.minYearsInBusiness > 0 ? Math.min(200, Math.round(raw.minYearsInBusiness)) : null,
    excludeIfMentions: raw.excludeIfMentions.map((p) => p.trim()).filter((p) => p.length >= 2).slice(0, 20),
    criteria: criteria.length
      ? criteria
      : [{ id: "core_business", question: `Is the company's main business what the buyer described: ${original.slice(0, 200)}?`, label: "matches the description", weight: 3, required: true }],
  };
  return thesisSchema.parse(candidate);
}

export async function draftThesis(llm: LlmClient, description: string): Promise<{ thesis: Thesis; costUsd: number }> {
  const { value, costUsd } = await llm.json({ task: "query_plan", schema: draftSchema, system: SYSTEM, prompt: description.slice(0, 1500), maxOutputTokens: 3000 });
  return { thesis: repairDraft(value, description), costUsd };
}
