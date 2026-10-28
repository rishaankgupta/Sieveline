/**
 * Temporary home page for the foundation milestone. The real landing page is built in M4.
 */
export default function Home() {
  return (
    <main id="main" className="mx-auto flex min-h-dvh max-w-3xl flex-col justify-center gap-6 px-6 py-16">
      <p className="text-sm font-medium tracking-wide text-[var(--color-muted)] uppercase">Sieveline</p>
      <h1 className="text-4xl font-semibold leading-tight text-balance sm:text-5xl">
        Find the few businesses worth buying.
      </h1>
      <p className="max-w-prose text-lg text-[var(--color-muted)]">
        Describe what you want to acquire. Sieveline researches the web, checks every company
        against your rules with the exact source quote, and gives you a short list you can talk to.
      </p>
      <p className="text-sm text-[var(--color-muted)]">In development.</p>
    </main>
  );
}
