// ============================================================
// db.js — Firestore ↔ localStorage Sync Layer
// ============================================================
// Intercepts localStorage writes for team-data keys and mirrors
// them to Firestore.  On init, downloads team data from Firestore
// into localStorage so the app always has a local cache for
// instant synchronous reads.
//
// MERGE_KEYS (availability data) use per-field Firestore merges
// so two players saving at the same time never overwrite each
// other.  All other SYNCED_KEYS use the original blob strategy.
//
// Usage:
//   await DB.init('teamId');  — download Firestore → localStorage
//   DB.cleanup();             — unsubscribe listeners on logout
//
// All existing localStorage.setItem / removeItem calls are
// automatically intercepted — no changes needed at call sites.
// ============================================================

const DB = (function () {
  'use strict';

  /* Keys that represent persistent team data.
     Everything else (seed flags, tactic editing state) stays local-only. */
  const SYNCED_KEYS = new Set([
    'fa_users',
    'fa_training',
    'fa_matches',
    'fa_matchday',
    'fa_standings',
    'fa_news',
    'fa_player_stats',
    'fa_training_availability',
    'fa_match_availability',
    'fa_player_rpe',
    'fa_staff_notifications',
    'fa_injury_notes',
    'fa_injury_zone',
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
     Each player writes only their own field — concurrent saves never conflict. */
  const MERGE_KEYS = new Set([
    'fa_training_availability',
    'fa_match_availability',
    'fa_training_staff_override',
  ]);

  let _teamId = null;
  let _unsubscribers = [];

  /* Save the originals BEFORE patching */
  const _origSetItem    = localStorage.setItem.bind(localStorage);
  const _origGetItem    = localStorage.getItem.bind(localStorage);
  const _origRemoveItem = localStorage.removeItem.bind(localStorage);

  // ── Helpers ──────────────────────────────────────────────────

  function dataRef(key) {
    return db.collection('teams').doc(_teamId).collection('data').doc(key);
  }

  /**
   * For MERGE_KEYS: compute the diff between old and new JSON blobs
   * and write only the changed/deleted fields to Firestore with merge.
   */
  function _writeMerge(key, oldJson, newJson) {
    var oldObj, newObj;
    try { oldObj = JSON.parse(oldJson || '{}'); } catch (e) { oldObj = {}; }
    try { newObj = JSON.parse(newJson || '{}'); } catch (e) { newObj = {}; }
    var updates = {};
    var hasUpdates = false;
    // Fields added or changed
    for (var k in newObj) {
      if (JSON.stringify(newObj[k]) !== JSON.stringify(oldObj[k])) {
        updates[k] = newObj[k];
        hasUpdates = true;
      }
    }
    // Fields deleted
    for (var k in oldObj) {
      if (!(k in newObj)) {
        updates[k] = firebase.firestore.FieldValue.delete();
        hasUpdates = true;
      }
    }
    if (hasUpdates) {
      dataRef(key).set(updates, { merge: true }).catch(console.error);
    }
  }

  /**
   * For MERGE_KEYS: convert Firestore doc fields back into a JSON blob
   * for localStorage. Strips internal fields (_migrated, v).
   */
  function _docToBlob(docData) {
    var obj = {};
    for (var k in docData) {
      if (k === '_migrated' || k === 'v') continue;
      obj[k] = docData[k];
    }
    return JSON.stringify(obj);
  }

  // ── Public API ───────────────────────────────────────────────

  /**
   * Download Firestore team data → localStorage, then start real-time
   * listeners. If Firestore has no data yet (first time), the current
   * localStorage contents are uploaded instead.
   */
  async function init(teamId) {
    if (_teamId === teamId && _unsubscribers.length) return; // already initialised
    cleanup();
    _teamId = teamId;

    // Flush all synced keys to prevent stale data from a previous team
    SYNCED_KEYS.forEach(function (key) {
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

    // Fetch all data docs for this team
    const snap = await teamDocRef.collection('data').get();

    if (snap.empty) {
      // First time ever — push local seed data up to Firestore
      await _uploadAll();
    } else {
      // Firestore is source of truth — overwrite localStorage
      snap.forEach(function (d) {
        if (!SYNCED_KEYS.has(d.id)) return;
        var data = d.data();
        if (MERGE_KEYS.has(d.id)) {
          // Per-field format: check if already migrated
          if (data._migrated) {
            _origSetItem(d.id, _docToBlob(data));
          } else if (data.v !== undefined) {
            // Legacy blob format — populate localStorage, then migrate doc
            _origSetItem(d.id, data.v);
            var obj;
            try { obj = JSON.parse(data.v); } catch (e) { obj = {}; }
            obj._migrated = true;
            dataRef(d.id).set(obj).catch(console.error);
          }
        } else if (data.v !== undefined) {
          _origSetItem(d.id, data.v);
        }
      });
    }

    // ── Reconcile users/ collection → fa_users blob ──────────────
    try {
      var allSnap = await db.collection('users').get();
      var allUserDocs = allSnap.docs.filter(function (d) {
        var t = d.data().teamId;
        if (t === teamId) return true;
        if (teamId === 'default' && (!t || t === '')) return true;
        return false;
      });
      if (allUserDocs.length) {
        var faUsers = JSON.parse(localStorage.getItem('fa_users') || '[]');
        var existingIds = {};
        faUsers.forEach(function (u) { existingIds[String(u.id)] = true; });
        var added = 0;
        allUserDocs.forEach(function (d) {
          var uid = d.id;
          if (existingIds[uid]) return;
          var data = d.data();
          data.id = uid;
          faUsers.push(data);
          existingIds[uid] = true;
          added++;
        });
        if (added) {
          var merged = JSON.stringify(faUsers);
          _origSetItem('fa_users', merged);
          dataRef('fa_users').set({ v: merged }).catch(console.error);
        }
      }
    } catch (e) {
      console.warn('User reconciliation failed:', e);
    }

    // Real-time listeners for remote changes from other devices
    SYNCED_KEYS.forEach(function (key) {
      var unsub = dataRef(key).onSnapshot(function (doc) {
        if (!doc.exists) return;
        // Skip echoes of our own local writes
        if (doc.metadata.hasPendingWrites) return;

        if (MERGE_KEYS.has(key)) {
          var val = _docToBlob(doc.data());
          if (_origGetItem(key) !== val) {
            _origSetItem(key, val);
            window.dispatchEvent(new CustomEvent('firestore-sync', { detail: { key: key } }));
          }
        } else {
          var val = doc.data().v;
          if (val !== undefined && _origGetItem(key) !== val) {
            _origSetItem(key, val);
            window.dispatchEvent(new CustomEvent('firestore-sync', { detail: { key: key } }));
          }
        }
      });
      _unsubscribers.push(unsub);
    });
  }

  /** Upload every synced localStorage key to Firestore (batch write). */
  async function _uploadAll() {
    var batch = db.batch();
    var n = 0;
    SYNCED_KEYS.forEach(function (key) {
      var val = localStorage.getItem(key);
      if (val !== null) {
        if (MERGE_KEYS.has(key)) {
          var obj;
          try { obj = JSON.parse(val); } catch (e) { obj = {}; }
          obj._migrated = true;
          batch.set(dataRef(key), obj);
        } else {
          batch.set(dataRef(key), { v: val });
        }
        n++;
      }
    });
    if (n) await batch.commit();
  }

  /** Unsubscribe all listeners and reset state. */
  function cleanup() {
    _unsubscribers.forEach(function (fn) { fn(); });
    _unsubscribers = [];
    _teamId = null;
  }

  // ── localStorage monkey-patch ────────────────────────────────
  // Intercept writes so every synced key is transparently mirrored
  // to Firestore. Reads stay instant from localStorage.

  localStorage.setItem = function (key, value) {
    var oldValue = MERGE_KEYS.has(key) ? _origGetItem(key) : null;
    _origSetItem(key, value);
    if (_teamId && SYNCED_KEYS.has(key)) {
      if (MERGE_KEYS.has(key)) {
        _writeMerge(key, oldValue, value);
      } else {
        dataRef(key).set({ v: value }).catch(console.error);
      }
    }
  };

  localStorage.removeItem = function (key) {
    _origRemoveItem(key);
    if (_teamId && SYNCED_KEYS.has(key)) {
      dataRef(key).delete().catch(console.error);
    }
  };

  /** Flush all synced localStorage keys without connecting to Firestore. */
  function flush() {
    SYNCED_KEYS.forEach(function (key) { _origRemoveItem(key); });
  }

  return { init: init, cleanup: cleanup, flush: flush, SYNCED_KEYS: SYNCED_KEYS };
})();
