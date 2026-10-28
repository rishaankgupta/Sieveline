"use client";

import { useState } from "react";
import { Alert, Button } from "@/components/ui";

export function AcceptInvite({ token, email }: { token: string; email: string }) {
  const [state, setState] = useState<"idle" | "loading" | "error">("idle");
  const [error, setError] = useState<string | null>(null);

  async function accept() {
    setState("loading");
    const res = await fetch("/api/invitations/accept", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ token }),
    });
    if (res.ok) {
      window.location.assign("/app");
      return;
    }
    const body = (await res.json().catch(() => null)) as { error?: string } | null;
    setError(body?.error ?? "Something went wrong. Please try again.");
    setState("error");
  }

  return (
    <div className="flex flex-col gap-4">
      {error && <Alert>{error}</Alert>}
      <p>
        You&apos;re signed in as <strong className="break-all">{email}</strong>. The invitation must be for this email address.
      </p>
      <Button onClick={accept} loading={state === "loading"}>
        Accept invitation
      </Button>
    </div>
  );
}
