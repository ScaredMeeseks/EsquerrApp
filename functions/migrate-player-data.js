// ============================================================
// Phase 2 migration: legacy blob/merge data docs → per-record docs.
//
//   teams/{id}/data/fa_training_availability → teams/{id}/trainingAvail/{uid}_{date}
//   teams/{id}/data/fa_match_availability    → teams/{id}/matchAvail/{uid}_{matchId}
//   teams/{id}/data/fa_player_rpe            → teams/{id}/rpe/{legacy key verbatim}
//
// Idempotent and non-destructive: uses create() and ignores
// ALREADY_EXISTS, so records written by dual-writing clients or the
// bridge are never overwritten. Legacy docs are left in place (old
// clients still read/write them until Phase 3).
//
// Run from Cloud Shell (repo root):
//   node functions/migrate-player-data.js            # dry-run (counts)
//   node functions/migrate-player-data.js --apply    # write records
//   node functions/migrate-player-data.js --verify   # compare counts + samples
// ============================================================

const admin = require("firebase-admin");
admin.initializeApp({projectId: "esquerrapp"});
const db = admin.firestore();

const APPLY = process.argv.includes("--apply");
const VERIFY = process.argv.includes("--verify");

// Parse a data doc in either format: blob {v:"json"} or per-field merge.
function entriesOf(snap) {
  if (!snap.exists) return {};
  const data = snap.data();
  if (typeof data.v === "string") {
    try { return JSON.parse(data.v); } catch (e) { return {}; }
  }
  const out = {};
  for (const k of Object.keys(data)) {
    if (k !== "_migrated" && k !== "v") out[k] = data[k];
  }
  return out;
}

const MAPPINGS = [
  {
    legacyKey: "fa_training_availability",
    coll: "trainingAvail",
    toDoc: (k, v) => {
      const i = k.indexOf("_");
      if (i < 0) return null;
      return {uid: k.slice(0, i), date: k.slice(i + 1), value: v};
    },
  },
  {
    legacyKey: "fa_match_availability",
    coll: "matchAvail",
    toDoc: (k, v) => {
      const i = k.indexOf("_");
      if (i < 0) return null;
      return {uid: k.slice(0, i), matchId: k.slice(i + 1), value: v};
    },
  },
  {
    legacyKey: "fa_player_rpe",
    coll: "rpe",
    toDoc: (k, v) => {
      const i = k.indexOf("_");
      if (i < 0 || typeof v !== "object" || v === null) return null;
      return Object.assign({uid: k.slice(0, i)}, v);
    },
  },
];

async function migrateTeam(teamId) {
  const dataCol = db.collection("teams").doc(teamId).collection("data");
  for (const m of MAPPINGS) {
    const entries = entriesOf(await dataCol.doc(m.legacyKey).get());
    const keys = Object.keys(entries);
    const collRef = db.collection("teams").doc(teamId).collection(m.coll);

    if (VERIFY) {
      const collSnap = await collRef.get();
      const collIds = new Set(collSnap.docs.map((d) => d.id));
      const missing = keys.filter((k) => !collIds.has(k));
      // Sample-compare 5 values
      let mismatches = 0;
      const sample = keys.filter((k) => collIds.has(k)).slice(0, 5);
      for (const k of sample) {
        const doc = collSnap.docs.find((d) => d.id === k).data();
        const legacy = entries[k];
        const same = typeof legacy === "object" ?
          Object.keys(legacy).every((f) => JSON.stringify(doc[f]) === JSON.stringify(legacy[f])) :
          doc.value === legacy;
        if (!same) mismatches++;
      }
      console.log(`${teamId}/${m.coll}: blob=${keys.length} records=${collSnap.size} ` +
        `missing=${missing.length} sampleMismatches=${mismatches}` +
        (missing.length ? ` → e.g. ${missing.slice(0, 3).join(", ")}` : ""));
      continue;
    }

    if (!APPLY) {
      console.log(`${teamId}/${m.coll}: WOULD migrate ${keys.length} entries from ${m.legacyKey}`);
      continue;
    }

    let created = 0;
    let existed = 0;
    let bad = 0;
    // create() is not batchable — chunked parallel creates
    for (let i = 0; i < keys.length; i += 200) {
      const chunk = keys.slice(i, i + 200);
      const results = await Promise.allSettled(chunk.map((k) => {
        const payload = m.toDoc(k, entries[k]);
        if (!payload) { bad++; return Promise.reject(new Error("unparseable")); }
        return collRef.doc(k).create(Object.assign(payload, {
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          source: "migration",
        }));
      }));
      for (const r of results) {
        if (r.status === "fulfilled") created++;
        else if (r.reason && r.reason.code === 6) existed++; // ALREADY_EXISTS
        else if (r.reason && r.reason.message === "unparseable") { /* counted */ }
        else throw r.reason;
      }
    }
    console.log(`${teamId}/${m.coll}: created=${created} alreadyExisted=${existed} unparseable=${bad}`);
  }
}

(async () => {
  console.log(VERIFY ? "=== VERIFY ===" : APPLY ? "=== APPLY ===" : "=== DRY-RUN ===");
  const teams = await db.collection("teams").get();
  for (const team of teams.docs) {
    await migrateTeam(team.id);
  }
  console.log("Done!");
  process.exit(0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
