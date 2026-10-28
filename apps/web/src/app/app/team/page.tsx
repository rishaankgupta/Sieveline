import type { Metadata } from "next";
import { can } from "@sieveline/core";
import { requireWorkspace } from "@/server/session";
import { Team } from "./team";

export const metadata: Metadata = { title: "Team" };
export const dynamic = "force-dynamic";

export default async function TeamPage() {
  const ws = await requireWorkspace();
  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="text-2xl font-semibold">Team</h1>
      <p className="mt-1 text-[var(--color-muted)]">People in {ws.name}.</p>
      <Team
        you={ws.userId}
        canInvite={can(ws.role, "members.invite")}
        canManage={can(ws.role, "members.change_role")}
        canAudit={can(ws.role, "audit.view")}
      />
    </div>
  );
}
