import { contextAround } from "./text.ts";

const FOUNDED_RE =
  /\b(?:founded|established|incorporated|since|est\.)\s*(?:in\s+)?((?:18|19|20)\d{2})\b/gi;

const OWNERSHIP_RE =
  /\b(?:family[- ]owned|family[- ]operated|owner[- ]operated|locally owned|privately owned|privately held|independently owned|veteran[- ]owned|woman[- ]owned|women[- ]owned)\b/i;

const PARENT_RE =
  /\b(?:a portfolio company of|portfolio company|is now part of|now a part of|a subsidiary of|a division of|acquired by|joined the [A-Z][\w&.\- ]{2,40} (?:family|group|network)|backed by [A-Z][\w&.\- ]{2,40}(?:capital|partners|equity))/gi;

const RELATION =
  /\b(part of|powered by|backed by|member of|acquired by|joined|subsidiary of|division of|a [\w&.\- ]{0,30} company|family of companies|brand of|owned by)\b/i;

/**
 * Finds a named owner/consolidator only when it is written as a proper name (exact case) AND a
 * relationship phrase is next to it. Real data showed why: "Accredited Labs" (a consolidator) is
 * also everyday wording ("our accredited labs"), which produced false flags on independent shops.
 */
export function namedOwnerMention(text: string, name: string): string | null {
  let from = 0;
  for (;;) {
    const idx = text.indexOf(name, from);
    if (idx < 0) return null;
    const window = text.slice(Math.max(0, idx - 60), idx + name.length + 40);
    if (RELATION.test(window)) return contextAround(text, idx, idx + name.length);
    from = idx + name.length;
  }
}

export interface Signals {
  foundedYear: number | null;
  foundedEvidence: string | null;
  yearsInBusiness: number | null;
  ownershipEvidence: string | null;
  parentFlags: string[];
}

/**
 * Rule-based signals from page text. The earliest plausible "founded/since" year wins.
 * Parent flags are hints for human review, never automatic rejections.
 */
export function findSignals(
  text: string,
  options: { excludeIfMentions?: readonly string[]; currentYear?: number } = {},
): Signals {
  const currentYear = options.currentYear ?? new Date().getUTCFullYear();
  let foundedYear: number | null = null;
  let foundedEvidence: string | null = null;

  for (const m of text.matchAll(FOUNDED_RE)) {
    const year = Number(m[1]);
    if (year >= 1850 && year <= currentYear && (foundedYear === null || year < foundedYear)) {
      foundedYear = year;
      foundedEvidence = contextAround(text, m.index, m.index + m[0].length);
    }
  }

  const own = OWNERSHIP_RE.exec(text);
  const ownershipEvidence = own ? contextAround(text, own.index, own.index + own[0].length) : null;

  const parentFlags: string[] = [];
  for (const name of options.excludeIfMentions ?? []) {
    const hit = namedOwnerMention(text, name);
    if (hit) parentFlags.push(hit);
  }
  for (const m of text.matchAll(PARENT_RE)) {
    if (parentFlags.length >= 3) break;
    parentFlags.push(contextAround(text, m.index, m.index + m[0].length));
  }

  return {
    foundedYear,
    foundedEvidence,
    yearsInBusiness: foundedYear === null ? null : currentYear - foundedYear,
    ownershipEvidence,
    parentFlags: [...new Set(parentFlags)],
  };
}
