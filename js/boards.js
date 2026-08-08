/* =========================================================
   EsquerrApp — tactical board entry construction

   Pure logic: no Firestore, no DOM, no browser globals. The
   editor in app.js owns the drawing surface and the localStorage
   scratch keys; this file owns the one question "what does a
   saved board look like".

   It existed as FOUR hand-maintained copies of the same object
   literal — Save, Save As, Add to Training and Add to Match —
   differing only in whether they carried an `id` and a
   `category`. Four copies of twenty fields is a drift waiting to
   happen: a field added to the editor reaches whichever of the
   four the author happened to be looking at, and a board linked
   to a match silently loses it.

   `store` is injected rather than read from `localStorage`
   directly so the Node tests can build an entry with no browser.

   Loaded after db.js in the browser; exported for the tests.
   ========================================================= */
(function (root, factory) {
  var api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.TB = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  /**
   * Build one saved-board entry from the editor's scratch state.
   *
   * `opts.id` and `opts.category` are OMITTED when not supplied,
   * rather than set to undefined — the four call sites genuinely
   * carry different shapes and the difference is meaningful:
   *
   *   Save / Save As      id + category   the library is an array
   *                                       routed on its own stamp
   *   Add to Training     category        the bucket is keyed by
   *                                       DATE, which two categories
   *                                       can share, so the entry has
   *                                       to say whose it is
   *   Add to Match        neither         routed by joining the map
   *                                       key (a matchId) through
   *                                       fa_matches — see shard.js
   *
   * Key insertion order matches the literals this replaced. That is
   * not cosmetic: db.js diffs shards as SERIALISED STRINGS
   * (`prevJson === nextJson`), so reordering keys would mark every
   * board shard in every club as changed and rewrite them all once
   * for no reason.
   */
  function buildBoardEntry(store, opts) {
    opts = opts || {};
    var e = {};
    if (opts.id !== undefined) e.id = opts.id;
    if (opts.category !== undefined) e.category = opts.category;
    e.name = opts.name;
    e.formation = store.getItem('fa_tactic_formation') || '';
    e.positions = JSON.parse(store.getItem('fa_tactic_positions') || 'null');
    e.numbers = JSON.parse(store.getItem('fa_tactic_numbers') || 'null');
    e.boardType = store.getItem('fa_tactic_board_type') || 'full';
    e.teamColor = store.getItem('fa_tactic_team_color') || '#ffffff';
    e.oppColor = store.getItem('fa_tactic_opp_color') || '#e53935';
    e.showOpp = store.getItem('fa_tactic_show_opp') === 'true';
    e.oppPositions = JSON.parse(store.getItem('fa_tactic_opp_positions') || 'null');
    e.oppNumbers = JSON.parse(store.getItem('fa_tactic_opp_numbers') || 'null');
    e.balls = JSON.parse(store.getItem('fa_tactic_balls') || '[]');
    e.colors = JSON.parse(store.getItem('fa_tactic_colors') || 'null');
    e.arrows = JSON.parse(store.getItem('fa_tactic_arrows') || '[]');
    e.rects = JSON.parse(store.getItem('fa_tactic_rects') || '[]');
    e.texts = JSON.parse(store.getItem('fa_tactic_texts') || '[]');
    e.penLines = JSON.parse(store.getItem('fa_tactic_pen_lines') || '[]');
    e.frames = JSON.parse(store.getItem('fa_tactic_frames') || '[]');
    e.tag = store.getItem('fa_tactic_tag') || '';
    e.silhouette = store.getItem('fa_tactic_silhouette') || '';
    e.cones = JSON.parse(store.getItem('fa_tactic_cones') || '[]');
    return e;
  }

  /** Mint a board id. Kept here so `ensureBoardIds` and the save
   *  paths cannot drift into two different formats. */
  function newBoardId() {
    return 'tb_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
  }

  /* ═══════════════════════════════════════════════════════════
     Runtime: the board registry.

     Everything below talks to Firestore and is therefore browser-only.
     The Node tests require this file for buildBoardEntry alone, and
     never call in here, so the `db` global being absent is harmless —
     it is referenced inside function bodies, not at load time.

     The model, and why it is shaped like this:

       tacticBoards/{id}      metadata — small, LISTED
       tacticBoardData/{id}   payload  — the board, as a JSON string

     Splitting them is what stops a library render downloading
     megabytes. A board averages ~12 KB and can reach hundreds; a club
     with 180 of them was ~2.2 MB of the ~8 MB this replaces on every
     cold login.

     Two queries, never one:
       clubId  == my club   the club library (requirement c)
       ownerUid == me       my own boards, wherever I am now

     They cannot be merged into a single query, and must not be: a
     collection query is rejected outright if ANY document it returns
     could be denied, so each has to narrow on the field its rule arm
     tests. The same constraint db.js:213 documents for data shards.
     ═══════════════════════════════════════════════════════════ */

  var COL_META = 'tacticBoards';
  var COL_DATA = 'tacticBoardData';

  var _clubId = null;
  var _uid = null;
  var _meta = {};        // boardId -> metadata (both queries merged)
  var _authors = {};     // uid -> boardAuthors label
  var _payloads = {};    // boardId -> { parsed, bytes }
  var _payloadBytes = 0;
  var _pending = {};     // boardId -> in-flight promise
  var _unsub = null;
  var _ready = false;

  /* ~4 MB of parsed boards. Well under what a phone will tolerate, and
     enough that a coach flicking through a session's boards never
     re-reads one. Evicted oldest-first, which is good enough: the
     access pattern is "the boards on the page I am looking at". */
  var CACHE_MAX_BYTES = 4e6;

  function _evictIfNeeded() {
    if (_payloadBytes <= CACHE_MAX_BYTES) return;
    var ids = Object.keys(_payloads);
    for (var i = 0; i < ids.length && _payloadBytes > CACHE_MAX_BYTES; i++) {
      _payloadBytes -= _payloads[ids[i]].bytes || 0;
      delete _payloads[ids[i]];
    }
  }

  function _cachePayload(id, parsed, bytes) {
    if (_payloads[id]) _payloadBytes -= _payloads[id].bytes || 0;
    _payloads[id] = {parsed: parsed, bytes: bytes || 0};
    _payloadBytes += bytes || 0;
    _evictIfNeeded();
  }

  function _announce() {
    if (typeof window === 'undefined' || !window.dispatchEvent) return;
    window.dispatchEvent(new CustomEvent('tactic-boards-sync'));
  }

  /**
   * Adopt one metadata document into the local index.
   * Deletions arrive through the club listener as `removed`.
   */
  function _absorbMeta(id, data, removed) {
    if (removed) {
      // Only drop it if it is not also mine — the two queries overlap on
      // every board I made in my own club, and leaving the club query
      // means leaving the club, not losing my own board.
      if (_meta[id] && _meta[id].ownerUid === _uid && _meta[id].clubId !== _clubId) return;
      delete _meta[id];
      if (_payloads[id]) {
        _payloadBytes -= _payloads[id].bytes || 0;
        delete _payloads[id];
      }
      return;
    }
    var prev = _meta[id];
    _meta[id] = Object.assign({}, data, {id: id});
    // A board edited elsewhere must not keep serving its old drawing.
    if (prev && String(prev.updatedAt && prev.updatedAt.seconds) !==
        String(data.updatedAt && data.updatedAt.seconds)) {
      if (_payloads[id]) {
        _payloadBytes -= _payloads[id].bytes || 0;
        delete _payloads[id];
      }
    }
  }

  /**
   * Load the registry for a club + user. Safe to call repeatedly; a
   * second call for the same pair is ignored, and a different pair
   * resets everything (switching club must not leak a library).
   */
  async function init(clubId, uid) {
    if (_clubId === clubId && _uid === uid && _ready) return;
    if (_unsub) { try { _unsub(); } catch (e) { /* already gone */ } _unsub = null; }
    _clubId = clubId || null;
    _uid = uid || null;
    _meta = {};
    _authors = {};
    _payloads = {};
    _payloadBytes = 0;
    _pending = {};
    _ready = false;
    if (!_clubId) return;

    try {
      // Author labels: one small collection, read once. M is the coaches
      // who have ever been on a staff list here, realistically under 30.
      var authorSnap = await db.collection('clubs').doc(_clubId)
        .collection('boardAuthors').get();
      authorSnap.forEach(function (d) { _authors[d.id] = d.data(); });
    } catch (e) {
      // A club with none simply shows no author. Never fatal.
      console.warn('[TB] boardAuthors unavailable:', e && e.message);
    }

    try {
      // My own boards from OTHER clubs. A one-shot read: they change only
      // when I change them, and a listener per club I have ever been in
      // is not worth it.
      if (_uid) {
        var mineSnap = await db.collection(COL_META)
          .where('ownerUid', '==', _uid).get();
        mineSnap.forEach(function (d) { _absorbMeta(d.id, d.data(), false); });
      }
    } catch (e) {
      console.warn('[TB] own-boards query failed:', e && e.message);
    }

    // The club library, live: a board drawn by a colleague should appear
    // without a reload, and this is metadata only, so it stays cheap.
    await new Promise(function (resolve) {
      var settled = false;
      _unsub = db.collection(COL_META).where('clubId', '==', _clubId)
        .onSnapshot(function (snap) {
          snap.docChanges().forEach(function (c) {
            _absorbMeta(c.doc.id, c.doc.data(), c.type === 'removed');
          });
          _ready = true;
          if (!settled) { settled = true; resolve(); }
          else _announce();
        }, function (err) {
          console.warn('[TB] library listener failed:', err && err.message);
          _ready = true;
          if (!settled) { settled = true; resolve(); }
        });
    });
  }

  function ready() { return _ready; }

  /** Boards belonging to the current club, newest first. */
  function library() {
    return Object.keys(_meta)
      .map(function (k) { return _meta[k]; })
      .filter(function (b) { return b.clubId === _clubId; })
      .sort(function (a, b) {
        var av = (a.updatedAt && a.updatedAt.seconds) || 0;
        var bv = (b.updatedAt && b.updatedAt.seconds) || 0;
        if (av !== bv) return bv - av;
        return String(a.name || '').localeCompare(String(b.name || ''));
      });
  }

  /** My boards that belong to a DIFFERENT club — the b.2 case. */
  function mine() {
    return Object.keys(_meta)
      .map(function (k) { return _meta[k]; })
      .filter(function (b) { return b.ownerUid === _uid && b.clubId !== _clubId; })
      .sort(function (a, b) {
        return String(a.name || '').localeCompare(String(b.name || ''));
      });
  }

  function meta(id) { return _meta[id] || null; }

  /**
   * The label a club shows for an author.
   *
   * Falls back to the name frozen on the board itself, which is never
   * updated and exists for exactly this: a missing trigger, a
   * pre-migration board, or a deleted member.
   */
  function author(board) {
    if (!board) return null;
    var a = board.ownerUid ? _authors[board.ownerUid] : null;
    if (a) {
      return {
        name: a.name || board.ownerName || '',
        category: a.category || '',
        letters: Array.isArray(a.letters) ? a.letters : [],
        active: a.active !== false
      };
    }
    return {name: board.ownerName || '', category: '', letters: [], active: true};
  }

  /** Cached parsed payload, or null. Never touches the network. */
  function peek(id) {
    var p = _payloads[id];
    return p ? p.parsed : null;
  }

  /** Fetch one payload, memoised so a re-render does not re-read it. */
  function get(id) {
    if (_payloads[id]) return Promise.resolve(_payloads[id].parsed);
    if (_pending[id]) return _pending[id];
    _pending[id] = db.collection(COL_DATA).doc(id).get().then(function (d) {
      delete _pending[id];
      if (!d.exists) return null;
      var v = (d.data() || {}).v;
      if (typeof v !== 'string') return null;
      var parsed;
      try { parsed = JSON.parse(v); } catch (e) { return null; }
      _cachePayload(id, parsed, v.length);
      return parsed;
    }).catch(function (e) {
      delete _pending[id];
      console.warn('[TB] payload read failed', id, e && e.message);
      return null;
    });
    return _pending[id];
  }

  /** Fetch several at once — one query per 10, the `in` limit. */
  function warm(ids) {
    var want = (ids || []).filter(function (id) {
      return id && !_payloads[id] && !_pending[id];
    });
    if (!want.length) return Promise.resolve();
    var chunks = [];
    for (var i = 0; i < want.length; i += 10) chunks.push(want.slice(i, i + 10));
    return Promise.all(chunks.map(function (chunk) {
      return db.collection(COL_DATA)
        .where(firebase.firestore.FieldPath.documentId(), 'in', chunk)
        .get().then(function (snap) {
          snap.forEach(function (d) {
            var v = (d.data() || {}).v;
            if (typeof v !== 'string') return;
            try { _cachePayload(d.id, JSON.parse(v), v.length); } catch (e) { /* skip */ }
          });
        }).catch(function (e) {
          console.warn('[TB] warm failed:', e && e.message);
        });
    })).then(function () {});
  }

  /**
   * Write one board as its metadata + payload pair.
   *
   * ONE BATCH, and that is the correctness requirement rather than an
   * optimisation — the same argument db.js:404 makes for shards. Split
   * them and the library can list a row whose drawing is unreadable,
   * and no rule can detect the mismatch without a cross-document read.
   *
   * @param {Object} entry a buildBoardEntry() result
   * @param {Object} opts {ownerName}
   * @return {Promise<Object>} the metadata that was written
   */
  function save(entry, opts) {
    if (!_clubId || !_uid) return Promise.reject(new Error('TB not initialised'));
    var id = entry.id || newBoardId();
    var existing = _meta[id];
    // Never silently re-home or re-own a board on save.
    var clubId = existing ? existing.clubId : _clubId;
    var ownerUid = existing ? existing.ownerUid : _uid;
    if (existing && existing.ownerUid === '' ) ownerUid = '';

    var payload = Object.assign({}, entry);
    delete payload.id;
    // linkedTeams is per-SESSION data and carries player ids and names.
    // The board read rule is club-wide with no category gate, so this is
    // the field whose escape would be a real privacy regression.
    delete payload.linkedTeams;
    var v = JSON.stringify(payload);
    var frames = Array.isArray(entry.frames) ? entry.frames : [];

    var metaDoc = {
      ownerUid: ownerUid,
      ownerName: existing ? (existing.ownerName || '') : ((opts && opts.ownerName) || ''),
      clubId: clubId,
      category: entry.category || '',
      name: String(entry.name || 'Board'),
      tag: String(entry.tag || ''),
      formation: String(entry.formation || ''),
      boardType: String(entry.boardType || 'full'),
      hasFrames: frames.length > 1,
      frameCount: frames.length,
      bytes: v.length,
      updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
      schema: 1
    };
    if (!existing) {
      metaDoc.createdAt = firebase.firestore.FieldValue.serverTimestamp();
    }

    var batch = db.batch();
    batch.set(db.collection(COL_META).doc(id), metaDoc, {merge: true});
    batch.set(db.collection(COL_DATA).doc(id),
      {ownerUid: ownerUid, clubId: clubId, v: v, schema: 1});
    return batch.commit().then(function () {
      _meta[id] = Object.assign({}, metaDoc, {id: id});
      _cachePayload(id, JSON.parse(v), v.length);
      return _meta[id];
    });
  }

  /** Delete both documents. One batch, for the same reason as save(). */
  function remove(id) {
    var batch = db.batch();
    batch.delete(db.collection(COL_META).doc(id));
    batch.delete(db.collection(COL_DATA).doc(id));
    return batch.commit().then(function () {
      delete _meta[id];
      if (_payloads[id]) {
        _payloadBytes -= _payloads[id].bytes || 0;
        delete _payloads[id];
      }
    });
  }

  /**
   * Claim an unowned board.
   *
   * Migrated and template-seeded boards land with ownerUid '' because
   * there is no author to invent. Update requires the owner arm, so
   * without this they would be permanently read-only. The rule allows
   * '' -> me and nothing else.
   */
  function adopt(id, ownerName) {
    var b = _meta[id];
    if (!b || b.ownerUid !== '') return Promise.reject(new Error('not adoptable'));
    var patch = {ownerUid: _uid, ownerName: ownerName || ''};
    var batch = db.batch();
    batch.set(db.collection(COL_META).doc(id), patch, {merge: true});
    batch.set(db.collection(COL_DATA).doc(id), {ownerUid: _uid}, {merge: true});
    return batch.commit().then(function () {
      _meta[id] = Object.assign({}, b, patch);
      return _meta[id];
    });
  }

  function canEdit(board) {
    if (!board) return false;
    return board.ownerUid === _uid || board.ownerUid === '';
  }

  function canDelete(board, isLead) {
    if (!board) return false;
    return board.ownerUid === _uid || (!!isLead && board.clubId === _clubId);
  }

  return {
    buildBoardEntry: buildBoardEntry,
    newBoardId: newBoardId,
    // runtime
    init: init,
    ready: ready,
    library: library,
    mine: mine,
    meta: meta,
    author: author,
    peek: peek,
    get: get,
    warm: warm,
    save: save,
    remove: remove,
    adopt: adopt,
    canEdit: canEdit,
    canDelete: canDelete
  };
});
