import { describe, expect, it } from "vitest";
import {
  available, escapeCell, findSignals, isBlocked, ledgerDrift, loadServerEnv, ConfigError,
  parseThesis, pickShortlist, rankCompanies, reserve, scoreCompany, settle, toCsv, toDomain,
  underDailyCeiling, verifyQuote, integrationStatus, creditsToUsd, maxCrawlCredits,
  maxExtractCredits, maxMapCredits, maxSearchCredits, normalizeForMatch,
} from "../src/index";
import calibration from "../templates/calibration-labs-us.json" with { type: "json" };

const thesis = parseThesis(calibration);

describe("thesis", () => {
  it("parses the calibration template with defaults", () => {
    expect(thesis.shortlistSize).toBe(10);
    expect(thesis.criteria.length).toBe(5);
  });
  it("rejects duplicate criterion ids", () => {
    const bad = { ...calibration, criteria: [calibration.criteria[0], calibration.criteria[0]] };
    expect(() => parseThesis(bad)).toThrow(/Duplicate id/);
  });
  it("rejects bad domains", () => {
    expect(() => parseThesis({ ...calibration, excludeDomains: ["not a domain"] })).toThrow();
  });
});

describe("domains", () => {
  it("normalizes URLs", () => {
    expect(toDomain("https://WWW.AcmeCal.com/about?x=1")).toBe("acmecal.com");
    expect(toDomain("acmecal.com")).toBe("acmecal.com");
  });
  it("rejects private and invalid hosts", () => {
    for (const h of ["localhost", "http://127.0.0.1", "10.0.0.1", "[::1]", "db.internal", "nodot", ""]) {
      expect(toDomain(h)).toBeNull();
    }
  });
  it("blocks directories, subdomains and government sites", () => {
    expect(isBlocked("uk.linkedin.com", ["linkedin.com"])).toBe(true);
    expect(isBlocked("nist.gov", [])).toBe(true);
    expect(isBlocked("acmecal.com", ["linkedin.com"])).toBe(false);
  });
});

describe("signals (ported from prototype)", () => {
  it("finds earliest founded year, ownership and parent flags", () => {
    const s = findSignals(
      "Acme Calibration was founded in 1987 and is a family-owned business. Serving clients since 1990.",
      { currentYear: 2026 },
    );
    expect(s.foundedYear).toBe(1987);
    expect(s.yearsInBusiness).toBe(39);
    expect(s.ownershipEvidence).toMatch(/family-owned/);
    expect(s.parentFlags).toEqual([]);
  });
  it("flags parent companies and named consolidators", () => {
    const s = findSignals("BigCal, established 2019, is now part of Accredited Labs.", {
      excludeIfMentions: ["Accredited Labs"],
      currentYear: 2026,
    });
    expect(s.parentFlags.length).toBeGreaterThan(0);
  });
  it("ignores impossible years", () => {
    expect(findSignals("Since 2099 we lead.", { currentYear: 2026 }).foundedYear).toBeNull();
    expect(findSignals("Founded 1700.", { currentYear: 2026 }).foundedYear).toBeNull();
  });
});

describe("quote verification", () => {
  const page = "We are ISO/IEC 17025 accredited and provide on\u2011site calibration for aerospace.";
  it("accepts real quotes despite typography differences", () => {
    expect(verifyQuote("provide on-site calibration for aerospace", page).ok).toBe(true);
    expect(verifyQuote("\u201CWe are ISO/IEC 17025 accredited\u201D", page).ok).toBe(true);
  });
  it("rejects invented, empty, short and long quotes", () => {
    expect(verifyQuote("THIS QUOTE IS INVENTED BY A MODEL", page)).toEqual({ ok: false, reason: "not_found" });
    expect(verifyQuote("", page)).toEqual({ ok: false, reason: "empty" });
    expect(verifyQuote("We are", page)).toEqual({ ok: false, reason: "too_short" });
    expect(verifyQuote("word ".repeat(61), page)).toEqual({ ok: false, reason: "too_long" });
  });
  it("normalizes whitespace and case", () => {
    expect(normalizeForMatch("  A\n\tB  ")).toBe("a b");
  });
});

describe("scoring and shortlist", () => {
  const base = { hasText: true, signals: findSignals("Founded in 1987. Family-owned.", { currentYear: 2026 }) };
  it("strong fit with good answers", () => {
    const r = scoreCompany(
      { ...base, criteria: { calibration_is_core: { answer: "yes", quote: "x" }, iso_17025: { answer: "yes", quote: "x" }, independent: { answer: "yes", quote: "x" } } },
      thesis,
    );
    expect(r.status).toBe("strong_fit");
    expect(r.score).toBe(10);
  });
  it("required rule failure wins", () => {
    const r = scoreCompany({ ...base, criteria: { calibration_is_core: { answer: "no", quote: "x" } } }, thesis);
    expect(r.status).toBe("fails_rule");
    expect(r.failedRule).toBe("calibration_is_core");
  });
  it("no text means no score", () => {
    expect(scoreCompany({ ...base, hasText: false, criteria: {} }, thesis).status).toBe("no_website_text");
  });
  it("parent flags force verification", () => {
    const signals = findSignals("Founded 1990. Now a part of Big Group.", { currentYear: 2026 });
    expect(scoreCompany({ hasText: true, signals, criteria: {} }, thesis).status).toBe("verify_ownership");
  });
  it("ranks deterministically and shortlists only viable companies", () => {
    const mk = (domain: string, status: string, score: number) =>
      ({ domain, result: { status, score, failedRule: null, reasons: [] } }) as Parameters<typeof rankCompanies>[0][number];
    const items = [mk("b.com", "possible_fit", 3), mk("a.com", "possible_fit", 3), mk("c.com", "strong_fit", 7), mk("d.com", "fails_rule", 9)];
    expect(rankCompanies(items).map((i) => i.domain)).toEqual(["c.com", "a.com", "b.com", "d.com"]);
    expect(pickShortlist(items, 2).map((i) => i.domain)).toEqual(["c.com", "a.com"]);
  });
});

describe("csv export", () => {
  it("neutralizes formulas", () => {
    for (const v of ["=HYPERLINK(1)", "+1", "-1", "@SUM(A1)", "\t=x"]) expect(escapeCell(v).replace(/^"/, "").startsWith("'")).toBe(true);
  });
  it("quotes commas, quotes and newlines", () => {
    expect(escapeCell('a,"b"\nc')).toBe('"a,""b""\nc"');
    expect(escapeCell(null)).toBe("");
    expect(toCsv(["a"], [["=1"]])).toBe("\uFEFFa\r\n'=1\r\n");
  });
});

describe("budget", () => {
  const s = { monthlyCap: 100, usedThisMonth: 40, reserved: 10 };
  it("reserves within cap and refuses beyond it", () => {
    expect(available(s)).toBe(50);
    expect(reserve(s, 50).ok).toBe(true);
    expect(reserve(s, 51)).toEqual({ ok: false, reason: "workspace_cap", available: 50 });
    expect(() => reserve(s, -1)).toThrow();
  });
  it("settles and releases unused credits", () => {
    expect(settle({ ...s, reserved: 30 }, 20, 7)).toEqual({ monthlyCap: 100, usedThisMonth: 47, reserved: 10 });
  });
  it("daily ceiling and drift", () => {
    expect(underDailyCeiling(1990, 10, 2000)).toBe(true);
    expect(underDailyCeiling(1991, 10, 2000)).toBe(false);
    expect(ledgerDrift(106, 100)).toBe(true);
    expect(ledgerDrift(104, 100)).toBe(false);
    expect(ledgerDrift(0, 0)).toBe(false);
  });
});

describe("credit estimates", () => {
  it("matches Tavily pricing rules", () => {
    expect(maxSearchCredits({ query: "x", search_depth: "advanced" })).toBe(2);
    expect(maxSearchCredits({ query: "x" })).toBe(1);
    expect(maxExtractCredits({ urls: Array(6).fill("u"), extract_depth: "advanced" })).toBe(4);
    expect(maxMapCredits({ url: "u", limit: 30, instructions: "x" })).toBe(6);
    expect(maxCrawlCredits({ url: "u", limit: 10 })).toBe(3);
    expect(creditsToUsd(100)).toEqual({ low: 0.5, high: 0.8 });
  });
});

describe("config", () => {
  const ok = { APP_URL: "http://localhost:3000", AUTH_SECRET: "x".repeat(32), DATABASE_URL: "postgres://u:p@h/db" };
  it("loads valid config and reports integrations without values", () => {
    const env = loadServerEnv({ ...ok, TAVILY_API_KEY: "tvly-abc" });
    expect(integrationStatus(env)).toMatchObject({ tavily: true, llm: false });
  });
  it("refuses to start on missing or bad values, naming only the variable", () => {
    try {
      loadServerEnv({ ...ok, AUTH_SECRET: "short-secret-value", TAVILY_API_KEY: "sk-wrong" });
      expect.unreachable();
    } catch (e) {
      expect(e).toBeInstanceOf(ConfigError);
      const msg = (e as Error).message;
      expect(msg).toMatch(/AUTH_SECRET/);
      expect(msg).toMatch(/TAVILY_API_KEY/);
      expect(msg).not.toMatch(/short-secret-value|sk-wrong/);
    }
  });
  it("requires https in production", () => {
    expect(() => loadServerEnv({ ...ok, NODE_ENV: "production" })).toThrow(/https/);
  });
});
