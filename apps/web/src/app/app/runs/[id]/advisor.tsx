"use client";

import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { Alert, Button } from "@/components/ui";
import { api, ApiError } from "@/lib/client-api";
import type { Results } from "./types";

interface Message {
  role: "user" | "assistant";
  content: string;
  /** short id (F3) -> fact id */
  citations: Record<string, string>;
  failedCheck?: boolean;
}
interface Actions {
  show: string[];
  pin: string[];
  hide: string[];
}

const SUGGESTIONS = ["Compare the top 3", "Which ones are family-owned?", "Why is #1 ranked first?", "Only show companies founded before 1990"];

/** Renders [F3] markers as buttons that open the quoted evidence. */
function withCitations(text: string, citations: Record<string, string>, onOpen: (factId: string) => void): ReactNode[] {
  return text.split(/(\[F\d{1,4}\])/g).map((part, i) => {
    const m = part.match(/^\[(F\d{1,4})\]$/);
    const factId = m ? citations[m[1]!] : undefined;
    if (!factId) return <span key={i}>{part}</span>;
    return (
      <button key={i} type="button" onClick={() => onOpen(factId)} className="mx-0.5 rounded bg-[var(--color-bg)] px-1 text-xs font-medium underline" aria-label={`Source ${m![1]}`}>
        {m![1]}
      </button>
    );
  });
}

export function Advisor({ runId, results, onOpenFact, onActions }: {
  runId: string;
  results: Results;
  onOpenFact: (factId: string) => void;
  onActions: (a: Actions) => Promise<void>;
}) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [input, setInput] = useState("");
  const end = useRef<HTMLDivElement>(null);

  useEffect(() => {
    void api<{ messages: { role: string; content: string; toolCalls: { citations?: Record<string, string> } | null; citationCheckPassed: boolean | null }[] }>(`/api/runs/${runId}/chat`)
      .then((r) =>
        setMessages(
          r.messages
            .filter((m) => m.role === "user" || m.role === "assistant")
            .map((m) => ({ role: m.role as Message["role"], content: m.content, citations: m.toolCalls?.citations ?? {}, failedCheck: m.citationCheckPassed === false })),
        ),
      )
      .catch(() => undefined);
  }, [runId]);
  useEffect(() => end.current?.scrollIntoView({ block: "end" }), [messages, busy]);

  const allFacts = results.facts;

  async function send(text: string) {
    const message = text.trim();
    if (!message || busy) return;
    setError(null);
    setInput("");
    setMessages((m) => [...m, { role: "user", content: message, citations: {} }]);
    setBusy(true);
    try {
      const r = await api<{ answer: string; citations: Record<string, string>; actions: Actions; citationCheckPassed: boolean }>(`/api/runs/${runId}/chat`, { body: { message } });
      setMessages((m) => [...m, { role: "assistant", content: r.answer, citations: r.citations, failedCheck: !r.citationCheckPassed }]);
      await onActions(r.actions);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "The Advisor couldn't answer.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <aside aria-labelledby="advisor-title" className="flex max-h-[calc(100dvh-8rem)] flex-col rounded-[var(--radius-card)] border border-[var(--color-line)] bg-[var(--color-surface)] lg:sticky lg:top-6">
      <div className="border-b border-[var(--color-line)] p-4">
        <h2 id="advisor-title" className="font-semibold">Advisor</h2>
        <p className="text-sm text-[var(--color-muted)]">Ask about these companies. Answers use only the evidence found, with sources.</p>
      </div>
      <div className="flex-1 overflow-y-auto p-4" aria-live="polite">
        {messages.length === 0 && (
          <ul className="flex flex-wrap gap-2">
            {SUGGESTIONS.map((s) => (
              <li key={s}><button type="button" onClick={() => void send(s)} className="rounded-full border border-[var(--color-line)] px-3 py-1 text-sm hover:bg-[var(--color-bg)]">{s}</button></li>
            ))}
          </ul>
        )}
        <ol className="flex flex-col gap-3">
          {messages.map((m, i) => (
            <li key={i} className={m.role === "user" ? "self-end rounded-lg bg-[var(--color-accent)] px-3 py-2 text-[var(--color-accent-ink)]" : "rounded-lg bg-[var(--color-bg)] px-3 py-2"}>
              <span className="sr-only">{m.role === "user" ? "You:" : "Advisor:"}</span>
              <p className="whitespace-pre-wrap text-sm">{m.role === "assistant" ? withCitations(m.content, m.citations, onOpenFact) : m.content}</p>
              {m.failedCheck && <p className="mt-1 text-xs text-[var(--color-muted)]">Some sources the Advisor gave couldn&apos;t be confirmed and were removed.</p>}
            </li>
          ))}
          {busy && <li className="rounded-lg bg-[var(--color-bg)] px-3 py-2 text-sm text-[var(--color-muted)]" role="status">Reading the evidence… this can take up to a minute.</li>}
        </ol>
        <div ref={end} />
        {allFacts.length === 0 && <p className="text-sm text-[var(--color-muted)]">No evidence was collected for this list.</p>}
      </div>
      {error && <div className="px-4"><Alert>{error}</Alert></div>}
      <form className="flex gap-2 border-t border-[var(--color-line)] p-3" onSubmit={(e: FormEvent) => { e.preventDefault(); void send(input); }}>
        <label htmlFor="advisor-input" className="sr-only">Message the Advisor</label>
        <input id="advisor-input" value={input} onChange={(e) => setInput(e.target.value)} maxLength={1000} placeholder="e.g. Only family-owned, ranked by age"
          className="h-11 min-w-0 flex-1 rounded-lg border border-[var(--color-line)] bg-[var(--color-surface)] px-3 outline-none focus:border-[var(--color-accent)]" />
        <Button type="submit" loading={busy} disabled={!input.trim()}>Send</Button>
      </form>
    </aside>
  );
}
