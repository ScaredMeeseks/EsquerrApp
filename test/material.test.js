/* Unit tests for the session plan and the equipment it costs.
 *
 * Pure logic, no emulator and no browser: `npm run test:material`.
 *
 * Two rules here are load-bearing and neither is obvious from the code:
 *
 *  1. COUNTABLE objects — cones, balls — are reused down a series and needed
 *     at once across parallel lanes. So the composition is a max inside a
 *     lane, a sum across the lanes of one block, and a max across blocks.
 *     Getting this backwards does not crash anything; it just sends a coach
 *     onto the pitch with half the cones he needs.
 *
 *  2. BIBS do not follow that rule at all. A colour is a set taken out of the
 *     store, not an object placed on the grass, so the colours are unioned
 *     across the WHOLE session and one is subtracted — one team always plays
 *     peto-less. Two parallel drills that both use red/blue/green need two
 *     colours of bibs, not four.
 *
 * A goalkeeper is shirt number '1'. That is the app's only keeper marker, and
 * keepers are excluded because nobody hands a goalkeeper a bib.
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const src = fs.readFileSync(path.join(__dirname, '..', 'js', 'app.js'), 'utf8');

function grab(from, to) {
  const i = src.indexOf(from);
  const j = src.indexOf(to, i);
  assert.ok(i !== -1 && j !== -1, 'marker not found in js/app.js: ' + from);
  return src.slice(i, j);
}

/** The pure half of the session-plan region, with its dependencies injected. */
function load(deps) {
  const d = deps || {};
  const code = grab("  const STP_GK_FILL = '#f5c842';", '  // ── Rendering the flow ──');
  // eslint-disable-next-line no-new-func
  return new Function(
      'localStorage', 'tbResolveRef', 'TB', 'isActivity', 'availContext',
      'trainingOnly', 'getTrainings', 'getEffectiveAnswer', `
    ${code}
    return { stdPlan, stdSessionBoards, stdBoardResolver, planMaterial,
             dutyCounts, dutyPool };`)(
      d.localStorage || { getItem: () => null },
      d.tbResolveRef || (() => null),
      d.TB || { peek: () => null },
      d.isActivity || ((r) => !!r && r.kind === 'activity'),
      d.availContext || (() => ({})),
      d.trainingOnly || ((l) => (l || []).filter((r) => r.kind !== 'activity')),
      d.getTrainings || (() => []),
      d.getEffectiveAnswer || (() => 'yes'));
}

const H = load();

/** A board payload. Only the fields the calculator reads. */
const B = (over) => Object.assign({
  cones: [], balls: [],
  positions: null, numbers: null, colors: null, teamColor: '#ffffff',
  oppPositions: null, oppNumbers: null, oppColors: null, oppColor: '#e53935',
  showOpp: false
}, over);

/** n cones at arbitrary coordinates. */
const cones = (n) => Array.from({ length: n }, (_, i) => [i, i]);

/** A board whose only interesting property is its cone count. */
const boards = {
  a: B({ cones: cones(8) }),
  b: B({ cones: cones(12) }),
  c: B({ cones: cones(6) }),
  d: B({ cones: cones(5) })
};
const resolve = (id) => boards[id] || null;

/** One block per argument; each argument is a list of lanes. */
const plan = (...blocks) => ({
  blocks: blocks.map((lanes, i) => ({ id: 'blk' + i, lanes: lanes }))
});
const ex = (boardId) => ({ id: 'ex_' + boardId, boardId: boardId, title: '', desc: '', tag: '' });

describe('material — countable objects compose max/sum/max', () => {
  it('reuses cones down a series: 8 then 12 is 12, not 20', () => {
    const p = plan([[ex('a')]], [[ex('b')]]);
    assert.strictEqual(H.planMaterial(p, resolve).cones, 12);
  });

  it('reuses cones inside one lane too — a lane IS a series', () => {
    const p = plan([[ex('a'), ex('b')]]);
    assert.strictEqual(H.planMaterial(p, resolve).cones, 12);
  });

  it('sums cones across parallel lanes: 8 beside 12 is 20', () => {
    const p = plan([[ex('a')], [ex('b')]]);
    assert.strictEqual(H.planMaterial(p, resolve).cones, 20);
  });

  it('nests correctly: A(8) then [ B(12)->C(6) | D(5) ] is max(8, 12+5)', () => {
    const p = plan([[ex('a')]], [[ex('b'), ex('c')], [ex('d')]]);
    assert.strictEqual(H.planMaterial(p, resolve).cones, 17);
  });

  it('counts balls by the same rule', () => {
    const bb = { one: B({ balls: [[1, 1], [2, 2]] }), two: B({ balls: [[3, 3]] }) };
    const r = (id) => bb[id] || null;
    assert.strictEqual(H.planMaterial(plan([[ex('one')]], [[ex('two')]]), r).balls, 2);
    assert.strictEqual(H.planMaterial(plan([[ex('one')], [ex('two')]]), r).balls, 3);
  });

  it('never counts a null slot — the arrays are not compacted on delete', () => {
    const bb = { gappy: B({ cones: [[0, 0], null, [2, 2], null] }) };
    assert.strictEqual(
        H.planMaterial(plan([[ex('gappy')]]), (id) => bb[id] || null).cones, 2);
  });

  it('an empty plan costs nothing', () => {
    const m = H.planMaterial({ blocks: [] }, resolve);
    assert.deepStrictEqual(
        [m.cones, m.balls, m.petos, m.colors.length, m.unknown], [0, 0, 0, 0, 0]);
  });
});

describe('material — bibs are unioned across the whole session', () => {
  const three = B({
    positions: [[1, 1], [2, 2], [3, 3]],
    numbers: ['7', '9', '11'],
    colors: ['#ff0000', '#0000ff', '#00ff00']
  });
  const r3 = () => three;

  it('two PARALLEL drills using the same three colours need 2, not 4', () => {
    // The example the whole rule was written from. Bibs are a set out of the
    // store; the same red bibs dress whoever is in red, in either drill.
    const m = H.planMaterial(plan([[ex('x')], [ex('y')]]), r3);
    assert.strictEqual(m.colors.length, 3);
    assert.strictEqual(m.petos, 2);
  });

  it('a series of the same three colours also needs 2', () => {
    assert.strictEqual(H.planMaterial(plan([[ex('x')]], [[ex('y')]]), r3).petos, 2);
  });

  it('genuinely different palettes DO add up', () => {
    const bb = {
      warm: B({ positions: [[1, 1], [2, 2]], numbers: ['7', '9'],
        colors: ['#ff0000', '#ff8800'] }),
      cool: B({ positions: [[1, 1], [2, 2]], numbers: ['7', '9'],
        colors: ['#0000ff', '#00ffff'] })
    };
    const m = H.planMaterial(plan([[ex('warm')], [ex('cool')]]), (id) => bb[id]);
    assert.strictEqual(m.colors.length, 4);
    assert.strictEqual(m.petos, 3);
  });

  it('one colour means no bibs at all — that team plays peto-less', () => {
    const one = B({ positions: [[1, 1], [2, 2]], numbers: ['7', '9'] });
    assert.strictEqual(H.planMaterial(plan([[ex('x')]]), () => one).petos, 0);
  });

  it('falls back to the team colour where a player has no override', () => {
    const mixed = B({
      positions: [[1, 1], [2, 2]], numbers: ['7', '9'],
      colors: ['#ff0000', null], teamColor: '#0000ff'
    });
    const m = H.planMaterial(plan([[ex('x')]]), () => mixed);
    assert.deepStrictEqual(m.colors.sort(), ['#0000ff', '#ff0000']);
  });

  it('EXCLUDES the goalkeeper — shirt number 1, and the gold he is painted', () => {
    const withGk = B({
      positions: [[1, 1], [2, 2]],
      numbers: ['1', '7'],
      colors: ['#f5c842', '#e53935']
    });
    const m = H.planMaterial(plan([[ex('x')]]), () => withGk);
    assert.deepStrictEqual(m.colors, ['#e53935']);
    assert.strictEqual(m.petos, 0);
  });

  it('drops the keeper gold even on an outfield slot, as a backstop', () => {
    const goldy = B({
      positions: [[1, 1], [2, 2]], numbers: ['4', '7'],
      colors: ['#F5C842', '#e53935']
    });
    assert.deepStrictEqual(H.planMaterial(plan([[ex('x')]]), () => goldy).colors,
        ['#e53935']);
  });

  it('skips deleted players rather than reading past their null slot', () => {
    const gappy = B({
      positions: [[1, 1], null, [3, 3]],
      numbers: ['7', '9', '11'],
      colors: ['#ff0000', '#0000ff', '#ff0000']
    });
    assert.deepStrictEqual(H.planMaterial(plan([[ex('x')]]), () => gappy).colors,
        ['#ff0000']);
  });

  it('compares STRIPED kits as their encoded string, not as a hex', () => {
    // s|v|4|#ffffff|#000000 is a black-and-white striped shirt. Collapsing it
    // to its first colour would make it indistinguishable from plain white,
    // and the coach would leave one set of bibs behind.
    const striped = B({
      positions: [[1, 1], [2, 2]], numbers: ['7', '9'],
      colors: ['s|v|4|#ffffff|#000000', '#ffffff']
    });
    const m = H.planMaterial(plan([[ex('x')]]), () => striped);
    assert.strictEqual(m.colors.length, 2);
    assert.strictEqual(m.petos, 1);
  });

  it('counts the opposition when the board shows it', () => {
    const both = B({
      positions: [[1, 1]], numbers: ['7'], teamColor: '#ffffff',
      oppPositions: [[9, 9]], oppNumbers: ['7'], oppColor: '#e53935',
      showOpp: true
    });
    const m = H.planMaterial(plan([[ex('x')]]), () => both);
    assert.strictEqual(m.colors.length, 2);
  });

  it('ignores the opposition when the coach hid it', () => {
    const hidden = B({
      positions: [[1, 1]], numbers: ['7'], teamColor: '#ffffff',
      oppPositions: [[9, 9]], oppNumbers: ['7'], oppColor: '#e53935',
      showOpp: false
    });
    assert.deepStrictEqual(H.planMaterial(plan([[ex('x')]]), () => hidden).colors,
        ['#ffffff']);
  });

  it('still reads a legacy board that carries no showOpp flag', () => {
    const legacy = B({
      positions: [[1, 1]], numbers: ['7'], teamColor: '#ffffff',
      oppPositions: [[9, 9]], oppNumbers: ['7'], oppColor: '#e53935'
    });
    delete legacy.showOpp;
    assert.strictEqual(H.planMaterial(plan([[ex('x')]]), () => legacy).colors.length, 2);
  });
});

describe('material — what it cannot price', () => {
  it('reports a free-text exercise as unknown, NOT as zero cones', () => {
    // "no cones" and "we don't know" are different answers, and only one of
    // them should make a coach add something by hand.
    const p = { blocks: [{ id: 'b', lanes: [[{ id: 'e', boardId: '', title: 'Rondo' }]] }] };
    const m = H.planMaterial(p, resolve);
    assert.strictEqual(m.unknown, 1);
    assert.strictEqual(m.priced, 0);
    assert.strictEqual(m.cones, 0);
  });

  it('reports a board that will not resolve as unknown too', () => {
    const m = H.planMaterial(plan([[ex('nope')]]), resolve);
    assert.strictEqual(m.unknown, 1);
  });

  it('prices what it can and flags the rest', () => {
    const p = plan([[ex('a')], [{ id: 'e', boardId: '', title: 'Rondo' }]]);
    const m = H.planMaterial(p, resolve);
    assert.deepStrictEqual([m.cones, m.priced, m.unknown], [8, 1, 1]);
  });
});

describe('stdPlan — normalising whatever is on the row', () => {
  it('a session with no plan reads as an empty one', () => {
    assert.deepStrictEqual(H.stdPlan({}),
        { blocks: [], extra: [], duty: { n: 0, ids: [] } });
  });

  it('drops a block whose lanes are all gone', () => {
    assert.strictEqual(H.stdPlan({ plan: { blocks: [{ id: 'b', lanes: [] }] } })
        .blocks.length, 0);
  });

  it('drops junk that is not an object where an exercise should be', () => {
    const p = H.stdPlan({ plan: { blocks: [{ id: 'b', lanes: [[null, 3, { boardId: 'a' }]] }] } });
    assert.strictEqual(p.blocks[0].lanes[0].length, 1);
    assert.strictEqual(p.blocks[0].lanes[0][0].boardId, 'a');
  });

  it('gives every exercise an id even when the stored one had none', () => {
    const p = H.stdPlan({ plan: { blocks: [{ lanes: [[{ boardId: 'a' }]] }] } });
    assert.ok(p.blocks[0].id);
    assert.ok(p.blocks[0].lanes[0][0].id);
  });

  it('drops an extra-material row with no label, and floors the quantity at 1', () => {
    const p = H.stdPlan({ plan: { extra: [
      { label: '  ' }, { label: 'Porteries', qty: 0 }, { label: 'Escales', qty: '3' }
    ] } });
    assert.deepStrictEqual(p.extra.map((x) => [x.label, x.qty]),
        [['Porteries', 1], ['Escales', 3]]);
  });

  it('never returns more duty ids than slots', () => {
    const p = H.stdPlan({ plan: { duty: { n: 2, ids: ['a', 'b', 'c'] } } });
    assert.deepStrictEqual(p.duty, { n: 2, ids: ['a', 'b'] });
  });

  it('infers the slot count from a legacy list that carries none', () => {
    assert.deepStrictEqual(H.stdPlan({ plan: { duty: { ids: ['a', 'b'] } } }).duty,
        { n: 2, ids: ['a', 'b'] });
  });
});

describe('stdSessionBoards — the bucket is keyed by DATE, not by session', () => {
  const bucket = {
    '2026-09-01': [
      { boardId: 'b1', name: 'Rondo', category: 'cadet' },
      { boardId: 'b2', name: 'Sortida', category: 'juvenil' },
      { boardId: 'b3', name: 'Legacy' }
    ]
  };
  const G = load({ localStorage: { getItem: () => JSON.stringify(bucket) } });

  it('keeps only the refs stamped for this session\'s category', () => {
    const out = G.stdSessionBoards({ date: '2026-09-01', category: 'cadet' });
    assert.deepStrictEqual(out.map((b) => b.boardId), ['b1', 'b3']);
  });

  it('a ref written before the stamp existed belongs to whoever is looking', () => {
    const out = G.stdSessionBoards({ date: '2026-09-01', category: 'juvenil' });
    assert.deepStrictEqual(out.map((b) => b.boardId), ['b2', 'b3']);
  });

  it('a session with no date has no boards', () => {
    assert.deepStrictEqual(G.stdSessionBoards({ category: 'cadet' }), []);
  });
});

describe('dutyCounts — who has already carried the kit', () => {
  const D = (id, over) => Object.assign(
      { id: id, category: 'cadet', date: '2026-09-01' }, over);
  const withDuty = (id, ids, over) =>
      D(id, Object.assign({ plan: { duty: { n: ids.length, ids: ids } } }, over));

  it('counts one appearance per session', () => {
    const list = [withDuty('t1', ['p1', 'p2']), withDuty('t2', ['p1'])];
    assert.deepStrictEqual(H.dutyCounts(list, 'cadet', null), { p1: 2, p2: 1 });
  });

  it('ignores activities — a team dinner is not equipment duty', () => {
    const list = [withDuty('t1', ['p1']), withDuty('t2', ['p1'], { kind: 'activity' })];
    assert.deepStrictEqual(H.dutyCounts(list, 'cadet', null), { p1: 1 });
  });

  it('ignores other categories', () => {
    const list = [withDuty('t1', ['p1']), withDuty('t2', ['p1'], { category: 'juvenil' })];
    assert.deepStrictEqual(H.dutyCounts(list, 'cadet', null), { p1: 1 });
  });

  it('excludes the session being edited, so re-picking is not self-penalising', () => {
    const list = [withDuty('t1', ['p1']), withDuty('t2', ['p1'])];
    assert.deepStrictEqual(H.dutyCounts(list, 'cadet', 't2'), { p1: 1 });
  });

  it('sessions with no plan contribute nothing', () => {
    assert.deepStrictEqual(H.dutyCounts([D('t1'), D('t2')], 'cadet', null), {});
  });
});

describe('dutyPool — the fairness floor', () => {
  const squad = [
    { id: 'p1', name: 'Aleix' }, { id: 'p2', name: 'Berta' },
    { id: 'p3', name: 'Carles' }, { id: 'p4', name: 'David' }
  ];
  /* p1 has carried it twice, p2 once, p3 and p4 never. */
  const history = [
    { id: 'h1', category: 'cadet', plan: { duty: { n: 2, ids: ['p1', 'p2'] } } },
    { id: 'h2', category: 'cadet', plan: { duty: { n: 1, ids: ['p1'] } } }
  ];
  function pool(sessionPlan, answers) {
    const P = load({
      getTrainings: () => history,
      getEffectiveAnswer: (id) => (answers ? (answers[id] || 'no') : 'yes')
    });
    return P.dutyPool(
        { id: 'now', category: 'cadet', plan: sessionPlan }, squad, false);
  }

  it('sorts by duty count, then by name', () => {
    assert.deepStrictEqual(pool(null).rows.map((r) => [r.name, r.n]),
        [['Carles', 0], ['David', 0], ['Berta', 1], ['Aleix', 2]]);
  });

  it('the floor is the lowest count still available', () => {
    assert.strictEqual(pool(null).floor, 0);
  });

  it('the floor RISES once everyone at it is picked', () => {
    // This is the whole mechanism: it advances on its own rather than
    // deadlocking once the untouched players are used up.
    const p = pool({ duty: { n: 2, ids: ['p3', 'p4'] } });
    assert.strictEqual(p.floor, 1);
  });

  it('keeps only players who are actually coming', () => {
    const p = pool(null, { p1: 'yes', p2: 'late', p3: 'no', p4: 'injured' });
    assert.deepStrictEqual(p.rows.map((r) => r.name), ['Berta', 'Aleix']);
  });

  it('counts a late player as attending — he is still there to carry it', () => {
    const p = pool(null, { p1: 'no', p2: 'no', p3: 'late', p4: 'no' });
    assert.deepStrictEqual(p.rows.map((r) => r.name), ['Carles']);
  });

  it('an empty squad has an empty pool and does not throw', () => {
    const P = load({ getTrainings: () => history });
    const p = P.dutyPool({ id: 'now', category: 'cadet' }, [], false);
    assert.deepStrictEqual(p.rows, []);
    assert.strictEqual(p.floor, 0);
  });
});

/* ── The RENDERERS, run for real ──────────────────────────────────
   js/app.js has no browser coverage, and the failure mode of a mistyped
   identifier in a string-building block is a BLANK TRAINING PAGE for every
   coach in the club, discovered by a human. So the flow panel and the
   material card are executed here over stubs: the assertions are modest, but
   "it parses and every helper it calls exists" is most of the value. */
const U = require(path.join(__dirname, '..', 'js', 'utils.js'));

function esc(v) {
  return String(v == null ? '' : v)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function renderers(opts) {
  const o = opts || {};
  const code = grab("  const STP_GK_FILL = '#f5c842';", '  // #endregion Session plan');
  // eslint-disable-next-line no-new-func
  return new Function(
      'sanitize', 't', 'fillCss', 'canEditPage', 'getTrainings', 'getUsers',
      'calledPlayers', 'isTrainingLocked', 'availContext', 'getEffectiveAnswer',
      'trainingOnly', 'isActivity', 'tbResolveRef', 'TB', 'localStorage',
      'document', '_ntPersistSession', 'detailTrainingId', 'tbRoBoardHtml',
      'hydrateRoBoards', 'scaleRoBoards', 'requestAnimationFrame', `
    ${code}
    return { renderStdPlanPanel, renderStdMaterialCard, bindStdPlan };`)(
      esc,
      (k) => k,
      U.fillCss,
      () => o.canEdit !== false,
      () => o.trainings || [],
      () => o.users || [],
      () => o.squad || [],
      () => false,
      () => ({}),
      (id) => (o.answers ? (o.answers[id] || 'no') : 'yes'),
      (l) => (l || []).filter((r) => r.kind !== 'activity'),
      (r) => !!r && r.kind === 'activity',
      () => null,
      { peek: (id) => (o.boards || {})[id] || null },
      { getItem: () => JSON.stringify(o.bucket || {}) },
      { getElementById: () => null, querySelectorAll: () => [] },
      () => null,
      'now',
      (ref) => '<div class="tb-ro-skeleton">' + esc(ref && ref.name) + '</div>',
      () => {}, () => {}, () => {});
}

describe('the session plan renders', () => {
  const TR = { id: 'now', date: '2026-09-01', category: 'cadet' };

  it('an empty plan still offers somewhere to start', () => {
    const R = renderers();
    const html = R.renderStdPlanPanel(TR, false);
    assert.ok(html.includes('id="std-plan-panel"'));
    assert.ok(html.includes('plan.empty'));
    assert.ok(html.includes('data-stp-add="0"'), 'the first + must exist');
  });

  it('draws a connector between every pair of blocks, and one at each end', () => {
    const R = renderers();
    const tr = Object.assign({}, TR, { plan: plan([[ex('a')]], [[ex('b')]]) });
    const html = R.renderStdPlanPanel(tr, false);
    // Two blocks → three connectors: before, between, after.
    assert.strictEqual((html.match(/data-stp-add="/g) || []).length, 3);
    // Plus an in-lane + after each exercise, which appends to that lane
    // rather than starting a new block.
    assert.strictEqual((html.match(/data-stp-in="/g) || []).length, 2);
    assert.ok(html.includes('data-stp-branch="0"'));
  });

  it('marks a multi-lane block as parallel and rails it top and bottom', () => {
    const R = renderers();
    const tr = Object.assign({}, TR, { plan: plan([[ex('a')], [ex('b')]]) });
    const html = R.renderStdPlanPanel(tr, false);
    assert.ok(html.includes('stp-parallel'));
    assert.ok(html.includes('stp-rail-fork') && html.includes('stp-rail-merge'));
    assert.ok(html.includes('data-stp-lane="0.0"') && html.includes('data-stp-lane="0.1"'));
  });

  it('a single-lane block gets no branch chrome at all', () => {
    const R = renderers();
    const tr = Object.assign({}, TR, { plan: plan([[ex('a')]]) });
    const html = R.renderStdPlanPanel(tr, false);
    assert.ok(!html.includes('stp-parallel'));
    assert.ok(!html.includes('stp-rail'));
  });

  it('offers to drop the empty lane a branch just created', () => {
    const R = renderers();
    const tr = Object.assign({}, TR, { plan: plan([[ex('a')], []]) });
    assert.ok(R.renderStdPlanPanel(tr, false).includes('data-stp-lane-del="0.1"'));
  });

  it('read-only strips every control but keeps the flow', () => {
    const R = renderers();
    const tr = Object.assign({}, TR, { plan: plan([[ex('a')], [ex('b')]]) });
    const html = R.renderStdPlanPanel(tr, true);
    assert.ok(html.includes('stp-ex'), 'the exercises are still shown');
    ['data-stp-add', 'data-stp-branch', 'data-stp-del', 'draggable',
      'data-stp-lane-add'].forEach((c) => {
      assert.ok(!html.includes(c), c + ' must not survive read-only');
    });
  });

  it('prefers the board\'s own name over whatever the plan cached', () => {
    const R = renderers({ boards: { a: { name: 'Rondo 4v2', cones: [] } } });
    const tr = Object.assign({}, TR,
        { plan: { blocks: [{ id: 'b', lanes: [[{ boardId: 'a', title: 'stale' }]] }] } });
    const html = R.renderStdPlanPanel(tr, false);
    assert.ok(html.includes('Rondo 4v2'));
    assert.ok(!html.includes('stale'));
  });

  it('escapes a free exercise written by a coach', () => {
    const R = renderers();
    const tr = Object.assign({}, TR, { plan: { blocks: [{ id: 'b', lanes: [[
      { boardId: '', title: '<img src=x onerror=alert(1)>', desc: '"&<>' }
    ]] }] } });
    const html = R.renderStdPlanPanel(tr, false);
    assert.ok(!html.includes('<img'), 'a title is never injected raw');
    assert.ok(html.includes('&lt;img'));
    assert.ok(html.includes('&quot;&amp;&lt;&gt;'));
  });
});

describe('the material card renders', () => {
  const TR = { id: 'now', date: '2026-09-01', category: 'cadet' };
  const squad = [{ id: 'p1', name: 'Aleix' }, { id: 'p2', name: 'Berta' }];

  it('says so plainly when there is nothing to calculate', () => {
    const R = renderers({ squad: squad });
    const html = R.renderStdMaterialCard(TR, squad, false, false);
    assert.ok(html.includes('id="std-material-card"'));
    assert.ok(html.includes('mat.nothing'));
  });

  it('shows the cone count and a swatch per bib colour', () => {
    const R = renderers({
      boards: { a: { cones: cones(9), positions: [[1, 1], [2, 2]],
        numbers: ['7', '9'], colors: ['#ff0000', '#0000ff'] } }
    });
    const tr = Object.assign({}, TR, { plan: plan([[ex('a')]]) });
    const html = R.renderStdMaterialCard(tr, squad, false, false);
    assert.ok(/mat\.cones<\/span><span class="stm-qty">9</.test(html));
    assert.strictEqual((html.match(/class="stm-swatch"/g) || []).length, 2);
    assert.ok(/mat\.petos.*stm-qty">1</s.test(html), 'two colours means one set of bibs');
  });

  it('warns about the exercises it could not price', () => {
    const R = renderers();
    const tr = Object.assign({}, TR,
        { plan: { blocks: [{ id: 'b', lanes: [[{ boardId: '', title: 'Rondo' }]] }] } });
    assert.ok(R.renderStdMaterialCard(tr, squad, false, false).includes('mat.unknown'));
  });

  it('lists what the coach added by hand, with a way to remove it', () => {
    const R = renderers();
    const tr = Object.assign({}, TR,
        { plan: { extra: [{ id: 'x', label: 'Porteries', qty: 2 }] } });
    const html = R.renderStdMaterialCard(tr, squad, false, false);
    assert.ok(html.includes('Porteries'));
    assert.ok(html.includes('data-stm-del="0"'));
  });

  it('renders one duty slot per requested encarregat', () => {
    const R = renderers({ trainings: [] });
    const tr = Object.assign({}, TR, { plan: { duty: { n: 2, ids: [] } } });
    const html = R.renderStdMaterialCard(tr, squad, false, false);
    assert.strictEqual((html.match(/class="reg-input stm-duty-sel"/g) || []).length, 2);
    assert.ok(html.includes('id="stm-duty-random"'));
    assert.ok(html.includes('id="stm-duty-all"'));
  });

  it('greys out a player who is ahead of the rest', () => {
    const R = renderers({
      trainings: [{ id: 'h1', category: 'cadet', plan: { duty: { n: 1, ids: ['p1'] } } }]
    });
    const tr = Object.assign({}, TR, { plan: { duty: { n: 1, ids: [] } } });
    const html = R.renderStdMaterialCard(tr, squad, false, false);
    // Berta (0) is offered; Aleix (1) is above the floor and blocked.
    assert.ok(/value="p2"[^>]*>Berta \(0\)/.test(html));
    assert.ok(/value="p1" disabled>Aleix \(1\)/.test(html));
  });

  it('read-only shows who is on duty and offers no controls', () => {
    const R = renderers({ trainings: [] });
    const tr = Object.assign({}, TR, { plan: { duty: { n: 1, ids: ['p1'] } } });
    const html = R.renderStdMaterialCard(tr, squad, false, true);
    assert.ok(html.includes('Aleix'));
    ['stm-duty-sel', 'stm-duty-random', 'stm-extra-add', 'data-stm-del']
        .forEach((c) => assert.ok(!html.includes(c), c + ' must not survive read-only'));
  });

  it('bindStdPlan is inert when the panel is not on the page', () => {
    // It runs on every render of every page; detailTrainingId outlives the
    // page that set it, so the DOM check has to come first.
    const R = renderers();
    assert.doesNotThrow(() => R.bindStdPlan());
  });
});
