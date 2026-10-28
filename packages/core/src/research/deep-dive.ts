import { z } from "zod";
import { RESEARCH_CREDIT_BOUNDS } from "../tavily/credits.ts";
import type { ResearchRequest, ResearchStatus } from "../tavily/types.ts";
import type { Thesis } from "../thesis.ts";

/**
 * Deep dive (M5-T05): one Tavily Research task about one company, asked for a fixed set of
 * fields (output_schema) and given what Sieveline already verified as an attached file, so the
 * agent builds on known facts instead of re-finding them.
 *
 * Unlike shortlist facts, dossier fields are written by Tavily's agent and are NOT quote-checked
 * by Sieveline. The UI must say so and show the sources.
 */

export type DeepDiveModel = "mini" | "pro";

/** Worst-case reservation for a model (Tavily's documented upper bound). */
export function deepDiveReserve(model: DeepDiveModel): number {
  return RESEARCH_CREDIT_BOUNDS[model].max;
}

/** Models whose worst case fits under the per-deep-dive ceiling set by the operator. */
export function allowedDeepDiveModels(maxCredits: number): DeepDiveModel[] {
  return (["mini", "pro"] as const).filter((m) => deepDiveReserve(m) <= maxCredits);
}

const str = (description: string) => ({ type: "string", description });
const list = (description: string) => ({ type: "array", items: { type: "string" }, description });
const tri = (description: string) => ({ type: "string", enum: ["yes", "no", "unknown"], description });

/** Sent to Tavily as `output_schema`. Descriptions follow Tavily's guidance: 1-3 exact sentences. */
export const DOSSIER_OUTPUT_SCHEMA = {
  properties: {
    overview: str("Two to four plain sentences: what the company does, for whom, and where. No marketing language."),
    founded_year: str("Four-digit year the company was founded, or 'unknown' if no source states it."),
    owners: list("Names of current owners or principals, as stated by a source. Empty if no source names them."),
    family_or_founder_owned: tri("Whether a source indicates the company is still owned by its founder or founding family."),
    part_of_larger_group: tri("Whether a source indicates the company is a subsidiary, division or portfolio company of another business."),
    ownership_notes: str("One or two sentences on ownership and any parent company, citing what the source says. 'unknown' if nothing found."),
    leadership: {
      type: "array",
      description: "Key people with their role, as stated by a source.",
      items: { type: "object", properties: { name: str("Person's name."), role: str("Their title or role.") } },
    },
    employees: str("Employee count or range as stated by a source (e.g. '25-50'), or 'unknown'."),
    locations: list("Cities or sites where the company operates."),
    services: list("Main services or products, one short phrase each."),
    customers_and_markets: list("Industries or named customers the company serves, one short phrase each."),
    certifications: list("Accreditations, certifications or licenses held, one each."),
    succession_signals: list("Facts suggesting an owner may want to sell or retire (age, tenure, stated plans, hiring a successor). Each one short sentence."),
    risks: list("Facts that could worry a buyer (lawsuits, recalls, lost accreditation, layoffs, customer concentration). Each one short sentence."),
    recent_news: {
      type: "array",
      description: "News about the company from the last three years, newest first.",
      items: { type: "object", properties: { date: str("Publication date, YYYY-MM if known."), headline: str("Headline or one-line summary.") } },
    },
    questions_for_owner: list("Up to five questions a buyer should ask the owner, based on gaps or concerns found."),
  },
  required: ["overview", "owners", "family_or_founder_owned", "part_of_larger_group", "services"],
} as const satisfies NonNullable<ResearchRequest["output_schema"]>;

// Lenient parsing: a field that comes back malformed is dropped, not the whole dossier.
const text = (max: number) => z.string().catch("").transform((s) => s.trim().slice(0, max));
const texts = (maxItems: number, maxLen = 300) =>
  z.array(z.unknown()).catch([]).transform((a) =>
    a.filter((x): x is string => typeof x === "string" && x.trim().length > 0).slice(0, maxItems).map((x) => x.trim().slice(0, maxLen)),
  );
const triState = z.enum(["yes", "no", "unknown"]).catch("unknown");

export const dossierSchema = z.object({
  overview: text(1500).default(""),
  founded_year: text(20).default(""),
  owners: texts(10, 120).default([]),
  family_or_founder_owned: triState.default("unknown"),
  part_of_larger_group: triState.default("unknown"),
  ownership_notes: text(800).default(""),
  leadership: z
    .array(z.object({ name: text(120), role: text(120) }).catch({ name: "", role: "" }))
    .catch([])
    .default([])
    .transform((a) => a.filter((p) => p.name).slice(0, 15)),
  employees: text(60).default(""),
  locations: texts(20, 120).default([]),
  services: texts(20).default([]),
  customers_and_markets: texts(20).default([]),
  certifications: texts(20, 160).default([]),
  succession_signals: texts(10).default([]),
  risks: texts(10).default([]),
  recent_news: z
    .array(z.object({ date: text(20), headline: text(300) }).catch({ date: "", headline: "" }))
    .catch([])
    .default([])
    .transform((a) => a.filter((n) => n.headline).slice(0, 10)),
  questions_for_owner: texts(5).default([]),
});
export type Dossier = z.infer<typeof dossierSchema>;

/** What a deep dive stores: structured fields, or the plain report if Tavily returned text. */
export type DeepDiveContent = { kind: "structured"; dossier: Dossier } | { kind: "report"; report: string };

export interface DeepDiveSource {
  url: string;
  title: string;
}

export interface KnownFact {
  kind: string;
  key: string | null;
  value: string;
  quote: string | null;
  sourceUrl: string | null;
}

const oneLine = (s: string, max: number) => s.replace(/[\r\n\t]+/g, " ").replace(/\s+/g, " ").trim().slice(0, max);

/** Markdown file of what Sieveline already verified, attached to the Research request. */
export function evidenceFile(company: { domain: string; name: string | null }, thesis: Thesis, facts: KnownFact[]): string {
  const lines = [`# Verified so far: ${oneLine(company.name ?? company.domain, 120)} (${company.domain})`, ""];
  lines.push("Quotes below were checked word for word against the cited page.", "");
  for (const c of thesis.criteria) {
    const f = facts.find((x) => x.kind === "criterion" && x.key === c.id);
    lines.push(`- ${oneLine(c.question, 300)} -> ${f?.value ?? "unknown"}`);
    if (f?.quote) lines.push(`  - "${oneLine(f.quote, 400)}" (${f.sourceUrl ?? "no url"})`);
  }
  for (const f of facts.filter((x) => x.kind !== "criterion").slice(0, 30)) {
    lines.push(`- ${f.kind}${f.key ? ` (${f.key})` : ""}: ${oneLine(f.value, 300)}`);
    if (f.quote) lines.push(`  - "${oneLine(f.quote, 400)}" (${f.sourceUrl ?? "no url"})`);
  }
  return lines.join("\n");
}

/** Builds the Research request. Company text came from websites, so it is flattened and capped. */
export function buildDeepDiveRequest(input: {
  company: { domain: string; name: string | null };
  thesis: Thesis;
  facts: KnownFact[];
  model: DeepDiveModel;
}): ResearchRequest {
  const name = oneLine(input.company.name ?? input.company.domain, 120);
  const goal = oneLine(input.thesis.description, 600);
  const prompt = [
    `Due-diligence brief on the company ${name} (website ${input.company.domain}) for a buyer who may want to acquire it.`,
    `The buyer is looking for: ${goal}`,
    "Find who owns and runs it, whether it is independent or part of a group, its size, services, customers, certifications, recent news, and any signs the owner may want to sell or retire.",
    "The attached file lists facts already verified from the company's own website; build on them and point out anything that contradicts them.",
    "Use only what sources state. Write 'unknown' when no source says something. Do not guess names, numbers or dates.",
  ].join("\n");
  return {
    input: prompt,
    model: input.model,
    output_schema: DOSSIER_OUTPUT_SCHEMA as unknown as NonNullable<ResearchRequest["output_schema"]>,
    citation_format: "numbered",
    include_domains: [input.company.domain],
    files: [{ name: "verified-facts.md", data: Buffer.from(evidenceFile(input.company, input.thesis, input.facts), "utf8").toString("base64") }],
  };
}

function safeUrl(u: unknown): string | null {
  if (typeof u !== "string" || u.length > 2048) return null;
  try {
    const url = new URL(u);
    return url.protocol === "https:" || url.protocol === "http:" ? url.toString() : null;
  } catch {
    return null;
  }
}

/** Turns a completed Research response into what we store. Credits are null if Tavily didn't say. */
export function parseDeepDiveResult(res: Extract<ResearchStatus, { status: "completed" }>): {
  content: DeepDiveContent;
  sources: DeepDiveSource[];
  credits: number | null;
} {
  let content: DeepDiveContent;
  let raw: unknown = res.content;
  if (typeof raw === "string") {
    try {
      const parsed: unknown = JSON.parse(raw);
      if (parsed && typeof parsed === "object") raw = parsed;
    } catch {
      // plain report text
    }
  }
  if (raw && typeof raw === "object" && !Array.isArray(raw)) {
    content = { kind: "structured", dossier: dossierSchema.parse(raw) };
  } else {
    content = { kind: "report", report: String(res.content ?? "").slice(0, 40_000) };
  }
  const seen = new Set<string>();
  const sources: DeepDiveSource[] = [];
  for (const s of res.sources ?? []) {
    const url = safeUrl((s as { url?: unknown }).url);
    if (!url || seen.has(url)) continue;
    seen.add(url);
    const title = (s as { title?: unknown }).title;
    sources.push({ url, title: typeof title === "string" ? oneLine(title, 200) : "" });
    if (sources.length >= 60) break;
  }
  const c = Number((res.usage as { credits?: unknown } | undefined)?.credits);
  return { content, sources, credits: Number.isFinite(c) && c >= 0 ? c : null };
}
