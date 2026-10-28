# Security

Last updated: 2026-10-28

Target: **OWASP ASVS 5.0 Level 2** for the web app, checked in Milestone 7.
(ASVS is a public checklist of security requirements for web apps.)

## 1. What we protect

| Asset | Why it matters |
|---|---|
| Buyer theses and result lists | Confidential deal strategy; leaking them hurts the buyer |
| User accounts and sessions | Access to the above |
| API keys (Tavily, LLM, Stripe) | Direct money loss if stolen |
| Credit balances and billing | Fraud and unpaid usage |

## 2. Threats and controls

| Threat | Control |
|---|---|
| One customer sees another's data | `workspace_id` on every row; permission check in every query; Postgres row-level security as backup; automated tests that try cross-workspace access |
| Account takeover | Argon2id password hashes; rate limits and lockout on sign-in; email verification; TOTP 2FA (soon after launch); session rotation on sign-in; sign out everywhere |
| Stolen API keys | Keys only in server environment / secret manager; never sent to the browser; never logged; separate keys for dev and prod; spend alerts at Tavily and the LLM provider |
| Runaway cost (bug or abuse) | Credits reserved before a run; hard monthly caps per workspace; per-user run limits; global daily spend ceiling that pauses the worker |
| Prompt injection from website text | LLM has no tools; output is parsed as strict JSON; every claim must quote page text, checked in code; page text is never shown to the LLM as instructions |
| Formula injection in exports | Cells starting with `= + - @` (and tab/CR) are prefixed so Excel does not run them |
| Malicious CSV upload | Size and row limits; strict parsing; only domains accepted; private/internal hostnames rejected |
| XSS | React escaping; no raw HTML from websites rendered; strict Content-Security-Policy with nonces |
| CSRF | SameSite cookies plus origin checks on state-changing requests |
| Stripe webhook forgery | Signature verification; idempotent handling by event id |
| Vulnerable dependencies | Lockfile; automated dependency and secret scanning in CI; weekly update review |
| Data loss | Daily encrypted backups; tested restore before launch; point-in-time recovery if the host supports it |

## 3. Data handling

- **Tavily terms:** queries we send become "Customer Input" that Tavily may keep and use
  (perpetual license in their platform terms). We send only thesis search queries and company URLs.
  We never send user personal data or uploaded private files to Tavily. The Privacy Policy will say this.
- Logs contain ids, not page text, emails, or theses.
- IP addresses in the audit log are stored hashed.
- Users can export and delete their workspace data.

## 4. Security headers (all responses)

`Strict-Transport-Security`, `Content-Security-Policy`, `X-Content-Type-Options: nosniff`,
`Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy`,
`frame-ancestors 'none'` via CSP.

## 5. Checks before launch (M7)

- ASVS L2 checklist reviewed item by item, with gaps logged.
- Automated scan (OWASP ZAP baseline) against staging.
- Cross-workspace access test suite passes.
- Restore from backup tested.
- An external penetration test is recommended; it costs money and is your decision.
