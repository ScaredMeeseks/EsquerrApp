/* Build a self-contained mockup of the match detail page (v216).
 *
 * The `pt*` builders — the scoreboard band, the facts column, the call-up,
 * the linked boards, the events timeline, the inline event form and the
 * section eyebrows — are the REAL functions, sliced out of js/app.js with
 * the same grab() convention the test suite uses, over the real stdSelect.
 * So the markup in the output is not an approximation of what the app
 * produces; it IS what the app produces. Only the referee record is still
 * stand-in context: it keeps its old markup until v214.
 *
 * The page is rendered THREE times, and each one answers a question a
 * static screenshot of a single fixture cannot:
 *
 *   staff  — mid-match, with the event form OPEN on a goal, because the
 *            chips and the hairline pickers are the subject of v213 and a
 *            closed form shows none of them.
 *   player — before kick-off, so the reviewer can see for himself that the
 *            starting eleven is not on it.
 *   away   — the same five events with their sides mirrored. The timeline
 *            follows the SCOREBOARD, so our column moves to the RIGHT here,
 *            and the assertions below refuse to write the file if it does
 *            not. (v213 had it always-left, on the handoff's wording; the
 *            owner corrected it after seeing an away fixture stack our
 *            goals under the rival's name.)
 *
 * css/style.css is inlined whole so the file can be handed to a design tool
 * with nothing else attached.
 *
 * Run from the repo root:
 *
 *   node scripts/build-partit-preview.js . partit-preview.html
 *
 * The output is REGENERATED, never hand-edited: it is a view of js/app.js,
 * and a hand-patched copy would drift from the app the moment either
 * changed with nothing to detect it. The name must keep the `-preview.html`
 * suffix — scripts/build-www.js excludes the APK mirror on that pattern,
 * and _config.yml names the file to keep it off GitHub Pages.
 */
const fs = require('fs');
const path = require('path');
const assert = require('assert');

const ROOT = path.resolve(process.argv[2] || '.');
const OUT = path.resolve(process.argv[3] || 'mockup.html');

const appSrc = fs.readFileSync(path.join(ROOT, 'js', 'app.js'), 'utf8');
const cssSrc = fs.readFileSync(path.join(ROOT, 'css', 'style.css'), 'utf8');

function grab(from, to) {
  const i = appSrc.indexOf(from);
  const j = appSrc.indexOf(to, i);
  assert.ok(i !== -1 && j !== -1, 'marker not found in js/app.js: ' + from);
  return appSrc.slice(i, j);
}

function esc(v) {
  return String(v == null ? '' : v)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// ── Fixtures ────────────────────────────────────────────────────
// The handoff's own fixture: jornada 4, mid-match at 2–1, eighteen called
// up with an eleven picked. Mid-match is what shows every affordance at
// once — the live timeline, a sent convocatòria, a chosen eleven.

const MATCH = {
  id: 7, home: 'L\'Esquerra de l\'Eixample', away: 'Sauleda, A.D.',
  date: '2026-09-02', time: '20:00', fcfJornada: 4,
  category: 'amateur', team: 'A', opponentTeamId: '42', opponentKit: 'A', opponentKitAway: 'B',
  location: 'Camp Municipal Joan Serrahima'
};

/* A real 4-3-3 in the first eleven, then a bench. The positions are not
   decorative: ptFormation derives the `· 4-3-3` in the anada heading from
   them, and a cycling list gives two goalkeepers, which it correctly
   refuses to name a shape for. */
const POS = ['GK', 'RB', 'CB', 'CB', 'LB', 'DM', 'DM', 'OM', 'RW', 'ST', 'LW',
  'CB', 'GK', 'DM', 'CB', 'OM', 'ST', 'RW'];
const NAMES = ['Guillem Roca', 'Biel Cortés', 'Adrià Sala', 'Èric Fontana',
  'Marc Vidal', 'Oriol Ferrer', 'Roc Amat', 'Jan Prats', 'Iker Ramos',
  'Arnau Puig', 'Pol Serrat', 'Marçal Vila', 'Aleix Duran', 'Nil Bosch',
  'Ferran Mas', 'Pau Riera', 'Hugo Lara', 'Sergi Nadal'];

const SQUAD = NAMES.map((name, i) => ({
  id: 'p' + (i + 1), name: name, playerNumber: String(i + 1),
  position: POS[i] || 'DM', team: i % 5 === 1 ? 'B' : 'A', rank: i
}));
const CALLED = SQUAD.map((p) => p.id);
const XI = CALLED.slice(0, 11);

/* Mid-match at 2–1, the state the handoff draws: one goal with an assist,
   one of the rival's by shirt number, a booking, and a substitution — every
   shape of row the timeline has to draw. */
const EVENTS = [
  {id: 'e1', side: 'home', type: 'goal', minute: '12', playerId: 'p11',
    goalType: 'jugada_oberta', goalDetail: 'assistencia', assistPlayerId: 'p5'},
  {id: 'e2', side: 'away', type: 'yellow', minute: '27', playerNumber: '5'},
  {id: 'e3', side: 'away', type: 'goal', minute: '34', playerNumber: '9'},
  {id: 'e4', side: 'home', type: 'change', minute: '58',
    playerInId: 'p14', playerOutId: 'p10'},
  {id: 'e5', side: 'home', type: 'goal', minute: '61', playerId: 'p9',
    goalType: 'penal'}
];

const LEAGUE = {
  'league-amateur-A': [
    {teamId: '42', rawName: 'Sauleda, A.D.', club: 'Sauleda, A.D.', pos: 4, pts: 41},
    {teamId: '43', rawName: 'L\'Esquerra de l\'Eixample', pos: 2, pts: 47}
  ]
};

/* The first leg — a Copa tie away, won 1–2, with a full team sheet. This is
   what the owner's screenshot is of, and it is why the preview needs it:
   the minutes column, the SUPLENTS split and the `—` for an unused
   substitute are the parts a home-fixture mockup cannot show. */
const LEG = {
  id: 99, home: 'Sauleda, A.D.', away: 'L\'Esquerra de l\'Eixample',
  date: '2026-08-23', category: 'amateur', team: 'A'
};
const LEG_EVENTS = [
  {id: 'l1', side: 'away', type: 'goal', minute: '41', playerId: 'p10'},
  {id: 'l2', side: 'home', type: 'goal', minute: '55', playerNumber: '9'},
  {id: 'l3', side: 'away', type: 'yellow', minute: '63', playerId: 'p4'},
  {id: 'l4', side: 'home', type: 'yellow', minute: '71', playerNumber: '4'},
  {id: 'l5', side: 'away', type: 'goal', minute: '77', playerId: 'p11'}
];
/* Eleven who played, three subs who came on, and two who did not — the `—`
   rows. `null` is "no minutes recorded", which is not the same as 0. */
const LEG_MINUTES = (() => {
  const out = {};
  SQUAD.forEach((p, i) => { out[p.id] = i < 11 ? 90 : (i < 14 ? 30 : null); });
  out.p3 = 72; out.p8 = 58; out.p9 = 78;
  return out;
})();
const LEG_NOTE = {
  pre: {text: 'Ens van fer mal per dins amb el seu 8 caient entre línies.'},
  live: {text: 'Els seus centrals van sortir malament amb pilota: dues pèrdues a la primera pressió.'},
  post: {text: 'Àrbitre d\'aquell dia: Bou Gassó, Marc · 3 grogues.'}
};

const BOARDS = {
  7: [{boardId: 'tb1', name: 'Pressió alta 4-3-3', tag: 'Presión'},
    {boardId: 'tb2', name: 'Córner defensiu', tag: 'Estrategia'},
    {boardId: 'tb3', name: 'Sortida de pilota', tag: 'Salida'}]
};

// ── The real builders ───────────────────────────────────────────

/* Starts at ptOurSide, which the builders below it call — see the same
   note in test/partit.test.js. */
const BLOCK = grab('  /**\n   * Which side of this fixture is US',
    '  function renderMatchDetail()');

/* The real stdSelect, so the form's player pickers in the mockup are the
   same control the page uses. */
const STD_SELECT = new Function('sanitize',
    grab('  function stdSelect(o) {', '  /**\n   * Place an escaping menu') +
    '\n return stdSelect;')(esc);

/* Catalan only. The app's t() is a three-language table keyed by string;
   the preview needs the Catalan the design was drawn in, and taking it
   from the real table rather than retyping it is what stops the mockup
   showing wording the app does not have. */
const STRINGS = (() => {
  const out = {};
  const re = /'(pt\.[a-z0-9_]+)':\s*\{ ca:'((?:[^'\\]|\\.)*)'/g;
  let m;
  while ((m = re.exec(appSrc))) out[m[1]] = m[2].replace(/\\'/g, '\'');
  assert.ok(Object.keys(out).length > 15,
      'the pt. strings were not found — did the i18n block move?');
  return out;
})();

const sanitize = esc;

/* utils.js does not export posCirclesHtmlGlobal, and it needs no DOM —
   this is the same markup its callers produce. */
function posCircles(p) {
  const COLORS = {GK: '#f9a825', CB: '#1e88e5', LB: '#1e88e5', RB: '#1e88e5',
    DM: '#43a047', OM: '#43a047', LW: '#e53935', RW: '#e53935', ST: '#e53935'};
  return String(p.position || '').split(',').map((s) => s.trim()).filter(Boolean)
      .map((pos) => '<span class="conv-pos-circle" style="background:' +
        (COLORS[pos] || '#9e9e9e') + '">' + pos + '</span>').join('');
}

// eslint-disable-next-line no-new-func
const R = new Function(
    't', 'sanitize', 'isOurTeam', 'clubBadgeUrl', 'safeHttpUrl', 'opponentOf',
    'getClubName', '_leagueCache', 'leaguePosLabel', '_lang', 'kitIconsHtml',
    'calcMatchScore', 'CATEGORY_LABELS', 'tDateLong', 'locationHtml', 'getUsers',
    'getStartingXI', 'posRankGlobal', 'posCirclesHtmlGlobal', 'localStorage',
    'tbRoBoardHtml',
    'yellowOrdinals', 'parseEventMinute', 'formatEventMinute', 'getEventIcon',
    'getEventPlayerName', 'resolveEventName', 'stdSelect',
    'mnLinkedFirstLeg', 'matchPlayerMarks', 'matchMarksHtml',
    'playerMatchMinutesKnown', 'mnOutcome', 'mnSentBoards', 'mnSentVideos',
    'mnMediaColHtml', 'MN', 'MN_BRIEF_COLLAPSED', 'tDateShort', 'getMatchEvents',
    'fcfKitPieces', 'fcfShirtSvg', 'shortsSvg', 'kitSockSvg',
    BLOCK + '\n return {ptHead, ptCrestHtml, ptRivalStanding, ptFactsHtml,' +
      ' ptScoreboardHtml, ptCallupHtml, ptBoardsHtml, ptTimelineHtml,' +
      ' ptAnadaHtml,' +
      ' ptEventFormHtml, setForm: function (f) { _evForm = f; }};')(
    (k) => (STRINGS[k] !== undefined ? STRINGS[k] : k),
    sanitize,
    (name) => name === MATCH.home,
    () => 'img/logo-192.png',
    (u) => u,
    (m) => (m.home === MATCH.home ? m.away : m.home),
    () => MATCH.home,
    LEAGUE,
    (n) => (n > 0 ? ({1: '1r', 2: '2n', 3: '3r', 4: '4t'}[n] || n + 'è') : ''),
    'ca',
    // The kit icons need the real SVG builders and a club config; the strip
    // is context here, not the subject.
    /* Honours `opts.size`, so our kit and the rival's are shown at the sizes
       the page really asks for (36 and 32) and the row's proportions in the
       mockup are the proportions in the app. A stub with a fixed size would
       be answering a different question from the one under review. */
    (pieces, o) => mockKit(pieces && pieces.shirt || '#FFFFFF',
        (o && o.size) || 72),
    /* ⚠ GOALS, not events. The first version counted every event, so a
       fixture with two bookings showed a scoreline two goals higher than it
       was — a mockup quietly stating a wrong result. An own goal counts for
       the other side, exactly as calcMatchScore does. */
    (evs) => {
      const sc = {home: 0, away: 0};
      evs.forEach((e) => {
        if (e.type === 'goal') sc[e.side]++;
        else if (e.type === 'own_goal') sc[e.side === 'home' ? 'away' : 'home']++;
      });
      return sc;
    },
    {amateur: 'Tercera Catalana Grup 5'},
    () => 'Dimecres 2 de setembre de 2026',
    () => esc(MATCH.location) + ' · <a class="pt-map-link" href="#">Veure al mapa</a>',
    () => SQUAD,
    () => XI,
    (p) => p.rank,
    posCircles,
    {getItem: (k) => {
      if (k === 'fa_tactic_match_boards') return JSON.stringify(BOARDS);
      // The anada reads the first leg's own call-up to build its team sheet.
      if (k === 'fa_convocatoria_sent') {
        return JSON.stringify({[LEG.id]: {players: CALLED, startingXI: XI}});
      }
      return null;
    }},
    // A stand-in for the pitch: the real read-only renderer needs a DOM to
    // size itself against, and the handoff calls the artwork the one
    // deliberately rough part of the design.
    (b) => '<div class="mock-pitch">' + esc(b && b.name) + '</div>' +
      '<div class="mock-board-name">' + esc(b && b.name) + '</div>',
    // yellowOrdinals: a real Map, so `.get(ev)` behaves as it does live.
    () => new Map(),
    (v) => parseInt(String(v || '0'), 10) || 0,
    (v) => (v ? v + "'" : ''),
    /* The event icons are the app's own files, so the timeline in the
       mockup draws the same glyphs the page does. */
    (ev) => {
      const SRC = {goal: 'gol.png', own_goal: 'gol-propia.png',
        yellow: 'groga.png', red: 'vermella.png', change: 'sub-home.jpg',
        penal_fallat: 'penal%20fallat.png', pal: 'pal.png'};
      return '<img src="img/' + (SRC[ev.type] || 'gol.png') + '" alt="">';
    },
    (ev, users) => {
      const p = (users || []).find((u) => String(u.id) === String(ev.playerId));
      return p ? esc(p.name) : ('Núm. ' + esc(ev.playerNumber || '?'));
    },
    (id, name, num, users) => {
      const p = (users || []).find((u) => String(u.id) === String(id));
      return p ? esc(p.name) : esc(name || ('Núm. ' + (num || '?')));
    },
    /* The real stdSelect, sliced out like everything else — the form's
       player pickers ARE that control now, and drawing a fake one here
       would hide the very consolidation this round is about. */
    STD_SELECT,
    // ── The anada: the first leg, a Copa tie away, won 1–2 ──
    () => LEG,
    (m2, evs) => {
      const out = {};
      evs.forEach((e) => {
        if (!e.playerId) return;
        (out[e.playerId] = out[e.playerId] || {goals: [], ownGoals: [],
          yellows: [], reds: [], on: [], off: []});
        if (e.type === 'goal') out[e.playerId].goals.push(e.minute);
        if (e.type === 'yellow') out[e.playerId].yellows.push(e.minute);
      });
      return out;
    },
    (mk) => (mk && mk.goals.length
      ? '<img src="img/gol.png" style="width:15px;height:17px;" alt="">' : ''),
    (uid) => LEG_MINUTES[uid],
    () => 'win',
    () => [],
    () => [],
    () => '',
    {get: () => LEG_NOTE, PHASES: ['pre', 'live', 'post']},
    'fa_mn_brief_collapsed',
    (d) => d.split('-').reverse().join('/'),
    (id) => (id === LEG.id ? LEG_EVENTS : EVENTS),
    /* The rival's strips. Two flat colour blocks at the size the page asks
       for — the real fcfShirtSvg draws the federation's five patterns and
       needs its fill vocabulary; what this mockup has to show is the SIZE
       the row ends up at, which is the question being reviewed. */
    (kit) => (kit ? {c1: kit === 'A' ? '#1e88e5' : '#f5f5f5',
      shorts: '#222', socks: '#1e88e5'} : null),
    (p, badge, size) => mockKit(p.c1, size),
    (fill, size) => mockKit('#222', size, true),
    (fill, size) => mockKit(p2c(fill), size, true));

/** A flat stand-in for one kit piece, drawn at the size it is given. */
function mockKit(colour, size, narrow) {
  const w = narrow ? Math.round(size * 0.5) : Math.round(size * 0.62);
  return '<span style="display:inline-block;width:' + w + 'px;height:' + size +
    'px;background:' + colour + ';border:1px solid rgba(45,41,38,.25);' +
    'margin-right:2px;vertical-align:middle;"></span>';
}
function p2c(v) { return String(v || '').split('|').pop() || '#888'; }

// ── The two pages ───────────────────────────────────────────────

function ctx(over) {
  return Object.assign({
    convSent: true, sentPlayers: CALLED, sentPieces: {shirt: '#fff'},
    callupTime: '18:45', isStaff: false, isPast: false, isPlayerViewer: true,
    sessionId: 'p11', kitLabel: '1a equipació'
  }, over || {});
}

/* The SAME fixture with the sides swapped, so the mockup shows both
   grounds. The events keep their `side` values relative to the fixture —
   what changes is which of them is ours — and that is the whole question:
   our column must stay on the left at either ground. */
const AWAY_MATCH = Object.assign({}, MATCH, {
  home: MATCH.away, away: MATCH.home
});
const AWAY_EVENTS = EVENTS.map((e) => Object.assign({}, e, {
  side: e.side === 'home' ? 'away' : 'home'
}));

function page(mode) {
  const staff = mode === 'staff';
  const away = mode === 'away';
  const M = away ? AWAY_MATCH : MATCH;
  const EVS = away ? AWAY_EVENTS : EVENTS;
  const c = ctx(staff || away
    ? {isStaff: true, isPlayerViewer: false, isPast: true}
    : {isStaff: false, isPast: false});

  /* The staff screen is shown with the form OPEN on a goal, because the
     chips, the hairline pickers and the goal-type row are the whole subject
     of v213 and a closed form shows none of them. */
  if (staff) {
    R.setForm({matchId: MATCH.id, side: 'home', type: 'goal', min: '63',
      who: '', second: '', goalType: 'jugada_oberta'});
  } else {
    R.setForm(null);
  }

  const showEvents = staff || away;
  const events = showEvents
    ? R.ptHead(STRINGS['pt.events'], EVS.length + ' ' + STRINGS['pt.events_n']) +
      R.ptTimelineHtml(M, EVS, SQUAD, true) +
      (staff
        ? '<div class="pt-ev-add">' +
            '<button class="pt-ev-add-btn pt-ev-add-ours pt-ev-add-on">' +
              STRINGS['pt.add_event'] + ' · L\'Esquerra</button>' +
            '<button class="pt-ev-add-btn">' + STRINGS['pt.add_event'] +
              ' · Sauleda</button>' +
          '</div>' + R.ptEventFormHtml(M, SQUAD)
        : '')
    : R.ptHead(STRINGS['pt.events'], '') +
      R.ptTimelineHtml(M, [], SQUAD, false);

  const referee = staff
    ? R.ptHead(STRINGS['pt.referee']) +
      '<div class="pt-ref-name">MOYA LOPEZ, AARON</div>' +
      '<div class="mock-ref">Assistents: Pasca, Mihai Andrei · Triola Mir, Jordi<br>' +
      'Tercera Catalana · 8 partits — the v213 block keeps its own markup.</div>'
    : R.ptHead(STRINGS['pt.referee']) +
      '<div class="pt-ref-name">MOYA LOPEZ, AARON</div>';

  const cols = [
    R.ptHead(STRINGS['pt.today']) + R.ptFactsHtml(M, c),
    referee,
    R.ptBoardsHtml(M)
  ];

  /* The anada, expanded, on the staff page — the block the owner's
     screenshot is of, and the one a home-fixture-only mockup could not
     show. Rendered by the real ptAnadaHtml. */
  const anada = staff ? '<div class="pt-band">' + R.ptAnadaHtml(M, []) + '</div>' : '';

  return '<div class="pt-page">' +
    '<div class="pt-topbar">' +
      '<button class="pt-back">← ' + STRINGS['pt.back_calendar'] + '</button>' +
      '<span class="pt-topbar-right"><span class="pt-eyebrow">' +
        STRINGS['pt.eyebrow'] + ' · ' + MATCH.team + '</span></span>' +
    '</div>' +
    R.ptScoreboardHtml(M, showEvents ? EVS : [], showEvents) +
    (staff || away ? '' :
      '<div class="pt-you"><span>' + STRINGS['pt.you_called'] + '</span>' +
      '<span class="pt-you-meta">' + STRINGS['pt.f_callup'] + ' 18:45 ' +
      STRINGS['pt.at_ground'] + '</span></div>') +
    anada +
    '<div class="pt-band pt-context">' +
      cols.map((x) => '<div class="pt-col">' + x + '</div>').join('') +
    '</div>' +
    '<div class="pt-band pt-play">' +
      '<div class="pt-col">' + events + '</div>' +
      '<div class="pt-col">' + R.ptCallupHtml(M, c) + '</div>' +
    '</div>' +
  '</div>';
}

const staffPage = page('staff');
const playerPage = page('player');
const awayPage = page('away');

assert.ok(playerPage.indexOf('pt-star') === -1,
    'the player page rendered a star — the eleven is leaking');
assert.ok(playerPage.indexOf(STRINGS['pt.xi_locked']) !== -1,
    'the player page lost the line about when the eleven is published');
assert.ok(staffPage.indexOf('pt-star') !== -1,
    'the staff page rendered no star');

/* The timeline follows the SCOREBOARD, so our column SWAPS between the two
   grounds — left at home, right away. (v213 had it always-left, on the
   handoff's wording; the owner corrected it in v215 after seeing an away
   fixture put our goals under the rival's name.) The two pages hold the
   same five events with their `side` flags mirrored, so a renderer that
   ignored home/away would fail one of these. */
function firstScorerColumn(pageHtml) {
  const row = pageHtml.slice(pageHtml.indexOf('pt-ev-row'));
  const ours = row.indexOf('Pol Serrat');
  const min = row.indexOf('pt-ev-min');
  return (ours !== -1 && ours < min) ? 'left' : 'right';
}
assert.strictEqual(firstScorerColumn(staffPage), 'left',
    'our scorer is not in the left column at HOME');
assert.strictEqual(firstScorerColumn(awayPage), 'right',
    'our scorer is not in the right column AWAY — the timeline is not ' +
    'following the scoreboard');

const html = `<!DOCTYPE html>
<html lang="ca">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>EsquerrApp — Partit (v216)</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Oswald:wght@200..700&display=swap" rel="stylesheet">
<style>
${cssSrc}
</style>
<style>
/* Mockup shell only — NOT part of the app. The real page renders inside
   #dashboard-content within the dashboard sidebar layout; this stands in for
   it, including the 1rem padding .pt-page is built to negate. */
body { margin:0; background:#E9E6E0; font-family:'Oswald','Arial Narrow',sans-serif; }
.mock-note {
  background:#2D2926; color:#e0ddd9; padding:.7rem 1.2rem;
  font-size:.82rem; line-height:1.5;
}
.mock-note b { color:#FFD662; }
.mock-shell { padding:1rem; background:#FBFAF7; }
.mock-label {
  background:#FBFAF7; color:#99928B; padding:1.4rem 1.2rem .2rem;
  font-size:11px; letter-spacing:.16em; text-transform:uppercase;
}
/* The handoff calls the pitch artwork the one deliberately rough part; in
   the app this is the real read-only board. */
.mock-pitch {
  height:110px; background:#2e7d32; color:rgba(255,255,255,.75);
  display:flex; align-items:center; justify-content:center;
  font-size:11px; letter-spacing:.08em; text-transform:uppercase;
  border:1px solid rgba(255,255,255,.9); text-align:center; padding:0 6px;
}
.mock-board-name { font-size:14px; padding-top:6px; }
.mock-kit {
  display:inline-flex; width:26px; height:26px; margin-right:3px;
  align-items:center; justify-content:center;
  border:1px solid #E3DFD8; font-size:11px; color:#6B645E;
}
.mock-ref { font-size:12px; color:#6B645E; padding-top:8px; line-height:1.6; }
/* The dialog sits on the scrim it would really open over, so its contrast
   is judged against the right background rather than against paper. */
.mock-shell-dlg {
  background:rgba(45,41,38,.55); display:flex; justify-content:center;
  padding:2.5rem 1rem;
}
</style>
</head>
<body>
<div class="mock-note">
  <b>EsquerrApp v213 — match detail, rebuilt to the Claude Design handoff.</b>
  The <b>scoreboard band</b>, the <b>facts column</b>, the <b>call-up</b>, the
  <b>linked boards</b>, the <b>events timeline</b> and the <b>inline event form</b> —
  chips, hairline pickers and all — are rendered by the app's real functions and real
  CSS. Only the <b>referee record</b> is stand-in context; it and the <b>anada</b> are
  the subject of v214. The pitches are placeholders; in the app they are the real
  read-only boards.
  Two departures from the handoff: classes are <b>pt-</b>, not <b>md-</b>, which already
  names four other things in this stylesheet; and a goal of ours carries an extra
  <b>Tipus de gol</b> chip row, because the player stats page counts penalties and free
  kicks off that field and the design's form had nowhere to enter it.
  Generated ${new Date().toISOString().slice(0, 10)}.
</div>
<div class="mock-label">2a · Staff, mid-match</div>
<div class="mock-shell">
${staffPage}
</div>
<div class="mock-label">2b · Player, before kick-off — the eleven is not here</div>
<div class="mock-shell">
${playerPage}
</div>
<div class="mock-label">
  2a AWAY · the same five events, sides mirrored — our column moves to the RIGHT, following the scoreboard
</div>
<div class="mock-shell">
${awayPage}
</div>

</body>
</html>
`;

fs.writeFileSync(OUT, html, 'utf8');
console.log('wrote ' + OUT + ' (' + Math.round(html.length / 1024) + ' KB)');
console.log('staff: ' + (staffPage.match(/pt-cu-row/g) || []).length + ' call-up rows, ' +
    (staffPage.match(/pt-star-on/g) || []).length + ' starters lit');
console.log('player: eleven hidden, ' +
    (playerPage.match(/pt-cu-row/g) || []).length + ' rows in dorsal order');
