import type { NextConfig } from "next";
import { withWorkflow } from "workflow/next";

/**
 * Security headers on every response. The Content-Security-Policy is per-request (with a
 * nonce) and is set in src/proxy.ts. API routes get a locked-down policy here instead.
 */
const securityHeaders = [
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
  { key: "X-Frame-Options", value: "DENY" },
];

const config: NextConfig = {
  poweredByHeader: false,
  reactStrictMode: true,
  transpilePackages: ["@sieveline/core", "@sieveline/db"],
  serverExternalPackages: ["@node-rs/argon2"],
  async headers() {
    return [
      { source: "/:path*", headers: securityHeaders },
      {
        source: "/api/:path*",
        headers: [{ key: "Content-Security-Policy", value: "default-src 'none'; frame-ancestors 'none'" }],
      },
    ];
  },
};

export default withWorkflow(config);
