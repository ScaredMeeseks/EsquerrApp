// ============================================================
// One-time backfill: populate teams/{id}.trainingDates and
// .matchDates from the fa_training / fa_matches documents. The
// updateTeamDates trigger keeps them fresh afterwards, and the
// schedulers query these instead of scanning every team.
//
// MUST run right after deploying the Phase 3 functions —
// until it runs, the schedulers see no teams and send nothing.
// It is also the repair tool when reminders go quiet.
//
// Phase 5: data is sharded per category
// (teams/{id}/data/{key}__{category}), so the dates are the UNION
// across every shard. Reading a bare `data/fa_training` here would
// find nothing and write an EMPTY array — turning the repair tool
// into the thing that silences every reminder in the club.
//
// Run from Cloud Shell (repo root):
//   node functions/backfill-team-dates.js
// ============================================================

const admin = require("firebase-admin");
admin.initializeApp({projectId: "esquerrapp"});
const db = admin.firestore();

const SHARD_SEP = "__";

/** Every shard of `key`, merged into one list. */
function mergeShards(snap, key) {
  const out = [];
  snap.forEach((d) => {
    const i = d.id.indexOf(SHARD_SEP);
    if (i === -1 || d.id.slice(0, i) !== key) return;
    const raw = d.data() || {};
    if (typeof raw.v !== "string") return;
    let list;
    try {
      list = JSON.parse(raw.v);
    } catch (e) {
      return;
    }
    if (Array.isArray(list)) out.push(...list);
  });
  return out;
}

(async () => {
  const teams = await db.collection("teams").get();
  for (const team of teams.docs) {
    const dataSnap = await db.collection("teams").doc(team.id)
        .collection("data").get();
    const out = {};
    for (const [key, field] of [["fa_training", "trainingDates"],
      ["fa_matches", "matchDates"]]) {
      const list = mergeShards(dataSnap, key);
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
