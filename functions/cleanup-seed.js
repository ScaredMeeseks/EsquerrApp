// ============================================================
// One-time cleanup of fabricated/demo data in team data docs.
//
// Removes entries whose uid is not in the real roster, or whose
// date/matchId doesn't match a real training/match. Covers:
//   fa_training_availability, fa_match_availability, fa_player_rpe
//
// DRY-RUN by default (prints what would be deleted). Run from
// Cloud Shell (repo root, after `npm install firebase-admin --no-save`):
//   node functions/cleanup-seed.js            # dry-run report
//   node functions/cleanup-seed.js --apply    # actually delete
// ============================================================

const admin = require('firebase-admin');
admin.initializeApp({ projectId: 'esquerrapp' });
const db = admin.firestore();

const APPLY = process.argv.includes('--apply');
const DEMO_UIDS = new Set(['100001', '100002', '100003', '100004', '100005', '100006']);

// Parse a data doc in either format: blob {v:"json"} or per-field merge.
function entriesOf(snap) {
  if (!snap.exists) return {};
  const data = snap.data();
  if (typeof data.v === 'string') {
    try { return JSON.parse(data.v); } catch (e) { return {}; }
  }
  const out = {};
  for (const k of Object.keys(data)) {
    if (k !== '_migrated' && k !== 'v') out[k] = data[k];
  }
  return out;
}

async function deleteFields(docRef, snap, entries, keys, label, tid) {
  if (!keys.length) {
    console.log(`${tid}: ${label} clean`);
    return;
  }
  // Docs still in legacy blob format {v:"json"} have no per-entry fields —
  // FieldValue.delete() on them is a silent no-op. Rewrite the blob instead
  // (the bridge trigger parses both formats and prunes record docs to match).
  const isBlobFormat = snap.exists && typeof snap.data().v === 'string';
  console.log(`${tid}: ${label} — ${APPLY ? 'deleting' : 'WOULD delete'} ${keys.length} entries` +
    (isBlobFormat ? ' (blob-format doc: rewriting v)' : '') + ':');
  keys.forEach((k) => console.log(`    ${k}`));
  if (!APPLY) return;
  if (isBlobFormat) {
    const bad = new Set(keys);
    const filtered = {};
    for (const k of Object.keys(entries)) {
      if (!bad.has(k)) filtered[k] = entries[k];
    }
    await docRef.set({ v: JSON.stringify(filtered) });
  } else {
    // Per-field deletes in chunks of 400 (update size limits)
    for (let i = 0; i < keys.length; i += 400) {
      const deletes = {};
      keys.slice(i, i + 400).forEach((k) => {
        deletes[k] = admin.firestore.FieldValue.delete();
      });
      await docRef.update(deletes);
    }
  }
}

(async () => {
  console.log(APPLY ? '=== APPLY MODE ===' : '=== DRY-RUN (pass --apply to delete) ===');
  const teams = await db.collection('teams').get();
  for (const team of teams.docs) {
    const tid = team.id;
    const dataCol = db.collection('teams').doc(tid).collection('data');

    const [tSnap, mSnap, uSnap] = await Promise.all([
      dataCol.doc('fa_training').get(),
      dataCol.doc('fa_matches').get(),
      dataCol.doc('fa_users').get(),
    ]);

    const trainings = tSnap.exists && tSnap.data().v ? JSON.parse(tSnap.data().v) : [];
    const matches = mSnap.exists && mSnap.data().v ? JSON.parse(mSnap.data().v) : [];
    const users = uSnap.exists && uSnap.data().v ? JSON.parse(uSnap.data().v) : [];

    // Normalize everything to strings — match ids are numbers in the data
    // but always strings inside availability/RPE keys.
    const realDates = new Set(trainings.map((t) => String(t.date)));
    const realMatchIds = new Set(matches.map((m) => String(m.id)));
    const realUserIds = new Set(
        users.map((u) => String(u.id)).filter((id) => !DEMO_UIDS.has(id)),
    );

    // ── fa_training_availability: keys are {uid}_{date} ──
    const taRef = dataCol.doc('fa_training_availability');
    const taSnap = await taRef.get();
    const ta = entriesOf(taSnap);
    const taBad = Object.keys(ta).filter((key) => {
      const i = key.indexOf('_');
      if (i < 0) return true;
      const uid = key.slice(0, i);
      const date = key.slice(i + 1);
      return !realUserIds.has(uid) || !realDates.has(date);
    });
    await deleteFields(taRef, taSnap, ta, taBad, 'training availability', tid);

    // ── fa_match_availability: keys are {uid}_{matchId} ──
    const maRef = dataCol.doc('fa_match_availability');
    const maSnap2 = await maRef.get();
    const ma = entriesOf(maSnap2);
    const maBad = Object.keys(ma).filter((key) => {
      const i = key.indexOf('_');
      if (i < 0) return true;
      const uid = key.slice(0, i);
      const matchId = key.slice(i + 1);
      return !realUserIds.has(uid) || !realMatchIds.has(matchId);
    });
    await deleteFields(maRef, maSnap2, ma, maBad, 'match availability', tid);

    // ── fa_player_rpe: keys are {uid}_training_{date} / {uid}_match_{id} /
    //    {uid}_extra_{date}_{rand} ──
    const rpeRef = dataCol.doc('fa_player_rpe');
    const rpeSnap = await rpeRef.get();
    const rpe = entriesOf(rpeSnap);
    const rpeBad = Object.keys(rpe).filter((key) => {
      const i = key.indexOf('_');
      if (i < 0) return true;
      const uid = key.slice(0, i);
      const rest = key.slice(i + 1);
      if (!realUserIds.has(uid)) return true;
      if (rest.startsWith('training_')) {
        return !realDates.has(rest.slice('training_'.length));
      }
      if (rest.startsWith('match_')) {
        return !realMatchIds.has(rest.slice('match_'.length));
      }
      // 'extra_' entries have free-form dates — keep if the uid is real
      return !rest.startsWith('extra_');
    });
    await deleteFields(rpeRef, rpeSnap, rpe, rpeBad, 'player RPE', tid);
  }
  console.log('Done!');
  process.exit(0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
