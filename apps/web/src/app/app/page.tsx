import type { Metadata } from "next";
import { getWorkspaceUsage, listRuns } from "@sieveline/db";
import { app } from "@/server/context";
import { requireWorkspace } from "@/server/session";
import { formatDate, RUN_STATUS } from "@/lib/labels";

export const metadata: Metadata = { title: "Lists" };
export const dynamic = "force-dynamic";

export default async function Dashboard() {
  const ws = await requireWorkspace();
  const { db } = app();
  const [runs, usage] = await Promise.all([listRuns(db, ws), getWorkspaceUsage(db, ws)]);
  const usedPct = usage.cap ? Math.min(100, Math.round(((usage.used + usage.reserved) / usage.cap) * 100)) : 0;

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Your lists</h1>
          <p className="text-[var(--color-muted)]">Each list is a researched set of companies you could buy.</p>
        </div>
        <a href="/app/new" className="inline-flex h-11 items-center rounded-lg bg-[var(--color-accent)] px-4 font-medium text-[var(--color-accent-ink)] hover:opacity-90">
          New list
        </a>
      </div>

      <section aria-labelledby="credits" className="rounded-[var(--radius-card)] border border-[var(--color-line)] bg-[var(--color-surface)] p-5">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 id="credits" className="font-medium">Research credits this month</h2>
          <p className="text-sm text-[var(--color-muted)]">
            <strong className="text-[var(--color-ink)]">{Math.floor(usage.available).toLocaleString()}</strong> of {usage.cap.toLocaleString()} left
            {usage.reserved > 0 && ` · ${Math.ceil(usage.reserved).toLocaleString()} set aside for running lists`}
          </p>
        </div>
        <div className="mt-3 h-2 overflow-hidden rounded-full bg-[var(--color-bg)]" role="progressbar" aria-label="Credits used" aria-valuenow={usedPct} aria-valuemin={0} aria-valuemax={100}>
          <div className="h-full bg-[var(--color-accent)]" style={{ width: `${usedPct}%` }} />
        </div>
      </section>

      {runs.length === 0 ? (
        <div className="rounded-[var(--radius-card)] border border-dashed border-[var(--color-line)] p-10 text-center">
          <p className="font-medium">No lists yet</p>
          <p className="mt-1 text-[var(--color-muted)]">Describe the kind of company you want to buy, and Sieveline will research it.</p>
          <a href="/app/new" className="mt-4 inline-block underline">Create your first list</a>
        </div>
      ) : (
        <ul className="divide-y divide-[var(--color-line)] overflow-hidden rounded-[var(--radius-card)] border border-[var(--color-line)] bg-[var(--color-surface)]">
          {runs.map((r) => (
            <li key={r.id}>
              <a href={`/app/runs/${r.id}`} className="flex flex-wrap items-center gap-x-6 gap-y-1 px-5 py-4 hover:bg-[var(--color-bg)]">
                <span className="min-w-0 flex-1 font-medium">{r.name}</span>
                <span className="text-sm">{RUN_STATUS[r.status] ?? r.status}</span>
                <span className="text-sm text-[var(--color-muted)]">
                  {r.status === "succeeded" ? `${r.shortlisted} shortlisted of ${r.companies} checked` : `${r.companies} found so far`}
                </span>
                <span className="text-sm text-[var(--color-muted)]">{formatDate(r.createdAt)}</span>
              </a>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
