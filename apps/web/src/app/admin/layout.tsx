import type { Metadata } from "next";
import type { ReactNode } from "react";
import { adminCan } from "@sieveline/core";
import { notFound, redirect } from "next/navigation";
import { AdminIdle, AdminNeeds2FA, AdminNotFound, requireStaff, type Staff } from "@/server/admin";
import { AdminActions } from "./admin-client";

export const metadata: Metadata = { title: { template: "%s · Admin · Sieveline", default: "Admin · Sieveline" }, robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default async function AdminLayout({ children }: { children: ReactNode }) {
  let staff: Staff;
  try {
    staff = await requireStaff("admin.view");
  } catch (e) {
    if (e instanceof AdminNotFound) notFound();
    if (e instanceof AdminIdle) redirect("/sign-in?next=/admin&reason=idle");
    if (e instanceof AdminNeeds2FA) {
      return (
        <main id="main" className="mx-auto max-w-lg px-4 py-16">
          <h1 className="text-2xl font-semibold">Turn on two-factor first</h1>
          <p className="mt-2 text-[var(--color-muted)]">The admin panel needs an authenticator app on your account.</p>
          <a href="/app/security" className="mt-6 inline-block rounded-lg bg-[var(--color-accent)] px-4 py-2.5 font-medium text-[var(--color-accent-ink)]">Set up two-factor</a>
        </main>
      );
    }
    throw e;
  }

  const nav = [
    { href: "/admin", label: "Overview" },
    { href: "/admin/users", label: "Users" },
    { href: "/admin/workspaces", label: "Workspaces" },
    { href: "/admin/runs", label: "Runs" },
    { href: "/admin/settings", label: "Settings" },
    { href: "/admin/integrations", label: "Integrations" },
    { href: "/admin/audit", label: "Audit log" },
    ...(adminCan(staff.role, "staff.manage") ? [{ href: "/admin/staff", label: "Staff" }] : []),
  ];
  return (
    <div className="min-h-dvh">
      <header className="border-b border-[var(--color-line)] bg-[var(--color-surface)]">
        <div className="mx-auto flex min-h-14 max-w-7xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-2 sm:px-6">
          <a href="/admin" className="font-semibold tracking-tight">Sieveline <span className="rounded bg-amber-100 px-1.5 py-0.5 text-xs font-medium text-amber-900 dark:bg-amber-900 dark:text-amber-100">Admin</span></a>
          <nav aria-label="Admin" className="flex flex-wrap gap-1 text-sm">
            {nav.map((n) => <a key={n.href} href={n.href} className="rounded-md px-3 py-1.5 hover:bg-[var(--color-bg)]">{n.label}</a>)}
          </nav>
          <div className="ml-auto flex items-center gap-3 text-sm text-[var(--color-muted)]">
            <span>{staff.email} · {staff.role}</span>
            <a href="/app" className="underline">Back to app</a>
          </div>
        </div>
      </header>
      <AdminActions>
        <main id="main" className="mx-auto max-w-7xl px-4 py-8 sm:px-6">{children}</main>
      </AdminActions>
    </div>
  );
}
