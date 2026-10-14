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

const common = fs.readFileSync(path.join(root, "common.js"), "utf8");
for (const page of ["cities.html", "coverage.html", "overview.html"]) {
  const html = fs.readFileSync(path.join(root, page), "utf8");
  assert.ok(html.includes('<script src="/common.js"></script>'), page);
  const inline = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]).join("\n");
  new vm.Script(common + "\n" + inline, { filename: page });   // throws on a name common.js already declares
}
console.log("ok");
