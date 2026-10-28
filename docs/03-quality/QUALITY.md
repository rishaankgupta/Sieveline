# Quality targets

Last updated: 2026-10-28

"Perfect" can't be tested, so each quality area has a number we measure. A milestone is not
done until its numbers are met or a gap is written down with a reason.

## 1. Speed (web)

| Measure | Target (p75, mid-range laptop, 4G) |
|---|---|
| Largest Contentful Paint | ≤ 2.5 s |
| Interaction to Next Paint | ≤ 200 ms |
| Cumulative Layout Shift | ≤ 0.1 |
| JavaScript sent to browser per page | ≤ 200 KB compressed (target, reviewed per page) |
| Results table with 500 companies | Scrolls without dropped frames (virtualized rows) |
| API responses (not research jobs) | p95 ≤ 300 ms |

## 2. Speed and cost (research runs)

| Measure | Target |
|---|---|
| 150-company run, start to finish | p95 ≤ 20 min (measured in M3; may be revised) |
| Tavily credits per 150-company run | ≤ 60 at basic depth |
| Repeat calls served from cache | 100% within cache lifetime |
| Progress update delay in UI | ≤ 5 s |

## 3. Reliability

| Measure | Target |
|---|---|
| Web uptime | 99.5% monthly at launch |
| Runs that finish or fail with a clear reason | 100% (no stuck runs; a watchdog ends runs idle > 15 min) |
| Worker crash during a run | Resumes from the last finished step |
| Backups | Daily; restore tested before launch |

## 4. Accessibility

WCAG 2.2 level AA. Checked with axe-core in automated tests on every page, plus a manual
keyboard-only and screen-reader pass in M7.

## 5. Data quality

| Measure | Target |
|---|---|
| Yes/no answers with a quote found in the page | 100% (enforced in code) |
| Facts correct on manual 50-row check per industry | ≥ 90% |
| Companies wrongly marked independent when owned by a group | Tracked; reported in the M3 quality report |

## 6. Testing

| Layer | Tool | Minimum |
|---|---|---|
| Unit (scoring, signals, quote check, export escaping) | Vitest | ≥ 90% line coverage on the shared package |
| Integration (API + database) | Vitest + test Postgres | Every API route, including permission denials |
| End-to-end | Playwright | Sign up → thesis → run (mocked providers) → review → export |
| Accessibility | axe-core in Playwright | Zero serious or critical issues |
| Load | k6 | 50 concurrent users browsing results; 10 concurrent runs |

CI blocks merging if lint, type check, tests, or the accessibility check fail.
