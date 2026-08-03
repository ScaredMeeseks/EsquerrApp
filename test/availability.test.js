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
  const logic = grab('  let _availRaw = null;', '  function buildDetailDonut');
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
    return { availContext, getEffectiveAnswer };`)(localStorage, JSONCounting);
  return {
    ...api,
    setAvail: (o) => localStorage.setItem('fa_training_availability', JSON.stringify(o)),
    setOverride: (o) => localStorage.setItem('fa_training_staff_override', JSON.stringify(o)),
    get parses() { return parses; },
    resetCount: () => { parses = 0; },
  };
}

describe('app.js — getEffectiveAnswer', () => {
  it('returns the player\'s own answer', () => {
    const a = load();
    a.setAvail({ 'p1_2026-05-05': 'late' });
    a.setOverride({});
    assert.strictEqual(a.getEffectiveAnswer('p1', '2026-05-05', false), 'late');
  });

  it('lets a staff override beat the player\'s answer', () => {
    const a = load();
    a.setAvail({ 'p1_2026-05-05': 'yes' });
    a.setOverride({ 'p1_2026-05-05': 'no' });
    assert.strictEqual(a.getEffectiveAnswer('p1', '2026-05-05', false), 'no');
  });

  it('assumes yes for an unanswered session, and na once locked', () => {
    const a = load();
    a.setAvail({});
    a.setOverride({});
    assert.strictEqual(a.getEffectiveAnswer('p1', '2026-05-05', false), 'yes');
    assert.strictEqual(a.getEffectiveAnswer('p1', '2026-05-05', true), 'na');
  });

  it('gives the same answer whether or not a context is passed', () => {
    const a = load();
    a.setAvail({ 'p1_d': 'injured', 'p2_d': 'no' });
    a.setOverride({ 'p2_d': 'yes' });
    const ctx = a.availContext();
    ['p1', 'p2', 'p3'].forEach((p) => {
      assert.strictEqual(
          a.getEffectiveAnswer(p, 'd', false, ctx),
          a.getEffectiveAnswer(p, 'd', false),
          p);
    });
  });
});

describe('app.js — availability blob memo', () => {
  it('parses once for many reads instead of once per read', () => {
    const a = load();
    a.setAvail({ 'p1_d': 'yes' });
    a.setOverride({});
    a.getEffectiveAnswer('p1', 'd', false);      // primes both blobs
    a.resetCount();
    for (let i = 0; i < 500; i++) a.getEffectiveAnswer('p' + i, 'd', false);
    assert.strictEqual(a.parses, 0, 'unchanged blobs must not be re-parsed');
  });

  it('re-parses as soon as an answer is written', () => {
    // The reason this is keyed on the string and not a frame counter: a
    // player taps an answer and the very next read must reflect it.
    const a = load();
    a.setAvail({ 'p1_d': 'no' });
    a.setOverride({});
    assert.strictEqual(a.getEffectiveAnswer('p1', 'd', false), 'no');
    a.setAvail({ 'p1_d': 'yes' });
    assert.strictEqual(a.getEffectiveAnswer('p1', 'd', false), 'yes');
  });

  it('re-parses when a staff override is written', () => {
    const a = load();
    a.setAvail({ 'p1_d': 'yes' });
    a.setOverride({});
    assert.strictEqual(a.getEffectiveAnswer('p1', 'd', false), 'yes');
    a.setOverride({ 'p1_d': 'injured' });
    assert.strictEqual(a.getEffectiveAnswer('p1', 'd', false), 'injured');
  });

  it('a held context is a snapshot and does not see later writes', () => {
    // Callers hoist the context for one render pass only. Documented here so
    // nobody caches one across renders and reintroduces stale reads.
    const a = load();
    a.setAvail({ 'p1_d': 'no' });
    a.setOverride({});
    const ctx = a.availContext();
    a.setAvail({ 'p1_d': 'yes' });
    assert.strictEqual(a.getEffectiveAnswer('p1', 'd', false, ctx), 'no');
    assert.strictEqual(a.getEffectiveAnswer('p1', 'd', false), 'yes');
  });
});
