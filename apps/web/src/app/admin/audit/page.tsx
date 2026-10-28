import { adminListAudit } from "@sieveline/db";
import { formatDate } from "@/lib/labels";
import { adminDb } from "@/server/admin";
import { one, PageTitle, pageStaff, Table, Td } from "../ui";

export const dynamic = "force-dynamic";

const PRESETS = ["", "admin.", "run.", "deep_dive.", "member", "invitation", "workspace."];

export default async function AdminAuditPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await pageStaff("audit.view");
  const sp = await searchParams;
  const action = one(sp.action).slice(0, 80);
  const before = Number(one(sp.before)) || undefined;
  const rows = await adminListAudit(adminDb(), { action, ...(before ? { beforeId: before } : {}), limit: 100 });
  const last = rows.at(-1);
  return (
    <div>
      <PageTitle title="Audit log" sub="Every admin action and important user action. Newest first, 100 per page." />
      <form method="get" className="mb-4 flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1 text-sm font-medium">Action starts with
          <input name="action" list="audit-presets" defaultValue={action} className="h-10 w-64 rounded-lg border border-[var(--color-line)] bg-[var(--color-surface)] px-3 font-normal" />
          <datalist id="audit-presets">{PRESETS.filter(Boolean).map((p) => <option key={p} value={p} />)}</datalist>
        </label>
        <button className="h-10 rounded-lg border border-[var(--color-line)] bg-[var(--color-surface)] px-4 text-sm font-medium">Filter</button>
      </form>
      <Table head={["When", "Who", "Action", "Target", "Change"]} empty={!rows.length}>
        {rows.map((r) => (
          <tr key={r.id}>
            <Td className="whitespace-nowrap">{formatDate(r.createdAt)}</Td>
            <Td>{r.actorEmail ?? r.actorUserId?.slice(0, 8) ?? "system"}{r.actorIsAdmin && <span className="ml-1 rounded bg-amber-100 px-1 text-xs text-amber-900 dark:bg-amber-900 dark:text-amber-100">admin</span>}</Td>
            <Td className="font-mono text-xs">{r.action}</Td>
            <Td className="text-xs">{r.targetType} <span className="font-mono">{r.targetId?.slice(0, 36)}</span></Td>
            <Td>
              {(r.before !== null || r.after !== null) && (
                <details className="text-xs">
                  <summary className="cursor-pointer">Show</summary>
                  {r.before !== null && <pre className="mt-1 max-w-md overflow-x-auto whitespace-pre-wrap break-all">before: {JSON.stringify(r.before, null, 1)}</pre>}
                  {r.after !== null && <pre className="mt-1 max-w-md overflow-x-auto whitespace-pre-wrap break-all">after: {JSON.stringify(r.after, null, 1)}</pre>}
                </details>
              )}
            </Td>
          </tr>
        ))}
      </Table>
      {rows.length === 100 && last && (
        <a className="mt-4 inline-block underline" href={`/admin/audit?${new URLSearchParams({ ...(action ? { action } : {}), before: String(last.id) })}`}>Older entries</a>
      )}
    </div>
  );
}
