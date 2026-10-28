"use client";

export class ApiError extends Error {
  readonly status: number;
  readonly code: string | undefined;
  constructor(status: number, message: string, code?: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

/** Same-origin JSON fetch. Errors become ApiError with the server's safe message. */
export async function api<T>(path: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
  const res = await fetch(path, {
    method: init.method ?? (init.body === undefined ? "GET" : "POST"),
    headers: init.body === undefined ? undefined : { "content-type": "application/json" },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
    credentials: "same-origin",
  });
  if (res.status === 204) return undefined as T;
  const data = (await res.json().catch(() => null)) as (T & { error?: string; code?: string; issues?: { path: string; message: string }[] }) | null;
  // A plain 401 means the session is gone; a 401 with a code (e.g. step_up_required) is for the caller.
  if (res.status === 401 && (!data?.code || data.code === "admin_idle")) {
    window.location.assign(`/sign-in?next=${encodeURIComponent(window.location.pathname)}`);
    throw new ApiError(401, "Sign in required");
  }
  if (!res.ok) {
    const issue = data?.issues?.[0];
    const detail = issue ? ` (${humanPath(issue.path)}: ${issue.message})` : "";
    throw new ApiError(res.status, `${data?.error ?? "Something went wrong. Please try again."}${detail}`, data?.code);
  }
  return data as T;
}

/** "thesis.criteria.2.question" -> "question 3". */
function humanPath(path: string): string {
  const m = path.match(/criteria\.(\d+)\.(\w+)/);
  if (m) return `question ${Number(m[1]) + 1} ${m[2] === "question" ? "" : m[2]}`.trim();
  return path.replace(/^thesis\./, "").replace(/\.(\d+)/g, (_, n: string) => ` ${Number(n) + 1}`);
}
