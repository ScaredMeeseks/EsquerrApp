// ============================================================
// Demo club seeder — a complete, believable season for sales demos.
//
// Creates a SEPARATE club with its own accounts and join code, so no
// production data is touched. Everything it writes is stamped
// `demoSeed: true`, which is also what --purge keys off: it refuses to
// delete anything without that stamp.
//
//   clubs/{id}                     config + seasonBoundary + demoSeed
//   clubs/{id}/rosters/amateur-A   the registration gate email lists
//   clubCodes/{CODE}               a real, working join code
//   users/{uid} (+ Auth + claims)  1 lead, 1 physio, N players
//   teams/{id}                     the team doc
//   teams/{id}/data/{key}__{cat}   fa_users, fa_training, fa_matches,
//                                  fa_match_events, fa_convocatoria_sent,
//                                  fa_convocatoria_callup, fa_injuries,
//                                  fa_injury_notes, fa_injury_zone
//   teams/{id}/trainingAvail/*     player-submitted availability
//   teams/{id}/matchAvail/*
//   teams/{id}/rpe/*               session load
//
// Run from Cloud Shell (repo root — a script run from ~ fails
// MODULE_NOT_FOUND). --apply is the only mode that touches Firebase:
//
//   node functions/seed-demo-club.js                      # dry run, OFFLINE
//   node functions/seed-demo-club.js --dump ./out         # dry run + JSON
//   node functions/seed-demo-club.js --apply              # create and seed
//   node functions/seed-demo-club.js --apply --club <id>  # re-seed in place
//   node functions/seed-demo-club.js --verify --club <id> # read-back checks
//   node functions/seed-demo-club.js --apply --purge <id> # tear it all down
//
// The dry run is deliberately offline and needs no credentials: the whole
// season is generated and self-checked in memory, so the data can be
// reviewed before any of it exists. --apply needs ADC (see HANDOFF.md;
// the fix is GOOGLE_APPLICATION_CREDENTIALS, not `gcloud auth login`).
//
// Re-running is safe and idempotent: uids are derived from the club id,
// so --apply --club <id> overwrites the same accounts and shards rather
// than duplicating them. It does NOT delete records that fall outside the
// new season — run --purge and re-seed for a clean slate.
// ============================================================

const path = require("path");
const Shard = require(path.join(__dirname, "..", "js", "shard.js"));
const {
  localDateStr, seasonStartStr, setSeasonBoundary, BODY_ZONES, GROUP_SUBS,
} = require(path.join(__dirname, "..", "js", "utils.js"));

// ── Arguments ───────────────────────────────────────────────
const argv = process.argv.slice(2);
const has = (f) => argv.includes(f);
const val = (f, dflt) => {
  const i = argv.indexOf(f);
  return i !== -1 && argv[i + 1] && !argv[i + 1].startsWith("--") ?
    argv[i + 1] : dflt;
};

const APPLY = has("--apply");
const VERIFY = has("--verify");
const PURGE = val("--purge", null);
const CLUB_ID = val("--club", null);
const DUMP_DIR = val("--dump", null);

const OPTS = {
  name: val("--name", "C.E. Sant Andreu del Palomar"),
  leadEmail: val("--lead-email", "coach@demo.esquerrapp.app"),
  physioEmail: val("--physio-email", "fisio@demo.esquerrapp.app"),
  domain: val("--domain", "demo.esquerrapp.app"),
  password: val("--password", "DemoEsquerra2026!"),
  players: Number(val("--players", "25")),
  asOf: val("--as-of", null),
  // Null means "derive it from the run date" — see buildSeason().
  boundary: val("--boundary", null),
  category: val("--category", "amateur"),
  letter: val("--letter", "A"),
};

// The live club. --purge must never be able to reach it, whatever is typed.
const PROTECTED_CLUBS = new Set([
  "nDLJCpJfDvFHs8MnwtzW",  // Esquerra de l'Eixample F.C.
  "lly4GkUxIpBkSgZvzldT",  // F.C.Barcelona test club
  "default",
]);

const SEP = "  ";
const log = (...a) => console.log(...a);
const step = (m) => log(`\n${m}`);
const ok = (m) => log(`${SEP}✔ ${m}`);
const bad = (m) => { failures++; log(`${SEP}✘ ${m}`); };
let failures = 0;

// ── Deterministic randomness ────────────────────────────────
// Seeded so a dry run and the --apply that follows it produce the SAME
// season. Reviewing output that the next run would not reproduce is
// reviewing nothing.
function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
let rnd = mulberry32(20260803);
const rint = (lo, hi) => lo + Math.floor(rnd() * (hi - lo + 1));
const pick = (arr) => arr[Math.floor(rnd() * arr.length)];
const chance = (p) => rnd() < p;
function shuffled(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
/** Weighted pick: items is [[value, weight], ...]. */
function weighted(items) {
  const total = items.reduce((s, [, w]) => s + w, 0);
  let r = rnd() * total;
  for (const [v, w] of items) { if ((r -= w) <= 0) return v; }
  return items[items.length - 1][0];
}

// ── Dates ───────────────────────────────────────────────────
const dayMs = 86400000;

/* Anchored at NOON, not midnight. Every date here is a calendar day, and
   noon is the one instant a DST shift in either direction cannot move to
   another day. */
const parseDay = (s) => {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d, 12);
};

/* Calendar arithmetic, NOT milliseconds.
   `new Date(t + 86400000)` is wrong twice a year: on the autumn transition
   Spain has a 25-hour day, so adding 24h to local midnight lands at 23:00
   the SAME day — and `for (d = start; d <= end; d = addDays(d, 1))` then
   spins forever. setDate() counts days, so it steps over both transitions. */
const addDays = (s, n) => {
  const d = parseDay(s);
  d.setDate(d.getDate() + n);
  return localDateStr(d);
};
/** 1 = Monday … 7 = Sunday. */
const dow = (s) => (parseDay(s).getDay() + 6) % 7 + 1;
function nextDow(from, target) {
  let d = from;
  while (dow(d) !== target) d = addDays(d, 1);
  return d;
}

const CATALAN_DAYS = ["Dilluns", "Dimarts", "Dimecres", "Dijous",
  "Divendres", "Dissabte", "Diumenge"];
const dayLabel = (s) => CATALAN_DAYS[dow(s) - 1];

// ── Content ─────────────────────────────────────────────────
const FIRST_NAMES = [
  "Marc", "Pol", "Arnau", "Jordi", "Gerard", "Bernat", "Oriol", "Roger",
  "Guillem", "Nil", "Biel", "Aleix", "Quim", "Ferran", "Martí", "Sergi",
  "Adrià", "Iván", "Dani", "Xavi", "Enric", "Joan", "Albert", "Ramon",
  "Cesc", "Ignasi", "Ot", "Lluc",
];
const LAST_NAMES = [
  "Puig", "Serra", "Vila", "Roca", "Ferrer", "Soler", "Bosch", "Camps",
  "Costa", "Riera", "Mas", "Pujol", "Vidal", "Ribas", "Grau", "Fontana",
  "Estrada", "Bonet", "Carbó", "Miralles", "Sabaté", "Aymerich", "Clos",
  "Domènech", "Fabregat", "Gassol", "Llopis", "Munné",
];
const OPPONENTS = [
  "U.E. Horta", "C.F. Gràcia", "A.E. Poble-sec", "U.D. Sarrià",
  "C.E. Guinardó", "F.C. Clot", "U.E. Sant Martí", "C.D. Vallcarca",
  "A.D. Nou Barris", "C.F. Les Corts", "U.E. Camp d'en Grassot",
  "C.E. Barceloneta", "F.C. Sants Unió", "U.D. Trinitat Vella",
  "C.F. Verdum", "A.E. Bon Pastor", "C.E. Navas",
];
const TRAINING_FOCUS = [
  "Rondos i pressió alta", "Transicions defensa-atac", "Finalització a l'àrea",
  "Joc de posició", "Accions a pilota aturada", "Sortida de pilota",
  "Duels 1x1 i 2x2", "Circulació ràpida i amplitud", "Bascular en bloc mig",
  "Contraatac i replegament", "Centrades i remat", "Força i prevenció",
  "Partit condicionat", "Recuperació activa",
];
const LOCATION = "Escola Industrial";
const MAP_LINK = "https://share.google/pfbMOc661aRSNlynk";

// Injury templates as (zone label, description). The muscle group and sub
// come from the zone's own `groups` and GROUP_SUBS, so they always agree
// with what the medical page can display.
const INJURY_TEMPLATES = [
  { zone: "Hamstring", desc: "sobrecàrrega en sprint", days: [12, 30] },
  { zone: "Ankle", desc: "esquinç lateral", days: [10, 35] },
  { zone: "Quad", desc: "elongació", days: [7, 18] },
  { zone: "Knee", desc: "molèsties al tendó rotular", days: [14, 45] },
  { zone: "Calf", desc: "contractura", days: [5, 14] },
  { zone: "Hip / Groin", desc: "pubàlgia", days: [20, 50] },
  { zone: "Shoulder", desc: "luxació en caiguda", days: [21, 40] },
  { zone: "Lower Back", desc: "lumbàlgia", days: [6, 16] },
  { zone: "Shin / Calf", desc: "periostitis", days: [10, 24] },
];

// ── Squad shape ─────────────────────────────────────────────
// 3 GK / 8 defenders / 7 midfielders / 7 forwards = 25.
const POSITION_PLAN = [
  ["GK", 3], ["CB", 4], ["LB", 2], ["RB", 2],
  ["DM", 3], ["OM", 4], ["LW", 2], ["RW", 2], ["ST", 3],
];
/** How likely a position is to score / assist. */
const GOAL_WEIGHT = { GK: 0, CB: 0.6, LB: 0.4, RB: 0.4, DM: 1, OM: 2.5, LW: 3, RW: 3, ST: 5 };
const ASSIST_WEIGHT = { GK: 0, CB: 0.3, LB: 1, RB: 1, DM: 1.5, OM: 3, LW: 2.5, RW: 2.5, ST: 1.5 };

// ============================================================
// Generation — pure, offline, no Firebase
// ============================================================

/**
 * Generate the whole season in memory.
 *
 * `uidPrefix` is passed in rather than patched on afterwards: injuries,
 * events, call-ups and every record reference a player BY uid at the
 * moment they are built, so the ids have to be real before generation
 * starts, not stitched in after it.
 */
function buildSeason(uidPrefix) {
  rnd = mulberry32(20260803);

  const today = OPTS.asOf || localDateStr(new Date());

  // Unless told otherwise, put the boundary five months behind the run
  // date. That is what keeps this script re-runnable: whenever it is run,
  // "today" lands roughly 40% into the season, so there is always a played
  // history to show stats from AND a fixture list to show the live flows.
  // Pinning a fixed boundary works until the season rolls over and then
  // produces a demo with nothing in it.
  if (!OPTS.boundary) {
    const t = parseDay(today);
    const b = new Date(t.getFullYear(), t.getMonth() - 5, 1);
    OPTS.boundary = `${String(b.getMonth() + 1).padStart(2, "0")}-01`;
  }
  setSeasonBoundary(OPTS.boundary);

  const seasonStart = seasonStartStr(parseDay(today));
  const cat = OPTS.category;

  // ── Squad ──
  const usedNames = new Set();
  function uniqueName() {
    for (let i = 0; i < 200; i++) {
      const n = `${pick(FIRST_NAMES)} ${pick(LAST_NAMES)}`;
      if (!usedNames.has(n)) { usedNames.add(n); return n; }
    }
    return `${pick(FIRST_NAMES)} ${pick(LAST_NAMES)} ${usedNames.size}`;
  }

  const positions = [];
  POSITION_PLAN.forEach(([p, n]) => { for (let i = 0; i < n; i++) positions.push(p); });
  while (positions.length < OPTS.players) positions.push("OM");
  positions.length = OPTS.players;

  // Keepers take 1 / 13 / 25 the way a real squad list does.
  const gkNumbers = [1, 13, 25];
  let outfieldNum = 2;
  let gkSeen = 0;

  const players = positions.map((pos, i) => {
    const slug = `player${String(i + 1).padStart(2, "0")}`;
    const number = pos === "GK" ?
      (gkNumbers[gkSeen++] || 30 + gkSeen) :
      (() => { while (gkNumbers.includes(outfieldNum)) outfieldNum++; return outfieldNum++; })();
    return {
      slug,
      uid: uidPrefix + slug,
      name: uniqueName(),
      email: `${slug}@${OPTS.domain}`,
      position: pos,
      playerNumber: String(number),
      dob: `${rint(1995, 2005)}-${String(rint(1, 12)).padStart(2, "0")}-${String(rint(1, 28)).padStart(2, "0")}`,
      // Per-player traits, so the demo has model pros and flaky ones
      // instead of 25 identical rows.
      reliability: 0.62 + rnd() * 0.36,   // drives availability
      importance: 0.35 + rnd() * 0.65,    // drives call-ups and starts
      fitnessBase: rint(5, 8),            // drives RPE
    };
  });

  const staff = [
    {
      slug: "coach", uid: `${uidPrefix}coach`, name: "Xavier Bonet",
      email: OPTS.leadEmail, isLead: true, roles: ["staff"],
    },
    {
      slug: "fisio", uid: `${uidPrefix}fisio`, name: "Núria Estrada",
      email: OPTS.physioEmail, isLead: false, roles: ["staff"],
    },
  ];
  const leadUid = staff[0].uid;

  // ── Calendar ──
  // 34 matchdays on Saturdays; trainings Tuesday and Thursday of the same
  // weeks. Everything on or before `today` is history, the rest is fixture
  // list — that split is what gives the demo both stats and live flows.
  const firstSaturday = nextDow(seasonStart, 6);
  const matchdays = 34;

  const matches = [];
  const baseId = parseDay(firstSaturday).getTime();
  for (let i = 0; i < matchdays; i++) {
    const date = addDays(firstSaturday, i * 7);
    const home = i % 2 === 0;
    const opp = OPPONENTS[i % OPPONENTS.length];
    matches.push({
      id: baseId + i * 1000,
      home: home ? OPTS.name : opp,
      away: home ? opp : OPTS.name,
      date,
      time: home ? "18:00" : "16:30",
      score: null,
      status: date > today ? "upcoming" : "played",
      location: home ? LOCATION : `Camp Municipal ${opp.split(" ").slice(-1)[0]}`,
      mapLink: MAP_LINK,
      team: OPTS.letter,
      category: cat,
      callupTime: home ? "17:00" : "15:15",
    });
  }

  const trainings = [];
  const lastDate = matches[matches.length - 1].date;
  for (let d = nextDow(seasonStart, 2); d <= lastDate; d = addDays(d, 1)) {
    if (dow(d) !== 2 && dow(d) !== 4) continue;
    trainings.push({
      id: `tr_${parseDay(d).getTime()}_${Math.floor(rnd() * 1e6).toString(36)}`,
      day: dayLabel(d),
      date: d,
      time: "20:00",
      focus: TRAINING_FOCUS[trainings.length % TRAINING_FOCUS.length],
      location: LOCATION,
      mapLink: MAP_LINK,
      status: "upcoming",
      category: cat,
    });
  }

  const playedMatches = matches.filter((m) => m.date <= today);
  const pastTrainings = trainings.filter((t) => t.date <= today);
  const nextTrainings = trainings.filter((t) => t.date > today).slice(0, 3);
  const nextMatches = matches.filter((m) => m.date > today).slice(0, 2);

  // ── Injuries ──
  // Laid down BEFORE availability, so a player marked injured on a training
  // date is a player who actually had an injury open on that date. The
  // roster badge and the medical page must not contradict each other.
  const injuries = [];
  const injuryDays = {};   // slug → Set of dates the player was unavailable
  const nInjuries = Math.max(6, Math.round(OPTS.players * 0.48));

  const zoneIndexByLabel = (label) => BODY_ZONES.findIndex((z) => z.label === label);

  function makeInjury(player, startDate, template, status) {
    const zi = zoneIndexByLabel(template.zone);
    const zone = BODY_ZONES[zi] || { label: template.zone, groups: [] };
    const group = zone.groups && zone.groups.length ? pick(zone.groups) : "Hamstrings";
    const subs = GROUP_SUBS[group] || [];
    // An injury that is still open must run PAST today. Deciding that here
    // rather than patching expectedReturn afterwards is the point: the
    // blocked-out days below are derived from this date, and a later
    // adjustment left a gap in which the player showed as available in the
    // middle of his own injury.
    let endDate = addDays(startDate, rint(template.days[0], template.days[1]));
    if (status !== "resolved" && endDate <= today) {
      endDate = addDays(today, rint(3, 25));
    }
    const days = Math.round(
        (parseDay(endDate) - parseDay(startDate)) / dayMs);
    const severity = days > 28 ? "severe" : (days > 7 ? "moderate" : "minor");
    const inj = {
      id: `${parseDay(startDate).getTime()}_${Math.floor(rnd() * 1e5).toString(36)}`,
      playerId: player.uid,
      bodyZone: zi === -1 ? null : zi,
      bodyZoneLabel: zone.label,
      muscleGroup: group,
      muscleSub: subs.length ? pick(subs) : "",
      description: template.desc,
      severity,
      status,
      startDate,
      expectedReturn: endDate,
      endDate: status === "resolved" ? endDate : null,
      createdBy: leadUid,
      notes: "",
    };
    // Block out the days the player was out, capped at today for an
    // injury that has not finished yet.
    const set = injuryDays[player.slug] || (injuryDays[player.slug] = new Set());
    const stop = status === "resolved" ? endDate : (endDate < today ? endDate : today);
    for (let d = startDate; d <= stop; d = addDays(d, 1)) set.add(d);
    return inj;
  }

  const injuryCandidates = shuffled(players).slice(0, nInjuries);
  injuryCandidates.forEach((p, i) => {
    // The last three are the live cases: two active, one recovering.
    const isActive = i >= injuryCandidates.length - 2;
    const isRecovering = i === injuryCandidates.length - 3;
    const template = pick(INJURY_TEMPLATES);
    let start;
    let status;
    if (isActive) {
      start = addDays(today, -rint(3, 12));
      status = "active";
    } else if (isRecovering) {
      start = addDays(today, -rint(18, 30));
      status = "recovering";
    } else {
      // Somewhere in the played part of the season, finished well before now.
      const span = Math.max(1, Math.round((parseDay(today) - parseDay(seasonStart)) / dayMs) - 60);
      start = addDays(seasonStart, rint(5, Math.max(6, span)));
      status = "resolved";
    }
    injuries.push(makeInjury(p, start, template, status));
  });

  const injuredOn = (slug, date) =>
    !!(injuryDays[slug] && injuryDays[slug].has(date));

  // ── Availability + RPE ──
  const trainingAvail = [];
  const rpe = [];

  pastTrainings.forEach((t) => {
    players.forEach((p) => {
      let value;
      if (injuredOn(p.slug, t.date)) value = "injured";
      else {
        const r = rnd();
        value = r < p.reliability ? "yes" :
          (r < p.reliability + 0.07 ? "late" : "no");
      }
      trainingAvail.push({ uid: p.uid, date: t.date, value });
      // Only someone who actually turned up reports a session load.
      if (value === "yes" || value === "late") {
        const minutes = value === "late" ? rint(55, 80) : rint(75, 95);
        const r = Math.max(3, Math.min(10, p.fitnessBase + rint(-2, 2)));
        rpe.push({
          key: `${p.uid}_training_${t.date}`, uid: p.uid, rpe: r,
          minutes, ua: r * minutes, tag: "training", date: t.date,
        });
      }
    });
  });

  // The next few sessions: partly answered, so the coach's "who has
  // replied" screen has something to show rather than a full or empty grid.
  nextTrainings.forEach((t, i) => {
    players.forEach((p) => {
      if (!chance(0.75 - i * 0.2)) return;
      const value = injuredOn(p.slug, t.date) ? "injured" :
        (chance(p.reliability) ? "yes" : (chance(0.5) ? "late" : "no"));
      trainingAvail.push({ uid: p.uid, date: t.date, value });
    });
  });

  // Extra activities — the "altres activitats" view.
  players.forEach((p) => {
    const n = rint(0, 4);
    for (let i = 0; i < n; i++) {
      const date = addDays(today, -rint(2, 70));
      if (date < seasonStart) continue;
      const minutes = rint(30, 75);
      const r = rint(3, 8);
      rpe.push({
        key: `${p.uid}_extra_${parseDay(date).getTime() + i}`, uid: p.uid,
        rpe: r, minutes, ua: r * minutes,
        tag: pick(["Gym", "Running", "Cycling", "Swimming"]), date,
      });
    }
  });

  // ── Matches: call-ups, events, scores ──
  const matchAvail = [];
  const convocatoriaSent = {};
  const convocatoriaCallup = {};
  const matchEvents = {};

  playedMatches.forEach((m) => {
    const fit = players.filter((p) => !injuredOn(p.slug, m.date));
    // Availability first — a squad is picked from who answered yes.
    const recordOf = new Map();
    players.forEach((p) => {
      const injured = injuredOn(p.slug, m.date);
      const value = injured ? "no_disponible" :
        (chance(p.reliability * 0.95) ? "disponible" : "no_disponible");
      const rec = { uid: p.uid, matchId: String(m.id), value };
      recordOf.set(p, rec);
      matchAvail.push(rec);
    });

    // Top up a thin week rather than fielding nine men. Independent coin
    // flips occasionally leave too few available, and a played match with
    // no squad is a match with a null score — which crashed the report
    // before this existed. Flipping the record too keeps the availability
    // screen agreeing with the squad that was actually named.
    const availableOf = (p) => recordOf.get(p).value === "disponible";
    const MIN_AVAILABLE = 16;
    if (fit.filter(availableOf).length < MIN_AVAILABLE) {
      fit.filter((p) => !availableOf(p))
          .sort((a, b) => b.importance - a.importance)
          .slice(0, MIN_AVAILABLE - fit.filter(availableOf).length)
          .forEach((p) => { recordOf.get(p).value = "disponible"; });
    }

    const pool = fit.filter(availableOf);
    // Score once, then sort. A comparator that calls rnd() is not a
    // consistent ordering and different engines give different answers.
    const form = new Map(pool.map((p) => [p, p.importance + rnd() * 0.5]));
    const byForm = (a, b) => form.get(b) - form.get(a);

    const LINE = { GK: "gk", CB: "def", LB: "def", RB: "def",
      DM: "mid", OM: "mid", LW: "att", RW: "att", ST: "att" };
    const line = (p) => LINE[p.position] || "mid";
    const of = (l) => pool.filter((p) => line(p) === l).sort(byForm);

    const keepers = of("gk");
    if (!keepers.length) return;   // no keeper available — not a real match

    // Squad of 18: two keepers and the best sixteen outfielders, so the
    // bench always has cover in every line.
    const outfieldPool = pool.filter((p) => line(p) !== "gk").sort(byForm);
    const squad = keepers.slice(0, 2).concat(outfieldPool.slice(0, 16));
    if (squad.length < 11) return;   // too depleted to have been played

    // Starting XI as a 4-3-3, picked by form within each line and topped up
    // from whoever is left if a line is short. Ordered GK → defence →
    // midfield → attack, the way the convocatòria screen lists them.
    const inSquad = new Set(squad);
    const xi = [keepers[0]];
    const want = { def: 4, mid: 3, att: 3 };
    ["def", "mid", "att"].forEach((l) => {
      of(l).filter((p) => inSquad.has(p) && !xi.includes(p))
          .slice(0, want[l]).forEach((p) => xi.push(p));
    });
    outfieldPool.filter((p) => inSquad.has(p) && !xi.includes(p))
        .slice(0, 11 - xi.length).forEach((p) => xi.push(p));
    if (xi.length < 11) return;

    // Only outfielders come off the bench. A substitute keeper appearing in
    // a demo — twice in one match, as the first draft managed — is the kind
    // of detail a football person spots immediately.
    const bench = squad.filter((p) => !xi.includes(p) && line(p) !== "gk");

    convocatoriaSent[m.id] = {
      players: squad.map((p) => p.uid),
      jersey: "white",
      socks: "striped",
      videos: [],
      startingXI: xi.map((p) => p.uid),
    };
    convocatoriaCallup[m.id] = m.callupTime;

    // ── Events ──
    const ourSide = m.home === OPTS.name ? "home" : "away";
    const oppSide = ourSide === "home" ? "away" : "home";
    const events = [];
    const addEvent = (e) => events.push(Object.assign({
      id: `${parseDay(m.date).getTime()}_${Math.floor(rnd() * 1e6).toString(36)}`,
    }, e));

    // Weighted so the demo club finishes in the top third — a prospect is
    // being shown this, and a mid-table slog undersells the product — but
    // not so far that the table stops looking like amateur football.
    // ~2.1 scored, ~1.3 conceded per game.
    const ourGoals = weighted([[0, 10], [1, 26], [2, 30], [3, 20], [4, 10], [5, 4]]);
    const theirGoals = weighted([[0, 28], [1, 36], [2, 22], [3, 10], [4, 3], [5, 1]]);

    const scorerPool = xi.concat(bench.slice(0, 3));
    const scorerWeights = scorerPool.map((p) => [p, GOAL_WEIGHT[p.position] || 1]);
    const assistWeights = scorerPool.map((p) => [p, ASSIST_WEIGHT[p.position] || 1]);

    for (let g = 0; g < ourGoals; g++) {
      const scorer = weighted(scorerWeights);
      const goalType = weighted([["jugada_oberta", 72], ["penal", 14], ["falta_directa", 14]]);
      const ev = {
        side: ourSide, type: "goal", minute: String(rint(2, 90)),
        playerId: scorer.uid, goalType,
      };
      if (goalType === "jugada_oberta") {
        const withAssist = chance(0.62);
        ev.goalDetail = withAssist ? "assistencia" : "individual";
        if (withAssist) {
          const others = assistWeights.filter(([p]) => p !== scorer);
          if (others.length) ev.assistPlayerId = weighted(others).uid;
        }
      }
      addEvent(ev);
    }
    for (let g = 0; g < theirGoals; g++) {
      addEvent({
        side: oppSide, type: "goal", minute: String(rint(2, 90)),
        playerNumber: String(rint(2, 23)),
        goalType: weighted([["jugada_oberta", 78], ["penal", 12], ["falta_directa", 10]]),
      });
    }

    // Cards.
    const ourYellows = weighted([[0, 18], [1, 34], [2, 30], [3, 14], [4, 4]]);
    for (let c = 0; c < ourYellows; c++) {
      addEvent({
        side: ourSide, type: "yellow", minute: String(rint(10, 90)),
        playerId: pick(xi).uid,
      });
    }
    for (let c = 0, n = weighted([[0, 22], [1, 36], [2, 28], [3, 14]]); c < n; c++) {
      addEvent({
        side: oppSide, type: "yellow", minute: String(rint(10, 90)),
        playerNumber: String(rint(2, 23)),
      });
    }
    const redPlayer = chance(0.07) ? pick(xi) : null;
    let redMinute = null;
    if (redPlayer) {
      redMinute = rint(35, 88);
      addEvent({
        side: ourSide, type: "red", minute: String(redMinute),
        playerId: redPlayer.uid,
      });
    }

    // Substitutions — out of the XI, in from the bench, never both ways.
    const subCount = Math.min(3, bench.length);
    const subMinutes = [];
    for (let s = 0; s < subCount; s++) subMinutes.push(rint(55, 88));
    subMinutes.sort((a, b) => a - b);
    // A sent-off player cannot then be substituted, and the keeper does not
    // come off — the bench holds no outfield cover for him.
    const subCandidates = shuffled(
        xi.filter((p) => p !== redPlayer && line(p) !== "gk"));
    const subs = [];
    for (let s = 0; s < subCount && s < subCandidates.length; s++) {
      const out = subCandidates[s];
      const inn = bench[s];
      subs.push({ out, inn, minute: subMinutes[s] });
      addEvent({
        side: ourSide, type: "change", minute: String(subMinutes[s]),
        playerOutId: out.uid, playerInId: inn.uid,
      });
    }

    events.sort((a, b) => Number(a.minute) - Number(b.minute));
    matchEvents[m.id] = events;
    // The score is DERIVED, never assigned — calcMatchScore() in app.js
    // recomputes it from these same events, and a stored score that
    // disagrees is a demo that contradicts itself on screen.
    const sc = calcMatchScore(events);
    m.score = `${sc.home}-${sc.away}`;

    // ── Match RPE, from the minutes the events actually imply ──
    squad.forEach((p) => {
      const mins = minutesFor(p, xi, subs, redPlayer, redMinute);
      if (mins <= 0) return;
      const r = Math.max(4, Math.min(10, p.fitnessBase + rint(-1, 3)));
      rpe.push({
        key: `${p.uid}_match_${m.id}`, uid: p.uid, rpe: r,
        minutes: mins, ua: r * mins, tag: "match", date: m.date,
      });
    });
  });

  // Upcoming matches: partial availability, no call-up sent yet for the
  // furthest one, so both states of the convocatòria flow are visible.
  nextMatches.forEach((m, i) => {
    players.forEach((p) => {
      if (!chance(0.72 - i * 0.25)) return;
      const value = injuredOn(p.slug, m.date) ? "no_disponible" :
        (chance(p.reliability) ? "disponible" : "no_disponible");
      matchAvail.push({ uid: p.uid, matchId: String(m.id), value });
    });
    if (i === 0) convocatoriaCallup[m.id] = m.callupTime;
  });

  // ── Fitness status, derived the way the app derives it ──
  const injuryNotes = {};
  const injuryZone = {};
  players.forEach((p) => {
    const mine = injuries.filter((x) => x.playerId === p.uid);
    const active = mine.find((x) => x.status === "active");
    const recovering = mine.find((x) => x.status === "recovering");
    if (active) {
      p.fitnessStatus = "injured";
      p.injuryNote = `${active.muscleGroup} (${active.muscleSub}) – ${active.description}`;
      injuryNotes[p.uid] = p.injuryNote;
      if (active.bodyZone != null) injuryZone[p.uid] = active.bodyZone;
    } else if (recovering) {
      p.fitnessStatus = "doubt";
      p.injuryNote = `Recuperant-se de ${recovering.muscleGroup}`;
      injuryNotes[p.uid] = p.injuryNote;
      if (recovering.bodyZone != null) injuryZone[p.uid] = recovering.bodyZone;
    } else {
      p.fitnessStatus = "fit";
      p.injuryNote = "";
    }
  });

  return {
    today, seasonStart, cat, players, staff, matches, trainings,
    playedMatches, pastTrainings, nextTrainings, nextMatches,
    injuries, injuryNotes, injuryZone,
    trainingAvail, matchAvail, rpe,
    convocatoriaSent, convocatoriaCallup, matchEvents,
  };
}

/** Verbatim copy of calcMatchScore() in js/app.js — own goals count for
 *  the OTHER side, and that asymmetry is the whole reason to copy rather
 *  than re-derive. */
function calcMatchScore(events) {
  let home = 0; let away = 0;
  events.forEach((e) => {
    if (e.type === "goal") { if (e.side === "home") home++; else away++; }
    if (e.type === "own_goal") { if (e.side === "home") away++; else home++; }
  });
  return { home, away };
}

/** Minutes played, matching computePlayerMatchStats()'s interval logic. */
function minutesFor(p, xi, subs, redPlayer, redMinute) {
  const isStarter = xi.includes(p);
  const out = subs.find((s) => s.out === p);
  const inn = subs.find((s) => s.inn === p);
  const end = (redPlayer === p && redMinute != null) ? redMinute : 90;
  if (isStarter) return Math.max(0, (out ? Math.min(out.minute, end) : end));
  if (inn) return Math.max(0, end - inn.minute);
  return 0;
}

// ============================================================
// Self-checks — run on every dry run, before anything is written
// ============================================================
function selfCheck(S) {
  step("Consistency checks");
  const uids = new Set(S.players.map((p) => p.uid));

  let scoreMismatch = 0;
  let strayPlayer = 0;
  let badSub = 0;
  S.playedMatches.forEach((m) => {
    const ev = S.matchEvents[m.id] || [];
    const sc = calcMatchScore(ev);
    if (m.score !== `${sc.home}-${sc.away}`) scoreMismatch++;
    const sent = S.convocatoriaSent[m.id];
    if (!sent) return;
    const called = new Set(sent.players);
    const xi = new Set(sent.startingXI);
    ev.forEach((e) => {
      [e.playerId, e.assistPlayerId, e.playerOutId, e.playerInId].forEach((id) => {
        if (id && !called.has(id)) strayPlayer++;
      });
      if (e.type === "change") {
        if (e.playerOutId && !xi.has(e.playerOutId)) badSub++;
        if (e.playerInId && xi.has(e.playerInId)) badSub++;
      }
    });
  });
  scoreMismatch ? bad(`${scoreMismatch} match scores disagree with their events`) :
    ok("every stored score equals calcMatchScore() of its events");

  const unplayed = S.playedMatches.filter((m) => !m.score || !S.convocatoriaSent[m.id]);
  unplayed.length ?
    bad(`${unplayed.length} past matches have no score or no call-up (${unplayed[0].date})`) :
    ok("every past match has a score and a named squad");
  strayPlayer ? bad(`${strayPlayer} events name a player who was not called up`) :
    ok("every event names a called-up player");
  badSub ? bad(`${badSub} substitutions swap the wrong way`) :
    ok("substitutions go XI → bench, never the reverse");

  const badXI = S.playedMatches.filter((m) => {
    const s = S.convocatoriaSent[m.id];
    return s && s.startingXI.length !== 11;
  }).length;
  badXI ? bad(`${badXI} matches have a starting XI that is not 11`) :
    ok("every played match has exactly 11 starters");

  // Football sanity, not data integrity — but a substitute keeper or an XI
  // with two of them is what a prospect notices first.
  const posOf = Object.fromEntries(S.players.map((p) => [p.uid, p.position]));
  let keeperTrouble = 0;
  S.playedMatches.forEach((m) => {
    const s = S.convocatoriaSent[m.id];
    if (!s) return;
    if (s.startingXI.filter((id) => posOf[id] === "GK").length !== 1) keeperTrouble++;
    (S.matchEvents[m.id] || []).forEach((e) => {
      if (e.type !== "change") return;
      if (posOf[e.playerInId] === "GK" || posOf[e.playerOutId] === "GK") keeperTrouble++;
    });
  });
  keeperTrouble ? bad(`${keeperTrouble} matches start or substitute keepers wrongly`) :
    ok("exactly one keeper starts each match and none is ever substituted");

  const outfieldXI = S.playedMatches.filter((m) => {
    const s = S.convocatoriaSent[m.id];
    if (!s) return false;
    const lines = s.startingXI.map((id) => posOf[id]);
    return lines.filter((p) => ["CB", "LB", "RB"].includes(p)).length < 3 ||
      lines.filter((p) => ["LW", "RW", "ST"].includes(p)).length < 2;
  }).length;
  outfieldXI ? bad(`${outfieldXI} starting XIs are not a plausible shape`) :
    ok("every XI fields at least 3 defenders and 2 forwards");

  const orphanRpe = S.rpe.filter((r) => !uids.has(r.uid)).length;
  const orphanAvail = S.trainingAvail.filter((a) => !uids.has(a.uid)).length;
  (orphanRpe + orphanAvail) ?
    bad(`${orphanRpe + orphanAvail} records belong to no player`) :
    ok("every availability and RPE record belongs to a squad member");

  const badUa = S.rpe.filter((r) => r.ua !== r.rpe * r.minutes).length;
  badUa ? bad(`${badUa} RPE rows have ua ≠ rpe × minutes`) :
    ok("ua = rpe × minutes on every load record");

  // The one the roster badge and the medical page would disagree about.
  let statusMismatch = 0;
  S.players.forEach((p) => {
    const mine = S.injuries.filter((x) => x.playerId === p.uid);
    const expect = mine.some((x) => x.status === "active") ? "injured" :
      (mine.some((x) => x.status === "recovering") ? "doubt" : "fit");
    if (p.fitnessStatus !== expect) statusMismatch++;
  });
  statusMismatch ? bad(`${statusMismatch} players' fitnessStatus contradicts their injuries`) :
    ok("fitnessStatus agrees with the injury log for all players");

  let availClash = 0;
  const injuredDates = {};
  S.injuries.forEach((inj) => {
    const stop = inj.status === "resolved" ? inj.endDate :
      (inj.expectedReturn < S.today ? inj.expectedReturn : S.today);
    for (let d = inj.startDate; d <= stop; d = addDays(d, 1)) {
      (injuredDates[inj.playerId] || (injuredDates[inj.playerId] = new Set())).add(d);
    }
  });
  S.trainingAvail.forEach((a) => {
    const s = injuredDates[a.uid];
    if (s && s.has(a.date) && a.value !== "injured") availClash++;
  });
  availClash ? bad(`${availClash} sessions mark an injured player as available`) :
    ok("an injured player is never marked available for training");

  // addDays() used to do millisecond arithmetic, which silently repeats a
  // date across the autumn DST transition. Duplicate dates are the visible
  // symptom, so they are worth asserting rather than trusting.
  const dupDates = (list, label) => {
    const seen = new Set();
    const dup = list.filter((x) => seen.size === seen.add(x.date).size);
    if (dup.length) bad(`${dup.length} duplicate ${label} dates (${dup[0].date}) — date arithmetic is broken`);
    return dup.length;
  };
  const dups = dupDates(S.trainings, "training") + dupDates(S.matches, "match");
  if (!dups) ok("no repeated fixture dates — date arithmetic survives DST");

  const inSeason = S.matches.every((m) => m.date >= S.seasonStart) &&
    S.trainings.every((t) => t.date >= S.seasonStart);
  inSeason ? ok(`every fixture falls inside the season window (from ${S.seasonStart})`) :
    bad("some fixtures fall outside the season window");

  const past = S.playedMatches.length;
  const future = S.matches.length - past;
  (past >= 8 && future >= 2) ?
    ok(`${past} played and ${future} upcoming fixtures — both stats and live flows have content`) :
    bad(`only ${past} played / ${future} upcoming — the demo would look half-empty`);

  return failures === 0;
}

// ============================================================
// Shard building — routed through js/shard.js, never by hand
// ============================================================
function buildShards(S) {
  const roster = S.players.map((p) => ({ id: p.uid, category: S.cat }))
      .concat(S.staff.map((s) => ({ id: s.uid, category: "" })));
  const ctx = {
    userCat: (uid) => {
      const u = roster.find((x) => String(x.id) === String(uid));
      return u ? u.category : "";
    },
    matchCat: (mid) => {
      const m = S.matches.find((x) => String(x.id) === String(mid));
      return m ? m.category : "";
    },
  };

  const faUsers = S.staff.map((s) => ({
    id: s.uid, name: s.name, email: s.email, position: "", playerNumber: "",
    profilePic: "", dob: "", profileSetupDone: true,
    roles: s.roles, category: "", team: "",
    staffCategories: [S.cat], isAdmin: false, isTeamLead: !!s.isLead,
    teamId: S.clubId, fitnessStatus: "fit", injuryNote: "",
  })).concat(S.players.map((p) => ({
    id: p.uid, name: p.name, email: p.email, position: p.position,
    playerNumber: p.playerNumber, profilePic: "", dob: p.dob,
    profileSetupDone: true, roles: ["player"], category: S.cat,
    team: OPTS.letter, staffCategories: [], isAdmin: false,
    isTeamLead: false, teamId: S.clubId,
    fitnessStatus: p.fitnessStatus, injuryNote: p.injuryNote,
  })));

  const blobs = {
    fa_users: faUsers,
    fa_training: S.trainings,
    fa_matches: S.matches,
    fa_match_events: S.matchEvents,
    fa_convocatoria_sent: S.convocatoriaSent,
    fa_convocatoria_callup: S.convocatoriaCallup,
    fa_injuries: S.injuries,
    fa_injury_notes: S.injuryNotes,
    fa_injury_zone: S.injuryZone,
  };

  // MERGE-shape keys store entries as top-level document fields, with no
  // `v`. db.js's MERGE_KEYS is the authority; these are the two we write.
  const MERGE_KEYS = new Set(["fa_injury_notes", "fa_injury_zone"]);

  const docs = [];
  Object.keys(blobs).forEach((key) => {
    const parts = Shard.partition(key, blobs[key], ctx, null);
    Object.keys(parts).forEach((cat) => {
      const value = parts[cat];
      if (Shard.isEmpty(key, value)) return;
      docs.push({
        id: Shard.docId(key, cat),
        key,
        cat,
        // The `category` field is not decoration: the client's data/ query
        // is where('category','in', scope), so a shard without it is
        // invisible to every reader — dark, not merely misfiled.
        data: MERGE_KEYS.has(key) ?
          Object.assign({}, value, { category: cat }) :
          { v: JSON.stringify(value), category: cat },
      });
    });
  });
  return docs;
}

// ============================================================
// Reporting
// ============================================================
function report(S, docs) {
  // The season closes the day before the boundary comes round again.
  const [sy, sm, sd] = S.seasonStart.split("-").map(Number);
  const seasonEnd = addDays(localDateStr(new Date(sy + 1, sm - 1, sd)), -1);
  step(`Season ${S.seasonStart} → ${seasonEnd}   (as of ${S.today}, boundary ${OPTS.boundary})`);
  log(`${SEP}club            ${OPTS.name}`);
  log(`${SEP}category        ${S.cat} / team ${OPTS.letter}`);
  log(`${SEP}squad           ${S.players.length} players + ${S.staff.length} staff`);
  log(`${SEP}trainings       ${S.trainings.length}  (${S.pastTrainings.length} past, ${S.trainings.length - S.pastTrainings.length} upcoming)`);
  log(`${SEP}matches         ${S.matches.length}  (${S.playedMatches.length} played, ${S.matches.length - S.playedMatches.length} upcoming)`);

  let w = 0; let d = 0; let l = 0; let gf = 0; let ga = 0;
  S.playedMatches.forEach((m) => {
    if (!m.score) return;   // selfCheck reports it; don't crash the report
    const [h, a] = m.score.split("-").map(Number);
    const ours = m.home === OPTS.name ? h : a;
    const theirs = m.home === OPTS.name ? a : h;
    gf += ours; ga += theirs;
    if (ours > theirs) w++; else if (ours < theirs) l++; else d++;
  });
  log(`${SEP}record          ${w}W ${d}D ${l}L   ${gf}:${ga}  (${w * 3 + d} pts)`);
  log(`${SEP}injuries        ${S.injuries.length}  (${S.injuries.filter((i) => i.status === "active").length} active, ${S.injuries.filter((i) => i.status === "recovering").length} recovering, ${S.injuries.filter((i) => i.status === "resolved").length} resolved)`);

  step("Documents");
  log(`${SEP}data shards     ${docs.length}`);
  docs.forEach((doc) => {
    const n = doc.data.v ?
      (() => {
        const p = JSON.parse(doc.data.v);
        return Array.isArray(p) ? p.length : Object.keys(p).length;
      })() :
      Object.keys(doc.data).length - 1;
    log(`${SEP}${SEP}${doc.id.padEnd(34)} ${String(n).padStart(4)} entries`);
  });
  log(`${SEP}trainingAvail   ${S.trainingAvail.length}`);
  log(`${SEP}matchAvail      ${S.matchAvail.length}`);
  log(`${SEP}rpe             ${S.rpe.length}`);
  log(`${SEP}accounts        ${S.players.length + S.staff.length}  (Auth + users/ + claims)`);
  const total = docs.length + S.trainingAvail.length + S.matchAvail.length +
    S.rpe.length + S.players.length + S.staff.length + 4;
  log(`${SEP}${"".padEnd(16)}${"─".repeat(20)}`);
  log(`${SEP}total writes    ~${total}`);
}

// ============================================================
// Firebase — only reached with --apply / --verify / --purge
// ============================================================
let admin; let db; let auth; let FieldValue;
function initFirebase() {
  admin = require("firebase-admin");
  if (!admin.apps.length) admin.initializeApp({ projectId: "esquerrapp" });
  db = admin.firestore();
  auth = admin.auth();
  ({ FieldValue } = require("firebase-admin/firestore"));
}

/** Commit in chunks well inside the 500-op batch limit. */
async function commitAll(ops, label) {
  const CHUNK = 400;
  for (let i = 0; i < ops.length; i += CHUNK) {
    const batch = db.batch();
    ops.slice(i, i + CHUNK).forEach((o) => batch.set(o.ref, o.data, o.opts || {}));
    await batch.commit();
    log(`${SEP}${label}: ${Math.min(i + CHUNK, ops.length)}/${ops.length}`);
  }
}

async function ensureAccount(uid, email, displayName) {
  const props = { uid, email, displayName, password: OPTS.password,
    emailVerified: true };
  try {
    await auth.createUser(props);
    return "created";
  } catch (e) {
    if (e.code === "auth/uid-already-exists" ||
        e.code === "auth/email-already-exists") {
      // Re-seeding: keep the same account so the demo credentials that were
      // handed out keep working.
      const { uid: _u, ...rest } = props;
      await auth.updateUser(uid, rest);
      return "updated";
    }
    throw e;
  }
}

async function apply(S, docs) {
  step("Writing");

  // 1. Club scaffolding.
  const clubRef = S.clubId ? db.collection("clubs").doc(S.clubId) :
    db.collection("clubs").doc();
  S.clubId = clubRef.id;
  await clubRef.set({
    name: OPTS.name,
    badgeUrl: "",
    leadEmail: OPTS.leadEmail.toLowerCase(),
    categories: {
      amateur: { enabled: OPTS.category === "amateur", letters: [OPTS.letter] },
      juvenil: { enabled: false, letters: ["A", "B"] },
      cadet: { enabled: false, letters: ["A", "B"] },
      infantil: { enabled: false, letters: ["A", "B"] },
      alevi: { enabled: false, letters: ["A", "B"] },
      benjami: { enabled: false, letters: ["A", "B"] },
    },
    fcfLinks: {},
    schedules: {
      [`${OPTS.category}-${OPTS.letter}`]: {
        training: [
          { day: "tue", time: "20:00", location: LOCATION, link: MAP_LINK },
          { day: "thu", time: "20:00", location: LOCATION, link: MAP_LINK },
        ],
        homeGame: [
          { day: "sat", time: "18:00", location: LOCATION, link: MAP_LINK },
        ],
      },
    },
    seasonBoundary: OPTS.boundary,
    demoSeed: true,
    createdAt: FieldValue.serverTimestamp(),
  }, { merge: true });
  ok(`clubs/${S.clubId}`);

  const code = S.joinCode;
  await db.collection("clubCodes").doc(code).set({ clubId: S.clubId });
  ok(`clubCodes/${code}`);

  await db.collection("teams").doc(S.clubId).set({
    name: OPTS.name,
    trainingDates: [],
    matchDates: [],
    createdAt: FieldValue.serverTimestamp(),
  }, { merge: true });
  ok(`teams/${S.clubId}`);

  await clubRef.collection("rosters").doc(`${OPTS.category}-${OPTS.letter}`).set({
    staffEmails: S.staff.map((s) => s.email.toLowerCase()),
    playerEmails: S.players.map((p) => p.email.toLowerCase()),
    updatedAt: FieldValue.serverTimestamp(),
  });
  ok(`rosters/${OPTS.category}-${OPTS.letter} — ${S.players.length} players, ${S.staff.length} staff`);

  // 2. Accounts, BEFORE the shards: onMemberCategoryChanged fires on every
  //    users/ write whose category changed and reshards that member's
  //    injury rows. Writing people first means it finds nothing to move.
  step("Accounts");
  const everyone = S.staff.concat(S.players);
  let created = 0; let updated = 0;
  for (const person of everyone) {
    const res = await ensureAccount(person.uid, person.email, person.name);
    res === "created" ? created++ : updated++;
    const isPlayer = !person.roles || person.roles.includes("player") ||
      S.players.includes(person);
    await auth.setCustomUserClaims(person.uid, {
      teamId: S.clubId,
      role: person.isLead ? "lead" : (isPlayer ? "player" : "staff"),
      cats: [S.cat],
    });
  }
  ok(`Auth: ${created} created, ${updated} updated (password: ${OPTS.password})`);

  const userOps = everyone.map((person) => {
    const isPlayer = S.players.includes(person);
    return {
      ref: db.collection("users").doc(person.uid),
      data: {
        id: person.uid,
        name: person.name,
        email: person.email.toLowerCase(),
        position: isPlayer ? person.position : "",
        playerNumber: isPlayer ? person.playerNumber : "",
        profilePic: "",
        dob: isPlayer ? person.dob : "",
        profileSetupDone: true,
        teamId: S.clubId,
        isTeamLead: !!person.isLead,
        roles: isPlayer ? ["player"] : person.roles,
        category: isPlayer ? S.cat : "",
        team: isPlayer ? OPTS.letter : "",
        staffCategories: isPlayer ? [] : [S.cat],
        fitnessStatus: isPlayer ? person.fitnessStatus : "fit",
        injuryNote: isPlayer ? person.injuryNote : "",
        demoSeed: true,
        claimsUpdatedAt: FieldValue.serverTimestamp(),
      },
      opts: { merge: true },
    };
  });
  await commitAll(userOps, "users");

  // 3. Data shards.
  step("Data shards");
  const dataCol = db.collection("teams").doc(S.clubId).collection("data");
  await commitAll(docs.map((d) => ({ ref: dataCol.doc(d.id), data: d.data })), "data");

  // 4. Player-submitted records.
  step("Records");
  const teamRef = db.collection("teams").doc(S.clubId);
  const stamp = FieldValue.serverTimestamp();
  await commitAll(S.trainingAvail.map((a) => ({
    ref: teamRef.collection("trainingAvail").doc(`${a.uid}_${a.date}`),
    data: { uid: a.uid, date: a.date, value: a.value, updatedAt: stamp, source: "seed" },
  })), "trainingAvail");
  await commitAll(S.matchAvail.map((a) => ({
    ref: teamRef.collection("matchAvail").doc(`${a.uid}_${a.matchId}`),
    data: { uid: a.uid, matchId: a.matchId, value: a.value, updatedAt: stamp, source: "seed" },
  })), "matchAvail");
  await commitAll(S.rpe.map((r) => ({
    ref: teamRef.collection("rpe").doc(r.key),
    data: { uid: r.uid, rpe: r.rpe, minutes: r.minutes, ua: r.ua, tag: r.tag,
      date: r.date, updatedAt: stamp, source: "seed" },
  })), "rpe");

  step("Done");
  log(`${SEP}club id     ${S.clubId}`);
  log(`${SEP}join code   ${code}`);
  log(`${SEP}coach       ${OPTS.leadEmail}  /  ${OPTS.password}`);
  log(`${SEP}physio      ${OPTS.physioEmail}  /  ${OPTS.password}`);
  log(`${SEP}a player    ${S.players[0].email}  /  ${OPTS.password}`);
  log(`\n${SEP}trainingDates/matchDates are filled by the updateTeamDates`);
  log(`${SEP}trigger. If they look wrong: node functions/backfill-team-dates.js`);
  log(`${SEP}Verify with: node functions/seed-demo-club.js --verify --club ${S.clubId}`);
}

// ============================================================
// Verify — read back what actually landed
// ============================================================
async function verify(clubId) {
  initFirebase();
  step(`Verifying clubs/${clubId}`);

  const club = await db.collection("clubs").doc(clubId).get();
  if (!club.exists) { bad("club document is missing"); return; }
  club.data().demoSeed ? ok("club is stamped demoSeed") :
    bad("club is NOT stamped demoSeed — is this the right id?");
  ok(`seasonBoundary = ${club.data().seasonBoundary || "(unset → 08-15)"}`);

  const dataSnap = await db.collection("teams").doc(clubId).collection("data").get();
  let noCategory = 0; let badId = 0; let mismatched = 0;
  dataSnap.forEach((d) => {
    const parts = Shard.parseDocId(d.id);
    if (!parts) { badId++; return; }
    const cat = d.data().category;
    if (cat === undefined) noCategory++;
    else if (cat !== parts.cat) mismatched++;
  });
  badId ? bad(`${badId} data docs have a legacy un-sharded id`) :
    ok(`${dataSnap.size} data docs, every id parses as {key}__{category}`);
  noCategory ? bad(`${noCategory} shards have NO category field — they are invisible to the app`) :
    ok("every shard carries a category field");
  mismatched ? bad(`${mismatched} shards' category field disagrees with their id`) :
    ok("every category field agrees with its doc id");

  // Merge the fa_users shards back the way the client does.
  const userShards = {};
  const matchShards = {};
  dataSnap.forEach((d) => {
    const p = Shard.parseDocId(d.id);
    if (!p) return;
    if (p.key === "fa_users") userShards[p.cat] = JSON.parse(d.data().v || "[]");
    if (p.key === "fa_matches") matchShards[p.cat] = JSON.parse(d.data().v || "[]");
  });
  const faUsers = Shard.merge("fa_users", userShards);
  ok(`fa_users merges to ${faUsers.length} members`);

  const matches = Shard.merge("fa_matches", matchShards);
  const evDoc = dataSnap.docs.find((d) => d.id.startsWith("fa_match_events" + Shard.SEP));
  const events = evDoc ? JSON.parse(evDoc.data().v || "{}") : {};
  let scoreBad = 0;
  matches.forEach((m) => {
    const ev = events[m.id];
    if (!ev || !m.score) return;
    const sc = calcMatchScore(ev);
    if (m.score !== `${sc.home}-${sc.away}`) scoreBad++;
  });
  scoreBad ? bad(`${scoreBad} stored scores disagree with their events`) :
    ok("every stored score equals calcMatchScore() of its events");

  const team = await db.collection("teams").doc(clubId).get();
  const td = (team.data() || {}).trainingDates || [];
  const md = (team.data() || {}).matchDates || [];
  (td.length && md.length) ?
    ok(`trainingDates ${td.length}, matchDates ${md.length} (updateTeamDates fired)`) :
    bad(`trainingDates ${td.length}, matchDates ${md.length} — run backfill-team-dates.js`);

  for (const coll of ["trainingAvail", "matchAvail", "rpe"]) {
    const snap = await db.collection("teams").doc(clubId).collection(coll).get();
    ok(`${coll}: ${snap.size} records`);
  }

  const users = await db.collection("users").where("teamId", "==", clubId).get();
  const unstamped = users.docs.filter((d) => !d.data().demoSeed).length;
  unstamped ? bad(`${unstamped} of ${users.size} users are NOT stamped demoSeed`) :
    ok(`${users.size} users, all stamped demoSeed`);
}

// ============================================================
// Purge
// ============================================================
async function purge(clubId) {
  initFirebase();
  if (PROTECTED_CLUBS.has(clubId)) {
    log(`\nREFUSED: ${clubId} is a protected club. This script will not touch it.`);
    process.exit(1);
  }
  const club = await db.collection("clubs").doc(clubId).get();
  if (!club.exists) {
    log(`\nREFUSED: clubs/${clubId} does not exist.`);
    process.exit(1);
  }
  if (!club.data().demoSeed) {
    log(`\nREFUSED: clubs/${clubId} is not stamped demoSeed:true.`);
    log("Only clubs this script created can be purged.");
    process.exit(1);
  }

  step(`Purging clubs/${clubId} — ${club.data().name}`);
  const users = await db.collection("users").where("teamId", "==", clubId).get();
  const demoUsers = users.docs.filter((d) => d.data().demoSeed);
  const keepers = users.size - demoUsers.length;

  log(`${SEP}${demoUsers.length} demo accounts to delete` +
    (keepers ? `, ${keepers} NOT stamped demoSeed and will be KEPT` : ""));

  const subs = ["data", "trainingAvail", "matchAvail", "rpe", "pushQueue"];
  const counts = {};
  for (const c of subs) {
    counts[c] = (await db.collection("teams").doc(clubId).collection(c).get()).size;
    log(`${SEP}${c}: ${counts[c]}`);
  }

  if (!APPLY) {
    log(`\n${SEP}DRY RUN — nothing deleted. Re-run with --apply to act.`);
    return;
  }

  for (const c of subs) {
    const snap = await db.collection("teams").doc(clubId).collection(c).get();
    for (let i = 0; i < snap.docs.length; i += 400) {
      const batch = db.batch();
      snap.docs.slice(i, i + 400).forEach((d) => batch.delete(d.ref));
      await batch.commit();
    }
    ok(`deleted ${snap.size} from ${c}`);
  }

  for (const d of demoUsers) {
    const toks = await d.ref.collection("tokens").get();
    for (const t of toks.docs) await t.ref.delete();
    await d.ref.delete();
    try { await auth.deleteUser(d.id); } catch (e) { /* already gone */ }
  }
  ok(`deleted ${demoUsers.length} accounts (Auth + users/ + tokens)`);

  const rosters = await db.collection("clubs").doc(clubId).collection("rosters").get();
  for (const r of rosters.docs) await r.ref.delete();
  const codes = await db.collection("clubCodes").where("clubId", "==", clubId).get();
  for (const c of codes.docs) await c.ref.delete();
  await db.collection("teams").doc(clubId).delete();
  await db.collection("clubs").doc(clubId).delete();
  ok("deleted rosters, join code, team and club documents");
}

// ============================================================
// Main
// ============================================================
function makeJoinCode() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let c = "";
  for (let i = 0; i < 6; i++) c += chars[Math.floor(rnd() * chars.length)];
  return c;
}

(async () => {
  log("=== EsquerrApp demo club seeder ===");

  if (PURGE) return purge(PURGE);
  if (VERIFY) {
    if (!CLUB_ID) { log("\n--verify needs --club <clubId>"); process.exit(1); }
    await verify(CLUB_ID);
    log(failures ? `\n${failures} check(s) FAILED` : "\nAll checks passed.");
    process.exit(failures ? 1 : 0);
  }

  // Uids are derived from the club id so a re-seed lands on the same
  // accounts and the demo credentials keep working. A brand-new club has no
  // id yet, so one is reserved BEFORE generating — every injury, event and
  // record refers to a player by uid as it is built.
  if (APPLY) initFirebase();
  const clubId = CLUB_ID ||
    (APPLY ? db.collection("clubs").doc().id : "DRYRUNCLUBID000000000");

  const S = buildSeason(`dm_${clubId.slice(0, 10)}_`);
  S.clubId = clubId;
  S.joinCode = makeJoinCode();

  const docs = buildShards(S);
  report(S, docs);
  const clean = selfCheck(S);

  if (DUMP_DIR) {
    const fs = require("fs");
    fs.mkdirSync(DUMP_DIR, { recursive: true });
    fs.writeFileSync(path.join(DUMP_DIR, "season.json"), JSON.stringify(S, null, 2));
    fs.writeFileSync(path.join(DUMP_DIR, "shards.json"), JSON.stringify(docs, null, 2));
    log(`\n${SEP}dumped season.json + shards.json to ${DUMP_DIR}`);
  }

  if (!clean) {
    log(`\n${failures} consistency check(s) FAILED — refusing to write.`);
    process.exit(1);
  }

  if (!APPLY) {
    log("\nDRY RUN — nothing was written and no credentials were used.");
    log("Re-run with --apply to create the club.");
    return;
  }

  await apply(S, docs);
})().catch((e) => {
  console.error("\nFAILED:", e && e.stack || e);
  process.exit(1);
});
