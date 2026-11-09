// node _tests/spots.test.js — the spots page in four languages: /spots/, /spots/fr/, /spots/es/, /spots/de/.
const assert = require("assert"), fs = require("fs"), path = require("path");
const root = path.join(__dirname, "..");
const html = fs.readFileSync(path.join(root, "_includes", "spots.html"), "utf8");
const fm = (d) => {
  const page = fs.readFileSync(path.join(root, d, "index.html"), "utf8");
  assert.ok(page.startsWith("---\n") && page.includes("{% include spots.html %}"), d + " is not the spots page");
  return Object.fromEntries([...page.split("---\n")[1].matchAll(/^(spots_\w+): "(.*)"$/gm)].map((m) => [m[1], m[2]]));
};
// Every line of copy is in the four pages' front matter, in that page's language: the same keys on all four,
// every key the include reads, no English value on fr, es or de, and no text left in the include itself.
const english = fm("spots"), used = [...new Set([...html.matchAll(/page\.(spots_\w+)/g)].map((m) => m[1]))];
for (const k of used) assert.ok(k in english, "spots: no " + k);
for (const lang of ["fr", "es", "de"]) {
  const t = fm("spots/" + lang);
  assert.deepStrictEqual(Object.keys(t).sort(), Object.keys(english).sort(), lang + ": not the English page's keys");
  for (const [k, v] of Object.entries(t)) {
    assert.notStrictEqual(v, english[k], lang + ": " + k + " is English");
    assert.strictEqual((v.match(/%@/g) || []).length, (english[k].match(/%@/g) || []).length, lang + ": " + k + " placeholders");
  }
  assert.strictEqual(t.spots_lang, lang);
  if (lang === "fr") for (const [k, v] of Object.entries(t)) assert.ok(!/ [;:!?»]|« |[\p{L}\d%@][;!?»]|«[^\s]/u.test(v), "fr: " + k + " typography");
  if (lang === "de") for (const [k, v] of Object.entries(t)) assert.ok(!/[«»”"]/.test(v), "de: " + k + " quotes");
}
assert.ok(/<html lang="\{\{ page\.spots_lang \}\}">/.test(html), "<html lang> is the page's");
const markup = html.replace(/\{%-?\s*comment\s*-?%\}[\s\S]*?\{%-?\s*endcomment\s*-?%\}|<(script|style)[^>]*>[\s\S]*?<\/\1>/g, "");
for (const [, t] of markup.matchAll(/>([^<]*)</g)) assert.ok(/^\s*(\{\{ page\.\w+ \}\}|Compromise)?\s*$/.test(t), "text in the include: " + t.trim());
for (const [, t] of markup.matchAll(/\s(?:alt|title|aria-label|placeholder|content)="([^"]+)"/g)) {
  if (/^(og|twitter|apple|width|light|noindex|no-referrer|website|Compromise|summary|https:\/\/compromise\.alephb\.uk\/img|\d)/.test(t) || !/\p{L}{3,} \p{L}{3,}/u.test(t)) continue;
  assert.ok(/^\{\{ page\.\w+ \}\}$/.test(t), "attribute text in the include: " + t);
}
const script = html.slice(html.indexOf("(function () {"));
for (const [str] of script.replace(/(^|\s)\/\/.*$/gm, "").matchAll(/"[^"\n]*"/g)) assert.ok(["\"use strict\"", "\"noopener noreferrer\""].includes(str) || !/\p{L}{3,} \p{L}{3,}/u.test(str), "English in the script: " + str);
// A language page reads the links /spots reads (the app writes /spots/fr…, GROUP_LINK.md).
assert.ok(/\.replace\(\/\^\\\/spots\\\/\(fr\|es\|de\)\$\/, "\/spots"\)/.test(html), "a language page reads the links /spots reads");
// The app opens every language's page itself (universal links).
const aasa = JSON.parse(fs.readFileSync(path.join(root, ".well-known", "apple-app-site-association"), "utf8"));
assert.ok(aasa.applinks.details[0].components.some((c) => c["/"] === "/spots/*"), "the app does not open /spots/fr");
console.log("spots: ok");
