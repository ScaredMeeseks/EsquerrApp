/* =========================================================
   EsquerrApp — coach match notes (MN)

   The staff's own working document for one match: the plan before
   it, the debrief after it, video LINKS, references to tactical
   boards, and the anada/tornada link.

       teams/{teamId}/matchNotes/{matchId}
         { matchId, category, team,
           pre:  { text, updatedAt, updatedBy },   // the plan
           live: { text, updatedAt, updatedBy },   // during the match
           post: { text, updatedAt, updatedBy },   // the debrief
           videos: [ { id, title, url, comment, phase } ],
           boards: [ { boardId, name, tag } ],
           firstLegId, legDismissed }

   `live` arrived with the v213 match-detail redesign, whose notes
   block is three phases — PLA, DURANT EL PARTIT, DESPRÉS — where
   this file had two. Nothing needs backfilling: a document written
   before it simply has no `live` key, and every reader here already
   treats a missing phase as an empty one.

   PHASE is a closed set of three and `phaseKey()` below is the ONE
   place that says so. It used to be written inline as
   `phase === 'post' ? 'post' : 'pre'`, in two functions, which is a
   spelling of "anything I do not recognise is the plan" — and with
   a third phase that silently files the debrief under the plan.

   ── Why this is not another synced localStorage key ──

   Everything else about a match — fa_matches, fa_match_events,
   fa_convocatoria_sent, fa_tactic_match_boards — lives in
   teams/{id}/data/{key}__{cat} and rides the js/db.js sync layer.
   That layer is deliberately NOT used here. The read rule on
   data/{key} is scoped by CATEGORY, not by role — it has to be,
   since a player reads his own squad's fixtures out of it — so a
   `fa_match_notes` shard would be downloaded onto the phone of
   every player in the category. Staff-only means its own
   collection with its own rule.

   The cost of that choice is that this file exists at all: no
   localStorage mirror, no offline-first blob, no shard routing.
   In exchange it touches neither js/db.js nor js/shard.js, and the
   ~128 blob read sites in app.js are unaware of it. Firestore's own
   offline persistence (enabled in js/firebase-config.js) covers
   reading on a cold pitch-side connection, and writes queue.

   ── The rule this file must not fight ──

   A PLAYER'S CLIENT MUST NEVER OPEN THE LISTENER. The query would
   be rejected outright — a collection query fails if any document
   it could return might be denied — and the console error would be
   the only symptom. init() therefore checks the STAFF ROLE ITSELF,
   off the same custom claims firestore.rules reads, rather than
   trusting a caller to remember. db.js calls it for every session.

   Loaded after db.js and before app.js. Exported for the Node
   tests, which drive the real code over a fake `db`/`auth` — both
   are read at call time, never at load time, precisely so they can
   be stubbed.
   ========================================================= */
(function (root, factory) {
  var api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.MN = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var COL = 'matchNotes';

  var _teamId = null;
  var _uid = null;
  var _notes = {};        // matchId (string) -> doc
  var _unsub = null;
  var _ready = false;

  /* ── Pure helpers (browser and Node) ───────────────────────── */

  /** Match ids are NUMBERS in fa_matches; a Firestore doc id is not. */
  function keyOf(matchId) { return String(matchId); }

  function newVideoId() {
    return 'mv_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6);
  }

  /** The three phases, in the order the match happens in. */
  var PHASES = ['pre', 'live', 'post'];

  /**
   * One phase name, normalised — 'pre' for anything unrecognised.
   *
   * The default is the PLAN and not the debrief on purpose: a note filed
   * against a phase this version does not know about is far more likely to
   * be preparation than a verdict, and the plan is the phase a coach
   * re-reads before writing anything else.
   */
  function phaseKey(p) {
    return PHASES.indexOf(String(p)) === -1 ? 'pre' : String(p);
  }

  /**
   * The shape a fresh note starts from.
   *
   * `category` is duplicated onto every doc on purpose — it is what
   * firestore.rules tests, so the rule never needs a get() of fa_matches,
   * the same self-contained discipline the board rules use. A note written
   * without it is unreadable by everyone including its author, which is the
   * safe direction but a loud one, so save() refuses instead.
   */
  function blank(match) {
    return {
      matchId: keyOf(match && match.id),
      category: (match && match.category) || '',
      team: (match && match.team) || '',
      pre: {text: '', updatedAt: null, updatedBy: ''},
      live: {text: '', updatedAt: null, updatedBy: ''},
      post: {text: '', updatedAt: null, updatedBy: ''},
      videos: [],
      boards: [],
      firstLegId: null,
      legDismissed: false
    };
  }

  /**
   * Has this note anything worth keeping?
   *
   * Used to decide whether a doc is worth writing at all. The leg banner
   * asks about every fixture on the Calendari, and answering "no" to a
   * suggestion is itself worth storing — so legDismissed counts.
   */
  function isEmpty(n) {
    if (!n) return true;
    // Over PHASES, not over a hand-written pair: a phase added to that list
    // and forgotten here makes a note with content look empty, and isEmpty
    // is what decides whether the document is worth writing at all.
    var hasText = PHASES.some(function (p) { return !!(n[p] && n[p].text); });
    return !hasText
      && !(n.videos && n.videos.length) && !(n.boards && n.boards.length)
      && !n.firstLegId && !n.legDismissed;
  }

  /* ── Runtime (browser only) ────────────────────────────────── */

  function _announce(matchId) {
    if (typeof window === 'undefined' || !window.dispatchEvent) return;
    window.dispatchEvent(new CustomEvent('match-notes-sync', {
      detail: {matchId: matchId || null}
    }));
  }

  function _col() {
    return db.collection('teams').doc(_teamId).collection(COL);
  }

  /**
   * Open the registry for a club. Safe to call repeatedly; a different
   * team resets everything.
   *
   * STAFF ONLY, and it decides that for ITSELF, from the same custom claims
   * firestore.rules reads. Passing the role and the categories in from
   * app.js would work today and drift tomorrow: the query has to satisfy
   * the rule exactly, so it takes its answer from the same place the rule
   * does. A player's session simply returns having opened nothing.
   *
   * The query narrows on `category in cats` for the same reason the db.js
   * data listener does: Firestore refuses a collection query outright if ANY
   * document it could return might be denied, so the query must state the
   * restriction the rule enforces. Filtering after the fact is not an option
   * — there would be nothing to filter.
   */
  async function init(teamId) {
    if (_teamId === teamId && _ready) return;
    if (_unsub) { try { _unsub(); } catch (e) { /* already gone */ } _unsub = null; }
    _teamId = teamId || null;
    _notes = {};
    _ready = false;
    if (!_teamId) return;

    var claims;
    try {
      if (!auth.currentUser) { _ready = true; return; }
      // Cached — no network round trip unless the token has expired.
      claims = (await auth.currentUser.getIdTokenResult()).claims || {};
    } catch (e) {
      console.warn('[MN] claims unavailable:', e && e.message);
      _ready = true;
      return;
    }
    _uid = auth.currentUser.uid;

    // Not staff: open no listener at all. The rule would refuse the query
    // and the console error would be the only symptom.
    if (claims.role !== 'staff' && claims.role !== 'lead') { _ready = true; return; }

    var scope = (claims.cats || []).slice(0, 10);   // Firestore `in` caps at 10
    if (!scope.length) { _ready = true; return; }

    await new Promise(function (resolve) {
      var settled = false;
      _unsub = _col().where('category', 'in', scope)
        .onSnapshot(function (snap) {
          snap.docChanges().forEach(function (c) {
            if (c.type === 'removed') delete _notes[c.doc.id];
            else _notes[c.doc.id] = Object.assign({}, c.doc.data());
          });
          _ready = true;
          if (!settled) { settled = true; resolve(); }
          else _announce();
        }, function (err) {
          /* Never fatal: the match pages must render without their notes.
             A player's client reaching here at all is the bug this logs. */
          console.warn('[MN] listener failed:', err && err.message);
          _ready = true;
          if (!settled) { settled = true; resolve(); }
        });
    });
  }

  function cleanup() {
    if (_unsub) { try { _unsub(); } catch (e) { /* already gone */ } }
    _unsub = null;
    _teamId = null;
    _uid = null;
    _notes = {};
    _ready = false;
  }

  function ready() { return _ready; }

  /** The stored note for a match, or null. Never a blank — callers that
   *  want to render an empty editor ask for blank(match) themselves, and
   *  conflating the two would write a doc for every match ever opened. */
  function get(matchId) { return _notes[keyOf(matchId)] || null; }

  /** get(), or a blank shaped for this match. For the editor. */
  function getOrBlank(match) {
    return get(match && match.id) || blank(match);
  }

  /**
   * Merge a patch into one match's note, creating the doc if needed.
   *
   * `merge: true` on a doc that does not exist creates it, so one path
   * covers both — but the CREATE arm of the rule tests
   * request.resource.data.category, which a bare patch does not carry.
   * Every write therefore re-sends matchId/category/team from `match`.
   *
   * ⚠ set({merge:true}) DEEP-merges a map field. Sending `videos` or
   * `boards` replaces them (arrays are replaced wholesale, unlike maps),
   * but `pre` and `post` are maps: patching {pre:{text}} leaves an old
   * updatedBy in place. Both are always written whole below for that
   * reason — the same trap that bit staffRoles in v115.
   */
  function save(match, patch) {
    if (!_teamId) return Promise.reject(new Error('MN not initialised'));
    if (!match || match.id === undefined || match.id === null) {
      return Promise.reject(new Error('MN.save: no match'));
    }
    if (!match.category) {
      // Unreadable by everyone including its author — refuse loudly rather
      // than write a document nothing can ever open again.
      return Promise.reject(new Error('MN.save: match has no category'));
    }
    var id = keyOf(match.id);
    var doc = Object.assign({
      matchId: id,
      category: match.category,
      team: match.team || ''
    }, patch || {});

    /* Applied to the cache BEFORE the write, not in its .then().
       A blur fires before the click that follows it, so "type a note, then
       press + Add video" saves the text and re-renders in that order — and
       with offline persistence on, set() resolves only on SERVER ack. Wait
       for that and the re-render reads the old value back out of the cache
       and the coach watches his sentence disappear, saved but invisible.
       Rolled back below if the write is actually refused. */
    var prev = _notes[id];
    _notes[id] = Object.assign({}, blank(match), prev || {}, doc);
    var next = _notes[id];

    return _col().doc(id).set(doc, {merge: true}).then(function () {
      return next;
    }, function (err) {
      // Only if nothing has overwritten it since — a later edit that DID
      // land must not be undone by an earlier failure.
      if (_notes[id] === next) {
        if (prev) _notes[id] = prev; else delete _notes[id];
        _announce(id);
      }
      throw err;
    });
  }

  /** Write one phase's text whole — see the deep-merge note on save(). */
  function saveText(match, phase, text) {
    var p = {};
    p[phaseKey(phase)] = {
      text: String(text || ''),
      updatedAt: new Date().toISOString(),
      updatedBy: _uid || ''
    };
    return save(match, p);
  }

  /** Replace the whole video list. Arrays are replaced by merge, so this
   *  is also how a video is removed. */
  function saveVideos(match, videos) {
    return save(match, {videos: (videos || []).map(function (v) {
      return {
        id: v.id || newVideoId(),
        title: String(v.title || ''),
        url: String(v.url || ''),
        comment: String(v.comment || ''),
        phase: phaseKey(v.phase)
      };
    })});
  }

  /** Replace the whole board-reference list. Refs are tbSessionRef()'s
   *  shape, so the existing read-only renderer takes them unchanged. */
  function saveBoards(match, boards) {
    return save(match, {boards: (boards || []).map(function (b) {
      return {
        boardId: b.boardId || b.id || '',
        name: String(b.name || ''),
        tag: String(b.tag || '')
      };
    })});
  }

  /* ── The anada/tornada answer ──────────────────────────────── */

  /** The coach accepted the suggestion. */
  function linkFirstLeg(match, firstLegId) {
    return save(match, {
      firstLegId: keyOf(firstLegId),
      legDismissed: false
    });
  }

  /** The coach rejected it. Stored so the banner stops asking — an
   *  unanswered suggestion and a declined one look identical otherwise,
   *  and the banner would return on every render for ever. */
  function dismissLeg(match) {
    return save(match, {firstLegId: null, legDismissed: true});
  }

  function firstLegId(matchId) {
    var n = get(matchId);
    return (n && n.firstLegId) ? n.firstLegId : null;
  }

  /** Has the coach already answered the leg question for this match? */
  function legAnswered(matchId) {
    var n = get(matchId);
    return !!(n && (n.firstLegId || n.legDismissed));
  }

  return {
    // pure
    keyOf: keyOf, blank: blank, isEmpty: isEmpty, newVideoId: newVideoId,
    PHASES: PHASES, phaseKey: phaseKey,
    // runtime
    init: init, cleanup: cleanup, ready: ready,
    get: get, getOrBlank: getOrBlank, save: save,
    saveText: saveText, saveVideos: saveVideos, saveBoards: saveBoards,
    linkFirstLeg: linkFirstLeg, dismissLeg: dismissLeg,
    firstLegId: firstLegId, legAnswered: legAnswered
  };
});
