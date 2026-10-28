# Decisions

Last updated: 2026-10-28

## Answered

| # | Question | Answer | Date |
|---|---|---|---|
| D1 | Product name | **Sieveline** (confirmed by owner). See notes below | 2026-10-28 |
| D2 | Who uses it and how | Buyers sign up themselves, get a **short list**, and **chat** with it to filter, compare and choose (ADR-0005) | 2026-10-28 |
| D3 | Hosting | **Vercel** (app) + **Neon** (Postgres) (ADR-0004) | 2026-10-28 |
| D11 | Accounts | Owner has Vercel and Neon; also has Cloudflare. Role of Cloudflare proposed in ADR-0006 | 2026-10-28 |
| D12 | Admin panel | Manage everything from one panel (`docs/07-admin/ADMIN.md`) | 2026-10-28 |
| D15 | Hosting cost | Free tiers only: GitHub Student Pack domain, free Vercel / Neon / Cloudflare plans. Code stays within free limits (each research step under 300 s) | 2026-10-28 |
| D4 | LLM provider | Deferred; owner will decide when providing the Tavily key. Built provider-agnostic | 2026-10-28 |

### D1 notes: name check for "Sieveline"
- Meaning: a sieve keeps only what's worth keeping; "line" is the buyer's deal pipeline.
- `sieveline.com`, `sieveline.io`, `sieveline.ai`: registry lookup (RDAP) on 2026-10-28 returned
  "not found", which usually means unregistered. Buy soon; availability can change.
- Web search found no company using the name; GitHub has no repos named "sieveline".
- **Not checked:** trademark registers (USPTO, EUIPO, India). Do a trademark search before spending on branding.
- Rejected: "Shortsift" (sounds like "short shrift", which means "little attention"); most
  other candidates' .com domains were taken.

## Still open

| # | Question | Default until answered | Needed by |
|---|---|---|---|
| D5 | Pricing: per list, monthly plan, or credit packs? Prices? | Monthly plan with list + deep-dive limits | M6-T01 |
| D6 | Stripe account and business country? | Stripe test mode only | M6 |
| D7 | Email provider and sender address? | Resend in dev mode | M2-T02 (real sending by M8) |
| D8 | Brand colors / logo / design references? | Neutral design | M4-T01 |
| D9 | GitHub repo to push to (owner/name)? Owner has one, will connect later | Local Git only | M0-T04 |
| D10 | External penetration test before launch? | No; ASVS review + ZAP scan | M7 |
| D13 | Approve Cloudflare role (ADR-0006, option C)? | Option C | M8 |
| D14 | Give access: Vercel team, Neon project, Cloudflare account (invite or API tokens with least privilege) | Local development until then | M1-T04 |

### D15 note
Vercel's free Hobby plan is for non-commercial use. It is fine while building and testing.
Before charging customers, either move to a paid Vercel plan or to another host; the research
code is kept host-independent (ADR-0006) so that switch stays small.

## Keys you will provide later

Placeholders are in `.env.example`. Needed first: **Tavily key + LLM key** for M3-T10.
Set them as environment variables in the sandbox rather than pasting them in chat.
