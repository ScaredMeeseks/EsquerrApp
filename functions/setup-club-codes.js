// ============================================================
// One-time migration: move club join codes out of the readable
// clubs/{id} docs into the server-only clubCodes/{CODE} collection.
//
// Lives in functions/ so it resolves functions/node_modules (a root
// `npm install --no-save` on Cloud Shell yields a broken firebase-admin
// because npm blocks its postinstall scripts there).
// Run from Cloud Shell (repo root):
//   node functions/setup-club-codes.js
// ============================================================

const admin = require("firebase-admin");
admin.initializeApp({ projectId: "esquerrapp" });
const db = admin.firestore();

(async () => {
  const clubs = await db.collection("clubs").get();
  if (clubs.empty) {
    console.log("No clubs found.");
    return;
  }
  for (const doc of clubs.docs) {
    const code = doc.data().code;
    if (!code) {
      console.log(`- ${doc.id} (${doc.data().name || "?"}): no code field (already migrated?)`);
      continue;
    }
    const codeId = String(code).toUpperCase();
    await db.collection("clubCodes").doc(codeId).set({ clubId: doc.id });
    await doc.ref.update({ code: admin.firestore.FieldValue.delete() });
    console.log(`✔ ${doc.id} (${doc.data().name || "?"}): code ${codeId} → clubCodes/`);
  }
  console.log("Done.");
})().catch((err) => {
  console.error("FAILED:", err);
  process.exit(1);
});
