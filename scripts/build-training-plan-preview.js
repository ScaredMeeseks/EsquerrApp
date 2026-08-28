/* Build a self-contained mockup of the staff training detail page.
 *
 * The two NEW panels — the session plan flow and the Material card — are
 * rendered by the REAL functions, sliced out of js/app.js with the same
 * grab() convention the test suite uses. So the markup in the output is not
 * an approximation of what the app produces; it IS what the app produces.
 * The surrounding page chrome (hero, donut card, attendance table) is
 * hand-built from the real class names, because it is context for the
 * design, not the subject of it.
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
// A plausible Tuesday session: a warm-up, then two drills running side by
// side on half a pitch each, then a finishing game. Exactly the shape the
// material arithmetic exists to price.

const BOARDS = {
  tb_warm: {
    name: 'Escalfament + rondo 5v2', cones: n(10), balls: [[50, 50]],
    positions: pts(7), numbers: ['4', '6', '8', '10', '11', '9', '7'],
    colors: null, teamColor: '#ffffff', showOpp: false
  },
  tb_press: {
    name: 'Pressió alta 6v6', cones: n(12), balls: [[40, 40], [60, 60]],
    positions: pts(6), numbers: ['1', '4', '6', '8', '10', '9'],
    colors: ['#f5c842', '#e53935', '#e53935', '#e53935', '#e53935', '#e53935'],
    teamColor: '#e53935',
    oppPositions: pts(6), oppNumbers: ['1', '2', '5', '7', '11', '9'],
    oppColors: null, oppColor: '#1e88e5', showOpp: true
  },
  tb_sortida: {
    name: 'Sortida de pilota 4+2', cones: n(8), balls: [[30, 50]],
    positions: pts(6), numbers: ['1', '2', '4', '5', '6', '8'],
    colors: null, teamColor: '#43a047', showOpp: false
  },
  tb_final: {
    name: 'Partit final 8v8', cones: n(6), balls: [[50, 50], [10, 10], [90, 90]],
    positions: pts(8), numbers: ['1', '2', '4', '6', '8', '10', '11', '9'],
    colors: null, teamColor: '#e53935',
    oppPositions: pts(8), oppNumbers: ['1', '3', '5', '6', '8', '7', '11', '9'],
    oppColors: null, oppColor: '#1e88e5', showOpp: true
  }
};
function n(k) { return Array.from({ length: k }, (_, i) => [i * 3, i * 2]); }
function pts(k) { return Array.from({ length: k }, (_, i) => [10 + i * 8, 20 + i * 6]); }

const TAGS = {
  tb_warm: '', tb_press: 'Presión', tb_sortida: 'Salida', tb_final: ''
};
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
    { id: 'b1', lanes: [[ex('tb_warm')]] },
    { id: 'b2', lanes: [[ex('tb_press')], [ex('tb_sortida')]] },
    { id: 'b3', lanes: [[ex('tb_final'),
      { id: 'ex_free', boardId: '', title: 'Tornada a la calma',
        desc: 'Estiraments i mobilitat, 8 minuts.', tag: '' }]] }
  ],
  extra: [{ id: 'mx1', label: 'Porteries petites', qty: 2 }],
  duty: { n: 2, ids: ['p3', 'p5'] }
};

const SQUAD = [
  { id: 'p1', name: 'Aleix Ferrer', position: 'GK', team: 'A', answer: 'yes' },
  { id: 'p2', name: 'Berta Puig', position: 'CB,LB', team: 'A', answer: 'yes' },
  { id: 'p3', name: 'Carles Roig', position: 'DM,OM', team: 'A', answer: 'yes' },
  { id: 'p4', name: 'David Mas', position: 'ST', team: 'A', answer: 'late' },
  { id: 'p5', name: 'Enric Sala', position: 'RW,ST', team: 'B', answer: 'yes' },
  { id: 'p6', name: 'Ferran Oller', position: 'CB', team: 'B', answer: 'no' },
  { id: 'p7', name: 'Gerard Vila', position: 'LW', team: 'B', answer: 'injured' },
  { id: 'p8', name: 'Hugo Camps', position: 'DM', team: 'B', answer: 'yes' }
];
const ANSWERS = {};
SQUAD.forEach((p) => { ANSWERS[p.id] = p.answer; });

// Duty history: p3 has carried it twice, p5 once, the rest never — so the
// dropdown has something to grey out.
const HISTORY = [
  { id: 'h1', category: 'cadet', plan: { duty: { n: 2, ids: ['p3', 'p5'] } } },
  { id: 'h2', category: 'cadet', plan: { duty: { n: 1, ids: ['p3'] } } }
];

const TR = {
  id: 'now', date: '2026-09-01', time: '20:00', endTime: '21:30',
  category: 'cadet', teams: ['A', 'B'], plan: PLAN
};

// ── The real renderers ──────────────────────────────────────────

const planRegion = grab("  const STP_GK_FILL = '#f5c842';", '  // #endregion Session plan');
const R = new Function(
    'sanitize', 't', 'fillCss', 'canEditPage', 'getTrainings', 'getUsers',
    'calledPlayers', 'isTrainingLocked', 'availContext', 'getEffectiveAnswer',
    'trainingOnly', 'isActivity', 'tbResolveRef', 'TB', 'localStorage',
    'document', '_ntPersistSession', 'detailTrainingId', 'tbRoBoardHtml',
    'hydrateRoBoards', 'scaleRoBoards', 'requestAnimationFrame', `
  ${planRegion}
  return { renderStdPlanPanel, renderStdMaterialCard, planMaterial, stdPlan,
           stdBoardResolver };`)(
    esc,
    (k) => CA[k] || k,
    U.fillCss,
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
    (ref) => '<div>' + esc(ref && ref.name) + '</div>',
    () => {}, () => {}, () => {});

const donutRegion = grab('  function buildDetailDonut(sess, players, locked) {',
    '  // ── Auto-generate teams state');
const D = new Function('availContext', 'getEffectiveAnswer', `
  ${donutRegion}
  return buildDetailDonut;`)(
    () => ({}), (id) => ANSWERS[id] || 'no');

// The Catalan strings the two panels ask for, lifted from _i18n so the
// mockup reads the way the app reads.
const CA = {};
(function pullCatalan() {
  const dict = grab('  var _i18n = {', '\n  function t(key)');
  ['plan', 'mat', 'std', 'common'].forEach(() => {});
  const re = /'((?:plan|mat|std|common)\.[a-z_0-9]+)':\s*\{\s*ca:\s*'((?:[^'\\]|\\.)*)'/g;
  let m;
  while ((m = re.exec(dict))) CA[m[1]] = m[2].replace(/\\'/g, "'").replace(/\\\\/g, '\\');
})();

// ── Page chrome, from the real class names ──────────────────────

const AVAIL_LABEL = { yes: 'Sí', late: 'Tard', no: 'No', injured: 'Lesionat', na: 'N/D' };
const AVAIL_CLS = { yes: 'avail-yes', late: 'avail-late', no: 'avail-no',
  injured: 'avail-injured', na: 'avail-na' };
const STATUS = { p7: 'injured', p4: 'doubt' };

/* utils.js does not export posCirclesHtmlGlobal, and it needs no DOM — this
   is the same markup its callers produce (see renderStdBoardsSection). */
function posCircles(p) {
  return String(p.position || '').split(',').map((s) => s.trim()).filter(Boolean)
      .map((pos) => '<span class="pos-circle pos-' + pos + '">' + pos + '</span>')
      .join('');
}

function rows() {
  return SQUAD.map((p) => {
    const st = STATUS[p.id] || 'fit';
    const icon = st === 'fit'
      ? '<span class="roster-status-icon roster-status-fit">✓</span>'
      : st === 'doubt'
        ? '<span class="roster-status-icon roster-status-doubt">?</span>'
        : '<span class="roster-status-icon roster-status-injured">✕</span>';
    const acwr = { p1: 1.05, p2: 0.92, p3: 1.18, p4: 1.44, p5: 0.78,
      p6: 1.01, p7: 1.62, p8: 0.88 }[p.id];
    const acwrColor = (acwr >= 0.8 && acwr <= 1.3) ? '#4caf50'
      : (acwr > 1.5 || acwr < 0.7) ? '#e53935' : '#ff9800';
    const opts = ['yes', 'late', 'no', 'injured', 'na'].map((o) =>
      `<option ${o === p.answer ? 'selected' : ''}>${AVAIL_LABEL[o]}</option>`).join('');
    return `<tr>
        <td class="std-drop-cell"><button class="conv-remove std-drop" title="Treure">&times;</button></td>
        <td><span class="conv-pos-circles">${posCircles(p)}</span></td>
        <td><span class="roster-name-wrap">${esc(p.name)}<span class="conv-team-circle">${p.team}</span></span></td>
        <td class="center-cell">${icon}</td>
        <td class="center-cell"><span class="rd-dot" style="background:${acwrColor}"></span></td>
        <td class="center-cell" style="font-weight:600;font-size:.82rem;color:${acwrColor}">${acwr.toFixed(2)}</td>
        <td class="center-cell"><span class="std-player-answer ${AVAIL_CLS[p.answer]}">${AVAIL_LABEL[p.answer]}</span></td>
        <td class="center-cell"><select class="std-staff-select ${AVAIL_CLS[p.answer]}"><option>—</option>${opts}</select></td>
      </tr>`;
  }).join('');
}

const mat = R.planMaterial(R.stdPlan(TR), R.stdBoardResolver(TR));

const page = `
      <div class="detail-topbar">
        <button class="btn btn-outline btn-small detail-back">← Enrere</button>
      </div>
      <div class="detail-hero detail-hero-training">
        <div class="detail-hero-badge"><span class="badge badge-green" style="font-size:.9rem;padding:.3rem .8rem;">Entrenament</span></div>
        <h2 class="detail-title">Pressió alta i sortida de pilota</h2>
        <div class="detail-subtitle">Dimarts, 1 de setembre de 2026 · 20:00 · Camp Municipal Joan Serrahima</div>
      </div>
      <div class="card std-load-card">
        <div class="card-title">Intensitat prevista</div>
        <div class="std-load-row">
          <select class="reg-input std-planned-rpe"><option selected>7 · Alta</option></select>
          <span class="std-load-au">630 UA</span>
        </div>
        <p class="std-load-hint">La càrrega prevista de la sessió, en unitats arbitràries.</p>
      </div>
      <div class="card" style="margin-bottom:1.5rem;">
        <div class="card-title">Resum d'assistència</div>
        <div class="std-donut-wrap">${D(TR, SQUAD, false)}</div>
      </div>
      <div class="std-attendance-row">
      <div class="card" style="flex:1;min-width:0;">
        <div class="card-title">Assistència de jugadors</div>
        <div class="roster-team-filter">
          <button class="roster-team-btn std-team-btn roster-team-btn-active">All</button>
          <button class="roster-team-btn std-team-btn">A</button>
          <button class="roster-team-btn std-team-btn">B</button>
        </div>
        <div class="std-attendance-head"><button class="btn btn-small btn-outline">+ Jugador</button></div>
        <div class="table-wrap"><table class="matchday-table std-attendance-table">
          <thead><tr><th class="std-drop-cell"></th><th>Pos</th><th>Jugador</th><th class="center-cell roster-th-wrap">Estat Mèdic</th><th class="center-cell roster-th-wrap">Forma Física</th><th class="center-cell">A/C</th><th class="center-cell">Resposta jugador</th><th class="center-cell">Staff (editable)</th></tr></thead>
          <tbody>${rows()}</tbody>
        </table></div>
      </div>
      ${R.renderStdPlanPanel(TR, false)}
      </div>
      ${R.renderStdMaterialCard(TR, SQUAD, false, false)}`;

const html = `<!DOCTYPE html>
<html lang="ca">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>EsquerrApp — Pla d'entrenament i material (v187)</title>
<link href="https://fonts.googleapis.com/css2?family=Oswald:wght@300;400;500;600;700&display=swap" rel="stylesheet">
<style>
${cssSrc}
</style>
<style>
/* Mockup shell only — NOT part of the app. The real page renders inside
   #content within the dashboard sidebar layout; this stands in for it. */
body { padding: 0; }
.mock-note {
  background: #2D2926; color: #e0ddd9; padding: .7rem 1.2rem;
  font-size: .82rem; line-height: 1.5;
}
.mock-note b { color: #FFD662; }
.mock-page { max-width: 1180px; margin: 0 auto; padding: 1.5rem 1.2rem 4rem; }
</style>
</head>
<body>
<div class="mock-note">
  <b>EsquerrApp v187 — staff training detail.</b>
  The <b>session plan</b> panel (right of the attendance table) and the
  <b>Material</b> card below it are rendered by the app's real functions and
  real CSS. Everything else is stand-in context. Generated ${new Date().toISOString().slice(0, 10)}.
  Computed for this session: <b>${mat.cones} cons</b>, <b>${mat.balls} pilotes</b>,
  <b>${mat.petos} colors de petos</b> from ${mat.colors.length} colours on ${mat.priced} boards.
</div>
<div class="mock-page">
${page}
</div>
</body>
</html>
`;

fs.writeFileSync(OUT, html, 'utf8');
console.log('wrote ' + OUT + ' (' + Math.round(html.length / 1024) + ' KB)');
console.log('material: cones=' + mat.cones + ' balls=' + mat.balls +
    ' petos=' + mat.petos + ' colours=' + mat.colors.length +
    ' priced=' + mat.priced + ' unknown=' + mat.unknown);
