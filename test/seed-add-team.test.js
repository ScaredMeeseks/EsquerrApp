/* Unit tests for the --add-team helpers in functions/seed-demo-club.js.
 *
 * Pure logic, no emulator and no Firebase: `npm run test:addteam`.
 *
 * The seeder's other modes build a club from nothing, so a mistake there
 * shows up as an obviously broken demo. --add-team writes into a club that
 * already has data, and its failure mode is the opposite: a run that looks
 * like it succeeded while a squad quietly disappeared.
 *
 * `mergeShardData` is the single function standing between the existing
 * amateur-A roster and deletion. fa_users is routed by CATEGORY with no team
 * letter (js/shard.js), so amateur-A and amateur-B share ONE document — the
 * merge is not an optimisation, it is the only thing making the mode safe.
 *
 * The two id-space helpers matter for the same reason. Two teams in a
 * category share fa_matches__{cat}, so colliding match ids would silently
 * overwrite fixtures rather than add them.
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const Shard = require(path.join(__dirname, '..', 'js', 'shard.js'));
const src = fs.readFileSync(
    path.join(__dirname, '..', 'functions', 'seed-demo-club.js'), 'utf8');

function grab(from, to) {
  const i = src.indexOf(from);
  const j = src.indexOf(to, i);
  assert.ok(i !== -1 && j !== -1, 'marker not found in seed-demo-club.js: ' + from);
  return src.slice(i, j);
}

/* The three helpers are pure but sit in a module that connects to Firebase
   at require() time, so they are sliced out rather than required in. */
const helpers = (() => {
  const code = grab('/** `amateur-B` → {key, cat, letter}',
      'async function addTeams');
  // eslint-disable-next-line no-new-func
  return new Function('Shard', 'userError', `
    ${code}
    return { parseTeamSpec, teamSalt, mergeShardData };`)(
      Shard, (m) => Object.assign(new Error(m), { userError: true }));
})();

const { parseTeamSpec, teamSalt, mergeShardData } = helpers;

describe('--add-team — parsing a team spec', () => {
  it('accepts {category}-{LETTER}', () => {
    assert.deepStrictEqual(parseTeamSpec('amateur-B'),
        { key: 'amateur-B', cat: 'amateur', letter: 'B' });
    assert.deepStrictEqual(parseTeamSpec('juvenil-A'),
        { key: 'juvenil-A', cat: 'juvenil', letter: 'A' });
  });

  it('trims surrounding whitespace', () => {
    assert.strictEqual(parseTeamSpec('  cadet-C  ').key, 'cadet-C');
  });

  const bad = ['amateurB', 'amateur-b', 'amateur_B', 'amateur-BB', '-B', 'amateur-', ''];
  bad.forEach((s) => {
    it(`rejects "${s}"`, () => {
      assert.throws(() => parseTeamSpec(s), /add-team wants/);
    });
  });

  it('rejects a category the app does not have', () => {
    assert.throws(() => parseTeamSpec('seniors-A'), /unknown category/);
  });

  it('accepts every category the router knows', () => {
    Shard.ORDER.forEach((cat) => {
      assert.strictEqual(parseTeamSpec(`${cat}-A`).cat, cat);
    });
  });
});

describe('--add-team — match id offsets', () => {
  it('is stable for a team, whatever else is run', () => {
    assert.strictEqual(teamSalt('amateur-B'), teamSalt('amateur-B'));
  });

  it('never returns 0 — that is the first team\'s own offset', () => {
    Shard.ORDER.forEach((cat) => {
      'ABCDEFGH'.split('').forEach((l) => {
        const s = teamSalt(`${cat}-${l}`);
        assert.ok(s >= 1 && s <= 900, `${cat}-${l} → ${s}`);
      });
    });
  });

  it('stays under the 1000 step between match ids', () => {
    // Ids are baseId + i*1000. An offset of 1000 or more would land team B's
    // fixture n on team A's fixture n+1 and overwrite it on merge.
    const all = Shard.ORDER.flatMap((cat) =>
      'ABCDEFGH'.split('').map((l) => teamSalt(`${cat}-${l}`)));
    assert.ok(Math.max(...all) < 1000);
  });

  it('separates the teams that actually share a shard', () => {
    // Only same-category teams collide — they share fa_matches__{cat}.
    Shard.ORDER.forEach((cat) => {
      const salts = 'ABCDEF'.split('').map((l) => teamSalt(`${cat}-${l}`));
      assert.strictEqual(new Set(salts).size, salts.length,
          `two ${cat} teams share an offset`);
    });
  });
});

describe('--add-team — merging into an existing shard', () => {
  const blob = (rows) => ({ v: JSON.stringify(rows), category: 'amateur' });
  const rows = (d) => JSON.parse(d.v);

  it('keeps every row that was already there — the whole point', () => {
    const existing = blob([{ id: 'a1', name: 'Existing A' }, { id: 'a2', name: 'Existing B' }]);
    const fresh = blob([{ id: 'b1', name: 'New' }]);
    const out = rows(mergeShardData('fa_users', existing, fresh));
    assert.strictEqual(out.length, 3);
    assert.deepStrictEqual(out.map((r) => r.id), ['a1', 'a2', 'b1']);
  });

  it('writes the fresh doc unchanged when there is nothing to merge', () => {
    const fresh = blob([{ id: 'b1' }]);
    assert.deepStrictEqual(mergeShardData('fa_users', null, fresh), fresh);
  });

  it('lets a fresh row win a tie on id', () => {
    const out = rows(mergeShardData('fa_users',
        blob([{ id: 'x', name: 'old' }]), blob([{ id: 'x', name: 'new' }])));
    assert.strictEqual(out.length, 1);
    assert.strictEqual(out[0].name, 'new');
  });

  it('merges maps by key', () => {
    // fa_match_events is a map keyed by match id.
    const out = JSON.parse(mergeShardData('fa_match_events',
        { v: JSON.stringify({ m1: ['goal'] }), category: 'amateur' },
        { v: JSON.stringify({ m2: ['card'] }), category: 'amateur' }).v);
    assert.deepStrictEqual(Object.keys(out).sort(), ['m1', 'm2']);
  });

  it('carries the category field, without which the shard is invisible', () => {
    // The client query is where('category','in',scope) — a shard missing it
    // is dark, not merely misfiled.
    const out = mergeShardData('fa_users', blob([{ id: 'a' }]), blob([{ id: 'b' }]));
    assert.strictEqual(out.category, 'amateur');
  });

  it('passes MERGE-shape docs straight through', () => {
    // fa_injury_notes stores entries as top-level fields with no `v`;
    // Firestore's own {merge:true} is what combines them.
    const fresh = { p1: 'a note', category: 'amateur' };
    assert.deepStrictEqual(
        mergeShardData('fa_injury_notes', { p0: 'older' }, fresh), fresh);
  });

  it('REFUSES to merge over a document it cannot parse', () => {
    // Falling back to [] would discard the stored squad and report success.
    assert.throws(
        () => mergeShardData('fa_users', { v: '{not json', category: 'amateur' }, blob([])),
        /unparseable JSON/);
  });

  it('treats a document with no v as empty, not as an error', () => {
    // A legitimately absent shard, as opposed to a corrupt one.
    const fresh = blob([{ id: 'b' }]);
    assert.strictEqual(rows(mergeShardData('fa_users', {}, fresh)).length, 1);
  });

  it('survives the two teams that land in one document', () => {
    // amateur-B folded onto amateur-A, then onto what Firestore holds.
    const stored = blob([{ id: 'A1' }, { id: 'A2' }]);
    const teamB = blob([{ id: 'B1' }]);
    const teamC = blob([{ id: 'C1' }]);
    const folded = mergeShardData('fa_users', teamB, teamC);
    const final = rows(mergeShardData('fa_users', stored, folded));
    assert.deepStrictEqual(final.map((r) => r.id), ['A1', 'A2', 'B1', 'C1']);
  });
});
