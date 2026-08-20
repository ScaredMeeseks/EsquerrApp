/* End-to-end tests for the setClubKits callable.
 *
 * `npm run test:clubkits` (needs Java + the emulators). Runs the REAL
 * functions/index.js against the Firestore emulator, driving the callable
 * through its v2 `.run()` handle.
 *
 * Why this validator matters more than most: `clubs/{clubId}` is downloaded
 * by EVERY member of the club, which is the same reason setClubCategories
 * rejects unknown category keys. And two of the rules cannot be enforced
 * anywhere else —
 *
 *   · shorts must be a single colour. parseFill() degrades a striped value
 *     to solid SILENTLY, so a bad one would sit in the document rendering
 *     plausibly and never be noticed.
 *   · a club may never store zero kits, because kitsOf() falls back to the
 *     defaults on an empty list — so saving none would silently restore the
 *     ones the lead had just deleted.
 */
'use strict';

const assert = require('assert');
const admin = require('firebase-admin');

const PROJECT = 'demo-esquerrapp';
const CLUB = 'kitClub';
const LEAD = 'leadK';

if (!admin.apps.length) admin.initializeApp({projectId: PROJECT});
const db = admin.firestore();
const fns = require('../functions/index.js');

const OK_KIT = {
  id: 'home', label: 'Primera',
  shirt: '#ffffff', shorts: '#000000', socks: 's|h|6|#ffffff|#222222'
};

function call(kits, token) {
  return fns.setClubKits.run({
    auth: {
      uid: LEAD,
      token: Object.assign(
          {teamId: CLUB, role: 'lead', email: 'lead@x.com'}, token || {})
    },
    data: {kits: kits},
    rawRequest: {}
  });
}

/** The kit with one field replaced. */
const kit = (over) => [Object.assign({}, OK_KIT, over)];

async function rejects(kits, why, token) {
  await assert.rejects(() => call(kits, token), (e) => {
    assert.ok(e && e.code, 'expected an HttpsError, got ' + e);
    return true;
  }, why);
}

describe('setClubKits', function () {
  this.timeout(120000);

  beforeEach(async () => {
    await db.doc('clubs/' + CLUB).set({
      name: 'Kit Club', leadEmail: 'lead@x.com',
      categories: {amateur: {enabled: true, letters: ['A']}}
    });
  });

  it('stores a valid kit', async () => {
    const r = await call([OK_KIT]);
    assert.strictEqual(r.ok, true);
    assert.strictEqual(r.kits, 1);
    const c = (await db.doc('clubs/' + CLUB).get()).data();
    assert.strictEqual(c.kits.length, 1);
    assert.strictEqual(c.kits[0].id, 'home');
    assert.strictEqual(c.kits[0].socks, 's|h|6|#ffffff|#222222');
  });

  it('leaves the rest of the club document alone', async () => {
    // merge:true — this callable owns `kits` and nothing else. Overwriting
    // `categories` here would unconfigure the club.
    await call([OK_KIT]);
    const c = (await db.doc('clubs/' + CLUB).get()).data();
    assert.ok(c.categories && c.categories.amateur.enabled);
    assert.strictEqual(c.name, 'Kit Club');
  });

  it('accepts three kits, with stripes on shirt and socks', async () => {
    const r = await call([
      OK_KIT,
      {id: 'away', label: '2a', shirt: 's|v|4|#e53935|#ffffff',
        shorts: '#e53935', socks: '#e53935'},
      {id: 'third', label: '3a', shirt: 's|h|5|#1e88e5|#ffffff',
        shorts: '#1e88e5', socks: '#1e88e5'}
    ]);
    assert.strictEqual(r.kits, 3);
  });

  it('refuses a fourth kit', () => rejects(
      [OK_KIT, kit({id: 'b'})[0], kit({id: 'c'})[0], kit({id: 'd'})[0]],
      'four kits must be refused'));

  it('refuses an empty list — it would resurrect the defaults', () =>
    rejects([], 'zero kits must be refused'));

  it('refuses anything that is not an array', () => rejects(
      {id: 'home'}, 'a bare object must be refused'));

  it('refuses duplicate ids', () => rejects(
      [OK_KIT, Object.assign({}, OK_KIT, {label: 'other'})],
      'duplicate ids must be refused'));

  it('refuses a bad id', async () => {
    await rejects(kit({id: 'UPPER'}), 'uppercase id');
    await rejects(kit({id: 'a'}), 'too short');
    await rejects(kit({id: 'has space'}), 'space in id');
    await rejects(kit({id: ''}), 'empty id');
  });

  it('refuses STRIPED shorts — the rule the UI cannot enforce', () =>
    rejects(kit({shorts: 's|h|2|#ffffff|#000000'}),
        'shorts must be a single colour'));

  it('refuses a bad colour anywhere', async () => {
    await rejects(kit({shirt: '#GGGGGG'}), 'not hex');
    await rejects(kit({shirt: '#fff'}), 'short hex');
    await rejects(kit({shorts: 'black'}), 'a colour name');
    await rejects(kit({socks: 's|h|6|#ffffff|nope'}), 'bad second colour');
  });

  it('refuses a band count outside the range', async () => {
    // parseFill() would degrade these to solid, so a stored 9 renders as a
    // plain shirt and looks like the stripes were simply forgotten.
    await rejects(kit({socks: 's|h|10|#ffffff|#222222'}), 'n above STRIPE_MAX');
    await rejects(kit({socks: 's|h|1|#ffffff|#222222'}), 'n too low');
    await rejects(kit({socks: 's|x|4|#ffffff|#222222'}), 'bad direction');
    await rejects(kit({socks: 's|h|4|#ffffff'}), 'truncated');
  });

  it('refuses a label that is too long', () => rejects(
      kit({label: 'x'.repeat(25)}), 'label over 24 chars'));

  it('refuses unknown fields', () => rejects(
      [Object.assign({}, OK_KIT, {evil: 1})],
      'unknown keys would sit in a doc every member downloads'));

  it('refuses a non-lead', () => rejects([OK_KIT],
      'only the lead may configure kits', {role: 'player'}));

  it('refuses a caller with no club', () => rejects([OK_KIT],
      'no club, no kits', {teamId: ''}));
});
