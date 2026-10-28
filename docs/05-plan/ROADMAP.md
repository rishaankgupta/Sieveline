# Roadmap

Last updated: 2026-10-28T09:51Z

Status values: `todo`, `in progress`, `blocked`, `done`.
Size: **S** ≈ under 1 working session, **M** ≈ 1–2 sessions, **L** ≈ 3+ sessions.
Calendar dates are not promised: progress depends on how quickly decisions and keys arrive.
Real start and finish times are recorded in `PROGRESS_LOG.md`.

Each milestone ends with a **gate**: its checks must pass before the next milestone starts.

---

## M0 — Planning (now)

| ID | Task | Size | Status | Done when |
|---|---|---|---|---|
| M0-T01 | Write PRD, architecture, ADRs, security, quality, design, roadmap | M | done | Docs exist and are linked from README |
| M0-T02 | Owner answers DECISIONS-NEEDED (at least D1–D4) | S | blocked (owner) | Answers recorded in that file |
| M0-T03 | Create Git remote (GitHub repo) and push | S | blocked (owner, D9) | Repo URL in README |

**Gate:** owner has reviewed the plan and answered D1–D4.

## M1 — Foundation

| ID | Task | Size | Status | Done when |
|---|---|---|---|---|
| M1-T01 | Monorepo: `apps/web`, `apps/worker`, `packages/core`, `packages/db`; pnpm workspaces | S | todo | `pnpm install` and `pnpm build` succeed |
| M1-T02 | Lint, format, strict TypeScript, commit hooks | S | todo | `pnpm check` passes on clean repo |
| M1-T03 | Env config loading with Zod validation; app refuses to start with missing secrets | S | todo | Unit test covers missing/invalid vars |
| M1-T04 | Local dev: Postgres container, seed script, one-command start | S | todo | Fresh clone runs in ≤ 10 min following README |
| M1-T05 | Database schema + migrations for all tables in ARCHITECTURE §4 | M | todo | Migrations apply and roll back on empty DB |
| M1-T06 | Row-level security policies + workspace context per request | M | todo | Test proves a query without workspace context returns nothing |
| M1-T07 | Structured logging, error tracking, request ids | S | todo | Errors appear in tracker with request id, no secrets |
| M1-T08 | CI: lint, types, unit tests, dependency + secret scan, build images | M | todo | CI green on main; a planted fake secret is caught |

**Gate:** CI green; cross-workspace RLS test passes.

## M2 — Accounts and workspaces

| ID | Task | Size | Status | Done when |
|---|---|---|---|---|
| M2-T01 | Auth spike and decision (ADR-0003) | S | todo | ADR accepted |
| M2-T02 | Sign up, verify email, sign in, sign out, reset password | M | todo | E2E test for each flow |
| M2-T03 | Google sign-in | S | todo | E2E with mocked provider |
| M2-T04 | Rate limiting on auth and API routes | S | todo | 11th failed sign-in in a minute is blocked |
| M2-T05 | Workspaces, roles, invites, remove member | M | todo | Permission matrix test passes |
| M2-T06 | Audit log writes + viewer page | S | todo | Each listed action creates a log row |
| M2-T07 | Security headers + CSP with nonces | S | todo | Header test passes; no CSP errors on pages |

**Gate:** all auth E2E tests pass; permission matrix test passes.

## M3 — Research engine

| ID | Task | Size | Status | Done when |
|---|---|---|---|---|
| M3-T01 | Tavily client: search, extract, retries, timeouts, usage tracking | M | todo | Contract tests against recorded responses |
| M3-T02 | Response cache in Postgres with expiry | S | todo | Second identical call makes no network request |
| M3-T03 | LLM client (OpenAI-compatible), strict JSON parsing, timeouts | S | todo | Malformed output handled without crashing a run |
| M3-T04 | Credit reservation, monthly caps, global daily ceiling | M | todo | Tests: run stops at cap; unused credits released |
| M3-T05 | Port prototype logic: signals, quote check, scoring (with tests) | M | todo | Prototype cases reproduced; ≥ 90% coverage |
| M3-T06 | Pipeline steps as pg-boss jobs; resume after crash; watchdog | L | todo | Kill worker mid-run → run resumes and finishes |
| M3-T07 | Seed CSV import with validation and limits | S | todo | Bad files rejected with clear errors |
| M3-T08 | **Real-data spike (needs Tavily + LLM keys):** 50 calibration labs | M | blocked (keys) | Quality report: text rate, accuracy on 50 hand-checked rows, cost, time |

**Gate:** real-data report meets QUALITY.md §5, or a written decision on what to change.

## M4 — Theses and runs (UI)

| ID | Task | Size | Status | Done when |
|---|---|---|---|---|
| M4-T01 | Design tokens, layout shell, navigation, light/dark | M | todo | axe: 0 serious issues |
| M4-T02 | Thesis builder (step form) + calibration-lab template | M | todo | E2E: create, edit, version a thesis |
| M4-T03 | Cost estimate before run | S | todo | Estimate ≥ actual in 20 test runs |
| M4-T04 | Run page with live progress and cancel | M | todo | Progress updates ≤ 5 s; cancel stops spending |
| M4-T05 | Dashboard (recent runs, credits left) | S | todo | Matches usage table totals |

## M5 — Results, evidence, review, export

| ID | Task | Size | Status | Done when |
|---|---|---|---|---|
| M5-T01 | Results table: virtualized, sort, filter, search | M | todo | 500 rows smooth; filters correct |
| M5-T02 | Evidence panel with quotes and source links | M | todo | Every fact shows quote + link |
| M5-T03 | Review actions, notes, keyboard shortcuts, bulk actions | M | todo | Keyboard-only review E2E passes |
| M5-T04 | CSV + Excel export with formula-injection escaping | S | todo | Test: `=cmd` cell exported as text |

**Gate:** you can produce and send a real list to a buyer from the app. (Selling can start here.)

## M6 — Billing and usage

| ID | Task | Size | Status | Done when |
|---|---|---|---|---|
| M6-T01 | Pricing model decided (D5) and plans configured in Stripe | S | blocked (owner) | Plans exist in Stripe test mode |
| M6-T02 | Checkout, customer portal, plan limits | M | todo | E2E in Stripe test mode |
| M6-T03 | Webhooks: verified, idempotent | S | todo | Replayed event changes nothing |
| M6-T04 | Usage history page and monthly reset | S | todo | Totals match usage events |

## M7 — Hardening

| ID | Task | Size | Status | Done when |
|---|---|---|---|---|
| M7-T01 | ASVS L2 review + fixes | L | todo | Checklist with every item marked |
| M7-T02 | ZAP baseline scan on staging | S | todo | No high findings open |
| M7-T03 | Performance pass against QUALITY.md budgets | M | todo | Lighthouse/field numbers recorded |
| M7-T04 | Accessibility manual pass (keyboard + screen reader) | M | todo | Issues fixed or logged |
| M7-T05 | Load test (k6) | S | todo | Targets in QUALITY.md met |
| M7-T06 | Backups + tested restore | S | todo | Restore drill recorded |
| M7-T07 | Terms, Privacy, cookie notice (drafts; legal review is yours) | S | todo | Pages live; flagged for lawyer review |
| M7-T08 | Admin console | M | todo | Operator sees all runs, failures, spend |

## M8 — Launch

| ID | Task | Size | Status | Done when |
|---|---|---|---|---|
| M8-T01 | Production hosting, domain, TLS, email DNS (SPF, DKIM, DMARC) | M | blocked (owner, D1/D3/D7) | Site live on HTTPS; test email passes DMARC |
| M8-T02 | Monitoring, uptime checks, spend alerts | S | todo | Test alert received |
| M8-T03 | Runbooks: deploy, rollback, incident, key rotation | S | todo | Docs in `docs/06-operations/` |
| M8-T04 | Production smoke test | S | todo | Sign-up → run → export works in prod |

**Gate:** smoke test passes; rollback tested once.
