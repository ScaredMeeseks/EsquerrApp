/* Private notes on a session's exercises (v291, roadmap 38).
 *
 * The owner's call: staff only, private. So the two things this file guards
 * hardest are that a PLAYER's client never opens the listener (the rule is
 * tested in rules.test.js), and that two coaches writing at once never
 * overwrite each other — every write is a nested merge or a single field-path
 * delete, and the fake Firestore merges as deep as the real one does.
 *
 * Part 1 runs the real js/training-notes.js over test/fake-firestore.js.
 * Part 2 runs the real plan panel and its handlers (test/plan-harness.js)
 * over jsdom, with a TN that records what it is asked to do.
 */
const assert = require('assert');
const path = require('path');
const {JSDOM} = require('jsdom');
const {FakeStore, makeApi} = require('./fake-firestore');
const TN = require(path.join(__dirname, '..', 'js', 'training-notes.js'));
const {renderers, grab} = require('./plan-harness');

const CLUB = 'club1';
const TR = {id: 'trA', date: '2026-10-14', time: '19:30', category: 'amateur'};
const doc = (store, sid) => store.docs.get('teams/' + CLUB + '/trainingNotes/' + sid);
const flush = () => new Promise((r) => setImmediate(r));

function boot(claims, uid) {
  const store = new FakeStore();
  const {db, firebase} = makeApi(store);
  global.db = db;
  global.firebase = firebase;
  global.auth = {currentUser: {uid: uid || 'coachA', getIdTokenResult: async () => ({claims})}};
  const events = [];
  global.window = {dispatchEvent: (e) => events.push(e)};
  global.CustomEvent = class { constructor(type, init) { this.type = type; this.detail = init && init.detail; } };
  return {store, db, events};
}
const STAFF = {role: 'staff', cats: ['amateur'], teamId: CLUB};

describe('TN — the pure helpers', () => {
  it('trims and caps a note in the write path itself', () => {
    assert.strictEqual(TN.clean('  hola  '), 'hola');
    assert.strictEqual(TN.clean('x'.repeat(600)).length, TN.MAX);
    assert.strictEqual(TN.MAX, 500);
  });

  it('lists an exercise\'s notes oldest first, and drops empty ones', () => {
    const d = {ex: {e1: {
      b: {text: 'segona', uid: 'u', name: 'N', at: '2026-10-14T19:00:00Z'},
      a: {text: 'primera', uid: 'u', name: 'N', at: '2026-10-14T18:00:00Z'},
      z: {text: '', at: '2026-10-14T17:00:00Z'},
    }}};
    assert.deepStrictEqual(TN.listOf(d, 'e1').map((n) => n.text), ['primera', 'segona']);
    assert.deepStrictEqual(TN.listOf(d, 'nope'), []);
    assert.deepStrictEqual(TN.listOf(null, 'e1'), []);
  });
});

describe('TN — over Firestore', () => {
  afterEach(() => {
    TN.cleanup();
    delete global.db; delete global.auth; delete global.firebase; delete global.window; delete global.CustomEvent;
  });

  it('a PLAYER\'s client opens no listener at all', async () => {
    const {store} = boot({role: 'player', cats: ['amateur'], teamId: CLUB});
    await TN.init(CLUB);
    await flush();
    assert.strictEqual(TN.ready(), true);
    assert.strictEqual(store.listeners.filter((l) => /trainingNotes/.test(l.path)).length, 0);
  });

  it('staff read their categories\' notes, and only theirs', async () => {
    const {store} = boot(STAFF);
    store.seed('teams/' + CLUB + '/trainingNotes/trA', {category: 'amateur', sessionId: 'trA',
      ex: {e1: {n1: {text: 'Bé', uid: 'x', name: 'Xavi', at: '2026-10-14T20:00:00Z'}}}});
    store.seed('teams/' + CLUB + '/trainingNotes/trJ', {category: 'juvenil', sessionId: 'trJ',
      ex: {e1: {n1: {text: 'not yours', at: '2026-10-14T20:00:00Z'}}}});
    await TN.init(CLUB);
    assert.deepStrictEqual(TN.notesOf('trA', 'e1').map((n) => n.text), ['Bé']);
    assert.deepStrictEqual(TN.notesOf('trJ', 'e1'), [], 'another category\'s note was loaded');
    assert.strictEqual(TN.uid(), 'coachA');
  });

  it('adds a note under the session, stamped with its category and its author', async () => {
    const {store} = boot(STAFF);
    await TN.init(CLUB);
    const p = TN.add(TR, 'e1', '  Massa llarg  ', 'Marc Coach');
    // On screen before the server answers — the re-render after a click must show it.
    assert.deepStrictEqual(TN.notesOf('trA', 'e1').map((n) => n.text), ['Massa llarg']);
    const nid = await p;
    const d = doc(store, 'trA');
    assert.deepStrictEqual([d.category, d.sessionId], ['amateur', 'trA']);
    const n = d.ex.e1[nid];
    assert.deepStrictEqual([n.text, n.uid, n.name], ['Massa llarg', 'coachA', 'Marc Coach']);
    assert.ok(!isNaN(Date.parse(n.at)));
  });

  it('two coaches writing at once keep each other\'s notes', async () => {
    const {store} = boot(STAFF);
    store.seed('teams/' + CLUB + '/trainingNotes/trA', {category: 'amateur', sessionId: 'trA', ex: {
      e1: {nB: {text: 'de la Berta', uid: 'coachB', name: 'Berta', at: '2026-10-14T20:00:00Z'}},
      e2: {nC: {text: 'a l\'altre exercici', uid: 'coachB', name: 'Berta', at: '2026-10-14T20:01:00Z'}},
    }});
    await TN.init(CLUB);
    await TN.add(TR, 'e1', 'meva', 'Marc');
    const d = doc(store, 'trA');
    assert.deepStrictEqual(Object.values(d.ex.e1).map((n) => n.text).sort(), ['de la Berta', 'meva']);
    assert.strictEqual(d.ex.e2.nC.text, 'a l\'altre exercici', 'another exercise\'s note was overwritten');
  });

  it('an edit changes the text and keeps who wrote it and when; an empty edit deletes', async () => {
    const {store} = boot(STAFF);
    await TN.init(CLUB);
    const nid = await TN.add(TR, 'e1', 'v1', 'Marc');
    const at = doc(store, 'trA').ex.e1[nid].at;
    await TN.edit(TR, 'e1', nid, 'v2');
    const n = doc(store, 'trA').ex.e1[nid];
    assert.deepStrictEqual([n.text, n.uid, n.name, n.at], ['v2', 'coachA', 'Marc', at]);
    assert.ok(n.editedAt, 'no edit mark');
    await TN.edit(TR, 'e1', nid, '   ');
    assert.ok(!(nid in (doc(store, 'trA').ex.e1 || {})), 'an emptied note stayed');
  });

  it('removing a note takes that note and nothing beside it', async () => {
    const {store} = boot(STAFF);
    await TN.init(CLUB);
    const a = await TN.add(TR, 'e1', 'a', 'M');
    const b = await TN.add(TR, 'e1', 'b', 'M');
    await TN.remove(TR, 'e1', a);
    assert.deepStrictEqual(Object.keys(doc(store, 'trA').ex.e1), [b]);
    assert.deepStrictEqual(TN.notesOf('trA', 'e1').map((n) => n.text), ['b']);
  });

  it('drops the notes of exercises named — only those, and writes nothing for none', async () => {
    const {store} = boot(STAFF);
    await TN.init(CLUB);
    await TN.add(TR, 'e1', 'a', 'M');
    await TN.add(TR, 'e2', 'b', 'M');
    assert.strictEqual(await TN.dropExercises(TR, ['e1', 'nope']), 1);
    assert.deepStrictEqual(Object.keys(doc(store, 'trA').ex), ['e2']);
    store.resetWrites();
    assert.strictEqual(await TN.dropExercises(TR, ['nope']), 0);
    assert.strictEqual(store.writes.length, 0, 'a write for nothing to drop');
  });

  it('deleting the session deletes its notes document', async () => {
    const {store} = boot(STAFF);
    await TN.init(CLUB);
    await TN.add(TR, 'e1', 'a', 'M');
    await TN.removeSession('trA');
    assert.strictEqual(doc(store, 'trA'), undefined);
    assert.deepStrictEqual(TN.notesOf('trA', 'e1'), []);
  });

  it('refuses a session with no category — nobody could ever read the note', async () => {
    const {store} = boot(STAFF);
    await TN.init(CLUB);
    await assert.rejects(() => TN.add({id: 'x'}, 'e1', 'a', 'M'), /no category/);
    assert.strictEqual(store.writes.length, 0);
  });

  it('a refused write takes the note back off the screen, and says so', async () => {
    const {store, events} = boot(STAFF);
    await TN.init(CLUB);
    store.failNext = (p, type) => (type === 'set' ? Object.assign(new Error('denied'), {code: 'permission-denied'}) : null);
    await assert.rejects(() => TN.add(TR, 'e1', 'a', 'M'), /denied/);
    assert.deepStrictEqual(TN.notesOf('trA', 'e1'), []);
    assert.ok(events.filter((e) => e.type === 'training-notes-sync').length >= 2, 'the rollback was not announced');
  });

  it('a colleague\'s note arriving is announced for its session', async () => {
    const {db, events} = boot(STAFF);
    await TN.init(CLUB);
    events.length = 0;
    await db.collection('teams').doc(CLUB).collection('trainingNotes').doc('trA').set({category: 'amateur',
      sessionId: 'trA', ex: {e1: {n9: {text: 'nova', uid: 'coachB', name: 'Berta', at: '2026-10-14T21:00:00Z'}}}});
    await flush();
    assert.deepStrictEqual(TN.notesOf('trA', 'e1').map((n) => n.text), ['nova']);
    assert.ok(events.some((e) => e.type === 'training-notes-sync' && e.detail.sessionId === 'trA'));
  });
});

/* ── Part 2: the plan panel ─────────────────────────────────────────────── */

function tnStub(notes) {
  const calls = [];
  const N = notes || {};
  return { calls, MAX: 500, ready: () => true, uid: () => 'me',
    notesOf: (sid, ex) => N[ex] || [], count: (sid, ex) => (N[ex] || []).length,
    clean: (x) => String(x || '').trim().slice(0, 500),
    add: (tr, ex, text, name) => { calls.push(['add', ex, text, name]); return Promise.resolve('n'); },
    edit: (tr, ex, id, text) => { calls.push(['edit', ex, id, text]); return Promise.resolve(); },
    remove: (tr, ex, id) => { calls.push(['remove', ex, id]); return Promise.resolve(); },
    dropExercises: (tr, ids) => { calls.push(['drop', ids]); return Promise.resolve(ids.length); },
    removeSession: () => Promise.resolve() };
}
const NOTE = (id, uid, name, text) => ({id, uid, name, text, at: '2026-10-14T19:42:00', editedAt: ''});
const TR0 = {id: 'now', date: '2026-10-14', time: '20:00', endTime: '21:30', category: 'amateur', plan: {
  blocks: [{id: 'b0', mins: 20, items: [
    {id: 'e1', boardId: '', title: 'Rondo', desc: ''},
    {id: 'e2', boardId: '', title: 'Partidet', desc: ''},
  ]}]}};

function page(o) {
  o = o || {};
  const dom = new JSDOM('<body></body>', {url: 'http://localhost/', pretendToBeVisual: true});
  const d = dom.window.document;
  const errors = [];
  dom.window.addEventListener('error', (e) => errors.push(e.error || e.message));
  const tr = JSON.parse(JSON.stringify(TR0));
  const writes = []; const modals = [];
  const tn = o.TN === null ? undefined : (o.TN || tnStub(o.notes));
  const R = renderers({
    document: d, trainings: [tr], canEdit: o.canEdit, TN: tn, session: o.session,
    persist: (id, fn) => { writes.push(id); fn(tr); return tr; },
    showModal: (title, msg, ok, opts) => { modals.push({title, msg, ok, opts}); if (o.autoOk !== false) ok(); },
  });
  d.body.innerHTML = R.renderStdPlanPanel(tr, o.canEdit === false, []);
  R.bindStdPlan();
  const click = (el) => el.dispatchEvent(new dom.window.MouseEvent('click', {bubbles: true}));
  const open = (ex) => click(d.querySelector('[data-stp-notes="' + ex + '"]'));
  return {d, tr, tn, writes, modals, errors, click, open, R, win: dom.window};
}

describe('exercise notes — on the session page', () => {
  it('each exercise shows 💬 with its count; with no TN (a player\'s page cannot have one) none', () => {
    const {d} = page({notes: {e1: [NOTE('n1', 'me', 'Marc Coach', 'a'), NOTE('n2', 'x', 'Berta B', 'b')]}});
    assert.strictEqual(d.querySelector('[data-stp-notes="e1"] .stp-ex-notes-n').textContent, '2');
    assert.ok(d.querySelector('[data-stp-notes="e2"]'));
    assert.strictEqual(d.querySelector('[data-stp-notes="e2"] .stp-ex-notes-n'), null, 'a zero was printed');
    assert.strictEqual(page({TN: null}).d.querySelector('[data-stp-notes]'), null);
  });

  it('💬 opens the notes: first name, when, the text — as text, never markup', () => {
    const p = page({notes: {e1: [NOTE('n1', 'x', 'Berta Bosch', '<b>massa</b> llarg')]}});
    p.open('e1');
    const note = p.d.querySelector('.stp-note');
    assert.ok(note, 'nothing opened');
    assert.strictEqual(note.querySelector('b').textContent, 'Berta');
    assert.strictEqual(note.querySelector('.stp-note-t').textContent, '<b>massa</b> llarg');
    assert.ok(/D\(2026-10-14\) 19:42/.test(note.querySelector('.stp-note-when').textContent));
    assert.deepStrictEqual(p.errors, []);
  });

  it('✎ and × on your own note; neither on a colleague\'s — × on every note for the head coach', () => {
    const notes = {e1: [NOTE('n1', 'me', 'Marc', 'meva'), NOTE('n2', 'x', 'Berta', 'seva')]};
    const p = page({notes});
    p.open('e1');
    const [mine, theirs] = p.d.querySelectorAll('.stp-note');
    assert.ok(mine.querySelector('[data-stp-note-edit]') && mine.querySelector('[data-stp-note-del]'));
    assert.strictEqual(theirs.querySelector('[data-stp-note-edit]'), null);
    assert.strictEqual(theirs.querySelector('[data-stp-note-del]'), null);
    const lead = page({notes, session: {id: 'me', name: 'Marc', isTeamLead: true}});
    lead.open('e1');
    const t2 = lead.d.querySelectorAll('.stp-note')[1];
    assert.ok(t2.querySelector('[data-stp-note-del]'), 'the head coach cannot remove a note');
    assert.strictEqual(t2.querySelector('[data-stp-note-edit]'), null, 'nobody edits another\'s words');
  });

  it('view-only staff read the notes and get no field and no controls', () => {
    const p = page({canEdit: false, notes: {e1: [NOTE('n1', 'me', 'Marc', 'meva')]}});
    p.open('e1');
    assert.ok(p.d.querySelector('.stp-note'), 'a view-only coach cannot read them');
    assert.strictEqual(p.d.querySelector('[data-stp-note-new]'), null);
    assert.strictEqual(p.d.querySelector('[data-stp-note-edit], [data-stp-note-del]'), null);
  });

  it('adds what is typed, trimmed, signed with the coach\'s name — and nothing when empty', () => {
    const p = page();
    p.open('e1');
    const box = p.d.querySelector('[data-stp-note-new="e1"]');
    box.value = '   ';
    p.click(p.d.querySelector('[data-stp-note-add="e1"]'));
    assert.deepStrictEqual(p.tn.calls, []);
    box.value = '  Repetir dijous  ';
    p.click(p.d.querySelector('[data-stp-note-add="e1"]'));
    assert.deepStrictEqual(p.tn.calls, [['add', 'e1', 'Repetir dijous', 'Marc Coach']]);
  });

  it('text being typed survives a re-render', () => {
    const p = page();
    p.open('e1');
    const box = p.d.querySelector('[data-stp-note-new="e1"]');
    box.value = 'a mig escriure';
    box.dispatchEvent(new p.win.Event('input'));
    p.open('e2');             // any re-render of the plan
    assert.strictEqual(p.d.querySelector('[data-stp-note-new="e1"]').value, 'a mig escriure');
  });

  it('✎ edits in place; Desa writes, Cancel·lar does not', () => {
    const p = page({notes: {e1: [NOTE('n1', 'me', 'Marc', 'vella')]}});
    p.open('e1');
    p.click(p.d.querySelector('[data-stp-note-edit]'));
    const f = p.d.querySelector('.stp-note-editing textarea');
    assert.strictEqual(f.value, 'vella');
    p.click(p.d.querySelector('[data-stp-note-cancel]'));
    assert.deepStrictEqual(p.tn.calls, []);
    p.click(p.d.querySelector('[data-stp-note-edit]'));
    p.d.querySelector('.stp-note-editing textarea').value = 'nova';
    p.click(p.d.querySelector('[data-stp-note-save]'));
    assert.deepStrictEqual(p.tn.calls, [['edit', 'e1', 'n1', 'nova']]);
  });

  it('× asks first, then removes the note', () => {
    const p = page({notes: {e1: [NOTE('n1', 'me', 'Marc', 'meva')]}, autoOk: false});
    p.open('e1');
    p.click(p.d.querySelector('[data-stp-note-del]'));
    assert.strictEqual(p.modals.length, 1);
    assert.deepStrictEqual(p.tn.calls, [], 'removed before the coach said yes');
    p.modals[0].ok();
    assert.deepStrictEqual(p.tn.calls, [['remove', 'e1', 'n1']]);
  });

  it('removing an exercise with notes asks first and takes its notes; one without just goes', () => {
    const p = page({notes: {e1: [NOTE('n1', 'me', 'Marc', 'a')]}, autoOk: false});
    p.click(p.d.querySelector('[data-stp-del="0.0"]'));
    assert.strictEqual(p.modals.length, 1, 'an exercise with notes went without asking');
    assert.ok(/plan\.del_ex_notes/.test(p.modals[0].msg));
    assert.deepStrictEqual(p.writes, []);
    p.modals[0].ok();
    assert.deepStrictEqual([p.writes.length, p.tn.calls], [1, [['drop', ['e1']]]]);
    const q = page({autoOk: false});
    q.click(q.d.querySelector('[data-stp-del="0.1"]'));
    assert.deepStrictEqual([q.modals.length, q.writes.length, q.tn.calls], [0, 1, [['drop', ['e2']]]]);
  });

  it('loading another plan over this one takes the replaced exercises\' notes', () => {
    const p = page({notes: {e1: [NOTE('n1', 'me', 'Marc', 'a')]}});
    const tpl = {plan: {blocks: [{id: 'nb', mins: 10, items: [{id: 'nx', title: 'Nou'}]}]}, focus: '', plannedRpe: null, boardIds: []};
    p.R.stpLoadIntoSession('now', {date: '2026-10-07', category: 'amateur'}, tpl);
    assert.deepStrictEqual(p.tn.calls, [['drop', ['e1', 'e2']]]);
  });
});

describe('exercise notes — a colleague\'s note arriving', () => {
  function listener(state) {
    // eslint-disable-next-line no-new-func
    return new Function('window', 'document', 'stdRefreshPlan', 'S', `
      let currentPage = S.page; let detailTrainingId = S.id; let _stpNotesPending = false;
      ${grab("    window.addEventListener('training-notes-sync'", "    window.addEventListener('match-notes-sync'")}
      return () => _stpNotesPending;`);
  }
  function run(page, id, focusNote, detailSid) {
    const handlers = {};
    const win = {addEventListener: (type, fn) => { handlers[type] = fn; }};
    let refreshed = 0;
    const active = focusNote ? {classList: {contains: (c) => c === 'stp-note-in'}} : {classList: {contains: () => false}};
    const pending = listener()(win, {activeElement: active}, () => { refreshed++; }, {page, id});
    handlers['training-notes-sync']({detail: {sessionId: detailSid}});
    return {refreshed, pending: pending()};
  }

  it('redraws the plan of the session it is for, on the session page only', () => {
    assert.deepStrictEqual(run('staff-training-detail', 'trA', false, 'trA'), {refreshed: 1, pending: false});
    assert.deepStrictEqual(run('staff-training-detail', 'trA', false, 'trB').refreshed, 0);
    assert.deepStrictEqual(run('calendar', 'trA', false, 'trA').refreshed, 0);
  });

  it('waits while a note is being typed', () => {
    assert.deepStrictEqual(run('staff-training-detail', 'trA', true, 'trA'), {refreshed: 0, pending: true});
  });
});
