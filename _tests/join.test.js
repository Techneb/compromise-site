// node _tests/join.test.js — the join page's address field: labelled, plain text until MapKit JS says yes.
const assert = require("assert"), fs = require("fs"), path = require("path");
const html = fs.readFileSync(path.join(__dirname, "..", "join", "index.html"), "utf8");
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

// Privacy: the page and the policy both say typed text goes to Apple.
assert.ok(/class="fine">[^<]*goes to Apple/.test(html));
assert.ok(/join page on the web<\/strong>: what you type/.test(fs.readFileSync(path.join(__dirname, "..", "privacy.html"), "utf8")));
console.log("join: ok");
