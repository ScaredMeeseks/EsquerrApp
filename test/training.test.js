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

describe('training — the generator keeps every team\'s slot', () => {
  const gen = grab('      var slots = []; // [{ jsDay, time, endTime, location, link, teams: [] }]',
      '      // Sort slots by JS day');

  it('merges identical slots by unioning their letters, never dropping one', () => {
    assert.ok(gen.includes('same.teams.push(letter)'),
        'a shared slot must carry BOTH letters');
    assert.ok(!/Avoid duplicate day\+time/.test(gen),
        'the old dedup discarded the second letter entirely');
  });

  it('treats a different end time or place as a different slot', () => {
    // A and B on the same evening at different times are two sessions.
    assert.ok(gen.includes("s.endTime === (tr.endTime || '')"));
    assert.ok(gen.includes("s.location === (tr.location || '')"));
  });

  it('creates one session per slot on the day, not just the first', () => {
    const tail = grab('      var matched = slots.filter(', '      training.sort(');
    assert.ok(tail.includes('matched.forEach('), 'a `find` here dropped B entirely');
    assert.ok(tail.includes('teams: (slot.teams || []).slice()'), 'stamped with its letters');
  });
});
