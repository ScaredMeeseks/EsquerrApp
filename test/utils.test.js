/* Unit tests for the season window in js/utils.js.
 *
 * Pure logic, no emulator: `npm run test:utils` (or `mocha utils.test.js`).
 *
 * Six places in app.js filter on `date < seasonStartStr(now)`, so this
 * function alone decides whether a club's stats, medical, attendance and
 * load views have any content at all. It is now per-club configurable, and
 * the thing most worth proving is the NEGATIVE: a club with no
 * `seasonBoundary` field must behave exactly as it did before the field
 * existed.
 *
 * Dates are built with the local-time constructor `new Date(y, m-1, d)`.
 * `new Date('2026-08-03')` parses as UTC midnight, which localDateStr()
 * would render as the previous day west of Greenwich — the tests would
 * then pass or fail by timezone.
 */
const assert = require('assert');
const {
  seasonStartStr,
  setSeasonBoundary,
  getSeasonBoundary,
  getSeasonWeek
} = require('../js/utils.js');

/** Local-time date, so localDateStr() sees the day we actually mean. */
const d = (y, m, day) => new Date(y, m - 1, day);

describe('utils.js — season boundary', () => {
  // The boundary is module state shared by every test in the process.
  // Leaking it would make these tests order-dependent.
  afterEach(() => setSeasonBoundary(null));

  describe('default (no club override)', () => {
    it('defaults to 15 August', () => {
      assert.strictEqual(getSeasonBoundary(), '08-15');
    });

    it('returns the previous 15 August before the boundary', () => {
      assert.strictEqual(seasonStartStr(d(2026, 8, 3)), '2025-08-15');
      assert.strictEqual(seasonStartStr(d(2026, 8, 14)), '2025-08-15');
      assert.strictEqual(seasonStartStr(d(2026, 1, 1)), '2025-08-15');
    });

    it('rolls over on 15 August, not 1 August', () => {
      // The bug this function was extracted to fix: rolling over on 1 August
      // while dating the window 15 August emptied every season-scoped view
      // for the first fortnight of each August.
      assert.strictEqual(seasonStartStr(d(2026, 8, 1)), '2025-08-15');
      assert.strictEqual(seasonStartStr(d(2026, 8, 15)), '2026-08-15');
      assert.strictEqual(seasonStartStr(d(2026, 12, 31)), '2026-08-15');
    });
  });

  describe('per-club override', () => {
    it('moves the window to the configured boundary', () => {
      setSeasonBoundary('03-01');
      assert.strictEqual(seasonStartStr(d(2026, 8, 3)), '2026-03-01');
      assert.strictEqual(seasonStartStr(d(2026, 3, 1)), '2026-03-01');
      assert.strictEqual(seasonStartStr(d(2026, 2, 28)), '2025-03-01');
    });

    it('supports a calendar-year season', () => {
      setSeasonBoundary('01-01');
      assert.strictEqual(seasonStartStr(d(2026, 8, 3)), '2026-01-01');
      assert.strictEqual(seasonStartStr(d(2026, 1, 1)), '2026-01-01');
      assert.strictEqual(seasonStartStr(d(2025, 12, 31)), '2025-01-01');
    });
  });

  describe('fallback', () => {
    // A club doc with a missing or malformed field must not produce a window
    // nobody asked for. Every one of these is the live club's situation.
    [undefined, null, '', 'nonsense', '3-1', '2026-03-01', 'AB-CD', 13, {}]
      .forEach((bad) => {
        it(`falls back to 08-15 for ${JSON.stringify(bad)}`, () => {
          setSeasonBoundary(bad);
          assert.strictEqual(getSeasonBoundary(), '08-15');
          assert.strictEqual(seasonStartStr(d(2026, 8, 3)), '2025-08-15');
        });
      });

    it('resets cleanly, so leaving a club cannot strand its boundary', () => {
      setSeasonBoundary('03-01');
      assert.strictEqual(seasonStartStr(d(2026, 8, 3)), '2026-03-01');
      setSeasonBoundary(null);
      assert.strictEqual(seasonStartStr(d(2026, 8, 3)), '2025-08-15');
    });
  });

  describe('getSeasonWeek follows the boundary', () => {
    // Week numbering is derived, never stored, so it has to track whatever
    // the boundary currently is or the ACWR chart buckets against the
    // wrong weeks.
    it('puts the boundary date itself in week 1', () => {
      assert.strictEqual(getSeasonWeek('2026-08-15'), 1);
      setSeasonBoundary('03-01');
      assert.strictEqual(getSeasonWeek('2026-03-01'), 1);
    });

    it('advances a week at the following Monday', () => {
      setSeasonBoundary('03-01');
      // 2026-03-01 is a Sunday, so week 1 is the single day and the Monday
      // after it opens week 2.
      assert.strictEqual(getSeasonWeek('2026-03-02'), 2);
      assert.strictEqual(getSeasonWeek('2026-03-08'), 2);
      assert.strictEqual(getSeasonWeek('2026-03-09'), 3);
    });

    it('numbers the same date differently under a different boundary', () => {
      const underDefault = getSeasonWeek('2026-06-01');
      setSeasonBoundary('03-01');
      assert.notStrictEqual(getSeasonWeek('2026-06-01'), underDefault);
    });
  });
});
