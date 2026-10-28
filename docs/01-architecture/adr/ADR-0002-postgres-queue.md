# ADR-0002: Keep the job queue in Postgres (pg-boss)

- Status: **Superseded by ADR-0004** (2026-10-28)
- Date: 2026-10-28

## Why superseded
The owner chose Vercel for hosting. pg-boss needs a long-running worker process, which Vercel
Functions are not. ADR-0004 replaces it with Vercel Workflow.

## Original decision (kept for history)
Use pg-boss on the main Postgres database to avoid running Redis.
