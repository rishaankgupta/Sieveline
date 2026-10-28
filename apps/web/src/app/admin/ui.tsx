import type { ReactNode } from "react";
import { notFound, redirect } from "next/navigation";
import { adminCan, type AdminAction } from "@sieveline/core";
import { AdminIdle, AdminNeeds2FA, AdminNotFound, requireStaff } from "@/server/admin";
import { HttpError } from "@/server/api";

/**
 * Every admin page calls this itself. Next.js renders layouts and pages in parallel, so the
 * layout's check alone does not stop a page from loading its data.
 */
export async function pageStaff(action: AdminAction = "admin.view") {
  try {
    // Viewing never needs step-up; the role check is enough. Step-up applies when an action is sent.
    const staff = await requireStaff("admin.view");
    if (!adminCan(staff.role, action)) notFound();
    return staff;
  } catch (e) {
    if (e instanceof AdminNotFound || e instanceof AdminNeeds2FA) notFound();
    if (e instanceof AdminIdle) redirect("/sign-in?next=/admin&reason=idle");
    if (e instanceof HttpError && e.status === 403) notFound();
    throw e;
  }
}

export function PageTitle({ title, sub }: { title: string; sub?: ReactNode }) {
  return (
    <div className="mb-6">
      <h1 className="text-2xl font-semibold">{title}</h1>
      {sub && <p className="mt-1 text-[var(--color-muted)]">{sub}</p>}
    </div>
  );
}

export function Stat({ label, value, warn }: { label: string; value: ReactNode; warn?: boolean }) {
  return (
    <div className={`rounded-[var(--radius-card)] border bg-[var(--color-surface)] p-4 ${warn ? "border-amber-400" : "border-[var(--color-line)]"}`}>
      <div className="text-sm text-[var(--color-muted)]">{label}</div>
      <div className="mt-1 text-2xl font-semibold tabular-nums">{value}</div>
    </div>
  );
}

export function Table({ head, children, empty }: { head: string[]; children: ReactNode; empty?: boolean }) {
  return (
    <div className="overflow-x-auto rounded-[var(--radius-card)] border border-[var(--color-line)] bg-[var(--color-surface)]">
      <table className="w-full text-left text-sm">
        <thead className="border-b border-[var(--color-line)] text-[var(--color-muted)]">
          <tr>{head.map((h) => <th key={h} scope="col" className="whitespace-nowrap px-4 py-2 font-medium">{h}</th>)}</tr>
        </thead>
        <tbody className="divide-y divide-[var(--color-line)]">{children}</tbody>
      </table>
      {empty && <p className="px-4 py-6 text-center text-[var(--color-muted)]">Nothing here yet.</p>}
    </div>
  );
}

export const Td = ({ children, className = "" }: { children: ReactNode; className?: string }) => <td className={`px-4 py-2 align-top ${className}`}>{children}</td>;

export function SearchForm({ q, placeholder, extra }: { q: string; placeholder: string; extra?: ReactNode }) {
  return (
    <form method="get" className="mb-4 flex flex-wrap items-end gap-3" role="search">
      <label className="flex flex-col gap-1 text-sm font-medium">Search
        <input name="q" defaultValue={q} placeholder={placeholder} className="h-10 w-72 rounded-lg border border-[var(--color-line)] bg-[var(--color-surface)] px-3 font-normal" />
      </label>
      {extra}
      <button className="h-10 rounded-lg border border-[var(--color-line)] bg-[var(--color-surface)] px-4 text-sm font-medium hover:bg-[var(--color-bg)]">Search</button>
    </form>
  );
}

export const n = (v: string | number | null | undefined) => Number(v ?? 0).toLocaleString("en");
export const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";
