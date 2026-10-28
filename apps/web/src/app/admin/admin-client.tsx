"use client";

import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from "react";
import { Alert, Button, Field } from "@/components/ui";
import { api, ApiError } from "@/lib/client-api";

/**
 * Admin actions go through `useAdminAction()`. When the server answers "step_up_required", a
 * dialog asks for a fresh authenticator code, then the action is retried once. The code is sent
 * only to /api/admin/step-up and never kept in the page.
 */
type Run = <T>(path: string, init: { method: string; body?: unknown }) => Promise<T>;
const Ctx = createContext<Run | null>(null);

class StepUpCancelled extends Error {}

export function AdminActions({ children }: { children: ReactNode }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const pending = useRef<{ resolve: () => void; reject: (e: Error) => void } | null>(null);
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const askForCode = useCallback(
    () =>
      new Promise<void>((resolve, reject) => {
        pending.current = { resolve, reject };
        setCode("");
        setError(null);
        dialog.current?.showModal();
      }),
    [],
  );

  const run: Run = useCallback(
    async <T,>(path: string, init: { method: string; body?: unknown }) => {
      const call = () => api<T>(path, init);
      try {
        return await call();
      } catch (e) {
        if (!(e instanceof ApiError) || e.code !== "step_up_required") throw e;
        await askForCode();
        return call();
      }
    },
    [askForCode],
  );

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      await api("/api/admin/step-up", { body: { code } });
      dialog.current?.close();
      pending.current?.resolve();
      pending.current = null;
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not check the code.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Ctx.Provider value={run}>
      {children}
      <dialog
        ref={dialog}
        aria-labelledby="stepup-title"
        onClose={() => {
          pending.current?.reject(new StepUpCancelled("Cancelled"));
          pending.current = null;
        }}
        className="m-auto w-full max-w-sm rounded-[var(--radius-card)] border border-[var(--color-line)] bg-[var(--color-surface)] p-5 text-[var(--color-ink)] backdrop:bg-black/40"
      >
        <form method="dialog" onSubmit={(e) => { e.preventDefault(); void submit(); }} className="flex flex-col gap-3">
          <h2 id="stepup-title" className="text-lg font-semibold">Confirm it&apos;s you</h2>
          <p className="text-sm text-[var(--color-muted)]">This action needs a fresh code from your authenticator app. It stays unlocked for 5 minutes.</p>
          <Field label="6-digit code" inputMode="numeric" autoComplete="one-time-code" pattern="\d{6}" maxLength={6} required autoFocus
            value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))} />
          {error && <Alert>{error}</Alert>}
          <div className="flex gap-2">
            <Button type="submit" loading={busy} disabled={code.length !== 6}>Confirm</Button>
            <Button type="button" variant="secondary" onClick={() => dialog.current?.close()}>Cancel</Button>
          </div>
        </form>
      </dialog>
    </Ctx.Provider>
  );
}

export function useAdminAction() {
  const run = useContext(Ctx);
  if (!run) throw new Error("useAdminAction must be used inside <AdminActions>");
  return run;
}

/** A button that runs one admin action, asks for a reason when needed, and reloads the page on success. */
export function ActionButton({
  label, path, method = "PATCH", body, needsReason = false, confirm, variant = "secondary",
}: {
  label: string;
  path: string;
  method?: string;
  body: Record<string, unknown>;
  needsReason?: boolean;
  confirm?: string;
  variant?: "primary" | "secondary";
}) {
  const run = useAdminAction();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function go() {
    setError(null);
    if (confirm && !window.confirm(confirm)) return;
    let reason: string | null = null;
    if (needsReason) {
      reason = window.prompt("Reason (saved in the audit log)");
      if (!reason || reason.trim().length < 3) return;
    }
    setBusy(true);
    try {
      await run(path, { method, body: reason ? { ...body, reason: reason.trim() } : body });
      window.location.reload();
    } catch (e) {
      if (!(e instanceof StepUpCancelled)) setError(e instanceof Error ? e.message : "Failed");
    } finally {
      setBusy(false);
    }
  }
  return (
    <span className="inline-flex flex-col gap-1">
      <Button variant={variant} loading={busy} onClick={() => void go()} className="h-9 px-3 text-sm">{label}</Button>
      {error && <span role="alert" className="text-xs text-red-700 dark:text-red-400">{error}</span>}
    </span>
  );
}
