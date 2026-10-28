import { describe, expect, it, vi } from "vitest";
import { createLogger, redact } from "../src/index";

describe("logger", () => {
  it("writes one JSON line with base fields and respects level", () => {
    const lines: string[] = [];
    const log = createLogger({ service: "web" }, { level: "info", write: (l) => lines.push(l) });
    log.debug("hidden");
    log.child({ requestId: "r1" }).info("hello", { n: 1 });
    expect(lines.length).toBe(1);
    expect(JSON.parse(lines[0]!)).toMatchObject({ level: "info", msg: "hello", service: "web", requestId: "r1", n: 1 });
  });

  it("redacts secrets by key and by value pattern", () => {
    const out = JSON.stringify(
      redact({
        apiKey: "abc",
        nested: { authorization: "Bearer xyz", note: "key is tvly-abcdefgh123 and sk-ABCDEFGHIJKLMNOP" },
        url: "postgres://user:hunter2@db.example.com/x",
        err: new Error("failed with tvly-secretsecret"),
        list: ["Bearer abc.def"],
      }),
    );
    for (const s of ["abc\"", "xyz", "tvly-abcdefgh123", "sk-ABCDEFGHIJKLMNOP", "hunter2", "tvly-secretsecret", "abc.def"]) {
      expect(out).not.toContain(s);
    }
    expect(out).toContain("db.example.com");
  });

  it("supports every level and writes to stdout by default", () => {
    const spy = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    const log = createLogger({}, { level: "debug" });
    log.debug("d");
    log.warn("w");
    log.error("e", { err: new Error("boom") });
    expect(spy).toHaveBeenCalledTimes(3);
    expect(String(spy.mock.calls[2]![0])).toContain('"level":"error"');
    spy.mockRestore();
  });

  it("truncates huge strings and deep objects", () => {
    expect(String(redact("x".repeat(5000))).length).toBeLessThan(2100);
    let deep: Record<string, unknown> = {};
    const root = deep;
    for (let i = 0; i < 10; i++) deep = (deep.a = {}) as Record<string, unknown>;
    expect(JSON.stringify(redact(root))).toContain("[depth]");
  });
});
