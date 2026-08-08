/* Unit tests for the tactical-board author label.
 *
 * Pure logic, no emulator: `npm run test:authors`.
 *
 * WHY NOT the functions emulator, where the triggers live: `test:functions`
 * runs `--only firestore,functions` with NO Auth emulator, so the
 * `setCustomUserClaims` call that precedes every syncBoardAuthor call site
 * throws before execution ever reaches it. Testing the label through
 * onRosterWritten would therefore assert nothing at all — and would LOOK like
 * it passed. These tests exercise the two helpers directly instead, using the
 * same source-grab technique as reminders.test.js.
 *
 * What they protect:
 *
 *   1. "Highest category" means the LOWEST CATEGORY_ORDER index. A coach of
 *      both amateur and benjami is shown as amateur. Getting this backwards
 *      is invisible in review and wrong on every multi-category coach.
 *   2. Leaving FREEZES the label rather than clearing it. The club library
 *      must keep naming the team a departed coach last had, because their
 *      boards outlive them.
 *   3. A freeze never CREATES a label. A player, or a coach removed before
 *      they ever drew anything, must not leave a tombstone in a collection
 *      that exists only to name authors.
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const src = fs.readFileSync(
    path.join(__dirname, '..', 'functions', 'index.js'), 'utf8');

function grab(from, to) {
  const i = src.indexOf(from);
  const j = src.indexOf(to, i);
  assert.ok(i !== -1 && j !== -1,
      'marker not found in functions/index.js: ' + from);
  return src.slice(i, j);
}

/** A Firestore stand-in that records what was written. */
function fakeDb() {
  const docs = {};
  const writes = [];
  const ref = (p) => ({
    get: async () => ({
      exists: Object.prototype.hasOwnProperty.call(docs, p),
      data: () => docs[p],
    }),
    set: async (v, opts) => {
      writes.push({path: p, value: v, merge: !!(opts && opts.merge)});
      docs[p] = Object.assign({}, docs[p] || {}, v);
    },
  });
  return {
    _docs: docs,
    _writes: writes,
    collection: (c) => ({
      doc: (id) => ({
        collection: (c2) => ({doc: (id2) => ref(c + '/' + id + '/' + c2 + '/' + id2)}),
      }),
    }),
  };
}

/** The real helpers, over the fake db. */
function load(db) {
  const shard = grab('const SHARD_SEP =', 'function splitShardId');
  const rank = grab('function shardRank(cat)', '/**\n * Every shard document');
  const authors = grab('function authorLabelFrom(rosters, email)',
      '/**\n * The roles array to persist');
  const FieldValue = {serverTimestamp: () => '<ts>'};
  // eslint-disable-next-line no-new-func
  return new Function('db', 'FieldValue', `${shard}\n${rank}\n${authors}
    return { authorLabelFrom, syncBoardAuthor };`)(db, FieldValue);
}

/** Roster shape produced by loadRosters(). */
const R = (key, staff) => ({key, staff, players: []});
const COACH = 'coach@x.com';

describe('authorLabelFrom — which team a club shows for an author', () => {
  const H = load(fakeDb());

  it('a single-category coach gets that category and its letter', () => {
    const l = H.authorLabelFrom([R('cadet-A', [COACH])], COACH);
    assert.strictEqual(l.category, 'cadet');
    assert.strictEqual(l.rank, 2);
    assert.deepStrictEqual(l.letters, ['A']);
  });

  it('HIGHEST category wins, and highest means lowest CATEGORY_ORDER index', () => {
    // The one that is invisible in review. amateur(0) outranks benjami(5).
    const l = H.authorLabelFrom([
      R('benjami-A', [COACH]),
      R('amateur-B', [COACH]),
      R('cadet-A', [COACH]),
    ], COACH);
    assert.strictEqual(l.category, 'amateur');
    assert.strictEqual(l.rank, 0);
  });

  it('collects every letter of the winning category, sorted', () => {
    const l = H.authorLabelFrom([
      R('cadet-B', [COACH]), R('cadet-A', [COACH]), R('juvenil-A', [COACH]),
    ], COACH);
    assert.strictEqual(l.category, 'juvenil');
    assert.deepStrictEqual(l.letters, ['A']);
  });

  it('letters come only from the winning category, never merged across', () => {
    const l = H.authorLabelFrom([
      R('cadet-C', [COACH]), R('juvenil-B', [COACH]), R('juvenil-A', [COACH]),
    ], COACH);
    assert.deepStrictEqual(l.letters, ['A', 'B']);
  });

  it('null when the address coaches nothing here', () => {
    assert.strictEqual(H.authorLabelFrom([R('cadet-A', ['other@x.com'])], COACH), null);
    assert.strictEqual(H.authorLabelFrom([], COACH), null);
    assert.strictEqual(H.authorLabelFrom([R('cadet-A', [COACH])], ''), null);
  });

  it('an unknown category sorts last rather than winning', () => {
    // shardRank returns 99 for anything it does not recognise. A typo in a
    // roster key must not promote a coach to the top of the club.
    const l = H.authorLabelFrom([
      R('kadet-A', [COACH]), R('cadet-A', [COACH]),
    ], COACH);
    assert.strictEqual(l.category, 'cadet');
  });
});

describe('syncBoardAuthor — upsert while here, freeze on leaving', () => {
  const P = 'clubs/c1/boardAuthors/u1';

  it('writes the label while they are still staff', async () => {
    const db = fakeDb();
    const H = load(db);
    await H.syncBoardAuthor('c1', 'u1', {email: COACH, name: 'Coach'},
        [R('cadet-A', [COACH])]);
    const d = db._docs[P];
    assert.strictEqual(d.category, 'cadet');
    assert.strictEqual(d.categoryRank, 2);
    assert.deepStrictEqual(d.letters, ['A']);
    assert.strictEqual(d.active, true);
    assert.strictEqual(d.leftAt, null);
    assert.strictEqual(d.name, 'Coach');
  });

  it('FREEZES on leaving — category and letters are left exactly as they were', async () => {
    const db = fakeDb();
    const H = load(db);
    await H.syncBoardAuthor('c1', 'u1', {email: COACH, name: 'Coach'},
        [R('juvenil-B', [COACH])]);
    // ...and now they are on no staff list at all.
    await H.syncBoardAuthor('c1', 'u1', {email: COACH, name: 'Coach'}, []);
    const d = db._docs[P];
    assert.strictEqual(d.active, false);
    assert.strictEqual(d.leftAt, '<ts>');
    // The whole design: "their last team in this club" needs no snapshotting
    // logic, because leaving simply does not overwrite it.
    assert.strictEqual(d.category, 'juvenil');
    assert.deepStrictEqual(d.letters, ['B']);
    assert.strictEqual(d.name, 'Coach');
  });

  it('never CREATES a label for someone who never had one', async () => {
    // A player, or a coach removed before drawing anything. A tombstone here
    // would be a row in the club library naming nobody.
    const db = fakeDb();
    const H = load(db);
    await H.syncBoardAuthor('c1', 'u1', {email: 'player@x.com'}, []);
    assert.strictEqual(db._docs[P], undefined);
    assert.strictEqual(db._writes.length, 0);
  });

  it('coming back clears the freeze', async () => {
    const db = fakeDb();
    const H = load(db);
    await H.syncBoardAuthor('c1', 'u1', {email: COACH, name: 'Coach'},
        [R('cadet-A', [COACH])]);
    await H.syncBoardAuthor('c1', 'u1', {email: COACH, name: 'Coach'}, []);
    await H.syncBoardAuthor('c1', 'u1', {email: COACH, name: 'Coach'},
        [R('infantil-A', [COACH])]);
    const d = db._docs[P];
    assert.strictEqual(d.active, true);
    assert.strictEqual(d.leftAt, null);
    assert.strictEqual(d.category, 'infantil');
  });

  it('an empty name never overwrites a stored one', async () => {
    // joinClub runs BEFORE the client writes users/{uid}, so it has no name
    // to offer. A merge carrying name:"" would wipe a good one.
    const db = fakeDb();
    const H = load(db);
    await H.syncBoardAuthor('c1', 'u1', {email: COACH, name: 'Coach'},
        [R('cadet-A', [COACH])]);
    await H.syncBoardAuthor('c1', 'u1', {email: COACH},
        [R('cadet-A', [COACH])]);
    assert.strictEqual(db._docs[P].name, 'Coach');
  });

  it('marks an erased person as deleted, still without removing the label', async () => {
    const db = fakeDb();
    const H = load(db);
    await H.syncBoardAuthor('c1', 'u1', {email: COACH, name: 'Coach'},
        [R('cadet-A', [COACH])]);
    await H.syncBoardAuthor('c1', 'u1', {email: COACH, name: 'Coach'}, [],
        {deleted: true});
    const d = db._docs[P];
    assert.strictEqual(d.deleted, true);
    assert.strictEqual(d.active, false);
    assert.strictEqual(d.category, 'cadet', 'their boards still need a team');
  });

  it('does nothing without a club or a uid', async () => {
    const db = fakeDb();
    const H = load(db);
    await H.syncBoardAuthor('', 'u1', {email: COACH}, [R('cadet-A', [COACH])]);
    await H.syncBoardAuthor('c1', '', {email: COACH}, [R('cadet-A', [COACH])]);
    assert.strictEqual(db._writes.length, 0);
  });
});

describe('every syncBoardAuthor call site is wired up', () => {
  /* Six calls across five functions — onClubLeadChanged has two, for the
     outgoing and incoming lead. joinClub is the one that is easy to miss:
     when a lead adds an unregistered coach's address, onRosterWritten fires
     but finds no users/{uid} and skips them, so joinClub is where that uid
     first exists. Without it a new coach's boards render authorless until
     some unrelated roster edit happens to re-trigger the other path. */
  const sites = ['onRosterWritten', 'joinClub', 'setRole',
    'onClubLeadChanged', 'deleteMember'];

  it('calls syncBoardAuthor six times in total', () => {
    const n = (src.match(/await syncBoardAuthor\(/g) || []).length;
    assert.strictEqual(n, 6, 'expected 6 call sites, found ' + n);
  });

  sites.forEach((name) => {
    it('mentions it near ' + name, () => {
      const i = src.indexOf(name);
      assert.notStrictEqual(i, -1, name + ' not found');
      const j = src.indexOf('syncBoardAuthor', i);
      assert.notStrictEqual(j, -1, 'no syncBoardAuthor after ' + name);
    });
  });

  it('never lets a failed label abort the membership change', () => {
    // A label is cosmetic; claims and roster membership are not. Every call
    // site wraps it, so a Firestore hiccup cannot roll back a promotion.
    const calls = src.split('await syncBoardAuthor(').slice(1);
    calls.forEach((tail, i) => {
      const before = src.split('await syncBoardAuthor(')[i];
      assert.ok(before.lastIndexOf('try {') > before.lastIndexOf('});'),
          'call site ' + (i + 1) + ' is not inside a try block');
    });
  });
});
