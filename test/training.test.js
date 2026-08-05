/* Unit tests for per-team training sessions.
 *
 * Pure logic, no emulator and no browser: `npm run test:training`.
 *
 * Sessions used to carry only a `category`, so amateur-A and amateur-B
 * shared one calendar. They now carry `teams`, `guests`, `excluded` and
 * `endTime`, and the squad is DERIVED from those on every read rather than
 * stored — a frozen list would rot the moment a player changed team.
 *
 * Two invariants here are load-bearing and neither is obvious:
 *
 *  1. An EMPTY `teams` means "every letter of the category". That is what a
 *     session meant before the field existed, so every club that never uses
 *     letters, and every session written before the backfill, must keep
 *     behaving exactly as it did. A default of `['A']` would silently hide
 *     half the calendar.
 *  2. A session with NO category belongs to everyone. That is what
 *     renderTraining's `!t.category || t.category === curCat` already meant,
 *     and legacy rows rely on it.
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

/** The helper block, with its one outside dependency injected. */
function load(letters) {
  const code = grab('  var DEFAULT_SESSION_MINS = 90;', '\n  async function handleRegister');
  // eslint-disable-next-line no-new-func
  return new Function('getTeamLetters', `
    ${code}
    return { trainingTeams, playerIsCalled, calledPlayers, playerTrainings,
             sessionWindow, trainingsOverlap, hhmmToMins };`)(
      () => letters || ['A']);
}

const P = (id, category, team) => ({ id, category, team, roles: ['player'] });
const S = (over) => Object.assign(
    { id: 'tr1', date: '2026-09-01', time: '20:00', category: 'amateur' }, over);

describe('training — which teams is a session for', () => {
  const H = load(['A', 'B']);

  it('an empty teams list means EVERY letter of the category', () => {
    // The pre-field behaviour. Defaulting to ['A'] would hide B's calendar.
    assert.deepStrictEqual(H.trainingTeams(S({})), ['A', 'B']);
    assert.deepStrictEqual(H.trainingTeams(S({ teams: [] })), ['A', 'B']);
  });

  it('an explicit list wins', () => {
    assert.deepStrictEqual(H.trainingTeams(S({ teams: ['B'] })), ['B']);
  });

  it('ignores blank entries rather than treating them as a letter', () => {
    assert.deepStrictEqual(H.trainingTeams(S({ teams: ['', null] })), ['A', 'B']);
  });
});

describe('training — who is called', () => {
  const H = load(['A', 'B']);
  const a1 = P('a1', 'amateur', 'A');
  const b1 = P('b1', 'amateur', 'B');
  const j1 = P('j1', 'juvenil', 'A');

  it('a session for B excludes A and includes B', () => {
    const s = S({ teams: ['B'] });
    assert.strictEqual(H.playerIsCalled(s, a1), false);
    assert.strictEqual(H.playerIsCalled(s, b1), true);
  });

  it('an unlabelled session includes both letters', () => {
    const s = S({});
    assert.strictEqual(H.playerIsCalled(s, a1), true);
    assert.strictEqual(H.playerIsCalled(s, b1), true);
  });

  it('never crosses category on its own', () => {
    assert.strictEqual(H.playerIsCalled(S({}), j1), false);
  });

  it('a guest is called even from another category', () => {
    // The whole point of the feature: an amateur coach borrows a juvenil.
    assert.strictEqual(H.playerIsCalled(S({ teams: ['A'], guests: ['j1'] }), j1), true);
  });

  it('excluded beats everything, including guest', () => {
    assert.strictEqual(H.playerIsCalled(S({ excluded: ['a1'] }), a1), false);
    assert.strictEqual(
        H.playerIsCalled(S({ guests: ['j1'], excluded: ['j1'] }), j1), false);
  });

  it('compares ids as strings, because this codebase mixes the two', () => {
    const numeric = { id: 7, category: 'amateur', team: 'A', roles: ['player'] };
    assert.strictEqual(H.playerIsCalled(S({ guests: ['7'] }), numeric), true);
    assert.strictEqual(H.playerIsCalled(S({ excluded: ['7'] }), numeric), false);
  });

  it('a session with no category belongs to everyone', () => {
    // Legacy rows. renderTraining's old filter meant exactly this.
    const s = S({ category: '' });
    assert.strictEqual(H.playerIsCalled(s, a1), true);
    assert.strictEqual(H.playerIsCalled(s, j1), true);
  });

  it('calledPlayers skips staff', () => {
    const coach = { id: 'c1', category: 'amateur', team: '', roles: ['staff'] };
    const out = H.calledPlayers(S({}), [a1, b1, coach]);
    assert.deepStrictEqual(out.map((u) => u.id), ['a1', 'b1']);
  });

  it('playerTrainings gives a guest his borrowed session and nothing else', () => {
    const all = [
      S({ id: 'own', teams: ['A'], category: 'juvenil' }),
      S({ id: 'borrowed', teams: ['A'], category: 'amateur', guests: ['j1'] }),
      S({ id: 'other', teams: ['B'], category: 'amateur' }),
    ];
    assert.deepStrictEqual(
        H.playerTrainings(j1, all).map((t) => t.id), ['own', 'borrowed']);
  });
});

describe('training — session windows and clashes', () => {
  const H = load(['A']);

  it('reads a plain start time and applies the default length', () => {
    assert.deepStrictEqual(H.sessionWindow(S({ time: '20:00' })),
        { start: 1200, end: 1290 });
  });

  it('prefers an explicit end time', () => {
    assert.deepStrictEqual(H.sessionWindow(S({ time: '20:00', endTime: '21:45' })),
        { start: 1200, end: 1305 });
  });

  it('recovers the end from the legacy "HH:MM - HH:MM" range', () => {
    // The vestigial format every other read site defends against.
    assert.deepStrictEqual(H.sessionWindow(S({ time: '20:00 - 21:30' })),
        { start: 1200, end: 1290 });
  });

  it('ignores an end time that is not after the start', () => {
    assert.strictEqual(H.sessionWindow(S({ time: '20:00', endTime: '19:00' })).end, 1290);
  });

  it('returns null for an unparseable time rather than guessing', () => {
    assert.strictEqual(H.sessionWindow(S({ time: '' })), null);
    assert.strictEqual(H.sessionWindow(S({ time: 'evening' })), null);
    assert.strictEqual(H.hhmmToMins('25:00'), null);
  });

  const at = (id, time, endTime, date) =>
    S({ id, time, endTime, date: date || '2026-09-01' });

  it('overlapping windows on the same date clash', () => {
    assert.strictEqual(
        H.trainingsOverlap(at('x', '20:00', '21:30'), at('y', '21:00', '22:30')), true);
  });

  it('back-to-back sessions do NOT clash', () => {
    // [start, end) — 20:00-21:30 and 21:30-23:00 are adjacent, not overlapping.
    assert.strictEqual(
        H.trainingsOverlap(at('x', '20:00', '21:30'), at('y', '21:30', '23:00')), false);
  });

  it('different dates never clash', () => {
    assert.strictEqual(H.trainingsOverlap(
        at('x', '20:00', '21:30'), at('y', '20:00', '21:30', '2026-09-02')), false);
  });

  it('a session does not clash with itself', () => {
    assert.strictEqual(H.trainingsOverlap(at('x', '20:00'), at('x', '20:00')), false);
  });

  it('an untimed session clashes with nothing, rather than everything', () => {
    // Failing open here would warn on every player for a half-filled row.
    assert.strictEqual(H.trainingsOverlap(at('x', ''), at('y', '20:00')), false);
  });
});

describe('training — the one reader repairs missing ids', () => {
  /* Every navigation now addresses a session by id, so a legacy row without
     one could be listed and never opened. The repair used to live in
     renderStaffTraining, which a player never renders. */
  function loadReader(store, session) {
    const code = grab('  function getTrainings() {', '\n  function hhmmToMins');
    const written = {};
    const localStorage = {
      getItem: (k) => (k in store ? store[k] : null),
      setItem: (k, v) => { written[k] = v; store[k] = v; },
    };
    // eslint-disable-next-line no-new-func
    const fn = new Function('localStorage', 'getSession', `
      ${code}
      return getTrainings;`)(localStorage, () => session);
    return { getTrainings: fn, written };
  }

  const staff = { id: 's1', roles: ['staff'] };
  const player = { id: 'p1', roles: ['player'] };

  it('gives every session an id', () => {
    const store = { fa_training: JSON.stringify([{ date: '2026-09-01' }]) };
    const out = loadReader(store, staff).getTrainings();
    assert.ok(/^tr_/.test(out[0].id));
  });

  it('leaves an existing id alone', () => {
    const store = { fa_training: JSON.stringify([{ id: 'tr_keep', date: '2026-09-01' }]) };
    assert.strictEqual(loadReader(store, staff).getTrainings()[0].id, 'tr_keep');
  });

  it('persists the repair for staff', () => {
    const store = { fa_training: JSON.stringify([{ date: '2026-09-01' }]) };
    const r = loadReader(store, staff);
    r.getTrainings();
    assert.ok(r.written.fa_training, 'staff may write fa_training');
  });

  it('does NOT persist from a player, who has no permission', () => {
    // fa_training is not in the player write allowlist in firestore.rules.
    // Writing would be denied and surface an error toast on every render.
    const store = { fa_training: JSON.stringify([{ date: '2026-09-01' }]) };
    const r = loadReader(store, player);
    const out = r.getTrainings();
    assert.ok(/^tr_/.test(out[0].id), 'still repaired in memory, so it opens');
    assert.strictEqual(r.written.fa_training, undefined, 'but never written');
  });

  it('writes nothing when there was nothing to repair', () => {
    const store = { fa_training: JSON.stringify([{ id: 'tr_a', date: '2026-09-01' }]) };
    const r = loadReader(store, staff);
    r.getTrainings();
    assert.strictEqual(r.written.fa_training, undefined, 'a read must stay a read');
  });

  it('survives a corrupt blob instead of throwing on every render', () => {
    assert.deepStrictEqual(loadReader({ fa_training: '{not json' }, staff).getTrainings(), []);
    assert.deepStrictEqual(loadReader({}, staff).getTrainings(), []);
  });
});

/* The slot builder was buried inside addTraining(), reachable only by a
   source assertion. It is buildTrainingDrafts() now, so these RUN it. */
describe('training — the draft builder keeps every team slot', () => {
  function build(schedules, opts) {
    const code = grab('  var TRAINING_DEFAULT_LOC', '  async function handleRegister');
    const cfg = { schedules };
    // eslint-disable-next-line no-new-func
    const fn = new Function('_clubConfig', 'getTeamLetters', 'tDay', `
      ${code}
      return buildTrainingDrafts;`)(cfg, () => (opts && opts.letters) || ['A', 'B'],
        (n) => 'day' + n);
    return fn('amateur', (opts && opts.training) || [], opts && opts.only);
  }

  const slot = (day, time, endTime, location) =>
    ({ day, time, endTime: endTime || '', location: location || '', link: '' });

  it('gives two teams on the same evening at different times TWO sessions', () => {
    // The bug: a dedup on day+time alone dropped B's slot entirely.
    const out = build({
      'amateur-A': { training: [slot('tue', '20:00', '21:30')] },
      'amateur-B': { training: [slot('tue', '21:30', '23:00')] },
    });
    assert.strictEqual(out.length, 2);
    assert.deepStrictEqual(out.map((d) => d.teams).sort(), [['A'], ['B']]);
    assert.deepStrictEqual(out.map((d) => d.time).sort(), ['20:00', '21:30']);
  });

  it('collapses an identical slot into ONE session carrying both letters', () => {
    const out = build({
      'amateur-A': { training: [slot('tue', '20:00', '21:30', 'Pitch 1')] },
      'amateur-B': { training: [slot('tue', '20:00', '21:30', 'Pitch 1')] },
    });
    assert.strictEqual(out.length, 1);
    assert.deepStrictEqual(out[0].teams, ['A', 'B']);
  });

  it('treats a different place as a different session', () => {
    const out = build({
      'amateur-A': { training: [slot('tue', '20:00', '21:30', 'Pitch 1')] },
      'amateur-B': { training: [slot('tue', '20:00', '21:30', 'Pitch 2')] },
    });
    assert.strictEqual(out.length, 2);
  });

  it('carries the end time through', () => {
    const out = build({ 'amateur-A': { training: [slot('tue', '20:00', '21:45')] } },
        { letters: ['A'] });
    assert.strictEqual(out[0].endTime, '21:45');
  });

  it('restricts to the letters asked for', () => {
    const out = build({
      'amateur-A': { training: [slot('tue', '20:00')] },
      'amateur-B': { training: [slot('tue', '21:30')] },
    }, { only: ['B'] });
    assert.strictEqual(out.length, 1);
    assert.deepStrictEqual(out[0].teams, ['B']);
  });

  it('falls back to Tue/Thu when nothing is configured', () => {
    const out = build({});
    assert.ok(out.length >= 1);
    assert.deepStrictEqual(out[0].teams, ['A', 'B'], 'for the letters asked for');
  });

  it('stamps every draft ready to save', () => {
    const out = build({ 'amateur-A': { training: [slot('tue', '20:00')] } }, { letters: ['A'] });
    const d = out[0];
    assert.ok(/^tr_/.test(d.id));
    assert.strictEqual(d.category, 'amateur');
    assert.deepStrictEqual(d.guests, []);
    assert.deepStrictEqual(d.excluded, []);
    assert.ok(/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(d.date));
  });

  it('gives several drafts from one build distinct ids', () => {
    const out = build({
      'amateur-A': { training: [slot('tue', '20:00')] },
      'amateur-B': { training: [slot('tue', '21:30')] },
    });
    assert.strictEqual(new Set(out.map((d) => d.id)).size, out.length);
  });

  it('never proposes a session in the past', () => {
    // A season that stopped in 2020 must not cycle on from 2020.
    const out = build({ 'amateur-A': { training: [slot('tue', '20:00')] } },
        { letters: ['A'], training: [{ date: '2020-05-05', category: 'amateur' }] });
    const today = new Date().toISOString().slice(0, 10);
    assert.ok(out[0].date >= today, out[0].date);
  });
});

/* ------------------------------------------------------------------ *
 * The New Training page: clashes, and what Save does about them.
 *
 * The owner's rule, verbatim: "this player already has a training
 * scheduled at this time, adding him will remove him from it." So the
 * warning is not advisory — Save acts on it, and the player comes OUT of
 * the session he was already in.
 *
 * Resolved at save rather than at Add, so that editing the times
 * afterwards still resolves correctly: a coach who adds a player and then
 * moves the session an hour later should no longer displace anybody.
 * ------------------------------------------------------------------ */
describe('training — new session clash handling', () => {
  function load(existing, users) {
    const store = { fa_training: JSON.stringify(existing) };
    const localStorage = {
      getItem: (k) => (k in store ? store[k] : null),
      setItem: (k, v) => { store[k] = v; },
    };
    /* Two slices, around getTrainings(): that one is injected so the
       stub can read the fixture store, and a real copy here would
       shadow it. Everything either side is the genuine article. */
    const helpers = grab('  var DEFAULT_SESSION_MINS = 90;', '  function getTrainings()') +
      grab('  function hhmmToMins(v)', '  function recordKey(');
    const head = grab('  let _ntDrafts = null;', '  function renderTrainingNew()');
    const save = grab('  function _ntSave()', '  // #endregion New Training');
    // eslint-disable-next-line no-new-func
    const api = new Function('localStorage', 'getUsers', 'getTrainings',
        'getTeamLetters', 'getCurrentCategory', 'buildTrainingDrafts',
        'renderPage', 'getSession', '_showPushToast', 't', `
      let currentPage = '';
      ${helpers}
      ${head}
      ${save}
      return { _ntClashes, _ntSave, setDrafts: (d) => { _ntDrafts = d; },
               page: () => currentPage };`)(
        localStorage, () => users, () => JSON.parse(store.fa_training),
        () => ['A', 'B'], () => 'amateur', () => [], () => {}, () => ({}),
        () => {}, (k) => k);
    return { api, store };
  }

  const P = (id, team) => ({ id, category: 'amateur', team, roles: ['player'] });
  const users = [P('a1', 'A'), P('b1', 'B')];
  const S = (over) => Object.assign(
      { id: 'tr_x', date: '2026-09-01', time: '20:00', endTime: '21:30',
        category: 'amateur', teams: ['A'], guests: [], excluded: [] }, over);

  it('flags a player already booked at that time', () => {
    const { api } = load([S({ id: 'tr_a', teams: ['A'] })], users);
    const draft = S({ id: 'tr_new', teams: ['B'], guests: ['a1'] });
    assert.strictEqual(api._ntClashes('a1', draft).length, 1);
  });

  it('does not flag a session that merely shares the date', () => {
    const { api } = load([S({ id: 'tr_a', time: '18:00', endTime: '19:30' })], users);
    const draft = S({ id: 'tr_new', time: '20:00', endTime: '21:30', guests: ['a1'] });
    assert.strictEqual(api._ntClashes('a1', draft).length, 0);
  });

  it('does not flag a session the player is not called to', () => {
    const { api } = load([S({ id: 'tr_a', teams: ['B'] })], users);
    const draft = S({ id: 'tr_new', teams: ['B'], guests: ['a1'] });
    assert.strictEqual(api._ntClashes('a1', draft).length, 0, 'a1 is team A');
  });

  it('SAVE removes the clashing player from the session he was in', () => {
    const { api, store } = load([S({ id: 'tr_a', teams: ['A'] })], users);
    api.setDrafts([S({ id: 'tr_new', teams: ['B'], guests: ['a1'] })]);
    api._ntSave();
    const out = JSON.parse(store.fa_training);
    const old = out.find((x) => x.id === 'tr_a');
    assert.deepStrictEqual(old.excluded, ['a1'], 'taken out of the overlapping one');
    assert.ok(out.find((x) => x.id === 'tr_new'), 'and the new session is saved');
  });

  it('leaves a non-clashing session alone', () => {
    const { api, store } = load([S({ id: 'tr_a', time: '18:00', endTime: '19:30' })], users);
    api.setDrafts([S({ id: 'tr_new', teams: ['B'], guests: ['a1'] })]);
    api._ntSave();
    const old = JSON.parse(store.fa_training).find((x) => x.id === 'tr_a');
    assert.deepStrictEqual(old.excluded, []);
  });

  it('writes every draft, not just the first', () => {
    const { api, store } = load([], users);
    api.setDrafts([S({ id: 'n1' }), S({ id: 'n2', teams: ['B'] })]);
    api._ntSave();
    const ids = JSON.parse(store.fa_training).map((x) => x.id).sort();
    assert.deepStrictEqual(ids, ['n1', 'n2']);
  });

  it('writes nothing when there is nothing to save', () => {
    const { api, store } = load([S({ id: 'tr_a' })], users);
    api.setDrafts([]);
    api._ntSave();
    assert.strictEqual(JSON.parse(store.fa_training).length, 1);
  });
});
