import type { ReactNode } from "react";
import { SiteFooter, SiteHeader } from "./site-chrome";

export function LegalPage({ title, updated, children }: { title: string; updated: string; children: ReactNode }) {
  return (
    <>
      <SiteHeader />
      <main id="main" className="mx-auto max-w-3xl px-4 py-12 sm:px-6">
        <h1 className="text-3xl font-semibold">{title}</h1>
        <p className="mt-1 text-sm text-[var(--color-muted)]">Last updated {updated}. Early-access draft, not yet reviewed by a lawyer.</p>
        <div className="mt-8 flex flex-col gap-4 leading-relaxed [&_h2]:mt-4 [&_h2]:text-xl [&_h2]:font-semibold [&_ul]:list-disc [&_ul]:pl-6">{children}</div>
      </main>
      <SiteFooter />
    </>
  );
}
