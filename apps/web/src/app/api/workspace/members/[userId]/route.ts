import { assertCan } from "@sieveline/core";
import { changeMemberRole, removeMember } from "@sieveline/db";
import { z } from "zod";
import { assertSameOrigin, handle, HttpError, readJson } from "@/server/api";
import { app } from "@/server/context";
import { requireWorkspace } from "@/server/session";

export const dynamic = "force-dynamic";

const roleBody = z.object({ role: z.enum(["owner", "member", "viewer"]) });
const validUserId = (id: string) => /^[A-Za-z0-9_-]{1,128}$/.test(id);

export function PATCH(request: Request, { params }: { params: Promise<{ userId: string }> }): Promise<Response> {
  return handle(async () => {
    const { userId } = await params;
    if (!validUserId(userId)) throw new HttpError(404, "Not found");
    assertSameOrigin(request, app().env.APP_URL);
    const ws = await requireWorkspace();
    assertCan(ws.role, "members.change_role");
    const { role } = roleBody.parse(await readJson(request));
    await changeMemberRole(app().db, ws, userId, role);
    return new Response(null, { status: 204 });
  });
}

/** Owners can remove anyone (except the last owner); anyone can remove themselves (leave). */
export function DELETE(request: Request, { params }: { params: Promise<{ userId: string }> }): Promise<Response> {
  return handle(async () => {
    const { userId } = await params;
    if (!validUserId(userId)) throw new HttpError(404, "Not found");
    assertSameOrigin(request, app().env.APP_URL);
    const ws = await requireWorkspace();
    if (userId !== ws.userId) assertCan(ws.role, "members.remove");
    await removeMember(app().db, ws, userId);
    return new Response(null, { status: 204 });
  });
}
