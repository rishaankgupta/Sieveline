import { assertCan } from "@sieveline/core";
import { createInvitation, hitRateLimit, INVITE_TTL_DAYS, listInvitations } from "@sieveline/db";
import { z } from "zod";
import { assertSameOrigin, handle, HttpError, readJson } from "@/server/api";
import { app, logger } from "@/server/context";
import { actionEmail, createEmailSender } from "@/server/email";
import { requireWorkspace } from "@/server/session";

export const dynamic = "force-dynamic";

const body = z.object({
  email: z.string().trim().toLowerCase().email().max(254),
  role: z.enum(["owner", "member", "viewer"]).default("member"),
});

export function GET(): Promise<Response> {
  return handle(async () => {
    const ws = await requireWorkspace();
    assertCan(ws.role, "members.view");
    return Response.json({ invitations: await listInvitations(app().db, ws) }, { headers: { "Cache-Control": "no-store" } });
  });
}

export function POST(request: Request): Promise<Response> {
  return handle(async () => {
    const { env, db } = app();
    assertSameOrigin(request, env.APP_URL);
    const ws = await requireWorkspace();
    assertCan(ws.role, "members.invite");
    // Each invitation sends a real email: cap it so an account can't be used to spam.
    if (!(await hitRateLimit(db, `invite:${ws.userId}`, 20, 3_600_000))) throw new HttpError(429, "Too many invitations this hour. Please try again later.");
    const input = body.parse(await readJson(request));
    const inv = await createInvitation(db, ws, input);
    const url = `${env.APP_URL}/invite?token=${encodeURIComponent(inv.token)}`;
    await createEmailSender(env, logger).send(
      actionEmail({
        to: input.email,
        subject: `You're invited to ${ws.name} on Sieveline`,
        intro: `You've been invited to join the "${ws.name}" workspace on Sieveline as ${input.role === "viewer" ? "a viewer" : `an ${input.role}`}.`,
        action: "Accept invitation",
        url,
        outro: `This link works for ${INVITE_TTL_DAYS} days and only for ${input.email}. If you weren't expecting it, you can ignore this email.`,
      }),
    );
    return Response.json({ id: inv.id, expiresAt: inv.expiresAt }, { status: 201 });
  });
}
