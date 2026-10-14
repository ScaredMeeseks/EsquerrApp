/* The 11/10 case end to end (v286): Esquerra B's fixture at Salesians
 * Bosco-Horta, postponed by the federation, then given a new date.
 *
 * Runs in `npm run test:functions` (emulators), through the REAL
 * syncFcfFixtures callable and _syncFcfSquad. Nothing leaves the machine:
 *   - `fetch` is replaced for the run and answers from the captured feed
 *     (test/fixtures/fcf-partidos-postponed.json), with ESTADO and the
 *     kick-off rewritten per phase;
 *   - FCM's sendEachForMulticast is replaced on the functions' own
 *     messaging instance, so each push is recorded instead of sent.
 *
 * What it pins, in the order a squad lives it:
 *   1. imported while Pendent → nobody told;
 *   2. AJORNAT → ONE push, to the B squad and the category's staff, not A;
 *   3. the next sync, still AJORNAT → no second push;
 *   4. a new date → "Nova data", and that match's availability answers
 *      deleted (both id spellings) while another match's stay.
 */
'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const admin = require('firebase-admin');

const PROJECT = 'demo-esquerrapp';
const CLUB = 'stateClub';
const ACTA = '4149304';

if (!admin.apps.length) admin.initializeApp({projectId: PROJECT});
const db = admin.firestore();
const fns = require('../functions/index.js');
// The SAME messaging instance index.js holds as `fcm` — its own copy of the SDK.
const fcm = require('../functions/node_modules/firebase-admin').messaging();

const FEED = JSON.parse(fs.readFileSync(
    path.join(__dirname, 'fixtures', 'fcf-partidos-postponed.json'), 'utf8'));

/** The captured feed with our fixture rewritten. */
function feedWith(estado, comienzo) {
  const out = JSON.parse(JSON.stringify(FEED));
  Object.values(out).forEach((rows) => rows.forEach((r) => {
    if (String(r.CODACTA) !== ACTA) return;
    r.ESTADO = estado;
    if (comienzo) r.COMIENZO1 = comienzo;
  }));
  return out;
}

const STANDINGS = {data: [
  {position: '3', team: {name: 'L\'ESQUERRA DE L\'EIXAMPLE, F.C. B', teamId: '40412'}},
  {position: '1', team: {name: 'SALESIANS BOSCO-HORTA CE. A', teamId: '25860376'}},
]};

let feed = null;
const realFetch = global.fetch;
const sent = [];
const realSend = fcm.sendEachForMulticast;

function call() {
  return fns.syncFcfFixtures.run({
    auth: {uid: 'staffS', token: {teamId: CLUB, role: 'staff'}},
    data: {category: 'amateur'},
    rawRequest: {},
  });
}

async function row() {
  const snap = await db.doc('teams/' + CLUB + '/data/fa_matches__amateur').get();
  const list = JSON.parse(snap.data().v);
  return list.find((m) => String(m.fcfActaId) === ACTA);
}

const pushes = () => sent.map((m) => ({tokens: m.tokens.slice().sort(),
  title: (m.notification && m.notification.title) || (m.data && m.data.title),
  type: m.data && m.data.type, matchId: m.data && m.data.matchId}));

describe('a postponed fixture, synced from the federation (v286)', function () {
  this.timeout(120000);

  before(async () => {
    global.fetch = async (url) => {
      const u = String(url);
      const body = u.includes('classificacio') ? STANDINGS
        : u.includes('partidos') ? feed
        : [];
      return {ok: true, status: 200, json: async () => body};
    };
    fcm.sendEachForMulticast = async (msg) => {
      sent.push(msg);
      return {successCount: msg.tokens.length, failureCount: 0,
        responses: msg.tokens.map(() => ({success: true}))};
    };
    await db.doc('clubs/' + CLUB).set({
      name: 'Esquerra de l\'Eixample F.C.',
      categories: {amateur: {enabled: true, letters: ['A', 'B']}},
      fcfLinks: {'amateur-B': 'https://www.fcf.cat/calendari?grupId=58161914'},
    });
    const people = [
      ['pB1', {roles: ['player'], category: 'amateur', team: 'B'}],
      ['pA1', {roles: ['player'], category: 'amateur', team: 'A'}],
      ['stA', {roles: ['staff'], staffCategories: ['amateur']}],
      ['stJ', {roles: ['staff'], staffCategories: ['juvenil']}],
    ];
    for (const [uid, d] of people) {
      await db.doc('users/' + uid).set(Object.assign({teamId: CLUB}, d));
      await db.doc('users/' + uid + '/tokens/t').set({token: 'tok-' + uid, platform: 'web'});
    }
    await db.doc('teams/' + CLUB + '/data/fa_matches__amateur').delete();
  });

  after(async () => {
    global.fetch = realFetch;
    fcm.sendEachForMulticast = realSend;
  });

  it('1. imported while Pendent: nobody is told', async () => {
    feed = feedWith('0');
    sent.length = 0;
    const r = await call();
    assert.strictEqual(r.squads, 1, JSON.stringify(r));
    const m = await row();
    assert.ok(m, 'the fixture was not imported');
    assert.strictEqual(m.date, '2026-10-11');
    assert.strictEqual(m.fcfState, undefined);
    assert.deepStrictEqual(pushes(), []);
  });

  it('2. AJORNAT: stamped, and ONE push to the B squad and the category\'s staff', async () => {
    feed = feedWith('2');
    sent.length = 0;
    await call();
    const m = await row();
    assert.strictEqual(m.fcfState, 'postponed');
    assert.deepStrictEqual(m.postponedFrom, {date: '2026-10-11', time: '18:00'});
    const p = pushes();
    assert.strictEqual(p.length, 1, JSON.stringify(p));
    assert.deepStrictEqual(p[0].tokens, ['tok-pB1', 'tok-stA'], 'the wrong people');
    assert.strictEqual(p[0].type, 'match_change');
    assert.strictEqual(p[0].matchId, ACTA);
  });

  it('3. the next sync, still AJORNAT: no second push', async () => {
    sent.length = 0;
    await call();
    assert.deepStrictEqual(pushes(), []);
  });

  it('4. a new date: moved, "Nova data", and only that match\'s answers cleared', async function () {
    await step4();
  });
});

/* v287: a SUSPÈS game, started or not. The club here is the one on the
   captured mid-game acta (4119507, Barcelona City v Can Buxeres, stopped
   after 79'), so the real page imports onto a real row. */
describe('a suspended fixture, probed from its acta (v287)', function () {
  this.timeout(120000);
  const SCLUB = 'suspClub';
  const ACTA_HTML = fs.readFileSync(path.join(__dirname, 'fixtures', 'acta-events-suspended.html'), 'utf8');
  const FEED_A = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'fcf-partidos-suspended.json'), 'utf8'));
  let actaGets = 0;
  let fetchBefore = null;

  const callS = () => fns.syncFcfFixtures.run({
    auth: {uid: 'staffX', token: {teamId: SCLUB, role: 'staff'}},
    data: {category: 'amateur'}, rawRequest: {},
  });
  const rowS = async (id) => {
    const snap = await db.doc('teams/' + SCLUB + '/data/fa_matches__amateur').get();
    return JSON.parse(snap.data().v).find((m) => String(m.fcfActaId) === id);
  };

  before(async () => {
    fetchBefore = global.fetch;
    global.fetch = async (url) => {
      const u = String(url);
      if (u.includes('/competicio/acta/')) {
        actaGets++;
        return {ok: true, status: 200, text: async () => ACTA_HTML};
      }
      const body = u.includes('classificacio')
        ? {data: [{position: '1', team: {name: 'BARCELONA CITY FOOTBALL CLUB A', teamId: '50621624'}}]}
        : u.includes('partidos') ? FEED_A : [];
      return {ok: true, status: 200, json: async () => body};
    };
    fcm.sendEachForMulticast = async (msg) => ({successCount: msg.tokens.length, failureCount: 0,
      responses: msg.tokens.map(() => ({success: true}))});
    await db.doc('clubs/' + SCLUB).set({
      name: 'Barcelona City Football Club',
      categories: {amateur: {enabled: true, letters: ['A']}},
      fcfLinks: {'amateur-A': 'https://www.fcf.cat/calendari?grupId=58161881'},
    });
    await db.doc('teams/' + SCLUB + '/data/fa_matches__amateur').delete();
    await db.doc('teams/' + SCLUB + '/data/fa_match_events__amateur').delete();
  });
  after(() => {
    global.fetch = fetchBefore;
    fcm.sendEachForMulticast = realSend;
  });

  it('stopped mid-way: the first part imported, started, the stop guessed from the acta', async () => {
    const r = await callS();
    assert.strictEqual(r.squads, 1, JSON.stringify(r));
    const m = await rowS('4119507');
    assert.ok(m, 'the fixture was not imported');
    assert.strictEqual(m.fcfState, 'suspended');
    assert.strictEqual(m.suspendedStarted, true);
    assert.deepStrictEqual(m.suspendedAt, {minute: 79, src: 'acta'});
    assert.ok(m.fcfActaPartial, 'no record of the partial import');
    assert.strictEqual(m.fcfActa, undefined, 'marked imported — the closed acta would never come in');
    // No final score written: the result is the restart's, when the acta closes.
    assert.strictEqual(m.score, null);
    const ev = JSON.parse((await db.doc('teams/' + SCLUB + '/data/fa_match_events__amateur').get()).data().v);
    const list = ev[String(m.id)] || [];
    assert.strictEqual(list.filter((e) => e.type === 'goal').length, 3, JSON.stringify(list).slice(0, 300));
    assert.ok(list.every((e) => e.src === 'fcf'));
  });

  it('known now: the next sync does not ask the acta again', async () => {
    const before = actaGets;
    await callS();
    assert.strictEqual(actaGets, before, 'the acta was fetched again');
  });

  it('a minute the staff gave survives a re-import', async () => {
    const shard = db.doc('teams/' + SCLUB + '/data/fa_matches__amateur');
    const rows = JSON.parse((await shard.get()).data().v);
    rows.forEach((m) => {
      if (String(m.fcfActaId) === '4119507') {
        m.suspendedAt = {minute: 86, src: 'staff'};
        delete m.suspendedStarted;                 // so the sync asks again
      }
    });
    await shard.set({v: JSON.stringify(rows), category: 'amateur'});
    await callS();
    const m = await rowS('4119507');
    assert.deepStrictEqual(m.suspendedAt, {minute: 86, src: 'staff'});
    assert.strictEqual(m.suspendedStarted, true);
  });
});

async function step4() {
  {
    const avail = db.collection('teams').doc(CLUB).collection('matchAvail');
    await avail.doc('pB1_' + ACTA).set({uid: 'pB1', matchId: ACTA, value: 'disponible'});
    await avail.doc('pA1_' + ACTA).set({uid: 'pA1', matchId: Number(ACTA), value: 'no'});
    await avail.doc('pB1_999').set({uid: 'pB1', matchId: '999', value: 'disponible'});
    feed = feedWith('0', '2026-10-25T12:00:00');
    sent.length = 0;
    await call();
    const m = await row();
    assert.strictEqual(m.date, '2026-10-25');
    assert.strictEqual(m.time, '12:00');
    assert.deepStrictEqual(m.postponedFrom, {date: '2026-10-11', time: '18:00'});
    const p = pushes();
    assert.strictEqual(p.length, 1, JSON.stringify(p));
    assert.deepStrictEqual(p[0].tokens, ['tok-pB1', 'tok-stA']);
    const left = (await avail.get()).docs.map((d) => d.id).sort();
    assert.deepStrictEqual(left, ['pB1_999'], 'answers for the old day survived, or another match\'s went');
  }
}
