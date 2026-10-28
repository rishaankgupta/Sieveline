"use client";

import { useState } from "react";
import { Alert, Button } from "@/components/ui";
import { useAdminAction } from "../admin-client";

/** Labels and help for each research setting. Ranges are enforced by the server schema. */
const FIELDS: { key: string; label: string; help: string; kind: "int" | "bool" | "depth" }[] = [
  { key: "maxQueries", label: "Searches per list", help: "1–60. Each basic search costs 1 credit.", kind: "int" },
  { key: "searchDepth", label: "Search depth", help: "Advanced costs 2 credits per search.", kind: "depth" },
  { key: "resultsPerQuery", label: "Results per search", help: "5–20. Free; more results per credit.", kind: "int" },
  { key: "maxCandidates", label: "Companies to read", help: "5–500. The biggest cost driver.", kind: "int" },
  { key: "mapLimit", label: "Pages listed per site", help: "5–100.", kind: "int" },
  { key: "mapInstructions", label: "Guide page listing to About/Services pages", help: "Doubles map cost; found About pages on 8/8 sites vs 5/8 in tests.", kind: "bool" },
  { key: "pagesPerCompany", label: "Pages read per company", help: "1–8.", kind: "int" },
  { key: "extractBatchSize", label: "Pages per read request", help: "1–20.", kind: "int" },
  { key: "newsCheckTop", label: "News check for top N", help: "0–100.", kind: "int" },
  { key: "crawlTop", label: "Deep crawl for top N", help: "0–50.", kind: "int" },
  { key: "crawlLimit", label: "Pages per deep crawl", help: "5–100.", kind: "int" },
  { key: "shortlistSize", label: "Default shortlist size", help: "3–25. A buyer's own choice overrides this.", kind: "int" },
  { key: "cacheTtlDays", label: "Reuse results for (days)", help: "0–90. Cached reads cost 0 credits.", kind: "int" },
];

export function ResearchSettingsEditor({ current, defaults, canEdit }: { current: Record<string, unknown>; defaults: Record<string, unknown>; canEdit: boolean }) {
  const run = useAdminAction();
  const [values, setValues] = useState<Record<string, unknown>>(current);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ tone: "error" | "success"; text: string } | null>(null);

  function set(key: string, v: unknown) {
    setValues((prev) => {
      const next = Object.fromEntries(Object.entries(prev).filter(([k]) => k !== key));
      return v === undefined || v === "" ? next : { ...next, [key]: v };
    });
  }

  async function save() {
    setBusy(true);
    setMsg(null);
    try {
      const { version } = await run<{ version: number }>("/api/admin/settings/research_settings", { method: "PUT", body: { value: values, note } });
      setMsg({ tone: "success", text: `Saved as version ${version}.` });
      setTimeout(() => window.location.reload(), 600);
    } catch (e) {
      setMsg({ tone: "error", text: e instanceof Error ? e.message : "Failed" });
    } finally {
      setBusy(false);
    }
  }

  const changed = JSON.stringify(values) !== JSON.stringify(current);
  return (
    <form className="mt-4 flex flex-col gap-4" onSubmit={(e) => { e.preventDefault(); void save(); }}>
      <div className="grid gap-x-6 gap-y-4 md:grid-cols-2">
        {FIELDS.map((f) => {
          const id = `rs-${f.key}`;
          const v = values[f.key];
          const overridden = v !== undefined;
          return (
            <div key={f.key} className="flex flex-col gap-1">
              <label htmlFor={id} className="text-sm font-medium">
                {f.label} {overridden ? <span className="text-xs text-amber-700 dark:text-amber-400">(set)</span> : <span className="text-xs text-[var(--color-muted)]">(default {String(defaults[f.key])})</span>}
              </label>
              {f.kind === "int" && (
                <input id={id} type="number" disabled={!canEdit} value={v === undefined ? "" : String(v)} placeholder={String(defaults[f.key])}
                  onChange={(e) => set(f.key, e.target.value === "" ? undefined : Number(e.target.value))}
                  className="h-10 rounded-lg border border-[var(--color-line)] bg-[var(--color-surface)] px-3 tabular-nums" aria-describedby={`${id}-h`} />
              )}
              {f.kind === "depth" && (
                <select id={id} disabled={!canEdit} value={v === undefined ? "" : String(v)} onChange={(e) => set(f.key, e.target.value || undefined)}
                  className="h-10 rounded-lg border border-[var(--color-line)] bg-[var(--color-surface)] px-3" aria-describedby={`${id}-h`}>
                  <option value="">Default ({String(defaults[f.key])})</option><option value="basic">basic</option><option value="advanced">advanced</option>
                </select>
              )}
              {f.kind === "bool" && (
                <select id={id} disabled={!canEdit} value={v === undefined ? "" : String(v)} onChange={(e) => set(f.key, e.target.value === "" ? undefined : e.target.value === "true")}
                  className="h-10 rounded-lg border border-[var(--color-line)] bg-[var(--color-surface)] px-3" aria-describedby={`${id}-h`}>
                  <option value="">Default ({String(defaults[f.key])})</option><option value="true">On</option><option value="false">Off</option>
                </select>
              )}
              <p id={`${id}-h`} className="text-xs text-[var(--color-muted)]">{f.help}</p>
            </div>
          );
        })}
      </div>
      {canEdit && (
        <>
          <label className="flex flex-col gap-1 text-sm font-medium">Why are you changing this?
            <input value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} required minLength={3}
              className="h-10 rounded-lg border border-[var(--color-line)] bg-[var(--color-surface)] px-3 font-normal" />
          </label>
          {msg && <Alert tone={msg.tone}>{msg.text}</Alert>}
          <div><Button type="submit" loading={busy} disabled={!changed || note.trim().length < 3}>Save new version</Button></div>
        </>
      )}
    </form>
  );
}

export function RollbackButton({ version, value }: { version: number; value: unknown }) {
  const run = useAdminAction();
  const [busy, setBusy] = useState(false);
  return (
    <Button variant="secondary" className="h-8 px-2 text-xs" loading={busy} onClick={async () => {
      if (!window.confirm(`Make version ${version} current again? This saves it as a new version.`)) return;
      setBusy(true);
      try {
        await run("/api/admin/settings/research_settings", { method: "PUT", body: { value, note: `Rollback to v${version}` } });
        window.location.reload();
      } catch (e) {
        window.alert(e instanceof Error ? e.message : "Failed");
      } finally {
        setBusy(false);
      }
    }}>Restore</Button>
  );
}

export function KillSwitch({ paused }: { paused: boolean }) {
  const run = useAdminAction();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function toggle() {
    const note = window.prompt(paused ? "Why resume research?" : "Why pause all research? (e.g. spend spike, Tavily outage)");
    if (!note || note.trim().length < 3) return;
    setBusy(true);
    setError(null);
    try {
      await run("/api/admin/settings/research_paused", { method: "PUT", body: { value: !paused, note: note.trim() } });
      window.location.reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed");
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="mt-3 flex flex-col items-start gap-2">
      <Button variant={paused ? "primary" : "secondary"} loading={busy} onClick={() => void toggle()}
        className={paused ? "" : "border-red-400 text-red-800 dark:text-red-300"}>
        {paused ? "Resume research" : "Pause all research"}
      </Button>
      {error && <Alert>{error}</Alert>}
    </div>
  );
}
