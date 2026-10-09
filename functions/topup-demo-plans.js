#!/usr/bin/env node
/**
 * topup-demo-plans.js — session PLANS (Pla d'entrenament) for an
 * already-seeded demo club.
 *
 *   node functions/topup-demo-plans.js --club <id>            # DRY RUN
 *   node functions/topup-demo-plans.js --club <id> --apply    # write
 *
 *   --from YYYY-MM-DD   first session to plan  (default: today − 24 days)
 *   --to   YYYY-MM-DD   last session to plan   (default: today + 21 days)
 *   --today YYYY-MM-DD  pretend it is another day (tests, rehearsals).
 *
 * Read from production on 2026-10-09: 3 of the club's 138 sessions had a plan,
 * and those were someone's test rows. Every other session opened onto an empty
 * Pla d'entrenament — the screen a coach would spend the most time on.
 *
 * Each plan is the shape `stdPlan()` (js/app.js) normalises, and the test runs
 * the REAL stdPlan over what this writes, so nothing it produces is dropped or
 * reshaped on the way to the screen:
 *
 *   warm-up 15′ → rondo 20′ → the session's FOCUS 25′ → a game 20′ → cool-down 10′
 *
 * plus bib teams drawn from the players CALLED to that session and fit on that
 * day (the app's own `playerIsCalled` rule and the club's injury list), the
 * colours they wear (`petos`), two players on material duty, a few items of
 * material, a planned RPE that follows the focus, and an `endTime` 90 minutes
 * after the start.
 *
 * Add-only, like the other top-ups: a session that already has a `plan` is
 * never touched, nor any field a session already has. Refuses any club not
 * stamped `demoSeed: true`, and any PROTECTED_CLUB. Dry run by default.
 *
 * ⚠ Exercises carry no `boardId`. A board must EXIST in the club's library or
 * the exercise draws a dead chip, and the demo library holds only test boards.
 */
"use strict";

const path = require("path");
const Shard = require(path.join(__dirname, "..", "js", "shard.js"));
const Season = require(path.join(__dirname, "topup-demo-season.js"));

const PROTECTED_CLUBS = Season.PROTECTED_CLUBS;

/* The bib palette the picker offers (js/app.js STP_PALETTE). */
const PALETTE = ["#ffffff", "#212529", "#e53935", "#1e88e5", "#43a047", "#f9a825", "#8e24aa"];

const WARMUP = [
  ["Escalfament amb pilota", "Mobilitat articular, conduccions i passades en parelles. Acabem amb tres acceleracions de 20 m."],
  ["Activació i coordinació", "Escala de coordinació, skipping i canvis de direcció. Després, rondo lliure de dos tocs."],
  ["Escalfament per parelles", "Passada i control orientat a 15 m, primer a peu fixe i després en moviment."],
];
const RONDO = [
  ["Rondo 5x2", "Dos tocs màxim. Qui perd la pilota entra al mig. Canvi de rol cada 90 segons."],
  ["Rondo 4x4 + 3 comodins", "Espai de 20x20. Els comodins juguen sempre amb qui té la pilota. Deu passades valen un punt."],
  ["Rondo de transició 6x3", "Quan els tres del mig recuperen, han de sortir conduint per una porteria petita."],
];
/** The main exercise, by the session's focus (the seeder's TRAINING_FOCUS). */
const MAIN = {
  "Rondos i pressió alta": ["Pressió després de pèrdua 6x6", "Sis segons per recuperar després de perdre-la. Si es recupera en camp contrari, el gol val doble.", 7],
  "Transicions defensa-atac": ["Transició 4x3 + 3", "En recuperar, atac ràpid sobre porteria en menys de vuit segons. L'equip que perd replega.", 7],
  "Finalització a l'àrea": ["Finalització després de combinació", "Paret amb el punta, centrada des de la línia de fons i remat al primer pal o al punt de penal.", 6],
  "Joc de posició": ["Joc de posició 7x7 + 3", "Tres carrils i tres alçades. Punt quan la pilota arriba al tercer home entre línies.", 6],
  "Accions a pilota aturada": ["Pilota aturada a favor — tres variants", "Córner al primer pal, córner curt i falta lateral. Cada variant cinc vegades, després amb oposició.", 5],
  "Sortida de pilota": ["Sortida de tres contra pressió de dos", "El porter inicia; els centrals obren i el pivot baixa a rebre. Superar la primera línia en quatre passades.", 6],
  "Duels 1x1 i 2x2": ["Duels 1x1 en carril", "Carril de 10 m. Atacant contra defensor fins a una porteria petita. Rotació cada repetició.", 8],
  "Circulació ràpida i amplitud": ["Circulació amb canvi d'orientació", "Quatre zones. Només es pot fer gol després d'un canvi d'orientació a l'altre costat.", 6],
  "Bascular en bloc mig": ["Basculació 8x6 en bloc mig", "Bloc de vuit contra sis atacants. Distàncies de 10 m entre línies i basculació conjunta cap a la pilota.", 6],
  "Contraatac i replegament": ["Contraatac 3x2 i replegament", "Tres atacants contra dos defensors; el que perd la pilota ha de replegar per sota de la línia de pilota.", 7],
  "Centrades i remat": ["Centrades des de banda i remat", "Extrem i lateral combinen per banda. Tres rematadors atacant primer pal, segon pal i punt de penal.", 6],
  "Força i prevenció": ["Circuit de força i prevenció", "Nòrdics, Copenhaguen, pont de glutis i equilibri monopodal. Tres rondes de 40 segons.", 5],
  "Partit condicionat": ["Partit a tres tocs", "Dos equips, camp de 60x40. Tres tocs màxim i gol només després de cinc passades.", 8],
  "Recuperació activa": ["Recuperació activa", "Carrera suau, mobilitat i rondo sense oposició. Sessió curta després del partit.", 3],
};
const MAIN_DEFAULT = MAIN["Joc de posició"];
const GAME = [
  ["Partit condicionat 8x8", "Gol val doble si ve d'una acció treballada a l'exercici principal."],
  ["Partit en camp reduït", "Porteries grans amb porter. Màxim tres tocs a camp propi, lliure a camp contrari."],
  ["Partit 9x9", "Dos equips del grup. El que perd recull el material."],
];
const COOLDOWN = [
  ["Tornada a la calma", "Carrera suau, estiraments i comentari de la sessió."],
  ["Estiraments i feedback", "Estiraments per parelles i dos minuts de conclusions."],
];

const parseDay = (s) => {
  const [y, m, d] = String(s).split("-").map(Number);
  return new Date(y, m - 1, d, 12);
};
const hhmmPlus = (hm, mins) => {
  const [h, m] = String(hm || "20:00").split(":").map(Number);
  const t = h * 60 + m + mins;
  return String(Math.floor(t / 60) % 24).padStart(2, "0") + ":" + String(t % 60).padStart(2, "0");
};

/**
 * One session's plan. `called` is the players called AND fit that day.
 * PURE given its RNG.
 */
function buildPlan(t, called, R) {
  const base = parseDay(t.date).getTime().toString(36);
  let n = 0;
  const id = (p) => `${p}_${base}_${(n++).toString(36)}${R.id36()}`;
  const recovery = t.focus === "Recuperació activa";
  const main = MAIN[t.focus] || MAIN_DEFAULT;

  // Bib teams: three when there are enough players for 8x8 plus a spare, else two.
  const nTeams = called.length >= 18 ? 3 : 2;
  const colours = R.shuffled(PALETTE).slice(0, nTeams);
  const shuffled = R.shuffled(called.map((p) => String(p.id || p.uid)));
  const groups = colours.map((c, i) => ({key: "g" + i, name: "Equip " + (i + 1), color: c,
    ids: shuffled.filter((_, k) => k % nTeams === i)}));
  const snapshot = () => groups.map((g) => Object.assign({}, g, {ids: g.ids.slice()}));

  const item = ([title, desc], tag, teams) => ({id: id("ex"), boardId: "", title, desc, tag,
    teams: teams ? snapshot() : null});
  const block = (mins, it) => ({id: id("blk"), mins, label: "", items: [it]});

  const blocks = recovery ? [
    block(15, item(R.pick(WARMUP), "Escalfament")),
    block(30, item(main, "Recuperació")),
    block(15, item(R.pick(COOLDOWN), "Tornada a la calma")),
  ] : [
    block(15, item(R.pick(WARMUP), "Escalfament")),
    block(20, item(R.pick(RONDO), "Rondo", true)),
    block(25, item(main, t.focus || "Tàctica")),
    block(20, item(R.pick(GAME), "Partit", true)),
    block(10, item(R.pick(COOLDOWN), "Tornada a la calma")),
  ];
  const mins = blocks.reduce((s, b) => s + b.mins, 0);
  const extra = [
    {id: id("mx"), label: "Pilotes", qty: R.rint(10, 16)},
    {id: id("mx"), label: "Cons", qty: R.rint(12, 24)},
  ];
  if (!recovery) extra.push({id: id("mx"), label: "Porteries F7", qty: 2});
  const duty = R.shuffled(shuffled).slice(0, Math.min(2, shuffled.length));
  return {
    plan: {
      blocks, extra,
      duty: {n: duty.length, ids: duty},
      petos: recovery ? null : colours.slice(),
      teams: recovery ? null : {n: nTeams, groups: groups.map((g) => Object.assign({}, g, {color: "", ids: g.ids.slice()}))},
    },
    plannedRpe: recovery ? main[2] : Math.max(3, Math.min(10, main[2] + R.rint(-1, 1))),
    endTime: hhmmPlus(t.time, mins),
  };
}

/**
 * (uid, date) → out that day? Unlike the season script's injuredOn, this one
 * looks FORWARD: plans are written for sessions next week, and an open case
 * keeps a player out until its expected return — or indefinitely, if that
 * date has already passed and nobody has closed the case.
 */
function outOnFn(injuries, today) {
  const byUid = new Map();
  injuries.forEach((i) => {
    if (!i || !i.playerId || !i.startDate) return;
    const k = String(i.playerId);
    if (!byUid.has(k)) byUid.set(k, []);
    byUid.get(k).push(i);
  });
  return (uid, d) => (byUid.get(String(uid)) || []).some((i) => {
    if (d < i.startDate) return false;
    if (i.status === "resolved") return d <= (i.endDate || i.expectedReturn || i.startDate);
    const back = i.expectedReturn;
    return d <= today || !back || back <= today || d < back;
  });
}

/**
 * PURE. `state`: {club, shards: Map docId → parsed blob}.
 * Returns {shards: [{id, cat, value}], report, summary}.
 */
function plan(state, opts) {
  const today = opts.today;
  const from = opts.from || Season.addDays(today, -24);
  const to = opts.to || Season.addDays(today, 21);
  const start = Season.seasonStart((state.club || {}).seasonBoundary, today);
  const cats = [...new Set([...state.shards.keys()].map((id) => id.split(Shard.SEP)[1])
      .filter((c) => c && c !== "none"))].sort();
  const out = {shards: [], report: [], summary: {planned: 0, skippedHasPlan: 0}, from, to};

  for (const cat of cats) {
    const R = Season.makeRand((opts.seed == null ? 20261009 : opts.seed) + cat.length * 31);
    const get = (k) => {
      const v = state.shards.get(k + Shard.SEP + cat);
      return v == null ? null : JSON.parse(JSON.stringify(v));
    };
    const trainings = get("fa_training");
    if (!Array.isArray(trainings) || !trainings.length) continue;
    const players = (get("fa_users") || []).filter((u) => Array.isArray(u.roles) && u.roles.includes("player"));
    const injuredOn = outOnFn(get("fa_injuries") || [], today);
    let n = 0;
    trainings.slice().sort((a, b) => String(a.date).localeCompare(String(b.date))).forEach((t) => {
      if (!t || !t.date || t.date < from || t.date > to || t.date < start) return;
      if (t.kind === "activity") return;
      if (t.plan) { out.summary.skippedHasPlan++; return; }
      const called = players.filter((p) => Season.isCalledTo(t, p) &&
        !injuredOn(String(p.id || p.uid), t.date));
      const b = buildPlan(t, called, R);
      t.plan = b.plan;
      if (t.plannedRpe == null) t.plannedRpe = b.plannedRpe;
      if (!t.endTime) t.endTime = b.endTime;
      n++;
    });
    if (n) {
      out.shards.push({id: "fa_training" + Shard.SEP + cat, cat, value: trainings});
      out.summary.planned += n;
      out.report.push(`${cat}: ${n} sessions planned`);
    }
  }
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
  const opts = {today: val("--today", new Date().toISOString().slice(0, 10)),
    from: val("--from", null), to: val("--to", null)};
  if (!CLUB) die("--club <id> is required.");
  if (PROTECTED_CLUBS.has(CLUB)) die(`${CLUB} is a PROTECTED club. This script will not touch it.`);

  const admin = require("firebase-admin");
  admin.initializeApp({projectId: "esquerrapp"});
  const db = admin.firestore();
  const club = (await db.collection("clubs").doc(CLUB).get()).data();
  if (!club) die(`clubs/${CLUB} does not exist.`);
  if (club.demoSeed !== true) die(`clubs/${CLUB} is not stamped demoSeed:true.`);
  const dataCol = db.collection("teams").doc(CLUB).collection("data");
  const shards = new Map();
  (await dataCol.get()).docs.forEach((d) => {
    const data = d.data() || {};
    if (typeof data.v !== "string") return;
    try { shards.set(d.id, JSON.parse(data.v)); } catch (e) { die(`${d.id} holds unparseable JSON.`); }
  });
  const out = plan({club, shards}, opts);
  log(`club   : ${club.name}\nwindow : ${out.from} → ${out.to}\nmode   : ${APPLY ? "APPLY" : "DRY RUN"}`);
  out.report.forEach((r) => log("  " + r));
  log(`  sessions planned: ${out.summary.planned}   already had a plan: ${out.summary.skippedHasPlan}`);
  if (!APPLY) { log("\nDRY RUN — nothing was written. Re-run with --apply to commit."); return; }
  for (const w of out.shards) {
    await dataCol.doc(w.id).set({v: JSON.stringify(w.value), category: w.cat}, {merge: true});
  }
  log(`  ${out.shards.length} shard documents written\nDone.`);
}

if (require.main === module) {
  main().catch((e) => { console.error("\nERROR: " + e.message + "\n"); process.exit(1); });
}

module.exports = {plan, buildPlan, outOnFn, MAIN};
