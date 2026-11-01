"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui";

const KEY = "sl.shortcuts";

export const SHORTCUTS: [string, string][] = [
  ["j / k", "Next / previous company"],
  ["o", "Open the evidence"],
  ["p", "Pin or unpin"],
  ["h", "Hide or unhide"],
  ["1", "Review: worth contacting"],
  ["2", "Review: needs a check"],
  ["3", "Review: not a fit"],
  ["?", "Show this list"],
];

/** Shortcuts are on unless the user turned them off (WCAG 2.1.4 needs a way to turn them off). */
export function useShortcutsEnabled(): [boolean, (on: boolean) => void] {
  const [on, setOn] = useState(true);
  useEffect(() => {
    setOn(window.localStorage.getItem(KEY) !== "off");
  }, []);
  return [on, (v) => {
    window.localStorage.setItem(KEY, v ? "on" : "off");
    setOn(v);
  }];
}

/** True when a key press belongs to typing or to an open dialog, not to the shortlist. */
export function isTyping(e: KeyboardEvent): boolean {
  if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.altKey) return true;
  const t = e.target as HTMLElement | null;
  if (t?.closest("input, textarea, select, [contenteditable='true']")) return true;
  return Boolean(document.querySelector("dialog[open]"));
}

export function ShortcutsHelp({ open, onClose, enabled, setEnabled }: { open: boolean; onClose: () => void; enabled: boolean; setEnabled: (v: boolean) => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);
  return (
    <dialog ref={ref} onClose={onClose} aria-labelledby="kb-title"
      className="m-auto w-full max-w-sm rounded-[var(--radius-card)] border border-[var(--color-line)] bg-[var(--color-surface)] p-5 text-[var(--color-ink)] backdrop:bg-black/40">
      <h2 id="kb-title" className="text-lg font-semibold">Keyboard shortcuts</h2>
      <p className="mt-1 text-sm text-[var(--color-muted)]">On the shortlist, when you are not typing in a box.</p>
      <dl className="mt-4 grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
        {SHORTCUTS.map(([k, what]) => (
          <div key={k} className="contents">
            <dt><kbd className="rounded border border-[var(--color-line)] bg-[var(--color-bg)] px-1.5 py-0.5 font-mono text-xs">{k}</kbd></dt>
            <dd>{what}</dd>
          </div>
        ))}
      </dl>
      <label className="mt-5 flex items-center gap-2 text-sm">
        <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} className="size-4" />
        Use single-key shortcuts
      </label>
      <div className="mt-5"><Button variant="secondary" onClick={() => ref.current?.close()}>Close</Button></div>
    </dialog>
  );
}
