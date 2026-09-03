/* Build a self-contained mockup of the Convocatòria tab (v227).
 *
 * Same convention as build-partit-preview.js and
 * build-training-plan-preview.js: the `cv*` builders — the title band, the
 * three controls, both lists, the Pissarres band, the video rows and the
 * footer — are the REAL functions, sliced out of js/app.js with the same
 * grab() the test suite uses, over the real kit SVGs and the real Catalan
 * strings. So the markup here is not an approximation of what the app
 * produces; it IS what the app produces.
 *
 * The page is rendered THREE times, because each answers a question a
 * screenshot of one state cannot:
 *
 *   staff   — the default. Eighteen in the pool, eight on the acta, one
 *             injured and one who said no, both faded and inert.
 *   over    — nineteen convoked, so the count and the column note go red.
 *             The 18-man limit is the only thing on this page that changes
 *             colour on its own and it is easy to ship broken.
 *   delegate — read-only. No handles, no glyphs, no picker, no buttons —
 *             and the fixture picker STILL there, which is the one control
 *             that stays live for a reader.
 *
 * The crests and the boards are stand-in: in the app the first are real FCF
 * badge URLs and the second the real read-only boards, which need a network
 * and a registry respectively.
 *
 * css/style.css is inlined whole so the file can be handed to a design tool
 * with nothing else attached.
 *
 * Run from the repo root:
 *
 *   node scripts/build-convocatoria-preview.js . convocatoria-preview.html
 *
 * The output is REGENERATED, never hand-edited: it is a view of js/app.js,
 * and a hand-patched copy would drift the moment either changed with
 * nothing to detect it. The name must keep the `-preview.html` suffix —
 * scripts/build-www.js excludes the APK mirror on that pattern, and
 * _config.yml names the file to keep it off GitHub Pages.
 */
const fs = require('fs');
const path = require('path');
const assert = require('assert');

const ROOT = path.resolve(process.argv[2] || '.');
const OUT = path.resolve(process.argv[3] || 'convocatoria-preview.html');

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

const BLOCK = grab('  /* ---------- Convocatòria, redesigned (v227)',
    '  function renderAdminUsers()');

/* Catalan only, taken from the real table rather than retyped: a mockup
   showing wording the app does not have is worse than no mockup. */
const STRINGS = (() => {
  const out = {};
  const re = /'((?:cv|conv|pt|mn|page|btn|misc)\.[a-z0-9_]+)':\s*\{ ca:'((?:[^'\\]|\\.)*)'/g;
  let m;
  while ((m = re.exec(appSrc))) out[m[1]] = m[2].replace(/\\'/g, '\'');
  assert.ok(Object.keys(out).length > 40,
      'the i18n strings were not found — did the table move?');
  assert.ok(out['cv.intro'], 'the cv. block is missing');
  return out;
})();

/* The kit SVGs are the real ones — they are the subject of the Equipació
   control and a coloured rectangle would not show the stripes. */
const KITS = (() => {
  /* utils.js is loaded WHOLE rather than sliced: parseFill, stripeSvg and
     fillCss call each other and sit hundreds of lines apart, and a slice
     that missed one died at the first striped kit. It is a plain script
     with no DOM at load, which is what makes this cheap. */
  const utils = fs.readFileSync(path.join(ROOT, 'js', 'utils.js'), 'utf8');
  /* From `let _kitUid` — the counter the stripe ids are numbered off — and
     not from KIT_ICON_PX below it: slicing from the constant left shirtSvg
     referring to a variable it did not contain. */
  const svg = grab('  let _kitUid = 0;', '  /* ---------- Convocatòria, redesigned');
  /* utils.js declares its own sanitize() over document.createElement, which
     is the one thing in it that needs a DOM. Reassigning the binding after
     the file is the smallest fix — a function declaration is mutable, and
     the escaping is identical. */
  // eslint-disable-next-line no-new-func
  return new Function('_esc', 'clubBadgeUrl', 'window', 'document',
      utils + '\nsanitize = _esc;\n' + svg +
      '\n return {shirtSvg, shortsSvg, kitSockSvg};')(
      esc, () => 'img/logo-192.png', {}, {addEventListener: () => {}});
})();

/* utils.js does not export posCirclesHtmlGlobal and it needs no DOM — this
   is the markup its callers produce, and the discs are restyled to 24px by
   the `.cv-page .conv-pos-circle` override, not by anything here. */
function posCircles(p) {
  const COLORS = {GK: '#f9a825', CB: '#1e88e5', LB: '#1e88e5', RB: '#1e88e5',
    DM: '#43a047', OM: '#43a047', LW: '#e53935', RW: '#e53935', ST: '#e53935'};
  return String(p.position || '').split(',').map((s) => s.trim()).filter(Boolean)
      .map((pos) => '<span class="conv-pos-circle" style="background:' +
        (COLORS[pos] || '#9e9e9e') + '">' + pos + '</span>').join('');
}

const CLUB = 'U.E. Esquerra';
/* A crest shaped like a real one: a shield, transparent outside its own
   outline. That is the whole reason a disc behind it is wrong — the circle
   shows through the corners and reads as a second, wrong badge. */
const BADGE = 'data:image/svg+xml,' + encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 44">' +
    '<path d="M4 3h32v22c0 10-16 16-16 16S4 35 4 25z" fill="#1B4F91" ' +
    'stroke="#0E2A4E" stroke-width="2"/>' +
    '<path d="M4 14h32v7H4z" fill="#E4B93C"/>' +
    '<text x="20" y="35" font-family="Arial" font-size="9" font-weight="bold" ' +
    'fill="#fff" text-anchor="middle">CFV</text></svg>');
const MATCHES = [
  {id: 1, home: CLUB, away: 'C.F. Vallcarca', awayBadge: BADGE,
    date: '2099-10-05', time: '20:00',
    status: 'upcoming', fcfJornada: 3, category: 'amateur', team: 'A'},
  {id: 2, home: 'C.E. Sant Andreu', away: CLUB, date: '2099-10-12', time: '18:30',
    status: 'upcoming', fcfJornada: 4, category: 'amateur', team: 'A'},
  {id: 3, home: CLUB, away: 'A.E. Poblenou', date: '2099-10-20', time: '12:30',
    status: 'upcoming', fcfJornada: 5, category: 'amateur', team: 'A'}
];

/* The handoff's own squad, so the mockup and the design file can be laid
   side by side. `fit` is the medical record; `ma` is the player's own
   answer about this fixture — the two sources the availability column
   merges, with the medical one winning. */
const SQUAD = [
  {n: '1', name: 'Guillem Roca', position: 'GK', team: 'A', ma: 'disponible'},
  {n: '5', name: 'Marc Vidal', position: 'CB,RB', team: 'A', ma: 'disponible'},
  {n: '4', name: 'Èric Fontana', position: 'CB', team: 'A', ma: 'disponible'},
  {n: '3', name: 'Adrià Sala', position: 'LB', team: 'A', ma: 'disponible'},
  {n: '6', name: 'Oriol Ferrer', position: 'DM', team: 'A', ma: 'disponible'},
  {n: '10', name: 'Arnau Puig', position: 'OM', team: 'A', ma: 'disponible'},
  {n: '11', name: 'Pol Serrat', position: 'LW', team: 'A', ma: 'disponible', fit: 'doubt'},
  {n: '9', name: 'Iker Ramos', position: 'ST', team: 'A', ma: 'disponible'},
  {n: '2', name: 'Biel Cortés', position: 'RB', team: 'A', ma: 'disponible'},
  {n: '8', name: 'Jan Prats', position: 'DM,OM', team: 'A'},
  {n: '7', name: 'Roc Amat', position: 'RW', team: 'A', ma: 'disponible'},
  {n: '13', name: 'Aleix Duran', position: 'GK', team: 'B', cat: 'juvenil', ma: 'disponible'},
  {n: '14', name: 'Nil Bosch', position: 'OM', team: 'A', ma: 'disponible'},
  {n: '15', name: 'Ferran Mas', position: 'CB', team: 'A'},
  {n: '12', name: 'Marçal Vila', position: 'LB', team: 'B', cat: 'juvenil', ma: 'disponible'},
  {n: '16', name: 'Pau Riera', position: 'DM', team: 'A', ma: 'disponible', fit: 'injured'},
  {n: '17', name: 'Hugo Lara', position: 'ST', team: 'A', ma: 'no_disponible'},
  {n: '18', name: 'Sergi Nadal', position: 'RW', team: 'B', cat: 'juvenil', ma: 'disponible'}
];
const USERS = SQUAD.map((p, i) => ({
  id: 'p' + i, name: p.name, roles: ['player'], playerNumber: p.n,
  position: p.position, team: p.team, category: p.cat || 'amateur'
}));
const FIT = {};
const AVAIL = {};
/* Readiness scores, spread across the three bands and one no-data, because
   the point of the column is that the colours differ. Invented — the real
   figure comes from an RPE history this file has no business faking. */
const READINESS = {};
const RD = [{c: 'green', n: 88}, {c: 'green', n: 76}, {c: 'orange', n: 64},
  {c: 'green', n: 91}, {c: 'orange', n: 58}, {c: 'red', n: 47}, null];
SQUAD.forEach((p, i) => {
  if (p.fit) FIT['p' + i] = p.fit;
  if (p.ma) AVAIL['p' + i + '_1'] = p.ma;
  READINESS['p' + i] = RD[i % RD.length];
});

const CALLED = ['p0', 'p1', 'p2', 'p3', 'p4', 'p5', 'p6', 'p7'];
const LIBRARY = [
  {id: 'b1', name: 'Pressió alta 4-3-3', frameCount: 4, hasFrames: true},
  {id: 'b2', name: 'Córner defensiu', frameCount: 1, hasFrames: false},
  {id: 'b3', name: 'Sortida de pilota — anada', frameCount: 2, hasFrames: true},
  {id: 'b4', name: 'Transicions per banda', frameCount: 3, hasFrames: true}
];

function store(over) {
  return Object.assign({
    fa_matches: JSON.stringify(MATCHES),
    fa_convocatoria: JSON.stringify({1: CALLED}),
    fa_convocatoria_sent: '{}',
    fa_convocatoria_callup: JSON.stringify({1: '18:45'}),
    fa_convocatoria_uniform: JSON.stringify({1: {shirtId: 'k1', shortsId: 'k1', socksId: 'k1'}}),
    fa_convocatoria_videos: JSON.stringify({1: [
      {title: 'https://youtu.be/rival-pressing-3-1', url: 'https://youtu.be/rival-pressing-3-1',
        comment: 'Com surten de la pressió des del porter. Minuts 4 i 27.'},
      {title: 'https://drive.google.com/anada-corners', url: 'https://drive.google.com/anada-corners',
        comment: 'Els seus córners de l\'anada.'}
    ]}),
    fa_match_availability: JSON.stringify(AVAIL),
    fa_tactic_match_boards: JSON.stringify({1: [
      {boardId: 'b1', name: 'Pressió alta 4-3-3', tag: ''},
      {boardId: 'b3', name: 'Sortida de pilota — anada', tag: ''}
    ]})
  }, over || {});
}

function render(opts) {
  const STORE = store(opts.store);
  const users = opts.users || USERS;
  // eslint-disable-next-line no-new-func
  const R = new Function(
      't', 'sanitize', 'canEditPage', 'localStorage', 'getCurrentCategory',
      'getVisibleCategories', 'getUsers', 'fitnessContext',
      'deriveFitnessStatus', 'playerStatusHtml', 'catSpanOf',
      'catBadgeHtmlGlobal', 'posRankGlobal', 'posCirclesHtmlGlobal',
      'isOurTeam', 'getClubName', 'ptCrestHtml', 'ptOurSide', 'tDateShort',
      'clubKits', 'shirtSvg', 'shortsSvg', 'kitSockSvg', 'safeHttpUrl',
      'viewOnlyBanner', 'TB', 'tbLinkedKey', 'convSelectedMatchId',
      'convTeamFilter',
      BLOCK + '\n return renderConvocatoria;')(
      (k) => (STRINGS[k] !== undefined ? STRINGS[k] : k),
      esc,
      () => !opts.ro,
      {getItem: (k) => (k in STORE ? STORE[k] : null), setItem: () => {}},
      () => '',
      () => ['amateur', 'juvenil'],
      () => users,
      () => ({}),
      (id) => ({fitnessStatus: FIT[id] || 'fit'}),
      /* The REAL markup, not a stand-in: the medical glyph and the readiness
         cell are restyled by this page's own CSS, and a `[FIT:…]` token
         would show none of it. The SCORE is invented per player —
         computeReadiness needs a whole RPE history — but the classes it
         chooses are the ones the app chooses. */
      (p) => {
        const st = FIT[p.id] || 'fit';
        const rd = READINESS[p.id];
        const cell = rd
          ? '<span class="readiness-cell"><span class="readiness-dot readiness-' + rd.c +
            '"></span><span class="readiness-score readiness-score-' + rd.c + '">' +
            rd.n + '</span></span>'
          : '<span class="readiness-cell"><span class="readiness-dot readiness-nodata"></span></span>';
        return '<span class="roster-status-icon roster-status-' + st + '">' +
          (st === 'fit' ? '✓' : st === 'doubt' ? '?' : '✕') + '</span>' + cell;
      },
      (rows) => new Set(rows.map((r) => r.category).filter(Boolean)).size > 1,
      (p, span) => (span && p.category === 'juvenil' ? '<span class="cat-badge">J</span>' : ''),
      (p) => ['GK', 'CB', 'LB', 'RB', 'DM', 'OM', 'LW', 'RW', 'ST']
          .indexOf(String(p.position || '').split(',')[0].trim()),
      posCircles,
      (n) => n === CLUB,
      () => CLUB,
      /* Both halves of the real `ptCrestHtml`, because the point of this
         control is that they look different: a club we HAVE a badge for
         gets a bare <img> with no ground at all, and one we do not gets the
         monogram on a squared-off ground. The badge is a data: URI —
         files.fcf.cat is someone else's host and a preview must not depend
         on it — but it takes the same `.pt-crest` class the app gives it. */
      (m, side) => (m[side + 'Badge']
        ? '<img src="' + m[side + 'Badge'] + '" class="pt-crest" alt="">'
        : '<span class="pt-crest pt-crest-mono">' +
          String(m[side]).replace(/[^\p{L}\p{N} ]/gu, ' ').trim().split(/\s+/)
              .slice(0, 2).map((w) => w.charAt(0)).join('').toUpperCase() + '</span>'),
      (m) => (m.home === CLUB ? 'home' : 'away'),
      (d) => {
        const DAYS = ['Diumenge', 'Dilluns', 'Dimarts', 'Dimecres', 'Dijous', 'Divendres', 'Dissabte'];
        const MON = ['gen', 'febr', 'març', 'abr', 'maig', 'juny', 'jul', 'ag', 'set', 'oct', 'nov', 'des'];
        const dt = new Date(d + 'T12:00:00');
        return DAYS[dt.getDay()] + ' ' + dt.getDate() + ' ' + MON[dt.getMonth()];
      },
      () => [
        {id: 'k1', label: '1a equipació', shirt: 'red', shorts: '#1a1a1a', socks: 'red'},
        {id: 'k2', label: '2a equipació', shirt: 'white', shorts: 'white', socks: 'white'},
        {id: 'k3', label: '3a equipació', shirt: 's|v|9|#111|#f2c200', shorts: '#111', socks: '#111'}
      ],
      KITS.shirtSvg, KITS.shortsSvg, KITS.kitSockSvg,
      (u) => (/^https?:\/\//i.test(String(u || '').trim()) ? String(u).trim() : ''),
      () => '<div class="view-only-banner">' + (STRINGS['misc.view_only'] ||
        'Només lectura') + '</div>',
      {ready: () => true, library: () => LIBRARY,
        meta: (id) => LIBRARY.find((b) => b.id === id) || null},
      (b) => (b.boardId ? 'id:' + b.boardId : 'name:' + (b.name || '')),
      1,
      /* Passed even though this preview never sets a category, and so never
         reaches it: `convLetter` reads `curCat && convTeamFilter !== 'all'`,
         and a falsy curCat short-circuits before the identifier is
         evaluated. That is luck, not design — the first fixture here with a
         category would throw a bare ReferenceError, and the assertions
         below would report it as "no player rows rendered". */
      'all');
  return R();
}

/* The handoff's squad is eighteen, so an over-the-limit state needs a
   nineteenth man rather than "everybody" — calling all eighteen is exactly
   the limit and would have shown the green count, which is the state this
   render exists to NOT show. */
const PLUS_ONE = USERS.concat([{id: 'p18', name: 'Ot Bonet', roles: ['player'],
  playerNumber: '19', position: 'CB', team: 'A', category: 'amateur'}]);
const staff = render({});
const over = render({users: PLUS_ONE,
  store: {fa_convocatoria: JSON.stringify({1: PLUS_ONE.map((u) => u.id)})}});
const delegate = render({ro: true});

/* The file is not written if the three states did not actually come out
   different — a preview that silently rendered the same page three times is
   worse than none, because it looks like evidence. */
assert.ok(staff.includes('cv-row'), 'no player rows rendered');
assert.ok(!/cv-big cv-over/.test(staff), 'the default state should not be over the limit');
assert.ok(/cv-big cv-over/.test(over), 'nineteen convoked did not flag the count');
assert.ok(!delegate.includes('data-cv-move'), 'the delegate page still carries the glyphs');
assert.ok(delegate.includes('data-cv-menu="match"'),
    'the delegate lost the fixture picker, which stays live for a reader');
assert.strictEqual((staff.match(/cv-row-off/g) || []).length, 2,
    'exactly two players are unavailable in this fixture');

const html = `<!DOCTYPE html>
<html lang="ca">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>EsquerrApp — Convocatòria (v227)</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Oswald:wght@200;300;400;500;600;700&display=swap" rel="stylesheet">
<style>
${cssSrc}
</style>
<style>
/* Mockup shell only — NOT part of the app. The real page renders inside
   #dashboard-content within the dashboard sidebar layout; this stands in
   for it, including the 1rem padding .cv-page is built to negate. */
body { margin:0; background:#E9E6E0; font-family:'Oswald','Arial Narrow',sans-serif; }
.mock-note {
  background:#2D2926; color:#e0ddd9; padding:.7rem 1.2rem;
  font-size:.82rem; line-height:1.5;
}
.mock-note b { color:#FFD662; }
.mock-shell { padding:1rem; background:#FBFAF7; }
/* .cv-page fills the viewport in the app, where it is the only page on
   screen. Four of them stacked would each be a screenful tall. */
.mock-shell .cv-page { min-height:0; }
.mock-label {
  background:#FBFAF7; color:#99928B; padding:1.4rem 1.2rem .2rem;
  font-size:11px; letter-spacing:.16em; text-transform:uppercase;
}
/* The menus are closed in a static file — nothing can click them — so the
   three that matter are pinned open here to be looked at. Presentation
   only: the app renders them hidden and bindConvocatoria opens them. */
.mock-open [data-cv-menu="match"] .cv-menu-m,
.mock-open [data-cv-menu="kit-shirtId"] .cv-menu-m,
.mock-open [data-cv-menu="boards"] .cv-menu-m { display:block !important; }
.mock-open .cv-lists, .mock-open .cv-foot { display:none; }
.mock-open .cv-band:last-of-type { display:none; }
.mock-open .cv-page { padding-bottom:200px; }
</style>
</head>
<body>
<div class="mock-note">
  <b>EsquerrApp v227 — Convocatòria, rebuilt to the Claude Design handoff.</b>
  The <b>title band</b>, the <b>three controls</b>, <b>both lists</b>, the
  <b>Pissarres band</b>, the <b>video rows</b> and the <b>footer</b> are rendered by
  the app's real functions and real CSS, over the real Catalan strings and the real
  kit SVGs. <b>Vallcarca's crest is an image and Esquerra's is a monogram</b>, which is
  the contrast worth checking: neither sits in a circle here, so a transparent badge is
  never drawn on a shape its club did not design. The <b>readiness scores are invented</b>
  (the real figure needs an RPE history) but the classes are the app's; the board
  thumbnails are the designed placeholder — in the app, clicking one opens the real
  read-only board beneath the row.
  Five departures from the handoff, all in CONTEXT.md: classes are <b>cv-</b>, not
  <b>conv-</b>, which six other surfaces still use; there is <b>no “Tard”</b> state
  because nothing in the app produces one; <b>unsend is kept</b> and “Buida-ho tot”
  dropped; drop-on-row inserts in <b>Convocats only</b>; and the board thumbnail
  <b>expands</b> rather than drawing a live 34×24 pitch.
  Generated ${new Date().toISOString().slice(0, 10)}.
</div>

<div class="mock-label">1 · Staff — the default. Pau Riera is injured, Hugo Lara said no; both faded and undraggable.</div>
<div class="mock-shell">
${staff}
</div>

<div class="mock-label">2 · The three menus open — fixture, samarreta, pissarra</div>
<div class="mock-shell mock-open">
${staff}
</div>

<div class="mock-label">3 · Nineteen convoked — the count and the column note go red at 18</div>
<div class="mock-shell">
${over}
</div>

<div class="mock-label">4 · Delegate, read-only — no handles, no glyphs, no picker, no buttons; the fixture picker stays</div>
<div class="mock-shell">
${delegate}
</div>

</body>
</html>
`;

fs.writeFileSync(OUT, html, 'utf8');
console.log('wrote ' + OUT + ' (' + Math.round(html.length / 1024) + ' KB)');
console.log('staff: ' + (staff.match(/cv-row/g) || []).length + ' rows, ' +
    (staff.match(/cv-row-off/g) || []).length + ' unavailable, ' +
    (staff.match(/data-cv-link=/g) || []).length + ' boards left to link');
