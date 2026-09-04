/* Build a self-contained mockup of the two Inici pages (v230).
 *
 * Same convention as build-convocatoria-preview.js, build-partit-preview.js
 * and build-training-plan-preview.js: the page renderers are the REAL ones,
 * sliced out of js/app.js with the same grab() the test suite uses, over the
 * real Catalan strings. The markup here is not an approximation of what the
 * app produces; it IS what the app produces.
 *
 * ⚠ WHY THIS EXISTS AT ALL, given 43 assertions in test/inici.test.js.
 * A string-builder test cannot see geometry. Two real v227 defects — a
 * dropdown laying its two lines side by side, and a control with no rule on
 * the shared baseline — were found by rendering the preview with the whole
 * suite already green. The pills on this page are four boxes on a shared
 * baseline beside a variable-height title, which is the same shape of
 * problem. Render it and LOOK at it before calling the redesign done.
 *
 * Six states, because each answers a question a screenshot of one cannot:
 *
 *   player-open    — nothing answered. The `Sí` pill reads as ASSUMED, not
 *                    chosen, and the head says how many are outstanding.
 *   player-mixed   — every answer state at once, plus a sent call-up (the
 *                    blinking tag) and a locked session (inert pills).
 *   player-empty   — a fortnight with nothing in it. The one state where a
 *                    page of empty rails is all there is.
 *   staff-default  — the coach's page: four counters, per-session donuts, an
 *                    unsent fixture with its Convocatòria button.
 *   staff-sent     — the same fixture with the call-up out. The button is
 *                    replaced by the convocats figure in the donut's slot;
 *                    that swap is the whole state model and it must LINE UP
 *                    with the rings above and below it.
 *   phone          — player and staff at 390px, which is what the APK is.
 *
 * The crest is a stand-in; in the app it is the club's uploaded badge.
 * Standings are stand-in rows: they come from the FCF proxy over a network.
 *
 * css/style.css is inlined whole so the file can be handed to a design tool
 * with nothing else attached.
 *
 * Run from the repo root:
 *
 *   node scripts/build-inici-preview.js . inici-preview.html
 *
 * The output is REGENERATED, never hand-edited: it is a view of js/app.js,
 * and a hand-patched copy would drift the moment either changed with nothing
 * to detect it. The name must keep the `-preview.html` suffix —
 * scripts/build-www.js excludes it from the APK mirror on that pattern, and
 * _config.yml must name the file to keep it off GitHub Pages (the pattern
 * exclusion does not cover Pages, and that has shipped a preview live once).
 */
const fs = require('fs');
const path = require('path');
const assert = require('assert');

const ROOT = path.resolve(process.argv[2] || '.');
const OUT = path.resolve(process.argv[3] || 'inici-preview.html');

const appSrc = fs.readFileSync(path.join(ROOT, 'js', 'app.js'), 'utf8');
const cssSrc = fs.readFileSync(path.join(ROOT, 'css', 'style.css'), 'utf8');

function grab(from, to) {
  const i = appSrc.indexOf(from);
  const j = appSrc.indexOf(to, i);
  assert.ok(i !== -1 && j !== -1, 'marker not found in js/app.js: ' + from);
  return appSrc.slice(i, j);
}

/** sanitize() without a DOM — and it must escape EXACTLY what the real one
 *  escapes, or the preview stops being a view of the app. Since v230 that
 *  includes both quotes (js/utils.js). `&` first, as there. */
function esc(v) {
  return String(v == null ? '' : v)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

/* Catalan only, read out of the real i18n table rather than retyped: a
   mockup showing wording the app does not have is worse than no mockup. */
const STRINGS = (() => {
  const out = {};
  const re = /'((?:ini|avail|activity|shome|home|cal|pt|cat|common|fcf)\.[a-z0-9_]+)':\s*\{ ?ca:'((?:[^'\\]|\\.)*)'/g;
  let m;
  while ((m = re.exec(appSrc))) out[m[1]] = m[2].replace(/\\'/g, '\'');
  assert.ok(out['ini.next_two_weeks'], 'the ini. block is missing — did the table move?');
  assert.ok(Object.keys(out).length > 40, 'too few strings found');
  return out;
})();
const t = (k) => (k in STRINGS ? STRINGS[k] : k);

const DAYS = ['dg', 'dl', 'dt', 'dc', 'dj', 'dv', 'ds'];
const MONTHS = ['gen', 'feb', 'mar', 'abr', 'mai', 'jun',
  'jul', 'ago', 'set', 'oct', 'nov', 'des'];
const CLUB = 'U.E. Esquerra';
const BADGE = 'data:image/svg+xml,' + encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 44">' +
    '<path d="M4 3h32v22c0 10-16 16-16 16S4 35 4 25z" fill="#1B4F91" ' +
    'stroke="#0E2A4E" stroke-width="2"/>' +
    '<text x="20" y="22" font-size="13" fill="#fff" text-anchor="middle" ' +
    'font-family="sans-serif">UE</text></svg>');

/* Dates are generated from THIS Monday, not hardcoded. A preview whose
   fixtures fall outside the two-week window renders an empty page and looks
   like a broken renderer — which is the one thing it must not do. */
function iso(d) {
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') +
    '-' + String(d.getDate()).padStart(2, '0');
}
const REAL_NOW = new Date();
const MON = new Date(REAL_NOW.getFullYear(), REAL_NOW.getMonth(),
    REAL_NOW.getDate() + (REAL_NOW.getDay() === 0 ? -6 : 1 - REAL_NOW.getDay()));
const day = (n) => iso(new Date(MON.getFullYear(), MON.getMonth(), MON.getDate() + n));

/* ⚠ "Now" is pinned to Monday 09:00 of the current week, and the renderers
   are handed this instead of the real Date.
   Both week lists drop what has already happened — correctly, and it is the
   one behaviour that makes a preview built on a Thursday show two of its
   five sessions. The reference would then differ from itself depending on
   the day it was generated, which is not a reference. Pinning it also makes
   a before/after pixel diff meaningful, which is how v228 proved the palette
   refactor repainted nothing. */
const PINNED = new Date(MON.getFullYear(), MON.getMonth(), MON.getDate(), 9, 0, 0);
class PreviewDate extends Date {
  constructor(...args) {
    if (args.length === 0) super(PINNED.getTime());
    else super(...args);
  }
  static now() { return PINNED.getTime(); }
}

// ── the fixture data every state is built from ────────────────────────────
const TRAININGS = [
  { id: 't1', date: day(0), time: '19:30', focus: 'Possessió + rondos',
    location: 'Camp Municipal', category: 'amateur', team: 'A' },
  { id: 't2', date: day(2), time: '19:30', focus: 'Pressing + finalització',
    location: 'Camp Municipal', category: 'amateur', team: 'A' },
  { id: 't3', date: day(6), time: '14:00', kind: 'activity', focus: '',
    title: 'Dinar d\'equip', location: 'Can Punyetes', category: 'amateur', team: 'A' },
  { id: 't4', date: day(9), time: '19:30', focus: 'Transicions',
    location: 'Camp Municipal', category: 'amateur', team: 'A' },
  { id: 't5', date: day(11), time: '19:30', focus: 'Activació + estratègia',
    location: 'Camp Municipal', category: 'amateur', team: 'A' },
];
const MATCHES = [
  { id: 101, date: day(5), time: '20:00', home: CLUB, away: 'C.F. Vallcarca',
    location: 'Camp Municipal', category: 'amateur', team: 'A', fcfJornada: 3 },
  { id: 102, date: day(12), time: '18:30', home: 'C.E. Sant Andreu', away: CLUB,
    location: 'Bon Pastor', category: 'amateur', team: 'A', fcfJornada: 4 },
];
const POSNAMES = ['GK', 'CB', 'LB', 'DM', 'OM', 'RW', 'ST'];
const PLAYERS = ['Marc Rovira', 'Guillem Ferrer', 'Nil Camps', 'Àlex Prat',
  'Roger Sala', 'Ivan Bosch', 'Pau Ventura', 'Jordi Miquel', 'Oriol Tena',
  'Biel Costa', 'Arnau Solé', 'Pol Ribas', 'Genís Mas', 'Quim Vidal',
  'Ferran Bou', 'Aleix Duran', 'Roc Puig', 'Nau Serra', 'Èric Lloret',
  'Jan Torres', 'Bru Camps', 'Ot Fabra'].map((name, i) => ({
  id: 'u' + (i + 1), name, roles: ['player'], category: 'amateur', team: 'A',
  position: POSNAMES[i % POSNAMES.length], playerNumber: i + 1,
  fitnessStatus: i === 6 ? 'injured' : 'fit',
}));
const ME = PLAYERS[0];

const STANDINGS = [
  ['C.F. Vallcarca', 6, 14, 9], ['A.E. Poblenou', 6, 12, 7],
  ['Sauleda, A.D.', 6, 11, 5], ['C.E. Sant Andreu', 6, 10, 3],
  [CLUB, 6, 9, 2], ['U.E. Gràcia', 6, 8, 0], ['C.F. Horta', 6, 7, -1],
  ['A.D. Guinardó', 6, 6, -3], ['C.E. Clot', 6, 5, -5],
  ['U.D. Sants', 6, 4, -7], ['C.F. Besòs', 6, 3, -9],
  ['A.E. Trinitat', 6, 1, -12],
].map((r, i) => ({ pos: i + 1, club: r[0], j: r[1], pts: r[2],
  f: 10 + r[3], c: 10, badge: '', zone: '', ours: r[0] === CLUB }));

// ── the real renderers, over stubs ────────────────────────────────────────
/* The Inici block whole: the helpers, renderPlayerHome, the week list and
   both pill builders. Sliced rather than reimplemented — the point of the
   preview is that the geometry on screen is the geometry the app ships. */
// Anchored on the segment table — a declaration, not the paragraph above it.
// This marker was a doc comment for one version and broke the moment that
// comment was deleted.
const HELPERS = grab('  const INI_SEGS = [', '  function renderPlayerHome() {');
const PLAYER = grab('  function renderPlayerHome() {', '  // #endregion FCF League Scraper');
const WEEKS = grab('  function getWeekBounds(offset) {', '  // sanitize → utils.js');
const LEAGUE = grab('  function iniLeagueRowHtml(r) {', '  function applyLeagueRows(container, rows)') +
  grab('  function buildLeagueSnippet(title, rows, snippetId) {',
      '  /* ═══════════════════════════════════════════════════════════\n' +
      '     Sancions and Top Scorers');
const STAFF = grab('  function renderStaffWeek(weekOffset, players, letter) {',
    '  let medicalDetailPlayerId = null;');

/**
 * Build one render of a page.
 * @param {'player'|'staff'} which
 * @param {object} data avail/matchAvail/sent maps and the lock flag
 */
function render(which, data) {
  const store = {
    fa_training_availability: JSON.stringify(data.avail || {}),
    fa_training_staff_override: '{}',
    fa_match_availability: JSON.stringify(data.matchAvail || {}),
    fa_convocatoria_sent: JSON.stringify(data.sent || {}),
    fa_convocatoria_callup: JSON.stringify(data.callup || {}),
    fa_matches: JSON.stringify(data.matches === undefined ? MATCHES : data.matches),
    fa_injuries: JSON.stringify(data.injuries || []),
    fa_injury_notes: JSON.stringify(data.injuryNotes || {}),
    fa_match_events: '{}',
  };
  const trainings = data.trainings === undefined ? TRAININGS : data.trainings;

  const env = {
    localStorage: {
      getItem: (k) => (k in store ? store[k] : null),
      setItem: (k, v) => { store[k] = v; },
    },
    sanitize: esc,
    t,
    tv: (k, vars) => t(k).replace(/\{(\w+)\}/g, (m, n) =>
      (vars && n in vars ? String(vars[n]) : m)),
    tDay: (d) => DAYS[d],
    tMonth: (m) => MONTHS[m],
    tDayDDMM: (d) => {
      const x = new Date(d + 'T12:00:00');
      return DAYS[x.getDay()] + ' ' + x.getDate() + ' ' + MONTHS[x.getMonth()];
    },
    localDateStr: iso,
    getSession: () => ({ id: ME.id, name: ME.name, playerNumber: ME.playerNumber,
      category: 'amateur', team: 'A', position: ME.position, profilePic: '' }),
    getUsers: () => PLAYERS,
    getTrainings: () => trainings,
    playerTrainings: (u, list) => list,
    trainingOnly: (list) => list.filter((x) => x.kind !== 'activity'),
    isActivity: (r) => r.kind === 'activity',
    activityTitleOf: (r, fallback) => r.title || r.focus || fallback,
    getClubName: () => CLUB,
    clubBadgeUrl: () => BADGE,
    isOurTeam: (n) => n === CLUB,
    getCurrentCategory: () => 'amateur',
    // The squad chip the category bar writes. Held outside the render in the
    // app; 'all' is what a coach who has not picked a letter sees.
    iniTeamFilter: 'all',
    CATEGORY_LABELS: { amateur: 'Amateur', juvenil: 'Juvenil', cadet: 'Cadet' },
    posCirclesHtmlGlobal: (p) => String(p.position || '').split(',')
        .map((s) => s.trim()).filter(Boolean).map((pos) => {
          const C = { GK: '#f9a825', CB: '#1e88e5', LB: '#1e88e5', RB: '#1e88e5',
            DM: '#43a047', OM: '#43a047', LW: '#e53935', RW: '#e53935', ST: '#e53935' };
          return '<span class="conv-pos-circle" style="background:' +
            (C[pos] || '#9e9e9e') + '">' + pos + '</span>';
        }).join(''),
    matchLabel: (m) => (m.home === CLUB
      ? '<span class="md-our-club">' + esc(m.home) + '</span>' : esc(m.home)) +
      ' — ' + (m.away === CLUB
      ? '<span class="md-our-club">' + esc(m.away) + '</span>' : esc(m.away)),
    // A match runs to full time; a session to its end time. Both preview
    // states want everything visible, so nothing is dropped as finished.
    matchEndsAt: () => null,
    sessionEndsAt: () => null,
    sessionWindow: () => null,
    isTrainingLocked: (tr) => !!(data.locked && tr.id === data.locked),
    trainingLockAt: () => null,
    trainingLockedTitle: () => 'Respostes tancades a les 15:30',
    availContext: () => ({}),
    getEffectiveAnswer: (uid, sess) => (data.avail || {})[uid + '_' + sess.id] || 'yes',
    readRecord: (map, uid, sess) => (sess ? map[uid + '_' + sess.id] : '') || '',
    recordKey: (uid, sess) => uid + '_' + sess.id,
    resolveKitPieces: () => null,
    clubKits: () => [],
    kitIconsHtml: () => '',
    computePlayerMatchStats: () => ({
      totals: { matches: 6, minutes: 412, goals: 3, assists: 2, titulars: 5 },
      matchRows: [{ yellows: 2, reds: 0 }],
    }),
    computeReadiness: (id) => {
      const n = Number(String(id).slice(1)) || 1;
      const acwr = n === 1 ? 1.62 : n === 10 ? 1.48 : 0.95 + (n % 5) * 0.05;
      return { hasData: true, score: 100 - n * 2, acwr,
        color: n === 1 ? 'red' : n === 10 ? 'orange' : 'green',
        underloaded: false,
        weeks: [0, 1, 2, 3].map((w) => ({ week: '2026-W0' + (w + 1),
          acute: Math.round([1840, 2120, 2340, 2610][w] / PLAYERS.length),
          chronic: 100, ratio: 1 })) };
    },
    shomeLinkAttrs: (link, id) => ' data-shome-link="' + link + '" data-shome-id="' + esc(id) + '"',
    canEditPage: () => true,
    getActiveFcfLeagues: () => [{ id: 'league-amateur-A', title: 'Amateur A', url: '' }],
    _leagueCache: { 'league-amateur-A': STANDINGS },
    JSON,
    Math,
    Date: PreviewDate,
    Object,
    String,
    Number,
    Array,
  };

  const body = which === 'player'
    ? 'return renderPlayerHome();'
    : 'return renderStaffHome(getSession());';
  // eslint-disable-next-line no-new-func
  return new Function(...Object.keys(env), `
    ${HELPERS}
    ${PLAYER}
    ${WEEKS}
    ${LEAGUE}
    ${STAFF}
    ${body}
  `)(...Object.values(env));
}

// ── the six states ────────────────────────────────────────────────────────
const SENT = { 101: { players: PLAYERS.slice(0, 18).map((p) => p.id) } };
const INJURIES = [
  { playerId: 'u7', status: 'active', muscleGroup: 'Isquiotibial',
    description: '2 setm.', expectedReturn: day(14) },
  { playerId: 'u8', status: 'recovering', muscleGroup: 'Turmell',
    description: 'reincorporació', expectedReturn: day(8) },
];
const MIXED_AVAIL = {};
PLAYERS.forEach((p, i) => {
  if (i % 7 === 0) return;                   // some have not answered
  TRAININGS.forEach((tr, j) => {
    const v = ['yes', 'yes', 'yes', 'late', 'no', 'injured'][(i + j) % 6];
    MIXED_AVAIL[p.id + '_' + tr.id] = v;
  });
});

const STATES = [
  ['player-open', 'Jugador · res respost', 'player', {}],
  ['player-mixed', 'Jugador · respostes, convocatòria enviada, sessió tancada',
    'player', { avail: { u1_t1: 'yes', u1_t2: 'late', u1_t4: 'no', u1_t5: 'injured' },
      matchAvail: { u1_102: 'disponible' }, sent: SENT, locked: 't2',
      callup: { 101: '18:15', 102: '16:45' },
      injuryNotes: { u1: 'Molèstia isquio dret' } }],
  ['player-empty', 'Jugador · quinzena buida', 'player',
    { trainings: [], matches: [] }],
  ['staff-default', 'Staff · convocatòria pendent', 'staff',
    { avail: MIXED_AVAIL, injuries: INJURIES }],
  ['staff-sent', 'Staff · convocatòria enviada', 'staff',
    { avail: MIXED_AVAIL, injuries: INJURIES, sent: SENT }],
];

const boards = STATES.map(([id, label, which, data]) => {
  const html = render(which, data);
  return '<section class="pv-board" id="pv-' + id + '">' +
    '<div class="pv-cap">' + esc(label) + '</div>' +
    '<div class="pv-frame">' + html + '</div></section>';
}).join('\n');

/* ⚠ NO FIXED-WIDTH FRAME, AND THAT IS THE WHOLE POINT.
   The first version of this script put the desktop boards in a 1440px div
   and the phone boards in a 390px one, side by side in one file. It renders
   — and it is a lie: `@media` keys off the VIEWPORT, not the container, so
   the 390px box showed the desktop rules squeezed into a phone's width, and
   the 44px hit targets this redesign exists to get right were nowhere on
   screen. The boards are full-width and the VIEWPORT is what you change:

     chrome --headless --window-size=1440,3000 --screenshot=…
     chrome --headless --window-size=390,3000  --screenshot=…

   Two runs, two truths. One file that claims both is neither. */
const CHROME = `
  html, body { margin:0; padding:0; background:#E9E6E0; }
  .pv-wrap { display:flex; flex-direction:column; gap:40px; padding:24px 0; }
  .pv-cap { font:12px/1.4 'Oswald','Arial Narrow',sans-serif; letter-spacing:.16em;
            text-transform:uppercase; color:#6B645E; padding:0 24px 10px; }
  /* The dashboard's own 1rem padding, which .ini-page's margin:-1rem breaks
     out of. Without it the hero band stops short of the edge here and
     nowhere else, and the preview lies about the one thing it is for. */
  .pv-frame { background:#FBFAF7; padding:1rem; border-top:1px solid #C9C3BB;
              border-bottom:1px solid #C9C3BB; }
  /* .ini-page fills the viewport in the app, which is right there and is
     five screens of blank paper between boards here. Preview chrome only —
     nothing else in this stylesheet touches the page under test. */
  .pv-frame .ini-page { min-height:0; }
`;

const html = `<!doctype html>
<html lang="ca"><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>EsquerrApp · Inici (v230) — preview</title>
<link href="https://fonts.googleapis.com/css2?family=Oswald:wght@300;400;500;600;700&display=swap" rel="stylesheet">
<style>${cssSrc}</style>
<style>${CHROME}</style>
</head><body><div class="pv-wrap">
${boards}
</div></body></html>`;

fs.writeFileSync(OUT, html, 'utf8');
console.log('wrote ' + path.relative(ROOT, OUT) + '  ' +
  Math.round(html.length / 1024) + ' KB  ' + STATES.length + ' states');
console.log('render it at BOTH widths — the media queries key off the viewport:');
console.log('  chrome --headless --window-size=1440,4000 --screenshot=desk.png ' +
  path.basename(OUT));
console.log('  chrome --headless --window-size=390,4000  --screenshot=phone.png ' +
  path.basename(OUT));
