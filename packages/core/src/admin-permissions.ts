/**
 * Platform staff permissions (docs/07-admin/ADMIN.md section 4). Separate from workspace roles:
 * a workspace owner has no platform power, and platform roles can only be granted by the owner.
 */
export const PLATFORM_ROLES = ["none", "viewer", "finance", "support", "admin", "owner"] as const;
export type PlatformRole = (typeof PLATFORM_ROLES)[number];

export type AdminAction =
  | "admin.view"          // open /admin, read dashboards
  | "users.view"
  | "users.suspend"
  | "users.sessions.revoke"
  | "workspaces.view"
  | "workspaces.edit_limits"
  | "workspaces.pause"
  | "runs.view"
  | "runs.cancel"
  | "settings.view"
  | "settings.edit"
  | "research.kill_switch"
  | "integrations.test"
  | "audit.view"
  | "staff.manage";

const VIEWER: AdminAction[] = ["admin.view", "users.view", "workspaces.view", "runs.view", "settings.view", "audit.view"];
const FINANCE: AdminAction[] = [...VIEWER, "workspaces.edit_limits"];
const SUPPORT: AdminAction[] = [...VIEWER, "users.suspend", "users.sessions.revoke", "workspaces.pause", "runs.cancel"];
const ADMIN: AdminAction[] = [...new Set([...SUPPORT, ...FINANCE, "settings.edit", "integrations.test"] as AdminAction[])];
const OWNER: AdminAction[] = [...ADMIN, "research.kill_switch", "staff.manage"];

const MATRIX: Record<PlatformRole, ReadonlySet<AdminAction>> = {
  none: new Set(),
  viewer: new Set(VIEWER),
  finance: new Set(FINANCE),
  support: new Set(SUPPORT),
  admin: new Set(ADMIN),
  owner: new Set(OWNER),
};

/** Actions that change money, access or platform behavior: need a 2FA code from the last 5 minutes. */
export const STEP_UP_ACTIONS: ReadonlySet<AdminAction> = new Set([
  "users.suspend", "users.sessions.revoke", "workspaces.edit_limits", "workspaces.pause", "runs.cancel",
  "settings.edit", "research.kill_switch", "staff.manage",
]);

export function isPlatformRole(v: unknown): v is PlatformRole {
  return typeof v === "string" && (PLATFORM_ROLES as readonly string[]).includes(v);
}

export function adminCan(role: unknown, action: AdminAction): boolean {
  return isPlatformRole(role) && MATRIX[role].has(action);
}

export function isStaff(role: unknown): boolean {
  return adminCan(role, "admin.view");
}
