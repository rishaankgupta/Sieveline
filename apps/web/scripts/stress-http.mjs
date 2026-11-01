// HTTP stress + odd-input suite against a running server (production build). Spends no Tavily credits.
// Usage: BASE=http://localhost:3100 ORIGIN=https://localhost:3100 node apps/web/scripts/stress-http.mjs
const BASE = process.env.BASE ?? "http://localhost:3100";
const ORIGIN = process.env.ORIGIN ?? BASE;
const results = { load: {}, checks: [], failures: [] };
let cookie = "";

async function req(path, { method = "GET", body, origin = true, raw, headers = {}, jar = true } = {}) {
  const h = { ...headers };
  if (jar && cookie) h.cookie = cookie;
  if (origin) h.origin = ORIGIN;
  if (body !== undefined || raw !== undefined) h["content-type"] = "application/json";
  const t = performance.now();
  const res = await fetch(BASE + path, { method, headers: h, body: raw ?? (body === undefined ? undefined : JSON.stringify(body)), redirect: "manual" });
  const ms = performance.now() - t;
  const text = await res.text();
  return { status: res.status, ms, text, headers: res.headers };
}

function check(name, cond, detail = "") {
  results.checks.push({ name, ok: Boolean(cond) });
  if (!cond) results.failures.push(`${name} ${detail}`.trim());
}

async function load(name, path, n, concurrency, opts) {
  const times = [];
  const codes = {};
  let next = 0;
  async function worker() {
    while (next < n) {
      next++;
      try {
        const r = await req(path, opts);
        times.push(r.ms);
        codes[r.status] = (codes[r.status] ?? 0) + 1;
      } catch {
        codes.network = (codes.network ?? 0) + 1;
      }
    }
  }
  const t0 = performance.now();
  await Promise.all(Array.from({ length: concurrency }, worker));
  const wall = performance.now() - t0;
  times.sort((a, b) => a - b);
  const p = (q) => Math.round(times[Math.min(times.length - 1, Math.floor(q * times.length))] ?? 0);
  results.load[name] = { n, concurrency, codes, p50: p(0.5), p95: p(0.95), max: p(1), rps: Math.round((n / wall) * 1000) };
}

// ---------------------------------------------------------------- session via one-click demo
const demo = await req("/api/demo", { method: "POST", body: {} });
check("demo account created (201)", demo.status === 201, `got ${demo.status} ${demo.text.slice(0, 120)}`);
const set = demo.headers.getSetCookie?.() ?? [];
cookie = set.map((c) => c.split(";")[0]).join("; ");
const runId = JSON.parse(demo.text || "{}").runId;
const results0 = JSON.parse((await req(`/api/runs/${runId}/results`)).text || "{}");
const company = results0.companies?.[0]?.id;
check("sample list has 6 companies, 44 facts, 6 shortlisted", results0.companies?.length === 6 && results0.facts?.length === 44 && results0.shortlist?.length === 6, JSON.stringify({ c: results0.companies?.length, f: results0.facts?.length }));

// ---------------------------------------------------------------- isolation under concurrency
// Two accounts, 120 interleaved parallel requests: each must only ever see its own list. Guards
// against any request-level cache (React cache(), cookie cache) leaking across users.
{
  const second = await req("/api/demo", { method: "POST", body: {}, jar: false });
  const cookie2 = (second.headers.getSetCookie?.() ?? []).map((c) => c.split(";")[0]).join("; ");
  const run2 = JSON.parse(second.text || "{}").runId;
  const jars = [[cookie, runId], [cookie2, run2]];
  const seen = await Promise.all(Array.from({ length: 120 }, (_, i) => {
    const [c, want] = jars[i % 2];
    return fetch(`${BASE}/api/runs`, { headers: { cookie: c } }).then(async (r) => ({ want, ids: (await r.json()).runs?.map((x) => x.id) ?? [] }));
  }));
  const leaks = seen.filter((s) => s.ids.length !== 1 || s.ids[0] !== s.want).length;
  check("120 interleaved requests from 2 users: no cross-user data", second.status === 201 && run2 !== runId && leaks === 0, `leaks=${leaks}`);
}

// ---------------------------------------------------------------- load
await load("GET / (landing)", "/", 200, 20, { jar: false });
await load("GET /sign-in", "/sign-in", 100, 10, { jar: false });
await load("GET /app (dashboard)", "/app", 150, 15);
await load("GET /app/runs/:id", `/app/runs/${runId}`, 150, 15);
await load("GET /api/runs", "/api/runs", 200, 20);
await load("GET /api/runs/:id/results", `/api/runs/${runId}/results`, 200, 20);
await load("GET /api/runs/:id", `/api/runs/${runId}`, 200, 20);
await load("GET deep-dive", `/api/runs/${runId}/companies/${company}/deep-dive`, 150, 15);
await load("GET export CSV", `/api/runs/${runId}/export?scope=all`, 50, 10);
await load("GET /api/health", "/api/health", 200, 25, { jar: false });
for (const [k, v] of Object.entries(results.load)) {
  const okCodes = Object.entries(v.codes).filter(([c]) => !["200", "429"].includes(c));
  check(`load ${k}: no errors`, okCodes.length === 0, JSON.stringify(v.codes));
}

// ---------------------------------------------------------------- odd inputs and abuse
const noOrigin = await req("/api/runs", { method: "POST", body: { estimateOnly: true }, origin: false });
check("POST without Origin is refused (403)", noOrigin.status === 403, `${noOrigin.status}`);
const evil = await req(`/api/runs/${runId}/companies/${company}`, { method: "PATCH", body: { pinned: true }, origin: false, headers: { origin: "https://evil.example" } });
check("PATCH from another site is refused (403)", evil.status === 403, `${evil.status}`);
check("malformed JSON gives 400", (await req("/api/runs", { method: "POST", raw: "{not json" })).status === 400);
const huge = await req("/api/runs", { method: "POST", raw: JSON.stringify({ x: "a".repeat(300_000) }) });
check("300 KB body gives 413", huge.status === 413, `${huge.status}`);
check("bad id gives 404", (await req("/api/runs/not-a-uuid")).status === 404);
check("unknown run gives 404 (not 500)", (await req("/api/runs/00000000-0000-4000-8000-000000000000/results")).status === 404);
check("PATCH with nothing to change gives 400", (await req(`/api/runs/${runId}/companies/${company}`, { method: "PATCH", body: {} })).status === 400);
check("wrong type gives 400", (await req(`/api/runs/${runId}/companies/${company}`, { method: "PATCH", body: { pinned: "yes" } })).status === 400);
check("unsupported method gives 405", (await req("/api/runs", { method: "DELETE" })).status === 405);
check("thesis with 13 rules is refused (400)", (await req("/api/runs", { method: "POST", body: { estimateOnly: true, thesis: { ...results0.thesis, criteria: Array.from({ length: 13 }, (_, i) => ({ id: `r${i}x`, question: "Is this a valid question?" })) } } })).status === 400);
check("501 seed domains are refused (400)", (await req("/api/runs", { method: "POST", body: { estimateOnly: true, thesis: results0.thesis, seeds: Array.from({ length: 501 }, (_, i) => `s${i}.com`) } })).status === 400);
const est = await req("/api/runs", { method: "POST", body: { estimateOnly: true, thesis: { ...results0.thesis, shortlistSize: 10 } } });
check("cost estimate works (200)", est.status === 200 && JSON.parse(est.text).estimate?.maxCredits > 0, `${est.status} ${est.text.slice(0, 160)}`);
check("empty chat message gives 400", (await req(`/api/runs/${runId}/chat`, { method: "POST", body: { message: "" } })).status === 400);
check("deep dive with wrong confirmed cost gives 409", (await req(`/api/runs/${runId}/companies/${company}/deep-dive`, { method: "POST", body: { model: "mini", confirmMaxCredits: 1 } })).status === 409);
check("cancelling a finished list gives 409", (await req(`/api/runs/${runId}/cancel`, { method: "POST", body: {} })).status === 409);
check("demo can't send invitations (403)", (await req("/api/workspace/invitations", { method: "POST", body: { email: "someone@example.com" } })).status === 403);
check("admin panel is 404 for a buyer", (await req("/admin")).status === 404);
check("admin API is 404 for a buyer", (await req("/api/admin/settings/research_paused", { method: "PUT", body: { value: true, note: "attack" } })).status === 404);
check("cron needs its secret (401)", (await req("/api/cron/watchdog", { jar: false })).status === 401);
check("APIs need a session (401)", (await req("/api/runs", { jar: false })).status === 401);
check("/app redirects anonymous users to sign-in", [302, 307].includes((await req("/app", { jar: false })).status));

// Stored XSS and CSV formula injection through the review note.
const payload = `<img src=x onerror=alert(1)>=HYPERLINK("http://evil","x")`;
check("review note saved (204)", (await req(`/api/runs/${runId}/companies/${company}`, { method: "PATCH", body: { review: { decision: "needs_check", note: payload } } })).status === 204);
const page = await req(`/app/runs/${runId}`);
check("note is not rendered as HTML on the page", !page.text.includes("<img src=x onerror"));
const csv = await req(`/api/runs/${runId}/export?scope=all`);
check("CSV escapes the formula (starts with ')", csv.text.includes(`'<img`) || !csv.text.includes(`,=HYPERLINK`), "");
check("CSV is downloaded, not rendered", (csv.headers.get("content-disposition") ?? "").startsWith("attachment"));

// Security headers
const home = await req("/", { jar: false });
const csp = home.headers.get("content-security-policy") ?? "";
check("page has nonce CSP with strict-dynamic", /nonce-/.test(csp) && csp.includes("strict-dynamic") && csp.includes("frame-ancestors 'none'"));
check("page has HSTS, nosniff, DENY framing", Boolean(home.headers.get("strict-transport-security")) && home.headers.get("x-content-type-options") === "nosniff" && home.headers.get("x-frame-options") === "DENY");
const api = await req("/api/health", { jar: false });
check("API responses have default-src 'none'", (api.headers.get("content-security-policy") ?? "").includes("default-src 'none'"));
check("no x-powered-by header", !home.headers.get("x-powered-by"));
const nf = await req("/definitely-not-a-page", { jar: false });
check("unknown page is a friendly 404", nf.status === 404 && nf.text.includes("This page doesn"));

// Rate limits under a burst: 70 exports at once, limit 60/hour (50 already used above).
const burst = await Promise.all(Array.from({ length: 20 }, () => req(`/api/runs/${runId}/export?scope=shortlist`)));
check("export rate limit kicks in (some 429)", burst.some((r) => r.status === 429), JSON.stringify(burst.map((r) => r.status)));

const passed = results.checks.filter((c) => c.ok).length;
console.log(JSON.stringify({ load: results.load, checksPassed: `${passed}/${results.checks.length}`, failures: results.failures }, null, 1));
process.exit(results.failures.length ? 1 : 0);
