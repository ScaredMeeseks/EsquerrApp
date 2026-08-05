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
             sessionWindow, trainingsOverlap, hhmmToMins, minsToHHMM,
             defaultEndTime };`)(
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
/* buildTrainingDrafts takes ONE letter. A session belongs to exactly one
   team, so A and B get separate sessions even when they train at the same
   time in the same place — and the cross-letter merge that used to live
   here went with that decision, because nothing can ask for it any more. */
describe('training — the draft builder proposes one team session', () => {
  function build(schedules, opts) {
    const code = grab('  var TRAINING_DEFAULT_LOC', '  async function handleRegister');
    const cfg = { schedules };
    // eslint-disable-next-line no-new-func
    const fn = new Function('_clubConfig', 'getTeamLetters', 'tDay',
        'hhmmToMins', 'minsToHHMM', 'DEFAULT_SESSION_MINS', 'defaultEndTime', `
      ${code}
      return buildTrainingDrafts;`)(cfg, () => ['A', 'B'], (n) => 'day' + n,
        (v) => {
          const m = /^(\d{1,2}):(\d{2})$/.exec(String(v || '').trim());
          if (!m) return null;
          return Number(m[1]) * 60 + Number(m[2]);
        },
        (m) => (m === null || m > 24 * 60 - 1 ? '' :
          String(Math.floor(m / 60)).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0')),
        90, (start) => {
          const m = /^(\d{1,2}):(\d{2})$/.exec(String(start || '').trim());
          if (!m) return '';
          const mins = Number(m[1]) * 60 + Number(m[2]) + 90;
          return mins > 24 * 60 - 1 ? '' :
            String(Math.floor(mins / 60)).padStart(2, '0') + ':' + String(mins % 60).padStart(2, '0');
        });
    return fn('amateur', (opts && opts.training) || [], (opts && opts.letter) || 'A');
  }

  const slot = (day, time, endTime, location) =>
    ({ day, time, endTime: endTime || '', location: location || '', link: '' });

  it('reads only the chosen team schedule', () => {
    const out = build({
      'amateur-A': { training: [slot('tue', '20:00', '21:30')] },
      'amateur-B': { training: [slot('tue', '21:30', '23:00')] },
    }, { letter: 'B' });
    assert.strictEqual(out.length, 1);
    assert.strictEqual(out[0].time, '21:30');
    assert.deepStrictEqual(out[0].teams, ['B']);
  });

  it('stamps exactly one letter, never two', () => {
    // Even when both teams train at the same time in the same place.
    const shared = { training: [slot('tue', '20:00', '21:30', 'Pitch 1')] };
    const out = build({ 'amateur-A': shared, 'amateur-B': shared }, { letter: 'A' });
    assert.strictEqual(out.length, 1);
    assert.deepStrictEqual(out[0].teams, ['A']);
  });

  it('gives a team with two slots on one day both of them', () => {
    const out = build({
      'amateur-A': { training: [slot('tue', '10:00', '11:30'), slot('tue', '20:00', '21:30')] },
    }, { letter: 'A' });
    assert.strictEqual(out.length, 2);
    assert.deepStrictEqual(out.map((d) => d.time).sort(), ['10:00', '20:00']);
  });

  it('carries a configured end time through', () => {
    const out = build({ 'amateur-A': { training: [slot('tue', '20:00', '21:45')] } });
    assert.strictEqual(out[0].endTime, '21:45');
  });

  it('DERIVES an end time when the schedule has none', () => {
    // The clash maths already assumed 90 minutes; leaving the field blank
    // made the UI and the arithmetic disagree about what was happening.
    const out = build({ 'amateur-A': { training: [slot('tue', '20:00')] } });
    assert.strictEqual(out[0].endTime, '21:30');
  });

  it('falls back to Tue/Thu when the team has no schedule', () => {
    const out = build({}, { letter: 'B' });
    assert.ok(out.length >= 1);
    assert.deepStrictEqual(out[0].teams, ['B']);
  });

  it('stamps every draft ready to save', () => {
    const out = build({ 'amateur-A': { training: [slot('tue', '20:00')] } });
    const d = out[0];
    assert.ok(/^tr_/.test(d.id));
    assert.strictEqual(d.category, 'amateur');
    assert.deepStrictEqual(d.guests, []);
    assert.deepStrictEqual(d.excluded, []);
    assert.ok(/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(d.date));
  });

  it('gives several drafts from one build distinct ids', () => {
    const out = build({
      'amateur-A': { training: [slot('tue', '10:00'), slot('tue', '20:00')] },
    });
    assert.strictEqual(new Set(out.map((d) => d.id)).size, out.length);
  });

  it('never proposes a session in the past', () => {
    // A season that stopped in 2020 must not cycle on from 2020.
    const out = build({ 'amateur-A': { training: [slot('tue', '20:00')] } },
        { training: [{ date: '2020-05-05', category: 'amateur' }] });
    const today = new Date().toISOString().slice(0, 10);
    assert.ok(out[0].date >= today, out[0].date);
  });
});

describe('training — the default end time', () => {
  const H = load(['A']);

  it('is 90 minutes after the start', () => {
    assert.strictEqual(H.defaultEndTime('20:00'), '21:30');
    assert.strictEqual(H.defaultEndTime('09:15'), '10:45');
  });

  it('returns nothing for an unparseable start', () => {
    assert.strictEqual(H.defaultEndTime(''), '');
    assert.strictEqual(H.defaultEndTime('evening'), '');
  });

  it('returns nothing rather than wrapping past midnight', () => {
    /* A session crossing midnight would break the same-day minute
       arithmetic the overlap check uses, so the coach picks that one. */
    assert.strictEqual(H.defaultEndTime('23:00'), '');
  });

  it('agrees with what sessionWindow already assumed', () => {
    // The number was always 90; this only makes it visible.
    const w = H.sessionWindow({ time: '20:00' });
    assert.strictEqual(H.minsToHHMM(w.end), H.defaultEndTime('20:00'));
  });
});

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
      return { _ntClashes, _ntSave,
               setDrafts: (d) => { _ntDrafts = d; _ntTeam = 'A'; },
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

/* ------------------------------------------------------------------ *
 * When a session leaves the landing page.
 *
 * The week strip kept `if (!t.date || !t.time) return true;`, so a session
 * with no time set never expired — yesterday's training sat on the player's
 * home page indefinitely. And a timed session was dropped an hour after it
 * STARTED, so a 20:00-21:30 session vanished at 21:00, half way through.
 * ------------------------------------------------------------------ */
describe('training — when a session stops showing', () => {
  const H = load(['A']);

  /** The predicate the week strip applies, over a fixed "now". */
  function shows(t, todayStr, nowMins) {
    if (!t.date) return true;
    if (t.date < todayStr) return false;
    if (t.date > todayStr) return true;
    const w = H.sessionWindow(t);
    if (!w) return true;
    return nowMins < w.end;
  }

  const TODAY = '2026-08-05';
  const at = (date, time, endTime) => ({ id: 'x', date, time, endTime });

  it('drops a session from a past date even with no time set', () => {
    // The reported bug: yesterday's training still on the landing page.
    assert.strictEqual(shows(at('2026-08-04', ''), TODAY, 12 * 60), false);
    assert.strictEqual(shows(at('2026-08-04', '20:00'), TODAY, 12 * 60), false);
  });

  it('keeps a future session whatever the time', () => {
    assert.strictEqual(shows(at('2026-08-06', ''), TODAY, 23 * 60), true);
  });

  it('keeps today\'s session until it actually ends', () => {
    const s = at(TODAY, '20:00', '21:30');
    assert.strictEqual(shows(s, TODAY, 20 * 60 + 30), true, 'mid-session');
    assert.strictEqual(shows(s, TODAY, 21 * 60), true, 'an hour in, still running');
    assert.strictEqual(shows(s, TODAY, 21 * 60 + 31), false, 'finished');
  });

  it('assumes 90 minutes when no end time is set', () => {
    const s = at(TODAY, '20:00');
    assert.strictEqual(shows(s, TODAY, 21 * 60 + 29), true);
    assert.strictEqual(shows(s, TODAY, 21 * 60 + 31), false);
  });

  it('keeps an untimed session that is TODAY', () => {
    // We cannot tell when it started, and hiding a session on the day it
    // happens is worse than leaving it up.
    assert.strictEqual(shows(at(TODAY, ''), TODAY, 23 * 60), true);
  });

  it('is the rule the week strip actually uses', () => {
    // Anchored on the week strip's own filter: `todayStr` alone also
    // appears in the readiness code, and matched there first.
    const body = grab('    training.filter(t => t.date >= start && t.date <= end)', '    }).forEach(t => {');
    assert.ok(body.includes('if (t.date < todayStr) return false;'),
        'a past date must end a session whatever its time says');
    assert.ok(body.includes('nowMins < w.end'), 'and it runs until its END');
    assert.ok(!body.includes('60 * 60 * 1000'), 'not an hour after the start');
  });
});

/* ------------------------------------------------------------------ *
 * Choosing a category with only one team.
 *
 * The auto-select lived in the render while the category-change handler
 * seeded first — so switching to Juvenil seeded with no team, produced an
 * empty draft list, and the render set the letter too late. It never
 * re-seeded either, because the guard is `if (!_ntDrafts)` and `[]` is
 * truthy. The page showed no players and Save stayed dead.
 * ------------------------------------------------------------------ */
describe('training — a category with one team needs no click', () => {
  function seeder(lettersByCat) {
    const code = grab('  function _ntSeed()', '  /** One row of the called squad');
    // eslint-disable-next-line no-new-func
    const api = new Function('getTeamLetters', 'getTrainings', 'buildTrainingDrafts', `
      let _ntCat = null, _ntTeam = null, _ntDrafts = null;
      ${code}
      return {
        seed: (cat, team) => { _ntCat = cat; _ntTeam = team || null; _ntSeed(); },
        drafts: () => _ntDrafts,
        team: () => _ntTeam,
      };`)((c) => lettersByCat[c] || ['A'], () => [],
        (cat, tr, letter) => [{ id: 'd1', category: cat, teams: [letter] }]);
    return api;
  }

  const CATS = { amateur: ['A', 'B'], juvenil: ['A'] };

  it('preselects the only letter and builds the drafts in one pass', () => {
    const s = seeder(CATS);
    s.seed('juvenil', null);
    assert.strictEqual(s.team(), 'A', 'picked without a click');
    assert.strictEqual(s.drafts().length, 1, 'and the session was built');
  });

  it('builds nothing for a multi-team category until one is chosen', () => {
    const s = seeder(CATS);
    s.seed('amateur', null);
    assert.strictEqual(s.team(), null, 'the coach must choose');
    assert.deepStrictEqual(s.drafts(), []);
  });

  it('builds once that choice is made', () => {
    const s = seeder(CATS);
    s.seed('amateur', 'B');
    assert.strictEqual(s.drafts()[0].teams[0], 'B');
  });

  it('does not overrule a letter the coach already picked', () => {
    const s = seeder({ amateur: ['A', 'B'] });
    s.seed('amateur', 'B');
    assert.strictEqual(s.team(), 'B');
  });
});
