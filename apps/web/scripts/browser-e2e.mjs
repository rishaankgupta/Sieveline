// Real-browser end-to-end suite (Chrome for Testing via playwright-core) against a running
// production build behind an HTTPS front. Spends no Tavily credits and makes no LLM calls.
// Usage: BASE=https://localhost:3443 node apps/web/scripts/browser-e2e.mjs
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { chromium } from "playwright-core";

const BASE = process.env.BASE ?? "https://localhost:3443";
const SHOTS = process.env.SHOTS ?? "/projects/sandbox/sieveline/.tmp/shots";
const H = "/projects/sandbox/sieveline/.tmp/chrome-home";
const axeSource = readFileSync(createRequire(import.meta.url).resolve("axe-core/axe.min.js"), "utf8");

const checks = [];
const problems = { consoleErrors: [], pageErrors: [], cspViolations: [], failedRequests: [], unexpectedHttp: [], a11y: [] };
/** Error responses the suite causes on purpose (missing page, wrong passwords). Anything else is a finding. */
const EXPECTED_HTTP = [/\/nope-404$/, /\/api\/auth\/sign-in\/email$/, /\/api\/auth\/two-factor\/enable$/];
const check = (name, ok, detail = "") => checks.push({ name, ok: Boolean(ok), detail: ok ? "" : String(detail).slice(0, 300) });
/** Runs one part of the journey; an exception becomes a failed check (with a screenshot) instead of ending the suite. */
async function step(name, page, fn) {
  try {
    await fn();
    if (process.env.DEBUG_COOKIES) console.error("STEP", name, "cookies:", (await page.context().cookies()).filter((c) => c.name.includes("sl")).map((c) => c.name).join(",") || "(none)", new URL(page.url()).pathname);
  } catch (e) {
    check(`${name} (step crashed)`, false, e?.message?.split("\n")[0] ?? e);
    await page?.screenshot({ path: `${SHOTS}/FAILED-${name.replace(/\W+/g, "-")}.png`, fullPage: true }).catch(() => {});
  }
}

const browser = await chromium.launch({
  executablePath: "/usr/local/bin/chrome",
  args: ["--no-sandbox", "--disable-dev-shm-usage", "--disable-gpu"],
  env: { ...process.env, HOME: H, XDG_CONFIG_HOME: `${H}/.config`, XDG_CACHE_HOME: `${H}/.cache` },
  timeout: 60_000,
});

function watch(page, label) {
  page.on("console", (m) => {
    // Chrome logs every error response as "Failed to load resource"; those are judged by the response listener.
    if (m.type() === "error" && !m.text().startsWith("Failed to load resource")) problems.consoleErrors.push(`${label}: ${m.text().slice(0, 200)}`);
  });
  page.on("pageerror", (e) => problems.pageErrors.push(`${label}: ${String(e).slice(0, 200)}`));
  page.on("requestfailed", (r) => {
    // Downloads and navigations that replace an in-flight request are aborted by design.
    if (r.failure()?.errorText === "net::ERR_ABORTED") return;
    problems.failedRequests.push(`${label}: ${r.url()} ${r.failure()?.errorText}`);
  });
  page.on("response", (r) => {
    if (process.env.DEBUG_COOKIES && r.status() >= 300 && r.status() < 400) console.error("REDIRECT", label, r.status(), new URL(r.url()).pathname, "->", r.headers().location);
    if (process.env.DEBUG_COOKIES && r.headers()["set-cookie"]) console.error("SETCOOKIE", label, r.status(), r.request().method(), new URL(r.url()).pathname, r.headers()["set-cookie"].slice(0, 120));
    if (r.status() >= 400 && !EXPECTED_HTTP.some((re) => re.test(new URL(r.url()).pathname))) problems.unexpectedHttp.push(`${label}: ${r.status()} ${r.request().method()} ${r.url()}`);
  });
}

/** Records CSP violations on the page (they mean our own scripts or styles were blocked). */
async function trackCsp(page) {
  await page.addInitScript(() => {
    window.__csp = [];
    document.addEventListener("securitypolicyviolation", (e) => window.__csp.push(`${e.violatedDirective} ${e.blockedURI}`));
  });
}

async function axe(page, label) {
  const result = await page.evaluate(async (src) => {
    // Indirect eval through CDP evaluation (not page script, so CSP does not apply).
    (0, eval)(src);
    const r = await window.axe.run(document, { runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"] } });
    return r.violations.map((v) => ({ id: v.id, impact: v.impact, n: v.nodes.length, target: v.nodes[0]?.target?.join(" ") }));
  }, axeSource);
  for (const v of result) problems.a11y.push(`${label}: ${v.impact} ${v.id} x${v.n} (${v.target})`);
  return result.filter((v) => v.impact === "serious" || v.impact === "critical");
}

async function visit(page, path, label, { shot = true } = {}) {
  const res = await page.goto(BASE + path, { waitUntil: "networkidle" });
  const csp = await page.evaluate(() => window.__csp ?? []);
  for (const c of csp) problems.cspViolations.push(`${label}: ${c}`);
  if (shot) await page.screenshot({ path: `${SHOTS}/${label}.png`, fullPage: true });
  return res;
}

// ---------------------------------------------------------------- public pages, both color schemes and two sizes
for (const scheme of ["light", "dark"]) {
  for (const vp of [{ width: 1280, height: 860, tag: "desktop" }, { width: 390, height: 844, tag: "mobile" }]) {
    const ctx = await browser.newContext({ ignoreHTTPSErrors: true, colorScheme: scheme, viewport: vp });
    const page = await ctx.newPage();
    watch(page, `${scheme}-${vp.tag}`);
    await trackCsp(page);
    for (const [path, name] of [["/", "landing"], ["/sign-in", "sign-in"], ["/sign-up", "sign-up"], ["/privacy", "privacy"], ["/terms", "terms"], ["/forgot-password", "forgot"], ["/nope-404", "not-found"]]) {
      const label = `${name}-${scheme}-${vp.tag}`;
      const res = await visit(page, path, label, { shot: scheme === "light" || name === "landing" });
      check(`${label} loads`, res && (name === "not-found" ? res.status() === 404 : res.ok()), res?.status());
      const serious = await axe(page, label);
      check(`${label} has no serious accessibility issues`, serious.length === 0, JSON.stringify(serious));
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      check(`${label} has no horizontal scroll`, overflow <= 1, `${overflow}px`);
    }
    await ctx.close();
  }
}

// ---------------------------------------------------------------- the buyer journey through the UI
// PUBLIC_ONLY=1 stops here (for a live site without demo mode, where nothing should be created).
if (process.env.PUBLIC_ONLY) {
  await browser.close();
  finish();
}
const ctx = await browser.newContext({ ignoreHTTPSErrors: true, viewport: { width: 1280, height: 900 } });
const page = await ctx.newPage();
watch(page, "journey");
await trackCsp(page);
await visit(page, "/", "journey-landing", { shot: false });
// Keyboard: skip link is the first tab stop and moves focus to main content.
await page.keyboard.press("Tab");
check("skip link is the first tab stop", (await page.evaluate(() => document.activeElement?.textContent)) === "Skip to content");
await step("open demo", page, async () => {
await page.getByRole("button", { name: "Try the demo" }).first().click();
await page.waitForURL(/\/app\/runs\//, { timeout: 30_000 });
await page.waitForSelector("text=shortlisted from", { timeout: 30_000 });
await page.screenshot({ path: `${SHOTS}/run-shortlist.png`, fullPage: true });
check("demo opens the sample list", page.url().includes("/app/runs/"));
check("demo banner is shown", await page.getByText("You're in a demo account").isVisible());
const cards = await page.locator("main li h3, main li h2").count();
check("shortlist cards render", cards >= 6, cards);
check("run page has no serious accessibility issues", (await axe(page, "run-page")).length === 0);
});

// Pin the first company and confirm it persists across a reload.
await step("pin", page, async () => {
const pin = page.getByRole("button", { name: "Pin", exact: true }).first();
await pin.click();
await page.getByRole("button", { name: "Unpin" }).first().waitFor({ timeout: 10_000 });
await page.reload({ waitUntil: "networkidle" });
check("pin persists after reload", await page.getByRole("button", { name: "Unpin" }).first().isVisible());
});

// Evidence dialog: opens, traps focus in a modal, closes with Escape.
const dialog = page.getByRole("dialog");
await step("evidence dialog", page, async () => {
await page.getByRole("button", { name: "See evidence" }).first().click();
await dialog.waitFor({ timeout: 10_000 });
check("evidence dialog opens", await dialog.isVisible());
await page.waitForSelector("text=Deep dive", { timeout: 10_000 });
await page.waitForTimeout(800);
await page.screenshot({ path: `${SHOTS}/evidence-dialog.png`, fullPage: false });
check("evidence shows a verified quote", (await dialog.locator("blockquote").count()) > 0);
check("deep dive dossier is shown with its warning", await dialog.getByText("not checked these").first().isVisible().catch(() => false));
check("evidence dialog has no serious accessibility issues", (await axe(page, "evidence-dialog")).length === 0);
// Save a review with a note through the dialog.
await dialog.getByText("Worth contacting").click();
await dialog.getByLabel("Note").fill("Call the owner next week");
await dialog.getByRole("button", { name: "Save review" }).click();
await page.waitForTimeout(1500);
await page.keyboard.press("Escape");
await page.waitForTimeout(300);
check("Escape closes the dialog", !(await dialog.isVisible().catch(() => false)));
});

// Full table view, search filter.
await step("full table", page, async () => {
await page.getByRole("button", { name: /^All \d+/ }).click();
await page.waitForSelector("table", { timeout: 10_000 });
const rowsAll = await page.locator("tbody tr").count();
await page.getByLabel("Search").fill("allometrics");
await page.waitForTimeout(300);
const rowsFiltered = await page.locator("tbody tr").count();
check("full table shows all companies and filters", rowsAll === 6 && rowsFiltered === 1, `${rowsAll} -> ${rowsFiltered}`);
await page.screenshot({ path: `${SHOTS}/run-table.png`, fullPage: true });
});

// CSV download from the UI.
await step("csv download", page, async () => {
const [download] = await Promise.all([page.waitForEvent("download", { timeout: 15_000 }), page.getByRole("link", { name: "Download CSV" }).click()]);
const csvPath = await download.path();
const csv = readFileSync(csvPath, "utf8");
check("CSV downloads with the review note", csv.includes("Call the owner next week") && csv.split("\n").length >= 7, csv.slice(0, 200));
});

await step("excel download", page, async () => {
  const [dl] = await Promise.all([page.waitForEvent("download", { timeout: 15_000 }), page.getByRole("link", { name: "Download Excel" }).click()]);
  const buf = readFileSync(await dl.path());
  check("Excel download is a real .xlsx (ZIP)", buf[0] === 0x50 && buf[1] === 0x4b && dl.suggestedFilename().endsWith(".xlsx"), dl.suggestedFilename());
});

await step("keyboard shortcuts", page, async () => {
  await page.getByRole("button", { name: "Shortlist", exact: true }).click();
  await page.evaluate(() => document.activeElement?.blur());
  const sel = (n) => page.locator(`[data-card="${n}"][aria-current="true"]`).count();
  await page.keyboard.press("j");
  check("j selects the next company", (await sel(1)) === 1);
  await page.keyboard.press("k");
  check("k selects the previous company", (await sel(0)) === 1);
  await page.keyboard.press("j");
  await page.keyboard.press("2");
  await page.locator('[data-card="1"]').getByText("Needs a check").waitFor({ timeout: 10_000 });
  check("2 marks the selected company 'Needs a check'", true);
  await page.keyboard.press("o");
  await page.getByRole("dialog").waitFor({ timeout: 10_000 });
  check("o opens the selected company's evidence", await page.getByRole("dialog").isVisible());
  await page.keyboard.press("Escape");
  await page.keyboard.press("?");
  const help = page.getByRole("dialog", { name: "Keyboard shortcuts" });
  await help.waitFor({ timeout: 5_000 });
  check("? opens the shortcuts list", await help.isVisible());
  check("shortcuts dialog has no serious accessibility issues", (await axe(page, "shortcuts-help")).length === 0);
  await help.getByLabel("Use single-key shortcuts").uncheck();
  await help.getByRole("button", { name: "Close" }).click();
  await page.keyboard.press("j");
  check("shortcuts can be turned off (WCAG 2.1.4)", (await page.locator('[aria-current="true"]').count()) === 0);
  await page.evaluate(() => window.localStorage.setItem("sl.shortcuts", "on"));
});

// Other app pages.
await step("app pages", page, async () => {
for (const [path, label, text] of [["/app", "dashboard", "Your lists"], ["/app/new", "new-list", "What kind of company"], ["/app/team", "team", "Team"], ["/app/security", "security", "Two-factor authentication"]]) {
  const res = await visit(page, path, label);
  check(`${label} page loads`, res?.ok() && (await page.getByText(text).first().isVisible()), res?.status());
  check(`${label} has no serious accessibility issues`, (await axe(page, label)).length === 0);
}
});
// Team: demo can't invite (server says why, UI shows it).
// New list: build from the template, check the cost (no credits spent), don't start.
await step("new list estimate", page, async () => {
await visit(page, "/app/new", "new-list-2", { shot: false });
// Scope to the template card itself (its heading's parent). A broad "div containing this text"
// matches the page wrapper, whose first button is Sign out.
const tpl = page.getByText("Or start from a template", { exact: true }).locator("..").getByRole("button").first();
if (await tpl.isVisible().catch(() => false)) {
  await tpl.click();
  await page.getByRole("button", { name: "Check cost" }).click();
  await page.waitForSelector("text=/credits/i", { timeout: 15_000 });
  await page.screenshot({ path: `${SHOTS}/new-list-estimate.png`, fullPage: true });
  check("cost estimate shows in the builder", await page.getByRole("button", { name: "Start research" }).isEnabled());
} else check("template button exists on new list page", false, "not found");
});

// Security page: 2FA setup shows a QR code after the password (demo password is unknown, so expect a clear error).
await step("2fa wrong password", page, async () => {
await visit(page, "/app/security", "security-2", { shot: false });
await page.getByLabel("Your password").fill("wrong password 123");
await page.getByRole("button", { name: "Set up two-factor" }).click();
const alert = page.locator("main [role=alert]").first();
await alert.waitFor({ timeout: 10_000 });
check("2FA setup with a wrong password shows an error", ((await alert.textContent()) ?? "").length > 5, await alert.textContent());
});

// Sign out returns to the public site and /app is then closed.
await step("sign out", page, async () => {
const signOut = page.getByRole("button", { name: /sign out/i });
await signOut.click();
await page.waitForURL((u) => !u.pathname.startsWith("/app"), { timeout: 15_000 });
const after = await page.goto(`${BASE}/app`, { waitUntil: "networkidle" });
check("after sign-out, /app sends you to sign-in", page.url().includes("/sign-in"), `${after?.status()} ${page.url()}`);
});
await ctx.close();

// ---------------------------------------------------------------- sign up through the form (demo mode: no email step)
const ctx2 = await browser.newContext({ ignoreHTTPSErrors: true });
const p2 = await ctx2.newPage();
watch(p2, "signup");
await trackCsp(p2);
var email = `browser-${Date.now()}@example.com`; // eslint-disable-line no-var -- read by finish(), which can run before this line
await step("sign up and sign in", p2, async () => {
await visit(p2, "/sign-up", "signup-form", { shot: false });
await p2.getByLabel("Your name").fill("Browser Test");
await p2.getByLabel("Work email").fill(email);
await p2.getByLabel("Password", { exact: true }).fill("correct horse battery staple 7");
await p2.getByLabel("Confirm password").fill("correct horse battery staple 7");
await p2.getByRole("button", { name: "Create account" }).click();
await p2.waitForURL(/\/app/, { timeout: 30_000 }).catch(() => {});
check("sign-up form lands in the app", p2.url().includes("/app"), p2.url());
await p2.screenshot({ path: `${SHOTS}/after-signup.png`, fullPage: true });
// Wrong password on sign-in shows a message, right one works.
await ctx2.clearCookies();
await visit(p2, "/sign-in", "signin-form", { shot: false });
await p2.getByLabel("Email").fill(email);
await p2.getByLabel("Password").fill("not my password at all");
await p2.getByRole("button", { name: "Sign in" }).click();
const wrong = p2.locator("main [role=alert]").first();
await wrong.waitFor({ timeout: 15_000 });
check("wrong password shows an error", ((await wrong.textContent()) ?? "").length > 5, await wrong.textContent());
await p2.getByLabel("Password").fill("correct horse battery staple 7");
await p2.getByRole("button", { name: "Sign in" }).click();
await p2.waitForURL(/\/app/, { timeout: 20_000 }).catch(() => {});
check("right password signs in", p2.url().includes("/app"), p2.url());
});
await ctx2.close();
await browser.close();

finish();

function finish() {
check("no unexpected error responses", problems.unexpectedHttp.length === 0, problems.unexpectedHttp.slice(0, 5).join(" | "));
check("no JavaScript errors", problems.pageErrors.length === 0 && problems.consoleErrors.length === 0, [...problems.pageErrors, ...problems.consoleErrors].slice(0, 3).join(" | "));
check("no Content-Security-Policy violations", problems.cspViolations.length === 0, problems.cspViolations.slice(0, 3).join(" | "));
const failed = checks.filter((c) => !c.ok);
console.log(JSON.stringify({ passed: `${checks.length - failed.length}/${checks.length}`, failed, problems: Object.fromEntries(Object.entries(problems).map(([k, v]) => [k, [...new Set(v)].slice(0, 25)])) }, null, 1));
console.log("BROWSER_TEST_EMAIL", typeof email === "undefined" ? "" : email);
process.exit(failed.length ? 1 : 0);
}
