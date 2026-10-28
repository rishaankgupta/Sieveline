/**
 * Workspace permission matrix. One place decides who can do what; API routes call `can()`.
 * Row-level security separately guarantees nobody reaches another workspace at all.
 */
export type WorkspaceRole = "owner" | "member" | "viewer";

export const ACTIONS = [
  "workspace.view", "workspace.rename", "workspace.delete",
  "members.view", "members.invite", "members.change_role", "members.remove",
  "thesis.view", "thesis.edit",
  "run.view", "run.start", "run.cancel",
  "review.write", "chat.use", "deep_dive.start", "export.download",
  "billing.view", "billing.manage", "audit.view",
] as const;
export type Action = (typeof ACTIONS)[number];

const VIEWER: Action[] = ["workspace.view", "members.view", "thesis.view", "run.view", "export.download"];
const MEMBER: Action[] = [...VIEWER, "thesis.edit", "run.start", "run.cancel", "review.write", "chat.use", "deep_dive.start"];
const OWNER: Action[] = [...ACTIONS];

const MATRIX: Record<WorkspaceRole, ReadonlySet<Action>> = {
  viewer: new Set(VIEWER),
  member: new Set(MEMBER),
  owner: new Set(OWNER),
};

export function can(role: WorkspaceRole | null | undefined, action: Action): boolean {
  return Boolean(role && MATRIX[role]?.has(action));
}

export class Forbidden extends Error {
  readonly action: Action;
  constructor(action: Action) {
    super(`Not allowed: ${action}`);
    this.action = action;
    this.name = "Forbidden";
  }
}

export function assertCan(role: WorkspaceRole | null | undefined, action: Action): void {
  if (!can(role, action)) throw new Forbidden(action);
}
