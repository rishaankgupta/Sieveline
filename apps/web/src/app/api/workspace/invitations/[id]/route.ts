import { assertCan } from "@sieveline/core";
import { revokeInvitation } from "@sieveline/db";
import { assertSameOrigin, handle, HttpError, isUuid } from "@/server/api";
import { app } from "@/server/context";
import { requireWorkspace } from "@/server/session";

export const dynamic = "force-dynamic";

export function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  return handle(async () => {
    const { id } = await params;
    if (!isUuid(id)) throw new HttpError(404, "Not found");
    assertSameOrigin(request, app().env.APP_URL);
    const ws = await requireWorkspace();
    assertCan(ws.role, "members.invite");
    if (!(await revokeInvitation(app().db, ws, id))) throw new HttpError(404, "Not found");
    return new Response(null, { status: 204 });
  });
}
