# ADR-0004: Vercel + Neon, with Vercel Workflow for research runs

- Status: Accepted (owner chose Vercel and Neon on 2026-10-28)
- Date: 2026-10-28

## Context
Research runs take minutes. Vercel Functions are time-limited invocations. Per Vercel's
documentation and changelog (read 2026-10-28): functions default to 300 s; Pro/Enterprise can
extend further (up to 30 minutes, in beta); Vercel Workflow provides durable, retryable steps.

## Decision
- **Web + API:** Next.js on Vercel.
- **Research runs:** Vercel Workflow. Each pipeline stage (and each batch inside a stage) is a
  separate step, so no single step needs a long timeout and a failure retries only that step.
- **Database:** Neon Postgres. Pooled connection string for app traffic, direct connection for
  migrations. Neon branches give each preview deployment its own database copy.
- **Chat streaming:** Vercel AI SDK, streamed from a route handler.

## Consequences
- Fewer services: no separate worker host, no queue server.
- Steps are designed to finish in under 300 s so they work on any plan.
- **Vercel's Hobby plan is for non-commercial use**, so production needs a paid Vercel plan.
  Confirm current plan terms and pricing before launch.
- Vendor lock-in to Vercel Workflow. Mitigation: pipeline logic lives in `packages/core` as plain
  functions; the Workflow layer only calls them. Moving to another runner (e.g. Inngest) would
  replace only that thin layer.
- Exact API details of Vercel Workflow are checked against current docs in M1-T09 before use.

## M1-T09 spike result (2026-10-28)
Workflow SDK 5.2 (`workflow` package), docs read from the installed package.
- `"use workflow"` orchestrates; `"use step"` functions do the work with full Node.js access.
- Steps retry 3 times by default; `FatalError` stops retries; `RetryableError` sets a delay
  (maps directly onto Tavily `Retry-After`).
- `getStepMetadata().stepId` is stable across retries: use it as the idempotency key for credit
  reservations so a retried step never reserves twice.
- Arguments and results must be serializable: pass ids, not database objects.
- Runs anywhere: Vercel World in production, Local World in development, and a Postgres World
  (reference implementation) if we ever leave Vercel.
- Verified with an in-process integration test (`src/workflows/spike.integration.test.ts`):
  parallel batch steps, retry of only the failed batch, and FatalError ending the run.
- Next.js wiring: `withWorkflow()` in `next.config.ts`; the proxy matcher excludes
  `/.well-known/workflow/`. Confirmed a POST to the workflow route is not redirected.
