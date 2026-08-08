/* End-to-end tests for functions/backfill-tactic-boards.js.
 *
 * `npm run test:backfill-boards` (needs Java + the Firestore emulator). Runs
 * the REAL script as a subprocess against the emulator, the same way
 * wipe.test.js drives the wipe.
 *
 * This script writes production data, and the only safety net in front of it
 * is a dry run that somebody reads. So the properties worth pinning are the
 * ones an operator relies on but cannot see:
 *
 *   1. A dry run writes NOTHING. If that ever stops being true, the whole
 *      "read the dry run first" workflow is a fiction.
 *   2. It is idempotent. A re-run after a partial failure must not duplicate
 *      a club's library, and boards with no id of their own must land on the
 *      same derived id both times.
 *   3. It never touches the source. The blob shards are what the app reads
 *      until the frontend switches over; corrupting them would take the
 *      tactical boards out of every client at once.
 *   4. linkedTeams never reaches the new payload. It carries player ids and
 *      names, and the new read rule is club-wide with no category gate — so
 *      this is the one field whose escape would be a real privacy regression.
 */
'use strict';

const assert = require('assert');
const path = require('path');
const {execFileSync} = require('child_process');
const admin = require('firebase-admin');

// Must match the projectId in functions/backfill-tactic-boards.js.
const PROJECT = 'esquerrapp';
const SCRIPT = path.join(__dirname, '..', 'functions', 'backfill-tactic-boards.js');
const CLUB = 'bfClub';

const app = admin.initializeApp({projectId: PROJECT}, 'backfillBoards');
const db = app.firestore();

/** Run the real script. NODE_PATH lets it find firebase-admin even when
 *  functions/node_modules has not been installed on this machine. */
function run(args) {
  return execFileSync(process.execPath, [SCRIPT].concat(args), {
    encoding: 'utf8',
    env: Object.assign({}, process.env, {
      NODE_PATH: path.join(__dirname, 'node_modules'),
    }),
  });
}

/** A board with something on every layer, plus the PII that must not travel. */
const withId = (id, name) => ({
  id, name,
  category: 'cadet',
  formation: '4-3-3',
  boardType: 'full',
  positions: [[10, 50], null, [30, 20]],
  numbers: ['1', '', '9'],
  frames: [{positions: [[10, 50]]}, {positions: [[20, 50]]}],
  tag: 'Presión',
  linkedTeams: [{name: 'Equip 1', players: [{id: 'p1', name: 'Joan Garcia'}]}],
});
const noId = (name) => {
  const b = withId(undefined, name);
  delete b.id;
  return b;
};

const shardRef = (cat) => db.doc('teams/' + CLUB + '/data/fa_tactic_saved__' + cat);

async function seed() {
  await db.doc('clubs/' + CLUB).set({name: 'Backfill Club'});
  await shardRef('cadet').set({
    category: 'cadet',
    v: JSON.stringify([withId('tb_known1', 'Pressió'), noId('Sense id')]),
  });
  await shardRef('juvenil').set({
    category: 'juvenil',
    v: JSON.stringify([withId('tb_known2', 'Sortida')]),
  });
}

async function wipeAll() {
  for (const c of ['tacticBoards', 'tacticBoardData']) {
    const s = await db.collection(c).get();
    await Promise.all(s.docs.map((d) => d.ref.delete()));
  }
  for (const cat of ['cadet', 'juvenil']) {
    await shardRef(cat).delete().catch(() => {});
  }
}

const boardsOfClub = () => db.collection('tacticBoards')
    .where('clubId', '==', CLUB).get();

describe('backfill-tactic-boards', function () {
  this.timeout(120000);

  beforeEach(async () => {
    await wipeAll();
    await seed();
  });

  it('a dry run writes NOTHING but reports what it would do', async () => {
    const out = run(['--club', CLUB]);
    assert.ok(/DRY RUN/.test(out), out);
    assert.ok(/3 boards/.test(out), out);
    const snap = await boardsOfClub();
    assert.strictEqual(snap.size, 0, 'a dry run created documents');
  });

  it('writes one document pair per board', async () => {
    run(['--club', CLUB, '--apply']);
    const snap = await boardsOfClub();
    assert.strictEqual(snap.size, 3);
    for (const d of snap.docs) {
      const payload = await db.doc('tacticBoardData/' + d.id).get();
      assert.ok(payload.exists, 'payload missing for ' + d.id);
      // Both fields duplicate onto the payload so its rule is self-contained.
      assert.strictEqual(payload.data().clubId, CLUB);
      assert.strictEqual(payload.data().ownerUid, '');
    }
  });

  it('keeps each board in its own category, and leaves ownership empty', async () => {
    run(['--club', CLUB, '--apply']);
    const byId = {};
    (await boardsOfClub()).forEach((d) => (byId[d.id] = d.data()));
    assert.strictEqual(byId['tb_known1'].category, 'cadet');
    assert.strictEqual(byId['tb_known2'].category, 'juvenil');
    // '' and not the club lead: there is no author information to recover,
    // and attributing these to the lead would follow them to their next club
    // through the owner read arm.
    assert.strictEqual(byId['tb_known1'].ownerUid, '');
    assert.strictEqual(byId['tb_known1'].ownerName, '');
    assert.strictEqual(byId['tb_known1'].schema, 1);
    assert.strictEqual(byId['tb_known1'].hasFrames, true);
    assert.strictEqual(byId['tb_known1'].frameCount, 2);
  });

  it('strips linkedTeams from the payload', async () => {
    run(['--club', CLUB, '--apply']);
    const d = await db.doc('tacticBoardData/tb_known1').get();
    assert.ok(!/linkedTeams/.test(d.data().v), 'linkedTeams survived');
    assert.ok(!/Joan Garcia/.test(d.data().v), 'a player name survived');
    // ...and the drawing is intact, nested arrays and all.
    const parsed = JSON.parse(d.data().v);
    assert.deepStrictEqual(parsed.positions[0], [10, 50]);
    assert.strictEqual(parsed.positions[1], null);
    assert.strictEqual(parsed.frames.length, 2);
  });

  it('is idempotent — a second run writes nothing new', async () => {
    run(['--club', CLUB, '--apply']);
    const first = (await boardsOfClub()).docs.map((d) => d.id).sort();
    const out = run(['--club', CLUB, '--apply']);
    const second = (await boardsOfClub()).docs.map((d) => d.id).sort();
    assert.deepStrictEqual(second, first, 'a re-run changed the id set');
    assert.ok(/3 already done/.test(out), out);
  });

  it('gives an id-less board a DERIVED id, stable across runs', async () => {
    // A random id would create a fresh duplicate on every run.
    run(['--club', CLUB, '--apply']);
    const ids = (await boardsOfClub()).docs.map((d) => d.id);
    const derived = ids.filter((i) => i !== 'tb_known1' && i !== 'tb_known2');
    assert.strictEqual(derived.length, 1);
    assert.ok(/^tb_[0-9a-f]{16}$/.test(derived[0]), derived[0]);

    await db.doc('tacticBoards/' + derived[0]).delete();
    await db.doc('tacticBoardData/' + derived[0]).delete();
    run(['--club', CLUB, '--apply']);
    const again = (await boardsOfClub()).docs.map((d) => d.id);
    assert.ok(again.includes(derived[0]), 'the derived id was not reproduced');
  });

  it('NEVER touches the source shards', async () => {
    const before = (await shardRef('cadet').get()).data();
    run(['--club', CLUB, '--apply']);
    const after = (await shardRef('cadet').get()).data();
    // Byte-identical: the app reads these until the frontend switches over.
    assert.deepStrictEqual(after, before);
  });

  it('refuses to guess at an unparseable shard', async () => {
    await shardRef('cadet').set({category: 'cadet', v: '{not json'});
    assert.throws(() => run(['--club', CLUB]), /unparseable|Error/);
    // ...and nothing from the other shard leaked through first.
    assert.strictEqual((await boardsOfClub()).size, 0);
  });

  it('reports a club with no boards rather than failing', async () => {
    await shardRef('cadet').delete();
    await shardRef('juvenil').delete();
    const out = run(['--club', CLUB]);
    assert.ok(/no tactical boards/.test(out), out);
  });
});
