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
 * Every team's kits, from `/api/competition/equipacions?grupId=`, as
 * `{[teamId]: {home: kit|null, away: kit|null}}` where a kit is
 * `{shirt1, shirt2, shorts1, socks1, socks2, pattern}`.
 *
 * The endpoint returns a cross join — 542 rows for a 16-team group, the same
 * two kits repeated ~20 times each — so the first row per team per
 * `PRINCIPAL` wins and the rest are dropped.
 *
 * `PRINCIPAL === "1"` is the first-choice kit, `"2"` the change strip. BOTH
 * are carried: a delegate picking a strip needs to know what the rival can
 * turn up in, not just what they usually wear, and the away kit is the one
 * that decides a clash.
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
    const slot = String(k.PRINCIPAL) === "1" ? "home" :
      (String(k.PRINCIPAL) === "2" ? "away" : "");
    if (!slot) return;
    const id = String(k.CODEQUIPO || "");
    if (!id) return;
    if (!out[id]) out[id] = {home: null, away: null};
    if (out[id][slot]) return;
    out[id][slot] = {
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

const HTML_ENTITIES = {amp: "&", lt: "<", gt: ">", quot: "\"", apos: "'", nbsp: " "};

/** The handful of entities that actually occur in an acta, plus numerics. */
function decodeHtmlEntities(s) {
  return String(s === undefined || s === null ? "" : s)
      .replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (all, code) => {
        if (code.charAt(0) === "#") {
          const hex = code.charAt(1) === "x" || code.charAt(1) === "X";
          const n = hex ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10);
          return isFinite(n) && n > 0 && n < 0x110000 ? String.fromCodePoint(n) : all;
        }
        const hit = HTML_ENTITIES[code.toLowerCase()];
        return hit === undefined ? all : hit;
      });
}

/**
 * Who refereed a match, from the HTML of `/ca/competicio/acta/{CODACTA}`.
 *
 * Returns `{referees, principal}`. `referees` is in the federation's own
 * order, which is the ROLE order: the referee first, then his assistants.
 * Elit, Primera and Segona always list a trio; Tercera and Quarta list one or
 * three depending on the fixture. `principal` is `referees[0]` — the only one
 * whose record means anything about how a match will be handled, and so the
 * only one the aggregates are keyed on.
 *
 * ── Why HTML and not the API ────────────────────────────────────────────
 * There is no referee anywhere in `/api/competition/`. The name exists only
 * on the acta page, which Next.js renders server-side — so this is scraping,
 * with all that implies, and it is the one part of the FCF integration that a
 * redesign can silently kill. Two things keep that from being invisible:
 * this function returns an EMPTY list rather than throwing (a rebuilt fcf.cat
 * must degrade to "no data", never to a crashed scheduled job), and the
 * caller watches the extraction rate so a run that finds nothing anywhere is
 * reported rather than quietly recorded as "no referees this week".
 *
 * ── What is matched, and why it is narrow ───────────────────────────────
 * The section is `<h3>Àrbitres</h3>` followed by one `<div class="border-b…">`
 * per official. "Àrbitres" also appears in the nav menu and inside the RSC
 * payload, but neither is followed by `</h3>`, so neither can match; the LAST
 * heading is taken anyway, because a decoy that ever did match would be site
 * furniture appearing before the content, not after it.
 *
 * Two filters on the rows themselves:
 *
 *  - a NAME CONTAINS A COMMA. The federation writes every official as
 *    "COGNOMS, NOM". An unassigned match reuses the same markup for the
 *    placeholder "Sense àrbitres assignats", and matching on the placeholder
 *    text would need all three languages and would break the day they reword
 *    it. Checked against 30 actas across all five tiers: 30 extracted, and
 *    the comma dropped nothing that was a real name.
 *  - only rows inside the referee box. The role legend immediately above it
 *    contains "PREPARADOR FÍSIC, MERGE O A.T.S" — comma and all — which is
 *    why the block is bounded at the next `<h3>` rather than scanned loosely.
 */
function parseFcfActa(html) {
  const h = String(html === undefined || html === null ? "" : html);
  const heading = /Àrbitres<\/h3>/g;
  let start = -1;
  let m;
  while ((m = heading.exec(h))) start = m.index + m[0].length;
  if (start === -1) return {referees: [], principal: ""};

  const end = h.indexOf("<h3", start);
  const block = h.slice(start, end === -1 ? start + 4000 : end);

  const row = /<div class="[^"]*border-b[^"]*">([^<]+)<\/div>/g;
  const out = [];
  let r;
  while ((r = row.exec(block))) {
    const name = decodeHtmlEntities(r[1]).replace(/\s+/g, " ").trim();
    if (!name || name.indexOf(",") === -1) continue;
    if (out.indexOf(name) === -1) out.push(name);
  }
  return {referees: out, principal: out[0] || ""};
}

/**
 * A referee's key in `fcfReferees/{slug}`.
 *
 * The federation publishes NO referee id — only "COGNOMS, NOM" — so the name
 * is all there is to key on, and two officials who share one would merge with
 * nothing in the data able to separate them. That is a real limitation of the
 * source and the UI says so rather than implying a precision it does not have.
 *
 * Accents are folded and punctuation dropped so "DOMÍNGUEZ GUTIÉRREZ, FRAN"
 * and a later "DOMINGUEZ GUTIERREZ, FRAN" are one person: the federation is
 * inconsistent about accents across seasons, and a split record is worse than
 * a merged one — it silently halves everyone's match count.
 */
function fcfRefereeSlug(name) {
  return String(name === undefined || name === null ? "" : name)
      .toLowerCase().normalize("NFD").replace(COMBINING_MARKS, "")
      .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

/* ═══════════════════════════════════════════════════════════════════════
   Building the referee database
   ═══════════════════════════════════════════════════════════════════════ */

/**
 * The five senior tiers of Futbol 11, by the federation's own label.
 *
 * This is the scope of the crawl, and it is deliberately not "everything".
 * All of Futbol 11 is 532 groups and ~106,000 matches a season — the youth,
 * women's and lúdica competitions are what make that number. These five are
 * 64 groups and 14,390 matches, which is a few nights of polite crawling
 * rather than twenty hours of it.
 *
 * Matched with `===`, never a prefix: "QUARTA CATALANA - COPA TERRES EBRE"
 * and "QUARTA CATALANA - FASE ASCENS TERRES EBRE" are separate cup
 * competitions that a `startsWith` would silently drag in.
 */
const FCF_SENIOR_TIERS = [
  "LLIGA ELIT",
  "PRIMERA CATALANA",
  "SEGONA CATALANA",
  "TERCERA CATALANA",
  "QUARTA CATALANA",
];

/** Futbol 11. The federation's other disciplines are out of scope. */
const FCF_DISCIPLINE_F11 = "19308233";

/** The `{value,label}` rows FCF wraps in one of several shapes. */
function fcfList(json) {
  if (Array.isArray(json)) return json;
  if (!json || typeof json !== "object") return [];
  if (Array.isArray(json.data)) return json.data;
  const inner = json.data && typeof json.data === "object" ? json.data : json;
  const hit = Object.keys(inner).map((k) => inner[k]).find(Array.isArray);
  return hit || [];
}

/**
 * The competition ids of the wanted tiers, in tier order.
 *
 * Ids are NOT stable across seasons — Lliga Elit is 58161860 in 2026-27 and
 * 54322936 in 2025-26 — so they are resolved by label every run. Hardcoding
 * them would not fail loudly; it would quietly backfill the wrong year.
 */
function pickFcfTiers(json, wanted) {
  const want = wanted || FCF_SENIOR_TIERS;
  const rows = fcfList(json);
  const out = [];
  want.forEach((label) => {
    const hit = rows.find((r) =>
      String((r || {}).label || "").trim().toUpperCase() === label);
    if (hit) out.push({competicioId: String(hit.value), label});
  });
  return out;
}

/** "H" home win, "A" away win, "D" draw, or "" when it cannot be read. */
function fcfMatchResult(home, away) {
  const h = parseInt(home, 10);
  const a = parseInt(away, 10);
  if (!isFinite(h) || !isFinite(a)) return "";
  return h > a ? "H" : (h < a ? "A" : "D");
}

/**
 * Should the crawl queue be rebuilt before this run?
 *
 * `state` is the stored cursor, `scope` the fingerprint of the current
 * config, `freshFor` an optional "start over when this changes" key.
 *
 * The four reasons, each of which has bitten some crawler somewhere:
 *
 *  - the SCOPE changed. Widening from our own groups to all 64 must not walk
 *    a queue built for the old scope and report itself finished.
 *  - there is no queue yet.
 *  - the last pass got to the end. Without this the job runs once and then
 *    sits at the end of a finished queue for ever, doing nothing, looking
 *    perfectly healthy.
 *  - `freshFor` moved on. This is how the Friday pass starts a new sweep each
 *    week without restarting on each of its three firings: the 06:00 run sees
 *    a new date, the 07:00 and 08:00 runs see the same one and continue.
 */
function fcfShouldRebuild(state, scope, freshFor) {
  const s = state || {};
  const queue = Array.isArray(s.queue) ? s.queue : [];
  const at = Number(s.at) || 0;
  if (s.scope !== scope) return true;
  if (!queue.length) return true;
  if (at >= queue.length) return true;
  if (freshFor && s.freshFor !== freshFor) return true;
  return false;
}

/** The document id of a group's raw referee index. */
function fcfRefIndexId(season, grupId) {
  return String(season) + "_" + String(grupId);
}

/**
 * Which actas of a group still have to be fetched, and what is known of them.
 *
 * `indexed` is the `actas` map already stored for this group.
 *
 * ── The re-fetch rule ───────────────────────────────────────────────────
 * An acta is due when it has never been fetched, OR when what we hold was
 * fetched before the match was played (`c` falsy). That second clause is the
 * one that is easy to get wrong and impossible to notice: the Friday job
 * reads UNPLAYED actas to learn who has been appointed, so by Monday the
 * index already "has" that match — and a rule keyed on mere presence would
 * never go back for the result or the cards. Every match the weekly job
 * touched would be permanently invisible to the historian, and the only
 * symptom, months later, would be referees whose records stopped growing.
 *
 * Matches that are still unplayed are returned too, flagged `closed:false`,
 * because knowing Sunday's referee on Friday is the whole point of the
 * weekly pass. Callers that only want history filter them out.
 */
function fcfActasDue(partidos, indexed) {
  const have = indexed || {};
  const out = [];
  const seen = {};
  Object.keys(partidos || {}).forEach((jornada) => {
    const list = Array.isArray(partidos[jornada]) ? partidos[jornada] : [];
    list.forEach((m) => {
      const actaId = String((m || {}).CODACTA || "");
      if (!actaId || seen[actaId]) return;
      seen[actaId] = true;
      const closed = String(m.CERRADA || "") === "1";
      const cur = have[actaId];
      if (cur && (cur.c || !closed)) return;
      out.push({
        actaId,
        closed,
        jornada: parseInt(m.JORNADA, 10) || 0,
        result: closed ? fcfMatchResult(m.GOLES_CASA, m.GOLES_FUERA) : "",
        date: String(m.COMIENZO1 || "").slice(0, 10),
      });
    });
  });
  out.sort((a, b) => a.jornada - b.jornada ||
    String(a.actaId).localeCompare(String(b.actaId)));
  return out;
}

/**
 * One acta's entry in the raw index.
 *
 * Kept SMALL and kept RAW. Small because a group-season holds ~240 of them in
 * one document; raw because the derived per-referee profiles are rebuilt from
 * this and nothing else — when the derivation changes, or when the federation
 * finally publishes yellow cards, the aggregates can be recomputed without
 * re-fetching ten gigabytes of HTML.
 *
 *   r  the officials, in role order: referee first, then assistants
 *   c  1 once the match has been played — see fcfActasDue
 *   res  "H" | "D" | "A", only meaningful when c
 *   j  jornada,  d  date
 */
function fcfActaEntry(due, referees) {
  const e = {r: (referees || []).slice(), j: due.jornada || 0};
  if (due.date) e.d = due.date;
  if (due.closed) {
    e.c = 1;
    if (due.result) e.res = due.result;
  }
  return e;
}

/* The federation's own sanction-type codes, which are worth far more than the
   prose beside them: `motivo_sancion` is a paragraph of Catalan legalese that
   varies per offence and would have to be pattern-matched in three languages,
   while `cod_tiposancion` is a two-digit code that says the same thing.

     101  accumulation of bookings across matches
     102  sent off for a SECOND booking
     103  sent off, or otherwise disciplined, directly

   103 covers article 337 ("expulsion with a direct red card") and the 338.x
   articles that name a specific offence — violent conduct, dissent, insults.
   They are all direct sendings-off of a participant, so they are counted
   together as reds; the federation does not separate them further, and
   inventing a split it does not publish would be a guess dressed as data.

   `tipo: "equipo"` rows are rulings against a CLUB — fines, closed grounds, a
   match ordered to resume. They carry no code and belong to nobody on the
   pitch, so they are counted as neither. */
const FCF_SANCTION_DOUBLE = "102";
const FCF_SANCTION_RED = "103";

/**
 * `sanciones` folded to `{actaId: {reds, doubles}}`.
 *
 * This is what makes cards possible at all. FCF publishes NO card markers on
 * an acta — proven against a match whose `sanciones` entry names a player
 * sent off for two yellows, whose acta shows only the constant legend. But
 * every sanction carries `codacta`, so one cheap JSON request per group-season
 * attributes every sending-off to the referee who gave it, without scraping a
 * single card.
 *
 * ⚠ Yellow cards are NOT derivable from this. Code 101 (accumulation) does
 * imply a booking in that match — it is the ruling triggered by reaching a
 * fifth one — but it fires once every five, so counting it would produce a
 * number that looks like a yellow-card tally and is a fifth of one. It is
 * deliberately not counted, and the UI says yellows are unpublished rather
 * than showing a figure nobody could act on.
 */
function parseFcfSanctionsByActa(json) {
  const out = {};
  Object.keys(json && typeof json === "object" ? json : {}).forEach((jornada) => {
    const list = Array.isArray(json[jornada]) ? json[jornada] : [];
    list.forEach((r) => {
      const actaId = String((r || {}).codacta || "");
      if (!actaId) return;
      if (String(r.tipo || "") === "equipo") return;
      const code = String(r.cod_tiposancion === null ||
        r.cod_tiposancion === undefined ? "" : r.cod_tiposancion);
      if (code !== FCF_SANCTION_DOUBLE && code !== FCF_SANCTION_RED) return;
      const e = out[actaId] || (out[actaId] = {reds: 0, doubles: 0});
      if (code === FCF_SANCTION_DOUBLE) e.doubles++; else e.reds++;
    });
  });
  return out;
}

/**
 * Fold every group's raw index into per-referee, per-division aggregates.
 *
 * `groups` is `[{comp, season, actas}]`. Returns `{slug: profile}`.
 *
 * ── Only the PRINCIPAL is credited ──────────────────────────────────────
 * `r[0]` is the referee; the rest ran the line. Crediting assistants would
 * treble every count and, worse, attribute decisions to people who did not
 * take them — the figure a delegate reads before a match is about the man in
 * the middle. Assistants are kept in the raw index (they are free, and the
 * day someone wants an assistant's record it is already there) but they earn
 * no profile of their own.
 *
 * ── Sendings-off come from elsewhere ────────────────────────────────────
 * Not from the acta: FCF publishes no cards on it at all. `sanciones` carries
 * a `codacta` per sanction, which is joined in by the caller. Yellow cards do
 * not exist anywhere in the federation's data — see the note in the UI.
 */
function aggregateFcfReferees(groups, sanctionsByActa) {
  const cards = sanctionsByActa || {};
  const out = {};
  (groups || []).forEach((g) => {
    const comp = String((g || {}).comp || "");
    const season = String((g || {}).season || "");
    const actas = (g || {}).actas || {};
    Object.keys(actas).forEach((actaId) => {
      const e = actas[actaId] || {};
      if (!e.c) return;                    // unplayed: an appointment, not a record
      const name = (e.r || [])[0];
      if (!name) return;
      const slug = fcfRefereeSlug(name);
      if (!slug) return;
      const p = out[slug] || (out[slug] = {
        name, slug, matches: 0, byDivision: {}, seasons: {},
      });
      /* The federation's spelling drifts between seasons — accents come and
         go. The slug already folds that; keep the most recent spelling for
         display so the name shown is the one on the latest acta. */
      if ((e.d || "") >= (p.lastSeen || "")) p.name = name;
      const d = p.byDivision[comp] || (p.byDivision[comp] = {
        matches: 0, H: 0, D: 0, A: 0, reds: 0, doubles: 0,
      });
      p.matches++;
      d.matches++;
      if (e.res === "H" || e.res === "D" || e.res === "A") d[e.res]++;
      const c = cards[actaId];
      if (c) {
        d.reds += c.reds || 0;
        d.doubles += c.doubles || 0;
      }
      if (season) p.seasons[season] = (p.seasons[season] || 0) + 1;
      if (e.d) {
        if (!p.firstSeen || e.d < p.firstSeen) p.firstSeen = e.d;
        if (!p.lastSeen || e.d > p.lastSeen) p.lastSeen = e.d;
      }
    });
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
      /* Two fields rather than one nested object, on purpose: v118 shipped
         `opponentKit` as the flat first-choice kit and clubs have already
         imported a season with it. A nested {home, away} would need every
         reader to sniff the shape; a second field leaves the old rows
         rendering exactly as they do, with an empty change-strip column
         until the next sync fills it. */
      if (kit && kit.home) m.opponentKit = kit.home;
      if (kit && kit.away) m.opponentKitAway = kit.away;
      rows.push(m);
      summary.added++;
      return;
    }

    // ── An existing row: update only what the coach has not claimed ──
    const cur = rows[idx];
    const snap = cur.fcfSnapshot || {};
    const next = Object.assign({}, cur);
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
      }
    });
    next.fcfActaId = acta;
    next.fcfJornada = f.jornada;
    next.fcfSnapshot = Object.assign({}, fcfFields);
    next.opponentTeamId = f.opponentTeamId;
    next.opponentBadge = f.opponentBadge;
    if (kit && kit.home) next.opponentKit = kit.home;
    if (kit && kit.away) next.opponentKitAway = kit.away;
    /* Back from the dead: a fixture the federation restored after removing
       it. Leaving the flag would keep the row struck through for ever. */
    if (next.fcfRemoved) delete next.fcfRemoved;
    // The opponent name follows the id, not the other way round: FCF renames
    // clubs mid-season and the acta id is what actually identifies them.
    const oppName = f.opponentName;
    if (f.isHome) { next.home = clubName; next.away = oppName; } else {
      next.home = oppName; next.away = clubName;
    }
    rows[idx] = next;
    /* Did ANYTHING about this row change — not just the four fields the
       coach can own.

       `summary` is the contract with _syncFcfSquad, which skips the Firestore
       write entirely when the summary is all zeros. A flag set only inside
       the FCF_OWNED loop under-reported: v119 added the rival's change strip,
       nothing about date/time/location/mapLink moved, so every sync reported
       "no changes", the write was skipped and `opponentKitAway` could never
       reach a single club. The merge was right and the caller threw the
       result away.

       Comparing the whole row is the only version of this that cannot rot as
       fields are added. Both sides are plain JSON — `next` is built by
       Object.assign from `cur`, so shared keys keep their order and a new
       field simply appends. */
    if (!adopting && JSON.stringify(next) !== JSON.stringify(cur)) summary.updated++;
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
  decodeHtmlEntities,
  parseFcfActa,
  fcfRefereeSlug,
  FCF_SENIOR_TIERS,
  FCF_DISCIPLINE_F11,
  fcfList,
  pickFcfTiers,
  fcfMatchResult,
  fcfRefIndexId,
  fcfShouldRebuild,
  fcfActasDue,
  fcfActaEntry,
  parseFcfSanctionsByActa,
  aggregateFcfReferees,
  FCF_SANCTION_DOUBLE,
  FCF_SANCTION_RED,
  FCF_OWNED,
};
