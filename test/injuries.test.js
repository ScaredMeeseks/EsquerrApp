/* Unit tests for closing an injury.
 *
 * Pure logic, no emulator: `npm run test:injuries`.
 *
 * A coach marked an injury resolved and the player stayed red on every
 * screen except the one he did it on. Two sources of truth had to agree and
 * only one of them moved:
 *
 *  1. `fa_injuries` — the staff record, which the Medical page owns.
 *  2. the player's own training answers, where a last answer of 'injured'
 *     means injured.
 *
 * deriveFitnessStatus() reads both, but the fa_injuries branch could only
 * ever OVERRIDE the answers (active → injured, recovering → doubt). It had
 * no way to CANCEL one, so resolving the record simply removed the override
 * and let the stale self-report through unchanged.
 *
 * The fix reuses the mechanism staff already had for discarding a
 * self-report: a date up to which an 'injured' answer counts as a plain
 * absence. A resolution supplies that date, so answers from before the
 * all-clear stop counting and an injury reported AFTER it still does.
 * Deriving it from the record rather than writing a flag also means records
 * resolved before the fix existed heal themselves on next render.
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

const DATES = ['2026-05-05', '2026-05-07', '2026-05-12', '2026-05-14'];
const TRAINING = DATES.map((d, i) => ({ id: 'tr' + i, date: d, time: '20:00' }));

/** The real fitness + injury helpers over a fake localStorage. */
function load(opts) {
  const o = opts || {};
  const store = {
    fa_training: JSON.stringify(TRAINING),
    fa_training_availability: JSON.stringify(o.avail || {}),
    fa_injuries: JSON.stringify(o.injuries || []),
    fa_injury_notes: JSON.stringify(o.notes || {}),
    fa_injury_zone: JSON.stringify(o.zone || {}),
    fa_injury_dismissed: JSON.stringify(o.dismissed || {})
  };
  const localStorage = {
    getItem: (k) => (k in store ? store[k] : null),
    setItem: (k, v) => { store[k] = v; }
  };
  const getTrainings = () => JSON.parse(store.fa_training || '[]');
  let users = o.users || [{ id: 'p1', name: 'Test', fitnessStatus: 'fit', injuryNote: '' }];
  const getUsers = () => users;
  const saveUsers = (arr) => { users = arr; };
  /* The record resolver is sliced in for the same reason context.test.js
     does it: answers are looked up through readRecord(), and a stub would be
     free to drift from the real key rules. */
  const code = grab('  function recordKey(playerId, sess, kind)', '  async function handleRegister') +
    grab('  function fitnessContext()', '  function getInjuries()') +
    grab('  function getInjuries()', '  // ---------- Injury data migration ----------');
  // eslint-disable-next-line no-new-func
  const api = new Function('localStorage', 'getTrainings', 'getUsers', 'saveUsers', `
    ${code}
    return { fitnessContext, deriveFitnessStatus, getInjuries, updateInjury,
             resolveInjury, clearStaleInjuryCaches, afterInjuryChange };`)(
    localStorage, getTrainings, getUsers, saveUsers);
  return {
    ...api,
    read: (k) => JSON.parse(store[k]),
    roster: () => users,
    status: (pid) => api.deriveFitnessStatus(pid || 'p1', false).fitnessStatus
  };
}

/** Answers keyed by SESSION id, the format the app writes today. */
function answers(map) {
  const out = {};
  Object.keys(map).forEach((sid) => { out['p1_' + sid] = map[sid]; });
  return out;
}

const HURT = { id: 'i1', playerId: 'p1', status: 'active', muscleGroup: 'Hamstrings', startDate: DATES[3], endDate: null };

describe('injuries — resolving one clears the player everywhere', () => {
  it('the reported bug: resolve, and the self-report stops holding him back', () => {
    const api = load({
      avail: answers({ tr0: 'yes', tr1: 'yes', tr2: 'yes', tr3: 'injured' }),
      injuries: [HURT]
    });
    assert.strictEqual(api.status(), 'injured', 'starts injured, both ways');
    api.resolveInjury('i1');
    assert.strictEqual(api.status(), 'fit',
        'resolving the record must also stand the training answer down');
  });

  it('the record really is resolved, with an end date', () => {
    const api = load({ injuries: [HURT] });
    api.resolveInjury('i1');
    const inj = api.getInjuries()[0];
    assert.strictEqual(inj.status, 'resolved');
    assert.ok(/^\d{4}-\d{2}-\d{2}$/.test(inj.endDate), 'today, as an ISO date');
  });

  it('heals a record resolved before the fix existed — no repair pass needed', () => {
    // Nothing but the stored record: no dismissal flag was ever written.
    const api = load({
      avail: answers({ tr3: 'injured' }),
      injuries: [Object.assign({}, HURT, { status: 'resolved', endDate: '2026-05-20' })]
    });
    assert.strictEqual(api.status(), 'fit');
  });

  it('does NOT cancel an injury reported after the all-clear', () => {
    const api = load({
      avail: answers({ tr3: 'injured' }),
      injuries: [Object.assign({}, HURT, { status: 'resolved', endDate: '2026-05-10' })]
    });
    assert.strictEqual(api.status(), 'injured',
        'the answer is newer than the resolution, so it still counts');
  });

  it('does not cancel a SECOND injury that is still open', () => {
    const api = load({
      avail: answers({ tr3: 'injured' }),
      injuries: [
        Object.assign({}, HURT, { status: 'resolved', endDate: '2026-08-01' }),
        { id: 'i2', playerId: 'p1', status: 'active', muscleGroup: 'Calves', startDate: '2026-08-02' }
      ]
    });
    assert.strictEqual(api.status(), 'injured');
  });

  it('another player is untouched by the resolution', () => {
    const api = load({
      avail: { p2_tr3: 'injured' },
      injuries: [Object.assign({}, HURT, { status: 'resolved', endDate: '2026-08-01' })]
    });
    assert.strictEqual(api.status('p2'), 'injured', 'p1 record, p2 answer');
  });

  it('marking recovering is not an all-clear — it is a doubt', () => {
    const api = load({
      avail: answers({ tr0: 'yes', tr1: 'yes', tr2: 'yes', tr3: 'yes' }),
      injuries: [Object.assign({}, HURT, { status: 'recovering' })]
    });
    assert.strictEqual(api.status(), 'doubt');
  });

  it('a staff discard still works, and the later of the two dates wins', () => {
    const both = load({
      avail: answers({ tr3: 'injured' }),
      dismissed: { p1: '2026-05-01' },
      injuries: [Object.assign({}, HURT, { status: 'resolved', endDate: '2026-05-20' })]
    });
    assert.strictEqual(both.deriveFitnessStatus('p1', false).standDownUpTo, '2026-05-20');
    const dismissOnly = load({
      avail: answers({ tr3: 'injured' }), dismissed: { p1: '2026-05-20' }
    });
    assert.strictEqual(dismissOnly.status(), 'fit', 'discard alone is unchanged');
  });

  it('a resolved record with no dates at all changes nothing', () => {
    const api = load({
      avail: answers({ tr3: 'injured' }),
      injuries: [{ id: 'i1', playerId: 'p1', status: 'resolved' }]
    });
    assert.strictEqual(api.status(), 'injured', 'no date, no stand-down');
  });
});

describe('injuries — the legacy per-player caches', () => {
  /* fa_injury_notes / fa_injury_zone predate fa_injuries and are read by
     surfaces that know nothing about it (the status tooltips, the medical
     hover body map). They were written on log and never deleted. */
  it('are dropped once the player has no open injury left', () => {
    const api = load({
      injuries: [Object.assign({}, HURT, { status: 'resolved', endDate: '2026-05-20' })],
      notes: { p1: 'Hamstrings – pulled', p2: 'Calves' },
      zone: { p1: 3, p2: 5 }
    });
    api.clearStaleInjuryCaches('p1');
    assert.deepStrictEqual(api.read('fa_injury_notes'), { p2: 'Calves' });
    assert.deepStrictEqual(api.read('fa_injury_zone'), { p2: 5 });
  });

  it('are KEPT while another injury is still open — it owns them', () => {
    const api = load({
      injuries: [
        Object.assign({}, HURT, { status: 'resolved', endDate: '2026-05-20' }),
        { id: 'i2', playerId: 'p1', status: 'active', muscleGroup: 'Calves' }
      ],
      notes: { p1: 'Calves' }, zone: { p1: 7 }
    });
    api.clearStaleInjuryCaches('p1');
    assert.deepStrictEqual(api.read('fa_injury_notes'), { p1: 'Calves' });
    assert.deepStrictEqual(api.read('fa_injury_zone'), { p1: 7 });
  });

  it('afterInjuryChange clears them and writes the roster status back', () => {
    const api = load({
      avail: answers({ tr3: 'injured' }),
      injuries: [Object.assign({}, HURT, { status: 'resolved', endDate: '2026-05-20' })],
      notes: { p1: 'Hamstrings' }, zone: { p1: 3 },
      users: [{ id: 'p1', name: 'Test', fitnessStatus: 'injured', injuryNote: 'Hamstrings' }]
    });
    api.afterInjuryChange('p1');
    assert.deepStrictEqual(api.read('fa_injury_notes'), {});
    assert.strictEqual(api.roster()[0].fitnessStatus, 'fit');
    assert.strictEqual(api.roster()[0].injuryNote, '');
  });

  it('shrugs off a call with no player', () => {
    const api = load({});
    assert.doesNotThrow(() => api.afterInjuryChange(''));
  });
});
