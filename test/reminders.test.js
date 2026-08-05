/* Unit tests for who a training reminder actually reaches.
 *
 * Pure logic, no emulator: `npm run test:reminders`.
 *
 * The three schedulers used to pick a session by DATE and then notify every
 * player in the CLUB. Two consequences, both live bugs before this:
 *
 *   1. A juvenil player was told to confirm his attendance for an amateur
 *      session, and to log RPE for one he never attended.
 *   2. `scheduledRpeReminder` used `training.find(t => t.date === today)`,
 *      so when two squads trained the same evening only one session was
 *      ever considered — the other squad was never chased, and the first
 *      session's answers were used to judge everybody.
 *
 * Team letters make both worse rather than better: more sessions per date,
 * each for a different squad.
 *
 * squadForSession() mirrors playerIsCalled() in js/app.js and answeredFor()
 * mirrors readRecord(). They cannot share code — functions/ deploys on its
 * own and cannot require ../js at runtime — so these tests pin the two
 * copies to the same rules.
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const src = fs.readFileSync(
    path.join(__dirname, '..', 'functions', 'index.js'), 'utf8');

function grab(from, to) {
  const i = src.indexOf(from);
  const j = src.indexOf(to, i);
  assert.ok(i !== -1 && j !== -1, 'marker not found in functions/index.js: ' + from);
  return src.slice(i, j);
}

/** The two helpers, over a fake users collection. */
function load(users) {
  const db = {
    collection: () => ({
      where: () => ({
        get: async () => ({
          forEach: (fn) => users.forEach((u) =>
            fn({id: u.id, data: () => u})),
        }),
      }),
    }),
  };
  const code = grab('async function squadForSession(teamId, session)',
      '// ── Helper: get all team members ──');
  // eslint-disable-next-line no-new-func
  return new Function('db', `${code}
    return { squadForSession, answeredFor };`)(db);
}

const P = (id, category, team) => ({id, category, team, roles: ['player']});
const ROSTER = [
  P('a1', 'amateur', 'A'),
  P('a2', 'amateur', 'A'),
  P('b1', 'amateur', 'B'),
  P('j1', 'juvenil', 'A'),
  {id: 'coach', category: 'amateur', team: '', roles: ['staff']},
];
const S = (over) => Object.assign(
    {id: 'tr_1', date: '2026-09-01', category: 'amateur'}, over);

describe('reminders — who a session is for', () => {
  const H = load(ROSTER);

  it('never crosses category — the live bug', () => {
    // A juvenil player was being nagged about an amateur session.
    return H.squadForSession('t', S({teams: ['A']})).then((uids) => {
      assert.ok(!uids.includes('j1'));
      assert.deepStrictEqual(uids.sort(), ['a1', 'a2']);
    });
  });

  it('an empty teams list means every letter of the category', () => {
    return H.squadForSession('t', S({})).then((uids) => {
      assert.deepStrictEqual(uids.sort(), ['a1', 'a2', 'b1']);
    });
  });

  it('a session for B leaves A alone', () => {
    return H.squadForSession('t', S({teams: ['B']})).then((uids) => {
      assert.deepStrictEqual(uids, ['b1']);
    });
  });

  it('includes a guest from another category', () => {
    return H.squadForSession('t', S({teams: ['A'], guests: ['j1']})).then((uids) => {
      assert.ok(uids.includes('j1'));
    });
  });

  it('excluded beats everything', () => {
    return H.squadForSession('t', S({teams: ['A'], excluded: ['a1']})).then((uids) => {
      assert.ok(!uids.includes('a1'));
    });
  });

  it('never notifies staff', () => {
    return H.squadForSession('t', S({})).then((uids) => {
      assert.ok(!uids.includes('coach'));
    });
  });

  it('a legacy session with no category still reaches everyone', () => {
    return H.squadForSession('t', S({category: ''})).then((uids) => {
      assert.deepStrictEqual(uids.sort(), ['a1', 'a2', 'b1', 'j1']);
    });
  });
});

describe('reminders — has this player answered', () => {
  const H = load(ROSTER);
  const answers = (arr) => new Set(arr);

  it('counts a session-keyed answer', () => {
    assert.strictEqual(
        H.answeredFor(answers(['a1_tr_1']), 'a1', S({})), true);
  });

  it('counts a legacy date-keyed answer for his own session', () => {
    // An old APK still writes this form and must not be nagged again.
    assert.strictEqual(
        H.answeredFor(answers(['a1_2026-09-01']), 'a1', S({})), true);
  });

  it('does NOT count a legacy answer for a guest appearance', () => {
    /* The same guard as the client. A date-keyed record can only ever have
       meant his own session, so treating it as an answer to a borrowed one
       would silently skip the reminder he actually needs. */
    const borrowed = S({id: 'tr_2', guests: ['j1']});
    assert.strictEqual(
        H.answeredFor(answers(['j1_2026-09-01']), 'j1', borrowed), false);
  });

  it('keeps two sessions on one date apart', () => {
    const a = answers(['a1_tr_am']);
    assert.strictEqual(H.answeredFor(a, 'a1', S({id: 'tr_am'})), true);
    assert.strictEqual(H.answeredFor(a, 'a1', S({id: 'tr_pm'})), false);
  });

  it('reports unanswered when nothing is stored', () => {
    assert.strictEqual(H.answeredFor(answers([]), 'a1', S({})), false);
  });
});

describe('reminders — the schedulers use them', () => {
  it('the training reminder scopes to the squad, not the club', () => {
    const body = grab('exports.scheduledTrainingReminder', 'exports.scheduledRpeReminder');
    assert.ok(body.includes('await squadForSession(teamId, session)'));
    assert.ok(!/getTeamMembersByRole\(teamId, "player"\)/.test(body),
        'the club-wide roster is what nagged the wrong squad');
    assert.ok(body.includes('answeredFor(answered, uid, session)'));
  });

  it('the RPE reminder considers EVERY session that day', () => {
    const body = grab('exports.scheduledRpeReminder', 'exports.scheduledMatchAvailReminder');
    assert.ok(body.includes('training.filter((t) => t.date === today)'),
        'a find() here silently dropped the second squad\'s session');
    assert.ok(body.includes('await squadForSession(teamId, session)'));
  });

  it('notifications are tagged per session, not per date', () => {
    // A date tag collapses two squads' reminders into one on the device.
    const body = grab('exports.scheduledTrainingReminder', 'exports.scheduledRpeReminder');
    assert.ok(body.includes('"training-" + (session.id || session.date)'));
  });
});
