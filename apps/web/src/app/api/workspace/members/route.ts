import { assertCan } from "@sieveline/core";
import { listMembers } from "@sieveline/db";
import { handle } from "@/server/api";
import { app } from "@/server/context";
import { requireWorkspace } from "@/server/session";

export const dynamic = "force-dynamic";

export function GET(): Promise<Response> {
  return handle(async () => {
    const ws = await requireWorkspace();
    assertCan(ws.role, "members.view");
    const members = await listMembers(app().db, ws);
    return Response.json({ members, you: ws.userId, yourRole: ws.role }, { headers: { "Cache-Control": "no-store" } });
  });
}
