"use client";

import { useState } from "react";
import { useAdminAction } from "../admin-client";

/** Inline monthly cap edit: number + reason, saved through the step-up-protected API. */
export function CapEditor({ id, cap }: { id: string; cap: number }) {
  const run = useAdminAction();
  const [value, setValue] = useState(String(cap));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const changed = Number(value) !== cap;

  async function save() {
    const reason = window.prompt("Reason for the new cap (saved in the audit log)");
    if (!reason || reason.trim().length < 3) return;
    setBusy(true);
    setError(null);
    try {
      await run(`/api/admin/workspaces/${id}`, { method: "PATCH", body: { monthlyCreditCap: Number(value), reason: reason.trim() } });
      window.location.reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <span className="inline-flex flex-col gap-1">
      <span className="inline-flex items-center gap-1">
        <label className="sr-only" htmlFor={`cap-${id}`}>Monthly credit cap</label>
        <input id={`cap-${id}`} type="number" min={0} max={1_000_000} step={50} value={value} onChange={(e) => setValue(e.target.value)}
          className="h-8 w-24 rounded border border-[var(--color-line)] bg-[var(--color-surface)] px-2 tabular-nums" />
        {changed && <button type="button" disabled={busy} onClick={() => void save()} className="h-8 rounded border border-[var(--color-line)] px-2 text-xs font-medium hover:bg-[var(--color-bg)]">{busy ? "Saving…" : "Save"}</button>}
      </span>
      {error && <span role="alert" className="text-xs text-red-700 dark:text-red-400">{error}</span>}
    </span>
  );
}
