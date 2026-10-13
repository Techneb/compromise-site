// node _tests/grouplink.test.js — the start's rounding, same cases as the app's GroupLinkTests.
// In _tests/ so Jekyll does not publish it.
const assert = require("assert");
const G = require("../grouplink.js");

const reply = (lat, lon) => G.writeReply({ name: "Léa", mode: "bike", start: { point: { latitude: lat, longitude: lon } } });
const point = (fragment) => G.readFragment(fragment).start.point;

// ~5 m: 0.00005° steps, trailing zeros dropped.
assert.ok(reply(48.839624, 2.379076).endsWith("&p=48.8396,2.3791"));
assert.ok(reply(48.83963, -2.37907).endsWith("&p=48.83965,-2.37905"));
assert.ok(reply(-0.00001, 0).endsWith("&p=0,0"));
// Old 3-decimal links still read; up to 5 decimals read; 6 refused.
assert.deepStrictEqual(point("v=1&k=reply&n=L%C3%A9a&m=bike&p=48.84,2.379"), { latitude: 48.84, longitude: 2.379 });
assert.deepStrictEqual(point("v=1&k=reply&m=bike&p=48.83965,2.37905"), { latitude: 48.83965, longitude: 2.37905 });
assert.throws(() => G.readFragment("v=1&k=reply&m=bike&p=48.860612,2.338"));
console.log("grouplink: ok");
