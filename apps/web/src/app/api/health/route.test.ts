import { afterEach, describe, expect, it, vi } from "vitest";
import { GET } from "./route";

afterEach(() => vi.unstubAllEnvs());

describe("GET /api/health", () => {
  it("reports ok and integration booleans only", async () => {
    vi.stubEnv("APP_URL", "https://sieveline.test");
    vi.stubEnv("AUTH_SECRET", "s".repeat(40));
    vi.stubEnv("DATABASE_URL", "postgres://u:p@h/db");
    vi.stubEnv("TAVILY_API_KEY", "tvly-secret-value");
    const res = GET();
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.status).toBe("ok");
    expect(JSON.stringify(body)).not.toContain("tvly-secret-value");
    expect(res.headers.get("cache-control")).toBe("no-store");
  });

  it("returns 503 without details when misconfigured", async () => {
    vi.stubEnv("APP_URL", "");
    const res = GET();
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ status: "misconfigured" });
  });
});
