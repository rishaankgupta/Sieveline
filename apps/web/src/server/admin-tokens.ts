import { createHmac, timingSafeEqual } from "node:crypto";

/** Pure helpers for admin access, kept free of Next.js imports so they can be unit tested. */

export const STEP_UP_MS = 5 * 60_000;

function ipv4ToInt(ip: string): number | null {
  const m = ip.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (!m) return null;
  const parts = m.slice(1).map(Number);
  if (parts.some((p) => p > 255)) return null;
  return ((parts[0]! << 24) | (parts[1]! << 16) | (parts[2]! << 8) | parts[3]!) >>> 0;
}

/** Exact IP or IPv4 CIDR (e.g. 203.0.113.0/24). */
export function ipAllowed(ip: string | null, allowlist: string[]): boolean {
  if (!allowlist.length) return true;
  if (!ip) return false;
  return allowlist.some((entry) => {
    if (!entry.includes("/")) return entry === ip;
    const [base, bitsRaw] = entry.split("/");
    const bits = Number(bitsRaw);
    const a = ipv4ToInt(ip);
    const b = ipv4ToInt(base ?? "");
    if (a === null || b === null || !Number.isInteger(bits) || bits < 0 || bits > 32) return false;
    const mask = bits === 0 ? 0 : (~0 << (32 - bits)) >>> 0;
    return (a & mask) === (b & mask);
  });
}

function sign(secret: string, value: string): string {
  return createHmac("sha256", secret).update(`stepup:${value}`).digest("base64url");
}

/** `<sessionId>.<expiresAtMs>.<hmac>`: proves a fresh 2FA code for this session until expiry. */
export function stepUpToken(secret: string, sessionId: string, expiresAt: number): string {
  const body = `${sessionId}.${expiresAt}`;
  return `${body}.${sign(secret, body)}`;
}

export function verifyStepUpToken(secret: string, token: string | undefined, sessionId: string, now = Date.now()): boolean {
  if (!token || token.length > 512) return false;
  const i = token.lastIndexOf(".");
  if (i < 0) return false;
  const body = token.slice(0, i);
  const mac = Buffer.from(token.slice(i + 1));
  const expected = Buffer.from(sign(secret, body));
  if (mac.length !== expected.length || !timingSafeEqual(mac, expected)) return false;
  const j = body.lastIndexOf(".");
  const sid = body.slice(0, j);
  const exp = Number(body.slice(j + 1));
  // A token valid for longer than STEP_UP_MS was not issued by us (or the clock moved): reject.
  return sid === sessionId && Number.isFinite(exp) && exp > now && exp - now <= STEP_UP_MS;
}
