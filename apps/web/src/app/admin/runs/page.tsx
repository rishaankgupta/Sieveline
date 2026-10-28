import { adminListDeepDives, adminListRuns } from "@sieveline/db";
import { formatDate } from "@/lib/labels";
import { adminDb } from "@/server/admin";
import { n, one, PageTitle, pageStaff, Table, Td } from "../ui";

export const dynamic = "force-dynamic";

const STATUSES = ["", "queued", "running", "succeeded", "failed", "cancelled"];
const STUCK_MS = 30 * 60_000;

export default async function AdminRuns({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await pageStaff("runs.view");
  const status = one((await searchParams).status);
  const db = adminDb();
  const [runs, dives] = await Promise.all([adminListRuns(db, { status, limit: 100 }), adminListDeepDives(db, 50)]);
  const now = Date.now();
  return (
    <div className="flex flex-col gap-10">
      <section>
        <PageTitle title="Lists (runs)" sub="Newest first, up to 100." />
        <form method="get" className="mb-4 flex items-end gap-3">
          <label className="flex flex-col gap-1 text-sm font-medium">Status
            <select name="status" defaultValue={status} className="h-10 rounded-lg border border-[var(--color-line)] bg-[var(--color-surface)] px-3 font-normal">
              {STATUSES.map((s) => <option key={s} value={s}>{s || "All"}</option>)}
            </select>
          </label>
          <button className="h-10 rounded-lg border border-[var(--color-line)] bg-[var(--color-surface)] px-4 text-sm font-medium">Filter</button>
        </form>
        <Table head={["List", "Workspace", "Status", "Credits used / held", "LLM $", "Started", "Finished", "Note"]} empty={!runs.length}>
          {runs.map((r) => {
            const stuck = r.status === "running" && r.lastHeartbeatAt && now - new Date(r.lastHeartbeatAt).getTime() > STUCK_MS;
            return (
              <tr key={r.id}>
                <Td><span className="font-medium">{r.thesisName ?? "—"}</span><div className="font-mono text-xs text-[var(--color-muted)]">{r.id.slice(0, 8)}</div></Td>
                <Td>{r.workspaceName}</Td>
                <Td>{r.status}{stuck && <strong className="ml-1 text-amber-700 dark:text-amber-400">(stuck?)</strong>}</Td>
                <Td className="tabular-nums">{n(r.creditsUsed)} / {n(r.creditsReserved)}</Td>
                <Td className="tabular-nums">{Number(r.llmCostUsd).toFixed(4)}</Td>
                <Td className="whitespace-nowrap">{formatDate(r.createdAt)}</Td>
                <Td className="whitespace-nowrap">{formatDate(r.finishedAt) || "—"}</Td>
                <Td className="max-w-xs text-xs">{r.error ?? ""}</Td>
              </tr>
            );
          })}
        </Table>
      </section>
      <section>
        <h2 className="mb-3 text-xl font-semibold">Deep dives</h2>
        <Table head={["Company", "Workspace", "Status", "Depth", "Credits used / held", "Started", "Note"]} empty={!dives.length}>
          {dives.map((d) => (
            <tr key={d.id}>
              <Td className="font-medium">{d.domain}</Td>
              <Td>{d.workspaceName}</Td>
              <Td>{d.status}</Td>
              <Td>{d.model}</Td>
              <Td className="tabular-nums">{n(d.creditsUsed)} / {n(d.creditsReserved)}</Td>
              <Td className="whitespace-nowrap">{formatDate(d.createdAt)}</Td>
              <Td className="max-w-xs text-xs">{d.error ?? ""}</Td>
            </tr>
          ))}
        </Table>
      </section>
    </div>
  );
}
