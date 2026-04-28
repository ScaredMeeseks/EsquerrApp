// ============================================================
// db.js — Firestore ↔ localStorage Sync Layer
// ============================================================
// Intercepts localStorage writes for team-data keys and mirrors
// them to Firestore.  On init, downloads team data from Firestore
// into localStorage so the app always has a local cache for
// instant synchronous reads.
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
  ]);

  let _teamId = null;
  let _unsubscribers = [];

  /* Save the originals BEFORE patching */
  const _origSetItem    = localStorage.setItem.bind(localStorage);
  const _origRemoveItem = localStorage.removeItem.bind(localStorage);

  // ── Helpers ──────────────────────────────────────────────────

  function dataRef(key) {
    return db.collection('teams').doc(_teamId).collection('data').doc(key);
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
        if (SYNCED_KEYS.has(d.id) && d.data().v !== undefined) {
          _origSetItem(d.id, d.data().v);
        }
      });
    }

    // ── Reconcile users/ collection → fa_users blob ──────────────
    // Individual user docs in users/{uid} are always created at
    // registration. Merge any that are missing from the fa_users
    // team-data blob so they appear in Registrations / Roster.
    try {
      // Fetch ALL user docs and filter client-side. This handles users
      // whose teamId is 'default', '', or missing entirely (undefined).
      var allSnap = await db.collection('users').get();
      var allUserDocs = allSnap.docs.filter(function (d) {
        var t = d.data().teamId;
        if (t === teamId) return true;
        // Users with no teamId belong to the default team
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
        var val = doc.data().v;
        if (val !== undefined && localStorage.getItem(key) !== val) {
          _origSetItem(key, val);
          // Notify the app so it can re-render if needed
          window.dispatchEvent(new CustomEvent('firestore-sync', { detail: { key: key } }));
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
      if (val !== null) { batch.set(dataRef(key), { v: val }); n++; }
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
    _origSetItem(key, value);
    if (_teamId && SYNCED_KEYS.has(key)) {
      dataRef(key).set({ v: value }).catch(console.error);
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
