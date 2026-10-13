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

  it('4. a new date: moved, "Nova data", and only that match\'s answers cleared', async () => {
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
  });
});
