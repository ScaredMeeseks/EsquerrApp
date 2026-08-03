/* Integration tests for js/db.js — the Phase 5 router.
 *
 * Runs the REAL db.js (loaded in a vm context with a fake localStorage and
 * a fake compat-Firestore) so the shadow cache, the per-document diff, the
 * batch and the listener are all exercised as written. No emulator, no
 * Java: `npm run test:router`.
 *
 * Every test here corresponds to a way rows can silently disappear. Seven
 * such defects were found by review after the first version of this file's
 * subject was written; these are the regression tests for them.
 */
'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const {FakeStore, makeApi, FakeLocalStorage} = require('./fake-firestore');
const Shard = require('../js/shard.js');

const DB_SRC = fs.readFileSync(path.join(__dirname, '..', 'js', 'db.js'), 'utf8');

const TEAM = 'teamA';
const DATA = 'teams/' + TEAM + '/data';

/** Load a fresh db.js against a fresh fake backend. */
function bootstrap() {
  const store = new FakeStore();
  const {db, firebase} = makeApi(store);
  const localStorage = new FakeLocalStorage();
  const events = [];
  const sandbox = {
    localStorage, db, firebase, Shard, console,
    window: {
      dispatchEvent: (e) => events.push(e),
    },
    CustomEvent: class CustomEvent {
      constructor(type, init) {
        this.type = type;
        this.detail = init && init.detail;
      }
    },
    Promise, JSON, Object, Array, Error, String, Set, Map,
  };
  sandbox.globalThis = sandbox;
  const DB = vm.runInNewContext(DB_SRC + '\n;DB;', sandbox, {filename: 'db.js'});
  return {DB, store, localStorage, events};
}

const ALL_CATS = ['amateur', 'juvenil', 'cadet', 'infantil', 'alevi', 'benjami'];

/** A club with two categories' worth of training already in Firestore. */
function seedTwoCategories(store) {
  store.seed('teams/' + TEAM, {name: TEAM});
  store.seed(DATA + '/fa_training__cadet', {
    category: 'cadet',
    v: JSON.stringify([{id: 'c1', date: '2026-09-02', category: 'cadet'}]),
  });
  store.seed(DATA + '/fa_training__juvenil', {
    category: 'juvenil',
    v: JSON.stringify([{id: 'j1', date: '2026-09-01', category: 'juvenil'}]),
  });
}

function trainingIn(store, cat) {
  const d = store.read(DATA + '/fa_training__' + cat);
  return d ? JSON.parse(d.v) : null;
}

// Let queued promises and listener callbacks run.
const flush = () => new Promise((r) => setImmediate(r));

describe('db.js router — load and merge', () => {
  it('merges every shard into one localStorage blob', async () => {
    const {DB, store, localStorage} = bootstrap();
    seedTwoCategories(store);
    await DB.init(TEAM, ALL_CATS);
    const merged = JSON.parse(localStorage.getItem('fa_training'));
    // CATEGORY_ORDER puts juvenil before cadet; fa_training then re-sorts
    // by date descending.
    assert.deepStrictEqual(merged.map((t) => t.id), ['c1', 'j1']);
  });

  it('ignores a pre-Phase-5 un-sharded document instead of doubling it', async () => {
    const {DB, store, localStorage} = bootstrap();
    seedTwoCategories(store);
    store.seed(DATA + '/fa_training', {
      v: JSON.stringify([{id: 'c1', date: '2026-09-02', category: 'cadet'}]),
    });
    await DB.init(TEAM, ALL_CATS);
    assert.strictEqual(JSON.parse(localStorage.getItem('fa_training')).length, 2);
  });

  it('starts empty for a club with no data, without uploading anything', async () => {
    const {DB, store, localStorage} = bootstrap();
    store.seed('teams/' + TEAM, {name: TEAM});
    localStorage.setItem('fa_training', JSON.stringify([{id: 'stale'}])); // previous club
    await DB.init(TEAM, ALL_CATS);
    assert.strictEqual(localStorage.getItem('fa_training'), null);
    assert.deepStrictEqual(store.paths(DATA), []);
  });
});

describe('db.js router — writing', () => {
  it('writes ONLY the shard whose content changed', async () => {
    const {DB, store, localStorage} = bootstrap();
    seedTwoCategories(store);
    await DB.init(TEAM, ALL_CATS);
    store.resetWrites();

    const blob = JSON.parse(localStorage.getItem('fa_training'));
    blob.push({id: 'c2', date: '2026-09-09', category: 'cadet'});
    localStorage.setItem('fa_training', JSON.stringify(blob));
    await flush();

    assert.deepStrictEqual(store.written(DATA), [DATA + '/fa_training__cadet']);
    assert.strictEqual(trainingIn(store, 'cadet').length, 2);
    assert.strictEqual(trainingIn(store, 'juvenil').length, 1);
  });

  it('a re-render that changes nothing writes nothing', async () => {
    // renderStaffTraining saves on every render and readTraining on every
    // keystroke — without the per-document diff each becomes N writes.
    const {DB, store, localStorage} = bootstrap();
    seedTwoCategories(store);
    await DB.init(TEAM, ALL_CATS);
    store.resetWrites();
    localStorage.setItem('fa_training', localStorage.getItem('fa_training'));
    await flush();
    assert.deepStrictEqual(store.written(DATA), []);
  });

  it('stamps `category` on every shard it writes', async () => {
    // A shard without the field is invisible to where('category','in',…).
    const {DB, store, localStorage} = bootstrap();
    store.seed('teams/' + TEAM, {name: TEAM});
    await DB.init(TEAM, ALL_CATS);
    localStorage.setItem('fa_matches', JSON.stringify([{id: 1, category: 'cadet'}]));
    await flush();
    assert.strictEqual(store.read(DATA + '/fa_matches__cadet').category, 'cadet');
  });

  it('moves a row between shards in ONE batch', async () => {
    // Delete-from-old plus add-to-new as two requests can half-apply and
    // the row exists nowhere. fa_injuries joins through the roster, so
    // editing the roster re-routes the injury.
    const {DB, store, localStorage} = bootstrap();
    store.seed('teams/' + TEAM, {name: TEAM});
    store.seed(DATA + '/fa_users__cadet', {
      category: 'cadet', v: JSON.stringify([{id: 'p1', category: 'cadet'}]),
    });
    store.seed(DATA + '/fa_injuries__cadet', {
      category: 'cadet', v: JSON.stringify([{id: 'i1', playerId: 'p1'}]),
    });
    await DB.init(TEAM, ALL_CATS);

    // p1 is promoted; the roster blob is rewritten first, as app.js does.
    localStorage.setItem('fa_users', JSON.stringify([{id: 'p1', category: 'juvenil'}]));
    await flush();
    store.resetWrites();
    // Any subsequent write of the injuries blob re-routes it.
    localStorage.setItem('fa_injuries', localStorage.getItem('fa_injuries'));
    await flush();

    assert.deepStrictEqual(JSON.parse(store.read(DATA + '/fa_injuries__cadet').v), []);
    assert.strictEqual(JSON.parse(store.read(DATA + '/fa_injuries__juvenil').v).length, 1);
  });

  it('refuses an unparseable blob without clearing a single shard', async () => {
    // JSON.stringify(undefined) is the string "undefined". Treating that as
    // "legitimately empty" would wipe every shard of the key.
    const {DB, store, localStorage} = bootstrap();
    seedTwoCategories(store);
    await DB.init(TEAM, ALL_CATS);
    store.resetWrites();

    await assert.rejects(() => DB.setItemAcked('fa_training', 'undefined'),
        (e) => e.code === 'blob-unparseable');
    assert.deepStrictEqual(store.written(DATA), []);
    assert.strictEqual(trainingIn(store, 'cadet').length, 1);
    assert.strictEqual(trainingIn(store, 'juvenil').length, 1);
  });

  it('refuses a blob of the wrong shape', async () => {
    const {DB, store, localStorage} = bootstrap();
    seedTwoCategories(store);
    await DB.init(TEAM, ALL_CATS);
    store.resetWrites();
    await assert.rejects(() => DB.setItemAcked('fa_training', '{"not":"an array"}'),
        (e) => e.code === 'blob-shape');
    assert.deepStrictEqual(store.written(DATA), []);
  });

  it('an empty blob DOES clear the shards — that is a real deletion', async () => {
    const {DB, store, localStorage} = bootstrap();
    seedTwoCategories(store);
    await DB.init(TEAM, ALL_CATS);
    await DB.setItemAcked('fa_training', '[]');
    assert.deepStrictEqual(trainingIn(store, 'cadet'), []);
    assert.deepStrictEqual(trainingIn(store, 'juvenil'), []);
  });
});

describe('db.js router — the safety rule', () => {
  it('a scoped coach cannot touch a category they did not download', async () => {
    const {DB, store, localStorage} = bootstrap();
    seedTwoCategories(store);
    // Cadet-only scope: the listener only fetches cadet + none.
    await DB.init(TEAM, ['cadet']);

    const merged = JSON.parse(localStorage.getItem('fa_training'));
    assert.deepStrictEqual(merged.map((t) => t.id), ['c1'], 'juvenil must not be downloaded');

    merged.push({id: 'c2', date: '2026-09-09', category: 'cadet'});
    store.resetWrites();
    await DB.setItemAcked('fa_training', JSON.stringify(merged));

    // The juvenil document is untouched — byte for byte.
    assert.deepStrictEqual(store.written(DATA), [DATA + '/fa_training__cadet']);
    assert.deepStrictEqual(trainingIn(store, 'juvenil'),
        [{id: 'j1', date: '2026-09-01', category: 'juvenil'}]);
  });

  it('refuses the WHOLE write when a row resolves out of scope', async () => {
    const {DB, store, localStorage} = bootstrap();
    seedTwoCategories(store);
    await DB.init(TEAM, ['cadet']);
    store.resetWrites();

    // A juvenil row appearing in a cadet-scoped client can only be a bug;
    // half a re-partition is worse than none of it.
    const blob = JSON.parse(localStorage.getItem('fa_training'));
    blob.push({id: 'x', date: '2026-09-09', category: 'juvenil'});
    blob.push({id: 'c9', date: '2026-09-10', category: 'cadet'});
    await assert.rejects(() => DB.setItemAcked('fa_training', JSON.stringify(blob)),
        (e) => e.code === 'shard-out-of-scope');
    assert.deepStrictEqual(store.written(DATA), []);
  });

  it('reports the refusal through db-write-error', async () => {
    const {DB, store, localStorage, events} = bootstrap();
    seedTwoCategories(store);
    await DB.init(TEAM, ['cadet']);
    const blob = JSON.parse(localStorage.getItem('fa_training'));
    blob.push({id: 'x', date: '2026-09-09', category: 'juvenil'});
    await DB.setItemAcked('fa_training', JSON.stringify(blob)).catch(() => {});
    const err = events.filter((e) => e.type === 'db-write-error').pop();
    assert.ok(err && err.detail.code === 'shard-out-of-scope');
  });
});

describe('db.js router — failure and the shadow cache', () => {
  it('a rejected write leaves the cache matching the server', async () => {
    const {DB, store, localStorage} = bootstrap();
    seedTwoCategories(store);
    await DB.init(TEAM, ALL_CATS);

    store.failNext = (p) => (p.endsWith('fa_training__cadet') ?
      Object.assign(new Error('denied'), {code: 'permission-denied'}) : null);
    const blob = JSON.parse(localStorage.getItem('fa_training'));
    blob.push({id: 'c2', date: '2026-09-09', category: 'cadet'});
    await DB.setItemAcked('fa_training', JSON.stringify(blob)).catch(() => {});
    store.failNext = null;

    // The cache must not believe the row landed: retrying has to write it.
    store.resetWrites();
    await DB.setItemAcked('fa_training', JSON.stringify(blob));
    assert.deepStrictEqual(store.written(DATA), [DATA + '/fa_training__cadet']);
    assert.strictEqual(trainingIn(store, 'cadet').length, 2);
  });

  it('a late failure does not rewind past a write that succeeded', async () => {
    // THE keystroke race: W1 and W2 overlap, W2 acks, then W1 fails. A
    // plain restore would rewind the cache to before W2 and the next
    // rebuild would drop everything typed in between.
    const {DB, store, localStorage} = bootstrap();
    seedTwoCategories(store);
    await DB.init(TEAM, ALL_CATS);

    const base = JSON.parse(localStorage.getItem('fa_training'));
    const w1 = base.concat([{id: 'c2', date: '2026-09-09', category: 'cadet'}]);
    const w2 = w1.concat([{id: 'c3', date: '2026-09-16', category: 'cadet'}]);

    let failFirst = true;
    store.failNext = (p, t) => {
      if (!p.endsWith('fa_training__cadet') || !failFirst) return null;
      failFirst = false;               // only the FIRST commit fails
      return Object.assign(new Error('unavailable'), {code: 'unavailable'});
    };
    const p1 = DB.setItemAcked('fa_training', JSON.stringify(w1)).catch(() => 'failed');
    const p2 = DB.setItemAcked('fa_training', JSON.stringify(w2));
    await Promise.all([p1, p2]);
    store.failNext = null;

    assert.strictEqual(trainingIn(store, 'cadet').length, 3, 'W2 must have landed');
    // The cache agrees with the server, so a no-op save writes nothing —
    // and, crucially, a remote change to another shard cannot resurrect the
    // pre-W2 content.
    store.resetWrites();
    await DB.setItemAcked('fa_training', JSON.stringify(w2));
    assert.deepStrictEqual(store.written(DATA), []);
  });
});

describe('db.js router — remote changes', () => {
  it('rebuilds the merged blob and announces the key once', async () => {
    const {DB, store, localStorage, events} = bootstrap();
    seedTwoCategories(store);
    await DB.init(TEAM, ALL_CATS);
    events.length = 0;

    // Another coach adds a juvenil session.
    store.seed(DATA + '/fa_training__juvenil', {
      category: 'juvenil',
      v: JSON.stringify([
        {id: 'j1', date: '2026-09-01', category: 'juvenil'},
        {id: 'j2', date: '2026-09-08', category: 'juvenil'},
      ]),
    });
    store._notify(DATA + '/fa_training__juvenil', false);
    await flush();

    const merged = JSON.parse(localStorage.getItem('fa_training'));
    assert.deepStrictEqual(merged.map((t) => t.id), ['j2', 'c1', 'j1']);
    const synced = events.filter((e) => e.type === 'firestore-sync' &&
        e.detail.key === 'fa_training');
    assert.strictEqual(synced.length, 1, 'one event per key, not per document');
  });

  it('a removed shard drops out of the merged blob', async () => {
    const {DB, store, localStorage} = bootstrap();
    seedTwoCategories(store);
    await DB.init(TEAM, ALL_CATS);
    store.docs.delete(DATA + '/fa_training__juvenil');
    store._notify(DATA + '/fa_training__juvenil', false);
    await flush();
    assert.deepStrictEqual(
        JSON.parse(localStorage.getItem('fa_training')).map((t) => t.id), ['c1']);
  });

  it('ignores a shard whose category is not a category', async () => {
    // Merging it would put rows in localStorage that the next write routes
    // to __none while the original shard stays put — permanent duplication.
    const {DB, store, localStorage} = bootstrap();
    seedTwoCategories(store);
    store.seed(DATA + '/fa_training__senior', {
      category: 'senior',
      v: JSON.stringify([{id: 's1', date: '2026-09-03', category: 'senior'}]),
    });
    await DB.init(TEAM, ALL_CATS);
    const ids = JSON.parse(localStorage.getItem('fa_training')).map((t) => t.id);
    assert.deepStrictEqual(ids, ['c1', 'j1']);
  });
});

describe('db.js router — per-field merge keys', () => {
  it('writes only the changed field and keeps `category`', async () => {
    const {DB, store, localStorage} = bootstrap();
    store.seed('teams/' + TEAM, {name: TEAM});
    store.seed(DATA + '/fa_users__cadet', {
      category: 'cadet', v: JSON.stringify([{id: 'p1', category: 'cadet'}]),
    });
    store.seed(DATA + '/fa_injury_notes__cadet', {category: 'cadet', p1: 'hamstring'});
    await DB.init(TEAM, ALL_CATS);

    assert.deepStrictEqual(JSON.parse(localStorage.getItem('fa_injury_notes')),
        {p1: 'hamstring'});

    await DB.setItemAcked('fa_injury_notes', JSON.stringify({p1: 'calf'}));
    const doc = store.read(DATA + '/fa_injury_notes__cadet');
    assert.strictEqual(doc.p1, 'calf');
    assert.strictEqual(doc.category, 'cadet', 'category must survive a field write');
  });

  it('deleting an entry removes just that field', async () => {
    const {DB, store, localStorage} = bootstrap();
    store.seed('teams/' + TEAM, {name: TEAM});
    store.seed(DATA + '/fa_users__cadet', {
      category: 'cadet',
      v: JSON.stringify([{id: 'p1', category: 'cadet'}, {id: 'p2', category: 'cadet'}]),
    });
    store.seed(DATA + '/fa_injury_notes__cadet',
        {category: 'cadet', p1: 'hamstring', p2: 'ankle'});
    await DB.init(TEAM, ALL_CATS);

    await DB.setItemAcked('fa_injury_notes', JSON.stringify({p2: 'ankle'}));
    const doc = store.read(DATA + '/fa_injury_notes__cadet');
    assert.ok(!('p1' in doc));
    assert.strictEqual(doc.p2, 'ankle');
    assert.strictEqual(doc.category, 'cadet');
  });
});
