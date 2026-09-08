/* Build a self-contained mockup of LES MEVES ESTADÍSTIQUES (v244).
 *
 * The whole page is the app: `renderPlayerStats` and its `.ms-` builders are
 * sliced out of js/app.js with the same grab() convention test/ms.test.js
 * uses, and CALLED, so what the browser lays out is exactly what a player is
 * served. That is the point of the file. The suite asserts on the HTML
 * string, and a string cannot tell you that the seven-column table stretches
 * to 1376px at 1440, or that the rail's body map is taller than the history
 * beside it.
 *
 * css/style.css is inlined whole so the file can be handed to a design tool
 * with nothing else attached.
 *
 * Run from the repo root:
 *
 *   node scripts/build-ms-preview.js . ms-preview.html
 *
 * The output is REGENERATED, never hand-edited: it is a view of js/app.js, and
 * a hand-patched copy would drift from the app the moment either changed with
 * nothing to detect it. The name must keep the `-preview.html` suffix —
 * scripts/build-www.js excludes the APK mirror on that pattern — AND be listed
 * by name in _config.yml, which excludes by name and not by pattern.
 */
const fs = require('fs');
const path = require('path');
const assert = require('assert');

const ROOT = path.resolve(process.argv[2] || '.');
const OUT = path.resolve(process.argv[3] || 'mockup.html');

const appSrc = fs.readFileSync(path.join(ROOT, 'js', 'app.js'), 'utf8');
const cssSrc = fs.readFileSync(path.join(ROOT, 'css', 'style.css'), 'utf8');
const U = require(path.join(ROOT, 'js', 'utils.js'));

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
/* Every state the page can be in, on one screen: a win, a draw and a loss;
   home and away; a full 90 and a 45; a row with nothing on it (three
   em-dashes), a yellow, and a yellow plus a red. Anything the fixtures do
   not exercise is a state nobody looks at before it ships. */
const ME = {
  id: 'p1', name: 'Marc Rovira', playerNumber: 8, position: 'DM,OM',
  team: 'A', category: 'amateur', roles: ['player'],
};

const HAM = U.BODY_ZONES.findIndex((z) => z.label === 'Hamstring');
const CALF = U.BODY_ZONES.findIndex((z) => z.label === 'Shin / Calf');

const MATCH_ROWS = [
  ['2026-08-30', 'CF Sants', 'CE L\'Esquerra', 1, 2, 'V', 78, 1, 0, 0, 0],
  ['2026-08-23', 'CE L\'Esquerra', 'UE Poble Sec', 3, 0, 'V', 90, 1, 1, 0, 0],
  ['2026-08-16', 'CE Gràcia', 'CE L\'Esquerra', 1, 1, 'E', 62, 0, 0, 1, 0],
  ['2026-08-09', 'CE L\'Esquerra', 'AD Clot', 0, 2, 'D', 45, 0, 0, 0, 0],
  ['2026-08-02', 'CE L\'Esquerra', 'CF Vallcarca', 2, 2, 'E', 82, 1, 1, 0, 0],
  ['2026-07-26', 'UE Horta', 'CE L\'Esquerra', 0, 1, 'V', 55, 0, 0, 1, 1],
].map(([date, home, away, hs, as, res, min, g, a, y, r]) => ({
  matchId: date, date, home, away, homeScore: hs, awayScore: as,
  resultLetter: res, isOwnTeam: true, minutes: min,
  status: min >= 62 ? 'Titular' : 'Suplent', teamLetter: 'A',
  yellows: y, reds: r, assists: a, goals: g,
  goalBreakdown: { jugada: g, penal: 0, falta: 0 },
}));

const TOTALS = MATCH_ROWS.reduce((s, r) => ({
  goals: s.goals + r.goals, assists: s.assists + r.assists,
  matches: s.matches + 1, minutes: s.minutes + r.minutes,
  titulars: s.titulars + (r.status === 'Titular' ? 1 : 0),
}), { goals: 0, assists: 0, matches: 0, minutes: 0, titulars: 0 });

/* 22 answered sessions: 16 yes, 3 late, 3 injured. 86%, three excused. */
const TRAININGS = [];
for (let i = 0; i < 22; i++) {
  TRAININGS.push({ id: 'tr' + i, date: '2026-08-' + String((i % 28) + 1).padStart(2, '0') });
}
const ANSWERS = TRAININGS.map((tr, i) => (i < 16 ? 'yes' : i < 19 ? 'late' : 'injured'));

const INJURIES = [
  { id: 'i1', playerId: 'p1', status: 'resolved', bodyZone: HAM,
    muscleGroup: 'Hamstrings', muscleSub: 'Biceps Femoris', severity: 'severe',
    startDate: '2026-07-12', endDate: '2026-08-02' },
  { id: 'i2', playerId: 'p1', status: 'resolved', bodyZone: CALF,
    muscleGroup: 'Calves', muscleSub: 'Soleus', severity: 'minor',
    startDate: '2026-03-04', endDate: '2026-03-16' },
  { id: 'i3', playerId: 'p1', status: 'resolved', bodyZone: HAM,
    muscleGroup: 'Hamstrings', muscleSub: 'Biceps Femoris', severity: 'moderate',
    startDate: '2025-10-18', endDate: '2025-11-09' },
];

const READY = { score: 79, color: 'green', acwr: 1.12, matchDaysSince: 7, hasData: true };
const NO_DATA = { score: 0, color: 'green', acwr: 0, matchDaysSince: null, hasData: false };

/* The Catalan the page actually renders. Read out of js/app.js rather than
   retyped, so the mockup cannot show wording the app does not have. */
const CA = {};
const I18N = grab("    // ── Les meves estadístiques, redesigned (v244) ──",
    "\n    // ── Match History ──");
I18N.replace(/'(ms\.[a-z_0-9]+)':\s*\{\s*\n?\s*ca:\s*'((?:[^'\\]|\\.)*)'/g,
    (m, k, v) => { CA[k] = v.replace(/\\'/g, "'"); return m; });
assert.ok(Object.keys(CA).length > 20, 'the ms.* strings did not parse: ' + Object.keys(CA).length);
Object.assign(CA, {
  'page.my_stats': 'Les meves estadístiques',
  'sc.season': 'Temporada',
  'md2.my_history': 'El meu historial',
  'md2.my_fit': 'Sense lesió activa aquesta temporada.',
  'md2.st_fit': 'Disponible',
  'md2.st_inj': 'Lesionat',
  'md2.st_rec': 'Recuperant',
  'md2.privacy_zone': 'El diagnòstic complet i les proves els guarda el cos ' +
    'tècnic. Parla amb el fisio si vols els detalls.',
  'md2.no_history': 'Cap lesió registrada',
  'md2.ongoing': 'en curs',
  'md2.days_n': '{n} dies',
});

const MONTHS_S = ['gen', 'feb', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago',
  'set', 'oct', 'nov', 'des'];
function dayMonth(iso) {
  const d = new Date(iso + 'T12:00:00');
  return d.getDate() + ' ' + MONTHS_S[d.getMonth()];
}

function stubsFor(rd) {
  return {
    document: { createElement: () => ({ set textContent(v) { this._v = v; }, get innerHTML() { return esc(this._v); } }) },
    getSession: () => ({ id: 'p1', name: ME.name }),
    getUsers: () => [ME],
    getPlayerInjuries: () => INJURIES,
    getTrainings: () => TRAININGS,
    trainingOnly: (l) => l,
    matchStatsContext: () => ({
      matches: MATCH_ROWS.map((r) => ({ id: r.matchId, date: r.date, time: '12:00', team: 'A' })),
      allEvents: {}, sentData: {},
    }),
    computePlayerMatchStats: () => ({ totals: TOTALS, matchRows: MATCH_ROWS }),
    computeReadiness: () => rd,
    availContext: () => ({}),
    isTrainingLocked: () => true,
    getEffectiveAnswer: (uid, tr) => ANSWERS[TRAININGS.indexOf(tr)] || 'na',
    isOurTeam: (n) => n === 'CE L\'Esquerra',
    seasonStartStr: U.seasonStartStr,
    bodyMapHtml: U.bodyMapHtml,
    /* utils.avatarHtmlGlobal is not exported (it needs the app's sanitize).
       The two-class idiom is what matters for the layout — a photo and its
       placeholder must be the same size — so the stub reproduces that. */
    avatarHtmlGlobal: (u, cls) => (u && u.profilePic)
      ? '<img class="' + cls + '" src="' + esc(u.profilePic) + '" alt="">'
      : '<span class="' + cls + ' ' + cls + '-ph">' +
        esc(String((u && u.name) || '?').trim().charAt(0).toUpperCase()) + '</span>',
    BODY_ZONES: U.BODY_ZONES,
    ZONE_CA: U.ZONE_CA,
    GROUP_SUBS: U.GROUP_SUBS,
    zoneLabelCa: U.zoneLabelCa,
    groupLabelCa: U.groupLabelCa,
    muscleLabelCa: U.muscleLabelCa,
    localDateStr: U.localDateStr,
    playerIsCalled: () => true,
    storage: { ref: () => ({}) },
    sanitize: esc,
    t: (k) => (k in CA ? CA[k] : k),
    tv: (k, vars) => String(k in CA ? CA[k] : k)
        .replace(/\{(\w+)\}/g, (m, n) => (n in vars ? String(vars[n]) : m)),
    tDateDayMonth: dayMonth,
    tDateDMY: (d) => {
      const p = String(d).split('-');
      return dayMonth(d) + ' ' + p[0];
    },
    /* ⚠ NOT utils.posCirclesHtmlGlobal itself: the real one calls the app's
       sanitize(), which needs a document. The COLOURS are the real ones —
       POS_COLORS is exported for exactly this — so the discs cannot drift. */
    posCirclesHtmlGlobal: (p) => (p.position || '').split(',')
        .map((s) => s.trim()).filter(Boolean)
        .map((pos) => '<span class="conv-pos-circle" style="background:' +
          (U.POS_COLORS[pos] || '#9e9e9e') + '">' + esc(pos) + '</span>').join(''),
  };
}

function renderWith(rd) {
  const stubs = stubsFor(rd);
  // eslint-disable-next-line no-new-func
  return new Function(...Object.keys(stubs), `
    ${grab('  const MD2_SHOW_HEATMAP = true;', '  function renderMedical() {')}
    ${grab('  /* ONE SIZE for the ring', '  /** The weekday-over-day-number stack')}
    ${grab('  function buildInjuryHistoryHtml(uid, opts) {', '  /**\n   * The Ready cell')}
    ${grab('  /* ── Les meves estadístiques, redesigned (v244)', '  function renderStaffPlayerStats() {')}
    return renderPlayerStats;`)(...Object.values(stubs))();
}

const page = renderWith(READY);
const bare = renderWith(NO_DATA);

/* The page must not carry an RPE, in any frame. Asserting it here as well as
   in the suite means the mockup cannot be the thing that quietly shows one. */
[['ready', page], ['no-data', bare]].forEach(([label, h]) => {
  assert.ok(!/\bRPE\b/i.test(h), 'an RPE reached the ' + label + ' frame');
  assert.ok(!/ms-star|MVP/i.test(h), 'an MVP hook reached the ' + label + ' frame');
});

const html = `<!DOCTYPE html>
<html lang="ca">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>EsquerrApp — Les meves estadístiques (v244)</title>
<link href="https://fonts.googleapis.com/css2?family=Oswald:wght@200;300;400;500;600;700&display=swap" rel="stylesheet">
<style>
${cssSrc}
</style>
<style>
/* Mockup shell only — NOT part of the app. The real page renders inside
   #dashboard-content within the dashboard sidebar layout; this stands in for
   it, including the 2rem padding .ms-page is built to negate. */
body { margin:0; background:#E9E6E0; font-family:'Oswald','Arial Narrow',sans-serif; }
.mock-note {
  background:#2D2926; color:#e0ddd9; padding:.7rem 1.2rem;
  font-size:.82rem; line-height:1.5;
}
.mock-note b { color:#FFD662; }
.mock-shell { padding:2rem; background:#FBFAF7; }
.mock-h { background:#E9E6E0; padding:.6rem 1.2rem; font-size:.78rem; color:#6B645E;
  letter-spacing:.14em; text-transform:uppercase; }
</style>
</head>
<body>
<div class="mock-note">
  <b>EsquerrApp v244 — Les meves estadístiques, as a PLAYER sees it.</b>
  The whole page is rendered by the app's real <code>renderPlayerStats()</code>
  and its real CSS; only the surrounding grey shell stands in for the
  dashboard. <b>No RPE and no weekly-load chart</b> — the player gets the
  derived Preparació score, the acute/chronic ratio and the days since the
  last match. No MVP star: teammate voting does not exist yet.
  Generated ${new Date().toISOString().slice(0, 10)}.
</div>
<div class="mock-h">1 · amb dades</div>
<div class="mock-shell">
${page}
</div>
<div class="mock-h">2 · sense prou dades de càrrega</div>
<div class="mock-shell">
${bare}
</div>
</body>
</html>
`;

fs.writeFileSync(OUT, html, 'utf8');
console.log('wrote ' + OUT + ' (' + Math.round(html.length / 1024) + ' KB)');
console.log('table rows=' + (page.match(/class="ms-row"/g) || []).length +
    ' phone rows=' + (page.match(/class="ms-prow"/g) || []).length +
    ' zones filled=' + (page.match(/rgba\(var\(--pp-bad-rgb\)/g) || []).length);
