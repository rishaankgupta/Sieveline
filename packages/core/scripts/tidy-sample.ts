// One-off: re-tidy machine excerpts in the demo sample with the current tidyExcerpt, keeping the
// key phrase (year or ownership words) inside. Usage: node packages/core/scripts/tidy-sample.ts <file>
import { readFileSync, writeFileSync } from "node:fs";
import { tidyExcerpt } from "../src/index.ts";

const file = process.argv[2]!;
const d = JSON.parse(readFileSync(file, "utf8")) as { facts: { kind: string; value: string; quote: string | null }[] };
const KEYS: Record<string, RegExp> = {
  founded_year: /\b(18|19|20)\d{2}\b/,
  ownership: /(family|founder|veteran|woman|minority|employee)[- ]owned|owner[- ]operated|family business/i,
  parent_flag: /(subsidiary|division|part of|acquired by|portfolio company|a member of)/i,
};
let changed = 0;
for (const f of d.facts) {
  const re = KEYS[f.kind];
  if (!re || !f.quote) continue;
  const m = re.exec(f.quote);
  if (!m) continue;
  const startsCut = !/^[A-Z0-9"“(]/.test(f.quote);
  const out = tidyExcerpt(f.quote, startsCut, !/[.!?"”)]$/.test(f.quote), m.index, m.index + m[0].length);
  if (out !== f.quote) {
    console.log(`${f.kind}:\n  was: ${f.quote}\n  now: ${out}`);
    f.quote = out;
    changed++;
  }
}
writeFileSync(file, JSON.stringify(d, null, 1));
console.log("changed", changed);
