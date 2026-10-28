import { contextAround } from "./text";

const FOUNDED_RE =
  /\b(?:founded|established|incorporated|since|est\.)\s*(?:in\s+)?((?:18|19|20)\d{2})\b/gi;

const OWNERSHIP_RE =
  /\b(?:family[- ]owned|family[- ]operated|owner[- ]operated|locally owned|privately owned|privately held|independently owned|veteran[- ]owned|woman[- ]owned|women[- ]owned)\b/i;

const PARENT_RE =
  /\b(?:a portfolio company of|portfolio company|is now part of|now a part of|a subsidiary of|a division of|acquired by|joined the [A-Z][\w&.\- ]{2,40} (?:family|group|network)|backed by [A-Z][\w&.\- ]{2,40}(?:capital|partners|equity))/gi;

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
  const lower = text.toLowerCase();
  for (const name of options.excludeIfMentions ?? []) {
    const idx = lower.indexOf(name.toLowerCase());
    if (idx >= 0) parentFlags.push(contextAround(text, idx, idx + name.length));
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
