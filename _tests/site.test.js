// node _tests/site.test.js — the site’s pages: cache-busted local files, self-hosted fonts, SRI on outside scripts, typography.
const assert = require("assert"), fs = require("fs"), path = require("path");
const root = path.join(__dirname, "..");

// Cache busting: every local script and stylesheet carries the build's time, and its page has front matter so Jekyll renders it
// (a fresh page with a cached script used to come up empty for up to ten minutes after a deploy).
const V = "?v={{ site.time | date: '%s' }}";
for (const f of ["index.html", "en/index.html", "fr/index.html", "es/index.html", "de/index.html",
  "_includes/join.html", "_includes/spots.html", "privacy.html", "_includes/landing-en.html"]) {
  const html = fs.readFileSync(path.join(root, f), "utf8");
  for (const m of html.matchAll(/(?:src|href)="(\/[^"]+\.(?:js|css)[^"]*)"/g)) assert.ok(m[1].endsWith(V), f + ": " + m[1]);
  if (!f.startsWith("_includes") && /(?:src|href)="\/[^"]+\.(?:js|css)/.test(html)) assert.ok(html.startsWith("---\n"), f + " has no front matter");
}
// Fonts are self-hosted: no landing page or its stylesheet calls Google, and every font the CSS names is in /fonts/.
for (const f of ["_includes/landing-en.html", "fr/index.html", "es/index.html", "de/index.html", "landing.css"]) {
  const src = fs.readFileSync(path.join(root, f), "utf8");
  assert.ok(!/googleapis|gstatic/.test(src), f + " references Google Fonts");
  for (const [, u] of src.matchAll(/(\/fonts\/[\w-]+\.woff2)/g)) assert.ok(fs.existsSync(path.join(root, u)), f + ": " + u + " missing");
}
// Every script or stylesheet from another origin carries a Subresource Integrity hash (Google Fonts CSS cannot).
const pages = (d) => fs.readdirSync(path.join(root, d), { withFileTypes: true }).flatMap((e) => e.name.startsWith(".") || e.name === "node_modules" ? []
  : e.isDirectory() ? pages(path.join(d, e.name)) : e.name.endsWith(".html") ? [path.join(d, e.name)] : []);
for (const f of pages("")) for (const [tag] of fs.readFileSync(path.join(root, f), "utf8").matchAll(/<(?:script|link)\b[^>]*>/g)) {
  const u = (/\b(?:src|href)="((?:https?:)?\/\/[^"]+)"/.exec(tag) || [])[1];
  if (!u || /fonts\.googleapis\.com/.test(u) || (tag.startsWith("<link") && !/rel="stylesheet"/.test(tag))) continue;
  assert.ok(/\bintegrity="sha(256|384|512)-[\w+/=]+"/.test(tag) && /\bcrossorigin=/.test(tag), f + ": no integrity on " + u);
}
// Apostrophes (owner, 2026-10-25): visible text, and the copy scripts write into a page, use the typographic ’, never '.
const walk = (d) => fs.readdirSync(path.join(root, d), { withFileTypes: true }).flatMap((e) => e.name.startsWith(".") || ["_site", "_tests", "node_modules"].includes(e.name) ? []
  : e.isDirectory() ? walk(path.join(d, e.name)) : /\.(html|js)$/.test(e.name) ? [path.join(d, e.name)] : []);
const noComments = (js) => js.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|\s)\/\/.*$/gm, "");
const straight = /\p{L}'\p{L}/u;
for (const f of walk(".")) {
  const src = fs.readFileSync(path.join(root, f), "utf8");
  const scripts = f.endsWith(".js") ? [src] : [...src.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)].map((m) => m[1]);
  for (const js of scripts.map(noComments)) {
    assert.ok(!/\\'/.test(js), f + ": an escaped ' in a script string");
    for (const [str] of js.matchAll(/"[^"\n]*"|`[^`]*`/g)) assert.ok(!straight.test(str), f + ": " + str);
  }
  if (f.endsWith(".js")) continue;
  const page = src.replace(/\{%-?\s*comment\s*-?%\}[\s\S]*?\{%-?\s*endcomment\s*-?%\}|<!--[\s\S]*?-->|<(script|style)[^>]*>[\s\S]*?<\/\1>/g, "");
  const texts = [...page.matchAll(/>([^<]+)</g)].map((m) => m[1])
    .concat([...page.matchAll(/\s(?:alt|content|title|aria-label|placeholder)="([^"]*)"/g)].map((m) => m[1]));
  for (const t of texts) assert.ok(!straight.test(t), f + ": " + t.trim().slice(0, 80));
  // French (owner, 2026-10-25): a non-breaking space before ; : ! ? and » and after «, never a plain one or none.
  if (f.startsWith("fr" + path.sep)) for (const t of texts) assert.ok(!/ [;:!?»]|« |[\p{L}\d][;!?»]|«[^\s]/u.test(t), f + ": " + t.trim().slice(0, 80));
}
console.log("ok");
