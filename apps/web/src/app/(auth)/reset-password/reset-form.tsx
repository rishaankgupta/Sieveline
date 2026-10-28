"use client";

import { useSearchParams } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Alert, Button, Field } from "@/components/ui";
import { authClient } from "@/lib/auth-client";
import { authErrorMessage } from "@/lib/auth-errors";

export function ResetForm() {
  const params = useSearchParams();
  const token = params.get("token");
  const [error, setError] = useState<string | null>(params.get("error") ? authErrorMessage({ code: "INVALID_TOKEN" }) : null);
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  if (!token) return <Alert>{authErrorMessage({ code: "INVALID_TOKEN" })}</Alert>;
  if (done) {
    return (
      <Alert tone="success">
        Your password was changed and other devices were signed out. <a className="underline" href="/sign-in">Sign in</a>
      </Alert>
    );
  }

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const newPassword = String(form.get("password"));
    if (newPassword !== String(form.get("confirm"))) {
      setError("The two passwords don't match.");
      return;
    }
    setLoading(true);
    setError(null);
    const { error: err } = await authClient.resetPassword({ newPassword, token: token! });
    setLoading(false);
    if (err) setError(authErrorMessage(err));
    else setDone(true);
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4">
      {error && <Alert>{error}</Alert>}
      <Field label="New password" name="password" type="password" autoComplete="new-password" required minLength={12} maxLength={128} hint="At least 12 characters." />
      <Field label="Confirm new password" name="confirm" type="password" autoComplete="new-password" required minLength={12} maxLength={128} />
      <Button type="submit" loading={loading}>Change password</Button>
    </form>
  );
}
