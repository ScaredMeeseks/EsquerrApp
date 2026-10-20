/* The session-plan renderers and binders, run for real over stubs.
 *
 * The same slice and the same stubs as `renderers()` in material.test.js,
 * which it was copied from, plus what the private exercise notes (v291) need:
 * a TN, the session, showModal and the toast. material.test.js keeps its own
 * copy untouched.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const assert = require('assert');

const src = fs.readFileSync(path.join(__dirname, '..', 'js', 'app.js'), 'utf8');
const U = require(path.join(__dirname, '..', 'js', 'utils.js'));

function grab(from, to) {
  const i = src.indexOf(from);
  const j = src.indexOf(to, i + 1);
  assert.ok(i !== -1 && j !== -1, 'marker not found in js/app.js: ' + from);
  return src.slice(i, j);
}

function esc(v) {
  return String(v == null ? '' : v)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
function realMinsToHHMM(m) {
  const h = Math.floor(m / 60); const r = m % 60;
  return String(h).padStart(2, '0') + ':' + String(r).padStart(2, '0');
}
function realSessionWindow(tr) {
  const hhmm = (v) => {
    const m = /^(\d{1,2}):(\d{2})$/.exec(String(v || '').trim());
    return m ? Number(m[1]) * 60 + Number(m[2]) : null;
  };
  const start = hhmm(tr && tr.time);
  if (start === null) return null;
  const end = hhmm(tr.endTime);
  return {start, end: end === null ? start + 90 : end};
}

function renderers(opts) {
  const o = opts || {};
  const code = grab("  const STP_GK_FILL = '#f5c842';", '  // #endregion Session plan');
  const deps = {
    sanitize: esc, t: o.t || ((k) => k), fillCss: U.fillCss,
    canEditPage: () => o.canEdit !== false,
    getTrainings: () => o.trainings || [], getUsers: () => o.users || [],
    calledPlayers: () => o.squad || [], isTrainingLocked: () => false, availContext: () => ({}),
    getEffectiveAnswer: () => 'yes', trainingOnly: (l) => (l || []).filter((r) => r.kind !== 'activity'),
    isActivity: (r) => !!r && r.kind === 'activity',
    tbResolveRef: (ref) => (ref && (o.boards || {})[ref.boardId]) || null,
    TB: { peek: (id) => (o.boards || {})[id] || null },
    localStorage: { getItem: () => JSON.stringify(o.bucket || {}), setItem: () => {} },
    document: o.document || { getElementById: () => null, querySelectorAll: () => [] },
    _ntPersistSession: o.persist || (() => null), detailTrainingId: 'now',
    tbRoBoardHtml: (ref) => '<div class="tb-ro-skeleton">' + esc(ref && ref.name) + '</div>',
    hydrateRoBoards: () => {}, scaleRoBoards: () => {}, bindRoBoardAnimations: () => {},
    requestAnimationFrame: (fn) => fn(), sessionWindow: realSessionWindow, minsToHHMM: realMinsToHHMM,
    computeReadiness: () => ({ hasData: false }), posRankGlobal: () => 0,
    sessionAU: (row, rpe) => (rpe ? rpe * 75 : null), loadBand: () => 'moderate',
    tDateLong: (d) => d, activityTitleOf: (row, fb) => (row && row.focus) || fb,
    BG: require(path.join(__dirname, '..', 'js', 'board-geom.js')),
    renderReadOnlyBoard: (b) => '<div class="tb-field-readonly">' + esc(b && b.name) + '</div>',
    // v291
    TN: o.TN,
    getSession: () => o.session || { id: 'me', name: 'Marc Coach' },
    showModal: o.showModal || ((title, msg, ok) => ok()),
    _showPushToast: o.toast || (() => {}),
    localDateStr: U.localDateStr,
    tDateShort: (d) => 'D(' + d + ')',
    renderPage: () => {},
    // v292: the REAL points reader.
    exPointsOf: U.exPointsOf, EX_POINTS_MAX: U.EX_POINTS_MAX,
  };
  // eslint-disable-next-line no-new-func
  return new Function(...Object.keys(deps), `
    ${code}
    return { renderStdPlanPanel, bindStdPlan, bindStdPlanView, stdRefreshPlan,
      _stpNotesHtml: typeof _stpNotesHtml === 'function' ? _stpNotesHtml : null,
      stpLoadIntoSession, stpOpenLoadDialog };`)(...Object.values(deps));
}

module.exports = {renderers, grab, esc};
