/* Unit tests for the calendar helpers in js/utils.js.
 *
 * Pure logic, no emulator: `npm run test:calendar` (or `mocha calendar.test.js`).
 *
 * These decide which day a placeholder training lands on and what a coach is
 * told about his microcycle. Both are date arithmetic, which is the kind of
 * code that is wrong in a way nobody notices until the clocks change — so
 * the interesting cases here are deliberately DST boundaries, month ends and
 * the ties, not the happy path.
 */
const assert = require('assert');
const U = require('../js/utils.js');

/* Europe/Madrid springs forward on the last Sunday of March and back on the
   last Sunday of October. 2026: 29 March and 25 October. */
const DST_SPRING = '2026-03-29';
const DST_AUTUMN = '2026-10-25';

describe('daysBetweenISO', () => {
  it('counts whole days forward and backward', () => {
    assert.strictEqual(U.daysBetweenISO('2026-03-01', '2026-03-08'), 7);
    assert.strictEqual(U.daysBetweenISO('2026-03-08', '2026-03-01'), -7);
    assert.strictEqual(U.daysBetweenISO('2026-03-01', '2026-03-01'), 0);
  });

  it('is exact across both DST boundaries', () => {
    // 23-hour and 25-hour days. Without noon anchoring these come back as
    // 6.958 and 7.042, and only rounding hides it.
    assert.strictEqual(U.daysBetweenISO('2026-03-26', '2026-04-02'), 7);
    assert.strictEqual(U.daysBetweenISO('2026-10-22', '2026-10-29'), 7);
    assert.strictEqual(U.daysBetweenISO(DST_SPRING, '2026-03-30'), 1);
    assert.strictEqual(U.daysBetweenISO(DST_AUTUMN, '2026-10-26'), 1);
  });

  it('crosses a month and a year end', () => {
    assert.strictEqual(U.daysBetweenISO('2026-01-31', '2026-02-01'), 1);
    assert.strictEqual(U.daysBetweenISO('2026-12-31', '2027-01-01'), 1);
    assert.strictEqual(U.daysBetweenISO('2028-02-28', '2028-03-01'), 2); // leap
  });
});

describe('monthGrid', () => {
  it('always returns 42 dates', () => {
    for (let m = 0; m < 12; m++) {
      assert.strictEqual(U.monthGrid(2026, m).length, 42,
        'month index ' + m + ' is not 6 rows');
    }
  });

  it('starts on a Monday and ends on a Sunday', () => {
    const g = U.monthGrid(2026, 2);
    assert.strictEqual(new Date(g[0] + 'T12:00:00').getDay(), 1);
    assert.strictEqual(new Date(g[41] + 'T12:00:00').getDay(), 0);
  });

  it('spills into the neighbouring months', () => {
    // 1 Feb 2026 is a Sunday, so the grid opens on 26 January.
    const g = U.monthGrid(2026, 1);
    assert.strictEqual(g[0], '2026-01-26');
    assert.strictEqual(g[6], '2026-02-01');
    assert.strictEqual(g[41], '2026-03-08');
  });

  it('opens on the 1st when the month itself starts on a Monday', () => {
    // 1 June 2026 is a Monday: no spill at the front.
    const g = U.monthGrid(2026, 5);
    assert.strictEqual(g[0], '2026-06-01');
  });

  it('contains every day of the month, in order, exactly once', () => {
    const g = U.monthGrid(2026, 2);          // March, 31 days
    const own = g.filter(d => d.slice(0, 7) === '2026-03');
    assert.strictEqual(own.length, 31);
    assert.strictEqual(own[0], '2026-03-01');
    assert.strictEqual(own[30], '2026-03-31');
    assert.deepStrictEqual(own, own.slice().sort());
  });

  it('does not skip or repeat a day across a DST boundary', () => {
    const g = U.monthGrid(2026, 2);
    assert.strictEqual(new Set(g).size, 42);
    const i = g.indexOf(DST_SPRING);
    assert.ok(i > 0, 'the spring-forward day is in the grid');
    assert.strictEqual(g[i + 1], '2026-03-30');
    const j = U.monthGrid(2026, 9).indexOf(DST_AUTUMN);
    assert.ok(j > 0, 'the fall-back day is in the grid');
  });

  it('handles a leap February', () => {
    const own = U.monthGrid(2028, 1).filter(d => d.slice(0, 7) === '2028-02');
    assert.strictEqual(own.length, 29);
  });

  it('rolls the year over', () => {
    const g = U.monthGrid(2026, 11);          // December
    assert.ok(g.some(d => d.startsWith('2027-01')));
  });
});

describe('scheduleSlots', () => {
  const CLUB = {
    schedules: {
      'amateur-A': {
        training: [
          { day: 'thu', time: '21:00', endTime: '22:30', location: 'Industrial', link: 'L' },
          { day: 'tue', time: '21:00', endTime: '22:30', location: 'Industrial', link: 'L' }
        ],
        homeGame: { day: 'sat', time: '16:00' }
      },
      'amateur-B': {
        training: [
          { day: 'wed', time: '20:00', endTime: '', location: '', link: '' },
          { day: 'wed', time: '09:00', endTime: '', location: '', link: '' }
        ]
      },
      'cadet-A': { training: [{ day: '', time: '19:00', location: '' }] }
    }
  };

  it('reads the schedule keyed {category}-{letter} and sorts by weekday', () => {
    const s = U.scheduleSlots(CLUB, 'amateur', 'A');
    assert.strictEqual(s.length, 2);
    assert.deepStrictEqual(s.map(x => x.jsDay), [2, 4]);   // Tue before Thu
    assert.strictEqual(s[0].endTime, '22:30');
    assert.strictEqual(s[0].location, 'Industrial');
  });

  it('sorts two slots on one day by start time', () => {
    const s = U.scheduleSlots(CLUB, 'amateur', 'B');
    assert.deepStrictEqual(s.map(x => x.time), ['09:00', '20:00']);
  });

  it('falls back to Tue/Thu when the squad has no usable rows', () => {
    // A row with no day is a half-filled form, not a Sunday session.
    [U.scheduleSlots(CLUB, 'cadet', 'A'),
      U.scheduleSlots(CLUB, 'juvenil', 'A'),
      U.scheduleSlots(null, 'amateur', 'A'),
      U.scheduleSlots({}, 'amateur', 'A')].forEach(s => {
      assert.deepStrictEqual(s.map(x => x.jsDay), [2, 4]);
    });
  });

  it('hands back fresh objects, not the shared default', () => {
    const a = U.scheduleSlots({}, 'x', 'A');
    a[0].time = 'MUTATED';
    assert.strictEqual(U.scheduleSlots({}, 'y', 'A')[0].time, '21:00');
    assert.strictEqual(U.DEFAULT_TRAINING_SLOTS[0].time, '21:00');
  });

  it('maps every day value utils exports', () => {
    U.DAY_VALUES.forEach(d => {
      assert.notStrictEqual(U.DAY_TO_JS[d], undefined, d + ' has no JS day');
    });
  });
});

describe('hhmmMins', () => {
  it('parses HH:MM', () => {
    assert.strictEqual(U.hhmmMins('21:00'), 1260);
    assert.strictEqual(U.hhmmMins('09:30'), 570);
    assert.strictEqual(U.hhmmMins('0:05'), 5);
  });
  it('tolerates the legacy "HH:MM - HH:MM" shape', () => {
    assert.strictEqual(U.hhmmMins('21:00 - 22:30'), 1260);
  });
  it('is null for anything else', () => {
    [null, undefined, '', 'x', '21'].forEach(v =>
      assert.strictEqual(U.hhmmMins(v), null, JSON.stringify(v)));
  });
});

describe('freeSlots', () => {
  const tue = { jsDay: 2, time: '21:00' };
  const morning = { jsDay: 3, time: '09:00' };
  const evening = { jsDay: 3, time: '20:00' };

  it('leaves every slot free when nothing is scheduled', () => {
    assert.deepStrictEqual(U.freeSlots([tue], []), [tue]);
    assert.deepStrictEqual(U.freeSlots([tue], null), [tue]);
  });

  it('consumes a slot whose session was moved to another time', () => {
    // THE case this exists for: 21:00 shifted to 20:00 has used Tuesday.
    // On exact-time matching the ghost would sit beside the real session
    // offering to create a second one.
    assert.deepStrictEqual(U.freeSlots([tue], [{ time: '20:00' }]), []);
  });

  it('consumes the NEAREST slot, keeping the other placeholder', () => {
    const left = U.freeSlots([morning, evening], [{ time: '09:30' }]);
    assert.deepStrictEqual(left, [evening]);
  });

  it('keeps the morning when the evening one was scheduled', () => {
    const left = U.freeSlots([morning, evening], [{ time: '19:45' }]);
    assert.deepStrictEqual(left, [morning]);
  });

  it('is empty once there are at least as many sessions as slots', () => {
    assert.deepStrictEqual(
      U.freeSlots([morning, evening], [{ time: '09:00' }, { time: '20:00' }]), []);
    assert.deepStrictEqual(
      U.freeSlots([morning], [{ time: '09:00' }, { time: '20:00' }]), []);
  });

  it('consumes a slot even when the session carries no readable time', () => {
    assert.deepStrictEqual(U.freeSlots([tue], [{ time: '' }]), []);
  });

  it('does not mutate its inputs', () => {
    const slots = [morning, evening];
    const taken = [{ time: '20:00' }];
    U.freeSlots(slots, taken);
    assert.strictEqual(slots.length, 2);
    assert.strictEqual(taken.length, 1);
  });
});

describe('ghostSlots', () => {
  const CLUB = {
    schedules: {
      'amateur-A': {
        training: [
          { day: 'tue', time: '21:00', endTime: '22:30', location: 'Industrial', link: 'L' },
          { day: 'thu', time: '21:00', endTime: '22:30', location: 'Industrial', link: 'L' }
        ]
      }
    }
  };
  const SQUADS = [{ category: 'amateur', letter: 'A' }];
  // Mar 2026: 3rd and 10th are Tuesdays, 5th and 12th Thursdays.
  const WEEK = ['2026-03-02', '2026-03-15'];

  const run = (existing, today) =>
    U.ghostSlots(CLUB, SQUADS, existing, WEEK[0], WEEK[1], today || '2026-03-01');

  it('places one placeholder per configured slot in the window', () => {
    const g = run([]);
    assert.deepStrictEqual(g.map(x => x.date),
      ['2026-03-03', '2026-03-05', '2026-03-10', '2026-03-12']);
    assert.ok(g.every(x => x.ghost === true));
    assert.strictEqual(g[0].time, '21:00');
    assert.strictEqual(g[0].endTime, '22:30');
    assert.strictEqual(g[0].location, 'Industrial');
    assert.strictEqual(g[0].category, 'amateur');
    assert.strictEqual(g[0].letter, 'A');
  });

  it('gives every placeholder a distinct, stable key', () => {
    const g = run([]);
    assert.strictEqual(new Set(g.map(x => x.key)).size, g.length);
    assert.deepStrictEqual(run([]).map(x => x.key), g.map(x => x.key));
  });

  it('drops the placeholder a real session occupies', () => {
    const g = run([{ date: '2026-03-03', time: '21:00', category: 'amateur', teams: ['A'] }]);
    assert.deepStrictEqual(g.map(x => x.date),
      ['2026-03-05', '2026-03-10', '2026-03-12']);
  });

  it('drops it when the session was moved to another time that day', () => {
    const g = run([{ date: '2026-03-03', time: '19:30', category: 'amateur', teams: ['A'] }]);
    assert.ok(!g.some(x => x.date === '2026-03-03'));
  });

  it('brings the placeholder back when the session is deleted', () => {
    // Not a code path — the point is that there is none. The ghost is a
    // function of what exists, so removing the row restores it.
    const withSession = run([{ date: '2026-03-03', time: '21:00', category: 'amateur', teams: ['A'] }]);
    assert.deepStrictEqual(run([]).map(x => x.key).length, withSession.length + 1);
  });

  it('treats teams:[] as every letter of the category', () => {
    // trainingTeams() in app.js reads an empty list as "all letters", so
    // such a session occupies B's slot as well as A's.
    const squads = [{ category: 'amateur', letter: 'A' }, { category: 'amateur', letter: 'B' }];
    const existing = [{ date: '2026-03-03', time: '21:00', category: 'amateur', teams: [] }];
    const g = U.ghostSlots(CLUB, squads, existing, WEEK[0], WEEK[1], '2026-03-01');
    assert.ok(!g.some(x => x.date === '2026-03-03'));
  });

  it('does not let one squad consume another squad\'s slot', () => {
    const existing = [{ date: '2026-03-03', time: '21:00', category: 'juvenil', teams: ['A'] }];
    assert.ok(run(existing).some(x => x.date === '2026-03-03'));
  });

  it('is inclusive of today and silent about the past', () => {
    assert.ok(run([], '2026-03-03').some(x => x.date === '2026-03-03'),
      'a slot later today is still schedulable');
    assert.ok(!run([], '2026-03-05').some(x => x.date === '2026-03-03'));
    assert.strictEqual(run([], '2026-03-13').length, 0);
  });

  it('counts an ACTIVITY as occupying the slot', () => {
    // A squad at a team meal is not free to train.
    const g = run([{
      date: '2026-03-03', time: '21:00', category: 'amateur',
      teams: ['A'], kind: 'activity', title: 'Sopar'
    }]);
    assert.ok(!g.some(x => x.date === '2026-03-03'));
  });

  it('is empty with no squads', () => {
    assert.deepStrictEqual(U.ghostSlots(CLUB, [], [], WEEK[0], WEEK[1], '2026-03-01'), []);
    assert.deepStrictEqual(U.ghostSlots(CLUB, null, [], WEEK[0], WEEK[1], '2026-03-01'), []);
  });

  it('walks a DST boundary without skipping or repeating a day', () => {
    // 29 March 2026 is a Sunday; the Tuesdays either side are the 24th
    // and the 31st, and both must appear exactly once.
    const g = U.ghostSlots(CLUB, SQUADS, [], '2026-03-23', '2026-04-04', '2026-03-01');
    const dates = g.map(x => x.date);
    assert.deepStrictEqual(new Set(dates).size, dates.length);
    assert.ok(dates.includes('2026-03-24'));
    assert.ok(dates.includes('2026-03-31'));
  });

  it('uses the Tue/Thu fallback for a squad with no schedule', () => {
    const g = U.ghostSlots({}, SQUADS, [], WEEK[0], WEEK[1], '2026-03-01');
    assert.deepStrictEqual(g.map(x => x.date),
      ['2026-03-03', '2026-03-05', '2026-03-10', '2026-03-12']);
  });
});

describe('matchdayOffset', () => {
  const M = ['2026-03-01', '2026-03-08', '2026-03-15'];

  it('is null with no fixtures', () => {
    assert.strictEqual(U.matchdayOffset('2026-03-04', []), null);
    assert.strictEqual(U.matchdayOffset('2026-03-04', null), null);
    assert.strictEqual(U.matchdayOffset('', M), null);
  });

  it('reports matchday itself', () => {
    assert.deepStrictEqual(U.matchdayOffset('2026-03-08', M), { sign: '0', n: 0 });
  });

  it('counts down to the next fixture when it is closer', () => {
    assert.deepStrictEqual(U.matchdayOffset('2026-03-06', M), { sign: '-', n: 2 });
  });

  it('counts up from the last fixture when it is closer', () => {
    assert.deepStrictEqual(U.matchdayOffset('2026-03-03', M), { sign: '+', n: 2 });
  });

  it('gives a tie to the NEXT fixture', () => {
    // Wednesday between two Saturdays: the coach is preparing, not recovering.
    assert.deepStrictEqual(U.matchdayOffset('2026-03-04', ['2026-03-01', '2026-03-07']),
      { sign: '-', n: 3 });
  });

  it('uses whichever side exists when there is only one', () => {
    assert.deepStrictEqual(U.matchdayOffset('2026-02-25', M), { sign: '-', n: 4 });
    assert.deepStrictEqual(U.matchdayOffset('2026-03-18', M), { sign: '+', n: 3 });
  });

  it('picks the CLOSEST fixture on each side, not the first in the array', () => {
    const shuffled = ['2026-03-15', '2026-03-01', '2026-03-08'];
    assert.deepStrictEqual(U.matchdayOffset('2026-03-09', shuffled), { sign: '+', n: 1 });
  });

  it('ignores blank entries', () => {
    assert.deepStrictEqual(U.matchdayOffset('2026-03-03', ['', null, '2026-03-01']),
      { sign: '+', n: 2 });
  });

  it('is exact across a DST boundary', () => {
    assert.deepStrictEqual(U.matchdayOffset('2026-03-26', ['2026-04-02']), { sign: '-', n: 7 });
    assert.deepStrictEqual(U.matchdayOffset('2026-10-29', ['2026-10-22']), { sign: '+', n: 7 });
  });
});

describe('matchdayLabel', () => {
  it('renders the three shapes', () => {
    assert.strictEqual(U.matchdayLabel({ sign: '0', n: 0 }), 'MD');
    assert.strictEqual(U.matchdayLabel({ sign: '-', n: 3 }), 'M-3');
    assert.strictEqual(U.matchdayLabel({ sign: '+', n: 2 }), 'M+2');
  });
  it('is empty for nothing', () => {
    assert.strictEqual(U.matchdayLabel(null), '');
    assert.strictEqual(U.matchdayLabel(undefined), '');
  });
});

describe('leaguePosLabel', () => {
  it('uses the irregular Catalan ordinals below five', () => {
    assert.deepStrictEqual([1, 2, 3, 4, 5].map((n) => U.leaguePosLabel(n, 'ca')),
      ['1r', '2n', '3r', '4t', '5è']);
  });

  it('keeps -è for the teens and beyond', () => {
    assert.strictEqual(U.leaguePosLabel(11, 'ca'), '11è');
    assert.strictEqual(U.leaguePosLabel(20, 'ca'), '20è');
  });

  it('is º in Spanish', () => {
    assert.strictEqual(U.leaguePosLabel(4, 'es'), '4º');
    assert.strictEqual(U.leaguePosLabel(11, 'es'), '11º');
  });

  it('gets the English teens right', () => {
    // 11th/12th/13th end in 1, 2, 3 and still take -th. This is the case a
    // naive `n % 10` version fails, and a group of 16 reaches it.
    assert.deepStrictEqual([1, 2, 3, 4, 11, 12, 13, 21, 22, 23]
      .map((n) => U.leaguePosLabel(n, 'en')),
    ['1st', '2nd', '3rd', '4th', '11th', '12th', '13th', '21st', '22nd', '23rd']);
  });

  it('defaults to Catalan', () => {
    assert.strictEqual(U.leaguePosLabel(4), '4t');
  });

  it('is EMPTY for a non-position, so no card ever says "0è"', () => {
    [0, -1, null, undefined, '', 'x', NaN].forEach((v) =>
      assert.strictEqual(U.leaguePosLabel(v, 'ca'), '', JSON.stringify(v)));
  });
});

describe('activities are fa_training rows with a kind', () => {
  it('treats an ABSENT kind as a training', () => {
    // The whole no-backfill guarantee: every row written before activities
    // existed carries no `kind` and must keep behaving as a session.
    assert.strictEqual(U.isActivity({ id: 'tr_1', focus: 'Pressió' }), false);
    assert.strictEqual(U.isActivity({ id: 'tr_1', kind: 'training' }), false);
    assert.strictEqual(U.isActivity(null), false);
    assert.strictEqual(U.isActivity(undefined), false);
  });

  it('recognises an activity', () => {
    assert.strictEqual(U.isActivity({ kind: 'activity' }), true);
    assert.strictEqual(U.isActivity({ kind: U.ACTIVITY_KIND }), true);
  });

  it('does not confuse the two constants', () => {
    assert.notStrictEqual(U.TRAINING_KIND, U.ACTIVITY_KIND);
  });

  it('reads the bold line off the right field for each kind', () => {
    assert.strictEqual(U.activityTitleOf({ focus: 'Pressió alta' }, 'X'), 'Pressió alta');
    assert.strictEqual(
      U.activityTitleOf({ kind: 'activity', title: 'Sopar', focus: 'ignored' }, 'X'), 'Sopar');
  });

  it('falls back when the field is blank or whitespace', () => {
    assert.strictEqual(U.activityTitleOf({ focus: '   ' }, 'Entrenament'), 'Entrenament');
    assert.strictEqual(U.activityTitleOf({ kind: 'activity' }, 'Activitat'), 'Activitat');
    assert.strictEqual(U.activityTitleOf(null, 'Entrenament'), 'Entrenament');
    assert.strictEqual(U.activityTitleOf({ focus: '' }, ''), '');
  });
});
