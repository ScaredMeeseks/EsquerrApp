/* The record listeners read what the rules allow, and no more (v288).
 *
 * trainingAvail / matchAvail / rpe used to be readable by every member of the
 * club, and every member listened to the WHOLE of each. Since v288 a record
 * carries `category` — the squad its session or match is for — and the rules
 * let a player read their own squad's records and their own; staff read all.
 * A listener has to ask for exactly that, because a query the rules could
 * refuse for even one document is refused outright.
 *
 * Real db.js over test/fake-firestore.js, with a signed-in user whose claims
 * are set per test.
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const {FakeStore, makeApi, FakeLocalStorage} = require('./fake-firestore');
const Shard = require('../js/shard.js');

const DB_SRC = fs.readFileSync(path.join(__dirname, '..', 'js', 'db.js'), 'utf8');
const TEAM = 'teamA';
const flush = () => new Promise((r) => setImmediate(r));

function bootstrap(user) {
  const store = new FakeStore();
  const {db, firebase} = makeApi(store);
  const localStorage = new FakeLocalStorage();
  const sandbox = {
    localStorage, db, firebase, Shard, console,
    auth: {currentUser: user ? {uid: user.uid,
      getIdTokenResult: async () => ({claims: {role: user.role, cats: user.cats, teamId: TEAM}})} : null},
    window: {dispatchEvent: () => {}},
    CustomEvent: class { constructor(type, init) { this.type = type; this.detail = init && init.detail; } },
    Promise, JSON, Object, Array, Error, String, Set, Map,
  };
  sandbox.globalThis = sandbox;
  const DB = vm.runInNewContext(DB_SRC + '\n;DB;', sandbox, {filename: 'db.js'});
  store.seed('teams/' + TEAM, {name: TEAM});
  return {DB, store, localStorage, db};
}

function seedRecords(store) {
  const rec = (id, d) => store.seed('teams/' + TEAM + '/trainingAvail/' + id, d);
  rec('me_tr1', {uid: 'me', sessionId: 'tr1', value: 'yes', category: 'amateur'});
  rec('me_2026-01-01', {uid: 'me', date: '2026-01-01', value: 'no'});                     // before the stamp
  rec('me_trJ', {uid: 'me', sessionId: 'trJ', value: 'yes', category: 'juvenil'});       // a guest call-up
  rec('mate_tr1', {uid: 'mate', sessionId: 'tr1', value: 'injured', category: 'amateur'});
  rec('juv_trJ', {uid: 'juv', sessionId: 'trJ', value: 'injured', category: 'juvenil'});  // another squad
}
const keys = (ls) => Object.keys(JSON.parse(ls.getItem('fa_training_availability') || '{}')).sort();

describe('db.js — the record listeners ask for what the rules allow (v288)', () => {
  it('a player: their squad\'s records, and every one of their own — not another squad\'s', async () => {
    const {DB, store, localStorage} = bootstrap({uid: 'me', role: 'player', cats: ['amateur']});
    seedRecords(store);
    await DB.init(TEAM, ['amateur']);
    await flush();
    assert.deepStrictEqual(keys(localStorage), ['mate_tr1', 'me_2026-01-01', 'me_tr1', 'me_trJ']);
  });

  it('staff: the whole club, as before', async () => {
    const {DB, store, localStorage} = bootstrap({uid: 'coach', role: 'staff', cats: ['amateur']});
    seedRecords(store);
    await DB.init(TEAM, ['amateur']);
    await flush();
    assert.deepStrictEqual(keys(localStorage), ['juv_trJ', 'mate_tr1', 'me_2026-01-01', 'me_tr1', 'me_trJ']);
  });

  it('a record both queries return is in the blob once, with its answer', async () => {
    const {DB, store, localStorage} = bootstrap({uid: 'me', role: 'player', cats: ['amateur']});
    seedRecords(store);
    await DB.init(TEAM, ['amateur']);
    await flush();
    const blob = JSON.parse(localStorage.getItem('fa_training_availability'));
    assert.strictEqual(blob.me_tr1, 'yes');
  });

  it('a teammate\'s answer withdrawn leaves the blob; an answer added arrives', async () => {
    const {DB, store, localStorage, db} = bootstrap({uid: 'me', role: 'player', cats: ['amateur']});
    seedRecords(store);
    await DB.init(TEAM, ['amateur']);
    await flush();
    await db.collection('teams').doc(TEAM).collection('trainingAvail').doc('mate_tr1').delete();
    await db.collection('teams').doc(TEAM).collection('trainingAvail').doc('mate2_tr1')
        .set({uid: 'mate2', sessionId: 'tr1', value: 'late', category: 'amateur'});
    await flush();
    const k = keys(localStorage);
    assert.ok(!k.includes('mate_tr1'), 'a withdrawn answer is still there');
    assert.ok(k.includes('mate2_tr1'), 'a new answer did not arrive');
  });

  /* Half a blob reads as answers withdrawn: the session page would show a
     player's own answers gone until the second query caught up. */
  it('writes nothing until BOTH queries have answered', async () => {
    const {DB, store, localStorage} = bootstrap({uid: 'me', role: 'player', cats: ['amateur']});
    seedRecords(store);
    let release;
    const held = new Promise((r) => { release = r; });
    store.onQuery = (q) => (q.filter && q.filter.field === 'uid' ? held : null);
    const ready = DB.init(TEAM, ['amateur']);
    await flush(); await flush();
    assert.strictEqual(localStorage.getItem('fa_training_availability'), null,
        'the squad\'s half was written before the player\'s own arrived');
    release();
    await ready;
    await flush();
    assert.deepStrictEqual(keys(localStorage), ['mate_tr1', 'me_2026-01-01', 'me_tr1', 'me_trJ']);
  });

  it('a refused query does not hold the other\'s answers back', async () => {
    const {DB, store, localStorage} = bootstrap({uid: 'me', role: 'player', cats: ['amateur']});
    seedRecords(store);
    store.onQuery = (q) => (q.filter && q.filter.field === 'uid' ? 'refuse' : null);
    const errs = [];
    const realErr = console.error;
    console.error = (...a) => errs.push(a);
    try {
      await DB.init(TEAM, ['amateur']);
      await flush();
    } finally { console.error = realErr; }
    assert.deepStrictEqual(keys(localStorage), ['mate_tr1', 'me_tr1']);
    assert.ok(errs.length, 'the refusal was swallowed silently');
  });

  it('RPE and match answers follow the same rule', async () => {
    const {DB, store, localStorage} = bootstrap({uid: 'me', role: 'player', cats: ['amateur']});
    store.seed('teams/' + TEAM + '/rpe/mate_training_tr1', {uid: 'mate', rpe: 6, category: 'amateur'});
    store.seed('teams/' + TEAM + '/rpe/juv_training_trJ', {uid: 'juv', rpe: 9, category: 'juvenil'});
    store.seed('teams/' + TEAM + '/matchAvail/juv_9', {uid: 'juv', matchId: '9', value: 'no', category: 'juvenil'});
    store.seed('teams/' + TEAM + '/matchAvail/me_9', {uid: 'me', matchId: '9', value: 'disponible'});
    await DB.init(TEAM, ['amateur']);
    await flush();
    assert.deepStrictEqual(Object.keys(JSON.parse(localStorage.getItem('fa_player_rpe'))), ['mate_training_tr1']);
    assert.deepStrictEqual(Object.keys(JSON.parse(localStorage.getItem('fa_match_availability'))), ['me_9']);
  });
});
