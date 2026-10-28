import type { Metadata } from "next";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { listUserWorkspaces } from "@sieveline/db";
import { app } from "@/server/context";
import { SignOutButton } from "./sign-out-button";

export const metadata: Metadata = { title: "Dashboard" };
export const dynamic = "force-dynamic";

/** Temporary signed-in home. The real dashboard (runs, credits) is M4-T05. */
export default async function AppHome() {
  const { auth, db } = app();
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect("/sign-in?next=/app");
  const workspaces = await listUserWorkspaces(db as never, session.user.id);

  return (
    <main id="main" className="mx-auto max-w-3xl px-6 py-12">
      <header className="flex items-center justify-between">
        <p className="text-sm font-semibold tracking-wide uppercase text-[var(--color-muted)]">Sieveline</p>
        <SignOutButton />
      </header>
      <h1 className="mt-10 text-3xl font-semibold">Welcome, {session.user.name.split(" ")[0]}</h1>
      <section aria-labelledby="ws" className="mt-8">
        <h2 id="ws" className="text-lg font-medium">Your workspaces</h2>
        <ul className="mt-3 divide-y divide-[var(--color-line)] rounded-[var(--radius-card)] border border-[var(--color-line)] bg-[var(--color-surface)]">
          {workspaces.map((w) => (
            <li key={w.id} className="flex items-center justify-between px-4 py-3">
              <span>{w.name}</span>
              <span className="text-sm text-[var(--color-muted)]">{w.role}</span>
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}
