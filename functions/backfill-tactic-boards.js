// ============================================================
// Explode the tactical-board blobs into one document per board.
//
// Boards live in `teams/{clubId}/data/fa_tactic_saved__{category}`, one
// document per category holding the WHOLE library as a single JSON string.
// That model has no room for an owner, cannot be read by a coach who has
// moved club, and hits Firestore's 1 MiB document limit at roughly 85 boards
// (or at one 40-frame animation, since every keyframe is a full deep copy of
// the board). This writes each board as its own pair of documents:
//
//     tacticBoards/{boardId}      metadata — small, listed, queryable
//     tacticBoardData/{boardId}   payload  — the board itself, as a string
//
// NOTHING IS DELETED. The blob shards stay exactly as they are, so the app
// keeps working from them until the frontend switches over, and a mistake
// here costs nothing but some documents to remove. The `--gc` sweep that
// removes the old shards is a separate, later job.
//
//   node functions/backfill-tactic-boards.js                # dry run, ALL clubs
//   node functions/backfill-tactic-boards.js --club <id>    # dry run, one club
//   node functions/backfill-tactic-boards.js --apply        # write
//   node functions/backfill-tactic-boards.js --apply --authors
//
// --authors additionally seeds clubs/{clubId}/boardAuthors/{uid} for every
// CURRENT staff member of every club. Without it those labels only appear the
// next time somebody edits a roster, so an existing coach's boards would
// render authorless until then. Safe and idempotent on its own.
//
// Run from the repo root on Cloud Shell — it requires ../js/shard.js, so
// running from ~ fails MODULE_NOT_FOUND. Credentials come from ADC, which is
// automatic there. If it cannot authenticate, preflight-adc.js says what to
// do; the short version is `gcloud auth list`, and if that reports no
// accounts, restart the VM.
//
// Idempotent twice over: a board whose document already exists with
// `schema >= 1` is skipped, and a board with no `id` of its own gets a
// DETERMINISTIC one derived from club + category + name, so a re-run mints
// the same id rather than a duplicate.
// ============================================================
"use strict";

const path = require("path");
const crypto = require("crypto");
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
const ONLY_CLUB = val("--club", null);
const DO_AUTHORS = has("--authors");

const SEP = "  ";
const log = (...a) => console.log(...a);
const step = (m) => log(`\n${m}`);
const ok = (m) => log(`${SEP}✔ ${m}`);
const warn = (m) => log(`${SEP}! ${m}`);

admin.initializeApp({projectId: "esquerrapp"});
const db = admin.firestore();
const FieldValue = admin.firestore.FieldValue;

const KEY = "fa_tactic_saved";

/* CATEGORY_ORDER, again. js/utils.js, js/shard.js and functions/index.js each
   hold one; this script takes Shard's copy rather than adding a fourth, and
   shard.test.js already pins that copy against utils.js. */
const ORDER = Shard.ORDER;

/** Lowest index wins — amateur outranks benjami. Mirrors shardRank(). */
function rankOf(cat) {
  const i = ORDER.indexOf(cat);
  if (i !== -1) return i;
  return cat === Shard.NONE ? 90 : 99;
}

/* Mirrors authorLabelFrom() in functions/index.js. The two cannot share code
   — this script is not deployed and index.js must not export non-function
   values, which would confuse the CLI's export discovery — so
   test/board-authors.test.js runs both copies over the same fixtures and
   fails if they disagree. */
function authorLabelFrom(rosters, email) {
  if (!email) return null;
  const keys = rosters.filter((r) => r.staff.includes(email)).map((r) => r.key);
  if (!keys.length) return null;
  const catOf = (k) => {
    const dash = k.indexOf("-");
    return dash === -1 ? k : k.slice(0, dash);
  };
  let best = null;
  keys.forEach((k) => {
    const rank = rankOf(catOf(k));
    if (!best || rank < best.rank) best = {category: catOf(k), rank};
  });
  best.letters = keys
      .filter((k) => catOf(k) === best.category)
      .map((k) => {
        const dash = k.indexOf("-");
        return dash === -1 ? "" : k.slice(dash + 1);
      })
      .filter(Boolean)
      .sort();
  return best;
}

function parseBlob(d) {
  if (!d || typeof d.v !== "string") return [];
  let p;
  try {
    p = JSON.parse(d.v);
  } catch (e) {
    // Never treat an unparseable shard as empty. Silently skipping it would
    // report "0 boards" for a club that has a library, and the operator would
    // reasonably believe there was nothing to migrate.
    throw new Error("unparseable " + KEY + " shard — refusing to guess");
  }
  return Array.isArray(p) ? p : [];
}

/**
 * A stable id for a board that has none.
 *
 * `ensureBoardIds()` has minted ids client-side for a while, so nearly every
 * board has one — but a library untouched since before that shipped may not,
 * and a random id would create a fresh duplicate on every run. Deriving it
 * from club + category + name makes a re-run land on the same document.
 */
function derivedId(clubId, cat, name) {
  const h = crypto.createHash("sha1")
      .update(clubId + "|" + cat + "|" + String(name || ""))
      .digest("hex");
  return "tb_" + h.slice(0, 16);
}

/** Strip anything that has no business in a per-board payload. */
function cleanPayload(entry) {
  const copy = Object.assign({}, entry);
  // linkedTeams embeds player ids and names. It is per-SESSION data that was
  // only ever attached to a board by accident of storage, and leaving it here
  // would put player names in a document the whole club can read regardless
  // of category — the one thing the new read rule relies on not happening.
  delete copy.linkedTeams;
  delete copy.ownerUid;
  delete copy.clubId;
  return copy;
}

async function backfillClub(clubId) {
  const dataCol = db.collection("teams").doc(clubId).collection("data");
  const snap = await dataCol.get();

  const shards = [];
  snap.forEach((d) => {
    const parts = Shard.parseDocId(d.id);
    if (parts && parts.key === KEY) shards.push({cat: parts.cat, data: d.data()});
  });
  shards.sort((a, b) => rankOf(a.cat) - rankOf(b.cat));

  const planned = [];
  const seen = new Set();
  let duplicates = 0;
  for (const s of shards) {
    for (const entry of parseBlob(s.data)) {
      if (!entry || typeof entry !== "object") continue;
      const id = entry.id || derivedId(clubId, s.cat, entry.name);
      if (seen.has(id)) {
        // Two boards sharing an id (or a name, pre-ids) inside one club. The
        // second would overwrite the first, so leave it and say so.
        duplicates++;
        continue;
      }
      seen.add(id);
      planned.push({id, cat: s.cat, entry});
    }
  }
  if (!planned.length) return {boards: 0, created: 0, skipped: 0, duplicates, bytes: 0};

  // Which already exist. Chunked `in` queries on documentId, 10 at a time —
  // far cheaper than a get() per board on a club with a big library.
  const existing = new Set();
  const ids = planned.map((p) => p.id);
  for (let i = 0; i < ids.length; i += 10) {
    const chunk = ids.slice(i, i + 10);
    const got = await db.collection("tacticBoards")
        .where(admin.firestore.FieldPath.documentId(), "in", chunk).get();
    got.forEach((d) => {
      if ((d.data() || {}).schema >= 1) existing.add(d.id);
    });
  }

  let created = 0;
  let skipped = 0;
  let bytes = 0;
  let batch = db.batch();
  let ops = 0;

  for (const p of planned) {
    if (existing.has(p.id)) {
      skipped++;
      continue;
    }
    const v = JSON.stringify(cleanPayload(p.entry));
    const size = Buffer.byteLength(v, "utf8");
    bytes += size;
    created++;
    if (!APPLY) continue;

    const frames = Array.isArray(p.entry.frames) ? p.entry.frames : [];
    batch.set(db.collection("tacticBoards").doc(p.id), {
      // '' and not the club lead: there is genuinely no author information
      // anywhere in the old model, and attributing these to the lead would
      // be a lie that also FOLLOWS THEM to their next club through the owner
      // read arm. '' matches no request.auth.uid, so the club arm is the
      // only way in — "a board of the club, authored by nobody in
      // particular", which is the truth. Any staff of the club may adopt it.
      ownerUid: "",
      ownerName: "",
      clubId,
      category: p.cat === Shard.NONE ? "" : p.cat,
      name: String(p.entry.name || "Board"),
      tag: String(p.entry.tag || ""),
      formation: String(p.entry.formation || ""),
      boardType: String(p.entry.boardType || "full"),
      hasFrames: frames.length > 1,
      frameCount: frames.length,
      bytes: size,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
      schema: 1,
    });
    batch.set(db.collection("tacticBoardData").doc(p.id),
        {ownerUid: "", clubId, v, schema: 1});
    ops += 2;
    // 500 is the hard limit; 400 leaves room and keeps each commit quick.
    if (ops >= 400) {
      await batch.commit();
      batch = db.batch();
      ops = 0;
    }
  }
  if (APPLY && ops) await batch.commit();

  return {boards: planned.length, created, skipped, duplicates, bytes};
}

async function seedAuthors(clubId) {
  const rosterSnap = await db.collection("clubs").doc(clubId)
      .collection("rosters").get();
  const rosters = rosterSnap.docs.map((d) => ({
    key: d.id,
    staff: ((d.data() || {}).staffEmails || [])
        .map((e) => String(e || "").trim().toLowerCase()).filter(Boolean),
  }));
  const emails = [...new Set(rosters.reduce((a, r) => a.concat(r.staff), []))];
  if (!emails.length) return {staff: 0, written: 0, unregistered: 0};

  let written = 0;
  let unregistered = 0;
  for (const email of emails) {
    const userSnap = await db.collection("users")
        .where("teamId", "==", clubId).where("email", "==", email)
        .limit(1).get();
    if (userSnap.empty) {
      // joinClub writes the label when they register. Nothing to do yet.
      unregistered++;
      continue;
    }
    const label = authorLabelFrom(rosters, email);
    if (!label) continue;
    written++;
    if (!APPLY) continue;
    const doc = userSnap.docs[0];
    await db.collection("clubs").doc(clubId)
        .collection("boardAuthors").doc(doc.id).set({
          name: (doc.data() || {}).name || "",
          email,
          category: label.category,
          categoryRank: label.rank,
          letters: label.letters,
          active: true,
          deleted: false,
          leftAt: null,
          updatedAt: FieldValue.serverTimestamp(),
        }, {merge: true});
  }
  return {staff: emails.length, written, unregistered};
}

async function main() {
  await preflight(db);

  step(APPLY ? "APPLYING" : "DRY RUN — nothing will be written");
  if (ONLY_CLUB) ok(`club filter: ${ONLY_CLUB}`);
  if (DO_AUTHORS) ok("will also seed boardAuthors labels");

  const clubsSnap = ONLY_CLUB ?
    [await db.collection("clubs").doc(ONLY_CLUB).get()] :
    (await db.collection("clubs").get()).docs;

  const totals = {boards: 0, created: 0, skipped: 0, duplicates: 0, bytes: 0};
  for (const c of clubsSnap) {
    if (!c.exists) {
      warn(`club ${ONLY_CLUB} does not exist`);
      continue;
    }
    const clubId = c.id;
    const name = (c.data() || {}).name || "(unnamed)";
    step(`${clubId} — ${name}`);

    const r = await backfillClub(clubId);
    Object.keys(totals).forEach((k) => {
      if (r[k] !== undefined) totals[k] += r[k];
    });
    if (!r.boards) {
      ok("no tactical boards");
    } else {
      ok(`${r.boards} boards: ${r.created} to write, ${r.skipped} already done` +
        (r.duplicates ? `, ${r.duplicates} DUPLICATE ids skipped` : ""));
      ok(`payload total ${(r.bytes / 1024).toFixed(1)} KB, ` +
        `largest allowed is 1024 KB per document`);
    }

    if (DO_AUTHORS) {
      const a = await seedAuthors(clubId);
      ok(`authors: ${a.written} of ${a.staff} staff labelled` +
        (a.unregistered ? `, ${a.unregistered} not registered yet` : ""));
    }
  }

  step("TOTAL");
  ok(`${totals.boards} boards seen, ${totals.created} ` +
    `${APPLY ? "written" : "would be written"}, ${totals.skipped} already done`);
  if (totals.duplicates) {
    warn(`${totals.duplicates} boards skipped for duplicate ids — ` +
      "look at these before assuming the migration is complete");
  }
  if (!APPLY) {
    step("Re-run with --apply to write. Nothing was changed.");
  } else {
    step("Done. The old fa_tactic_saved shards are UNTOUCHED — the app still " +
      "reads them until the frontend switches over.");
  }
}

main().then(() => process.exit(0)).catch((e) => {
  if (e && e.userError) {
    console.error(`\n  ✖ ${e.message}\n`);
  } else {
    console.error(e);
  }
  process.exit(1);
});
