"use client";

import { useSearchParams } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Turnstile } from "@/components/turnstile";
import { Alert, Button, Field } from "@/components/ui";
import { authClient, safeNext } from "@/lib/auth-client";
import { authErrorMessage } from "@/lib/auth-errors";

const SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;

export function SignInForm({ nonce, googleEnabled }: { nonce?: string; googleEnabled: boolean }) {
  const params = useSearchParams();
  const next = safeNext(params.get("next"));
  const [error, setError] = useState<string | null>(params.get("error") ? "Sign-in failed. Please try again." : null);
  const [loading, setLoading] = useState(false);
  const [captcha, setCaptcha] = useState<string | null>(null);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    setError(null);
    setLoading(true);
    const { error: err } = await authClient.signIn.email({
      email: String(form.get("email")).trim(),
      password: String(form.get("password")),
      callbackURL: next,
      fetchOptions: captcha ? { headers: { "x-captcha-response": captcha } } : undefined,
    });
    if (err) {
      setLoading(false);
      setError(authErrorMessage(err));
      return;
    }
    window.location.assign(next);
  }

  async function google() {
    setLoading(true);
    await authClient.signIn.social({ provider: "google", callbackURL: next, errorCallbackURL: "/sign-in?error=google" });
  }

  return (
    <div className="flex flex-col gap-4">
      {error && <Alert>{error}</Alert>}
      {googleEnabled && (
        <>
          <Button type="button" variant="secondary" onClick={google} disabled={loading}>
            Continue with Google
          </Button>
          <div className="flex items-center gap-3 text-xs text-[var(--color-muted)]" aria-hidden>
            <span className="h-px flex-1 bg-[var(--color-line)]" /> or <span className="h-px flex-1 bg-[var(--color-line)]" />
          </div>
        </>
      )}
      <form onSubmit={onSubmit} className="flex flex-col gap-4">
        <Field label="Email" name="email" type="email" autoComplete="email" required maxLength={254} />
        <Field label="Password" name="password" type="password" autoComplete="current-password" required maxLength={128} />
        <div className="-mt-2 text-right text-sm">
          <a className="underline" href="/forgot-password">Forgot password?</a>
        </div>
        <Turnstile siteKey={SITE_KEY} nonce={nonce} onToken={setCaptcha} />
        <Button type="submit" loading={loading} disabled={Boolean(SITE_KEY) && !captcha}>
          Sign in
        </Button>
      </form>
    </div>
  );
}
