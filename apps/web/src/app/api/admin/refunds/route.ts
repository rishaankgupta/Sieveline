import { adminRefund } from "@sieveline/db";
import { z } from "zod";
import { actorOf, adminDb, requireStaff } from "@/server/admin";
import { assertSameOrigin, handle, HttpError, readJson } from "@/server/api";
import { app } from "@/server/context";

export const dynamic = "force-dynamic";

const body = z.object({
  kind: z.enum(["run", "deep_dive"]),
  id: z.string().uuid(),
  reason: z.string().trim().min(3, "Give a short reason").max(500),
});

/** Gives a finished run's or deep dive's credits back to its workspace, once. */
export function POST(request: Request): Promise<Response> {
  return handle(async () => {
    assertSameOrigin(request, app().env.APP_URL);
    const input = body.parse(await readJson(request));
    const staff = await requireStaff("workspaces.edit_limits");
    const credits = await adminRefund(adminDb(), actorOf(staff), input.kind, input.id, input.reason);
    if (credits === null) throw new HttpError(404, "Not found");
    return Response.json({ refunded: credits });
  });
}
