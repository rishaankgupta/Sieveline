"use client";

import { useState, type FormEvent } from "react";
import { Alert, AuthCard, Button, Field } from "@/components/ui";
import { authClient } from "@/lib/auth-client";
import { authErrorMessage } from "@/lib/auth-errors";

export default function TwoFactorPage() {
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    setLoading(true);
    setError(null);
    const { error: err } = await authClient.twoFactor.verifyTotp({
      code: String(form.get("code")).replace(/\s/g, ""),
      trustDevice: form.get("trust") === "on",
    });
    if (err) {
      setLoading(false);
      setError(authErrorMessage(err));
      return;
    }
    window.location.assign("/app");
  }

  return (
    <AuthCard title="Two-step verification" subtitle="Enter the 6-digit code from your authenticator app.">
      <form onSubmit={onSubmit} className="flex flex-col gap-4">
        {error && <Alert>{error}</Alert>}
        <Field label="Code" name="code" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9 ]{6,7}" required maxLength={7} />
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="trust" className="size-4" /> Trust this device for 30 days
        </label>
        <Button type="submit" loading={loading}>Verify</Button>
      </form>
    </AuthCard>
  );
}
