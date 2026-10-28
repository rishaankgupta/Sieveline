/**
 * Normalizes text for quote matching: lowercase, unify quotes/dashes, collapse whitespace.
 * Page text and LLM quotes often differ only in typography; this keeps the check strict on
 * words but tolerant of formatting.
 */
export function normalizeForMatch(text: string): string {
  return text
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[\u2018\u2019\u201A\u201B\u2032]/g, "'")
    .replace(/[\u201C\u201D\u201E\u201F\u2033]/g, '"')
    .replace(/[\u2010-\u2015\u2212]/g, "-")
    .replace(/\s+/g, " ")
    .trim();
}

/** Returns surrounding context for a match, whitespace-collapsed. */
export function contextAround(text: string, start: number, end: number, pad = 120): string {
  return text
    .slice(Math.max(0, start - pad), Math.min(text.length, end + pad))
    .replace(/\s+/g, " ")
    .trim();
}
