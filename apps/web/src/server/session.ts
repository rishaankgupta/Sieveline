import "server-only";
import type { WorkspaceRole } from "@sieveline/core";
import { listUserWorkspaces } from "@sieveline/db";
import { cookies, headers } from "next/headers";
import { app } from "./context";

export const WORKSPACE_COOKIE = "sl.workspace";

export class Unauthorized extends Error {
  constructor() {
    super("Sign in required");
    this.name = "Unauthorized";
  }
}

/** The signed-in user, validated against the session store (not just the cookie). */
export async function requireUser() {
  const session = await app().auth.api.getSession({ headers: await headers() });
  if (!session) throw new Unauthorized();
  return session.user;
}

/**
 * The workspace this request acts on: the one in the workspace cookie if the user is still a
 * member of it, otherwise their first workspace. Membership is checked on every request.
 */
export async function requireWorkspace(): Promise<{ userId: string; workspaceId: string; role: WorkspaceRole; name: string }> {
  const user = await requireUser();
  const memberships = await listUserWorkspaces(app().db, user.id);
  if (!memberships.length) throw new Unauthorized();
  const wanted = (await cookies()).get(WORKSPACE_COOKIE)?.value;
  const chosen = memberships.find((m) => m.id === wanted) ?? memberships[0]!;
  return { userId: user.id, workspaceId: chosen.id, role: chosen.role, name: chosen.name };
}
