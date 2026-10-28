import type { Logger, ServerEnv } from "@sieveline/core";

export interface EmailMessage {
  to: string;
  subject: string;
  text: string;
  html: string;
}

export interface EmailSender {
  send(message: EmailMessage): Promise<void>;
}

/**
 * Resend over plain fetch (free tier). In development without a key, emails are written to the
 * server log so sign-up can be tested locally. Production without a key refuses to send.
 */
export function createEmailSender(env: ServerEnv, log: Logger, fetchImpl: typeof fetch = fetch): EmailSender {
  if (env.EMAIL_PROVIDER_API_KEY && env.EMAIL_FROM) {
    const key = env.EMAIL_PROVIDER_API_KEY;
    const from = env.EMAIL_FROM;
    return {
      async send(m) {
        const res = await fetchImpl("https://api.resend.com/emails", {
          method: "POST",
          headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
          body: JSON.stringify({ from, to: [m.to], subject: m.subject, text: m.text, html: m.html }),
          signal: AbortSignal.timeout(10_000),
        });
        if (!res.ok) throw new Error(`Email provider returned HTTP ${res.status}`);
      },
    };
  }
  if (env.NODE_ENV === "production") {
    return {
      async send() {
        throw new Error("Email is not configured (EMAIL_PROVIDER_API_KEY, EMAIL_FROM)");
      },
    };
  }
  return {
    async send(m) {
      // Development only: the link is printed so the flow can be completed without an email provider.
      log.warn("dev email (not sent)", { to: m.to, subject: m.subject, body: m.text });
    },
  };
}

const escapeHtml = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

/** Plain, accessible transactional email with one call-to-action link. */
export function actionEmail(input: { to: string; subject: string; intro: string; action: string; url: string; outro: string }): EmailMessage {
  const url = escapeHtml(input.url);
  return {
    to: input.to,
    subject: input.subject,
    text: `${input.intro}\n\n${input.action}: ${input.url}\n\n${input.outro}\n\nSieveline`,
    html: `<!doctype html><html lang="en"><body style="font-family:system-ui,sans-serif;line-height:1.5;color:#1c1b18">
<p>${escapeHtml(input.intro)}</p>
<p><a href="${url}" style="display:inline-block;background:#1f5f4a;color:#fff;padding:10px 16px;border-radius:8px;text-decoration:none">${escapeHtml(input.action)}</a></p>
<p style="font-size:13px;color:#5c5a53">Or paste this link into your browser:<br>${url}</p>
<p style="font-size:13px;color:#5c5a53">${escapeHtml(input.outro)}</p>
<p>Sieveline</p></body></html>`,
  };
}
