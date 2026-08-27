/* Session load, weekly AU, and ISO weeks.
 *
 * Pure logic, no emulator: `npm run test:load`.
 *
 * Two of these are worth more than the rest. `sessionMinutesOf` is a SECOND
 * copy of the duration rule that sessionWindow() in app.js owns, so there is
 * a test here that reads both and feeds them one table — the arrangement
 * this repo already uses for fcfGrupId and sameClubName. And `isoWeek` is
 * the kind of arithmetic that is right for eleven months of the year: the
 * cases below are almost all year boundaries, because that is where it is
 * wrong if it is wrong at all.
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const U = require('../js/utils.js');

const src = fs.readFileSync(path.join(__dirname, '..', 'js', 'app.js'), 'utf8');

describe('loadBand', () => {
  it('bands a 1-10 estimate the way the design specifies', () => {
    assert.deepStrictEqual([1, 2, 3, 4].map(U.loadBand), ['low', 'low', 'low', 'low']);
    assert.deepStrictEqual([5, 6, 7].map(U.loadBand), ['mid', 'mid', 'mid']);
    assert.deepStrictEqual([8, 9, 10].map(U.loadBand), ['high', 'high', 'high']);
  });

  it('is EMPTY for a session nobody has estimated', () => {
    /* The dot is absent, not green. "Nobody said" and "an easy session" are
       different facts and must not share a colour. */
    [null, undefined, '', 0, -3, NaN, 'x'].forEach((v) =>
      assert.strictEqual(U.loadBand(v), '', JSON.stringify(v)));
  });

  it('takes a numeric string, since a <select> hands back one', () => {
    assert.strictEqual(U.loadBand('7'), 'mid');
    assert.strictEqual(U.loadBand('8'), 'high');
  });

  it('puts the boundaries where the legend says', () => {
    // 4|5 and 7|8 are the two the legend promises; a shifted band would
    // make the key on screen a lie.
    assert.notStrictEqual(U.loadBand(4), U.loadBand(5));
    assert.notStrictEqual(U.loadBand(7), U.loadBand(8));
  });
});

describe('sessionMinutesOf', () => {
  const S = (time, endTime) => ({time, endTime});

  it('measures start to end', () => {
    assert.strictEqual(U.sessionMinutesOf(S('21:00', '22:30')), 90);
    assert.strictEqual(U.sessionMinutesOf(S('19:00', '20:15')), 75);
  });

  it('falls back to 90 minutes with no end', () => {
    assert.strictEqual(U.sessionMinutesOf(S('21:00', '')), 90);
    assert.strictEqual(U.sessionMinutesOf(S('21:00', null)), 90);
  });

  it('honours the legacy "HH:MM - HH:MM" range in `time`', () => {
    assert.strictEqual(U.sessionMinutesOf(S('21:00 - 22:00', '')), 60);
  });

  it('lets an explicit endTime beat the range inside `time`', () => {
    assert.strictEqual(U.sessionMinutesOf(S('21:00 - 22:00', '23:00')), 120);
  });

  it('falls back when the end is not after the start', () => {
    // A typo, or a session crossing midnight that nothing else supports.
    assert.strictEqual(U.sessionMinutesOf(S('21:00', '20:00')), 90);
    assert.strictEqual(U.sessionMinutesOf(S('21:00', '21:00')), 90);
  });

  it('takes an override for the last resort only', () => {
    assert.strictEqual(U.sessionMinutesOf(S('21:00', ''), 120), 120);
    assert.strictEqual(U.sessionMinutesOf(S('21:00', '22:30'), 120), 90,
      'an explicit end must always win');
  });

  it('is 0 when it cannot be timed', () => {
    [S('', ''), S(null, null), S('x', 'y'), null].forEach((v) =>
      assert.strictEqual(U.sessionMinutesOf(v), 0, JSON.stringify(v)));
  });

  it('agrees with sessionWindow() in app.js, which owns the same rule', () => {
    /* The duplicate this repo tolerates only alongside a test that reads
       BOTH copies. app.js needs start and end separately for the badge;
       utils needs the duration. They must not drift on the fallback. */
    const i = src.indexOf('  function sessionWindow(t, fallbackMins) {');
    assert.notStrictEqual(i, -1, 'sessionWindow moved');
    // +4 to take the closing brace with it — without it the slice is a
    // function body missing its own `}`, and new Function throws.
    const body = src.slice(i, src.indexOf('\n  }', i) + 4);
    const win = new Function('hhmmToMins', 'DEFAULT_SESSION_MINS',
        body + '\n return sessionWindow;')(
      (v) => U.hhmmMins(v), 90);

    [['21:00', '22:30'], ['21:00', ''], ['21:00 - 22:00', ''],
      ['21:00 - 22:00', '23:00'], ['19:00', '20:15'], ['21:00', '20:00']]
        .forEach(([time, endTime]) => {
          const w = win({time, endTime});
          assert.strictEqual(U.sessionMinutesOf({time, endTime}), w.end - w.start,
            'disagreement on ' + JSON.stringify([time, endTime]));
        });
  });
});

describe('sessionAU', () => {
  const S = {time: '21:00', endTime: '22:30'};    // 90 minutes

  it('is RPE x minutes, the readiness engine\'s own arithmetic', () => {
    assert.strictEqual(U.sessionAU(S, 7), 630);
    assert.strictEqual(U.sessionAU(S, 5), 450);
    assert.strictEqual(U.sessionAU({time: '19:00', endTime: '20:00'}, 8), 480);
  });

  it('shows why the mock\'s week thresholds could not survive real data', () => {
    /* The handoff's gutter bands were >650 amber and >800 red, calibrated
       against `plannedRpe * 12`. Two sessions and a match, costed properly,
       clear both before the week is out — which is why the shipped gutter
       prints a number and no dot. */
    const week = U.sessionAU(S, 7) + U.sessionAU(S, 6) +
      U.sessionAU({time: '18:00', endTime: '19:30'}, 8);
    assert.ok(week > 1500, 'a normal week is ' + week + ' AU, not 650');
  });

  it('is NULL, never 0, when it cannot be costed', () => {
    // 0 would read as "they trained and it was effortless".
    [null, undefined, 0, -1, 'x'].forEach((r) =>
      assert.strictEqual(U.sessionAU(S, r), null, 'rpe ' + JSON.stringify(r)));
    assert.strictEqual(U.sessionAU({time: '', endTime: ''}, 7), null);
  });
});

describe('weekAU', () => {
  const S = (t, e) => ({time: t, endTime: e || ''});
  const rows = [S('21:00', '22:30'), S('21:00', '22:30'), S('18:00', '19:30')];

  it('totals the week, per player', () => {
    const r = U.weekAU(rows, () => 7);
    assert.strictEqual(r.au, 630 * 3);
    assert.strictEqual(r.counted, 3);
    assert.strictEqual(r.unknown, 0);
  });

  it('costs each row at whatever the caller says', () => {
    // A past session at what players reported; an upcoming one at plan.
    const r = U.weekAU(rows, (row) => (row.time === '18:00' ? 9 : 6));
    assert.strictEqual(r.au, 540 + 540 + 810);
  });

  it('counts what it could not cost instead of under-reporting', () => {
    const r = U.weekAU(rows, (row) => (row.time === '18:00' ? null : 7));
    assert.strictEqual(r.au, 1260);
    assert.strictEqual(r.counted, 2);
    assert.strictEqual(r.unknown, 1, 'the unrated session has to be sayable');
  });

  it('is zero and empty for a week with nothing in it', () => {
    assert.deepStrictEqual(U.weekAU([], () => 7), {au: 0, counted: 0, unknown: 0});
    assert.deepStrictEqual(U.weekAU(null, () => 7), {au: 0, counted: 0, unknown: 0});
  });
});

describe('mondayOf', () => {
  it('finds the Monday of any day\'s week', () => {
    // 1 March 2026 is a Sunday; 2 March is the Monday after it.
    assert.strictEqual(U.mondayOf('2026-03-01'), '2026-02-23');
    assert.strictEqual(U.mondayOf('2026-03-02'), '2026-03-02');
    assert.strictEqual(U.mondayOf('2026-03-08'), '2026-03-02');
  });

  it('is idempotent', () => {
    assert.strictEqual(U.mondayOf(U.mondayOf('2026-03-05')), '2026-03-02');
  });

  it('crosses a month and a year end', () => {
    assert.strictEqual(U.mondayOf('2026-01-01'), '2025-12-29');
  });
});

describe('isoWeek', () => {
  it('numbers an ordinary week', () => {
    // 15 October 2026 is a Thursday, in ISO week 42 — the mock's own week.
    assert.deepStrictEqual(U.isoWeek('2026-10-15'), {week: 42, year: 2026});
    assert.deepStrictEqual(U.isoWeek('2026-10-12'), {week: 42, year: 2026});
    assert.deepStrictEqual(U.isoWeek('2026-10-18'), {week: 42, year: 2026});
  });

  it('gives every day of one week the same number', () => {
    const wk = ['2026-03-02', '2026-03-03', '2026-03-04', '2026-03-05',
      '2026-03-06', '2026-03-07', '2026-03-08'].map((d) => U.isoWeek(d).week);
    assert.strictEqual(new Set(wk).size, 1);
  });

  it('puts late December into NEXT year\'s week 1 when the rule says so', () => {
    // 1 Jan 2025 is a Wednesday, so 30-31 Dec 2024 are week 1 of 2025.
    assert.deepStrictEqual(U.isoWeek('2024-12-30'), {week: 1, year: 2025});
    assert.deepStrictEqual(U.isoWeek('2025-01-01'), {week: 1, year: 2025});
  });

  it('keeps early January in LAST year\'s week 53 when the rule says so', () => {
    /* 1 Jan 2027 is a Friday, so 1-3 January belong to week 53 of 2026.
       Returning the date's own calendar year would label them "week 53 of
       2027", which does not exist. */
    assert.deepStrictEqual(U.isoWeek('2026-12-28'), {week: 53, year: 2026});
    assert.deepStrictEqual(U.isoWeek('2027-01-01'), {week: 53, year: 2026});
    assert.deepStrictEqual(U.isoWeek('2027-01-03'), {week: 53, year: 2026});
    assert.deepStrictEqual(U.isoWeek('2027-01-04'), {week: 1, year: 2027});
  });

  it('knows a 53-week year from a 52-week one', () => {
    // 2026 has 53 ISO weeks (it starts on a Thursday); 2025 has 52.
    assert.strictEqual(U.isoWeek('2026-12-31').week, 53);
    assert.strictEqual(U.isoWeek('2025-12-28').week, 52);
    assert.deepStrictEqual(U.isoWeek('2025-12-29'), {week: 1, year: 2026});
  });

  it('starts the year at week 1, never 0', () => {
    for (let y = 2024; y <= 2032; y++) {
      const w = U.isoWeek(y + '-06-15');
      assert.ok(w.week >= 1 && w.week <= 53, y + ' -> ' + w.week);
      assert.ok(U.isoWeek(y + '-01-05').week >= 1, y + ' first week is 0');
    }
  });
});

describe('chunkWeeks', () => {
  it('splits a month grid into six rows of seven', () => {
    const rows = U.chunkWeeks(U.monthGrid(2026, 2));
    assert.strictEqual(rows.length, 6);
    assert.ok(rows.every((r) => r.length === 7));
    assert.strictEqual(rows[0][0], U.monthGrid(2026, 2)[0]);
  });

  it('survives nothing', () => {
    assert.deepStrictEqual(U.chunkWeeks([]), []);
    assert.deepStrictEqual(U.chunkWeeks(null), []);
  });
});
