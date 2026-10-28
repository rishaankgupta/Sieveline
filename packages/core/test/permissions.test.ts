import { describe, expect, it } from "vitest";
import { ACTIONS, assertCan, can, Forbidden } from "../src/index.ts";

describe("permission matrix", () => {
  it("owners can do everything", () => {
    for (const a of ACTIONS) expect(can("owner", a), a).toBe(true);
  });
  it("members work on research but cannot manage people, billing or audit", () => {
    for (const a of ["run.start", "thesis.edit", "chat.use", "deep_dive.start", "review.write"] as const) expect(can("member", a)).toBe(true);
    for (const a of ["members.invite", "members.remove", "members.change_role", "billing.manage", "audit.view", "workspace.delete"] as const) {
      expect(can("member", a), a).toBe(false);
    }
  });
  it("viewers can only look and export", () => {
    expect(can("viewer", "run.view")).toBe(true);
    expect(can("viewer", "export.download")).toBe(true);
    for (const a of ["run.start", "chat.use", "deep_dive.start", "thesis.edit"] as const) expect(can("viewer", a), a).toBe(false);
  });
  it("no role means no access", () => {
    expect(can(null, "run.view")).toBe(false);
    expect(() => assertCan(undefined, "run.view")).toThrow(Forbidden);
  });
});
