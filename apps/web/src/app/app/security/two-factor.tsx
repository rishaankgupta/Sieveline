"use client";

import QRCode from "qrcode";
import { useState } from "react";
import { Alert, Button, Field } from "@/components/ui";
import { authClient } from "@/lib/auth-client";

type Step = { kind: "idle" } | { kind: "scan"; uri: string; secret: string; qr: string; backupCodes: string[] } | { kind: "done"; backupCodes: string[] };

/**
 * Turn on an authenticator app: confirm the password, scan the QR code (or type the key),
 * enter one code to prove it works. Backup codes are shown once.
 */
export function TwoFactorSettings({ enabled }: { enabled: boolean }) {
  const [step, setStep] = useState<Step>({ kind: "idle" });
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function start() {
    setBusy(true);
    setError(null);
    const { data, error: err } = await authClient.twoFactor.enable({ password, method: "totp" });
    setBusy(false);
    if (err || !data || !("totpURI" in data)) return setError(err?.message ?? "Could not start setup. Check your password.");
    const secret = new URL(data.totpURI).searchParams.get("secret") ?? "";
    const qr = await QRCode.toDataURL(data.totpURI, { margin: 1, width: 220, errorCorrectionLevel: "M" });
    setPassword("");
    setStep({ kind: "scan", uri: data.totpURI, secret, qr, backupCodes: data.backupCodes });
  }

  async function verify() {
    if (step.kind !== "scan") return;
    setBusy(true);
    setError(null);
    const { error: err } = await authClient.twoFactor.verifyTotp({ code });
    setBusy(false);
    if (err) return setError(err.message ?? "That code didn't work. Try the newest code.");
    setStep({ kind: "done", backupCodes: step.backupCodes });
  }

  async function disable() {
    const pw = window.prompt("Enter your password to turn off two-factor");
    if (!pw) return;
    setBusy(true);
    const { error: err } = await authClient.twoFactor.disable({ password: pw });
    setBusy(false);
    if (err) return setError(err.message ?? "Could not turn it off.");
    window.location.reload();
  }

  if (step.kind === "done") {
    return (
      <div className="flex flex-col gap-3">
        <Alert tone="success">Two-factor is on. You&apos;ll be asked for a code when you sign in.</Alert>
        <BackupCodes codes={step.backupCodes} />
        <div><Button onClick={() => window.location.reload()}>Done</Button></div>
      </div>
    );
  }

  if (enabled && step.kind === "idle") {
    return (
      <div className="flex flex-col items-start gap-3">
        <p className="font-medium">✓ Two-factor is on.</p>
        <Button variant="secondary" loading={busy} onClick={() => void disable()}>Turn off</Button>
        {error && <Alert>{error}</Alert>}
      </div>
    );
  }

  if (step.kind === "scan") {
    return (
      <form className="flex flex-col gap-4" onSubmit={(e) => { e.preventDefault(); void verify(); }}>
        <ol className="list-decimal pl-5 text-sm">
          <li>Open an authenticator app (Google Authenticator, 1Password, Authy…).</li>
          <li>Scan this code, or type the key below.</li>
          <li>Enter the 6-digit code the app shows.</li>
        </ol>
        <img src={step.qr} width={220} height={220} alt="QR code for your authenticator app" className="rounded-md border border-[var(--color-line)] bg-white p-2" />
        <p className="text-sm">Key: <code className="select-all break-all rounded bg-[var(--color-bg)] px-1.5 py-0.5">{step.secret}</code></p>
        <Field label="6-digit code" inputMode="numeric" autoComplete="one-time-code" pattern="\d{6}" maxLength={6} required
          value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))} />
        {error && <Alert>{error}</Alert>}
        <div><Button type="submit" loading={busy} disabled={code.length !== 6}>Turn on</Button></div>
      </form>
    );
  }

  return (
    <form className="flex max-w-sm flex-col gap-3" onSubmit={(e) => { e.preventDefault(); void start(); }}>
      <p className="text-sm text-[var(--color-muted)]">Adds a code from your phone to every sign-in. Required for the admin panel.</p>
      <Field label="Your password" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
      {error && <Alert>{error}</Alert>}
      <div><Button type="submit" loading={busy} disabled={!password}>Set up two-factor</Button></div>
    </form>
  );
}

function BackupCodes({ codes }: { codes: string[] }) {
  return (
    <div className="rounded-lg border border-[var(--color-line)] p-3">
      <p className="text-sm font-medium">Backup codes</p>
      <p className="text-xs text-[var(--color-muted)]">Each works once if you lose your phone. Save them somewhere safe now; they won&apos;t be shown again.</p>
      <ul className="mt-2 grid grid-cols-2 gap-1 font-mono text-sm">{codes.map((c) => <li key={c} className="select-all">{c}</li>)}</ul>
    </div>
  );
}
