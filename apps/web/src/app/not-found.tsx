import { SiteFooter, SiteHeader } from "./site-chrome";

export default function NotFound() {
  return (
    <>
      <SiteHeader />
      <main id="main" className="mx-auto flex min-h-[60dvh] max-w-xl flex-col justify-center gap-4 px-4 py-16 sm:px-6">
        <p className="text-sm font-medium text-[var(--color-muted)]">404</p>
        <h1 className="text-3xl font-semibold">This page doesn&apos;t exist.</h1>
        <p className="text-[var(--color-muted)]">The link may be old, or the list may belong to a workspace you&apos;re not in.</p>
        <div className="flex gap-3">
          <a href="/app" className="rounded-lg bg-[var(--color-accent)] px-4 py-2.5 font-medium text-[var(--color-accent-ink)]">Go to your lists</a>
          <a href="/" className="rounded-lg border border-[var(--color-line)] px-4 py-2.5 font-medium">Home</a>
        </div>
      </main>
      <SiteFooter />
    </>
  );
}
