import { describe, expect, it } from "vitest";
import { contextAround, normalizeForMatch, tidyExcerpt } from "../src/index.ts";

const PAGE = "We meet the requirements and documentation standards your industry demands. 50+ Years of Precision Testing & Calibration Excellence Since 1976, Allometrics has provided calibration and controlled environment services to companies that depend on accurate measurements every day";

describe("excerpts", () => {
  it("snaps to the sentence start and a word end, and stays a verbatim piece of the page", () => {
    const i = PAGE.indexOf("Since 1976");
    const out = contextAround(PAGE, i, i + "Since 1976".length, 80);
    expect(out.startsWith("50+ Years of Precision")).toBe(true);
    expect(out).toContain("Since 1976");
    expect(out.endsWith("…")).toBe(true);
    expect(out).not.toMatch(/measurem…$/);
    expect(normalizeForMatch(PAGE)).toContain(normalizeForMatch(out.replace(/^…|…$/g, "")));
  });
  it("never cuts into the match itself", () => {
    const t = "aaaa bbbb. cccc dddd eeee ffff gggg";
    const i = t.indexOf("dddd");
    expect(contextAround(t, i, i + 4, 6)).toContain("dddd");
  });
  it("leaves uncut text alone", () => {
    expect(contextAround("Founded in 1985 by the Smith family.", 0, 10)).toBe("Founded in 1985 by the Smith family.");
    expect(tidyExcerpt("Founded in 1985.", false, false)).toBe("Founded in 1985.");
  });
});
