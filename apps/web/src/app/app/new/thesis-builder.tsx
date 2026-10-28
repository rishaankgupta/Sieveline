"use client";

import { useState, type FormEvent } from "react";
import { Alert, Button, Field } from "@/components/ui";
import { api, ApiError } from "@/lib/client-api";

interface Rule {
  id: string;
  question: string;
  label?: string;
  weight: number;
  required: boolean;
}
interface ThesisDraft {
  name: string;
  description: string;
  country: string;
  places: string[];
  searchTerms: string[];
  minYearsInBusiness: number | null;
  criteria: Rule[];
  excludeIfMentions: string[];
  excludeDomains: string[];
  shortlistSize: number;
  strongFitScore?: number;
}
interface Estimate {
  maxCredits: number;
  typicalCredits: number;
}

const list = (s: string) => s.split(/[\n,]/).map((x) => x.trim()).filter(Boolean);
const ruleId = (label: string, taken: Set<string>) => {
  let id = label.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^[^a-z]+|_+$/g, "").slice(0, 30) || "rule";
  if (id.length < 2) id = `${id}x`;
  let n = 1;
  let out = id;
  while (taken.has(out)) out = `${id}_${n++}`;
  return out;
};

export function ThesisBuilder({ templates, draftingEnabled }: { templates: { id: string; name: string; thesis: unknown }[]; draftingEnabled: boolean }) {
  const [step, setStep] = useState<"describe" | "edit">("describe");
  const [thesis, setThesis] = useState<ThesisDraft | null>(null);
  const [seeds, setSeeds] = useState("");
  const [estimate, setEstimate] = useState<Estimate | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<"draft" | "estimate" | "start" | null>(null);

  async function draft(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const description = String(new FormData(e.currentTarget).get("description")).trim();
    setError(null);
    setBusy("draft");
    try {
      const { thesis: t } = await api<{ thesis: ThesisDraft }>("/api/theses/draft", { body: { description } });
      setThesis(t);
      setStep("edit");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't draft rules.");
    } finally {
      setBusy(null);
    }
  }

  function update(patch: Partial<ThesisDraft>) {
    setThesis((t) => (t ? { ...t, ...patch } : t));
    setEstimate(null);
  }
  function updateRule(i: number, patch: Partial<Rule>) {
    update({ criteria: thesis!.criteria.map((r, j) => (j === i ? { ...r, ...patch } : r)) });
  }

  async function submit(estimateOnly: boolean) {
    if (!thesis) return;
    setError(null);
    setBusy(estimateOnly ? "estimate" : "start");
    try {
      const res = await api<{ runId?: string; estimate: Estimate }>("/api/runs", { body: { thesis, seeds: list(seeds), estimateOnly } });
      if (estimateOnly) setEstimate(res.estimate);
      else window.location.assign(`/app/runs/${res.runId}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong.");
    } finally {
      setBusy(null);
    }
  }

  if (step === "describe") {
    return (
      <div className="mt-8 flex flex-col gap-6">
        {error && <Alert>{error}</Alert>}
        {draftingEnabled && (
          <form onSubmit={draft} className="flex flex-col gap-3 rounded-[var(--radius-card)] border border-[var(--color-line)] bg-[var(--color-surface)] p-5">
            <label htmlFor="description" className="font-medium">What kind of company do you want to buy?</label>
            <textarea
              id="description" name="description" required minLength={15} maxLength={1500} rows={4}
              placeholder="e.g. Independent HVAC service companies in Texas or Oklahoma, 20+ years old, mostly commercial customers, not owned by private equity."
              className="rounded-lg border border-[var(--color-line)] bg-[var(--color-surface)] p-3 outline-none focus:border-[var(--color-accent)]"
            />
            <p className="text-xs text-[var(--color-muted)]">Plain words are fine. Mention places, age, customers, and anything to avoid. Drafting can take up to a minute.</p>
            <div><Button type="submit" loading={busy === "draft"}>Draft my rules</Button></div>
          </form>
        )}
        <div className="rounded-[var(--radius-card)] border border-[var(--color-line)] bg-[var(--color-surface)] p-5">
          <p className="font-medium">Or start from a template</p>
          <ul className="mt-3 flex flex-col gap-2">
            {templates.map((t) => (
              <li key={t.id}>
                <Button variant="secondary" onClick={() => { setThesis(t.thesis as ThesisDraft); setStep("edit"); }}>{t.name}</Button>
              </li>
            ))}
          </ul>
        </div>
      </div>
    );
  }

  const t = thesis!;
  const taken = new Set(t.criteria.map((r) => r.id));
  return (
    <form className="mt-8 flex flex-col gap-6" onSubmit={(e) => { e.preventDefault(); void submit(false); }}>
      {error && <Alert>{error}</Alert>}
      <section className="flex flex-col gap-4 rounded-[var(--radius-card)] border border-[var(--color-line)] bg-[var(--color-surface)] p-5">
        <h2 className="font-medium">1. What you&apos;re looking for</h2>
        <Field label="List name" value={t.name} onChange={(e) => update({ name: e.target.value })} required minLength={3} maxLength={120} />
        <div className="flex flex-col gap-1.5">
          <label htmlFor="desc" className="text-sm font-medium">Description</label>
          <textarea id="desc" rows={3} value={t.description} onChange={(e) => update({ description: e.target.value })} minLength={20} maxLength={2000} required
            className="rounded-lg border border-[var(--color-line)] bg-[var(--color-surface)] p-3 outline-none focus:border-[var(--color-accent)]" />
        </div>
        <Field label="Search phrases" hint="How these companies describe themselves. Comma-separated." value={t.searchTerms.join(", ")} onChange={(e) => update({ searchTerms: list(e.target.value) })} />
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Places" hint="States, regions or cities. Comma-separated." value={t.places.join(", ")} onChange={(e) => update({ places: list(e.target.value) })} />
          <Field label="Country" value={t.country} onChange={(e) => update({ country: e.target.value })} />
        </div>
        <Field label="Minimum years in business" type="number" min={0} max={200} value={t.minYearsInBusiness ?? ""} onChange={(e) => update({ minYearsInBusiness: e.target.value === "" ? null : Number(e.target.value) })} />
      </section>

      <section className="flex flex-col gap-4 rounded-[var(--radius-card)] border border-[var(--color-line)] bg-[var(--color-surface)] p-5">
        <div>
          <h2 className="font-medium">2. Rules each company is checked against</h2>
          <p className="text-sm text-[var(--color-muted)]">Every answer must quote the company&apos;s own website, or it counts as unknown.</p>
        </div>
        <ol className="flex flex-col gap-4">
          {t.criteria.map((r, i) => (
            <li key={r.id} className="flex flex-col gap-3 rounded-lg border border-[var(--color-line)] p-4">
              <Field label={`Question ${i + 1}`} value={r.question} onChange={(e) => updateRule(i, { question: e.target.value })} required minLength={10} maxLength={300} />
              <div className="flex flex-wrap items-end gap-4">
                <div className="min-w-48 flex-1"><Field label="Short label" value={r.label ?? ""} onChange={(e) => updateRule(i, { label: e.target.value })} maxLength={40} /></div>
                <label className="flex flex-col gap-1.5 text-sm font-medium">
                  Importance
                  <select value={r.weight} onChange={(e) => updateRule(i, { weight: Number(e.target.value) })} className="h-11 rounded-lg border border-[var(--color-line)] bg-[var(--color-surface)] px-3">
                    <option value={1}>Nice to have</option><option value={2}>Important</option><option value={3}>Very important</option>
                  </select>
                </label>
                <label className="flex h-11 items-center gap-2 text-sm">
                  <input type="checkbox" className="size-4" checked={r.required} onChange={(e) => updateRule(i, { required: e.target.checked })} /> Must have
                </label>
                <Button type="button" variant="secondary" onClick={() => update({ criteria: t.criteria.filter((_, j) => j !== i) })} disabled={t.criteria.length === 1} aria-label={`Remove question ${i + 1}`}>Remove</Button>
              </div>
            </li>
          ))}
        </ol>
        <div>
          <Button type="button" variant="secondary" disabled={t.criteria.length >= 12}
            onClick={() => update({ criteria: [...t.criteria, { id: ruleId(`rule ${t.criteria.length + 1}`, taken), question: "", weight: 1, required: false }] })}>
            Add a question
          </Button>
        </div>
      </section>

      <section className="flex flex-col gap-4 rounded-[var(--radius-card)] border border-[var(--color-line)] bg-[var(--color-surface)] p-5">
        <h2 className="font-medium">3. Exclusions and your own list (optional)</h2>
        <Field label="Exclude companies that are part of" hint="Owner or competitor names. Comma-separated." value={t.excludeIfMentions.join(", ")} onChange={(e) => update({ excludeIfMentions: list(e.target.value) })} />
        <Field label="Exclude websites" hint="e.g. competitor.com. Comma-separated." value={t.excludeDomains.join(", ")} onChange={(e) => update({ excludeDomains: list(e.target.value).map((d) => d.toLowerCase()) })} />
        <div className="flex flex-col gap-1.5">
          <label htmlFor="seeds" className="text-sm font-medium">Companies you already know (websites)</label>
          <textarea id="seeds" rows={3} value={seeds} onChange={(e) => { setSeeds(e.target.value); setEstimate(null); }} placeholder="one per line, e.g. acmecal.com"
            className="rounded-lg border border-[var(--color-line)] bg-[var(--color-surface)] p-3 outline-none focus:border-[var(--color-accent)]" />
          <p className="text-xs text-[var(--color-muted)]">These are always checked, alongside what Sieveline finds.</p>
        </div>
      </section>

      <section className="flex flex-wrap items-center gap-4 rounded-[var(--radius-card)] border border-[var(--color-line)] bg-[var(--color-surface)] p-5" aria-live="polite">
        {estimate ? (
          <p className="flex-1">
            This list will use about <strong>{estimate.typicalCredits.toLocaleString()}</strong> credits, and never more than{" "}
            <strong>{estimate.maxCredits.toLocaleString()}</strong>. Unused credits are returned.
          </p>
        ) : (
          <p className="flex-1 text-[var(--color-muted)]">Check the cost before starting.</p>
        )}
        <Button type="button" variant="secondary" onClick={() => void submit(true)} loading={busy === "estimate"}>Check cost</Button>
        <Button type="submit" loading={busy === "start"} disabled={!estimate}>Start research</Button>
      </section>
    </form>
  );
}
