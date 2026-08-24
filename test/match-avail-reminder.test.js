/* Friday's "confirm your availability" push — parking-lot item 13.
 *
 * This was the last onSchedule never examined for the two traps v112 and
 * v113 fixed elsewhere. NEITHER applies, and that is worth pinning rather
 * than re-deriving next time:
 *
 *   · the interval-vs-wall-clock trap needs an `every N minutes` schedule,
 *     which drifts because App Engine waits N minutes after the previous run
 *     FINISHES. This one is `0 20 * * 5` — wall-clock, once a week.
 *   · the double-fire trap needs a fixed-width band closed at both ends.
 *     This has no band at all: it compares dates for exact equality.
 *
 * Reading it did turn up two real bugs, which is what these tests are for.
 *
 * ⚠ How much of this actually runs the deployed code: `chunk10` IS lifted
 * from functions/index.js, so the chunking tests exercise the real helper.
 * The date/removed filter is a faithful REIMPLEMENTATION — it sits inline
 * inside a large async function and cannot be lifted cleanly — so the last
 * describe pins the source to match it. Behaviour here, shape there; neither
 * half is worth much alone.
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const src = fs.readFileSync(
    path.join(__dirname, '..', 'functions', 'index.js'), 'utf8');

function grab(from, to) {
  const i = src.indexOf(from);
  const j = src.indexOf(to, i);
  assert.ok(i !== -1 && j !== -1, 'marker not found: ' + from);
  return src.slice(i, j);
}

const BODY = grab('exports.scheduledMatchAvailReminder = onSchedule(',
    'exports.archiveSeason');

/* Comments stripped. Every assertion below is about what the CODE does, and
   this function is heavily commented — including a note naming the very
   `matchIds.slice(0, 10)` that was removed, which otherwise fails the test
   guarding against its return, for the one reason that is not a problem. */
const CODE = BODY.replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n').map((l) => l.replace(/\/\/.*$/, '')).join('\n');

/* The filter and the answered-set build, lifted out and run for real over a
   fake matchAvail collection that records every query it is given. */
function run(matches, records) {
  const queried = [];
  const satStr = '2026-09-19';
  const sunStr = '2026-09-20';

  const weekend = matches.filter((m) =>
    m.status !== 'past' && !m.fcfRemoved && m.date &&
    (m.date === satStr || m.date === sunStr));

  const chunk10 = new Function(
      grab('function chunk10(arr)', '\n/** Delete every doc') +
      '\n return chunk10;')();

  const answered = new Set();
  for (const ids of chunk10(weekend.map((m) => String(m.id)))) {
    queried.push(ids);
    (records || []).forEach((r) => {
      if (ids.indexOf(String(r.matchId)) !== -1) {
        answered.add(r.uid + '_' + r.matchId);
      }
    });
  }
  return {weekend, answered, queried};
}

const weekendFixtures = (n) => {
  const out = [];
  for (let i = 1; i <= n; i++) {
    out.push({id: i, date: i % 2 ? '2026-09-19' : '2026-09-20', status: 'upcoming'});
  }
  return out;
};

describe('the two traps this scheduler was never checked for', () => {
  it('runs on a WALL-CLOCK cron, not an interval', () => {
    /* `every N minutes` waits N minutes after the previous run finishes, so
       runs drift and any fixed-width window stops tiling. v112 and v113 both
       ended here. */
    assert.ok(/schedule:\s*"0 20 \* \* 5"/.test(CODE), CODE.slice(0, 200));
    assert.ok(!/every \d+ (minutes|hours)/.test(CODE),
        'an interval schedule drifts');
    assert.ok(/timeZone:\s*"Europe\/Madrid"/.test(CODE));
  });

  it('has no band to be inclusive at both ends', () => {
    /* v113's double-fire needed a `[x-0.5, x+0.5]` window closed at both
       ends, so a session exactly on the boundary was reminded twice. This
       compares dates for equality — there is no boundary to land on. */
    assert.ok(/m\.date === satStr \|\| m\.date === sunStr/.test(CODE),
        'the date match is no longer exact equality — recheck for a band');
    assert.ok(!/0\.5/.test(CODE), 'a half-hour band has appeared');
  });
});

describe('which fixtures get asked about', () => {
  it('skips a fixture the federation dropped', () => {
    /* `fcfRemoved` rows are KEPT — call-ups, notes and answers hang off the
       id — and struck through in the Calendari. Asking a squad to confirm
       availability for a cancelled match wastes their Friday evening and
       teaches them to ignore the next push. */
    const {weekend} = run([
      {id: 1, date: '2026-09-19', status: 'upcoming'},
      {id: 2, date: '2026-09-20', status: 'upcoming', fcfRemoved: true},
    ]);
    assert.deepStrictEqual(weekend.map((m) => m.id), [1]);
  });

  it('still skips past fixtures and other dates', () => {
    const {weekend} = run([
      {id: 1, date: '2026-09-19', status: 'past'},
      {id: 2, date: '2026-09-26', status: 'upcoming'},
      {id: 3, date: '', status: 'upcoming'},
      {id: 4, date: '2026-09-20', status: 'upcoming'},
    ]);
    assert.deepStrictEqual(weekend.map((m) => m.id), [4]);
  });
});

describe('reading who has already answered', () => {
  it('queries EVERY weekend fixture, not just the first ten', () => {
    /* The bug. Firestore's `in` takes ten values; the read sliced to ten
       while the loop below it walked all of them. From the eleventh fixture
       onwards `answered` was empty, so every player who HAD replied was
       pushed again as though he had not. */
    const {queried} = run(weekendFixtures(23));
    assert.strictEqual(queried.length, 3, 'expected three chunks for 23 ids');
    assert.deepStrictEqual(queried.map((c) => c.length), [10, 10, 3]);
    const all = [].concat.apply([], queried);
    assert.strictEqual(all.length, 23);
    assert.strictEqual(new Set(all).size, 23, 'a fixture was queried twice');
  });

  it('never asks Firestore for more than ten at once', () => {
    /* Eleven is a rejected query, not a truncated one — the whole read
       throws and nobody is reminded at all. */
    const {queried} = run(weekendFixtures(11));
    queried.forEach((c) => assert.ok(c.length <= 10, 'chunk of ' + c.length));
  });

  it('finds an answer given for the ELEVENTH fixture', () => {
    /* The symptom, stated as the user would meet it: a player who answered
       for the last match of a busy weekend got pushed anyway. */
    const {answered} = run(weekendFixtures(12),
        [{uid: 'u1', matchId: '11'}, {uid: 'u1', matchId: '1'}]);
    assert.ok(answered.has('u1_11'),
        'the eleventh fixture answer was invisible, so u1 is pushed again');
    assert.ok(answered.has('u1_1'));
  });

  it('a light weekend still takes exactly one query', () => {
    const {queried} = run(weekendFixtures(3));
    assert.strictEqual(queried.length, 1);
    assert.deepStrictEqual(queried[0], ['1', '2', '3']);
  });

  it('no fixtures means no query at all', () => {
    const {queried, answered} = run([]);
    assert.deepStrictEqual(queried, []);
    assert.strictEqual(answered.size, 0);
  });
});

describe('the source still does what the tests assume', () => {
  it('chunks rather than slices', () => {
    assert.ok(/for \(const ids of chunk10\(matchIds\)\)/.test(CODE),
        'the chunked read is gone');
    assert.ok(!/matchIds\.slice\(0, 10\)/.test(CODE),
        'the truncating slice is back');
  });

  it('excludes removed fixtures', () => {
    assert.ok(/!m\.fcfRemoved/.test(CODE), 'cancelled fixtures are asked about again');
  });
});
