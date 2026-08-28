/* Unit tests for getEffectiveAnswer() and its parsed-blob memo.
 *
 * Pure logic, no emulator: `npm run test:avail`.
 *
 * getEffectiveAnswer() decides what a coach sees for every player on every
 * session, and it used to re-parse both availability blobs on every call —
 * the Sessions list ran ~3,400 parses of a 49 KB blob per render. The memo
 * that fixed it is keyed on the RAW STRING rather than a render-frame
 * counter, because `_renderFrame` only increments in navigate(): a
 * frame-keyed cache would keep serving the old answer after a player taps
 * one, and a stale read here is worse than a slow one.
 *
 * These tests pin both halves: the precedence rules must be unchanged, and
 * the memo must never outlive a write.
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

/** The real helpers, over a fake localStorage we control. */
function load() {
  /* The resolver block is sliced in alongside: getEffectiveAnswer() no
     longer builds its own key, it asks readRecord(), and a stubbed copy
     here would be free to drift from the real one. */
  const logic = grab('  function recordKey(playerId, sess, kind)', '  async function handleRegister') +
    // v188 removed buildDetailDonut (the page now draws a stacked bar), which
    // was this slice's end marker. The region boundary is the same; only the
    // thing that happened to sit after it changed.
    grab('  let _availRaw = null;', '  // #region Session plan');
  const store = {};
  let parses = 0;
  const localStorage = {
    getItem: (k) => (k in store ? store[k] : null),
    setItem: (k, v) => { store[k] = v; },
  };
  const JSONCounting = {
    parse: (s) => { parses++; return JSON.parse(s); },
    stringify: JSON.stringify,
  };
  // eslint-disable-next-line no-new-func
  const api = new Function('localStorage', 'JSON', `
    ${logic}
    return { availContext, getEffectiveAnswer, recordKey, readRecord };`)(localStorage, JSONCounting);
  return {
    ...api,
    setAvail: (o) => localStorage.setItem('fa_training_availability', JSON.stringify(o)),
    setOverride: (o) => localStorage.setItem('fa_training_staff_override', JSON.stringify(o)),
    get parses() { return parses; },
    resetCount: () => { parses = 0; },
  };
}

/** A session whose id IS the string used in the fixtures' keys, so the
 *  existing expectations read as "the answer for this session". */
const S = (id, over) => Object.assign({ id, date: '2026-05-05' }, over);

describe('app.js — getEffectiveAnswer', () => {
  it('returns the player\'s own answer', () => {
    const a = load();
    a.setAvail({ 'p1_2026-05-05': 'late' });
    a.setOverride({});
    assert.strictEqual(a.getEffectiveAnswer('p1', S('2026-05-05'), false), 'late');
  });

  it('lets a staff override beat the player\'s answer', () => {
    const a = load();
    a.setAvail({ 'p1_2026-05-05': 'yes' });
    a.setOverride({ 'p1_2026-05-05': 'no' });
    assert.strictEqual(a.getEffectiveAnswer('p1', S('2026-05-05'), false), 'no');
  });

  it('assumes yes for an unanswered session, and na once locked', () => {
    const a = load();
    a.setAvail({});
    a.setOverride({});
    assert.strictEqual(a.getEffectiveAnswer('p1', S('2026-05-05'), false), 'yes');
    assert.strictEqual(a.getEffectiveAnswer('p1', S('2026-05-05'), true), 'na');
  });

  it('gives the same answer whether or not a context is passed', () => {
    const a = load();
    a.setAvail({ 'p1_d': 'injured', 'p2_d': 'no' });
    a.setOverride({ 'p2_d': 'yes' });
    const ctx = a.availContext();
    ['p1', 'p2', 'p3'].forEach((p) => {
      assert.strictEqual(
          a.getEffectiveAnswer(p, S('d'), false, ctx),
          a.getEffectiveAnswer(p, S('d'), false),
          p);
    });
  });
});

describe('app.js — availability blob memo', () => {
  it('parses once for many reads instead of once per read', () => {
    const a = load();
    a.setAvail({ 'p1_d': 'yes' });
    a.setOverride({});
    a.getEffectiveAnswer('p1', S('d'), false);      // primes both blobs
    a.resetCount();
    for (let i = 0; i < 500; i++) a.getEffectiveAnswer('p' + i, S('d'), false);
    assert.strictEqual(a.parses, 0, 'unchanged blobs must not be re-parsed');
  });

  it('re-parses as soon as an answer is written', () => {
    // The reason this is keyed on the string and not a frame counter: a
    // player taps an answer and the very next read must reflect it.
    const a = load();
    a.setAvail({ 'p1_d': 'no' });
    a.setOverride({});
    assert.strictEqual(a.getEffectiveAnswer('p1', S('d'), false), 'no');
    a.setAvail({ 'p1_d': 'yes' });
    assert.strictEqual(a.getEffectiveAnswer('p1', S('d'), false), 'yes');
  });

  it('re-parses when a staff override is written', () => {
    const a = load();
    a.setAvail({ 'p1_d': 'yes' });
    a.setOverride({});
    assert.strictEqual(a.getEffectiveAnswer('p1', S('d'), false), 'yes');
    a.setOverride({ 'p1_d': 'injured' });
    assert.strictEqual(a.getEffectiveAnswer('p1', S('d'), false), 'injured');
  });

  it('a held context is a snapshot and does not see later writes', () => {
    // Callers hoist the context for one render pass only. Documented here so
    // nobody caches one across renders and reintroduces stale reads.
    const a = load();
    a.setAvail({ 'p1_d': 'no' });
    a.setOverride({});
    const ctx = a.availContext();
    a.setAvail({ 'p1_d': 'yes' });
    assert.strictEqual(a.getEffectiveAnswer('p1', S('d'), false, ctx), 'no');
    assert.strictEqual(a.getEffectiveAnswer('p1', S('d'), false), 'yes');
  });
});

/* ------------------------------------------------------------------ *
 * Session keys and the legacy fallback.
 *
 * Records used to be keyed `{uid}_{date}`, which was fine while a player
 * could only have one session a day. Guest call-ups break that: borrowed
 * for another squad's evening session, a player's two answers collided and
 * the second silently overwrote the first.
 *
 * New records are keyed by session id. Legacy ones are still READ, because
 * the v43-era APK knows only the date form and keeps writing it. The two
 * cannot collide: a session id is `tr_…`, never a date.
 * ------------------------------------------------------------------ */
describe('app.js — record keys', () => {
  const sess = (over) => Object.assign({ id: 'tr_1', date: '2026-05-05' }, over);

  it('writes under the session, not the date', () => {
    const a = load();
    assert.strictEqual(a.recordKey('p1', sess(), 'avail'), 'p1_tr_1');
    assert.strictEqual(a.recordKey('p1', sess(), 'rpe'), 'p1_training_tr_1');
  });

  it('prefers a session-keyed record over a legacy one', () => {
    const a = load();
    a.setAvail({ 'p1_tr_1': 'late', 'p1_2026-05-05': 'no' });
    a.setOverride({});
    assert.strictEqual(a.getEffectiveAnswer('p1', sess(), false), 'late');
  });

  it('still reads a legacy record when there is no session-keyed one', () => {
    // Written by an old APK, or before the migration ran.
    const a = load();
    a.setAvail({ 'p1_2026-05-05': 'no' });
    a.setOverride({});
    assert.strictEqual(a.getEffectiveAnswer('p1', sess(), false), 'no');
  });

  it('does NOT apply the legacy fallback to a guest appearance', () => {
    /* The load-bearing guard. A legacy record can only ever have meant the
       player's OWN session -- the client that wrote it had no concept of a
       call-up -- so honouring it here would make a pre-feature answer also
       answer a session the player was never part of. */
    const a = load();
    a.setAvail({ 'p1_2026-05-05': 'no' });
    a.setOverride({});
    const borrowed = sess({ id: 'tr_2', guests: ['p1'] });
    assert.strictEqual(a.getEffectiveAnswer('p1', borrowed, false), 'yes',
        'unanswered, not the answer to his own session');
  });

  it('keeps two sessions on one date apart — the bug being fixed', () => {
    const a = load();
    a.setAvail({ 'p1_tr_am': 'yes', 'p1_tr_pm': 'no' });
    a.setOverride({});
    assert.strictEqual(a.getEffectiveAnswer('p1', sess({ id: 'tr_am' }), false), 'yes');
    assert.strictEqual(a.getEffectiveAnswer('p1', sess({ id: 'tr_pm' }), false), 'no');
  });

  it('lets a staff override win in either format', () => {
    const a = load();
    a.setAvail({ 'p1_tr_1': 'yes' });
    a.setOverride({ 'p1_tr_1': 'injured' });
    assert.strictEqual(a.getEffectiveAnswer('p1', sess(), false), 'injured');
    const b = load();
    b.setAvail({ 'p1_2026-05-05': 'yes' });
    b.setOverride({ 'p1_2026-05-05': 'no' });
    assert.strictEqual(b.getEffectiveAnswer('p1', sess(), false), 'no');
  });

  it('falls back cleanly for a session it cannot identify', () => {
    /* An id-less session would build the key `p1_`, so getTrainings() is
       what guarantees one exists on every surface -- it repairs a missing
       id before any read. With nothing stored there is nothing to find,
       and the locked default applies as usual. */
    const a = load();
    a.setAvail({});
    a.setOverride({});
    assert.strictEqual(a.getEffectiveAnswer('p1', {}, true), 'na');
    assert.strictEqual(a.getEffectiveAnswer('p1', {}, false), 'yes');
  });
});
