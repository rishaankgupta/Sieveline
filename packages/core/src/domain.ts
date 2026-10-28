/** Sites that list companies but are not the company itself. */
export const DIRECTORY_DOMAINS: readonly string[] = [
  "linkedin.com", "facebook.com", "instagram.com", "twitter.com", "x.com", "youtube.com",
  "yelp.com", "bbb.org", "yellowpages.com", "mapquest.com", "manta.com", "zoominfo.com",
  "dnb.com", "bloomberg.com", "crunchbase.com", "indeed.com", "glassdoor.com",
  "ziprecruiter.com", "reddit.com", "wikipedia.org", "amazon.com", "google.com",
  "thomasnet.com", "angi.com", "chamberofcommerce.com", "buzzfile.com", "opencorporates.com",
  "bizapedia.com", "pitchbook.com", "a2la.org", "nist.gov",
];

const PRIVATE_HOST =
  /^(localhost|.*\.local|.*\.internal|.*\.localhost)$|^(\d{1,3}\.){3}\d{1,3}$|^\[?[0-9a-f:]+\]?$/i;

/**
 * Normalizes a URL or bare host to a registrable-looking domain ("www." removed, lowercase).
 * Returns null for anything that is not a public hostname (IPs, localhost, internal names).
 */
export function toDomain(input: string): string | null {
  const raw = input.trim();
  if (!raw || raw.length > 2048) return null;
  let host: string;
  try {
    host = new URL(raw.includes("://") ? raw : `https://${raw}`).hostname.toLowerCase();
  } catch {
    return null;
  }
  host = host.replace(/\.$/, "");
  if (host.startsWith("www.")) host = host.slice(4);
  if (PRIVATE_HOST.test(host)) return null;
  if (!/^(?=.{3,253}$)([a-z0-9-]+\.)+[a-z]{2,}$/.test(host)) return null;
  return host;
}

export function isBlocked(domain: string, blocked: Iterable<string>): boolean {
  if (domain.endsWith(".gov") || domain.endsWith(".mil")) return true;
  for (const b of blocked) {
    if (domain === b || domain.endsWith(`.${b}`)) return true;
  }
  return false;
}
