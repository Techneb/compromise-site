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

const common = fs.readFileSync(path.join(root, "common.js"), "utf8");
for (const page of ["cities.html", "coverage.html", "overview.html"]) {
  const html = fs.readFileSync(path.join(root, page), "utf8");
  assert.ok(html.includes('<script src="/common.js"></script>'), page);
  const inline = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]).join("\n");
  new vm.Script(common + "\n" + inline, { filename: page });   // throws on a name common.js already declares
}
console.log("ok");
