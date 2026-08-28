/* Unit tests for the session plan and the equipment it costs.
 *
 * Pure logic, no emulator and no browser: `npm run test:material`.
 *
 * Two rules here are load-bearing and neither is obvious from the code:
 *
 *  1. COUNTABLE objects — cones, balls — are reused between blocks and needed
 *     at once inside one. A block is a single time slot, so the composition
 *     is a SUM across the items of a block and a MAX across blocks.
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
      'trainingOnly', 'getTrainings', 'getEffectiveAnswer', 'sessionWindow',
      'minsToHHMM', 't', `
    ${code}
    return { stdPlan, stdSessionBoards, stdBoardResolver, planMaterial,
             dutyCounts, dutyPool, blockTimes, resolvePetos, draftTeams,
             stdAvailable, STP_PALETTE };`)(
      d.localStorage || { getItem: () => null },
      d.tbResolveRef || (() => null),
      d.TB || { peek: () => null },
      d.isActivity || ((r) => !!r && r.kind === 'activity'),
      d.availContext || (() => ({})),
      d.trainingOnly || ((l) => (l || []).filter((r) => r.kind !== 'activity')),
      d.getTrainings || (() => []),
      d.getEffectiveAnswer || (() => 'yes'),
      d.sessionWindow || realSessionWindow,
      d.minsToHHMM || realMinsToHHMM,
      d.t || ((k) => k));
}

/* The two time helpers the rail depends on, as app.js defines them. Real
   implementations rather than stubs: `blockTimes` is arithmetic ON them, and
   a stub that rounded differently would test nothing. */
function realMinsToHHMM(m) {
  const h = Math.floor(m / 60), r = m % 60;
  return String(h).padStart(2, '0') + ':' + String(r).padStart(2, '0');
}
function realSessionWindow(t2, fallbackMins) {
  if (!t2) return null;
  const parts = String(t2.time || '').split(' - ');
  const hhmm = (v) => {
    const m = /^(\d{1,2}):(\d{2})$/.exec(String(v || '').trim());
    return m ? Number(m[1]) * 60 + Number(m[2]) : null;
  };
  const start = hhmm(parts[0]);
  if (start === null) return null;
  let end = hhmm(t2.endTime);
  if (end === null && parts.length > 1) end = hhmm(parts[1]);
  if (end === null || end <= start) end = start + (fallbackMins > 0 ? fallbackMins : 90);
  return { start: start, end: end };
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

/** One block per argument; each argument is that block's parallel items. */
const plan = (...blocks) => ({
  blocks: blocks.map((items, i) => ({ id: 'blk' + i, mins: 15, label: '', items: items }))
});
const ex = (boardId) => ({ id: 'ex_' + boardId, boardId: boardId, title: '', desc: '', tag: '' });

describe('material — countable objects compose sum-within, max-across', () => {
  it('reuses cones between blocks: 8 then 12 is 12, not 20', () => {
    const p = plan([ex('a')], [ex('b')]);
    assert.strictEqual(H.planMaterial(p, resolve).cones, 12);
  });

  it('sums cones INSIDE a block: 8 beside 12 is 20', () => {
    // v189: a block is one time slot, so everything in it is concurrent.
    const p = plan([ex('a'), ex('b')]);
    assert.strictEqual(H.planMaterial(p, resolve).cones, 20);
  });

  it('a three-way block sums all three', () => {
    assert.strictEqual(
        H.planMaterial(plan([ex('b'), ex('c'), ex('d')]), resolve).cones, 23);
  });

  it('composes: A(8), then a block of B(12)+C(6)+D(5) → max(8, 23)', () => {
    const p = plan([ex('a')], [ex('b'), ex('c'), ex('d')]);
    assert.strictEqual(H.planMaterial(p, resolve).cones, 23);
  });

  it('the busiest block sets the total, wherever it sits', () => {
    // The peak is what a coach has to carry, not the last block.
    assert.strictEqual(
        H.planMaterial(plan([ex('b'), ex('c')], [ex('a')]), resolve).cones, 18);
  });

  it('counts balls by the same rule', () => {
    const bb = { one: B({ balls: [[1, 1], [2, 2]] }), two: B({ balls: [[3, 3]] }) };
    const r = (id) => bb[id] || null;
    assert.strictEqual(H.planMaterial(plan([ex('one')], [ex('two')]), r).balls, 2);
    assert.strictEqual(H.planMaterial(plan([ex('one'), ex('two')]), r).balls, 3);
  });

  it('never counts a null slot — the arrays are not compacted on delete', () => {
    const bb = { gappy: B({ cones: [[0, 0], null, [2, 2], null] }) };
    assert.strictEqual(
        H.planMaterial(plan([ex('gappy')]), (id) => bb[id] || null).cones, 2);
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
    const m = H.planMaterial(plan([ex('x'), ex('y')]), r3);
    assert.strictEqual(m.colors.length, 3);
    assert.strictEqual(m.petos, 2);
  });

  it('a series of the same three colours also needs 2', () => {
    assert.strictEqual(H.planMaterial(plan([ex('x')], [ex('y')]), r3).petos, 2);
  });

  it('genuinely different palettes DO add up', () => {
    const bb = {
      warm: B({ positions: [[1, 1], [2, 2]], numbers: ['7', '9'],
        colors: ['#ff0000', '#ff8800'] }),
      cool: B({ positions: [[1, 1], [2, 2]], numbers: ['7', '9'],
        colors: ['#0000ff', '#00ffff'] })
    };
    const m = H.planMaterial(plan([ex('warm'), ex('cool')]), (id) => bb[id]);
    assert.strictEqual(m.colors.length, 4);
    assert.strictEqual(m.petos, 3);
  });

  it('one colour means no bibs at all — that team plays peto-less', () => {
    const one = B({ positions: [[1, 1], [2, 2]], numbers: ['7', '9'] });
    assert.strictEqual(H.planMaterial(plan([ex('x')]), () => one).petos, 0);
  });

  it('falls back to the team colour where a player has no override', () => {
    const mixed = B({
      positions: [[1, 1], [2, 2]], numbers: ['7', '9'],
      colors: ['#ff0000', null], teamColor: '#0000ff'
    });
    const m = H.planMaterial(plan([ex('x')]), () => mixed);
    assert.deepStrictEqual(m.colors.sort(), ['#0000ff', '#ff0000']);
  });

  it('EXCLUDES the goalkeeper — shirt number 1, and the gold he is painted', () => {
    const withGk = B({
      positions: [[1, 1], [2, 2]],
      numbers: ['1', '7'],
      colors: ['#f5c842', '#e53935']
    });
    const m = H.planMaterial(plan([ex('x')]), () => withGk);
    assert.deepStrictEqual(m.colors, ['#e53935']);
    assert.strictEqual(m.petos, 0);
  });

  it('drops the keeper gold even on an outfield slot, as a backstop', () => {
    const goldy = B({
      positions: [[1, 1], [2, 2]], numbers: ['4', '7'],
      colors: ['#F5C842', '#e53935']
    });
    assert.deepStrictEqual(H.planMaterial(plan([ex('x')]), () => goldy).colors,
        ['#e53935']);
  });

  it('skips deleted players rather than reading past their null slot', () => {
    const gappy = B({
      positions: [[1, 1], null, [3, 3]],
      numbers: ['7', '9', '11'],
      colors: ['#ff0000', '#0000ff', '#ff0000']
    });
    assert.deepStrictEqual(H.planMaterial(plan([ex('x')]), () => gappy).colors,
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
    const m = H.planMaterial(plan([ex('x')]), () => striped);
    assert.strictEqual(m.colors.length, 2);
    assert.strictEqual(m.petos, 1);
  });

  it('counts the opposition when the board shows it', () => {
    const both = B({
      positions: [[1, 1]], numbers: ['7'], teamColor: '#ffffff',
      oppPositions: [[9, 9]], oppNumbers: ['7'], oppColor: '#e53935',
      showOpp: true
    });
    const m = H.planMaterial(plan([ex('x')]), () => both);
    assert.strictEqual(m.colors.length, 2);
  });

  it('ignores the opposition when the coach hid it', () => {
    const hidden = B({
      positions: [[1, 1]], numbers: ['7'], teamColor: '#ffffff',
      oppPositions: [[9, 9]], oppNumbers: ['7'], oppColor: '#e53935',
      showOpp: false
    });
    assert.deepStrictEqual(H.planMaterial(plan([ex('x')]), () => hidden).colors,
        ['#ffffff']);
  });

  it('still reads a legacy board that carries no showOpp flag', () => {
    const legacy = B({
      positions: [[1, 1]], numbers: ['7'], teamColor: '#ffffff',
      oppPositions: [[9, 9]], oppNumbers: ['7'], oppColor: '#e53935'
    });
    delete legacy.showOpp;
    assert.strictEqual(H.planMaterial(plan([ex('x')]), () => legacy).colors.length, 2);
  });
});

describe('material — what it cannot price', () => {
  it('reports a free-text exercise as unknown, NOT as zero cones', () => {
    // "no cones" and "we don't know" are different answers, and only one of
    // them should make a coach add something by hand.
    const p = { blocks: [{ id: 'b', items: [{ id: 'e', boardId: '', title: 'Rondo' }] }] };
    const m = H.planMaterial(p, resolve);
    assert.strictEqual(m.unknown, 1);
    assert.strictEqual(m.priced, 0);
    assert.strictEqual(m.cones, 0);
  });

  it('reports a board that will not resolve as unknown too', () => {
    const m = H.planMaterial(plan([ex('nope')]), resolve);
    assert.strictEqual(m.unknown, 1);
  });

  it('prices what it can and flags the rest', () => {
    const p = plan([ex('a'), { id: 'e', boardId: '', title: 'Rondo' }]);
    const m = H.planMaterial(p, resolve);
    assert.deepStrictEqual([m.cones, m.priced, m.unknown], [8, 1, 1]);
  });
});

describe('stdPlan — normalising whatever is on the row', () => {
  it('a session with no plan reads as an empty one', () => {
    assert.deepStrictEqual(H.stdPlan({}), {
      blocks: [], extra: [], duty: { n: 0, ids: [] },
      // null, NOT [] — see resolvePetos: null means "the boards still speak
      // for the bibs", [] means the coach removed every colour on purpose.
      petos: null, teams: null
    });
  });

  it('gives a block a duration even when the stored row had none', () => {
    const p = H.stdPlan({ plan: { blocks: [{ items: [{ boardId: 'a' }] }] } });
    assert.strictEqual(p.blocks[0].mins, 15);
    assert.strictEqual(p.blocks[0].label, '');
  });

  it('clamps a nonsense duration rather than trusting it', () => {
    const mk = (mins) => H.stdPlan(
        { plan: { blocks: [{ mins: mins, items: [{ boardId: 'a' }] }] } })
        .blocks[0].mins;
    // 0 would stack two exercises on the same minute in the time gutter.
    assert.strictEqual(mk(0), 15);
    assert.strictEqual(mk(-5), 15);
    assert.strictEqual(mk(9999), 240);
    assert.strictEqual(mk('25'), 25);
  });

  it('keeps petos null until someone writes a list', () => {
    assert.strictEqual(H.stdPlan({ plan: {} }).petos, null);
    assert.deepStrictEqual(H.stdPlan({ plan: { petos: [] } }).petos, []);
    assert.deepStrictEqual(
        H.stdPlan({ plan: { petos: ['#FF0000', ' ', '#00ff00'] } }).petos,
        ['#ff0000', '#00ff00']);
  });

  it('drops a teams object with no usable groups', () => {
    assert.strictEqual(H.stdPlan({ plan: { teams: {} } }).teams, null);
    assert.strictEqual(H.stdPlan({ plan: { teams: { groups: [] } } }).teams, null);
    const p = H.stdPlan({ plan: { teams: { groups: [{ ids: ['a'] }, { ids: [] }] } } });
    assert.strictEqual(p.teams.n, 2);
    assert.deepStrictEqual(p.teams.groups[0].ids, ['a']);
  });

  it('drops a block with nothing left in it', () => {
    assert.strictEqual(H.stdPlan({ plan: { blocks: [{ id: 'b', items: [] }] } })
        .blocks.length, 0);
    assert.strictEqual(H.stdPlan({ plan: { blocks: [{ id: 'b', lanes: [] }] } })
        .blocks.length, 0);
  });

  /* v188 nested a second level — a block held LANES, each a series. v189
     collapsed that: a block is one time slot and everything in it is
     parallel. A row written by v188 is migrated by flattening its lanes,
     which is what the coach who drew it meant anyway. */
  it('migrates a v188 row by flattening its lanes into items', () => {
    const p = H.stdPlan({ plan: { blocks: [{ id: 'b', lanes: [
      [{ id: 'e1', boardId: 'a' }, { id: 'e2', boardId: 'b' }],
      [{ id: 'e3', boardId: 'c' }]
    ] }] } });
    assert.deepStrictEqual(p.blocks[0].items.map((e) => e.id), ['e1', 'e2', 'e3']);
    assert.strictEqual(p.blocks[0].lanes, undefined, 'lanes must not survive');
  });

  it('prefers items over lanes when a row somehow carries both', () => {
    const p = H.stdPlan({ plan: { blocks: [{ id: 'b',
      items: [{ id: 'new', boardId: 'a' }],
      lanes: [[{ id: 'old', boardId: 'b' }]] }] } });
    assert.deepStrictEqual(p.blocks[0].items.map((e) => e.id), ['new']);
  });

  /* Teams pinned to an exercise are a COPY, not a pointer at plan.teams.
     Pointing was a real bug: re-drafting rewrote every exercise a split had
     already been attached to, so a coach who set up the rondo and then
     regenerated for the finishing game lost the first one silently. */
  it('keeps each exercise\'s teams as its own list', () => {
    const p = H.stdPlan({ plan: {
      blocks: [{ id: 'b', items: [
        { id: 'e1', boardId: 'a', teams: [{ key: 'g0', name: 'Equip 1', color: '#ff0000', ids: ['p1'] }] },
        { id: 'e2', boardId: 'b' }
      ] }],
      teams: { groups: [{ key: 'g0', name: 'Equip 1', ids: ['p9'] }] }
    } });
    // The exercise keeps p1 even though the generator now holds p9.
    assert.deepStrictEqual(p.blocks[0].items[0].teams[0].ids, ['p1']);
    assert.strictEqual(p.blocks[0].items[1].teams, null);
    assert.deepStrictEqual(p.teams.groups[0].ids, ['p9']);
  });

  it('pins the colour onto the copy as well', () => {
    // Repainting a bib afterwards changes what the NEXT drill wears, not
    // what was already decided for this one.
    const p = H.stdPlan({ plan: { blocks: [{ id: 'b', items: [
      { id: 'e1', boardId: 'a', teams: [{ ids: ['p1'], color: '#8e24aa' }] }
    ] }] } });
    assert.strictEqual(p.blocks[0].items[0].teams[0].color, '#8e24aa');
  });

  it('an exercise with no teams reads as null, never an empty list', () => {
    const p = H.stdPlan({ plan: { blocks: [{ id: 'b', items: [
      { id: 'e1', boardId: 'a', teams: [] },
      { id: 'e2', boardId: 'b', teams: 'nonsense' }
    ] }] } });
    assert.strictEqual(p.blocks[0].items[0].teams, null);
    assert.strictEqual(p.blocks[0].items[1].teams, null);
  });

  it('drops junk that is not an object where an exercise should be', () => {
    const p = H.stdPlan({ plan: { blocks: [{ id: 'b', items: [null, 3, { boardId: 'a' }] }] } });
    assert.strictEqual(p.blocks[0].items.length, 1);
    assert.strictEqual(p.blocks[0].items[0].boardId, 'a');
  });

  it('gives every exercise an id even when the stored one had none', () => {
    const p = H.stdPlan({ plan: { blocks: [{ items: [{ boardId: 'a' }] }] } });
    assert.ok(p.blocks[0].id);
    assert.ok(p.blocks[0].items[0].id);
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

describe('blockTimes — the clock down the rail', () => {
  const S = { id: 'now', date: '2026-09-01', time: '20:00', endTime: '21:30' };
  const P = (...mins) => ({ blocks: mins.map((m, i) => ({ id: 'b' + i, mins: m, items: [] })) });

  it('accumulates each block from the session start', () => {
    const out = H.blockTimes(S, P(15, 25, 20, 15));
    assert.deepStrictEqual(out.rows.map((r) => r.label),
        ['20:00', '20:15', '20:40', '21:00']);
  });

  it('reports where the plan ACTUALLY ends, not where the slot does', () => {
    // A plan that overruns its slot is a thing the coach needs to see.
    assert.strictEqual(H.blockTimes(S, P(15, 25, 20, 15)).endLabel, '21:15');
    assert.strictEqual(H.blockTimes(S, P(60, 60)).endLabel, '22:00');
  });

  it('an empty plan ends when it starts', () => {
    const out = H.blockTimes(S, { blocks: [] });
    assert.deepStrictEqual(out.rows, []);
    assert.strictEqual(out.endLabel, '20:00');
  });

  it('wraps past midnight rather than printing 25:00', () => {
    // minsToHHMM refuses an hour above 23, and `new Date('…T25:00')` is an
    // Invalid Date that every comparison silently answers false for.
    const late = { id: 'x', date: '2026-09-01', time: '23:30', endTime: '00:30' };
    assert.strictEqual(H.blockTimes(late, P(30, 30)).endLabel, '00:30');
  });

  it('survives a session with no usable time at all', () => {
    assert.strictEqual(H.blockTimes({ id: 'x' }, P(15)).rows[0].label, '00:00');
  });
});

describe('resolvePetos — derived until the coach says otherwise', () => {
  it('uses the boards while the session has no list of its own', () => {
    assert.deepStrictEqual(
        H.resolvePetos({ petos: null }, { colors: ['#ff0000', '#0000ff'] }),
        ['#ff0000', '#0000ff']);
  });

  it('uses the coach\'s list once there is one', () => {
    assert.deepStrictEqual(
        H.resolvePetos({ petos: ['#8e24aa'] }, { colors: ['#ff0000', '#0000ff'] }),
        ['#8e24aa']);
  });

  it('an EMPTY list is a decision, not an absence', () => {
    // The distinction the whole null/[] split exists for: a coach who
    // removed every swatch must not have the boards put them back.
    assert.deepStrictEqual(H.resolvePetos({ petos: [] }, { colors: ['#ff0000'] }), []);
  });
});

describe('draftTeams — the snake draft', () => {
  const P = (id, rank, ac) => ({ id: id, rank: rank, ac: ac });
  const pool8 = [
    P('a', 0, 1.2), P('b', 1, 1.1), P('c', 1, 1.0), P('d', 3, 0.9),
    P('e', 4, 0.8), P('f', 5, 0.7), P('g', 6, 0.6), P('h', 8, 0.5)
  ];

  it('deals everyone, exactly once', () => {
    const out = H.draftTeams(pool8, 2);
    const all = out.groups.reduce((acc, g) => acc.concat(g.ids), []);
    assert.strictEqual(all.length, 8);
    assert.strictEqual(new Set(all).size, 8);
  });

  it('REVERSES every second round — that is what makes it fair', () => {
    // Straight round-robin hands team 1 the best player in every round.
    // Round 0 deals a,b left-to-right; round 1 deals c,d right-to-left, so
    // team 2 gets c. Team 1 taking both a and c would be the bug.
    const out = H.draftTeams(pool8, 2);
    assert.ok(out.groups[0].ids.indexOf('a') !== -1, 'best player leads team 1');
    assert.ok(out.groups[1].ids.indexOf('c') !== -1,
        'the next round must deal back the other way');
  });

  it('keeps the teams within one player of each other', () => {
    [2, 3, 4].forEach((n) => {
      const sizes = H.draftTeams(pool8, n).groups.map((g) => g.ids.length);
      assert.ok(Math.max.apply(null, sizes) - Math.min.apply(null, sizes) <= 1,
          n + ' teams should be even, got ' + sizes.join('/'));
    });
  });

  it('clamps the count to 2–4', () => {
    assert.strictEqual(H.draftTeams(pool8, 1).n, 2);
    assert.strictEqual(H.draftTeams(pool8, 99).n, 4);
    assert.strictEqual(H.draftTeams(pool8, 0).n, 2);
  });

  it('sorts by position rank before load', () => {
    // The keeper (rank 0) must lead the ranking even on the lowest load.
    const pool = [P('gk', 0, 0.1), P('st', 8, 2.0)];
    assert.deepStrictEqual(H.draftTeams(pool, 2).groups[0].ids, ['gk']);
  });

  it('stores IDS only — never a copy of the player row', () => {
    // A team holding copies would strand a renamed player in last week's
    // session forever.
    const g = H.draftTeams(pool8, 2).groups[0];
    g.ids.forEach((id) => assert.strictEqual(typeof id, 'string'));
  });

  it('an empty pool yields empty teams rather than throwing', () => {
    const out = H.draftTeams([], 2);
    assert.strictEqual(out.n, 2);
    assert.deepStrictEqual(out.groups.map((g) => g.ids), [[], []]);
  });

  /* "Per Posicions" — contiguous slices of the same ranking. Deliberately
     unbalanced: it is for drilling a line, not for playing a game. */
  it('per-position mode takes contiguous slices, not a snake', () => {
    const out = H.draftTeams(pool8, 2, 'pos');
    assert.deepStrictEqual(out.groups[0].ids, ['a', 'b', 'c', 'd']);
    assert.deepStrictEqual(out.groups[1].ids, ['e', 'f', 'g', 'h']);
  });

  it('per-position spreads the remainder one player at a time', () => {
    // Not all onto the last team: 8 into 3 is 3/3/2, never 2/2/4.
    const sizes = H.draftTeams(pool8, 3, 'pos').groups.map((g) => g.ids.length);
    assert.deepStrictEqual(sizes, [3, 3, 2]);
  });

  it('mix is the default when no mode is given', () => {
    // The old call signature took two arguments; it must keep snake-drafting.
    const a = H.draftTeams(pool8, 2).groups[0].ids;
    assert.ok(a.indexOf('a') !== -1 && a.indexOf('c') === -1,
        'a snake gives team 1 the 1st and 4th, not the 1st and 3rd');
  });
});

/* stdDraftPool lives beside the bindings rather than in the plan region, so
   it is sliced separately and stacked on top of the region it calls into. */
function draftPool(opts) {
  const o = opts || {};
  const code = grab("  const STP_GK_FILL = '#f5c842';", '  // ── Rendering the flow ──') +
    grab('  function stdDraftPool(sess, squad, locked) {', '\n\n  // ---------- Convocatòria');
  /* `_stdTgOpts` is declared INSIDE the region, so it cannot also be a
     parameter — that is a redeclaration and the Function constructor throws.
     A setter reaches the same binding from outside. */
  // eslint-disable-next-line no-new-func
  const made = new Function(
      'localStorage', 'tbResolveRef', 'TB', 'isActivity', 'availContext',
      'trainingOnly', 'getTrainings', 'getEffectiveAnswer', 'sessionWindow',
      'minsToHHMM', 't', 'stdTeamFilter', 'computeReadiness',
      'posRankGlobal', `
    ${code}
    return { pool: stdDraftPool, setOpts: function (v) { _stdTgOpts = v; } };`)(
      { getItem: () => null }, () => null, { peek: () => null },
      (r) => !!r && r.kind === 'activity', () => ({}),
      (l) => l, () => [],
      (id) => (o.answers ? (o.answers[id] || 'no') : 'yes'),
      realSessionWindow, realMinsToHHMM, (k) => k,
      o.filter || null,
      () => ({ hasData: false }),
      (p) => (String(p.position || '').indexOf('GK') === 0 ? 0 : 5));
  made.setOpts({ mode: 'mix', gk: o.gk !== false });
  return made.pool;
}

describe('stdDraftPool — who the draft may deal', () => {
  const squad = [
    { id: 'p1', name: 'Aleix', position: 'GK', team: 'A' },
    { id: 'p2', name: 'Berta', position: 'CB', team: 'A' },
    { id: 'p3', name: 'Carles', position: 'ST,GK', team: 'B' },
    { id: 'p4', name: 'David', position: 'DM', team: 'B' }
  ];
  const ids = (p) => p.map((x) => x.id);

  it('takes the whole attending squad by default', () => {
    assert.deepStrictEqual(
        ids(draftPool()({ id: 'x' }, squad, false)), ['p1', 'p2', 'p3', 'p4']);
  });

  it('honours the letter filter above the table', () => {
    // Filtering the attendance list to B and then being handed a split of A
    // and B is the bug this exists to prevent. One filter, both lists.
    assert.deepStrictEqual(
        ids(draftPool({ filter: new Set(['B']) })({ id: 'x' }, squad, false)),
        ['p3', 'p4']);
  });

  it('excludes PURE keepers when the toggle is off — not utility players', () => {
    // 'ST,GK' is an outfielder who can go in goal. Dropping him from a
    // small-sided game because of his second position was never the intent.
    assert.deepStrictEqual(
        ids(draftPool({ gk: false })({ id: 'x' }, squad, false)),
        ['p2', 'p3', 'p4']);
  });

  it('keeps a player with no position at all', () => {
    const odd = [{ id: 'p9', name: 'Nil', position: '', team: 'A' }];
    assert.deepStrictEqual(ids(draftPool({ gk: false })({ id: 'x' }, odd, false)), ['p9']);
  });

  it('applies both filters together', () => {
    assert.deepStrictEqual(
        ids(draftPool({ gk: false, filter: new Set(['A']) })({ id: 'x' }, squad, false)),
        ['p2']);
  });

  it('drops players who are not coming, whatever the other filters say', () => {
    const p = draftPool({ answers: { p1: 'yes', p2: 'no', p3: 'late', p4: 'injured' } });
    assert.deepStrictEqual(ids(p({ id: 'x' }, squad, false)), ['p1', 'p3']);
  });
});

describe('locationHtml — a place, linked to its map', () => {
  /* Required here rather than at the top: `U` and `esc` are declared further
     down with the render tests, and a describe body runs at LOAD time. */
  const utils = require(path.join(__dirname, '..', 'js', 'utils.js'));
  const escape = (v) => String(v == null ? '' : v)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const L = (function () {
    const code = grab('  function locationHtml(row, opts) {', '\n  /* ── Weather');
    // The real safeHttpUrl, not a stub: it IS the thing under test here.
    // eslint-disable-next-line no-new-func
    return new Function('sanitize', 'safeHttpUrl', code + '\n return locationHtml;')(
        escape, utils.safeHttpUrl);
  })();

  it('links a place that has a map behind it', () => {
    const h = L({ location: 'Camp Municipal', mapLink: 'https://maps.example/x' });
    assert.ok(h.includes('href="https://maps.example/x"'));
    assert.ok(h.includes('Camp Municipal'));
    assert.ok(h.includes('rel="noopener"'), 'a new tab must not keep the opener');
  });

  it('leaves a place with no link as plain text', () => {
    assert.strictEqual(L({ location: 'Camp Municipal' }), 'Camp Municipal');
  });

  /* The link is typed by one staff member and clicked by another, and
     window/href on a `javascript:` URL RUNS it on our origin in that second
     person's session. sanitize() does not stop it: it escapes the quoting,
     and there is nothing in `javascript:fetch(…)` to escape. */
  it('refuses a javascript: link rather than escaping it', () => {
    const h = L({ location: 'Camp', mapLink: 'javascript:alert(1)' });
    assert.ok(!/<a /.test(h), 'no anchor at all');
    assert.ok(!/javascript:/i.test(h));
    assert.strictEqual(h, 'Camp');
  });

  it('refuses data: and protocol-relative links too', () => {
    ['data:text/html,<script>x</script>', '//evil.example/x', 'ftp://x/y']
        .forEach((bad) => {
          assert.ok(!/<a /.test(L({ location: 'Camp', mapLink: bad })), bad);
        });
  });

  it('escapes the place name even when it is linked', () => {
    const h = L({ location: '<img src=x>', mapLink: 'https://ok.example/' });
    assert.ok(!h.includes('<img'));
    assert.ok(h.includes('&lt;img'));
  });

  it('falls back to a dash for a session with no place', () => {
    assert.strictEqual(L({}), '—');
    assert.strictEqual(L({}, { dash: false }), '');
  });

  it('never links an empty place, whatever the map says', () => {
    assert.strictEqual(L({ location: '', mapLink: 'https://ok.example/' }), '—');
  });
});

describe('windBand — m/s into words', () => {
  const W = (function () {
    const code = grab('  function windBand(ms) {', '\n  /**\n   * The forecast strip');
    // eslint-disable-next-line no-new-func
    return new Function(code + '\n return windBand;')();
  })();

  it('uses the sailing thresholds a coach would recognise', () => {
    assert.strictEqual(W(0), 'calm');
    assert.strictEqual(W(1.4), 'calm');
    assert.strictEqual(W(1.5), 'breeze');
    assert.strictEqual(W(5.4), 'breeze');
    assert.strictEqual(W(5.5), 'moderate');
    assert.strictEqual(W(10.7), 'moderate');
    assert.strictEqual(W(10.8), 'strong');
    assert.strictEqual(W(30), 'strong');
  });

  it('treats a missing or unusable reading as calm, never as a gale', () => {
    // The forecast API is not wired up yet; whatever it eventually sends,
    // an absent value must not read as dangerous weather.
    ['', null, undefined, 'x', NaN].forEach((v) => {
      assert.strictEqual(W(v), 'calm', String(v) + ' should be calm');
    });
  });
});

describe('stdAvailable — who may be drafted or put on duty', () => {
  const squad = [{ id: 'p1' }, { id: 'p2' }, { id: 'p3' }, { id: 'p4' }];
  it('is yes and late, never no or injured', () => {
    const A = load({
      getEffectiveAnswer: (id) =>
        ({ p1: 'yes', p2: 'late', p3: 'no', p4: 'injured' })[id]
    });
    assert.deepStrictEqual(
        A.stdAvailable({ id: 'x' }, squad, false).map((p) => p.id), ['p1', 'p2']);
  });
});

/* ── The RENDERERS, run for real ──────────────────────────────────
   js/app.js has no browser coverage, and the failure mode of a mistyped
   identifier in a string-building block is a BLANK TRAINING PAGE for every
   coach in the club, discovered by a human. So the rail is executed here over
   stubs: the assertions are modest, but "it parses and every helper it calls
   exists" is most of the value. */
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
      'hydrateRoBoards', 'scaleRoBoards', 'bindRoBoardAnimations',
      'requestAnimationFrame', 'sessionWindow', 'minsToHHMM',
      'computeReadiness', 'posRankGlobal', 'sessionAU', 'loadBand',
      'tDateLong', 'activityTitleOf', 'BG', 'renderReadOnlyBoard', `
    ${code}
    return { renderStdPlanPanel, renderStdMaterialCard, bindStdPlan,
             bindStdPlanView, renderStdPrintSheet };`)(
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
      // Resolves from the fixture, so the print sheet can draw a board.
      (ref) => (ref && (o.boards || {})[ref.boardId]) || null,
      { peek: (id) => (o.boards || {})[id] || null },
      { getItem: () => JSON.stringify(o.bucket || {}) },
      { getElementById: () => null, querySelectorAll: () => [] },
      () => null,
      'now',
      (ref) => '<div class="tb-ro-skeleton">' + esc(ref && ref.name) + '</div>',
      () => {}, () => {}, () => {}, () => {},
      realSessionWindow, realMinsToHHMM,
      () => ({ hasData: false }),
      // The REAL ranking when a test cares about squad order, so the sheet
      // and the roster cannot drift apart.
      o.posRank ? U.posRankGlobal : () => 0,
      (row, rpe) => (rpe ? rpe * 75 : null),
      (n2) => (n2 <= 4 ? 'easy' : n2 <= 7 ? 'moderate' : 'hard'),
      (d) => d,
      (row, fb) => (row && row.focus) || fb,
      // The REAL geometry: the reserved height is arithmetic on aspectPct,
      // and a stub returning a round number would test nothing.
      require(path.join(__dirname, '..', 'js', 'board-geom.js')),
      (b) => '<div class="tb-field-readonly">' + esc(b && b.name) + '</div>');
}

describe('the session plan renders', () => {
  const TR = { id: 'now', date: '2026-09-01', time: '20:00', endTime: '21:30',
    category: 'cadet' };
  const withPlan = (p) => Object.assign({}, TR, { plan: p });

  it('an empty plan still offers somewhere to start', () => {
    const R = renderers();
    const html = R.renderStdPlanPanel(TR, false, []);
    assert.ok(html.includes('id="std-plan-panel"'));
    assert.ok(html.includes('plan.empty'));
    assert.ok(html.includes('data-stp-add="0"'), 'the + Exercici footer must exist');
  });

  it('puts a start time and a duration on every block', () => {
    const R = renderers();
    const html = R.renderStdPlanPanel(withPlan(
        { blocks: [{ id: 'b0', mins: 15, items: [ex('a')] },
          { id: 'b1', mins: 25, items: [ex('b')] }] }), true, []);
    assert.ok(html.includes('>20:00<'));
    assert.ok(html.includes('>20:15<'));
    assert.ok(/plan\.ends 20:40/.test(html), 'the footer reports the real end');
  });

  it('lets a coach edit the duration, but only if he may edit', () => {
    const R = renderers();
    const p = withPlan({ blocks: [{ id: 'b0', mins: 15, items: [ex('a')] }] });
    assert.ok(R.renderStdPlanPanel(p, false, []).includes('data-stp-mins="0"'));
    assert.ok(!R.renderStdPlanPanel(p, true, []).includes('data-stp-mins'));
  });

  it('says a parallel block in WORDS — no fork rails, no branch icon', () => {
    // The whole point of the v188 rail: the structure is named, not drawn.
    const R = renderers();
    const html = R.renderStdPlanPanel(withPlan(
        { blocks: [{ id: 'b0', mins: 25, items: [ex('a'), ex('b')] }] }), true, []);
    assert.ok(html.includes('stp-parallel'));
    assert.ok(html.includes('plan.parallel_n'));
    ['stp-rail-fork', 'stp-rail-merge', 'stp-lanes', 'data-stp-branch="0"', '⑂']
        .forEach((gone) => assert.ok(!html.includes(gone), gone + ' should be gone'));
  });

  it('letters the lanes of a parallel block A and B', () => {
    const R = renderers();
    const html = R.renderStdPlanPanel(withPlan(
        { blocks: [{ id: 'b0', mins: 25, items: [ex('a'), ex('b')] }] }), true, []);
    assert.ok(/stp-lane-tag">A /.test(html));
    assert.ok(/stp-lane-tag">B /.test(html));
  });

  it('a single-lane block gets no parallel chrome at all', () => {
    const R = renderers();
    const html = R.renderStdPlanPanel(withPlan(
        { blocks: [{ id: 'b0', mins: 15, items: [ex('a')] }] }), true, []);
    assert.ok(!html.includes('stp-parallel'));
    assert.ok(!html.includes('stp-lane-tag'));
  });

  it('makes a title with a board clickable, and one without it plain', () => {
    const R = renderers({ boards: { a: { name: 'Rondo 4v2', cones: cones(3) } } });
    const html = R.renderStdPlanPanel(withPlan({ blocks: [{ id: 'b0', mins: 15, items: [
      ex('a'), { id: 'free', boardId: '', title: 'Estiraments' }
    ] }] }), true, []);
    assert.ok(/data-stp-toggle="ex_a"/.test(html), 'the board title toggles');
    assert.ok(html.includes('▣'), 'and is marked as having one');
    // Two items, so both carry an A/B lane tag before the title.
    assert.ok(/stp-ex-plain">.*Estiraments/.test(html), 'the free one is plain text');
    assert.ok(html.includes('plan.no_board'), 'and says so in its note');
  });

  it('prices each exercise under its own title', () => {
    const R = renderers({ boards: { a: { name: 'Rondo', cones: cones(12), balls: [[1, 1]] } } });
    const html = R.renderStdPlanPanel(withPlan(
        { blocks: [{ id: 'b0', mins: 15, items: [ex('a')] }] }), true, []);
    assert.ok(html.includes('plan.n_cones'));
    assert.ok(html.includes('plan.n_ball'), 'one ball uses the singular key');
  });

  it('renders the board only when it is open', () => {
    const R = renderers({
      boards: { a: { name: 'Rondo', cones: [] } },
      bucket: { '2026-09-01': [{ boardId: 'a', name: 'Rondo', category: 'cadet' }] }
    });
    const p = withPlan({ blocks: [{ id: 'b0', mins: 15, items: [ex('a')] }] });
    assert.ok(!R.renderStdPlanPanel(p, true, []).includes('stp-board-wrap'));
    R.bindStdPlanView();   // no DOM, so nothing toggles — the closed case only
  });

  it('read-only strips every control but keeps the plan', () => {
    const R = renderers({ boards: { a: { name: 'Rondo', cones: [] } } });
    const html = R.renderStdPlanPanel(withPlan(
        { blocks: [{ id: 'b0', mins: 25, items: [ex('a'), ex('b')] }] }), true, []);
    assert.ok(html.includes('Rondo'), 'the exercises are still shown');
    ['data-stp-add', 'data-stp-del', 'data-stp-in', 'data-stp-lane-add',
      'data-stp-mins'].forEach((c) => {
      assert.ok(!html.includes(c), c + ' must not survive read-only');
    });
  });

  it('prefers the board\'s own name over whatever the plan cached', () => {
    const R = renderers({ boards: { a: { name: 'Rondo 4v2', cones: [] } } });
    const html = R.renderStdPlanPanel(withPlan({ blocks: [{ id: 'b0', mins: 15,
      items: [{ id: 'e', boardId: 'a', title: 'stale' }] }] }), true, []);
    assert.ok(html.includes('Rondo 4v2'));
    assert.ok(!html.includes('stale'));
  });

  it('escapes a free exercise written by a coach', () => {
    const R = renderers();
    const html = R.renderStdPlanPanel(withPlan({ blocks: [{ id: 'b0', mins: 15, items: [
      { id: 'e', boardId: '', title: '<img src=x onerror=alert(1)>', desc: '"&<>' }
    ] }] }), true, []);
    assert.ok(!html.includes('<img'), 'a title is never injected raw');
    assert.ok(html.includes('&lt;img'));
    assert.ok(html.includes('&quot;&amp;&lt;&gt;'));
  });

  it('counts its own blocks and exercises in the head', () => {
    const R = renderers();
    const html = R.renderStdPlanPanel(withPlan({ blocks: [
      { id: 'b0', mins: 15, items: [ex('a')] },
      { id: 'b1', mins: 25, items: [ex('b'), ex('c'), ex('d')] }
    ] }), true, []);
    assert.ok(html.includes('plan.blk_n'), 'two blocks is plural');
    assert.ok(html.includes('plan.ex_n'), 'four exercises is plural');
  });
});

describe('the material card renders', () => {
  const TR = { id: 'now', date: '2026-09-01', time: '20:00', endTime: '21:30',
    category: 'cadet' };
  const squad = [{ id: 'p1', name: 'Aleix' }, { id: 'p2', name: 'Berta' }];
  const withPlan = (p) => Object.assign({}, TR, { plan: p });

  it('always shows the petos row, even with nothing calculated', () => {
    const R = renderers({ squad: squad });
    const html = R.renderStdMaterialCard(TR, squad, false, false);
    assert.ok(html.includes('id="std-material-card"'));
    assert.ok(html.includes('stm-row-petos'), 'the swatch strip is the way in');
  });

  it('shows the cone count and one swatch per bib colour', () => {
    const R = renderers({
      boards: { a: { name: 'x', cones: cones(9), positions: [[1, 1], [2, 2]],
        numbers: ['7', '9'], colors: ['#ff0000', '#0000ff'] } }
    });
    const html = R.renderStdMaterialCard(withPlan(
        { blocks: [{ id: 'b0', mins: 15, items: [ex('a')] }] }), squad, false, false);
    assert.ok(/mat\.cones<\/span><span class="stm-qty">9</.test(html));
    assert.strictEqual((html.match(/data-stm-peto="/g) || []).length, 2);
    assert.ok(/stm-qty">1</.test(html), 'two colours means one set of bibs');
  });

  it('uses the coach\'s swatches over the boards once he has some', () => {
    const R = renderers({
      boards: { a: { name: 'x', cones: [], positions: [[1, 1]], numbers: ['7'],
        colors: ['#ff0000'] } }
    });
    const html = R.renderStdMaterialCard(withPlan({
      blocks: [{ id: 'b0', mins: 15, items: [ex('a')] }],
      petos: ['#8e24aa', '#f9a825', '#212529']
    }), squad, false, false);
    assert.strictEqual((html.match(/data-stm-peto="/g) || []).length, 3);
    assert.ok(!html.includes('#ff0000'), 'the board colour is overruled');
  });

  it('warns about the exercises it could not price', () => {
    const R = renderers();
    const html = R.renderStdMaterialCard(withPlan({ blocks: [{ id: 'b0', mins: 15,
      items: [{ id: 'e', boardId: '', title: 'Rondo' }] }] }), squad, false, false);
    assert.ok(html.includes('mat.unknown'));
    assert.ok(html.includes('stm-warn'));
  });

  it('lists what the coach added by hand, with a way to remove it', () => {
    const R = renderers();
    const html = R.renderStdMaterialCard(withPlan(
        { extra: [{ id: 'x', label: 'Porteries', qty: 2 }] }), squad, false, false);
    assert.ok(html.includes('Porteries'));
    assert.ok(html.includes('data-stm-del="0"'));
  });

  it('offers a stepper and a die rather than a row of selects', () => {
    const R = renderers({ trainings: [] });
    const html = R.renderStdMaterialCard(withPlan(
        { duty: { n: 2, ids: ['p1', 'p2'] } }), squad, false, false);
    assert.ok(html.includes('data-stm-duty="1"') && html.includes('data-stm-duty="-1"'));
    assert.ok(html.includes('id="stm-duty-random"'));
    assert.ok(html.includes('id="stm-duty-pick"'));
    assert.ok(!html.includes('stm-duty-sel'), 'the v187 selects are gone');
    assert.ok(!html.includes('stm-duty-all'), 'and so is the mostra-tots checkbox');
  });

  it('names who is on duty, each droppable', () => {
    const R = renderers({ trainings: [] });
    const html = R.renderStdMaterialCard(withPlan(
        { duty: { n: 2, ids: ['p1', 'p2'] } }), squad, false, false);
    assert.ok(html.includes('Aleix') && html.includes('Berta'));
    assert.strictEqual((html.match(/data-stm-duty-del="/g) || []).length, 2);
  });

  it('says so plainly when nobody is assigned', () => {
    const R = renderers({ trainings: [] });
    const html = R.renderStdMaterialCard(TR, squad, false, false);
    assert.ok(html.includes('mat.duty_none_yet'));
  });

  it('read-only shows who is on duty and offers no controls', () => {
    const R = renderers({ trainings: [] });
    const html = R.renderStdMaterialCard(withPlan(
        { duty: { n: 1, ids: ['p1'] } }), squad, false, true);
    assert.ok(html.includes('Aleix'));
    ['data-stm-duty', 'stm-duty-random', 'stm-peto-add', 'data-stm-del',
      'stm-picker'].forEach((c) =>
      assert.ok(!html.includes(c), c + ' must not survive read-only'));
  });

  /* Teams live on the exercise, not inside its board panel. While they were
     nested in there, a split put on a free-text exercise rendered NOWHERE —
     and with no × there was no way to take it off again either. */
  it('shows teams on an exercise that has no board at all', () => {
    const R = renderers({ trainings: [] });
    const html = R.renderStdPlanPanel(withPlan({ blocks: [{ id: 'b0', mins: 15, items: [
      { id: 'free', boardId: '', title: 'Rondo a mà',
        teams: [{ key: 'g0', name: 'Equip 1', color: '#e53935', ids: ['p1'] }] }
    ] }] }), false, [{ id: 'p1', name: 'Aleix Ferrer' }]);
    assert.ok(html.includes('Aleix'), 'the team members are listed');
    assert.ok(html.includes('data-stp-unassign="free"'), 'and can be removed');
  });

  it('shows them without needing the board open', () => {
    const R = renderers({ boards: { a: { name: 'Rondo', cones: [] } } });
    const html = R.renderStdPlanPanel(withPlan({ blocks: [{ id: 'b0', mins: 15, items: [
      Object.assign(ex('a'),
          { teams: [{ key: 'g0', name: 'Equip 1', color: '#e53935', ids: ['p1'] }] })
    ] }] }), false, [{ id: 'p1', name: 'Aleix Ferrer' }]);
    assert.ok(!html.includes('stp-board-wrap'), 'the board is still shut');
    assert.ok(html.includes('Aleix'), 'but the teams show regardless');
  });

  it('read-only sees the teams but gets no cross', () => {
    const R = renderers();
    const html = R.renderStdPlanPanel(withPlan({ blocks: [{ id: 'b0', mins: 15, items: [
      { id: 'free', boardId: '', title: 'Rondo',
        teams: [{ key: 'g0', name: 'Equip 1', ids: ['p1'] }] }
    ] }] }), true, [{ id: 'p1', name: 'Aleix Ferrer' }]);
    assert.ok(html.includes('Aleix'));
    assert.ok(!html.includes('data-stp-unassign'));
  });

  /* The printed sheet. Its own markup, so nothing else on the page exercises
     it — and a coach only finds out it is broken standing at the printer. */
  it('prints the session identity, the plan, and what to bring', () => {
    const R = renderers({
      boards: { a: { name: 'Rondo 5v2', cones: cones(9), balls: [[1, 1]] } },
      trainings: []
    });
    const tr = Object.assign({}, TR, {
      plannedRpe: 7,
      plan: {
        blocks: [{ id: 'b0', mins: 15, label: 'Escalfament', items: [ex('a')] }],
        extra: [{ id: 'x', label: 'Porteries', qty: 2 }],
        duty: { n: 1, ids: ['p1'] }
      }
    });
    const html = R.renderStdPrintSheet(tr, [{ id: 'p1', name: 'Aleix Ferrer' }], false);
    assert.ok(html.includes('id="std-print"'));
    assert.ok(html.includes('Rondo 5v2'), 'the plan');
    assert.ok(html.includes('Escalfament'), 'and its labels');
    assert.ok(html.includes('prn-stats'), 'the intensity/load/duration row');
    assert.ok(html.includes('prn-bar'), 'the attendance bar');
    assert.ok(html.includes('Porteries'), 'the material');
    assert.ok(html.includes('Aleix Ferrer'), 'and who is carrying it');
  });

  it('prints the weather as words — emoji come out as boxes', () => {
    const R = renderers();
    const html = R.renderStdPrintSheet(
        Object.assign({}, TR, { weather: { cond: 'rain', windMs: 7, tempC: 9 } }),
        [], false);
    assert.ok(!/[\u{1F300}-\u{1FAFF}]/u.test(html), 'no emoji anywhere on the sheet');
    assert.ok(html.includes('wx.rain') && html.includes('wx.moderate'));
    assert.ok(html.includes('7 m/s') && html.includes('9°'));
  });

  /* Printing in place failed three ways at once — clipped to one page by
     `.dashboard-layout{min-height:0}` over a scrolling #dashboard-content,
     the left pane leaking back on top of a flex #view-dashboard, and no
     colour. All one root cause: the sheet was inside the app's layout. It
     prints in its own window now, and these guard the way back. */
  it('is NOT embedded in the page it prints from', () => {
    const page = grab('  function renderStaffTrainingDetail()',
        '  /**\n   * The stacked attendance bar');
    assert.ok(!/renderStdPrintSheet\(/.test(page),
        'the sheet must not be rendered into the app layout');
    assert.ok(/stdPrintPlan\(/.test(src), 'it opens its own window instead');
    assert.ok(/window\.open\(/.test(src));
  });

  it('tells the browser to actually print the colours', () => {
    // Without this every background is dropped, which is precisely the
    // attendance bar, the team dots and the peto swatches.
    assert.ok(/print-color-adjust:exact/.test(src));
    assert.ok(/-webkit-print-color-adjust:exact/.test(src));
  });

  it('prints the bib colours, not just their number', () => {
    const R = renderers({
      boards: { a: { name: 'Rondo', cones: [], positions: [[1, 1], [2, 2]],
        numbers: ['7', '9'], colors: ['#ff0000', '#0000ff'] } }
    });
    const tr = Object.assign({}, TR, {
      plan: { blocks: [{ id: 'b0', mins: 15, items: [
        Object.assign(ex('a'),
            { teams: [{ key: 'g0', name: 'Equip 1', color: '#8e24aa', ids: ['p1'] }] })
      ] }] }
    });
    const html = R.renderStdPrintSheet(tr, [{ id: 'p1', name: 'Aleix Ferrer' }], false);
    assert.ok(html.includes('#8e24aa'), "the team's own bib colour");
    assert.ok((html.match(/prn-dot/g) || []).length >= 2,
        'a dot for the team and one per peto swatch');
  });

  /* On paper a parallel block is named, not coloured. The rail's yellow edge
     works on screen where the eyebrow is small and the column is dense; on an
     A4 sheet it sits beside "Alhora, 2 grups" in full-size type, with no
     legend to explain it, and reads as a divider between sections. */
  it('names a parallel block on paper rather than colouring it', () => {
    const R = renderers({ boards: { a: { name: 'A', cones: [] }, b: { name: 'B', cones: [] } } });
    const tr = Object.assign({}, TR, {
      plan: { blocks: [{ id: 'b0', mins: 20, items: [ex('a'), ex('b')] }] }
    });
    const html = R.renderStdPrintSheet(tr, [], false);
    assert.ok(html.includes('plan.parallel_n'), 'it says so in words');
    assert.ok(!html.includes('prn-par'), 'and carries no unexplained colour bar');
  });

  it('lists who is coming, by the EFFECTIVE answer', () => {
    // The sheet has to agree with the screen it was printed from, so a
    // coach's override beats the player's own answer here too.
    const R = renderers({
      answers: { p1: 'yes', p2: 'late', p3: 'no', p4: 'injured', p5: 'na' }
    });
    const html = R.renderStdPrintSheet(TR, [
      { id: 'p1', name: 'Aleix' }, { id: 'p2', name: 'Berta' },
      { id: 'p3', name: 'Carles' }, { id: 'p4', name: 'David' },
      { id: 'p5', name: 'Enric' }
    ], false);
    assert.ok(html.includes('Aleix') && html.includes('Berta'), 'yes and late');
    ['Carles', 'David', 'Enric'].forEach(function (n) {
      assert.ok(!html.includes(n), n + ' is not coming and must not be listed');
    });
  });

  it('groups the squad by letter and orders each by position', () => {
    const R = renderers({ posRank: true });
    const html = R.renderStdPrintSheet(TR, [
      { id: 'p1', name: 'Striker A', team: 'A', position: 'ST' },
      { id: 'p2', name: 'Keeper A', team: 'A', position: 'GK' },
      { id: 'p3', name: 'Keeper B', team: 'B', position: 'GK' },
      { id: 'p4', name: 'Back A', team: 'A', position: 'CB' }
    ], false);
    assert.ok(html.includes('prn-team">A') && html.includes('prn-team">B'));
    // Keepers first, forwards last — the order a coach reads a team sheet in.
    const a = html.indexOf('Keeper A'), b = html.indexOf('Back A'),
      c = html.indexOf('Striker A');
    assert.ok(a < b && b < c, 'GK, then CB, then ST');
    assert.ok(html.indexOf('Keeper B') > c, 'and team B comes after all of team A');
  });

  it('shows each position so the ordering is legible', () => {
    const R = renderers({ posRank: true });
    const html = R.renderStdPrintSheet(TR,
        [{ id: 'p1', name: 'Aleix', team: 'A', position: 'DM,OM' }], false);
    assert.ok(/prn-pos"> DM</.test(html), 'the first position, not the whole list');
  });

  it('drops the letter heading when there is only one squad', () => {
    const R = renderers({ posRank: true });
    const html = R.renderStdPrintSheet(TR,
        [{ id: 'p1', name: 'Aleix', team: 'A', position: 'GK' }], false);
    assert.ok(!html.includes('prn-team'), '"· 1" has already said it');
  });

  it('marks the late ones rather than splitting them into a second list', () => {
    const R = renderers({ answers: { p1: 'yes', p2: 'late' } });
    const html = R.renderStdPrintSheet(TR,
        [{ id: 'p1', name: 'Aleix' }, { id: 'p2', name: 'Berta' }], false);
    assert.strictEqual((html.match(/prn-late/g) || []).length, 1);
  });

  it('says nothing at all when nobody is coming', () => {
    const R = renderers({ answers: { p1: 'no' } });
    const html = R.renderStdPrintSheet(TR, [{ id: 'p1', name: 'Aleix' }], false);
    assert.ok(!html.includes('prn-squad'), 'an empty heading is not information');
  });

  /* The board is rendered at its natural 814px and scaled bodily, because
     scaleRoBoards() needs a laid-out DOM and a ResizeObserver that a
     just-written document does not have. */
  it('shows the board inside its exercise, scaled and with room reserved', () => {
    const R = renderers({
      boards: { a: { name: 'Rondo', cones: [], pitch: null, boardType: 'full' } },
      bucket: { '2026-09-01': [{ boardId: 'a', name: 'Rondo', category: 'cadet' }] }
    });
    const tr = Object.assign({}, TR, {
      plan: { blocks: [{ id: 'b0', mins: 15, items: [ex('a')] }] }
    });
    const html = R.renderStdPrintSheet(tr, [], false);
    assert.ok(/class="prn-board" style="height:\d+px"/.test(html),
        'the wrapper must reserve height — a transform does not affect layout');
    assert.ok(/width:814px;transform:scale\(/.test(html),
        'natural width, scaled bodily');
  });

  it('leaves a board-less exercise without an empty frame', () => {
    const R = renderers();
    const tr = Object.assign({}, TR, {
      plan: { blocks: [{ id: 'b0', mins: 15, items: [
        { id: 'free', boardId: '', title: 'Rondo a mà' }] }] }
    });
    assert.ok(!R.renderStdPrintSheet(tr, [], false).includes('prn-board'));
  });

  it('prints an empty plan without inventing rows', () => {
    const R = renderers();
    const html = R.renderStdPrintSheet(TR, [], false);
    assert.ok(html.includes('plan.empty'));
    assert.ok(!html.includes('<table'));
  });

  it('bindStdPlan is inert when the panel is not on the page', () => {
    // It runs on every render of every page; detailTrainingId outlives the
    // page that set it, so the DOM check has to come first.
    const R = renderers();
    assert.doesNotThrow(() => R.bindStdPlan());
  });
});