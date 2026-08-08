/* End-to-end tests for the tactical-board template callables.
 *
 * `npm run test:templates` (needs Java + the emulators). Runs the REAL
 * functions/index.js against the Firestore emulator, driving each callable
 * through its v2 `.run()` handle rather than over HTTP — the same technique
 * as teams.test.js. Neither callable touches Firebase Auth, so unlike the
 * roster triggers they work fully in this harness.
 *
 * Two properties matter more than the rest:
 *
 *   1. A template must carry NOTHING that identifies its author or its origin
 *      club. It is shown to other clubs, so `linkedTeams` — which embeds
 *      player ids and names — must be gone from the PAYLOAD, not merely
 *      absent from the metadata. The strip parses and re-stringifies rather
 *      than pattern-matching the JSON, and that is what these tests pin.
 *   2. Promotion is a COPY. The origin club must keep full control: deleting
 *      its board must not break the template, and editing that board must not
 *      silently mutate every club seeded from it.
 */
'use strict';

const assert = require('assert');
const admin = require('firebase-admin');

const PROJECT = 'demo-esquerrapp';
const CLUB = 'tplClub';
const NEW_CLUB = 'tplNewClub';
const SUPER = 'marna96@gmail.com';

if (!admin.apps.length) admin.initializeApp({projectId: PROJECT});
const db = admin.firestore();
const fns = require('../functions/index.js');

const asSuper = (uid) => ({
  uid: uid || 'uidSuper',
  token: {email: SUPER, teamId: CLUB, role: 'lead'},
});
const asCoach = {
  uid: 'uidCoach',
  token: {email: 'coach@x.com', teamId: CLUB, role: 'staff'},
};

const promote = (data, auth) => fns.promoteBoardTemplate.run(
    {auth: auth === undefined ? asSuper() : auth, data, rawRequest: {}});
const seed = (data, auth) => fns.seedClubFromTemplates.run(
    {auth: auth === undefined ? asSuper() : auth, data, rawRequest: {}});

/* Assert on the HttpsError CODE, not the message. The messages are Catalan
   and user-facing, so matching them would make these tests fail every time
   the wording is improved — and would pass on the wrong error whenever two
   messages happened to share a word. */
function rejectsCode(fn, code) {
  return assert.rejects(fn, (e) => {
    assert.strictEqual(e.code, code, 'expected ' + code + ', got ' + e.code +
      ' (' + e.message + ')');
    return true;
  });
}

/** A board with something on every layer, plus the PII that must not travel. */
const PAYLOAD = JSON.stringify({
  name: 'Pressió alta',
  positions: [[10, 50], null, [30, 20]],
  numbers: ['1', '', '9'],
  penLines: [['10,10 12,14', '#fff', true]],
  frames: [{positions: [[10, 50]], duration: 1000}],
  linkedTeams: [{
    name: 'Equip 1',
    players: [{id: 'p1', name: 'Joan Garcia', playerNumber: '9'}],
  }],
});

async function seedBoard(id) {
  await db.doc('tacticBoards/' + id).set({
    ownerUid: 'uidCoach', clubId: CLUB, ownerName: 'Coach Name',
    category: 'cadet', name: 'Pressió alta', tag: 'Presión',
    formation: '4-3-3', boardType: 'full', hasFrames: true, frameCount: 2,
    bytes: 400, schema: 1,
  });
  await db.doc('tacticBoardData/' + id).set(
      {ownerUid: 'uidCoach', clubId: CLUB, v: PAYLOAD, schema: 1});
}

async function wipe() {
  for (const c of ['tacticBoards', 'tacticBoardData',
    'tacticTemplates', 'tacticTemplateData']) {
    const s = await db.collection(c).get();
    await Promise.all(s.docs.map((d) => d.ref.delete()));
  }
}

describe('promoteBoardTemplate', function () {
  this.timeout(60000);

  beforeEach(async () => {
    await wipe();
    await db.doc('clubs/' + CLUB).set({name: 'Origin Club'});
    await db.doc('clubs/' + NEW_CLUB).set({name: 'New Club'});
    await seedBoard('b1');
  });

  it('refuses a coach, and anyone unauthenticated', async () => {
    await rejectsCode(() => promote({boardId: 'b1'}, asCoach), 'permission-denied');
    await rejectsCode(() => promote({boardId: 'b1'}, null), 'unauthenticated');
  });

  it('refuses a board that does not exist', async () => {
    await rejectsCode(() => promote({boardId: 'nope'}), 'not-found');
  });

  it('copies the board into an ANONYMOUS template', async () => {
    const r = await promote({boardId: 'b1', packs: ['base']});
    const t = (await db.doc('tacticTemplates/' + r.templateId).get()).data();
    assert.strictEqual(t.name, 'Pressió alta');
    assert.strictEqual(t.category, 'cadet');
    assert.strictEqual(t.hasFrames, true);
    assert.deepStrictEqual(t.packs, ['base']);
    // The whole point: nothing that says who made it or where it came from.
    assert.strictEqual(t.ownerUid, undefined);
    assert.strictEqual(t.ownerName, undefined);
    assert.strictEqual(t.clubId, undefined);
    assert.strictEqual(t.sourceBoardId, undefined);
  });

  it('strips linkedTeams from the PAYLOAD, not just the metadata', async () => {
    // linkedTeams embeds player ids and names. A template is shown to other
    // clubs, so this is the one that would be a real leak.
    const r = await promote({boardId: 'b1'});
    const d = (await db.doc('tacticTemplateData/' + r.templateId).get()).data();
    assert.ok(!/linkedTeams/.test(d.v), 'linkedTeams survived into the payload');
    assert.ok(!/Joan Garcia/.test(d.v), 'a player name survived into the payload');
    const parsed = JSON.parse(d.v);
    assert.strictEqual(parsed.linkedTeams, undefined);
    // ...while the drawing itself is intact, nested arrays and all.
    assert.deepStrictEqual(parsed.positions[0], [10, 50]);
    assert.strictEqual(parsed.positions[1], null);
    assert.strictEqual(parsed.frames.length, 1);
  });

  it('records bytes against the stripped payload, not the original', async () => {
    const r = await promote({boardId: 'b1'});
    const t = (await db.doc('tacticTemplates/' + r.templateId).get()).data();
    const d = (await db.doc('tacticTemplateData/' + r.templateId).get()).data();
    assert.strictEqual(t.bytes, Buffer.byteLength(d.v, 'utf8'));
    assert.ok(t.bytes < Buffer.byteLength(PAYLOAD, 'utf8'));
  });

  it('is a COPY — deleting the origin board leaves the template intact', async () => {
    const r = await promote({boardId: 'b1'});
    await db.doc('tacticBoards/b1').delete();
    await db.doc('tacticBoardData/b1').delete();
    const t = await db.doc('tacticTemplates/' + r.templateId).get();
    const d = await db.doc('tacticTemplateData/' + r.templateId).get();
    assert.ok(t.exists && d.exists);
    assert.strictEqual(JSON.parse(d.data().v).positions.length, 3);
  });
});

describe('seedClubFromTemplates', function () {
  this.timeout(60000);
  let tplId;

  beforeEach(async () => {
    await wipe();
    await db.doc('clubs/' + CLUB).set({name: 'Origin Club'});
    await db.doc('clubs/' + NEW_CLUB).set({name: 'New Club'});
    await seedBoard('b1');
    tplId = (await promote({boardId: 'b1', packs: ['base']})).templateId;
  });

  it('refuses a coach, and an unknown club', async () => {
    await rejectsCode(() => seed({clubId: NEW_CLUB, templateIds: [tplId]}, asCoach),
        'permission-denied');
    await rejectsCode(() => seed({clubId: 'ghost', templateIds: [tplId]}),
        'not-found');
  });

  it('refuses when nothing is selected', async () => {
    await rejectsCode(() => seed({clubId: NEW_CLUB}), 'invalid-argument');
  });

  it('copies the template into the club as an UNOWNED board', async () => {
    const r = await seed({clubId: NEW_CLUB, templateIds: [tplId]});
    assert.strictEqual(r.created, 1);
    const snap = await db.collection('tacticBoards')
        .where('clubId', '==', NEW_CLUB).get();
    assert.strictEqual(snap.size, 1);
    const b = snap.docs[0].data();
    // '' and not the lead: attributing a seeded board to the lead would be a
    // lie, and would follow them to their next club via the owner read arm.
    assert.strictEqual(b.ownerUid, '');
    assert.strictEqual(b.clubId, NEW_CLUB);
    assert.strictEqual(b.sourceTemplateId, tplId);
    assert.strictEqual(b.name, 'Pressió alta');
    // The payload doc must carry the same two fields, or its rule cannot
    // authorise without reading its sibling.
    const d = (await db.doc('tacticBoardData/' + snap.docs[0].id).get()).data();
    assert.strictEqual(d.ownerUid, '');
    assert.strictEqual(d.clubId, NEW_CLUB);
    assert.ok(!/linkedTeams/.test(d.v));
  });

  it('is idempotent — re-seeding does not double the starter set', async () => {
    await seed({clubId: NEW_CLUB, templateIds: [tplId]});
    const again = await seed({clubId: NEW_CLUB, templateIds: [tplId]});
    assert.strictEqual(again.created, 0);
    assert.strictEqual(again.skipped, 1);
    const snap = await db.collection('tacticBoards')
        .where('clubId', '==', NEW_CLUB).get();
    assert.strictEqual(snap.size, 1);
  });

  it('seeds a whole pack by name', async () => {
    const second = (await promote({boardId: 'b1', packs: ['base']})).templateId;
    assert.notStrictEqual(second, tplId);
    const r = await seed({clubId: NEW_CLUB, pack: 'base'});
    assert.strictEqual(r.created, 2);
  });

  it('leaves the origin club untouched', async () => {
    await seed({clubId: NEW_CLUB, templateIds: [tplId]});
    const snap = await db.collection('tacticBoards')
        .where('clubId', '==', CLUB).get();
    assert.strictEqual(snap.size, 1, 'the origin club gained or lost a board');
    assert.strictEqual(snap.docs[0].data().ownerUid, 'uidCoach');
  });
});
