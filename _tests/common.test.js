// node _tests/common.test.js — common.js's helpers, and each data page's script parsing with it (no name declared twice).
const assert = require("assert"), fs = require("fs"), path = require("path"), vm = require("vm");
const C = require("../common.js");
const root = path.join(__dirname, "..");

assert.strictEqual(C.pct(null), "");
assert.strictEqual(C.pct(0.0001), "< 0.1 %");
assert.strictEqual(C.pct(0.083), (8.3).toLocaleString(undefined, { minimumFractionDigits: 1 }) + " %");
assert.strictEqual(C.pct(0.5), "50 %");
assert.strictEqual(C.esc('<a href="x">&'), "&lt;a href=&quot;x&quot;&gt;&amp;");
assert.strictEqual(C.fold("São Wrocław"), "sao wroclaw");
assert.ok(C.holds([48.8, 2.2, 48.9, 2.4], { lat: 48.95, lon: 2.3 }));     // 5.5 km past the box
assert.ok(!C.holds([48.8, 2.2, 48.9, 2.4], { lat: 49.1, lon: 2.3 }));     // 22 km past it
const row = C.countsRows([{ city: "London", country: "CA", lat: 42.98, lon: -81.25 }, { city: "London", country: "GB", lat: 51.5, lon: -0.12 }]);
assert.strictEqual(row({ city: "London", country: "GB", lat: 51.51, lon: -0.13 }).country, "GB");

// The ingestion ladder: a city's code is the first step it has not done; a step that does not apply is skipped.
const done = { status: "covered", reason: "Covered", venues: true, terraces: "osm", buildings: true, offered: true, coverage: "whole",
  streets: true, listings: true, transit: 100, check: "pass", districtsOffered: 2 };
const L = (r) => C.ladderCode(Object.assign({}, done, r));
const cases = [
  [{ status: "candidate" }, "1.1"], [{ status: "not surveyed", reason: "Not counted yet" }, "1.2"],
  [{ status: "not surveyed", reason: "Too quiet to survey" }, "1.3"], [{ status: "not planned" }, "1.4"],
  [{ status: "not surveyed", reason: "In the survey queue" }, "2.1"], [{ status: "unreachable" }, "2.2"],
  [{ status: "held for the owner" }, "2.3"], [{ status: "to measure" }, "2.4"], [{ status: "found, to wire" }, "3.1"],
  [{ status: "surveyed, nothing usable", venues: null, terraces: null, buildings: null, offered: false }, "3.2"],
  [{ venues: false, check: "failed" }, "3.2"],                         // Périgny: tiled, no venue on record, its check failed
  [{ terraces: "none" }, "3.3"], [{ buildings: false }, "3.4"],
  [{ status: "wired, to measure", offered: false }, "3.5"],
  [{ status: "measured, not offered", venues: null, offered: false }, "3.6"],
  [{ coverage: "core" }, "4.1"], [{ streets: false }, "5.1"], [{ listings: false }, "5.2"], [{ transit: null }, "6.1"],
  [{ transit: "none" }, "done"],                                       // no network: transit skipped
  [{ check: "weather" }, "7.1"], [{ check: null }, "7.1"], [{ districtsOffered: 0 }, "7.2"], [{}, "done"]];
for (const [r, code] of cases) assert.strictEqual(L(r), code, JSON.stringify(r));
assert.ok(C.LADDER.every((s, i) => C.LADDER_RANK[s[0]] === i && (s[0] === "done" || C.STAGES[s[0][0]])) && C.LADDER.at(-1)[0] === "done");
assert.strictEqual(C.ladderStep("7.1", { check: "weather" }), "7.1 · Seed check (weather)");
assert.strictEqual(C.ladderStep("7.1", {}), "7.1 · Seed check (not run)");
assert.strictEqual(C.ladderStep("3.2"), "3.2 · Venues");
assert.strictEqual(C.ladderStep("done"), "done");

assert.strictEqual(C.stageOf("4.1"), "4"); assert.strictEqual(C.stageOf("done"), "done");
assert.ok(C.parked({ code: "2.4" }) && C.parked({ code: "3.1", parked: true }) && !C.parked({ code: "3.1" }) && !C.parked({ code: "done" }));
assert.deepStrictEqual([{ city: "Big", country: "Spain", population: 9 }, { city: "Lyon", country: "France", population: 1 }, { city: "Small", country: "Spain", population: 2 }]
  .sort(C.mainOrder).map((r) => r.city), ["Lyon", "Big", "Small"]);

// The code order: 4 → 7, done, then 3, 2, 1; sub-steps as numbers; descending reverses the codes, not the tie-break.
const codes = ["3.10", "done", "1.1", "7.2", "3.2", "4.1", "2.4", "5.2", "3.1", "6.1", "5.1", "7.1"];
assert.deepStrictEqual(codes.slice().sort(C.codeOrder), ["4.1", "5.1", "5.2", "6.1", "7.1", "7.2", "done", "3.1", "3.2", "3.10", "2.4", "1.1"]);
assert.strictEqual(C.stageOf("10.1"), "10");
const rows = [{ city: "Big", country: "Spain", population: 9, code: "5.1" }, { city: "Lyon", country: "France", population: 1, code: "5.1" },
  { city: "Rome", country: "Italy", population: 3, code: "3.2" }, { city: "Pau", country: "France", population: 1, code: "4.1" },
  { city: "Oslo", country: "Norway", population: 1, code: "done" }, { city: "Nice", country: "France", population: 2, code: "5.1" }];
assert.deepStrictEqual(rows.slice().sort(C.byCode(true)).map((r) => r.city), ["Pau", "Nice", "Lyon", "Big", "Oslo", "Rome"]);
assert.deepStrictEqual(rows.slice().sort(C.byCode(false)).map((r) => r.city), ["Rome", "Oslo", "Nice", "Lyon", "Big", "Pau"]);

// Cache busting: every local script and stylesheet carries the build's time, and its page has front matter so Jekyll renders it
// (a fresh page with a cached common.js used to come up empty for up to ten minutes after a deploy).
const V = "?v={{ site.time | date: '%s' }}";
for (const f of ["cities.html", "coverage.html", "overview.html", "index.html", "en/index.html", "fr/index.html", "es/index.html", "de/index.html",
  "join/index.html", "spots/index.html", "privacy.html", "_includes/landing-en.html"]) {
  const html = fs.readFileSync(path.join(root, f), "utf8");
  for (const m of html.matchAll(/(?:src|href)="(\/[^"]+\.(?:js|css)[^"]*)"/g)) assert.ok(m[1].endsWith(V), f + ": " + m[1]);
  if (!f.startsWith("_includes") && /(?:src|href)="\/[^"]+\.(?:js|css)/.test(html)) assert.ok(html.startsWith("---\n"), f + " has no front matter");
}
const common = fs.readFileSync(path.join(root, "common.js"), "utf8");
for (const page of ["cities.html", "coverage.html", "overview.html"]) {
  const html = fs.readFileSync(path.join(root, page), "utf8");
  assert.ok(html.includes(`<script src="/common.js${V}"></script>`), page);
  const inline = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]).join("\n");
  new vm.Script(common + "\n" + inline, { filename: page });   // throws on a name common.js already declares
}

// The counts (owner, 2026-10-16): covered + stage 3 + parked add up to the feed; every city not covered lands in exactly
// one "Why not covered" group, and a status not in STATUSES is reported, never dropped.
const withCode = (r) => Object.assign(r, { code: C.ladderCode(r) });
for (const st of C.STATUSES) assert.ok(C.LADDER_RANK[C.ladderCode({ status: st })] != null, st);
const checkFeed = (cities) => {
  const rows = cities.map(withCode), sp = C.split(rows), w = C.whyGroups(rows);
  assert.strictEqual(sp.covered.length + sp.tiled.length + sp.park.length, sp.total);
  assert.deepStrictEqual(w.unmapped.map((r) => r.status), [], "statuses missing from STATUSES");
  assert.strictEqual(w.sum, w.total); assert.strictEqual(w.total, sp.total - sp.covered.length);
  for (const r of rows) assert.ok(C.STATUSES.includes(r.status), r.status);
};
const sample = [{ status: "covered", coverage: "whole" }, { status: "candidate" }, { status: "to measure" }, { status: "found, to wire", parked: true },
  { status: "found, to wire" }, { status: "measured, not offered" }, { status: "not surveyed", reason: "Too quiet to survey" }];
checkFeed(sample);
const sp = C.split(sample.map(withCode));
assert.deepStrictEqual([sp.covered.length, sp.tiled.length, sp.park.length], [1, 2, 4]);
const odd = C.whyGroups(sample.concat({ status: "brand new" }).map(withCode));
assert.strictEqual(odd.unmapped.length, 1); assert.strictEqual(odd.sum, odd.total - 1);
assert.deepStrictEqual(C.whyGroups(sample.map(withCode)).groups.map((g) => g.code + " " + g.status + (g.parked ? " P" : "")),
  ["1.1 candidate", "1.3 not surveyed", "2.4 to measure", "3.1 found, to wire", "3.1 found, to wire P", "3.6 measured, not offered"]);
console.log("ok");
// The live feed, when the network answers (CI does): every status it holds is mapped and the groups sum to the total.
fetch("https://raw.githubusercontent.com/Techneb/compromise-tiles/master/cities-status.json").then((r) => r.ok ? r.json() : null)
  .catch(() => null).then((s) => { if (!s) return console.log("live feed not reached: skipped");
    checkFeed(s.cities); console.log("live feed ok (" + s.cities.length + " cities)"); });
