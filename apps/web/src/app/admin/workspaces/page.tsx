import { adminCan } from "@sieveline/core";
import { adminListWorkspaces } from "@sieveline/db";
import { formatDate } from "@/lib/labels";
import { adminDb } from "@/server/admin";
import { ActionButton } from "../admin-client";
import { n, one, PageTitle, pageStaff, SearchForm, Table, Td } from "../ui";
import { CapEditor } from "./cap-editor";

export const dynamic = "force-dynamic";

export default async function AdminWorkspaces({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const staff = await pageStaff("workspaces.view");
  const q = one((await searchParams).q).slice(0, 200);
  const rows = await adminListWorkspaces(adminDb(), { q, limit: 100 });
  const canCap = adminCan(staff.role, "workspaces.edit_limits");
  const canPause = adminCan(staff.role, "workspaces.pause");
  return (
    <div>
      <PageTitle title="Workspaces" sub="Credits are this calendar month (UTC). Held = reserved by lists and deep dives still running." />
      <SearchForm q={q} placeholder="workspace name" />
      <Table head={["Workspace", "Members", "Lists", "Used / cap", "Held", "Research", "Created"]} empty={!rows.length}>
        {rows.map((w) => (
          <tr key={w.id}>
            <Td><span className="font-medium">{w.name}</span><div className="text-xs text-[var(--color-muted)]">{w.plan}</div></Td>
            <Td>{w.members}</Td>
            <Td>{w.runs}</Td>
            <Td className="whitespace-nowrap">
              {n(w.creditsUsedThisMonth)} / {canCap ? <CapEditor id={w.id} cap={w.monthlyCreditCap} /> : n(w.monthlyCreditCap)}
            </Td>
            <Td>{n(w.creditsReserved)}</Td>
            <Td>
              <div className="flex flex-col items-start gap-1">
                <span>{w.researchPausedAt ? <strong className="text-red-700 dark:text-red-400">Paused</strong> : "On"}</span>
                {canPause && (
                  <ActionButton
                    label={w.researchPausedAt ? "Resume" : "Pause"}
                    path={`/api/admin/workspaces/${w.id}`}
                    body={{ researchPaused: !w.researchPausedAt }}
                    needsReason
                  />
                )}
              </div>
            </Td>
            <Td className="whitespace-nowrap">{formatDate(w.createdAt)}</Td>
          </tr>
        ))}
      </Table>
    </div>
  );
}
