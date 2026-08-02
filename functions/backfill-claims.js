// ============================================================
// Backfill Auth custom claims {teamId, role, cats} on every existing
// user, from their users/{uid} doc and their club's roster lists.
// New joins and role changes keep claims in sync via
// joinClub / setRole / onRosterWritten / onClubLeadChanged.
//
// ⚠ This script USED to write only {teamId, role}. Phase 4 added the
// `cats` claim, which firestore.rules reads for the roster lists — so the
// old version would have silently stripped it from everyone and locked
// every coach out of their own player lists. Keep this file in step with
// claimsFor() in index.js; if the two disagree, a member's access depends
// on which one last touched them.
//
// `cats` = "the categories you may SEE":
//   lead   → every enabled category of the club
//   staff  → the categories whose staff list carries their address
//   player → their own category (Phase 5: this used to be [], which would
//            fail closed against the whole player base once the
//            per-category rules land)
//
// Run from Cloud Shell (repo root):
//   node functions/backfill-claims.js            # dry run, writes nothing
//   node functions/backfill-claims.js --apply
// ============================================================

const admin = require("firebase-admin");
admin.initializeApp({projectId: "esquerrapp"});
const db = admin.firestore();

const APPLY = process.argv.includes("--apply");

/** Enabled categories of a club, from its `categories` config map. */
function enabledCategories(club) {
  const cats = (club && club.categories) || {};
  return Object.keys(cats).filter((k) => cats[k] && cats[k].enabled);
}

/** Read a club's roster lists once: [{key, staff[], players[]}]. */
async function loadRosters(clubId) {
  const snap = await db.collection("clubs").doc(clubId)
      .collection("rosters").get();
  const norm = (arr) => (Array.isArray(arr) ? arr : [])
      .map((e) => String(e || "").trim().toLowerCase()).filter(Boolean);
  return snap.docs.map((d) => ({
    key: d.id,
    staff: norm((d.data() || {}).staffEmails),
    players: norm((d.data() || {}).playerEmails),
  }));
}

(async () => {
  console.log(APPLY ?
    "APPLY MODE — claims will be written.\n" :
    "DRY RUN — nothing will be written. Re-run with --apply.\n");

  const users = await db.collection("users").get();
  const clubCache = {};
  let done = 0;
  let skipped = 0;

  for (const doc of users.docs) {
    const u = doc.data();
    const teamId = u.teamId;
    const email = String(u.email || "").trim().toLowerCase();
    if (!teamId || teamId === "none") {
      console.log(`- ${doc.id} (${email || "?"}): no club, skipped`);
      skipped++;
      continue;
    }

    if (!clubCache[teamId]) {
      const clubSnap = await db.collection("clubs").doc(teamId).get();
      clubCache[teamId] = {
        club: clubSnap.exists ? clubSnap.data() : {},
        rosters: await loadRosters(teamId),
      };
    }
    const {club, rosters} = clubCache[teamId];

    // Derive the same way membershipFrom() does, from the lists.
    const staffCats = new Set();
    let playerCat = "";
    rosters.forEach((r) => {
      if (r.staff.includes(email)) staffCats.add(r.key.split("-")[0]);
      if (!playerCat && r.players.includes(email)) {
        const dash = r.key.indexOf("-");
        playerCat = dash === -1 ? r.key : r.key.slice(0, dash);
      }
    });

    const isLead = u.isTeamLead === true;
    const roles = u.roles || [];
    const role = isLead ? "lead" :
      (roles.includes("staff") ? "staff" : "player");

    let cats = [];
    if (isLead) cats = enabledCategories(club);
    else if (role === "staff") cats = [...staffCats];
    // Fall back to the doc's own category when the address is on no list —
    // a member can be assigned without being listed (older accounts).
    else if (playerCat || u.category) cats = [playerCat || u.category];

    const line = `${doc.id} (${email || "?"}): teamId=${teamId} ` +
      `role=${role} cats=[${cats}]`;
    if (!APPLY) {
      console.log(`  ${line}`);
      done++;
      continue;
    }
    try {
      await admin.auth().setCustomUserClaims(doc.id, {teamId, role, cats});
      await doc.ref.set({
        staffCategories: role === "staff" ? cats : (u.staffCategories || []),
        claimsUpdatedAt: admin.firestore.FieldValue.serverTimestamp(),
      }, {merge: true});
      console.log(`✔ ${line}`);
      done++;
    } catch (e) {
      // users doc with no matching Auth account (e.g. deleted account)
      console.warn(`✗ ${doc.id} (${email || "?"}): ${e.message}`);
      skipped++;
    }
  }

  console.log(`\nDone. ${APPLY ? "Claims set" : "Would set"}: ${done}, ` +
    `skipped: ${skipped}.`);
  if (!APPLY) console.log("(Dry run — nothing was written.)");
  process.exit(0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
