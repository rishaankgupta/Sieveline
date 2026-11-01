"use client";

import { twoFactorClient } from "better-auth/client/plugins";
import { createAuthClient } from "better-auth/react";

export const authClient = createAuthClient({
  plugins: [
    // The sign-in form sends people to the code page itself (keeping ?next=). Navigating here too
    // raced with the form's own redirect and bounced 2FA users back to sign-in.
    twoFactorClient({ onTwoFactorRedirect() {} }),
  ],
});

/** Only allow same-site relative paths after sign-in, never full URLs (open-redirect guard). */
export function safeNext(next: string | null | undefined, fallback = "/app"): string {
  if (!next || !next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\")) return fallback;
  return next;
}
