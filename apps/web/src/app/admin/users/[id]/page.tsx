import { adminCan } from "@sieveline/core";
import { adminGetUser, adminListAudit } from "@sieveline/db";
import { notFound } from "next/navigation";
import { formatDate } from "@/lib/labels";
import { adminDb } from "@/server/admin";
import { ActionButton } from "../../admin-client";
import { PageTitle, pageStaff, Table, Td } from "../../ui";

export const dynamic = "force-dynamic";

export default async function AdminUser({ params }: { params: Promise<{ id: string }> }) {
  const staff = await pageStaff("users.view");
  const { id } = await params;
  const data = /^[\w-]{1,128}$/.test(id) ? await adminGetUser(adminDb(), id) : null;
  if (!data) notFound();
  const { user, workspaces, sessions } = data;
  const history = await adminListAudit(adminDb(), { actor: user.id, limit: 20 });
  const path = `/api/admin/users/${encodeURIComponent(user.id)}`;
  const self = user.id === staff.userId;
  return (
    <div className="flex flex-col gap-8">
      <PageTitle title={user.email} sub={`${user.name} · joined ${formatDate(user.createdAt)}`} />
      <dl className="grid grid-cols-2 gap-4 text-sm md:grid-cols-4">
        <div><dt className="text-[var(--color-muted)]">Email verified</dt><dd>{user.emailVerified ? "Yes" : "No"}</dd></div>
        <div><dt className="text-[var(--color-muted)]">Two-factor</dt><dd>{user.twoFactorEnabled ? "On" : "Off"}</dd></div>
        <div><dt className="text-[var(--color-muted)]">Platform role</dt><dd>{user.platformRole}</dd></div>
        <div><dt className="text-[var(--color-muted)]">Status</dt><dd>{user.suspendedAt ? `Suspended ${formatDate(user.suspendedAt)}` : "Active"}</dd></div>
      </dl>

      {!self && (
        <section aria-labelledby="actions" className="flex flex-wrap gap-3">
          <h2 id="actions" className="sr-only">Actions</h2>
          {adminCan(staff.role, "users.suspend") && (user.suspendedAt
            ? <ActionButton label="Unsuspend" path={path} body={{ action: "unsuspend" }} needsReason />
            : <ActionButton label="Suspend and sign out" path={path} body={{ action: "suspend" }} needsReason confirm={`Suspend ${user.email}? They are signed out everywhere and can't sign in.`} />)}
          {adminCan(staff.role, "users.sessions.revoke") && <ActionButton label="Sign out everywhere" path={path} body={{ action: "revoke_sessions" }} needsReason />}
        </section>
      )}

      {!self && adminCan(staff.role, "staff.manage") && user.platformRole !== "owner" && (
        <section aria-labelledby="role" className="flex flex-col gap-2">
          <h2 id="role" className="font-medium">Admin access</h2>
          <p className="text-sm text-[var(--color-muted)]">Changing the role signs them out so it applies at once. They need two-factor on to open the admin panel.</p>
          <div className="flex flex-wrap gap-2">
            {(["none", "viewer", "support", "finance", "admin"] as const).filter((r) => r !== user.platformRole).map((role) => (
              <ActionButton key={role} label={role === "none" ? "No admin access" : `Make ${role}`} path={path} body={{ action: "set_role", role }}
                confirm={`Set ${user.email}'s admin role to "${role}"?`} />
            ))}
          </div>
        </section>
      )}

      <section aria-labelledby="ws">
        <h2 id="ws" className="mb-2 font-medium">Workspaces</h2>
        <Table head={["Workspace", "Role"]} empty={!workspaces.length}>
          {workspaces.map((w) => <tr key={w.id}><Td><a className="underline" href={`/admin/workspaces?q=${encodeURIComponent(w.name)}`}>{w.name}</a></Td><Td>{w.role}</Td></tr>)}
        </Table>
      </section>

      <section aria-labelledby="sess">
        <h2 id="sess" className="mb-2 font-medium">Active sessions</h2>
        <Table head={["Started", "Last active", "Expires", "Device"]} empty={!sessions.length}>
          {sessions.map((s) => (
            <tr key={s.id}><Td>{formatDate(s.createdAt)}</Td><Td>{formatDate(s.updatedAt)}</Td><Td>{formatDate(s.expiresAt)}</Td><Td className="max-w-md truncate text-xs">{s.userAgent ?? "—"}</Td></tr>
          ))}
        </Table>
      </section>

      <section aria-labelledby="acts">
        <h2 id="acts" className="mb-2 font-medium">Recent actions by this user</h2>
        <Table head={["When", "Action", "Target"]} empty={!history.length}>
          {history.map((h) => <tr key={h.id}><Td className="whitespace-nowrap">{formatDate(h.createdAt)}</Td><Td>{h.action}</Td><Td className="text-xs">{h.targetType} {h.targetId}</Td></tr>)}
        </Table>
      </section>
    </div>
  );
}
