// Writes a sample .xlsx with awkward content, for checking with a real spreadsheet reader.
import { writeFileSync } from "node:fs";
import { toXlsx } from "../src/index.ts";

const rows = [
  [1, "Allometrics", "https://allometrics.com", "strong_fit", 10, '=HYPERLINK("http://evil","click")', "Café & “quotes” <b>tags</b>", "tab\there\nnew line", "bell\u0007char"],
  [2, "x".repeat(40_000), "", null, 9.5, "+SUM(A1:A2)", "@cmd", "-1+1", undefined],
];
writeFileSync(process.argv[2]!, toXlsx(["position", "name", "website", "fit", "score", "f1", "f2", "f3", "f4"], rows, "Calibration labs: US/TX?"));
