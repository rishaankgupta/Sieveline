import { toCsv } from "@sieveline/core";
import { adminAudit, adminAuditForExport } from "@sieveline/db";
import { actorOf, adminDb, requireStaff } from "@/server/admin";
import { handle } from "@/server/api";

export const dynamic = "force-dynamic";

/** Audit log as CSV (formula-escaped), last 1-365 days, optional action prefix. Exporting is itself audited. */
export function GET(request: Request): Promise<Response> {
  return handle(async () => {
    const staff = await requireStaff("audit.view");
    const q = new URL(request.url).searchParams;
    const days = Math.min(365, Math.max(1, Number(q.get("days")) || 30));
    const action = (q.get("action") ?? "").slice(0, 80);
    const db = adminDb();
    const rows = await adminAuditForExport(db, { sinceDays: days, ...(action ? { action } : {}), limit: 50_000 });
    await adminAudit(db, actorOf(staff), { action: "admin.audit.exported", targetType: "audit_log", targetId: "export", after: { days, action, rows: rows.length } });
    const csv = toCsv(
      ["id", "time_utc", "action", "actor_email", "actor_id", "by_admin", "workspace_id", "target_type", "target_id", "before", "after"],
      rows.map((r) => [r.id, r.createdAt.toISOString(), r.action, r.actorEmail ?? "", r.actorUserId ?? "", r.actorIsAdmin ? "yes" : "no", r.workspaceId ?? "", r.targetType ?? "", r.targetId ?? "", r.before === null ? "" : JSON.stringify(r.before), r.after === null ? "" : JSON.stringify(r.after)]),
    );
    return new Response(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="sieveline-audit-${days}d.csv"`,
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  });
}
