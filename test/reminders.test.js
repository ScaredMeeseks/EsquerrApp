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

/** The helpers, over a fake users collection. */
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
  /* parseDataDoc and SHARD_NONE come along because squadForMatch reads a
     shard. The parser is grabbed rather than faked: a convocatòria stored
     in the per-field merge format has to resolve the same way here. */
  const code = grab('function parseDataDoc(snap, fallback)', '// ── Phase 5') +
    '\nconst SHARD_NONE = "none";\n' +
    grab('async function squadForSession(teamId, session)',
        '// ── Helper: get all team members ──');
  // eslint-disable-next-line no-new-func
  return new Function('db', `${code}
    return { squadForSession, squadForMatch, matchAsSession, answeredFor };`)(db);
}

/** A teams/{id}/data shard list, as readDataShards returns it. */
function shardsOf(byCat) {
  const list = Object.keys(byCat).map((cat) => ({
    cat,
    snap: {exists: true, data: () => ({v: JSON.stringify(byCat[cat]), category: cat})},
  }));
  return new Map([['fa_convocatoria_sent', list]]);
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

describe('reminders — who a MATCH is for', () => {
  const H = load(ROSTER);
  const M = (over) => Object.assign(
      {id: 4001, date: '2026-09-05', category: 'amateur', team: 'A'}, over);

  it('only the convocatòria — the live bug', () => {
    /* getTeamMembersByRole filters by role alone, so every player in the
       club was told to log RPE for a match they never played, juvenil
       included. b1 is even in the right category and still was not called. */
    const shards = shardsOf({amateur: {4001: {players: ['a1'], startingXI: ['a1']}}});
    return H.squadForMatch('t', M({}), shards).then((r) => {
      assert.deepStrictEqual(r.uids, ['a1']);
      assert.strictEqual(r.source, 'convocatoria');
    });
  });

  it('a convocatòria that called nobody notifies nobody', () => {
    // An empty list is an answer, not a reason to fall back to the club.
    const shards = shardsOf({amateur: {4001: {players: []}}});
    return H.squadForMatch('t', M({}), shards).then((r) => {
      assert.deepStrictEqual(r.uids, []);
      assert.strictEqual(r.source, 'convocatoria');
    });
  });

  it('reads the shard of the match\'s OWN category', () => {
    // Ids can repeat across categories; the wrong shard is the wrong squad.
    const shards = shardsOf({
      amateur: {4001: {players: ['a1', 'a2']}},
      juvenil: {4001: {players: ['j1']}},
    });
    return H.squadForMatch('t', M({}), shards).then((r) => {
      assert.deepStrictEqual(r.uids.sort(), ['a1', 'a2']);
    });
  });

  it('falls back to the match squad, never the club', () => {
    // Fixtures predate the convocatòria feature. Category + letter, not role.
    return H.squadForMatch('t', M({}), shardsOf({})).then((r) => {
      assert.deepStrictEqual(r.uids.sort(), ['a1', 'a2']);
      assert.strictEqual(r.source, 'squad');
      assert.ok(!r.uids.includes('j1') && !r.uids.includes('b1'));
    });
  });

  it('the fallback honours the team letter', () => {
    return H.squadForMatch('t', M({team: 'B'}), shardsOf({})).then((r) => {
      assert.deepStrictEqual(r.uids, ['b1']);
    });
  });

  it('a legacy match with no category still reaches everyone', () => {
    const m = M({category: '', team: ''});
    return H.squadForMatch('t', m, shardsOf({})).then((r) => {
      assert.deepStrictEqual(r.uids.sort(), ['a1', 'a2', 'b1', 'j1']);
    });
  });

  it('matches a string matchId against a numeric one', () => {
    // JSON object keys are strings; fa_matches ids are numbers.
    const shards = shardsOf({amateur: {4001: {players: ['a2']}}});
    return H.squadForMatch('t', M({id: '4001'}), shards).then((r) => {
      assert.deepStrictEqual(r.uids, ['a2']);
      assert.strictEqual(r.source, 'convocatoria');
    });
  });

  it('never notifies staff through the fallback', () => {
    return H.squadForMatch('t', M({team: ''}), shardsOf({})).then((r) => {
      assert.ok(!r.uids.includes('coach'));
    });
  });
});

describe('reminders — who to ASK about a match', () => {
  /* The Friday availability reminder. It cannot read the convocatòria the
     way the RPE one does — it runs BEFORE one exists, to collect the
     answers the coach picks from — so the audience is the squad: category
     plus team letter. */
  const H = load(ROSTER);
  const M = (over) => Object.assign(
      {id: 4001, date: '2026-09-05', category: 'amateur', team: 'A'}, over);

  it('asks amateur A and nobody else — the live bug', () => {
    // Three fixtures on one weekend meant three pushes to every player in
    // the club, two of them about teams he is not in.
    return H.squadForSession('t', H.matchAsSession(M({}))).then((uids) => {
      assert.deepStrictEqual(uids.sort(), ['a1', 'a2']);
    });
  });

  it('asks the B squad about a B fixture', () => {
    return H.squadForSession('t', H.matchAsSession(M({team: 'B'}))).then((uids) => {
      assert.deepStrictEqual(uids, ['b1']);
    });
  });

  it('a fixture with no letter means every letter of the category', () => {
    // What it meant before letters existed, and the only honest reading.
    return H.squadForSession('t', H.matchAsSession(M({team: ''}))).then((uids) => {
      assert.deepStrictEqual(uids.sort(), ['a1', 'a2', 'b1']);
    });
  });

  it('never crosses category', () => {
    return H.squadForSession('t', H.matchAsSession(M({}))).then((uids) => {
      assert.ok(!uids.includes('j1'));
    });
  });

  it('never asks staff', () => {
    return H.squadForSession('t', H.matchAsSession(M({team: ''}))).then((uids) => {
      assert.ok(!uids.includes('coach'));
    });
  });

  it('asks an INJURED player too', () => {
    /* Availability is a question, not a status. A player recovering may
       well be fit by Sunday, and that answer is the coach's to receive
       rather than the server's to assume — so no injury filter belongs
       anywhere on this path. Asserted on behaviour, not on a grep for
       "injur", which cannot tell a filter apart from a comment saying
       there is no filter. */
    const injured = load([
      P('a1', 'amateur', 'A'),
      Object.assign(P('a3', 'amateur', 'A'),
          {fitnessStatus: 'injured', injured: true}),
    ]);
    return injured.squadForSession('t', injured.matchAsSession(M({}))).then((uids) => {
      assert.ok(uids.includes('a3'), 'an injured player is still asked');
    });
  });

  it('carries a match\'s single letter into a session\'s list', () => {
    assert.deepStrictEqual(H.matchAsSession(M({})).teams, ['A']);
    assert.deepStrictEqual(H.matchAsSession(M({team: ''})).teams, []);
    assert.strictEqual(H.matchAsSession(M({id: 7})).id, '7');
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

  it('the RPE reminder scopes a MATCH to the convocatòria', () => {
    const body = grab('exports.scheduledRpeReminder', 'exports.scheduledMatchAvailReminder');
    assert.ok(body.includes('await squadForMatch(teamId, match, shards)'));
    assert.ok(!/getTeamMembersByRole\(teamId, "player"\)/.test(body),
        'the club-wide roster nagged players who were never called up');
    assert.ok(body.includes('matches.filter((m) => m.date === today)'),
        'a find() here dropped the second category\'s match');
    assert.ok(body.includes('"fa_convocatoria_sent"'),
        'the shard has to be READ for squadForMatch to see it');
  });

  it('the availability reminder scopes to the squad, not the club', () => {
    const body = grab('exports.scheduledMatchAvailReminder', '// ── 5. fcfClassificacio');
    assert.ok(body.includes('await squadForSession(teamId, matchAsSession(match))'));
    assert.ok(!/getTeamMembersByRole\(teamId, "player"\)/.test(body),
        'three weekend fixtures meant three pushes to every player in the club');
  });

  it('notifications are tagged per session, not per date', () => {
    // A date tag collapses two squads' reminders into one on the device.
    const body = grab('exports.scheduledTrainingReminder', 'exports.scheduledRpeReminder');
    assert.ok(body.includes('"training-" + (session.id || session.date)'));
  });
});
