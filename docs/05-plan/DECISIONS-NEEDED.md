# Decisions needed from the owner

Last updated: 2026-10-28

Work continues with the **default** until you answer. "Needed by" is the task that blocks without it.

| # | Question | Default until answered | Needed by |
|---|---|---|---|
| D1 | Product name and domain? | Working name "TargetFinder", no domain | M8-T01 (branding by M4) |
| D2 | Who signs up at launch: **(a)** self-serve buyers who run lists themselves, or **(b)** you run lists and clients log in to view/review? | (b) operator-run with client access; self-serve added later | M4 |
| D3 | Hosting and monthly budget? Options: (a) managed (e.g. Vercel + managed Postgres + a worker host), (b) one VPS with Docker, (c) AWS/GCP. | Docker images that run on any of these | M8-T01 |
| D4 | Which LLM provider? (OpenAI, Anthropic, Nebius Token Factory, other) | OpenAI-compatible client, provider set by env vars | M3-T08 |
| D5 | Pricing: per list, monthly subscription, or credit packs? Prices? | Per list, price set by operator | M6-T01 |
| D6 | Do you have a Stripe account, and in which country is the business registered? (Affects which Stripe features are available.) | Stripe test mode only | M6 |
| D7 | Email provider and sender address (e.g. `hello@yourdomain`)? | Resend in dev mode | M2-T02 (real sending by M8) |
| D8 | Brand colors / logo / design references you like? | Neutral design | M4-T01 |
| D9 | GitHub repo to push to (owner/name)? | Local Git only | M0-T03 |
| D10 | Will you pay for an external penetration test before launch? | No; internal ASVS review + ZAP scan only | M7 |

## Keys you will provide later

Placeholders are in `.env.example`. Needed first: **Tavily key + LLM key** for M3-T08.
Send keys by setting them as environment variables in the sandbox, not by pasting them in chat.
