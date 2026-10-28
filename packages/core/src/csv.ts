/**
 * Spreadsheet-safe CSV. Cells that Excel/Sheets would treat as formulas are prefixed with
 * an apostrophe (OWASP CSV injection guidance), then RFC 4180 quoted.
 */
const FORMULA_START = /^[=+\-@\t\r\uFF1D\uFF0B\uFF0D\uFF20]/;

export function escapeCell(value: unknown): string {
  if (value === null || value === undefined) return "";
  let s = typeof value === "string" ? value : String(value);
  if (FORMULA_START.test(s)) s = `'${s}`;
  if (/[",\r\n]/.test(s) || s !== s.trim()) s = `"${s.replace(/"/g, '""')}"`;
  return s;
}

export function toCsv(headers: readonly string[], rows: readonly (readonly unknown[])[]): string {
  const lines = [headers.map(escapeCell).join(",")];
  for (const r of rows) lines.push(r.map(escapeCell).join(","));
  return `\uFEFF${lines.join("\r\n")}\r\n`;
}
