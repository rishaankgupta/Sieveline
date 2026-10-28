import { acceptInvitation } from "@sieveline/db";
import { cookies } from "next/headers";
import { z } from "zod";
import { assertSameOrigin, handle, HttpError, readJson } from "@/server/api";
import { app } from "@/server/context";
import { requireUser, WORKSPACE_COOKIE } from "@/server/session";

export const dynamic = "force-dynamic";

const body = z.object({ token: z.string().min(20).max(100) });

/**
 * Joins a workspace. The invitation must be addressed to the signed-in user's email, and that
 * email must be verified, so a forwarded or leaked link can't be used by someone else.
 */
export function POST(request: Request): Promise<Response> {
  return handle(async () => {
    const { env, db } = app();
    assertSameOrigin(request, env.APP_URL);
    const user = await requireUser();
    if (!user.emailVerified) throw new HttpError(403, "Please confirm your email address first.");
    const { token } = body.parse(await readJson(request));
    const workspaceId = await acceptInvitation(db, { token, userId: user.id, verifiedEmail: user.email });
    if (!workspaceId) {
      throw new HttpError(400, "This invitation is invalid, expired, already used, or for a different email address.");
    }
    (await cookies()).set(WORKSPACE_COOKIE, workspaceId, {
      httpOnly: true, sameSite: "lax", secure: env.NODE_ENV === "production", path: "/", maxAge: 60 * 60 * 24 * 365,
    });
    return Response.json({ workspaceId });
  });
}
