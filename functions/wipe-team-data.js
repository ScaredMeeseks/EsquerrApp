// ============================================================
// Phase 5, Stage E — the cutover wipe.
//
// Phase 5 splits every club-wide data blob into one document per
// category (teams/{id}/data/{key}__{category}). By prior decision the
// current team content is pre-season test data and disposable, so the
// cutover starts from an empty slate instead of migrating: this script
// deletes the team CONTENT and leaves the people, the club config and
// the team documents alone.
//
//   DELETED   teams/{id}/data/*            every doc — sharded AND the
//                                          pre-Phase-5 un-sharded ones
//             teams/{id}/trainingAvail/*   availability records
//             teams/{id}/matchAvail/*
//             teams/{id}/rpe/*
//             teams/{id}/pushQueue/*       spent notification queue
//             teams/{id}.trainingDates     cleared to [] — they point at
//             teams/{id}.matchDates        trainings that no longer exist;
//                                          backfill-team-dates.js rebuilds
//                                          them in step 5 of the runbook
//
//   KEPT      users/*  (+ tokens/*)        accounts, roles, categories
//             clubs/*  (+ rosters/*)       config and the roster email lists
//             clubCodes/*, joinAttempts/*
//             teams/{id}                   the documents themselves
//             teams/{id}/seasons/**        archived seasons, unless
//                                          --include-seasons is passed
//
// `fa_users` goes with the rest and that is deliberate: DB.init()
// reconciles the kept `users/` collection back into the fa_users blob on
// the next login, so the member list rebuilds itself from the accounts.
// Nothing else in data/ has a source to rebuild from — that is the wipe.
//
// Run from Cloud Shell (repo root):
//   node functions/wipe-team-data.js                  # dry run (inventory)
//   node functions/wipe-team-data.js --apply          # delete
//   node functions/wipe-team-data.js --team <teamId>  # one club only
//   node functions/wipe-team-data.js --include-seasons
//
// NOT reversible. Take a Firestore export to gs://esquerrapp-backup
// first if you want the option. Read the dry run in full before --apply.
// ============================================================

const admin = require("firebase-admin");
admin.initializeApp({projectId: "esquerrapp"});
const db = admin.firestore();

const APPLY = process.argv.includes("--apply");
const INCLUDE_SEASONS = process.argv.includes("--include-seasons");
const ONLY_TEAM = (() => {
  const i = process.argv.indexOf("--team");
  return i !== -1 ? process.argv[i + 1] : null;
})();

// Record collections + the spent push queue. `seasons` is NOT here: it is
// a subcollection of documents with their own subcollections, handled
// separately and only when asked for.
const RECORD_COLLECTIONS = ["trainingAvail", "matchAvail", "rpe", "pushQueue"];
const ARCHIVE_COLLECTIONS = ["data", "trainingAvail", "matchAvail", "rpe"];

const SHARD_SEP = "__";

/** How many entries a data doc holds, in either storage format. */
function entryCount(snap) {
  const data = snap.data() || {};
  if (typeof data.v === "string") {
    try {
      const parsed = JSON.parse(data.v);
      if (Array.isArray(parsed)) return parsed.length;
      if (parsed && typeof parsed === "object") return Object.keys(parsed).length;
      return 0;
    } catch (e) {
      return -1; // unparseable — worth seeing in the inventory
    }
  }
  return Object.keys(data).filter((k) => k !== "_migrated" && k !== "v").length;
}

/** Delete a whole collection in pages, so size never matters. */
async function deleteCollection(ref) {
  let deleted = 0;
  for (;;) {
    const snap = await ref.limit(400).get();
    if (snap.empty) return deleted;
    const batch = db.batch();
    snap.docs.forEach((d) => batch.delete(d.ref));
    await batch.commit();
    deleted += snap.size;
  }
}

async function inventoryTeam(teamId) {
  const teamRef = db.collection("teams").doc(teamId);
  const teamSnap = await teamRef.get();
  const team = teamSnap.exists ? teamSnap.data() : {};

  console.log(`\n── teams/${teamId}  (${team.name || "unnamed"}) ──`);

  // data/ — list every document, sharded or not
  const dataSnap = await teamRef.collection("data").get();
  let legacy = 0;
  let sharded = 0;
  if (dataSnap.empty) {
    console.log("  data/: (empty)");
  } else {
    const rows = dataSnap.docs.map((d) => {
      const isShard = d.id.indexOf(SHARD_SEP) !== -1;
      if (isShard) sharded++; else legacy++;
      return `    ${d.id}${isShard ? "" : "   [un-sharded, pre-Phase-5]"}` +
        `  entries=${entryCount(d)}`;
    });
    console.log(`  data/: ${dataSnap.size} docs (${sharded} sharded, ${legacy} un-sharded)`);
    rows.sort().forEach((r) => console.log(r));
  }

  // Record collections
  const recordCounts = {};
  for (const coll of RECORD_COLLECTIONS) {
    const agg = await teamRef.collection(coll).count().get();
    recordCounts[coll] = agg.data().count;
    console.log(`  ${coll}/: ${recordCounts[coll]} docs`);
  }

  // Archived seasons — reported always, deleted only on request
  const seasonSnap = await teamRef.collection("seasons").get();
  const seasons = [];
  for (const s of seasonSnap.docs) {
    let docs = 0;
    for (const coll of ARCHIVE_COLLECTIONS) {
      const agg = await s.ref.collection(coll).count().get();
      docs += agg.data().count;
    }
    seasons.push({id: s.id, ref: s.ref, docs});
  }
  if (seasons.length) {
    const verb = INCLUDE_SEASONS ? "WILL BE DELETED (--include-seasons)" : "KEPT";
    console.log(`  seasons/: ${seasons.length} archives — ${verb}`);
    seasons.forEach((s) => console.log(`    ${s.id}  (${s.docs} docs)`));
  } else {
    console.log("  seasons/: (none)");
  }

  console.log(`  team doc: trainingDates=${(team.trainingDates || []).length} ` +
    `matchDates=${(team.matchDates || []).length} → both cleared to []`);

  return {teamRef, dataCount: dataSnap.size, recordCounts, seasons};
}

async function wipeTeam(teamId, inv) {
  const {teamRef} = inv;

  const dataDeleted = await deleteCollection(teamRef.collection("data"));
  console.log(`  ✔ data/: deleted ${dataDeleted}`);

  for (const coll of RECORD_COLLECTIONS) {
    const n = await deleteCollection(teamRef.collection(coll));
    console.log(`  ✔ ${coll}/: deleted ${n}`);
  }

  if (INCLUDE_SEASONS) {
    for (const s of inv.seasons) {
      let n = 0;
      for (const coll of ARCHIVE_COLLECTIONS) {
        n += await deleteCollection(s.ref.collection(coll));
      }
      await s.ref.delete();
      console.log(`  ✔ seasons/${s.id}: deleted ${n} docs + the archive doc`);
    }
  }

  // Cleared, not deleted: the schedulers query these fields, and dates
  // left pointing at wiped trainings would fire reminders for sessions
  // nobody can open. backfill-team-dates.js repopulates them.
  await teamRef.set({trainingDates: [], matchDates: []}, {merge: true});
  console.log("  ✔ team doc: trainingDates/matchDates cleared");
}

(async () => {
  console.log(APPLY ? "=== WIPE (APPLY — deletes data) ===" : "=== WIPE (DRY-RUN) ===");
  if (ONLY_TEAM) console.log(`Scope: teams/${ONLY_TEAM} only`);
  if (!INCLUDE_SEASONS) console.log("Archived seasons are KEPT (pass --include-seasons to remove them).");

  let teams;
  if (ONLY_TEAM) {
    const one = await db.collection("teams").doc(ONLY_TEAM).get();
    if (!one.exists) {
      console.error(`No such team: teams/${ONLY_TEAM}`);
      process.exit(1);
    }
    teams = [one];
  } else {
    teams = (await db.collection("teams").get()).docs;
  }

  console.log(`\nTeams in scope: ${teams.map((t) => t.id).join(", ")}`);

  const inventories = [];
  for (const t of teams) inventories.push([t.id, await inventoryTeam(t.id)]);

  // Totals, so the dry run ends with the number that matters
  let totalData = 0;
  let totalRecords = 0;
  let totalArchive = 0;
  for (const [, inv] of inventories) {
    totalData += inv.dataCount;
    for (const coll of RECORD_COLLECTIONS) totalRecords += inv.recordCounts[coll];
    inv.seasons.forEach((s) => { totalArchive += s.docs; });
  }
  console.log(`\n── TOTAL ──\n  data docs:    ${totalData}\n  record docs:  ${totalRecords}` +
    `\n  archive docs: ${totalArchive} ${INCLUDE_SEASONS ? "(will be deleted)" : "(kept)"}`);
  console.log("  KEPT: users/*, clubs/* (rosters, clubCodes), joinAttempts/*, " +
    "the teams/{id} documents");

  if (!APPLY) {
    console.log("\nDry run — nothing was deleted. Re-run with --apply to wipe.");
    process.exit(0);
  }

  console.log("\n=== APPLYING ===");
  for (const [teamId, inv] of inventories) {
    console.log(`\n── teams/${teamId} ──`);
    await wipeTeam(teamId, inv);
  }

  console.log("\nDone. Next: step 4 (merge the frontend) then " +
    "`node functions/backfill-team-dates.js` (step 5).");
  process.exit(0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
