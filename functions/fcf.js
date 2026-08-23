/* =========================================================
   Reading fcf.cat's competition API — the server's half
   =========================================================

   Everything here is PURE: no firebase-admin, no network, no clock beyond
   what a caller passes in. That is deliberate — test/fcf.test.js and
   test/fcf-fixtures.test.js require this file directly, with no emulator, and
   the merge rule in mergeFcfFixtures() is the one piece of v118 that can
   silently destroy a coach's work if it is wrong.

   `fcfGrupIdOf` and `normTeamNameOf` are DUPLICATES of the versions in
   js/utils.js, and have to be: the functions deploy uploads functions/ and
   nothing else, so js/ does not exist at runtime here. A require would
   resolve on the dev machine and fail in production, which is the worst of
   both. test/fcf.test.js runs one input table through BOTH copies and
   asserts they agree — agreement is the property that matters, and two
   suites testing each side in isolation would happily drift past each other.
   ========================================================= */

/**
 * The `grupId` of a pasted FCF link, as a digit string, or "".
 * Accepts the whole address bar, or the bare id.
 */
function fcfGrupIdOf(url) {
  const s = String(url === undefined || url === null ? "" : url).trim();
  if (/^\d{1,15}$/.test(s)) return s;
  const m = /[?&]grupId=(\d{1,15})\b/.exec(s);
  return m ? m[1] : "";
}

// Mirrors TEAM_NAME_NOISE / normTeamName in js/utils.js. See the note above.
const TEAM_NAME_NOISE =
  /\b(c\s*f|f\s*c|u\s*e|c\s*e|a\s*e|c\s*d|u\s*d|s\s*d|club|futbol|football|esportiu|esportiva|unio|union|associacio|asociacion|societat|sociedad|deportivo|deportiva)\b/g;
const COMBINING_MARKS = new RegExp(
    "[" + String.fromCharCode(0x300) + "-" + String.fromCharCode(0x36f) + "]", "g");

/** The identity-bearing part of a club name. See js/utils.js normTeamName. */
function normTeamNameOf(s) {
  const raw = String(s || "").toLowerCase()
      .normalize("NFD").replace(COMBINING_MARKS, "");
  const bare = raw.replace(/[^a-z0-9]/g, "");
  const stripped = raw
      .replace(/[.\-_]/g, " ")
      .replace(TEAM_NAME_NOISE, " ")
      .replace(/[^a-z0-9]/g, "");
  return stripped || bare;
}

/* The federation's leading article, which clubs drop from their own name:
   "L'ESQUERRA DE L'EIXAMPLE, F.C." on fcf.cat is "Esquerra de l'Eixample
   F.C." in its own app. Mirrors LEADING_ARTICLE / sameClubName in
   js/utils.js — and, like them, is DELIBERATELY not folded into
   normTeamNameOf: that would merge "La Jonquera" with a club called
   "Jonquera" everywhere, to fix a mismatch that only occurs here.

   Applied to the RAW name, where the separator still exists — stripping "l"
   off the normalised "lleida" would leave "leida". */
const LEADING_ARTICLE = /^\s*(l\s*['’]\s*|el\s+|la\s+|els\s+|les\s+)/;

/** Same club, allowing for the article. Only for identifying OURSELVES. */
function sameClubNameOf(a, b) {
  const x = normTeamNameOf(a);
  const y = normTeamNameOf(b);
  if (!x || !y) return false;
  if (x === y) return true;
  const bare = (s) => normTeamNameOf(
      String(s || "").toLowerCase().replace(LEADING_ARTICLE, ""));
  const bx = bare(a);
  const by = bare(b);
  return !!bx && bx === by;
}

const FCF_BADGE_BASE = "https://files.fcf.cat/escudos/clubes/escudos/";

/** An absolute crest URL, or "" — FCF sends null for clubs with no crest. */
function fcfBadgeUrl(logo) {
  const s = String(logo || "");
  return (!s || s.indexOf("escutbase") !== -1) ? "" : FCF_BADGE_BASE + s;
}

/**
 * A Google Maps link for a venue, or "".
 *
 * The `?api=1&query=lat,lng` form, which is what fcf.cat's own fixture list
 * links to. Coordinates are strings in the payload and "0" is FCF's way of
 * saying "unknown" — a link to 0,0 is the Gulf of Guinea, so it is refused
 * rather than shipped as a plausible-looking wrong answer.
 */
function fcfMapsLink(lat, lng) {
  const a = parseFloat(lat);
  const b = parseFloat(lng);
  if (!isFinite(a) || !isFinite(b) || (a === 0 && b === 0)) return "";
  return "https://www.google.com/maps/search/?api=1&query=" + a + "," + b;
}

/**
 * The fixtures of ONE team, from `/api/competition/partidos?grupId=`.
 *
 * The payload is an object keyed by jornada, each value an array of every
 * fixture in that round; this flattens it and keeps only the rows `ourTeamId`
 * appears in.
 *
 * Rows come back NEUTRAL — `isHome` plus the opponent, never `home`/`away`
 * name strings. That is load-bearing: `isOurTeam()` in js/app.js compares the
 * stored name to the club's configured name with `===`, and FCF writes
 * "L'ESQUERRA DE L'EIXAMPLE, F.C." where the club calls itself "Esquerra de
 * l'Eixample F.C.". Storing FCF's spelling on our own side would make every
 * imported fixture read as though we were the other team.
 */
function parseFcfFixtures(json, ourTeamId) {
  const us = String(ourTeamId || "");
  if (!us || !json || typeof json !== "object") return [];
  const out = [];
  Object.keys(json).forEach((jornada) => {
    const list = Array.isArray(json[jornada]) ? json[jornada] : [];
    list.forEach((m) => {
      const homeId = String(m.CODEQUIPO_CASA || "");
      const awayId = String(m.CODEQUIPO_FUERA || "");
      if (homeId !== us && awayId !== us) return;
      const isHome = homeId === us;
      // "2026-09-19 18:00:00", already Europe/Madrid wall-clock — the same
      // shape the app stores, so it splits rather than parses. Going through
      // Date() here would drag the SERVER's timezone into a value that is
      // only ever displayed as local time.
      const stamp = String(m.COMIENZO1 || "");
      out.push({
        actaId: String(m.CODACTA || ""),
        jornada: parseInt(m.JORNADA, 10) || 0,
        isHome: isHome,
        opponentName: String((isHome ? m.NOMBRE_FUERA : m.NOMBRE_CASA) || "").trim(),
        opponentTeamId: isHome ? awayId : homeId,
        opponentBadge: fcfBadgeUrl(isHome ? m.ESCUDO_FUERA : m.ESCUDO_CASA),
        date: stamp.slice(0, 10),
        time: stamp.slice(11, 16),
        location: String(m.CAMPO || "").trim(),
        mapLink: fcfMapsLink(m.LATITUD, m.LONGITUD),
      });
    });
  });
  out.sort((a, b) => String(a.date).localeCompare(String(b.date)));
  return out;
}

/**
 * Every team's PRINCIPAL kit, from `/api/competition/equipacions?grupId=`,
 * as `{[teamId]: {shirt1, shirt2, shorts1, socks1, socks2, pattern}}`.
 *
 * The endpoint returns a cross join — 542 rows for a 16-team group, the same
 * two kits repeated ~20 times each — so the first row per team wins and the
 * rest are dropped.
 *
 * `PRINCIPAL === "1"` is the home kit. The away kit is deliberately NOT
 * carried: what a delegate needs is what the rival will most likely wear, and
 * two kits per fixture is a picker nobody asked for.
 *
 * Colours are stored RAW, exactly as FCF sends them. Turning `pattern` into
 * the app's fill encoding needs encodeFill(), which lives in js/utils.js and
 * cannot be reached from here — so that mapping happens client-side, next to
 * the renderer that consumes it, rather than becoming a third duplicated
 * function.
 */
function parseFcfKits(json) {
  const out = {};
  (Array.isArray(json) ? json : []).forEach((k) => {
    if (String(k.PRINCIPAL) !== "1") return;
    const id = String(k.CODEQUIPO || "");
    if (!id || out[id]) return;
    out[id] = {
      shirt1: String(k.COLOR_CAMISETA1 || ""),
      shirt2: String(k.COLOR_CAMISETA2 || ""),
      shorts1: String(k.COLOR_PANTALON1 || ""),
      socks1: String(k.COLOR_MEDIAS1 || ""),
      socks2: String(k.COLOR_MEDIAS2 || ""),
      pattern: String(k.CLASE_CSS_CAMISETA || ""),
    };
  });
  return out;
}

/* The fields the federation owns while the coach has not touched them.
   `score` is NOT here and never will be: the app computes it from the events
   a coach enters, and two sources of truth for a scoreline is a fight. */
const FCF_OWNED = ["date", "time", "location", "mapLink"];

/** Days apart, or Infinity if either date is unusable. */
function _dayGap(a, b) {
  const x = Date.parse(String(a) + "T12:00:00Z");
  const y = Date.parse(String(b) + "T12:00:00Z");
  if (!isFinite(x) || !isFinite(y)) return Infinity;
  return Math.abs(x - y) / 86400000;
}

/**
 * Fold a squad's FCF fixtures into the matches the app already holds.
 *
 * `existing` is the whole category shard; only rows whose `team` is `letter`
 * are considered, because amateur-A and amateur-B are different competitions
 * sharing one document.
 *
 * Returns `{matches, summary}` — a NEW array, with untouched rows passed
 * through by reference.
 *
 * ── The merge rule ──────────────────────────────────────────────────────
 * A field belongs to the federation for as long as it still equals what the
 * last sync wrote (`fcfSnapshot`). The moment a coach edits a kick-off, his
 * value and the snapshot differ, and this stops writing that field — for
 * ever, and only that field. There are no `userEdited` flags to maintain and
 * therefore none to get out of step with reality.
 *
 * The snapshot is refreshed on every sync regardless, so a LATER federation
 * change to a field the coach has claimed does not silently hand it back.
 */
function mergeFcfFixtures(existing, incoming, opts) {
  const o = opts || {};
  const clubName = String(o.clubName || "");
  const category = String(o.category || "");
  const letter = String(o.letter || "");
  const kits = o.kits || {};
  const today = String(o.today || "");
  const rows = Array.isArray(existing) ? existing.slice() : [];
  const summary = {adopted: 0, added: 0, updated: 0, removed: 0};

  const mine = (m) => m && (m.category || "") === category &&
    (m.team || "") === letter;
  const byActa = new Map();
  rows.forEach((m, i) => {
    if (mine(m) && m.fcfActaId) byActa.set(String(m.fcfActaId), i);
  });
  /* Adoption candidates: this squad's rows that the federation does not
     already own. Consumed as they are claimed, so two incoming fixtures can
     never adopt the same local row. */
  const orphans = new Set();
  rows.forEach((m, i) => { if (mine(m) && !m.fcfActaId) orphans.add(i); });

  const seen = new Set();

  (incoming || []).forEach((f) => {
    const acta = String(f.actaId || "");
    if (!acta) return;
    seen.add(acta);
    const kit = kits[String(f.opponentTeamId)] || null;
    const fcfFields = {
      date: f.date, time: f.time, location: f.location, mapLink: f.mapLink,
    };

    let idx = byActa.has(acta) ? byActa.get(acta) : -1;
    let adopting = false;

    if (idx === -1) {
      idx = _findAdoptable(rows, orphans, f, clubName);
      if (idx !== -1) { adopting = true; orphans.delete(idx); summary.adopted++; }
    }

    if (idx === -1) {
      /* A brand-new fixture. The id is the federation's acta number, which
         is stable, globally unique and ~4e6 — three orders of magnitude below
         the Date.now() ids the manual path mints, so the two can never
         collide. Stable ids also make a double import idempotent instead of
         duplicating a season. */
      const m = {
        id: Number(acta),
        home: f.isHome ? clubName : f.opponentName,
        away: f.isHome ? f.opponentName : clubName,
        date: f.date,
        time: f.time || "00:00",
        score: null,
        status: (today && f.date < today) ? "played" : "upcoming",
        location: f.location,
        mapLink: f.mapLink,
        team: letter,
        category: category,
        fcfActaId: acta,
        fcfJornada: f.jornada,
        fcfSnapshot: Object.assign({}, fcfFields),
        opponentTeamId: f.opponentTeamId,
        opponentBadge: f.opponentBadge,
      };
      if (kit) m.opponentKit = kit;
      rows.push(m);
      summary.added++;
      return;
    }

    // ── An existing row: update only what the coach has not claimed ──
    const cur = rows[idx];
    const snap = cur.fcfSnapshot || {};
    const next = Object.assign({}, cur);
    let changed = false;
    FCF_OWNED.forEach((k) => {
      /* ADOPTION needs no special case, and that is worth stating because it
         looks like it should. An adopted row has no snapshot, so `snap[k]` is
         "" and the test below reduces to "is this field empty" — which is
         precisely the rule adoption wants: fill the blanks, never overwrite
         what the coach typed before this feature existed. An explicit
         `adopting ? !cur[k] : …` branch was written first and removed: it was
         a second spelling of the same condition, and the two could drift. */
      const ownedByFcf = (cur[k] || "") === (snap[k] || "");
      if (ownedByFcf && (cur[k] || "") !== (fcfFields[k] || "")) {
        next[k] = fcfFields[k];
        changed = true;
      }
    });
    next.fcfActaId = acta;
    next.fcfJornada = f.jornada;
    next.fcfSnapshot = Object.assign({}, fcfFields);
    next.opponentTeamId = f.opponentTeamId;
    next.opponentBadge = f.opponentBadge;
    if (kit) next.opponentKit = kit;
    /* Back from the dead: a fixture the federation restored after removing
       it. Leaving the flag would keep the row struck through for ever. */
    if (next.fcfRemoved) { delete next.fcfRemoved; changed = true; }
    // The opponent name follows the id, not the other way round: FCF renames
    // clubs mid-season and the acta id is what actually identifies them.
    const oppName = f.opponentName;
    if (f.isHome) { next.home = clubName; next.away = oppName; } else {
      next.home = oppName; next.away = clubName;
    }
    rows[idx] = next;
    if (changed && !adopting) summary.updated++;
  });

  /* Gone from the federation's list — postponed out of the calendar, or the
     squad withdrawn. MARKED, never deleted: call-ups, coach notes,
     availability answers and lineups all hang off this match id, and
     removing the row to match an upstream list takes all of them with it.

     Only when the federation actually answered. An empty `incoming` is an
     outage, not a cancelled season. */
  if ((incoming || []).length) {
    rows.forEach((m, i) => {
      if (!mine(m) || !m.fcfActaId) return;
      if (seen.has(String(m.fcfActaId))) return;
      if (m.fcfRemoved) return;
      rows[i] = Object.assign({}, m, {fcfRemoved: true});
      summary.removed++;
    });
  }

  return {matches: rows, summary};
}

/**
 * The index of a hand-typed row that is plainly this same fixture, or -1.
 *
 * Same rival, same venue side, and within a day of the federation's date —
 * a fixture copied off a printed calendar and then moved by a week is a
 * DIFFERENT question from one that slipped a day, and only the second is
 * safe to claim automatically.
 *
 * A tie is refused outright. A duplicate row is something a coach can see and
 * delete; a wrongly adopted one silently attaches last month's call-up,
 * availability answers and coach notes to the wrong game, and nothing on
 * screen would say so.
 */
function _findAdoptable(rows, orphans, f, clubName) {
  const rival = normTeamNameOf(f.opponentName);
  if (!rival) return -1;
  const hits = [];
  orphans.forEach((i) => {
    const m = rows[i];
    if (!m || !m.date) return;
    const wasHome = m.home === clubName;
    if (wasHome !== !!f.isHome) return;
    const other = wasHome ? m.away : m.home;
    if (normTeamNameOf(other) !== rival) return;
    const gap = _dayGap(m.date, f.date);
    if (gap > 1) return;
    hits.push({i: i, gap: gap});
  });
  if (!hits.length) return -1;
  const exact = hits.filter((h) => h.gap === 0);
  const pool = exact.length ? exact : hits;
  return pool.length === 1 ? pool[0].i : -1;
}

module.exports = {
  fcfGrupIdOf,
  normTeamNameOf,
  sameClubNameOf,
  fcfBadgeUrl,
  fcfMapsLink,
  parseFcfFixtures,
  parseFcfKits,
  mergeFcfFixtures,
  FCF_OWNED,
};
