/* Unit tests for reading an archived season.
 *
 * Pure logic, no emulator and no Firebase: `npm run test:archive`.
 *
 * The archived-seasons viewer had NO test coverage of any kind, which is
 * why it stayed broken from the Phase 5 sharding migration until someone
 * clicked it. It never threw: `loadSeasonData` keyed its result by the raw
 * document id, so after the migration `data.fa_matches` was simply absent
 * and every consumer's `|| []` fallback turned a full season into an empty
 * one. A silent wrong answer is the failure mode worth testing for.
 *
 * Two id formats have to work FOR EVER, not during a transition:
 *   fa_matches__amateur   sharded, written since Phase 5
 *   fa_matches            flat, written before it
 * A season archived before the migration keeps the flat shape permanently,
 * so unlike the live loader in js/db.js — which drops legacy ids because
 * Stage E wiped them — this one cannot.
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const Shard = require(path.join(__dirname, '..', 'js', 'shard.js'));
const src = fs.readFileSync(path.join(__dirname, '..', 'js', 'app.js'), 'utf8');

function grab(from, to) {
  const i = src.indexOf(from);
  const j = src.indexOf(to, i);
  assert.ok(i !== -1 && j !== -1, 'marker not found in js/app.js: ' + from);
  return src.slice(i, j);
}

const { groupArchivedDocs } = (() => {
  const code = grab('  function parseArchiveDoc(raw)', '  // Load all data docs');
  // eslint-disable-next-line no-new-func
  return new Function('Shard', `${code}\nreturn { parseArchiveDoc, groupArchivedDocs };`)(Shard);
})();

/** A blob-shape archive document, as archiveSeason writes it. */
const blob = (cat, value) => ({ v: JSON.stringify(value), category: cat });

describe('archived seasons — reassembling the shards', () => {
  it('merges one key across categories into a single blob', () => {
    const out = groupArchivedDocs([
      { id: 'fa_matches__amateur', data: blob('amateur', [{ id: 1 }, { id: 2 }]) },
      { id: 'fa_matches__juvenil', data: blob('juvenil', [{ id: 3 }]) },
    ]);
    assert.ok(Array.isArray(out.fa_matches), 'the key the UI actually reads');
    assert.strictEqual(out.fa_matches.length, 3);
    assert.deepStrictEqual(out.fa_matches.map((m) => m.id).sort(), [1, 2, 3]);
  });

  it('is the regression: the raw shard ids must NOT survive', () => {
    const out = groupArchivedDocs([
      { id: 'fa_matches__amateur', data: blob('amateur', [{ id: 1 }]) },
    ]);
    assert.strictEqual(out['fa_matches__amateur'], undefined,
        'keying by doc id is what made every archived season look empty');
  });

  it('still reads a pre-Phase-5 archive, whose ids are flat', () => {
    const out = groupArchivedDocs([
      { id: 'fa_matches', data: { v: JSON.stringify([{ id: 9 }]) } },
      { id: 'fa_training', data: { v: JSON.stringify([{ date: '2025-01-01' }]) } },
    ]);
    assert.strictEqual(out.fa_matches.length, 1);
    assert.strictEqual(out.fa_training.length, 1);
  });

  it('reads an archive holding both formats at once', () => {
    // Not hypothetical: an archive written across the migration, or a
    // legacy doc left beside re-archived shards.
    const out = groupArchivedDocs([
      { id: 'fa_matches', data: { v: JSON.stringify([{ id: 1 }]) } },
      { id: 'fa_injuries__amateur', data: blob('amateur', [{ id: 'i1' }]) },
    ]);
    assert.strictEqual(out.fa_matches.length, 1);
    assert.strictEqual(out.fa_injuries.length, 1);
  });

  it('merges map-shaped keys by key, not by concatenation', () => {
    // fa_match_events is a map of matchId → events.
    const out = groupArchivedDocs([
      { id: 'fa_match_events__amateur', data: blob('amateur', { m1: ['goal'] }) },
      { id: 'fa_match_events__juvenil', data: blob('juvenil', { m2: ['card'] }) },
    ]);
    assert.deepStrictEqual(Object.keys(out.fa_match_events).sort(), ['m1', 'm2']);
  });

  it('reads the merge-shape docs that have no v', () => {
    // fa_injury_notes stores entries as top-level fields.
    const out = groupArchivedDocs([
      { id: 'fa_injury_notes__amateur', data: { p1: 'a note', category: 'amateur' } },
    ]);
    assert.deepStrictEqual(out.fa_injury_notes, { p1: 'a note' });
  });

  it('drops the router bookkeeping from a merge-shape doc', () => {
    // `category` and `_migrated` are the router's, not the club's. Left in,
    // they read as a player id with a note attached.
    const out = groupArchivedDocs([
      { id: 'fa_injury_zone__amateur', data: { p1: 3, category: 'amateur', _migrated: true } },
    ]);
    assert.deepStrictEqual(Object.keys(out.fa_injury_zone), ['p1']);
  });

  it('keeps an unrouted key rather than throwing or dropping it', () => {
    // Shard.merge throws on a key it has no route for. Better to surface
    // the document untouched than to lose an archive to an exception.
    const out = groupArchivedDocs([
      { id: 'fa_unknown__amateur', data: blob('amateur', [{ id: 1 }]) },
    ]);
    assert.ok(out['fa_unknown__amateur'], 'preserved under its own id');
  });

  it('returns an empty object for an empty archive, never null', () => {
    assert.deepStrictEqual(groupArchivedDocs([]), {});
    assert.deepStrictEqual(groupArchivedDocs(null), {});
  });

  it('survives a corrupt blob without losing the rest of the season', () => {
    const out = groupArchivedDocs([
      { id: 'fa_matches__amateur', data: { v: '{not json', category: 'amateur' } },
      { id: 'fa_training__amateur', data: blob('amateur', [{ date: '2025-01-01' }]) },
    ]);
    assert.strictEqual(out.fa_training.length, 1, 'one bad doc must not take the season with it');
  });

  it('produces the same blob the live loader would have held', () => {
    // The whole point of reusing Shard.merge: an archived season and the
    // live season it came from must not render differently.
    const shards = { amateur: [{ id: 1 }], juvenil: [{ id: 2 }] };
    const viaArchive = groupArchivedDocs([
      { id: 'fa_matches__amateur', data: blob('amateur', shards.amateur) },
      { id: 'fa_matches__juvenil', data: blob('juvenil', shards.juvenil) },
    ]).fa_matches;
    assert.deepStrictEqual(viaArchive, Shard.merge('fa_matches', shards));
  });
});

describe('archived seasons — attendance comes from its own collection', () => {
  /* fa_training_availability was dropped from the server's SEASON_KEYS when
     the canonical records moved to per-record collections, so it is not in
     an archive at all. Reading it there returned {} and every player showed
     0% — an answer, not an error. */

  it('aggregation takes the availability map as an argument', () => {
    const body = grab('  function aggregateArchivedAttendance(data, avail)',
        '\n  // Render archived seasons list page');
    assert.ok(!body.includes('data.fa_training_availability'),
        'that key is never present in an archive');
  });

  it('the loader reuses db.js\'s own record mapping', () => {
    const body = grab('  async function loadArchivedRecords(', '\n  // Aggregate player stats');
    assert.ok(body.includes('DB.RECORD_COLLECTIONS'),
        'a second copy of toEntry is how archived and live views drift apart');
  });

  it('db.js exports that mapping', () => {
    const dbSrc = fs.readFileSync(path.join(__dirname, '..', 'js', 'db.js'), 'utf8');
    assert.ok(/RECORD_COLLECTIONS: RECORD_COLLECTIONS/.test(dbSrc));
  });

  it('is fetched lazily, only for the tab that needs it', () => {
    // A season holds one record per player per session — thousands of
    // documents. Three of the four tabs never touch them.
    const body = grab('  function maybeLoadArchiveAttendance()',
        '\n  // Expose navigation helper');
    assert.ok(body.includes("_archiveTab !== 'attendance'"), 'only that tab pays');
    assert.ok(body.includes('_archiveAvailLoading'), 'and only once');
  });
});

describe('archived seasons — the stale duplicate is gone', () => {
  it('js/app.js no longer declares SEASON_KEYS', () => {
    // It had no readers and had drifted from the server's list, which is
    // the only one that decides what an archive contains.
    assert.ok(!/var SEASON_KEYS = \[/.test(src));
  });

  it('functions/index.js no longer points readers at it', () => {
    const fnSrc = fs.readFileSync(
        path.join(__dirname, '..', 'functions', 'index.js'), 'utf8');
    assert.ok(!/Keep in step with SEASON_KEYS in js\/app\.js/.test(fnSrc));
    assert.ok(/const SEASON_KEYS = \[/.test(fnSrc), 'the real one stays');
  });
});
