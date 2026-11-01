import type { Metadata } from "next";
import { SiteFooter, SiteHeader } from "./site-chrome";
import { DemoButton } from "./demo-button";

export const metadata: Metadata = {
  title: "Sieveline: find the few small businesses worth buying",
  description:
    "Describe the business you want to buy. Sieveline researches company websites, checks each one against your rules with the exact quote as proof, and gives you a short list you can question.",
};

/** Real output from a list Sieveline made on 2026-10-28 (calibration labs, US). */
const EXAMPLE = {
  rules: ["Calibration is the core business", "ISO 17025 accredited", "Offers on-site calibration", "Serves regulated industries", "Independently owned"],
  company: "Allometrics",
  domain: "allometrics.com",
  reason: "50 years in business · family-owned · calibration is the core business · ISO 17025 accredited · offers on-site calibration",
  proof: [
    { rule: "ISO 17025 accredited", quote: "A2LA ISO/IEC 17025 Accredited Laboratory", source: "allometrics.com" },
    { rule: "Family-owned", quote: "Since 1976, Allometrics has been a family-owned business committed to providing the highest quality products and service", source: "allometrics.com/about-us" },
    { rule: "Offers on-site calibration", quote: "Our field service teams and mobile laboratory capabilities allow us to provide on-site calibration and testing at your facility", source: "allometrics.com" },
  ],
};

const STEPS = [
  { n: "1", title: "Describe what you want to buy", body: "In plain words: the kind of company, where, how old, who owns it. Sieveline turns it into yes/no rules you can edit." },
  { n: "2", title: "Sieveline does the research", body: "It searches the web, reads each company's own website, checks recent news, and answers every rule. You see the cost before it starts." },
  { n: "3", title: "Get a short list with proof", body: "About 10 companies, not 500. Every yes or no comes with the exact sentence from the company's site and a link to it." },
  { n: "4", title: "Ask questions, then dig deeper", body: "Ask the list things like “which are family-owned?” and get answers that cite the evidence. Run a deep dive on the ones you like." },
];

const FAQ = [
  { q: "Where does the information come from?", a: "From the companies' own websites and recent news, found and read through Tavily's web search. Sieveline never invents a fact: if a page doesn't clearly say something, the answer is “unknown”." },
  { q: "How do I know an answer is right?", a: "Every yes or no shows the exact quote and the page it came from, and our code checks the quote really appears on that page before it's shown. Deep-dive reports are written by a research agent and are marked as not quote-checked." },
  { q: "Who is it for?", a: "People looking to buy a small business: searchers, independent sponsors, small PE teams and business brokers who want a well-researched list instead of a database dump." },
  { q: "What does it cost?", a: "It's free during early access, with a monthly research allowance per workspace. You always see the worst-case cost of a list before you start it." },
  { q: "Is my search private?", a: "Yes. Each workspace's data is separated in the database itself (row-level security), so no other customer can see your lists, notes or chats." },
];

export const dynamic = "force-dynamic";

export default function Home() {
  // Read directly (not via app()) so the public landing page renders even if other config is missing.
  const demo = process.env.DEMO_MODE === "true";
  return (
    <>
      <SiteHeader />
      <main id="main">
        <section className="mx-auto grid max-w-6xl gap-12 px-4 pt-16 pb-20 sm:px-6 lg:grid-cols-[1.1fr_1fr] lg:pt-24">
          <div className="flex flex-col justify-center gap-6">
            <p className="text-sm font-medium tracking-wide text-[var(--color-accent)] uppercase">For people buying a small business</p>
            <h1 className="text-4xl font-semibold leading-tight text-balance sm:text-5xl">Find the few businesses worth buying.</h1>
            <p className="max-w-prose text-lg text-[var(--color-muted)]">
              Describe what you want to acquire. Sieveline researches the web, checks every company against your rules with the exact quote
              as proof, and gives you a short list you can question.
            </p>
            <div className="flex flex-wrap gap-3">
              {demo && <DemoButton />}
              <a href="/sign-up" className={`inline-flex h-11 items-center rounded-lg px-5 font-medium ${demo ? "border border-[var(--color-line)] bg-[var(--color-surface)] hover:bg-[var(--color-bg)]" : "bg-[var(--color-accent)] text-[var(--color-accent-ink)] hover:opacity-90"}`}>
                Create a free account
              </a>
            </div>
            {demo && <p className="text-sm text-[var(--color-muted)]">The demo opens a real finished list. No sign-up, nothing to install.</p>}
          </div>

          <figure aria-label="Example shortlist entry" className="rounded-[var(--radius-card)] border border-[var(--color-line)] bg-[var(--color-surface)] p-5 shadow-sm">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs text-[var(--color-muted)]">#1 on a real list: independent calibration labs (US)</p>
                <p className="mt-1 text-lg font-semibold">{EXAMPLE.company}</p>
                <p className="text-sm text-[var(--color-muted)]">{EXAMPLE.domain}</p>
              </div>
              <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-200">● Strong fit</span>
            </div>
            <p className="mt-3 text-sm">{EXAMPLE.reason}</p>
            <ul className="mt-4 flex flex-col gap-3">
              {EXAMPLE.proof.map((p) => (
                <li key={p.rule} className="rounded-md bg-[var(--color-bg)] p-3 text-sm">
                  <p className="font-medium">✓ {p.rule}</p>
                  <blockquote className="mt-1 italic">“{p.quote}”</blockquote>
                  <p className="mt-1 text-xs text-[var(--color-muted)]">{p.source}</p>
                </li>
              ))}
            </ul>
          </figure>
        </section>

        <section aria-labelledby="how" className="border-y border-[var(--color-line)] bg-[var(--color-surface)]">
          <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
            <h2 id="how" className="text-2xl font-semibold">How it works</h2>
            <ol className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
              {STEPS.map((s) => (
                <li key={s.n} className="flex flex-col gap-2">
                  <span aria-hidden className="flex size-8 items-center justify-center rounded-full bg-[var(--color-accent)] text-sm font-semibold text-[var(--color-accent-ink)]">{s.n}</span>
                  <h3 className="font-medium">{s.title}</h3>
                  <p className="text-sm text-[var(--color-muted)]">{s.body}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        <section aria-labelledby="why" className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
          <h2 id="why" className="text-2xl font-semibold">Why a short list beats a database</h2>
          <div className="mt-8 grid gap-6 md:grid-cols-3">
            {[
              { t: "Your rules, not generic filters", b: `The example above used rules like ${EXAMPLE.rules.slice(0, 3).map((r) => `“${r.toLowerCase()}”`).join(", ")}. Databases can't filter on those; reading the websites can.` },
              { t: "Proof you can check in seconds", b: "Click any answer to see the sentence it came from. If the site doesn't say it, Sieveline says “unknown” instead of guessing." },
              { t: "Red flags found for you", b: "Recent news is checked for acquisitions, closures and lawsuits, and signs of a parent company or private-equity owner are flagged." },
            ].map((x) => (
              <div key={x.t} className="rounded-[var(--radius-card)] border border-[var(--color-line)] bg-[var(--color-surface)] p-5">
                <h3 className="font-medium">{x.t}</h3>
                <p className="mt-2 text-sm text-[var(--color-muted)]">{x.b}</p>
              </div>
            ))}
          </div>
        </section>

        <section aria-labelledby="faq" className="border-t border-[var(--color-line)] bg-[var(--color-surface)]">
          <div className="mx-auto max-w-3xl px-4 py-16 sm:px-6">
            <h2 id="faq" className="text-2xl font-semibold">Questions</h2>
            <div className="mt-6 divide-y divide-[var(--color-line)]">
              {FAQ.map((f) => (
                <details key={f.q} className="group py-4">
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-medium">
                    {f.q}
                    <span aria-hidden className="text-[var(--color-muted)] transition group-open:rotate-45">+</span>
                  </summary>
                  <p className="mt-2 text-[var(--color-muted)]">{f.a}</p>
                </details>
              ))}
            </div>
          </div>
        </section>

        <section className="mx-auto flex max-w-3xl flex-col items-center gap-4 px-4 py-20 text-center sm:px-6">
          <h2 className="text-3xl font-semibold text-balance">See a real list in one click.</h2>
          <div className="flex flex-wrap justify-center gap-3">
            {demo && <DemoButton />}
            <a href="/sign-up" className="inline-flex h-11 items-center rounded-lg border border-[var(--color-line)] bg-[var(--color-surface)] px-5 font-medium hover:bg-[var(--color-bg)]">Create a free account</a>
          </div>
        </section>
      </main>
      <SiteFooter />
    </>
  );
}
