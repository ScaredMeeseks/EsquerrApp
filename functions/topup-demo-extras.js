#!/usr/bin/env node
/**
 * topup-demo-extras.js — coach match NOTES and anada/tornada links for an
 * already-seeded demo club.
 *
 *   node functions/topup-demo-extras.js --club <id>            # DRY RUN
 *   node functions/topup-demo-extras.js --club <id> --apply    # write
 *
 *   --link-existing   also add `firstLegId` to notes that ALREADY exist and
 *                     have never been asked the first-leg question. One
 *                     field, nothing else touched. See its note below.
 *   --fill-empty      also write the phases (`pre`/`live`/`post`) and video
 *                     links of notes that ALREADY exist but nobody has
 *                     written in. A phase with text, or with an author, is
 *                     never touched. See its note below.
 *   --today YYYY-MM-DD  pretend it is another day (tests, rehearsals).
 *
 * ─── Why a second script rather than more of topup-demo-season.js ────────
 *
 * That one is proven and is the thing you run first, under time pressure,
 * on the morning of a showing. Everything here is additive and touches a
 * different collection entirely (`matchNotes`, not `data`/`rpe`/
 * `trainingAvail`), so keeping it separate means step one stays exactly the
 * run that has already worked a dozen times. Same guards, same shape, same
 * add-only principle:
 *
 *   - refuses any club not stamped `demoSeed: true`, and any PROTECTED_CLUB;
 *   - create-only per document — a note a real coach typed from a demo login
 *     is worth more than a fabricated one, so an existing doc is never
 *     touched, not even to add a field (the two flags above are the named,
 *     narrow exceptions);
 *   - writes nothing dated before the club's `seasonBoundary`;
 *   - dry run by default.
 *
 * Every decision is made by `plan()`, which is pure: it takes what main()
 * read and returns what would be written. test/topup-demo.test.js runs it.
 *
 * ─── What it fills ──────────────────────────────────────────────────────
 *
 * 1. `teams/{id}/matchNotes/{matchId}` — the staff's working document for a
 *    match: `pre` (the plan), `live` (the half-time adjustment) and `post`
 *    (the debrief), plus video links. Nothing else in the repo writes this
 *    collection, so on a seeded demo every match-notes block is empty.
 *
 * 2. `firstLegId` on the SECOND leg of each pairing, which is what makes the
 *    anada briefing render.
 *
 *    The briefing is the feature worth showing and it is invisible today for
 *    a reason that is not a bug. The seeder plays 34 matchdays against 17
 *    opponents with the venue alternating, so matchdays 18-34 really are
 *    return fixtures and `findFirstLeg()` finds them. But it finds them BY
 *    NAME, and a name match is only a SUGGESTION: mnLegSuggestion() raises a
 *    banner and waits for the coach's yes/no. A silent, certain link needs
 *    `fcfActaId` on both fixtures, which a seeded club has not got. Writing
 *    `firstLegId` here is exactly the row the coach's "yes" would have
 *    written, so the briefing renders with no banner to click through.
 *
 *    ⚠ The pairing is computed by the REAL findFirstLeg out of js/utils.js,
 *    required directly rather than reimplemented. A second copy of "same
 *    rival, venue swapped, earlier date, same squad, this season" would
 *    drift from the one the app renders from, and the demo would link
 *    fixtures the app itself would not have paired.
 *
 * ─── What it deliberately does NOT do: referees ─────────────────────────
 *
 * Referees are not a field on a match. `mdRefereeFor()` joins `m.fcfActaId`
 * against the global `fcfRefIndex` collection, and the app only ever loads
 * the index for grup ids it finds in `clubs/{id}.fcfLinks` — so mock
 * referees mean setting `fcfLinks` on the demo club. That trade, and the
 * script that makes it, is `topup-demo-referees.js`.
 */
"use strict";

const path = require("path");
const U = require(path.join(__dirname, "..", "js", "utils.js"));
const Shard = require(path.join(__dirname, "..", "js", "shard.js"));

// Same list seed-demo-club.js and topup-demo-season.js protect. Kept in sync
// by hand, deliberately: a shared module would let one edit widen the blast
// radius of all three.
const PROTECTED_CLUBS = new Set([
  "nDLJCpJfDvFHs8MnwtzW", // Esquerra de l'Eixample F.C.
  "lly4GkUxIpBkSgZvzldT", // F.C.Barcelona test club
  "default",
]);

/* ── --link-existing ──────────────────────────────────────────────────
   The one deliberate exception to create-only, and it is narrow on purpose.

   A demo club that has been clicked around already HAS matchNotes, and they
   sit on the most recently played fixtures — which are the second legs, and
   therefore exactly the pages a briefing belongs on. Create-only skips them
   all, so the fixtures most likely to be opened are the ones with no
   briefing. Measured on the real club: 51 second legs, 25 linked, and the 26
   skipped were the 27 notes that already existed.

   So this flag writes ONE FIELD, `firstLegId`, and only where the coach has
   plainly never answered: no `firstLegId` and no `legDismissed`. Those two
   absent together mean the suggestion banner was never resolved, and the
   value written is precisely what its "yes" would have written.

   `legDismissed: true` is a deliberate NO and is never overridden — that is
   the only reason the field exists (js/app.js: "Accepting writes firstLegId;
   declining writes legDismissed"). An existing firstLegId is never changed
   either: a coach may have linked a cup tie on purpose, and re-deriving over
   the top of that would undo a decision he made deliberately.

   Nothing else on the document is touched — update(), not set(merge:true),
   so no phase, video or board can be disturbed by this path.

   ── --fill-empty ─────────────────────────────────────────────────────
   Read from production on 2026-10-09: most of the club's recent fixtures
   held a notes document with NO text in any phase — a stub, with nothing
   typed since. Create-only skips every one of them, so the fixtures a demo
   is most likely to open were the ones with a blank notes block. Juvenil's
   09-26 and 10-03 had their plan from the last run but, having been played
   since, no debrief.

   So this flag fills a phase only where it is EMPTY AND UNAUTHORED: no text
   and no `updatedBy`. A phase somebody wrote in — or deliberately cleared,
   which leaves their name on it — is left exactly as it is. Video links are
   added only to a note that has none. update(), for the reason given above:
   a note deleted meanwhile must not come back as a stub. */

// ── Deterministic RNG, so a dry run and the apply that follows agree ──
function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
// Re-seeded per category inside plan().
let rnd = mulberry32(20260918);
const pick = (a) => a[Math.floor(rnd() * a.length)];
const chance = (p) => rnd() < p;

/* Calendar arithmetic, NOT milliseconds — the same reason the other two
   scripts spell this out: Spain has a 25-hour day at the autumn transition,
   so `new Date(t - 86400000)` can land back on the same date. setDate()
   counts days and steps over both transitions. Anchored at noon. */
function dayBefore(s) {
  const [y, m, d] = String(s).split("-").map(Number);
  const dt = new Date(y, m - 1, d, 12);
  dt.setDate(dt.getDate() - 1);
  return dt.getFullYear() + "-" + String(dt.getMonth() + 1).padStart(2, "0") +
    "-" + String(dt.getDate()).padStart(2, "0");
}

/** Season start for a boundary like "03-01", mirroring utils.js seasonStartStr. */
function seasonStart(boundary, todayStr) {
  const b = /^\d{2}-\d{2}$/.test(boundary || "") ? boundary : "08-15";
  const y = Number(todayStr.slice(0, 4));
  return todayStr >= y + "-" + b ? y + "-" + b : (y - 1) + "-" + b;
}

/* ── The Catalan a coach actually writes ───────────────────────────────
   Short, specific, and built from the fixture in front of it — the venue,
   the rival, the scoreline that the events produced. Generic filler reads
   as filler on a projector, which is the one place this text is ever seen. */

const PRE_HOME = [
  "Sortim a manar des del primer minut. Pilota llarga de {rival} a la primera pressió: el mig centre ha de caure entre centrals.",
  "Ells tanquen molt bé el carril central. Amplitud màxima i buscar el 1x1 als extrems abans que basculin.",
  "Camp nostre, ritme nostre. Circulació ràpida de primera i segona, i atenció al replegament després de pèrdua.",
  "{rival} surt jugant des del porter. Pressió alta amb els dos puntes orientant cap a la banda dreta, que és la seva més fluixa.",
];
const PRE_AWAY = [
  "Fora de casa i amb camp petit. Bloc mig, compactes, i sortir al contraatac amb els extrems a l'esquena dels laterals.",
  "A {rival} el partit se'ls fa llarg. Primera mitja part seriosa, sense regals, i a partir del 60' tindrem espais.",
  "Molta pilota aturada a favor d'ells: marcatge mixt i primer pal ben cobert. No podem concedir faltes evitables al mig del camp.",
  "Ens interessa un partit lent. Aturar el joc quan calgui, no entrar a la seva intensitat, i esperar el nostre moment.",
];
const LIVE = [
  "Ajustament al descans: el lateral puja massa, el tanquem amb l'extrem baixant a la línia.",
  "Estem arribant però sense rematador. Entra el segon punta i pugem la línia deu metres.",
  "Ens guanyen la segona pilota. Doblem el pivot i sortim jugant curt, no llarg.",
  "Aguantem el resultat: dos canvis a la banda per tenir cames els últims vint minuts.",
];
const POST_WIN = [
  "Partit seriós. El pla ha funcionat des del primer minut i la pressió alta ens ha donat dues de les tres pilotes del gol.",
  "Guanyem i mereixem guanyar. Cal corregir els deu minuts després del descans, on hem baixat el ritme sense necessitat.",
  "Molt bona lectura del partit. Els canvis han entrat bé i hem tancat el resultat sense patir.",
];
const POST_DRAW = [
  "Empat curt. Hem fet el partit que volíem però ens ha faltat l'últim passe a l'àrea.",
  "Se'ns escapa al final per una desatenció a pilota aturada. La resta, el que havíem parlat.",
  "Punt just. Hem controlat la primera part i ens hem quedat sense idees a la segona.",
];
const POST_LOSS = [
  "Derrota. No hem entrat al partit fins al 25' i això ens ha costat els dos gols.",
  "No ens hem trobat mai còmodes. Cal revisar la sortida de pilota, ens han robat tres vegades a camp nostre.",
  "Partit per oblidar. Ho parlem dimarts amb el vídeo, hi ha coses que no depenen del rival.",
];

const VIDEO_TITLES = [
  ["Anàlisi del rival — sortida de pilota", "pre"],
  ["Pilota aturada a favor — 3 variants", "pre"],
  ["Resum del partit", "post"],
  ["Gols i ocasions", "post"],
  ["Pressió alta — errors del primer temps", "post"],
];
// Deliberately obvious placeholders: a demo that plays a real unrelated
// video is worse than one that plainly does not.
const VIDEO_URLS = [
  "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
  "https://vimeo.com/76979871",
];

function fill(s, rival) { return s.replace(/\{rival\}/g, rival); }

/** A phase nobody has written in: no text, and no author. */
function phaseIsEmpty(p) {
  return !(p && String(p.text || "").trim()) && !(p && p.updatedBy);
}

/**
 * PURE. `state` is what main() read:
 *   club    clubs/{id} data
 *   shards  Map docId → parsed blob ({v} docs)
 *   notes   Map matchId → existing matchNotes data
 * Returns {creates, updates, summary, sample, report}.
 */
function plan(state, opts) {
  const todayStr = opts.today;
  const club = state.club || {};
  const clubName = club.name || "";
  const start = seasonStart(club.seasonBoundary, todayStr);
  const haveNote = new Map(state.notes);
  const blob = (id) => {
    const v = state.shards.get(id);
    return v == null ? null : JSON.parse(JSON.stringify(v));
  };
  const cats = [...new Set([...state.shards.keys()]
      .map((id) => id.split(Shard.SEP)[1])
      .filter((c) => c && c !== "none"))].sort();

  /* The author. Every note carries one, and the coach's own name under his
     own note is the difference between a demo and a form with text in it.
     Read off the roster rather than assumed: --add-team runs share one
     Xavier Bonet and the uid prefix is not derivable from the club id. */
  let leadUid = "";
  for (const cat of cats) {
    const users = blob("fa_users" + Shard.SEP + cat) || [];
    const staff = users.filter((u) => Array.isArray(u.roles) && u.roles.includes("staff"));
    const lead = staff.filter((u) => u.isTeamLead)[0] || staff[0];
    if (lead) { leadUid = String(lead.id || lead.uid || ""); break; }
  }

  /* `boards` may only ever name a board that EXISTS. A chip pointing at a
     deleted board is a dead control on the one screen this is built for. */
  const matchBoards = {};
  for (const cat of cats) {
    Object.assign(matchBoards, blob("fa_tactic_match_boards" + Shard.SEP + cat) || {});
  }

  const creates = [];
  const updates = [];
  const report = [];
  const summary = {notes: 0, legs: 0, skipped: 0, pre: 0, live: 0, post: 0,
    videos: 0, linked: 0, dismissed: 0, already: 0, filled: 0};
  let sample = null;

  for (const cat of cats) {
    const matches = blob("fa_matches" + Shard.SEP + cat) || [];
    const events = blob("fa_match_events" + Shard.SEP + cat) || {};
    if (!matches.length) continue;
    rnd = mulberry32((opts.seed == null ? 20260918 : opts.seed) + cat.length); // stable per category

    /* ourSideOf() is EXACT equality on the club name and falls back to
       "away" — deliberately, so a renamed club loses the pairing rather than
       getting a wrong one. Here that failure is silent and total: if
       `clubs/{id}.name` does not match what the seeder wrote into m.home,
       every fixture reads as away, every plan is the away plan, and every
       win is filed as a loss. Nothing downstream would look broken, it would
       just be wrong. So refuse rather than write it. */
    const homeCount = matches.filter((m) => U.ourSideOf(m, clubName) === "home").length;
    if (!homeCount) {
      throw new Error(`${cat}: not one of ${matches.length} fixtures has ` +
          `home === "${clubName}".\n` +
          "    The club's `name` does not match its own fixture rows, so every\n" +
          "    note would be written from the wrong side. Fix the name first.");
    }

    let legs = 0; let notes = 0; let linked = 0; let filled = 0;

    for (const m of matches) {
      if (!m || !m.date || m.date < start) continue;
      const id = String(m.id);
      if (!m.category) continue; // unreadable by everyone — MN.save refuses too

      /* findFirstLeg pairs within one category AND one team letter, so the
         whole category's fixtures are the right haystack. */
      const first = U.findFirstLeg(m, matches, clubName, start);
      const played = m.date < todayStr;
      const ourSide = U.ourSideOf(m, clubName);
      const rival = U.opponentOf(m, clubName) || "el rival";
      const atHome = ourSide === "home";

      /* The timestamps are the phase's OWN moment, not the run's: a debrief
         stamped the same second as the plan is the one detail that gives a
         seeded note away, and a plan for next Saturday stamped NEXT SATURDAY
         would render as edited in the future. Hence the clamp. */
      const stamp = (day, hm) => {
        const d = day > todayStr ? todayStr : day;
        return d + "T" + hm + ":00.000Z";
      };
      const kickoff = m.time || "18:00";
      const phases = () => {
        const ph = {pre: {text: fill(pick(atHome ? PRE_HOME : PRE_AWAY), rival),
          updatedAt: stamp(dayBefore(m.date), "19:30"), updatedBy: leadUid}};
        if (played) {
          const ev = events[id] || [];
          const goals = (side) => ev.filter((e) =>
            e && e.type === "goal" && e.side === side).length;
          const ours = goals(ourSide);
          const theirs = goals(ourSide === "home" ? "away" : "home");
          const bank = ours > theirs ? POST_WIN : (ours === theirs ? POST_DRAW : POST_LOSS);
          // Half time: kick-off plus about three quarters of an hour.
          if (chance(0.55)) ph.live = {text: pick(LIVE), updatedAt: stamp(m.date, kickoff), updatedBy: leadUid};
          ph.post = {text: pick(bank), updatedAt: stamp(m.date, "22:15"), updatedBy: leadUid};
        }
        return ph;
      };
      // One or two links, phase-tagged the way the editor writes them.
      const videos = () => {
        const out = [];
        const nVid = played ? (chance(0.5) ? 2 : 1) : (chance(0.4) ? 1 : 0);
        for (let i = 0; i < nVid; i++) {
          const [title, phase] = pick(played ? VIDEO_TITLES : VIDEO_TITLES.slice(0, 2));
          out.push({id: "mv_demo_" + id + "_" + i, title, url: pick(VIDEO_URLS), comment: "", phase});
        }
        return out;
      };

      const existing = haveNote.get(id);
      if (existing) {
        summary.skipped++;
        const upd = {};
        if (opts.linkExisting && first) {
          if (existing.firstLegId) summary.already++;
          else if (existing.legDismissed) summary.dismissed++;
          else { upd.firstLegId = String(first.id); summary.linked++; linked++; }
        }
        if (opts.fillEmpty && (played || first)) {
          const ph = phases();
          /* `live` only alongside a missing debrief. Half the fixtures have
             no half-time note on purpose (the 55% above), and re-drawing that
             on every run would fill them all in a few runs — a note that
             already has its debrief has had its half-time question asked. */
          const debriefMissing = phaseIsEmpty(existing.post);
          ["pre", "live", "post"].forEach((k) => {
            if (k === "live" && !debriefMissing) return;
            if (ph[k] && phaseIsEmpty(existing[k])) { upd[k] = ph[k]; summary[k]++; }
          });
          if (!Array.isArray(existing.videos) || !existing.videos.length) {
            const v = videos();
            if (v.length) { upd.videos = v; summary.videos += v.length; }
          }
          if (upd.pre || upd.live || upd.post || upd.videos) { summary.filled++; filled++; }
        }
        if (Object.keys(upd).length) updates.push({id, data: upd});
        continue;
      }

      /* A fixture with neither a first leg nor a history is not worth a
         document: MN.isEmpty() would call it empty, and an empty note is
         noise in the collection and a blank block on the page. */
      if (!first && !played) continue;

      const note = {
        matchId: id,
        category: m.category,
        team: m.team || "",
        pre: {text: "", updatedAt: null, updatedBy: ""},
        live: {text: "", updatedAt: null, updatedBy: ""},
        post: {text: "", updatedAt: null, updatedBy: ""},
        videos: [],
        boards: [],
        firstLegId: first ? String(first.id) : null,
        legDismissed: false,
      };
      if (first) { legs++; summary.legs++; }
      const ph = phases();
      ["pre", "live", "post"].forEach((k) => { if (ph[k]) { note[k] = ph[k]; summary[k]++; } });
      note.videos = videos();
      summary.videos += note.videos.length;

      const bs = matchBoards[id];
      if (Array.isArray(bs) && bs.length) {
        note.boards = bs.slice(0, 2).map((b) => ({
          boardId: String(b.boardId || b.id || ""),
          name: String(b.name || ""),
          tag: String(b.tag || ""),
        })).filter((b) => b.boardId);
      }

      creates.push({id, data: note});
      haveNote.set(id, note);
      notes++; summary.notes++;
      if (!sample) sample = {m, note, first};
    }

    report.push(`${cat}: notes to create ${notes}, first-leg links ${legs}` +
      (opts.linkExisting ? `, links added to existing notes ${linked}` : "") +
      (opts.fillEmpty ? `, existing notes filled ${filled}` : ""));
  }
  return {creates, updates, summary, sample, report, leadUid, start};
}

async function main() {
  const argv = process.argv.slice(2);
  const has = (f) => argv.includes(f);
  const val = (f, d) => {
    const i = argv.indexOf(f);
    return i !== -1 && argv[i + 1] ? argv[i + 1] : d;
  };
  const die = (msg) => { console.error("\nERROR: " + msg + "\n"); process.exit(1); };
  const log = (s) => console.log(s);
  const step = (s) => console.log("\n── " + s + " " + "─".repeat(Math.max(0, 56 - s.length)));
  const APPLY = has("--apply");
  const CLUB = val("--club", "");
  const opts = {today: val("--today", new Date().toISOString().slice(0, 10)),
    seed: Number(val("--seed", "20260918")),
    linkExisting: has("--link-existing"), fillEmpty: has("--fill-empty")};
  if (!CLUB) die("--club <id> is required.");
  if (PROTECTED_CLUBS.has(CLUB)) die(`${CLUB} is a PROTECTED club. This script will not touch it.`);

  const admin = require("firebase-admin");
  admin.initializeApp({projectId: "esquerrapp"});
  const db = admin.firestore();

  step("Preflight");
  const clubSnap = await db.collection("clubs").doc(CLUB).get();
  if (!clubSnap.exists) die(`clubs/${CLUB} does not exist.`);
  const club = clubSnap.data() || {};
  if (club.demoSeed !== true) {
    die(`clubs/${CLUB} is not stamped demoSeed:true.\n    Only clubs seed-demo-club.js created may be topped up.`);
  }
  const dataCol = db.collection("teams").doc(CLUB).collection("data");
  const notesCol = db.collection("teams").doc(CLUB).collection("matchNotes");
  const [dataSnap, notesSnap] = await Promise.all([dataCol.get(), notesCol.get()]);
  const shards = new Map();
  dataSnap.docs.forEach((d) => {
    const data = d.data() || {};
    if (typeof data.v !== "string") return;
    try { shards.set(d.id, JSON.parse(data.v)); } catch (e) {
      die(`${d.id} holds unparseable JSON. Inspect it by hand before re-running.`);
    }
  });
  const notes = new Map(notesSnap.docs.map((d) => [d.id, d.data() || {}]));

  let out;
  try { out = plan({club, shards, notes}, opts); } catch (e) { die(e.message); }
  log(`club        : ${club.name || "(unnamed)"}`);
  log(`season      : from ${out.start}   today ${opts.today}`);
  log(`existing    : ${notes.size} matchNotes documents`);
  log(`author      : ${out.leadUid || "(none found — notes will carry no updatedBy)"}`);
  log(`mode        : ${APPLY ? "APPLY (will write)" : "DRY RUN (no writes)"}` +
    `${opts.linkExisting ? "  +link-existing" : ""}${opts.fillEmpty ? "  +fill-empty" : ""}`);
  out.report.forEach((r) => log("  " + r));

  if (out.sample) {
    step("Sample (the first note this run would create)");
    const {m, note, first} = out.sample;
    log(`  ${m.date}  ${m.home} vs ${m.away}   [${note.category}${note.team ? " " + note.team : ""}]`);
    if (first) log(`  anada  → ${first.date}  ${first.home} vs ${first.away}  (id ${first.id})`);
    ["pre", "live", "post"].forEach((p) => { if (note[p].text) log(`  ${p.padEnd(5)}: ${note[p].text}`); });
  }

  const S = out.summary;
  step("Summary");
  log(`  matchNotes to create  : ${S.notes}`);
  log(`  first-leg links       : ${S.legs}   ← these render the anada briefing`);
  log(`  pre / live / post     : ${S.pre} / ${S.live} / ${S.post}`);
  log(`  video links           : ${S.videos}`);
  log(`  existing notes        : ${S.skipped}`);
  if (opts.linkExisting) {
    log(`    firstLegId added    : ${S.linked}   (already ${S.already}, declined ${S.dismissed})`);
  }
  if (opts.fillEmpty) log(`    filled in           : ${S.filled}   ← empty, unauthored phases only`);

  if (!APPLY) { log("\nDRY RUN — nothing was written. Re-run with --apply to commit."); return; }

  step("Writing");
  const CHUNK = 400; // well inside the 500-op batch limit
  for (let i = 0; i < out.creates.length; i += CHUNK) {
    const batch = db.batch();
    /* create(), not set() — the read above and the write below are not one
       transaction, and a coach typing a note from a demo login in between
       must win. create() throws on a doc that appeared meanwhile; set()
       would silently flatten it. */
    out.creates.slice(i, i + CHUNK).forEach((w) => batch.create(notesCol.doc(w.id), w.data));
    try {
      await batch.commit();
    } catch (e) {
      if (String(e.message || "").includes("ALREADY_EXISTS")) {
        die("A matchNotes document appeared between the read and the write.\n" +
            "    Nothing in this chunk was written. Re-run — the second pass\n" +
            "    will skip whatever now exists.");
      }
      throw e;
    }
  }
  log(`  ${out.creates.length} matchNotes documents created`);

  /* update(), never set(merge:true). Both would leave the other fields
     alone, but update() also REFUSES a document that has gone away, and
     that is the difference worth having: a note deleted between the read
     and the write must not be resurrected as a stub. */
  for (let i = 0; i < out.updates.length; i += CHUNK) {
    const batch = db.batch();
    out.updates.slice(i, i + CHUNK).forEach((u) => batch.update(notesCol.doc(u.id), u.data));
    try {
      await batch.commit();
    } catch (e) {
      if (String(e.message || "").includes("NOT_FOUND")) {
        die("A matchNotes document was deleted between the read and the write.\n" +
            "    Nothing in this chunk was written. Re-run — the second pass\n" +
            "    will see the collection as it now stands.");
      }
      throw e;
    }
  }
  if (out.updates.length) log(`  ${out.updates.length} existing notes updated`);
  log("\nDone.");
}

if (require.main === module) {
  main().catch((e) => { console.error("\nERROR: " + e.message + "\n"); process.exit(1); });
}

module.exports = {plan, phaseIsEmpty, PROTECTED_CLUBS};
