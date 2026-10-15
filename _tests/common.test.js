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
const L = (r, x) => C.ladderCode(Object.assign({ status: "covered", reason: "Covered", checked: "districts" }, r), Object.assign({ covRank: 2, streets: true, lines: 100 }, x));
assert.strictEqual(L({ status: "candidate" }), "1.1");
assert.strictEqual(L({ status: "not surveyed", reason: "Not counted yet" }), "1.2");
assert.strictEqual(L({ status: "not surveyed", reason: "Too quiet to survey" }), "1.3");
assert.strictEqual(L({ status: "not planned" }), "1.4");
assert.strictEqual(L({ status: "not surveyed", reason: "In the survey queue" }), "2.1");
assert.strictEqual(L({ status: "unreachable" }, { covRank: 0 }), "2.2");
assert.strictEqual(L({ status: "held for the owner" }), "2.3");
assert.strictEqual(L({ status: "to measure" }), "2.4");
assert.strictEqual(L({ status: "found, to wire" }), "3.1");
assert.strictEqual(L({ status: "surveyed, nothing usable" }, { covRank: 0 }), "3.2");
assert.strictEqual(L({}, { covRank: 0 }), "3.2");                       // covered in the CSV, not in the feed yet
assert.strictEqual(L({ status: "measured, not offered" }, { covRank: 0 }), "3.3");
assert.strictEqual(L({ status: "wired, to measure", checked: "none" }), "3.3");
assert.strictEqual(L({}, { covRank: 1 }), "4.1");
assert.strictEqual(L({}, { streets: false, lines: null }), "5.1");
assert.strictEqual(L({}, { lines: null }), "6.1");
assert.strictEqual(L({ checked: "seed" }, { lines: 0 }), "7.1");       // a build with no line: transit skipped
assert.strictEqual(L({}), "done");
assert.ok(C.LADDER.every((s, i) => C.LADDER_RANK[s[0]] === i) && C.LADDER.at(-1)[0] === "done");
assert.deepStrictEqual(C.entriesAt([{ city: "Paris", box: [48.688, 2.146, 49.012, 2.616] }, { city: "Lyon", box: [45.7, 4.7, 45.8, 4.9] }], { lat: 48.842, lon: 2.419 }).map((e) => e.city), ["Paris"]);
assert.deepStrictEqual(C.entriesAt([{ city: "Paris", box: [48.688, 2.146, 49.012, 2.616] }], { lat: null }), []);

const common = fs.readFileSync(path.join(root, "common.js"), "utf8");
for (const page of ["cities.html", "coverage.html", "overview.html"]) {
  const html = fs.readFileSync(path.join(root, page), "utf8");
  assert.ok(html.includes('<script src="/common.js"></script>'), page);
  const inline = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]).join("\n");
  new vm.Script(common + "\n" + inline, { filename: page });   // throws on a name common.js already declares
}
console.log("ok");
