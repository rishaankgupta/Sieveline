"use client";

import { useCallback, useEffect, useState } from "react";
import { Alert, Button } from "@/components/ui";
import { api, ApiError } from "@/lib/client-api";
import { formatDate, safeHref } from "@/lib/labels";

interface Dossier {
  overview: string;
  founded_year: string;
  owners: string[];
  family_or_founder_owned: "yes" | "no" | "unknown";
  part_of_larger_group: "yes" | "no" | "unknown";
  ownership_notes: string;
  leadership: { name: string; role: string }[];
  employees: string;
  locations: string[];
  services: string[];
  customers_and_markets: string[];
  certifications: string[];
  succession_signals: string[];
  risks: string[];
  recent_news: { date: string; headline: string }[];
  questions_for_owner: string[];
}
type Content = { kind: "structured"; dossier: Dossier } | { kind: "report"; report: string };
interface DeepDive {
  id: string;
  status: "queued" | "running" | "succeeded" | "failed" | "cancelled";
  model: string;
  content: Content | null;
  sources: { url: string; title: string }[] | null;
  error: string | null;
  creditsUsed: number;
  createdAt: string;
  finishedAt: string | null;
}
interface Option { model: "mini" | "pro"; minCredits: number; maxCredits: number; maxUsd: number }
interface State { deepDive: DeepDive | null; options: Option[]; canStart: boolean }

const MODEL_LABEL = { mini: "Standard", pro: "Thorough" } as const;
const POLL_MS = 5000;

/** Deep dive for one company: cost confirmation, live status, and the dossier with its sources. */
export function DeepDivePanel({ runId, companyId }: { runId: string; companyId: string }) {
  const path = `/api/runs/${runId}/companies/${companyId}/deep-dive`;
  const [state, setState] = useState<State | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<Option | null>(null);
  const [starting, setStarting] = useState(false);

  const load = useCallback(async () => {
    try {
      setState(await api<State>(path));
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not load the deep dive.");
    }
  }, [path]);

  useEffect(() => { void load(); }, [load]);

  const active = state?.deepDive && (state.deepDive.status === "queued" || state.deepDive.status === "running");
  useEffect(() => {
    if (!active) return;
    const t = setInterval(() => { void load(); }, POLL_MS);
    return () => clearInterval(t);
  }, [active, load]);

  async function startDive(o: Option) {
    setStarting(true);
    setError(null);
    try {
      await api(path, { body: { model: o.model, confirmMaxCredits: o.maxCredits } });
      setConfirming(null);
      await load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not start the deep dive.");
    } finally {
      setStarting(false);
    }
  }

  if (!state) return <section aria-label="Deep dive" className="text-sm text-[var(--color-muted)]">{error ?? "Loading deep dive…"}</section>;
  const d = state.deepDive;

  return (
    <section aria-labelledby="dd-title" className="border-t border-[var(--color-line)] pt-5">
      <h3 id="dd-title" className="font-medium">Deep dive</h3>
      {error && <div className="mt-2"><Alert>{error}</Alert></div>}

      {active && (
        <p className="mt-2 flex items-center gap-2 text-sm" role="status">
          <span aria-hidden className="size-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
          Researching the web for this company. This can take several minutes; you can close this panel and come back.
        </p>
      )}

      {d?.status === "failed" && (
        <div className="mt-2"><Alert>{d.error ?? "The deep dive failed."} {d.creditsUsed > 0 && `Credits charged: ${d.creditsUsed}.`}</Alert></div>
      )}

      {d?.status === "succeeded" && d.content && (
        <div className="mt-3 flex flex-col gap-4">
          <p className="rounded-md bg-amber-50 p-2 text-xs text-amber-900 dark:bg-amber-950 dark:text-amber-100">
            Written by Tavily&apos;s research agent from the sources below. Unlike the facts above, Sieveline has not checked these
            word for word. Confirm anything important at the source.
          </p>
          {d.content.kind === "structured" ? <DossierView d={d.content.dossier} /> : <p className="whitespace-pre-wrap text-sm">{d.content.report}</p>}
          <Sources sources={d.sources ?? []} />
          <p className="text-xs text-[var(--color-muted)]">
            {MODEL_LABEL[d.model as "mini" | "pro"] ?? d.model} research · {d.creditsUsed} credits · {formatDate(d.finishedAt ?? d.createdAt)}
          </p>
        </div>
      )}

      {!active && state.canStart && state.options.length > 0 && (
        <div className="mt-3">
          {!confirming ? (
            <div className="flex flex-col gap-2">
              {!d && <p className="text-sm text-[var(--color-muted)]">Search the wider web for owners, leadership, size, news and risks.</p>}
              <div className="flex flex-wrap gap-2">
                {state.options.map((o) => (
                  <Button key={o.model} variant="secondary" onClick={() => setConfirming(o)}>
                    {d ? "Run again" : "Start deep dive"}{state.options.length > 1 ? ` (${MODEL_LABEL[o.model]})` : ""}
                  </Button>
                ))}
              </div>
            </div>
          ) : (
            <div className="rounded-lg border border-[var(--color-line)] p-3 text-sm" role="group" aria-labelledby="dd-confirm">
              <p id="dd-confirm">
                This uses <strong>{confirming.minCredits}–{confirming.maxCredits} credits</strong> (up to about ${confirming.maxUsd.toFixed(2)}).
                We hold {confirming.maxCredits} credits until it finishes and then charge only what Tavily reports.
              </p>
              <div className="mt-3 flex gap-2">
                <Button loading={starting} onClick={() => void startDive(confirming)}>Confirm, up to {confirming.maxCredits} credits</Button>
                <Button variant="secondary" onClick={() => setConfirming(null)} disabled={starting}>Cancel</Button>
              </div>
            </div>
          )}
        </div>
      )}
    </section>
  );
}

const TRI = { yes: "Yes", no: "No", unknown: "Unknown" } as const;

function List({ title, items }: { title: string; items: string[] }) {
  if (!items.length) return null;
  return (
    <div>
      <h4 className="text-sm font-medium">{title}</h4>
      <ul className="mt-1 list-disc pl-5 text-sm">{items.map((x, i) => <li key={i}>{x}</li>)}</ul>
    </div>
  );
}

function DossierView({ d }: { d: Dossier }) {
  const facts: [string, string][] = [
    ["Founded", d.founded_year],
    ["Employees", d.employees],
    ["Founder or family owned", TRI[d.family_or_founder_owned]],
    ["Part of a larger group", TRI[d.part_of_larger_group]],
  ];
  return (
    <div className="flex flex-col gap-4">
      {d.overview && <p className="text-sm">{d.overview}</p>}
      <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
        {facts.map(([k, v]) => (
          <div key={k}><dt className="text-[var(--color-muted)]">{k}</dt><dd>{v || "Unknown"}</dd></div>
        ))}
      </dl>
      <List title="Owners" items={d.owners} />
      {d.ownership_notes && d.ownership_notes !== "unknown" && <p className="text-sm">{d.ownership_notes}</p>}
      <List title="Leadership" items={d.leadership.map((p) => (p.role ? `${p.name}, ${p.role}` : p.name))} />
      <List title="Locations" items={d.locations} />
      <List title="Services" items={d.services} />
      <List title="Customers and markets" items={d.customers_and_markets} />
      <List title="Certifications" items={d.certifications} />
      <List title="Signs the owner may sell" items={d.succession_signals} />
      <List title="Risks" items={d.risks} />
      <List title="Recent news" items={d.recent_news.map((n) => (n.date ? `${n.date}: ${n.headline}` : n.headline))} />
      <List title="Questions to ask the owner" items={d.questions_for_owner} />
    </div>
  );
}

function Sources({ sources }: { sources: { url: string; title: string }[] }) {
  const safe = sources.map((s) => ({ ...s, href: safeHref(s.url) })).filter((s) => s.href);
  if (!safe.length) return <p className="text-sm text-[var(--color-muted)]">No sources were returned.</p>;
  return (
    <div>
      <h4 className="text-sm font-medium">Sources</h4>
      <ol className="mt-1 list-decimal pl-5 text-sm">
        {safe.map((s) => (
          <li key={s.href}>
            <a href={s.href!} target="_blank" rel="noopener noreferrer nofollow" className="break-all underline">{s.title || new URL(s.href!).hostname}</a>
          </li>
        ))}
      </ol>
    </div>
  );
}
