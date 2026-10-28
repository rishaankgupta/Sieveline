# Product Requirements (v1)

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
| **Operator** (you, at first) | Run lists for clients, review quality before delivery | Daily |
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
7. **Results table**: sort, filter by status/score/state, search by name.
8. **Evidence panel**: for every fact, the exact quote and a link to the page it came from.
   Answers without a real quote are shown as "unknown".
9. **Review**: mark each company "approved", "rejected", or "needs check", with notes.
10. **Export**: CSV and Excel, safe against spreadsheet formula injection.
11. **Usage metering**: credits used per run and per workspace, with monthly caps.
12. **Billing**: Stripe checkout, plans, invoices, webhooks (model to be decided, see DECISIONS-NEEDED).
13. **Audit log**: who ran, exported, changed, or invited what, and when.
14. **Admin console** (operator only): all workspaces, runs, failures, costs.
15. **Legal pages**: Terms, Privacy, cookie notice.

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

## 5. Main risk (stated plainly)

The business plan said to sell 3 hand-made lists before building software. This build starts
before that validation. To limit the risk, Milestone 3 includes a quality check on real data,
and the roadmap allows you to send lists to buyers as soon as M5 is done, before billing exists.
