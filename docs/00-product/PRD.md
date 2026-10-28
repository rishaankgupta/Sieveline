# Sieveline: Product Requirements (v1)

Last updated: 2026-10-28

## 1. Problem

People who buy small businesses (search funders, self-funded searchers, independent sponsors,
small PE firms, brokers) spend weeks finding companies that match their criteria, because the
best companies are not listed for sale. Existing databases are broad, expensive
(Grata starts around $15k/year), or cover only a few industries.

## 2. Who uses it

| User | Goal | How often |
|---|---|---|
| **Buyer** (searcher, sponsor) | Get a list of companies that fit their thesis, with proof | Weekly to monthly during a 1–2 year search |
| **Operator** (you) | Watch quality, costs and failures across all workspaces | Daily |
| **Workspace admin** | Manage teammates, billing, usage limits | Monthly |

## 3. What v1 does

### Must have (launch blockers)
1. **Accounts**: sign up, sign in, sign out, password reset, email verification.
2. **Workspaces**: one or more per user; roles: owner, member, viewer.
3. **Thesis builder**: industry, places, years in business, exclusions (companies/domains),
   and yes/no questions with weights and "required" flags. Start from a template.
4. **Cost estimate before running**: show the maximum credits a run can use.
5. **Research runs**: run in the background, show live progress, survive restarts,
   stop at the workspace's credit limit, can be cancelled.
6. **Seed upload**: add the buyer's own company list (CSV), validated.
7. **Shortlist first** (ADR-0005): the buyer sees the top 10, each with a one-line reason and its
   strongest evidence. The full checked list is one click away but never the default.
8. **Advisor chat**: talk to the results to filter, re-rank, compare, explain, pin or hide.
   Answers come only from collected evidence and cite it; if evidence is missing it says so.
9. **Deep dive**: for 1–5 chosen companies, a full dossier (ownership, history, services,
   customers, risks, sources) via Tavily Research, after the buyer confirms the credit cost.
10. **Evidence panel**: for every fact, the exact quote and a link to the page it came from.
   Answers without a real quote are shown as "unknown".
11. **Review**: mark each company "approved", "rejected", or "needs check", with notes.
12. **Export**: CSV and Excel, safe against spreadsheet formula injection.
13. **Usage metering**: credits used per run and per workspace, with monthly caps.
14. **Billing**: Stripe checkout, plans, invoices, webhooks (model to be decided, see DECISIONS-NEEDED).
15. **Audit log**: who ran, exported, changed, or invited what, and when.
16. **Admin panel**: manage users, workspaces, plans, credits, runs, research settings, AI models and prompts, templates, blocklists, feature flags, billing, spend limits and kill switch, privacy requests, audit log (full list: `docs/07-admin/ADMIN.md`).
17. **Legal pages**: Terms, Privacy, cookie notice.

### Should have (soon after launch)
- Re-run a list to find new companies and changes since last time.
- Share a read-only result link with an expiry.
- Two-factor sign-in (TOTP).
- CRM export (HubSpot, Salesforce).

### Not in v1 (on purpose)
- Owner contact details (emails, phones). Needs a separate licensed data source and adds legal risk.
- Sending outreach emails. Keeps us out of anti-spam law exposure.
- Mobile apps. The web app will work on phones, but the main use is desktop.

## 4. Success measures

| Measure | Target | How we check |
|---|---|---|
| Facts with a verifiable quote | 100% of yes/no answers | Automatic check in the pipeline |
| Facts correct when checked by hand | ≥ 90% on a 50-row sample per industry | Manual review in M3 and before each new industry |
| Share of companies new to the buyer | ≥ 30% (to be validated with real buyers) | Ask buyers after each sample |
| Run completes (150 companies) | p95 under 20 minutes | Measured in M3; target may change after measurement |
| Shortlist usefulness | Buyer would contact ≥ 5 of the 10 | Ask buyers after each run |
| Advisor answers with valid citations | 100% of factual sentences | Server-side citation check + eval set of 50 questions |

## 5. Main risk (stated plainly)

The business plan said to sell 3 hand-made lists before building software. This build starts
before that validation. To limit the risk, Milestone 3 includes a quality check on real data,
and the roadmap allows you to send lists to buyers as soon as M5 is done, before billing exists.
