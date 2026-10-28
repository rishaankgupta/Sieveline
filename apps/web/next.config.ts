import type { NextConfig } from "next";

/**
 * Baseline security headers on every response. The Content-Security-Policy with per-request
 * nonces is added in M2-T07; until then a strict static policy is used.
 */
const securityHeaders = [
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
  {
    key: "Content-Security-Policy",
    value: [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline'",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: https:",
      "font-src 'self'",
      "connect-src 'self'",
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "form-action 'self'",
      "object-src 'none'",
    ].join("; "),
  },
];

const config: NextConfig = {
  poweredByHeader: false,
  reactStrictMode: true,
  transpilePackages: ["@sieveline/core", "@sieveline/db"],
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default config;
