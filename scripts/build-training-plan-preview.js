/* Build a self-contained mockup of the staff training detail page (v196).
 *
 * The rail — the session plan and the Material card — and the team block are
 * rendered by the REAL functions, sliced out of js/app.js with the same
 * grab() convention the test suite uses. So the markup in the output is not
 * an approximation of what the app produces; it IS what the app produces.
 * The surrounding page chrome (top bar, hero, stat row, attendance bar,
 * table) is hand-built from the real class names, because it is context for
 * the design rather than the subject of it.
 *
 * css/style.css is inlined whole so the file can be handed to a design tool
 * with nothing else attached.
 *
 * Run from the repo root:
 *
 *   node scripts/build-training-plan-preview.js . training-plan-preview.html
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
// A plausible Tuesday: a warm-up, then two drills running side by side on
// half a pitch each, then a finishing game. Exactly the shape the material
// arithmetic exists to price, and the shape the parallel block exists to draw.

function n(k) { return Array.from({ length: k }, (_, i) => [i * 3, i * 2]); }
function pts(k) { return Array.from({ length: k }, (_, i) => [10 + i * 8, 20 + i * 6]); }

const BOARDS = {
  tb_warm: {
    name: 'Escalfament + rondo 5v2', cones: n(12), balls: [[50, 50], [20, 20]],
    positions: pts(7), numbers: ['4', '6', '8', '10', '11', '9', '7'],
    colors: null, teamColor: '#ffffff', showOpp: false
  },
  tb_press: {
    name: 'Pressió alta 6v6', cones: n(8), balls: [[40, 40]],
    positions: pts(6), numbers: ['1', '4', '6', '8', '10', '9'],
    colors: ['#f5c842', '#e53935', '#e53935', '#e53935', '#e53935', '#e53935'],
    teamColor: '#e53935',
    oppPositions: pts(6), oppNumbers: ['1', '2', '5', '7', '11', '9'],
    oppColors: null, oppColor: '#1e88e5', showOpp: true
  },
  tb_sortida: {
    name: 'Sortida de pilota 4+2', cones: n(12), balls: [[30, 50]],
    positions: pts(6), numbers: ['1', '2', '4', '5', '6', '8'],
    colors: null, teamColor: '#43a047', showOpp: false
  },
  tb_final: {
    name: 'Partit 9v9 i tornada a la calma', cones: n(6), balls: [[50, 50], [10, 10], [90, 90]],
    positions: pts(8), numbers: ['1', '2', '4', '6', '8', '10', '11', '9'],
    colors: null, teamColor: '#e53935',
    oppPositions: pts(8), oppNumbers: ['1', '3', '5', '6', '8', '7', '11', '9'],
    oppColors: null, oppColor: '#1e88e5', showOpp: true
  }
};
const TAGS = { tb_warm: '', tb_press: 'Presión', tb_sortida: 'Salida', tb_final: '' };
const BUCKET = {
  '2026-09-01': Object.keys(BOARDS).map((id) => ({
    boardId: id, name: BOARDS[id].name, tag: TAGS[id] || '', category: 'cadet'
  }))
};

const ex = (boardId) => ({
  id: 'ex_' + boardId, boardId: boardId,
  title: BOARDS[boardId].name, desc: '', tag: TAGS[boardId] || ''
});

const PLAN = {
  blocks: [
    { id: 'b1', mins: 15, label: 'Escalfament', items: [ex('tb_warm')] },
    // Two items in one block IS the parallel — there is no other way to say it.
    { id: 'b2', mins: 25, label: '', items: [ex('tb_press'), ex('tb_sortida')] },
    { id: 'b3', mins: 20, label: 'Transició', items: [
      { id: 'ex_free', boardId: '', title: 'Transicions 8v8 camp reduït',
        desc: '', tag: '' }] },
    /* Teams pinned onto this exercise — a COPY of a split, with its colours
       resolved at the moment it was assigned. Re-drafting does not reach
       back into it. */
    { id: 'b4', mins: 15, label: 'Final',
      items: [Object.assign(ex('tb_final'), { teams: [
        { key: 'g0', name: 'Equip 1', color: '#ffffff', ids: ['p1', 'p8', 'p5'] },
        { key: 'g1', name: 'Equip 2', color: '#e53935', ids: ['p2', 'p3', 'p4'] }
      ] })] }
  ],
  extra: [{ id: 'mx1', label: 'Porteries petites', qty: 2 }],
  duty: { n: 2, ids: ['p2', 'p8'] },
  petos: null,
  teams: {
    n: 2,
    groups: [
      { key: 'g0', name: 'Equip 1', ids: ['p1', 'p8', 'p5'] },
      { key: 'g1', name: 'Equip 2', ids: ['p2', 'p3', 'p4'] }
    ]
  }
};

const SQUAD = [
  { id: 'p1', name: 'Aleix Ferrer', position: 'GK', team: 'A', answer: 'yes', med: 'fit', ac: 1.05 },
  { id: 'p2', name: 'Berta Puig', position: 'CB,LB', team: 'A', answer: 'yes', med: 'fit', ac: 0.92 },
  { id: 'p3', name: 'Carles Roig', position: 'DM,OM', team: 'A', answer: 'yes', med: 'fit', ac: 1.18 },
  { id: 'p4', name: 'David Mas', position: 'ST', team: 'A', answer: 'late', med: 'doubt', ac: 1.44 },
  { id: 'p5', name: 'Enric Sala', position: 'RW,ST', team: 'B', answer: 'yes', med: 'fit', ac: 0.78 },
  { id: 'p6', name: 'Ferran Oller', position: 'CB', team: 'B', answer: 'no', med: 'fit', ac: 1.01 },
  { id: 'p7', name: 'Gerard Vila', position: 'LW', team: 'B', answer: 'injured', med: 'injured', ac: 1.62 },
  { id: 'p8', name: 'Hugo Camps', position: 'DM', team: 'B', answer: 'yes', med: 'fit', ac: 0.88 }
];
const ANSWERS = {};
SQUAD.forEach((p) => { ANSWERS[p.id] = p.answer; });

/* Duty history: p3 has carried it twice, p5 once, the rest never — so the
   "Tria a mà" picker has something to grey out. */
const HISTORY = [
  { id: 'h1', category: 'cadet', plan: { duty: { n: 2, ids: ['p3', 'p5'] } } },
  { id: 'h2', category: 'cadet', plan: { duty: { n: 1, ids: ['p3'] } } }
];

const TR = {
  id: 'now', date: '2026-09-01', time: '20:00', endTime: '21:15',
  category: 'cadet', teams: ['A', 'B'], plannedRpe: 7, plan: PLAN
};

// The Catalan strings, lifted from _i18n so the mockup reads as the app reads.
const CA = {};
(function pullCatalan() {
  const dict = grab('  var _i18n = {', '\n  function t(key)');
  const re = /'((?:plan|mat|std|common|avail|load|training|nt|cal|wx)\.[a-z_0-9]+)':\s*\{\s*ca:\s*'((?:[^'\\]|\\.)*)'/g;
  let m;
  while ((m = re.exec(dict))) CA[m[1]] = m[2].replace(/\\'/g, "'").replace(/\\\\/g, '\\');
})();
const t = (k) => CA[k] || k;

// ── The real renderers ──────────────────────────────────────────

function mins2hhmm(m) {
  const h = Math.floor(m / 60), r = m % 60;
  return String(h).padStart(2, '0') + ':' + String(r).padStart(2, '0');
}
function sessionWindow(row) {
  const hhmm = (v) => {
    const mm = /^(\d{1,2}):(\d{2})$/.exec(String(v || '').trim());
    return mm ? Number(mm[1]) * 60 + Number(mm[2]) : null;
  };
  const start = hhmm(String(row.time || '').split(' - ')[0]);
  if (start === null) return null;
  let end = hhmm(row.endTime);
  if (end === null || end <= start) end = start + 90;
  return { start: start, end: end };
}

/* The plan region plus the two page-level renderers that read from it. They
   are concatenated rather than evaluated separately because renderStdTeamsBlock
   calls stdPlan, planMaterial, resolvePetos and _stpDot — all of which live in
   the region above it. */
const code = grab("  const STP_GK_FILL = '#f5c842';", '  // #endregion Session plan') +
  grab('  function buildDetailBar(tr, players, locked) {', '  // ── Team generation ──') +
  grab('  function renderStdTeamsBlock(tr, squad, locked) {', '  let rosterTeamFilter');

const R = new Function(
    'sanitize', 't', 'fillCss', 'canEditPage', 'getTrainings', 'getUsers',
    'calledPlayers', 'isTrainingLocked', 'availContext', 'getEffectiveAnswer',
    'trainingOnly', 'isActivity', 'tbResolveRef', 'TB', 'localStorage',
    'document', '_ntPersistSession', 'detailTrainingId', 'tbRoBoardHtml',
    'hydrateRoBoards', 'scaleRoBoards', 'bindRoBoardAnimations',
    'requestAnimationFrame', 'sessionWindow', 'minsToHHMM', 'computeReadiness',
    'posRankGlobal', 'posCirclesHtmlGlobal', 'trainingTeams', `
  ${code}
  return { renderStdPlanPanel, renderStdMaterialCard, renderStdTeamsBlock,
           buildDetailBar, stdSelect, sessionWeatherHtml,
           planMaterial, stdPlan, stdBoardResolver,
           resolvePetos, blockTimes };`)(
    esc, t, U.fillCss,
    () => true,
    () => HISTORY,
    () => SQUAD,
    () => SQUAD,
    () => false,
    () => ({}),
    (id) => ANSWERS[id] || 'no',
    (l) => (l || []).filter((r) => r.kind !== 'activity'),
    (r) => !!r && r.kind === 'activity',
    () => null,
    { peek: (id) => BOARDS[id] || null },
    { getItem: () => JSON.stringify(BUCKET) },
    { getElementById: () => null, querySelectorAll: () => [] },
    () => null,
    'now',
    // A stand-in for the pitch: the real read-only renderer needs a DOM to
    // size itself against, and the handoff calls the artwork the one
    // deliberately rough part of the design.
    (ref) => '<div class="mock-pitch">' + esc(ref && ref.name) + '</div>',
    () => {}, () => {}, () => {}, () => {},
    sessionWindow, mins2hhmm,
    () => ({ hasData: false }),
    () => 0,
    (p) => posCircles(p),
    (row) => (row && row.teams) || ['A', 'B']);

// ── Page chrome, from the real class names ──────────────────────

const MED = {
  fit: ['✓', 'roster-status-fit'],
  doubt: ['?', 'roster-status-doubt'],
  injured: ['✕', 'roster-status-injured']
};
const AVAIL = { yes: 'Sí', late: 'Tard', no: 'No', injured: 'Lesionat', na: 'N/D' };

/* utils.js does not export posCirclesHtmlGlobal, and it needs no DOM — this
   is the same markup its callers produce. */
function posCircles(p) {
  return String(p.position || '').split(',').map((s) => s.trim()).filter(Boolean)
      .map((pos) => '<span class="pos-circle pos-' + pos + '">' + pos + '</span>')
      .join('');
}

function rows() {
  return SQUAD.map((p) => {
    const [glyph, cls] = MED[p.med];
    const acColor = (p.ac >= 0.8 && p.ac <= 1.3) ? '#5C8F5E'
      : (p.ac > 1.5 || p.ac < 0.7) ? '#C0564C' : '#D39A2F';
    return `<tr>
        <td class="std-td-name">${esc(p.name)}<span class="std-team-tag">${p.team}</span></td>
        <td><span class="conv-pos-circles">${posCircles(p)}</span></td>
        <td class="c"><span class="roster-status-icon ${cls}">${glyph}</span></td>
        <td class="c"><span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${acColor}"></span></td>
        <td class="r std-num" style="color:${acColor}">${p.ac.toFixed(2)}</td>
        <td class="r std-said">${AVAIL[p.answer]}</td>
        <td class="r">${R.stdSelect({
          kind: 'staff', cls: 'std-sel-pill', value: p.answer,
          options: [{ value: '', label: '—', cls: 'avail-unset' }].concat(
              Object.keys(AVAIL).map((k) => ({ value: k, label: AVAIL[k], cls: 'avail-' + k })))
        })}</td>
        <td class="std-drop-cell"><button class="std-drop" title="Treure">&times;</button></td>
      </tr>`;
  }).join('');
}

const mat = R.planMaterial(R.stdPlan(TR), R.stdBoardResolver(TR));
const times = R.blockTimes(TR, R.stdPlan(TR));
const win = sessionWindow(TR);

const stat = (label, value, note) =>
  `<div class="std-stat"><span class="std-eyebrow">${esc(label)}</span>` +
  `<span class="std-stat-v">${value}${note ? `<span class="std-stat-n">${esc(note)}</span>` : ''}</span></div>`;

const page = `
      <div class="std-page">
      <div class="std-topbar">
        <button class="std-back">← Enrere</button>
        <div class="std-topbar-r"><span class="std-eyebrow">Entrenament</span></div>
      </div>
      <div class="std-body">
      <div class="std-main">
        <div class="std-hero">
          <div class="std-hero-row">
            <h1 class="std-title">Pressió alta i sortida de pilota</h1>
            ${R.sessionWeatherHtml(TR)}
          </div>
          <div class="std-meta">Dimarts, 1 de setembre de 2026 · 20:00 · Camp Municipal Joan Serrahima</div>
        </div>
        <div class="std-stats">
          ${stat('Intensitat prevista', R.stdSelect({
            kind: 'rpe', cls: 'std-sel-plain', value: '8',
            options: [{ value: '', label: 'Sense definir' }].concat(
                [1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((n2) => ({
                  value: String(n2),
                  label: n2 + ' · ' + (n2 <= 4 ? 'suau' : n2 <= 7 ? 'moderat' : 'exigent')
                })))
          }))}
          ${stat('Càrrega', '<span class="std-stat-hot">630</span>', 'UA')}
          ${stat('Durada', (win.end - win.start) + '′', mins2hhmm(win.start) + ' – ' + mins2hhmm(win.end))}
        </div>
        <div class="std-attbar">${R.buildDetailBar(TR, SQUAD, false)}</div>
        <div class="std-sec-head">
          <span class="std-eyebrow">Assistència de jugadors</span>
          <div class="std-sec-r">
            <button class="std-team-btn std-team-btn-on">Tots</button>
            <button class="std-team-btn">A</button>
            <button class="std-team-btn">B</button>
            <button class="stp-a">+ Jugador</button>
          </div>
        </div>
        <div class="table-wrap"><table class="std-table">
          <thead><tr><th>Jugador</th><th>Pos</th><th class="c">Mèdic</th><th class="c">Forma</th><th class="r">A/C</th><th class="r">Jugador diu</th><th class="r">Staff</th><th class="std-drop-cell"></th></tr></thead>
          <tbody>${rows()}</tbody>
        </table></div>
        ${R.renderStdTeamsBlock(TR, SQUAD, false)}
      </div>
      <aside class="std-rail">
        ${R.renderStdPlanPanel(TR, false, SQUAD)}
        ${R.renderStdMaterialCard(TR, SQUAD, false, false)}
      </aside>
      </div>
      </div>`;

const html = `<!DOCTYPE html>
<html lang="ca">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>EsquerrApp — Pla d'entrenament i material (v188)</title>
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
/* The handoff calls the pitch artwork the one deliberately rough part; in the
   app this is the real read-only board. */
.mock-pitch {
  height:190px; background:#2e7d32; color:rgba(255,255,255,.75);
  display:flex; align-items:center; justify-content:center;
  font-size:12px; letter-spacing:.08em; text-transform:uppercase;
  border:1px solid rgba(255,255,255,.9);
}
</style>
</head>
<body>
<div class="mock-note">
  <b>EsquerrApp v188 — staff training detail, rebuilt to the Claude Design handoff.</b>
  The <b>rail</b> (Pla d'entrenament + Material) and the <b>team block</b> are rendered by the
  app's real functions and real CSS; the top bar, hero, stat row, attendance bar and table are
  stand-in context. The pitch is a placeholder — in the app it is the real read-only board.
  Generated ${new Date().toISOString().slice(0, 10)}.
  Computed: <b>${mat.cones} cons</b>, <b>${mat.balls} pilotes</b>,
  <b>${mat.petos} colors de petos</b> from ${mat.colors.length} colours on ${mat.priced} boards;
  plan ends <b>${times.endLabel}</b>.
</div>
<div class="mock-shell">
${page}
</div>
</body>
</html>
`;

fs.writeFileSync(OUT, html, 'utf8');
console.log('wrote ' + OUT + ' (' + Math.round(html.length / 1024) + ' KB)');
console.log('material: cones=' + mat.cones + ' balls=' + mat.balls +
    ' petos=' + mat.petos + ' colours=' + mat.colors.length +
    ' priced=' + mat.priced + ' unknown=' + mat.unknown +
    ' ends=' + times.endLabel);
