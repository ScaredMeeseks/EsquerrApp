#!/usr/bin/env node
/**
 * topup-demo-referees.js — mock federation referees for a demo club.
 *
 *   node functions/topup-demo-referees.js --club <id>            # DRY RUN
 *   node functions/topup-demo-referees.js --club <id> --apply    # write
 *   node functions/topup-demo-referees.js --club <id> --remove --apply
 *
 * ─── Read this before running it ────────────────────────────────────────
 *
 * This is the one script here that makes a demo club LOOK WORSE on some
 * screens in exchange for looking better on one. That is a deliberate trade
 * the owner made with the facts in front of him; it is not a free win, and
 * `--remove` exists so it can be taken back in one command.
 *
 * Referees are not a field on a match. `mdRefereeFor()` in js/app.js joins
 * `m.fcfActaId` against the global `fcfRefIndex` collection, and
 * `mdLoadAllRefIndices()` only loads the index for grup ids it finds in
 * `clubs/{id}.fcfLinks`. So there is no way to show a referee without
 * setting `fcfLinks`.
 *
 * ⚠ AND `fcfLinks` IS THE MASTER SWITCH FOR FOUR OTHER SURFACES, all of
 * which fetch LIVE from the federation at render time and none of which a
 * seeder can supply:
 *
 *   Classificació   getActiveFcfLeagues() returns [] while fcfLinks is
 *                   empty, which renders a clean "no link configured" card.
 *                   Set it, and the page fetches grupId through the proxy
 *                   and shows an ERROR when the group does not exist —
 *                   `_leagueErrors` exists precisely so the table "can say
 *                   so instead of showing nothing".
 *   Sancions        same gate (renderSancions), same outcome.
 *   El rival        the opponent's last five and their league position come
 *                   from parseFcfClassificacio()'s `form` and `pos` fields
 *                   — the LIVE standings row, cached only in the browser's
 *                   localStorage. There is no document behind it, so it
 *                   cannot be mocked at all and will stay empty.
 *   fcfSync         the club joins the scheduled fixture sync.
 *
 * On the last one, the thing that makes this safe rather than reckless:
 * fcf.js marks a fixture `fcfRemoved` only `if ((incoming || []).length)` —
 * "an empty incoming is an outage, not a cancelled season". A grup id the
 * federation does not have returns nothing, so the club's 102 fixtures are
 * never touched. Without that guard this script would be unusable, because
 * every fixture it stamps with an fcfActaId becomes a candidate for removal.
 *
 * ─── What it writes ─────────────────────────────────────────────────────
 *
 * 1. `clubs/{id}.fcfLinks` — one synthetic link per squad, carrying a grup id
 *    in the FAKE_GRUP_BASE range so it cannot collide with a real group.
 * 2. `fcfActaId` + `fcfJornada` on every fixture (a fa_matches shard merge).
 * 3. `fcfRefIndex/{season}_{grupId}` — the raw index, in the crawler's own
 *    shape: `actas[actaId] = {r:[names], c, res, gh, ga, d}` plus `cards`.
 * 4. `fcfReferees/{slug}` — the per-referee profiles.
 *
 * ⚠ THE SCORELINES IN THE INDEX ARE DERIVED FROM THE CLUB'S OWN STORED
 * EVENTS, never invented. `refereeHistoryWithUs()` renders "our matches he
 * has refereed" from `e.res`/`e.gh`/`e.ga`, while the scoreboard two
 * centimetres above it renders calcMatchScore() of `fa_match_events`. Invent
 * the index scoreline and the same screen shows a 2-1 and a 3-0 for one
 * match, which is the single most obvious way to be caught seeding data.
 *
 * ⚠ AND THE PROFILES ARE BUILT BY THE REAL `aggregateFcfReferees` REQUIRED
 * OUT OF functions/fcf.js, not by a copy. `_rebuildFcfReferees` recomputes
 * every profile from fcfRefIndex on a schedule, so a hand-rolled profile
 * would be silently replaced by a differently-shaped one within the week.
 * Using the real aggregator makes that rebuild a no-op instead.
 */
"use strict";

const path = require("path");
const U = require(path.join(__dirname, "..", "js", "utils.js"));
const Shard = require(path.join(__dirname, "..", "js", "shard.js"));
const {
  aggregateFcfReferees, fcfRefereeSlug, fcfRefIndexId, FCF_OFFENCE_ORDER,
} = require(path.join(__dirname, "fcf.js"));

const PROTECTED_CLUBS = new Set([
  "nDLJCpJfDvFHs8MnwtzW", // Esquerra de l'Eixample F.C.
  "lly4GkUxIpBkSgZvzldT", // F.C.Barcelona test club
  "default",
]);

/* Well above anything the federation issues, so a fake group can never be
   confused with a real one — by this script, by the crawler, or by a person
   reading the collection. --remove keys off this range too, which is why it
   is a constant and not a literal. */
const FAKE_GRUP_BASE = 99900000;
const FAKE_ACTA_BASE = 99000000;
const SEASON = "2026";
const TEMPORADA = "26";

// ── CLI ──
const argv = process.argv.slice(2);
const has = (f) => argv.includes(f);
const val = (f, d) => {
  const i = argv.indexOf(f);
  return i !== -1 && argv[i + 1] ? argv[i + 1] : d;
};
const APPLY = has("--apply");
const REMOVE = has("--remove");
const CLUB = val("--club", "");
const SEED = Number(val("--seed", "20260918"));

function die(msg) {
  console.error("\nERROR: " + msg + "\n");
  process.exit(1);
}
const log = (s) => console.log(s);
const step = (s) => console.log("\n── " + s + " " + "─".repeat(Math.max(0, 56 - s.length)));

if (!CLUB) die("--club <id> is required.");

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

const admin = require("firebase-admin");
admin.initializeApp({projectId: "esquerrapp"});
const db = admin.firestore();
const {FieldValue} = require("firebase-admin/firestore");

const todayStr = new Date().toISOString().slice(0, 10);

/* Invented names, checked to be unremarkable rather than recognisable: a
   real Catalan referee's name on a fabricated record is a defamation
   problem, not a demo. The slug is what keys `fcfReferees`, so these must
   also not collide with anyone real — hence surnames paired unusually. */
const REFEREES = [
  "Oriol Cabestany Vidal", "Marçal Puigdengolas Roca",
  "Ignasi Ferreruela Bosch", "Aleix Vinyals Comelles",
  "Guillem Rocafiguera Prats", "Nil Tarradellas Amigó",
  "Bernat Escandell Quer", "Arnau Solivelles Feixas",
  "Sergi Montardit Clua", "Pere Vallcorba Estanyol",
  "Jaume Riudaura Sentís", "Ferran Colldeforns Maça",
];
const ASSISTANTS = [
  "Pau Riembau Costa", "Jordi Malagelada Sitjar", "Roger Fontcuberta Illa",
  "Èric Bassegoda Nualart", "Martí Colomines Prunés", "Adrià Xicola Ventós",
  "Quim Berenguer Sadurní", "Lluís Empordà Caminal",
];

/* One division label per category. Shown as the heading of the referee's
   record — refereeDivisionStats() slices by it, so every acta of a group
   must carry the same one or a referee's matches split across two headings
   and each half falls under REF_MIN_SAMPLE. */
const COMP_BY_CAT = {
  amateur: "Tercera Catalana",
  juvenil: "Lliga Nacional Juvenil",
  cadet: "Preferent Cadet",
  infantil: "Primera Divisió Infantil",
  alevi: "Segona Divisió Aleví",
  benjami: "Segona Divisió Benjamí",
};

const blobOf = (doc) => {
  if (!doc || !doc.exists) return null;
  const d = doc.data() || {};
  if (typeof d.v !== "string") return null;
  try { return JSON.parse(d.v); } catch (e) {
    die(`${doc.id} holds unparseable JSON. Inspect it by hand before re-running.`);
  }
  return null;
};

function seasonStart(boundary) {
  const b = /^\d{2}-\d{2}$/.test(boundary || "") ? boundary : "08-15";
  const y = new Date().getFullYear();
  return todayStr >= y + "-" + b ? y + "-" + b : (y - 1) + "-" + b;
}

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
        "    Only clubs seed-demo-club.js created may be touched.");
  }
  const clubName = club.name || "";
  const start = seasonStart(club.seasonBoundary);
  log(`club        : ${clubName || "(unnamed)"}`);
  log(`today       : ${todayStr}   season starts ${start}`);
  log(`mode        : ${REMOVE ? "REMOVE" : "ADD"} · ` +
      `${APPLY ? "APPLY (will write)" : "DRY RUN (no writes)"}`);

  const dataCol = db.collection("teams").doc(CLUB).collection("data");
  const dataSnap = await dataCol.get();
  const docs = new Map(dataSnap.docs.map((d) => [d.id, d]));
  const cats = [...new Set(dataSnap.docs
      .map((d) => d.id.split(Shard.SEP)[1])
      .filter((c) => c && c !== "none"))];

  // ── --remove: put the club back the way it was ──
  if (REMOVE) {
    step("Removing");
    const existingLinks = club.fcfLinks || {};
    const mine = Object.keys(existingLinks).filter((k) => {
      const g = Number(U.fcfGrupId(existingLinks[k]) || 0);
      return g >= FAKE_GRUP_BASE;
    });
    const kept = Object.keys(existingLinks).filter((k) => mine.indexOf(k) === -1);
    if (kept.length) {
      /* A real link a lead pasted must survive this. Refuse rather than
         guess: removing someone's genuine FCF link is not recoverable from
         here, and a half-removed fcfLinks is worse than either state. */
      die(`clubs/${CLUB}.fcfLinks holds ${kept.length} link(s) NOT in the\n` +
          `    fake range (${kept.join(", ")}). Those look real. Remove the\n` +
          "    synthetic ones by hand rather than let this script guess.");
    }
    log(`  fcfLinks entries to clear : ${mine.length}`);

    const stripWrites = [];
    let stripped = 0;
    for (const cat of cats) {
      const key = "fa_matches" + Shard.SEP + cat;
      const matches = blobOf(docs.get(key));
      if (!matches) continue;
      let changed = false;
      matches.forEach((m) => {
        if (Number(m.fcfActaId || 0) >= FAKE_ACTA_BASE) {
          delete m.fcfActaId; delete m.fcfJornada; delete m.fcfRemoved;
          changed = true; stripped++;
        }
      });
      if (changed) {
        stripWrites.push({ref: dataCol.doc(key),
          data: {v: JSON.stringify(matches), category: cat}});
      }
    }
    log(`  fixtures to un-stamp      : ${stripped}`);

    const idxSnap = await db.collection("fcfRefIndex").get();
    const idxDel = idxSnap.docs.filter((d) =>
      Number((d.data() || {}).grupId || 0) >= FAKE_GRUP_BASE);
    const refSlugs = new Set();
    /* `r[0]` ONLY — the referee, never the assistants. aggregateFcfReferees
       takes `(e.r || [])[0]` and nothing else, so an assistant has no
       fcfReferees document and deleting by his slug is at best a wasted
       call. At worst it is destructive: these names are invented, but an
       invented assistant whose slug happened to match a real referee's
       would delete that real profile, and nothing here would report it. */
    idxDel.forEach((d) => {
      Object.values((d.data() || {}).actas || {}).forEach((e) => {
        const main = (e.r || [])[0];
        if (main) refSlugs.add(fcfRefereeSlug(main));
      });
    });
    log(`  fcfRefIndex docs to delete: ${idxDel.length}`);
    log(`  fcfReferees to delete     : ${refSlugs.size}`);

    if (!APPLY) { log("\nDRY RUN — nothing was written."); return; }
    for (const w of stripWrites) await w.ref.set(w.data, {merge: true});
    await db.collection("clubs").doc(CLUB).set({fcfLinks: {}}, {merge: true});
    for (const d of idxDel) await d.ref.delete();
    for (const slug of refSlugs) {
      if (slug) await db.collection("fcfReferees").doc(slug).delete();
    }
    log("\nDone. Classificació and Sancions are back to their empty states.");
    return;
  }

  // ── Squads: every (category, letter) pair that actually plays ──
  const squads = [];
  for (const cat of cats) {
    const matches = blobOf(docs.get("fa_matches" + Shard.SEP + cat)) || [];
    const letters = [...new Set(matches.map((m) => m.team || "").filter(Boolean))];
    letters.forEach((letter) => squads.push({cat, letter}));
  }
  if (!squads.length) die("No squads found — the club has no fixtures with a team letter.");
  squads.forEach((s, i) => { s.grupId = String(FAKE_GRUP_BASE + i + 1); });
  log(`squads      : ${squads.map((s) => s.cat + "-" + s.letter +
      " → grup " + s.grupId).join(", ")}`);

  const links = Object.assign({}, club.fcfLinks || {});
  squads.forEach((s) => {
    links[s.cat + "-" + s.letter] =
      `https://www.fcf.cat/classificacio?temporadaId=${TEMPORADA}&grupId=${s.grupId}`;
  });

  const writes = [];
  const indexDocs = [];
  let stamped = 0; let appointed = 0; let recorded = 0;

  /* ── Who referees which division, and why it is not just pick(REFEREES) ──

     refereeDivisionStats() suppresses the H/D/A percentages below
     REF_MIN_SAMPLE = 6 matches IN THE DIVISION BEING VIEWED — "a referee
     three games into a tier has a 100% home wins that means nothing". The
     bar is the centre of the panel, so a demo where most referees are under
     six shows the thin fallback almost everywhere.

     Picking each fixture's referee from the whole list does exactly that:
     the first build spread 8 names over 84 fixtures in two divisions and
     left 7 of 8 thin. So each division gets its OWN DISJOINT pool, sized so
     every member clears six with room — roughly one referee per ten
     fixtures, never fewer than three. Disjoint rather than shared because a
     referee split across two divisions is thin in both while looking busy
     in neither. */
  const playedByCat = {};
  for (const cat of cats) {
    playedByCat[cat] = (blobOf(docs.get("fa_matches" + Shard.SEP + cat)) || [])
        .filter((m) => m.date && m.date >= start && m.date < todayStr).length;
  }
  const poolByCat = {};
  let cursor = 0;
  const demand = cats.reduce((s, c) =>
    s + Math.max(3, Math.round(playedByCat[c] / 10)), 0);
  if (demand > REFEREES.length) {
    /* Wrapping would put one name in two divisions, which is legal (real
       referees do work several) but quietly breaks the "disjoint" property
       the sizing above relies on. Say so rather than let the REF_MIN_SAMPLE
       line be the only hint. */
    log(`  ⚠ ${demand} pool slots wanted but only ${REFEREES.length} names: ` +
        "some referees will cover two divisions.");
  }
  for (const cat of cats) {
    const want = Math.max(3, Math.round(playedByCat[cat] / 10));
    const pool = [];
    for (let i = 0; i < want; i++) {
      pool.push(REFEREES[(cursor + i) % REFEREES.length]);
    }
    cursor += want;
    poolByCat[cat] = pool;
  }

  for (const cat of cats) {
    rnd = mulberry32(SEED + cat.length);
    const key = "fa_matches" + Shard.SEP + cat;
    const matches = blobOf(docs.get(key)) || [];
    const events = blobOf(docs.get("fa_match_events" + Shard.SEP + cat)) || {};
    if (!matches.length) continue;

    /* Same guard the notes script carries, for the same reason: ourSideOf()
       is exact equality on the club name and silently answers "away" for
       everything if it drifts, which would invert every stored result. */
    if (!matches.filter((m) => U.ourSideOf(m, clubName) === "home").length) {
      die(`${cat}: not one fixture has home === "${clubName}".`);
    }

    step(`${cat} — ${matches.length} fixtures`);
    const comp = COMP_BY_CAT[cat] || "Tercera Catalana";
    const pool = poolByCat[cat];
    log(`  ${comp}: ${pool.length} referees for ${playedByCat[cat]} played ` +
        `(~${Math.floor(playedByCat[cat] / pool.length)} each)`);
    let changed = false;

    for (const sq of squads.filter((s) => s.cat === cat)) {
      const mine = matches.filter((m) => (m.team || "") === sq.letter &&
        m.date && m.date >= start);
      const actas = {};
      const cards = {};

      // Newest last, so jornada numbers run with the calendar.
      mine.sort((a, b) => String(a.date).localeCompare(String(b.date)));

      mine.forEach((m, i) => {
        const actaId = String(FAKE_ACTA_BASE + Number(sq.grupId) % 1000 * 10000 + i);
        if (!m.fcfActaId) { m.fcfActaId = actaId; changed = true; stamped++; }
        if (!m.fcfJornada) { m.fcfJornada = String(i + 1); changed = true; }

        const played = m.date < todayStr;
        // One trio per fixture, stable across runs via the seeded RNG.
        const names = [pick(pool)];
        const a1 = pick(ASSISTANTS);
        const a2 = ASSISTANTS[(ASSISTANTS.indexOf(a1) + 1 + rint(0, 3)) % ASSISTANTS.length];
        if (chance(0.85)) names.push(a1, a2);

        const e = {r: names, d: m.date};
        if (played) {
          /* From the club's OWN events, so the referee panel and the
             scoreboard on the same page cannot disagree. */
          const ev = events[String(m.id)] || [];
          const gh = ev.filter((x) => x && x.type === "goal" && x.side === "home").length;
          const ga = ev.filter((x) => x && x.type === "goal" && x.side === "away").length;
          e.c = true;
          e.gh = gh; e.ga = ga;
          e.res = gh > ga ? "H" : (gh === ga ? "D" : "A");
          recorded++;

          /* Sendings-off are RARE and the offence list is the federation's
             own closed set. Yellow cards are deliberately absent: the
             federation records an offence only when it produced a
             suspension, which is why the UI carries a "no yellows" note. */
          if (chance(0.22)) {
            const reds = chance(0.55) ? 1 : 0;
            const doubles = reds ? 0 : 1;
            const off = {};
            off[pick(FCF_OFFENCE_ORDER)] = 1;
            cards[actaId] = {reds, doubles, off};
          }
        } else {
          // An appointment, not a record: `c` falsy is what tells
          // aggregateFcfReferees to count it in neither.
          appointed++;
        }
        actas[actaId] = e;
      });

      indexDocs.push({
        id: fcfRefIndexId(SEASON, sq.grupId),
        data: {grupId: sq.grupId, season: SEASON, comp, actas, cards,
          demoSeed: true, updatedAt: FieldValue.serverTimestamp()},
      });
      log(`  ${sq.cat}-${sq.letter}: ${mine.length} fixtures → grup ${sq.grupId} (${comp})`);
    }

    if (changed) {
      writes.push({ref: dataCol.doc(key),
        data: {v: JSON.stringify(matches), category: cat}});
    }
  }

  /* The profiles, built by the REAL aggregator so the Friday rebuild is a
     no-op rather than a reshape. */
  const profiles = aggregateFcfReferees(
      indexDocs.map((d) => ({comp: d.data.comp, season: d.data.season,
        actas: d.data.actas})),
      indexDocs.reduce((acc, d) => Object.assign(acc, d.data.cards), {}));

  step("Summary");
  log(`  fixtures stamped with an acta id : ${stamped}`);
  log(`  actas with a RECORD (played)     : ${recorded}`);
  log(`  actas with an APPOINTMENT only   : ${appointed}`);
  log(`  fcfRefIndex documents            : ${indexDocs.length}`);
  log(`  fcfReferees profiles             : ${Object.keys(profiles).length}`);
  log(`  fcfLinks entries                 : ${squads.length}`);

  /* REF_MIN_SAMPLE is 6: below that refereeDivisionStats suppresses the
     percentages and the panel shows counts only. Worth knowing BEFORE the
     write, because the fix is more fixtures per referee, i.e. fewer names. */
  const thin = Object.values(profiles).filter((p) =>
    Object.values(p.byDivision).some((d) => d.matches < 6));
  log(`  referees under REF_MIN_SAMPLE(6) : ${thin.length} of ` +
      `${Object.keys(profiles).length}` +
      (thin.length ? "  ← these show counts but no H/D/A bar" : ""));

  log("\n  ⚠ This also switches ON Classificació, Sancions and El rival,");
  log("    which fetch live and will FAIL against these grup ids.");
  log("    Undo with:  --remove --apply");

  if (!APPLY) {
    log("\nDRY RUN — nothing was written. Re-run with --apply to commit.");
    return;
  }

  step("Writing");
  for (const w of writes) await w.ref.set(w.data, {merge: true});
  log(`  ${writes.length} fa_matches shards updated`);
  for (const d of indexDocs) {
    await db.collection("fcfRefIndex").doc(d.id).set(d.data, {merge: true});
  }
  log(`  ${indexDocs.length} fcfRefIndex documents written`);
  const slugs = Object.keys(profiles);
  let batch = db.batch(); let ops = 0;
  for (const slug of slugs) {
    batch.set(db.collection("fcfReferees").doc(slug),
        Object.assign({updatedAt: FieldValue.serverTimestamp(), demoSeed: true},
            profiles[slug]));
    if (++ops >= 450) { await batch.commit(); batch = db.batch(); ops = 0; }
  }
  if (ops > 0) await batch.commit();
  log(`  ${slugs.length} fcfReferees profiles written`);

  // LAST: nothing above it is visible to the app until this lands.
  await db.collection("clubs").doc(CLUB).set({fcfLinks: links}, {merge: true});
  log("  clubs/{id}.fcfLinks set");
  log("\nDone. Open a fixture — the referee panel is under the match facts.");
}

main().catch((e) => die(e.message));
