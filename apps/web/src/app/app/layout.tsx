import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { requireWorkspace, Unauthorized } from "@/server/session";
import { SignOutButton } from "./sign-out-button";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: ReactNode }) {
  let ws;
  try {
    ws = await requireWorkspace();
  } catch (e) {
    if (e instanceof Unauthorized) redirect("/sign-in?next=/app");
    throw e;
  }
  const nav = [
    { href: "/app", label: "Lists" },
    { href: "/app/new", label: "New list" },
    { href: "/app/team", label: "Team" },
    { href: "/app/security", label: "Security" },
  ];
  return (
    <div className="min-h-dvh">
      <header className="border-b border-[var(--color-line)] bg-[var(--color-surface)]">
        <div className="mx-auto flex h-14 max-w-7xl items-center gap-6 px-4 sm:px-6">
          <a href="/app" className="font-semibold tracking-tight">Sieveline</a>
          <nav aria-label="Main" className="flex gap-1 text-sm">
            {nav.map((n) => (
              <a key={n.href} href={n.href} className="rounded-md px-3 py-1.5 hover:bg-[var(--color-bg)]">{n.label}</a>
            ))}
          </nav>
          <div className="ml-auto flex items-center gap-3 text-sm">
            <span className="hidden text-[var(--color-muted)] sm:inline" title="Current workspace">{ws.name}</span>
            <SignOutButton />
          </div>
        </div>
      </header>
      <main id="main" className="mx-auto max-w-7xl px-4 py-8 sm:px-6">{children}</main>
    </div>
  );
}
