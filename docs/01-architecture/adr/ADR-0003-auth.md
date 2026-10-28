# ADR-0003: Authentication

- Status: Open (decide in M2-T01)
- Date: 2026-10-28

## Options
1. **Better Auth**: sessions in our database, email/password, OAuth, 2FA plugins.
2. **Auth.js**: widely used with Next.js; email/password support is more limited.
3. **Hosted (Clerk, Auth0)**: least code; monthly cost per user; user data held by a third party.

## Criteria
Session cookies (httpOnly, Secure, SameSite), email verification, password reset,
rate-limited sign-in, TOTP 2FA, Google sign-in, and data kept in our own database.

## Decision
To be recorded after a short spike in M2-T01 that checks each option against the criteria
using its current documentation.
