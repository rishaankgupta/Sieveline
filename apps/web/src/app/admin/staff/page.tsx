import { adminListStaff } from "@sieveline/db";
import { adminDb } from "@/server/admin";
import { ActionButton } from "../admin-client";
import { PageTitle, pageStaff, Table, Td } from "../ui";

export const dynamic = "force-dynamic";

const ROLES = ["viewer", "support", "finance", "admin"] as const;

export default async function AdminStaff() {
  const staff = await pageStaff("staff.manage");
  const rows = await adminListStaff(adminDb());
  return (
    <div>
      <PageTitle
        title="Staff"
        sub="Owners come only from PLATFORM_OWNER_EMAILS. To add someone, ask them to sign up, then open their page under Users and pick a role."
      />
      <Table head={["Email", "Role", "2FA", "Change role"]} empty={!rows.length}>
        {rows.map((r) => (
          <tr key={r.id}>
            <Td className="font-medium"><a href={`/admin/users/${encodeURIComponent(r.id)}`} className="underline">{r.email}</a></Td>
            <Td>{r.platformRole}</Td>
            <Td>{r.twoFactorEnabled ? "On" : <strong className="text-amber-700 dark:text-amber-400">Off (can&apos;t open admin)</strong>}</Td>
            <Td>
              {r.platformRole === "owner" || r.id === staff.userId ? "—" : (
                <div className="flex flex-wrap gap-2">
                  {ROLES.filter((x) => x !== r.platformRole).map((role) => (
                    <ActionButton key={role} label={role} path={`/api/admin/users/${encodeURIComponent(r.id)}`} body={{ action: "set_role", role }} />
                  ))}
                  <ActionButton label="Remove" path={`/api/admin/users/${encodeURIComponent(r.id)}`} body={{ action: "set_role", role: "none" }} confirm="Remove this person's admin access?" />
                </div>
              )}
            </Td>
          </tr>
        ))}
      </Table>
    </div>
  );
}
