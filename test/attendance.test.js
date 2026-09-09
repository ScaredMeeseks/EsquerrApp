/* Attendance — the ONE rule five pages count through.  `npm run test:att`
 *
 * ⚠ WHY THIS FILE EXISTS, and what it is really guarding.
 *
 * Until v253 attendance was computed in five places and gave four different
 * answers for one player. Inici's player hero, Inici's staff hero, Les meves
 * estadístiques, Plantilla's band and rail, and the load charts on
 * staff-player-stats each had their own loop, and they disagreed about:
 *
 *   · WHO — two of the five never applied playerIsCalled at all, so a juvenil
 *     player carried the amateur squad's sessions;
 *   · WHEN — three had no season bound, and the three that had a date bound
 *     used `date <= today`, which counts a 21:00 session at 10:00 that
 *     morning; the other two had no bound of any kind and were counting
 *     sessions that had not happened yet;
 *   · and WHAT A SILENCE MEANS — two read it through getEffectiveAnswer(),
 *     which returns 'yes' for an unlocked silence, and two read the blobs raw
 *     and counted it as nothing.
 *
 * The owner's instruction was explicit: find the shared rule BEFORE fixing any
 * of the three, because making them agree by patching each is treating the
 * symptom and they drift again by the next release. So there are two kinds of
 * test in here and both matter:
 *
 *   1. the rule itself, run for real against an injected clock; and
 *   2. ⚠ A DRIFT GUARD over the source — no page may grow a second opinion.
 *      That guard is the whole point. Every assertion in section 1 would go
 *      on passing while a sixth site quietly counted for itself.
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const utils = require('../js/utils.js');
const src = fs.readFileSync(path.join(__dirname, '..', 'js', 'app.js'), 'utf8');
const bare = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

function grab(from, to) {
  const i = src.indexOf(from);
  const j = src.indexOf(to, i);
  assert.ok(i !== -1 && j !== -1, 'marker not found in js/app.js: ' + from);
  return src.slice(i, j);
}

/**
 * The real rule, over real collaborators.
 *
 * ⚠ NOTHING here that decides an outcome is a stub. playerIsCalled,
 * trainingTeams, sessionWindow, recordKey and readRecord are all sliced in —
 * a stub returning a constant cannot answer a question about its input, and
 * every question this file asks is about an input. What is injected is the
 * clock, the blobs and the season boundary, which are the rule's arguments.
 */
function loadRule(over) {
  const o = over || {};
  const api = {
    getTeamLetters: o.getTeamLetters || (() => ['A', 'B']),
    trainingOnly: o.trainingOnly || ((l) => l),
    getTrainings: () => o.trainings || [],
    seasonStartStr: () => o.seasonStart || '2026-08-15',
    localDateStr: utils.localDateStr,
    availContext: () => ({
      availData: o.availData || {}, overrides: o.overrides || {}
    }),
    DEFAULT_SESSION_MINS: 90,
    DEFAULT_MATCH_MINS: 120,
    BADGE_FALLBACK_MINS: 120,
    Math, JSON, Object, String, Number, Date, Array, isNaN,
  };
  // eslint-disable-next-line no-new-func
  return new Function(...Object.keys(api), `
    ${grab('  function trainingTeams(t) {', '  /** The sessions a player is called to')}
    ${grab('  function hhmmToMins(v) {', '  /* ── Player-submitted records: keyed by SESSION')}
    ${grab('  function recordKey(playerId, sess, kind) {', '  var TRAINING_DEFAULT_LOC')}
    return { seasonAttendance, sessionHasStarted, attendanceCtx };`)(
    ...Object.values(api));
}

const P1 = { id: 'p1', category: 'amateur', team: 'A', roles: ['player'] };

/** A session. `time` defaults to an evening one so the start bound has teeth. */
const sess = (id, date, extra) =>
  Object.assign({ id, date, time: '19:00', endTime: '', category: 'amateur',
    teams: ['A'] }, extra || {});

// ═══════════════════════════════════════════════════════════════════════════
describe('sessionHasStarted — the boundary, and it is the START', () => {
  const B = loadRule();

  /* ⚠ THE ONE THE OWNER NAMED. "A training at 21:00 today has not been
     attended at 10:00 today." Three of the five sites tested `tr.date <=
     todayISO`, which cannot express this and answers yes all morning. */
  it('says no to a session later TODAY', () => {
    const t = sess('t1', '2026-09-09', { time: '21:00' });
    assert.strictEqual(
        B.sessionHasStarted(t, new Date('2026-09-09T10:00:00')), false,
        'this morning, tonight’s session already counts as attended');
  });

  it('says yes the minute it begins, and not a minute before', () => {
    const t = sess('t1', '2026-09-09', { time: '21:00' });
    assert.strictEqual(
        B.sessionHasStarted(t, new Date('2026-09-09T20:59:00')), false,
        'a session counts one minute early');
    assert.strictEqual(
        B.sessionHasStarted(t, new Date('2026-09-09T21:00:00')), true,
        'a session that has just kicked off does not count');
  });

  /* ⚠ START, not END — the other way to get this wrong. sessionEndsAt() is
     the same window's far edge and would leave a session in progress out of
     the figure for its whole 90 minutes. */
  it('counts a session that is still being played', () => {
    const t = sess('t1', '2026-09-09', { time: '19:00' });
    assert.strictEqual(
        B.sessionHasStarted(t, new Date('2026-09-09T19:45:00')), true,
        'a session in progress is not counted, so the boundary is its end');
  });

  it('says no to any date in the future', () => {
    assert.strictEqual(
        B.sessionHasStarted(sess('t1', '2026-09-15'), new Date('2026-09-09T10:00:00')),
        false, 'next week already counts');
  });

  /* No time to compare against, so the coarse answer — and never the
     optimistic one. Today's untimed session does NOT count. */
  it('falls back to the DATE when the time is unreadable, conservatively', () => {
    const now = new Date('2026-09-09T10:00:00');
    assert.strictEqual(B.sessionHasStarted(sess('a', '2026-09-09', { time: '' }), now),
        false, 'an untimed session today counts before it can have happened');
    assert.strictEqual(B.sessionHasStarted(sess('b', '2026-09-08', { time: '' }), now),
        true, 'an untimed session yesterday never counts at all');
  });

  it('says no to a session with no date', () => {
    assert.strictEqual(B.sessionHasStarted({ id: 'x', time: '19:00' }, new Date()), false);
    assert.strictEqual(B.sessionHasStarted(null, new Date()), false);
  });

  /* ⚠ The 23:30 trap sessionEndsAt() documents: a start plus 90 minutes is
     25:00, which is not a time. This builds from local midnight plus the
     start MINUTES precisely so nothing here can become an Invalid Date —
     and an Invalid Date answers `false` to every comparison silently. */
  it('handles a session late enough to run past midnight', () => {
    const t = sess('t1', '2026-09-09', { time: '23:30' });
    assert.strictEqual(B.sessionHasStarted(t, new Date('2026-09-09T23:00:00')), false);
    assert.strictEqual(B.sessionHasStarted(t, new Date('2026-09-09T23:31:00')), true);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe('seasonAttendance — the population', () => {
  const NOW = new Date('2026-09-09T10:00:00');
  const CTX = (trainings, availData, overrides) => ({
    trainings, availData: availData || {}, overrides: overrides || {},
    seasonStart: '2026-08-15', now: NOW,
  });

  /* ⚠ THE FAULT THAT MADE ONE PLAYER READ THREE NUMBERS. Les meves
     estadístiques and the coach's load charts both counted
     `trainingOnly(getTrainings())` with no call-up filter, so a juvenil
     player's percentage included the amateur squad's sessions. */
  it('counts only the sessions the player was CALLED to', () => {
    const B = loadRule();
    const list = [
      sess('mine', '2026-09-01'),
      sess('other', '2026-09-02', { category: 'juvenil', teams: ['A'] }),
      sess('otherletter', '2026-09-03', { teams: ['B'] }),
    ];
    const a = B.seasonAttendance(P1, CTX(list));
    assert.strictEqual(a.total, 1,
        'a session this player was never called to is in his denominator');
  });

  it('counts a session he was borrowed for, and drops one he was excluded from', () => {
    const B = loadRule();
    const list = [
      sess('guest', '2026-09-01', { category: 'juvenil', teams: ['A'], guests: ['p1'] }),
      sess('out', '2026-09-02', { excluded: ['p1'] }),
    ];
    const a = B.seasonAttendance(P1, CTX(list));
    assert.strictEqual(a.total, 1, 'the guest call-up and the exclusion are not both honoured');
  });

  it('leaves last season out', () => {
    const B = loadRule();
    const a = B.seasonAttendance(P1, CTX([
      sess('this', '2026-09-01'), sess('last', '2026-06-01'),
    ]));
    assert.strictEqual(a.total, 1, "last season's sessions are in the figure");
  });

  /* Fault (a) again, at the level the pages actually call. */
  it('leaves a session that has not started out of the denominator', () => {
    const B = loadRule();
    const a = B.seasonAttendance(P1, CTX([
      sess('done', '2026-09-01'),
      sess('tonight', '2026-09-09', { time: '21:00' }),
      sess('next week', '2026-09-16'),
    ]));
    assert.strictEqual(a.total, 1,
        'a session that has not begun is being counted: ' + JSON.stringify(a));
  });

  it('returns a zeroed shape for no player at all, rather than throwing', () => {
    const B = loadRule();
    assert.deepStrictEqual(B.seasonAttendance(null, CTX([sess('a', '2026-09-01')])),
        { yes: 0, late: 0, no: 0, injured: 0, total: 0, attended: 0, pct: 0 });
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe('seasonAttendance — what an answer means', () => {
  const NOW = new Date('2026-09-09T10:00:00');
  const LIST = [
    sess('s1', '2026-09-01'), sess('s2', '2026-09-02'), sess('s3', '2026-09-03'),
    sess('s4', '2026-09-04'), sess('s5', '2026-09-05'),
  ];
  const CTX = (availData, overrides) => ({
    trainings: LIST, availData: availData || {}, overrides: overrides || {},
    seasonStart: '2026-08-15', now: NOW,
  });

  it('sorts the four answers into their four buckets', () => {
    const B = loadRule();
    const a = B.seasonAttendance(P1, CTX({
      p1_s1: 'yes', p1_s2: 'late', p1_s3: 'no', p1_s4: 'injured', p1_s5: 'yes',
    }));
    assert.deepStrictEqual(
        { yes: a.yes, late: a.late, no: a.no, injured: a.injured },
        { yes: 2, late: 1, no: 1, injured: 1 });
    assert.strictEqual(a.attended, 3, 'late is not an attendance');
    assert.strictEqual(a.total, 5);
    assert.strictEqual(a.pct, 60);
  });

  /* ⚠ THE OWNER'S DECISION (2026-09-09), and the one thing in here that is a
     product call rather than arithmetic. A player who never answered a
     session that has since HAPPENED counts as having been there. It is why
     the season ring has no grey arc, and why this cannot go through
     getEffectiveAnswer() — that helper answers 'na' for a locked silence,
     and a started session is always past its lock. */
  it('counts a silence on a finished session as an attendance', () => {
    const B = loadRule();
    const a = B.seasonAttendance(P1, CTX({ p1_s1: 'no' }));
    assert.strictEqual(a.yes, 4, 'four silences did not become attendances');
    assert.strictEqual(a.attended, 4);
    assert.strictEqual(a.total, 5, 'a silence left the denominator too');
    assert.strictEqual(a.pct, 80);
  });

  /* A value this app stopped writing must not quietly become an absence —
     the fallback is stated as the attended branch on purpose. */
  it('treats an unrecognised answer as an attendance, not as a miss', () => {
    const B = loadRule();
    const a = B.seasonAttendance(P1, CTX({ p1_s1: 'disponible' }));
    assert.strictEqual(a.no + a.injured, 0, 'an old answer format became an absence');
  });

  it('lets a staff override beat the player, in both directions', () => {
    const B = loadRule();
    const down = B.seasonAttendance(P1, CTX({ p1_s1: 'yes' }, { p1_s1: 'no' }));
    assert.strictEqual(down.no, 1, "the coach's override lost to the player's answer");
    const up = B.seasonAttendance(P1, CTX({ p1_s1: 'no' }, { p1_s1: 'yes' }));
    assert.strictEqual(up.no, 0, "the coach's override lost to the player's answer");
  });

  /* ⚠ The ring and the number in its middle are computed in the same pass
     from the same denominator. Two passes is exactly how they came to
     disagree (v247.4) — 1% in the centre of an all-green ring. */
  it('shares one denominator between the buckets and the percentage', () => {
    const B = loadRule();
    const a = B.seasonAttendance(P1, CTX({ p1_s1: 'no', p1_s2: 'no' }));
    assert.strictEqual(a.yes + a.late + a.no + a.injured, a.total,
        'the buckets do not sum to the denominator the percentage used');
    assert.strictEqual(a.pct, Math.round((a.attended / a.total) * 100));
  });

  it('is 0%, not NaN, when there is nothing to count', () => {
    const B = loadRule();
    const a = B.seasonAttendance(P1, { trainings: [], availData: {}, overrides: {},
      seasonStart: '2026-08-15', now: NOW });
    assert.strictEqual(a.pct, 0);
    assert.strictEqual(a.total, 0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
/* ⚠ THE GUARD THAT ACTUALLY KEEPS THE PAGES AGREEING.
 *
 * Everything above proves the rule is right. None of it notices a page that
 * stops calling it — which is the failure this whole change exists to undo,
 * and the failure the owner predicted would come back "by the next release".
 */
describe('no page may grow a second opinion about attendance', () => {
  it('is the only place the availability blobs are turned into a percentage', () => {
    /* Every site that resolves an availability answer AND divides. The three
       legitimate non-season readers are named and excused by name:
         · _prnBar / _prnSquad and the per-session rings — ONE session's
           split, not a season figure;
         · plTeamSessions — "how many of the squad were out of this session",
           per session, for the chart. */
    const loops = bare.split('\n')
        .map((l, i) => ({ l, i }))
        .filter(({ l }) => /readRecord\([^)]*'avail'\)/.test(l) ||
          /getEffectiveAnswer\(/.test(l));
    assert.ok(loops.length > 0, 'the scan matched nothing, so it proves nothing');
    /* A season figure is a division by a count of sessions. If a new site
       appears that both reads avail records and computes a percentage over
       them, it belongs in seasonAttendance() instead. */
    const suspects = loops.filter(({ i }) => {
      const window = bare.split('\n').slice(i, i + 14).join('\n');
      return /Math\.round\(\(?\(?[a-zA-Z.]+\s*\+\s*[a-zA-Z.]+\)?\s*\/\s*/.test(window) &&
        /100/.test(window);
    });
    assert.deepStrictEqual(suspects.map(({ i }) => i + 1), [],
        'a site reads the availability blobs and computes its own attendance ' +
        'percentage — it must call seasonAttendance() instead. Line(s): ' +
        suspects.map(({ i }) => i + 1).join(', '));
  });

  it('has all five former sites going through the one function', () => {
    /* By name, because the point is that they no longer count for
       themselves. Plantilla reaches it through plAttendance, which is now a
       two-line adapter over the same call. */
    const calls = (bare.match(/seasonAttendance\(/g) || []).length;
    assert.ok(calls >= 5,
        'only ' + calls + ' references to seasonAttendance — a page has ' +
        'stopped calling it');
  });

  it('keeps the two dead denominators from coming back', () => {
    /* The exact expressions the five sites used. `date <= today` is the one
       the owner called out; `players.forEach(… sSlots++)` was the staff
       hero counting every player against every session in scope. */
    assert.ok(!/tr\.date\s*<=\s*todayISO/.test(bare),
        "the staff hero is back on a DATE bound, so tonight's session counts this morning");
    assert.ok(!/\bsSlots\+\+/.test(bare),
        'the staff hero counts players × sessions again rather than summing the rule');
    assert.ok(!/tr\.date\s*>\s*ctx\.today/.test(bare),
        'Plantilla is back on its own season end');
  });

  it('does not resolve attendance through getEffectiveAnswer', () => {
    /* ⚠ NOT a style rule. getEffectiveAnswer() returns 'yes' for an UNLOCKED
       silence and 'na' for a locked one — so using it here would both count
       future sessions as attendances (fault (a)) and make the owner's
       silence-is-an-attendance decision unreachable on the sessions that
       have actually happened. */
    const region = src.slice(src.indexOf('function seasonAttendance(u, ctx) {'),
        src.indexOf('var TRAINING_DEFAULT_LOC'));
    assert.ok(!/getEffectiveAnswer/.test(region),
        'seasonAttendance resolves its answers through getEffectiveAnswer again');
  });

  it('builds its started test on the ONE session window', () => {
    // The handoff's warning: do not add a fourth opinion about when a
    // session is live. sessionWindow() is the existing one.
    const region = src.slice(src.indexOf('function sessionHasStarted(t, now) {'),
        src.indexOf('function attendanceCtx('));
    assert.ok(/sessionWindow\(/.test(region),
        'sessionHasStarted parses the time itself instead of using sessionWindow');
  });
});
