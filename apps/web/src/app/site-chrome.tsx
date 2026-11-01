/** Header and footer for public pages (landing, legal, 404). */
export function SiteHeader() {
  return (
    <header className="border-b border-[var(--color-line)] bg-[var(--color-bg)]/90 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-6xl items-center gap-6 px-4 sm:px-6">
        <a href="/" className="font-semibold tracking-tight">Sieveline</a>
        <nav aria-label="Site" className="ml-auto flex items-center gap-1 text-sm">
          <a href="/#how" className="hidden rounded-md px-3 py-1.5 hover:bg-[var(--color-surface)] sm:inline">How it works</a>
          <a href="/#faq" className="hidden rounded-md px-3 py-1.5 hover:bg-[var(--color-surface)] sm:inline">Questions</a>
          <a href="/sign-in" className="rounded-md px-3 py-1.5 hover:bg-[var(--color-surface)]">Sign in</a>
          <a href="/sign-up" className="rounded-md bg-[var(--color-accent)] px-3 py-1.5 font-medium text-[var(--color-accent-ink)] hover:opacity-90">Get started</a>
        </nav>
      </div>
    </header>
  );
}

export function SiteFooter() {
  return (
    <footer className="border-t border-[var(--color-line)]">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-8 text-sm text-[var(--color-muted)] sm:px-6">
        <span>© {new Date().getUTCFullYear()} Sieveline</span>
        <a href="/privacy" className="hover:underline">Privacy</a>
        <a href="/terms" className="hover:underline">Terms</a>
        <span className="ml-auto">Web research powered by Tavily</span>
      </div>
    </footer>
  );
}
