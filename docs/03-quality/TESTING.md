# Testing

Last run: 2026-11-01. All suites below passed on that date. None of them spends Tavily credits or
calls the language model, so they can be run as often as needed.

## Suites

| Suite | What it covers | How to run |
|---|---|---|
| Unit + integration (`pnpm check`) | Lint, types, 111 core, 35 db (real Postgres via PGlite, RLS on), 25 web unit, 4 web integration (workflow with fake Tavily/LLM servers) | `pnpm check` |
| Concurrency on Neon | Parallel credit reservations, double-start of deep dives, parallel settlement, rate limiter, RLS under load | `node packages/db/scripts/stress-race.ts` (needs `DATABASE_URL`, `DATABASE_URL_ADMIN`, `DATABASE_URL_OWNER`) |
| HTTP stress + odd inputs | Load on every main page and API, cross-user isolation, bad input, CSRF, XSS, CSV injection, headers, rate limits | Start `next start`, then `BASE=… ORIGIN=… node apps/web/scripts/stress-http.mjs` |
| Real browser (Chrome) | Public pages in light/dark and desktop/mobile with axe (WCAG 2.2 AA), the whole buyer journey by clicking, sign-up and sign-in forms, JS errors, CSP violations, unexpected HTTP errors | Start `next start` and `node apps/web/scripts/https-proxy.mjs`, then `BASE=https://localhost:3443 node apps/web/scripts/browser-e2e.mjs` |

The browser suite needs HTTPS because production session cookies are `Secure`; the proxy makes a
self-signed certificate in memory. Chrome comes from `/usr/local/bin/chrome` (Chrome for Testing).

## Latest results (2026-11-01)

**Real browser: 114/114 checks.** 28 public page loads (7 pages × light/dark × 1280 px / 390 px): every
page loads, 0 serious or critical axe issues, no horizontal scrolling. Buyer journey: one-click demo
opens the sample list, pin survives a reload, evidence dialog shows verified quotes and the deep-dive
dossier with its warning, review and note save, Escape closes the dialog, the full table filters, the
CSV download contains the note, dashboard/new list/team/security load with 0 serious axe issues, the
template plus cost estimate works, wrong 2FA password shows an error, sign-out closes `/app`. Sign-up
form lands in the app; a wrong password shows an error; the right one signs in. 0 JavaScript errors,
0 CSP violations, 0 unexpected error responses, 0 server errors.

**HTTP: 44/44 checks, 0 server errors.** Production build on this sandbox against Neon (about 11 ms
away). Concurrency = parallel clients.

| Request | Requests | Concurrency | p50 ms | p95 ms | Requests/s | Status codes |
|---|---|---|---|---|---|---|
| GET / (landing) | 200 | 20 | 77 | 180 | 198 | 200: 200 |
| GET /sign-in | 100 | 10 | 36 | 53 | 240 | 200: 100 |
| GET /app (dashboard) | 150 | 15 | 311 | 483 | 44 | 200: 150 |
| GET /app/runs/:id | 150 | 15 | 226 | 341 | 60 | 200: 150 |
| GET /api/runs | 200 | 20 | 396 | 447 | 49 | 200: 200 |
| GET /api/runs/:id/results | 200 | 20 | 400 | 453 | 48 | 200: 200 |
| GET /api/runs/:id | 200 | 20 | 519 | 619 | 37 | 200: 200 |
| GET deep dive | 150 | 15 | 217 | 265 | 65 | 200: 150 |
| GET CSV export | 50 | 10 | 276 | 323 | 31 | 200: 50 |
| GET /api/health | 200 | 25 | 21 | 72 | 779 | 200: 200 |

Single-request times are lower (about 150–270 ms for authenticated APIs); the p50s above include queueing
behind 15–20 parallel clients on one server process. Vercel runs many instances, so these are a floor per
instance, not a site-wide limit. Not measured: real Vercel latency.

Odd input and abuse checks that passed: requests without or with a foreign Origin are refused (403);
malformed JSON 400; 300 KB body 413; bad and unknown ids 404 (never 500); wrong types 400; unsupported
method 405; 13 rules or 501 seed domains refused; empty chat 400; deep dive with a stale cost 409;
cancelling a finished list 409; demo accounts can't send invitations; buyers get 404 from the admin page
and API; the cron needs its secret; APIs need a session; an HTML/formula payload in a note is not rendered
as HTML and is escaped in CSV; nonce CSP with `strict-dynamic`, HSTS, nosniff and DENY framing are set;
the export rate limit returns 429 under a burst; 120 interleaved requests from two accounts never show one
account's data to the other.

**Concurrency on Neon:**

| Test | Result |
|---|---|
| 25 parallel reservations of 9 credits, cap 100 | 11 succeeded, 14 refused, total reserved 99 |
| 12 parallel deep-dive starts for one company | 1 succeeded, 11 refused |
| 3 parallel settlements of one deep dive | applied once |
| 60 parallel hits on a limit of 10 | 10 allowed |
| 40 parallel reads from another workspace | 0 rows leaked |

## Bugs these suites found (all fixed)

| Found by | Bug | Fix |
|---|---|---|
| Browser | The run page crashed in Chrome right after rendering: `scrollIntoView()` now returns a Promise, a concise arrow effect returned it, and React tried to call it as cleanup | Block-bodied effects, plus a lint rule that rejects concise-arrow effects |
| Browser | Every page logged a 404 (no favicon) | `app/icon.svg` |
| Unit test | The 30 s session cookie cache kept sessions valid after a password reset | Cookie cache removed (costs about 10–20% on authenticated pages) |
| Review | With that cache, the admin panel would also accept a deleted session for up to 30 s | Admin checks the session row on every request |
| Screenshot | Company names taken from page titles ("Official Company Information: …") | `cleanCompanyName`, plus a clearer prompt |
| Screenshot | Quotes cut mid-word ("accurate measurem") | Excerpts snap to sentence and word boundaries and stay verbatim |

## Not covered yet

- Real research runs under load (each costs credits; covered once end to end on 2026-10-28).
- The live Vercel deployment (only local production builds were tested).
- Screen-reader walkthroughs (axe catches markup problems, not the full experience).
- Browsers other than Chrome.
