// The group link, version 1: reading and writing, the same rules as the app.
(function (root) {
  "use strict";

  var HOST = "compromise.alephb.uk";
  var VERSION = "1";
  var MODES = ["walk", "transit", "car", "bike"];
  var Limit = {
    fragment: 4000, pairs: 32, name: 30, address: 200, spotName: 80, spotAddress: 150,
    people: 12, spots: 3, startDecimals: 3, spotDecimals: 5, scalarsPerCharacter: 4
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

  var refusedCategory = /[\p{Cc}\p{Zl}\p{Zp}\p{Cs}]/u;
  var invisible = [
    [0x061C, 0x061C], [0x200B, 0x200B], [0x200E, 0x200F], [0x202A, 0x202E],
    [0x2060, 0x2060], [0x2066, 0x2069], [0xFEFF, 0xFEFF]
  ];

  function isRefused(scalar) {
    if (refusedCategory.test(scalar)) return true;
    var value = scalar.codePointAt(0);
    return invisible.some(function (r) { return value >= r[0] && value <= r[1]; });
  }

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
    if (text === "" || characters(text).length > max ||
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
    return { kind: "reply", name: name, mode: mode, start: start };
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
      case "invite": return { kind: "invite", organiser: fields.text("n", Limit.name) };
      case "reply": return readReply(fields);
      case "pick": return readResults(fields, true);
      case "top": return readResults(fields, false);
      case null: throw new Refused("missingField");
      default: throw new Refused("unknownKind");
    }
  }

  function pathFor(link) { return link.kind === "pick" || link.kind === "top" ? "/spots" : "/join"; }

  function readURL(string) {
    if (utf8Length(string) > Limit.fragment + 64) throw new Refused("tooLong");
    var parts = /^([A-Za-z][A-Za-z0-9+.\-]*):\/\/([^\/?#]*)([^?#]*)(?:\?[^#]*)?#([^#]*)$/.exec(string);
    if (!parts || !/^[\x21-\x7e]*$/.test(string) || parts[1].toLowerCase() !== "https" ||
        parts[2].toLowerCase() !== HOST) throw new Refused("wrongAddress");
    var path;
    try { path = decodeURIComponent(parts[3]); } catch (e) { throw new Refused("wrongAddress"); }
    var link = readFragment(parts[4]);
    if (path.replace(/\/$/, "") !== pathFor(link)) throw new Refused("wrongAddress");
    return link;
  }

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
    return result.trim();
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
      var p = reply.start.point;
      pairs.push(["p", formatted(p.latitude, Limit.startDecimals) + "," + formatted(p.longitude, Limit.startDecimals)]);
    } else {
      pairs.push(["a", encoded(reply.start.address, Limit.address)]);
    }
    var fragment = pairs.map(function (pair) { return pair[0] + "=" + pair[1]; }).join("&");
    readFragment(fragment);
    return "https://" + HOST + "/join#" + fragment;
  }

  var api = {
    Limit: Limit, Refused: Refused, read: read, readFragment: readFragment, readURL: readURL,
    pathFor: pathFor, cleaned: cleaned, encoded: encoded, formatted: formatted, writeReply: writeReply
  };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.GroupLink = api;
})(this);
