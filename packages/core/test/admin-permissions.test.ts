import { describe, expect, it } from "vitest";
import { adminCan, isStaff, STEP_UP_ACTIONS, type AdminAction } from "../src/index.ts";

describe("platform staff permissions (MA-T13)", () => {
  it("only owners hold the kill switch and manage staff", () => {
    for (const r of ["viewer", "finance", "support", "admin"]) {
      expect(adminCan(r, "research.kill_switch"), r).toBe(false);
      expect(adminCan(r, "staff.manage"), r).toBe(false);
    }
    expect(adminCan("owner", "research.kill_switch")).toBe(true);
    expect(adminCan("owner", "staff.manage")).toBe(true);
  });

  it("matches the role table in ADMIN.md", () => {
    const table: [string, AdminAction, boolean][] = [
      ["viewer", "admin.view", true], ["viewer", "users.suspend", false], ["viewer", "settings.edit", false],
      ["support", "users.suspend", true], ["support", "workspaces.pause", true], ["support", "workspaces.edit_limits", false], ["support", "settings.edit", false],
      ["finance", "workspaces.edit_limits", true], ["finance", "users.suspend", false],
      ["admin", "settings.edit", true], ["admin", "integrations.test", true], ["admin", "users.suspend", true], ["admin", "workspaces.edit_limits", true],
    ];
    for (const [role, action, ok] of table) expect(adminCan(role, action), `${role} ${action}`).toBe(ok);
  });

  it("denies non-staff and unknown values", () => {
    for (const r of ["none", "", "OWNER", null, undefined, 1]) expect(isStaff(r), String(r)).toBe(false);
  });

  it("every write action needs step-up", () => {
    for (const a of ["users.suspend", "workspaces.edit_limits", "settings.edit", "research.kill_switch", "staff.manage"] as const) expect(STEP_UP_ACTIONS.has(a)).toBe(true);
    expect(STEP_UP_ACTIONS.has("admin.view")).toBe(false);
  });
});
