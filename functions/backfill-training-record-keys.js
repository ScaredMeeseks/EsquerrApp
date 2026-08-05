// ============================================================
// Re-key training records from the date to the session id.
//
//   trainingAvail/{uid}_{date}          ->  {uid}_{sessionId}
//   rpe/{uid}_training_{date}           ->  {uid}_training_{sessionId}
//
// Why: a player could only ever hold ONE answer per day. Guest call-ups
// break that — borrowed for another squad's evening session, his two
// answers collide and the second silently overwrites the first.
//
// This script only ever CREATES. The legacy document is never modified and
// never deleted:
//   * the v43-era APK still reads and writes the date form, and
//   * a wrong join is then recoverable by deleting everything carrying
//     `migratedFrom` and re-running, with the source untouched throughout.
//
// The app reads both formats already (see readRecord in js/app.js), so
// nothing breaks whether this has run or not. It removes the collision;
// it does not enable the feature.
//
//   node functions/backfill-training-record-keys.js                  # dry run, all clubs
//   node functions/backfill-training-record-keys.js --club <id>      # dry run, one club
//   node functions/backfill-training-record-keys.js --apply --club <id>
//   node functions/backfill-training-record-keys.js --verify --club <id>
//
// Run from the repo root — it requires ../js/shard.js.
//
// AMBIGUITY IS NEVER GUESSED. A record whose date matches two sessions in
// the player's own category is skipped and logged for a human. A wrong but
// silent resolution is far worse than a slower migration.
// ============================================================
"use strict";

const path = require("path");
const admin = require("firebase-admin");
const Shard = require(path.join(__dirname, "..", "js", "shard.js"));
const {preflight} = require(path.join(__dirname, "preflight-adc.js"));

const argv = process.argv.slice(2);
const has = (f) => argv.includes(f);
const val = (f, d) => {
  const i = argv.indexOf(f);
  return i !== -1 && argv[i + 1] && !argv[i + 1].startsWith("--") ? argv[i + 1] : d;
};

const APPLY = has("--apply");
const VERIFY = has("--verify");
const ONLY_CLUB = val("--club", null);

const SEP = "  ";
const log = (...a) => console.log(...a);
const step = (m) => log(`\n${m}`);
const ok = (m) => log(`${SEP}✔ ${m}`);
const warn = (m) => log(`${SEP}! ${m}`);

admin.initializeApp({projectId: "esquerrapp"});
const db = admin.firestore();
const {FieldValue} = admin.firestore;

function parseBlob(d) {
  if (!d || typeof d.v !== "string") return [];
  try {
    const p = JSON.parse(d.v);
    return Array.isArray(p) ? p : [];
  } catch (e) {
    throw new Error("unparseable shard — refusing to read it");
  }
}

/** uid -> category, and category|date -> [session], from the data/ shards. */
async function indexClub(teamId) {
  const catOf = new Map();
  const byCatDate = new Map();
  const snap = await db.collection("teams").doc(teamId).collection("data").get();
  snap.forEach((d) => {
    const parts = Shard.parseDocId(d.id);
    if (!parts) return;
    if (parts.key === "fa_users") {
      parseBlob(d.data()).forEach((u) => {
        if (u && u.id) catOf.set(String(u.id), u.category || "");
      });
    }
    if (parts.key === "fa_training") {
      parseBlob(d.data()).forEach((t) => {
        if (!t || !t.id || !t.date) return;
        const cat = t.category || parts.cat;
        const k = cat + "|" + t.date;
        if (!byCatDate.has(k)) byCatDate.set(k, []);
        byCatDate.get(k).push(t);
      });
    }
  });
  return {catOf, byCatDate};
}

/**
 * A record is legacy when its id is exactly what the date form would build.
 * Derived from the doc's own fields rather than by pattern-matching the id,
 * so no assumption is made about the shape of a uid.
 */
function legacyIdFor(coll, data) {
  if (!data || !data.uid || !data.date) return null;
  return coll === "rpe" ?
    `${data.uid}_training_${data.date}` :
    `${data.uid}_${data.date}`;
}

function newIdFor(coll, uid, sessionId) {
  return coll === "rpe" ?
    `${uid}_training_${sessionId}` :
    `${uid}_${sessionId}`;
}

async function migrateColl(teamId, coll, idx) {
  const ref = db.collection("teams").doc(teamId).collection(coll);
  const snap = await ref.get();
  const out = {total: 0, legacy: 0, migrated: 0, already: 0,
    orphan: 0, ambiguous: 0, noCategory: 0};
  const ambiguities = [];
  let batch = db.batch();
  let pending = 0;

  for (const d of snap.docs) {
    const data = d.data() || {};
    out.total++;
    // Only session RPE is date-keyed; match and extra RPE already carry an
    // unambiguous id of their own.
    if (coll === "rpe" && data.tag !== "training") continue;
    if (d.id !== legacyIdFor(coll, data)) { out.already++; continue; }
    out.legacy++;

    const cat = idx.catOf.get(String(data.uid));
    if (cat === undefined) { out.noCategory++; continue; }
    const candidates = idx.byCatDate.get(cat + "|" + data.date) || [];
    if (!candidates.length) { out.orphan++; continue; }
    if (candidates.length > 1) {
      out.ambiguous++;
      ambiguities.push(`${data.uid} ${data.date} -> ${candidates.map((c) => c.id).join(", ")}`);
      continue;
    }

    const sessionId = candidates[0].id;
    out.migrated++;
    if (!APPLY) continue;
    /* create(), never set(): ALREADY_EXISTS is swallowed below, so a
       re-run is a no-op and a record the app has since written by hand is
       never clobbered. */
    batch.create(ref.doc(newIdFor(coll, data.uid, sessionId)),
        Object.assign({}, data, {
          sessionId,
          migratedFrom: d.id,
          migratedAt: FieldValue.serverTimestamp(),
        }));
    pending++;
    if (pending >= 400) {
      await batch.commit().catch((e) => {
        if (!/ALREADY_EXISTS/.test(String(e))) throw e;
      });
      batch = db.batch();
      pending = 0;
    }
  }
  if (APPLY && pending) {
    await batch.commit().catch((e) => {
      if (!/ALREADY_EXISTS/.test(String(e))) throw e;
    });
  }
  if (ambiguities.length) {
    warn(`${coll}: ${ambiguities.length} AMBIGUOUS, skipped — resolve by hand:`);
    ambiguities.slice(0, 20).forEach((a) => log(`${SEP}${SEP}${a}`));
    if (ambiguities.length > 20) log(`${SEP}${SEP}… and ${ambiguities.length - 20} more`);
  }
  return out;
}

async function verifyColl(teamId, coll) {
  const snap = await db.collection("teams").doc(teamId).collection(coll).get();
  let migrated = 0; let legacyLeft = 0; let native = 0;
  snap.forEach((d) => {
    const data = d.data() || {};
    if (coll === "rpe" && data.tag !== "training") return;
    if (data.migratedFrom) { migrated++; return; }
    if (d.id === legacyIdFor(coll, data)) { legacyLeft++; return; }
    native++;
  });
  ok(`${coll}: ${migrated} migrated, ${native} written natively, ` +
     `${legacyLeft} legacy still present (kept on purpose)`);
}

(async () => {
  log("=== re-key training records to the session id ===");
  log(APPLY ? "MODE: APPLY (creating new documents)" :
    VERIFY ? "MODE: verify" : "MODE: dry run (nothing will be written)");

  await preflight(db);

  const clubs = ONLY_CLUB ?
    [await db.collection("clubs").doc(ONLY_CLUB).get()] :
    (await db.collection("clubs").get()).docs;

  for (const c of clubs) {
    if (!c.exists) { log(`\nclub ${ONLY_CLUB} does not exist`); continue; }
    step(`${c.id} — ${(c.data() || {}).name || "(unnamed)"}`);
    if (VERIFY) {
      await verifyColl(c.id, "trainingAvail");
      await verifyColl(c.id, "rpe");
      continue;
    }
    const idx = await indexClub(c.id);
    for (const coll of ["trainingAvail", "rpe"]) {
      const r = await migrateColl(c.id, coll, idx);
      ok(`${coll}: ${r.total} docs · ${r.legacy} legacy · ` +
         `${r.migrated} ${APPLY ? "migrated" : "to migrate"} · ${r.already} already session-keyed`);
      if (r.orphan) warn(`${coll}: ${r.orphan} orphaned (their session no longer exists) — left alone`);
      if (r.noCategory) warn(`${coll}: ${r.noCategory} from members not in the roster — left alone`);
    }
  }

  step("Done");
  if (!APPLY && !VERIFY) {
    log(`${SEP}Nothing was written. Re-run with --apply once the counts look right.`);
    log(`${SEP}Any AMBIGUOUS line above must be resolved by hand first.`);
  }
})().catch((e) => {
  console.error(e && e.userError ? `\nFAILED: ${e.message}` :
    `\nFAILED: ${e && e.stack || e}`);
  process.exit(1);
});
