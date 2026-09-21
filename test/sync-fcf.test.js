/* End-to-end tests for the syncFcfFixtures callable — the Calendari's
 * refresh button.
 *
 * Runs in `npm run test:functions` (needs Java + the emulators), against the
 * REAL functions/index.js through its v2 `.run()` handle.
 *
 * Why this exists: f973aed made the callable read `clubId` from the request
 * body. The button has never sent one, so every refresh failed with
 * "Cap club." for four weeks and nothing in the suite noticed, because
 * nothing called it. These tests call it exactly as js/app.js bindFcfRefresh
 * does. No club here has an FCF link, so no request leaves the machine.
 */
'use strict';

const assert = require('assert');
const admin = require('firebase-admin');

const PROJECT = 'demo-esquerrapp';
const CLUB = 'syncClub';
const OTHER = 'syncOtherClub';

if (!admin.apps.length) admin.initializeApp({projectId: PROJECT});
const db = admin.firestore();
const fns = require('../functions/index.js');

function call(data, token) {
  return fns.syncFcfFixtures.run({
    auth: {
      uid: 'staffS',
      token: Object.assign({teamId: CLUB, role: 'staff'}, token || {})
    },
    data: data,
    rawRequest: {}
  });
}

describe('syncFcfFixtures', function () {
  this.timeout(120000);

  beforeEach(async () => {
    await db.doc('clubs/' + CLUB).set({
      name: 'Sync Club', categories: {amateur: {enabled: true, letters: ['A', 'B']}},
      fcfLinks: {}
    });
    await db.doc('clubs/' + OTHER).delete();
  });

  it('takes the club from the caller\'s token — the payload the button sends', async () => {
    // Verbatim shape of bindFcfRefresh's call: a category, no clubId.
    const r = await call({category: 'amateur'});
    assert.strictEqual(r.squads, 0);
  });

  it('ignores a clubId in the body rather than acting on another club', async () => {
    // OTHER does not exist. If the body were trusted this would be not-found;
    // from the token it is our own club, which has nothing to sync.
    const r = await call({clubId: OTHER});
    assert.strictEqual(r.squads, 0);
  });

  it('a caller with no club in the token is refused', async () => {
    await assert.rejects(() => call({}, {teamId: ''}),
        (e) => e && e.code === 'failed-precondition');
  });

  it('a player cannot rewrite the calendar', async () => {
    await assert.rejects(() => call({}, {role: 'player'}),
        (e) => e && e.code === 'permission-denied');
  });
});
