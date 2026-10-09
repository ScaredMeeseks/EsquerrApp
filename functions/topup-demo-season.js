#!/usr/bin/env node
/**
 * topup-demo-season.js — fill the gaps in an ALREADY SEEDED demo club.
 *
 *   node functions/topup-demo-season.js --club <id>            # DRY RUN
 *   node functions/topup-demo-season.js --club <id> --apply    # write
 *
 *   --repair-cross-squad   rebuild played fixtures whose call-up holds NOT ONE
 *                          player of the fixture's own squad. See below.
 *   --today YYYY-MM-DD     pretend it is another day (tests, rehearsals).
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
 *   - it only ever ADDS. No user account is touched, no Auth account is
 *     created or reset, the `categories` map is not written. The two
 *     deliberate exceptions are named: stale SEEDED injuries are closed (see
 *     "Injuries"), and --repair-cross-squad replaces what an earlier run of
 *     this very script got wrong;
 *   - every shard write is a READ-MERGE-WRITE keyed by row id, never a set();
 *   - every per-record write is create-only: an existing answer is left alone,
 *     because a real answer from a demo login is more valuable than a
 *     fabricated one;
 *   - it refuses any club that is not stamped `demoSeed: true`, and any club
 *     in PROTECTED_CLUBS — the same two gates purge() uses.
 *
 * All decisions are made by `plan()`, which is PURE: it takes what was read
 * and returns what would be written. main() only reads, prints and writes.
 * That is what test/topup-demo.test.js runs.
 *
 * ─── What it fills ──────────────────────────────────────────────────────
 *
 * 1. Injuries (before anything else — every later step asks "was he out?").
 *    a. SEEDED cases still open long after their expected return are closed.
 *       Read from production on 2026-10-09: eight "live" injuries expected
 *       back in mid-August were still open, so eight players had answered
 *       `injured` to every session since July and reported no RPE at all.
 *       Only cases that are plainly the seeder's — no coach note, created by a
 *       `dm_` account, expected return more than a week gone — and each is
 *       closed INSIDE the gap being filled, never before it, so the `injured`
 *       answers already on record stay true.
 *    b. A squad with no case opened in the last three weeks gets fresh ones:
 *       two resolved, one recovering, two active — each with the coach's note.
 *    c. `fa_injury_notes`, `fa_injury_zone` and the roster's
 *       `fitnessStatus`/`injuryNote` are brought into line, using the app's
 *       own strings so the next coach to open the roster does not rewrite them.
 *
 * 2. Matches whose date has passed but which still say `status: "upcoming"`,
 *    and every played fixture with no call-up: match availability, an 18-man
 *    call-up from the FIXTURE'S OWN SQUAD, a 4-3-3 by position, goals with
 *    assists, cards both ways, an occasional red, three substitutions, the
 *    score (DERIVED from the events — js/app.js calcMatchScore recomputes it,
 *    so a stored score that disagrees is a demo that contradicts itself) and
 *    match RPE with the minutes the events imply. The model is the seeder's
 *    (seed-demo-club.js, "Matches: call-ups, events, scores").
 *
 *    ⚠ Until 2026-10-09 this step built every call-up from
 *    `players.slice(0, 18)` of the CATEGORY shard. `fa_users__amateur` holds
 *    both squads and lists B first, so the Amateur A fixtures of 09-05 and
 *    09-12 were "played" by eighteen B players — goals, cards and match RPE
 *    included. --repair-cross-squad rebuilds exactly that shape: a played
 *    fixture whose call-up contains no player of its own squad. It replaces
 *    the call-up and events, deletes only the match RPE this script wrote
 *    (`source: "topup"`), and writes the new squad's.
 *
 * 3. Training availability for past sessions, then RPE for the players who
 *    answered yes/late. Readiness needs the WHOLE chain — session →
 *    availability → rpe — or the session is silently skipped, not shown as a
 *    gap. The squad is the app's own (`playerIsCalled`): category, team
 *    letters, guests and exclusions.
 *
 * 4. The FORWARD training calendar, up to the last fixture. Read from
 *    production on 2026-08-20 there was a next match and no next session,
 *    ever — and every step above writes into the PAST by construction, so no
 *    number of re-runs could have fixed it.
 *
 * Nothing is written dated before the club's `seasonBoundary`: six read-time
 * filters in app.js slice on it, so earlier rows are invisible anyway.
 *
 * Finally it recomputes `teams/{id}.trainingDates` / `.matchDates`, because
 * every push reminder queries those arrays.
 */
"use strict";

const path = require("path");
const Shard = require(path.join(__dirname, "..", "js", "shard.js"));
const U = require(path.join(__dirname, "..", "js", "utils.js"));

// Same list seed-demo-club.js protects. Kept in sync by hand, deliberately:
// a shared module would let one edit widen the blast radius of both scripts.
const PROTECTED_CLUBS = new Set([
  "nDLJCpJfDvFHs8MnwtzW", // Esquerra de l'Eixample F.C.
  "lly4GkUxIpBkSgZvzldT", // F.C.Barcelona test club
  "default",
]);

/* Placeholders main() swaps for the real FieldValue sentinels. plan() stays
   free of firebase-admin so the tests can require this file. */
const DELETE = {__op: "delete"};
const SERVER_TS = {__op: "serverTimestamp"};

// ── Deterministic RNG, so a dry run and the apply that follows agree ──
function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function makeRand(seed) {
  const rnd = mulberry32(seed);
  const R = {rnd};
  R.rint = (lo, hi) => lo + Math.floor(rnd() * (hi - lo + 1));
  R.pick = (a) => a[Math.floor(rnd() * a.length)];
  R.chance = (p) => rnd() < p;
  R.weighted = (pairs) => {
    const total = pairs.reduce((s, [, w]) => s + w, 0);
    let r = rnd() * total;
    for (const [v, w] of pairs) { r -= w; if (r <= 0) return v; }
    return pairs[pairs.length - 1][0];
  };
  R.shuffled = (arr) => {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(rnd() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  };
  R.id36 = () => Math.floor(rnd() * 1e6).toString(36);
  return R;
}

/* Calendar arithmetic, NOT milliseconds: Spain has a 25-hour day at the
   autumn transition, so `new Date(t + 86400000)` can land back on the same
   date and a `d <= end` loop spins for ever. setDate() counts days. */
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
const daysBetween = (a, b) => Math.round((parseDay(b) - parseDay(a)) / 86400000);
/** 1 = Monday … 7 = Sunday. */
const dow = (s) => (parseDay(s).getDay() + 6) % 7 + 1;
const CATALAN_DAYS = ["Dilluns", "Dimarts", "Dimecres", "Dijous",
  "Divendres", "Dissabte", "Diumenge"];
const maxStr = (a, b) => (a > b ? a : b);
const minStr = (a, b) => (a < b ? a : b);

/** Season start for a boundary like "03-01", mirroring utils.js seasonStartStr. */
function seasonStart(boundary, today) {
  const b = /^\d{2}-\d{2}$/.test(boundary || "") ? boundary : "08-15";
  const y = Number(today.slice(0, 4));
  return today >= y + "-" + b ? y + "-" + b : (y - 1) + "-" + b;
}

// ── Players ──────────────────────────────────────────────────

/* The seeder gives each player a reliability, a fitness baseline and an
   importance, but keeps them in memory: none of the three is on the roster.
   A stable hash of the uid stands in, so the same player is the same kind of
   player on every run without anything new being stored on him. */
function hash01(s, salt) {
  let h = 0x811c9dc5;
  const str = salt + ":" + s;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0) / 4294967296;
}
function traitsOf(uid) {
  return {
    reliability: 0.80 + 0.15 * hash01(uid, "rel"),
    fitnessBase: 5 + Math.round(2 * hash01(uid, "fit")),
    importance: hash01(uid, "imp"),
  };
}

/** A roster's `position` is "CB" or "CB,LB": the first is the main one. */
const posOf = (p) => String((p && p.position) || "").split(",")[0].trim().toUpperCase();
const LINE = {GK: "gk", CB: "def", LB: "def", RB: "def",
  DM: "mid", OM: "mid", LW: "att", RW: "att", ST: "att"};
const lineOf = (p) => LINE[posOf(p)] || "mid";
/** How likely a position is to score / assist — the seeder's tables. */
const GOAL_WEIGHT = {GK: 0, CB: 0.6, LB: 0.4, RB: 0.4, DM: 1, OM: 2.5, LW: 3, RW: 3, ST: 5};
const ASSIST_WEIGHT = {GK: 0, CB: 0.3, LB: 1, RB: 1, DM: 1.5, OM: 3, LW: 2.5, RW: 2.5, ST: 1.5};

const uidOf = (p) => String(p.id || p.uid);
const isPlayer = (u) => !!u && (Array.isArray(u.roles) ? u.roles.includes("player") : true);

/** js/app.js playerIsCalled(), for one category's roster. */
function isCalledTo(t, u) {
  const id = uidOf(u);
  if (Array.isArray(t.excluded) && t.excluded.map(String).includes(id)) return false;
  if (Array.isArray(t.guests) && t.guests.map(String).includes(id)) return true;
  if (!t.category) return true;
  if ((u.category || "") !== t.category) return false;
  const letters = Array.isArray(t.teams) ? t.teams.filter(Boolean) : [];
  return !letters.length || letters.includes(u.team || "");
}

/** Verbatim copy of calcMatchScore() in js/app.js — own goals count for
 *  the OTHER side, and that asymmetry is the whole reason to copy rather
 *  than re-derive. The test compares the two. */
function calcMatchScore(events) {
  let home = 0; let away = 0;
  events.forEach((e) => {
    if (e.type === "goal") { if (e.side === "home") home++; else away++; }
    if (e.type === "own_goal") { if (e.side === "home") away++; else home++; }
  });
  return {home, away};
}

/** Minutes a player was on the pitch, from the events alone. */
function minutesFromEvents(uid, startingXI, events) {
  const red = events.find((e) => e.type === "red" && e.playerId === uid);
  const end = red ? Number(red.minute) : 90;
  const out = events.find((e) => e.type === "change" && e.playerOutId === uid);
  const inn = events.find((e) => e.type === "change" && e.playerInId === uid);
  if (startingXI.includes(uid)) return Math.max(0, out ? Math.min(Number(out.minute), end) : end);
  if (inn) return Math.max(0, end - Number(inn.minute));
  return 0;
}

// ── Injuries ─────────────────────────────────────────────────

/* (zone label, description, days out). The muscle group and sub come from
   the zone's own `groups` and GROUP_SUBS, so they always agree with what the
   medical page can display. The seeder's table. */
const INJURY_TEMPLATES = [
  {zone: "Hamstring", desc: "sobrecàrrega en sprint", days: [12, 30]},
  {zone: "Ankle", desc: "esquinç lateral", days: [10, 35]},
  {zone: "Quad", desc: "elongació", days: [7, 18]},
  {zone: "Knee", desc: "molèsties al tendó rotular", days: [14, 45]},
  {zone: "Calf", desc: "contractura", days: [5, 14]},
  {zone: "Hip / Groin", desc: "pubàlgia", days: [20, 50]},
  {zone: "Shoulder", desc: "luxació en caiguda", days: [21, 40]},
  {zone: "Lower Back", desc: "lumbàlgia", days: [6, 16]},
  {zone: "Shin / Calf", desc: "periostitis", days: [10, 24]},
];

/** What a coach writes on the injury record (`notes`), by state. */
const INJURY_COMMENTS = {
  active: [
    "Molèsties des del partit de dissabte. Repòs, gel i reavaluar amb el fisio dilluns.",
    "Pendent de ressonància. Gimnàs i piscina fins que tinguem el resultat.",
    "Sense càrrega a la cama fins a nou avís. Feina de tronc i tren superior.",
    "Ha notat la punxada en un canvi de ritme. Prova d'imatge dijous.",
  ],
  recovering: [
    "Ja fa carrera contínua sense dolor. Incorporació progressiva: rondos primer, partit condicionat després.",
    "Readaptació a camp amb el preparador. Si respon bé aquesta setmana, torna a la convocatòria.",
    "Ha completat el treball de força. Falta tolerància a sprint abans de l'alta.",
  ],
  resolved: [
    "Alta mèdica. Ha completat la readaptació sense molèsties.",
    "Recuperat. Mantenir els exercicis preventius dos dies per setmana.",
    "Alta. Controlar minuts les dues primeres setmanes.",
  ],
  // A seeded case closed by this script, months after it started.
  closed: [
    "Alta mèdica després d'una readaptació llarga. Seguiment preventiu amb el fisio.",
    "Alta. Ha tornat a entrenar amb el grup sense limitacions.",
  ],
};

/** The last day an injury kept the player out. Open → today. */
function outUntil(inj, today) {
  if (inj.status === "resolved") return inj.endDate || inj.expectedReturn || inj.startDate;
  return today;
}

/** (uid, date) → was he injured that day? From the FINAL injury list. */
function injuredOnFn(injuries, today) {
  const byUid = new Map();
  injuries.forEach((i) => {
    if (!i || !i.playerId || !i.startDate) return;
    const k = String(i.playerId);
    if (!byUid.has(k)) byUid.set(k, []);
    byUid.get(k).push([i.startDate, outUntil(i, today)]);
  });
  return (uid, d) => (byUid.get(String(uid)) || []).some(([a, b]) => a <= d && d <= b);
}

/**
 * Close the stale seeded cases and, if the squad has none recent, open new
 * ones. Returns the new list plus what changed, for the report.
 */
function planInjuries({injuries, players, today, gapStart, seasonFrom, leadUid, R, lastInjured}) {
  const out = injuries.map((i) => Object.assign({}, i));
  const closed = [];
  const created = [];
  const staleBefore = addDays(today, -7);

  out.forEach((i) => {
    const open = i.status === "active" || i.status === "recovering";
    const seeded = !i.notes && String(i.createdBy || "").startsWith("dm_");
    if (!open || !seeded || !i.expectedReturn || i.expectedReturn >= staleBefore) return;
    /* INSIDE the gap, never before it — and never before the player's own
       last `injured` answer, wherever that is. Those answers are on record,
       and an injury that ended earlier would make every one of them a lie. */
    const last = lastInjured && lastInjured.get(String(i.playerId));
    const lo = [i.expectedReturn, gapStart, last ? addDays(last, 1) : ""].reduce(maxStr);
    const hi = maxStr(lo, addDays(today, -3));
    const end = minStr(addDays(lo, R.rint(0, Math.max(0, daysBetween(lo, hi)))), hi);
    i.status = "resolved";
    i.endDate = end;
    i.notes = R.pick(INJURY_COMMENTS.closed);
    closed.push(i.id);
  });

  const recentFrom = addDays(today, -21);
  const zoneIndexByLabel = (label) => U.BODY_ZONES.findIndex((z) => z.label === label);
  const make = (p, start, status) => {
    const tpl = R.pick(INJURY_TEMPLATES);
    const zi = zoneIndexByLabel(tpl.zone);
    const zone = U.BODY_ZONES[zi] || {label: tpl.zone, groups: []};
    const group = zone.groups && zone.groups.length ? R.pick(zone.groups) : "Hamstrings";
    const subs = U.GROUP_SUBS[group] || [];
    let expected = addDays(start, R.rint(tpl.days[0], tpl.days[1]));
    let end = null;
    if (status === "resolved") {
      // Finished, and at least two days ago.
      if (expected > addDays(today, -2)) expected = addDays(today, -2);
      end = expected;
    } else if (expected <= today) {
      expected = addDays(today, R.rint(3, 14));
    }
    const days = daysBetween(start, expected);
    return {
      id: `${parseDay(start).getTime()}_${R.id36()}`,
      playerId: uidOf(p),
      bodyZone: zi === -1 ? null : zi,
      bodyZoneLabel: zone.label,
      muscleGroup: group,
      muscleSub: subs.length ? R.pick(subs) : "",
      description: tpl.desc,
      severity: days > 28 ? "severe" : (days > 7 ? "moderate" : "minor"),
      status,
      startDate: start,
      expectedReturn: expected,
      endDate: end,
      createdBy: leadUid,
      notes: R.pick(INJURY_COMMENTS[status]),
    };
  };

  const letters = [...new Set(players.map((p) => p.team || ""))].sort();
  for (const letter of letters) {
    const squad = players.filter((p) => (p.team || "") === letter);
    const ids = new Set(squad.map(uidOf));
    const recent = out.some((i) => ids.has(String(i.playerId)) && i.startDate >= recentFrom);
    if (recent || squad.length < 8) continue;
    const stillOut = new Set(out.filter((i) => i.status !== "resolved").map((i) => String(i.playerId)));
    // Keepers are left out: a squad with its only fit keeper injured cannot
    // field a team, and that is a seeding problem, not a story.
    const pool = R.shuffled(squad.filter((p) => !stillOut.has(uidOf(p)) && lineOf(p) !== "gk"));
    const lo = maxStr(seasonFrom, minStr(gapStart, addDays(today, -16)));
    const span = Math.max(0, daysBetween(lo, addDays(today, -12)));
    const plan = ["resolved", "resolved", "recovering", "active", "active"];
    plan.forEach((status, k) => {
      const p = pool[k];
      if (!p) return;
      const start = status === "active" ?
        addDays(today, -R.rint(2, 9)) :
        addDays(lo, R.rint(0, span));
      const inj = make(p, start, status);
      out.push(inj);
      created.push(inj.id);
    });
  }
  return {injuries: out, closed, created};
}

/** The roster's fitness, the way js/app.js deriveFitness words it. */
function fitnessFrom(injuries, uid) {
  const mine = injuries.filter((i) => String(i.playerId) === String(uid));
  const active = mine.find((i) => i.status === "active");
  const recovering = mine.find((i) => i.status === "recovering");
  if (active) {
    return {status: "injured", note: active.muscleGroup +
      (active.muscleSub ? " (" + active.muscleSub + ")" : "") +
      (active.description ? " – " + active.description : ""), inj: active};
  }
  if (recovering) {
    return {status: "doubt", note: "Recovering from " + (recovering.muscleGroup || "injury"),
      inj: recovering};
  }
  return {status: "fit", note: "", inj: null};
}

// ── One fixture ──────────────────────────────────────────────

/**
 * Availability, call-up, line-up, events and match RPE for one played
 * fixture, from the fixture's OWN squad. The seeder's model.
 *
 * `answered` holds availability already on record (uid → value): a real
 * answer is never overwritten and is honoured when picking the squad.
 */
function buildMatch(m, squadPlayers, {R, injuredOn, clubName, answered}) {
  const avail = new Map();
  squadPlayers.forEach((p) => {
    const uid = uidOf(p);
    if (answered.has(uid)) { avail.set(uid, {value: answered.get(uid), fresh: false}); return; }
    const value = injuredOn(uid, m.date) ? "no_disponible" :
      (R.chance(traitsOf(uid).reliability * 0.95) ? "disponible" : "no_disponible");
    avail.set(uid, {value, fresh: true});
  });
  const fit = squadPlayers.filter((p) => !injuredOn(uidOf(p), m.date));
  const isAvail = (p) => avail.get(uidOf(p)).value === "disponible";

  /* Top up a thin week rather than fielding nine men — only with players who
     had not answered, so no real "no" is turned into a yes. A keeper first:
     with none available there is no match to show. */
  const flip = (p) => { avail.get(uidOf(p)).value = "disponible"; };
  const flippable = (p) => !isAvail(p) && avail.get(uidOf(p)).fresh;
  if (!fit.some((p) => lineOf(p) === "gk" && isAvail(p))) {
    const k = fit.filter((p) => lineOf(p) === "gk" && flippable(p))[0];
    if (k) flip(k);
  }
  const MIN_AVAILABLE = 16;
  const short = MIN_AVAILABLE - fit.filter(isAvail).length;
  if (short > 0) {
    fit.filter(flippable)
        .sort((a, b) => traitsOf(uidOf(b)).importance - traitsOf(uidOf(a)).importance)
        .slice(0, short).forEach(flip);
  }

  const pool = fit.filter(isAvail);
  const form = new Map(pool.map((p) => [p, traitsOf(uidOf(p)).importance + R.rnd() * 0.5]));
  const byForm = (a, b) => form.get(b) - form.get(a);
  const of = (l) => pool.filter((p) => lineOf(p) === l).sort(byForm);

  let keepers = of("gk");
  const outfieldPool = pool.filter((p) => lineOf(p) !== "gk").sort(byForm);
  // No keeper at all in the squad: the least important outfielder goes in goal.
  if (!keepers.length && outfieldPool.length) keepers = [outfieldPool.pop()];
  const squad = keepers.slice(0, 2).concat(outfieldPool.slice(0, 16));
  if (squad.length < 11) return null;

  const inSquad = new Set(squad);
  const xi = [keepers[0]];
  const want = {def: 4, mid: 3, att: 3};
  ["def", "mid", "att"].forEach((l) => {
    of(l).filter((p) => inSquad.has(p) && !xi.includes(p))
        .slice(0, want[l]).forEach((p) => xi.push(p));
  });
  outfieldPool.filter((p) => inSquad.has(p) && !xi.includes(p))
      .slice(0, 11 - xi.length).forEach((p) => xi.push(p));
  // Only outfielders come off the bench.
  const bench = squad.filter((p) => !xi.includes(p) && p !== keepers[0] && p !== keepers[1]);

  const ourSide = U.ourSideOf(m, clubName);
  const oppSide = ourSide === "home" ? "away" : "home";
  const events = [];
  const add = (e) => events.push(Object.assign({
    id: `${parseDay(m.date).getTime()}_${R.id36()}`,
  }, e));

  // ~2.1 scored, ~1.3 conceded: the demo club finishes in the top third.
  const ourGoals = R.weighted([[0, 10], [1, 26], [2, 30], [3, 20], [4, 10], [5, 4]]);
  const theirGoals = R.weighted([[0, 28], [1, 36], [2, 22], [3, 10], [4, 3], [5, 1]]);
  const scorerPool = xi.concat(bench.slice(0, 3));
  const scorerW = scorerPool.map((p) => [p, GOAL_WEIGHT[posOf(p)] == null ? 1 : GOAL_WEIGHT[posOf(p)]])
      .filter(([, w]) => w > 0);
  const assistW = scorerPool.map((p) => [p, ASSIST_WEIGHT[posOf(p)] == null ? 1 : ASSIST_WEIGHT[posOf(p)]])
      .filter(([, w]) => w > 0);
  for (let g = 0; g < ourGoals; g++) {
    const scorer = R.weighted(scorerW);
    const goalType = R.weighted([["jugada_oberta", 72], ["penal", 14], ["falta_directa", 14]]);
    const ev = {side: ourSide, type: "goal", minute: String(R.rint(2, 90)),
      playerId: uidOf(scorer), goalType};
    if (goalType === "jugada_oberta") {
      const withAssist = R.chance(0.62);
      ev.goalDetail = withAssist ? "assistencia" : "individual";
      if (withAssist) {
        const others = assistW.filter(([p]) => p !== scorer);
        if (others.length) ev.assistPlayerId = uidOf(R.weighted(others));
        else ev.goalDetail = "individual";
      }
    }
    add(ev);
  }
  for (let g = 0; g < theirGoals; g++) {
    add({side: oppSide, type: "goal", minute: String(R.rint(2, 90)),
      playerNumber: String(R.rint(2, 23)),
      goalType: R.weighted([["jugada_oberta", 78], ["penal", 12], ["falta_directa", 10]])});
  }
  for (let c = 0, n = R.weighted([[0, 18], [1, 34], [2, 30], [3, 14], [4, 4]]); c < n; c++) {
    add({side: ourSide, type: "yellow", minute: String(R.rint(10, 90)), playerId: uidOf(R.pick(xi))});
  }
  for (let c = 0, n = R.weighted([[0, 22], [1, 36], [2, 28], [3, 14]]); c < n; c++) {
    add({side: oppSide, type: "yellow", minute: String(R.rint(10, 90)),
      playerNumber: String(R.rint(2, 23))});
  }
  const redPlayer = R.chance(0.07) ? R.pick(xi.slice(1)) : null;
  if (redPlayer) {
    add({side: ourSide, type: "red", minute: String(R.rint(35, 88)), playerId: uidOf(redPlayer)});
  }
  // Out of the XI, in from the bench, never both ways; never the keeper,
  // never the man already sent off.
  const subCount = Math.min(3, bench.length);
  const subMinutes = [];
  for (let s = 0; s < subCount; s++) subMinutes.push(R.rint(55, 88));
  subMinutes.sort((a, b) => a - b);
  const outs = R.shuffled(xi.filter((p) => p !== redPlayer && p !== keepers[0]));
  for (let s = 0; s < subCount && s < outs.length; s++) {
    add({side: ourSide, type: "change", minute: String(subMinutes[s]),
      playerOutId: uidOf(outs[s]), playerInId: uidOf(bench[s])});
  }
  events.sort((a, b) => Number(a.minute) - Number(b.minute));

  const startingXI = xi.map(uidOf);
  const sc = calcMatchScore(events);
  const rpe = [];
  squad.forEach((p) => {
    const uid = uidOf(p);
    const minutes = minutesFromEvents(uid, startingXI, events);
    if (minutes <= 0) return;
    const r = Math.max(4, Math.min(10, traitsOf(uid).fitnessBase + R.rint(-1, 3)));
    rpe.push({uid, rpe: r, minutes});
  });

  return {
    avail: [...avail.entries()].filter(([, a]) => a.fresh).map(([uid, a]) => ({uid, value: a.value})),
    convo: {players: squad.map(uidOf), jersey: "white", socks: "striped",
      videos: [], startingXI},
    events,
    score: `${sc.home}-${sc.away}`,
    rpe,
  };
}

// ── The whole run ────────────────────────────────────────────

/**
 * PURE. `state` is what main() read:
 *   club      clubs/{id} data
 *   shards    Map docId → parsed blob ({v} docs) — e.g. "fa_matches__amateur"
 *   fields    Map docId → raw data, for the per-field merge keys
 *   avail     Map trainingAvail docId → data
 *   matchAvail Map matchAvail docId → data
 *   rpe       Map rpe docId → data
 * Returns the writes; nothing is touched here.
 */
function plan(state, opts) {
  const today = opts.today;
  const club = state.club || {};
  const clubName = club.name || "";
  const start = seasonStart(club.seasonBoundary, today);
  const seed = opts.seed == null ? 20260819 : opts.seed;

  const out = {
    shards: [],     // {id, cat, value} → {v: JSON, category}
    fields: [],     // {id, cat, data}  → per-field merge (DELETE allowed)
    records: [],    // {coll, id, data}
    deletes: [],    // {coll, id}
    teamPatch: null,
    report: [],
    summary: {sessions: 0, matchesPlayed: 0, matchesBuilt: 0, repaired: 0,
      crossSquadSkipped: 0, events: 0, convocatories: 0, matchAvail: 0,
      avail: 0, rpe: 0, matchRpe: 0, matchRpeReplaced: 0,
      injuriesClosed: 0, injuriesCreated: 0, rosterFitness: 0},
  };
  const S = out.summary;

  /* Where the gap starts: the day after the newest availability a SCRIPT
     wrote (`source` seed/topup). Not the newest of all — one answer a demo
     login gave next Tuesday would otherwise move the whole gap past every
     session still empty before it. Stale injuries are closed inside the gap
     and the new ones opened in it. */
  let lastScripted = ""; let lastAny = "";
  const lastInjured = new Map();
  state.avail.forEach((a) => {
    if (!a || !a.date || a.date >= today) return;
    if (a.date > lastAny) lastAny = a.date;
    if ((a.source === "seed" || a.source === "topup") && a.date > lastScripted) lastScripted = a.date;
    if (a.value === "injured" && a.uid && a.date > (lastInjured.get(String(a.uid)) || "")) {
      lastInjured.set(String(a.uid), a.date);
    }
  });
  const lastAvail = lastScripted || lastAny;
  const gapStart = lastAvail ? addDays(lastAvail, 1) : addDays(today, -21);

  const cats = [...new Set([...state.shards.keys(), ...state.fields.keys()]
      .map((id) => id.split(Shard.SEP)[1])
      .filter((c) => c && c !== "none"))].sort();
  const blob = (k, cat, dflt) => {
    const v = state.shards.get(k + Shard.SEP + cat);
    return v == null ? dflt : JSON.parse(JSON.stringify(v));
  };

  const haveRpe = new Set(state.rpe.keys());
  const haveMatchAvail = new Set(state.matchAvail.keys());
  // A copy: plan() must not write into what it was given.
  const availNow = new Map(state.avail);

  for (const cat of cats) {
    const R = makeRand(seed + cat.length * 7919 + cat.charCodeAt(0));
    const key = (k) => k + Shard.SEP + cat;
    const users = blob("fa_users", cat, []);
    const players = users.filter(isPlayer);
    if (!players.length) { out.report.push(`${cat}: no players — skipped`); continue; }
    const staff = users.filter((u) => Array.isArray(u.roles) && u.roles.includes("staff"));
    const lead = staff.filter((u) => u.isTeamLead)[0] || staff[0];
    const leadUid = lead ? uidOf(lead) : "";

    // ── 1. Injuries ──
    const injBefore = blob("fa_injuries", cat, []);
    const inj = planInjuries({injuries: injBefore, players, today, gapStart,
      seasonFrom: start, leadUid, R, lastInjured});
    if (inj.closed.length || inj.created.length) {
      out.shards.push({id: key("fa_injuries"), cat, value: inj.injuries});
      S.injuriesClosed += inj.closed.length;
      S.injuriesCreated += inj.created.length;
      out.report.push(`${cat}: injuries closed ${inj.closed.length}, opened ${inj.created.length}`);
    }
    const injuredOn = injuredOnFn(inj.injuries, today);

    // Roster fitness + the two per-field keys, from the final list.
    const notesNow = state.fields.get(key("fa_injury_notes")) || {};
    const zoneNow = state.fields.get(key("fa_injury_zone")) || {};
    const notesPatch = {}; const zonePatch = {};
    let usersChanged = false;
    users.forEach((u) => {
      if (!isPlayer(u)) return;
      const uid = uidOf(u);
      const f = fitnessFrom(inj.injuries, uid);
      if (u.fitnessStatus !== f.status || (u.injuryNote || "") !== f.note) {
        u.fitnessStatus = f.status; u.injuryNote = f.note;
        usersChanged = true; S.rosterFitness++;
      }
      /* The seeder's wording for this key (seed-demo-club.js), minus its
         "Ankle () – …" when a case has no sub-muscle. */
      const note = !f.inj ? null : (f.status === "injured" ? f.note :
        `Recuperant-se de ${f.inj.muscleGroup}`);
      if (note == null) { if (uid in notesNow) notesPatch[uid] = DELETE; } else if (notesNow[uid] !== note) notesPatch[uid] = note;
      const zone = f.inj && f.inj.bodyZone != null ? f.inj.bodyZone : null;
      if (zone == null) { if (uid in zoneNow) zonePatch[uid] = DELETE; } else if (zoneNow[uid] !== zone) zonePatch[uid] = zone;
    });
    if (Object.keys(notesPatch).length) out.fields.push({id: key("fa_injury_notes"), cat, data: notesPatch});
    if (Object.keys(zonePatch).length) out.fields.push({id: key("fa_injury_zone"), cat, data: zonePatch});

    // ── 2. Matches ──
    const matches = blob("fa_matches", cat, []);
    const events = blob("fa_match_events", cat, {});
    const convo = blob("fa_convocatoria_sent", cat, {});
    const callup = blob("fa_convocatoria_callup", cat, {});
    let mChanged = false; let eChanged = false; let cChanged = false; let kChanged = false;

    const played = matches.filter((m) => m && m.date && m.date < today && m.date >= start)
        .sort((a, b) => a.date.localeCompare(b.date));
    for (const m of played) {
      const id = String(m.id);
      if (m.status !== "played") { m.status = "played"; mChanged = true; S.matchesPlayed++; }
      const squadPlayers = players.filter((p) => (p.team || "") === (m.team || ""));
      const squadIds = new Set(squadPlayers.map(uidOf));
      const c = convo[id];
      const cross = !!(c && Array.isArray(c.players) && c.players.length &&
        !c.players.some((u) => squadIds.has(String(u))));
      if (cross && !opts.repairCrossSquad) {
        S.crossSquadSkipped++;
        out.report.push(`${cat} ${m.date} ${m.team}: call-up is another squad's — pass --repair-cross-squad`);
      }
      const build = !c || (cross && opts.repairCrossSquad);

      if (build) {
        const answered = new Map();
        squadPlayers.forEach((p) => {
          const a = state.matchAvail.get(`${uidOf(p)}_${id}`);
          if (a && a.value) answered.set(uidOf(p), a.value);
        });
        const b = buildMatch(m, squadPlayers, {R, injuredOn, clubName, answered});
        if (!b) { out.report.push(`${cat} ${m.date} ${m.team}: squad too small — left alone`); continue; }
        b.avail.forEach((a) => {
          const docId = `${a.uid}_${id}`;
          if (haveMatchAvail.has(docId)) return;
          out.records.push({coll: "matchAvail", id: docId,
            data: {uid: a.uid, matchId: id, value: a.value, updatedAt: SERVER_TS, source: "topup"}});
          haveMatchAvail.add(docId); S.matchAvail++;
        });
        if (cross) {
          /* Only what this script wrote is removed. A match RPE a real
             player filed from a demo login carries no `source` and stays. */
          for (const [docId, r] of state.rpe) {
            if (!docId.endsWith(`_match_${id}`) || !r || r.source !== "topup") continue;
            out.deletes.push({coll: "rpe", id: docId});
            haveRpe.delete(docId); S.matchRpeReplaced++;
          }
          S.repaired++;
          out.report.push(`${cat} ${m.date} ${m.team}: cross-squad call-up rebuilt (${b.convo.players.length} players)`);
        }
        b.rpe.forEach((r) => {
          const docId = `${r.uid}_match_${id}`;
          if (haveRpe.has(docId)) return;
          out.records.push({coll: "rpe", id: docId,
            data: {uid: r.uid, rpe: r.rpe, minutes: r.minutes, ua: r.rpe * r.minutes,
              tag: "match", date: m.date, matchId: id, updatedAt: SERVER_TS, source: "topup"}});
          haveRpe.add(docId); S.matchRpe++;
        });
        convo[id] = b.convo; cChanged = true; S.convocatories++;
        events[id] = b.events; eChanged = true; S.events++;
        if (m.score !== b.score) { m.score = b.score; mChanged = true; }
        if (m.callupTime && !callup[id]) { callup[id] = m.callupTime; kChanged = true; }
        S.matchesBuilt++;
        continue;
      }

      /* A call-up already on record — the coach's own, or an earlier run's.
         It is kept; only what is missing around it is added. */
      const called = (c.players || []).map(String);
      const xi = (c.startingXI || called.slice(0, 11)).map(String);
      if (!events[id] || !events[id].length) {
        // A hand-made call-up with no events: leave the score to the coach.
        out.report.push(`${cat} ${m.date} ${m.team}: call-up with no events — left alone`);
        continue;
      }
      called.forEach((uid) => {
        const docId = `${uid}_match_${id}`;
        if (haveRpe.has(docId)) return;
        const minutes = minutesFromEvents(uid, xi, events[id]);
        if (minutes <= 0) return;
        const r = Math.max(4, Math.min(10, traitsOf(uid).fitnessBase + R.rint(-1, 3)));
        out.records.push({coll: "rpe", id: docId,
          data: {uid, rpe: r, minutes, ua: r * minutes, tag: "match", date: m.date,
            matchId: id, updatedAt: SERVER_TS, source: "topup"}});
        haveRpe.add(docId); S.matchRpe++;
      });
    }
    if (mChanged) out.shards.push({id: key("fa_matches"), cat, value: matches});
    if (eChanged) out.shards.push({id: key("fa_match_events"), cat, value: events});
    if (cChanged) out.shards.push({id: key("fa_convocatoria_sent"), cat, value: convo});
    if (kChanged) out.shards.push({id: key("fa_convocatoria_callup"), cat, value: callup});

    // ── 4. The forward calendar (before 3, so the dates refresh) ──
    const trainings = blob("fa_training", cat, []);
    const lastMatch = matches.reduce((a, m) => (m && m.date && m.date > a ? m.date : a), "");
    const haveDate = new Set(trainings.map((t) => t.date).filter(Boolean));
    let tChanged = false;
    if (trainings.length && lastMatch > today) {
      const sorted = trainings.slice().sort((a, b) => String(a.date).localeCompare(String(b.date)));
      const template = sorted[sorted.length - 1];
      const dowCount = {};
      trainings.forEach((t) => { if (t.date) dowCount[dow(t.date)] = (dowCount[dow(t.date)] || 0) + 1; });
      const days = Object.keys(dowCount).map(Number)
          .filter((d) => dowCount[d] >= 3).sort((a, b) => dowCount[b] - dowCount[a]);
      const focuses = [...new Set(trainings.map((t) => t.focus).filter(Boolean))];
      const from = template.date >= today ? addDays(template.date, 1) : today;
      let added = 0;
      for (let d = from; days.length && d <= lastMatch; d = addDays(d, 1)) {
        if (!days.includes(dow(d)) || haveDate.has(d)) continue;
        trainings.push({
          id: `tr_${parseDay(d).getTime()}_${R.id36()}`,
          day: CATALAN_DAYS[dow(d) - 1], date: d,
          time: template.time || "20:00",
          focus: focuses.length ? focuses[(trainings.length + added) % focuses.length] : "",
          location: template.location || "", mapLink: template.mapLink || "",
          status: "upcoming", category: cat,
        });
        haveDate.add(d); added++;
      }
      if (added) {
        trainings.sort((a, b) => String(b.date).localeCompare(String(a.date)));
        tChanged = true; S.sessions += added;
        out.report.push(`${cat}: calendar +${added} sessions to ${lastMatch}`);
      }
    }
    if (tChanged) out.shards.push({id: key("fa_training"), cat, value: trainings});

    // ── 3. Training availability, then RPE for those who turned up ──
    /* Only the PAST: a future session with attendance already filled in is
       the screen the coach is meant to fill in himself. */
    const past = trainings.filter((t) => t && t.date && t.date < today && t.date >= start)
        .sort((a, b) => a.date.localeCompare(b.date));
    for (const t of past) {
      for (const p of players) {
        if (!isCalledTo(t, p)) continue;
        const uid = uidOf(p);
        /* Session-keyed is the app's current shape (js/app.js recordKey);
           date-keyed is the seeder's. Either counts as present, but only the
           session key is WRITTEN: the coach's session page reads that key
           alone (no legacy fallback there), so a date-keyed answer renders
           as N/A on the one screen that lists every player's answer. */
        const aDate = `${uid}_${t.date}`;
        const aKey = t.id ? `${uid}_${t.id}` : aDate;
        const existing = availNow.get(`${uid}_${t.id}`) || availNow.get(aDate);
        let value = existing && existing.value;
        if (!value) {
          const tr = traitsOf(uid);
          const r = R.rnd();
          value = injuredOn(uid, t.date) ? "injured" :
            (r < tr.reliability ? "yes" : (r < tr.reliability + 0.07 ? "late" : "no"));
          out.records.push({coll: "trainingAvail", id: aKey,
            data: {uid, date: t.date, sessionId: t.id || null, value,
              updatedAt: SERVER_TS, source: "topup"}});
          availNow.set(aKey, {value, date: t.date});
          S.avail++;
        }
        if (value !== "yes" && value !== "late") continue;
        const rKey = t.id ? `${uid}_training_${t.id}` : `${uid}_training_${t.date}`;
        if (haveRpe.has(rKey) || haveRpe.has(`${uid}_training_${t.date}`)) continue;
        const rpe = Math.max(3, Math.min(10, traitsOf(uid).fitnessBase + R.rint(-2, 2)));
        const minutes = value === "late" ? R.rint(55, 80) : R.rint(75, 95);
        out.records.push({coll: "rpe", id: rKey,
          data: {uid, rpe, minutes, ua: rpe * minutes, tag: "training", date: t.date,
            sessionId: t.id || null, updatedAt: SERVER_TS, source: "topup"}});
        haveRpe.add(rKey);
        S.rpe++;
      }
    }

    if (usersChanged) out.shards.push({id: key("fa_users"), cat, value: users});
  }

  // ── The date arrays every push reminder queries — from what is about to be written ──
  const pending = new Map(out.shards.map((w) => [w.id, w.value]));
  const allTraining = []; const allMatch = [];
  for (const [id, v] of state.shards) {
    const k = id.split(Shard.SEP)[0];
    const rows = pending.has(id) ? pending.get(id) : v;
    if (!Array.isArray(rows)) continue;
    if (k === "fa_training") rows.forEach((t) => t && t.date && allTraining.push(t.date));
    if (k === "fa_matches") rows.forEach((m) => m && m.date && allMatch.push(m.date));
  }
  out.teamPatch = {
    trainingDates: [...new Set(allTraining)].sort(),
    matchDates: [...new Set(allMatch)].sort(),
  };
  out.gapStart = gapStart;
  out.seasonStart = start;
  return out;
}

// ── Firebase ─────────────────────────────────────────────────

async function main() {
  const argv = process.argv.slice(2);
  const has = (f) => argv.includes(f);
  const val = (f, d) => {
    const i = argv.indexOf(f);
    return i !== -1 && argv[i + 1] ? argv[i + 1] : d;
  };
  const APPLY = has("--apply");
  const CLUB = val("--club", "");
  const today = val("--today", new Date().toISOString().slice(0, 10));
  const opts = {today, seed: Number(val("--seed", "20260819")),
    repairCrossSquad: has("--repair-cross-squad")};
  const die = (msg) => { console.error("\nERROR: " + msg + "\n"); process.exit(1); };
  const log = (s) => console.log(s);
  const step = (s) => console.log("\n── " + s + " " + "─".repeat(Math.max(0, 56 - s.length)));

  if (!CLUB) die("--club <id> is required.");
  if (PROTECTED_CLUBS.has(CLUB)) die(`${CLUB} is a PROTECTED club. This script will not touch it.`);

  const admin = require("firebase-admin");
  admin.initializeApp({projectId: "esquerrapp"});
  const db = admin.firestore();
  const {FieldValue} = require("firebase-admin/firestore");

  step("Preflight");
  const clubSnap = await db.collection("clubs").doc(CLUB).get();
  if (!clubSnap.exists) die(`clubs/${CLUB} does not exist.`);
  const club = clubSnap.data() || {};
  if (club.demoSeed !== true) {
    die(`clubs/${CLUB} is not stamped demoSeed:true.\n    Only clubs seed-demo-club.js created may be topped up.`);
  }

  const teamRef = db.collection("teams").doc(CLUB);
  const [dataSnap, availSnap, mAvailSnap, rpeSnap] = await Promise.all([
    teamRef.collection("data").get(), teamRef.collection("trainingAvail").get(),
    teamRef.collection("matchAvail").get(), teamRef.collection("rpe").get(),
  ]);
  const shards = new Map(); const fields = new Map();
  dataSnap.docs.forEach((d) => {
    const data = d.data() || {};
    if (typeof data.v === "string") {
      try { shards.set(d.id, JSON.parse(data.v)); } catch (e) {
        // Never merge over something we cannot read.
        die(`${d.id} holds unparseable JSON. Inspect it by hand before re-running.`);
      }
    } else {
      const f = Object.assign({}, data); delete f.category; fields.set(d.id, f);
    }
  });
  const state = {
    club, shards, fields,
    avail: new Map(availSnap.docs.map((d) => [d.id, d.data() || {}])),
    matchAvail: new Map(mAvailSnap.docs.map((d) => [d.id, d.data() || {}])),
    rpe: new Map(rpeSnap.docs.map((d) => [d.id, d.data() || {}])),
  };

  const out = plan(state, opts);
  log(`club        : ${club.name || "(unnamed)"}`);
  log(`season      : from ${out.seasonStart}   today ${today}   gap from ${out.gapStart}`);
  log(`records     : ${state.avail.size} availability, ${state.matchAvail.size} match availability, ${state.rpe.size} rpe`);
  log(`mode        : ${APPLY ? "APPLY (will write)" : "DRY RUN (no writes)"}${opts.repairCrossSquad ? "  +repair-cross-squad" : ""}`);
  step("Report");
  out.report.forEach((r) => log("  " + r));
  step("Summary");
  Object.entries(out.summary).forEach(([k, v]) => log(`  ${k.padEnd(20)}: ${v}`));
  log(`  shard docs          : ${out.shards.length} blob, ${out.fields.length} per-field`);
  log(`  records / deletes   : ${out.records.length} / ${out.deletes.length}`);
  log(`  trainingDates/matchDates → ${out.teamPatch.trainingDates.length}/${out.teamPatch.matchDates.length}`);

  if (!APPLY) { log("\nDRY RUN — nothing was written. Re-run with --apply to commit."); return; }

  const real = (v) => (v === DELETE ? FieldValue.delete() :
    v === SERVER_TS ? FieldValue.serverTimestamp() : v);
  const realObj = (o) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, real(v)]));

  step("Writing");
  // merge:true on the shard docs so a concurrent `category` field is kept.
  for (const w of out.shards) {
    await teamRef.collection("data").doc(w.id).set({v: JSON.stringify(w.value), category: w.cat}, {merge: true});
  }
  for (const w of out.fields) {
    await teamRef.collection("data").doc(w.id).set(Object.assign(realObj(w.data), {category: w.cat}), {merge: true});
  }
  log(`  ${out.shards.length + out.fields.length} shard documents written`);
  const CHUNK = 400; // well inside the 500-op batch limit
  for (let i = 0; i < out.deletes.length; i += CHUNK) {
    const batch = db.batch();
    out.deletes.slice(i, i + CHUNK).forEach((d) => batch.delete(teamRef.collection(d.coll).doc(d.id)));
    await batch.commit();
  }
  for (let i = 0; i < out.records.length; i += CHUNK) {
    const batch = db.batch();
    out.records.slice(i, i + CHUNK).forEach((r) =>
      batch.set(teamRef.collection(r.coll).doc(r.id), realObj(r.data), {merge: true}));
    await batch.commit();
  }
  log(`  ${out.deletes.length} records deleted, ${out.records.length} written`);
  await teamRef.set(out.teamPatch, {merge: true});
  log("  trainingDates / matchDates refreshed\n\nDone.");
}

if (require.main === module) {
  main().catch((e) => { console.error("\nERROR: " + e.message + "\n"); process.exit(1); });
}

module.exports = {
  plan, buildMatch, planInjuries, fitnessFrom, injuredOnFn, traitsOf, lineOf,
  calcMatchScore, minutesFromEvents, isCalledTo, seasonStart, makeRand, addDays,
  DELETE, SERVER_TS, PROTECTED_CLUBS,
};
