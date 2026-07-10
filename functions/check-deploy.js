// ============================================================
// Phase 2 deployment verification — read-only except for one
// throwaway test team (`_deploycheck`) used to exercise the
// bridgeLegacyPlayerData trigger end-to-end, cleaned up after.
//
// Checks:
//   1. Custom claims present on every club member (backfill worked)
//   2. Migration counts: legacy blob entries vs per-record docs
//   3. Bridge trigger: legacy write → record appears; delete → record gone
//   4. Frontend: live sw.js CACHE_NAME + functions-compat script tag
//
// Run from Cloud Shell (repo root):
//   node functions/check-deploy.js
// ============================================================

const admin = require("firebase-admin");
admin.initializeApp({projectId: "esquerrapp"});
const db = admin.firestore();

let failures = 0;
const ok = (msg) => console.log(`  ✔ ${msg}`);
const bad = (msg) => { failures++; console.log(`  ✘ ${msg}`); };
const warn = (msg) => console.log(`  ⚠ ${msg}`);

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

async function checkClaims() {
  console.log("\n[1/4] Custom claims (backfill-claims.js)");
  const users = await db.collection("users").get();
  let withClub = 0;
  let claimed = 0;
  for (const doc of users.docs) {
    const u = doc.data();
    if (!u.teamId || u.teamId === "none") continue;
    withClub++;
    try {
      const authUser = await admin.auth().getUser(doc.id);
      const c = authUser.customClaims || {};
      if (c.teamId === u.teamId && ["lead", "staff", "player"].includes(c.role)) {
        claimed++;
      } else {
        bad(`${doc.id} (${u.email || "?"}): claims=${JSON.stringify(c)} vs doc teamId=${u.teamId}`);
      }
    } catch (e) {
      warn(`${doc.id} (${u.email || "?"}): no Auth account (${e.code || e.message})`);
    }
  }
  if (claimed === withClub && withClub > 0) {
    ok(`${claimed}/${withClub} club members have matching {teamId, role} claims`);
  } else if (withClub === 0) {
    bad("no users with a club found — unexpected");
  }
}

async function checkMigration() {
  console.log("\n[2/4] Migration counts (migrate-player-data.js)");
  const mappings = [
    ["fa_training_availability", "trainingAvail"],
    ["fa_match_availability", "matchAvail"],
    ["fa_player_rpe", "rpe"],
  ];
  const teams = await db.collection("teams").get();
  for (const team of teams.docs) {
    if (team.id === "_deploycheck") continue;
    for (const [legacyKey, coll] of mappings) {
      const blob = entriesOf(await db.collection("teams").doc(team.id)
          .collection("data").doc(legacyKey).get());
      const blobKeys = Object.keys(blob);
      const recSnap = await db.collection("teams").doc(team.id)
          .collection(coll).get();
      const recIds = new Set(recSnap.docs.map((d) => d.id));
      const missing = blobKeys.filter((k) => !recIds.has(k));
      if (missing.length === 0) {
        ok(`${team.id}/${coll}: blob=${blobKeys.length} records=${recSnap.size} missing=0`);
      } else {
        bad(`${team.id}/${coll}: blob=${blobKeys.length} records=${recSnap.size} ` +
            `MISSING=${missing.length} (e.g. ${missing.slice(0, 3).join(", ")}) — rerun migrate --apply`);
      }
    }
  }
}

async function checkBridge() {
  console.log("\n[3/4] Bridge trigger (bridgeLegacyPlayerData) — live end-to-end");
  const teamRef = db.collection("teams").doc("_deploycheck");
  const blobRef = teamRef.collection("data").doc("fa_training_availability");
  const recRef = teamRef.collection("trainingAvail").doc("checkuid_2000-01-01");
  const poll = async (want, label) => {
    for (let i = 0; i < 12; i++) {
      await new Promise((r) => setTimeout(r, 5000));
      const snap = await recRef.get();
      if (snap.exists === want) return snap;
      process.stdout.write(`    …waiting for ${label} (${(i + 1) * 5}s)\r`);
    }
    return null;
  };

  await blobRef.set({"checkuid_2000-01-01": "yes"}, {merge: true});
  const created = await poll(true, "record creation");
  if (created && created.exists) {
    const d = created.data();
    if (d.uid === "checkuid" && d.date === "2000-01-01" &&
        d.value === "yes" && d.source === "bridge") {
      ok("legacy write → record doc created with correct fields (source=bridge)");
    } else {
      bad(`record created but fields wrong: ${JSON.stringify(d)}`);
    }
  } else {
    bad("record doc NOT created within 60s — is the bridge function deployed?");
  }

  await blobRef.delete();
  const gone = await poll(false, "record deletion");
  if (gone !== null) {
    ok("legacy delete → record doc removed (bridge delete path works)");
  } else {
    bad("record doc NOT removed within 60s after legacy delete");
    await recRef.delete().catch(() => {});
  }
  await teamRef.delete().catch(() => {});
}

async function checkFrontend() {
  console.log("\n[4/4] Frontend (GitHub Pages)");
  const base = "https://scaredmeeseks.github.io/EsquerrApp";
  try {
    const sw = await (await fetch(`${base}/sw.js`, {cache: "no-store"})).text();
    const m = sw.match(/CACHE_NAME\s*=\s*'([^']+)'/);
    const v = m ? m[1] : "?";
    const CURRENT = "esquerrapp-v20"; // bump alongside sw.js
    if (v === CURRENT) ok(`sw.js CACHE_NAME = ${v} (latest frontend live)`);
    else bad(`sw.js CACHE_NAME = ${v} — expected ${CURRENT}; merge the phase branch to main`);

    const html = await (await fetch(`${base}/index.html`, {cache: "no-store"})).text();
    if (html.includes("firebase-functions-compat")) {
      ok("index.html loads firebase-functions-compat (joinClub/setRole callable)");
    } else {
      bad("index.html missing firebase-functions-compat script tag");
    }
  } catch (e) {
    bad(`could not fetch the live site: ${e.message}`);
  }
}

(async () => {
  console.log("=== EsquerrApp Phase 2 deployment check ===");
  await checkClaims();
  await checkMigration();
  await checkBridge();
  await checkFrontend();
  console.log(failures === 0 ?
    "\n✅ ALL CHECKS PASSED" :
    `\n❌ ${failures} CHECK(S) FAILED — see above`);
  process.exit(failures === 0 ? 0 : 1);
})().catch((e) => {
  console.error("CHECK CRASHED:", e);
  process.exit(1);
});
