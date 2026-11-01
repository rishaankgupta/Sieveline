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

/**
 * Tidies an excerpt cut from a longer text so it starts and ends on a sentence or word boundary.
 * Only removes characters from the ends, so the result is still a verbatim piece of the text.
 * `cutStart`/`cutEnd` say whether the excerpt was cut there (then "…" marks the cut).
 */
export function tidyExcerpt(excerpt: string, cutStart: boolean, cutEnd: boolean, keepFrom = 0, keepTo = excerpt.length): string {
  let a = 0;
  let b = excerpt.length;
  if (cutStart) {
    // Start at the last sentence boundary before the part we must keep, else after the first partial word.
    const head = excerpt.slice(0, keepFrom);
    const sentence = Math.max(head.lastIndexOf(". "), head.lastIndexOf("! "), head.lastIndexOf("? "));
    if (sentence >= 0) a = sentence + 2;
    else {
      const space = excerpt.indexOf(" ");
      a = space >= 0 && space < keepFrom ? space + 1 : 0;
    }
  }
  if (cutEnd) {
    const tail = excerpt.slice(keepTo);
    const end = tail.search(/[.!?](\s|$)/);
    if (end >= 0) b = keepTo + end + 1;
    else {
      const space = excerpt.lastIndexOf(" ");
      b = space > keepTo ? space : excerpt.length;
    }
  }
  const core = excerpt.slice(a, b).trim();
  const openCut = cutStart && !/^[A-Z0-9"“(]/.test(core);
  const endCut = cutEnd && !/[.!?"”)]$/.test(core);
  return `${openCut ? "…" : ""}${core}${endCut ? "…" : ""}`;
}

/** Surrounding context for a match, whitespace-collapsed, trimmed to sentence or word boundaries. */
export function contextAround(text: string, start: number, end: number, pad = 120): string {
  const a = Math.max(0, start - pad);
  const b = Math.min(text.length, end + pad);
  const raw = text.slice(a, b);
  // Collapse whitespace while tracking where the match sits in the collapsed string.
  const before = raw.slice(0, start - a).replace(/\s+/g, " ");
  const match = raw.slice(start - a, end - a).replace(/\s+/g, " ");
  const after = raw.slice(end - a).replace(/\s+/g, " ");
  const joined = `${before}${match}${after}`;
  const lead = joined.length - joined.trimStart().length;
  return tidyExcerpt(joined.trim(), a > 0, b < text.length, Math.max(0, before.length - lead), Math.max(0, before.length + match.length - lead));
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
