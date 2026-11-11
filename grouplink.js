// The group link, version 1: reading and writing, the same rules as the app.
(function (root) {
  "use strict";

  var HOST = "compromise.alephb.uk";
  var VERSION = "1";
  var MODES = ["walk", "transit", "car", "bike"];
  var Limit = {
    fragment: 4000, pairs: 32, name: 30, address: 200, spotName: 80, spotAddress: 150,
    people: 12, spots: 3, kind: 40, ballot: 4, startDecimals: 5, startStep: 0.00005, spotDecimals: 5, scalarsPerCharacter: 4,
    relayPlaintext: 4096, relayTimeout: 10000
  };

  function Refused(reason) { this.reason = reason; }

  var segmenter = typeof Intl !== "undefined" && Intl.Segmenter
    ? new Intl.Segmenter("en", { granularity: "grapheme" }) : null;

  function characters(text) {
    if (segmenter) return Array.from(segmenter.segment(text), function (s) { return s.segment; });
    return Array.from(text);
  }

  function scalarCount(text) { return Array.from(text).length; }

  function utf8Length(text) { return new TextEncoder().encode(text).length; }

  // Control characters, line and paragraph separators, and every scalar Unicode
  // lets a renderer draw as nothing (bidi marks, zero width space, soft hyphen,
  // invisible operators, tags…), but the joiners and variation selectors emoji
  // and some scripts are made of: the app's GroupLink.isRefused.
  var refusedCategory = /[\p{Cc}\p{Zl}\p{Zp}\p{Cs}]/u;
  var ignorable = /\p{Default_Ignorable_Code_Point}/u;
  var drawnWith = [
    [0x200C, 0x200D], [0x180B, 0x180D], [0x180F, 0x180F], [0xFE00, 0xFE0F], [0xE0100, 0xE01EF]
  ];

  function isRefused(scalar) {
    if (refusedCategory.test(scalar)) return true;
    var value = scalar.codePointAt(0);
    return ignorable.test(scalar) && !drawnWith.some(function (r) { return value >= r[0] && value <= r[1]; });
  }

  // Text with nothing to draw: only spaces and the joiners or selectors left.
  var drawn = /[^\p{White_Space}\p{Default_Ignorable_Code_Point}]/u;
  function isBlank(text) { return !drawn.test(text); }

  function isDigits(text) { return /^[0-9]+$/.test(text); }

  // Fields: the fragment's pairs, still percent-encoded.
  function Fields(body) {
    var pairs = body.split("&");
    if (pairs.length > Limit.pairs) throw new Refused("tooLong");
    this.values = new Map();
    for (var i = 0; i < pairs.length; i++) {
      var parts = pairs[i].split("=");
      if (parts.length !== 2 || parts[0] === "") throw new Refused("malformed");
      if (this.values.has(parts[0])) throw new Refused("duplicateKey");
      this.values.set(parts[0], parts[1]);
    }
  }

  Fields.prototype.get = function (key) { return this.values.has(key) ? this.values.get(key) : null; };

  function decoded(raw, max) {
    var text;
    try { text = decodeURIComponent(raw); } catch (e) { throw new Refused("badField"); }
    if (Array.from(text).some(isRefused)) throw new Refused("badField");
    text = text.trim();
    if (isBlank(text) || characters(text).length > max ||
        scalarCount(text) > max * Limit.scalarsPerCharacter) throw new Refused("badField");
    return text;
  }

  Fields.prototype.text = function (key, max) {
    var raw = this.get(key);
    if (raw === null) throw new Refused("missingField");
    return decoded(raw, max);
  };

  Fields.prototype.optionalText = function (key, max) {
    return this.get(key) === null ? null : this.text(key, max);
  };

  Fields.prototype.textList = function (key, max, low, high) {
    var raw = this.get(key);
    if (raw === null) throw new Refused("missingField");
    var items = raw.split(",");
    if (items.length < low || items.length > high) throw new Refused("badField");
    return items.map(function (item) { return decoded(item, max); });
  };

  // b=<id>,<kind>,…: a vote (GROUP_SYNC.md §4.4), its 6-character id then `low` to 4 distinct kinds. Shape only:
  // whether they match the open vote is the organiser's app's call.
  Fields.prototype.vote = function (low) {
    var raw = this.get("b");
    if (raw === null) return null;
    var items = raw.split(",");
    if (!/^[A-Za-z0-9_-]{6}$/.test(items[0]) || items.length - 1 < low || items.length - 1 > Limit.ballot) throw new Refused("badField");
    var kinds = items.slice(1).map(function (item) { return decoded(item, Limit.kind); });
    if (new Set(kinds).size !== kinds.length) throw new Refused("badField");
    return { id: items[0], kinds: kinds };
  };

  function number(text, decimals) {
    var unsigned = text.charAt(0) === "-" ? text.slice(1) : text;
    var halves = unsigned.split(".");
    if (halves.length > 2) return null;
    if (halves[0].length < 1 || halves[0].length > 3 || !isDigits(halves[0])) return null;
    if (halves.length === 2 && (halves[1].length < 1 || halves[1].length > decimals || !isDigits(halves[1]))) return null;
    return Number(text);
  }

  Fields.prototype.coordinate = function (key, decimals) {
    var raw = this.get(key);
    if (raw === null) throw new Refused("missingField");
    var parts = raw.split(",");
    var latitude = parts.length === 2 ? number(parts[0], decimals) : null;
    var longitude = parts.length === 2 ? number(parts[1], decimals) : null;
    if (latitude === null || longitude === null || latitude < -90 || latitude > 90 ||
        longitude < -180 || longitude > 180) throw new Refused("badField");
    return { latitude: latitude, longitude: longitude };
  };

  Fields.prototype.minutes = function (key, count) {
    var raw = this.get(key);
    if (raw === null) throw new Refused("missingField");
    var items = raw.split(",");
    var ok = items.filter(function (item) { return item.length >= 1 && item.length <= 3 && isDigits(item); });
    if (items.length !== count || ok.length !== count) throw new Refused("badField");
    return ok.map(Number);
  };

  function readReply(fields) {
    var name = fields.optionalText("n", Limit.name);
    var mode = fields.get("m");
    if (mode === null) throw new Refused("missingField");
    if (MODES.indexOf(mode) < 0) throw new Refused("badField");
    var hasPoint = fields.get("p") !== null, hasAddress = fields.get("a") !== null;
    if (hasPoint && hasAddress) throw new Refused("badField");
    if (!hasPoint && !hasAddress) throw new Refused("missingField");
    var start = hasPoint
      ? { point: fields.coordinate("p", Limit.startDecimals) }
      : { address: fields.text("a", Limit.address) };
    var reply = { kind: "reply", name: name, mode: mode, start: start };
    var ticks = fields.vote(1);
    if (ticks) reply.ticks = ticks;
    return reply;
  }

  // Strict base64url without padding: re-encoding must give the same text back.
  function base64url(data) {
    return btoa(String.fromCharCode.apply(null, data)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  }

  function fromBase64url(text) {
    var data = Uint8Array.from(atob(text.replace(/-/g, "+").replace(/_/g, "/")), function (c) { return c.charCodeAt(0); });
    return base64url(data) === text ? data : null;
  }

  // r=<box>.<key>: the reply relay's box id (16 bytes) and reply key (32 bytes), both or neither (GROUP_SYNC.md §3.2).
  function readInvite(fields) {
    var invite = { kind: "invite", organiser: fields.text("n", Limit.name) };
    var vote = fields.vote(2);
    if (vote) invite.vote = vote;
    var raw = fields.get("r");
    if (raw === null) return invite;
    var parts = /^([A-Za-z0-9_-]{22})\.([A-Za-z0-9_-]{43})$/.exec(raw);
    var id = parts && fromBase64url(parts[1]), key = parts && fromBase64url(parts[2]);
    if (!id || !key) throw new Refused("badField");
    invite.relay = { box: parts[1], id: id, key: key };
    return invite;
  }

  function readResults(fields, picked) {
    var people = fields.textList("w", Limit.name, 1, Limit.people);
    var spots = [];
    for (var index = 1; index <= Limit.spots; index++) {
      if (spots.length !== index - 1 || fields.get("s" + index) === null) continue;
      var name = fields.text("s" + index, Limit.spotName);
      var address = fields.optionalText("a" + index, Limit.spotAddress);
      var point = fields.coordinate("p" + index, Limit.spotDecimals);
      spots.push({
        name: name, address: address, latitude: point.latitude, longitude: point.longitude,
        minutes: fields.minutes("t" + index, people.length)
      });
    }
    for (var stray = spots.length + 1; stray <= Limit.spots; stray++) {
      if (["s", "a", "p", "t"].some(function (p) { return fields.get(p + stray) !== null; })) throw new Refused("badField");
    }
    if (spots.length === 0) throw new Refused("missingField");
    if (picked && spots.length !== 1) throw new Refused("badField");
    return { kind: picked ? "pick" : "top", people: people, spots: spots };
  }

  function readFragment(raw) {
    var body = raw.charAt(0) === "#" ? raw.slice(1) : raw;
    if (utf8Length(body) > Limit.fragment) throw new Refused("tooLong");
    var fields = new Fields(body);
    var version = fields.get("v");
    if (version === null) throw new Refused("missingVersion");
    if (version !== VERSION) throw new Refused("unsupportedVersion");
    switch (fields.get("k")) {
      case "invite": return readInvite(fields);
      case "reply":
        if (fields.get("r") !== null) throw new Refused("badField");
        return readReply(fields);
      case "pick": return readResults(fields, true);
      case "top": return readResults(fields, false);
      case null: throw new Refused("missingField");
      default: throw new Refused("unknownKind");
    }
  }

  function pathFor(link) { return link.kind === "pick" || link.kind === "top" ? "/spots" : "/join"; }

  // Reads a link, or null: a refused link is dropped whole.
  function read(fragment) {
    try { return readFragment(fragment); } catch (e) { if (e instanceof Refused) return null; throw e; }
  }

  // Writing.

  function cleaned(text, max) {
    var kept = "";
    Array.from(text).forEach(function (scalar) {
      if (/\p{White_Space}/u.test(scalar)) kept += " ";
      else if (!isRefused(scalar)) kept += scalar;
    });
    var collapsed = kept.split(" ").filter(Boolean).join(" ");
    var result = "", count = 0, scalars = 0;
    var parts = characters(collapsed);
    for (var i = 0; i < parts.length; i++) {
      scalars += scalarCount(parts[i]);
      if (count >= max || scalars > max * Limit.scalarsPerCharacter) break;
      result += parts[i];
      count += 1;
    }
    return isBlank(result) ? "" : result.trim();
  }

  function encoded(text, max) {
    return Array.from(new TextEncoder().encode(cleaned(text, max)), function (byte) {
      var c = String.fromCharCode(byte);
      return /[A-Za-z0-9\-._~]/.test(c) ? c : "%" + (byte < 16 ? "0" : "") + byte.toString(16).toUpperCase();
    }).join("");
  }

  // Fixed decimals as printf rounds them (an exact tie goes to the even digit),
  // trailing zeros dropped, "-0" written "0".
  function formatted(value, decimals) {
    var text = value.toFixed(decimals);
    var exact = Math.abs(value).toFixed(100);
    var tail = exact.slice(exact.indexOf(".") + 1 + decimals);
    if (/^50*$/.test(tail)) {
      var down = (value < 0 ? "-" : "") + exact.slice(0, exact.indexOf(".") + 1 + decimals);
      var last = down.charAt(down.length - 1);
      if (last === ".") last = down.charAt(down.length - 2);
      if (Number(last) % 2 === 0) text = down.replace(/\.$/, "");
    }
    if (text.indexOf(".") >= 0) text = text.replace(/0+$/, "").replace(/\.$/, "");
    return text === "-0" ? "0" : text;
  }

  function writeReply(reply) {
    var pairs = [["v", VERSION], ["k", "reply"]];
    if (reply.name != null) {
      var name = encoded(reply.name, Limit.name);
      if (name !== "") pairs.push(["n", name]);
    }
    pairs.push(["m", reply.mode]);
    if (reply.start.point) {
      var p = reply.start.point, step = Limit.startStep;
      // Half away from zero, as Swift rounds.
      var snap = function (v) { return Math.sign(v) * Math.round(Math.abs(v) / step) * step; };
      var lat = snap(p.latitude), lon = snap(p.longitude);
      pairs.push(["p", formatted(lat, Limit.startDecimals) + "," + formatted(lon, Limit.startDecimals)]);
    } else {
      pairs.push(["a", encoded(reply.start.address, Limit.address)]);
    }
    // The friend's ticks, after the start: { id, kinds } from the invite's vote; none, no b (not voted).
    if (reply.ticks && reply.ticks.kinds.length) {
      pairs.push(["b", [reply.ticks.id].concat(reply.ticks.kinds.map(function (k) { return encoded(k, Limit.kind); })).join(",")]);
    }
    var fragment = pairs.map(function (pair) { return pair[0] + "=" + pair[1]; }).join("&");
    readFragment(fragment);
    return "https://" + HOST + "/join#" + fragment;
  }

  // The reply relay. AES-256-GCM, the box id as associated data; the body is nonce (12) ‖ ciphertext ‖ tag (16),
  // as the app's ReplyBox seals it. The host is the code's, never the link's.
  var RELAY = "https://relay.alephb.uk/v1/box/";

  function seal(relay, fragment, nonce) {
    var plaintext = new TextEncoder().encode(fragment);
    if (plaintext.length > Limit.relayPlaintext) return Promise.reject(new Refused("tooLong"));
    var iv = nonce || crypto.getRandomValues(new Uint8Array(12));
    return crypto.subtle.importKey("raw", relay.key, "AES-GCM", false, ["encrypt"]).then(function (key) {
      return crypto.subtle.encrypt({ name: "AES-GCM", iv: iv, additionalData: relay.id }, key, plaintext);
    }).then(function (sealed) {
      var body = new Uint8Array(12 + sealed.byteLength);
      body.set(iv);
      body.set(new Uint8Array(sealed), 12);
      return body;
    });
  }

  // Posts a reply fragment to its box: true when the relay took it (202), false on anything else, never a throw.
  function send(relay, fragment, fetcher) {
    var controller = new AbortController();
    var timer = setTimeout(function () { controller.abort(); }, Limit.relayTimeout);
    return seal(relay, fragment).then(function (body) {
      return (fetcher || fetch)(RELAY + relay.box, {
        method: "POST", headers: { "Content-Type": "application/octet-stream" }, body: body, signal: controller.signal
      });
    }).then(function (response) { return response.status === 202; }, function () { return false; })
      .finally(function () { clearTimeout(timer); });
  }

  var api = {
    Limit: Limit, Refused: Refused, read: read, readFragment: readFragment,
    pathFor: pathFor, cleaned: cleaned, encoded: encoded, formatted: formatted, writeReply: writeReply,
    seal: seal, send: send
  };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.GroupLink = api;
})(this);
