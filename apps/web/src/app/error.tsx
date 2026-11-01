"use client";

/** Shown when a page fails to render. The digest lets support find the server log line. */
export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main id="main" className="mx-auto flex min-h-[60dvh] max-w-xl flex-col justify-center gap-4 px-4 py-16 sm:px-6">
      <h1 className="text-3xl font-semibold">Something went wrong.</h1>
      <p className="text-[var(--color-muted)]">This page couldn&apos;t load. Your data is safe. Try again, and if it keeps happening, tell us the code below.</p>
      {error.digest && <p className="font-mono text-sm">Code: {error.digest}</p>}
      <div className="flex gap-3">
        <button type="button" onClick={reset} className="rounded-lg bg-[var(--color-accent)] px-4 py-2.5 font-medium text-[var(--color-accent-ink)]">Try again</button>
        <a href="/" className="rounded-lg border border-[var(--color-line)] px-4 py-2.5 font-medium">Home</a>
      </div>
    </main>
  );
}
