# ADR-0006: What Cloudflare does (and doesn't) in Sieveline

- Status: Proposed (owner asked to consider Cloudflare, 2026-10-28)
- Date: 2026-10-28

## Options considered

| | A. All on Vercel | B. All on Cloudflare | C. Vercel app + Cloudflare services (proposed) |
|---|---|---|---|
| Next.js support | Native (Vercel builds Next.js) | Through the OpenNext adapter; most Next.js features supported per Cloudflare and OpenNext docs; Worker size limits apply (3 MiB free, 10 MiB paid per OpenNext docs) | Native |
| Background research | Vercel Workflow | Cloudflare Workflows (per-step billing since Aug 2026 per Cloudflare changelog) | Vercel Workflow |
| Neon connection | Neon serverless driver | Hyperdrive (recommended by Neon and Cloudflare docs) | Neon serverless driver |
| Effort and risk | Lowest | Highest: adapter quirks, two new runtimes to learn | Low |

## Decision (proposed)
**Option C.** Run the app on Vercel and use Cloudflare where it is clearly strong:
- **Domain registration and DNS** for `sieveline.com`.
- **Turnstile** (bot check) on sign-up, sign-in and password reset.
- **R2** object storage for exported files and deep-dive PDFs (no egress fees).
- **Email Routing** for inbound `support@` / `hello@` addresses (sending still goes through the email provider).

Do **not** put Cloudflare's proxy (orange cloud) in front of Vercel at launch: two CDNs and two
firewalls in a row make caching and debugging harder. Re-check Vercel's current guidance before
changing this.

## Keeping the door open to Option B
Pipeline, scoring, Tavily and LLM code live in `packages/core` with no Vercel-specific imports.
Moving to Cloudflare later would replace the Workflow wrapper and the database driver, not the product logic.

## Consequences
- Two vendors to manage (Vercel, Cloudflare), both already owned by the owner.
- Exact limits and prices above come from docs read on 2026-10-28; check again before launch.
