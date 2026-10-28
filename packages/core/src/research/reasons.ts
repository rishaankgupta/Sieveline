import type { CriterionResult } from "../scoring.ts";
import type { Signals } from "../signals.ts";
import type { Thesis } from "../thesis.ts";

export interface ReasonInput {
  signals: Signals;
  criteria: Record<string, CriterionResult>;
}

/**
 * One-line shortlist reason built only from verified facts (no LLM), so every word on the
 * shortlist card can be traced to a quote. Uses the highest-weight "yes" rules first.
 */
export function shortlistReason(input: ReasonInput, thesis: Thesis): string {
  const parts: string[] = [];
  if (input.signals.yearsInBusiness !== null) parts.push(`${input.signals.yearsInBusiness} years in business`);
  if (input.signals.ownershipEvidence) {
    const m = input.signals.ownershipEvidence.match(/family[- ]owned|owner[- ]operated|privately (owned|held)|independently owned|veteran[- ]owned|wom[ae]n[- ]owned|locally owned|family[- ]operated/i);
    if (m) parts.push(m[0].toLowerCase());
  }
  const yes = thesis.criteria
    .filter((c) => input.criteria[c.id]?.answer === "yes")
    .sort((a, b) => b.weight - a.weight)
    .slice(0, 3)
    .map((c) => labelFor(c.question));
  parts.push(...yes);
  if (input.signals.parentFlags.length) parts.push("check ownership: may belong to a group");
  const text = parts.join(" · ");
  return text ? text.charAt(0).toUpperCase() + text.slice(1) : "Matches the search, few facts confirmed yet";
}

/** Short label from a rule question: "Does the site say it is ISO 17025 accredited?" -> "ISO 17025 accredited". */
export function labelFor(question: string): string {
  return question
    .replace(/\?$/, "")
    .replace(/^(does|is|do|has|are)\s+(the\s+)?(site|text|company|it)\s+(say\s+)?(that\s+)?(the\s+company\s+)?(is\s+|offer\s+|serve\s+|have\s+)?/i, "")
    .replace(/\s*\(.*?\)\s*/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 60);
}
