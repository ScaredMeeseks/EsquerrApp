// ============================================================
// Grandfather every existing club onto the new team quota.
//
// `clubs/{id}.maxTeams` is a COMMERCIAL limit on how many teams a lead
// may create. A team is one {category}-{letter} pair, counted across all
// categories: amateur-A + amateur-B + juvenil-A = 3.
//
// A MISSING field means 1. So without this script, every club with more
// than one team would find itself over quota the moment enforcement
// ships. This writes each club's CURRENT count so nobody is retroactively
// downgraded by a feature they never asked for.
//
// Writes only where the field is MISSING. Re-running can therefore never
// silently undo a deliberate downgrade — use --force for that, knowingly.
//
// Run from Cloud Shell (repo root):
//   node functions/migrate-max-teams.js            # dry-run inventory
//   node functions/migrate-max-teams.js --apply    # write the missing ones
//   node functions/migrate-max-teams.js --apply --force   # overwrite ALL
//
// The dry run is read-only and safe to run at any time — including before
// any of the quota code exists. It is also the pre-flight that answers
// "which clubs already have more than one team?".
// ============================================================

const admin = require("firebase-admin");
admin.initializeApp({projectId: "esquerrapp"});
const db = admin.firestore();

const APPLY = process.argv.includes("--apply");
const FORCE = process.argv.includes("--force");

// Mirrors CATEGORY_ORDER in js/utils.js. Duplicated rather than imported:
// functions/ deploys on its own and cannot reach ../js at runtime.
const CATEGORY_ORDER = ["amateur", "juvenil", "cadet", "infantil", "alevi", "benjami"];

/**
 * The live teams of a club, as `{category}-{letter}` keys.
 *
 * A verbatim port of rosterKeys() in js/app.js — same enabled check, same
 * `['A']` fallback for an enabled category with no letters. The count this
 * returns IS the quota metric, so the two must not drift.
 */
function rosterKeys(categories) {
  const cats = categories || {};
  const keys = [];
  CATEGORY_ORDER.forEach((cat) => {
    if (!cats[cat] || !cats[cat].enabled) return;
    const letters = (cats[cat].letters && cats[cat].letters.length) ?
      cats[cat].letters : ["A"];
    letters.forEach((l) => keys.push(cat + "-" + l));
  });
  return keys;
}

(async () => {
  console.log("=== EsquerrApp maxTeams grandfathering ===\n");
  console.log(APPLY ?
    (FORCE ?
      "APPLY + FORCE — this OVERWRITES maxTeams on every club.\n" :
      "APPLY MODE — writes maxTeams where it is missing.\n") :
    "DRY RUN — nothing will be written. Re-run with --apply to commit.\n");

  const clubs = await db.collection("clubs").get();
  if (clubs.empty) {
    console.log("No clubs found.");
    return;
  }

  let writes = 0;
  let skipped = 0;
  const overOne = [];

  for (const doc of clubs.docs) {
    const club = doc.data() || {};
    const teams = rosterKeys(club.categories);
    const count = Math.max(1, teams.length);
    const existing = club.maxTeams;
    const has = typeof existing === "number" && isFinite(existing);

    console.log(`${doc.id}  ${club.name || "(unnamed)"}`);
    console.log(`  teams (${teams.length}): ${teams.join(", ") || "(none enabled)"}`);
    console.log(`  maxTeams: ${has ? existing : "(missing)"} -> ${count}` +
      (has && !FORCE ? "   SKIP (already set)" : ""));

    // The pre-flight this script doubles as: anything above 1 would have
    // been instantly over quota under the default.
    if (teams.length > 1) overOne.push(`${doc.id} (${teams.length})`);

    if (has && !FORCE) {
      skipped++;
    } else {
      writes++;
      if (APPLY) await doc.ref.set({maxTeams: count}, {merge: true});
    }
    console.log("");
  }

  console.log("─".repeat(60));
  console.log(`${clubs.size} clubs · ${writes} ${APPLY ? "written" : "would be written"} · ${skipped} skipped`);
  if (overOne.length) {
    console.log(`\nClubs with more than one team: ${overOne.join(", ")}`);
    console.log("These are the ones grandfathering protects. Do NOT lower any");
    console.log("of them below their current count until deploy 2 ships the");
    console.log("delete-a-team flow, or their staff have no way to resolve it.");
  } else {
    console.log("\nEvery club has exactly one team — the default of 1 would have");
    console.log("been correct anyway, but the field is now explicit.");
  }
  if (!APPLY && writes) console.log("\nRe-run with --apply to write.");
})().catch((e) => {
  console.error("\nFAILED:", e && e.stack || e);
  process.exit(1);
});
