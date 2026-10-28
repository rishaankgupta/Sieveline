import { toDomain } from "../domain.ts";

/** Pages most likely to hold history, ownership, services and accreditation facts. */
const PRIORITY: { re: RegExp; weight: number }[] = [
  { re: /\/(about|about-us|who-we-are|our-story|company|history|our-history|profile)(\/|$|\.)/i, weight: 10 },
  { re: /\/(team|leadership|management|people|owners?|founders?|staff)(\/|$|\.)/i, weight: 8 },
  { re: /\/(accreditation|certifications?|quality|iso|scope)(\/|$|\.|-)/i, weight: 7 },
  { re: /\/(services?|capabilities|what-we-do|solutions)(\/|$|\.)/i, weight: 6 },
  { re: /\/(industries|markets|customers|clients)(\/|$|\.)/i, weight: 5 },
  { re: /\/(locations?|contact|contact-us)(\/|$|\.)/i, weight: 3 },
];
const SKIP = /\.(jpe?g|png|gif|svg|webp|mp4|zip|docx?|xlsx?)(\?|$)|\/(blog|news|tag|category|cart|checkout|login|account|wp-admin|feed)(\/|$)/i;

function normalizeUrl(u: string): string | null {
  try {
    const url = new URL(u);
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;
    url.hash = "";
    url.search = "";
    url.hostname = url.hostname.replace(/^www\./, "");
    return url.toString().replace(/\/$/, "");
  } catch {
    return null;
  }
}

/**
 * Chooses which pages of a company site to read: always the homepage, then the highest-value
 * pages from Tavily Map. Only same-site URLs are allowed, so a site can't send us elsewhere.
 */
export function pickPages(domain: string, mapped: readonly string[], max: number): string[] {
  const home = `https://${domain}`;
  const scored = new Map<string, number>();
  for (const raw of mapped) {
    const url = normalizeUrl(raw);
    if (!url || toDomain(url) !== domain || SKIP.test(url)) continue;
    const path = new URL(url).pathname;
    const weight = PRIORITY.find((p) => p.re.test(`${path}/`))?.weight ?? 0;
    if (weight === 0) continue;
    const depthPenalty = path.split("/").filter(Boolean).length - 1;
    const score = weight - depthPenalty * 0.5;
    scored.set(url, Math.max(scored.get(url) ?? -Infinity, score));
  }
  const ranked = [...scored.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].length - b[0].length || a[0].localeCompare(b[0]))
    .map(([u]) => u)
    .filter((u) => u.replace(/^https?:\/\/(www\.)?/, "") !== domain);
  return [home, ...ranked].slice(0, Math.max(1, max));
}

export const MAP_INSTRUCTIONS =
  "Find pages about the company's history, founding, ownership, leadership team, services, accreditations or certifications, industries served, and locations.";
