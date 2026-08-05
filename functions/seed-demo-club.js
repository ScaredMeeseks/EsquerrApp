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
//   # add squads to a club that ALREADY has data (repeatable, one run):
//   node functions/seed-demo-club.js --club <id> \
//        --add-team amateur-B --add-team juvenil-A --faces ~/faces
//
// Profile pictures: --faces <dir> uploads images to profilePics/{uid}.{ext},
// the same path real uploads use. A file named after a slug (player01.jpg,
// coach.png) goes to that person; anything else is handed out alphabetically
// to whoever is still bare. Fewer images than people is fine — the rest keep
// the app's initials fallback. Cloud Shell's home directory persists, so the
// folder only has to be uploaded once:
//   node functions/seed-demo-club.js --apply --club <id> --faces ~/demo-faces
//
// The dry run is deliberately offline and needs no credentials: the whole
// season is generated and self-checked in memory, so the data can be
// reviewed before any of it exists. --apply needs ADC — on Cloud Shell that
// is automatic (it is a GCE VM whose metadata server supplies it). If it
// fails, the usual cause is a STALE GOOGLE_APPLICATION_CREDENTIALS being
// read in preference to the working metadata credentials: unset it.
//
// Re-running is safe and idempotent: uids are derived from the club id,
// so --apply --club <id> overwrites the same accounts and shards rather
// than duplicating them. It does NOT delete records that fall outside the
// new season — run --purge and re-seed for a clean slate.
//
// --add-team is the one ADDITIVE mode, and the differences matter:
//
//   * It reads before it writes. Every data/ shard is merged with what is
//     already stored, because fa_users is routed by CATEGORY with no team
//     letter — amateur-A and amateur-B share one document, and --apply's
//     blind set() would erase the first squad.
//   * It touches clubs/{id} by DOTTED PATH only. --apply rewrites the whole
//     `categories` map every run, which would undo the club's own setup.
//   * It refuses any club not stamped demoSeed:true, and any PROTECTED_CLUB.
//     --apply is guarded by neither, so it must never be pointed at a real
//     club; --add-team cannot be.
//   * Its dry run performs READS (it has to know what is already there), so
//     unlike the other dry run it does need credentials. It writes nothing.
//   * It refuses a team that already has players, so a second run cannot
//     silently double a squad.
//
// The team must already exist in the club's config — enable the category and
// its letter in the app first. That keeps the lead's paid team quota, which
// is enforced in setClubCategories, the only authority on how many teams a
// club may have.
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

/** Every value of a repeatable flag: `--add-team a-A --add-team b-B`. */
const vals = (f) => argv.reduce((out, a, i) => {
  if (a === f && argv[i + 1] && !argv[i + 1].startsWith("--")) out.push(argv[i + 1]);
  return out;
}, []);

const APPLY = has("--apply");
const VERIFY = has("--verify");
const PURGE = val("--purge", null);
const ADD_TEAMS = vals("--add-team");
const CLUB_ID = val("--club", null);
const DUMP_DIR = val("--dump", null);
const FACES_DIR = val("--faces", null);

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
 *
 * `opts` exists for --add-team, where several squads land in ONE club and
 * every id space they share has to be kept apart:
 *   seed            different names and traits per team, not 25 clones
 *   emailPrefix     player01@ is taken by the first team; namespace it
 *   staffUidPrefix  staff are club-wide — the coach must stay ONE account
 *   matchIdOffset   two teams in a category share fa_matches__{cat}
 *   trainings       reuse the category's real calendar (see addTeams)
 *   usedNames       a Set shared across teams AND seeded with the players
 *                   already in the club, so nobody is generated twice
 */
function buildSeason(uidPrefix, opts) {
  opts = opts || {};
  rnd = mulberry32(opts.seed || 20260803);

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
  const usedNames = opts.usedNames || new Set();
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
      email: `${opts.emailPrefix || ""}${slug}@${OPTS.domain}`,
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

  /* Staff are CLUB-wide, not per-team: adding a second squad must not mint
     a second Xavier Bonet. --add-team passes the club-level prefix so both
     runs resolve to the one account, which is also what keeps the handed-out
     coach credentials working. */
  const staffPrefix = opts.staffUidPrefix || uidPrefix;
  const staff = [
    {
      slug: "coach", uid: `${staffPrefix}coach`, name: "Xavier Bonet",
      email: OPTS.leadEmail, isLead: true, roles: ["staff"],
    },
    {
      slug: "fisio", uid: `${staffPrefix}fisio`, name: "Núria Estrada",
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
  // Matches DO carry a team letter, so two teams in one category coexist in
  // fa_matches__{cat} — but only if their ids differ. Ids step by 1000, so
  // any offset below that keeps every team's fixtures distinct.
  const baseId = parseDay(firstSaturday).getTime() + (opts.matchIdOffset || 0);
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

  /* fa_training is routed by CATEGORY with no team letter, so every team in
     a category literally shares one calendar. A second squad therefore
     REUSES the sessions that are already there rather than generating its
     own — generating would either duplicate the first team's calendar or
     replace it. Its players still get their own attendance and RPE, which
     are per-record and per-player. */
  const trainings = [];
  const lastDate = matches[matches.length - 1].date;
  if (opts.trainings) {
    // Ascending: nextTrainings takes the FIRST three upcoming, and the
    // stored shard is sorted newest-first by its route.
    opts.trainings.slice()
        .sort((a, b) => String(a.date).localeCompare(String(b.date)))
        .forEach((t) => trainings.push(t));
  } else {
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
    /* The letter is STAMPED here, not read from OPTS later. --add-team
       builds several teams in one process and mutates OPTS between them, so
       anything reading OPTS after the loops sees the last team's letter —
       which is exactly how the dry-run report announced "amateur-B" as
       "team A". The data was right; the label was reading a moving target. */
    letter: OPTS.letter,
    today, seasonStart, cat, players, staff, matches, trainings,
    playedMatches, pastTrainings, nextTrainings, nextMatches,
    injuries, injuryNotes, injuryZone,
    trainingAvail, matchAvail, rpe,
    convocatoriaSent, convocatoriaCallup, matchEvents,
  };
}

/**
 * Match image files to people and decide each one's Storage path and URL.
 *
 * Runs OFFLINE and before the shards are built, because `profilePic` has to
 * be on the person object by the time fa_users is assembled. The download
 * token is minted here rather than after upload: Firebase's download URL is
 * just the object path plus a token WE supply as metadata, so it can be
 * known in advance and the dry run can show exactly what it will produce.
 *
 * Filenames are matched by slug (`player01.jpg`, `coach.png`); anything else
 * is handed out alphabetically to whoever is still without a picture. Fewer
 * images than people is fine — the rest keep the app's initials fallback.
 */
const FACE_EXT = new Set([".jpg", ".jpeg", ".png", ".webp"]);
const MAX_FACE_BYTES = 5 * 1024 * 1024;   // storage.rules' own ceiling

function assignFaces(S, dir) {
  const fs = require("fs");
  const crypto = require("crypto");
  const out = { dir, files: 0, matched: 0, skipped: [], uploads: [] };
  if (!dir) return out;

  if (!fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) {
    throw userError(`--faces is not a directory: ${dir}`);
  }

  const entries = fs.readdirSync(dir)
      .filter((f) => FACE_EXT.has(path.extname(f).toLowerCase()))
      .sort();
  out.files = entries.length;

  const people = S.staff.concat(S.players);
  const bySlug = new Map(people.map((p) => [p.slug, p]));
  const taken = new Set();
  const leftovers = [];

  // Pass 1 — exact slug match.
  entries.forEach((file) => {
    const slug = path.basename(file, path.extname(file)).toLowerCase();
    const person = bySlug.get(slug);
    if (person && !taken.has(person)) { taken.add(person); pair(person, file); }
    else leftovers.push(file);
  });
  // Pass 2 — whatever is left, alphabetically, to whoever is still bare.
  // Players before staff: a folder of squad faces usually holds exactly as
  // many images as there are players, and filling staff first would leave
  // two of them on initials while the coach and physio got portraits.
  const bare = S.players.filter((p) => !taken.has(p))
      .concat(S.staff.filter((p) => !taken.has(p)));
  leftovers.forEach((file, i) => { if (bare[i]) pair(bare[i], file); });

  function pair(person, file) {
    const full = path.join(dir, file);
    const size = fs.statSync(full).size;
    if (size === 0 || size > MAX_FACE_BYTES) {
      out.skipped.push(`${file} (${(size / 1048576).toFixed(1)} MB)`);
      return;
    }
    const ext = path.extname(file).toLowerCase();
    const objectPath = `profilePics/${person.uid}${ext}`;
    const token = crypto.randomUUID();
    person.profilePic = "https://firebasestorage.googleapis.com/v0/b/" +
      `${STORAGE_BUCKET}/o/${encodeURIComponent(objectPath)}?alt=media&token=${token}`;
    out.uploads.push({ file: full, objectPath, token, ext, size, uid: person.uid });
    out.matched++;
  }

  return out;
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

  if (S.faces && S.faces.dir) {
    const people = S.staff.concat(S.players);
    const withPic = people.filter((p) => p.profilePic);
    const paths = new Set(S.faces.uploads.map((u) => u.objectPath));
    // One object per person: two people sharing a path would silently
    // overwrite each other on upload and leave one showing the other's face.
    (paths.size === S.faces.uploads.length && withPic.length === S.faces.matched) ?
      ok(`${S.faces.matched} profile pictures, one distinct object each`) :
      bad("profile picture assignment is not one-to-one");
  }

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
    profilePic: s.profilePic || "", dob: "", profileSetupDone: true,
    roles: s.roles, category: "", team: "",
    staffCategories: [S.cat], isAdmin: false, isTeamLead: !!s.isLead,
    teamId: S.clubId, fitnessStatus: "fit", injuryNote: "",
  })).concat(S.players.map((p) => ({
    id: p.uid, name: p.name, email: p.email, position: p.position,
    playerNumber: p.playerNumber, profilePic: p.profilePic || "", dob: p.dob,
    profileSetupDone: true, roles: ["player"], category: S.cat,
    team: S.letter, staffCategories: [], isAdmin: false,
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
  log(`${SEP}category        ${S.cat} / team ${S.letter}`);
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
  if (S.faces && S.faces.dir) {
    log(`${SEP}profile pics    ${S.faces.matched}/${S.players.length + S.staff.length}` +
      ` matched from ${S.faces.files} files in ${S.faces.dir}`);
    S.faces.skipped.forEach((s) => log(`${SEP}${SEP}skipped ${s}`));
  } else {
    log(`${SEP}profile pics    none (pass --faces <dir> to add them)`);
  }
  const total = docs.length + S.trainingAvail.length + S.matchAvail.length +
    S.rpe.length + S.players.length + S.staff.length + 4;
  log(`${SEP}${"".padEnd(16)}${"─".repeat(20)}`);
  log(`${SEP}total writes    ~${total}`);
}

// ============================================================
// Firebase — only reached with --apply / --verify / --purge
// ============================================================
const STORAGE_BUCKET = "esquerrapp.firebasestorage.app";   // js/firebase-config.js

let admin; let db; let auth; let FieldValue;
function initFirebase() {
  admin = require("firebase-admin");
  if (!admin.apps.length) {
    // storageBucket is required for admin.storage().bucket() to resolve —
    // without it profile-picture uploads throw rather than defaulting.
    admin.initializeApp({ projectId: "esquerrapp", storageBucket: STORAGE_BUCKET });
  }
  db = admin.firestore();
  auth = admin.auth();
  ({ FieldValue } = require("firebase-admin/firestore"));
}

/**
 * Prove the credentials work BEFORE the first write.
 *
 * Without this the script announces "Writing", creates the club document,
 * and only then discovers it cannot authenticate — leaving a half-built
 * club behind. One cheap read up front turns that into a clean refusal.
 */
/** A problem the operator can fix — printed as advice, not as a stack. */
function userError(msg) {
  const e = new Error(msg);
  e.userError = true;
  return e;
}

async function preflight() {
  const fs = require("fs");
  const p = process.env.GOOGLE_APPLICATION_CREDENTIALS;
  if (p && !fs.existsSync(p)) {
    throw userError(
        "GOOGLE_APPLICATION_CREDENTIALS points at a file that does not exist:\n" +
      `      ${p}\n` +
      "    If that looks like /tmp/tmp.XXXX, it is a placeholder, not a path.\n" +
      "    Set it up with:\n" +
      "      gcloud auth application-default login\n" +
      "      export GOOGLE_APPLICATION_CREDENTIALS=\"$(gcloud info " +
      "--format='value(config.paths.global_config_dir)')/application_default_credentials.json\"");
  }
  try {
    await db.collection("clubs").limit(1).get();
  } catch (e) {
    throw userError(
        `cannot reach Firestore as an authenticated client: ${e.message}\n` +
      "    Application Default Credentials are missing or stale. Run:\n" +
      "      gcloud auth application-default login\n" +
      "      export GOOGLE_APPLICATION_CREDENTIALS=\"$(gcloud info " +
      "--format='value(config.paths.global_config_dir)')/application_default_credentials.json\"\n" +
      "    The export lives in ONE tab only — a new tab needs it again.");
  }
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
  step("Checking credentials");
  await preflight();
  ok("authenticated — Firestore is reachable");

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

  // trainingDates/matchDates are deliberately NOT reset here. They are
  // written at the end from the calendar we just generated — see below.
  await db.collection("teams").doc(S.clubId).set({
    name: OPTS.name,
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

  // Profile pictures BEFORE the user docs: the docs carry the download URLs,
  // so uploading after would publish links to objects that do not exist yet.
  if (S.faces && S.faces.uploads.length) {
    step("Profile pictures");
    const fs = require("fs");
    const bucket = admin.storage().bucket();
    const TYPES = { ".jpg": "image/jpeg", ".jpeg": "image/jpeg",
      ".png": "image/png", ".webp": "image/webp" };
    for (const u of S.faces.uploads) {
      await bucket.file(u.objectPath).save(fs.readFileSync(u.file), {
        contentType: TYPES[u.ext] || "image/jpeg",
        // The token IS the download URL's credential — the same one already
        // written into profilePic, so the two must agree exactly.
        metadata: { metadata: { firebaseStorageDownloadTokens: u.token } },
      });
    }
    ok(`uploaded ${S.faces.uploads.length} images to profilePics/`);
  }

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
        // Must match the fa_users entry: the roster reads the shard while the
        // profile screen reads this doc, so setting one alone half-applies it.
        profilePic: person.profilePic || "",
        dob: isPlayer ? person.dob : "",
        profileSetupDone: true,
        teamId: S.clubId,
        isTeamLead: !!person.isLead,
        roles: isPlayer ? ["player"] : person.roles,
        category: isPlayer ? S.cat : "",
        team: isPlayer ? S.letter : "",
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

  /* Schedule dates, written directly rather than waited for.
     The updateTeamDates trigger maintains these, but it fires once per
     shard and finishes whenever it finishes — a --verify run seconds later
     caught trainingDates populated and matchDates still empty, which looks
     exactly like a broken trigger and is not one. We generated the calendar,
     so we know the answer: write it. The trigger's own write lands the same
     values afterwards and is a no-op. */
  step("Schedule dates");
  const uniqDates = (list) => [...new Set(list.map((x) => x.date).filter(Boolean))];
  await teamRef.set({
    trainingDates: uniqDates(S.trainings),
    matchDates: uniqDates(S.matches),
  }, { merge: true });
  ok(`trainingDates ${uniqDates(S.trainings).length}, matchDates ${uniqDates(S.matches).length}`);

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
  await preflight();
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

  // The schedulers query these with array-contains, so an empty one means
  // that kind of reminder goes quiet for the whole club.
  const team = await db.collection("teams").doc(clubId).get();
  const td = (team.data() || {}).trainingDates || [];
  const md = (team.data() || {}).matchDates || [];
  if (td.length && md.length) {
    ok(`trainingDates ${td.length}, matchDates ${md.length}`);
  } else {
    bad(`trainingDates ${td.length}, matchDates ${md.length} — one is empty. ` +
      "--apply writes these directly; if you are verifying a club seeded " +
      "before that, re-run --apply, or node functions/backfill-team-dates.js");
  }

  for (const coll of ["trainingAvail", "matchAvail", "rpe"]) {
    const snap = await db.collection("teams").doc(clubId).collection(coll).get();
    ok(`${coll}: ${snap.size} records`);
  }

  const users = await db.collection("users").where("teamId", "==", clubId).get();
  const unstamped = users.docs.filter((d) => !d.data().demoSeed).length;
  unstamped ? bad(`${unstamped} of ${users.size} users are NOT stamped demoSeed`) :
    ok(`${users.size} users, all stamped demoSeed`);

  // A profilePic URL pointing at a missing object renders as a broken image,
  // which no amount of Firestore checking would catch.
  const withPic = users.docs.filter((d) => (d.data().profilePic || "").startsWith("http"));
  if (!withPic.length) {
    ok("no profile pictures set (run with --faces to add them)");
  } else {
    const bucket = admin.storage().bucket();
    let missing = 0;
    for (const d of withPic) {
      const [found] = await bucket.getFiles({ prefix: `profilePics/${d.id}.` });
      if (!found.length) missing++;
    }
    missing ? bad(`${missing} of ${withPic.length} profilePic URLs point at a missing object`) :
      ok(`${withPic.length} profile pictures, every URL backed by a real object`);

    // The roster reads fa_users, the profile screen reads users/ — a mismatch
    // shows a face on one screen and initials on the other.
    const byId = new Map(faUsers.map((u) => [String(u.id), u.profilePic || ""]));
    const drift = withPic.filter((d) => byId.get(d.id) !== d.data().profilePic).length;
    drift ? bad(`${drift} users' profilePic disagrees between users/ and fa_users`) :
      ok("profilePic agrees between users/ and fa_users");
  }
}

// ============================================================
// Purge
// ============================================================
async function purge(clubId) {
  initFirebase();
  await preflight();
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

  // Storage objects are NOT reachable from Firestore, so a purge that only
  // clears documents strands every uploaded picture in the bucket forever.
  const bucket = admin.storage().bucket();
  const blobs = [];
  for (const d of demoUsers) {
    const [found] = await bucket.getFiles({ prefix: `profilePics/${d.id}.` });
    found.forEach((f) => blobs.push(f));
  }
  log(`${SEP}profilePics: ${blobs.length}`);

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

  for (const b of blobs) {
    try { await b.delete(); } catch (e) { /* already gone */ }
  }
  if (blobs.length) ok(`deleted ${blobs.length} profile pictures`);

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
// --add-team — a second squad in a club that already has data
// ============================================================
/*
  apply() builds a club from NOTHING. Pointed at a club that already has
  data it would destroy it three ways, and all three are silent:

    1. It rewrites the whole `categories` map — all six keys, every run.
       {merge:true} merges leaf paths and every leaf is present, so a
       category configured through the UI is reset.
    2. buildShards() assembles fa_users/fa_matches/... from only THIS run's
       people and commitAll writes them with a bare set(). fa_users is
       routed by category with no team letter (js/shard.js), so amateur-A
       and amateur-B share ONE document — seeding B would erase A.
    3. uids and emails are derived from the club id alone, so a second run
       reuses the first team's exact accounts.

  This mode fixes all three: dotted field paths, read-modify-write on every
  shard, and per-team namespacing. It is also the only mode that refuses to
  run against a club not stamped demoSeed.
*/

/** `amateur-B` → {key, cat, letter}. Anything else is a typo, not a team. */
function parseTeamSpec(s) {
  const m = /^([a-z]+)-([A-Z])$/.exec(String(s).trim());
  if (!m) {
    throw userError(`--add-team wants {category}-{LETTER}, e.g. amateur-B — got "${s}"`);
  }
  const [, cat, letter] = m;
  if (Shard.ORDER.indexOf(cat) === -1) {
    throw userError(`unknown category "${cat}". One of: ${Shard.ORDER.join(", ")}`);
  }
  return { key: `${cat}-${letter}`, cat, letter };
}

/* A stable per-team salt. Derived from the KEY, not from the position in
   this run's argument list: adding amateur-C in a later run must not
   produce the offset amateur-B already used. */
function teamSalt(key) {
  let h = 7;
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) >>> 0;
  return (h % 900) + 1;   // 1..900, never 0 — that is the first team's own
}

/**
 * Merge a freshly built shard payload INTO what Firestore already holds.
 *
 * Arrays merge by the route's id field, maps by key, and the new entries
 * win a tie. Everything already there is carried over untouched — this is
 * the whole reason the mode exists rather than reusing apply()'s set().
 */
function mergeShardData(key, existing, fresh) {
  const route = Shard.ROUTES[key];
  // MERGE-shape docs are plain top-level fields with no `v`. Firestore's own
  // {merge:true} already does the right thing; there is nothing to parse.
  if (typeof fresh.v !== "string") return fresh;
  const empty = () => (route.shape === "array" ? [] : {});
  /* A `v` that will not parse is NOT treated as an empty shard. Falling back
     to [] here would quietly drop every row already in the document — the
     exact data loss this whole mode exists to prevent — and the run would
     look like it succeeded. Stop instead and let a human look. */
  const parse = (d, what) => {
    if (!d || typeof d.v !== "string") return empty();
    try {
      return JSON.parse(d.v);
    } catch (e) {
      throw userError(
          `${what} holds unparseable JSON — refusing to merge over it.\n` +
          "    Merging would discard whatever is in there. Inspect the\n" +
          "    document by hand before re-running.");
    }
  };
  const was = parse(existing, `the stored ${key} shard`);
  const now = parse(fresh, `the generated ${key} shard`);
  let merged;
  if (route.shape === "array") {
    const idOf = (e) => String(e && e[route.id || "id"]);
    const byId = new Map((Array.isArray(was) ? was : []).map((e) => [idOf(e), e]));
    (Array.isArray(now) ? now : []).forEach((e) => byId.set(idOf(e), e));
    merged = [...byId.values()];
  } else {
    merged = Object.assign({}, was, now);
  }
  return { v: JSON.stringify(merged), category: fresh.category };
}

async function addTeams(clubId, rawSpecs) {
  const specs = rawSpecs.map(parseTeamSpec);
  const seen = new Set();
  specs.forEach((s) => {
    if (seen.has(s.key)) throw userError(`--add-team ${s.key} given twice`);
    seen.add(s.key);
  });

  step("Checking credentials");
  initFirebase();
  await preflight();
  ok("authenticated — Firestore is reachable");

  // ── Guard rails ──
  step("Club");
  if (PROTECTED_CLUBS.has(clubId)) {
    throw userError(`${clubId} is a PROTECTED club. --add-team refuses it.`);
  }
  const clubRef = db.collection("clubs").doc(clubId);
  const clubSnap = await clubRef.get();
  if (!clubSnap.exists) throw userError(`clubs/${clubId} does not exist.`);
  const club = clubSnap.data() || {};
  if (club.demoSeed !== true) {
    throw userError(
        `clubs/${clubId} is not stamped demoSeed:true — refusing.\n` +
        "    --add-team writes fake players and only ever runs on a demo club.");
  }
  ok(`${club.name || "(unnamed)"} — demoSeed, not protected`);

  const cats = club.categories || {};
  specs.forEach((s) => {
    const c = cats[s.cat];
    if (!c || c.enabled !== true) {
      throw userError(
          `category "${s.cat}" is not enabled on this club.\n` +
          "    Enable it in the app (Configuració de categories) first — the\n" +
          "    lead's own team quota governs that, and this script must not\n" +
          "    hand a club a team it has not paid for.");
    }
    if (!(c.letters || []).includes(s.letter)) {
      throw userError(
          `team ${s.key} is not configured — ${s.cat} has ` +
          `[${(c.letters || []).join(", ")}].\n` +
          "    Add the letter in the app first, for the same reason.");
    }
    ok(`${s.key} is configured`);
  });

  // ── What the club already holds ──
  step("Reading what is already there");
  const dataCol = db.collection("teams").doc(clubId).collection("data");
  const readShard = async (key, cat) => {
    const snap = await dataCol.doc(Shard.docId(key, cat)).get();
    return snap.exists ? (snap.data() || null) : null;
  };
  const blobOf = (d) => {
    if (!d || typeof d.v !== "string") return [];
    try { const p = JSON.parse(d.v); return Array.isArray(p) ? p : []; } catch (e) { return []; }
  };

  // Every enabled category, not just the ones being added: names are deduped
  // club-wide so two squads never field the same man.
  const enabled = Shard.ORDER.filter((k) => cats[k] && cats[k].enabled);
  const usersByCat = {};
  for (const cat of enabled) usersByCat[cat] = blobOf(await readShard("fa_users", cat));

  const usedNames = new Set();
  let known = 0;
  Object.values(usersByCat).forEach((rows) => rows.forEach((u) => {
    if (u && u.name) { usedNames.add(u.name); known++; }
  }));
  ok(`${known} existing people, ${usedNames.size} names reserved`);

  specs.forEach((s) => {
    const taken = (usersByCat[s.cat] || [])
        .filter((u) => u && (u.team || "") === s.letter && (u.roles || []).includes("player"));
    if (taken.length) {
      throw userError(
          `${s.key} already has ${taken.length} players — refusing.\n` +
          "    Re-running would double the squad. Purge the club and start\n" +
          "    again if that is really what you want.");
    }
  });

  // The category's real calendar, when it has one. See buildSeason(opts).
  const trainingsByCat = {};
  for (const cat of new Set(specs.map((s) => s.cat))) {
    const existing = blobOf(await readShard("fa_training", cat));
    if (existing.length) {
      trainingsByCat[cat] = existing;
      ok(`${cat}: reusing ${existing.length} existing sessions (shared calendar)`);
    } else {
      ok(`${cat}: no sessions yet — a full calendar will be generated`);
    }
  }

  // ── Generate ──
  const seasons = specs.map((spec) => {
    OPTS.category = spec.cat;
    OPTS.letter = spec.letter;
    const salt = teamSalt(spec.key);
    const S = buildSeason(`dm_${clubId.slice(0, 10)}_${spec.cat}${spec.letter}_`, {
      seed: 20260803 + salt,
      emailPrefix: `${spec.cat}${spec.letter.toLowerCase()}-`,
      staffUidPrefix: `dm_${clubId.slice(0, 10)}_`,
      matchIdOffset: salt,
      trainings: trainingsByCat[spec.cat],
      usedNames,
    });
    S.clubId = clubId;
    S.spec = spec;
    // Whether this team's sessions came from Firestore. If they did, its
    // fa_training doc must NOT be written back — see below.
    S.reusedTrainings = !!trainingsByCat[spec.cat];
    // Staff already exist club-wide and the roster trigger maintains their
    // categories. Emptying the list here keeps them out of fa_users, out of
    // the account loop and out of the face assignment.
    S.staffAccounts = S.staff;
    S.staff = [];
    return S;
  });

  // Faces ONCE, across every new squad: one folder, one alphabetical pass,
  // no chance of the same file being handed to two teams.
  const allPlayers = seasons.reduce((a, S) => a.concat(S.players), []);
  const faces = assignFaces({ staff: [], players: allPlayers }, FACES_DIR);

  const docsByTeam = seasons.map((S) => {
    OPTS.category = S.spec.cat;
    OPTS.letter = S.spec.letter;
    let docs = buildShards(S);
    if (S.reusedTrainings) {
      docs = docs.filter((d) => d.key !== "fa_training");
    }
    return docs;
  });

  // ── Report + self-check ──
  seasons.forEach((S, i) => {
    step(`Team ${S.spec.key}`);
    report(S, docsByTeam[i]);
  });
  let clean = true;
  seasons.forEach((S) => { if (!selfCheck(S)) clean = false; });

  step("Faces");
  log(`${SEP}${faces.files} files, ${faces.matched} matched to ${allPlayers.length} players`);
  faces.skipped.forEach((f) => log(`${SEP}${SEP}skipped ${f}`));

  if (!clean) {
    log(`\n${failures} consistency check(s) FAILED — refusing to write.`);
    process.exit(1);
  }

  // ── Merge against Firestore ──
  step("Merging into existing shards");
  const merged = [];
  const freshById = new Map();
  docsByTeam.flat().forEach((d) => {
    const prev = freshById.get(d.id);
    // Two teams in one category produce the same doc id; fold them together
    // before touching Firestore so each document is read and written once.
    freshById.set(d.id, prev ?
      { ...d, data: mergeShardData(d.key, prev.data, d.data) } : d);
  });
  for (const d of freshById.values()) {
    const existing = await dataCol.doc(d.id).get();
    const was = existing.exists ? existing.data() : null;
    const data = mergeShardData(d.key, was, d.data);
    const grew = was ? "merged into existing" : "new";
    merged.push({ id: d.id, key: d.key, data });
    log(`${SEP}${d.id.padEnd(34)} ${grew}`);
  }

  if (!APPLY) {
    step("DRY RUN");
    log(`${SEP}Nothing was written. Reads only.`);
    log(`${SEP}Re-run with --apply to add ${specs.map((s) => s.key).join(" and ")}.`);
    return;
  }

  await applyTeams(clubId, clubRef, seasons, merged, faces);
}

async function applyTeams(clubId, clubRef, seasons, merged, faces) {
  const teamRef = db.collection("teams").doc(clubId);

  /* 1. Schedules, by DOTTED PATH. Never the whole map: writing `schedules`
        or `categories` wholesale is what would undo the club's own setup. */
  step("Club");
  const sched = {};
  seasons.forEach((S) => {
    sched[`schedules.${S.spec.key}`] = {
      training: [
        { day: "tue", time: "20:00", location: LOCATION, link: MAP_LINK },
        { day: "thu", time: "20:00", location: LOCATION, link: MAP_LINK },
      ],
      homeGame: [{ day: "sat", time: "18:00", location: LOCATION, link: MAP_LINK }],
    };
  });
  await clubRef.update(sched);
  ok(`schedules for ${seasons.map((S) => S.spec.key).join(", ")}`);

  /* 2. Rosters BEFORE accounts, exactly as apply() does. The new players do
        not exist yet so onRosterWritten skips them, and the explicit claims
        below are what grants them access. The COACH does exist, so this is
        also what gives him the new category — claimsFor() reads the club's
        enabled categories, which is why the category must already be on. */
  step("Rosters");
  for (const S of seasons) {
    await clubRef.collection("rosters").doc(S.spec.key).set({
      staffEmails: S.staffAccounts.map((s) => s.email.toLowerCase()),
      playerEmails: S.players.map((p) => p.email.toLowerCase()),
      updatedAt: FieldValue.serverTimestamp(),
    });
    ok(`rosters/${S.spec.key} — ${S.players.length} players`);
  }

  // 3. Accounts. Players only: staff are club-wide and already exist.
  step("Accounts");
  let created = 0; let updated = 0;
  for (const S of seasons) {
    for (const p of S.players) {
      const res = await ensureAccount(p.uid, p.email, p.name);
      res === "created" ? created++ : updated++;
      await auth.setCustomUserClaims(p.uid, {
        teamId: clubId, role: "player", cats: [S.cat],
      });
    }
  }
  ok(`Auth: ${created} created, ${updated} updated (password: ${OPTS.password})`);

  // Pictures before the user docs, which carry the download URLs.
  if (faces.uploads.length) {
    step("Profile pictures");
    const fs = require("fs");
    const bucket = admin.storage().bucket();
    const TYPES = { ".jpg": "image/jpeg", ".jpeg": "image/jpeg",
      ".png": "image/png", ".webp": "image/webp" };
    for (const u of faces.uploads) {
      await bucket.file(u.objectPath).save(fs.readFileSync(u.file), {
        contentType: TYPES[u.ext] || "image/jpeg",
        metadata: { metadata: { firebaseStorageDownloadTokens: u.token } },
      });
    }
    ok(`uploaded ${faces.uploads.length} images to profilePics/`);
  }

  const userOps = [];
  seasons.forEach((S) => S.players.forEach((p) => userOps.push({
    ref: db.collection("users").doc(p.uid),
    data: {
      id: p.uid, name: p.name, email: p.email.toLowerCase(),
      position: p.position, playerNumber: p.playerNumber,
      profilePic: p.profilePic || "", dob: p.dob,
      profileSetupDone: true, teamId: clubId, isTeamLead: false,
      roles: ["player"], category: S.cat, team: S.spec.letter,
      staffCategories: [], fitnessStatus: p.fitnessStatus,
      injuryNote: p.injuryNote, demoSeed: true,
      claimsUpdatedAt: FieldValue.serverTimestamp(),
    },
    opts: { merge: true },
  })));
  await commitAll(userOps, "users");

  // 4. The merged shards — every one already folded over what was there.
  step("Data shards");
  const dataCol = teamRef.collection("data");
  await commitAll(merged.map((d) => ({ ref: dataCol.doc(d.id), data: d.data })), "data");

  // 5. Player-submitted records. Keyed per player, so additive by nature.
  step("Records");
  const stamp = FieldValue.serverTimestamp();
  const all = (f) => seasons.reduce((a, S) => a.concat(f(S)), []);
  await commitAll(all((S) => S.trainingAvail).map((a) => ({
    ref: teamRef.collection("trainingAvail").doc(`${a.uid}_${a.date}`),
    data: { uid: a.uid, date: a.date, value: a.value, updatedAt: stamp, source: "seed" },
  })), "trainingAvail");
  await commitAll(all((S) => S.matchAvail).map((a) => ({
    ref: teamRef.collection("matchAvail").doc(`${a.uid}_${a.matchId}`),
    data: { uid: a.uid, matchId: a.matchId, value: a.value, updatedAt: stamp, source: "seed" },
  })), "matchAvail");
  await commitAll(all((S) => S.rpe).map((r) => ({
    ref: teamRef.collection("rpe").doc(r.key),
    data: { uid: r.uid, rpe: r.rpe, minutes: r.minutes, ua: r.ua, tag: r.tag,
      date: r.date, updatedAt: stamp, source: "seed" },
  })), "rpe");

  /* 6. Schedule dates — a UNION, not a replace. apply() can overwrite
        because it owns the whole calendar; here the club already has one. */
  step("Schedule dates");
  const teamSnap = await teamRef.get();
  const prev = teamSnap.exists ? (teamSnap.data() || {}) : {};
  const union = (was, list) => [...new Set(
      (Array.isArray(was) ? was : []).concat(list.map((x) => x.date).filter(Boolean)))].sort();
  const trainingDates = union(prev.trainingDates, all((S) => S.trainings));
  const matchDates = union(prev.matchDates, all((S) => S.matches));
  await teamRef.set({ trainingDates, matchDates }, { merge: true });
  ok(`trainingDates ${trainingDates.length}, matchDates ${matchDates.length}`);

  step("Done");
  seasons.forEach((S) => {
    log(`${SEP}${S.spec.key.padEnd(12)} ${S.players.length} players — ` +
        `${S.players[0].email} / ${OPTS.password}`);
  });
  log(`\n${SEP}Verify with: node functions/seed-demo-club.js --verify --club ${clubId}`);
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
  if (ADD_TEAMS.length) {
    if (!CLUB_ID) {
      log("\n--add-team needs --club <clubId>.");
      log("It adds squads to an EXISTING demo club; it never creates one.");
      process.exit(1);
    }
    return addTeams(CLUB_ID, ADD_TEAMS);
  }
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
  // Before buildShards: fa_users copies profilePic off these objects.
  S.faces = assignFaces(S, FACES_DIR);

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
  // A misconfigured shell is not a bug report — print the fix, not a stack.
  console.error(e && e.userError ? `\nFAILED: ${e.message}` :
    `\nFAILED: ${e && e.stack || e}`);
  process.exit(1);
});
