import { normalizeForMatch } from "./text.ts";

export const MIN_QUOTE_WORDS = 3;
export const MAX_QUOTE_WORDS = 60;
/** A quoted fragment must carry at least this many letters/digits to count as evidence. */
const MIN_FRAGMENT_CHARS = 12;

export type QuoteCheck =
  | { ok: true }
  | { ok: false; reason: "empty" | "too_short" | "too_long" | "not_found" };

/**
 * Letters and digits only. Real extracted pages drop or glue punctuation and spaces
 * ("Services:" -> "services", "Equipment Services" -> "equipmentservices"), so matching is strict
 * on the words themselves but ignores formatting.
 */
function canonical(text: string): string {
  return normalizeForMatch(text).replace(/[^\p{L}\p{N}]+/gu, "");
}

/**
 * A quote is accepted only if its words appear in the source text, in order.
 * Models often join two real sentences with "..." ; each fragment must then be on the page,
 * in order, and at least one fragment must be substantial. This is the core anti-hallucination
 * rule: no real quote, no fact. Rules tuned on real data (docs/03-quality/SPIKE-M3-T10.md).
 */
export function verifyQuote(quote: string | null | undefined, sourceText: string): QuoteCheck {
  const q = normalizeForMatch(quote ?? "").replace(/^["']|["']$/g, "").trim();
  if (!q) return { ok: false, reason: "empty" };
  const words = q.split(" ").length;
  if (words < MIN_QUOTE_WORDS) return { ok: false, reason: "too_short" };
  if (words > MAX_QUOTE_WORDS) return { ok: false, reason: "too_long" };

  const page = canonical(sourceText);
  const fragments = q.split(/\s*(?:\.\.\.|…|\[\.\.\.\]|\[…\])\s*/).map(canonical).filter(Boolean);
  if (!fragments.some((f) => f.length >= MIN_FRAGMENT_CHARS)) return { ok: false, reason: "too_short" };
  let from = 0;
  for (const f of fragments) {
    const at = page.indexOf(f, from);
    if (at < 0) return { ok: false, reason: "not_found" };
    from = at + f.length;
  }
  return { ok: true };
}
