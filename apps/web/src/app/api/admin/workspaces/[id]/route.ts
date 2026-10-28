import { adminUpdateWorkspace } from "@sieveline/db";
import { z } from "zod";
import { actorOf, adminDb, requireStaff } from "@/server/admin";
import { assertSameOrigin, handle, HttpError, isUuid, readJson } from "@/server/api";
import { app } from "@/server/context";

export const dynamic = "force-dynamic";

const body = z
  .object({
    monthlyCreditCap: z.number().int().min(0).max(1_000_000).optional(),
    researchPaused: z.boolean().optional(),
    reason: z.string().trim().min(3, "Give a short reason").max(500),
  })
  .refine((b) => b.monthlyCreditCap !== undefined || b.researchPaused !== undefined, "Nothing to change");

export function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  return handle(async () => {
    assertSameOrigin(request, app().env.APP_URL);
    const { id } = await params;
    if (!isUuid(id)) throw new HttpError(404, "Not found");
    const input = body.parse(await readJson(request));
    const staff = await requireStaff(input.monthlyCreditCap !== undefined ? "workspaces.edit_limits" : "workspaces.pause");
    if (input.monthlyCreditCap !== undefined && input.researchPaused !== undefined) await requireStaff("workspaces.pause");
    const ok = await adminUpdateWorkspace(adminDb(), actorOf(staff), id, {
      ...(input.monthlyCreditCap !== undefined ? { monthlyCreditCap: input.monthlyCreditCap } : {}),
      ...(input.researchPaused !== undefined ? { researchPaused: input.researchPaused } : {}),
    }, input.reason);
    if (!ok) throw new HttpError(404, "Not found");
    return new Response(null, { status: 204 });
  });
}
