# ADR-0003: Authentication with Better Auth

- Status: Accepted
- Date: 2026-10-28

## Decision
Better Auth 1.7 with the Drizzle adapter, sessions stored in our Neon database.

## Why
Checked against the criteria using Better Auth's 1.7 docs and source (read 2026-10-28):

| Criterion | How it's met |
|---|---|
| Session cookies httpOnly, Secure, SameSite | Verified in tests: `sl.` prefix, HttpOnly, SameSite=Lax; Secure in production |
| Email verification | Required before sign-in; tested |
| Password reset | 30-minute links; resets sign out all other sessions; tested |
| Rate-limited sign-in | Stored in Postgres (works on serverless); 11th failed sign-in per minute blocked; tested |
| 2FA (TOTP) | `twoFactor` plugin with account lockout; required for admins in MA-T01 |
| Google sign-in | Built in; enabled when credentials are set |
| Data in our database | Yes; tables `users`, `sessions`, `accounts`, `verifications`, `two_factors`, `rate_limits` |
| Free | Yes, open source; no per-user fees |

Rejected: Auth.js (weaker email/password support); hosted providers like Clerk/Auth0 (user data held
by a third party; paid beyond free tiers).

## Hardening on top of defaults
- Passwords hashed with **Argon2id** (OWASP minimum m=19 MiB, t=2, p=1) instead of the default scrypt.
- Breached-password check (`haveIBeenPwned` plugin, k-anonymity API).
- 12–128 character passwords.
- Cloudflare Turnstile on sign-up, sign-in and password reset when keys are set.
- Sign-up returns the same response for new and existing emails (no account enumeration).
- Platform-owner role is granted only after the owner's email is verified.
- Suspended users cannot create sessions.
- **Finding:** Better Auth disables origin (CSRF) checks when `NODE_ENV=test`. We set
  `disableOriginCheck: false` and `disableCSRFCheck: false` explicitly so tests exercise production
  behavior. Tests confirm cross-origin and cross-site-navigation sign-ins are rejected, and
  open-redirect callback URLs are refused.
