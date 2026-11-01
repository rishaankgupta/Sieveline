import { adminGrantCredits } from "@sieveline/db";
import { z } from "zod";
import { actorOf, adminDb, requireStaff } from "@/server/admin";
import { assertSameOrigin, handle, HttpError, isUuid, readJson } from "@/server/api";
import { app } from "@/server/context";

export const dynamic = "force-dynamic";

const body = z.object({
  amount: z.number().int().min(-100_000).max(100_000).refine((n) => n !== 0, "Amount can't be 0"),
  reason: z.string().trim().min(3, "Give a short reason").max(500),
});

/** Grant (or take back) extra credits for this month. */
export function POST(request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  return handle(async () => {
    assertSameOrigin(request, app().env.APP_URL);
    const { id } = await params;
    if (!isUuid(id)) throw new HttpError(404, "Not found");
    const input = body.parse(await readJson(request));
    const staff = await requireStaff("workspaces.edit_limits");
    const bonus = await adminGrantCredits(adminDb(), actorOf(staff), id, input.amount, input.reason);
    if (bonus === null) throw new HttpError(404, "Not found");
    return Response.json({ bonusCredits: bonus });
  });
}
