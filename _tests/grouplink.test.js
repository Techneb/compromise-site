// node _tests/grouplink.test.js — the same cases as the app's GroupLinkTests.
// In _tests/ so Jekyll does not publish it.
const assert = require("assert");
const G = require("../grouplink.js");

const reply = (lat, lon) => G.writeReply({ name: "Léa", mode: "bike", start: { point: { latitude: lat, longitude: lon } } });
const point = (fragment) => G.readFragment(fragment).start.point;
const refused = (fragment, reason) => assert.throws(() => G.readFragment(fragment),
  (e) => e instanceof G.Refused && (!reason || e.reason === reason), fragment);
const spotLink = "v=1&k=top&w=Nino,L%C3%A9a&s1=Le%20Comptoir&a1=Place%20de%20la%20Bastille%2C%20Paris&p1=48.85322,2.36912&t1=14,15"
  + "&s2=Caf%C3%A9%20du%20Port&p2=48.8487,2.3667&t2=16,13";

// The doc's examples: the writer sends them, the reader reads them.
assert.strictEqual(G.writeReply({ name: "Léa", mode: "bike", start: { point: { latitude: 48.84, longitude: 2.379 } } }),
  "https://compromise.alephb.uk/join#v=1&k=reply&n=L%C3%A9a&m=bike&p=48.84,2.379");
assert.strictEqual(G.writeReply({ name: "Sam", mode: "transit", start: { address: "Gare de Lyon, Paris" } }),
  "https://compromise.alephb.uk/join#v=1&k=reply&n=Sam&m=transit&a=Gare%20de%20Lyon%2C%20Paris");
assert.deepStrictEqual(G.read("#v=1&k=invite&n=Nino"), { kind: "invite", organiser: "Nino" });
assert.deepStrictEqual(G.read("v=1&k=reply&n=Sam&m=transit&a=Gare%20de%20Lyon%2C%20Paris"),
  { kind: "reply", name: "Sam", mode: "transit", start: { address: "Gare de Lyon, Paris" } });
assert.deepStrictEqual(G.read(spotLink), { kind: "top", people: ["Nino", "Léa"], spots: [
  { name: "Le Comptoir", address: "Place de la Bastille, Paris", latitude: 48.85322, longitude: 2.36912, minutes: [14, 15] },
  { name: "Café du Port", address: null, latitude: 48.8487, longitude: 2.3667, minutes: [16, 13] },
] });
assert.strictEqual(G.pathFor(G.read(spotLink)), "/spots");
assert.strictEqual(G.pathFor(G.read("v=1&k=invite&n=Nino")), "/join");
assert.deepStrictEqual(G.read("v=1&k=invite&n=Nino&utm=x"), { kind: "invite", organiser: "Nino" }, "an unknown key is ignored");
assert.deepStrictEqual(G.read("v=1&k=invite&n=Ni no"), { kind: "invite", organiser: "Ni no" }, "a raw space is a space");
assert.deepStrictEqual(G.read("v=1&k=pick&w=L%C3%A9a%2C%20Jr,Nino&s1=Spot&p1=1,2&t1=5,7").people, ["Léa, Jr", "Nino"]);

// ~5 m: 0.00005° steps, trailing zeros dropped.
assert.ok(reply(48.839624, 2.379076).endsWith("&p=48.8396,2.3791"));
assert.ok(reply(48.83963, -2.37907).endsWith("&p=48.83965,-2.37905"));
assert.ok(reply(-0.00001, 0).endsWith("&p=0,0"));
assert.strictEqual(G.formatted(2.3, 3), "2.3");
assert.strictEqual(G.formatted(2.0004, 3), "2");
assert.strictEqual(G.formatted(-0.0004, 3), "0");
assert.strictEqual(G.formatted(-73.98566, 3), "-73.986");
assert.strictEqual(G.formatted(179.9996, 3), "180");
// Old 3-decimal links still read; up to 5 decimals read; 6 refused.
assert.deepStrictEqual(point("v=1&k=reply&n=L%C3%A9a&m=bike&p=48.84,2.379"), { latitude: 48.84, longitude: 2.379 });
assert.deepStrictEqual(point("v=1&k=reply&m=bike&p=48.83965,2.37905"), { latitude: 48.83965, longitude: 2.37905 });
assert.deepStrictEqual(point("v=1&k=reply&m=walk&p=-90,180"), { latitude: -90, longitude: 180 });
assert.deepStrictEqual(point("v=1&k=reply&m=walk&p=90,-180.000"), { latitude: 90, longitude: -180 });
["48.860612,2.338", "91,2", "-90.001,2", "48,180.5", "48,-181", "48", "48,2,3", "48,", ",2",
  "+48,2", "48.,2", ".5,2", "1e1,2", "nan,2", "inf,2", "4800,2", "48%2C2", "48 ,2", "٤٨,2"]
  .forEach((p) => refused("v=1&k=reply&m=walk&p=" + p, "badField"));

// The link as a whole.
refused("v=1&k=invite&n=" + "a".repeat(4000), "tooLong");
refused(Array(33).fill("x=1").join("&"), "tooLong");
refused("", "malformed");
refused("v=1&&k=invite&n=Nino", "malformed");
refused("v=1&k=invite&n", "malformed");
refused("v=1&k=invite&n=a=b", "malformed");
refused("v=1&k=invite&=Nino", "malformed");
refused("v=1&k=invite&n=Nino&n=Léa", "duplicateKey");
refused("k=invite&n=Nino", "missingVersion");
refused("v=2&k=invite&n=Nino", "unsupportedVersion");
refused("v=01&k=invite&n=Nino", "unsupportedVersion");
refused("v=1&n=Nino", "missingField");
refused("v=1&k=party&n=Nino", "unknownKind");

// Text.
refused("v=1&k=invite", "missingField");
["", "%20%20", "a".repeat(31), "Ni%0Ano", "Ni%09no", "Ni%7Fno", "Ni%E2%80%AEno", "Ni%E2%80%A8no", "Ni%EF%BB%BFno",
  "100%", "%ZZ", "%C3", "a" + "%CC%81".repeat(200)].forEach((n) => refused("v=1&k=invite&n=" + n, "badField"));
assert.deepStrictEqual(G.read("v=1&k=invite&n=%20" + "é".repeat(30) + "%20"), { kind: "invite", organiser: "é".repeat(30) });

// Invisible scalars: every Default_Ignorable but the joiners and selectors, and blank text.
["%C2%AD", "Ni%C2%ADno", "Ni%E2%81%A2no", "Nino%F3%A0%81%81", "%EF%B8%8F", "%E3%85%A4", "Ni%E3%85%A4no",
  "Ni%E2%80%8Bno", "%E2%80%8D%20%E2%80%8D", "%C2%A0%C2%A0"].forEach((n) => refused("v=1&k=invite&n=" + n, "badField"));
assert.deepStrictEqual(G.read("v=1&k=invite&n=%E2%9D%A4%EF%B8%8F%20L%C3%A9a"), { kind: "invite", organiser: "❤️ Léa" });
assert.strictEqual(G.read("v=1&k=reply&m=walk&a=Saint%C2%ADGermain"), null, "a soft hyphen in an address");
assert.strictEqual(G.cleaned("Ni­no", 30), "Nino");
assert.strictEqual(G.cleaned("️", 30), "", "nothing to draw");
assert.strictEqual(G.cleaned("ㅤ", 30), "");
assert.strictEqual(G.cleaned("Nino\u{E0041}", 30), "Nino");
assert.strictEqual(G.cleaned("Ni⁢no", 30), "Nino");
assert.strictEqual(G.cleaned("👩‍💻 Nino", 30), "👩‍💻 Nino", "a joiner stays: emoji need it");
assert.strictEqual(G.encoded("Saint­Germain", 200), "SaintGermain");
assert.strictEqual(G.encoded("️", 30), "");

// The writer cleans text and refuses what a reader would.
assert.strictEqual(G.cleaned("  Ni\tno\n‮\u0007  ", 30), "Ni no");
assert.strictEqual(G.cleaned("é".repeat(40), 30), "é".repeat(30));
assert.strictEqual(G.writeReply({ name: " ​ ", mode: "walk", start: { address: "Bercy" } }),
  "https://compromise.alephb.uk/join#v=1&k=reply&m=walk&a=Bercy");
assert.strictEqual(G.writeReply({ name: "️", mode: "walk", start: { address: "Bercy" } }),
  "https://compromise.alephb.uk/join#v=1&k=reply&m=walk&a=Bercy");
assert.throws(() => G.writeReply({ name: null, mode: "walk", start: { address: " " } }), G.Refused);
assert.throws(() => G.writeReply({ name: null, mode: "walk", start: { address: "­" } }), G.Refused);
assert.throws(() => G.writeReply({ name: null, mode: "walk", start: { point: { latitude: 91, longitude: 0 } } }), G.Refused);
assert.throws(() => G.writeReply({ name: null, mode: "walk", start: { point: { latitude: NaN, longitude: 0 } } }), G.Refused);

// Replies.
refused("v=1&k=reply&p=48.84,2.379", "missingField");
refused("v=1&k=reply&m=plane&p=48.84,2.379", "badField");
refused("v=1&k=reply&m=Walk&p=48.84,2.379", "badField");
refused("v=1&k=reply&m=walk", "missingField");
refused("v=1&k=reply&m=walk&p=48.84,2.379&a=Bercy", "badField");
refused("v=1&k=reply&m=walk&a=", "badField");
refused("v=1&k=reply&m=walk&a=" + "a".repeat(201), "badField");
refused("v=1&k=reply&n=&m=walk&a=Bercy", "badField");

// Results.
const spot = "&s1=Bar&p1=48.85322,2.36912&t1=14,15";
refused("v=1&k=top" + spot, "missingField");
refused("v=1&k=top&w=Nino,,L%C3%A9a" + spot, "badField");
refused("v=1&k=top&w=" + Array.from({ length: 13 }, (_, i) => "P" + (i + 1)).join(","), "badField");
refused("v=1&k=top&w=Nino,L%C3%A9a", "missingField");
refused("v=1&k=top&w=Nino,L%C3%A9a&s1=Bar&t1=14,15", "missingField");
refused("v=1&k=top&w=Nino,L%C3%A9a&s1=Bar&p1=48.85322,2.36912", "missingField");
refused("v=1&k=top&w=Nino,L%C3%A9a&s1=Bar&p1=48.853224,2.36912&t1=14,15", "badField");
["14", "14,15,16", "14,1000", "14,-1", "14,"].forEach((t) =>
  refused("v=1&k=top&w=Nino,L%C3%A9a&s1=Bar&p1=48.85322,2.36912&t1=" + t, "badField"));
refused("v=1&k=top&w=Nino,L%C3%A9a&s1=Bar&a1=&p1=48.85322,2.36912&t1=14,15", "badField");
refused("v=1&k=top&w=Nino,L%C3%A9a" + spot + "&s3=Bar&p3=1,2&t3=1,2", "badField");
refused("v=1&k=top&w=Nino,L%C3%A9a" + spot + "&t2=1,2", "badField");
refused("v=1&k=top&w=Nino,L%C3%A9a&p1=48.85322,2.36912&t1=14,15", "badField");
refused("v=1&k=pick&w=Nino,L%C3%A9a" + spot + "&s2=Bar&p2=1,2&t2=1,2", "badField");
refused("v=1&k=top&w=Nino,L%C3%A9a&s1=" + "a".repeat(81) + "&p1=48.85322,2.36912&t1=14,15", "badField");

console.log("grouplink: ok");
