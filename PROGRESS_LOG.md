# Progress log

All times UTC. Newest first. One line per completed task or notable change.

| Time (UTC) | Task | Change | Checked by |
|---|---|---|---|
| 2026-10-28T11:01:14Z | M1-T08 | CI workflow: lint, types, tests, build, dependency audit, gitleaks secret scan. Overrode a dev-only vulnerable esbuild (GHSA-67mh-4wv8-2f99) pulled by drizzle-kit | `pnpm audit`: no known vulnerabilities; workflow not yet run (no GitHub remote) |
| 2026-10-28T11:01:14Z | M1-T01/T02/T03 | Monorepo (pnpm): apps/web (Next.js 16), packages/core, packages/db; strict TypeScript 6; ESLint strict; config validation that refuses to start on bad settings | `pnpm check` green; `next build` OK; server started: health 200, http APP_URL in production rejected, no secrets in logs or responses |
| 2026-10-28T11:01:14Z | M1-T05/T06 | Database schema (19 tables) + migrations; row-level security forced on all tenant tables; separate app and admin roles; per-transaction tenant context | 10 RLS tests pass on real Postgres (PGlite): cross-workspace read/write/update/delete blocked, app cannot edit settings, usage is append-only |
| 2026-10-28T11:01:14Z | M3-T01/T04/T05 | Tavily client (Search, Extract, Map, Crawl, Research create/poll, Usage) with per-endpoint rate limits, Retry-After, caching, credit reporting; credit budget logic; ported signals, quote check, scoring, shortlist, safe CSV | 37 core tests pass; coverage 95% lines / 88% branches |
| 2026-10-28T11:01:14Z | M4-T01 | Design tokens (light/dark), skip link, focus styles, reduced motion, temporary home page | Build output checked |
| 2026-10-28T10:23:36Z | M0-T05 | Added admin panel plan (docs/07-admin/ADMIN.md, new milestone MA with 13 tasks) and Cloudflare role (ADR-0006: Vercel app + Cloudflare DNS, Turnstile, R2); security, PRD, env updated | Cloudflare, OpenNext, Neon docs read same day |
| 2026-10-28T10:23:36Z | M0-T02 | D1 confirmed: name Sieveline | - |
| 2026-10-28T10:12:17Z | M0-T03 | Plan updated for owner decisions: name Sieveline proposed (domain + web checks), shortlist + Advisor chat (ADR-0005), Vercel + Neon + Vercel Workflow (ADR-0004, supersedes ADR-0002), full Tavily funnel (TAVILY-STRATEGY.md), roadmap rewritten (M3, M5 expanded) | Tavily, Vercel docs read same day; links checked |
| 2026-10-28T10:12:17Z | M0-T02 | Owner decisions recorded: D2 shortlist + chat, D3 Vercel + Neon, D4 deferred | - |
| 2026-10-28T09:54:15Z | M0-T01 | Created planning docs: PRD, architecture, ADR-0001..0003, security, quality, design, roadmap, decisions, .env.example, .gitignore | Files reviewed; README links resolve |
| 2026-10-28T09:51:56Z | M0 | Planning started | - |
