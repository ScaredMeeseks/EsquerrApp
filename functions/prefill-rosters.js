// ============================================================
// One-time prefill: seed clubs/{clubId}/rosters/{category}-{letter}
// from the members who are ALREADY in each club.
//
// Registration is a hard gate against these lists, and staff with no
// category assigned see nothing — so this must run, and its UNPLACEABLE
// report must be empty, BEFORE the new rules/functions are deployed.
//
// Placement:
//   player  -> playerEmails of {category}-{team}
//   staff   -> staffEmails of {category}-{letter} for EVERY letter of
//              their category (staff run a category, not one team)
//   lead    -> not listed; the lead always bypasses the gate
//
// Anything that cannot be placed is reported and NOT written. Fix those
// in the app's Registrations page (assign a category / team), then re-run.
//
// Run from Cloud Shell (repo root):
//   node functions/prefill-rosters.js              # dry-run, writes nothing
//   node functions/prefill-rosters.js --apply      # writes
// ============================================================

const admin = require("firebase-admin");
admin.initializeApp({projectId: "esquerrapp"});
const db = admin.firestore();

const APPLY = process.argv.includes("--apply");

/** Add an address to a roster list, de-duplicated. */
function addTo(rosters, key, field, email) {
  if (!rosters[key]) rosters[key] = {staffEmails: [], playerEmails: []};
  if (!rosters[key][field].includes(email)) rosters[key][field].push(email);
}

(async () => {
  console.log(APPLY ?
    "APPLY MODE — this will write to Firestore.\n" :
    "DRY RUN — nothing will be written. Re-run with --apply to commit.\n");

  const clubs = await db.collection("clubs").get();
  if (clubs.empty) {
    console.log("No clubs found. Nothing to do.");
    process.exit(0);
  }

  let totalUnplaceable = 0;

  for (const clubDoc of clubs.docs) {
    const clubId = clubDoc.id;
    const club = clubDoc.data();
    const leadEmail = String(club.leadEmail || "").trim().toLowerCase();
    const cats = club.categories || {};
    const enabled = Object.keys(cats).filter((k) => cats[k] && cats[k].enabled);

    console.log(`\n=== Club ${clubId} (${club.name || "?"}) ===`);
    if (!enabled.length) {
      console.log("  ! No categories enabled — the lead has not run " +
        "\"Configura el teu club\" yet. Skipping.");
      continue;
    }
    console.log(`  Enabled categories: ${enabled.join(", ")}`);

    // Merge onto whatever already exists so a re-run is idempotent and
    // never drops addresses added by hand in between.
    const rosters = {};
    const existing = await clubDoc.ref.collection("rosters").get();
    existing.forEach((d) => {
      const v = d.data() || {};
      rosters[d.id] = {
        staffEmails: Array.isArray(v.staffEmails) ? v.staffEmails.slice() : [],
        playerEmails: Array.isArray(v.playerEmails) ?
          v.playerEmails.slice() : [],
      };
    });

    const users = await db.collection("users")
        .where("teamId", "==", clubId).get();
    const unplaceable = [];
    let placed = 0;

    for (const uDoc of users.docs) {
      const u = uDoc.data();
      const email = String(u.email || "").trim().toLowerCase();
      const who = `${u.name || "?"} <${email || "no email"}>`;
      const roles = Array.isArray(u.roles) ? u.roles : [];

      if (!email) {
        unplaceable.push(`${who} — no email address on the profile`);
        continue;
      }
      // The lead bypasses the gate and is not category-scoped.
      if (email === leadEmail) {
        console.log(`  · ${who} — team lead, not listed (bypasses the gate)`);
        continue;
      }
      if (!roles.length) {
        unplaceable.push(`${who} — no role chosen yet ` +
          "(never got past the role screen)");
        continue;
      }

      const category = String(u.category || "").trim();
      if (!category) {
        unplaceable.push(`${who} — roles=[${roles}] but NO CATEGORY set`);
        continue;
      }
      if (!enabled.includes(category)) {
        unplaceable.push(`${who} — category "${category}" is not enabled ` +
          "on this club");
        continue;
      }
      const letters = (cats[category].letters || []).length ?
        cats[category].letters : ["A"];

      let didPlace = false;
      if (roles.includes("staff")) {
        // Staff cover every team in their category.
        letters.forEach((l) => addTo(rosters, `${category}-${l}`,
            "staffEmails", email));
        console.log(`  ✔ ${who} — staff on ${category} ` +
          `(${letters.join(", ")})`);
        didPlace = true;
      }
      if (roles.includes("player")) {
        const team = String(u.team || "").trim();
        if (!team) {
          unplaceable.push(`${who} — player in "${category}" but NO TEAM ` +
            "letter set");
        } else if (!letters.includes(team)) {
          unplaceable.push(`${who} — player on team "${team}", which is not ` +
            `a letter of ${category} (${letters.join(", ")})`);
        } else {
          addTo(rosters, `${category}-${team}`, "playerEmails", email);
          console.log(`  ✔ ${who} — player on ${category}-${team}`);
          didPlace = true;
        }
      }
      if (didPlace) placed++;
    }

    // Report before writing so a dry-run shows exactly what --apply would do.
    console.log(`\n  Rosters for ${clubId}:`);
    Object.keys(rosters).sort().forEach((key) => {
      const r = rosters[key];
      console.log(`    ${key}: ${r.staffEmails.length} staff, ` +
        `${r.playerEmails.length} players`);
    });

    if (unplaceable.length) {
      totalUnplaceable += unplaceable.length;
      console.log(`\n  !! UNPLACEABLE (${unplaceable.length}) — these people ` +
        "will be LOCKED OUT until fixed:");
      unplaceable.forEach((line) => console.log(`     - ${line}`));
    } else {
      console.log("\n  UNPLACEABLE: none ✔");
    }

    if (APPLY) {
      const batch = db.batch();
      Object.keys(rosters).forEach((key) => {
        batch.set(clubDoc.ref.collection("rosters").doc(key), {
          staffEmails: rosters[key].staffEmails,
          playerEmails: rosters[key].playerEmails,
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        }, {merge: true});
      });
      await batch.commit();
      console.log(`  → wrote ${Object.keys(rosters).length} roster docs ` +
        `(${placed} members placed)`);
    }
  }

  console.log("\n" + "=".repeat(50));
  if (totalUnplaceable) {
    console.log(`STOP: ${totalUnplaceable} member(s) could not be placed.`);
    console.log("Fix them in Registrations (assign a category and a team " +
      "letter), then run this again.");
    console.log("Do NOT deploy the new rules/functions until this reads 0 — " +
      "unplaced staff will see nothing.");
  } else {
    console.log("All members placed. Safe to deploy.");
  }
  if (!APPLY) console.log("\n(Dry run — nothing was written.)");
  process.exit(0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
