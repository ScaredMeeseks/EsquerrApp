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
 *     touched, not even to add a field;
 *   - writes nothing dated before the club's `seasonBoundary`;
 *   - dry run by default.
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
 * referees mean setting `fcfLinks` on the demo club.
 *
 * That is the whole cost, and it is paid on two OTHER pages. `fcfLinks` is
 * also what switches on Classificació and Sancions: getActiveFcfLeagues()
 * returns nothing while it is empty (a clean "no link configured" card), and
 * the moment it is set both pages start fetching live from the federation
 * against a grup id that does not exist. `_leagueErrors` exists precisely so
 * the table "can say so instead of showing nothing" — so the trade is one
 * populated referee panel against two pages that visibly fail to load.
 *
 * On a demo that is a bad trade, so it is not made here. If it is ever
 * wanted, the shapes are: `fcfRefIndex/{season}_{grupId}` holding
 * `{grupId, season, comp, actas: {actaId: {r:[names], c:true, res:'H'|'D'|'A',
 * gh, ga, d}}, cards: {actaId: {reds, doubles, off:{key:n}}}}`, and
 * `fcfReferees/{slug}` — though that one is REBUILT wholesale from
 * fcfRefIndex by the Friday job (_rebuildFcfReferees), so writing profiles by
 * hand is temporary and only the index is worth writing.
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

// ── CLI ──
const argv = process.argv.slice(2);
const has = (f) => argv.includes(f);
const val = (f, d) => {
  const i = argv.indexOf(f);
  return i !== -1 && argv[i + 1] ? argv[i + 1] : d;
};
const APPLY = has("--apply");
const CLUB = val("--club", "");
const SEED = Number(val("--seed", "20260918"));

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
   so no phase, video or board can be disturbed by this path. */
const LINK_EXISTING = has("--link-existing");

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
const pick = (a) => a[Math.floor(rnd() * a.length)];
const chance = (p) => rnd() < p;

// ── Firebase ──
const admin = require("firebase-admin");
admin.initializeApp({projectId: "esquerrapp"});
const db = admin.firestore();

const todayStr = new Date().toISOString().slice(0, 10);

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
    die(`${doc.id} holds unparseable JSON. Inspect it by hand before re-running.`);
  }
  return null;
};

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
  const clubName = club.name || "";
  const start = seasonStart(club.seasonBoundary);
  log(`club        : ${clubName || "(unnamed)"}`);
  log(`seasonBound : ${club.seasonBoundary || "(default 08-15)"}  → season starts ${start}`);
  log(`today       : ${todayStr}`);
  log(`mode        : ${APPLY ? "APPLY (will write)" : "DRY RUN (no writes)"}`);

  const dataCol = db.collection("teams").doc(CLUB).collection("data");
  const notesCol = db.collection("teams").doc(CLUB).collection("matchNotes");
  const [dataSnap, notesSnap] = await Promise.all([dataCol.get(), notesCol.get()]);
  const docs = new Map(dataSnap.docs.map((d) => [d.id, d]));
  /* Their VALUES, not merely their ids: --link-existing has to see whether
     the coach already answered the first-leg question on each one. */
  const haveNote = new Map(notesSnap.docs.map((d) => [d.id, d.data() || {}]));
  const cats = [...new Set(dataSnap.docs
      .map((d) => d.id.split(Shard.SEP)[1])
      .filter((c) => c && c !== "none"))];
  log(`categories  : ${cats.join(", ") || "(none)"}`);
  log(`existing    : ${haveNote.size} matchNotes documents (never overwritten)`);

  /* The author. Every note carries one, and the coach's own name under his
     own note is the difference between a demo and a form with text in it.
     Read off the roster rather than assumed: --add-team runs share one
     Xavier Bonet and the uid prefix is not derivable from the club id. */
  let leadUid = "";
  for (const cat of cats) {
    const users = blobOf(docs.get("fa_users" + Shard.SEP + cat)) || [];
    const staff = users.filter((u) => Array.isArray(u.roles) && u.roles.includes("staff"));
    const lead = staff.filter((u) => u.isTeamLead)[0] || staff[0];
    if (lead) { leadUid = String(lead.id || lead.uid || ""); break; }
  }
  log(`author      : ${leadUid || "(none found — notes will carry no updatedBy)"}`);

  /* `boards` may only ever name a board that EXISTS. A chip pointing at a
     deleted board is a dead control on the one screen this is built for. */
  const matchBoards = {};
  for (const cat of cats) {
    Object.assign(matchBoards,
        blobOf(docs.get("fa_tactic_match_boards" + Shard.SEP + cat)) || {});
  }

  const writes = [];
  const updates = [];
  const summary = {notes: 0, legs: 0, skipped: 0, pre: 0, live: 0, post: 0,
    videos: 0, linked: 0, dismissed: 0, already: 0};
  let sample = null;

  for (const cat of cats) {
    rnd = mulberry32(SEED + cat.length); // stable per category
    const matches = blobOf(docs.get("fa_matches" + Shard.SEP + cat)) || [];
    const events = blobOf(docs.get("fa_match_events" + Shard.SEP + cat)) || {};
    if (!matches.length) { log(`\n${cat}: no fixtures — skipped`); continue; }

    step(`${cat} — ${matches.length} fixtures`);

    /* ourSideOf() is EXACT equality on the club name and falls back to
       "away" — deliberately, so a renamed club loses the pairing rather than
       getting a wrong one. Here that failure is silent and total: if
       `clubs/{id}.name` does not match what the seeder wrote into m.home,
       every fixture reads as away, every plan is the away plan, and every
       win is filed as a loss. Nothing downstream would look broken, it would
       just be wrong. So refuse rather than write it. */
    const homeCount = matches.filter((m) => U.ourSideOf(m, clubName) === "home").length;
    if (!homeCount) {
      die(`${cat}: not one of ${matches.length} fixtures has ` +
          `home === "${clubName}".\n` +
          "    The club's `name` does not match its own fixture rows, so every\n" +
          "    note would be written from the wrong side. Fix the name first.");
    }

    /* findFirstLeg pairs within one category AND one team letter, so the
       whole category's fixtures are the right haystack: amateur-A and
       amateur-B share fa_matches__amateur and the function itself keeps them
       apart. Passing the club name is what decides which side is ours. */
    let legs = 0; let notes = 0; let linked = 0;

    for (const m of matches) {
      if (!m || !m.date || m.date < start) continue;
      const id = String(m.id);
      if (!m.category) continue; // unreadable by everyone — MN.save refuses too

      const first = U.findFirstLeg(m, matches, clubName, start);

      /* An existing note is never rebuilt. Under --link-existing it may gain
         the one field the coach was never asked for — see the flag's note. */
      const existing = haveNote.get(id);
      if (existing) {
        summary.skipped++;
        if (LINK_EXISTING && first) {
          if (existing.firstLegId) summary.already++;
          else if (existing.legDismissed) summary.dismissed++;
          else {
            updates.push({ref: notesCol.doc(id),
              data: {firstLegId: String(first.id)}});
            summary.linked++;
            linked++;
          }
        }
        continue;
      }

      const played = m.date < todayStr;

      /* A fixture with neither a first leg nor a history is not worth a
         document: MN.isEmpty() would call it empty, and an empty note is
         noise in the collection and a blank block on the page. */
      if (!first && !played) continue;

      const ourSide = U.ourSideOf(m, clubName);
      const rival = U.opponentOf(m, clubName) || "el rival";
      const atHome = ourSide === "home";

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

      /* The plan is written BEFORE the match, so an upcoming fixture gets
         one too — that is the state a coach is actually in when he opens
         the page during a demo. `live` and `post` only exist afterwards.

         The timestamps are the phase's OWN moment, not the run's: a debrief
         stamped the same second as the plan is the one detail that gives a
         seeded note away, and a plan for next Saturday stamped NEXT SATURDAY
         would render as edited in the future. Hence the clamp. */
      const stamp = (day, hm) => {
        const d = day > todayStr ? todayStr : day;
        return d + "T" + hm + ":00.000Z";
      };
      const kickoff = m.time || "18:00";
      note.pre = {
        text: fill(pick(atHome ? PRE_HOME : PRE_AWAY), rival),
        updatedAt: stamp(dayBefore(m.date), "19:30"),
        updatedBy: leadUid,
      };
      summary.pre++;

      if (played) {
        const ev = events[id] || [];
        const goals = (side) => ev.filter((e) =>
          e && e.type === "goal" && e.side === side).length;
        const ours = goals(ourSide);
        const theirs = goals(ourSide === "home" ? "away" : "home");
        const bank = ours > theirs ? POST_WIN : (ours === theirs ? POST_DRAW : POST_LOSS);

        if (chance(0.55)) {
          // Half time: kick-off plus about three quarters of an hour.
          note.live = {text: pick(LIVE),
            updatedAt: stamp(m.date, kickoff), updatedBy: leadUid};
          summary.live++;
        }
        note.post = {text: pick(bank),
          updatedAt: stamp(m.date, "22:15"), updatedBy: leadUid};
        summary.post++;
      }

      // One or two links, phase-tagged the way the editor writes them.
      const nVid = played ? (chance(0.5) ? 2 : 1) : (chance(0.4) ? 1 : 0);
      for (let i = 0; i < nVid; i++) {
        const [title, phase] = pick(played ? VIDEO_TITLES : VIDEO_TITLES.slice(0, 2));
        note.videos.push({
          id: "mv_demo_" + id + "_" + i,
          title, url: pick(VIDEO_URLS), comment: "", phase,
        });
        summary.videos++;
      }

      const bs = matchBoards[id];
      if (Array.isArray(bs) && bs.length) {
        note.boards = bs.slice(0, 2).map((b) => ({
          boardId: String(b.boardId || b.id || ""),
          name: String(b.name || ""),
          tag: String(b.tag || ""),
        })).filter((b) => b.boardId);
      }

      writes.push({ref: notesCol.doc(id), data: note});
      haveNote.set(id, note);
      notes++; summary.notes++;
      if (!sample) sample = {m, note, first};
    }

    log(`  notes to create: ${notes}   first-leg links: ${legs}` +
      (LINK_EXISTING ? `   links added to existing notes: ${linked}` : ""));
  }

  if (sample) {
    step("Sample (the first note this run would create)");
    const {m, note, first} = sample;
    log(`  ${m.date}  ${m.home} vs ${m.away}   [${note.category}${note.team ? " " + note.team : ""}]`);
    if (first) log(`  anada  → ${first.date}  ${first.home} vs ${first.away}  (id ${first.id})`);
    else log("  anada  → none (no venue-swapped earlier fixture this season)");
    ["pre", "live", "post"].forEach((p) => {
      if (note[p].text) log(`  ${p.padEnd(5)}: ${note[p].text}`);
    });
    note.videos.forEach((v) => log(`  video: [${v.phase}] ${v.title}`));
  }

  step("Summary");
  log(`  matchNotes to create  : ${summary.notes}`);
  log(`  first-leg links       : ${summary.legs}   ← these render the anada briefing`);
  log(`  pre / live / post     : ${summary.pre} / ${summary.live} / ${summary.post}`);
  log(`  video links           : ${summary.videos}`);
  log(`  left alone (existing) : ${summary.skipped}`);
  if (LINK_EXISTING) {
    log(`  --link-existing:`);
    log(`    firstLegId added    : ${summary.linked}   ← one field, nothing else touched`);
    log(`    already linked      : ${summary.already}`);
    log(`    declined by coach   : ${summary.dismissed}   (legDismissed — never overridden)`);
  } else if (summary.skipped) {
    log(`\n  ${summary.skipped} existing notes were skipped entirely. If the fixtures you`);
    log("  demo are missing their anada briefing, re-run with --link-existing:");
    log("  it adds firstLegId to notes the coach was never asked about, and");
    log("  changes nothing else on them.");
  }

  if (!APPLY) {
    log("\nDRY RUN — nothing was written. Re-run with --apply to commit.");
    return;
  }

  step("Writing");
  const CHUNK = 400; // well inside the 500-op batch limit
  for (let i = 0; i < writes.length; i += CHUNK) {
    const batch = db.batch();
    /* create(), not set() — the read above and the write below are not one
       transaction, and a coach typing a note from a demo login in between
       must win. create() throws on a doc that appeared meanwhile; set()
       would silently flatten it. */
    writes.slice(i, i + CHUNK).forEach((w) => batch.create(w.ref, w.data));
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
  log(`  ${writes.length} matchNotes documents created`);

  /* update(), never set(merge:true). Both would leave the other fields
     alone, but update() also REFUSES a document that has gone away, and
     that is the difference worth having: a note deleted between the read
     and the write must not be resurrected as a stub holding nothing but a
     firstLegId, which is a document the UI would render as an empty notes
     block a coach cannot account for. */
  for (let i = 0; i < updates.length; i += CHUNK) {
    const batch = db.batch();
    updates.slice(i, i + CHUNK).forEach((u) => batch.update(u.ref, u.data));
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
  if (updates.length) log(`  ${updates.length} existing notes gained a firstLegId`);

  log("\nDone. Open any fixture from matchday 18 on to see the anada briefing.");
}

main().catch((e) => die(e.message));
