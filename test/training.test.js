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
             sessionWindow, sessionEndsAt, matchEndsAt, sessionMinutes,
             trainingsOverlap,
             hhmmToMins, minsToHHMM,
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
    /* The REAL scheduleSlots from utils.js, not a stub. It is the one
       definition of "what does this team do on a normal week", shared with
       the calendar's greyed placeholders — a stub here would let the two
       drift and these tests would go on passing while a placeholder created
       a session on a different day than it advertised. */
    // eslint-disable-next-line no-new-func
    const fn = new Function('_clubConfig', 'getTeamLetters', 'tDay',
        'hhmmToMins', 'minsToHHMM', 'DEFAULT_SESSION_MINS', 'defaultEndTime',
        'scheduleSlots', `
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
        },
        require('../js/utils.js').scheduleSlots);
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
      grab('  function hhmmToMins(v)', '  async function handleRegister');
    const head = grab('  let _ntDrafts = null;', '  function renderTrainingNew()');
    // From the extracted helpers, not just _ntSave: the clash resolution,
    // the attending override and the persist wrapper all live above it now,
    // and _ntSave delegates to them.
    const save = grab('  function _ntResolveClashes(sess, list)', '  // #endregion New Training');
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
 * The end of an activity as an absolute instant.
 *
 * sessionWindow answers in minutes-past-midnight, which is fine for the
 * clash maths and for a same-day strip but cannot compare across dates —
 * and the two surfaces that needed it (the staff week list and the staff
 * badge) both span days. sessionEndsAt is the Date form.
 * ------------------------------------------------------------------ */
describe('training — when an activity ends, as a real instant', () => {
  const H = load(['A']);
  const iso = (d) => d && d.toISOString();
  const local = (s) => new Date(s).toISOString();

  it('uses the endTime the coach set', () => {
    assert.strictEqual(
        iso(H.sessionEndsAt({ date: '2026-08-21', time: '11:30', endTime: '12:00' })),
        local('2026-08-21T12:00:00'));
  });

  it('falls back to 90 minutes with no endTime', () => {
    assert.strictEqual(
        iso(H.sessionEndsAt({ date: '2026-08-21', time: '11:30' })),
        local('2026-08-21T13:00:00'));
  });

  it('takes an explicit fallback without touching a real endTime', () => {
    // What the staff badge does: two hours of grace for an untimed
    // session, none at all for one that says when it finishes.
    assert.strictEqual(
        iso(H.sessionEndsAt({ date: '2026-08-21', time: '11:30' }, 120)),
        local('2026-08-21T13:30:00'));
    assert.strictEqual(
        iso(H.sessionEndsAt({ date: '2026-08-21', time: '11:30', endTime: '12:00' }, 120)),
        local('2026-08-21T12:00:00'));
  });

  it('crosses midnight instead of producing an Invalid Date', () => {
    /* 23:30 + 90 min is "25:00", which minsToHHMM refuses and which every
       date parser turns into NaN -- and a NaN comparison answers `false`,
       so the session would have been treated as never over. */
    const end = H.sessionEndsAt({ date: '2026-08-21', time: '23:30' });
    assert.ok(end && !isNaN(end.getTime()));
    assert.strictEqual(iso(end), local('2026-08-22T01:00:00'));
  });

  it('honours a legacy "HH:MM - HH:MM" range', () => {
    assert.strictEqual(
        iso(H.sessionEndsAt({ date: '2026-08-21', time: '20:00 - 21:30' })),
        local('2026-08-21T21:30:00'));
  });

  it('is null when the session cannot be timed at all', () => {
    assert.strictEqual(H.sessionEndsAt({ date: '2026-08-21', time: '' }), null);
    assert.strictEqual(H.sessionEndsAt({ time: '20:00' }), null);
    assert.strictEqual(H.sessionEndsAt(null), null);
  });

  it('gives a match two hours from kick-off', () => {
    /* Matches have no endTime field and never have had one. Two hours, not
       90 + half time: added time is not optional and a match that ran long
       was being called finished mid-play. */
    assert.strictEqual(
        iso(H.matchEndsAt({ date: '2026-08-22', time: '18:00' })),
        local('2026-08-22T20:00:00'));
    assert.strictEqual(H.matchEndsAt({ date: '2026-08-22' }), null);
  });
});

/* ------------------------------------------------------------------ *
 * The staff list's badge, and the coach's landing page.
 *
 * The badge was a flat start + 2h that ignored endTime entirely, so an
 * 11:30-12:00 session read "En curs" until 13:30. The coach's week list
 * filtered on the DATE alone, so Thursday's finished session sat on the
 * landing page until Sunday night.
 * ------------------------------------------------------------------ */
describe('training — the staff badge and the coach\'s week', () => {
  it('the badge ends at the endTime, falling back to two hours', () => {
    /* Moved out of the staff list and into the calendar region when the
       list was replaced by the month grid — it is the one piece of that
       page a cell still needs, so a session in progress can say so. */
    const body = grab('  function computeStatus(tr) {', '\n  function calMdBadge');
    assert.ok(body.includes('sessionEndsAt(tr, BADGE_FALLBACK_MINS)'),
        'the badge must read the endTime the coach set');
    assert.ok(!body.includes('2 * 60 * 60 * 1000'),
        'the flat two hours was the bug, not the rule');
    assert.strictEqual(
        /var BADGE_FALLBACK_MINS = (\d+);/.exec(src)[1], '120',
        'a session with no endTime keeps the behaviour it always had');
  });

  it('the coach\'s week drops what has finished', () => {
    const body = grab(
        '    training.filter(tr => tr.date >= start && tr.date <= end)',
        '        .forEach(tr => {');
    assert.ok(body.includes('sessionEndsAt(tr)'),
        'the date alone kept Thursday\'s session up until Sunday');
    assert.ok(body.includes('return !done || now < done;'),
        'a session we cannot time stays, rather than vanishing');
  });

  it('the coach\'s week keeps a match until FULL TIME, not kick-off', () => {
    const body = grab(
        '    matches.filter(m => m.date >= start && m.date <= end)',
        '        .forEach(m => {');
    assert.ok(body.includes('matchEndsAt(m)'));
    assert.ok(!body.includes('> now'), 'kick-off is not full time');
  });

  it('the PLAYER\'s week does the same — both pages agree now', () => {
    /* This one dropped a fixture the moment it started: 18:00 on the
       calendar meant gone from the strip at 18:00, mid-match. */
    const body = grab(
        '    matches.filter(m => m.date >= start && m.date <= end).filter(m => {',
        '    }).forEach(m => {');
    assert.ok(body.includes('matchEndsAt(m)'));
    assert.ok(!/> now/.test(body), 'kick-off is not full time');
  });

  it('a match gets two hours, and both files say so', () => {
    /* Added time is not optional. The number lives in TWO files —
       functions/ deploys on its own and cannot require ../js — so a change
       to one and not the other would push players for an RPE before the
       app offered the form. reminders.test.js pins the server's copy to
       its own behaviour; this pins the two constants to each other. */
    const client = /var DEFAULT_MATCH_MINS = (\d+);/.exec(src);
    const server = /const DEFAULT_MATCH_MINS = (\d+);/.exec(
        fs.readFileSync(path.join(__dirname, '..', 'functions', 'index.js'), 'utf8'));
    assert.ok(client && server, 'DEFAULT_MATCH_MINS is gone from one side');
    assert.strictEqual(client[1], '120');
    assert.strictEqual(client[1], server[1]);
  });

  it('a session\'s fallback is 90 in both files too', () => {
    const client = /var DEFAULT_SESSION_MINS = (\d+);/.exec(src);
    const server = /const DEFAULT_SESSION_MINS = (\d+);/.exec(
        fs.readFileSync(path.join(__dirname, '..', 'functions', 'index.js'), 'utf8'));
    assert.ok(client && server);
    assert.strictEqual(client[1], server[1]);
  });

  it('the pending-RPE list agrees with the server\'s trigger', () => {
    /* The push now arrives at the session's end. If the app still waited
       start + 90 min to offer the form, a 30-minute session would be
       chased an hour before there was anywhere to answer. */
    const body = grab('    const completedTraining = training.filter(t => {',
        '    const pt = completedTraining.filter(t => {');
    assert.ok(body.includes('sessionEndsAt(t)'));
    assert.ok(!body.includes('90 * 60 * 1000'));
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
    /* `_ntDate` is the calendar's doing: clicking an empty Tuesday opens
       this page ON that Tuesday instead of on the next session in the
       cycle. Null here, so these keep testing the cycling path they were
       written for; `_ntDraftsOn` has its own case below. */
    // eslint-disable-next-line no-new-func
    const api = new Function('getTeamLetters', 'getTrainings', 'buildTrainingDrafts',
        '_ntDraftsOn', `
      let _ntCat = null, _ntTeam = null, _ntDrafts = null, _ntDate = null;
      ${code}
      return {
        seed: (cat, team, date) => {
          _ntCat = cat; _ntTeam = team || null; _ntDate = date || null; _ntSeed();
        },
        drafts: () => _ntDrafts,
        team: () => _ntTeam,
      };`)((c) => lettersByCat[c] || ['A'], () => [],
        (cat, tr, letter) => [{ id: 'd1', category: cat, teams: [letter] }],
        (cat, letter, date) => [{ id: 'on', category: cat, teams: [letter], date }]);
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

  it('takes the calendar\'s day when there is one, not the next in the cycle', () => {
    // Clicking an empty Tuesday means THAT Tuesday. Proposing next week's
    // session instead would silently ignore where the coach clicked.
    const s = seeder({ juvenil: ['A'] });
    s.seed('juvenil', null, '2026-03-04');
    assert.strictEqual(s.drafts()[0].id, 'on');
    assert.strictEqual(s.drafts()[0].date, '2026-03-04');
  });

  it('still cycles when opened any other way', () => {
    const s = seeder({ juvenil: ['A'] });
    s.seed('juvenil', null);
    assert.strictEqual(s.drafts()[0].id, 'd1');
  });
});

/* ------------------------------------------------------------------ *
 * The drafts for a day the coach picked on the calendar.
 * ------------------------------------------------------------------ */
describe('training — drafts for a chosen day', () => {
  function on(schedules, cat, letter, date) {
    const code = grab('  function _ntDraftsOn(cat, letter, date)', '\n  /** Rebuild the drafts');
    // eslint-disable-next-line no-new-func
    return new Function('_clubConfig', 'scheduleSlots', 'trainingFromSlot', `
      ${code}
      return _ntDraftsOn;`)({ schedules },
        require('../js/utils.js').scheduleSlots,
        (c, l, d, slot, i) => ({ category: c, teams: [l], date: d, time: slot.time, i }))
        (cat, letter, date);
  }

  const SCHED = {
    'amateur-A': { training: [
      { day: 'tue', time: '21:00' },
      { day: 'tue', time: '09:00' },
      { day: 'thu', time: '21:00' },
    ] },
  };

  it('gives EVERY slot the squad has that weekday', () => {
    // 3 March 2026 is a Tuesday, and this squad trains twice on Tuesdays.
    const d = on(SCHED, 'amateur', 'A', '2026-03-03');
    assert.deepStrictEqual(d.map((x) => x.time), ['09:00', '21:00']);
    assert.ok(d.every((x) => x.date === '2026-03-03'));
  });

  it('gives ONE blank draft for a day the squad does not normally train', () => {
    /* A coach clicking a Sunday means a Sunday session. "We do not train
       then" is true and useless, and an empty page would read as broken. */
    const d = on(SCHED, 'amateur', 'A', '2026-03-08');
    assert.strictEqual(d.length, 1);
    assert.strictEqual(d[0].time, '');
    assert.strictEqual(d[0].date, '2026-03-08');
  });

  it('reads the squad\'s OWN schedule', () => {
    // B has none configured, so it falls through to the Tue/Thu default —
    // and must not inherit A's 09:00 slot.
    const d = on(SCHED, 'amateur', 'B', '2026-03-03');
    assert.deepStrictEqual(d.map((x) => x.time), ['21:00']);
  });
});

/* ------------------------------------------------------------------ *
 * Editing a session that has already been saved.
 *
 * The coach can change the squad until the session STARTS — looser than
 * `isTrainingLocked`, which freezes attendance answers an hour earlier. A
 * late call-up is exactly when this is needed, and the player is marked
 * attending on the way in so the frozen answer does not matter.
 *
 * _ntPersistSession exists because getTrainings() re-parses the blob and
 * hands back FRESH objects on every call. Mutating a row fetched separately
 * writes to a throwaway copy — the bug a v73 test caught, which must not
 * come back through a second door.
 * ------------------------------------------------------------------ */
describe('training — editing a saved session', () => {
  function load(existing, users) {
    const store = {
      fa_training: JSON.stringify(existing),
      fa_training_staff_override: '{}',
    };
    const localStorage = {
      getItem: (k) => (k in store ? store[k] : null),
      setItem: (k, v) => { store[k] = v; },
    };
    const helpers = grab('  var DEFAULT_SESSION_MINS = 90;', '  function getTrainings()') +
      grab('  function hhmmToMins(v)', '  async function handleRegister');
    const head = grab('  let _ntDrafts = null;', '  function renderTrainingNew()');
    const save = grab('  function _ntResolveClashes(sess, list)', '  // #endregion New Training');
    // eslint-disable-next-line no-new-func
    const api = new Function('localStorage', 'getUsers', 'getTrainings',
        'getTeamLetters', 'getCurrentCategory', 'buildTrainingDrafts',
        'renderPage', 'getSession', '_showPushToast', 't', `
      let currentPage = '';
      ${helpers}
      ${head}
      ${save}
      return { _ntPersistSession, _ntMarkAttending, _ntResolveClashes };`)(
        localStorage, () => users, () => JSON.parse(store.fa_training),
        () => ['A', 'B'], () => 'amateur', () => [], () => {}, () => ({}),
        () => {}, (k) => k);
    return { api, store, overrides: () => JSON.parse(store.fa_training_staff_override) };
  }

  const P = (id, team) => ({ id, category: 'amateur', team, roles: ['player'] });
  const users = [P('a1', 'A'), P('b1', 'B')];
  const S = (over) => Object.assign(
      { id: 'tr_x', date: '2026-09-01', time: '20:00', endTime: '21:30',
        category: 'amateur', teams: ['A'], guests: [], excluded: [] }, over);

  it('persists a mutation to the row it actually writes', () => {
    // The whole point of the helper: a row fetched separately is a copy.
    const { api, store } = load([S({ id: 'tr_a' })], users);
    api._ntPersistSession('tr_a', (row) => { row.excluded.push('a1'); });
    assert.deepStrictEqual(
        JSON.parse(store.fa_training).find((x) => x.id === 'tr_a').excluded, ['a1']);
  });

  it('returns the saved row so the caller can key an override off it', () => {
    const { api } = load([S({ id: 'tr_a' })], users);
    const row = api._ntPersistSession('tr_a', () => {});
    assert.strictEqual(row.id, 'tr_a');
  });

  it('does nothing for a session that is not there', () => {
    const { api, store } = load([S({ id: 'tr_a' })], users);
    const before = store.fa_training;
    assert.strictEqual(api._ntPersistSession('nope', () => {}), null);
    assert.strictEqual(store.fa_training, before, 'no write at all');
  });

  it('marks an added player as attending, through the staff override', () => {
    // Not a forged answer under the player's own key -- the override is the
    // mechanism that already means "staff says he is attending".
    const { api, overrides } = load([S({ id: 'tr_a' })], users);
    api._ntMarkAttending(S({ id: 'tr_a' }), ['b1'], true);
    assert.strictEqual(overrides()['b1_tr_a'], 'yes');
  });

  it('clears the override when the player is dropped again', () => {
    const { api, overrides } = load([S({ id: 'tr_a' })], users);
    api._ntMarkAttending(S({ id: 'tr_a' }), ['b1'], true);
    api._ntMarkAttending(S({ id: 'tr_a' }), ['b1'], false);
    assert.strictEqual(overrides()['b1_tr_a'], undefined, 'no stale override');
  });

  it('writes nothing for an empty add', () => {
    const { api, overrides } = load([S({ id: 'tr_a' })], users);
    api._ntMarkAttending(S({ id: 'tr_a' }), [], true);
    assert.deepStrictEqual(overrides(), {});
  });

  it('resolves a clash against the array being written', () => {
    const { api, store } = load(
        [S({ id: 'tr_a', teams: ['A'] }), S({ id: 'tr_b', teams: ['B'], guests: ['a1'] })],
        users);
    api._ntPersistSession('tr_b', (row, list) => {
      const moved = api._ntResolveClashes(row, list);
      assert.strictEqual(moved, 1);
    });
    const old = JSON.parse(store.fa_training).find((x) => x.id === 'tr_a');
    assert.deepStrictEqual(old.excluded, ['a1'], 'removed from the overlapping session');
  });

  it('the edit controls are gated on the session not having started', () => {
    const body = grab('    const squadEditable =', '    const dateFormatted');
    assert.ok(body.includes('new Date() <'), 'editable only before the start');
    const page = grab('  function renderStaffTrainingDetail()', '  // ── Team generation');
    assert.ok(page.includes('squadEditable ?'), 'the add button is gated');
    assert.ok(page.includes('std-drop'), 'and so is the per-row remove');
  });

  /* An ACTIVITY opens this same page. It is a fa_training row, so the
     attendance table below is exactly what it needs — but it has no focus,
     no tactical board and no two teams to split into, and those sections
     rendered empty rather than left out is what "it works" looked like
     before this. Source-level, like the sub-role tests: the rule is about
     which branches are gated, and there is no jsdom to render into. */
  describe('an activity on the session detail page', () => {
    const page = grab('  function renderStaffTrainingDetail()', '  // ── Team generation');
    const code = page.replace(/\/\*[\s\S]*?\*\//g, '')
        .split('\n').map((l) => l.replace(/\/\/.*$/, '')).join('\n');

    it('knows which kind of row it is showing', () => {
      assert.ok(/const isAct = isActivity\(tr\)/.test(code));
    });

    it('shows the activity\'s TITLE where a session shows its focus', () => {
      assert.ok(code.includes('activityTitleOf(tr,'),
          'the bold line must read the right field for the kind');
      assert.ok(!/detail-title">\$\{sanitize\(tr\.focus\)\}/.test(code),
          'the raw focus is blank on an activity');
    });

    it('leaves out the four training-only sections', () => {
      assert.ok(/isAct \? '' : renderStdPlanPanel\(/.test(code),
          'the session plan is not gated');
      assert.ok(/isAct \? '' : renderStdMaterialCard\(/.test(code),
          'the material card is not gated');
      assert.ok(code.includes('${(ro || isAct) ? \'\' : `'),
          'the team generator is not gated');
      assert.ok(code.includes('${isAct ? \'\' : (() => {'),
          'the boards section is not gated');
    });

    it('offers the dialog it was created in', () => {
      assert.ok(code.includes('std-edit-activity'));
      // And only to someone who may write. `ro` is the page's own gate.
      assert.ok(/isAct && !ro/.test(code));
    });

    it('goes BACK to the calendar, which is the only way in now', () => {
      assert.ok(code.includes("backTarget('calendar')"));
    });
  });
});

/* ────────────────────────────────────────────────────────────────────────
 * The date field of a draft session.
 *
 * The seeded date is a SUGGESTION -- the next slot on the team's own
 * schedule -- and the coach must be able to move it anywhere, otherwise a
 * one-off session on a day the team does not normally train cannot be
 * created at all.
 *
 * The bindings used to wire `input` on every text field EXCEPT
 * `.md-datepicker`, and the date input is `readonly`, so `change` never
 * fired for it either: the picked day was displayed and then dropped, and
 * Save wrote back the seeded weekday.
 * ──────────────────────────────────────────────────────────────────────── */
describe('new-session date field', () => {
  const DAYS = ['Diumenge', 'Dilluns', 'Dimarts', 'Dimecres', 'Dijous',
    'Divendres', 'Dissabte'];

  function fakeEl(o) {
    return {
      tagName: o.tagName || 'INPUT',
      type: o.type || 'text',
      value: o.value || '',
      dataset: o.dataset || {},
      classList: { contains: (c) => (o.classes || []).indexOf(c) !== -1 },
      _h: {},
      addEventListener(ev, fn) { (this._h[ev] = this._h[ev] || []).push(fn); },
      dispatchEvent(ev) { (this._h[ev.type] || []).forEach((fn) => fn(ev)); }
    };
  }

  /** Run the real binding block from bindTrainingNew over fake fields. */
  function bind(els, drafts) {
    const code = grab('    // Field edits write straight to the draft',
        "\n    $$('[data-nt-drop]')");
    let renders = 0;
    // eslint-disable-next-line no-new-func
    new Function('$$', '_ntDrafts', 'tDay', 'rerender', code)(
        () => els, drafts, (i) => DAYS[i], () => { renders++; });
    return () => renders;
  }

  /** What renderDP() does to the input it was opened on. */
  function pick(el, iso) {
    el.dataset.dateIso = iso;
    el.value = iso.split('-').reverse().join('/');
    el.dispatchEvent({ type: 'input' });
  }

  function dateField() {
    return fakeEl({
      classes: ['nt-f', 'md-datepicker'],
      dataset: { ntF: 'date', ntI: '0', dateIso: '2026-08-25' },
      value: '25/08/2026'
    });
  }

  it('a picked date reaches the draft', () => {
    // 2026-08-27 is a Thursday; the seed proposed Tuesday the 25th.
    const draft = { date: '2026-08-25', day: 'Dimarts' };
    const el = dateField();
    bind([el], [draft]);
    pick(el, '2026-08-27');
    assert.strictEqual(draft.date, '2026-08-27', 'the picker is not ignored');
    assert.strictEqual(draft.day, 'Dijous', 'and the day label follows it');
  });

  it('re-renders after a date change, so the clash warnings match it', () => {
    const el = dateField();
    const renders = bind([el], [{ date: '2026-08-25', day: 'Dimarts' }]);
    pick(el, '2026-08-27');
    assert.strictEqual(renders(), 1);
  });

  it('does NOT re-render while an ordinary text field is typed into', () => {
    // Re-rendering per keystroke would blow away the field being typed in.
    const draft = { date: '2026-08-25', focus: '' };
    const el = fakeEl({
      classes: ['nt-f'], dataset: { ntF: 'focus', ntI: '0' }, value: 'Pressing'
    });
    const renders = bind([el], [draft]);
    el.dispatchEvent({ type: 'input' });
    assert.strictEqual(draft.focus, 'Pressing', 'still committed');
    assert.strictEqual(renders(), 0, 'but silently');
  });

  it('the picker signals with `input`, which is why the binding must take it',
      () => {
        const dp = grab('  function renderDP()', '  function getWeekBounds');
        assert.ok(dp.includes("new Event('input'"),
            'renderDP dispatches input, not change');
        assert.ok(dp.includes('dpInput.dataset.dateIso = iso'),
            'and the ISO date lives in the dataset, not the visible value');
      });
});

/* ------------------------------------------------------------------ *
 * The RPE form's Minutes box.
 *
 * It was blank and capped at a flat 300 for everything. Three problems:
 * a player retyped a number the club already knew, a mistyped match
 * length sailed through as 300 (ten times a real session, and it skews
 * the load charts for the rest of the season), and nothing distinguished
 * "played nothing" from "no line-up was ever recorded".
 * ------------------------------------------------------------------ */
describe('training — the RPE form defaults', () => {
  const H = load(['A']);

  it('a session\'s length comes from its own endTime', () => {
    assert.strictEqual(
        H.sessionMinutes({ date: '2026-08-21', time: '11:30', endTime: '12:00' }), 30);
    assert.strictEqual(
        H.sessionMinutes({ date: '2026-08-21', time: '20:00', endTime: '21:30' }), 90);
  });

  it('falls back to 90 when no endTime is set', () => {
    assert.strictEqual(H.sessionMinutes({ date: '2026-08-21', time: '20:00' }), 90);
  });

  it('is null when the session cannot be timed, so the box stays blank', () => {
    assert.strictEqual(H.sessionMinutes({ date: '2026-08-21', time: '' }), null);
    assert.strictEqual(H.sessionMinutes(null), null);
  });

  it('the training card is pre-filled with that length', () => {
    const body = grab('    pendingTraining.forEach(tr => {', '    pendingMatches.forEach(m => {');
    assert.ok(body.includes('const trMins = sessionMinutes(tr);'));
    assert.ok(body.includes("value=\"${trMins == null ? '' : trMins}\""),
        'null must render an empty box, not the string "null"');
  });

  it('the match card is pre-filled from the recorded minutes', () => {
    const body = grab('    pendingMatches.forEach(m => {', '    // Availability cards for matches');
    assert.ok(body.includes('playerMatchMinutesKnown(session.id, m.id)'),
        'the club records substitutions; the player should not retype them');
    assert.ok(body.includes("value=\"${mMins == null ? '' : mMins}\""));
  });

  it('a match caps at 100 minutes, a training does not', () => {
    const capMatch = /var MATCH_MINUTES_MAX = (\d+);/.exec(src);
    const capAny = /var ACTION_MINUTES_MAX = (\d+);/.exec(src);
    assert.ok(capMatch && capAny);
    assert.strictEqual(capMatch[1], '100', '90 plus added time');
    assert.strictEqual(capAny[1], '300');
    const matchCard = grab('    pendingMatches.forEach(m => {', '    // Availability cards for matches');
    assert.ok(matchCard.includes('data-max="${MATCH_MINUTES_MAX}"'));
  });

  it('the cap is enforced at SUBMIT, not only while typing', () => {
    /* A pre-filled value fires no `input` event, and neither does an
       autofill, so the keystroke clamp cannot be the only check. */
    const body = grab('    $$(\'.action-submit\').forEach(btn => {', '        const key = card.dataset.actionKey;');
    assert.ok(body.includes('minutes > minCap'));
    assert.ok(body.includes('Number(minInput.dataset.max) || ACTION_MINUTES_MAX'));
  });

  it('the keystroke clamp reads the card\'s own ceiling', () => {
    const body = grab('    $$(\'.action-minutes\').forEach(inp => {', '    // Player actions: clamp RPE inputs');
    assert.ok(body.includes('Number(inp.dataset.max) || ACTION_MINUTES_MAX'));
    assert.ok(!body.includes('> 300'), 'the flat 300 was the bug');
  });
});
