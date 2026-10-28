# Sieveline

Sieveline helps people who want to buy a small business find the right ones.
The buyer describes what they want. Sieveline researches the web widely, checks every company
against the buyer's rules with a quote as proof, and shows a **short list of the best 10**.
The buyer then **chats with the results** to filter, compare, and pick, and can order a deep dive
on any company.

Stack: Next.js on Vercel, Neon Postgres, Vercel Workflow, Tavily (all endpoints), any LLM.

> Status: **Milestone 0 (planning) complete; M1 next**. No application code yet. See `docs/05-plan/ROADMAP.md`.

## Where things are

| Path | What it holds |
|---|---|
| `docs/00-product/PRD.md` | What we are building, for whom, and what is out of scope |
| `docs/01-architecture/ARCHITECTURE.md` | System design, data model, research pipeline |
| `docs/01-architecture/TAVILY-STRATEGY.md` | How every Tavily endpoint is used, costs, rate limits |
| `docs/01-architecture/adr/` | Architecture decision records (one decision per file) |
| `docs/02-security/SECURITY.md` | Threat model and security controls |
| `docs/03-quality/QUALITY.md` | Performance budgets, reliability targets, accessibility, testing |
| `docs/04-design/DESIGN.md` | Screens, user flows, design system rules |
| `docs/05-plan/ROADMAP.md` | Milestones, tasks, acceptance criteria, status |
| `docs/05-plan/DECISIONS-NEEDED.md` | Owner decisions (answered and open) |
| `docs/07-admin/ADMIN.md` | Everything the admin panel controls, and its security rules |
| `docs/06-operations/` | Deployment and runbooks (filled in during Milestone 7–8) |
| `PROGRESS_LOG.md` | Timestamped record of every completed change (UTC) |
| `.env.example` | Every secret and setting the app needs, with empty placeholders |

## Rules for working in this repo

1. Every completed task gets a line in `PROGRESS_LOG.md` with a UTC timestamp.
2. Every task's status is updated in `ROADMAP.md` in the same change.
3. A task is "done" only when its acceptance criteria are met and checked, not when code exists.
4. Any decision that is hard to reverse gets an ADR.
5. Secrets never go in the repo. Only `.env.example` with empty values is committed.

The earlier Python prototype in `../target-finder/` is kept as a reference for porting
the research logic (quote verification, signal patterns). It is not part of this product.
