import { normalizeForMatch } from "./text.ts";

export const MIN_QUOTE_WORDS = 3;
export const MAX_QUOTE_WORDS = 60;

export type QuoteCheck =
  | { ok: true }
  | { ok: false; reason: "empty" | "too_short" | "too_long" | "not_found" };

/**
 * A quote is accepted only if it appears in the source text (after typography normalization)
 * and has a sensible length. This is the core anti-hallucination rule: no quote, no fact.
 */
export function verifyQuote(quote: string | null | undefined, sourceText: string): QuoteCheck {
  const q = normalizeForMatch(quote ?? "").replace(/^["']|["']$/g, "").trim();
  if (!q) return { ok: false, reason: "empty" };
  const words = q.split(" ").length;
  if (words < MIN_QUOTE_WORDS) return { ok: false, reason: "too_short" };
  if (words > MAX_QUOTE_WORDS) return { ok: false, reason: "too_long" };
  return normalizeForMatch(sourceText).includes(q) ? { ok: true } : { ok: false, reason: "not_found" };
}
