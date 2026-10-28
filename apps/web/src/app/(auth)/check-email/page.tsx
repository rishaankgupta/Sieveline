import type { Metadata } from "next";
import { AuthCard } from "@/components/ui";

export const metadata: Metadata = { title: "Check your email" };

export default async function CheckEmailPage({ searchParams }: { searchParams: Promise<{ email?: string }> }) {
  const { email } = await searchParams;
  return (
    <AuthCard
      title="Check your email"
      footer={<a className="underline" href="/sign-in">Back to sign in</a>}
    >
      <p>
        If {email ? <strong className="break-all">{email.slice(0, 254)}</strong> : "that address"} can be used for a new
        account, we&apos;ve sent a link to confirm it. The link works for 24 hours.
      </p>
      <p className="mt-3 text-sm text-[var(--color-muted)]">Can&apos;t find it? Check your spam folder, then try signing in to get a new link.</p>
    </AuthCard>
  );
}
