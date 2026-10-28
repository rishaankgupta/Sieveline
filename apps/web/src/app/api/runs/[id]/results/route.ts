import { assertCan } from "@sieveline/core";
import { getRunResults } from "@sieveline/db";
import { handle, HttpError, isUuid } from "@/server/api";
import { app } from "@/server/context";
import { requireWorkspace } from "@/server/session";

export const dynamic = "force-dynamic";

/** Companies, facts (with quotes and sources), shortlist and reviews for the results screens. */
export function GET(_request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  return handle(async () => {
    const { id } = await params;
    if (!isUuid(id)) throw new HttpError(404, "Not found");
    const ws = await requireWorkspace();
    assertCan(ws.role, "run.view");
    const data = await getRunResults(app().db, ws, id);
    if (!data) throw new HttpError(404, "Not found");
    const thesis = data.run.thesis as { name: string; description: string; criteria: { id: string; question: string; label?: string; required?: boolean }[] };
    return Response.json(
      {
        run: { id: data.run.id, status: data.run.status },
        thesis: { name: thesis.name, description: thesis.description, criteria: thesis.criteria.map((c) => ({ id: c.id, question: c.question, label: c.label ?? c.question, required: Boolean(c.required) })) },
        companies: data.companies.map((c) => ({ ...c, score: Number(c.score ?? 0) })),
        facts: data.facts,
        shortlist: data.shortlist,
        reviews: data.reviews.filter((r) => r.userId === ws.userId),
        canEdit: ws.role !== "viewer",
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  });
}
