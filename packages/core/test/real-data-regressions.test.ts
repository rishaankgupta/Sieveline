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
