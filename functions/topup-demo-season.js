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
 * 5. The FORWARD training calendar. Read from production on 2026-08-20:
 *
 *      fa_training  93 rows   93 past /  0 future   → 2026-08-13
 *      fa_matches  102 rows   72 past / 30 future   → 2026-10-24
 *
 *    A club with a next match and no next session ever. Empty "pròxims
 *    entrenaments", nothing to confirm availability for, and `trainingDates`
 *    holding only past dates — so scheduledTrainingReminder can never fire
 *    for it, which is also why the training reminder had never been tested
 *    against the demo club.
 *
 *    Everything above this line writes into the PAST, by construction:
 *    `t.date < todayStr` guards each loop. So no number of re-runs could
 *    ever have fixed it, and every dry run kept reporting healthy figures
 *    about a calendar that was a dead end.
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

/* Calendar arithmetic, NOT milliseconds — the same reason seed-demo-club.js
   spells this out: Spain has a 25-hour day at the autumn transition, so
   `new Date(t + 86400000)` lands back on the same date and a `d <= end` loop
   spins for ever. setDate() counts days and steps over both transitions. */
const parseDay = (s) => {
  const [y, m, d] = String(s).split("-").map(Number);
  return new Date(y, m - 1, d, 12);
};
const dayStr = (d) => d.getFullYear() + "-" +
  String(d.getMonth() + 1).padStart(2, "0") + "-" +
  String(d.getDate()).padStart(2, "0");
const addDays = (s, n) => {
  const d = parseDay(s);
  d.setDate(d.getDate() + n);
  return dayStr(d);
};
/** 1 = Monday … 7 = Sunday. */
const dow = (s) => (parseDay(s).getDay() + 6) % 7 + 1;
const CATALAN_DAYS = ["Dilluns", "Dimarts", "Dimecres", "Dijous",
  "Divendres", "Dissabte", "Diumenge"];

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

  /* Read the record collections ONCE, with their VALUES — the RPE decision
     depends on what the player answered, not merely on whether they did. */
  const availCol = db.collection("teams").doc(CLUB).collection("trainingAvail");
  const rpeCol = db.collection("teams").doc(CLUB).collection("rpe");
  const [availSnap, rpeSnap] = await Promise.all([availCol.get(), rpeCol.get()]);
  const availByKey = new Map(availSnap.docs.map((d) => [d.id, d.data() || {}]));
  const haveRpe = new Set(rpeSnap.docs.map((d) => d.id));
  log(`records     : ${availByKey.size} availability, ${haveRpe.size} rpe`);

  const writes = [];   // {ref, data, merge}
  const records = [];  // {ref, data}
  const summary = {matchesPlayed: 0, events: 0, convocatories: 0, avail: 0, rpe: 0, matchRpe: 0, sessions: 0};

  for (const cat of cats) {
    rnd = mulberry32(SEED + cat.length); // stable per category
    const key = (k) => k + Shard.SEP + cat;

    const players = (blobOf(docs.get(key("fa_users"))) || [])
        .filter((u) => Array.isArray(u.roles) ? u.roles.includes("player") : true);
    if (!players.length) { log(`\n${cat}: no players in fa_users — skipped`); continue; }

    // Injured players must never be marked available: the roster badge and
    // the medical page would contradict each other, which is exactly the
    // kind of detail a football person spots immediately.
    /* `resolved` is the seeder's word for a finished injury — NOT
       "recovered", which is what this line said first. Testing the wrong
       literal counted every historical injury as live and reported 23 of 50
       players injured when the squad has three live cases. It was cosmetic
       here (this set only picks the availability value for sessions that
       have none) but it was wrong on screen, which is worse. */
    const injuredUids = new Set((blobOf(docs.get(key("fa_injuries"))) || [])
        .filter((i) => i && (i.status === "active" || i.status === "recovering"))
        .map((i) => String(i.playerId || i.uid)));

    step(`${cat} — ${players.length} players`);

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

      /* Match RPE, for the players who were actually called up.

         Missed on the first pass, which is why "Inclou càrrega estimada"
         survived a run that reported almost nothing to do: readiness
         estimates a match load whenever the player has minutes and no RPE
         doc, and the seeder only wrote match RPE for matches that were
         already played WHEN IT RAN. Everything played since is a gap. */
      const called = (convo[m.id] && convo[m.id].players) || [];
      const startingXI = (convo[m.id] && convo[m.id].startingXI) || [];
      called.forEach((uid) => {
        const rKey = `${uid}_match_${m.id}`;
        if (haveRpe.has(rKey)) return;
        // Starters go the distance; the rest come off the bench.
        const minutes = startingXI.includes(uid) ? rint(70, 90) : rint(10, 35);
        const rpe = rint(5, 9); // a match is harder than a session
        records.push({ref: rpeCol.doc(rKey),
          data: {uid, rpe, minutes, ua: rpe * minutes,
            tag: "match", date: m.date, matchId: m.id,
            updatedAt: FieldValue.serverTimestamp(), source: "topup"}});
        haveRpe.add(rKey);
        summary.matchRpe++;
      });

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

    /* 4a. The forward calendar — see the header. The club had matches
       booked to October and no session after 2026-08-13.

       The schedule is DERIVED from the club's own sessions rather than
       hardcoded to the seeder's Tuesday/Thursday: weekdays, time, location,
       map link and the focus rotation all come from what is already there,
       so a club whose demo was edited by hand keeps its own shape. Nothing
       is invented for a category that has no sessions to model on — that is
       a seeding job, not a top-up. */
    const lastMatch = matches.reduce((a, m) => (m.date && m.date > a ? m.date : a), "");
    const haveDate = new Set(trainings.map((t) => t.date).filter(Boolean));
    let tChanged = false;
    if (!trainings.length) {
      log("  calendar: no sessions to model a schedule on — skipped");
    } else if (!lastMatch || lastMatch <= todayStr) {
      log("  calendar: no future fixtures — nothing to extend towards");
    } else {
      const sorted = trainings.slice()
          .sort((a, b) => String(a.date).localeCompare(String(b.date)));
      const template = sorted[sorted.length - 1];
      // Weekdays this category actually trains on, commonest first.
      const dowCount = {};
      trainings.forEach((t) => {
        if (t.date) dowCount[dow(t.date)] = (dowCount[dow(t.date)] || 0) + 1;
      });
      const days = Object.keys(dowCount).map(Number)
          .filter((d) => dowCount[d] >= 3).sort((a, b) => dowCount[b] - dowCount[a]);
      const focuses = [...new Set(trainings.map((t) => t.focus).filter(Boolean))];
      const from = template.date >= todayStr ? addDays(template.date, 1) : todayStr;
      let added = 0;
      if (!days.length) {
        log("  calendar: no repeating weekday found — skipped");
      } else {
        for (let d = from; d <= lastMatch; d = addDays(d, 1)) {
          if (days.indexOf(dow(d)) === -1) continue;
          if (haveDate.has(d)) continue;
          trainings.push({
            // The seeder's shape, so nothing downstream can tell them apart.
            id: `tr_${parseDay(d).getTime()}_${Math.floor(rnd() * 1e6).toString(36)}`,
            day: CATALAN_DAYS[dow(d) - 1],
            date: d,
            time: template.time || "20:00",
            focus: focuses.length ? focuses[(trainings.length + added) % focuses.length] : "",
            location: template.location || "",
            mapLink: template.mapLink || "",
            status: "upcoming",
            category: cat,
          });
          haveDate.add(d);
          added++;
        }
      }
      if (added) {
        // Newest first: the order the app saves in and the route merges in.
        trainings.sort((a, b) => String(b.date).localeCompare(String(a.date)));
        tChanged = true;
        summary.sessions += added;
        log(`  calendar: +${added} sessions, ${from} → ${lastMatch} ` +
          `(${days.map((d) => CATALAN_DAYS[d - 1]).join("/")})`);
      } else {
        log("  calendar: already runs to the last fixture");
      }
    }
    if (tChanged) {
      writes.push({ref: dataCol.doc(key("fa_training")),
        data: {v: JSON.stringify(trainings), category: cat}});
    }

    /* Only the PAST gets availability and RPE. A session in the future with
       attendance already filled in is worse than an empty one: it is the
       screen the coach is meant to fill in himself. */
    const past = trainings.filter((t) => t.date && t.date < todayStr && t.date >= start);
    log(`  live injuries: ${injuredUids.size}
  matches: ${matches.length} (${summary.matchesPlayed} newly played)  ` +
        `trainings in window: ${past.length}`);

    /* Availability and RPE are decided SEPARATELY.

       They were nested — RPE was only considered when creating a new
       availability record — so on a club that already had 6854 availability
       records the RPE branch could never run, and the script reported
       "0 RPE records" while the app was visibly falling back to
       "Inclou càrrega estimada (no ha reportat RPE)" for those very
       sessions. A gap inside a filled-in field is exactly the shape a
       top-up has to be able to see. */
    for (const t of past) {
      for (const p of players) {
        const uid = String(p.id || p.uid);
        // Session-keyed is the current shape; date-keyed is the seeder's.
        // The app reads both, so either counts as present.
        const aSess = `${uid}_${t.id}`;
        const aDate = `${uid}_${t.date}`;
        const existing = availByKey.get(aSess) || availByKey.get(aDate);
        let value = existing && existing.value;

        if (!value) {
          value = injuredUids.has(uid) ? "injured" :
            weighted([["yes", 78], ["late", 8], ["no", 14]]);
          records.push({ref: availCol.doc(aDate),
            data: {uid, date: t.date, sessionId: t.id || null, value,
              updatedAt: FieldValue.serverTimestamp(), source: "topup"}});
          summary.avail++;
        }

        // Only players who actually turned up report a load. `no` and
        // `injured` are excluded by readiness anyway, so an RPE for them
        // would be noise the app then has to ignore.
        if (value !== "yes" && value !== "late") continue;
        const rKey = `${uid}_training_${t.date}`;
        if (haveRpe.has(rKey) || haveRpe.has(`${uid}_training_${t.id}`)) continue;
        const rpe = rint(3, 9);
        const minutes = weighted([[60, 20], [75, 35], [90, 45]]);
        records.push({ref: rpeCol.doc(rKey),
          data: {uid, rpe, minutes,
            ua: rpe * minutes, // invariant the seeder's selfCheck pins
            tag: "training", date: t.date, sessionId: t.id || null,
            updatedAt: FieldValue.serverTimestamp(), source: "topup"}});
        haveRpe.add(rKey); // a session can appear in two categories' shards
        summary.rpe++;
      }
    }
  }

  // ── The date arrays every push reminder queries ──
  /* From what this run is about to WRITE, not from what it read. The block
     below used to walk `docs` alone, which was harmless while every change
     was a status flag or a per-record document — no shard gained a date. The
     forward calendar does, and a `trainingDates` array recomputed from the
     pre-run snapshot would have left every new session invisible to
     scheduledTrainingReminder: the club would have a calendar again and
     still never be reminded about it. */
  const pending = new Map(writes.map((w) => [w.ref.id, w.data.v]));
  const rowsOf = (id, doc) => {
    if (pending.has(id)) {
      try { return JSON.parse(pending.get(id)); } catch (e) { return []; }
    }
    return blobOf(doc) || [];
  };
  const allTraining = [];
  const allMatch = [];
  for (const [id, doc] of docs) {
    const k = id.split(Shard.SEP)[0];
    if (k === "fa_training") rowsOf(id, doc).forEach((t) => t.date && allTraining.push(t.date));
    if (k === "fa_matches") rowsOf(id, doc).forEach((m) => m.date && allMatch.push(m.date));
  }
  const teamPatch = {
    trainingDates: [...new Set(allTraining)].sort(),
    matchDates: [...new Set(allMatch)].sort(),
  };

  step("Summary");
  log(`  future sessions added : ${summary.sessions}`);
  log(`  matches marked played : ${summary.matchesPlayed}`);
  log(`  match event sets      : ${summary.events}`);
  log(`  convocatòries         : ${summary.convocatories}`);
  log(`  availability records  : ${summary.avail}`);
  log(`  RPE records (training): ${summary.rpe}`);
  log(`  RPE records (match)   : ${summary.matchRpe}`);
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
