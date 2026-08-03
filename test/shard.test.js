/* Unit tests for js/shard.js — the Phase 5 Stage B routing rules.
 *
 * Pure logic, no emulator: `npm run test:shard` (or `mocha shard.test.js`).
 * The routing decisions here are the ones that decide which coach can see
 * a medical record, so they are worth testing away from Firestore.
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const Shard = require('../js/shard.js');

const NONE = Shard.NONE;

/* Roster and fixture list used by every join-based test. */
const USERS = [
  { id: 'p1', category: 'cadet' },
  { id: 'p2', category: 'juvenil' },
  { id: 'p3', category: '' },          // unassigned player
  { id: 'coach', category: '' }        // staff carry no category
];
const MATCHES = [
  { id: 10, category: 'cadet' },
  { id: 20, category: 'juvenil' }
];

const ctx = {
  userCat: (uid) => {
    const u = USERS.find(x => String(x.id) === String(uid));
    return u ? u.category : '';
  },
  matchCat: (mid) => {
    const m = MATCHES.find(x => String(x.id) === String(mid));
    return m ? m.category : '';
  }
};

/** partition → merge must be the identity for every key. */
function roundTrip(key, blob) {
  return Shard.merge(key, Shard.partition(key, blob, ctx, null));
}

describe('shard.js — constants', () => {
  it('CATEGORY_ORDER agrees with utils.js', () => {
    // shard.js carries a literal fallback so Node can require it standalone.
    // If utils.js gains a category and this one does not, sharding silently
    // routes it to __none for the whole club.
    const utils = fs.readFileSync(path.join(__dirname, '..', 'js', 'utils.js'), 'utf8');
    const m = utils.match(/const CATEGORY_ORDER = \[([^\]]+)\]/);
    assert.ok(m, 'CATEGORY_ORDER not found in utils.js');
    const fromUtils = m[1].split(',').map(s => s.trim().replace(/^'|'$/g, ''));
    assert.deepStrictEqual(Shard.ORDER, fromUtils);
  });

  it('emptyFor matches each route\'s shape', () => {
    // db.js refuses a blob whose shape disagrees with `Array.isArray(
    // emptyFor(key))` — a wrong answer here would let a malformed blob
    // through and clear every shard of the key.
    Object.keys(Shard.ROUTES).forEach(key => {
      const empty = Shard.emptyFor(key);
      const isArrayKey = Shard.ROUTES[key].shape === 'array';
      assert.strictEqual(Array.isArray(empty), isArrayKey, key);
      assert.ok(Shard.isEmpty(key, empty), key);
    });
  });

  it('document ids round-trip and legacy ids are rejected', () => {
    assert.strictEqual(Shard.docId('fa_injuries', 'cadet'), 'fa_injuries__cadet');
    assert.deepStrictEqual(Shard.parseDocId('fa_injuries__cadet'), { key: 'fa_injuries', cat: 'cadet' });
    assert.deepStrictEqual(Shard.parseDocId('fa_injury_notes__none'), { key: 'fa_injury_notes', cat: 'none' });
    // Single underscores in a base key must not be mistaken for the separator
    assert.strictEqual(Shard.parseDocId('fa_injuries'), null);
    assert.strictEqual(Shard.parseDocId('fa_tactic_training_boards'), null);
  });
});

describe('shard.js — field-routed keys', () => {
  it('splits an array by its own category stamp', () => {
    const training = [
      { id: 't1', date: '2026-09-01', category: 'cadet' },
      { id: 't2', date: '2026-09-02', category: 'juvenil' },
      { id: 't3', date: '2026-09-03', category: 'cadet' }
    ];
    const parts = Shard.partition('fa_training', training, ctx, null);
    assert.deepStrictEqual(Object.keys(parts).sort(), ['cadet', 'juvenil']);
    assert.strictEqual(parts.cadet.length, 2);
    assert.strictEqual(parts.juvenil.length, 1);
  });

  it('sends an unstamped row to __none rather than dropping it', () => {
    const parts = Shard.partition('fa_matchday', [{ opponent: 'X' }], ctx, null);
    assert.deepStrictEqual(Object.keys(parts), [NONE]);
  });

  it('treats an unknown category as no category', () => {
    const parts = Shard.partition('fa_matches', [{ id: 1, category: 'veterans' }], ctx, null);
    assert.deepStrictEqual(Object.keys(parts), [NONE]);
  });

  it('merges in CATEGORY_ORDER with __none last', () => {
    const merged = Shard.merge('fa_matches', {
      none:    [{ id: 4 }],
      cadet:   [{ id: 3 }],
      amateur: [{ id: 1 }],
      juvenil: [{ id: 2 }]
    });
    assert.deepStrictEqual(merged.map(m => m.id), [1, 2, 3, 4]);
  });

  it('sorts fa_training by date descending after merging', () => {
    const merged = Shard.merge('fa_training', {
      juvenil: [{ id: 'b', date: '2026-09-05' }],
      cadet:   [{ id: 'a', date: '2026-09-09' }, { id: 'c', date: '2026-09-01' }]
    });
    assert.deepStrictEqual(merged.map(t => t.id), ['a', 'b', 'c']);
  });

  it('sorts notifications newest-first so the 200 cap trims globally', () => {
    // Concatenating shards would make the cap drop one whole category.
    const merged = Shard.merge('fa_staff_notifications', {
      juvenil: [{ id: 'n2', timestamp: '2026-08-02T10:00:00Z' }],
      cadet:   [{ id: 'n1', timestamp: '2026-08-03T10:00:00Z' },
                { id: 'n3', timestamp: '2026-08-01T10:00:00Z' }]
    });
    assert.deepStrictEqual(merged.map(n => n.id), ['n1', 'n2', 'n3']);
  });
});

describe('shard.js — roster joins', () => {
  it('routes injuries by the player\'s CURRENT category', () => {
    const injuries = [
      { id: 'i1', playerId: 'p1' },
      { id: 'i2', playerId: 'p2' },
      { id: 'i3', playerId: 'p3' }   // unassigned
    ];
    const parts = Shard.partition('fa_injuries', injuries, ctx, null);
    assert.deepStrictEqual(parts.cadet.map(i => i.id), ['i1']);
    assert.deepStrictEqual(parts.juvenil.map(i => i.id), ['i2']);
    assert.deepStrictEqual(parts[NONE].map(i => i.id), ['i3']);
  });

  it('re-shards a promoted player\'s history instead of stranding it', () => {
    // The reason injuries are NOT stamped: the shard follows the player.
    const prev = { cadet: [{ id: 'i1', playerId: 'p1' }] };
    const promoted = {
      userCat: (uid) => (String(uid) === 'p1' ? 'juvenil' : ctx.userCat(uid)),
      matchCat: ctx.matchCat
    };
    const parts = Shard.partition('fa_injuries', [{ id: 'i1', playerId: 'p1' }], promoted, prev);
    assert.strictEqual(parts.juvenil.length, 1);
    assert.ok(!parts.cadet || !parts.cadet.length);
  });

  it('keeps a row put when its join stops resolving', () => {
    // Player deleted from the roster: falling to __none would move a squad's
    // medical history out from under its coach.
    const prev = { cadet: [{ id: 'i9', playerId: 'gone' }] };
    const parts = Shard.partition('fa_injuries', [{ id: 'i9', playerId: 'gone' }], ctx, prev);
    assert.deepStrictEqual(Object.keys(parts), ['cadet']);
    // With no history to fall back on it lands in __none, still not dropped.
    const fresh = Shard.partition('fa_injuries', [{ id: 'i9', playerId: 'gone' }], ctx, null);
    assert.deepStrictEqual(Object.keys(fresh), [NONE]);
  });

  it('routes uid-keyed maps by the uid', () => {
    const notes = { p1: 'hamstring', p2: 'ankle', coach: 'n/a' };
    const parts = Shard.partition('fa_injury_notes', notes, ctx, null);
    assert.deepStrictEqual(parts.cadet, { p1: 'hamstring' });
    assert.deepStrictEqual(parts.juvenil, { p2: 'ankle' });
    assert.deepStrictEqual(parts[NONE], { coach: 'n/a' });
  });

  it('routes {uid}_{date} keys by the uid prefix', () => {
    const overrides = { 'p1_2026-09-01': 'yes', 'p2_2026-09-01': 'no' };
    const parts = Shard.partition('fa_training_staff_override', overrides, ctx, null);
    assert.deepStrictEqual(parts.cadet, { 'p1_2026-09-01': 'yes' });
    assert.deepStrictEqual(parts.juvenil, { 'p2_2026-09-01': 'no' });
  });
});

describe('shard.js — match joins', () => {
  it('routes matchId-keyed maps through fa_matches', () => {
    const sent = { '10': true, '20': true, '99': true };
    const parts = Shard.partition('fa_convocatoria_sent', sent, ctx, null);
    assert.deepStrictEqual(parts.cadet, { '10': true });
    assert.deepStrictEqual(parts.juvenil, { '20': true });
    assert.deepStrictEqual(parts[NONE], { '99': true });   // unknown match
  });

  it('carries the whole bucket for match boards', () => {
    const boards = { '10': [{ name: 'A' }, { name: 'B' }] };
    const parts = Shard.partition('fa_tactic_match_boards', boards, ctx, null);
    assert.strictEqual(parts.cadet['10'].length, 2);
  });
});

describe('shard.js — date-keyed training boards', () => {
  it('splits ONE date bucket across categories by the entry stamp', () => {
    // The pre-existing bug this fixes: two categories training the same
    // evening share a bucket, so the date cannot say whose board it is.
    const boards = {
      '2026-09-01': [
        { category: 'cadet', name: 'Press' },
        { category: 'juvenil', name: 'Build-up' }
      ]
    };
    const parts = Shard.partition('fa_tactic_training_boards', boards, ctx, null);
    assert.deepStrictEqual(parts.cadet['2026-09-01'].map(b => b.name), ['Press']);
    assert.deepStrictEqual(parts.juvenil['2026-09-01'].map(b => b.name), ['Build-up']);
  });

  it('rebuilds the shared bucket on merge', () => {
    const blob = {
      '2026-09-01': [{ category: 'cadet', name: 'Press' }, { category: 'juvenil', name: 'Build-up' }],
      '2026-09-03': [{ category: 'juvenil', name: 'Set piece' }]
    };
    const back = roundTrip('fa_tactic_training_boards', blob);
    assert.deepStrictEqual(Object.keys(back).sort(), ['2026-09-01', '2026-09-03']);
    assert.strictEqual(back['2026-09-01'].length, 2);
  });
});

describe('shard.js — round trips', () => {
  it('loses nothing for any routed key', () => {
    const fixtures = {
      fa_users: USERS,
      fa_training: [{ id: 't1', date: '2026-09-02', category: 'cadet' },
                    { id: 't2', date: '2026-09-01', category: 'juvenil' }],
      fa_matches: MATCHES,
      fa_matchday: [{ opponent: 'X', category: 'cadet' }, { opponent: 'Y', category: '' }],
      fa_staff_notifications: [{ id: 'n1', timestamp: '2026-08-02T10:00:00Z', category: 'cadet' },
                               { id: 'n2', timestamp: '2026-08-01T10:00:00Z', category: '' }],
      fa_tactic_saved: [{ id: 'b1', category: 'cadet', name: 'A' }],
      fa_injuries: [{ id: 'i1', playerId: 'p1' }, { id: 'i2', playerId: 'p3' }],
      fa_injury_notes: { p1: 'a', p3: 'b' },
      fa_injury_zone: { p1: 3 },
      fa_injury_dismissed: { p2: '2026-09-01' },
      fa_training_staff_override: { 'p1_2026-09-01': 'yes' },
      fa_match_events: { '10': [{ min: 5 }] },
      fa_match_goals: { '20': 2 },
      fa_convocatoria_sent: { '10': true },
      fa_convocatoria_callup: { '20': '19:30' },
      fa_tactic_match_boards: { '10': [{ name: 'A' }] },
      fa_tactic_training_boards: { '2026-09-01': [{ category: 'cadet', name: 'P' }] }
    };
    // Every key in the routing table needs a fixture, or a shape can change
    // without this test noticing.
    assert.deepStrictEqual(Object.keys(fixtures).sort(), Object.keys(Shard.ROUTES).sort());

    Object.keys(fixtures).forEach(key => {
      const back = roundTrip(key, fixtures[key]);
      if (Array.isArray(fixtures[key])) {
        assert.strictEqual(back.length, fixtures[key].length, key + ': lost rows');
        // Order may change (merge is by category, then the key's own sort),
        // so compare as sets of serialised rows.
        assert.deepStrictEqual(
          back.map(JSON.stringify).sort(),
          fixtures[key].map(JSON.stringify).sort(),
          key + ': content changed'
        );
      } else {
        assert.deepStrictEqual(back, fixtures[key], key + ': content changed');
      }
    });
  });

  it('survives a blob of the wrong shape without throwing', () => {
    assert.deepStrictEqual(Shard.partition('fa_matches', null, ctx, null), {});
    assert.deepStrictEqual(Shard.partition('fa_injury_notes', [], ctx, null), {});
    assert.deepStrictEqual(Shard.merge('fa_matches', {}), []);
    assert.deepStrictEqual(Shard.merge('fa_injury_notes', {}), {});
  });

  it('a scoped client\'s write cannot touch a category it did not download', () => {
    // The clobber case this whole phase exists to remove, and the property
    // db.js's `_inScope` assert is the second line of defence for. A cadet-
    // scoped coach downloads only the cadet shard, so their merged blob —
    // and therefore every shard their write-back produces — contains cadet
    // and nothing else. The juvenil document is never in the write set.
    const cadetOnly = Shard.merge('fa_training', {
      cadet: [{ id: 't1', date: '2026-09-01', category: 'cadet' }]
    });
    cadetOnly.push({ id: 't2', date: '2026-09-08', category: 'cadet' });
    const written = Shard.partition('fa_training', cadetOnly, ctx, { cadet: cadetOnly });
    assert.deepStrictEqual(Object.keys(written), ['cadet']);
    assert.strictEqual(written.juvenil, undefined);
  });

  it('merges an unrecognised shard last instead of dropping it', () => {
    // A shard named by a future category must still reach localStorage.
    const merged = Shard.merge('fa_matches', { cadet: [{ id: 1 }], veterans: [{ id: 2 }] });
    assert.deepStrictEqual(merged.map(m => m.id), [1, 2]);
  });
});
