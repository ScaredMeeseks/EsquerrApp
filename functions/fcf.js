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
  if (_sameClubNameExactOf(a, b)) return true;
  /* The squad letter: "L'ESQUERRA DE L'EIXAMPLE, F.C. B" from 2026-27.
     Mirrors js/utils.js sameClubName — a fallback only, so nothing that
     matched before can stop matching. */
  const sa = stripSquadLetterOf(a);
  const sb = stripSquadLetterOf(b);
  return (sa !== String(a || "") && _sameClubNameExactOf(sa, b)) ||
    (sb !== String(b || "") && _sameClubNameExactOf(a, sb));
}

// Mirrors SQUAD_SUFFIX in js/utils.js. Whitespace before the letter is
// required, so the C of a bare "F.C" is not read as a squad.
const SQUAD_SUFFIX = /\s+["'“”‘’]?([A-Za-z])["'“”‘’]?\s*$/;

function stripSquadLetterOf(s) {
  return String(s || "").replace(SQUAD_SUFFIX, "");
}

/** The squad letter a federation name ends in, upper-case, or "". */
function squadLetterOfName(s) {
  const m = SQUAD_SUFFIX.exec(String(s || ""));
  return m ? m[1].toUpperCase() : "";
}

function _sameClubNameExactOf(a, b) {
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

/**
 * `{teamId: position}` from `/classificacio`, for stamping onto a fixture.
 *
 * `position` is one of the CLEAN fields — unlike `played`/`won`/`drawn`,
 * which FCF publishes as the home and away halves concatenated. Nothing
 * needs deriving here.
 *
 * ⚠ Deliberately NOT the same rule as parseFcfClassificacio in js/utils.js,
 * which falls back to the array index when FCF sends `position:"0"` for
 * every team pre-season. That fallback is right for a TABLE, where a column
 * of zeros is unreadable and the ordering is at least something. It is
 * wrong here: a position stamped onto a fixture is a claim that gets frozen
 * and read back months later, and "1r" because a team happened to sort
 * first in August is a lie the calendar would keep telling. Pre-season
 * yields an empty map and the card simply shows no position.
 */
function parseFcfPositions(json) {
  const out = {};
  const data = (json && json.data) || [];
  data.forEach((r) => {
    const id = String(((r || {}).team || {}).teamId || "");
    const pos = parseInt((r || {}).position, 10);
    if (!id || !(pos > 0)) return;
    out[id] = pos;
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
/* ── The yellow-card tripwire ───────────────────────────────────────────
 *
 * Until 2026-09 every acta rendered exactly FOUR card-sized boxes — the
 * legend at the foot of the sheet, nobody's booking (acta 3781800 settled
 * it: two sendings-off in `sanciones`, still four boxes).
 *
 * ⚠ THE FEDERATION NOW PUBLISHES CARDS (seen 2026-10, the redesigned
 * site): every booking is a 14×18 box beside the player, with its minute,
 * and parseFcfActaEvents below reads them. This watch counts only the
 * 18×22 LEGEND boxes, so it never saw them arrive and still never fires;
 * it is kept because it costs nothing and still trips if the legend is
 * restyled, which is when the event parser needs a look too.
 */
const FCF_ACTA_LEGEND_MARKS = 4;
const FCF_ACTA_CARD_MARK = /w-\[18px\] h-\[22px\]/g;

/** How many card-sized boxes the page draws. See FCF_ACTA_LEGEND_MARKS. */
function fcfActaCardMarks(html) {
  const m = String(html === undefined || html === null ? "" : html)
      .match(FCF_ACTA_CARD_MARK);
  return m ? m.length : 0;
}

function parseFcfActa(html) {
  const h = String(html === undefined || html === null ? "" : html);
  const heading = /Àrbitres<\/h3>/g;
  const cardMarks = fcfActaCardMarks(h);
  let start = -1;
  let m;
  while ((m = heading.exec(h))) start = m.index + m[0].length;
  if (start === -1) return {referees: [], principal: "", cardMarks};

  const end = h.indexOf("<h3", start);
  const block = h.slice(start, end === -1 ? start + 4000 : end);

  /* ── Rows, TWO shapes, because fcf.cat changed one under us ──────────
     Until 2026-09 a referee row was a div whose whole content was the bare
     name, and the old pattern `>([^<]+)</div>` read it directly:

       <div class="…border-b…">TORRIJO SIERRA, ANDREA</div>

     The live page now nests the name, a role and a territory inside it:

       <div class="…border-b…">
         <div class="…"><span>ALBA PAJARES, HÉCTOR</span>
           <span>(<!-- -->Principal<!-- -->)</span></div>
         <span>Barcelona</span></div>

     `[^<]+` demands text with no child tags, so it failed on the first
     character and returned NOTHING — silently, because an acta with no
     referee is an ordinary thing. That is how 178 played actas came back
     with zero referees while the crawler reported a clean run. The v117
     alarm in _runFcfCrawl is what made it visible, and it is why that alarm
     is worth its noise.

     So this no longer matches a STRUCTURE. It splits the block at each
     `border-b` row, strips comments and tags out of whatever that row
     contains, and reads the text. Both shapes above reduce to the same
     string, and a third redesign that moves the name into yet another
     wrapper still reduces to it. The `<!-- -->` markers are React
     hydration boundaries and must go before the tags, or "(" and
     "Principal" arrive as separate fragments.

     ⚠ The text is cut at the first "(" because the role is appended to the
     name — "ALBA PAJARES, HÉCTOR (Principal) Barcelona". A name containing
     a bracket would lose its tail; no federation name has one, and losing a
     suffix beats keeping "(Principal) Barcelona" on every referee.

     ⚠ And the `<h3` bound above now does MORE work than it used to. The old
     pattern could not match a goals or cards row because those already nest
     a div; this one can. The bound is the only thing keeping a scorer out
     of the referee list, so it must stay — see the "stops at the next
     section" test, which stopped being synthetic the moment this changed. */
  const out = [];
  let principal = "";
  block.split(/<div class="[^"]*border-b/).slice(1).forEach((piece) => {
    const gt = piece.indexOf(">");           // end of this row's own tag
    if (gt === -1) return;
    const text = decodeHtmlEntities(
        piece.slice(gt + 1)
            .replace(/<!--[\s\S]*?-->/g, "") // hydration markers, first
            .replace(/<[^>]*>/g, " "))       // then every tag
        .replace(/\s+/g, " ").trim();
    if (!text) return;
    const name = text.split("(")[0].replace(/\s+/g, " ").trim();
    // "Sense àrbitres assignats" and every other prose row fail this.
    if (!name || name.indexOf(",") === -1) return;
    if (out.indexOf(name) === -1) out.push(name);
    /* The federation now SAYS which one is the principal. Believe it rather
       than assuming the first row, and fall back to first when it does not
       — every acta written in the old shape says nothing. */
    const role = /\(\s*([^)]*?)\s*\)/.exec(text);
    if (!principal && role && /principal/i.test(role[1])) principal = name;
  });
  return {referees: out, principal: principal || out[0] || "", cardMarks};
}

/* ═══════════════════════════════════════════════════════════════════════
   A closed acta's EVENTS — goals, cards, substitutions, line-ups (v278)
   ═══════════════════════════════════════════════════════════════════════

   fcf.cat is a Next.js App Router site, and the HTML is the wrong thing to
   read for this: it draws every section twice (desktop and mobile), streams
   row bodies into hidden `<div id="S:…">` segments, and — the decider — does
   not contain the federation's player ids at all. Those exist only in the
   React Server Component payload the page carries in its
   `self.__next_f.push([1,"…"])` scripts. That payload lists each item ONCE,
   with ids, and the line-up component hands each team over as its own prop
   (`localNode` / `visitorNode`), so which side a player is on is structure,
   not a team-name comparison.

   What the sheet draws, per player row, is a list of `minute + icon` groups:
   a 14×18 yellow box, a red box, a blue arrow (on), a red arrow (off) or a
   ball. A second booking is simply a second yellow box — there is no
   dedicated glyph (checked on 4119510, where `sanciones` records a 102). The
   legend at the foot uses the same colours at 18×22 and has no minute, which
   is what keeps it out. Staff rows carry cards too (a coach's red on
   4119504) and are not players, so a card is credited only to the ONE player
   in its row.

   It FAILS CLOSED. Header score against the goals, the running score row by
   row, the sub arrows against the Canvis pairs, a mark it cannot classify —
   any disagreement returns `{ok:false, reason}`. An import overwrites the
   coach's goals and cards and is then locked as final; a wrong partial
   scoresheet is far worse than none. */

/** The RSC payload of a Next.js page: every `push([1,"…"])` chunk, decoded and
 *  concatenated. "" when there is none or a chunk is not a JSON string —
 *  rows straddle chunks, so a lost chunk corrupts everything after it. */
function fcfRscPayload(html) {
  const h = String(html === undefined || html === null ? "" : html);
  const re = /self\.__next_f\.push\(\[1,"((?:[^"\\]|\\.)*)"\]\)/g;
  let out = "";
  let m;
  while ((m = re.exec(h))) {
    try {
      out += JSON.parse("\"" + m[1] + "\"");
    } catch (e) {
      return "";
    }
  }
  return out;
}

/** Split an RSC payload into `{id: {json}|{text}}` rows.
 *
 *  ⚠ `T<hexlen>,` rows are LENGTH-prefixed, not line-terminated, and the
 *  length is in UTF-8 BYTES: a text row holding an accented name and a
 *  newline would end in the wrong place if counted in characters. Module and
 *  hint rows (`I[…]`, `HL[…]`) are skipped; a row that does not parse is
 *  dropped rather than thrown — whatever needed it fails a check later. */
function fcfRscRows(payload) {
  const buf = Buffer.from(String(payload || ""), "utf8");
  const rows = Object.create(null);
  let i = 0;
  while (i < buf.length) {
    const colon = buf.indexOf(0x3a, i);
    if (colon === -1) break;
    const id = buf.toString("utf8", i, colon);
    if (!/^[0-9a-f]{1,8}$/.test(id)) {
      const nl = buf.indexOf(0x0a, i);
      if (nl === -1) break;
      i = nl + 1;
      continue;
    }
    const head = buf.toString("latin1", colon + 1, Math.min(buf.length, colon + 24));
    const t = /^T([0-9a-f]{1,8}),/.exec(head);
    if (t) {
      const start = colon + 1 + t[0].length;
      const len = parseInt(t[1], 16);
      rows[id] = {text: buf.toString("utf8", start, start + len)};
      i = start + len;
      continue;
    }
    const nl = buf.indexOf(0x0a, colon + 1);
    const end = nl === -1 ? buf.length : nl;
    const line = buf.toString("utf8", colon + 1, end);
    i = end + 1;
    if (/^[A-Z]{1,2}\[/.test(line)) continue;
    try {
      rows[id] = {json: JSON.parse(line)};
    } catch (e) { /* see above */ }
  }
  return rows;
}

const RSC_REF = /^\$[L@]?([0-9a-f]{1,8})$/;
const RSC_NODE_BUDGET = 250000;

/** Resolve the rows into one element tree from row `0`.
 *
 *  Nodes are `{t, p, k, up}` (type, props, kids, parent); text is `{s, up}`.
 *  Only an element's `children` yield text — other props are followed only
 *  for the elements and references they hold, which is how `localNode` and
 *  `visitorNode` come in (as a `#prop` node named after the prop) while
 *  `className`, routing data and i18n tables stay out. A reference already
 *  on the current path is not re-entered, and the node budget bounds a
 *  hostile payload. */
function fcfRscTree(rows) {
  let budget = RSC_NODE_BUDGET;
  const root = {t: "#root", p: {}, k: [], up: null};
  function add(parent, v, path, textOk) {
    if (--budget <= 0) return;
    if (v === null || v === undefined || typeof v === "boolean") return;
    if (typeof v === "number") {
      if (textOk) parent.k.push({s: String(v), up: parent});
      return;
    }
    if (typeof v === "string") {
      const r = RSC_REF.exec(v);
      if (r) {
        const row = rows[r[1]];
        if (!row || path.indexOf(r[1]) !== -1) return;
        if (row.json !== undefined) add(parent, row.json, path.concat(r[1]), textOk);
        else if (textOk && row.text !== undefined) parent.k.push({s: row.text, up: parent});
        return;
      }
      if (!textOk) return;
      if (v.charAt(0) === "$") {
        if (v.charAt(1) === "$") parent.k.push({s: v.slice(1), up: parent});
        return;                                   // $undefined, $Sreact…, $22:props…
      }
      parent.k.push({s: v, up: parent});
      return;
    }
    if (Array.isArray(v)) {
      if (v[0] === "$" && typeof v[1] === "string" && v.length >= 4) {
        const props = v[3] && typeof v[3] === "object" && !Array.isArray(v[3]) ? v[3] : {};
        const node = {t: v[1], p: props, k: [], up: parent};
        parent.k.push(node);
        add(node, props.children, path, true);
        Object.keys(props).forEach((key) => {
          if (key === "children" || key === "style" || key === "player") return;
          const pv = props[key];
          if (typeof pv === "string" ? !RSC_REF.test(pv) : !(pv && typeof pv === "object")) return;
          const slot = {t: "#prop", p: {name: key}, k: [], up: node};
          node.k.push(slot);
          add(slot, pv, path, false);
        });
        return;
      }
      v.forEach((x) => add(parent, x, path, textOk));
      return;
    }
    if (typeof v === "object") Object.keys(v).forEach((key) => add(parent, v[key], path, false));
  }
  if (rows["0"] && rows["0"].json !== undefined) add(root, rows["0"].json, ["0"], false);
  return root;
}

/** Joined text of a subtree, whitespace collapsed. */
function rscText(n) {
  if (n.s !== undefined) return n.s;
  return n.k.map(rscText).join("");
}

/** What one element draws, if it is one of the sheet's marks. */
function rscMarkKind(n) {
  if (n.s !== undefined) return "";
  const cls = String(n.p.className || "");
  if (n.t === "div" && /\brounded-\[2px\]/.test(cls) && /\bbg-\[#/.test(cls)) {
    if (/bg-\[#FFEB3B\]/i.test(cls)) return "yellow";
    if (/bg-\[#F30000\]/i.test(cls)) return "red";
    return "unknown";
  }
  if (n.t === "path" && String(n.p.strokeWidth) === "4") {
    if (/^#0068A9$/i.test(String(n.p.stroke))) return "in";
    if (/^#F30000$/i.test(String(n.p.stroke))) return "out";
    return "unknown";
  }
  return "";
}

const ACTA_MINUTE = /^(\d{1,3})(?:\s*\+\s*(\d{1,2}))?\s*[’']$/;
const ACTA_MINUTE_FINAL = /^\(\s*final\s*\)$/i;
const ACTA_HIDDEN_NAME = /^jugador(\s*\/\s*a)?$/i;
const ACTA_GOAL = /\(\s*(GOL(?:\s+PENAL|\s+EN\s+PR[ÒO]PIA)?)\s*\(\s*(\d{1,3})(?:\s*\+\s*(\d{1,2}))?\s*[’']\s*\)\s*\)/i;

/** "45+2’" → "45+2"; "(Final)" → "" (shown after the whistle); else null. */
function actaMinuteOf(text) {
  const s = String(text || "").replace(/\s+/g, " ").trim();
  if (ACTA_MINUTE_FINAL.test(s)) return "";
  const m = ACTA_MINUTE.exec(s);
  if (!m) return null;
  return String(Number(m[1])) + (m[2] ? "+" + Number(m[2]) : "");
}

/** Sortable value of an app minute string — the server's parseEventMinute. */
function actaMinuteValue(min) {
  if (!min) return 999;
  const parts = String(min).split("+");
  return (Number(parts[0]) || 0) + (Number(parts[1]) || 0) * 0.01;
}

/**
 * Everything a CLOSED acta says happened, from the page's HTML.
 *
 * `{ok:true, closed:false, status}` for an acta not yet closed — nothing else
 * is read, because a pending sheet is a draft. `{ok:true, closed:true,
 * played:false, status}` for one closed with no result (the match was not
 * played). For a closed, played one:
 *
 *   {ok, closed:true, played:true, status, home:{name}, away:{name}, score:{home, away},
 *    players: [{id, name, dorsal, side, titular, captain, keeper, hidden}],
 *    goals:   [{minute, id, side, for, kind:'goal'|'penalty'|'own', running}],
 *    cards:   [{minute, id, side, kind:'yellow'|'red'}],
 *    subs:    [{minute, side, inId, outId}],
 *    warnings: [...]}
 *
 * `side` is the player's own team, `for` the team the goal counts for — they
 * differ only on an own goal. Minutes are app strings ("45+2"; "" for a card
 * marked "(Final)"). Failure is `{ok:false, reason, detail}`, never a throw.
 */
function parseFcfActaEvents(html) {
  const fail = (reason, detail) => ({ok: false, reason, detail: detail || ""});
  let root;
  try {
    const payload = fcfRscPayload(html);
    if (!payload) return fail("no-rsc");
    root = fcfRscTree(fcfRscRows(payload));
  } catch (e) {
    return fail("no-rsc", String(e && e.message || e));
  }

  // One pass: document order, player counts, side slots, texts, marks.
  const order = [];
  const texts = [];
  (function index(n, side) {
    n.i = order.length;
    order.push(n);
    if (n.s !== undefined) {
      n.pc = 0;
      const s = n.s.replace(/\s+/g, " ").trim();
      if (s) texts.push({n, s});
      return;
    }
    if (n.t === "#prop" && (n.p.name === "localNode" || n.p.name === "visitorNode")) {
      side = n.p.name === "localNode" ? "home" : "away";
    }
    n.side = side;
    n.pc = n.p.player ? 1 : 0;
    n.k.forEach((c) => {
      index(c, side);
      n.pc += c.pc;
    });
  })(root, "");

  // ── Header: the status pill, then "h - a". The pill's wording comes from
  //    the data ("Acta Tancada", "PENDENT", "SUSPÈS"…), so it is found by
  //    what follows it — the score triple, "-" "-" "-" when there is none. ──
  const goalsOrDash = /^(\d{1,2}|-)$/;
  let st = -1;
  for (let j = 0; j + 3 < texts.length; j++) {
    if (!goalsOrDash.test(texts[j].s) && goalsOrDash.test(texts[j + 1].s) &&
        texts[j + 2].s === "-" && goalsOrDash.test(texts[j + 3].s)) {
      st = j;
      break;
    }
  }
  if (st === -1) return fail("no-header");
  const status = texts[st].s;
  if (!/^acta tancada$/i.test(status)) return {ok: true, closed: false, status};
  /* Closed with "- - -" and no line-ups: the match was not played (4119514).
     A final answer, not a failure — there is simply nothing to import. */
  if (texts[st + 1].s === "-" && texts[st + 3].s === "-") {
    return {ok: true, closed: true, played: false, status};
  }
  if (!/^\d+$/.test(texts[st + 1].s) || !/^\d+$/.test(texts[st + 3].s)) return fail("no-score");
  const score = {home: Number(texts[st + 1].s), away: Number(texts[st + 3].s)};

  const lineup = order.find((n) => n.p && typeof n.p.localName === "string" &&
    typeof n.p.visitorName === "string");
  if (!lineup) return fail("no-lineups");
  const home = {name: decodeHtmlEntities(lineup.p.localName).trim()};
  const away = {name: decodeHtmlEntities(lineup.p.visitorName).trim()};
  const sideOfTeam = (team) => {
    const t = decodeHtmlEntities(team).trim();
    if (t && t === home.name) return "home";
    if (t && t === away.name) return "away";
    return "";
  };

  // ── Players: every line-up entry, by id; the row with `titular` wins ──
  const players = [];
  const byId = {};
  order.forEach((n) => {
    if (!n.p || !n.p.player || !n.side) return;
    const pl = n.p.player;
    const id = String(pl.id || "");
    if (!/^\d{1,12}$/.test(id)) return;
    const had = byId[id];
    if (had && (had.fromSheet || pl.titular === undefined)) return;
    const name = decodeHtmlEntities(pl.nombre || "").replace(/\s+/g, " ").trim();
    const rec = {
      id,
      name,
      dorsal: String(pl.dorsal === undefined || pl.dorsal === null ? "" : pl.dorsal).trim(),
      side: n.side,
      titular: String(pl.titular) === "1",
      captain: String(pl.capitan) === "1",
      keeper: String(pl.portero) === "1",
      /* "Jugador/a" is the federation withholding a name. A name with no
         comma is NOT that — some players are registered under one name
         ("IVÁN"); 4119510 has five. */
      hidden: !name || ACTA_HIDDEN_NAME.test(name),
      fromSheet: pl.titular !== undefined,
    };
    if (had) Object.assign(had, rec);
    else {
      byId[id] = rec;
      players.push(rec);
    }
  });
  if (!players.length) return fail("no-lineups");
  players.forEach((p) => delete p.fromSheet);

  /** The single player node inside `n`, or null. */
  const onlyPlayer = (n) => {
    if (!n || n.pc !== 1) return null;
    let hit = null;
    (function find(x) {
      if (hit || x.s !== undefined) return;
      if (x.p.player) {
        hit = x;
        return;
      }
      x.k.forEach(find);
    })(n);
    return hit;
  };
  const upToPlayers = (n, min) => {
    let a = n.up;
    while (a && a.pc < min) a = a.up;
    return a;
  };

  // ── Line-up marks: `minute + icon` groups, credited to their row's player ──
  const marks = [];
  const inGroup = new Set();
  let staffCards = 0;
  for (const n of order) {
    if (n.s !== undefined || n.pc !== 0 || n.k.length < 2 || !n.side) continue;
    // The minute is a LEAF (a span of text). Without that the row's
    // container — whose first kid is the first group — reads as a group too.
    const first = n.k[0];
    if (first.s !== undefined || !first.k.length || first.k.some((c) => c.s === undefined)) continue;
    const minute = actaMinuteOf(rscText(first));
    if (minute === null) continue;
    const kinds = n.k.slice(1).map((kid) => {
      const found = [];
      (function scan(x) {
        const k = rscMarkKind(x);
        if (k) found.push(k);
        if (x.k) x.k.forEach(scan);
      })(kid);
      if (found.length) return found;
      let svg = false;
      (function scan(x) {
        if (x.t === "svg") svg = true;
        if (x.k) x.k.forEach(scan);
      })(kid);
      return [svg ? "ball" : "unknown"];
    }).reduce((a, b) => a.concat(b), []);
    if (!kinds.length) continue;
    (function mark(x) {
      inGroup.add(x);
      if (x.k) x.k.forEach(mark);
    })(n);
    if (kinds.indexOf("unknown") !== -1) return fail("unknown-mark", minute);
    const row = upToPlayers(n, 1);
    const who = row && row.pc === 1 ? onlyPlayer(row) : null;
    if (!who) {
      if (kinds.every((k) => k === "yellow" || k === "red")) {
        staffCards += kinds.length;              // a coach's card: not a player's
        continue;
      }
      return fail("unattached-mark", minute);
    }
    const id = String(who.p.player.id);
    if (!byId[id]) return fail("unknown-player", id);
    kinds.forEach((kind) => marks.push({kind, minute, id, side: byId[id].side}));
  }

  // ── Goals: the Gols list, outside both line-ups ──
  const goals = [];
  const tally = {home: 0, away: 0};
  for (const n of order) {
    if (n.s !== undefined || !n.p.player || n.side) continue;
    const m = ACTA_GOAL.exec(rscText(n).replace(/\s+/g, " "));
    if (!m) continue;
    const id = String(n.p.player.id || "");
    const side = sideOfTeam(n.p.teamName);
    if (!id || !side) return fail("goal-team", id);
    const label = m[1].toUpperCase().replace(/\s+/g, " ");
    const kind = /PR[ÒO]PIA/.test(label) ? "own" : /PENAL/.test(label) ? "penalty" : "goal";
    const forSide = kind === "own" ? (side === "home" ? "away" : "home") : side;
    const minute = String(Number(m[2])) + (m[3] ? "+" + Number(m[3]) : "");
    // The running score sits in the goal's own row: the widest ancestor
    // that still holds only this one player.
    let running = "";
    for (let a = n.up; a && !running; a = a.up) {
      if (a.pc > 1) break;
      const rt = [];
      (function collect(x) {
        if (x.s !== undefined) rt.push(x.s.trim());
        else x.k.forEach(collect);
      })(a);
      running = rt.find((s) => /^\d{1,2}\s*-\s*\d{1,2}$/.test(s)) || "";
    }
    if (!running) return fail("goal-running", minute);
    tally[forSide]++;
    const rm = /^(\d{1,2})\s*-\s*(\d{1,2})$/.exec(running);
    if (Number(rm[1]) !== tally.home || Number(rm[2]) !== tally.away) {
      return fail("running-score", running);
    }
    goals.push({minute, id, side, for: forSide, kind, running: tally.home + "-" + tally.away});
  }
  if (tally.home !== score.home || tally.away !== score.away) {
    /* A result with NO goal behind it is the committee's, not the pitch's —
       a forfeit, an ineligible player: "0 - 3" over "No hi ha gols
       registrats" (3833178, 3833290). A final answer, but not one the app's
       events can express, so the caller is told rather than given a list. */
    if (!goals.length) return {ok: true, closed: true, played: true, awarded: true, status, home, away, score};
    return fail("score-mismatch", tally.home + "-" + tally.away + " vs " + score.home + "-" + score.away);
  }

  // ── Substitutions: the Canvis pairs ──
  const subs = [];
  const seenRows = new Set();
  for (const n of order) {
    // Outside both line-ups an arrow is the legend's.
    if (rscMarkKind(n) !== "in" || inGroup.has(n) || !n.side) continue;
    // The pair's row is the WIDEST ancestor holding just these two players:
    // the minute box sits beside the two-player block, not inside it.
    let row = upToPlayers(n, 2);
    while (row && row.up && row.up.pc === 2) row = row.up;
    if (!row || row.pc !== 2 || seenRows.has(row)) return fail("sub-row");
    seenRows.add(row);
    const inside = order.slice(row.i, row.i + countNodes(row));
    let minute = null;
    let lastPlayer = null;
    let inId = "";
    let outId = "";
    for (const x of inside) {
      if (minute === null && x.s === undefined && x !== row &&
          x.k.length && x.k.every((c) => c.s !== undefined)) {
        const mm = actaMinuteOf(rscText(x));
        if (mm) minute = mm;
      }
      if (x.p && x.p.player) lastPlayer = String(x.p.player.id || "");
      const k = rscMarkKind(x);
      if (k === "in" && !inId) inId = lastPlayer || "";
      if (k === "out" && !outId) outId = lastPlayer || "";
    }
    if (!minute || !inId || !outId || inId === outId) return fail("sub-row", minute || "");
    if (!byId[inId] || !byId[outId] || byId[inId].side !== byId[outId].side ||
        byId[inId].side !== row.side) {
      return fail("sub-side", minute);
    }
    subs.push({minute, side: row.side, inId, outId});
  }
  // The line-up arrows must say exactly what the Canvis pairs say.
  const arrowKeys = (kind) => marks.filter((x) => x.kind === kind)
      .map((x) => x.id + "@" + x.minute).sort().join(",");
  if (arrowKeys("in") !== subs.map((s) => s.inId + "@" + s.minute).sort().join(",") ||
      arrowKeys("out") !== subs.map((s) => s.outId + "@" + s.minute).sort().join(",")) {
    return fail("subs-mismatch");
  }

  // ── Cards. A player cannot hold more than two yellows; FCF sometimes
  //    draws three (3833222) — the first two by minute are kept. ──
  const warnings = [];
  if (staffCards) warnings.push("staff-cards:" + staffCards);
  const cards = [];
  const yellowsOf = {};
  marks.filter((x) => x.kind === "yellow" || x.kind === "red")
      .sort((a, b) => actaMinuteValue(a.minute) - actaMinuteValue(b.minute))
      .forEach((x) => {
        if (x.kind === "yellow") {
          yellowsOf[x.id] = (yellowsOf[x.id] || 0) + 1;
          if (yellowsOf[x.id] > 2) {
            warnings.push("extra-yellow:" + x.id);
            return;
          }
        }
        cards.push({minute: x.minute, id: x.id, side: x.side, kind: x.kind});
      });
  // Balls on the sheet against the Gols list — a cross-check, not a gate:
  // the score check above already guards what an import writes.
  const balls = marks.filter((x) => x.kind === "ball").map((x) => x.id).sort().join(",");
  if (balls !== goals.map((g) => g.id).sort().join(",")) warnings.push("balls-mismatch");

  return {ok: true, closed: true, played: true, status, home, away, score, players, goals, cards,
    subs, warnings};
}

/** Nodes in a subtree, the root included. */
function countNodes(n) {
  if (n.s !== undefined) return 1;
  return 1 + n.k.reduce((a, c) => a + countNodes(c), 0);
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

/**
 * Every FCF group some club has linked, as `[{grupId, season, competicioId,
 * disciplinaId}]` sorted by grupId — each group once, however many clubs
 * link it.
 *
 * ── Why the crawl reads these on top of its tiers ───────────────────────
 * The tier sweep only ever covered the five senior Futbol 11 leagues, and
 * `onlyGroups` narrowed even that to one club's groups. A club whose squad
 * plays anywhere else — a juvenil league, say — was never crawled, so its
 * fixtures showed no referee, past or future, and nothing anywhere said why
 * (2026-10-07: a new club with one Juvenil C squad). A group a club has
 * LINKED is one somebody is looking at, which is the whole case for paying
 * to crawl it, so these are crawled whatever their league and whatever
 * `onlyGroups` says.
 *
 * Same squad rule as fcfSquadsOf in index.js: a link left behind for a
 * disabled category, or a letter the club no longer has, is not a squad.
 * A seeded demo club is skipped — its links are not anybody's real squad.
 *
 * The ids come out of the pasted URL (`?temporadaId=22&disciplinaId=…
 * &competicioId=…&grupId=…`). Any of the first three may be missing — a
 * bare grupId is accepted by fcfGrupIdOf — and comes back as "".
 */
function fcfLinkedGroups(clubs) {
  const out = [];
  const seen = {};
  const param = (url, name) => {
    const m = new RegExp("[?&]" + name + "=(\\d{1,15})\\b").exec(url);
    return m ? m[1] : "";
  };
  (clubs || []).forEach((club) => {
    const c = club || {};
    if (c.demoSeed) return;
    const links = c.fcfLinks || {};
    const cats = c.categories || {};
    Object.keys(links).forEach((key) => {
      const url = String(links[key] === undefined || links[key] === null ? "" : links[key]);
      const grupId = fcfGrupIdOf(url);
      if (!grupId || seen[grupId]) return;
      const i = key.indexOf("-");
      if (i === -1) return;
      const cfg = cats[key.slice(0, i)];
      if (!cfg || !cfg.enabled) return;
      if (Array.isArray(cfg.letters) && cfg.letters.indexOf(key.slice(i + 1)) === -1) return;
      seen[grupId] = true;
      out.push({
        grupId,
        season: param(url, "temporadaId"),
        competicioId: param(url, "competicioId"),
        disciplinaId: param(url, "disciplinaId"),
      });
    });
  });
  return out.sort((a, b) => a.grupId.localeCompare(b.grupId));
}

/** `{value: label}` of one of FCF's `{value,label}` lists, labels trimmed. */
function fcfLabelsById(json) {
  const out = {};
  fcfList(json).forEach((r) => {
    const v = String((r || {}).value || "");
    if (v) out[v] = String((r || {}).label || "").trim();
  });
  return out;
}

/**
 * The crawl scope as one string, so a stored queue built for another scope
 * is thrown away (fcfShouldRebuild).
 *
 * The linked groups are part of it. Without them a club linking a new group
 * would wait for the running queue to finish before its group was even
 * listed — and the Friday pass would carry on with a queue that cannot
 * contain it until the next week.
 */
function fcfScopeKey(cfg, linked) {
  const c = cfg || {};
  return [(c.seasons || []).join(","), (c.tiers || []).join(","),
    (c.onlyGroups || []).slice().sort().join(","),
    (linked || []).map((g) => g.grupId).sort().join(",")].join("|");
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
 *
 * ── An unplayed acta with NO referee yet is due AGAIN ────────────────────
 * The rule above was `cur && (cur.c || !closed)` — an unplayed acta already
 * in the index was skipped outright. So a fixture was read EXACTLY ONCE, on
 * whichever crawl first saw it, and the federation posts appointments on the
 * Thursday before the match. A group crawled when its fixture list was
 * published therefore stored every match refereeless and could never go back,
 * which made "knowing Sunday's referee on Friday" reachable only for fixtures
 * no crawl had ever touched. It cost a real appointment on 2026-09-19: the
 * acta was fetched the day before, stored empty, and frozen until kick-off.
 *
 * So an unplayed acta is skipped only once we actually HAVE its officials.
 * Nothing else changes: a closed acta we have marked `c` is still never
 * re-read, and one we hold as unplayed while the federation says otherwise is
 * still due for its result and cards.
 *
 * ⚠ `horizonDays` bounds the cost, and is the reason this is not simply
 * "re-fetch everything without a referee". A group holds a whole season of
 * fixtures and none of them is appointed until its own week, so an unbounded
 * rule re-reads ~240 pages per group per sweep for ever — trivial at the two
 * groups the crawl is scoped to today, ~15,000 pages the day it widens to all
 * 64. A match more than `horizonDays` away has no referee to learn.
 * `today` must be a YYYY-MM-DD string; with neither, the bound is off and
 * every refereeless unplayed acta is due, which is the old pre-horizon
 * behaviour and safe, just expensive.
 */
function fcfActasDue(partidos, indexed, opts) {
  const have = indexed || {};
  const o = opts || {};
  const today = String(o.today || "");
  const horizon = Number(o.horizonDays) > 0 ? Number(o.horizonDays) : 0;
  /* Calendar arithmetic on the string, not on a Date: this file is pure and
     deliberately free of timezone reasoning (see _kickedOff). */
  let limit = "";
  if (today && horizon) {
    const d = new Date(today + "T12:00:00Z");
    d.setUTCDate(d.getUTCDate() + horizon);
    limit = d.toISOString().slice(0, 10);
  }
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
      if (cur && cur.c) return;                       // history is complete
      if (cur && !closed) {
        // Already have the officials — nothing more to learn until it is played.
        if ((cur.r || []).length) return;
        // Too far off to have been appointed yet.
        const when = String(m.COMIENZO1 || "").slice(0, 10);
        if (limit && when && when > limit) return;
      }
      const gh = parseInt(m.GOLES_CASA, 10);
      const ga = parseInt(m.GOLES_FUERA, 10);
      out.push({
        actaId,
        closed,
        jornada: parseInt(m.JORNADA, 10) || 0,
        result: closed ? fcfMatchResult(m.GOLES_CASA, m.GOLES_FUERA) : "",
        /* The scoreline, not just who won. `res` alone answers "did we win",
           but the match page shows the actual score, and re-deriving it later
           would mean another 14,000 `partidos` reads for something already in
           our hands at crawl time. */
        goalsHome: closed && isFinite(gh) ? gh : null,
        goalsAway: closed && isFinite(ga) ? ga : null,
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
 *   gh, ga  goals home and away, likewise
 *   j  jornada,  d  date
 *
 * `gh`/`ga` are written even when 0 — a 0-0 is a scoreline, and the guard is
 * on null rather than on falsiness for exactly that reason.
 */
function fcfActaEntry(due, referees) {
  const e = {r: (referees || []).slice(), j: due.jornada || 0};
  if (due.date) e.d = due.date;
  if (due.closed) {
    e.c = 1;
    if (due.result) e.res = due.result;
    if (due.goalsHome !== null && due.goalsHome !== undefined) e.gh = due.goalsHome;
    if (due.goalsAway !== null && due.goalsAway !== undefined) e.ga = due.goalsAway;
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
 * The federation's disciplinary ARTICLES, which say what the offence was.
 *
 * `cod_tiposancion` says how someone left the pitch; `articulo_salida` says
 * why, and it is the difference between "four sendings-off" and "four
 * sendings-off, three of them for dissent". Read off 2,482 sanction rows
 * across all five tiers.
 *
 * ⚠ Two things about this field that a first reading gets wrong:
 *
 *  1. It is a comma-separated LIST, not a code. "338.1d,338.1h" and
 *     "336,338.1c" are both real — one incident can breach several articles,
 *     and the same article can appear twice.
 *  2. The spellings vary. "338c" and "338f" are the federation's shorthand
 *     for "338.1c" and "338.1f" (identical `motivo_sancion` text), and some
 *     values carry a trailing space.
 *
 * `dissent` is deliberately two articles: 338.1d is protesting to the
 * referee, 338.2b is addressing him injuriously. Both are the same question
 * — how does he handle being argued with — and splitting them would halve an
 * already thin count.
 */
const FCF_ARTICLES = {
  "334": "accumulation",   // reaching a fifth booking
  "336": "second_booking", // sent off for two yellows
  "337": "straight_red",   // a direct red, offence unspecified
  "338.1a": "insult",      // insulting, threatening or provoking another
  "338.1c": "decorum",     // expressions against decorum or dignity
  "338.1d": "dissent",     // protesting ostensibly or insistently
  "338.1f": "violent",     // violent conduct arising from play
  "338.1i": "interrupt",   // provoking a stoppage
  "338.1k": "rough",       // pushing, shaking — only lightly violent
  "338.2b": "dissent",     // addressing officials injuriously
  "339": "assault",        // assaulting another
  "341": "delegate",       // a delegate failing their obligations
};

/* The offences worth showing, in the order a delegate would care about them.
   `accumulation` and `second_booking` are NOT here: they describe how a
   player left the pitch, not what he did, and both are already counted. */
const FCF_OFFENCE_ORDER = ["dissent", "decorum", "insult", "violent", "rough",
  "assault", "interrupt", "straight_red", "delegate"];

/** One `articulo_salida` value → the distinct offences it names. */
function fcfArticleOffences(value) {
  const out = [];
  String(value === undefined || value === null ? "" : value)
      .split(",").forEach((raw) => {
        const art = raw.trim();
        if (!art) return;
        /* "338c" is the federation's shorthand for "338.1c" — same article,
           same `motivo_sancion`, written two ways in the same season. */
        const key = FCF_ARTICLES[art] ||
          FCF_ARTICLES[art.replace(/^338([a-z])$/, "338.1$1")];
        if (key && out.indexOf(key) === -1) out.push(key);
      });
  return out;
}

/**
 * `sanciones` folded to `{actaId: {reds, doubles}}`.
 *
 * This is what made cards possible for the referee profiles. Until 2026-09
 * FCF published NO card markers on an acta (the redesigned site now does —
 * see parseFcfActaEvents, which the referee crawl does not use yet). Every
 * sanction carries `codacta`, so one cheap JSON request per group-season
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
        r.cod_tiposancion === undefined ? "" : r.cod_tiposancion).trim();
      if (code !== FCF_SANCTION_DOUBLE && code !== FCF_SANCTION_RED) return;
      const e = out[actaId] || (out[actaId] = {reds: 0, doubles: 0, off: {}});
      if (code === FCF_SANCTION_DOUBLE) e.doubles++; else e.reds++;
      /* What the offence WAS, kept beside the count. Free — it is the same
         row we already have — and it is the only route to a question like
         "how does he handle being argued with", since the bookings that
         answer it directly are never published. */
      fcfArticleOffences(r.articulo_salida).forEach((key) => {
        if (key === "accumulation" || key === "second_booking") return;
        e.off[key] = (e.off[key] || 0) + 1;
      });
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
        matches: 0, H: 0, D: 0, A: 0, reds: 0, doubles: 0, off: {},
      });
      p.matches++;
      d.matches++;
      if (e.res === "H" || e.res === "D" || e.res === "A") d[e.res]++;
      const c = cards[actaId];
      if (c) {
        d.reds += c.reds || 0;
        d.doubles += c.doubles || 0;
        Object.keys(c.off || {}).forEach((k) => {
          d.off[k] = (d.off[k] || 0) + c.off[k];
        });
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
   `score` is NOT here: the app computes it from a match's events, and two
   sources of truth for a scoreline is a fight. Since v278 the federation's
   result does arrive — as the acta's GOALS, imported into those events
   (acta.js), so the score is still derived from one list and still only
   there. This merge never writes it. */
const FCF_OWNED = ["date", "time", "location", "mapLink"];

/**
 * Has this fixture kicked off yet?
 *
 * `today` and `nowHM` are the caller's Madrid wall clock, already computed
 * for the played/upcoming split — so this is string comparison and fcf.js
 * stays free of timezone arithmetic.
 *
 * Both are required. With no clock the honest answer is "assume it has",
 * which freezes rather than overwrites: a wrong freeze loses an update, a
 * wrong overwrite destroys a historical record.
 */
function _kickedOff(f, today, nowHM) {
  if (!today || !nowHM || !f || !f.date) return true;
  if (f.date < today) return true;
  if (f.date > today) return false;
  return String(f.time || "00:00") <= nowHM;
}

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
  /* Madrid wall clock, "HH:MM". Only used to decide whether a fixture dated
     TODAY has already kicked off — the daily 06:00 job never needs it, but
     the refresh button can be pressed at 20:00 on a Saturday. */
  const nowHM = String(o.nowHM || "");
  /* {teamId: position} from the same group's standings, which _syncFcfSquad
     already has in hand. Absent (or pre-season) means no position is
     stamped, and a fixture keeps whatever it was last given. */
  const positions = o.positions || {};
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
      /* The rival's league position, captured for the calendar card.
         A fixture imported already-played takes none: there is no way back
         to where they stood that day, and today's table would be a lie
         dressed as a record. */
      const pos0 = positions[String(f.opponentTeamId)];
      if (pos0 > 0 && !_kickedOff(f, today, nowHM)) {
        m.opponentPos = pos0;
        m.opponentPosAt = today;
      }
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
    /* ── The rival's league position, frozen at kick-off ────────────────
       Tracks the live table for as long as the fixture is still ahead of
       us, and is never written again once it has been played. That is what
       makes a past card say where they stood THAT DAY while an upcoming
       one stays current — and the second leg needs no special case, since
       it is a different acta and therefore a different row with its own
       kick-off.

       Written only when the number actually CHANGES. Re-stamping
       `opponentPosAt` on every run would make JSON.stringify(next) differ
       from cur nightly, so `summary.updated` would never be zero, so
       _syncFcfSquad's skip-the-write guard would never fire — and every
       club in the platform would take a full re-render every morning for
       a table that had not moved.

       Never DELETED. A rival who drops out of the standings mid-season
       must not silently erase what we recorded about the games already
       played against them. */
    const pos = positions[String(f.opponentTeamId)];
    if (pos > 0 && pos !== cur.opponentPos && !_kickedOff(f, today, nowHM)) {
      next.opponentPos = pos;
      next.opponentPosAt = today;
    }
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
  squadLetterOfName,
  fcfBadgeUrl,
  fcfMapsLink,
  parseFcfFixtures,
  parseFcfKits,
  parseFcfPositions,
  mergeFcfFixtures,
  decodeHtmlEntities,
  parseFcfActa,
  parseFcfActaEvents,
  fcfRscPayload,
  fcfRscRows,
  actaMinuteValue,
  fcfActaCardMarks,
  FCF_ACTA_LEGEND_MARKS,
  fcfRefereeSlug,
  FCF_SENIOR_TIERS,
  FCF_DISCIPLINE_F11,
  fcfList,
  pickFcfTiers,
  fcfMatchResult,
  fcfRefIndexId,
  fcfShouldRebuild,
  fcfLinkedGroups,
  fcfLabelsById,
  fcfScopeKey,
  fcfActasDue,
  fcfActaEntry,
  parseFcfSanctionsByActa,
  aggregateFcfReferees,
  FCF_SANCTION_DOUBLE,
  FCF_SANCTION_RED,
  FCF_ARTICLES,
  FCF_OFFENCE_ORDER,
  fcfArticleOffences,
  FCF_OWNED,
};
