import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode } from "react";
import { useId } from "react";

/** Small, accessible primitives. Every input has a visible label and announced errors. */

export function Field({
  label,
  hint,
  error,
  ...input
}: InputHTMLAttributes<HTMLInputElement> & { label: string; hint?: string; error?: string }) {
  const id = useId();
  const describedBy = [hint ? `${id}-hint` : "", error ? `${id}-error` : ""].filter(Boolean).join(" ") || undefined;
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-medium">
        {label}
      </label>
      <input
        id={id}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy}
        className="h-11 rounded-lg border border-[var(--color-line)] bg-[var(--color-surface)] px-3 text-base outline-none transition focus:border-[var(--color-accent)] aria-[invalid=true]:border-red-600"
        {...input}
      />
      {hint && (
        <p id={`${id}-hint`} className="text-xs text-[var(--color-muted)]">
          {hint}
        </p>
      )}
      {error && (
        <p id={`${id}-error`} className="text-sm text-red-700 dark:text-red-400">
          {error}
        </p>
      )}
    </div>
  );
}

export function Button({
  children,
  loading,
  variant = "primary",
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { loading?: boolean; variant?: "primary" | "secondary" }) {
  const styles =
    variant === "primary"
      ? "bg-[var(--color-accent)] text-[var(--color-accent-ink)] hover:opacity-90"
      : "border border-[var(--color-line)] bg-[var(--color-surface)] hover:bg-[var(--color-bg)]";
  return (
    <button
      {...rest}
      disabled={rest.disabled || loading}
      aria-busy={loading || undefined}
      className={`inline-flex h-11 items-center justify-center gap-2 rounded-lg px-4 text-base font-medium transition disabled:cursor-not-allowed disabled:opacity-60 ${styles} ${rest.className ?? ""}`}
    >
      {loading && <span aria-hidden className="size-4 animate-spin rounded-full border-2 border-current border-t-transparent" />}
      {children}
    </button>
  );
}

export function Alert({ tone = "error", children }: { tone?: "error" | "success" | "info"; children: ReactNode }) {
  const styles = {
    error: "border-red-300 bg-red-50 text-red-900 dark:border-red-900 dark:bg-red-950 dark:text-red-100",
    success: "border-emerald-300 bg-emerald-50 text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-100",
    info: "border-[var(--color-line)] bg-[var(--color-surface)] text-[var(--color-ink)]",
  }[tone];
  return (
    <div role={tone === "error" ? "alert" : "status"} className={`rounded-lg border px-3 py-2 text-sm ${styles}`}>
      {children}
    </div>
  );
}

export function AuthCard({ title, subtitle, children, footer }: { title: string; subtitle?: string; children: ReactNode; footer?: ReactNode }) {
  return (
    <main id="main" className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center px-6 py-12">
      <a href="/" className="mb-8 text-sm font-semibold tracking-wide uppercase text-[var(--color-muted)]">
        Sieveline
      </a>
      <div className="rounded-[var(--radius-card)] border border-[var(--color-line)] bg-[var(--color-surface)] p-6 shadow-sm sm:p-8">
        <h1 className="text-2xl font-semibold">{title}</h1>
        {subtitle && <p className="mt-1 text-[var(--color-muted)]">{subtitle}</p>}
        <div className="mt-6">{children}</div>
      </div>
      {footer && <div className="mt-6 text-center text-sm text-[var(--color-muted)]">{footer}</div>}
    </main>
  );
}
