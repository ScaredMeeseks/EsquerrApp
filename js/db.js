// ============================================================
// db.js — Firestore ↔ localStorage Sync Layer
// ============================================================
// Intercepts localStorage writes for team-data keys and mirrors
// them to Firestore.  On init, downloads team data from Firestore
// into localStorage so the app always has a local cache for
// instant synchronous reads.
//
// Phase 5 Stage B — every synced key is now SHARDED PER CATEGORY:
//
//     teams/{teamId}/data/{key}__{category}   { v, category }
//
// localStorage still holds one merged blob per key, so the ~128
// read sites in app.js never learn about any of this.  shard.js
// owns the routing rules; this file owns the I/O, the shadow
// cache of parsed shards, and the per-document diff that keeps a
// write-on-every-keystroke page from issuing N writes per render.
//
// THE SAFETY RULE: never write a shard whose input the client
// could not see.  Every writer in app.js parses the whole blob
// and writes it back, so a coach scoped to cadet would otherwise
// hand back a blob missing every other category — silently
// deleting them.  Shards outside the visible scope are simply not
// touched, and _routeWrite asserts that before every write.
//
// MERGE_KEYS (injury notes/zone/dismissed, staff override) use
// per-field Firestore merges inside their shard so two writers
// saving at the same time never overwrite each other.  Player-
// submitted availability/RPE lives ONLY in per-record
// subcollections (Phase 3b) — their localStorage blobs are local
// read caches rebuilt from record snapshots.
//
// Usage:
//   await DB.init('teamId', visibleCategories);
//   DB.setScope(visibleCategories);  — after a role/config change
//   DB.cleanup();                    — unsubscribe on logout
// ============================================================

const DB = (function () {
  'use strict';

  /* Keys that represent persistent team data.
     Everything else (seed flags, tactic editing state) stays local-only.
     Every one of these must have a route in shard.js — asserted below. */
  const SYNCED_KEYS = new Set([
    'fa_users',
    'fa_training',
    'fa_matches',
    'fa_matchday',
    // fa_standings / fa_news / fa_player_stats removed: no writer exists for
    // any of them anywhere in the app, so they only ever synced nothing.
    // Standings are fetched live through the FCF proxy; player stats are
    // computed from fa_matches + fa_match_events.
    'fa_staff_notifications',
    'fa_injury_notes',
    'fa_injury_zone',
    'fa_injury_dismissed',
    'fa_training_staff_override',
    'fa_convocatoria_sent',
    'fa_convocatoria_callup',
    'fa_match_goals',
    'fa_tactic_saved',
    'fa_tactic_match_boards',
    'fa_tactic_training_boards',
    'fa_injuries',
    'fa_match_events',
  ]);

  /* Keys that use per-field Firestore merges instead of blob replacement.
     Each writer touches only their own field — concurrent saves never
     conflict. The merge happens inside a shard, not across them. */
  const MERGE_KEYS = new Set([
    'fa_training_staff_override',
    'fa_injury_notes',
    'fa_injury_zone',
    'fa_injury_dismissed',
  ]);

  /* A key with no route would be written to a document nobody reads.
     Fail loudly at load time rather than silently at 2am. */
  SYNCED_KEYS.forEach(function (k) {
    if (!Shard.isSharded(k)) console.error('[DB] no shard route for synced key', k);
  });

  /* Player-submitted data lives ONLY in per-record subcollections
     (teams/{id}/{coll}/{docId}, docId = the historical blob key — Phase 3b
     removed the legacy data/ dual-write mirror; those docs are frozen and
     ignored). localStorage blobs for these keys are local read caches
     rebuilt from collection snapshots. */
  const RECORD_COLLECTIONS = {
    trainingAvail: {
      lsKey: 'fa_training_availability',
      toEntry: function (d) { return d.value; }
    },
    matchAvail: {
      lsKey: 'fa_match_availability',
      toEntry: function (d) { return d.value; }
    },
    rpe: {
      lsKey: 'fa_player_rpe',
      toEntry: function (d) {
        return { rpe: d.rpe, minutes: d.minutes, ua: d.ua, tag: d.tag, date: d.date };
      }
    }
  };
  const RECORD_LS_KEYS = new Set(
    Object.keys(RECORD_COLLECTIONS).map(function (c) { return RECORD_COLLECTIONS[c].lsKey; })
  );

  let _teamId = null;
  let _unsubscribers = [];

  /* Shadow cache: key → { category → shard content as a JSON string }.
     A merged blob cannot be rebuilt from a single docChange, so the
     parsed shards have to be kept. Strings, not objects, because the
     per-document diff is a string compare and the merge re-parses
     anyway. */
  let _shards = {};

  /* Shards refused for an unrecognised category — warn once each, not on
     every snapshot. */
  let _badShards = {};

  /* STAGE C — ON. The data/ listener queries where('category','in', scope)
     and the SAME list is the write assert below. They must never be two
     different lists, or the client writes back shards it never downloaded.

     Kept as a named constant rather than inlined because it is also the
     rollback: setting it false reverts to whole-collection reads, which
     still work against the narrowed rules only for the superuser — so if
     this is ever flipped back, the rules must be widened in the same
     breath. */
  const SCOPED_READS = true;

  /* The categories this client actually downloaded, plus 'none'. This is a
     READ scope, not the UI's category filter: a coach browsing one
     category still holds — and must write back — every category the
     listener fetched. Null means "not established yet"; routed writes are
     refused rather than guessed at. */
  let _scope = null;

  /* The categories app.js says this session may see. Only takes effect on
     the next init(), because narrowing the write scope without
     re-subscribing the listener would refuse writes for data we still
     hold, and widening it without re-subscribing would let us write shards
     we never downloaded. */
  let _wantScope = null;

  /* Save the originals BEFORE patching */
  const _origSetItem    = localStorage.setItem.bind(localStorage);
  const _origGetItem    = localStorage.getItem.bind(localStorage);
  const _origRemoveItem = localStorage.removeItem.bind(localStorage);

  // ── Helpers ──────────────────────────────────────────────────

  function shardRef(key, cat) {
    return db.collection('teams').doc(_teamId).collection('data').doc(Shard.docId(key, cat));
  }

  /** Surface a failed mirror write to the app (app.js shows a toast). */
  function _onWriteError(key, err) {
    console.error('[DB] write failed for', key, err);
    window.dispatchEvent(new CustomEvent('db-write-error', {
      detail: { key: key, code: err && err.code }
    }));
  }

  /**
   * Normalise a category list into a scope.
   * `none` is always included: staff accounts, unassigned players and
   * pre-category history live there, and every member's roster view
   * needs them.
   */
  function _normScope(categories) {
    var out = [Shard.NONE];
    (categories || []).forEach(function (c) {
      if (c && out.indexOf(c) === -1) out.push(c);
    });
    return out;
  }

  /** Tell the layer which categories this session may see (app.js). */
  function setScope(categories) {
    _wantScope = _normScope(categories);
    if (SCOPED_READS && _teamId && _scope && _wantScope.join(',') !== _scope.join(',')) {
      // The listener is subscribed to the old set. init() re-subscribes;
      // until then the old (already downloaded) scope stays authoritative.
      console.warn('[DB] visible categories changed — re-init to re-subscribe');
    }
  }

  /**
   * The scope the active listener downloaded — everything until Stage C.
   * Returns null when scoped reads are on but app.js has not said what this
   * session may see. That must fail loudly: falling back to ['none'] would
   * download almost nothing and then refuse every write to a real category,
   * which looks like the app quietly breaking rather than like a bug.
   */
  function _readScope() {
    if (!SCOPED_READS) return _normScope(Shard.ORDER);
    return _wantScope || null;
  }

  function _inScope(cat) {
    return !!_scope && _scope.indexOf(cat) !== -1;
  }

  /** The data/ collection query — narrowed to the scope from Stage C on. */
  function _dataQuery(teamDocRef) {
    var coll = teamDocRef.collection('data');
    // 6 categories + 'none' — comfortably inside the 30-value `in` limit.
    return SCOPED_READS ? coll.where('category', 'in', _scope) : coll;
  }

  /**
   * Live joins for the routes that don't carry their own category.
   * Both sources are localStorage blobs this same layer maintains, and
   * the monkey-patch writes locally BEFORE routing, so a roster edit is
   * already visible to the join that follows it. Built lazily — most
   * writes never need either map.
   */
  function _ctx() {
    var users = null, matches = null;
    return {
      userCat: function (uid) {
        if (!users) {
          users = {};
          try {
            JSON.parse(_origGetItem('fa_users') || '[]').forEach(function (u) {
              if (u && u.id !== undefined) users[String(u.id)] = u.category || '';
            });
          } catch (e) { /* an unparseable roster resolves nothing → none */ }
        }
        return users[String(uid)] || '';
      },
      matchCat: function (matchId) {
        if (!matches) {
          matches = {};
          try {
            JSON.parse(_origGetItem('fa_matches') || '[]').forEach(function (m) {
              if (m && m.id !== undefined) matches[String(m.id)] = m.category || '';
            });
          } catch (e) { /* same */ }
        }
        return matches[String(matchId)] || '';
      }
    };
  }

  function _parsedShards(key) {
    var raw = _shards[key] || {};
    var out = {};
    Object.keys(raw).forEach(function (cat) {
      try { out[cat] = JSON.parse(raw[cat]); }
      catch (e) { out[cat] = Shard.emptyFor(key); }
    });
    return out;
  }

  /** Merge the shadow cache into the one blob app.js reads. */
  function _rebuild(key) {
    var merged = JSON.stringify(Shard.merge(key, _parsedShards(key)));
    if (_origGetItem(key) === merged) return false;
    _origSetItem(key, merged);
    return true;
  }

  /**
   * For MERGE_KEYS: the changed fields inside one shard, or null if none.
   * `category` rides along on every update so the document always
   * carries the field the rules and the Stage C query read.
   */
  function _mergeUpdates(cat, oldObj, newObj) {
    var updates = {};
    var hasUpdates = false;
    for (var k in newObj) {
      if (JSON.stringify(newObj[k]) !== JSON.stringify(oldObj[k])) {
        updates[k] = newObj[k];
        hasUpdates = true;
      }
    }
    for (var d in oldObj) {
      if (!(d in newObj)) {
        updates[d] = firebase.firestore.FieldValue.delete();
        hasUpdates = true;
      }
    }
    if (!hasUpdates) return null;
    updates.category = cat;
    return updates;
  }

  /**
   * The shadow cache is updated optimistically so the per-document diff
   * sees this write. If the write is then rejected, the cache is claiming
   * content the server does not have and the NEXT write would diff against
   * it and skip — the change would be lost silently.
   *
   * COMPARE-AND-SWAP, not a plain restore. app.js writes on every keystroke,
   * so two writes to one key overlap constantly: if W1 fails after W2 has
   * already succeeded, restoring W1's `prevJson` would rewind the cache past
   * W2's content and the next rebuild would drop everything typed in between.
   * Only roll back if the cache still holds exactly what THIS write put
   * there. The same guard protects against Firestore's own revert snapshot,
   * which absorbs the server's value before this rejection handler runs.
   */
  function _rollback(key, cat, wroteJson, prevJson) {
    if (!_shards[key] || _shards[key][cat] !== wroteJson) return;
    if (prevJson === undefined) delete _shards[key][cat];
    else _shards[key][cat] = prevJson;
  }

  /** Refuse a routed write outright, without touching any shard. */
  function _refuse(key, code, msg) {
    var err = new Error(msg);
    err.code = code;
    _onWriteError(key, err);
    return Promise.reject(err);
  }

  /**
   * For MERGE_KEYS: convert Firestore doc fields back into a JSON blob
   * for localStorage. Strips internal fields (_migrated, v, category).
   */
  function _docToBlob(docData) {
    var obj = {};
    for (var k in docData) {
      if (k === '_migrated' || k === 'v' || k === 'category') continue;
      obj[k] = docData[k];
    }
    return JSON.stringify(obj);
  }

  /**
   * Split `value` across category shards and write only the documents
   * whose content actually changed — as ONE batch.
   *
   * The batch is not an optimisation, it is the correctness requirement.
   * Moving a row between categories (a player promoted, a match
   * re-categorised) is "delete from the old shard" plus "add to the new
   * one"; as independent requests the delete can land while the add fails,
   * and the row exists nowhere on the server while localStorage still shows
   * it. At most seven documents per key, far inside the 500-op limit.
   *
   * Returns a promise resolving when the batch is server-acked, so
   * setItemAcked can wait on the whole fan-out.
   */
  function _routeWrite(key, value) {
    if (!_scope) return _refuse(key, 'scope-unset', 'DB scope not established');

    // A blob we cannot read is NOT an empty blob. Treating it as one would
    // partition to nothing and clear every shard of the key — one bad
    // `JSON.stringify(undefined)` at a call site would wipe the roster
    // club-wide. Refuse, and leave the server exactly as it was.
    var parsed;
    try { parsed = JSON.parse(value); }
    catch (e) { return _refuse(key, 'blob-unparseable', 'unparseable blob for ' + key); }
    var wantArray = Array.isArray(Shard.emptyFor(key));
    var shapeOk = wantArray
      ? Array.isArray(parsed)
      : (parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed));
    if (!shapeOk) return _refuse(key, 'blob-shape', 'wrong blob shape for ' + key);

    var prev = _parsedShards(key);
    var next = Shard.partition(key, parsed, _ctx(), prev);

    // Every shard that exists now or existed before — a category emptied
    // by this write still needs its document cleared.
    var cats = {};
    Object.keys(next).forEach(function (c) { cats[c] = true; });
    Object.keys(prev).forEach(function (c) { cats[c] = true; });

    var planned = [];
    var refusal = null;
    Object.keys(cats).forEach(function (cat) {
      var nextVal = next[cat] !== undefined ? next[cat] : Shard.emptyFor(key);
      var nextJson = JSON.stringify(nextVal);
      var prevJson = _shards[key] ? _shards[key][cat] : undefined;

      if (prevJson === nextJson) return;                      // per-document diff
      if (prevJson === undefined && Shard.isEmpty(key, nextVal)) return;  // don't create empty docs

      // The safety rule. Reaching here means a row resolved to a category
      // this client cannot see, which can only be a routing bug — writing
      // it would push up a shard built from data we never downloaded. The
      // WHOLE write is refused, not just this shard: half a re-partition is
      // worse than none of it.
      if (!_inScope(cat)) {
        console.error('[DB] refusing to write out-of-scope shard', key, cat, 'scope:', _scope);
        refusal = refusal || Shard.docId(key, cat);
        return;
      }
      planned.push({ cat: cat, nextVal: nextVal, nextJson: nextJson, prevJson: prevJson });
    });

    if (refusal) return _refuse(key, 'shard-out-of-scope', 'shard out of scope: ' + refusal);
    if (!planned.length) return Promise.resolve();

    var batch = db.batch();
    var applied = [];
    planned.forEach(function (p) {
      var ref = shardRef(key, p.cat);
      if (MERGE_KEYS.has(key)) {
        var oldObj;
        try { oldObj = JSON.parse(p.prevJson || '{}'); } catch (e) { oldObj = {}; }
        var updates = _mergeUpdates(p.cat, oldObj, p.nextVal);
        // Content-identical but differently serialised: nothing to send,
        // but the cache still adopts the new string.
        if (updates) batch.set(ref, updates, { merge: true });
      } else {
        batch.set(ref, { v: p.nextJson, category: p.cat });
      }
      if (!_shards[key]) _shards[key] = {};
      _shards[key][p.cat] = p.nextJson;
      applied.push(p);
    });

    return batch.commit().catch(function (err) {
      applied.forEach(function (p) { _rollback(key, p.cat, p.nextJson, p.prevJson); });
      _onWriteError(key, err);
      throw err;
    });
  }

  /**
   * Apply one Firestore document to the shadow cache. Returns true if it
   * changed.
   *
   * A shard whose category we do not recognise is REFUSED, not merged.
   * The merge would put its rows into localStorage, the next write would
   * re-route them to __none (an unknown category resolves to none) and
   * write them there, while the original shard stayed put because it is
   * out of scope — every row duplicated, permanently, and every later save
   * on that key refused. Better to ignore it and say so.
   */
  function _absorbDoc(key, cat, docData, removed) {
    if (cat !== Shard.NONE && Shard.ORDER.indexOf(cat) === -1) {
      if (!_badShards[key + '__' + cat]) {
        _badShards[key + '__' + cat] = true;
        console.warn('[DB] ignoring shard with unknown category:', Shard.docId(key, cat));
      }
      return false;
    }
    if (!_shards[key]) _shards[key] = {};
    if (removed) {
      if (_shards[key][cat] === undefined) return false;
      delete _shards[key][cat];
      return true;
    }
    var json;
    if (MERGE_KEYS.has(key)) {
      json = _docToBlob(docData);
    } else {
      if (docData.v === undefined) return false;
      json = docData.v;
    }
    if (_shards[key][cat] === json) return false;
    _shards[key][cat] = json;
    return true;
  }

  // ── Public API ───────────────────────────────────────────────

  /**
   * Download Firestore team data → localStorage, then start real-time
   * listeners. If Firestore has no data yet (first time), the current
   * localStorage contents are uploaded instead.
   */
  async function init(teamId, categories) {
    if (categories) setScope(categories);
    var scope = _readScope();
    if (!scope) throw new Error('DB.init: visible categories unknown — call DB.setScope first');
    // A changed scope means the listener is watching the wrong set of
    // shards, so "already initialised" has to account for it too.
    if (_teamId === teamId && _unsubscribers.length
        && _scope && _scope.join(',') === scope.join(',')) return;
    cleanup();
    _teamId = teamId;
    _scope = scope;

    // Wait for Firestore persistence so pending writes from previous
    // sessions are visible to the .get() call below.
    if (typeof _persistenceReady !== 'undefined') {
      await _persistenceReady;
    }

    // Flush all synced + record-cache keys to prevent stale data from a
    // previous team
    SYNCED_KEYS.forEach(function (key) {
      _origRemoveItem(key);
    });
    RECORD_LS_KEYS.forEach(function (key) {
      _origRemoveItem(key);
    });

    // Ensure team document exists
    const teamDocRef = db.collection('teams').doc(teamId);
    const teamSnap   = await teamDocRef.get();
    if (!teamSnap.exists) {
      await teamDocRef.set({
        name: teamId,
        createdAt: firebase.firestore.FieldValue.serverTimestamp()
      });
    }

    // Fetch the data docs this client is allowed to hold. Stage C narrows
    // this to the scope; Firestore rejects a collection query outright if
    // ANY document in it could be denied, so the query has to narrow
    // BEFORE the rules do — never the other way round.
    const snap = await _dataQuery(teamDocRef).get();

    var legacy = [];
    snap.forEach(function (d) {
      var parts = Shard.parseDocId(d.id);
      if (!parts) {
        // Pre-Phase-5 whole-club document. Stage E wipes these; loading
        // one would double every row it holds, so it is skipped loudly.
        if (SYNCED_KEYS.has(d.id)) legacy.push(d.id);
        return;
      }
      if (!SYNCED_KEYS.has(parts.key)) return;
      _absorbDoc(parts.key, parts.cat, d.data(), false);
    });
    if (legacy.length) {
      console.warn('[DB] ignoring un-sharded legacy data docs:', legacy.join(', '));
    }

    // Firestore is the source of truth — rebuild every key that has shards.
    // A club with none simply starts empty; localStorage was flushed above.
    SYNCED_KEYS.forEach(function (key) {
      if (_shards[key]) _rebuild(key);
    });

    // ── Reconcile users/ collection → fa_users blob ──────────────
    // Query MUST be team-scoped: security rules reject unscoped user list reads.
    try {
      var allSnap = await db.collection('users').where('teamId', '==', teamId).get();
      var allUserDocs = allSnap.docs;
      if (allUserDocs.length) {
        var faUsers = JSON.parse(_origGetItem('fa_users') || '[]');
        var existingIds = {};
        faUsers.forEach(function (u) { existingIds[String(u.id)] = true; });
        var added = 0;
        allUserDocs.forEach(function (d) {
          var uid = d.id;
          if (existingIds[uid]) return;
          var data = d.data();
          // The users/ query is team-scoped, not category-scoped, so it can
          // return members of shards this client never downloaded. Adding
          // one would route the blob to a shard we cannot write, and the
          // whole reconcile would be refused. No-op until Stage C.
          if (!_inScope(data.category || Shard.NONE)) return;
          data.id = uid;
          faUsers.push(data);
          existingIds[uid] = true;
          added++;
        });
        if (added) {
          var merged = JSON.stringify(faUsers);
          _origSetItem('fa_users', merged);
          _routeWrite('fa_users', merged).catch(function () { /* surfaced via db-write-error */ });
        }
      }
    } catch (e) {
      console.warn('User reconciliation failed:', e);
    }

    // Record-collection listeners: the ONLY source for player-submitted
    // data since Phase 3b (legacy data/ docs are frozen and never loaded).
    // Each snapshot rebuilds the corresponding localStorage blob so all
    // existing read paths keep working unchanged. init() waits for the
    // first snapshot of each collection (cache or server) so the first
    // render already sees availability/RPE.
    var _recordSeen = {};
    var firstSnaps = [];
    Object.keys(RECORD_COLLECTIONS).forEach(function (coll) {
      var cfg = RECORD_COLLECTIONS[coll];
      var resolveFirst;
      firstSnaps.push(new Promise(function (res) { resolveFirst = res; }));
      var unsub = db.collection('teams').doc(_teamId).collection(coll)
        .onSnapshot(function (snap) {
          resolveFirst();
          if (snap.metadata.hasPendingWrites) return;
          if (!snap.empty) _recordSeen[coll] = true;
          // Guard the very first load ONLY: an empty collection we have
          // never seen populated, with a populated blob, means data hasn't
          // arrived yet — don't wipe the cache. Once we've seen records, an
          // empty snapshot is a real "all deleted" and MUST clear the blob
          // (e.g. a coach's device when the last availability answer is
          // withdrawn on another device).
          var existing = _origGetItem(cfg.lsKey);
          if (snap.empty && !_recordSeen[coll] && existing && existing !== '{}') return;
          var obj = {};
          snap.forEach(function (doc) { obj[doc.id] = cfg.toEntry(doc.data()); });
          var val = JSON.stringify(obj);
          if (existing !== val) {
            _origSetItem(cfg.lsKey, val);
            window.dispatchEvent(new CustomEvent('firestore-sync', { detail: { key: cfg.lsKey } }));
          }
        }, function (err) {
          console.error('[DB] record listener failed for', coll, err);
          resolveFirst();
        });
      _unsubscribers.push(unsub);
    });
    await Promise.all(firstSnaps);

    // ONE listener on the whole data/ collection for remote changes.
    // docChanges() delivers only what actually changed — but a shard is
    // not a blob, so each change updates the shadow cache and the merged
    // blob is rebuilt from every shard of that key. Several shards of one
    // key can change in a single snapshot, so the re-render event is
    // dispatched once per key, not once per document.
    var dataUnsub = _dataQuery(db.collection('teams').doc(_teamId))
      .onSnapshot(function (snap) {
        var touched = {};
        snap.docChanges().forEach(function (change) {
          var doc = change.doc;
          var parts = Shard.parseDocId(doc.id);
          if (!parts || !SYNCED_KEYS.has(parts.key)) return;
          // NOT skipped on hasPendingWrites, deliberately. A document with
          // one of our writes pending can also carry another coach's merged
          // fields, and skipping it loses them for the session: once our
          // write acks, the value already matches what we predicted, so the
          // ack is a metadata-only change and this listener never fires
          // again. Absorbing instead is safe — our own echo is identical to
          // what the shadow cache already holds, so it diffs to nothing and
          // triggers no re-render, and a rejected write reverts the document
          // and comes back through here as a real change.
          // 'removed' also fires when a document leaves the query scope
          // (Stage C narrows it by category) — dropping the shard is
          // right in both cases.
          if (_absorbDoc(parts.key, parts.cat, doc.data(), change.type === 'removed')) {
            touched[parts.key] = true;
          }
        });
        Object.keys(touched).forEach(function (key) {
          if (_rebuild(key)) {
            window.dispatchEvent(new CustomEvent('firestore-sync', { detail: { key: key } }));
          }
        });
      });
    _unsubscribers.push(dataUnsub);
  }

  /* There is no _uploadAll any more. It read the synced localStorage keys
     back after init() had just flushed them, so it always uploaded nothing
     — and had it worked, it would have been a bug: those keys hold the
     PREVIOUS club's data, which is exactly why the flush is there. A club
     with no data documents simply starts empty. */

  /** Unsubscribe all listeners and reset state. */
  function cleanup() {
    _unsubscribers.forEach(function (fn) { fn(); });
    _unsubscribers = [];
    _teamId = null;
    _shards = {};
    _badShards = {};
    _scope = null;
  }

  // ── localStorage monkey-patch ────────────────────────────────
  // Intercept writes so every synced key is transparently mirrored
  // to Firestore. Reads stay instant from localStorage.

  localStorage.setItem = function (key, value) {
    _origSetItem(key, value);
    if (_teamId && SYNCED_KEYS.has(key)) {
      _routeWrite(key, value).catch(function () { /* surfaced via db-write-error */ });
    }
  };

  localStorage.removeItem = function (key) {
    _origRemoveItem(key);
    if (!_teamId || !SYNCED_KEYS.has(key)) return;
    // Delete only shards we know exist and may see. Deleting a document
    // that isn't there is rejected by any rule that reads resource.data,
    // and deleting one we can't see is the safety rule again. One batch,
    // and the shadow cache is only cleared once the server has agreed —
    // clearing it first would leave the cache claiming a shard is gone
    // while the server still holds it, and the "don't create empty docs"
    // guard would then never rewrite it.
    var doomed = Object.keys(_shards[key] || {}).filter(_inScope);
    if (!doomed.length) return;
    var batch = db.batch();
    doomed.forEach(function (cat) { batch.delete(shardRef(key, cat)); });
    batch.commit().then(function () {
      doomed.forEach(function (cat) {
        if (_shards[key]) delete _shards[key][cat];
      });
    }).catch(function (err) { _onWriteError(key, err); });
  };

  // ── Per-record canonical writes (Phase 2) ───────────────────
  function _recRef(coll, docId) {
    return db.collection('teams').doc(_teamId).collection(coll).doc(docId);
  }

  /**
   * Canonical write of a player-submitted record (teams/{id}/{coll}/{docId}).
   * Resolves on SERVER ack. The caller also updates the localStorage blob
   * (local-only read cache) so its own reads stay instant.
   */
  function submit(coll, docId, data) {
    if (!_teamId) return Promise.reject(new Error('DB not initialised'));
    var payload = Object.assign({}, data, {
      updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
      source: 'client'
    });
    return _recRef(coll, docId).set(payload, { merge: true }).catch(function (err) {
      _onWriteError(coll + '/' + docId, err);
      throw err;
    });
  }

  /** Delete a player-submitted record (un-answer flows). */
  function removeRecord(coll, docId) {
    if (!_teamId) return Promise.resolve();
    return _recRef(coll, docId).delete().catch(function (err) {
      _onWriteError(coll + '/' + docId, err);
      throw err;
    });
  }

  /**
   * Like localStorage.setItem but returns a Promise that resolves when the
   * Firestore mirror write is acknowledged by the SERVER (Firestore promises
   * do not resolve from the local cache), or rejects on failure. With
   * sharding one blob can fan out to several documents; the promise waits
   * for all of them.
   * localStorage is still updated synchronously first, so reads stay instant.
   */
  function setItemAcked(key, value) {
    _origSetItem(key, value);
    if (!_teamId || !SYNCED_KEYS.has(key)) return Promise.resolve();
    return _routeWrite(key, value);
  }

  /**
   * Drop all synced localStorage keys — the "signed in, but no club" path.
   * Detaches from Firestore first: leaving the listeners running would let
   * a single remote docChange repopulate the shadow cache with ONE shard
   * and rebuild a merged blob containing only it, so the app would render a
   * fraction of a club it is not even a member of.
   */
  function flush() {
    cleanup();
    SYNCED_KEYS.forEach(function (key) { _origRemoveItem(key); });
    RECORD_LS_KEYS.forEach(function (key) { _origRemoveItem(key); });
  }

  return {
    init: init, cleanup: cleanup, flush: flush, SYNCED_KEYS: SYNCED_KEYS,
    setScope: setScope, setItemAcked: setItemAcked,
    submit: submit, removeRecord: removeRecord,
    /* Exported for the archived-season viewer, which reads the SAME
       collections out of seasons/{label}/ and has to rebuild the same
       blobs. Sharing the mapping is the point: a second copy is how the
       archived view and the live view start disagreeing about what an
       attendance answer looks like. */
    RECORD_COLLECTIONS: RECORD_COLLECTIONS
  };
})();
