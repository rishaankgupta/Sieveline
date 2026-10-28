# TargetFinder Platform (working name)

A web app that builds researched lists of small companies a buyer could acquire.
The buyer describes what they want (a "thesis"). The system finds matching company websites,
reads them, checks each company against the buyer's rules, and shows the results with the
exact website sentence behind every fact.

> Status: **Milestone 0 (planning)**. No application code yet. See `docs/05-plan/ROADMAP.md`.

## Where things are

| Path | What it holds |
|---|---|
| `docs/00-product/PRD.md` | What we are building, for whom, and what is out of scope |
| `docs/01-architecture/ARCHITECTURE.md` | System design, data model, research pipeline |
| `docs/01-architecture/adr/` | Architecture decision records (one decision per file) |
| `docs/02-security/SECURITY.md` | Threat model and security controls |
| `docs/03-quality/QUALITY.md` | Performance budgets, reliability targets, accessibility, testing |
| `docs/04-design/DESIGN.md` | Screens, user flows, design system rules |
| `docs/05-plan/ROADMAP.md` | Milestones, tasks, acceptance criteria, status |
| `docs/05-plan/DECISIONS-NEEDED.md` | Questions the owner must answer, and the default used until then |
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
