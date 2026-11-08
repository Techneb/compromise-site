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
for (const name of ["Walk", "Transit", "Drive", "Cycle"]) {
  assert.ok(new RegExp('aria-hidden="true"[^]*?</svg><span class="mode-name">' + name + '</span>').test(html), "mode label " + name);
}
assert.ok(!/name="mode"[^>]*aria-label/.test(html), "a mode has one name, its visible label");
// The three questions, in order: name, start, travel mode; each is the real label of its field.
const order = ['for="name">What’s your name?</label>', 'for="address">Where do you start?</label>', '<legend>You travel by</legend>', 'The group will see your name'].map((q) => html.indexOf(q));
assert.ok(order.every((i, n) => i > 0 && (n === 0 || i > order[n - 1])), "questions out of order or missing: " + order);
assert.ok(/<input[^>]*id="name"[^>]*required/.test(html) && !/id="name"[^>]*aria-label/.test(html), "the name field is required and named by its label only");
// One page per language at /join/, /join/fr/, /join/es/, /join/de/: link previews show the head's copy in that language.
for (const d of ["join", "join/fr", "join/es", "join/de"]) {
  const page = fs.readFileSync(path.join(__dirname, "..", d, "index.html"), "utf8");
  assert.ok(page.startsWith("---\n") && page.includes("{% include join.html %}"), d + " is not the join page");
  for (const key of ["join_title", "join_og_title", "join_description", "join_image_alt"]) assert.ok(new RegExp("^" + key + ": \"[^\"]+\"$", "m").test(page), d + ": no " + key);
}
assert.ok(/\.replace\(\/\^\\\/join\\\/\(fr\|es\|de\)\$\/, "\/join"\)/.test(html), "a language page reads the links /join reads");
console.log("join: ok");
