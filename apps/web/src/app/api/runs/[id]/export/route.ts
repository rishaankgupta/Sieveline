import { assertCan, toCsv } from "@sieveline/core";
import { getRunResults, schema, withTenant } from "@sieveline/db";
import { hitRateLimit } from "@sieveline/db";
import { handle, HttpError, isUuid } from "@/server/api";
import { app } from "@/server/context";
import { requireWorkspace } from "@/server/session";

export const dynamic = "force-dynamic";

/** CSV export with every fact's quote and source. Cells are formula-safe (see core/csv). */
export function GET(request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  return handle(async () => {
    const { id } = await params;
    if (!isUuid(id)) throw new HttpError(404, "Not found");
    const ws = await requireWorkspace();
    assertCan(ws.role, "export.download");
    if (!(await hitRateLimit(app().db, `export:${ws.userId}`, 60, 3_600_000))) throw new HttpError(429, "Too many downloads this hour. Please try again later.");
    const { db } = app();
    const data = await getRunResults(db, ws, id);
    if (!data) throw new HttpError(404, "Not found");
    const scope = new URL(request.url).searchParams.get("scope") === "all" ? "all" : "shortlist";
    const thesis = data.run.thesis as { name: string; criteria: { id: string; label?: string; question: string }[] };
    const sl = new Map(data.shortlist.map((i) => [i.companyId, i]));
    const mine = new Map(data.reviews.filter((r) => r.userId === ws.userId).map((r) => [r.companyId, r]));
    const rows = data.companies
      .filter((c) => scope === "all" || (sl.has(c.id) && !sl.get(c.id)!.hidden))
      .sort((a, b) => (sl.get(a.id)?.position ?? 999) - (sl.get(b.id)?.position ?? 999) || Number(b.score ?? 0) - Number(a.score ?? 0));

    const headers = [
      "position", "name", "website", "fit", "score", "summary", "why_shortlisted", "founded_year", "founded_quote", "ownership_quote",
      ...thesis.criteria.flatMap((c) => [c.label ?? c.id, `${c.label ?? c.id} quote`, `${c.label ?? c.id} source`]),
      "ownership_flags", "news", "your_review", "your_note",
    ];
    const body = rows.map((c) => {
      const f = data.facts.filter((x) => x.companyId === c.id);
      const one = (kind: string) => f.find((x) => x.kind === kind);
      const crit = (key: string) => f.find((x) => x.kind === "criterion" && x.key === key);
      return [
        sl.get(c.id)?.position ?? "", c.name ?? c.domain, `https://${c.domain}`, c.status, Number(c.score ?? 0), c.summary ?? "", sl.get(c.id)?.reason ?? "",
        one("founded_year")?.value ?? "", one("founded_year")?.quote ?? "", one("ownership")?.quote ?? "",
        ...thesis.criteria.flatMap((r) => [crit(r.id)?.value ?? "unknown", crit(r.id)?.quote ?? "", crit(r.id)?.sourceUrl ?? ""]),
        f.filter((x) => x.kind === "parent_flag").map((x) => x.quote).join(" | "),
        f.filter((x) => x.kind === "news_flag").map((x) => `${x.key}: ${x.value} (${x.sourceUrl})`).join(" | "),
        mine.get(c.id)?.decision ?? "", mine.get(c.id)?.note ?? "",
      ];
    });
    await withTenant(db, ws, (tx) =>
      tx.insert(schema.auditLog).values({ workspaceId: ws.workspaceId, actorUserId: ws.userId, action: "run.exported", targetType: "run", targetId: id, after: { scope, rows: rows.length } }),
    );
    const file = `${thesis.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 50) || "sieveline"}-${scope}.csv`;
    return new Response(toCsv(headers, body), {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${file}"`,
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  });
}
