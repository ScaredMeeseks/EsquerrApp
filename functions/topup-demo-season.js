#!/usr/bin/env node
/**
 * topup-demo-season.js — fill the gaps in an ALREADY SEEDED demo club.
 *
 *   node functions/topup-demo-season.js --club <id>            # DRY RUN
 *   node functions/topup-demo-season.js --club <id> --apply    # write
 *
 * ─── Why this exists rather than re-running the seeder ───────────────────
 *
 * `seed-demo-club.js --apply` builds a club FROM NOTHING. Pointed at a
 * populated one it destroys it three ways, all silent: it rewrites the whole
 * `categories` map, it REPLACES data shards with a bare set() — and `fa_users`
 * is routed by category with no team letter, so `fa_users__amateur` would lose
 * amateur-B and juvenil-A — and it resets every Auth password. It is guarded
 * by neither the `demoSeed` stamp nor PROTECTED_CLUBS; only `--purge` and
 * `--add-team` are.
 *
 * This script is the opposite by construction:
 *
 *   - it only ever ADDS. Nothing is deleted, no user is touched, no Auth
 *     account is created or reset, the `categories` map is not written;
 *   - every shard write is a READ-MERGE-WRITE keyed by row id, never a set();
 *   - every per-record write is create-only: an existing answer is left alone,
 *     because a real answer from a demo login is more valuable than a
 *     fabricated one;
 *   - it refuses any club that is not stamped `demoSeed: true`, and any club
 *     in PROTECTED_CLUBS — the same two gates purge() uses.
 *
 * ─── What it fills ──────────────────────────────────────────────────────
 *
 * 1. Matches whose date has passed but which still say `status: "upcoming"`.
 *    The seeder stamps status once at generation and never revisits it, so a
 *    club seeded weeks ago has a pile of "upcoming" matches in the past.
 * 2. `fa_match_events` for played matches that have none. The score is
 *    RECOMPUTED from events at render time (js/app.js calcMatchScore), so a
 *    played match without events renders 0-0 whatever `m.score` says.
 * 3. `fa_convocatoria_sent` for played matches that have none. Without it a
 *    match contributes ZERO to every player's stats and never appears in
 *    their history (js/app.js computePlayerMatchStats).
 * 4. `trainingAvail` for past sessions, then `rpe` for the players who
 *    answered yes/late. Readiness needs the WHOLE chain — session →
 *    availability → rpe — or the session is silently skipped, not shown as a
 *    gap.
 *
 * Nothing is written dated before the club's `seasonBoundary`: six read-time
 * filters in app.js slice on it, so earlier rows are invisible anyway.
 *
 * Finally it recomputes `teams/{id}.trainingDates` / `.matchDates` from the
 * shards, because every push reminder queries those arrays and they go stale
 * the moment a session is added by anything but the app.
 */
"use strict";

const path = require("path");
const Shard = require(path.join(__dirname, "..", "js", "shard.js"));

// Same list seed-demo-club.js protects. Kept in sync by hand, deliberately:
// a shared module would let one edit widen the blast radius of both scripts.
const PROTECTED_CLUBS = new Set([
  "nDLJCpJfDvFHs8MnwtzW", // Esquerra de l'Eixample F.C.
  "lly4GkUxIpBkSgZvzldT", // F.C.Barcelona test club
  "default",
]);

// ── CLI ──
const argv = process.argv.slice(2);
const has = (f) => argv.includes(f);
const val = (f, d) => {
  const i = argv.indexOf(f);
  return i !== -1 && argv[i + 1] ? argv[i + 1] : d;
};
const APPLY = has("--apply");
const CLUB = val("--club", "");
const SEED = Number(val("--seed", "20260819"));

function die(msg) {
  console.error("\nERROR: " + msg + "\n");
  process.exit(1);
}
const log = (s) => console.log(s);
const step = (s) => console.log("\n── " + s + " " + "─".repeat(Math.max(0, 56 - s.length)));

if (!CLUB) die("--club <id> is required.");

// ── Deterministic RNG, so a dry run and the apply that follows agree ──
function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
let rnd = mulberry32(SEED);
const rint = (lo, hi) => lo + Math.floor(rnd() * (hi - lo + 1));
const pick = (a) => a[Math.floor(rnd() * a.length)];
const chance = (p) => rnd() < p;
function weighted(pairs) {
  const total = pairs.reduce((s, [, w]) => s + w, 0);
  let r = rnd() * total;
  for (const [v, w] of pairs) { r -= w; if (r <= 0) return v; }
  return pairs[pairs.length - 1][0];
}

// ── Firebase ──
const admin = require("firebase-admin");
admin.initializeApp({projectId: "esquerrapp"});
const db = admin.firestore();
const {FieldValue} = require("firebase-admin/firestore");

const todayStr = new Date().toISOString().slice(0, 10);

/** Season start for a boundary like "03-01", mirroring utils.js seasonStartStr. */
function seasonStart(boundary) {
  const b = /^\d{2}-\d{2}$/.test(boundary || "") ? boundary : "08-15";
  const y = new Date().getFullYear();
  return todayStr >= y + "-" + b ? y + "-" + b : (y - 1) + "-" + b;
}

const blobOf = (doc) => {
  if (!doc || !doc.exists) return null;
  const d = doc.data() || {};
  if (typeof d.v !== "string") return null;
  try { return JSON.parse(d.v); } catch (e) {
    // Never merge over something we cannot read — that is data loss dressed
    // up as a successful run.
    die(`${doc.id} holds unparseable JSON. Inspect it by hand before re-running.`);
  }
  return null;
};

async function main() {
  step("Preflight");
  if (PROTECTED_CLUBS.has(CLUB)) {
    die(`${CLUB} is a PROTECTED club. This script will not touch it.`);
  }
  const clubSnap = await db.collection("clubs").doc(CLUB).get();
  if (!clubSnap.exists) die(`clubs/${CLUB} does not exist.`);
  const club = clubSnap.data() || {};
  if (club.demoSeed !== true) {
    die(`clubs/${CLUB} is not stamped demoSeed:true.\n` +
        "    Only clubs seed-demo-club.js created may be topped up.");
  }
  const start = seasonStart(club.seasonBoundary);
  log(`club        : ${club.name || "(unnamed)"}`);
  log(`seasonBound : ${club.seasonBoundary || "(default 08-15)"}  → season starts ${start}`);
  log(`today       : ${todayStr}`);
  log(`mode        : ${APPLY ? "APPLY (will write)" : "DRY RUN (no writes)"}`);

  const dataCol = db.collection("teams").doc(CLUB).collection("data");
  const dataSnap = await dataCol.get();
  const docs = new Map(dataSnap.docs.map((d) => [d.id, d]));
  const cats = [...new Set(dataSnap.docs
      .map((d) => d.id.split(Shard.SEP)[1])
      .filter((c) => c && c !== "none"))];
  log(`categories  : ${cats.join(", ") || "(none)"}`);

  const writes = [];   // {ref, data, merge}
  const records = [];  // {ref, data}
  const summary = {matchesPlayed: 0, events: 0, convocatories: 0, avail: 0, rpe: 0};

  for (const cat of cats) {
    rnd = mulberry32(SEED + cat.length); // stable per category
    const key = (k) => k + Shard.SEP + cat;

    const players = (blobOf(docs.get(key("fa_users"))) || [])
        .filter((u) => Array.isArray(u.roles) ? u.roles.includes("player") : true);
    if (!players.length) { log(`\n${cat}: no players in fa_users — skipped`); continue; }

    // Injured players must never be marked available: the roster badge and
    // the medical page would contradict each other, which is exactly the
    // kind of detail a football person spots immediately.
    const injuredUids = new Set((blobOf(docs.get(key("fa_injuries"))) || [])
        .filter((i) => i && i.status !== "recovered")
        .map((i) => String(i.playerId || i.uid)));

    step(`${cat} — ${players.length} players, ${injuredUids.size} injured`);

    // ── 1/2/3. Matches ──
    const matches = blobOf(docs.get(key("fa_matches"))) || [];
    const events = blobOf(docs.get(key("fa_match_events"))) || {};
    const convo = blobOf(docs.get(key("fa_convocatoria_sent"))) || {};
    let mChanged = false; let eChanged = false; let cChanged = false;

    for (const m of matches) {
      if (!m.date || m.date >= todayStr || m.date < start) continue;
      if (m.status !== "played") { m.status = "played"; mChanged = true; summary.matchesPlayed++; }

      const squad = players.slice(0, Math.min(18, players.length));
      const xi = squad.slice(0, Math.min(11, squad.length));

      if (!convo[m.id]) {
        convo[m.id] = {
          players: squad.map((p) => p.id || p.uid),
          jersey: "white", socks: "striped", videos: [],
          startingXI: xi.map((p) => p.id || p.uid),
        };
        cChanged = true; summary.convocatories++;
      }

      if (!events[m.id] || !events[m.id].length) {
        const ourSide = (m.home && club.name && m.home === club.name) ? "home" : "away";
        const oppSide = ourSide === "home" ? "away" : "home";
        const ev = [];
        const add = (e) => ev.push(Object.assign({
          id: `${new Date(m.date).getTime()}_${Math.floor(rnd() * 1e6).toString(36)}`,
        }, e));
        // Same distribution the seeder uses: the demo club finishes in the
        // top third without the table ceasing to look like amateur football.
        const ours = weighted([[0, 10], [1, 26], [2, 30], [3, 20], [4, 10], [5, 4]]);
        const theirs = weighted([[0, 28], [1, 36], [2, 22], [3, 10], [4, 3], [5, 1]]);
        for (let g = 0; g < ours; g++) {
          add({side: ourSide, type: "goal", minute: String(rint(2, 90)),
            playerId: pick(xi).id || pick(xi).uid,
            goalType: weighted([["jugada_oberta", 72], ["penal", 14], ["falta_directa", 14]])});
        }
        for (let g = 0; g < theirs; g++) {
          add({side: oppSide, type: "goal", minute: String(rint(2, 90)),
            playerNumber: String(rint(2, 23)), goalType: "jugada_oberta"});
        }
        for (let c = 0, n = weighted([[0, 18], [1, 34], [2, 30], [3, 14]]); c < n; c++) {
          add({side: ourSide, type: "yellow", minute: String(rint(10, 90)),
            playerId: pick(xi).id || pick(xi).uid});
        }
        events[m.id] = ev;
        eChanged = true; summary.events++;
      }
    }
    if (mChanged) writes.push({ref: dataCol.doc(key("fa_matches")), data: {v: JSON.stringify(matches), category: cat}});
    if (eChanged) writes.push({ref: dataCol.doc(key("fa_match_events")), data: {v: JSON.stringify(events), category: cat}});
    if (cChanged) writes.push({ref: dataCol.doc(key("fa_convocatoria_sent")), data: {v: JSON.stringify(convo), category: cat}});

    // ── 4. Trainings: availability, then RPE for those who turned up ──
    const trainings = blobOf(docs.get(key("fa_training"))) || [];
    const past = trainings.filter((t) => t.date && t.date < todayStr && t.date >= start);
    log(`  matches: ${matches.length} (${summary.matchesPlayed} newly played)  ` +
        `trainings in window: ${past.length}`);

    // Existing records, so we only ever create.
    const availCol = db.collection("teams").doc(CLUB).collection("trainingAvail");
    const rpeCol = db.collection("teams").doc(CLUB).collection("rpe");
    const [availSnap, rpeSnap] = await Promise.all([availCol.get(), rpeCol.get()]);
    const haveAvail = new Set(availSnap.docs.map((d) => d.id));
    const haveRpe = new Set(rpeSnap.docs.map((d) => d.id));

    for (const t of past) {
      for (const p of players) {
        const uid = String(p.id || p.uid);
        // The seeder's legacy key shape, which the app still reads.
        const aKey = `${uid}_${t.date}`;
        const injured = injuredUids.has(uid);
        if (!haveAvail.has(aKey) && !haveAvail.has(`${uid}_${t.id}`)) {
          const value = injured ? "injured" :
            weighted([["yes", 78], ["late", 8], ["no", 14]]);
          records.push({ref: availCol.doc(aKey),
            data: {uid, date: t.date, sessionId: t.id || null, value,
              updatedAt: FieldValue.serverTimestamp(), source: "topup"}});
          summary.avail++;
          if (value === "yes" || value === "late") {
            const rKey = `${uid}_training_${t.date}`;
            if (!haveRpe.has(rKey) && !haveRpe.has(`${uid}_training_${t.id}`)) {
              const rpe = rint(3, 9);
              const minutes = weighted([[60, 20], [75, 35], [90, 45]]);
              records.push({ref: rpeCol.doc(rKey),
                data: {uid, rpe, minutes,
                  ua: rpe * minutes, // invariant the seeder's selfCheck pins
                  tag: "training", date: t.date, sessionId: t.id || null,
                  updatedAt: FieldValue.serverTimestamp(), source: "topup"}});
              summary.rpe++;
            }
          }
        }
      }
    }
  }

  // ── The date arrays every push reminder queries ──
  const allTraining = [];
  const allMatch = [];
  for (const [id, doc] of docs) {
    const k = id.split(Shard.SEP)[0];
    if (k === "fa_training") (blobOf(doc) || []).forEach((t) => t.date && allTraining.push(t.date));
    if (k === "fa_matches") (blobOf(doc) || []).forEach((m) => m.date && allMatch.push(m.date));
  }
  const teamPatch = {
    trainingDates: [...new Set(allTraining)].sort(),
    matchDates: [...new Set(allMatch)].sort(),
  };

  step("Summary");
  log(`  matches marked played : ${summary.matchesPlayed}`);
  log(`  match event sets      : ${summary.events}`);
  log(`  convocatòries         : ${summary.convocatories}`);
  log(`  availability records  : ${summary.avail}`);
  log(`  RPE records           : ${summary.rpe}`);
  log(`  shard docs to write   : ${writes.length}`);
  log(`  trainingDates/matchDates → ${teamPatch.trainingDates.length}/${teamPatch.matchDates.length}`);

  if (!APPLY) {
    log("\nDRY RUN — nothing was written. Re-run with --apply to commit.");
    return;
  }

  step("Writing");
  // merge:true on the shard docs so a concurrent `category` field is kept.
  for (const w of writes) await w.ref.set(w.data, {merge: true});
  log(`  ${writes.length} shard documents written`);

  const CHUNK = 400; // well inside the 500-op batch limit
  for (let i = 0; i < records.length; i += CHUNK) {
    const batch = db.batch();
    records.slice(i, i + CHUNK).forEach((r) => batch.set(r.ref, r.data, {merge: true}));
    await batch.commit();
  }
  log(`  ${records.length} records written`);

  await db.collection("teams").doc(CLUB).set(teamPatch, {merge: true});
  log("  trainingDates / matchDates refreshed");
  log("\nDone. Re-run seed-demo-club.js --verify --club " + CLUB + " to read the new counts.");
}

main().catch((e) => die(e.message));
