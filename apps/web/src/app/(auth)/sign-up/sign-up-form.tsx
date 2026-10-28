"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Turnstile } from "@/components/turnstile";
import { Alert, Button, Field } from "@/components/ui";
import { authClient } from "@/lib/auth-client";
import { authErrorMessage } from "@/lib/auth-errors";

const SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;

export function SignUpForm({ nonce }: { nonce?: string }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [captcha, setCaptcha] = useState<string | null>(null);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const password = String(form.get("password"));
    if (password !== String(form.get("confirm"))) {
      setError("The two passwords don't match.");
      return;
    }
    setError(null);
    setLoading(true);
    const email = String(form.get("email")).trim();
    const { error: err } = await authClient.signUp.email({
      name: String(form.get("name")).trim(),
      email,
      password,
      callbackURL: "/app",
      fetchOptions: captcha ? { headers: { "x-captcha-response": captcha } } : undefined,
    });
    setLoading(false);
    if (err) {
      setError(authErrorMessage(err));
      return;
    }
    router.push(`/check-email?email=${encodeURIComponent(email)}`);
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate={false}>
      {error && <Alert>{error}</Alert>}
      <Field label="Your name" name="name" autoComplete="name" required maxLength={80} />
      <Field label="Work email" name="email" type="email" autoComplete="email" required maxLength={254} />
      <Field label="Password" name="password" type="password" autoComplete="new-password" required minLength={12} maxLength={128} hint="At least 12 characters. A short sentence works well." />
      <Field label="Confirm password" name="confirm" type="password" autoComplete="new-password" required minLength={12} maxLength={128} />
      <Turnstile siteKey={SITE_KEY} nonce={nonce} onToken={setCaptcha} />
      <Button type="submit" loading={loading} disabled={Boolean(SITE_KEY) && !captcha}>
        Create account
      </Button>
      <p className="text-xs text-[var(--color-muted)]">
        By creating an account you agree to the <a className="underline" href="/terms">Terms</a> and{" "}
        <a className="underline" href="/privacy">Privacy Policy</a>.
      </p>
    </form>
  );
}
