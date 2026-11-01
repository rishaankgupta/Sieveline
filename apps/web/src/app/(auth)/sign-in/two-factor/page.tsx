"use client";

import { useState, type FormEvent } from "react";
import { Alert, AuthCard, Button, Field } from "@/components/ui";
import { authClient, safeNext } from "@/lib/auth-client";
import { authErrorMessage } from "@/lib/auth-errors";

/** Second sign-in step: a code from the authenticator app, or a one-time backup code. */
export default function TwoFactorPage() {
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [backup, setBackup] = useState(false);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const code = String(form.get("code")).replace(/\s/g, "");
    const trustDevice = form.get("trust") === "on";
    setLoading(true);
    setError(null);
    const { error: err } = backup
      ? await authClient.twoFactor.verifyBackupCode({ code, trustDevice })
      : await authClient.twoFactor.verifyTotp({ code, trustDevice });
    if (err) {
      setLoading(false);
      const message = authErrorMessage(err);
      setError(message);
      // An expired or used-up challenge can't be retried here: start the sign-in again.
      if (/sign in again/.test(message)) setTimeout(() => window.location.assign("/sign-in"), 2500);
      return;
    }
    window.location.assign(safeNext(new URLSearchParams(window.location.search).get("next")));
  }

  return (
    <AuthCard
      title="Two-step verification"
      subtitle={backup ? "Enter one of the backup codes you saved when you turned on two-factor." : "Enter the 6-digit code from your authenticator app."}
      footer={<a className="font-medium underline" href="/sign-in">Back to sign in</a>}
    >
      <form onSubmit={onSubmit} className="flex flex-col gap-4">
        {error && <Alert>{error}</Alert>}
        {backup ? (
          <Field key="backup" label="Backup code" name="code" autoComplete="one-time-code" required maxLength={40} autoFocus />
        ) : (
          <Field key="totp" label="Code" name="code" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9 ]{6,7}" required maxLength={7} autoFocus />
        )}
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="trust" className="size-4" /> Trust this device for 30 days
        </label>
        <Button type="submit" loading={loading}>Verify</Button>
        <button type="button" onClick={() => { setBackup((b) => !b); setError(null); }} className="text-sm underline">
          {backup ? "Use a code from my authenticator app" : "Lost your phone? Use a backup code"}
        </button>
      </form>
    </AuthCard>
  );
}
