import { describe, expect, it } from "vitest";
import { cleanCompanyName } from "../src/index.ts";

describe("cleanCompanyName (real names from the 2026-10-28 run)", () => {
  it.each([
    ["Allometrics", "allometrics.com", "Allometrics"],
    ["Techmaster Electronics", "techmaster.us", "Techmaster Electronics"],
    ["JM Test Systems", "jmtest.com", "JM Test Systems"],
    ["Mass Flow Technology, Inc.", "massflowtechsolutions.com", "Mass Flow Technology, Inc."],
    ["Official Company Information: Tech Cal (Technology & Calibration, Inc.)", "techcal.com", "Tech Cal (Technology & Calibration, Inc.)"],
    ["Texas ISO 17025 Calibration Services", "foxvalleymetrology.com", null],
    ["Home | Acme Calibration", "acmecal.com", "Acme Calibration"],
    ["Acme Labs - Precision you can trust", "www.acmelabs.com", "Acme Labs"],
    [null, "x.com", null],
    ["   ", "x.com", null],
  ])("%s on %s", (raw, domain, want) => {
    expect(cleanCompanyName(raw, domain)).toBe(want);
  });
});
