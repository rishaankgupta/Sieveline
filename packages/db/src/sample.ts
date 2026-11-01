import { sql } from "drizzle-orm";
import * as s from "./schema.ts";
import { withTenant, type TenantContext } from "./tenant.ts";
import type { AnyDb } from "./workspaces.ts";

/**
 * A finished list copied into a workspace, so demo accounts can explore every screen without
 * spending credits. Its credits are shown on the run but never charged to the workspace.
 */
export interface SampleRun {
  thesis: unknown;
  creditsUsed: number;
  companies: { domain: string; name: string | null; status: string; score: number; summary: string | null; failed_rule: string | null; source: string; found_by: string | null; pages: unknown }[];
  facts: { company: number; kind: string; key: string | null; value: string; quote: string | null; source_url: string | null; published_at: string | null }[];
  shortlist: { company: number; position: number; reason: string }[];
  deepDives: { company: number; model: string; dossier: unknown; sources: unknown; credits_used: number }[];
}

export async function seedSampleRun(db: AnyDb, ctx: TenantContext & { workspaceId: string }, sample: SampleRun): Promise<{ runId: string }> {
  return withTenant(db, ctx, async (tx) => {
    const now = new Date();
    const [run] = await tx
      .insert(s.runs)
      .values({
        workspaceId: ctx.workspaceId, thesisSnapshot: sample.thesis as object, settingsSnapshot: { sample: true },
        status: "succeeded", creditsReserved: "0", creditsUsed: String(sample.creditsUsed), startedBy: ctx.userId,
        startedAt: now, finishedAt: now, lastHeartbeatAt: now, error: "Sample list: real results copied in for the demo; no credits were charged",
      })
      .returning({ id: s.runs.id });
    const runId = run!.id;
    const rows = await tx
      .insert(s.companies)
      .values(sample.companies.map((c) => ({
        workspaceId: ctx.workspaceId, runId, domain: c.domain, name: c.name, source: c.source, foundBy: c.found_by,
        score: String(c.score), status: c.status as (typeof s.fitStatus.enumValues)[number], failedRule: c.failed_rule, summary: c.summary,
        pages: c.pages as object,
      })))
      .returning({ id: s.companies.id, domain: s.companies.domain });
    const idOf = (i: number) => rows.find((r) => r.domain === sample.companies[i]!.domain)!.id;
    if (sample.facts.length) {
      await tx.insert(s.facts).values(sample.facts.map((f) => ({
        workspaceId: ctx.workspaceId, companyId: idOf(f.company), kind: f.kind as (typeof s.factKind.enumValues)[number], key: f.key,
        value: f.value, quote: f.quote, sourceUrl: f.source_url, publishedAt: f.published_at ? new Date(f.published_at) : null,
      })));
    }
    if (sample.shortlist.length) {
      await tx.insert(s.shortlistItems).values(sample.shortlist.map((i) => ({ workspaceId: ctx.workspaceId, runId, companyId: idOf(i.company), position: i.position, reason: i.reason })));
    }
    // Newest deep dive per company only.
    const latest = new Map(sample.deepDives.map((d) => [d.company, d]));
    for (const d of latest.values()) {
      await tx.insert(s.deepDives).values({
        workspaceId: ctx.workspaceId, companyId: idOf(d.company), runId, model: d.model, status: "succeeded",
        dossier: d.dossier as object, sources: d.sources as object, creditsUsed: String(d.credits_used), creditsReserved: "0",
        requestedBy: ctx.userId, finishedAt: now,
      });
    }
    return { runId };
  });
}

/** Demo accounts use this email domain (".invalid" can never receive mail, RFC 2606). */
export const DEMO_EMAIL_DOMAIN = "demo.sieveline.invalid";

export function isDemoEmail(email: string): boolean {
  return email.toLowerCase().endsWith(`@${DEMO_EMAIL_DOMAIN}`);
}

/**
 * Deletes demo accounts older than `olderThanMs` and the workspaces only they belong to. Needs the
 * admin connection. Accounts with a list still running are kept until it ends.
 */
export async function deleteExpiredDemoAccounts(db: AnyDb, olderThanMs: number): Promise<{ users: number; workspaces: number }> {
  const cutoff = new Date(Date.now() - olderThanMs);
  return db.transaction(async (tx) => {
    const ws = await tx.execute(sql`
      delete from workspaces w
      where exists (select 1 from memberships m join users u on u.id = m.user_id where m.workspace_id = w.id)
        and not exists (
          select 1 from memberships m join users u on u.id = m.user_id
          where m.workspace_id = w.id and (lower(u.email) not like ${`%@${DEMO_EMAIL_DOMAIN}`} or u.created_at >= ${cutoff}))
        and not exists (select 1 from runs r where r.workspace_id = w.id and r.status in ('queued','running'))
        and not exists (select 1 from deep_dives d where d.workspace_id = w.id and d.status in ('queued','running'))
      returning w.id`);
    const users = await tx.execute(sql`
      delete from users u
      where lower(u.email) like ${`%@${DEMO_EMAIL_DOMAIN}`} and u.created_at < ${cutoff}
        and not exists (select 1 from memberships m where m.user_id = u.id)
      returning u.id`);
    const count = (r: unknown) => (Array.isArray(r) ? r.length : ((r as { rows?: unknown[] }).rows?.length ?? 0));
    return { users: count(users), workspaces: count(ws) };
  });
}
