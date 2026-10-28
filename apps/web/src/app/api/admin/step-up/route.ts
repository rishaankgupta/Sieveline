import { adminAudit, adminRecentFailures } from "@sieveline/db";
import { headers } from "next/headers";
import { z } from "zod";
import { actorOf, adminDb, requireStaff, setStepUpCookie } from "@/server/admin";
import { assertSameOrigin, handle, HttpError, readJson } from "@/server/api";
import { app } from "@/server/context";

export const dynamic = "force-dynamic";

const MAX_FAILURES = 5;
const WINDOW_MS = 15 * 60_000;
const body = z.object({ code: z.string().trim().regex(/^\d{6}$/, "Enter the 6-digit code") });

/**
 * Step-up: checks a fresh TOTP code and, if right, allows dangerous admin actions for 5 minutes.
 * Server-side calls bypass Better Auth's HTTP rate limit, so failures are counted here
 * (5 per 15 minutes per admin, from the audit log).
 */
export function POST(request: Request): Promise<Response> {
  return handle(async () => {
    const { auth, env } = app();
    assertSameOrigin(request, env.APP_URL);
    const staff = await requireStaff("admin.view");
    const { code } = body.parse(await readJson(request));
    const db = adminDb();
    if ((await adminRecentFailures(db, staff.userId, "admin.step_up.failed", WINDOW_MS)) >= MAX_FAILURES) {
      throw new HttpError(429, "Too many wrong codes. Try again in 15 minutes.");
    }
    try {
      // Plugins are added conditionally in createAuth, so the endpoint type isn't inferred.
      const api = auth.api as unknown as { verifyTOTP?: (o: { body: { code: string }; headers: Headers }) => Promise<unknown> };
      if (!api.verifyTOTP) throw new Error("two-factor plugin missing");
      await api.verifyTOTP({ body: { code }, headers: await headers() });
    } catch {
      await adminAudit(db, actorOf(staff), { action: "admin.step_up.failed", targetType: "user", targetId: staff.userId });
      throw new HttpError(401, "That code didn't work. Check your authenticator app and try again.", "step_up_invalid");
    }
    await adminAudit(db, actorOf(staff), { action: "admin.step_up.ok", targetType: "user", targetId: staff.userId });
    await setStepUpCookie(staff);
    return new Response(null, { status: 204 });
  });
}
