/* Exercise points (v292, roadmap 36).
 *
 * The owner's spec: the coach gives points to the teams of each exercise,
 * the app keeps each player's count, the coach sets up periods, and the
 * players see the one he shows them.
 *
 * Four parts, all over the real code:
 *   1. the pure rules in js/utils.js — the tally, the table, the periods;
 *   2. the steppers on the staff session page (test/plan-harness.js), and
 *      that points live BESIDE the plan, where an older app's plan write
 *      cannot erase them;
 *   3. Plantilla's section and its period dialog, over jsdom;
 *   4. the player's card on Les meves estadístiques.
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const {JSDOM} = require('jsdom');
const U = require('../js/utils.js');
const {renderers, grab, esc} = require('./plan-harness');

/* ── 1. The rules ────────────────────────────────────────────────────── */

const team = (key, ids) => ({key, name: key, color: '', ids});
const S = (id, date, plan, exPoints, over) => Object.assign({id, date, category: 'amateur', plan, exPoints}, over || {});
const PLAN = {blocks: [{id: 'b', mins: 20, items: [
  {id: 'e1', title: 'Rondo', teams: [team('g0', ['p1', 'p2']), team('g1', ['p3', 'p4'])]},
  {id: 'e2', title: 'Partidet', teams: [team('g0', ['p1', 'p3']), team('g1', ['p2', 'p4'])]},
]}]};

describe('exercise points — the rules', () => {
  it('a session\'s points are whole numbers 1–99 and nothing else', () => {
    assert.deepStrictEqual(U.exPointsOf({exPoints: {e1: {g0: 3, g1: '2', g2: 0, g3: -4, g4: 'x', g5: 140, g6: 2.6}, e2: null}}),
        {e1: {g0: 3, g1: 2, g5: 99, g6: 3}});
    assert.deepStrictEqual(U.exPointsOf({}), {});
    assert.deepStrictEqual(U.exPointsOf(null), {});
  });

  it('every player in a team earns its points, once per exercise scored', () => {
    const t = U.exercisePointsTally([S('s1', '2026-10-14', PLAN, {e1: {g0: 3}, e2: {g1: 2}})]);
    assert.deepStrictEqual(t, {p1: {pts: 3, ex: 1}, p2: {pts: 5, ex: 2}, p4: {pts: 2, ex: 1}});
  });

  it('counts sessions only, of the category asked, inside the dates — both ends included', () => {
    const rows = [
      S('a', '2026-10-01', PLAN, {e1: {g0: 1}}),
      S('b', '2026-10-31', PLAN, {e1: {g0: 1}}),
      S('c', '2026-11-01', PLAN, {e1: {g0: 1}}),
      S('d', '2026-10-15', PLAN, {e1: {g0: 1}}, {category: 'juvenil'}),
      S('e', '2026-10-15', PLAN, {e1: {g0: 1}}, {kind: 'activity'}),
    ];
    assert.strictEqual(U.exercisePointsTally(rows, {category: 'amateur', from: '2026-10-01', to: '2026-10-31'}).p1.pts, 2);
    assert.strictEqual(U.exercisePointsTally(rows, {category: 'juvenil'}).p1.pts, 1);
  });

  it('reads a v188 plan\'s lanes, and a team with no key by its place', () => {
    const lanes = {blocks: [{id: 'b', lanes: [[{id: 'e1', teams: [{ids: ['p9']}, {ids: ['p8']}]}]]}]};
    assert.deepStrictEqual(U.exercisePointsTally([S('s', '2026-10-14', lanes, {e1: {g1: 4}})]), {p8: {pts: 4, ex: 1}});
  });

  it('points for an exercise or team no longer in the plan count for nobody', () => {
    assert.deepStrictEqual(U.exercisePointsTally([S('s', '2026-10-14', PLAN, {gone: {g0: 9}, e1: {g7: 9}})]), {});
  });

  it('the table: most points first, a tie shares its place, then by name — the pointless listed too', () => {
    const rows = U.pointsRanking({p1: {pts: 5, ex: 2}, p2: {pts: 5, ex: 1}, p3: {pts: 2, ex: 1}},
        [{id: 'p3', name: 'Carla'}, {id: 'p2', name: 'Bru'}, {id: 'p1', name: 'Aleix'}, {id: 'p4', name: 'Dani'}]);
    assert.deepStrictEqual(rows.map((r) => [r.pos, r.name, r.pts]),
        [[1, 'Aleix', 5], [1, 'Bru', 5], [3, 'Carla', 2], [4, 'Dani', 0]]);
  });

  it('periods: dated from ≤ to, at most ONE shown, in date order', () => {
    const list = U.cleanPointPeriods([
      {id: 'b', name: 'Nov', from: '2026-11-01', to: '2026-11-30', shown: true},
      {id: 'a', name: 'Oct', from: '2026-10-01', to: '2026-10-31', shown: true},
      {id: 'x', name: 'Bad', from: '2026-10-31', to: '2026-10-01'},
      {id: 'y', name: 'No dates'},
      {name: 'No id', from: '2026-10-01', to: '2026-10-02'},
    ]);
    assert.deepStrictEqual(list.map((pp) => [pp.id, pp.shown]), [['a', false], ['b', true]]);
  });

  it('the period players see is their category\'s shown one, or none — the season', () => {
    const all = [{id: 'j', category: 'juvenil', from: '2026-10-01', to: '2026-10-31', shown: true},
      {id: 'a', category: 'amateur', from: '2026-10-01', to: '2026-10-31'}];
    assert.strictEqual(U.shownPointPeriod(all, 'juvenil').id, 'j');
    assert.strictEqual(U.shownPointPeriod(all, 'amateur'), null);
  });
});

/* ── 2. The session page ─────────────────────────────────────────────── */

const SQUAD = [{id: 'p1', name: 'Pol A'}, {id: 'p2', name: 'Pere B'}, {id: 'p3', name: 'Joan C'}];
const TR0 = {id: 'now', date: '2026-10-14', time: '20:00', endTime: '21:30', category: 'amateur', plan: {
  blocks: [{id: 'b0', mins: 20, items: [
    {id: 'e1', boardId: '', title: 'Rondo', desc: '', teams: [
      {key: 'g0', name: 'Verds', color: '#43a047', ids: ['p1', 'p2']},
      {key: 'g1', name: 'Blaus', color: '#1e88e5', ids: ['p3']}]},
    {id: 'e2', boardId: '', title: 'Partidet', desc: ''},
  ]}]}};

function page(o) {
  o = o || {};
  const dom = new JSDOM('<body></body>', {url: 'http://localhost/', pretendToBeVisual: true});
  const d = dom.window.document;
  const tr = Object.assign(JSON.parse(JSON.stringify(TR0)), o.over || {});
  const writes = []; const modals = [];
  const R = renderers({
    document: d, trainings: [tr].concat(o.more || []), canEdit: o.canEdit, squad: SQUAD,
    // Templates that FORMAT, so an assertion on a number cannot pass on a bare key.
    t: (k) => ({'pts.pts': '{n} pts', 'plan.load_pts': 'PTS-GO', 'plan.load_confirm': 'COPIES {ex}.',
      'plan.load_replace': 'REPLACES {ex}.', 'plan.ex_1': '1 ex', 'plan.ex_n': '{n} ex'}[k] || k),
    persist: (id, fn) => { writes.push(id); fn(tr); return tr; },
    showModal: (title, msg, ok) => { modals.push({title, msg, ok}); if (o.autoOk !== false) ok(); },
  });
  const draw = () => { d.body.innerHTML = R.renderStdPlanPanel(tr, o.canEdit === false, SQUAD); R.bindStdPlan(); };
  draw();
  const click = (el) => el.dispatchEvent(new dom.window.MouseEvent('click', {bubbles: true}));
  const pts = (ex, key) => d.querySelector('[data-stp-pt="' + ex + '|' + key + '|1"]').parentNode.querySelector('.stp-pts-n').textContent;
  return {d, tr, R, writes, modals, click, pts, draw, plus: (ex, key) => click(d.querySelector('[data-stp-pt="' + ex + '|' + key + '|1"]')),
    minus: (ex, key) => click(d.querySelector('[data-stp-pt="' + ex + '|' + key + '|-1"]'))};
}

describe('exercise points — on the session page', () => {
  it('a stepper on each team of an exercise that has teams, and none on one without', () => {
    const p = page();
    assert.strictEqual(p.d.querySelectorAll('[data-stp-ex="0.0"] .stp-pts').length, 2);
    assert.strictEqual(p.d.querySelector('[data-stp-ex="0.1"] .stp-pts'), null);
    assert.ok(p.d.querySelector('[data-stp-pt="e1|g0|-1"]').disabled, 'below zero is offered');
  });

  it('+ and − write the team\'s points on the session, BESIDE the plan', () => {
    const p = page();
    p.plus('e1', 'g0'); p.plus('e1', 'g0'); p.plus('e1', 'g1');
    assert.deepStrictEqual(p.tr.exPoints, {e1: {g0: 2, g1: 1}});
    assert.ok(!JSON.stringify(p.tr.plan).includes('"pts"') && !('exPoints' in p.tr.plan), 'points went into the plan');
    assert.strictEqual(p.pts('e1', 'g0'), '2');
    p.minus('e1', 'g1');
    assert.deepStrictEqual(p.tr.exPoints, {e1: {g0: 2}}, 'a team back to zero stayed in the map');
    p.minus('e1', 'g0'); p.minus('e1', 'g0');
    assert.ok(!('exPoints' in p.tr), 'an empty map stayed on the row');
  });

  it('an exercise with no teams says, faintly, how to give it points — to an editor only (v294)', () => {
    const p = page();
    assert.strictEqual(p.d.querySelector('[data-stp-ex="0.0"] .stp-pts-hint'), null, 'shown where points can already go');
    assert.strictEqual(p.d.querySelector('[data-stp-ex="0.1"] .stp-pts-hint').textContent, 'pts.hint');
    assert.strictEqual(page({canEdit: false}).d.querySelector('.stp-pts-hint'), null, 'told to someone who cannot assign');
  });

  it('stops at 99', () => {
    const p = page({over: {exPoints: {e1: {g0: 99}}}});
    assert.ok(p.d.querySelector('[data-stp-pt="e1|g0|1"]').disabled);
  });

  it('a plan edit, which rewrites the plan whole, leaves the points where they are', () => {
    const p = page({over: {exPoints: {e1: {g0: 3}}}});
    const mins = p.d.querySelector('[data-stp-mins="0"]');
    mins.value = '25';
    mins.dispatchEvent(new p.d.defaultView.Event('change', {bubbles: true}));
    assert.strictEqual(p.tr.plan.blocks[0].mins, 25, 'the plan write did not happen');
    assert.deepStrictEqual(p.tr.exPoints, {e1: {g0: 3}});
  });

  it('view-only staff see the figure once there is one, and no stepper', () => {
    const p = page({canEdit: false, over: {exPoints: {e1: {g0: 3}}}});
    assert.strictEqual(p.d.querySelector('.stp-pts'), null);
    const ro = [...p.d.querySelectorAll('.stp-pts-ro')].map((x) => x.textContent);
    assert.deepStrictEqual(ro, ['3 pts'], 'zero was printed, or the 3 was not');
  });

  it('taking the teams off asks when there are points, and takes them too', () => {
    const p = page({over: {exPoints: {e1: {g0: 3}, e2: {g0: 1}}}, autoOk: false});
    p.click(p.d.querySelector('[data-stp-unassign="e1"]'));
    assert.strictEqual(p.modals.length, 1);
    assert.deepStrictEqual(p.tr.exPoints, {e1: {g0: 3}, e2: {g0: 1}}, 'gone before the coach said yes');
    p.modals[0].ok();
    assert.deepStrictEqual(p.tr.exPoints, {e2: {g0: 1}});
    assert.strictEqual(p.tr.plan.blocks[0].items[0].teams, null);
    const q = page({autoOk: false});
    q.click(q.d.querySelector('[data-stp-unassign="e1"]'));
    assert.deepStrictEqual([q.modals.length, q.tr.plan.blocks[0].items[0].teams], [0, null]);
    assert.strictEqual(q.writes.length, 1, 'a points write for an exercise that had none');
  });

  it('"Carregar" over a plan with points says so, and the old exercises\' points go', () => {
    const src = {id: 'old', date: '2026-10-07', category: 'amateur', focus: 'X',
      plan: {blocks: [{id: 'z', mins: 10, items: [{id: 'zz', title: 'Nou'}]}]}};
    const p = page({over: {exPoints: {e1: {g0: 3}}}, more: [src], autoOk: false});
    p.R.stpOpenLoadDialog(p.tr, (s2, tpl) => p.R.stpLoadIntoSession('now', s2, tpl));
    p.click(p.d.querySelector('[data-stp-load-i="0"]'));
    assert.strictEqual(p.modals[0].msg, 'COPIES 1 ex. REPLACES 2 ex. PTS-GO');
    p.modals[0].ok();
    assert.ok(!('exPoints' in p.tr), 'the replaced exercises kept their points');
    const q = page({more: [src], autoOk: false});
    q.R.stpOpenLoadDialog(q.tr, () => {});
    q.click(q.d.querySelector('[data-stp-load-i="0"]'));
    assert.strictEqual(q.modals[0].msg, 'COPIES 1 ex. REPLACES 2 ex.', 'a warning about points that are not there');
  });

  it('removing an exercise with points asks, and its points go', () => {
    const p = page({over: {exPoints: {e1: {g0: 3}}}, autoOk: false});
    p.click(p.d.querySelector('[data-stp-del="0.0"]'));
    assert.ok(/plan\.del_ex_pts/.test(p.modals[0].msg));
    p.modals[0].ok();
    assert.ok(!('exPoints' in p.tr));
  });
});

/* ── 3. Plantilla ────────────────────────────────────────────────────── */

const TRAININGS = [
  S('s1', '2026-10-07', PLAN, {e1: {g0: 3}}),                    // p1 p2 +3
  S('s2', '2026-10-20', PLAN, {e1: {g1: 2}, e2: {g0: 1}}),        // p3 p4 +2 · p1 p3 +1
  S('s3', '2026-09-20', PLAN, {e2: {g1: 5}}),                    // p2 p4 +5 (September)
];
const PLAYERS = [{id: 'p1', name: 'Aleix', roles: ['player'], category: 'amateur', team: 'A'},
  {id: 'p2', name: 'Bru', roles: ['player'], category: 'amateur', team: 'A'},
  {id: 'p3', name: 'Carla', roles: ['player'], category: 'amateur', team: 'A'},
  {id: 'p4', name: 'Dani', roles: ['player'], category: 'amateur', team: 'B'}];
const OCT = {id: 'pp_oct', name: 'Octubre', from: '2026-10-01', to: '2026-10-31', category: 'amateur'};

function plantilla(o) {
  o = o || {};
  const dom = new JSDOM('<!doctype html><body><div id="root"></div></body>', {url: 'http://localhost/', pretendToBeVisual: true});
  const d = dom.window.document;
  const store = {fa_point_periods: JSON.stringify(o.periods || [])};
  const saved = []; const modals = [];
  const deps = {
    document: d, sanitize: esc, t: (k) => ({'pts.pos': 'P{p}/{t}'}[k] || k), tDateShort: (x) => 'D(' + x + ')',
    getCurrentCategory: () => 'amateur', canEditPage: () => o.canEdit !== false,
    getTrainings: () => o.trainings || TRAININGS, getUsers: () => PLAYERS,
    plScopedPlayers: () => o.players || PLAYERS.filter((pl) => pl.team === 'A'),
    localStorage: {getItem: (k) => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = v; }},
    ackSave: (k, v) => { store[k] = v; saved.push(k); return Promise.resolve(); },
    showModal: (title, msg, ok) => { modals.push({title, msg, ok}); ok(); },
    _planId: (pre) => pre + '_new', requestAnimationFrame: (fn) => fn(), setTimeout: (fn) => fn(),
    seasonStartStr: () => '2026-08-15', localDateStr: () => '2026-10-21',
    cleanPointPeriods: U.cleanPointPeriods, exercisePointsTally: U.exercisePointsTally,
    pointsRanking: U.pointsRanking, shownPointPeriod: U.shownPointPeriod,
  };
  // eslint-disable-next-line no-new-func
  const api = new Function(...Object.keys(deps), `
    ${grab('  /* ── Exercise points on Plantilla (v292', '  function plScopedPlayers() {')}
    return { ptsSectionHtml, bindPtsControls, msPointsCardHtml, open: () => { _ptsOpen = true; } };`)(...Object.values(deps));
  const mount = () => {
    d.getElementById('root').innerHTML = api.ptsSectionHtml(deps.plScopedPlayers());
    api.bindPtsControls(d.getElementById('pts-secwrap'));
  };
  const click = (el) => el.dispatchEvent(new dom.window.MouseEvent('click', {bubbles: true}));
  const rows = () => [...d.querySelectorAll('.pts-table tbody tr')].map((tr) =>
    [...tr.querySelectorAll('td')].map((td) => td.textContent).slice(0, 3).join(' '));
  return {api, d, store, saved, modals, mount, click, rows,
    periods: () => JSON.parse(store.fa_point_periods || '[]')};
}

describe('exercise points — Plantilla\'s section', () => {
  it('is shut until asked for, naming what it would show', () => {
    const p = plantilla({periods: [Object.assign({shown: true}, OCT)]});
    p.mount();
    assert.strictEqual(p.d.querySelector('.pts-table'), null);
    assert.strictEqual(p.d.querySelector('.plm-sec-note').textContent, 'Octubre');
    p.click(p.d.getElementById('pts-toggle'));
    assert.ok(p.d.querySelector('.pts-table'), 'the toggle does not open it');
  });

  it('opens on the period players see, with the squad\'s table — points, places, the pointless last', () => {
    const p = plantilla({periods: [Object.assign({shown: true}, OCT)]});
    p.api.open(); p.mount();
    assert.deepStrictEqual(p.rows(), ['1 Aleix 4', '2 Bru 3', '2 Carla 3']);
    assert.ok(p.d.querySelector('[data-pts-period="pp_oct"] .pts-eye'), 'the shown period is not marked');
    assert.ok(p.d.querySelector('[data-pts-period="pp_oct"]').classList.contains('pt-chip-on'));
  });

  it('the season chip counts the whole season, September included', () => {
    const p = plantilla({periods: [Object.assign({shown: true}, OCT)]});
    p.api.open(); p.mount();
    p.click(p.d.querySelector('[data-pts-period=""]'));
    assert.deepStrictEqual(p.rows(), ['1 Bru 8', '2 Aleix 4', '3 Carla 3']);
  });

  it('with no period shown, players see the season — and the season chip says so', () => {
    const p = plantilla({periods: [OCT]});
    p.api.open(); p.mount();
    assert.ok(p.d.querySelector('[data-pts-period=""] .pts-eye'));
    assert.ok(p.d.querySelector('[data-pts-period=""]').classList.contains('pt-chip-on'));
  });

  it('says so when nobody has a point', () => {
    const p = plantilla({trainings: []});
    p.api.open(); p.mount();
    assert.ok(p.d.querySelector('.plm-empty'));
    assert.strictEqual(p.d.querySelector('.pts-table'), null);
  });

  it('+ Període: refuses dates the wrong way round, saves a good one stamped with the category', () => {
    const p = plantilla();
    p.api.open(); p.mount();
    p.click(p.d.getElementById('pts-add'));
    const $ = (id) => p.d.getElementById(id);
    $('pts-dlg-name').value = '1a volta';
    $('pts-dlg-from').value = '2026-12-20';
    $('pts-dlg-to').value = '2026-09-01';
    p.click($('pts-dlg-ok'));
    assert.strictEqual($('pts-dlg-err').hidden, false);
    assert.deepStrictEqual(p.saved, []);
    $('pts-dlg-from').value = '2026-09-01';
    $('pts-dlg-to').value = '2026-12-20';
    p.click($('pts-dlg-ok'));
    assert.deepStrictEqual(p.periods().map((pp) => [pp.name, pp.from, pp.to, pp.category]),
        [['1a volta', '2026-09-01', '2026-12-20', 'amateur']]);
  });

  it('showing a period un-shows the category\'s other one — and no other category\'s', () => {
    const J = {id: 'pp_j', name: 'J', from: '2026-10-01', to: '2026-10-31', category: 'juvenil', shown: true};
    const p = plantilla({periods: [Object.assign({shown: true}, OCT), J]});
    p.api.open(); p.mount();
    p.click(p.d.getElementById('pts-add'));
    p.d.getElementById('pts-dlg-from').value = '2026-11-01';
    p.d.getElementById('pts-dlg-to').value = '2026-11-30';
    p.d.getElementById('pts-dlg-shown').checked = true;
    p.click(p.d.getElementById('pts-dlg-ok'));
    const by = Object.fromEntries(p.periods().map((pp) => [pp.id, pp.shown]));
    assert.deepStrictEqual(by, {pp_oct: false, pp_j: true, pp_new: true});
  });

  it('a period can be edited and deleted — the points stay where they are', () => {
    const p = plantilla({periods: [OCT]});
    p.api.open(); p.mount();
    p.click(p.d.querySelector('[data-pts-period="pp_oct"]'));
    p.click(p.d.querySelector('[data-pts-edit="pp_oct"]'));
    assert.strictEqual(p.d.getElementById('pts-dlg-name').value, 'Octubre');
    p.click(p.d.getElementById('pts-dlg-del'));
    assert.strictEqual(p.modals.length, 1);
    assert.deepStrictEqual(p.periods(), []);
  });

  it('staff who may only view the roster get no + and no Edit', () => {
    const p = plantilla({periods: [OCT], canEdit: false});
    p.api.open(); p.mount();
    p.click(p.d.querySelector('[data-pts-period="pp_oct"]'));
    assert.strictEqual(p.d.getElementById('pts-add'), null);
    assert.strictEqual(p.d.querySelector('[data-pts-edit]'), null);
  });
});

/* ── 4. The player's card ────────────────────────────────────────────── */

describe('exercise points — the player\'s card', () => {
  const card = (o, uid) => {
    const p = plantilla(o);
    const html = p.api.msPointsCardHtml(PLAYERS.find((x) => x.id === uid));
    return new JSDOM('<body>' + html + '</body>').window.document;
  };

  it('the shown period: his points and his place among his OWN squad', () => {
    const d = card({periods: [Object.assign({shown: true}, OCT)]}, 'p2');
    assert.ok(d.querySelector('.ms-sec-solo').textContent.includes('Octubre'));
    assert.strictEqual(d.querySelector('.ms-pts-v').textContent, '3');
    // Squad A: Aleix 4, Bru 3, Carla 3 — Dani is squad B and is not in the count.
    assert.strictEqual(d.querySelector('.ms-pts-pos').textContent, 'P2/3');
  });

  it('no period shown: the season', () => {
    const d = card({periods: [OCT]}, 'p2');
    assert.ok(d.querySelector('.ms-sec-solo').textContent.includes('pts.season'));
    assert.strictEqual(d.querySelector('.ms-pts-v').textContent, '8');
  });

  it('nothing at all while nobody in his squad has a point', () => {
    assert.strictEqual(card({trainings: []}, 'p1').body.innerHTML, '');
  });

  it('one point is a point', () => {
    const d = card({trainings: [S('s', '2026-10-14', PLAN, {e2: {g0: 1}})]}, 'p1');
    assert.strictEqual(d.querySelector('.ms-pts-u').textContent, 'pts.unit_1');
  });
});

/* ── Wiring ──────────────────────────────────────────────────────────── */

describe('exercise points — wiring', () => {
  const app = fs.readFileSync(path.join(__dirname, '..', 'js', 'app.js'), 'utf8');
  const shard = require('../js/shard.js');
  it('the periods are a routed, synced, category-sharded key', () => {
    assert.ok(shard.isSharded('fa_point_periods'));
    const db = fs.readFileSync(path.join(__dirname, '..', 'js', 'db.js'), 'utf8');
    assert.ok(/'fa_point_periods',/.test(db), 'not synced');
    assert.ok(/fa_point_periods: \['manage-roster', 'my-stats'\]/.test(app), 'their pages do not refresh');
  });
  it('the season rollover archives them, and a gone category takes them', () => {
    const fns = fs.readFileSync(path.join(__dirname, '..', 'functions', 'index.js'), 'utf8');
    const keys = fns.slice(fns.indexOf('const SEASON_KEYS = ['), fns.indexOf('];', fns.indexOf('const SEASON_KEYS = [')));
    assert.ok(keys.includes('"fa_point_periods"'));
    assert.ok(/catShard\("fa_point_periods"\)/.test(fns));
  });
});
