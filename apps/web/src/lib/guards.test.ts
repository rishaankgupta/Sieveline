import { describe, expect, it } from "vitest";
import { buildCsp } from "../proxy";
import { authErrorMessage } from "./auth-errors";
import { safeNext } from "./auth-client";

describe("safeNext (open-redirect guard)", () => {
  it("keeps same-site relative paths", () => {
    expect(safeNext("/app/runs?x=1")).toBe("/app/runs?x=1");
  });
  it("rejects absolute, protocol-relative and backslash URLs", () => {
    for (const bad of ["https://evil.example", "//evil.example", "/\\evil.example", "javascript:alert(1)", "", null, undefined]) {
      expect(safeNext(bad)).toBe("/app");
    }
  });
});

describe("buildCsp", () => {
  it("uses the nonce, strict-dynamic, and no unsafe-eval in production", () => {
    const csp = buildCsp("abc", false);
    expect(csp).toContain("script-src 'self' 'nonce-abc' 'strict-dynamic'");
    expect(csp).not.toContain("unsafe-eval");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain("upgrade-insecure-requests");
  });
  it("allows dev tooling only in development", () => {
    expect(buildCsp("abc", true)).toContain("'unsafe-eval'");
  });
});

describe("authErrorMessage", () => {
  it("never reveals whether an account exists and maps rate limits", () => {
    expect(authErrorMessage({ code: "INVALID_EMAIL_OR_PASSWORD" })).toBe("That email and password don't match.");
    expect(authErrorMessage({ status: 429 })).toMatch(/Too many attempts/);
    expect(authErrorMessage({ code: "USER_NOT_FOUND" })).toBe("Something went wrong. Please try again.");
    expect(authErrorMessage(null)).toMatch(/Something went wrong/);
  });
});
