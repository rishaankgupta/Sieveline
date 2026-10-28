# ADR-0001: Use TypeScript everywhere (web app and research pipeline)

- Status: Proposed
- Date: 2026-10-28

## Context
The prototype is Python. The web app needs a modern UI framework. Running Python for the research pipeline
and TypeScript for the web means two toolchains, two sets of types for the same data, and two
dependency audits.

## Decision
Use TypeScript for both. Port the prototype's logic (signal patterns, quote check, scoring)
to a shared package with unit tests that reproduce the prototype's test cases.

## Consequences
- One set of types and validation schemas for web, API, and research steps.
- Porting cost: about one session of work (task M3-T05).
- If heavy data science is needed later, a Python service can be added behind the queue.
