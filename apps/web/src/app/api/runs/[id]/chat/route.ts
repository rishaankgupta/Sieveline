import {
  advisorReplySchema, assertCan, buildAdvisorPrompt, groundAdvisorReply, labelFor,
} from "@sieveline/core";
import { appendChat, getChat, getRunResults, recentChatCount, recordUsage, setShortlistFlags } from "@sieveline/db";
import { z } from "zod";
import { assertSameOrigin, handle, HttpError, isUuid, readJson } from "@/server/api";
import { app, logger } from "@/server/context";
import { requireWorkspace } from "@/server/session";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

const CHAT_PER_HOUR = 40;
const body = z.object({ message: z.string().trim().min(1).max(1000) });

export function GET(_request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  return handle(async () => {
    const { id } = await params;
    if (!isUuid(id)) throw new HttpError(404, "Not found");
    const ws = await requireWorkspace();
    assertCan(ws.role, "run.view");
    const chat = await getChat(app().db, ws, id);
    return Response.json(chat, { headers: { "Cache-Control": "no-store" } });
  });
}

/**
 * One Advisor turn. The model answers only from this run's evidence; the server checks every
 * citation and every pin/hide/show before anything is saved or applied (ADR-0005).
 */
export function POST(request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  return handle(async () => {
    const { id } = await params;
    if (!isUuid(id)) throw new HttpError(404, "Not found");
    const { env, db, llm } = app();
    assertSameOrigin(request, env.APP_URL);
    const ws = await requireWorkspace();
    assertCan(ws.role, "chat.use");
    if (!llm) throw new HttpError(503, "The Advisor isn't configured yet.");
    const { message } = body.parse(await readJson(request));
    if ((await recentChatCount(db, ws)) >= CHAT_PER_HOUR) throw new HttpError(429, "You've sent a lot of messages this hour. Please wait a bit.");

    const data = await getRunResults(db, ws, id);
    if (!data) throw new HttpError(404, "Not found");
    if (data.run.status !== "succeeded") throw new HttpError(409, "The list isn't ready yet.");
    const thesis = data.run.thesis as { description: string; criteria: { id: string; question: string; label?: string }[] };
    const sl = new Map(data.shortlist.map((i) => [i.companyId, i]));
    const companies = data.companies.map((c) => ({
      id: c.id, domain: c.domain, name: c.name, status: c.status, score: Number(c.score ?? 0), summary: c.summary,
      position: sl.get(c.id)?.position ?? null, pinned: sl.get(c.id)?.pinned ?? false, hidden: sl.get(c.id)?.hidden ?? false,
    }));
    const history = (await getChat(db, ws, id)).messages
      .filter((m) => m.role === "user" || m.role === "assistant")
      .map((m) => ({ role: m.role as "user" | "assistant", content: m.content }));
    const { system, prompt, factIdMap } = buildAdvisorPrompt({
      thesisDescription: thesis.description,
      rules: thesis.criteria.map((c) => ({ id: c.id, label: c.label ?? labelFor(c.question) })),
      companies, facts: data.facts, history, question: message,
    });

    let reply;
    try {
      reply = await llm.json({ task: "chat", schema: advisorReplySchema, system, prompt, maxOutputTokens: 4000 });
    } catch (e) {
      logger.warn("advisor failed", { runId: id, err: e });
      throw new HttpError(502, "The Advisor couldn't answer just now. Please try again.");
    }
    await recordUsage(db, ws, { runId: id, provider: "llm", endpoint: "chat", credits: 0, costUsd: reply.costUsd, cached: false });

    const domainToId = new Map(companies.map((c) => [c.domain, c.id]));
    const g = groundAdvisorReply(reply.value, factIdMap, new Set(domainToId.keys()));
    for (const d of g.pin) await setShortlistFlags(db, ws, id, domainToId.get(d)!, { pinned: true, hidden: false });
    for (const d of g.hide) await setShortlistFlags(db, ws, id, domainToId.get(d)!, { hidden: true, pinned: false });
    const actions = { show: g.show, pin: g.pin, hide: g.hide };
    // Map the short ids in the answer to real fact ids so the browser can open the evidence.
    const citations = Object.fromEntries([...factIdMap.entries()].filter(([, f]) => g.citedFactIds.includes(f)));
    await appendChat(db, ws, id, [
      { role: "user", content: message },
      { role: "assistant", content: g.answer, citedFactIds: g.citedFactIds, toolCalls: { ...actions, citations }, citationCheckPassed: g.citationCheckPassed, llmCostUsd: reply.costUsd },
    ]);
    if (!g.citationCheckPassed || g.invalidDomains) logger.warn("advisor grounding removed items", { runId: id, invalidCitations: g.invalidCitations, invalidDomains: g.invalidDomains });

    return Response.json({ answer: g.answer, citations, actions, citationCheckPassed: g.citationCheckPassed });
  });
}
