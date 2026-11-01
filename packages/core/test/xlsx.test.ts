import { describe, expect, it } from "vitest";
import { toXlsx } from "../src/index.ts";

/** Reads the stored (uncompressed) entries of a ZIP by walking its local file headers. */
function entries(zip: Uint8Array): Map<string, string> {
  const v = new DataView(zip.buffer, zip.byteOffset, zip.byteLength);
  const out = new Map<string, string>();
  let at = 0;
  while (v.getUint32(at, true) === 0x04034b50) {
    expect(v.getUint16(at + 8, true)).toBe(0); // stored
    const size = v.getUint32(at + 18, true);
    const nameLen = v.getUint16(at + 26, true);
    const name = new TextDecoder().decode(zip.subarray(at + 30, at + 30 + nameLen));
    out.set(name, new TextDecoder().decode(zip.subarray(at + 30 + nameLen, at + 30 + nameLen + size)));
    at += 30 + nameLen + size;
  }
  expect(v.getUint32(zip.length - 22, true)).toBe(0x06054b50); // end of central directory
  return out;
}

describe("toXlsx", () => {
  const files = entries(toXlsx(["name", "score", "note"], [["Acme & Co <labs>", 9.5, '=HYPERLINK("http://evil","x")'], ["bell\u0007", null, "multi\nline"]], "Labs: US/TX"));
  const sheet = files.get("xl/worksheets/sheet1.xml")!;

  it("contains the parts a spreadsheet app needs", () => {
    for (const f of ["[Content_Types].xml", "_rels/.rels", "xl/workbook.xml", "xl/_rels/workbook.xml.rels", "xl/styles.xml", "xl/worksheets/sheet1.xml"]) expect(files.has(f), f).toBe(true);
  });
  it("stores formulas from websites as text, never as formulas", () => {
    expect(sheet).not.toContain("<f>");
    expect(sheet).toContain('t="inlineStr"');
    expect(sheet).toContain("=HYPERLINK(&quot;http://evil&quot;,&quot;x&quot;)");
  });
  it("escapes XML, drops forbidden control characters, keeps numbers numeric", () => {
    expect(sheet).toContain("Acme &amp; Co &lt;labs&gt;");
    expect(sheet).not.toContain("\u0007");
    expect(sheet).toContain('<c r="B2"><v>9.5</v></c>');
    expect(sheet).toContain("multi\nline");
  });
  it("makes a valid sheet name", () => {
    expect(files.get("xl/workbook.xml")).toContain('name="Labs  US TX"');
  });
});
