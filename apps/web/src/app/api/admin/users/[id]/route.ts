import { adminRevokeSessions, adminSetPlatformRole, adminSetUserSuspended } from "@sieveline/db";
import { z } from "zod";
import { actorOf, adminDb, requireStaff } from "@/server/admin";
import { assertSameOrigin, handle, HttpError, readJson } from "@/server/api";
import { app } from "@/server/context";

export const dynamic = "force-dynamic";

const reason = z.string().trim().min(3, "Give a short reason").max(500);
const body = z.discriminatedUnion("action", [
  z.object({ action: z.literal("suspend"), reason }),
  z.object({ action: z.literal("unsuspend"), reason }),
  z.object({ action: z.literal("revoke_sessions"), reason }),
  z.object({ action: z.literal("set_role"), role: z.enum(["none", "viewer", "finance", "support", "admin"]) }),
]);

export function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  return handle(async () => {
    assertSameOrigin(request, app().env.APP_URL);
    const { id } = await params;
    if (!/^[\w-]{1,128}$/.test(id)) throw new HttpError(404, "Not found");
    const input = body.parse(await readJson(request));
    const staff = await requireStaff(
      input.action === "set_role" ? "staff.manage" : input.action === "revoke_sessions" ? "users.sessions.revoke" : "users.suspend",
    );
    if (input.action !== "set_role" && id === staff.userId) throw new HttpError(409, "You can't do that to your own account here");
    const db = adminDb();
    let ok: boolean;
    if (input.action === "suspend" || input.action === "unsuspend") ok = await adminSetUserSuspended(db, actorOf(staff), id, input.action === "suspend", input.reason);
    else if (input.action === "revoke_sessions") ok = (await adminRevokeSessions(db, actorOf(staff), id, input.reason)) >= 0;
    else ok = await adminSetPlatformRole(db, actorOf(staff), id, input.role);
    if (!ok) throw new HttpError(404, "Not found");
    return new Response(null, { status: 204 });
  });
}
