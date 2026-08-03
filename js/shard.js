/* =========================================================
   EsquerrApp — per-category sharding rules (Phase 5, Stage B)

   Pure logic: no Firestore, no localStorage, no DOM. db.js owns
   the I/O and calls in here to decide WHERE each row belongs.

   Every team-data key used to be one club-wide document. It is now
   one document per category:

       teams/{teamId}/data/{key}__{category}
           { v: "<json>", category: "amateur" }

   `localStorage` stays byte-identical — one merged blob per key —
   so the ~128 read sites in app.js are untouched. Only the mapping
   to Firestore changes.

   Rows belonging to nobody's squad (staff accounts, an unassigned
   player's injury, a notification written before categories existed)
   go to the `__none` shard, which lead and staff can read and
   players cannot.

   Loaded before db.js in the browser; exported for the Node tests.
   ========================================================= */
(function (root, factory) {
  var api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Shard = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  /* utils.js owns CATEGORY_ORDER and loads first in the browser. The
     literal below exists only so the Node test harness can require this
     file on its own; `shard.test.js` asserts the two lists agree, so a
     category added to one and not the other fails the suite. */
  var ORDER = (typeof CATEGORY_ORDER !== 'undefined')
    ? CATEGORY_ORDER
    : ['amateur', 'juvenil', 'cadet', 'infantil', 'alevi', 'benjami'];

  var NONE = 'none';
  var SEP = '__';

  // ── Routing table ────────────────────────────────────────────
  /*
    shape — how the blob is laid out:
      'array'       a JSON array; each entry is routed on its own
      'map'         a JSON object; each VALUE travels with its KEY
      'mapOfArrays' a JSON object of arrays; entries inside one bucket
                    may belong to different categories

    by — where the category comes from:
      'field'           read straight off the entry (5 keys carry one)
      'roster'          join entry[field] (a uid) through fa_users
      'match'           join the map key (a matchId) through fa_matches
      'rosterKey'       the map key IS a uid
      'rosterKeyPrefix' the map key is `{uid}_{date}`

    Joined routes are resolved live, never stamped. Injury history has
    to follow the player: a frozen stamp would strand a promoted
    player's medical record with his old coach.
  */
  function byDateDesc(a, b) { return (b.date || '').localeCompare(a.date || ''); }
  function byTimestampDesc(a, b) { return (b.timestamp || '').localeCompare(a.timestamp || ''); }

  var ROUTES = {
    // Category carried on the row itself
    fa_users:                  { shape: 'array', by: 'field', field: 'category', id: 'id' },
    fa_training:               { shape: 'array', by: 'field', field: 'category', id: 'id', sort: byDateDesc },
    fa_matches:                { shape: 'array', by: 'field', field: 'category', id: 'id' },
    fa_matchday:               { shape: 'array', by: 'field', field: 'category' },
    // Sorted on merge so the 200-entry cap in addStaffNotification trims
    // the oldest overall — concatenating shards would make it drop one
    // whole category instead.
    fa_staff_notifications:    { shape: 'array', by: 'field', field: 'category', id: 'id', sort: byTimestampDesc },
    fa_tactic_saved:           { shape: 'array', by: 'field', field: 'category', id: 'id' },

    // Keyed by training DATE, which two categories can share — so the
    // bucket is split by the entry's own stamp, not by its key.
    fa_tactic_training_boards: { shape: 'mapOfArrays', by: 'field', field: 'category' },

    // Joined through the roster
    fa_injuries:               { shape: 'array', by: 'roster', field: 'playerId', id: 'id' },
    fa_injury_notes:           { shape: 'map', by: 'rosterKey' },
    fa_injury_zone:            { shape: 'map', by: 'rosterKey' },
    fa_injury_dismissed:       { shape: 'map', by: 'rosterKey' },
    fa_training_staff_override:{ shape: 'map', by: 'rosterKeyPrefix' },

    // Joined through the match
    fa_match_events:           { shape: 'map', by: 'match' },
    fa_match_goals:            { shape: 'map', by: 'match' },
    fa_convocatoria_sent:      { shape: 'map', by: 'match' },
    fa_convocatoria_callup:    { shape: 'map', by: 'match' },
    fa_tactic_match_boards:    { shape: 'map', by: 'match' }
  };

  // ── Document ids ─────────────────────────────────────────────

  function docId(key, cat) { return key + SEP + cat; }

  /** `fa_injury_notes__cadet` → { key, cat }; null for a legacy unsharded id. */
  function parseDocId(id) {
    var i = String(id).indexOf(SEP);
    if (i === -1) return null;
    return { key: id.slice(0, i), cat: id.slice(i + SEP.length) };
  }

  function isSharded(key) { return Object.prototype.hasOwnProperty.call(ROUTES, key); }

  function emptyFor(key) {
    var r = ROUTES[key];
    return (r && r.shape === 'array') ? [] : {};
  }

  // ── Resolution ───────────────────────────────────────────────

  /** A category we don't recognise is not a category. */
  function _norm(c) {
    return (c && ORDER.indexOf(c) !== -1) ? c : '';
  }

  function _catOfEntry(route, entry, ctx) {
    if (!entry || typeof entry !== 'object') return '';
    if (route.by === 'field') return _norm(entry[route.field]);
    if (route.by === 'roster') return _norm(ctx.userCat(entry[route.field]));
    return '';
  }

  function _catOfMapKey(route, mapKey, ctx) {
    if (route.by === 'match') return _norm(ctx.matchCat(mapKey));
    if (route.by === 'rosterKey') return _norm(ctx.userCat(mapKey));
    if (route.by === 'rosterKeyPrefix') return _norm(ctx.userCat(String(mapKey).split('_')[0]));
    return '';
  }

  /**
   * Where a row lived last time, for the joined routes only.
   *
   * A join can stop resolving — a player is deleted, a match is erased —
   * and dumping the row into `__none` would move a whole squad's medical
   * history out from under its coach. Falling back to the shard it came
   * from keeps it put. Field-routed keys need none of this: the category
   * is in the data, and its absence is a real answer.
   */
  function _provenance(key, prev) {
    var route = ROUTES[key];
    var idx = {};
    if (!prev || route.by === 'field') return idx;
    Object.keys(prev).forEach(function (cat) {
      var val = prev[cat];
      if (route.shape === 'array') {
        if (!Array.isArray(val) || !route.id) return;
        val.forEach(function (e) {
          if (e && e[route.id] !== undefined) idx[String(e[route.id])] = cat;
        });
      } else if (val && typeof val === 'object') {
        Object.keys(val).forEach(function (k) { idx[k] = cat; });
      }
    });
    return idx;
  }

  /**
   * Split one merged blob into `{ category: shardValue }`.
   *
   * `ctx` supplies the live joins: `userCat(uid)` and `matchCat(matchId)`.
   * `prev` is the shadow cache of parsed shards, used only for provenance.
   */
  function partition(key, parsed, ctx, prev) {
    var route = ROUTES[key];
    if (!route) throw new Error('shard: no route for ' + key);
    var prov = _provenance(key, prev);
    var out = {};

    function bucketArray(cat) {
      if (!out[cat]) out[cat] = [];
      return out[cat];
    }
    function bucketMap(cat) {
      if (!out[cat]) out[cat] = {};
      return out[cat];
    }

    if (route.shape === 'array') {
      (Array.isArray(parsed) ? parsed : []).forEach(function (e) {
        var cat = _catOfEntry(route, e, ctx);
        if (!cat && route.id && e && e[route.id] !== undefined) cat = prov[String(e[route.id])] || '';
        bucketArray(cat || NONE).push(e);
      });
      return out;
    }

    if (route.shape === 'map') {
      var m = (parsed && typeof parsed === 'object') ? parsed : {};
      Object.keys(m).forEach(function (k) {
        var cat = _catOfMapKey(route, k, ctx) || prov[k] || '';
        bucketMap(cat || NONE)[k] = m[k];
      });
      return out;
    }

    // mapOfArrays — the bucket key stays inside every shard it feeds.
    var mo = (parsed && typeof parsed === 'object') ? parsed : {};
    Object.keys(mo).forEach(function (k) {
      var arr = Array.isArray(mo[k]) ? mo[k] : [];
      arr.forEach(function (e) {
        var cat = _catOfEntry(route, e, ctx) || NONE;
        var b = bucketMap(cat);
        if (!b[k]) b[k] = [];
        b[k].push(e);
      });
    });
    return out;
  }

  /** Fixed order so a merged blob is byte-identical on every device. */
  function mergeOrder(shards) {
    var present = Object.keys(shards || {});
    var out = [];
    ORDER.forEach(function (c) { if (present.indexOf(c) !== -1) out.push(c); });
    if (present.indexOf(NONE) !== -1) out.push(NONE);
    // Anything unrecognised still merges, last and alphabetically, rather
    // than vanishing: a shard we cannot name is not a shard we may drop.
    present.filter(function (c) { return out.indexOf(c) === -1; })
      .sort()
      .forEach(function (c) { out.push(c); });
    return out;
  }

  /** Reassemble `{ category: shardValue }` into the one blob app.js reads. */
  function merge(key, shards) {
    var route = ROUTES[key];
    if (!route) throw new Error('shard: no route for ' + key);
    var order = mergeOrder(shards);

    if (route.shape === 'array') {
      var arr = [];
      order.forEach(function (c) {
        if (Array.isArray(shards[c])) arr = arr.concat(shards[c]);
      });
      if (route.sort) arr.sort(route.sort);
      return arr;
    }

    var obj = {};
    order.forEach(function (c) {
      var v = shards[c];
      if (!v || typeof v !== 'object') return;
      Object.keys(v).forEach(function (k) {
        if (route.shape === 'mapOfArrays') {
          if (!Array.isArray(v[k])) return;
          obj[k] = (obj[k] || []).concat(v[k]);
        } else {
          obj[k] = v[k];
        }
      });
    });
    return obj;
  }

  function isEmpty(key, val) {
    if (val === undefined || val === null) return true;
    return Array.isArray(val) ? val.length === 0 : Object.keys(val).length === 0;
  }

  return {
    ROUTES: ROUTES, NONE: NONE, SEP: SEP, ORDER: ORDER,
    docId: docId, parseDocId: parseDocId, isSharded: isSharded,
    emptyFor: emptyFor, isEmpty: isEmpty,
    partition: partition, merge: merge, mergeOrder: mergeOrder
  };
});
