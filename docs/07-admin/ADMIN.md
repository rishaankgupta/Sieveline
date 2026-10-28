# Admin panel

Last updated: 2026-10-28

Owner's request: manage **everything** from one place. This page lists what the admin panel
controls, and the few things that deliberately stay outside it (and why).

Lives at `/admin` in the same app. Only users with the **platform admin** role can open it.

## 1. What you can manage

| Area | What you can see | What you can do |
|---|---|---|
| **Overview** | Signups, active buyers, runs today, credits and $ spent (Tavily, LLM), revenue, error rate, slowest steps | Jump to any problem |
| **Users** | Every user: email, workspaces, sign-in history, 2FA status, plan | Suspend / unsuspend, force sign-out, reset 2FA, resend verification, delete (with data export first) |
| **Workspaces** | Members, plan, credit cap, usage, runs, invoices | Change plan, change caps, grant or refund credits, transfer ownership, suspend |
| **View as user** | The app exactly as a buyer sees it | Read-only by default; every session is logged and the user can see it in their audit log |
| **Runs** | Every run, its stages, credits per stage, failures, timings | Cancel, retry a failed stage, re-run, mark as refunded |
| **Deep dives** | Requests, status, cost | Cancel, refund |
| **Advisor chats** | Message counts, cost, flagged answers (failed citation checks) | Review flagged answers; open the thread only with a logged reason (privacy) |
| **Research settings** | Current values | Change without redeploy: search depth per stage, how many candidates per stage, shortlist size (default 10), cache lifetime, crawl limits, Research model (mini/pro), retry rules |
| **AI models and prompts** | Active model per job (scoring, chat, query planning) and prompt versions | Switch model, edit a prompt as a new version, test it on a saved sample, roll back |
| **Thesis templates** | All templates (e.g. calibration labs) | Create, edit, publish, retire |
| **Blocklists** | Directory sites, competitor domains, known group/PE owners | Add, remove, import |
| **Plans and pricing** | Plans, limits, Stripe sync status | Create/edit plans and limits; prices sync to Stripe |
| **Billing** | Subscriptions, invoices, failed payments | Refund, credit note, cancel (actions go through Stripe) |
| **Spend controls** | Daily and monthly spend vs limits, Tavily ledger vs Tavily's own usage | Change global limits, **pause all research (kill switch)**, pause one workspace |
| **Feature flags** | Every flag and who it's on for | Turn features on for everyone, a plan, or one workspace |
| **Announcements** | Banners and in-app notices | Publish, schedule, expire |
| **Email templates** | Verification, reset, run finished, invoices | Edit text, preview, send test |
| **Integrations health** | Tavily, LLM, Stripe, email, Cloudflare: last success, error rate | "Test connection" button for each |
| **Privacy requests** | Export and deletion requests | Fulfil, track deadlines |
| **Audit log** | Every admin and user action | Search, filter, export |
| **System health** | Workflow queue, failed steps, database size, slow queries | Retry failed steps in bulk |

## 2. What stays outside the admin panel, on purpose

| Thing | Where it lives | Why |
|---|---|---|
| API keys and secrets (Tavily, LLM, Stripe…) | Vercel environment variables | If the admin panel were hacked, keys would leak. The panel shows **whether** each key is set and working, and links to where to rotate it |
| Code and database structure changes | Git + deploys | Changes must be reviewed and reversible |
| Raw database access | Neon console | Too easy to break data by accident; the panel covers everyday needs |

## 3. Security rules for the admin panel

- Separate **platform admin** role; not grantable from inside a workspace.
- **2FA required** for admins (TOTP or passkey), from day one.
- **Step-up check** (re-enter 2FA) before dangerous actions: delete user, refunds, kill switch,
  changing limits, editing prompts, view-as.
- Every admin action writes to the audit log with before/after values.
- Admin sessions expire after 30 minutes idle.
- Optional IP allowlist for `/admin`.
- Settings changes are versioned and can be rolled back.

## 4. Roles (if you add staff later)

| Role | Can |
|---|---|
| Owner | Everything, including managing admins |
| Admin | Everything except managing admins and kill switch |
| Support | Users, workspaces (read), view-as, resend emails, privacy requests |
| Finance | Billing, refunds, revenue |
| Viewer | Read-only dashboards |
