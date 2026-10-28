import { assertCan } from "@sieveline/core";
import { setReview, setShortlistFlags } from "@sieveline/db";
import { z } from "zod";
import { assertSameOrigin, handle, HttpError, isUuid, readJson } from "@/server/api";
import { app } from "@/server/context";
import { requireWorkspace } from "@/server/session";

export const dynamic = "force-dynamic";

const body = z
  .object({
    pinned: z.boolean().optional(),
    hidden: z.boolean().optional(),
    review: z.object({ decision: z.enum(["approved", "rejected", "needs_check"]), note: z.string().trim().max(1000).nullable().default(null) }).optional(),
  })
  .refine((b) => b.pinned !== undefined || b.hidden !== undefined || b.review !== undefined, "Nothing to change");

/** Pin/hide on the shortlist, and the user's review decision and note. */
export function PATCH(request: Request, { params }: { params: Promise<{ id: string; companyId: string }> }): Promise<Response> {
  return handle(async () => {
    const { id, companyId } = await params;
    if (!isUuid(id) || !isUuid(companyId)) throw new HttpError(404, "Not found");
    assertSameOrigin(request, app().env.APP_URL);
    const ws = await requireWorkspace();
    assertCan(ws.role, "review.write");
    const input = body.parse(await readJson(request));
    const { db } = app();
    if (input.pinned !== undefined || input.hidden !== undefined) {
      const flags = { ...(input.pinned !== undefined ? { pinned: input.pinned } : {}), ...(input.hidden !== undefined ? { hidden: input.hidden } : {}) };
      if (!(await setShortlistFlags(db, ws, id, companyId, flags)) && input.review === undefined) throw new HttpError(404, "Not found");
    }
    if (input.review && !(await setReview(db, ws, companyId, input.review))) throw new HttpError(404, "Not found");
    return new Response(null, { status: 204 });
  });
}
