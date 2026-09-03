// ============================================================
// Deployment verification — read-only except for one throwaway
// test team (`_deploycheck`) used to confirm legacy data/ writes
// are inert (bridge retired in Phase 3b), cleaned up after.
//
// Checks:
//   1. Custom claims present on every club member (backfill worked)
//   1b. Roster email lists: everyone placeable, staff have categories
//   2. Migration counts: legacy blob entries vs per-record docs
//   3. Bridge retirement (3b): a legacy write must NOT create a record
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
  console.log("\n[1/5] Custom claims (backfill-claims.js)");
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

// Every club member must be placeable from the roster email lists, and every
// staff member must have a non-empty `cats` claim — with the lists as the
// membership gate, an unlisted staff member sees nothing at all.
async function checkRosters() {
  console.log("\n[1b/5] Roster email lists (prefill-rosters.js)");
  const clubs = await db.collection("clubs").get();
  for (const clubDoc of clubs.docs) {
    const club = clubDoc.data();
    const leadEmail = String(club.leadEmail || "").toLowerCase();
    const rosters = await clubDoc.ref.collection("rosters").get();
    const listed = new Set();
    /* Sub-role per staff address, resolved the way membershipFrom() does:
       any list that leaves them undowngraded wins, and two different
       downgrades cancel back to coach. Audited below against the user doc —
       drift here is invisible in the app until the wrong sections vanish. */
    const subRoleSeen = {};
    rosters.forEach((d) => {
      const v = d.data() || {};
      [].concat(v.staffEmails || [], v.playerEmails || [])
          .forEach((e) => listed.add(String(e || "").trim().toLowerCase()));
      const map = v.staffRoles || {};
      (v.staffEmails || []).forEach((raw) => {
        const e = String(raw || "").trim().toLowerCase();
        if (!e) return;
        const r = String(map[e] || "coach").trim().toLowerCase();
        (subRoleSeen[e] = subRoleSeen[e] || []).push(r);
      });
    });
    const subRoleOf = (email) => {
      const found = subRoleSeen[email] || [];
      if (!found.length) return "coach";
      if (found.includes("coach")) return "coach";
      const distinct = [...new Set(found)];
      return distinct.length === 1 ? distinct[0] : "coach";
    };

    // Members who actually need to be on a list. The lead and the superuser
    // bypass the gate, so they are never listed and must not count here.
    const users = await db.collection("users")
        .where("teamId", "==", clubDoc.id).get();
    const members = users.docs.filter((d) => {
      const e = String((d.data() || {}).email || "").toLowerCase();
      return e !== leadEmail && e !== "marna96@gmail.com";
    });

    if (rosters.empty) {
      // No roster docs is only a fault if there is somebody to list. A club
      // whose sole member is its lead — a freshly created one, say — has
      // nothing for prefill to write, and prefill correctly wrote nothing.
      if (!members.length) {
        warn(`${clubDoc.id}: no roster docs, but no members besides the lead ` +
             "— nothing to list. Registration stays closed until the lead " +
             "adds addresses, which is the intended behaviour.");
      } else {
        bad(`${clubDoc.id}: ${members.length} member(s) but NO roster docs — ` +
            "run prefill-rosters.js --apply");
      }
    } else {
      ok(`${clubDoc.id}: ${rosters.size} roster docs, ` +
         `${listed.size} addresses listed`);
    }

    for (const uDoc of members) {
      const u = uDoc.data();
      const email = String(u.email || "").toLowerCase();
      if (!listed.has(email)) {
        bad(`${clubDoc.id}/${u.name || uDoc.id} <${email}>: on no roster list`);
        continue;
      }
      if ((u.roles || []).includes("staff")) {
        const cats = u.staffCategories || [];
        if (!cats.length) {
          bad(`${clubDoc.id}/${u.name || uDoc.id}: staff with NO categories — ` +
              "they will see the empty state on every staff page");
        }
        try {
          const c = (await admin.auth().getUser(uDoc.id)).customClaims || {};
          if (!Array.isArray(c.cats) || c.cats.length !== cats.length) {
            bad(`${clubDoc.id}/${u.name || uDoc.id}: cats claim ` +
                `${JSON.stringify(c.cats)} != doc ${JSON.stringify(cats)}`);
          }
        } catch (e) { /* no Auth account — already warned in [1/5] */ }
        // The sub-role is UI-only, so a mismatch never denies a write — it
        // just shows or hides the wrong sections, silently.
        const want = subRoleOf(email);
        const have = String(u.staffRole || "coach");
        if (have !== want) {
          bad(`${clubDoc.id}/${u.name || uDoc.id}: staffRole "${have}" != ` +
              `roster "${want}" — onRosterWritten did not re-derive it`);
        }
      }
    }
  }
}

async function checkMigration() {
  console.log("\n[2/5] Migration counts (migrate-player-data.js)");
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
        // Post-3b the blob is FROZEN: records deleted afterwards (un-answers,
        // RPE pruning) legitimately diverge from it. Only a large gap right
        // after the final reconcile means migrate --apply must be rerun.
        warn(`${team.id}/${coll}: blob=${blobKeys.length} records=${recSnap.size} ` +
            `missing=${missing.length} (e.g. ${missing.slice(0, 3).join(", ")}) — ` +
            `expected post-3b deletions OR rerun migrate --apply if just reconciled`);
      }
    }
  }
}

async function checkBridge() {
  console.log("\n[3/5] Bridge retirement (Phase 3b) — legacy writes must be inert");
  const teamRef = db.collection("teams").doc("_deploycheck");
  const blobRef = teamRef.collection("data").doc("fa_training_availability");
  const recRef = teamRef.collection("trainingAvail").doc("checkuid_2000-01-01");

  await blobRef.set({"checkuid_2000-01-01": "yes"}, {merge: true});
  await new Promise((r) => setTimeout(r, 30000));
  const snap = await recRef.get();
  if (snap.exists) {
    bad("legacy write STILL creates a record doc — bridgeLegacyPlayerData " +
        "is still deployed; confirm the functions deploy deleted it");
    await recRef.delete().catch(() => {});
  } else {
    ok("legacy write produced no record doc within 30s (bridge deleted)");
  }
  await blobRef.delete();
  await teamRef.delete().catch(() => {});
}

async function checkFrontend() {
  console.log("\n[4/5] Frontend (GitHub Pages)");
  const base = "https://scaredmeeseks.github.io/EsquerrApp";
  try {
    const sw = await (await fetch(`${base}/sw.js`, {cache: "no-store"})).text();
    const m = sw.match(/CACHE_NAME\s*=\s*'([^']+)'/);
    const v = m ? m[1] : "?";
    const CURRENT = "esquerrapp-v222"; // bump alongside sw.js
    if (v === CURRENT) ok(`sw.js CACHE_NAME = ${v} (latest frontend live)`);
    else bad(`sw.js CACHE_NAME = ${v} — expected ${CURRENT}; merge the phase branch to main`);

    // APP_VERSION drives the "old build" banner. If it lags sw.js, every
    // bundled APK claims to be current and the banner never fires.
    const appJs = await (await fetch(`${base}/js/app.js`, {cache: "no-store"})).text();
    const am = appJs.match(/const APP_VERSION\s*=\s*(\d+)/);
    const swNum = (v.match(/v(\d+)$/) || [])[1];
    if (!am) bad("js/app.js has no APP_VERSION constant");
    else if (swNum && am[1] !== swNum) {
      bad(`APP_VERSION = ${am[1]} but sw.js is v${swNum} — bump them together`);
    } else ok(`APP_VERSION = ${am[1]} (matches sw.js)`);

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
  console.log("=== EsquerrApp deployment check ===");
  await checkClaims();
  await checkRosters();
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
