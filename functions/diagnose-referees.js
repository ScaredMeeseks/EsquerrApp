#!/usr/bin/env node
/**
 * diagnose-referees.js — why is there no referee on this fixture?
 *
 *   node functions/diagnose-referees.js --club <id>
 *   node functions/diagnose-referees.js --club <id> --all   # every fixture
 *
 * ⚠ READ-ONLY. There is no --apply and no write path anywhere in this file.
 * It is safe to point at a PROTECTED club, which is the whole reason it
 * exists: the referee chain has five links and the only way to tell which
 * one is broken is to read all five.
 *
 * ─── The chain ──────────────────────────────────────────────────────────
 *
 *   1. clubs/{id}.fcfLinks          mdLoadAllRefIndices() loads an index
 *                                   ONLY for grup ids found here. No link,
 *                                   no referee, however good the data is.
 *   2. the fixture's fcfActaId      the join key. A hand-typed fixture has
 *                                   none and can never show a referee.
 *   3. fcfRefIndex/{season}_{grup}  mdLoadRefIndex queries by grupId and
 *                                   keeps the HIGHEST season. A group whose
 *                                   newest doc is last season's will answer
 *                                   for it and shadow this one.
 *   4. actas[actaId].r              the names. An acta fetched BEFORE the
 *                                   appointment was posted has an entry with
 *                                   no `r`, which renders exactly like no
 *                                   entry at all.
 *   5. fcfReferees/{slug}           only for the RECORD panel. Its absence
 *                                   shows the name with "no record yet",
 *                                   never a blank referee block.
 *
 * Appointments reach step 4 only through `fcfWeeklyRefs`, which runs
 * `0 6,7,8 * * 5` — three firings on FRIDAY MORNING and at no other time.
 * Each firing works an 8-minute budget through a queue of every group in
 * scope and resumes where the last stopped, but the Friday 06:00 run REBUILDS
 * the queue from position 0 (`freshFor: today`). So a group that sits past
 * the three firings' reach is not merely late — it is never read for
 * appointments at all, week after week, and nothing reports that.
 * This script prints the queue position so that is visible rather than
 * inferred.
 */
"use strict";

const path = require("path");
const U = require(path.join(__dirname, "..", "js", "utils.js"));
const Shard = require(path.join(__dirname, "..", "js", "shard.js"));

const argv = process.argv.slice(2);
const has = (f) => argv.includes(f);
const val = (f, d) => {
  const i = argv.indexOf(f);
  return i !== -1 && argv[i + 1] ? argv[i + 1] : d;
};
const CLUB = val("--club", "");
const ALL = has("--all");

function die(msg) { console.error("\nERROR: " + msg + "\n"); process.exit(1); }
const log = (s) => console.log(s);
const step = (s) => console.log("\n── " + s + " " + "─".repeat(Math.max(0, 56 - s.length)));
if (!CLUB) die("--club <id> is required.");

const admin = require("firebase-admin");
admin.initializeApp({projectId: "esquerrapp"});
const db = admin.firestore();

const todayStr = new Intl.DateTimeFormat("en-CA", {timeZone: "Europe/Madrid"})
    .format(new Date());

const blobOf = (doc) => {
  if (!doc || !doc.exists) return null;
  const d = doc.data() || {};
  if (typeof d.v !== "string") return null;
  try { return JSON.parse(d.v); } catch (e) { return null; }
};

const ok = (s) => log("  ✔ " + s);
const bad = (s) => log("  ✘ " + s);
const info = (s) => log("    " + s);

async function main() {
  step("Club");
  const clubSnap = await db.collection("clubs").doc(CLUB).get();
  if (!clubSnap.exists) die(`clubs/${CLUB} does not exist.`);
  const club = clubSnap.data() || {};
  const clubName = club.name || "(unnamed)";
  log(`  ${clubName}   (${CLUB})`);
  log(`  today (Madrid): ${todayStr}`);

  // ── 1. fcfLinks ──
  step("1. clubs/{id}.fcfLinks — which indices the app will load");
  const links = club.fcfLinks || {};
  const keys = Object.keys(links);
  if (!keys.length) {
    bad("fcfLinks is EMPTY — no referee can ever render, for any fixture.");
    return;
  }
  const grupByKey = {};
  const temporades = new Set();
  keys.forEach((k) => {
    const g = U.fcfGrupId(links[k]);
    grupByKey[k] = g;
    /* The temporada the LEAD actually pasted. This is the value
       fcfCrawl/config.seasons has to hold: fcfBuildQueue passes it straight
       to `competicions?temporada=`, and a config pointing at another season
       builds a queue that cannot contain this club's groups however long it
       runs. It is also the season half of the fcfRefIndex doc id. */
    const t = /[?&]temporadaId=(\d{1,4})\b/.exec(String(links[k] || ""));
    if (t) temporades.add(t[1]);
    if (g) ok(`${k} → grupId ${g}` + (t ? `   temporadaId ${t[1]}` : ""));
    else bad(`${k} → NO grupId could be parsed from "${links[k]}"`);
    info(`link: ${links[k]}`);
  });
  const grupIds = [...new Set(Object.values(grupByKey).filter(Boolean))];
  if (temporades.size) {
    log(`\n  → fcfCrawl/config.seasons should be [${[...temporades]
        .map((s) => `"${s}"`).join(", ")}]`);
  } else {
    bad("no temporadaId in any link — cannot tell which season to crawl.");
  }

  // ── 3. the index documents ──
  step("3. fcfRefIndex — the documents those grup ids resolve to");
  const indexByGrup = {};
  for (const g of grupIds) {
    const snap = await db.collection("fcfRefIndex").where("grupId", "==", g).get();
    if (snap.empty) { bad(`grupId ${g}: NO fcfRefIndex document at all`); continue; }
    /* Same rule as mdLoadRefIndex: two seasons can share a group id and the
       newest wins. Printing every one makes a shadowing problem visible. */
    let best = null;
    snap.forEach((d) => {
      const v = d.data() || {};
      const n = Object.keys(v.actas || {}).length;
      const withR = Object.values(v.actas || {})
          .filter((e) => (e.r || []).length).length;
      info(`${d.id}  season=${v.season}  comp="${v.comp || ""}"  ` +
           `actas=${n}  withReferee=${withR}`);
      if (!best || String(v.season || "") > String(best.season || "")) best = v;
    });
    if (best) {
      indexByGrup[g] = best;
      ok(`grupId ${g}: using season ${best.season} ` +
         `(${Object.keys(best.actas || {}).length} actas)`);
      if (snap.size > 1) {
        info("⚠ more than one season for this group — the app uses the highest.");
      }
    }
  }

  // ── 2 + 4. the fixtures themselves ──
  step("2+4. Fixtures — acta id, and whether the index names a referee");
  const dataSnap = await db.collection("teams").doc(CLUB).collection("data").get();
  const docs = new Map(dataSnap.docs.map((d) => [d.id, d]));
  const cats = [...new Set(dataSnap.docs.map((d) => d.id.split(Shard.SEP)[1])
      .filter((c) => c && c !== "none"))];

  const refNames = new Set();
  let shown = 0;
  for (const cat of cats) {
    const matches = blobOf(docs.get("fa_matches" + Shard.SEP + cat)) || [];
    const letters = [...new Set(matches.map((m) => m.team || "").filter(Boolean))];
    for (const letter of letters) {
      const mine = matches
          .filter((m) => (m.team || "") === letter && m.date && !m.fcfRemoved)
          .sort((a, b) => String(a.date).localeCompare(String(b.date)));
      // The NEXT fixture is the question actually being asked.
      const upcoming = mine.filter((m) => m.date >= todayStr);
      const pick = ALL ? mine : upcoming.slice(0, 3);
      if (!pick.length) continue;

      const g = grupByKey[cat + "-" + letter] || "";
      log(`\n  ${cat}-${letter}   grupId ${g || "(none configured)"}`);
      const idx = indexByGrup[g];

      pick.forEach((m) => {
        shown++;
        const when = m.date + (m.date === todayStr ? "  (TODAY)" : "");
        const vs = `${m.home} vs ${m.away}`;
        if (!m.fcfActaId) {
          bad(`${when}  ${vs}`);
          info("no fcfActaId on the fixture — hand-typed, or never matched to");
          info("the federation's calendar. Nothing can join a referee to it.");
          return;
        }
        if (!idx) {
          bad(`${when}  ${vs}   acta ${m.fcfActaId}`);
          info("no index document for this squad's group (see step 3).");
          return;
        }
        const e = (idx.actas || {})[String(m.fcfActaId)];
        if (!e) {
          bad(`${when}  ${vs}   acta ${m.fcfActaId}`);
          info("acta NOT in the index — this group has not been crawled since");
          info("the fixture was published. See the queue position below.");
          return;
        }
        if (!(e.r || []).length) {
          bad(`${when}  ${vs}   acta ${m.fcfActaId}`);
          info(`acta IS indexed (c=${!!e.c}, d=${e.d || "?"}) but carries NO referee.`);
          if (e.c) {
            /* A PLAYED acta always names its officials, so this is a hole in
               the record, and `cur.c` short-circuits the due rule — no
               scheduled run will ever revisit it. */
            info("⚠ it is marked PLAYED, so this is a GAP, not a pending");
            info("  appointment — and the due rule will never re-read it.");
            info("  Strip refereeless entries from this group's index and re-crawl.");
          } else {
            /* Normal and temporary since the 2026-09-19 re-fetch fix: the
               federation posts officials on the Thursday before, and an
               unplayed acta is now re-read until it has them — but only
               inside FCF_APPOINTMENT_HORIZON_DAYS of kick-off. */
            info("not appointed yet. The federation posts officials on the");
            info("  Thursday before, and an unplayed acta is now re-read until");
            info("  it has them — within ~10 days of kick-off, not before.");
          }
          return;
        }
        ok(`${when}  ${vs}`);
        info(`referee: ${e.r[0]}` +
          (e.r.length > 1 ? `   assistants: ${e.r.slice(1).join(", ")}` : ""));
        refNames.add(e.r[0]);
      });
    }
  }
  if (!shown) log("  (no upcoming fixtures found — try --all)");

  // ── 5. the profiles ──
  step("5. fcfReferees — the RECORD panel (absence ≠ a blank referee block)");
  if (!refNames.size) {
    info("no referee names resolved above, so nothing to look up.");
  } else {
    for (const name of refNames) {
      const slug = U.fcfRefereeSlug(name);
      const d = await db.collection("fcfReferees").doc(slug).get();
      if (!d.exists) {
        bad(`${name} (${slug}) — no profile; panel shows "no record yet"`);
        continue;
      }
      const p = d.data() || {};
      const divs = Object.keys(p.byDivision || {});
      ok(`${name} — ${p.matches || 0} matches, divisions: ${divs.join(", ") || "none"}`);
      divs.forEach((dv) => {
        const s = p.byDivision[dv];
        info(`${dv}: ${s.matches} matches` +
          (s.matches < 6 ? "  ⚠ under REF_MIN_SAMPLE(6) — counts, no H/D/A bar" : ""));
      });
    }
  }

  // ── The crawl itself ──
  step("The crawl — has the weekly pass actually reached this group?");
  const cfg = (await db.doc("fcfCrawl/config").get()).data() || {};
  /* `enabled: c.enabled === true` in fcfCrawlConfig — anything other than a
     literal true makes every crawl return {skipped:"disabled"} and write
     nothing, which is indistinguishable on screen from a season with no
     appointments yet. */
  (cfg.enabled === true ? ok : bad)(`enabled: ${cfg.enabled === true}` +
    (cfg.enabled === true ? "" : "   ← every crawl is a no-op while this is not true"));
  log(`  seasons   : ${(cfg.seasons || []).join(", ") || "(none)"}`);
  log(`  tiers     : ${(cfg.tiers || []).join(", ") || "(default: all senior)"}`);
  log(`  onlyGroups: ${(cfg.onlyGroups || []).join(", ") || "(none — every group in scope)"}`);
  log(`  budgetMs  : ${cfg.budgetMs || "(default 480000)"}   ` +
      `concurrency: ${cfg.concurrency || "(default 3)"}`);
  for (const [label, docPath] of [["weekly (appointments, Fri 6/7/8)", "fcfCrawl/weekly"],
    ["backfill (played, nightly)", "fcfCrawl/state"]]) {
    const s = (await db.doc(docPath).get()).data() || {};
    const q = Array.isArray(s.queue) ? s.queue : [];
    const at = Number(s.at) || 0;
    const ran = s.ranAt && s.ranAt.toDate ? s.ranAt.toDate().toISOString() : "(never)";
    log(`\n  ${label}`);
    info(`queue ${at}/${q.length}` +
      (q.length ? `  (${Math.round(at * 100 / q.length)}% through)` : "") +
      `   freshFor=${s.freshFor || "-"}   ranAt=${ran}`);
    if (q.length && at < q.length) {
      info(`⚠ NOT finished: ${q.length - at} groups unread when it stopped.`);
    }
    // Where our groups sit in that queue is the whole question.
    grupIds.forEach((g) => {
      const pos = q.findIndex((e) => String((e || {}).grupId || "") === String(g));
      if (pos === -1) {
        info(`grupId ${g}: NOT IN THE QUEUE — out of scope for this crawl.`);
      } else {
        info(`grupId ${g}: queue position ${pos}` +
          (pos < at ? "  ✔ reached" : "  ⚠ NOT yet reached this cycle"));
      }
    });
  }
  log("");
}

main().catch((e) => die(e.message));
