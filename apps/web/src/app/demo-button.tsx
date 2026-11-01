"use client";

import { useState } from "react";
import { api, ApiError } from "@/lib/client-api";

/** Creates a throwaway demo account with a real finished list and opens it. */
export function DemoButton() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <span className="inline-flex flex-col gap-1">
      <button
        type="button"
        disabled={busy}
        aria-busy={busy || undefined}
        onClick={async () => {
          setBusy(true);
          setError(null);
          try {
            const { runId } = await api<{ runId: string }>("/api/demo", { method: "POST", body: {} });
            window.location.assign(`/app/runs/${runId}`);
          } catch (e) {
            setError(e instanceof ApiError ? e.message : "Could not start the demo.");
            setBusy(false);
          }
        }}
        className="inline-flex h-11 items-center gap-2 rounded-lg bg-[var(--color-accent)] px-5 font-medium text-[var(--color-accent-ink)] hover:opacity-90 disabled:opacity-60"
      >
        {busy && <span aria-hidden className="size-4 animate-spin rounded-full border-2 border-current border-t-transparent" />}
        {busy ? "Opening the demo…" : "Try the demo"}
      </button>
      {error && <span role="alert" className="text-sm text-red-700 dark:text-red-400">{error}</span>}
    </span>
  );
}
