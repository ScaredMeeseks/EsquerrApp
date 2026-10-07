/* The acta import, end to end (v278): importFcfActa, linkFcfPlayer,
 * scheduledActaImport and guardFcfActa.
 *
 * Runs in `npm run test:functions` against the REAL functions/index.js:
 * the callables and the scheduled job through their v2 `.run()` handles in
 * this process, with `fetch` answered from the anonymised acta fixtures —
 * nothing leaves the machine — and the guard as a real trigger in the
 * Functions emulator, driven by writing to Firestore the way a stale phone
 * would.
 */
'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const admin = require('firebase-admin');
const {parseFcfActaEvents} = require('../functions/fcf');
const {fcfPersonName} = require('../functions/acta');

const PROJECT = 'demo-esquerrapp';
const CLUB = 'actaClub';
if (!admin.apps.length) admin.initializeApp({projectId: PROJECT});
const db = admin.firestore();
const fns = require('../functions/index.js');

const FIX = (n) => fs.readFileSync(path.join(__dirname, 'fixtures', n), 'utf8');
const CLOSED = FIX('acta-events-own-goal.html');
const PENDING = FIX('acta-events-pending.html');
const UNPLAYED = FIX('acta-events-unplayed.html');
const AWARDED = FIX('acta-events-awarded.html');
const ACTA = parseFcfActaEvents(CLOSED);
const HOME = ACTA.home.name;                  // the club is the home side
const MID = 4119501;
const p = (dorsal) => ACTA.players.find((x) => x.side === 'home' && x.dorsal === String(dorsal));
const SURE = p(10);                           // one app player fits him
const TWIN = p(24);                           // two app players fit him
const OTHER = p(14);

let page = CLOSED;
let fetched = 0;
const realFetch = global.fetch;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function eventually(fn, ms) {
  const deadline = Date.now() + (ms || 25000);
  for (;;) {
    try {
      await fn();
      return;
    } catch (e) {
      if (Date.now() > deadline) throw e;
      await sleep(400);
    }
  }
}
const data = (key) => db.doc('teams/' + CLUB + '/data/' + key + '__amateur');
async function read(key, fb) {
  const s = await data(key).get();
  return s.exists ? JSON.parse(s.data().v) : fb;
}
function row(id, extra) {
  return Object.assign({id, home: HOME, away: ACTA.away.name, date: '2026-09-19', time: '18:00',
    category: 'amateur', team: 'A', fcfActaId: '4119501', status: 'played', score: null}, extra || {});
}
function call(fn, d, token) {
  return fns[fn].run({
    auth: {uid: 'coach', token: Object.assign({teamId: CLUB, role: 'staff', cats: ['amateur']}, token || {})},
    data: d, rawRequest: {},
  });
}
async function wipe() {
  for (const coll of ['fcfActa']) {
    const s = await db.collection('teams/' + CLUB + '/' + coll).get();
    await Promise.all(s.docs.map((d) => d.ref.delete()));
  }
  const reg = await db.collection('clubs/' + CLUB + '/fcfPlayers').get();
  await Promise.all(reg.docs.map((d) => d.ref.delete()));
  const q = await db.collection('fcfActaQueue').where('clubId', '==', CLUB).get();
  await Promise.all(q.docs.map((d) => d.ref.delete()));
  for (const k of ['fa_match_events', 'fa_matches', 'fa_convocatoria_sent']) await data(k).delete();
}
async function seed(matches, events) {
  await data('fa_matches').set({v: JSON.stringify(matches), category: 'amateur'});
  if (events) await data('fa_match_events').set({v: JSON.stringify(events), category: 'amateur'});
}

describe('the acta import', function () {
  this.timeout(120000);

  before(async () => {
    global.fetch = async (url) => {
      fetched++;
      assert.ok(String(url).indexOf('https://www.fcf.cat/ca/competicio/acta/') === 0, String(url));
      return {ok: true, status: 200, text: async () => page};
    };
    await db.doc('clubs/' + CLUB).set({name: HOME, categories: {amateur: {enabled: true, letters: ['A']}}});
    const users = [
      ['u1', fcfPersonName(SURE.name).display, ['player'], 'amateur'],
      ['u2', fcfPersonName(TWIN.name).display, ['player'], 'amateur'],
      ['u3', fcfPersonName(TWIN.name).display, ['player'], 'amateur'],
      ['u4', fcfPersonName(OTHER.name).display, ['player'], 'amateur'],
      ['s1', fcfPersonName(p(18).name).display, ['staff'], 'amateur'],
      ['j1', fcfPersonName(p(13).name).display, ['player'], 'juvenil'],
    ];
    await Promise.all(users.map(([id, name, roles, category]) =>
      db.doc('users/' + id).set({teamId: CLUB, name, roles, category, team: 'A'})));
  });
  after(() => {
    global.fetch = realFetch;
  });
  beforeEach(async () => {
    page = CLOSED;
    fetched = 0;
    await wipe();
  });

  it('refuses a player, another squad\'s coach, and a malformed id', async () => {
    await seed([row(MID)]);
    await assert.rejects(() => call('importFcfActa', {matchId: MID}, {role: 'player'}),
        (e) => e.code === 'permission-denied');
    await assert.rejects(() => call('importFcfActa', {matchId: MID}, {cats: ['juvenil']}),
        (e) => e.code === 'permission-denied');
    await assert.rejects(() => call('importFcfActa', {matchId: 'x/../y'}),
        (e) => e.code === 'invalid-argument');
    assert.strictEqual((await data('fa_match_events').get()).exists, false);
  });

  it('writes nothing for an acta the federation has not closed', async () => {
    await seed([row(MID)]);
    page = PENDING;
    const r = await call('importFcfActa', {matchId: MID});
    assert.strictEqual(r.status, 'not-closed');
    assert.strictEqual((await data('fa_match_events').get()).exists, false);
    assert.strictEqual((await read('fa_matches', []))[0].fcfActa, undefined);
  });

  it('writes nothing for a closed acta of a match that was never played', async () => {
    await seed([row(MID)]);
    page = UNPLAYED;
    const r = await call('importFcfActa', {matchId: MID});
    assert.strictEqual(r.status, 'no-result');
    assert.strictEqual((await data('fa_match_events').get()).exists, false);
    assert.strictEqual((await read('fa_matches', []))[0].fcfActa, undefined);
  });

  it('reports a result awarded with no goals and writes nothing', async () => {
    await seed([row(MID)], {[MID]: [{id: 'h', side: 'home', type: 'pal', minute: '3'}]});
    page = AWARDED;
    const r = await call('importFcfActa', {matchId: MID});
    assert.deepStrictEqual([r.status, r.score], ['awarded', '0-3']);
    assert.deepStrictEqual((await read('fa_match_events', {}))[MID].map((e) => e.id), ['h']);
    assert.strictEqual((await read('fa_matches', []))[0].fcfActa, undefined);
  });

  it('imports the acta: events, result, line-up, and the one link it is sure of', async () => {
    await seed([row(MID)]);
    const r = await call('importFcfActa', {matchId: MID});
    assert.strictEqual(r.status, 'imported', JSON.stringify(r));
    assert.deepStrictEqual([r.counts.goals, r.counts.cards, r.counts.subs], [1, 6, 10]);

    const evs = (await read('fa_match_events', {}))[MID];
    assert.strictEqual(evs.length, 17);
    assert.ok(evs.every((e) => e.src === 'fcf'));
    const m = (await read('fa_matches', []))[0];
    assert.deepStrictEqual([m.score, m.status], ['1-0', 'played']);
    assert.strictEqual(m.fcfActa.lineup.length, 19);
    assert.strictEqual(m.fcfActa.src, 'manual');

    const sure = m.fcfActa.lineup.find((x) => x.f === SURE.id);
    assert.deepStrictEqual([sure.u, sure.a], ['u1', 1]);
    const twin = m.fcfActa.lineup.find((x) => x.f === TWIN.id);
    assert.strictEqual(twin.u, '', 'two app players share his name — that is a question');
    assert.deepStrictEqual(twin.c.slice().sort(), ['u2', 'u3']);
    const reg = await db.doc('clubs/' + CLUB + '/fcfPlayers/' + SURE.id).get();
    assert.deepStrictEqual([reg.data().uid, reg.data().status, reg.data().source], ['u1', 'linked', 'auto']);

    // u4 carries #14's name exactly, and nobody else does: linked too.
    const linked = m.fcfActa.lineup.filter((x) => x.u).map((x) => x.u);
    assert.deepStrictEqual(linked.slice().sort(), ['u1', 'u4']);
    const sent = (await read('fa_convocatoria_sent', {}))[MID];
    assert.deepStrictEqual(sent.players, linked);
    assert.deepStrictEqual(sent.startingXI, m.fcfActa.lineup.filter((x) => x.u && x.t).map((x) => x.u));
    assert.ok(sent.startingXI.indexOf('u1') !== -1);

    const led = await db.doc('teams/' + CLUB + '/fcfActa/' + MID).get();
    assert.deepStrictEqual([led.data().facts.length, led.data().category, led.data().score],
        [17, 'amateur', '1-0']);
  });

  it('adopts the coach\'s own goal entry for the same goal and drops the ones the acta lacks', async () => {
    const scorer = ACTA.players.find((x) => x.id === ACTA.goals[0].id);
    await seed([row(MID)], {[MID]: [
      {id: 'hand-og', side: 'away', type: 'own_goal', minute: '84', playerNumber: scorer.dorsal},
      {id: 'hand-x', side: 'home', type: 'goal', minute: '50', playerId: 'u4'},
      {id: 'hand-pal', side: 'home', type: 'pal', minute: '33', playerId: 'u4'},
    ]});
    const r = await call('importFcfActa', {matchId: MID});
    assert.strictEqual(r.summary.adopted, 1);
    const evs = (await read('fa_match_events', {}))[MID];
    const og = evs.find((e) => e.id === 'hand-og');
    assert.deepStrictEqual([og.minute, og.src], ['85', 'fcf']);
    assert.ok(!evs.some((e) => e.id === 'hand-x'));
    assert.ok(evs.some((e) => e.id === 'hand-pal'));
  });

  it('a second import changes nothing and writes nothing', async () => {
    await seed([row(MID)]);
    await call('importFcfActa', {matchId: MID});
    const t1 = (await data('fa_match_events').get()).updateTime;
    const r = await call('importFcfActa', {matchId: MID});
    assert.deepStrictEqual([r.summary.added, r.summary.refreshed], [0, 17]);
    assert.ok((await data('fa_match_events').get()).updateTime.isEqual(t1), 'the shard was rewritten');
  });

  it('linking a name re-points every match that lists him, and moving a link frees the old name', async () => {
    await seed([row(MID), row(MID + 1)]);
    await call('importFcfActa', {matchId: MID});
    await call('importFcfActa', {matchId: MID + 1});
    const r = await call('linkFcfPlayer', {fcfId: TWIN.id, uid: 'u2'});
    assert.deepStrictEqual([r.matches, r.displaced], [2, '']);
    let evs = await read('fa_match_events', {});
    [MID, MID + 1].forEach((mid) => {
      const mine = evs[mid].filter((e) => e.fcfPlayerId === TWIN.id || e.fcfPlayerOutId === TWIN.id);
      assert.ok(mine.length > 0);
      mine.forEach((e) => assert.strictEqual(e.playerId || e.playerOutId, 'u2', JSON.stringify(e)));
    });
    // u2 is now said to be somebody else: the first name goes back to the picker
    const r2 = await call('linkFcfPlayer', {fcfId: OTHER.id, uid: 'u2'});
    assert.strictEqual(r2.displaced, TWIN.id);
    evs = await read('fa_match_events', {});
    evs[MID].filter((e) => e.fcfPlayerId === TWIN.id).forEach((e) => assert.strictEqual(e.playerId, ''));
    const m = (await read('fa_matches', [])).find((x) => x.id === MID);
    assert.strictEqual(m.fcfActa.lineup.find((x) => x.f === OTHER.id).u, 'u2');
    assert.strictEqual(m.fcfActa.lineup.find((x) => x.f === TWIN.id).u, '');
  });

  it('refuses to link an acta name to someone who is not a player of this club', async () => {
    await assert.rejects(() => call('linkFcfPlayer', {fcfId: TWIN.id, uid: 's1'}),
        (e) => e.code === 'invalid-argument');
    await assert.rejects(() => call('linkFcfPlayer', {fcfId: TWIN.id, uid: 'u1'}, {role: 'player'}),
        (e) => e.code === 'permission-denied');
  });

  it('puts the acta back when a stale phone writes over it, keeping what the coach added', async () => {
    await seed([row(MID)], {[MID]: []});
    await call('importFcfActa', {matchId: MID});
    // What a phone that never saw the import holds: the old match, plus a
    // post the coach logged at the pitch.
    await data('fa_match_events').set({v: JSON.stringify({[MID]: [
      {id: 'pitch-pal', side: 'home', type: 'pal', minute: '20'},
      {id: 'pitch-goal', side: 'home', type: 'goal', minute: '30', playerId: 'u4'},
    ]}), category: 'amateur'});
    await eventually(async () => {
      const evs = (await read('fa_match_events', {}))[MID];
      assert.strictEqual(evs.filter((e) => e.src === 'fcf').length, 17);
      assert.ok(evs.some((e) => e.id === 'pitch-pal'), 'the coach\'s post was lost');
      assert.ok(!evs.some((e) => e.id === 'pitch-goal'), 'a hand goal survived the acta');
    });
    // …and the row's result the same way.
    await data('fa_matches').set({v: JSON.stringify([row(MID, {score: '0-0'})]), category: 'amateur'});
    await eventually(async () => {
      const m = (await read('fa_matches', []))[0];
      assert.deepStrictEqual([m.score, !!m.fcfActa], ['1-0', true]);
    });
  });

  it('the scheduled job tries, backs off, then imports and forgets the item', async () => {
    await db.doc('fcfCrawl/actaImport').set({enabled: true});
    await seed([row(MID)]);
    const q = db.doc('fcfActaQueue/' + CLUB + '__' + MID);
    const kick = Date.now() - 3 * 3600000;
    await q.set({clubId: CLUB, matchId: MID, category: 'amateur', actaId: '4119501',
      kickoffAt: kick, dueAt: Date.now() - 1000, attempts: 0, lastStatus: ''});
    page = PENDING;
    await fns.scheduledActaImport.run({});
    const after1 = (await q.get()).data();
    assert.deepStrictEqual([after1.attempts, after1.lastStatus], [1, 'not-closed']);
    assert.ok(after1.dueAt > Date.now(), 'not pushed into the future');
    await q.update({dueAt: Date.now() - 1000});
    page = CLOSED;
    await fns.scheduledActaImport.run({});
    assert.strictEqual((await q.get()).exists, false);
    const m = (await read('fa_matches', []))[0];
    assert.strictEqual(m.fcfActa.src, 'auto');
  });

  it('the scheduled job stops asking about a match that was never played', async () => {
    await db.doc('fcfCrawl/actaImport').set({enabled: true});
    await seed([row(MID)]);
    const q = db.doc('fcfActaQueue/' + CLUB + '__' + MID);
    await q.set({clubId: CLUB, matchId: MID, category: 'amateur', actaId: '4119501',
      kickoffAt: Date.now() - 3 * 3600000, dueAt: Date.now() - 1000, attempts: 0, lastStatus: ''});
    page = UNPLAYED;
    await fns.scheduledActaImport.run({});
    assert.strictEqual((await q.get()).exists, false);
  });

  it('the scheduled job never chases a demo club\'s invented actas', async () => {
    await db.doc('fcfCrawl/actaImport').set({enabled: true});
    await db.doc('clubs/' + CLUB).set({demoSeed: true}, {merge: true});
    try {
      await seed([row(MID)]);
      const q = db.doc('fcfActaQueue/' + CLUB + '__' + MID);
      await q.set({clubId: CLUB, matchId: MID, category: 'amateur', actaId: '4119501',
        kickoffAt: Date.now() - 3 * 3600000, dueAt: Date.now() - 1000, attempts: 0});
      await fns.scheduledActaImport.run({});
      assert.strictEqual(fetched, 0);
      assert.strictEqual((await q.get()).exists, false);
    } finally {
      await db.doc('clubs/' + CLUB).update({demoSeed: require('firebase-admin/firestore').FieldValue.delete()});
    }
  });

  it('the scheduled job does nothing while switched off', async () => {
    await db.doc('fcfCrawl/actaImport').set({enabled: false});
    await seed([row(MID)]);
    await db.doc('fcfActaQueue/' + CLUB + '__' + MID).set({clubId: CLUB, matchId: MID,
      category: 'amateur', actaId: '4119501', kickoffAt: 0, dueAt: 0, attempts: 0});
    await fns.scheduledActaImport.run({});
    assert.strictEqual(fetched, 0);
    assert.strictEqual((await read('fa_matches', []))[0].fcfActa, undefined);
  });
});
