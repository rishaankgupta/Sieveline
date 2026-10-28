import { getSessionCookie } from "better-auth/cookies";
import { NextResponse, type NextRequest } from "next/server";

/**
 * Runs before every page request:
 * 1. Builds a per-request Content-Security-Policy with a fresh nonce. Next.js applies the nonce
 *    to its own scripts automatically when it sees the CSP request header.
 * 2. Sends visitors without a session cookie away from /app and /admin. This is only a fast
 *    pre-check; every protected page and API still validates the session on the server.
 */
const PROTECTED = ["/app", "/admin"];
const TURNSTILE = "https://challenges.cloudflare.com";

export function buildCsp(nonce: string, dev: boolean): string {
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${dev ? " 'unsafe-eval'" : ""}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: https:",
    "font-src 'self'",
    `connect-src 'self'${dev ? " ws:" : ""}`,
    `frame-src ${TURNSTILE}`,
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "object-src 'none'",
    ...(dev ? [] : ["upgrade-insecure-requests"]),
  ].join("; ");
}

export function proxy(request: NextRequest): NextResponse {
  const { pathname, search } = request.nextUrl;

  if (PROTECTED.some((p) => pathname === p || pathname.startsWith(`${p}/`))) {
    if (!getSessionCookie(request, { cookiePrefix: "sl" })) {
      const url = request.nextUrl.clone();
      url.pathname = "/sign-in";
      url.search = `?next=${encodeURIComponent(pathname + search)}`;
      return NextResponse.redirect(url);
    }
  }

  const nonce = btoa(crypto.randomUUID());
  const csp = buildCsp(nonce, process.env.NODE_ENV === "development");
  const headers = new Headers(request.headers);
  headers.set("x-nonce", nonce);
  headers.set("content-security-policy", csp);
  const response = NextResponse.next({ request: { headers } });
  response.headers.set("Content-Security-Policy", csp);
  return response;
}

export const config = {
  matcher: [
    {
      source: "/((?!api/|_next/static|_next/image|favicon.ico|robots.txt|\\.well-known/workflow/).*)",
      missing: [
        { type: "header", key: "next-router-prefetch" },
        { type: "header", key: "purpose", value: "prefetch" },
      ],
    },
  ],
};
