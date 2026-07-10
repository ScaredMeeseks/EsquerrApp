// ============================================================
// One-time backfill: populate teams/{id}.trainingDates and
// .matchDates from the fa_training / fa_matches blobs. The
// updateTeamDates trigger keeps them fresh afterwards, and the
// schedulers query these instead of scanning every team.
//
// MUST run right after deploying the Phase 3 functions —
// until it runs, the schedulers see no teams and send nothing.
//
// Run from Cloud Shell (repo root):
//   node functions/backfill-team-dates.js
// ============================================================

const admin = require("firebase-admin");
admin.initializeApp({projectId: "esquerrapp"});
const db = admin.firestore();

(async () => {
  const teams = await db.collection("teams").get();
  for (const team of teams.docs) {
    const dataCol = db.collection("teams").doc(team.id).collection("data");
    const out = {};
    for (const [key, field] of [["fa_training", "trainingDates"], ["fa_matches", "matchDates"]]) {
      const snap = await dataCol.doc(key).get();
      let list = [];
      if (snap.exists && typeof snap.data().v === "string") {
        try { list = JSON.parse(snap.data().v); } catch (e) { list = []; }
      }
      if (!Array.isArray(list)) list = [];
      out[field] = [...new Set(list.map((x) => String(x.date || "")).filter(Boolean))];
    }
    await db.collection("teams").doc(team.id).set(out, {merge: true});
    console.log(`✔ ${team.id}: trainingDates=${out.trainingDates.length} matchDates=${out.matchDates.length}`);
  }
  console.log("Done.");
  process.exit(0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
