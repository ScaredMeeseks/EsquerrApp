// ============================================================
// One-time backfill: stamp Auth custom claims {teamId, role} on
// every existing user, from their users/{uid} doc. New joins and
// role changes keep claims in sync via joinClub/setRole.
//
// Security rules are HYBRID (claims first, users-doc fallback),
// so there is no hard deadline for tokens to refresh — but run
// this before deploying the Phase 2 rules anyway so the fast
// claim path applies to everyone within the hourly token refresh.
//
// Run from Cloud Shell (repo root):
//   node functions/backfill-claims.js
// ============================================================

const admin = require("firebase-admin");
admin.initializeApp({projectId: "esquerrapp"});
const db = admin.firestore();

(async () => {
  const users = await db.collection("users").get();
  let done = 0;
  let skipped = 0;
  for (const doc of users.docs) {
    const u = doc.data();
    const teamId = u.teamId;
    // NOTE: teamId 'default' IS the real club's team id — only skip
    // users with no club at all.
    if (!teamId || teamId === "none") {
      console.log(`- ${doc.id} (${u.email || "?"}): no club, skipped`);
      skipped++;
      continue;
    }
    const roles = u.roles || [];
    const role = u.isTeamLead === true ? "lead" :
      (roles.includes("staff") ? "staff" : "player");
    try {
      await admin.auth().setCustomUserClaims(doc.id, {teamId, role});
      await doc.ref.set(
          {claimsUpdatedAt: admin.firestore.FieldValue.serverTimestamp()},
          {merge: true},
      );
      console.log(`✔ ${doc.id} (${u.email || "?"}): teamId=${teamId} role=${role}`);
      done++;
    } catch (e) {
      // Users doc without a matching Auth account (e.g. deleted account)
      console.warn(`✗ ${doc.id} (${u.email || "?"}): ${e.message}`);
      skipped++;
    }
  }
  console.log(`Done. Claims set: ${done}, skipped: ${skipped}.`);
  process.exit(0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
