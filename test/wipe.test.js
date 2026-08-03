/* Tests for functions/wipe-team-data.js — the Stage E cutover wipe.
 *
 * It is irreversible and it runs once, against production, in the middle of
 * a maintenance window. So it gets a test: seed a club that has one of
 * everything, run the real script as a child process against the emulator,
 * and assert on both halves of the contract — what goes and what stays.
 *
 * Runs under the same emulator as functions.test.js but in a different
 * PROJECT namespace: the script hardcodes `esquerrapp` (it is a production
 * tool, not a configurable one) while the emulator's own project is
 * `demo-esquerrapp`. Talking to the emulator under the script's own project
 * id keeps the two suites from seeing each other — which matters, because a
 * run without --team wipes every team it can find — and means no test hook
 * has to be added to the script.
 */
'use strict';

const assert = require('assert');
const path = require('path');
const {execFileSync} = require('child_process');
const admin = require('firebase-admin');

// Must match the projectId in functions/wipe-team-data.js.
const PROJECT = 'esquerrapp';
const SCRIPT = path.join(__dirname, '..', 'functions', 'wipe-team-data.js');
const TEAM_A = 'wipeA';
const TEAM_B = 'wipeB';

const app = admin.initializeApp({projectId: PROJECT}, 'wipe');
const db = app.firestore();

/** Run the real script. NODE_PATH lets it find firebase-admin even when
 *  functions/node_modules has not been installed on this machine. */
function runWipe(args) {
  return execFileSync(process.execPath, [SCRIPT].concat(args), {
    encoding: 'utf8',
    env: Object.assign({}, process.env, {
      NODE_PATH: path.join(__dirname, 'node_modules'),
    }),
  });
}

const count = async (ref) => (await ref.count().get()).data().count;

async function state(teamId) {
  const t = db.doc('teams/' + teamId);
  const snap = await t.get();
  const d = snap.data() || {};
  return {
    exists: snap.exists,
    name: d.name,
    trainingDates: d.trainingDates,
    matchDates: d.matchDates,
    data: await count(t.collection('data')),
    trainingAvail: await count(t.collection('trainingAvail')),
    matchAvail: await count(t.collection('matchAvail')),
    rpe: await count(t.collection('rpe')),
    pushQueue: await count(t.collection('pushQueue')),
    seasons: await count(t.collection('seasons')),
    seasonData: await count(t.collection('seasons/2024-25/data')),
    seasonRpe: await count(t.collection('seasons/2024-25/rpe')),
  };
}

async function assertKeepersIntact() {
  assert.ok((await db.doc('users/wipeU1').get()).exists, 'users/ kept');
  assert.strictEqual(await count(db.collection('users/wipeU1/tokens')), 1, 'tokens kept');
  assert.ok((await db.doc('clubs/wipeC1').get()).exists, 'clubs/ kept');
  assert.strictEqual(await count(db.collection('clubs/wipeC1/rosters')), 1,
      'roster email lists kept');
  assert.ok((await db.doc('clubCodes/WIPE01').get()).exists, 'clubCodes kept');
  assert.ok((await db.doc('joinAttempts/wipeU1').get()).exists, 'joinAttempts kept');
}

describe('wipe-team-data.js', function () {
  this.timeout(120000);
  let baseline;

  before(async () => {
    const b = db.batch();
    const a = db.doc('teams/' + TEAM_A);
    b.set(a, {
      name: 'Esquerra',
      trainingDates: ['2026-08-05', '2026-08-07'],
      matchDates: ['2026-08-09'],
    });
    b.set(a.collection('data').doc('fa_training__amateur'), {
      v: JSON.stringify([{id: 't1', date: '2026-08-05', category: 'amateur'}]),
      category: 'amateur',
    });
    b.set(a.collection('data').doc('fa_injuries__cadet'), {
      v: JSON.stringify([{id: 'i1', playerId: 'wipeU1'}]), category: 'cadet',
    });
    b.set(a.collection('data').doc('fa_users'), {          // pre-Phase-5, un-sharded
      v: JSON.stringify([{id: 'wipeU1'}, {id: 'wipeU2'}]),
    });
    b.set(a.collection('data').doc('fa_match_events__none'), {  // merge format
      m1_ev: {kind: 'goal'}, m2_ev: {kind: 'card'}, _migrated: true,
    });
    b.set(a.collection('data').doc('fa_broken__amateur'), {v: '{not json', category: 'amateur'});
    b.set(a.collection('trainingAvail').doc('wipeU1_2026-08-05'), {uid: 'wipeU1'});
    b.set(a.collection('trainingAvail').doc('wipeU2_2026-08-05'), {uid: 'wipeU2'});
    b.set(a.collection('matchAvail').doc('wipeU1_m1'), {uid: 'wipeU1'});
    b.set(a.collection('rpe').doc('wipeU1_2026-08-05'), {uid: 'wipeU1'});
    b.set(a.collection('pushQueue').doc('q1'), {title: 'Reminder'});
    b.set(a.collection('seasons').doc('2024-25'), {label: '2024-25'});
    b.set(a.collection('seasons/2024-25/data').doc('fa_training__amateur'),
        {v: '[]', category: 'amateur'});
    b.set(a.collection('seasons/2024-25/rpe').doc('wipeU1_x'), {uid: 'wipeU1'});

    const t = db.doc('teams/' + TEAM_B);
    b.set(t, {name: 'Barca', trainingDates: ['2026-08-06'], matchDates: []});
    b.set(t.collection('data').doc('fa_matches__juvenil'), {
      v: JSON.stringify([{id: 'm1', date: '2026-08-06', category: 'juvenil'}]),
      category: 'juvenil',
    });
    b.set(t.collection('rpe').doc('wipeU9_x'), {uid: 'wipeU9'});

    // Keepers
    b.set(db.doc('users/wipeU1'), {teamId: TEAM_A, category: 'amateur'});
    b.set(db.doc('users/wipeU1/tokens/tok1'), {token: 'x'});
    b.set(db.doc('clubs/wipeC1'), {name: 'Club'});
    b.set(db.doc('clubs/wipeC1/rosters/amateur'), {players: ['a@b.c']});
    b.set(db.doc('clubCodes/WIPE01'), {clubId: 'wipeC1'});
    b.set(db.doc('joinAttempts/wipeU1'), {count: 1});
    await b.commit();

    baseline = await state(TEAM_A);
    assert.strictEqual(baseline.data, 5, 'seeded 5 data docs');
  });

  it('changes nothing on a dry run, and says what it found', async () => {
    const out = runWipe([]);
    assert.ok(out.includes('DRY-RUN'), 'banner');
    assert.ok(out.includes('[un-sharded, pre-Phase-5]'), 'flags the legacy doc');
    assert.ok(out.includes('entries=-1'), 'flags an unparseable blob');
    assert.ok(out.includes('fa_match_events__none') && out.includes('entries=2'),
        'counts merge-format entries');
    assert.ok(out.includes('seasons/: 1 archives — KEPT'), 'archives kept by default');
    assert.ok(out.includes('Dry run — nothing was deleted'));
    assert.deepStrictEqual(await state(TEAM_A), baseline, 'nothing moved');
  });

  it('--team wipes that club and leaves the other byte-identical', async () => {
    const out = runWipe(['--apply', '--team', TEAM_B]);
    assert.ok(out.includes('Scope: teams/' + TEAM_B + ' only'));
    const b = await state(TEAM_B);
    assert.strictEqual(b.data, 0, 'data wiped');
    assert.strictEqual(b.rpe, 0, 'records wiped');
    assert.ok(b.exists && b.name === 'Barca', 'the team document survives');
    assert.deepStrictEqual(b.trainingDates, [], 'schedule index cleared');
    assert.deepStrictEqual(await state(TEAM_A), baseline, 'the other club untouched');
  });

  it('wipes content, keeps the team, the archives and every keeper', async () => {
    runWipe(['--apply']);
    const a = await state(TEAM_A);
    assert.strictEqual(a.data, 0, 'data/');
    assert.strictEqual(a.trainingAvail, 0, 'trainingAvail/');
    assert.strictEqual(a.matchAvail, 0, 'matchAvail/');
    assert.strictEqual(a.rpe, 0, 'rpe/');
    assert.strictEqual(a.pushQueue, 0, 'pushQueue/');
    assert.ok(a.exists && a.name === 'Esquerra', 'team doc and its fields survive');
    assert.deepStrictEqual(a.trainingDates, [], 'trainingDates cleared');
    assert.deepStrictEqual(a.matchDates, [], 'matchDates cleared');
    assert.strictEqual(a.seasons, 1, 'archive doc kept');
    assert.strictEqual(a.seasonData, 1, 'archived data kept');
    assert.strictEqual(a.seasonRpe, 1, 'archived records kept');
    await assertKeepersIntact();
  });

  it('is idempotent', async () => {
    const a = await state(TEAM_A);
    runWipe(['--apply']);
    assert.deepStrictEqual(await state(TEAM_A), a, 'a second run changes nothing');
  });

  it('--include-seasons takes the archives too', async () => {
    const out = runWipe(['--apply', '--include-seasons']);
    assert.ok(out.includes('WILL BE DELETED (--include-seasons)'));
    const a = await state(TEAM_A);
    assert.strictEqual(a.seasons, 0, 'archive doc');
    assert.strictEqual(a.seasonData, 0, 'archived data');
    assert.strictEqual(a.seasonRpe, 0, 'archived records');
    await assertKeepersIntact();
  });

  it('refuses an unknown --team', () => {
    assert.throws(() => runWipe(['--apply', '--team', 'nope']), (e) => {
      return (String(e.stdout) + String(e.stderr)).includes('No such team');
    });
  });
});
