"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui";
import { FIT, formatDate, NEWS_LABEL } from "@/lib/labels";
import type { Company, Fact, Results, Review, ShortlistItem } from "./types";

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

export function FitBadge({ status }: { status: string }) {
  const f = FIT[status] ?? FIT.unscored!;
  return (
    <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium ${f.className}`}>
      <span aria-hidden>{f.icon}</span>
      {f.label}
    </span>
  );
}

function factsFor(results: Results, companyId: string): Fact[] {
  return results.facts.filter((f) => f.companyId === companyId);
}

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "") + new URL(url).pathname.replace(/\/$/, "");
  } catch {
    return url;
  }
}

export function CompanyCard({ company, item, results, onOpen, onPatch }: {
  company: Company;
  item: ShortlistItem | undefined;
  results: Results;
  onOpen: (factId?: string) => void;
  onPatch: (body: Record<string, unknown>) => Promise<void>;
}) {
  const facts = factsFor(results, company.id);
  const founded = facts.find((f) => f.kind === "founded_year");
  const yes = results.thesis.criteria
    .map((r) => ({ rule: r, fact: facts.find((f) => f.kind === "criterion" && f.key === r.id && f.value === "yes") }))
    .filter((x): x is { rule: typeof x.rule; fact: Fact } => Boolean(x.fact))
    .slice(0, 3);
  const warnings = facts.filter((f) => f.kind === "parent_flag" || (f.kind === "news_flag" && f.key !== "succession" && f.key !== "acquirer"));
  const site = safeHref(`https://${company.domain}`);

  return (
    <li className={`rounded-[var(--radius-card)] border bg-[var(--color-surface)] p-5 ${item?.pinned ? "border-[var(--color-accent)]" : "border-[var(--color-line)]"} ${item?.hidden ? "opacity-60" : ""}`}>
      <div className="flex flex-wrap items-start gap-3">
        {item && <span className="grid size-8 shrink-0 place-items-center rounded-full bg-[var(--color-bg)] text-sm font-semibold" aria-label={`Rank ${item.position}`}>{item.position}</span>}
        <div className="min-w-0 flex-1">
          <h2 className="flex flex-wrap items-center gap-2 text-lg font-semibold">
            {company.name ?? company.domain}
            <FitBadge status={company.status} />
            {item?.pinned && <span className="text-xs font-medium text-[var(--color-accent)]">Pinned</span>}
          </h2>
          {site && <a href={site} target="_blank" rel="noopener noreferrer nofollow" className="text-sm text-[var(--color-muted)] underline">{company.domain}</a>}
          {company.summary && <p className="mt-2">{company.summary}</p>}
          {item?.reason && <p className="mt-2 text-sm text-[var(--color-muted)]">{item.reason}</p>}
        </div>
      </div>

      {(founded || yes.length > 0) && (
        <ul className="mt-4 flex flex-wrap gap-2" aria-label="Key facts">
          {founded && (
            <li><button type="button" onClick={() => onOpen(founded.id)} className="rounded-md border border-[var(--color-line)] px-2.5 py-1 text-sm hover:bg-[var(--color-bg)]">Founded {founded.value} <span aria-hidden>❝</span><span className="sr-only">, see quote</span></button></li>
          )}
          {yes.map(({ rule, fact }) => (
            <li key={fact.id}><button type="button" onClick={() => onOpen(fact.id)} className="rounded-md border border-[var(--color-line)] px-2.5 py-1 text-sm hover:bg-[var(--color-bg)]">✓ {rule.label} <span aria-hidden>❝</span><span className="sr-only">, see quote</span></button></li>
          ))}
        </ul>
      )}
      {warnings.length > 0 && (
        <p className="mt-3 text-sm text-amber-900 dark:text-amber-200"><span aria-hidden>! </span>{warnings.length === 1 ? "1 thing to check" : `${warnings.length} things to check`} about ownership or news.</p>
      )}

      <div className="mt-4 flex flex-wrap gap-2">
        <Button variant="secondary" onClick={() => onOpen()}>See evidence</Button>
        {results.canEdit && (
          <>
            <Button variant="secondary" onClick={() => onPatch({ pinned: !item?.pinned })}>{item?.pinned ? "Unpin" : "Pin"}</Button>
            {item && <Button variant="secondary" onClick={() => onPatch({ hidden: !item.hidden })}>{item.hidden ? "Unhide" : "Hide"}</Button>}
          </>
        )}
      </div>
    </li>
  );
}

export function EvidenceDialog({ company, results, focusFactId, onClose, onReview }: {
  company: Company;
  results: Results;
  focusFactId: string | undefined;
  onClose: () => void;
  onReview: (review: Pick<Review, "decision" | "note">) => Promise<void>;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const facts = factsFor(results, company.id);
  const mine = results.reviews.find((r) => r.companyId === company.id);
  const [decision, setDecision] = useState<Review["decision"] | "">(mine?.decision ?? "");
  const [note, setNote] = useState(mine?.note ?? "");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const d = ref.current;
    if (d && !d.open) d.showModal();
    if (focusFactId) document.getElementById(`fact-${focusFactId}`)?.scrollIntoView({ block: "center" });
  }, [focusFactId]);

  const Quote = ({ f }: { f: Fact }) => {
    const href = safeHref(f.sourceUrl);
    return (
      <div id={`fact-${f.id}`} className={`mt-1 rounded-md p-2 text-sm ${f.id === focusFactId ? "bg-amber-50 ring-2 ring-amber-300 dark:bg-amber-950" : "bg-[var(--color-bg)]"}`}>
        {f.quote ? <blockquote className="italic">“{f.quote}”</blockquote> : <span className="text-[var(--color-muted)]">No quote</span>}
        {href && <a href={href} target="_blank" rel="noopener noreferrer nofollow" className="mt-1 block truncate text-xs underline">{hostOf(href)}</a>}
        {f.publishedAt && <span className="text-xs text-[var(--color-muted)]">{formatDate(f.publishedAt)}</span>}
      </div>
    );
  };

  return (
    <dialog ref={ref} onClose={onClose} aria-labelledby="ev-title"
      className="m-0 ml-auto h-dvh max-h-dvh w-full max-w-xl overflow-y-auto border-l border-[var(--color-line)] bg-[var(--color-surface)] p-0 text-[var(--color-ink)] backdrop:bg-black/40">
      <div className="sticky top-0 flex items-start justify-between gap-3 border-b border-[var(--color-line)] bg-[var(--color-surface)] p-5">
        <div>
          <h2 id="ev-title" className="text-lg font-semibold">{company.name ?? company.domain}</h2>
          <div className="mt-1 flex items-center gap-2 text-sm"><FitBadge status={company.status} /> <span className="text-[var(--color-muted)]">score {company.score}</span></div>
        </div>
        <Button variant="secondary" onClick={() => ref.current?.close()} aria-label="Close evidence">Close</Button>
      </div>
      <div className="flex flex-col gap-6 p-5">
        {company.summary && <p>{company.summary}</p>}

        <section aria-labelledby="ev-rules">
          <h3 id="ev-rules" className="font-medium">Your rules</h3>
          <ul className="mt-2 flex flex-col gap-3">
            {results.thesis.criteria.map((r) => {
              const f = facts.find((x) => x.kind === "criterion" && x.key === r.id);
              const answer = f?.value ?? "unknown";
              return (
                <li key={r.id}>
                  <p className="text-sm">
                    <strong>{answer === "yes" ? "✓ Yes" : answer === "no" ? "✕ No" : "? Unknown"}</strong> · {r.label}
                    {r.required && <span className="text-[var(--color-muted)]"> (must have)</span>}
                  </p>
                  {f && answer !== "unknown" ? <Quote f={f} /> : <p className="text-xs text-[var(--color-muted)]">The website didn&apos;t clearly say.</p>}
                </li>
              );
            })}
          </ul>
        </section>

        {(["founded_year", "ownership", "parent_flag", "news_flag"] as const).map((kind) => {
          const list = facts.filter((f) => f.kind === kind);
          if (!list.length) return null;
          const title = { founded_year: "Founded", ownership: "Ownership", parent_flag: "May belong to a group", news_flag: "News" }[kind];
          return (
            <section key={kind} aria-label={title}>
              <h3 className="font-medium">{title}</h3>
              <ul className="mt-2 flex flex-col gap-3">
                {list.map((f) => (
                  <li key={f.id}>
                    {kind === "founded_year" && <p className="text-sm">{f.value}</p>}
                    {kind === "news_flag" && <p className="text-sm"><strong>{NEWS_LABEL[f.key ?? ""] ?? f.key}</strong> · {f.value}</p>}
                    <Quote f={f} />
                  </li>
                ))}
              </ul>
            </section>
          );
        })}

        {results.canEdit && (
          <section aria-labelledby="ev-review" className="border-t border-[var(--color-line)] pt-5">
            <h3 id="ev-review" className="font-medium">Your review</h3>
            <fieldset className="mt-2 flex flex-wrap gap-2">
              <legend className="sr-only">Decision</legend>
              {([["approved", "Worth contacting"], ["needs_check", "Needs a check"], ["rejected", "Not a fit"]] as const).map(([v, label]) => (
                <label key={v} className={`cursor-pointer rounded-lg border px-3 py-1.5 text-sm ${decision === v ? "border-[var(--color-accent)] bg-[var(--color-bg)]" : "border-[var(--color-line)]"}`}>
                  <input type="radio" name="decision" value={v} checked={decision === v} onChange={() => setDecision(v)} className="sr-only" />
                  {label}
                </label>
              ))}
            </fieldset>
            <label htmlFor="ev-note" className="mt-3 block text-sm font-medium">Note</label>
            <textarea id="ev-note" rows={3} maxLength={1000} value={note} onChange={(e) => setNote(e.target.value)}
              className="mt-1 w-full rounded-lg border border-[var(--color-line)] bg-[var(--color-surface)] p-2 outline-none focus:border-[var(--color-accent)]" />
            <Button className="mt-2" disabled={!decision} loading={saving}
              onClick={async () => { setSaving(true); await onReview({ decision: decision as Review["decision"], note: note.trim() || null }); setSaving(false); }}>
              Save review
            </Button>
          </section>
        )}
      </div>
    </dialog>
  );
}

export function FullTable({ results, onOpen }: { results: Results; onOpen: (companyId: string) => void }) {
  const [filter, setFilter] = useState("");
  const [status, setStatus] = useState("all");
  const founded = useMemo(() => new Map(results.facts.filter((f) => f.kind === "founded_year").map((f) => [f.companyId, f.value])), [results]);
  const position = useMemo(() => new Map(results.shortlist.map((i) => [i.companyId, i.position])), [results]);
  const rows = useMemo(
    () =>
      results.companies
        .filter((c) => status === "all" || c.status === status)
        .filter((c) => !filter || `${c.name} ${c.domain}`.toLowerCase().includes(filter.toLowerCase()))
        .sort((a, b) => b.score - a.score || a.domain.localeCompare(b.domain)),
    [results, filter, status],
  );
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-3">
        <label className="flex flex-col gap-1 text-sm font-medium">Search
          <input value={filter} onChange={(e) => setFilter(e.target.value)} className="h-10 rounded-lg border border-[var(--color-line)] bg-[var(--color-surface)] px-3 font-normal" />
        </label>
        <label className="flex flex-col gap-1 text-sm font-medium">Fit
          <select value={status} onChange={(e) => setStatus(e.target.value)} className="h-10 rounded-lg border border-[var(--color-line)] bg-[var(--color-surface)] px-3 font-normal">
            <option value="all">All</option>
            {Object.entries(FIT).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
          </select>
        </label>
        <p className="self-end text-sm text-[var(--color-muted)]" aria-live="polite">{rows.length} companies</p>
      </div>
      <div className="overflow-x-auto rounded-[var(--radius-card)] border border-[var(--color-line)] bg-[var(--color-surface)]">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-[var(--color-line)] text-[var(--color-muted)]">
            <tr><th scope="col" className="px-4 py-2">Company</th><th scope="col" className="px-4 py-2">Fit</th><th scope="col" className="px-4 py-2">Score</th><th scope="col" className="px-4 py-2">Founded</th><th scope="col" className="px-4 py-2">Shortlist</th></tr>
          </thead>
          <tbody className="divide-y divide-[var(--color-line)]">
            {rows.map((c) => (
              <tr key={c.id} className="hover:bg-[var(--color-bg)]">
                <td className="px-4 py-2">
                  <button type="button" onClick={() => onOpen(c.id)} className="text-left font-medium underline-offset-2 hover:underline">{c.name ?? c.domain}</button>
                  <div className="text-xs text-[var(--color-muted)]">{c.domain}</div>
                </td>
                <td className="px-4 py-2"><FitBadge status={c.status} /></td>
                <td className="px-4 py-2 tabular-nums">{c.score}</td>
                <td className="px-4 py-2 tabular-nums">{founded.get(c.id) ?? "—"}</td>
                <td className="px-4 py-2">{position.has(c.id) ? `#${position.get(c.id)}` : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
