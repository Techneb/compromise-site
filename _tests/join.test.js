// node _tests/join.test.js — the join page's address field: labelled, plain text until MapKit JS says yes.
const assert = require("assert"), fs = require("fs"), path = require("path");
const html = fs.readFileSync(path.join(__dirname, "..", "_includes", "join.html"), "utf8");
const tag = (re) => { const m = re.exec(html); assert.ok(m, "missing " + re); return m[0]; };

// The field is labelled and starts as a plain text field: the fallback when MapKit JS never loads or is refused.
const field = tag(/<input[^>]*id="address"[^>]*>/);
assert.ok(/<label[^>]*for="address"[^>]*>[^<]+</.test(html), "the address field has no label");
assert.ok(!/role=|aria-expanded|aria-controls/.test(field), "the field must not be a combobox before MapKit JS is ready");
assert.ok(/autocomplete="street-address"/.test(field));
assert.ok(/id="locate"[^>]*aria-label="[^"]+"/.test(html), "the location button stays");

// Suggestions: a labelled listbox, hidden, and a live region that announces them.
assert.ok(/<ul id="suggestions"[^>]*role="listbox"[^>]*aria-label="[^"]+"[^>]*hidden/.test(html));
assert.ok(/<p id="suggestions-status"[^>]*aria-live="polite"/.test(html));

// MapKit JS: pinned, with its hash, calling the page back by a name the page defines; it only switches
// the field on when its configuration says Initialized, and an error switches it back.
const mk = tag(/<script src="https:\/\/cdn\.apple-mapkit\.com\/mk\/5\.\d+\.\d+\/mapkit\.core\.js"[^>]*>/);
assert.ok(/data-libraries="services"/.test(mk) && /\basync\b/.test(mk));
const callback = /data-callback="(\w+)"/.exec(mk)[1];
assert.ok(html.includes("window." + callback + " = function"), "no " + callback + " on window");
assert.ok(html.indexOf(mk) > html.indexOf("window." + callback), "MapKit JS must load after the page defines its callback");
assert.ok(/event\.status === "Initialized"[^\n]*useMapKit\(true\)/.test(html));
assert.ok(/addEventListener\("error", function \(\) \{ useMapKit\(false\); \}\)/.test(html));
assert.ok(!html.includes("__MAPKIT_TOKEN__"), "the token was never put in");

// A pick is sent as a point, as My location is: nothing new in the link.
assert.ok(/point = \{ latitude: c\.latitude, longitude: c\.longitude \}/.test(html));
assert.ok(/var start = point \? \{ point: point \} : \{ address: address\.value \};/.test(html));

// My location shows its street from Apple's reverse lookup of the rounded point; the link still carries the point.
assert.ok(/geocoder\.reverseLookup\(new mapkit\.Coordinate\(snap\(/.test(html), "the street comes from the rounded point");
assert.ok(/if \(street && point === located\) address\.value = street;/.test(html), "a late answer must not overwrite an edit");
assert.ok(/address\.value = HERE;/.test(html), "My location stays the fallback");

// Privacy: the policy says typed text goes to Apple.
assert.ok(/join page on the web<\/strong>: what you type/.test(fs.readFileSync(path.join(__dirname, "..", "privacy.html"), "utf8")));
// Travel modes: each shows the app's name for it, read once (the icon is hidden, no aria-label).
for (const name of ["walk", "transit", "drive", "cycle"]) {
  assert.ok(new RegExp('aria-hidden="true"[^]*?</svg><span class="mode-name">\\{\\{ page\\.join_' + name + ' \\}\\}</span>').test(html), "mode label " + name);
}
assert.ok(!/name="mode"[^>]*aria-label/.test(html), "a mode has one name, its visible label");
// The three questions, in order: name, start, travel mode; each is the real label of its field.
const order = ['for="name">{{ page.join_name_q }}</label>', 'for="address">{{ page.join_start_q }}</label>', '<legend>{{ page.join_travel }}</legend>', '{{ page.join_privacy }}'].map((q) => html.indexOf(q));
assert.ok(order.every((i, n) => i > 0 && (n === 0 || i > order[n - 1])), "questions out of order or missing: " + order);
assert.ok(/<input[^>]*id="name"[^>]*required/.test(html) && !/id="name"[^>]*aria-label/.test(html), "the name field is required and named by its label only");
// One page per language at /join/, /join/fr/, /join/es/, /join/de/: link previews show the head's copy in that language.
for (const d of ["join", "join/fr", "join/es", "join/de"]) {
  const page = fs.readFileSync(path.join(__dirname, "..", d, "index.html"), "utf8");
  assert.ok(page.startsWith("---\n") && page.includes("{% include join.html %}"), d + " is not the join page");
  for (const key of ["join_title", "join_og_title", "join_description", "join_image_alt", "join_send", "join_sent", "join_again", "join_failed"]) {
    assert.ok(new RegExp("^" + key + ": \"[^\"]+\"$", "m").test(page), d + ": no " + key);
  }
  for (const key of ["join_sent", "join_failed"]) assert.ok(new RegExp("^" + key + ": \"[^\"\n]*%@").test(page.split("\n").find((l) => l.startsWith(key))), d + ": " + key + " names no one");
}
assert.ok(/^join_send: "Envoyer"$/m.test(fs.readFileSync(path.join(__dirname, "..", "join/fr/index.html"), "utf8")));

// Send (GROUP_SYNC.md §3.1): one button; with r= the relay first, and any failure goes on to the reply link under one line;
// without r= the reply link at once. The relay's host is in grouplink.js, never read from the link.
assert.ok(/<button type="submit" id="send"[^>]*>\{\{ page\.join_send \}\}<\/button>/.test(html), "the button is Send, in the page's language");
assert.ok(!/>Send back</.test(html), "no second button");
assert.ok(/if \(!relay\) \{ share\(url\); return; \}/.test(html));
assert.ok(/error\.textContent = named\(NOT_RELAYED\);\s*share\(url\);/.test(html), "a failed post falls back to the reply link");
assert.ok(/relayedTo\.textContent = named\(SENT_TO\);/.test(html) && /relayedAgain\.hidden = false;/.test(html));
assert.ok(!/relay\.alephb\.uk/.test(html) && /"https:\/\/relay\.alephb\.uk\/v1\/box\/"/.test(fs.readFileSync(path.join(__dirname, "..", "grouplink.js"), "utf8")));
assert.ok(/\.replace\(\/\^\\\/join\\\/\(fr\|es\|de\)\$\/, "\/join"\)/.test(html), "a language page reads the links /join reads");

// Suggestions close on Escape, on blur, on a press outside (touch keeps focus) and on Send, even while an answer is
// still on its way (closing bumps `asked`, so a late answer is dropped); the list floats, so closing never moves Send.
assert.ok(/address\.addEventListener\("keydown", function \(event\) \{\s*if \(event\.key === "Escape"\)[^\n]*closeSuggestions\(\)/.test(html), "Escape closes first, open or not");
assert.ok(/address\.addEventListener\("blur", closeSuggestions\);/.test(html), "blur always closes");
assert.ok(/document\.addEventListener\("pointerdown", function \(event\) \{[^\n]*closeSuggestions\(\)/.test(html), "a press outside closes");
assert.ok(/form\.addEventListener\("submit", function \(event\) \{\s*event\.preventDefault\(\);\s*closeSuggestions\(\);/.test(html), "Send closes");
assert.ok(/\.suggestions \{[^}]*position: absolute[^}]*overflow-y: auto/.test(html), "the list floats over the page and scrolls");
assert.ok(/list\.style\.maxHeight = Math\.max\(0, send\.getBoundingClientRect\(\)\.top - list\.getBoundingClientRect\(\)\.top - 8\) \+ "px";/.test(html), "the list ends above Send, never over it");
// Only places: a query suggestion ("Search Nearby") has no coordinate and is dropped; a pick always has a point.
assert.ok(/return r\.coordinate && r\.displayLines && r\.displayLines\.length;/.test(html), "only places are offered");
assert.ok(!/search\.search\(/.test(html), "no lookup of a query suggestion");
// The lede and the hint under Send: with r= Send sends, so they say Send; without, send the link back.
for (const d of ["join", "join/fr", "join/es", "join/de"]) {
  const page = fs.readFileSync(path.join(__dirname, "..", d, "index.html"), "utf8");
  const v = (k) => (new RegExp("^" + k + ": \"([^\"]+)\"$", "m").exec(page) || [])[1];
  for (const k of ["join_lede", "join_lede_relay", "join_why", "join_why_relay"]) assert.ok(v(k), d + ": no " + k);
  assert.ok(v("join_lede") !== v("join_lede_relay") && v("join_why") !== v("join_why_relay"), d + ": relay copy is the same");
  assert.ok(v("join_lede_relay").includes(v("join_send")) && v("join_why_relay").includes(v("join_send")), d + ": relay copy names the button");
}
const en = fs.readFileSync(path.join(__dirname, "..", "join", "index.html"), "utf8");
assert.ok(en.includes('join_lede: "Say where you’re starting from and how you’ll get there, then send the link back."'));
assert.ok(en.includes('join_why: "Add your first name and where you start, then send it back."'));
assert.ok(/lede\.textContent = relay \? LEDE_RELAY : LEDE;/.test(html) && /why\.textContent = relay \? WHY_RELAY : WHY;/.test(html));
// Every line of copy is in the four pages' front matter, in that page's language (owner, 2026-11-09): the same keys
// on all four, every key the include reads, no English value on fr, es or de, and no text left in the include itself.
const fm = (d) => {
  const src = fs.readFileSync(path.join(__dirname, "..", d, "index.html"), "utf8").split("---\n")[1];
  return Object.fromEntries([...src.matchAll(/^(join_\w+): "(.*)"$/gm)].map((m) => [m[1], m[2]]));
};
const english = fm("join"), used = [...new Set([...html.matchAll(/page\.(join_\w+)/g)].map((m) => m[1]))];
for (const k of used) assert.ok(k in english, "join: no " + k);
// Words that are the same in that language (and the language-neutral links' home, never the same).
const same = { fr: ["join_kicker"], es: [], de: [] };
for (const lang of ["fr", "es", "de"]) {
  const t = fm("join/" + lang);
  assert.deepStrictEqual(Object.keys(t).sort(), Object.keys(english).sort(), lang + ": not the English page's keys");
  for (const [k, v] of Object.entries(t)) {
    if (!same[lang].includes(k)) assert.notStrictEqual(v, english[k], lang + ": " + k + " is English");
    assert.strictEqual((v.match(/%@/g) || []).length, (english[k].match(/%@/g) || []).length, lang + ": " + k + " placeholders");
  }
  assert.strictEqual(t.join_lang, lang);
  if (lang === "fr") for (const [k, v] of Object.entries(t)) assert.ok(!/ [;:!?»]|« |[\p{L}\d%@][;!?»]|«[^\s]/u.test(v), "fr: " + k + " typography");
  if (lang === "de") for (const [k, v] of Object.entries(t)) assert.ok(!/[«»”"]/.test(v), "de: " + k + " quotes");
}
assert.ok(/<html lang="\{\{ page\.join_lang \}\}">/.test(html), "<html lang> is the page's");
assert.ok(/language: LANG/.test(html) && !/language: "en"/.test(html), "MapKit answers in the page's language");
const markup = html.replace(/\{%-?\s*comment\s*-?%\}[\s\S]*?\{%-?\s*endcomment\s*-?%\}|<(script|style)[^>]*>[\s\S]*?<\/\1>/g, "");
for (const [, t] of markup.matchAll(/>([^<]*)</g)) assert.ok(/^\s*(\{\{ page\.\w+ \}\}|Compromise)?\s*$/.test(t), "text in the include: " + t.trim());
for (const [, t] of markup.matchAll(/\s(?:alt|title|aria-label|placeholder)="([^"]+)"/g)) assert.ok(/^\{\{ page\.\w+ \}\}$/.test(t), "attribute text in the include: " + t);
const script = html.slice(html.indexOf("(function () {"));
for (const [str] of script.replace(/(^|\s)\/\/.*$/gm, "").matchAll(/"[^"\n]*"/g)) assert.ok(str === "\"use strict\"" || !/\p{L}{3,} \p{L}{3,}/u.test(str), "English in the script: " + str);
// The ballot (GROUP_SYNC.md §4.5): above the name, a group with its question as legend, one checkbox per kind of the
// invite's vote; the ticks go into the reply, none when there is no vote.
assert.ok(html.indexOf('<legend>{{ page.join_kind_q }}</legend>') > 0 && html.indexOf('<legend>{{ page.join_kind_q }}</legend>') < order[0], "the ballot comes first");
assert.ok(/<fieldset id="ballot" aria-describedby="ballot-hint" hidden>/.test(html), "hidden without a vote, its hint read with it");
assert.ok(/ticks: vote && \{ id: vote\.id, kinds: ticked\(\) \}/.test(html));
assert.ok(/var KINDS = \{% include kinds\.json %\};/.test(html), "the kinds table is the app's kinds.json, inlined");
// The kinds table: the app's VenueCategoryOption in Filters' order, each with an emoji and a title in the four languages.
const kindsPath = path.join(__dirname, "..", "_includes", "kinds.json"), kindsText = fs.readFileSync(kindsPath, "utf8");
const kinds = JSON.parse(kindsText);
assert.strictEqual(kinds.length, 50, "35 types and 15 restaurant subtypes");
assert.strictEqual(new Set(kinds.map((k) => k.id)).size, kinds.length, "ids are unique");
for (const k of kinds) {
  assert.deepStrictEqual(Object.keys(k), ["id", "emoji", "en", "fr", "es", "de"], k.id);
  for (const key of Object.keys(k)) assert.ok(typeof k[key] === "string" && k[key].trim() === k[key] && k[key], k.id + ": " + key);
  assert.ok(k.id.length <= 40, k.id + " is over the link's 40 characters");
  assert.ok(!/'/.test(k.fr + k.es + k.de + k.en), k.id + ": a straight apostrophe");
}
const subtypes = ["Italian", "French", "Greek", "Spanish", "Lebanese", "Turkish", "Indian", "Chinese", "Japanese", "Korean", "Thai",
  "Vietnamese", "Mexican", "Burger", "Pizza"].map((c) => c + " restaurant");
const at = kinds.findIndex((k) => k.id === "Restaurant");
assert.deepStrictEqual(kinds.slice(at + 1, at + 16).map((k) => k.id), subtypes, "the subtypes follow Restaurant, in SCREEN.md's order");
assert.deepStrictEqual(kinds.slice(at + 1, at + 16).map((k) => k.emoji).join(" "), "🍝 🥖 🫒 🥘 🧆 🥙 🍛 🥟 🍣 🍲 🌶️ 🍜 🌮 🍔 🍕");
// Against the app's copy: COMPROMISE_KINDS=<the app repo's kinds.json> node _tests/join.test.js.
if (process.env.COMPROMISE_KINDS) assert.deepStrictEqual(kinds, JSON.parse(fs.readFileSync(process.env.COMPROMISE_KINDS, "utf8")), "kinds.json drifted from the app's");
console.log("join: ok");
