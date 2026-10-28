"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Alert, Button, Field } from "@/components/ui";
import { api, ApiError } from "@/lib/client-api";
import { formatDate } from "@/lib/labels";

type Role = "owner" | "member" | "viewer";
interface Member { userId: string; name: string; email: string; role: Role; joinedAt: string }
interface Invite { id: string; email: string; role: Role; expiresAt: string }
interface AuditEntry { id: number; action: string; actorName: string | null; createdAt: string; after: unknown }

const ROLE_HELP: Record<Role, string> = {
  owner: "Everything, including people and billing",
  member: "Create lists, review, chat",
  viewer: "View and download only",
};

const ACTION_LABEL: Record<string, string> = {
  "workspace.created": "Created the workspace",
  "invitation.created": "Sent an invitation",
  "invitation.revoked": "Cancelled an invitation",
  "invitation.accepted": "Joined the workspace",
  "member.role_changed": "Changed someone's role",
  "member.removed": "Removed someone",
  "run.created": "Started a list",
  "run.exported": "Downloaded a list",
};

export function Team({ you, canInvite, canManage, canAudit }: { you: string; canInvite: boolean; canManage: boolean; canAudit: boolean }) {
  const [members, setMembers] = useState<Member[]>([]);
  const [invites, setInvites] = useState<Invite[]>([]);
  const [audit, setAudit] = useState<AuditEntry[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      setMembers((await api<{ members: Member[] }>("/api/workspace/members")).members);
      if (canInvite) setInvites((await api<{ invitations: Invite[] }>("/api/workspace/invitations")).invitations);
      if (canAudit) setAudit((await api<{ entries: AuditEntry[] }>("/api/workspace/audit")).entries);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Couldn't load the team.");
    }
  }, [canInvite, canAudit]);
  useEffect(() => void load(), [load]);

  async function act(fn: () => Promise<unknown>, done?: string) {
    setError(null);
    setNotice(null);
    setBusy(true);
    try {
      await fn();
      if (done) setNotice(done);
      await load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  async function invite(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const data = new FormData(form);
    const email = String(data.get("email")).trim();
    await act(() => api("/api/workspace/invitations", { body: { email, role: data.get("role") } }), `Invitation sent to ${email}.`);
    form.reset();
  }

  return (
    <div className="mt-8 flex flex-col gap-8">
      {error && <Alert>{error}</Alert>}
      {notice && <Alert tone="success">{notice}</Alert>}

      <section aria-labelledby="members">
        <h2 id="members" className="font-medium">Members</h2>
        <ul className="mt-3 divide-y divide-[var(--color-line)] rounded-[var(--radius-card)] border border-[var(--color-line)] bg-[var(--color-surface)]">
          {members.map((m) => (
            <li key={m.userId} className="flex flex-wrap items-center gap-3 px-4 py-3">
              <div className="min-w-0 flex-1">
                <p className="font-medium">{m.name}{m.userId === you && <span className="text-[var(--color-muted)]"> (you)</span>}</p>
                <p className="truncate text-sm text-[var(--color-muted)]">{m.email}</p>
              </div>
              {canManage ? (
                <label className="text-sm">
                  <span className="sr-only">Role for {m.name}</span>
                  <select value={m.role} disabled={busy} onChange={(e) => act(() => api(`/api/workspace/members/${m.userId}`, { method: "PATCH", body: { role: e.target.value } }), "Role updated.")}
                    className="h-9 rounded-lg border border-[var(--color-line)] bg-[var(--color-surface)] px-2">
                    <option value="owner">Owner</option><option value="member">Member</option><option value="viewer">Viewer</option>
                  </select>
                </label>
              ) : (
                <span className="text-sm capitalize">{m.role}</span>
              )}
              {(canManage || m.userId === you) && (
                <Button variant="secondary" disabled={busy}
                  onClick={() => {
                    if (!confirm(m.userId === you ? "Leave this workspace?" : `Remove ${m.name} from this workspace?`)) return;
                    void act(() => api(`/api/workspace/members/${m.userId}`, { method: "DELETE" }), m.userId === you ? undefined : `${m.name} was removed.`).then(() => {
                      if (m.userId === you) window.location.assign("/app");
                    });
                  }}>
                  {m.userId === you ? "Leave" : "Remove"}
                </Button>
              )}
            </li>
          ))}
        </ul>
        <p className="mt-2 text-xs text-[var(--color-muted)]">Owner: {ROLE_HELP.owner}. Member: {ROLE_HELP.member}. Viewer: {ROLE_HELP.viewer}.</p>
      </section>

      {canInvite && (
        <section aria-labelledby="invite" className="rounded-[var(--radius-card)] border border-[var(--color-line)] bg-[var(--color-surface)] p-5">
          <h2 id="invite" className="font-medium">Invite someone</h2>
          <form onSubmit={invite} className="mt-3 flex flex-wrap items-end gap-3">
            <div className="min-w-56 flex-1"><Field label="Email" name="email" type="email" required maxLength={254} /></div>
            <label className="flex flex-col gap-1.5 text-sm font-medium">Role
              <select name="role" defaultValue="member" className="h-11 rounded-lg border border-[var(--color-line)] bg-[var(--color-surface)] px-3 font-normal">
                <option value="member">Member</option><option value="viewer">Viewer</option><option value="owner">Owner</option>
              </select>
            </label>
            <Button type="submit" loading={busy}>Send invitation</Button>
          </form>
          {invites.length > 0 && (
            <ul className="mt-4 divide-y divide-[var(--color-line)] text-sm">
              {invites.map((i) => (
                <li key={i.id} className="flex flex-wrap items-center gap-3 py-2">
                  <span className="flex-1">{i.email} · <span className="capitalize">{i.role}</span> · expires {formatDate(i.expiresAt)}</span>
                  <Button variant="secondary" disabled={busy} onClick={() => act(() => api(`/api/workspace/invitations/${i.id}`, { method: "DELETE" }), "Invitation cancelled.")}>Cancel</Button>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {canAudit && audit.length > 0 && (
        <section aria-labelledby="activity">
          <h2 id="activity" className="font-medium">Activity</h2>
          <ol className="mt-3 divide-y divide-[var(--color-line)] rounded-[var(--radius-card)] border border-[var(--color-line)] bg-[var(--color-surface)] text-sm">
            {audit.map((a) => (
              <li key={a.id} className="flex flex-wrap gap-x-4 px-4 py-2">
                <span className="flex-1">{a.actorName ?? "Someone"}: {ACTION_LABEL[a.action] ?? a.action}</span>
                <time className="text-[var(--color-muted)]" dateTime={a.createdAt}>{formatDate(a.createdAt)}</time>
              </li>
            ))}
          </ol>
        </section>
      )}
    </div>
  );
}
