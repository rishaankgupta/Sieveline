"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Alert, Button } from "@/components/ui";
import { api, ApiError } from "@/lib/client-api";
import { RUN_STATUS, STEP_LABEL } from "@/lib/labels";
import { Advisor } from "./advisor";
import { CompanyCard, EvidenceDialog, FullTable } from "./results";
import type { Company, Results, RunStatus } from "./types";

const POLL_MS = 4000;

export function RunView({ runId, name, advisorEnabled, canCancel }: { runId: string; name: string; advisorEnabled: boolean; canCancel: boolean }) {
  const [status, setStatus] = useState<RunStatus | null>(null);
  const [results, setResults] = useState<Results | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<{ companyId: string; factId?: string } | null>(null);
  const [view, setView] = useState<"shortlist" | "all">("shortlist");
  const [showHidden, setShowHidden] = useState(false);
  const [advisorView, setAdvisorView] = useState<string[] | null>(null);

  const loadResults = useCallback(async () => {
    try {
      setResults(await api<Results>(`/api/runs/${runId}/results`));
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Couldn't load results.");
    }
  }, [runId]);

  useEffect(() => {
    let stop = false;
    let timer: ReturnType<typeof setTimeout>;
    const tick = async () => {
      try {
        const s = await api<RunStatus>(`/api/runs/${runId}`);
        if (stop) return;
        setStatus(s);
        if (s.status === "succeeded") await loadResults();
        else if (s.status === "queued" || s.status === "running") timer = setTimeout(tick, POLL_MS);
      } catch (e) {
        if (!stop) setError(e instanceof ApiError ? e.message : "Couldn't load this list.");
      }
    };
    void tick();
    return () => {
      stop = true;
      clearTimeout(timer);
    };
  }, [runId, loadResults]);

  const byId = useMemo(() => new Map((results?.companies ?? []).map((c) => [c.id, c])), [results]);
  const byDomain = useMemo(() => new Map((results?.companies ?? []).map((c) => [c.domain, c])), [results]);
  const slMap = useMemo(() => new Map((results?.shortlist ?? []).map((i) => [i.companyId, i])), [results]);

  const cards: Company[] = useMemo(() => {
    if (!results) return [];
    if (advisorView) return advisorView.map((d) => byDomain.get(d)).filter((c): c is Company => Boolean(c));
    return results.shortlist
      .filter((i) => showHidden || !i.hidden)
      .sort((a, b) => Number(b.pinned) - Number(a.pinned) || a.position - b.position)
      .map((i) => byId.get(i.companyId))
      .filter((c): c is Company => Boolean(c));
  }, [results, advisorView, byDomain, byId, showHidden]);

  async function patchCompany(companyId: string, body: Record<string, unknown>) {
    setError(null);
    try {
      await api(`/api/runs/${runId}/companies/${companyId}`, { method: "PATCH", body });
      await loadResults();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Couldn't save that change.");
    }
  }

  if (!status) return <p role="status" className="text-[var(--color-muted)]">{error ?? "Loading…"}</p>;

  if (status.status !== "succeeded") {
    const done = new Set(status.steps.filter((s) => s.status === "succeeded").map((s) => s.step));
    const running = new Set(status.steps.filter((s) => s.status === "running").map((s) => s.step));
    return (
      <div className="mx-auto max-w-2xl">
        <h1 className="text-2xl font-semibold">{name}</h1>
        <p className="mt-1 text-[var(--color-muted)]" role="status" aria-live="polite">
          {RUN_STATUS[status.status] ?? status.status}
          {status.creditsUsed > 0 && ` · ${Math.round(status.creditsUsed)} credits used so far`}
        </p>
        {status.status === "failed" && <div className="mt-4"><Alert>{status.error ?? "This list failed. Your reserved credits were returned."}</Alert></div>}
        {(status.status === "queued" || status.status === "running") && (
          <ol className="mt-6 flex flex-col gap-3">
            {Object.entries(STEP_LABEL).map(([key, label]) => {
              const state = done.has(key) && !running.has(key) ? "done" : running.has(key) ? "running" : "waiting";
              return (
                <li key={key} className="flex items-center gap-3">
                  <span aria-hidden className={`grid size-6 place-items-center rounded-full border text-xs ${state === "done" ? "border-[var(--color-accent)] bg-[var(--color-accent)] text-[var(--color-accent-ink)]" : "border-[var(--color-line)]"}`}>
                    {state === "done" ? "✓" : state === "running" ? <span className="size-3 animate-spin rounded-full border-2 border-current border-t-transparent" /> : ""}
                  </span>
                  <span className={state === "waiting" ? "text-[var(--color-muted)]" : ""}>{label}</span>
                  <span className="sr-only">{state}</span>
                </li>
              );
            })}
          </ol>
        )}
        <p className="mt-6 text-sm text-[var(--color-muted)]">You can leave this page. The research keeps going, and the list will be here when it&apos;s ready.</p>
        {canCancel && (status.status === "queued" || status.status === "running") && <CancelRun runId={runId} />}
      </div>
    );
  }

  if (!results) return <p role="status" className="text-[var(--color-muted)]">{error ?? "Loading results…"}</p>;

  const openCompany = open ? byId.get(open.companyId) : undefined;
  const hiddenCount = results.shortlist.filter((i) => i.hidden).length;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">{results.thesis.name}</h1>
          <p className="text-[var(--color-muted)]">
            {results.shortlist.length} shortlisted from {results.companies.length} companies checked · {Math.round(status.creditsUsed)} credits used
            {status.error && ` · ${status.error}`}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <div role="group" aria-label="View" className="inline-flex rounded-lg border border-[var(--color-line)] p-0.5">
            {(["shortlist", "all"] as const).map((v) => (
              <button key={v} type="button" aria-pressed={view === v} onClick={() => setView(v)}
                className={`rounded-md px-3 py-1.5 text-sm ${view === v ? "bg-[var(--color-accent)] text-[var(--color-accent-ink)]" : ""}`}>
                {v === "shortlist" ? "Shortlist" : `All ${results.companies.length}`}
              </button>
            ))}
          </div>
          <a href={`/api/runs/${runId}/export?scope=${view === "all" ? "all" : "shortlist"}`} className="inline-flex h-9 items-center rounded-lg border border-[var(--color-line)] bg-[var(--color-surface)] px-3 text-sm">
            Download CSV
          </a>
        </div>
      </div>

      {error && <Alert>{error}</Alert>}

      <div className={`grid gap-6 ${advisorEnabled ? "lg:grid-cols-[minmax(0,1fr)_380px]" : ""}`}>
        <div className="min-w-0">
          {view === "all" ? (
            <FullTable results={results} onOpen={(companyId) => setOpen({ companyId })} />
          ) : (
            <>
              {advisorView && (
                <div className="mb-4 flex items-center justify-between gap-3 rounded-lg border border-[var(--color-line)] bg-[var(--color-surface)] px-4 py-2 text-sm" role="status">
                  <span>Showing {cards.length} companies picked by the Advisor.</span>
                  <Button variant="secondary" onClick={() => setAdvisorView(null)}>Back to shortlist</Button>
                </div>
              )}
              {cards.length === 0 ? (
                <div className="rounded-[var(--radius-card)] border border-dashed border-[var(--color-line)] p-10 text-center">
                  <p className="font-medium">No companies on the shortlist</p>
                  <p className="mt-1 text-[var(--color-muted)]">None of the companies checked passed your must-have rules. Try the full list, or loosen a rule and run again.</p>
                </div>
              ) : (
                <ol className="flex flex-col gap-4">
                  {cards.map((c) => (
                    <CompanyCard key={c.id} company={c} item={slMap.get(c.id)} results={results}
                      onOpen={(factId) => setOpen({ companyId: c.id, ...(factId ? { factId } : {}) })}
                      onPatch={(body) => patchCompany(c.id, body)} />
                  ))}
                </ol>
              )}
              {!advisorView && hiddenCount > 0 && (
                <button type="button" onClick={() => setShowHidden((v) => !v)} className="mt-4 text-sm underline">
                  {showHidden ? "Hide hidden companies" : `Show ${hiddenCount} hidden`}
                </button>
              )}
            </>
          )}
        </div>
        {advisorEnabled && (
          <Advisor runId={runId} results={results}
            onOpenFact={(factId) => {
              const f = results.facts.find((x) => x.id === factId);
              if (f) setOpen({ companyId: f.companyId, factId });
            }}
            onActions={async (a) => {
              if (a.show.length) {
                setAdvisorView(a.show);
                setView("shortlist");
              }
              if (a.pin.length || a.hide.length) await loadResults();
            }} />
        )}
      </div>

      {openCompany && (
        <EvidenceDialog company={openCompany} results={results} focusFactId={open?.factId} onClose={() => setOpen(null)}
          onReview={(review) => patchCompany(openCompany.id, { review })} />
      )}
    </div>
  );
}

/** Stops the research. Credits already used stay charged; the rest of the hold is released. */
function CancelRun({ runId }: { runId: string }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="mt-4 flex flex-col items-start gap-2">
      <Button variant="secondary" loading={busy} onClick={async () => {
        if (!window.confirm("Stop this list? Credits already used stay charged and the rest is released. A stopped list has no shortlist.")) return;
        setBusy(true);
        setError(null);
        try {
          await api(`/api/runs/${runId}/cancel`, { method: "POST", body: {} });
          window.location.reload();
        } catch (e) {
          setError(e instanceof ApiError ? e.message : "Could not stop the list.");
          setBusy(false);
        }
      }}>Stop this list</Button>
      {error && <Alert>{error}</Alert>}
    </div>
  );
}
