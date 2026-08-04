/* End-to-end tests for the deleteTeam callable.
 *
 * `npm run test:teams` (needs Java + the emulators). Runs the REAL
 * functions/index.js against the Firestore emulator, driving the callable
 * through its v2 `.run()` handle rather than over HTTP.
 *
 * This is the most destructive code in the app: it erases a squad's matches,
 * medical history and availability, and there is no way back. Two properties
 * matter more than the rest, and both are easy to break invisibly:
 *
 *   1. It must delete ONE team out of a shard the other team co-owns.
 *      Shards are per CATEGORY, never per letter, so amateur-A and amateur-B
 *      live in the same document. A whole-document delete would take both.
 *   2. It must NOT touch Firebase Auth. The players are detached, not
 *      erased — profile kept, category/team cleared, so they show as
 *      unassigned and can be put on another team.
 *
 * The ordering assertions are the subtle ones. `fa_injuries__none` being
 * empty afterwards is what proves the roster document was deleted LAST: were
 * it deleted first, onRosterWritten would detach the members, which fires
 * reshardMember, which MOVES their medical rows into __none — where this
 * function has already been and gone.
 */
'use strict';

const assert = require('assert');
const admin = require('firebase-admin');

const PROJECT = 'demo-esquerrapp';
const CLUB = 'quotaClub';
const LEAD = 'leadQ';
const P_A = 'playerA';
const P_B1 = 'playerB1';
const P_B2 = 'playerB2';

if (!admin.apps.length) admin.initializeApp({projectId: PROJECT});
const db = admin.firestore();
const fns = require('../functions/index.js');

const dataDoc = (id) => db.doc('teams/' + CLUB + '/data/' + id);

/** A data doc in either storage format, normalised for assertions. */
async function blob(id) {
  const s = await dataDoc(id).get();
  if (!s.exists) return null;
  const d = s.data();
  if (typeof d.v === 'string') return JSON.parse(d.v);
  const out = {};
  Object.keys(d).forEach((k) => {
    if (k !== 'category' && k !== '_migrated' && k !== 'v') out[k] = d[k];
  });
  return out;
}

/** Drive the callable as the club's lead. */
function callDelete(data, uid) {
  return fns.deleteTeam.run({
    auth: {uid: uid || LEAD, token: {teamId: CLUB, role: 'lead', email: 'lead@x.com'}},
    data: data,
    rawRequest: {},
  });
}

/** amateur-A keeps one player and one match; amateur-B gets everything else. */
async function seed() {
  await db.doc('clubs/' + CLUB).set({
    name: 'Quota Club', leadEmail: 'lead@x.com', maxTeams: 2,
    categories: {amateur: {enabled: true, letters: ['A', 'B']}},
    fcfLinks: {'amateur-A': 'urlA', 'amateur-B': 'urlB'},
    schedules: {'amateur-A': {training: []}, 'amateur-B': {training: []}},
  });
  await db.doc('clubs/' + CLUB + '/rosters/amateur-A')
      .set({staffEmails: [], playerEmails: ['a@x.com']});
  await db.doc('clubs/' + CLUB + '/rosters/amateur-B')
      .set({staffEmails: [], playerEmails: ['b1@x.com', 'b2@x.com']});

  const mk = (uid, email, team) => db.doc('users/' + uid).set({
    id: uid, email, teamId: CLUB, category: 'amateur', team,
    roles: ['player'], name: uid,
  });
  await mk(P_A, 'a@x.com', 'A');
  await mk(P_B1, 'b1@x.com', 'B');
  await mk(P_B2, 'b2@x.com', 'B');
  await db.doc('users/' + LEAD).set({
    id: LEAD, email: 'lead@x.com', teamId: CLUB, isTeamLead: true, roles: ['staff'],
  });

  // Both teams share ONE shard document per key — the whole difficulty.
  await dataDoc('fa_matches__amateur').set({category: 'amateur', v: JSON.stringify([
    {id: 1, team: 'A', date: '2026-05-02', home: 'Us', away: 'Them'},
    {id: 2, team: 'B', date: '2026-05-09', home: 'Us', away: 'Them'},
    {id: 3, team: '', date: '2026-05-16', home: 'Us', away: 'Them'},
  ])});
  await dataDoc('fa_match_events__amateur').set({category: 'amateur', v: JSON.stringify({
    1: [{id: 'e1', type: 'goal', playerId: P_A}],
    2: [{id: 'e2', type: 'goal', playerId: P_B1}],
    3: [{id: 'e3', type: 'goal', playerId: P_A}],
  })});
  await dataDoc('fa_convocatoria_sent__amateur').set({category: 'amateur', v: JSON.stringify({
    1: {players: [P_A]}, 2: {players: [P_B1, P_B2]},
  })});
  await dataDoc('fa_users__amateur').set({category: 'amateur', v: JSON.stringify([
    {id: P_A, name: 'A', category: 'amateur', team: 'A'},
    {id: P_B1, name: 'B1', category: 'amateur', team: 'B'},
    {id: P_B2, name: 'B2', category: 'amateur', team: 'B'},
  ])});
  await dataDoc('fa_injuries__amateur').set({category: 'amateur', v: JSON.stringify([
    {id: 'i1', playerId: P_A, status: 'active'},
    {id: 'i2', playerId: P_B1, status: 'active'},
  ])});
  // Per-field merge format, the other storage shape the scrub must handle.
  await dataDoc('fa_injury_notes__amateur').set({
    category: 'amateur', [P_A]: 'keep me', [P_B1]: 'delete me',
  });
  await dataDoc('fa_training__amateur').set({category: 'amateur', v: JSON.stringify([
    {id: 'tr1', date: '2026-05-01', time: '20:00'},
  ])});

  const rec = (coll, id, fields) =>
    db.doc('teams/' + CLUB + '/' + coll + '/' + id).set(fields);
  await rec('trainingAvail', P_A + '_2026-05-01', {uid: P_A, date: '2026-05-01', value: 'yes'});
  await rec('trainingAvail', P_B1 + '_2026-05-01', {uid: P_B1, date: '2026-05-01', value: 'yes'});
  await rec('rpe', P_B1 + '_training_2026-05-01', {uid: P_B1, rpe: 7, minutes: 90});
  await rec('matchAvail', P_A + '_2', {uid: P_A, matchId: '2', value: 'disponible'});
}

describe('deleteTeam', function () {
  this.timeout(120000);

  before(async () => {
    await seed();
    await callDelete({category: 'amateur', letter: 'B'});
  });

  it('removes only B\'s matches from the shard A shares', async () => {
    const rows = await blob('fa_matches__amateur');
    assert.deepStrictEqual(rows.map((m) => m.id).sort(), [1, 3],
        'A\'s match and the unlettered one must survive');
  });

  it('keeps matches with no team letter', async () => {
    // They cannot be attributed to the deleted team, and guessing would
    // destroy the surviving team's history.
    const rows = await blob('fa_matches__amateur');
    assert.ok(rows.some((m) => m.id === 3));
  });

  it('removes match-joined entries by id, leaving A\'s', async () => {
    const ev = await blob('fa_match_events__amateur');
    assert.deepStrictEqual(Object.keys(ev).sort(), ['1', '3']);
    const conv = await blob('fa_convocatoria_sent__amateur');
    assert.deepStrictEqual(Object.keys(conv), ['1']);
  });

  it('removes B\'s injuries and keeps A\'s', async () => {
    const inj = await blob('fa_injuries__amateur');
    assert.deepStrictEqual(inj.map((i) => i.id), ['i1']);
  });

  it('removes B\'s per-field injury notes and keeps A\'s', async () => {
    // The other storage format: fields on the document, not a JSON blob.
    const notes = await blob('fa_injury_notes__amateur');
    assert.deepStrictEqual(Object.keys(notes), [P_A]);
  });

  it('MOVES B\'s players into __none rather than deleting the rows', async () => {
    // Deleting them outright means db.js's users→fa_users reconcile re-adds
    // them with stale fields on the next login.
    const amateur = await blob('fa_users__amateur');
    assert.deepStrictEqual(amateur.map((u) => u.id), [P_A]);
    const none = await blob('fa_users__none');
    const moved = none.filter((u) => u.id === P_B1 || u.id === P_B2);
    assert.strictEqual(moved.length, 2);
    moved.forEach((u) => {
      assert.strictEqual(u.category, '', 'category must be cleared');
      assert.strictEqual(u.team, '', 'team must be cleared');
    });
  });

  it('deletes B\'s records and keeps A\'s', async () => {
    const ta = await db.collection('teams/' + CLUB + '/trainingAvail').get();
    assert.deepStrictEqual(ta.docs.map((d) => d.data().uid), [P_A]);
    const rpe = await db.collection('teams/' + CLUB + '/rpe').get();
    assert.strictEqual(rpe.size, 0);
  });

  it('deletes another team\'s availability for a deleted match', async () => {
    // A's answer referred to B's fixture, which no longer exists.
    const ma = await db.collection('teams/' + CLUB + '/matchAvail').get();
    assert.strictEqual(ma.size, 0);
  });

  it('leaves the category\'s training sessions alone while A survives', async () => {
    const tr = await blob('fa_training__amateur');
    assert.deepStrictEqual(tr.map((t) => t.id), ['tr1']);
  });

  it('removes B from the club config, keeping A', async () => {
    const club = (await db.doc('clubs/' + CLUB).get()).data();
    assert.deepStrictEqual(club.categories.amateur.letters, ['A']);
    assert.strictEqual(club.categories.amateur.enabled, true);
    assert.strictEqual(club.fcfLinks['amateur-B'], undefined);
    assert.strictEqual(club.fcfLinks['amateur-A'], 'urlA');
    assert.strictEqual(club.schedules['amateur-B'], undefined);
  });

  it('deletes the roster document', async () => {
    const r = await db.doc('clubs/' + CLUB + '/rosters/amateur-B').get();
    assert.strictEqual(r.exists, false);
  });

  it('deleted the roster doc LAST — no medical data escaped to __none', async () => {
    // Roster-first would detach the members, firing reshardMember, which
    // moves their injury rows into __none AFTER this function passed it.
    const none = await blob('fa_injuries__none');
    assert.ok(!none || none.length === 0,
        'injuries in __none mean the phases were reordered');
  });

  it('records the run in the marker document', async () => {
    const m = (await db.doc('clubs/' + CLUB + '/teamDeletions/amateur-B').get()).data();
    assert.strictEqual(m.status, 'done');
    assert.strictEqual(m.uids, 2);
    assert.strictEqual(m.matches, 1);
  });

  it('is idempotent — a second run changes nothing', async () => {
    // The whole partial-failure story rests on this: validation is tolerant
    // of a letter already gone, and every step is remove-if-present.
    const before = JSON.stringify(await blob('fa_matches__amateur'));
    const res = await callDelete({category: 'amateur', letter: 'B'});
    assert.strictEqual(res.ok, true);
    assert.strictEqual(JSON.stringify(await blob('fa_matches__amateur')), before);
  });

  it('refuses to delete the last remaining team', async () => {
    await assert.rejects(() => callDelete({category: 'amateur', letter: 'A'}),
        (e) => /mínim un equip/.test(e.message));
  });

  it('rejects a caller who is not the lead', async () => {
    await assert.rejects(() => fns.deleteTeam.run({
      auth: {uid: P_A, token: {teamId: CLUB, role: 'player', email: 'a@x.com'}},
      data: {category: 'amateur', letter: 'A'}, rawRequest: {},
    }));
  });

  it('rejects a malformed team', async () => {
    await assert.rejects(() => callDelete({category: 'nope', letter: 'A'}));
    await assert.rejects(() => callDelete({category: 'amateur', letter: 'bb'}));
  });
});
