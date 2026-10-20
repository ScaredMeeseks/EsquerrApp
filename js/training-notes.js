/* =========================================================
   EsquerrApp — private notes on a session's exercises (TN, v291)

   Roadmap 38: the staff's comments on each exercise of a training
   — how it went, what to change — seen by staff and NOBODY else.

       teams/{teamId}/trainingNotes/{sessionId}
         { sessionId, category,
           ex: { [exerciseId]: { [noteId]: { text, uid, name, at, editedAt? } } } }

   The same choice, and for the same reason, as coach match notes
   (js/match-notes.js, which this follows line for line where it can):
   a session's rows live in data/fa_training__{cat}, which every
   PLAYER of the category downloads, so a note kept on the row — or
   in any data/ key — would land on their phones. Staff-only means
   its own collection with its own rule (firestore.rules,
   `match /trainingNotes/{sessionId}`), outside db.js and shard.js.

   ONE document per session, a map per exercise, a map per note.
   Every write is a nested merge, or a delete of one field path, so
   two coaches commenting at once never overwrite each other — there
   is no read-modify-write of a list anywhere in this file.

   Notes belong to an EXERCISE. When it leaves the plan (deleted, or
   the plan replaced by "Carregar entrenament") its notes go with it
   (`dropExercises`); when the session is deleted, the document goes
   (`removeSession`); the season rollover archives the collection
   (functions/index.js archiveSeason) and deleteTeam removes the
   documents of the sessions it deletes.

   A PLAYER'S CLIENT NEVER OPENS THE LISTENER: init() decides from
   the same custom claims the rule reads, as MN does. db.js starts
   and stops it beside MN.
   ========================================================= */
(function (root, factory) {
  var api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.TN = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var COL = 'trainingNotes';
  var MAX = 500;            // as an exercise description (STP_DESC_MAX)

  var _teamId = null;
  var _uid = null;
  var _docs = {};           // sessionId -> doc data
  var _unsub = null;
  var _ready = false;

  /* ── Pure helpers (browser and Node) ───────────────────────── */

  function keyOf(sessionId) { return String(sessionId); }

  function newNoteId() {
    return 'n_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 7);
  }

  /** Trimmed and capped — in the one write path, not only on the textarea. */
  function clean(text) { return String(text || '').trim().slice(0, MAX); }

  /** One exercise's notes, oldest first: the order a conversation reads in. */
  function listOf(doc, exId) {
    var map = (doc && doc.ex && doc.ex[exId]) || {};
    return Object.keys(map).map(function (id) {
      var n = map[id] || {};
      return { id: id, text: String(n.text || ''), uid: String(n.uid || ''),
        name: String(n.name || ''), at: String(n.at || ''), editedAt: n.editedAt ? String(n.editedAt) : '' };
    }).filter(function (n) { return n.text; })
      .sort(function (a, b) { return a.at.localeCompare(b.at) || a.id.localeCompare(b.id); });
  }

  /* ── Runtime (browser only) ────────────────────────────────── */

  function _announce(sessionId) {
    if (typeof window === 'undefined' || !window.dispatchEvent) return;
    window.dispatchEvent(new CustomEvent('training-notes-sync', {
      detail: { sessionId: sessionId || null }
    }));
  }

  function _col() {
    return db.collection('teams').doc(_teamId).collection(COL);
  }

  /** Open the registry for a club. Staff only, decided from the claims —
      see MN.init for why it may not take the answer from a caller. */
  async function init(teamId) {
    if (_teamId === teamId && _ready) return;
    if (_unsub) { try { _unsub(); } catch (e) { /* already gone */ } _unsub = null; }
    _teamId = teamId || null;
    _docs = {};
    _ready = false;
    if (!_teamId) return;

    var claims;
    try {
      if (!auth.currentUser) { _ready = true; return; }
      claims = (await auth.currentUser.getIdTokenResult()).claims || {};
    } catch (e) {
      console.warn('[TN] claims unavailable:', e && e.message);
      _ready = true;
      return;
    }
    _uid = auth.currentUser.uid;
    if (claims.role !== 'staff' && claims.role !== 'lead') { _ready = true; return; }

    var scope = (claims.cats || []).slice(0, 10);   // Firestore `in` caps at 10
    if (!scope.length) { _ready = true; return; }

    await new Promise(function (resolve) {
      var settled = false;
      _unsub = _col().where('category', 'in', scope)
        .onSnapshot(function (snap) {
          var touched = [];
          snap.docChanges().forEach(function (c) {
            if (c.type === 'removed') delete _docs[c.doc.id];
            else _docs[c.doc.id] = Object.assign({}, c.doc.data());
            touched.push(c.doc.id);
          });
          _ready = true;
          if (!settled) { settled = true; resolve(); }
          else touched.forEach(_announce);
        }, function (err) {
          // Never fatal: the session page renders without its notes.
          console.warn('[TN] listener failed:', err && err.message);
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
    _docs = {};
    _ready = false;
  }

  function ready() { return _ready; }
  function uid() { return _uid; }
  function notesOf(sessionId, exId) { return listOf(_docs[keyOf(sessionId)], exId); }
  function count(sessionId, exId) { return notesOf(sessionId, exId).length; }

  /* Cache first, then the write — as MN.save, so a re-render straight
     after shows the note — and back out if the write is refused. */
  function _write(sessionId, applyLocal, doWrite) {
    var id = keyOf(sessionId);
    var prev = _docs[id] ? JSON.parse(JSON.stringify(_docs[id])) : null;
    _docs[id] = applyLocal(prev ? JSON.parse(JSON.stringify(prev)) : null);
    var next = _docs[id];
    _announce(id);
    return doWrite().then(function () { return next; }, function (err) {
      if (_docs[id] === next) {
        if (prev) _docs[id] = prev; else delete _docs[id];
        _announce(id);
      }
      throw err;
    });
  }

  function _guard(tr) {
    if (!_teamId) return new Error('TN not initialised');
    if (!tr || tr.id === undefined || tr.id === null) return new Error('TN: no session');
    // Unreadable by everyone, its author included — refuse rather than write it.
    if (!tr.category) return new Error('TN: session has no category');
    return null;
  }

  function _nested(tr, exId, noteId, note) {
    var ex = {}; ex[exId] = {}; ex[exId][noteId] = note;
    return { sessionId: keyOf(tr.id), category: tr.category, ex: ex };
  }

  function add(tr, exId, text, name) {
    var err = _guard(tr);
    if (err) return Promise.reject(err);
    var body = clean(text);
    if (!body || !exId) return Promise.reject(new Error('TN.add: empty'));
    var nid = newNoteId();
    var note = { text: body, uid: _uid || '', name: String(name || ''), at: new Date().toISOString() };
    var patch = _nested(tr, exId, nid, note);
    return _write(tr.id, function (doc) {
      doc = doc || { sessionId: patch.sessionId, category: patch.category, ex: {} };
      doc.ex = doc.ex || {};
      doc.ex[exId] = Object.assign({}, doc.ex[exId] || {});
      doc.ex[exId][nid] = note;
      return doc;
    }, function () {
      return _col().doc(keyOf(tr.id)).set(patch, { merge: true });
    }).then(function () { return nid; });
  }

  function edit(tr, exId, noteId, text) {
    var err = _guard(tr);
    if (err) return Promise.reject(err);
    var body = clean(text);
    if (!body) return remove(tr, exId, noteId);
    var stamp = new Date().toISOString();
    return _write(tr.id, function (doc) {
      if (doc && doc.ex && doc.ex[exId] && doc.ex[exId][noteId]) {
        doc.ex[exId][noteId] = Object.assign({}, doc.ex[exId][noteId], { text: body, editedAt: stamp });
      }
      return doc;
    }, function () {
      return _col().doc(keyOf(tr.id)).set(_nested(tr, exId, noteId, { text: body, editedAt: stamp }), { merge: true });
    });
  }

  function remove(tr, exId, noteId) {
    var err = _guard(tr);
    if (err) return Promise.reject(err);
    return _write(tr.id, function (doc) {
      if (doc && doc.ex && doc.ex[exId]) delete doc.ex[exId][noteId];
      return doc;
    }, function () {
      return _col().doc(keyOf(tr.id)).update(
        new firebase.firestore.FieldPath('ex', String(exId), String(noteId)),
        firebase.firestore.FieldValue.delete());
    });
  }

  /** The notes of exercises that have left the plan. Only the ids named —
      never "everything not in the plan I happen to hold", which a plan a
      colleague has just extended, not yet synced here, would turn into
      deleting his notes. */
  function dropExercises(tr, exIds) {
    var err = _guard(tr);
    if (err) return Promise.reject(err);
    var doc = _docs[keyOf(tr.id)];
    var gone = (exIds || []).map(String).filter(function (id) { return doc && doc.ex && doc.ex[id]; });
    if (!gone.length) return Promise.resolve(0);
    var args = [];
    gone.forEach(function (id) {
      args.push(new firebase.firestore.FieldPath('ex', id), firebase.firestore.FieldValue.delete());
    });
    var ref = _col().doc(keyOf(tr.id));
    return _write(tr.id, function (d) {
      gone.forEach(function (id) { if (d && d.ex) delete d.ex[id]; });
      return d;
    }, function () { return ref.update.apply(ref, args); }).then(function () { return gone.length; });
  }

  function removeSession(sessionId) {
    if (!_teamId) return Promise.resolve();
    var id = keyOf(sessionId);
    if (!_docs[id]) return Promise.resolve();
    return _write(id, function () { return null; }, function () {
      return _col().doc(id).delete();
    }).then(function () { delete _docs[id]; });
  }

  return {
    // pure
    keyOf: keyOf, newNoteId: newNoteId, clean: clean, listOf: listOf, MAX: MAX,
    // runtime
    init: init, cleanup: cleanup, ready: ready, uid: uid,
    notesOf: notesOf, count: count,
    add: add, edit: edit, remove: remove, dropExercises: dropExercises, removeSession: removeSession
  };
});
