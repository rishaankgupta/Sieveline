import type { Metadata } from "next";
import { requireUser } from "@/server/session";

/** Better Auth adds this field via the two-factor plugin; the plugin list is built dynamically so it isn't in the inferred type. */
type WithTwoFactor = { twoFactorEnabled?: boolean | null };
import { TwoFactorSettings } from "./two-factor";

export const metadata: Metadata = { title: "Security" };
export const dynamic = "force-dynamic";

export default async function SecurityPage() {
  const user = await requireUser();
  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="text-2xl font-semibold">Security</h1>
      <p className="mt-1 text-[var(--color-muted)]">Signed in as {user.email}.</p>
      <section aria-labelledby="tfa" className="mt-8 rounded-[var(--radius-card)] border border-[var(--color-line)] bg-[var(--color-surface)] p-5">
        <h2 id="tfa" className="mb-3 text-lg font-semibold">Two-factor authentication</h2>
        <TwoFactorSettings enabled={Boolean((user as WithTwoFactor).twoFactorEnabled)} />
      </section>
    </div>
  );
}
