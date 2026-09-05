/* Build a self-contained mockup of the Mèdic pages (v234).
 *
 * Same convention as build-inici-preview.js, build-convocatoria-preview.js,
 * build-partit-preview.js and build-training-plan-preview.js: the renderers
 * are the REAL ones, sliced out of js/app.js with the same grab() the test
 * suite uses, over the real Catalan strings. The markup here is not an
 * approximation of what the app produces; it IS what the app produces.
 *
 * ⚠ WHY THIS EXISTS, given 68 assertions in test/medical.test.js.
 * A string-builder test cannot see geometry. Three real defects in this
 * project were found by rendering a preview with the whole suite already
 * green — a dropdown laying its two lines side by side, a control with no
 * rule on the shared baseline, and a button ordered before the count it
 * belonged to. This page is a hero band of four counters beside a wrapping
 * subline, a 400px rail against a fluid column, and a five-stat row that has
 * to share a baseline: the same shapes.
 *
 * Six states, because each answers a question a screenshot of one cannot:
 *
 *   dashboard   — the full page: two pending self-reports (one of them
 *                 blank, which is the italic row), five open injuries across
 *                 both statuses, a season of closed ones, the heat map.
 *   empty       — a squad with nothing wrong. The one state where a page of
 *                 empty rails is all there is, and it must still read as an
 *                 answer rather than as a broken renderer.
 *   bare        — seven players whose availability says injured with no
 *                 record logged: the older half of Autoreports pendents,
 *                 which renders italic because nobody described anything.
 *   closed-only — a season of history and nobody currently out.
 *   file        — one player's medical file, with the recurrence band, the
 *                 marker on the open zone and three attached documents.
 *   readonly    — the dashboard as a view-only staff member sees it: every
 *                 action is a word, not a button.
 *
 * ⚠ Render at BOTH widths. `@media` keys off the viewport, so there is no
 * fixed-width frame here — see the note above CHROME.
 * ⚠ And `--window-size` does not set the layout viewport below ~485 CSS px
 * on this machine: headless Chrome clamps the window, lays the page out at
 * 485 and crops the bitmap. Use Emulation.setDeviceMetricsOverride over the
 * DevTools protocol for the phone shot and have the probe print
 * document.documentElement.clientWidth back, so a run cannot lie about it.
 *
 * Run from the repo root:
 *
 *   node scripts/build-medical-preview.js . medical-preview.html
 *
 * The output is REGENERATED, never hand-edited: it is a view of js/app.js,
 * and a hand-patched copy would drift the moment either changed with nothing
 * to detect it. The name must keep the `-preview.html` suffix — and it must
 * ALSO be listed by name in _config.yml, because GitHub Pages excludes by
 * name and not by that pattern. A preview has shipped live once.
 */
const fs = require('fs');
const path = require('path');
const assert = require('assert');

const ROOT = path.resolve(process.argv[2] || '.');
const OUT = path.resolve(process.argv[3] || 'medical-preview.html');

const appSrc = fs.readFileSync(path.join(ROOT, 'js', 'app.js'), 'utf8');
const cssSrc = fs.readFileSync(path.join(ROOT, 'css', 'style.css'), 'utf8');
const utils = require(path.join(ROOT, 'js', 'utils.js'));

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
  const re = /'((?:md2|medical|injury_log|cat|common|fitness)\.[a-z0-9_]+)':\s*\{ ?ca:'((?:[^'\\]|\\.)*)'/g;
  let m;
  while ((m = re.exec(appSrc))) out[m[1]] = m[2].replace(/\\'/g, '\'');
  assert.ok(out['md2.pending'], 'the md2. block is missing — did the table move?');
  assert.ok(Object.keys(out).length > 80, 'too few strings found');
  return out;
})();
const t = (k) => (k in STRINGS ? STRINGS[k] : k);
const tv = (k, vars) => t(k).replace(/\{(\w+)\}/g,
    (m, n) => (Object.prototype.hasOwnProperty.call(vars || {}, n) ? String(vars[n]) : m));

const DAYS = ['diumenge', 'dilluns', 'dimarts', 'dimecres', 'dijous', 'divendres', 'dissabte'];
const MONTHS = ['gen', 'feb', 'mar', 'abr', 'mai', 'jun',
  'jul', 'ago', 'set', 'oct', 'nov', 'des'];

function iso(d) {
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') +
    '-' + String(d.getDate()).padStart(2, '0');
}
/* ⚠ "Now" is pinned to Monday 09:00 of the current week. Every duration on
   this page is measured against today, so a preview built on a Thursday
   would print different day counts from one built on a Monday — the file
   would differ from itself depending on when it was generated, which is not
   a reference, and a before/after pixel diff would mean nothing. */
const REAL_NOW = new Date();
const MON = new Date(REAL_NOW.getFullYear(), REAL_NOW.getMonth(),
    REAL_NOW.getDate() + (REAL_NOW.getDay() === 0 ? -6 : 1 - REAL_NOW.getDay()));
const day = (n) => iso(new Date(MON.getFullYear(), MON.getMonth(), MON.getDate() + n));
const PINNED = new Date(MON.getFullYear(), MON.getMonth(), MON.getDate(), 9, 0, 0);
class PreviewDate extends Date {
  constructor(...args) {
    if (args.length === 0) super(PINNED.getTime());
    else super(...args);
  }
  static now() { return PINNED.getTime(); }
}

const zoneIdx = (label) => utils.BODY_ZONES.findIndex((z) => z.label === label);

// ── fixture squad ─────────────────────────────────────────────────────────
const NAMES = [
  ['p1', 'Gerard Vila', 'LW', 11], ['p2', 'Marc Colom', 'CB', 4],
  ['p3', 'Ignasi Prat', 'RB', 2], ['p4', 'David Mas', 'ST', 9],
  ['p5', 'Jordi Nadal', 'OM', 8], ['p6', 'Kevin Soler', 'ST', 19],
  ['p7', 'Enric Sala', 'RW,ST', 7], ['p8', 'Arnau Ferrer', 'GK', 1],
  ['p9', 'Berta Puig', 'CB', 5], ['p10', 'Carles Roig', 'DM', 6],
  ['p11', 'Hugo Camps', 'LB', 3], ['p12', 'Lluís Bosch', 'OM', 10],
  ['p13', 'Ferran Oller', 'RW', 17], ['p14', 'Pau Riera', 'CB', 15],
  ['p15', 'Oriol Camps', 'DM', 14], ['p16', 'Roc Serra', 'ST', 20],
  ['p17', 'Nil Bosch', 'GK', 13], ['p18', 'Aleix Font', 'LB', 21],
  ['p19', 'Guim Sala', 'RB', 22], ['p20', 'Biel Mas', 'OM', 16],
  ['p21', 'Adrià Puig', 'LW', 18], ['p22', 'Quim Roca', 'CB', 12],
];
const PLAYERS = NAMES.map(([id, name, position, playerNumber]) => ({
  id, name, position, playerNumber, roles: ['player'],
  category: 'amateur', team: 'A',
}));

const TRAININGS = [];
for (let i = -60; i <= 0; i += 3) {
  TRAININGS.push({ id: 'tr' + i, date: day(i), category: 'amateur',
    teams: ['A'], focus: 'Sessió' });
}

const INJ = [
  { id: 'i1', playerId: 'p1', status: 'active', bodyZone: zoneIdx('Hamstring'),
    bodyZoneLabel: 'Hamstring', muscleGroup: 'Hamstrings', muscleSub: 'Biceps Femoris',
    severity: 'severe', startDate: day(-18), expectedReturn: day(7),
    origin: 'match', originLabel: 'Sants', createdByName: 'Nil Ferrer · fisio',
    confirmedBy: 's1',
    notes: 'Elongació de grau 2 confirmada per ecografia. Reavaluació el 8 de setembre abans de reincorporar-se al grup.',
    docs: [
      { name: 'Ecografia isquiotibial 19-08.pdf', size: 1400000, kind: 'PDF',
        by: 'Nil Ferrer · fisio', date: day(-17) },
      { name: 'Informe mèdic CAP Eixample.docx', size: 86000, kind: 'DOCX',
        by: 'Dra. Roca', date: day(-16) },
      { name: 'IMG_2841 — tall coronal.jpg', size: 820000, kind: 'JPG',
        by: 'Nil Ferrer · fisio', date: day(-17) },
    ] },
  { id: 'i2', playerId: 'p2', status: 'active', bodyZone: zoneIdx('Ankle'),
    bodyZoneLabel: 'Ankle', muscleGroup: 'Ankle', muscleSub: 'Lateral Ligament',
    severity: 'moderate', startDate: day(-10), expectedReturn: day(4),
    origin: 'match', originLabel: 'Sants', createdByName: 'Nil Ferrer · fisio',
    confirmedBy: 's1',
    notes: 'Esquinç de turmell al partit contra Sants. Immobilització cinc dies i càrrega progressiva des de dilluns.',
    docs: [{ name: 'Rx turmell.pdf', size: 640000, kind: 'PDF',
      by: 'Nil Ferrer · fisio', date: day(-9) }] },
  { id: 'i3', playerId: 'p3', status: 'active', bodyZone: zoneIdx('Hip / Groin'),
    bodyZoneLabel: 'Hip / Groin', muscleGroup: 'Adductors', muscleSub: 'Adductor Longus',
    severity: 'minor', startDate: day(-5), expectedReturn: day(1),
    origin: 'training', createdByName: 'Nil Ferrer · fisio', confirmedBy: 's1',
    notes: 'Molèstia adductora després de la sessió de dijous. Sense proves; treball de gimnàs mentre no hi hagi dolor.',
    docs: [] },
  { id: 'i4', playerId: 'p4', status: 'recovering', bodyZone: zoneIdx('Calf'),
    bodyZoneLabel: 'Calf', muscleGroup: 'Calves', muscleSub: 'Soleus',
    severity: 'moderate', startDate: day(-24), expectedReturn: day(0),
    origin: 'training', createdByName: 'Nil Ferrer · fisio', confirmedBy: 's1',
    notes: 'Reincorporació parcial al grup des del 30 d\'agost. Sense canvis de direcció fins a l\'alta.',
    docs: [] },
  { id: 'i5', playerId: 'p5', status: 'recovering', bodyZone: zoneIdx('Lower Back'),
    bodyZoneLabel: 'Lower Back', muscleGroup: 'Back', muscleSub: 'Erector Spinae',
    severity: 'minor', startDate: day(-12), expectedReturn: day(2),
    origin: 'training', createdByName: 'Nil Ferrer · fisio', confirmedBy: 's1',
    notes: 'Sobrecàrrega lumbar. Treballa a part la part final de cada sessió.', docs: [] },
  // Two pending self-reports: one described, one left entirely blank.
  { id: 'i6', playerId: 'p6', status: 'active', selfReported: true,
    bodyZone: zoneIdx('Quad'), bodyZoneLabel: 'Quad', muscleGroup: 'Quadriceps',
    muscleSub: 'Rectus Femoris', severity: '', startDate: day(-1),
    origin: 'training', description: 'molèstia', docs: [] },
  { id: 'i7', playerId: 'p7', status: 'active', selfReported: true,
    bodyZone: null, bodyZoneLabel: '', muscleGroup: '', muscleSub: '',
    severity: '', startDate: day(-2), origin: 'match', originLabel: 'Gràcia', docs: [] },
  // Closed, this season.
  { id: 'c1', playerId: 'p9', status: 'resolved', bodyZone: zoneIdx('Ankle'),
    muscleGroup: 'Ankle', muscleSub: 'Lateral Ligament', severity: 'moderate',
    startDate: day(-64), endDate: day(-42), docs: [] },
  { id: 'c2', playerId: 'p1', status: 'resolved', bodyZone: zoneIdx('Hamstring'),
    muscleGroup: 'Hamstrings', muscleSub: 'Biceps Femoris', severity: 'moderate',
    startDate: day(-58), endDate: day(-34), docs: [] },
  { id: 'c3', playerId: 'p11', status: 'resolved', bodyZone: zoneIdx('Calf'),
    muscleGroup: 'Calves', muscleSub: 'Gastrocnemius', severity: 'minor',
    startDate: day(-52), endDate: day(-42), docs: [] },
  { id: 'c4', playerId: 'p10', status: 'resolved', bodyZone: zoneIdx('Knee'),
    muscleGroup: 'Knee', muscleSub: 'Patellar Tendon', severity: 'moderate',
    startDate: day(-48), endDate: day(-27), docs: [] },
  { id: 'c5', playerId: 'p12', status: 'resolved', bodyZone: zoneIdx('Shoulder'),
    muscleGroup: 'Shoulders', muscleSub: 'Rotator Cuff', severity: 'minor',
    startDate: day(-40), endDate: day(-32), docs: [] },
  { id: 'c6', playerId: 'p13', status: 'resolved', bodyZone: zoneIdx('Hip / Groin'),
    muscleGroup: 'Adductors', muscleSub: 'Adductor Longus', severity: 'minor',
    startDate: day(-36), endDate: day(-26), docs: [] },
];

const STATUS = {
  p1: 'injured', p2: 'injured', p3: 'injured', p6: 'injured', p7: 'injured',
  p4: 'doubt', p5: 'doubt',
};

// ── run the real renderers ────────────────────────────────────────────────
/* Two slices, and the second is everything between renderMedical() and the
   logger: md2Counter, md2PendingRow, md2WhenText, md2RailHtml, md2Fig,
   renderMedicalDetail and the document helpers, in the order they are
   declared. Anchored on DECLARATIONS, not on the doc comments above them —
   a slice bounded by a paragraph breaks the day the paragraph is reworded. */
const HELPERS = grab('  const MD2_SHOW_HEATMAP = true;', '  function renderMedical() {');
const PAGE = grab('  function renderMedical() {', '  /** The staff logger (screen 1c)');
assert.ok(PAGE.includes('function renderMedicalDetail()'), 'the detail page fell out of the slice');
assert.ok(PAGE.includes('const MD2_DOC_MAX'), 'the document helpers fell out of the slice');

function render(which, opts) {
  opts = opts || {};
  const injuries = opts.injuries || INJ;
  const env = {
    t, tv, esc,
    sanitize: esc,
    Date: PreviewDate,
    JSON, Math, Object, String, Number, Array, Promise,
    localStorage: { getItem: () => null, setItem: () => {} },
    getUsers: () => PLAYERS,
    getTrainings: () => TRAININGS,
    getInjuries: () => injuries,
    getPlayerInjuries: (uid) => injuries.filter((i) => i.playerId === uid),
    getCurrentCategory: () => 'amateur',
    getVisibleCategories: () => ['amateur'],
    medicalTeamFilter: 'A',
    medicalDetailPlayerId: opts.playerId || 'p1',
    medicalPastExpanded: true,
    canEditPage: () => !opts.readonly,
    viewOnlyBanner: () => '<div class="view-only-banner">Només lectura</div>',
    catSpanOf: () => 1,
    catBadgeHtmlGlobal: () => '',
    /* ⚠ NOT utils.posCirclesHtmlGlobal itself: the real one calls sanitize(),
       which needs a `document`, and this script has none. The COLOURS are
       the real ones — POS_COLORS is exported for exactly this — so the discs
       cannot drift from the app's even though the markup is rebuilt here. */
    posCirclesHtmlGlobal: (p) => {
      const list = (p.position || '').split(',').map((s) => s.trim()).filter(Boolean);
      if (!list.length) return '<span class="conv-pos-circle" style="background:#9e9e9e">—</span>';
      return list.map((pos) => '<span class="conv-pos-circle" style="background:' +
        (utils.POS_COLORS[pos] || '#9e9e9e') + '">' + esc(pos) + '</span>').join('');
    },
    posRankGlobal: utils.posRankGlobal,
    localDateStr: (d) => iso(d || new PreviewDate()),
    seasonStartStr: () => day(-90),
    fitnessContext: () => ({}),
    deriveFitnessStatus: (id) => ({ fitnessStatus: (opts.status || STATUS)[id] || 'fit', injuryNote: '' }),
    playerIsCalled: () => true,
    CATEGORY_LABELS: { amateur: 'Amateur', juvenil: 'Juvenil', cadet: 'Cadet' },
    tDateLong: (d) => {
      const x = new Date(d + 'T12:00:00');
      return DAYS[x.getDay()] + ' ' + x.getDate() + ' de ' + MONTHS[x.getMonth()];
    },
    tDateDayMonth: (d) => {
      if (!d) return '—';
      const x = new Date(d + 'T12:00:00');
      return x.getDate() + ' ' + MONTHS[x.getMonth()];
    },
    tDateDMY: (d) => {
      if (!d) return '—';
      const x = new Date(d + 'T12:00:00');
      return x.getDate() + ' ' + MONTHS[x.getMonth()] + ' ' + x.getFullYear();
    },
    safeHttpUrl: utils.safeHttpUrl,
    BODY_ZONES: utils.BODY_ZONES,
    GROUP_SUBS: utils.GROUP_SUBS,
    ZONE_CA: utils.ZONE_CA,
    zoneLabelCa: utils.zoneLabelCa,
    groupLabelCa: utils.groupLabelCa,
    muscleLabelCa: utils.muscleLabelCa,
    bodyMapHtml: utils.bodyMapHtml,
    bodyZoneCentroid: utils.bodyZoneCentroid,
  };
  // eslint-disable-next-line no-new-func
  return new Function(...Object.keys(env), `
    ${HELPERS}
    ${PAGE}
    return ${which}();
  `)(...Object.values(env));
}

const HEALTHY = INJ.filter((i) => i.status === 'resolved');

const STATES = [
  ['dashboard', 'Mèdic · staff — dues autoreports pendents, cinc lesions obertes',
    'renderMedical', {}],
  ['empty', 'Mèdic · staff — cap lesió, cap autoreport, tota la plantilla apta',
    'renderMedical', { injuries: [], status: {} }],
  /* The half of `Autoreports pendents` that is NOT a record: seven players
     whose availability answer says injured with nothing logged against them.
     It is the older half and the one a physio most needs to see, so it gets
     a board of its own rather than being a footnote of the first. */
  ['bare', 'Mèdic · staff — set jugadors marcats Lesionat sense cap fitxa',
    'renderMedical', { injuries: [] }],
  ['closed-only', 'Mèdic · staff — només historial tancat, ningú de baixa',
    'renderMedical', { injuries: HEALTHY, status: {} }],
  ['file', 'Fitxa mèdica — Gerard Vila, tercera lesió a l\'isquiotibial',
    'renderMedicalDetail', { playerId: 'p1' }],
  ['readonly', 'Mèdic · staff en només lectura — cada acció és una paraula',
    'renderMedical', { readonly: true }],
];

const boards = STATES.map(([id, label, which, data]) => {
  const html = render(which, data);
  return '<section class="pv-board" id="pv-' + id + '">' +
    '<div class="pv-cap">' + esc(label) + '</div>' +
    '<div class="pv-frame">' + html + '</div></section>';
}).join('\n');

/* ⚠ NO FIXED-WIDTH FRAME, AND THAT IS THE WHOLE POINT.
   `@media` keys off the VIEWPORT, not the container, so a 390px box in a
   1440px window shows the DESKTOP rules squeezed into a phone's width —
   neither layout, and the 44px hit targets this redesign exists to get right
   would be nowhere on screen. The boards are full-width and the VIEWPORT is
   what you change. Two runs, two truths. */
const CHROME = `
  html, body { margin:0; padding:0; background:#E9E6E0; }
  .pv-wrap { display:flex; flex-direction:column; gap:40px; padding:24px 0; }
  .pv-cap { font:12px/1.4 'Oswald','Arial Narrow',sans-serif; letter-spacing:.16em;
            text-transform:uppercase; color:#6B645E; padding:0 24px 10px; }
  /* The dashboard's own 1rem padding, which .md2-page's margin:-1rem breaks
     out of. Without it the hero band stops short of the edge here and
     nowhere else, and the preview lies about the one thing it is for. */
  .pv-frame { background:#FBFAF7; padding:1rem; border-top:1px solid #C9C3BB;
              border-bottom:1px solid #C9C3BB; }
  /* .md2-page fills the viewport in the app, which is right there and is
     five screens of blank paper between boards here. Preview chrome only. */
  .pv-frame .md2-page { min-height:0; }
  .view-only-banner { font:12px/1.4 'Oswald',sans-serif; letter-spacing:.16em;
            text-transform:uppercase; color:#99928B; padding:10px 40px 0; }
`;

const html = `<!doctype html>
<html lang="ca"><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>EsquerrApp · Mèdic (v234) — preview</title>
<link href="https://fonts.googleapis.com/css2?family=Oswald:wght@200;300;400;500;600;700&display=swap" rel="stylesheet">
<style>${cssSrc}</style>
<style>${CHROME}</style>
</head><body><div class="pv-wrap">
${boards}
</div></body></html>`;

fs.writeFileSync(OUT, html, 'utf8');
console.log('wrote ' + path.relative(ROOT, OUT) + '  ' +
  Math.round(html.length / 1024) + ' KB  ' + STATES.length + ' states');
console.log('render it at BOTH widths — the media queries key off the viewport:');
console.log('  chrome --headless --window-size=1440,6000 --screenshot=desk.png ' +
  path.basename(OUT));
console.log('  and the PHONE via Emulation.setDeviceMetricsOverride, not');
console.log('  --window-size=390 — headless clamps the layout viewport at ~485px');
console.log('  and crops the bitmap, which is neither the phone nor the overflow.');
