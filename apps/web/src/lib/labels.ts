/** Status never relies on color alone: every status has a label and an icon character. */
export const FIT: Record<string, { label: string; icon: string; className: string }> = {
  strong_fit: { label: "Strong fit", icon: "●", className: "text-emerald-800 bg-emerald-50 border-emerald-200 dark:text-emerald-200 dark:bg-emerald-950 dark:border-emerald-900" },
  possible_fit: { label: "Possible fit", icon: "◐", className: "text-sky-800 bg-sky-50 border-sky-200 dark:text-sky-200 dark:bg-sky-950 dark:border-sky-900" },
  verify_ownership: { label: "Check ownership", icon: "!", className: "text-amber-900 bg-amber-50 border-amber-200 dark:text-amber-200 dark:bg-amber-950 dark:border-amber-900" },
  weak_fit: { label: "Weak fit", icon: "○", className: "text-stone-700 bg-stone-50 border-stone-200 dark:text-stone-300 dark:bg-stone-900 dark:border-stone-700" },
  fails_rule: { label: "Fails a rule", icon: "✕", className: "text-red-800 bg-red-50 border-red-200 dark:text-red-200 dark:bg-red-950 dark:border-red-900" },
  no_website_text: { label: "No website text", icon: "–", className: "text-stone-600 bg-stone-50 border-stone-200 dark:text-stone-400 dark:bg-stone-900 dark:border-stone-700" },
  unscored: { label: "Not checked", icon: "–", className: "text-stone-600 bg-stone-50 border-stone-200 dark:text-stone-400 dark:bg-stone-900 dark:border-stone-700" },
};

export const RUN_STATUS: Record<string, string> = {
  queued: "Waiting to start",
  running: "Researching",
  succeeded: "Ready",
  failed: "Failed",
  cancelled: "Cancelled",
};

export const STEP_LABEL: Record<string, string> = {
  discover: "Finding companies",
  read_score: "Reading websites and checking your rules",
  news: "Checking news for red flags",
  crawl: "Reading the best sites in depth",
};

export const NEWS_LABEL: Record<string, string> = {
  acquired: "Acquired",
  merger: "Merger",
  lawsuit: "Legal issue",
  ownership_change: "Ownership change",
  closure: "Closure",
  succession: "Owner retiring (possible seller)",
  acquirer: "Buys other companies",
};

export function formatDate(d: string | Date | null | undefined): string {
  if (!d) return "";
  return new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short" }).format(new Date(d));
}

/** Only http(s) links are ever rendered; anything else (javascript:, data:...) is dropped. */
export function safeHref(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    const u = new URL(url);
    return u.protocol === "https:" || u.protocol === "http:" ? u.toString() : null;
  } catch {
    return null;
  }
}
