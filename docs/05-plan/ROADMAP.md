# Roadmap

Last updated: 2026-10-28 (M3 research engine mostly built)

Status values: `todo`, `in progress`, `blocked`, `done`.
Size: **S** ≈ under 1 working session, **M** ≈ 1–2 sessions, **L** ≈ 3+ sessions.
Calendar dates are not promised: progress depends on decisions and keys.
Real start and finish times are recorded in `PROGRESS_LOG.md`.

Each milestone ends with a **gate**: its checks must pass before the next milestone starts.

---

## M0 — Planning

| ID | Task | Size | Status | Done when |
|---|---|---|---|---|
| M0-T01 | Planning docs: PRD, architecture, ADRs, security, quality, design, roadmap | M | done | Docs exist and are linked from README |
| M0-T02 | Owner decisions D1–D4 | S | done (D4 deferred to M3) | Recorded in DECISIONS-NEEDED |
| M0-T03 | Update plan for shortlist + Advisor chat, Vercel + Neon, full Tavily strategy | S | done | ADR-0004, ADR-0005, TAVILY-STRATEGY.md |
| M0-T05 | Plan admin panel and Cloudflare role | S | done | ADMIN.md, ADR-0006 |
| M0-T04 | Git remote (GitHub repo) and push | S | blocked (owner, D9) | Repo URL in README |

**Gate:** owner confirms the name (D1) and the updated plan.

## M1 — Foundation

| ID | Task | Size | Status | Done when |
|---|---|---|---|---|
| M1-T01 | Monorepo: `apps/web`, `packages/core`, `packages/db`; pnpm workspaces | S | done | `pnpm install` and `pnpm build` succeed |
| M1-T02 | Lint, format, strict TypeScript, commit hooks | S | done (lint + strict types; commit hooks deferred) | `pnpm check` passes on clean repo |
| M1-T03 | Env config with Zod validation; app refuses to start with missing secrets | S | done | Unit test covers missing/invalid vars |
| M1-T04 | Neon project: main + dev branches; preview deploys get their own branch | S | blocked (owner: Neon account) | Migrations run on a fresh branch |
| M1-T05 | Schema + migrations for all tables in ARCHITECTURE §4 | M | done | Migrations apply and roll back |
| M1-T06 | Row-level security + workspace context per request | M | done | Query without workspace context returns nothing |
| M1-T07 | Structured logging, error tracking, request ids | S | in progress (redacting JSON logger done; Sentry needs a free account) | Errors arrive with request id, no secrets |
| M1-T08 | CI: lint, types, tests, dependency + secret scan; Vercel preview per PR | M | in progress (workflow written; runs when GitHub is connected) | CI green; a planted fake secret is caught |
| M1-T09 | Vercel Workflow spike: step retries, timeouts, local dev, costs (check current docs) | S | done | Short report in ADR-0004 |

**Gate:** CI green; RLS test passes; Workflow spike confirms the design.

## M2 — Accounts and workspaces

| ID | Task | Size | Status | Done when |
|---|---|---|---|---|
| M2-T01 | Auth spike and decision (ADR-0003) | S | done (Better Auth, ADR-0003) | ADR accepted |
| M2-T02 | Sign up, verify email, sign in, sign out, reset password | M | done (API-level tests on real Postgres; browser E2E after Neon is connected) | E2E test for each flow |
| M2-T03 | Google sign-in | S | in progress (configured; needs Google OAuth credentials to test) | E2E with mocked provider |
| M2-T04 | Rate limiting on auth, API and chat routes | S | in progress (auth routes done and tested; API and chat routes when they exist) | 11th failed sign-in in a minute is blocked |
| M2-T05 | Workspaces, roles, invites, remove member | M | in progress (permission matrix + workspace on sign-up done; invites and role changes next) | Permission matrix test passes |
| M2-T06 | Audit log writes + viewer page | S | in progress (writes for workspace creation; viewer page next) | Each listed action creates a log row |
| M2-T07 | Security headers + CSP with nonces | S | done | Header test passes; no CSP errors |

**Gate:** auth E2E and permission matrix tests pass.

## M3 — Research engine (full Tavily funnel)

| ID | Task | Size | Status | Done when |
|---|---|---|---|---|
| M3-T01 | Tavily client for Search, Map, Extract, Crawl, Research (+ polling/stream), Usage; per-endpoint rate limiters; `Retry-After`; timeouts | L | in progress (all endpoints done and tested with mocks and a fake HTTP server; real recordings in M3-T10) | Contract tests against recorded responses for every endpoint |
| M3-T02 | Response cache in Postgres with expiry | S | done | Repeat call makes no network request |
| M3-T03 | LLM client via AI SDK; strict JSON schemas; timeouts | S | done (AI SDK, any OpenAI-compatible provider; tested against a fake server) | Malformed output handled without crashing a run |
| M3-T04 | Credit ledger: reserve, reconcile from `usage.credits`, monthly caps, global daily ceiling, daily check against Tavily usage endpoint | M | in progress (reservation, caps, daily ceiling, per-call budget guard done; daily reconcile with Tavily usage endpoint next) | Tests: run stops at cap; unused credits released; >5% drift alerts |
| M3-T05 | Port prototype logic: signals, quote check, scoring (with tests) | M | done | Prototype cases reproduced; ≥ 90% coverage |
| M3-T06 | Query planner: thesis → 10–30 search variants | S | in progress (planner done; the 20% eval needs real data in M3-T10) | Eval: variants find ≥ 20% more unique domains than fixed templates |
| M3-T07 | Pipeline stages 1–12 as Workflow steps; batching; resume; watchdog | L | in progress (stages as durable steps, early stop on credits, end-to-end test done; stuck-run watchdog next) | Kill mid-run → resumes and finishes |
| M3-T08 | Red-flag news checks and Crawl deep read for top candidates | M | done | Flags appear with dates and links |
| M3-T09 | Seed CSV import with validation and limits | S | in progress (API accepts a validated seed domain list; CSV upload UI in M4) | Bad files rejected with clear errors |
| M3-T10 | **Real-data spike (needs Tavily + LLM keys):** calibration labs | M | blocked (keys) | Report: text rate, accuracy on 50 hand-checked rows, credits per stage, time |

**Gate:** real-data report meets QUALITY.md §5, or a written decision on what to change.

## M4 — Thesis and run experience

| ID | Task | Size | Status | Done when |
|---|---|---|---|---|
| M4-T01 | Design tokens, layout shell, navigation, light/dark | M | in progress (tokens, light/dark, skip link) | axe: 0 serious issues |
| M4-T02 | Plain-words thesis entry → editable rules; calibration-lab template | M | todo | E2E: describe, edit, save, version |
| M4-T03 | Cost estimate before run | S | todo | Estimate ≥ actual in 20 test runs |
| M4-T04 | Run page with live progress per stage and cancel | M | todo | Updates ≤ 5 s; cancel stops spending |
| M4-T05 | Dashboard (recent runs, credits left) | S | todo | Matches ledger totals |

## M5 — Shortlist, Advisor, evidence, export

| ID | Task | Size | Status | Done when |
|---|---|---|---|---|
| M5-T01 | Shortlist builder: top 10, one-line reasons, best evidence | M | todo | Every reason cites at least one fact |
| M5-T02 | Shortlist screen with cards, pin/hide, live updates | M | todo | E2E: pin/hide persists |
| M5-T03 | Advisor chat: streaming, tools (filter, rank, compare, explain, pin, hide) | L | todo | Tool calls change the shortlist; history saved |
| M5-T04 | Grounding checks: cited fact ids validated; "not in evidence" path | M | todo | Eval set of 50 questions: 100% valid citations, 0 invented facts |
| M5-T05 | Deep dive: Research with `output_schema` + evidence files, streamed, cost confirm | M | todo | Dossier renders with sources; credits recorded |
| M5-T06 | Full list table: virtualized, sort, filter, search | M | todo | 500 rows smooth |
| M5-T07 | Evidence panel, review actions, notes, keyboard shortcuts | M | todo | Keyboard-only review E2E passes |
| M5-T08 | CSV + Excel export with formula-injection escaping | S | todo | `=cmd` exported as text |

**Gate:** a real buyer can go from thesis to shortlist to deep dive. (Selling can start here.)

## M6 — Billing and usage

| ID | Task | Size | Status | Done when |
|---|---|---|---|---|
| M6-T01 | Pricing model (D5) and plans in Stripe | S | blocked (owner) | Plans exist in test mode |
| M6-T02 | Checkout, customer portal, plan limits (lists, deep dives, chat) | M | todo | E2E in test mode |
| M6-T03 | Webhooks: verified, idempotent | S | todo | Replayed event changes nothing |
| M6-T04 | Usage history page and monthly reset | S | todo | Totals match ledger |

## MA — Admin panel (see `docs/07-admin/ADMIN.md`)

| ID | Task | Size | Status | Done when |
|---|---|---|---|---|
| MA-T01 | Platform admin roles, mandatory 2FA, step-up checks, idle timeout | M | todo | Non-admin gets 404 on `/admin`; dangerous actions need fresh 2FA |
| MA-T02 | Settings store: versioned, cached, rollback; read by pipeline at run start | M | todo | Changing shortlist size takes effect on next run without redeploy |
| MA-T03 | Overview dashboard (usage, spend, revenue, errors) | M | todo | Numbers match ledger and Stripe |
| MA-T04 | Users and workspaces: suspend, caps, credit grants/refunds, ownership transfer | M | todo | Each action audited with before/after |
| MA-T05 | View-as user (read-only, logged, visible to user) | M | todo | Session appears in user's audit log |
| MA-T06 | Runs and deep dives: cancel, retry stage, re-run, refund | M | todo | Retried stage resumes correctly |
| MA-T07 | Research settings, models and prompt versions with test-on-sample and rollback | L | todo | Prompt rollback restores previous output on sample |
| MA-T08 | Templates, blocklists, feature flags, announcements, email templates | M | todo | Each editable and audited |
| MA-T09 | Plans/pricing synced to Stripe; billing actions | M | todo | Plan edit reflected in Stripe test mode |
| MA-T10 | Spend controls: global limits, kill switch, per-workspace pause | S | todo | Kill switch stops new steps within 60 s |
| MA-T11 | Integrations health + "test connection"; secrets status (set / working) only | S | todo | Panel never displays a secret value |
| MA-T12 | Privacy requests, audit log search/export, system health | M | todo | Export and deletion complete end to end |
| MA-T13 | Admin staff roles (owner, admin, support, finance, viewer) | S | todo | Permission matrix test passes |

**Gate:** admin permission tests pass; every admin action appears in the audit log.

## M7 — Hardening

| ID | Task | Size | Status | Done when |
|---|---|---|---|---|
| M7-T01 | ASVS L2 review + fixes | L | todo | Every item marked |
| M7-T02 | ZAP baseline scan on staging | S | todo | No high findings open |
| M7-T03 | Performance pass against QUALITY.md | M | todo | Numbers recorded |
| M7-T04 | Accessibility manual pass | M | todo | Issues fixed or logged |
| M7-T05 | Load test (k6), including chat | S | todo | Targets met |
| M7-T06 | Neon backups / point-in-time restore drill | S | todo | Drill recorded |
| M7-T07 | Terms, Privacy, cookie notice (drafts; legal review is yours) | S | todo | Pages live, flagged for review |

## M8 — Launch

| ID | Task | Size | Status | Done when |
|---|---|---|---|---|
| M8-T01 | Vercel production (paid plan); domain + DNS on Cloudflare; TLS; email DNS (SPF, DKIM, DMARC) | M | blocked (owner access) | Site live; test email passes DMARC |
| M8-T05 | Cloudflare Turnstile on auth forms; R2 bucket for exports (ADR-0006) | S | in progress (Turnstile wired into sign-up/sign-in; R2 later) | Bot check blocks scripted sign-up in test; exports served from R2 with expiring links |
| M8-T02 | Monitoring, uptime checks, spend alerts | S | todo | Test alert received |
| M8-T03 | Runbooks: deploy, rollback, incident, key rotation | S | todo | Docs in `docs/06-operations/` |
| M8-T04 | Production smoke test | S | todo | Sign-up → shortlist → chat → export works |

**Gate:** smoke test passes; rollback tested once.
