# ADR-0002: Keep the job queue in Postgres (pg-boss)

- Status: Proposed
- Date: 2026-10-28

## Context
Runs take minutes and must survive restarts. Options: Redis-based queue (BullMQ), a hosted
queue, or a Postgres-based queue.

## Decision
Use pg-boss on the main Postgres database.

## Consequences
- One less service to run, secure, back up, and pay for.
- Job state and run state can change in the same transaction.
- Throughput is far below Redis queues, but our load is small (hundreds of jobs per run,
  not thousands per second). Revisit if queue latency exceeds the targets in QUALITY.md.
