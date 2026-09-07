/* Build a self-contained mockup of the PLAYER training detail page (v243).
 *
 * Unlike build-training-plan-preview.js — where only the rail and the team
 * block are real and the chrome around them is stand-in — the whole page here
 * is the app: `renderTrainingDetail` is sliced out of js/app.js with the same
 * grab() convention the suite uses and CALLED, so what the browser lays out is
 * exactly what a player is served. That is the point of the file. The suite
 * asserts on the HTML string, and a string cannot tell you that the forecast
 * and the title collide at 900px or that the answer column has no room.
 *
 * css/style.css is inlined whole so the file can be handed to a design tool
 * with nothing else attached.
 *
 * Run from the repo root:
 *
 *   node scripts/build-player-training-preview.js . player-training-preview.html
 *
 * The output is REGENERATED, never hand-edited: it is a view of js/app.js, and
 * a hand-patched copy would drift from the app the moment either changed with
 * nothing to detect it. The name must keep the `-preview.html` suffix —
 * scripts/build-www.js excludes the APK mirror on that pattern, and
 * _config.yml names the file to keep it off GitHub Pages.
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
/* A full squad on a wet Tuesday, answered every way there is — the only
   fixture that puts all five bar segments and all five row colours on screen
   at once, which is what the page has to survive looking at. */
const SQUAD = [
  ['p1', 'Pau Roca', 'GK', 'A'], ['p2', 'Nil Bosch', 'GK', 'B'],
  ['p3', 'Marc Puig', 'CB', 'A'], ['p4', 'Èric Sanz', 'CB', 'A'],
  ['p5', 'Iván Torres', 'LB', 'B'], ['p6', 'Adrià Camps', 'RB', 'A'],
  ['p7', 'Joan Serra', 'DM', 'A'], ['p8', 'Guillem Roig', 'OM', 'B'],
  ['p9', 'Pol Ferrer', 'LW', 'A'], ['p10', 'Biel Mas', 'RW', 'A'],
  ['p11', 'Aleix Vila', 'ST', 'A'], ['p12', 'Òscar Ruiz', 'ST', 'B'],
  ['p13', 'Roger Pons', 'CB,DM', 'A'], ['p14', 'Ferran Solé', 'OM,RW', 'B'],
].map(([id, name, position, team]) => ({
  id, name, position, team, roles: ['player'], category: 'cadet',
}));

const TR = {
  id: 'tr_1', kind: 'training', date: '2026-09-01', time: '19:30 - 21:00',
  focus: 'Pressió alta i sortida de pilota', category: 'cadet', teams: ['A', 'B'],
  location: 'Camp Municipal de l\'Esquerra', mapLink: 'https://maps.example/x',
  plannedRpe: 7, guests: [], excluded: [],
  weather: {cond: 'rain', windMs: 6.4, tempC: 14, rainPct: 45, night: false},
};

const AVAIL = {
  p1_tr_1_avail: 'yes', p3_tr_1_avail: 'yes', p4_tr_1_avail: 'yes',
  p6_tr_1_avail: 'yes', p9_tr_1_avail: 'yes', p11_tr_1_avail: 'yes',
  p13_tr_1_avail: 'yes',
  p2_tr_1_avail: 'late', p8_tr_1_avail: 'late',
  p5_tr_1_avail: 'no', p12_tr_1_avail: 'no',
  p7_tr_1_avail: 'injured',
  // p10 and p14 never answered: 'na' once frozen, 'yes' while open.
};
const OVERRIDES = {p14_tr_1_avail: 'injured'};

const CA = {
  'avail.yes': 'Sí', 'avail.late': 'Tard', 'avail.no': 'No',
  'avail.injured': 'Lesionat', 'avail.na': 'N/D',
  'btn.back': '← Enrere', 'training.badge': 'Entrenament',
  'cal.activity': 'Activitat', 'cal.training': 'Entrenament',
  'std.player_attendance': 'Assistència de jugadors',
  'std.th_player': 'Jugador', 'std.th_pos': 'Pos', 'std.th_answer': 'Resposta',
  'training.not_found': 'Entrenament no trobat',
  'wx.sun': 'Sol', 'wx.cloud': 'Núvols', 'wx.overcast': 'Cobert',
  'wx.rain': 'Pluja', 'wx.storm': 'Tempesta', 'wx.snow': 'Neu',
  'wx.fog': 'Boira', 'wx.wind': 'Vent', 'wx.calm': 'Calma',
  'wx.breeze': 'Brisa', 'wx.moderate': 'Moderat', 'wx.strong': 'Fort',
  'wx.too_far': 'Previsió disponible 3 dies abans',
  'wx.rain_share_training': 'Pluja durant un {n}% de la sessió',
};

const DAYS = ['diumenge', 'dilluns', 'dimarts', 'dimecres', 'dijous',
  'divendres', 'dissabte'];
const MONTHS = ['gener', 'febrer', 'març', 'abril', 'maig', 'juny', 'juliol',
  'agost', 'setembre', 'octubre', 'novembre', 'desembre'];

const stubs = {
  detailTrainingId: TR.id,
  getTrainings: () => [TR],
  getUsers: () => SQUAD,
  t: (k) => (k in CA ? CA[k] : k),
  sanitize: esc,
  calledPlayers: (row, users) => users.filter(
      (u) => u.roles.indexOf('player') !== -1 &&
        (row.excluded || []).indexOf(u.id) === -1),
  catSpanOf: U.catSpanOf,
  catBadgeHtmlGlobal: () => '',
  /* ⚠ NOT utils.posCirclesHtmlGlobal itself: the real one calls sanitize(),
     which needs a `document`, and this script has none. The COLOURS are the
     real ones — POS_COLORS is exported for exactly this — so the discs cannot
     drift from the app's even though the markup is rebuilt here. */
  posCirclesHtmlGlobal: (p) => {
    const list = (p.position || '').split(',').map((s) => s.trim()).filter(Boolean);
    if (!list.length) return '<span class="conv-pos-circle" style="background:#9e9e9e">—</span>';
    return list.map((pos) => '<span class="conv-pos-circle" style="background:' +
      (U.POS_COLORS[pos] || '#9e9e9e') + '">' + esc(pos) + '</span>').join('');
  },
  posRankGlobal: U.posRankGlobal,
  isActivity: U.isActivity,
  activityTitleOf: U.activityTitleOf,
  isTrainingLocked: () => false,
  availContext: () => ({availData: AVAIL, overrides: OVERRIDES}),
  getEffectiveAnswer: (uid, sess, locked, ctx) =>
    ctx.overrides[uid + '_' + sess.id + '_avail'] ||
    ctx.availData[uid + '_' + sess.id + '_avail'] || (locked ? 'na' : 'yes'),
  tDateLong: (d) => {
    const dt = new Date(d + 'T12:00:00');
    return DAYS[dt.getDay()] + ', ' + dt.getDate() + ' de ' + MONTHS[dt.getMonth()];
  },
  locationHtml: (row) => '<a class="std-place" href="' + esc(row.mapLink) +
    '" target="_blank" rel="noopener">' + esc(row.location) + '</a>',
  backTarget: (fallback) => fallback,
  wxDaysOut: () => 1,
};

const render = new Function(...Object.keys(stubs), `
  ${grab('  const STP_WEATHER_ICON = {', '  function wxDaysOut(row) {')}
  ${grab('  /* The five attendance colours', '  // ── Team generation ──')}
  ${grab('  function renderTrainingDetail', '  // getSeasonWeek → utils.js')}
  return renderTrainingDetail;`)(...Object.values(stubs));

const page = render();

const html = `<!DOCTYPE html>
<html lang="ca">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>EsquerrApp — Entrenament, vista jugador (v243)</title>
<link href="https://fonts.googleapis.com/css2?family=Oswald:wght@200;300;400;500;600;700&display=swap" rel="stylesheet">
<style>
${cssSrc}
</style>
<style>
/* Mockup shell only — NOT part of the app. The real page renders inside
   #dashboard-content within the dashboard sidebar layout; this stands in for
   it, including the 2rem padding .std-page is built to negate. */
body { margin:0; background:#E9E6E0; font-family:'Oswald','Arial Narrow',sans-serif; }
.mock-note {
  background:#2D2926; color:#e0ddd9; padding:.7rem 1.2rem;
  font-size:.82rem; line-height:1.5;
}
.mock-note b { color:#FFD662; }
.mock-shell { padding:2rem; background:#FBFAF7; }
</style>
</head>
<body>
<div class="mock-note">
  <b>EsquerrApp v243 — the training page as a PLAYER sees it.</b>
  The whole page is rendered by the app's real <code>renderTrainingDetail()</code>
  and its real CSS; only the surrounding grey shell is a stand-in for the
  dashboard. Three things and no more: the title, the forecast, and who is
  coming. Generated ${new Date().toISOString().slice(0, 10)}.
</div>
<div class="mock-shell">
${page}
</div>
</body>
</html>
`;

fs.writeFileSync(OUT, html, 'utf8');
console.log('wrote ' + OUT + ' (' + Math.round(html.length / 1024) + ' KB)');
console.log('squad=' + SQUAD.length + ' rows=' +
    (page.match(/<tr>/g) || []).length + ' (1 is the header)');
