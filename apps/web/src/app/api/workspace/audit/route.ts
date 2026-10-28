import { assertCan } from "@sieveline/core";
import { listAuditLog } from "@sieveline/db";
import { handle } from "@/server/api";
import { app } from "@/server/context";
import { requireWorkspace } from "@/server/session";

export const dynamic = "force-dynamic";

/** Workspace activity log, newest first. `?before=<id>` pages backwards. */
export function GET(request: Request): Promise<Response> {
  return handle(async () => {
    const ws = await requireWorkspace();
    assertCan(ws.role, "audit.view");
    const before = Number(new URL(request.url).searchParams.get("before"));
    const entries = await listAuditLog(app().db, ws, { limit: 50, ...(Number.isSafeInteger(before) && before > 0 ? { before } : {}) });
    return Response.json({ entries }, { headers: { "Cache-Control": "no-store" } });
  });
}
