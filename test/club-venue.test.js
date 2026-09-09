/* End-to-end tests for the club's ground on the setClubCategories callable.
 *
 * `npm run test:clubvenue` (needs Java + the emulators). Runs the REAL
 * functions/index.js against the Firestore emulator, driving the callable
 * through its v2 `.run()` handle.
 *
 * Two fields, and the distinction between them is the point:
 *
 *   · `homeCoords` {lat, lon} is what the WEATHER SYNC reads. It is the only
 *     one that means anything to the rest of the app.
 *   · `homeLink` is the raw text the lead pasted, kept only so the box can
 *     show it back. Until v254 it was not stored at all, so saving a Google
 *     Maps URL replaced what the lead typed with the pair it parsed to —
 *     reported as "the link reverts to the coordinates".
 *
 * ⚠ Worth an emulator test rather than a unit one because the callable builds
 * its payload field by field from a KNOWN set: a client sending a field the
 * server does not name is not rejected, it is silently dropped. That failure
 * is invisible from the client — the save succeeds and nothing persists.
 */
'use strict';

const assert = require('assert');
const admin = require('firebase-admin');

const PROJECT = 'demo-esquerrapp';
const CLUB = 'venueClub';
const LEAD = 'leadV';

if (!admin.apps.length) admin.initializeApp({projectId: PROJECT});
const db = admin.firestore();
const fns = require('../functions/index.js');

const CATS = {amateur: {enabled: true, letters: ['A']}};

function call(data) {
  return fns.setClubCategories.run({
    auth: {
      uid: LEAD,
      token: {teamId: CLUB, role: 'lead', email: 'lead@x.com'}
    },
    data: Object.assign({categories: CATS}, data),
    rawRequest: {}
  });
}

const clubDoc = async () => (await db.doc('clubs/' + CLUB).get()).data();

describe('setClubCategories — the club ground', function () {
  this.timeout(120000);

  beforeEach(async () => {
    await db.doc('clubs/' + CLUB).set({
      name: 'Venue Club', leadEmail: 'lead@x.com', maxTeams: 4, categories: CATS
    });
  });

  it('stores the pasted link alongside the parsed coordinates', async () => {
    const link = 'https://www.google.com/maps/place/Camp/@41.3874,2.1686,17z';
    await call({homeCoords: {lat: 41.3874, lon: 2.1686}, homeLink: link});
    const c = await clubDoc();
    assert.strictEqual(c.homeLink, link, 'the link was dropped by the callable');
    assert.deepStrictEqual(c.homeCoords, {lat: 41.3874, lon: 2.1686});
  });

  it('stores the coordinates as NUMBERS whatever the client sent', async () => {
    await call({homeCoords: {lat: '41.3874', lon: '2.1686'}, homeLink: 'x'});
    const c = await clubDoc();
    assert.strictEqual(typeof c.homeCoords.lat, 'number');
    assert.strictEqual(typeof c.homeCoords.lon, 'number');
  });

  it('clears both when the box is emptied', async () => {
    await call({homeCoords: {lat: 41.3874, lon: 2.1686}, homeLink: 'keep'});
    await call({homeCoords: {}, homeLink: ''});
    const c = await clubDoc();
    assert.strictEqual(c.homeCoords, null, 'the coordinates survived a clear');
    assert.strictEqual(c.homeLink, '', 'the link survived a clear');
  });

  it('leaves the ground alone when the section was not on screen', async () => {
    // undefined means "not collected", which is not the same as "cleared" —
    // the venue section can be absent from the payload entirely.
    await call({homeCoords: {lat: 41.3874, lon: 2.1686}, homeLink: 'keep'});
    await call({});
    const c = await clubDoc();
    assert.strictEqual(c.homeLink, 'keep', 'an absent section cleared the link');
    assert.deepStrictEqual(c.homeCoords, {lat: 41.3874, lon: 2.1686});
  });

  it('refuses a link that is not a string', async () => {
    await assert.rejects(() => call({homeLink: {url: 'x'}}), (e) => !!(e && e.code));
  });

  /* This document is downloaded by every member of the club, so an unbounded
     string from the client is a size problem for everyone, not just the lead
     who pasted it. */
  it('refuses an absurdly long link', async () => {
    await assert.rejects(() => call({homeLink: 'x'.repeat(501)}), (e) => !!(e && e.code));
  });

  it('still refuses coordinates that are not coordinates', async () => {
    await assert.rejects(() => call({homeCoords: {lat: 999, lon: 0}}), (e) => !!(e && e.code));
    await assert.rejects(() => call({homeCoords: {lat: 1, lon: 2, zoom: 17}}), (e) => !!(e && e.code));
  });
});
