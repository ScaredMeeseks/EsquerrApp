/* "Carregar entrenament" — load a past session's plan (v290, roadmap 37).
 *
 * The owner's spec: setting up a training, a button lists past trainings with
 * their date and the names of their exercises; clicking one asks the coach to
 * accept, and then loads ALL OF IT BUT THE PLAYERS. So the assertions that
 * matter most here are about what does NOT come across: no player id, from
 * the exercise teams, the material carriers, the generator's split or a
 * board's linkedTeams, may reach the session the plan is loaded into.
 *
 * Everything runs the real functions sliced out of js/app.js — the plan
 * normaliser, the template, the candidate list, the board links, the dialog
 * over jsdom, the session and draft handlers and _ntCommit.
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const {JSDOM} = require('jsdom');

const src = fs.readFileSync(path.join(__dirname, '..', 'js', 'app.js'), 'utf8');
const utilsSrc = fs.readFileSync(path.join(__dirname, '..', 'js', 'utils.js'), 'utf8');

function grab(from, to) {
  const i = src.indexOf(from);
  const j = src.indexOf(to, i + 1);
  assert.ok(i !== -1 && j !== -1, 'marker not found in js/app.js: ' + from);
  return src.slice(i, j);
}
const SANITIZE = utilsSrc.slice(utilsSrc.indexOf('function sanitize(str) {'),
    utilsSrc.indexOf('// ---------- Tactical Formations ----------'));

const TODAY = '2026-10-21';
const PLAYERS = ['p1', 'p2', 'p3', 'p4', 'p5', 'p6', 'p7', 'g9'];
const DICT = {
  'plan.ex_1': '1 exercici', 'plan.ex_n': '{n} exercicis',
  'plan.load_confirm': 'COPIES {ex}.', 'plan.load_replace': 'REPLACES {ex}.',
  'plan.load_q': 'LOAD {date}?', 'plan.loaded_from': 'FROM {date} · {ex}',
};
const t = (k) => (k in DICT ? DICT[k] : k);

// The source session: everything a plan can hold, and players in every slot.
const S1 = {
  id: 'tr_s1', date: '2026-10-14', time: '19:30', endTime: '21:00', category: 'amateur',
  teams: ['A'], guests: ['g9'], excluded: ['p7'], location: 'Camp 2', focus: 'Pressing', plannedRpe: 7,
  plan: {
    blocks: [
      { id: 'blk_1', mins: 20, label: 'Escalfament', items: [
        { id: 'ex_a', boardId: 'b1', title: '', desc: 'Rondo 4c2', tag: 'tec',
          teams: [{ key: 'g0', name: 'Verds', color: '#43a047', ids: ['p1', 'p2'] },
            { key: 'g1', name: 'Blaus', color: '#1e88e5', ids: ['p3', 'p4'] }] }] },
      { id: 'blk_2', mins: 25, label: '', items: [
        { id: 'ex_b', boardId: '', title: 'Partidet', desc: '', tag: '' }] },
    ],
    extra: [{ id: 'mx_1', label: 'Porteries petites', qty: 2 }],
    duty: { n: 2, ids: ['p5', 'p6'] },
    petos: ['#43a047', '#1e88e5'],
    teams: { groups: [{ key: 'g0', ids: ['p1', 'p2'] }, { key: 'g1', ids: ['p3', 'p4'] }] },
  },
};
const withPlan = (over) => Object.assign({ category: 'amateur', teams: ['A'], guests: [], excluded: [],
  plan: { blocks: [{ id: 'k', mins: 15, items: [{ id: 'x', title: 'Conducció' }] }] } }, over);
const S6 = withPlan({ id: 'tr_s6', date: '2026-10-07', time: '19:30', focus: 'Força' });
const OTHERS = [
  withPlan({ id: 'tr_future', date: '2026-10-28' }),                       // not held yet
  withPlan({ id: 'tr_juv', date: '2026-10-15', category: 'juvenil' }),      // another category
  withPlan({ id: 'tr_act', date: '2026-10-16', kind: 'activity', title: 'Sopar' }),
  { id: 'tr_empty', date: '2026-10-13', category: 'amateur', teams: ['A'] }, // nothing to load
];
// The session being filled: its own slot, its own squad, a plan of three.
const T = () => ({
  id: 'tr_new', date: '2026-10-21', time: '20:00', endTime: '21:30', category: 'amateur', teams: ['A', 'B'],
  guests: ['zz'], excluded: [], location: 'Camp 1', focus: '', plan: { blocks: [{ id: 'q', mins: 10,
    items: [{ id: 'q1', title: 'U' }, { id: 'q2', title: 'V' }, { id: 'q3', title: 'W' }] }] },
});
const BOARDS = {
  '2026-10-14': [
    { boardId: 'b1', name: 'Rondó 4c2', category: 'amateur', linkedTeams: { g0: ['p1', 'p2'] } },
    { boardId: 'bX', name: 'Not in the plan', category: 'amateur' },
    { boardId: 'b1', name: 'their copy', category: 'juvenil' },
  ],
};

function env(o) {
  o = o || {};
  const store = {
    fa_training: JSON.stringify(o.trainings || [S1, S6].concat(OTHERS, [T()])),
    fa_tactic_training_boards: JSON.stringify(o.boards || BOARDS),
  };
  const localStorage = { getItem: (k) => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = v; } };
  const dom = new JSDOM('<!doctype html><body></body>', { pretendToBeVisual: true });
  const doc = dom.window.document;
  const calls = { modal: [], toast: [], render: 0 };
  const deps = {
    localStorage,
    tbResolveRef: (ref) => (ref && ref.name ? { name: ref.name } : null),
    TB: { peek: () => null },
    isActivity: (r) => !!r && r.kind === 'activity',
    availContext: () => ({}), trainingOnly: (l) => l, getEffectiveAnswer: () => 'yes',
    sessionWindow: () => ({ start: 1200, end: 1290 }),
    minsToHHMM: (m) => String(Math.floor(m / 60)).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0'),
    t, BG: require('../js/board-geom.js'),
    getTrainings: () => JSON.parse(store.fa_training),
    localDateStr: () => TODAY,
    tDateShort: (d) => 'D(' + d + ')',
    showModal: (title, message, onConfirm, opts) => calls.modal.push({ title, message, onConfirm, opts }),
    document: doc, requestAnimationFrame: (fn) => fn(),
    _ntResolveClashes: () => 0, _ntMarkAttending: () => {},
    // v291: the private notes, when a test hands some in.
    TN: o.TN,
    // v292: the REAL points reader.
    exPointsOf: require('../js/utils.js').exPointsOf,
  };
  // eslint-disable-next-line no-new-func
  const api = new Function(...Object.keys(deps), `
    ${SANITIZE}
    ${grab("  const STP_GK_FILL = '#f5c842';", '  // ── Rendering the flow ──')}
    ${grab('  function _stpN(n, oneKey, manyKey) {', '  /**\n   * The one-line material note')}
    ${grab('  /* ── "Carregar entrenament" (v290', '  /** "+ Altre material"')}
    ${grab('  function _ntPersistSession(sessionId, mutate) {', '  /**\n   * Commit drafts to fa_training.')}
    ${grab('  function _ntCommit(drafts) {', '  function _ntSave() {')}
    ${grab('  function _ntTplLine(d, i) {', '  /* The two option lists the draft fields need')}
    return { stdPlan, stpTemplateOf, stpLoadCandidates, stpLinkBoards, stpLoadIntoSession,
      stpOpenLoadDialog, _ntCommit, _ntTplLine, _stpN, sanitize };`)(...Object.values(deps));
  const row = (id) => JSON.parse(store.fa_training).find((x) => x.id === id);
  const boards = () => JSON.parse(store.fa_tactic_training_boards);
  return { api, store, doc, calls, row, boards, deps };
}

describe('Carregar entrenament — what a loaded plan carries (v290)', () => {
  it('copies the session\'s plan and NO player, from any of the four places one sits', () => {
    const { api } = env();
    const tpl = api.stpTemplateOf(S1);
    const json = JSON.stringify(tpl);
    PLAYERS.forEach((p) => assert.ok(json.indexOf('"' + p + '"') === -1, 'player ' + p + ' came across'));
    assert.strictEqual(tpl.plan.teams, undefined, 'the generator\'s split came across');
    tpl.plan.blocks.forEach((b) => b.items.forEach((e) =>
      assert.ok(!('teams' in e), 'an exercise kept its teams')));
    assert.deepStrictEqual(tpl.plan.duty, { n: 2, ids: [] }, 'how MANY carry the kit is the session\'s');
  });

  it('keeps every exercise, its board, description, tag and duration — under fresh ids', () => {
    const { api } = env();
    const tpl = api.stpTemplateOf(S1);
    assert.deepStrictEqual(tpl.plan.blocks.map((b) => [b.mins, b.label]), [[20, 'Escalfament'], [25, '']]);
    const items = tpl.plan.blocks.map((b) => b.items[0]);
    assert.deepStrictEqual(items.map((e) => [e.boardId, e.title, e.desc, e.tag]),
        [['b1', '', 'Rondo 4c2', 'tec'], ['', 'Partidet', '', '']]);
    const oldIds = ['blk_1', 'blk_2', 'ex_a', 'ex_b', 'mx_1'];
    const newIds = tpl.plan.blocks.map((b) => b.id)
        .concat(items.map((e) => e.id), tpl.plan.extra.map((x) => x.id));
    newIds.forEach((id) => assert.ok(id && oldIds.indexOf(id) === -1, 'an id came across: ' + id));
    assert.deepStrictEqual(tpl.plan.extra.map((x) => [x.label, x.qty]), [['Porteries petites', 2]]);
    assert.deepStrictEqual(tpl.plan.petos, ['#43a047', '#1e88e5']);
    assert.deepStrictEqual([tpl.focus, tpl.plannedRpe, tpl.exCount, tpl.boardIds], ['Pressing', 7, 2, ['b1']]);
  });

  it('round-trips through the plan reader unchanged', () => {
    const { api } = env();
    const tpl = api.stpTemplateOf(S1);
    assert.deepStrictEqual(api.stdPlan({ plan: tpl.plan }).blocks, tpl.plan.blocks.map((b) =>
      Object.assign({}, b, { items: b.items.map((e) => Object.assign({}, e, { teams: null })) })));
  });

  it('leaves bibs to the boards when the coach never set them', () => {
    const { api } = env();
    const tpl = api.stpTemplateOf(Object.assign({}, S1, { plan: Object.assign({}, S1.plan, { petos: undefined }) }));
    assert.strictEqual(tpl.plan.petos, null, 'null means "derive", [] means "none" — they are not the same');
  });
});

describe('Carregar entrenament — which sessions are offered', () => {
  it('this category\'s held sessions that have exercises, newest first — never the one being filled', () => {
    const { api } = env({ trainings: [S6, S1].concat(OTHERS, [Object.assign(T(), { date: '2026-10-01' })]) });
    assert.deepStrictEqual(api.stpLoadCandidates(T()).map((c) => c.tr.id), ['tr_s1', 'tr_s6']);
  });

  it('names each exercise by its board, else its title', () => {
    const { api } = env();
    const c = api.stpLoadCandidates(T()).find((x) => x.tr.id === 'tr_s1');
    assert.deepStrictEqual(c.names, ['Rondó 4c2', 'Partidet']);
  });
});

describe('Carregar entrenament — the boards follow the plan', () => {
  it('links the plan\'s boards to the new date, stamped with its category, without the old split', () => {
    const { api, boards } = env();
    assert.strictEqual(api.stpLinkBoards(S1, T(), ['b1']), 1);
    const linked = boards()['2026-10-21'];
    assert.strictEqual(linked.length, 1, 'a board outside the plan was linked too');
    assert.deepStrictEqual([linked[0].boardId, linked[0].name, linked[0].category], ['b1', 'Rondó 4c2', 'amateur']);
    assert.ok(!('linkedTeams' in linked[0]), 'the old day\'s players came across on the board link');
  });

  it('stamps a link written before categories were, with the new session\'s', () => {
    const { api, boards } = env({ boards: { '2026-10-14': [{ boardId: 'b1', name: 'Rondó 4c2' }] } });
    api.stpLinkBoards(S1, T(), ['b1']);
    assert.strictEqual(boards()['2026-10-21'][0].category, 'amateur',
        'an unstamped link on a shared date belongs to whoever looks');
  });

  it('does not link a board twice, and another category\'s link is not this one', () => {
    const { api, boards } = env({ boards: Object.assign({}, BOARDS,
        { '2026-10-21': [{ boardId: 'b1', name: 'theirs', category: 'juvenil' }] }) });
    assert.strictEqual(api.stpLinkBoards(S1, T(), ['b1']), 1);
    assert.strictEqual(api.stpLinkBoards(S1, T(), ['b1']), 0);
    assert.deepStrictEqual(boards()['2026-10-21'].map((b) => b.category), ['juvenil', 'amateur']);
  });
});

describe('Carregar entrenament — into a saved session', () => {
  it('replaces the plan and takes the focus and planned RPE; the slot and the squad stay', () => {
    const { api, row, boards } = env();
    const before = row('tr_new');
    api.stpLoadIntoSession('tr_new', S1, api.stpTemplateOf(S1));
    const after = row('tr_new');
    assert.strictEqual(api.stdPlan(after).blocks.length, 2);
    assert.deepStrictEqual([after.focus, after.plannedRpe], ['Pressing', 7]);
    ['date', 'time', 'endTime', 'location', 'teams', 'guests', 'excluded', 'category'].forEach((k) =>
      assert.deepStrictEqual(after[k], before[k], k + ' was overwritten'));
    assert.ok(boards()['2026-10-21'], 'the board was not linked');
  });

  it('keeps its own focus and RPE when the old session had none', () => {
    const bare = Object.assign({}, S6, { focus: '', plannedRpe: undefined });
    const tr = Object.assign(T(), { focus: 'Meu', plannedRpe: 4 });
    const e2 = env({ trainings: [bare, tr] });
    e2.api.stpLoadIntoSession('tr_new', bare, e2.api.stpTemplateOf(bare));
    assert.deepStrictEqual([e2.row('tr_new').focus, e2.row('tr_new').plannedRpe], ['Meu', 4]);
  });
});

describe('Carregar entrenament — the dialog', () => {
  const open = (target) => {
    const e = env();
    const loaded = [];
    e.api.stpOpenLoadDialog(target, (s, tpl) => loaded.push({ s, tpl }));
    const ov = e.doc.getElementById('custom-modal-overlay');
    return Object.assign(e, { ov, loaded });
  };

  it('lists each session with its date, focus, exercise names and count', () => {
    const { ov } = open(T());
    const rows = ov.querySelectorAll('[data-stp-load-i]');
    assert.strictEqual(rows.length, 2);
    const first = rows[0].textContent;
    ['D(2026-10-14)', 'Pressing', 'Rondó 4c2 · Partidet', '2 exercicis'].forEach((s) =>
      assert.ok(first.indexOf(s) !== -1, 'the row lacks ' + s + ': ' + first));
  });

  it('filters on the focus and the exercise names, accent-blind', () => {
    const { ov, doc } = open(T());
    const q = ov.querySelector('#stp-load-q');
    const shown = () => [...ov.querySelectorAll('[data-stp-load-i]')]
        .filter((r) => !r.classList.contains('stp-load-off')).length;
    q.value = 'rondo';
    q.dispatchEvent(new doc.defaultView.Event('input'));
    assert.strictEqual(shown(), 1);
    assert.strictEqual(ov.querySelector('#stp-load-nohit').hidden, true);
    q.value = 'zzz';
    q.dispatchEvent(new doc.defaultView.Event('input'));
    assert.strictEqual(shown(), 0);
    assert.strictEqual(ov.querySelector('#stp-load-nohit').hidden, false, 'an empty list said nothing');
  });

  it('asks before loading, says what comes across, and what it replaces', () => {
    const { ov, calls, loaded } = open(T());
    ov.querySelector('[data-stp-load-i="0"]').click();
    assert.strictEqual(calls.modal.length, 1, 'it loaded without asking');
    assert.strictEqual(loaded.length, 0, 'it loaded before the coach accepted');
    const m = calls.modal[0];
    assert.strictEqual(m.title, 'LOAD D(2026-10-14)?');
    assert.strictEqual(m.message, 'COPIES 2 exercicis. REPLACES 3 exercicis.');
    assert.strictEqual(m.opts.danger, false);
    m.onConfirm();
    assert.deepStrictEqual([loaded.length, loaded[0].s.id, loaded[0].tpl.exCount], [1, 'tr_s1', 2]);
  });

  it('warns that the replaced exercises\' private notes go too (v291)', () => {
    DICT['plan.load_notes'] = 'NOTES {notes}.';
    DICT['plan.notes_1'] = '1 nota';
    DICT['plan.notes_n'] = '{n} notes';
    const e = env({ TN: { count: (sid, ex) => (sid === 'tr_new' && ex !== 'q3' ? 1 : 0) } });
    e.api.stpOpenLoadDialog(T(), () => {});
    e.doc.querySelector('[data-stp-load-i="0"]').click();
    assert.strictEqual(e.calls.modal[0].message, 'COPIES 2 exercicis. REPLACES 3 exercicis. NOTES 2 notes.');
    const quiet = env({ TN: { count: () => 0 } });
    quiet.api.stpOpenLoadDialog(T(), () => {});
    quiet.doc.querySelector('[data-stp-load-i="0"]').click();
    assert.strictEqual(quiet.calls.modal[0].message, 'COPIES 2 exercicis. REPLACES 3 exercicis.');
  });

  it('says nothing about replacing when there is nothing to replace', () => {
    const { ov, calls } = open(Object.assign(T(), { plan: null }));
    ov.querySelector('[data-stp-load-i="0"]').click();
    assert.strictEqual(calls.modal[0].message, 'COPIES 2 exercicis.');
  });

  it('says so when there is nothing to load', () => {
    const e = env({ trainings: [T()] });
    e.api.stpOpenLoadDialog(T(), () => {});
    const ov = e.doc.getElementById('custom-modal-overlay');
    assert.ok(ov.textContent.indexOf('plan.load_none') !== -1);
    assert.strictEqual(ov.querySelector('#stp-load-q'), null);
  });
});

describe('Carregar entrenament — on the session page (the top band, v293)', () => {
  /* The owner: it loads the WHOLE session — focus and planned RPE with the
     plan — so it sits on the top band beside Esborra, not inside the plan. */
  const page = grab('  function renderStaffTrainingDetail', '  function buildDetailBar');

  it('is on the top band, before Esborra, for an editor on a training — not an activity', () => {
    assert.ok(/const loadBtn = \(isAct \|\| ro\) \? '' :/.test(page), 'shown to view-only staff, or on an activity');
    assert.ok(/id="std-load"/.test(page));
    assert.ok(/std-topbar-r">\$\{actEdit\}\$\{loadBtn\}\$\{delBtn\}/.test(page), 'not beside Esborra');
  });

  it('is no longer inside the plan panel, with a plan or without', () => {
    const e = env();
    // eslint-disable-next-line no-new-func
    const render = new Function('stdPlan', 'stdBoardResolver', 'stdSessionBoards', 'planMaterial',
        'resolvePetos', 'blockTimes', '_stpBlockRow', '_stpOverlayHtml', '_stpN', 't', 'sanitize', 'exPointsOf', `
      ${grab('  function renderStdPlanPanel(tr, ro, squad) {', '  /** The ⤢ Ampliar overlay')}
      return renderStdPlanPanel;`)(e.api.stdPlan, () => () => null, () => [], () => ({ colors: [] }),
        () => [], () => ({ rows: [{ label: '20:00' }, { label: '20:10' }], endLabel: '21:00' }),
        () => '<div class="blk"></div>', () => '', e.api._stpN, t, e.api.sanitize,
        require('../js/utils.js').exPointsOf);
    [T(), Object.assign(T(), { plan: null })].forEach((tr) => {
      const h = render(tr, false, []);
      assert.ok(!/std-load|data-stp-load=|plan\.load\b/.test(h), 'a second load button in the plan');
    });
  });

  it('opens the dialog for the session on screen, and a load redraws the page', () => {
    const e = env();
    e.doc.body.innerHTML = '<button id="std-load"></button>';
    let target = null;
    // eslint-disable-next-line no-new-func
    new Function('document', 'getTrainings', 'detailTrainingId', 'stpOpenLoadDialog', 'stpLoadIntoSession',
        '_showPushToast', 'renderPage', 'getSession', 't', 'tDateShort', '_stpN',
        grab('    // Load a past session into this one (v290). A full render after',
            "    const actEdit = document.getElementById('std-edit-activity');"))(
        e.doc, e.deps.getTrainings, 'tr_new', (tg, onLoad) => { target = tg; onLoad(S1, e.api.stpTemplateOf(S1)); },
        e.api.stpLoadIntoSession, (a2, b2) => e.calls.toast.push(a2 + '|' + b2),
        () => { e.calls.render++; }, () => ({}), t, e.deps.tDateShort, e.api._stpN);
    e.doc.getElementById('std-load').click();
    assert.strictEqual(target.id, 'tr_new');
    assert.strictEqual(e.api.stdPlan(e.row('tr_new')).blocks.length, 2, 'nothing was loaded');
    assert.deepStrictEqual([e.row('tr_new').focus, e.row('tr_new').plannedRpe], ['Pressing', 7]);
    assert.deepStrictEqual([e.calls.toast.length, e.calls.render], [1, 1]);
  });
});

describe('Carregar entrenament — on a New Training draft', () => {
  function draftPage(drafts) {
    const e = env();
    let renders = 0;
    const html = drafts.map((d, i) => e.api._ntTplLine(d, i)).join('');
    e.doc.body.innerHTML = html;
    // eslint-disable-next-line no-new-func
    new Function('$$', '_ntDrafts', 'stpOpenLoadDialog', 'rerender',
        grab("    // Load a past session's plan into a draft (v290).", "\n    const cancel = $('#nt-cancel');"))(
        (sel) => [...e.doc.querySelectorAll(sel)], drafts,
        (d, onLoad) => onLoad(S1, e.api.stpTemplateOf(S1)), () => { renders++; });
    return Object.assign(e, { renders: () => renders });
  }

  it('a draft offers the button; a loaded one says where its plan came from, with a ✕', () => {
    const { api, doc } = env();
    doc.body.innerHTML = api._ntTplLine({ focus: '' }, 0);
    assert.ok(doc.querySelector('[data-nt-tpl="0"]'));
    doc.body.innerHTML = api._ntTplLine({ plan: S1.plan, _tplFrom: 'tr_s1', _tplDate: '2026-10-14' }, 0);
    assert.strictEqual(doc.querySelector('.nt-tpl-t').textContent, '📥 FROM D(2026-10-14) · 2 exercicis');
    assert.ok(doc.querySelector('[data-nt-tpl-x="0"]'));
  });

  it('loading fills the draft; ✕ puts back what the coach had before the FIRST load', () => {
    const d = { id: 'tr_d', date: '2026-10-28', category: 'amateur', teams: ['A'], focus: 'Meu', plannedRpe: 5 };
    const p = draftPage([d]);
    p.doc.querySelector('[data-nt-tpl="0"]').click();
    assert.deepStrictEqual([d.focus, d.plannedRpe, d._tplFrom, d._tplDate], ['Pressing', 7, 'tr_s1', '2026-10-14']);
    assert.strictEqual(p.api.stdPlan(d).blocks.length, 2);
    // A second load must not overwrite what ✕ restores.
    p.doc.body.innerHTML = '<button data-nt-tpl="0"></button><button data-nt-tpl-x="0"></button>';
    // eslint-disable-next-line no-new-func
    new Function('$$', '_ntDrafts', 'stpOpenLoadDialog', 'rerender',
        grab("    // Load a past session's plan into a draft (v290).", "\n    const cancel = $('#nt-cancel');"))(
        (sel) => [...p.doc.querySelectorAll(sel)], [d], (x, onLoad) => onLoad(S6, p.api.stpTemplateOf(S6)), () => {});
    p.doc.querySelector('[data-nt-tpl="0"]').click();
    assert.strictEqual(d.focus, 'Força');
    p.doc.querySelector('[data-nt-tpl-x="0"]').click();
    assert.deepStrictEqual([d.focus, d.plannedRpe, d.plan, d._tplFrom, d._tplPrev], ['Meu', 5, undefined, undefined, undefined]);
  });

  it('Save stores the plan, links its boards on the draft\'s date and drops the bookkeeping', () => {
    const e = env();
    const d = { id: 'tr_d', date: '2026-10-28', category: 'amateur', teams: ['A'], guests: [], excluded: [],
      plan: e.api.stpTemplateOf(S1).plan, focus: 'Pressing', _tplFrom: 'tr_s1', _tplDate: '2026-10-14', _tplPrev: {} };
    e.api._ntCommit([d]);
    const saved = e.row('tr_d');
    ['_tplFrom', '_tplDate', '_tplPrev'].forEach((k) => assert.ok(!(k in saved), k + ' rode into the row'));
    assert.strictEqual(e.api.stdPlan(saved).blocks.length, 2);
    assert.deepStrictEqual(e.boards()['2026-10-28'].map((b) => b.boardId), ['b1']);
  });
});
