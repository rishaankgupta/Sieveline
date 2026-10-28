import { describe, expect, it } from "vitest";
import { brandLabel, collectCandidates, findSignals, isBlockedBrand, namedOwnerMention, pickPages } from "../src/index.ts";

/** Cases taken from the M3-T10 real-data spike (2026-10-28). Snippets are abridged quotes. */
const CONSOLIDATORS = ["Accredited Labs", "Transcat", "Trescal"];

describe("named-owner flags (false positives found on real sites)", () => {
  it.each([
    ["jmtest.com", "JM Test Systems provides calibration services for many industries. Our many accredited labs located around the USA"],
    ["techmaster.us", "with four ISO/IEC 17025 accredited labs in Vista CA, Santa Clara CA, Orlando FL"],
    ["micronpa.com", "Accredited labs must employ repeatable processes that can be scaled"],
    ["michelli.com", "ISO 9001 / 17025 Registered with accredited labs 18 States"],
  ])("does not flag everyday wording (%s)", (_d, text) => {
    expect(findSignals(text, { excludeIfMentions: CONSOLIDATORS, currentYear: 2026 }).parentFlags).toEqual([]);
  });

  it.each([
    ["ocscal.com", "Powered by Accredited Labs Backed by Accredited Labs, we deliver top-tier calibration"],
    ["cal-cert.com", "Here's what makes us unique: Powered by Accredited Labs Accredited Labs provides Cal-Cert"],
    ["aldingerco.com", "As a part of Accredited Labs, Aldinger customers get the personal touch of a local team"],
  ])("flags a real parent relationship (%s)", (_d, text) => {
    expect(findSignals(text, { excludeIfMentions: CONSOLIDATORS, currentYear: 2026 }).parentFlags.length).toBe(1);
  });

  it("still catches acquisitions by other buyers through the general pattern", () => {
    const s = findSignals("In 2025, LTI was acquired by Kanbrick in partnership with the McVaugh and Hiller families", { currentYear: 2026 });
    expect(s.parentFlags[0]).toMatch(/acquired by Kanbrick/);
  });

  it("namedOwnerMention needs exact case and a relationship phrase", () => {
    expect(namedOwnerMention("we are part of accredited labs", "Accredited Labs")).toBeNull();
    expect(namedOwnerMention("Accredited Labs is great", "Accredited Labs")).toBeNull();
    expect(namedOwnerMention("now owned by Transcat Inc.", "Transcat")).toMatch(/Transcat/);
  });
});

describe("candidate filtering (non-companies found on real searches)", () => {
  it("drops directories and buyer-excluded brands in other countries", () => {
    const c = collectCandidates(
      [{ query: "q", results: [
        { url: "https://www.iqsdirectory.com/calibration/", title: "IQS Directory" },
        { url: "https://supplychain.wemakeithere.org/x", title: "Made here" },
        { url: "https://www.trescal.dk/", title: "Trescal" },
        { url: "https://techcal.com/", title: "Tech Cal" },
      ] }],
      ["iqsdirectory.com", "wemakeithere.org"],
      [],
      ["trescal.com"],
    );
    expect(c.map((x) => x.domain)).toEqual(["techcal.com"]);
  });
  it("brand labels handle two-part country suffixes", () => {
    expect(brandLabel("trescal.co.uk")).toBe("trescal");
    expect(brandLabel("shop.trescal.com")).toBe("trescal");
    expect(isBlockedBrand("trescal.de", ["trescal.com"])).toBe(true);
    expect(isBlockedBrand("techcal.com", ["trescal.com"])).toBe(false);
  });
});

describe("page picking (duplicate found on cech.com)", () => {
  it("treats www and bare hosts as the same page", () => {
    const pages = pickPages("cech.com", ["https://cech.com/about", "https://www.cech.com/about", "https://cech.com/services/rentals"], 3);
    expect(pages).toEqual(["https://cech.com", "https://cech.com/about", "https://cech.com/services/rentals"]);
  });
});

describe("Tavily instruction limit (HTTP 422 found on real crawl)", () => {
  it("keeps crawl instructions within 400 characters for long theses", async () => {
    const { crawlInstructions, parseThesis, TAVILY_INSTRUCTIONS_MAX } = await import("../src/index.ts");
    const calibration = (await import("../templates/calibration-labs-us.json", { with: { type: "json" } })).default;
    const long = parseThesis({ ...calibration, criteria: Array.from({ length: 12 }, (_, i) => ({ id: `rule_${i}`, question: `Does the site say the company offers a very specific long-named service number ${i}?` })) });
    expect(crawlInstructions(long).length).toBeLessThanOrEqual(TAVILY_INSTRUCTIONS_MAX);
    expect(crawlInstructions(parseThesis(calibration))).toMatch(/^Find pages about company history/);
  });
  it("the client refuses over-long instructions before spending", async () => {
    const { TavilyClient } = await import("../src/index.ts");
    const c = new TavilyClient({ apiKey: "tvly-x", fetch: async () => new Response("{}") });
    expect(() => c.crawl({ url: "a.com", instructions: "x".repeat(401) })).toThrow(/400/);
  });
});

describe("null raw_content (seen on a real crawl response)", () => {
  it("stageRead retries null pages at advanced depth and stageCrawl skips them", async () => {
    const { stageRead, stageCrawl, parseThesis, DEFAULT_RESEARCH_SETTINGS, findSignals, scoreCompany } = await import("../src/index.ts");
    const calibration = (await import("../templates/calibration-labs-us.json", { with: { type: "json" } })).default;
    const thesis = parseThesis(calibration);
    const depths: string[] = [];
    const tavily = {
      search: async () => ({ query: "", results: [] }),
      map: async () => ({ base_url: "", results: [] }),
      extract: async (r: { urls: string[]; extract_depth?: string }) => {
        depths.push(r.extract_depth ?? "basic");
        return { results: r.urls.map((url) => ({ url, raw_content: r.extract_depth === "advanced" ? "Founded in 1990." : null })) };
      },
      crawl: async () => ({ base_url: "", results: [{ url: "https://a.com/x", raw_content: null }] }),
    };
    const pages = await stageRead({ tavily }, thesis, DEFAULT_RESEARCH_SETTINGS, [{ domain: "a.com", name: "A", snippet: "", foundBy: "", source: "search", relevance: 0 }]);
    expect(depths).toEqual(["basic", "advanced"]);
    expect(pages.get("a.com")?.[0]?.text).toBe("Founded in 1990.");
    const signals = findSignals("x", {});
    const company = { domain: "a.com", name: "A", snippet: "", foundBy: "", source: "search" as const, relevance: 0, pages: [], signals, verified: { name: null, summary: null, criteria: {}, notes: [], costUsd: 0 }, result: scoreCompany({ hasText: false, signals, criteria: {} }, thesis), newsFlags: [] };
    await expect(stageCrawl({ tavily }, thesis, DEFAULT_RESEARCH_SETTINGS, company)).resolves.toBe(company);
  });
});

describe("quote verification on real pages (3 causes of dropped answers)", () => {
  it("accepts fragments joined by an ellipsis when each is on the page, in order", async () => {
    const { verifyQuote } = await import("../src/index.ts");
    const page = "ISO/IEC 17025:2017 Accredited Electrical Optical [...] More than 50 labs ISO/IEC 17025:2017 accredited Trained Professionals";
    expect(verifyQuote("ISO/IEC 17025:2017 Accredited ... More than 50 labs ISO/IEC 17025:2017 accredited", page).ok).toBe(true);
    expect(verifyQuote("More than 50 labs ISO/IEC 17025:2017 accredited ... ISO/IEC 17025:2017 Accredited Electrical", page).ok).toBe(false); // wrong order
    expect(verifyQuote("More than 50 labs ... owned by a private equity fund", page).ok).toBe(false); // one invented fragment
  });
  it("ignores punctuation and glued words from page extraction", async () => {
    const { verifyQuote } = await import("../src/index.ts");
    expect(verifyQuote("On-site Calibration Services: The ultimate in convenience.", "on-site calibration services the ultimate in convenience. bring our").ok).toBe(true);
    expect(verifyQuote("World Leader in Calibration Equipment Services & Solutions", "world leader in calibration equipmentservices & solutions with more").ok).toBe(true);
  });
  it("still rejects different words and quotes made only of tiny fragments", async () => {
    const { verifyQuote } = await import("../src/index.ts");
    expect(verifyQuote("On-site calibration services are not offered", "on-site calibration services the ultimate").ok).toBe(false);
    expect(verifyQuote("We are ... the best ... ok", "we are the best ok").ok).toBe(false);
  });
});

describe("news: acquirer vs acquired (JM Test Systems, real headline)", () => {
  it("treats 'Company acquires X' as a signal, and 'acquired by' as a red flag", async () => {
    const { classifyNews } = await import("../src/index.ts");
    const co = { name: "JM Test Systems", domain: "jmtest.com" };
    expect(classifyNews([{ url: "u1", title: "JM Test Systems Acquires Alltite, Expanding Calibration Capabilities" }], co)[0]?.kind).toBe("acquirer");
    expect(classifyNews([{ url: "u2", title: "JM Test Systems acquired by Big Holdings" }], co)[0]?.kind).toBe("acquired");
    expect(classifyNews([{ url: "u3", title: "Big Holdings acquires JM Test Systems" }], co)[0]?.kind).toBe("acquired");
  });
});
