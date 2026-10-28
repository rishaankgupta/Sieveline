# M3-T10 real-data spike: calibration labs

Run on 2026-10-28 against the real Tavily API (free Researcher plan, development key).
Raw output: `spike-m3-t10-raw.json`. Scripts: `apps/web/scripts/spike-real.ts`, `spike-map.ts`.

## What was measured

8 search queries → 30 companies → Map (with instructions) + Extract (basic, advanced retry) →
rule-based signals. No LLM was used, so the yes/no rule answers are **not** measured yet.

| Measure | Result | Target (QUALITY.md) | Verdict |
|---|---|---|---|
| Companies with readable website text | **97%** (29/30) | ≥ 70% (week-1 gate) | Pass |
| Text mentions calibration | 80% | — | Most finds are relevant |
| Text mentions ISO 17025 | 77% | — | Good match to thesis |
| Founded year found | 47% (14/30) | — | All 14 checked by hand against the quoted sentence: **14/14 correct** |
| Ownership words found | 17% (5/30) | — | All 5 correct by hand ("family-owned", "veteran-owned"...) |
| Parent/group flags | 33% (10/30) | — | **Only 5/10 correct** → fixed (below) |
| Credits used | **89** for 30 companies (search 8, map 67, extract 14) | — | ~3.0 credits per company before news/crawl |
| Time | 5 s discover + 81 s read | 150 companies ≤ 20 min | On track (~7 min for reading 150) |

Total spent across both spike scripts: **130 credits** (from Tavily's per-response `usage`
fields) of the 1,000 free monthly credits. Tavily's `/usage` endpoint still showed 0 right after
the run, so it lags; the daily reconciliation (M3-T04) must allow for that delay.

## Problems found and fixed

1. **False "may belong to a group" flags (5 of 10 wrong).** "Accredited Labs" is a consolidator,
   but "accredited labs" is also everyday wording ("our accredited labs"). Now a named owner is
   flagged only when written as a proper name **and** next to a relationship phrase
   ("part of", "powered by", "acquired by"...). Re-checked on all 10 real snippets: the 5 false
   flags are gone and the 5 real ones (3 Accredited Labs shops, 1 acquired by Kanbrick, 1 Trescal)
   still flag. Regression tests use the real snippets.
2. **Directories slipped into results** (iqsdirectory.com, wemakeithere.org). Added to the
   directory blocklist with a few similar B2B directories.
3. **Competitor's foreign site slipped in** (trescal.dk while trescal.com was excluded). Buyer
   exclusions now block the same brand on any country domain.
4. **Duplicate page read** (`cech.com/about` and `www.cech.com/about`). Page picking now treats
   `www.` and bare hosts as the same page.

## Map with vs without instructions (8 companies)

| | With instructions | Without |
|---|---|---|
| Credits | 25 | 16 |
| Companies where we found an About/History page | 8/8 | 5/8 (3 got the homepage only) |

**Decision: keep instructions on.** They cost ~56% more for Map but find the pages that hold
founding and ownership facts, which are the core of the product.

## Cost model, updated with real numbers

| Stage | Planning estimate (per 120 companies) | Measured rate | Projected for 120 |
|---|---|---|---|
| Search | ~30 | 1/query | 25 |
| Map | ~72 | 2.2/company | ~270 |
| Extract | ~96 | 0.5/company | ~56 |
| News + crawl | ~140 | not measured | ~140 |
| **Total** | **~340** | | **~490 credits ≈ $2.50–3.90** |

Map is the biggest cost. Options if needed: lower `mapLimit` from 20/30 to 15, or map only
candidates whose search snippet mentions the thesis terms.

## Not measured yet (needs an LLM key)

- Accuracy of yes/no rule answers and how often quotes are rejected.
- Query planner variants vs templates (the "+20% unique domains" check).
- News and deep-read stages on real data.

# Part 2: full pipeline with a real LLM (2026-10-28)

LLM: `gpt-oss-120b` on **OVHcloud AI Endpoints, anonymous free tier** (no key, EU-hosted, 2 requests
per minute per IP per model), chosen from `mnfst/awesome-free-llm-apis` because it needs no account.
Pipeline: discover → Map → Extract → LLM rule answers with quote check → news (top 5) → crawl (top 2)
→ shortlist. 12 companies. Script: `apps/web/scripts/spike-full.ts`. Raw: `spike-m3-t10-full-raw.json`.

## Results (final run, after fixes)

| Measure | Result |
|---|---|
| Time | 8.1 min for 12 companies (the 2-per-minute LLM limit is the bottleneck) |
| Tavily credits | 57 (most reads served from the cache filled in part 1) |
| Rule answers | 50 total: 21 yes, 2 no, 27 unknown |
| Answers dropped for a quote not on the page | **0** (was 9 of 30 before the fixes below) |
| Yes/no answers checked by hand against their quote | **22 of 23 clearly correct**; 1 debatable (an aviation data site marked as serving aviation; it fails the core rule anyway) |
| LLM calls that failed | 2 of 12 |
| Shortlist | 8 companies; top 2 are independent, long-running, ISO 17025 labs with on-site service |

## Problems found and fixed in part 2

1. **Tavily rejects `instructions` over 400 characters** (HTTP 422). Not in the docs read today.
   Crawl instructions are now built from short rule labels and capped at 400; the client refuses
   longer ones before spending.
2. **Tavily can return `raw_content: null`** (not just empty). Null pages now count as failed reads
   (and get the advanced retry) instead of crashing the step.
3. **30% of answers dropped because the model's quote didn't match the page**, for 3 reasons seen on
   real pages: the model joined two real sentences with "...", the page lost punctuation
   ("Services:" vs "Services"), and the page glued words ("EquipmentServices"). Matching now compares
   letters and digits only and accepts "..." between fragments only if every fragment is on the
   page, in order. Invented or reordered fragments are still rejected (tests).
4. **"JM Test Systems Acquires Alltite" was flagged as the company being acquired.** It's the buyer.
   That's now an "acquirer" signal (often means a growing, possibly investor-backed platform), not a
   red flag.
5. **Shortlist reasons were clumsy** ("Is instrument calibration the company's main business").
   Rules now have short labels ("calibration is the core business").
6. **2 of 12 LLM calls failed.** Likely the reasoning model running out of output tokens at 1,500;
   raised to 4,000 and failures now record the reason. Not re-measured yet.

## What this does and doesn't prove

- Proves: the pipeline works end to end on real sites; facts are real and sourced; credit metering
  and caching work; output is useful for this niche.
- Doesn't prove: accuracy at 150-company scale, the "independently owned" rule (mostly "unknown":
  sites rarely say it), or speed with a paid LLM. With 2 requests/minute, a 150-company list would
  take about 75 minutes of LLM time, so **the anonymous free tier is only for testing**.
