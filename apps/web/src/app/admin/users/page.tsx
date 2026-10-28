import { adminListUsers } from "@sieveline/db";
import { formatDate } from "@/lib/labels";
import { adminDb } from "@/server/admin";
import { one, PageTitle, pageStaff, SearchForm, Table, Td } from "../ui";

export const dynamic = "force-dynamic";

export default async function AdminUsers({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await pageStaff("users.view");
  const q = one((await searchParams).q).slice(0, 200);
  const users = await adminListUsers(adminDb(), { q, limit: 100 });
  return (
    <div>
      <PageTitle title="Users" sub="Newest first. Up to 100 shown; search by email or name." />
      <SearchForm q={q} placeholder="email or name" />
      <Table head={["User", "Verified", "2FA", "Platform role", "Status", "Joined"]} empty={!users.length}>
        {users.map((u) => (
          <tr key={u.id}>
            <Td><a href={`/admin/users/${encodeURIComponent(u.id)}`} className="font-medium underline-offset-2 hover:underline">{u.email}</a><div className="text-xs text-[var(--color-muted)]">{u.name}</div></Td>
            <Td>{u.emailVerified ? "Yes" : "No"}</Td>
            <Td>{u.twoFactorEnabled ? "On" : "Off"}</Td>
            <Td>{u.platformRole === "none" ? "—" : u.platformRole}</Td>
            <Td>{u.suspendedAt ? <strong className="text-red-700 dark:text-red-400">Suspended</strong> : "Active"}</Td>
            <Td className="whitespace-nowrap">{formatDate(u.createdAt)}</Td>
          </tr>
        ))}
      </Table>
    </div>
  );
}
