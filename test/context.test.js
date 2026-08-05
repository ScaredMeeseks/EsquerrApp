/* Unit tests for the optional-context optimisation.
 *
 * Pure logic, no emulator: `npm run test:context`.
 *
 * Three helpers — getEffectiveAnswer(), deriveFitnessStatus() and
 * computePlayerMatchStats() — re-parsed their localStorage blobs on every
 * call, and every one of them is called once per player. The roster ran
 * ~1,050 parses per render on a 25-player squad.
 *
 * Each now takes an OPTIONAL context that callers build once per loop. The
 * whole optimisation rests on one property: passing a context must never
 * change the answer. That is what these tests pin. A speed-up that quietly
 * alters a fitness status would be far worse than the slowness it replaced.
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

/** deriveFitnessStatus with saveResult=false is self-contained: its only
 *  outside dependency (getUsers/saveUsers) sits in the save branch.
 *
 *  getTrainings() is injected rather than sliced: it is the one reader for
 *  fa_training, and it self-heals missing session ids, which is behaviour
 *  this file has no business exercising. The stub just returns the blob. */
function loadFitness(store) {
  const localStorage = { getItem: (k) => (k in store ? store[k] : null) };
  const getTrainings = () => JSON.parse(store.fa_training || '[]');
  const code = grab('  function fitnessContext()', '  function getInjuries()');
  // eslint-disable-next-line no-new-func
  return new Function('localStorage', 'getTrainings', `
    ${code}
    return { fitnessContext, deriveFitnessStatus };`)(localStorage, getTrainings);
}

const DATES = ['2026-05-05', '2026-05-07', '2026-05-12', '2026-05-14'];
const training = DATES.map((d, i) => ({ id: 'tr' + i, date: d, time: '20:00' }));

/** Every interesting shape the fitness rules distinguish. */
const CASES = {
  'fit — all present': { avail: { yes: DATES }, injuries: [] },
  'injured — last answer injured': { avail: { yes: DATES.slice(0, 3), injured: [DATES[3]] }, injuries: [] },
  'doubt — injured then back': { avail: { injured: [DATES[2]], yes: [DATES[3]] }, injuries: [] },
  'injured — active injury logged': { avail: { yes: DATES }, injuries: [{ playerId: 'p1', status: 'active', muscleGroup: 'Hamstrings', muscleSub: 'Biceps Femoris', description: 'pulled' }] },
  'doubt — recovering injury logged': { avail: { yes: DATES }, injuries: [{ playerId: 'p1', status: 'recovering', muscleGroup: 'Calves' }] },
  'resolved injury does not count': { avail: { yes: DATES }, injuries: [{ playerId: 'p1', status: 'resolved', muscleGroup: 'Calves' }] },
  'no answers at all': { avail: {}, injuries: [] },
};

function buildStore(spec, dismissed) {
  const avail = {};
  Object.keys(spec.avail).forEach((v) => spec.avail[v].forEach((d) => { avail['p1_' + d] = v; }));
  return {
    fa_training_availability: JSON.stringify(avail),
    fa_training: JSON.stringify(training),
    fa_injury_notes: JSON.stringify({ p1: 'a note' }),
    fa_injury_dismissed: JSON.stringify(dismissed || {}),
    fa_injuries: JSON.stringify(spec.injuries),
  };
}

describe('app.js — deriveFitnessStatus with and without a context', () => {
  Object.keys(CASES).forEach((label) => {
    it(`agrees for: ${label}`, () => {
      const api = loadFitness(buildStore(CASES[label]));
      const ctx = api.fitnessContext();
      assert.deepStrictEqual(
          api.deriveFitnessStatus('p1', false, ctx),
          api.deriveFitnessStatus('p1', false));
    });
  });

  it('agrees when a self-reported injury has been discarded by staff', () => {
    const spec = { avail: { injured: [DATES[3]] }, injuries: [] };
    const api = loadFitness(buildStore(spec, { p1: DATES[3] }));
    const ctx = api.fitnessContext();
    const withCtx = api.deriveFitnessStatus('p1', false, ctx);
    assert.deepStrictEqual(withCtx, api.deriveFitnessStatus('p1', false));
    // A discarded report must not leave the player flagged.
    assert.strictEqual(withCtx.fitnessStatus, 'fit');
  });

  it('a shared context is not corrupted by deriving for many players', () => {
    // deriveFitnessStatus sorts, but on a .filter() result. If it ever sorted
    // the context's own array, the second player would see reordered data.
    const api = loadFitness(buildStore(CASES['fit — all present']));
    const ctx = api.fitnessContext();
    const before = JSON.stringify(ctx);
    ['p1', 'p2', 'p3'].forEach((p) => api.deriveFitnessStatus(p, false, ctx));
    assert.strictEqual(JSON.stringify(ctx), before, 'context was mutated');
  });
});

describe('app.js — context builders', () => {
  function loadBuilders(store) {
    const localStorage = { getItem: (k) => (k in store ? store[k] : null) };
    const code = grab('  function matchStatsContext()', '  /** `ctx` is optional — pass matchStatsContext()');
    // eslint-disable-next-line no-new-func
    return new Function('localStorage', `${code}\nreturn { matchStatsContext };`)(localStorage);
  }

  it('matchStatsContext reads exactly the blobs the helper used to read', () => {
    const store = {
      fa_matches: JSON.stringify([{ id: 1, date: '2026-05-05' }]),
      fa_match_events: JSON.stringify({ 1: [{ type: 'goal' }] }),
      fa_convocatoria_sent: JSON.stringify({ 1: { players: ['p1'], startingXI: ['p1'] } }),
    };
    const ctx = loadBuilders(store).matchStatsContext();
    assert.deepStrictEqual(ctx.matches, JSON.parse(store.fa_matches));
    assert.deepStrictEqual(ctx.allEvents, JSON.parse(store.fa_match_events));
    assert.deepStrictEqual(ctx.sentData, JSON.parse(store.fa_convocatoria_sent));
  });

  it('falls back to empty structures when nothing is stored', () => {
    const ctx = loadBuilders({}).matchStatsContext();
    assert.deepStrictEqual(ctx.matches, []);
    assert.deepStrictEqual(ctx.allEvents, {});
    assert.deepStrictEqual(ctx.sentData, {});
  });
});

/* ------------------------------------------------------------------ *
 * The category filter — "Totes" has to mean something.
 *
 * `_viewCategory` carries three states in one variable and two of them
 * used to share a value:
 *
 *     null   never chosen   → fall back to the session's default category
 *     ''     pressed Totes  → every visible category
 *     'x'    pressed x      → just x
 *
 * When null and '' were both '', the "explicit Totes" branch was falsy and
 * execution fell through to the session default. membershipFrom() stamps
 * that default on every staff member "for the UI's default view", so for a
 * lead — or any coach on two categories — the button could never do
 * anything. It did not even light up, because renderCategoryBar marks it
 * active on `!cur`.
 *
 * These tests pin the ORDER of the branches, which is the whole fix.
 * ------------------------------------------------------------------ */
describe('category filter — getCurrentCategory', () => {
  const code = grab('  function getCurrentCategory()', '\n  function renderCategoryBar');

  /** @param view the _viewCategory sentinel  @param visible allowed cats */
  const current = (view, visible, session) =>
    // eslint-disable-next-line no-new-func
    new Function('_viewCategory', 'getVisibleCategories', 'getSession',
        `${code}\nreturn getCurrentCategory();`)(
        view, () => visible, () => session);

  const lead = { category: 'amateur', isTeamLead: true };

  it('Totes beats the session default — the reported bug', () => {
    assert.strictEqual(current(null, ['amateur', 'juvenil'], lead), 'amateur',
        'unset still lands on the default category');
    assert.strictEqual(current('', ['amateur', 'juvenil'], lead), '',
        'pressing Totes must widen the view, not snap back to amateur');
  });

  it('an explicit category still wins', () => {
    assert.strictEqual(current('juvenil', ['amateur', 'juvenil'], lead), 'juvenil');
  });

  it('one visible category outranks everything', () => {
    // Nothing to choose: "all" and "that one" are the same answer, and the
    // bar is not even rendered. Scoping must not be widened by a stale ''.
    assert.strictEqual(current('', ['amateur'], lead), 'amateur');
    assert.strictEqual(current(null, ['amateur'], lead), 'amateur');
    assert.strictEqual(current('juvenil', ['amateur'], lead), 'amateur');
  });

  it('a stale filter never widens the view past what is allowed', () => {
    // The coach picked cadet, then lost it. He must not keep seeing it.
    const staff = { category: 'juvenil', roles: ['staff'] };
    assert.strictEqual(current('cadet', ['amateur', 'juvenil'], staff), 'juvenil',
        'falls back to his default, not to the category he lost');
    assert.strictEqual(current('cadet', ['amateur', 'juvenil'], {}), '',
        'with no default either, "all his categories" is the safe answer');
  });

  it('no session and no categories is empty, not a crash', () => {
    assert.strictEqual(current(null, [], null), '');
    assert.strictEqual(current('', [], null), '');
  });

  it('the sentinel is initialised to null, not the empty string', () => {
    assert.ok(/var _viewCategory = null;/.test(src),
        "'' would make the unset state indistinguishable from Totes again");
  });

  it('nothing resets the filter to the Totes value', () => {
    // Two sites reset it — clearSession and the claims listener. Both mean
    // "forget the choice", which is null. '' would pin the next user to a
    // filter they never selected.
    const resets = src.split('\n').filter((l) => /_viewCategory = /.test(l));
    resets.forEach((l) => {
      assert.ok(!/_viewCategory = '';/.test(l),
          'reset must be null, not the explicit-Totes value: ' + l.trim());
    });
  });
});
