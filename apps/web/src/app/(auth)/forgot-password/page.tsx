"use client";

import { useState, type FormEvent } from "react";
import { Alert, AuthCard, Button, Field } from "@/components/ui";
import { authClient } from "@/lib/auth-client";
import { authErrorMessage } from "@/lib/auth-errors";

export default function ForgotPasswordPage() {
  const [state, setState] = useState<"idle" | "loading" | "sent">("idle");
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setState("loading");
    setError(null);
    const email = String(new FormData(e.currentTarget).get("email")).trim();
    const { error: err } = await authClient.requestPasswordReset({ email, redirectTo: "/reset-password" });
    if (err && err.status === 429) {
      setState("idle");
      setError(authErrorMessage(err));
      return;
    }
    // Same message whether or not the account exists.
    setState("sent");
  }

  return (
    <AuthCard title="Reset your password" footer={<a className="underline" href="/sign-in">Back to sign in</a>}>
      {state === "sent" ? (
        <Alert tone="success">If an account uses that email, we&apos;ve sent a reset link. It works for 30 minutes.</Alert>
      ) : (
        <form onSubmit={onSubmit} className="flex flex-col gap-4">
          {error && <Alert>{error}</Alert>}
          <Field label="Email" name="email" type="email" autoComplete="email" required maxLength={254} />
          <Button type="submit" loading={state === "loading"}>Send reset link</Button>
        </form>
      )}
    </AuthCard>
  );
}
