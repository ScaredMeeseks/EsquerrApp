#!/usr/bin/env node
/**
 * topup-demo-metrics.js — player MEASUREMENTS (Plantilla → Mètriques) for an
 * already-seeded demo club.
 *
 *   node functions/topup-demo-metrics.js --club <id>            # DRY RUN
 *   node functions/topup-demo-metrics.js --club <id> --apply    # write
 *
 *   --today YYYY-MM-DD  pretend it is another day (tests, rehearsals).
 *
 * Read from production on 2026-10-09: `playerMetrics` held no document at all
 * and no squad had a metric catalogue, so the Mètriques chart, table and
 * download (v236-v242) showed nothing on the club prospects are shown.
 *
 * ─── What it writes ─────────────────────────────────────────────────────
 *
 * 1. Three fitness tests in each squad's catalogue, `fa_metric_catalog__{cat}`,
 *    in the app's own row shape (js/app.js, the "__new" branch of the add
 *    sheet): `{id: 'm_…', slug, name, unit, category, team}`. A squad that
 *    already has a metric with that slug keeps its own.
 * 2. Measurements in `teams/{id}/playerMetrics/{uid}_{metricId}_{date}_{rand}`
 *    — the app's doc id — as `{uid, metricId, slug, name, unit, value, date}`.
 *    `name` and `unit` are denormalised onto every record, as the app does
 *    (see js/db.js RECORD_COLLECTIONS.playerMetrics), so a record still reads
 *    if the catalogue row is ever out of reach.
 *      - Weight (built-in `weight`, "Pes", kg) every second Monday from the
 *        season start, about one in ten missed; a little lost in pre-season,
 *        then steady.
 *      - Height (built-in `height`, "Alçada", cm) at the first weigh-in;
 *        Juvenil again in September — they are still growing.
 *      - CMJ, Sprint 30 m and Yo-Yo IR1 at the first session of each month,
 *        skipping a player injured that day, improving modestly.
 *    Values follow the player's position (keepers and centre-backs heavier
 *    and taller) and squad (Juvenil lighter), from a stable hash of the uid,
 *    so the same player is the same size on every run.
 *
 * Create-only: a reading already on record for the same player, metric and
 * date is never duplicated, so the script can be re-run. Refuses any club not
 * stamped `demoSeed: true`, and any PROTECTED_CLUB. Dry run by default.
 *
 * Every decision is made by the pure `plan()`, which test/topup-demo.test.js
 * runs.
 */
"use strict";

const path = require("path");
const Shard = require(path.join(__dirname, "..", "js", "shard.js"));
const Season = require(path.join(__dirname, "topup-demo-season.js"));

const PROTECTED_CLUBS = Season.PROTECTED_CLUBS;

/** The built-ins (js/app.js PLM_BUILTIN), named as the Catalan UI names them. */
const WEIGHT = {id: "weight", slug: "weight", name: "Pes", unit: "kg"};
const HEIGHT = {id: "height", slug: "height", name: "Alçada", unit: "cm"};
/** The custom tests. `slug` is what js/app.js plmSlug() makes of `name`. */
const TESTS = [
  {name: "CMJ", slug: "cmj", unit: "cm"},
  {name: "Sprint 30 m", slug: "sprint-30-m", unit: "s"},
  {name: "Yo-Yo IR1", slug: "yo-yo-ir1", unit: "m"},
];

function hash01(s, salt) {
  let h = 0x811c9dc5;
  const str = salt + ":" + s;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return (h >>> 0) / 4294967296;
}
const round = (v, dp) => Math.round(v * Math.pow(10, dp)) / Math.pow(10, dp);
const dowOf = (s) => {
  const [y, m, d] = s.split("-").map(Number);
  return (new Date(y, m - 1, d, 12).getDay() + 6) % 7 + 1; // 1 = Monday
};

/** A player's body, from his position and squad. Stable per uid. */
function bodyOf(p, cat) {
  const uid = String(p.id || p.uid);
  const line = Season.lineOf(p);
  const youth = cat === "juvenil" || cat === "cadet" || cat === "infantil";
  const h = (salt) => hash01(uid, salt);
  const height = {gk: 184, def: 180, mid: 174, att: 176}[line] + Math.round((h("h") - 0.5) * 12) - (youth ? 3 : 0);
  const bmi = 22.2 + (h("bmi") - 0.5) * 2.6 - (youth ? 1.3 : 0);
  return {
    height,
    weight: round(bmi * Math.pow(height / 100, 2), 1),
    cmj: 34 + h("cmj") * 12 + (line === "att" ? 2 : 0) - (line === "gk" ? 1 : 0),
    sprint: 4.15 + h("spr") * 0.4 + (line === "gk" ? 0.12 : 0) - (line === "att" ? 0.06 : 0) + (youth ? 0.08 : 0),
    yoyo: 1320 + Math.round(h("yo") * 22) * 40 + (line === "mid" ? 200 : 0) - (line === "gk" ? 360 : 0) - (youth ? 120 : 0),
  };
}

/**
 * PURE. `state`: {club, shards: Map docId → parsed blob, metrics: Map docId → record}.
 * Returns {catalog: [{id, cat, value}], records: [{id, data}], summary, report}.
 */
function plan(state, opts) {
  const today = opts.today;
  const start = Season.seasonStart((state.club || {}).seasonBoundary, today);
  const cats = [...new Set([...state.shards.keys()].map((id) => id.split(Shard.SEP)[1])
      .filter((c) => c && c !== "none"))].sort();
  const have = new Set([...state.metrics.values()].map((r) => `${r.uid}|${r.slug}|${r.date}`));
  const out = {catalog: [], records: [], report: [],
    summary: {catalogRows: 0, weight: 0, height: 0, tests: 0, playersMeasured: 0}};
  const measured = new Set();

  // Every second Monday from the first Monday of the season.
  let firstMonday = start;
  while (dowOf(firstMonday) !== 1) firstMonday = Season.addDays(firstMonday, 1);
  const weighDays = [];
  for (let d = firstMonday; d <= today; d = Season.addDays(d, 14)) weighDays.push(d);

  for (const cat of cats) {
    const R = Season.makeRand((opts.seed == null ? 20261009 : opts.seed) + cat.length * 131);
    const get = (k) => {
      const v = state.shards.get(k + Shard.SEP + cat);
      return v == null ? null : JSON.parse(JSON.stringify(v));
    };
    const players = (get("fa_users") || []).filter((u) => Array.isArray(u.roles) && u.roles.includes("player"));
    if (!players.length) continue;
    const trainings = (get("fa_training") || []).filter((t) => t && t.date && t.date >= start && t.date <= today);
    const injuredOn = Season.injuredOnFn(get("fa_injuries") || [], today);

    // ── 1. The catalogue, per squad ──
    const catalog = get("fa_metric_catalog") || [];
    let cChanged = false;
    const letters = [...new Set(players.map((p) => p.team || ""))].sort();
    const defs = {};
    letters.forEach((letter) => {
      defs[letter] = TESTS.map((t) => {
        const found = catalog.find((m) => m && m.slug === t.slug &&
          String(m.category || "") === cat && String(m.team || "") === letter);
        if (found) return found;
        const row = {id: "m_" + (Date.parse(start + "T12:00:00Z")).toString(36) + "_" + R.id36(),
          slug: t.slug, name: t.name, unit: t.unit, category: cat, team: letter};
        catalog.push(row); cChanged = true; out.summary.catalogRows++;
        return row;
      });
    });
    if (cChanged) out.catalog.push({id: "fa_metric_catalog" + Shard.SEP + cat, cat, value: catalog});

    // ── 2. Measurements ──
    const add = (p, m, date, value) => {
      const uid = String(p.id || p.uid);
      const k = `${uid}|${m.slug}|${date}`;
      // Drawn BEFORE the check, so a re-run walks the same random sequence
      // as the first run whether or not this reading already exists.
      const tail = R.id36().padStart(4, "0").slice(-4);
      if (have.has(k)) return false;
      have.add(k);
      out.records.push({id: `${uid}_${m.id}_${date}_${tail}`,
        data: {uid, metricId: m.id, slug: m.slug, name: m.name, unit: m.unit, value, date}});
      measured.add(uid);
      return true;
    };
    const youth = cat !== "amateur";
    players.forEach((p) => {
      const body = bodyOf(p, cat);
      let walk = 0;
      weighDays.forEach((d, i) => {
        // Pre-season sheds a kilo and a half over the first eight weeks.
        walk = Math.max(-1.2, Math.min(1.2, walk + (R.rnd() - 0.5) * 0.5));
        const value = round(body.weight + 0.8 - 1.5 * Math.min(1, i / 4) + walk + (R.rnd() - 0.5) * 0.8, 1);
        // A missed weigh-in is a fact about that player and that day, not a
        // draw — a draw would be re-made on the next run and fill the gap.
        if (i > 0 && hash01(String(p.id || p.uid), "miss" + d) < 0.1) return;
        if (add(p, WEIGHT, d, value)) out.summary.weight++;
      });
      if (weighDays.length && add(p, HEIGHT, weighDays[0], body.height)) out.summary.height++;
      const sept = weighDays.find((d) => d >= start.slice(0, 4) + "-09-01");
      if (youth && sept && add(p, HEIGHT, sept, body.height + R.rint(0, 1))) out.summary.height++;
    });

    // Tests: the first session of each month that the player was called to.
    letters.forEach((letter) => {
      const squad = players.filter((p) => (p.team || "") === letter);
      const firsts = new Map();
      trainings.slice().sort((a, b) => a.date.localeCompare(b.date)).forEach((t) => {
        const month = t.date.slice(0, 7);
        if (!firsts.has(month) && squad.some((p) => Season.isCalledTo(t, p))) firsts.set(month, t);
      });
      [...firsts.values()].forEach((t, k) => {
        squad.forEach((p) => {
          if (!Season.isCalledTo(t, p)) return;
          if (injuredOn(String(p.id || p.uid), t.date)) return;
          const b = bodyOf(p, cat);
          const [cmj, spr, yoyo] = defs[letter];
          if (add(p, cmj, t.date, round(b.cmj + 0.35 * k + (R.rnd() - 0.5) * 2.4, 1))) out.summary.tests++;
          if (add(p, spr, t.date, round(b.sprint - 0.012 * k + (R.rnd() - 0.5) * 0.08, 2))) out.summary.tests++;
          if (add(p, yoyo, t.date, Math.max(600, b.yoyo + 40 * k + 40 * R.rint(-2, 2)))) out.summary.tests++;
        });
      });
    });
    out.report.push(`${cat}: ${letters.length} squad(s), ${players.length} players`);
  }
  out.summary.playersMeasured = measured.size;
  return out;
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
  const APPLY = has("--apply");
  const CLUB = val("--club", "");
  const opts = {today: val("--today", new Date().toISOString().slice(0, 10))};
  if (!CLUB) die("--club <id> is required.");
  if (PROTECTED_CLUBS.has(CLUB)) die(`${CLUB} is a PROTECTED club. This script will not touch it.`);

  const admin = require("firebase-admin");
  admin.initializeApp({projectId: "esquerrapp"});
  const db = admin.firestore();
  const club = (await db.collection("clubs").doc(CLUB).get()).data();
  if (!club) die(`clubs/${CLUB} does not exist.`);
  if (club.demoSeed !== true) die(`clubs/${CLUB} is not stamped demoSeed:true.`);
  const teamRef = db.collection("teams").doc(CLUB);
  const [dataSnap, mSnap] = await Promise.all([teamRef.collection("data").get(), teamRef.collection("playerMetrics").get()]);
  const shards = new Map();
  dataSnap.docs.forEach((d) => {
    const data = d.data() || {};
    if (typeof data.v !== "string") return;
    try { shards.set(d.id, JSON.parse(data.v)); } catch (e) { die(`${d.id} holds unparseable JSON.`); }
  });
  const metrics = new Map(mSnap.docs.map((d) => [d.id, d.data() || {}]));
  const out = plan({club, shards, metrics}, opts);
  log(`club   : ${club.name}\nexisting playerMetrics: ${metrics.size}\nmode   : ${APPLY ? "APPLY" : "DRY RUN"}`);
  out.report.forEach((r) => log("  " + r));
  Object.entries(out.summary).forEach(([k, v]) => log(`  ${k.padEnd(16)}: ${v}`));
  if (!APPLY) { log("\nDRY RUN — nothing was written. Re-run with --apply to commit."); return; }

  for (const w of out.catalog) {
    await teamRef.collection("data").doc(w.id).set({v: JSON.stringify(w.value), category: w.cat}, {merge: true});
  }
  const CHUNK = 400;
  for (let i = 0; i < out.records.length; i += CHUNK) {
    const batch = db.batch();
    // create(): a reading that appeared meanwhile must not be overwritten.
    out.records.slice(i, i + CHUNK).forEach((r) => batch.create(teamRef.collection("playerMetrics").doc(r.id), r.data));
    await batch.commit();
  }
  log(`  ${out.catalog.length} catalogue shard(s), ${out.records.length} measurements written\nDone.`);
}

if (require.main === module) {
  main().catch((e) => { console.error("\nERROR: " + e.message + "\n"); process.exit(1); });
}

module.exports = {plan, bodyOf, TESTS, WEIGHT, HEIGHT};
