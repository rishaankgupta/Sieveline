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

const TITLE_PREFIX = /^(official (company )?(website|site|information)|welcome to|home|about( us)?)\s*[:|\-–—]\s*/i;

/**
 * Cleans a company name the LLM read from a website. Page titles often come back instead of
 * names ("Official Company Information: Tech Cal", "Home | Acme"). A name that shares no word
 * with the domain is probably a slogan or title ("Texas ISO 17025 Calibration Services" for
 * foxvalleymetrology.com), so it is dropped and the domain is shown instead.
 */
export function cleanCompanyName(raw: string | null | undefined, domain: string): string | null {
  if (!raw) return null;
  let name = raw.replace(/\s+/g, " ").trim().replace(TITLE_PREFIX, "");
  // Drop "| tagline" / " - tagline" tails when the head alone matches the domain.
  const head = name.split(/\s+[|–—]\s+|\s+-\s+/)[0]!.trim();
  const label = domain.toLowerCase().replace(/^www\./, "").split(".")[0]!.replace(/[^a-z0-9]/g, "");
  const shares = (s: string) =>
    s.toLowerCase().split(/[^a-z0-9]+/).some((t) => t.length >= 3 && label.includes(t)) ||
    // Initials like "JM" in jmtest.com
    s.toLowerCase().split(/[^a-z0-9]+/).some((t) => t.length === 2 && label.startsWith(t));
  if (head !== name && shares(head)) name = head;
  if (!name || name.length > 100 || !shares(name)) return null;
  return name;
}
