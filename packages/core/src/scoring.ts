import type { Signals } from "./signals.ts";
import type { Thesis } from "./thesis.ts";

export type Answer = "yes" | "no" | "unknown";

export interface CriterionResult {
  answer: Answer;
  quote: string | null;
}

export type FitStatus =
  | "strong_fit"
  | "possible_fit"
  | "weak_fit"
  | "verify_ownership"
  | "fails_rule"
  | "no_website_text";

export interface ScoreResult {
  score: number;
  status: FitStatus;
  failedRule: string | null;
  reasons: string[];
}

export interface ScoreInput {
  hasText: boolean;
  signals: Signals;
  criteria: Record<string, CriterionResult>;
}

/**
 * Deterministic scoring. Same inputs always give the same result, so rankings are explainable.
 */
export function scoreCompany(input: ScoreInput, thesis: Thesis): ScoreResult {
  if (!input.hasText) {
    return { score: 0, status: "no_website_text", failedRule: null, reasons: ["No readable website text"] };
  }
  const reasons: string[] = [];
  let score = 0;

  const years = input.signals.yearsInBusiness;
  if (thesis.minYearsInBusiness !== null && years !== null) {
    if (years >= thesis.minYearsInBusiness) {
      score += 2;
      reasons.push(`${years} years in business`);
    } else {
      score -= 2;
      reasons.push(`Only ${years} years in business`);
    }
  }
  if (input.signals.ownershipEvidence) {
    score += 1;
    reasons.push("Ownership described on website");
  }
  if (input.signals.parentFlags.length > 0) {
    score -= 3;
    reasons.push("May belong to a larger group");
  }

  let failedRule: string | null = null;
  for (const c of thesis.criteria) {
    const answer = input.criteria[c.id]?.answer ?? "unknown";
    if (answer === "yes") score += c.weight;
    if (answer === "no" && c.required && failedRule === null) failedRule = c.id;
  }

  score = Math.round(score * 10) / 10;
  let status: FitStatus;
  if (failedRule) status = "fails_rule";
  else if (input.signals.parentFlags.length > 0) status = "verify_ownership";
  else if (score >= thesis.strongFitScore) status = "strong_fit";
  else if (score >= 2) status = "possible_fit";
  else status = "weak_fit";

  return { score, status, failedRule, reasons };
}

const STATUS_ORDER: Record<FitStatus, number> = {
  strong_fit: 0,
  possible_fit: 1,
  verify_ownership: 2,
  weak_fit: 3,
  fails_rule: 4,
  no_website_text: 5,
};

/** Stable ranking: status group, then score, then domain for ties. */
export function rankCompanies<T extends { domain: string; result: ScoreResult }>(items: T[]): T[] {
  return [...items].sort(
    (a, b) =>
      STATUS_ORDER[a.result.status] - STATUS_ORDER[b.result.status] ||
      b.result.score - a.result.score ||
      a.domain.localeCompare(b.domain),
  );
}

/** Shortlist: only companies that could be real targets, never failed or unreadable ones. */
export function pickShortlist<T extends { domain: string; result: ScoreResult }>(
  items: T[],
  size: number,
): T[] {
  return rankCompanies(items)
    .filter((i) => ["strong_fit", "possible_fit", "verify_ownership"].includes(i.result.status))
    .slice(0, size);
}
