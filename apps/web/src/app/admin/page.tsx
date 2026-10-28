import { adminDailyCredits, adminOverview, getActiveSetting } from "@sieveline/db";
import { adminDb } from "@/server/admin";
import { app } from "@/server/context";
import { sweepStaleWork } from "@/server/watchdog";
import { n, PageTitle, pageStaff, Stat } from "./ui";

export const dynamic = "force-dynamic";

export default async function AdminOverview() {
  await pageStaff();
  const db = adminDb();
  // Heal stuck work on every admin visit (the free plan's cron runs only daily).
  const swept = await sweepStaleWork(db);
  const { env } = app();
  const [o, days, paused] = await Promise.all([adminOverview(db), adminDailyCredits(db, 14), getActiveSetting(db, "research_paused")]);
  const max = Math.max(1, ...days.map((d) => d.credits));
  return (
    <div className="flex flex-col gap-8">
      <PageTitle title="Overview" sub="Live numbers from the database. Credits are Tavily credits as metered by Sieveline." />
      {(swept.endedRuns > 0 || swept.endedDives > 0) && (
        <p role="status" className="rounded-lg border border-amber-400 bg-amber-50 p-3 text-amber-900 dark:bg-amber-950 dark:text-amber-100">
          Just stopped {swept.endedRuns} stuck list(s) and {swept.endedDives} overdue deep dive(s) and released their credits.
        </p>
      )}
      {paused === true && (
        <p role="alert" className="rounded-lg border border-red-400 bg-red-50 p-3 font-medium text-red-900 dark:bg-red-950 dark:text-red-100">
          All research is paused (kill switch). <a href="/admin/settings" className="underline">Change</a>
        </p>
      )}
      <section aria-label="People" className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Users" value={n(o.users)} />
        <Stat label="New users (7 days)" value={n(o.users_7d)} />
        <Stat label="Suspended users" value={n(o.users_suspended)} />
        <Stat label="Workspaces" value={n(o.workspaces)} />
      </section>
      <section aria-label="Research" className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Lists started today" value={n(o.runs_today)} />
        <Stat label="Lists running now" value={n(o.runs_active)} />
        <Stat label="Failed lists (7 days)" value={n(o.runs_failed_7d)} warn={o.runs_failed_7d > 0} />
        <Stat label="Stuck (no progress 30 min)" value={n(o.runs_stuck)} warn={o.runs_stuck > 0} />
      </section>
      <section aria-label="Spend" className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Credits today" value={`${n(o.credits_today)} / ${n(env.GLOBAL_DAILY_TAVILY_CREDIT_LIMIT)}`} warn={o.credits_today > env.GLOBAL_DAILY_TAVILY_CREDIT_LIMIT * 0.8} />
        <Stat label="Credits this month" value={n(o.credits_month)} />
        <Stat label="Credits held for running work" value={n(o.credits_reserved)} />
        <Stat label="LLM cost this month" value={`$${o.llm_usd_month.toFixed(2)}`} />
      </section>
      <section aria-labelledby="daily">
        <h2 id="daily" className="font-medium">Tavily credits per day (last 14 days, UTC)</h2>
        <ol className="mt-3 flex h-40 items-end gap-1.5 rounded-[var(--radius-card)] border border-[var(--color-line)] bg-[var(--color-surface)] p-4">
          {days.map((d) => (
            <li key={d.day} className="flex h-full flex-1 flex-col items-center justify-end gap-1" title={`${d.day}: ${d.credits} credits`}>
              <span className="text-[10px] tabular-nums text-[var(--color-muted)]">{d.credits || ""}</span>
              <span aria-hidden className="w-full rounded-t bg-[var(--color-accent)]" style={{ height: `${Math.max(2, (d.credits / max) * 100)}%` }} />
              <span className="sr-only">{d.day}: {d.credits} credits</span>
            </li>
          ))}
        </ol>
        <p className="mt-1 flex justify-between text-xs text-[var(--color-muted)]"><span>{days[0]?.day}</span><span>{days.at(-1)?.day}</span></p>
      </section>
    </div>
  );
}
