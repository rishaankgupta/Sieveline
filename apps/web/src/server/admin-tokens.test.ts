import { describe, expect, it } from "vitest";
import { ipAllowed, STEP_UP_MS, stepUpToken, verifyStepUpToken } from "./admin-tokens";

const SECRET = "s".repeat(40);

describe("step-up token", () => {
  const now = 1_800_000_000_000;
  const good = stepUpToken(SECRET, "sess-1", now + STEP_UP_MS);

  it("accepts a fresh token for the same session", () => {
    expect(verifyStepUpToken(SECRET, good, "sess-1", now)).toBe(true);
  });
  it("rejects another session, expiry, tampering, a wrong secret and junk", () => {
    expect(verifyStepUpToken(SECRET, good, "sess-2", now)).toBe(false);
    expect(verifyStepUpToken(SECRET, good, "sess-1", now + STEP_UP_MS + 1)).toBe(false);
    expect(verifyStepUpToken(SECRET, good.replace("sess-1", "sess-2"), "sess-2", now)).toBe(false);
    expect(verifyStepUpToken("x".repeat(40), good, "sess-1", now)).toBe(false);
    for (const junk of [undefined, "", "abc", "a.b.c", "x".repeat(600)]) expect(verifyStepUpToken(SECRET, junk, "sess-1", now)).toBe(false);
  });
  it("rejects a correctly signed token that claims a longer life than we issue", () => {
    expect(verifyStepUpToken(SECRET, stepUpToken(SECRET, "sess-1", now + 24 * 3_600_000), "sess-1", now)).toBe(false);
  });
});

describe("admin IP allowlist", () => {
  it("allows everyone when empty", () => expect(ipAllowed(null, [])).toBe(true));
  it("matches exact IPs and IPv4 CIDR ranges only", () => {
    const list = ["198.51.100.7", "203.0.113.0/24", "2001:db8::1"];
    expect(ipAllowed("198.51.100.7", list)).toBe(true);
    expect(ipAllowed("203.0.113.200", list)).toBe(true);
    expect(ipAllowed("203.0.114.1", list)).toBe(false);
    expect(ipAllowed("2001:db8::1", list)).toBe(true);
    expect(ipAllowed(null, list)).toBe(false);
    expect(ipAllowed("999.1.1.1", ["0.0.0.0/0"])).toBe(false);
    expect(ipAllowed("10.0.0.1", ["10.0.0.0/33"])).toBe(false);
  });
});
