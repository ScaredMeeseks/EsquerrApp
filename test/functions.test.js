/* End-to-end tests for the Cloud Functions that Phase 5 Stage D rewrote.
 *
 * These run the REAL functions/index.js inside the Functions emulator and
 * drive it the way production does — by writing to Firestore and waiting for
 * the trigger — so the trigger wiring, the shard scan and the batch are all
 * exercised as deployed. `npm run test:functions` (needs Java + the
 * emulators; see README).
 *
 * `reshardMember` is the reason this file exists. It is the riskiest path in
 * functions/index.js: it moves a member's medical history between category
 * shards, it is the only writer that can (the old coach's client can no
 * longer resolve the uid, the new coach never downloaded the old shard), and
 * a mistake either duplicates a row or loses it.
 */
'use strict';

const assert = require('assert');
const admin = require('firebase-admin');

const PROJECT = 'demo-esquerrapp';
const TEAM = 'reshardTeam';
const UID = 'u1';

if (!admin.apps.length) admin.initializeApp({projectId: PROJECT});
const db = admin.firestore();
const doc = (id) => db.doc('teams/' + TEAM + '/data/' + id);

/** A data doc in either storage format, normalized for assertions. */
async function blob(id) {
  const s = await doc(id).get();
  if (!s.exists) return null;
  const d = s.data();
  if (typeof d.v === 'string') {
    return {parsed: JSON.parse(d.v), category: d.category, fmt: 'blob'};
  }
  const parsed = {};
  Object.keys(d).forEach((k) => {
    if (k !== 'category' && k !== '_migrated') parsed[k] = d[k];
  });
  return {parsed: parsed, category: d.category, fmt: 'merge'};
}

async function ids(id) {
  const b = await blob(id);
  return b ? b.parsed.map((r) => r.id).sort() : null;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Poll until `fn` stops throwing — triggers are asynchronous. */
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

describe('onMemberCategoryChanged / reshardMember', function () {
  this.timeout(120000);

  before(async () => {
    // The people first, and let their own category-set events drain: seeding
    // a member and his rows in one go would fire reshardMember against half
    // a club and the test would be asserting against its own setup.
    const u = db.batch();
    u.set(db.doc('teams/' + TEAM), {name: 'Esquerra'});
    u.set(db.doc('users/' + UID), {teamId: TEAM, category: 'cadet', name: 'Player'});
    u.set(db.doc('users/u2'), {teamId: TEAM, category: 'cadet'});
    await u.commit();
    await sleep(3000);

    const b = db.batch();
    // u1 has rows in his own shard AND stranded in __none
    b.set(doc('fa_injuries__cadet'), {
      v: JSON.stringify([{id: 'i1', playerId: UID}, {id: 'i2', playerId: 'u2'}]),
      category: 'cadet',
    });
    b.set(doc('fa_injuries__none'), {
      v: JSON.stringify([{id: 'i3', playerId: UID}]), category: 'none',
    });
    // The destination already exists, holding someone else's row
    b.set(doc('fa_injuries__juvenil'), {
      v: JSON.stringify([{id: 'i9', playerId: 'u9'}]), category: 'juvenil',
    });
    // Merge-format notes (how the client writes them)…
    b.set(doc('fa_injury_notes__cadet'), {[UID]: 'cadet note', u2: 'other', category: 'cadet'});
    // …and a legacy blob-format document for the SAME key: the format has to
    // be read off the document, not the key, or the copy lands while the
    // removal removes nothing and the row exists twice.
    b.set(doc('fa_injury_notes__none'), {
      v: JSON.stringify({[UID + '_legacy']: 'x', [UID]: 'none note'}), category: 'none',
    });
    b.set(doc('fa_training_staff_override__cadet'), {
      [UID + '_2026-08-05']: 'present', 'u2_2026-08-05': 'absent', category: 'cadet',
    });
    await b.commit();
    await sleep(1000);
  });

  it('moves every roster-joined row into the new category, exactly once', async () => {
    await db.doc('users/' + UID).set({category: 'juvenil'}, {merge: true});

    await eventually(async () => {
      assert.deepStrictEqual(await ids('fa_injuries__juvenil'), ['i1', 'i3', 'i9']);
    });
    assert.deepStrictEqual(await ids('fa_injuries__cadet'), ['i2'],
        'u1 left his old shard');
    assert.deepStrictEqual(await ids('fa_injuries__none'), [],
        'the stranded row was collected too');
  });

  it('keeps `category` on every shard it touches', async () => {
    assert.strictEqual((await blob('fa_injuries__cadet')).category, 'cadet');
    assert.strictEqual((await blob('fa_injuries__juvenil')).category, 'juvenil');
    assert.strictEqual((await blob('fa_injury_notes__juvenil')).category, 'juvenil');
    // A shard written without it drops out of the client's
    // where('category','in',…) query — invisible, not merely misfiled.
  });

  it('empties both merge-format and blob-format sources', async () => {
    const dest = await blob('fa_injury_notes__juvenil');
    assert.ok(dest && dest.parsed[UID], 'the note landed');
    assert.strictEqual(dest.fmt, 'merge', 'a new shard uses the key\'s own format');

    const cadet = await blob('fa_injury_notes__cadet');
    assert.ok(!(UID in cadet.parsed), 'removed from the merge-format source');
    assert.strictEqual(cadet.parsed.u2, 'other', 'other players untouched');

    const none = await blob('fa_injury_notes__none');
    assert.ok(!(UID in none.parsed), 'removed from the blob-format source');
    assert.strictEqual(none.parsed[UID + '_legacy'], 'x',
        'a key merely PREFIXED with the uid stays put on a uid-kind key');
  });

  it('moves uid_date keys and leaves other players\' alone', async () => {
    const dest = await blob('fa_training_staff_override__juvenil');
    assert.ok(dest && dest.parsed[UID + '_2026-08-05'], 'the override moved');
    const src = await blob('fa_training_staff_override__cadet');
    assert.ok(!(UID + '_2026-08-05' in src.parsed), 'removed from the source');
    assert.strictEqual(src.parsed['u2_2026-08-05'], 'absent', 'u2 untouched');
  });

  it('is a no-op when the category does not change', async () => {
    const before = JSON.stringify([await blob('fa_injuries__juvenil'),
      await blob('fa_injury_notes__juvenil')]);
    await db.doc('users/' + UID).set({category: 'juvenil', name: 'Player 2'}, {merge: true});
    await sleep(4000);
    assert.strictEqual(JSON.stringify([await blob('fa_injuries__juvenil'),
      await blob('fa_injury_notes__juvenil')]), before,
    'a repeat delivery must not duplicate rows');
  });

  it('moves the rows back on a demotion', async () => {
    await db.doc('users/' + UID).set({category: 'cadet'}, {merge: true});
    await eventually(async () => {
      assert.deepStrictEqual(await ids('fa_injuries__cadet'), ['i1', 'i2', 'i3']);
    });
    assert.deepStrictEqual(await ids('fa_injuries__juvenil'), ['i9'],
        'juvenil keeps only its own row');
    assert.ok((await blob('fa_injury_notes__cadet')).parsed[UID], 'the note came back');
    assert.ok(!(UID in (await blob('fa_injury_notes__juvenil')).parsed),
        'and left juvenil');
  });

  it('parks an unassigned member\'s rows in __none', async () => {
    await db.doc('users/' + UID).set({category: ''}, {merge: true});
    await eventually(async () => {
      assert.deepStrictEqual(await ids('fa_injuries__none'), ['i1', 'i3']);
    });
    assert.deepStrictEqual(await ids('fa_injuries__cadet'), ['i2']);
  });
});

describe('updateTeamDates', function () {
  this.timeout(120000);
  const T = 'datesTeam';

  it('unions the dates across every shard, not just the one that changed',
      async () => {
        await db.doc('teams/' + T).set({name: 'Dates'});
        await db.doc('teams/' + T + '/data/fa_training__cadet').set({
          v: JSON.stringify([{id: 't1', date: '2026-09-01', category: 'cadet'}]),
          category: 'cadet',
        });
        await eventually(async () => {
          const d = (await db.doc('teams/' + T).get()).data();
          assert.deepStrictEqual(d.trainingDates, ['2026-09-01']);
        });

        // A second category writes its own shard. Deriving the field from the
        // shard that just changed would replace the array and silence the
        // other squad's reminders — with nothing in the logs.
        await db.doc('teams/' + T + '/data/fa_training__juvenil').set({
          v: JSON.stringify([{id: 't2', date: '2026-09-02', category: 'juvenil'}]),
          category: 'juvenil',
        });
        await eventually(async () => {
          const d = (await db.doc('teams/' + T).get()).data();
          assert.deepStrictEqual((d.trainingDates || []).sort(),
              ['2026-09-01', '2026-09-02']);
        });
      });
});

/* ------------------------------------------------------------------ *
 * archiveSeason — the second run must not eat the first archive.
 *
 * There was no existence check at all, and the failure was silent and
 * total: run one empties the live shards, so run two reads nothing and
 * batch.set()s that nothing OVER the archive — a full replace, no merge.
 * The season vanished from both the live data AND its own archive, and the
 * caller got a 200 and a success toast.
 *
 * One click away, too: the label is free text pre-filled from the date, so
 * re-running a rollover lands on the same one.
 *
 * Driven through the exported onRequest handler directly, the same idea as
 * teams.test.js's `.run()` on the callables. verifyIdToken is stubbed
 * because the subject here is the guard, not the auth — which has its own
 * checks immediately above it in the function.
 * ------------------------------------------------------------------ */
describe('archiveSeason — a label is archived once', function () {
  this.timeout(60000);

  const ATEAM = 'archiveGuardTeam';
  const LABEL = '2024-2025';
  const seasonDoc = () => db.doc(`teams/${ATEAM}/seasons/${LABEL}`);
  const archived = (id) => db.doc(`teams/${ATEAM}/seasons/${LABEL}/data/${id}`);

  let fns;
  before(() => {
    fns = require('../functions/index.js');
    /* Patch the admin instance FUNCTIONS loads, not the one this file did.
       test/ and functions/ each have their own node_modules, so
       `require('firebase-admin')` here and there are two different modules
       with two different app registries — stubbing ours does nothing.
       Requiring by the resolved path hits the same module cache entry the
       function is using. */
    const fnAdmin = require('../functions/node_modules/firebase-admin');
    fnAdmin.auth().verifyIdToken = async () => ({
      uid: 'leadUid', email: 'marna96@gmail.com',
    });
  });

  /* An express-ish double. It has to be an EventEmitter: the v2 onRequest
     wrapper registers res.on('finish') before handing over, and the CORS
     middleware reads and writes headers. */
  function call(opts) {
    const {EventEmitter} = require('events');
    const out = {};
    const headers = {};
    const res = Object.assign(new EventEmitter(), {
      statusCode: 200,
      set: () => res,
      setHeader(k, v) { headers[k] = v; },
      getHeader(k) { return headers[k]; },
      removeHeader(k) { delete headers[k]; },
      writeHead(code) { out.code = code; return res; },
      status(code) { out.code = code; res.statusCode = code; return res; },
      json(body) { out.body = body; res.emit('finish'); return res; },
      send(body) { out.body = body; res.emit('finish'); return res; },
      end(body) { if (body !== undefined) out.body = body; res.emit('finish'); return res; },
    });
    return Promise.resolve(fns.archiveSeason({
      method: 'POST',
      headers: {authorization: 'Bearer stub'},
      body: {teamId: ATEAM, label: LABEL},
      query: opts && opts.overwrite ? {overwrite: 'true'} : {},
      get: (k) => (k && k.toLowerCase() === 'origin' ? undefined : undefined),
    }, res)).then(() => out);
  }

  beforeEach(async () => {
    for (const c of ['data', 'seasons']) {
      const snap = await db.collection(`teams/${ATEAM}/${c}`).get();
      await Promise.all(snap.docs.map((d) => d.ref.delete()));
    }
    await db.doc(`teams/${ATEAM}/seasons/${LABEL}/data/fa_matches__amateur`).delete();
    await db.doc(`teams/${ATEAM}/data/fa_matches__amateur`).set({
      v: JSON.stringify([{id: 1, home: 'us', away: 'them', status: 'played'}]),
      category: 'amateur',
    });
  });

  it('archives the season the first time', async () => {
    const r = await call();
    assert.ok(!r.code || r.code === 200, 'expected success, got ' + r.code);
    const snap = await archived('fa_matches__amateur').get();
    assert.ok(snap.exists, 'the archive was written');
    assert.strictEqual(JSON.parse(snap.data().v).length, 1);
    assert.ok((await seasonDoc().get()).exists);
  });

  it('REFUSES the same label again, and leaves the archive intact', async () => {
    await call();
    const r = await call();
    assert.strictEqual(r.code, 409);
    assert.strictEqual(r.body.code, 'season-exists');

    // The assertion that matters: the first archive still holds its match.
    const snap = await archived('fa_matches__amateur').get();
    assert.strictEqual(JSON.parse(snap.data().v).length, 1,
        'the second run overwrote the archive with the emptied live data');
  });

  it('names the label in the refusal, so the fix is obvious', async () => {
    await call();
    const r = await call();
    assert.ok(String(r.body.error).includes(LABEL));
    assert.strictEqual(r.body.label, LABEL);
  });

  it('lets an explicit overwrite through', async () => {
    await call();
    const r = await call({overwrite: true});
    assert.ok(!r.code || r.code === 200, 'expected success, got ' + r.code);
  });

  it('refuses before touching the live data', async () => {
    // A refusal that had already wiped the season would be the same bug
    // wearing a 409.
    await call();
    await db.doc(`teams/${ATEAM}/data/fa_matches__amateur`).set({
      v: JSON.stringify([{id: 2, status: 'played'}]),
      category: 'amateur',
    });
    await call();
    const live = await db.doc(`teams/${ATEAM}/data/fa_matches__amateur`).get();
    assert.strictEqual(JSON.parse(live.data().v).length, 1,
        'the live shard was reset by a run that refused');
  });
});
