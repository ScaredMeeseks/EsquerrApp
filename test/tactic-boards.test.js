/* Unit tests for js/boards.js — how a saved tactical board is built.
 *
 * Pure logic, no emulator: `npm run test:boards` (or `mocha tactic-boards.test.js`).
 *
 * This object used to be FOUR hand-maintained copies inside bindTactics()
 * — Save, Save As, Add to Training, Add to Match — differing only in
 * whether they carried an `id` and a `category`. The copies are the reason
 * these tests exist: a field added to one and not the others is invisible
 * until a coach notices their cones vanished from the board they linked to
 * a match.
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const TB = require('../js/boards.js');

/** A localStorage stand-in. Missing key -> null, exactly like the real one. */
function store(map) {
  return {
    getItem: (k) => (Object.prototype.hasOwnProperty.call(map, k) ? map[k] : null)
  };
}

/* The state of a board with something drawn on every layer, so a dropped
   field shows up as a missing value rather than a matching default. */
const DRAWN = {
  fa_tactic_formation: '4-3-3',
  fa_tactic_positions: '[[10,50],[30,20],null,[50,50]]',
  fa_tactic_numbers: '["1","4","","9"]',
  fa_tactic_board_type: 'half',
  fa_tactic_team_color: '#3366ff',
  fa_tactic_opp_color: '#111111',
  fa_tactic_show_opp: 'true',
  fa_tactic_opp_positions: '[[90,50]]',
  fa_tactic_opp_numbers: '["1"]',
  fa_tactic_balls: '[[50,50]]',
  fa_tactic_colors: '["","#ff0000","",""]',
  fa_tactic_opp_colors: '["#00ff00"]',
  fa_tactic_arrows: '[[10,10,20,20,"#ffffff",false]]',
  fa_tactic_rects: '[[5,5,10,10,"#ffffff",0.3]]',
  fa_tactic_texts: '[[20,20,"Pressió","#000000",0.8,null,null,null]]',
  fa_tactic_pen_lines: '[["10,10 12,14 18,20","#ffffff",true]]',
  fa_tactic_frames: '[{"positions":[[10,50]],"duration":1000},{"positions":[[20,50]],"duration":1000}]',
  fa_tactic_tag: 'Presión',
  fa_tactic_silhouette: 'one-arm-up',
  fa_tactic_cones: '[[33,33],[66,66]]',
  fa_tactic_team_stripes: '{"on":true,"n":4,"dir":"v","c2":"#ffffff"}'
};

/* The key order the four literals used, in order. Pinned because db.js
   diffs shards as SERIALISED STRINGS (prevJson === nextJson): reordering
   keys marks every board shard in every club as changed and rewrites the
   lot once, for nothing. */
const KEY_ORDER = [
  'id', 'category', 'name', 'formation', 'positions', 'numbers', 'boardType',
  'teamColor', 'oppColor', 'showOpp', 'oppPositions', 'oppNumbers', 'balls',
  'colors', 'oppColors', 'arrows', 'rects', 'texts', 'penLines', 'frames',
  'tag', 'silhouette', 'cones', 'teamStripes', 'oppStripes',
  // Appended at the tail, together, for the reason above: two separate
  // appends would have rewritten every board shard twice instead of once.
  'penSpace', 'pitch',
  // The opponent's own shape, appended after those for the same
  // reason. '' means a board from before opponents had one, which
  // spawnOppCircles reads as 'mirror ours'.
  'oppFormation'
];

describe('buildBoardEntry — defaults', () => {
  it('an empty store yields exactly the defaults the literals had', () => {
    const e = TB.buildBoardEntry(store({}), { name: 'Board' });
    assert.deepStrictEqual(e, {
      name: 'Board',
      formation: '',
      positions: null,
      numbers: null,
      boardType: 'full',
      teamColor: '#ffffff',
      oppColor: '#e53935',
      showOpp: false,
      oppPositions: null,
      oppNumbers: null,
      balls: [],
      colors: null,
      oppColors: null,
      arrows: [],
      rects: [],
      texts: [],
      penLines: [],
      frames: [],
      tag: '',
      silhouette: '',
      cones: [],
      teamStripes: '',
      oppStripes: '',
      penSpace: '',
      pitch: null,
      oppFormation: ''
    });
  });

  it('penSpace defaults to legacy, not to normalised', () => {
    /* '' means "these points are in display space, render them raw".
       Defaulting to 'h' instead would silently reinterpret every stroke
       drawn before this version and move it on screen. */
    const e = TB.buildBoardEntry(store({}), { name: 'B' });
    assert.strictEqual(e.penSpace, '');
  });

  it('pitch defaults to null, meaning the historical 105x68', () => {
    // Not [105,68,'f11'] — an explicit default would be written into every
    // board on its next save, which is a migration nobody asked for.
    const e = TB.buildBoardEntry(store({}), { name: 'B' });
    assert.strictEqual(e.pitch, null);
  });

  it('carries a resized pitch through verbatim', () => {
    const e = TB.buildBoardEntry(
        store({ fa_tactic_pitch: '[60,40,"f7"]' }), { name: 'B' });
    assert.deepStrictEqual(e.pitch, [60, 40, 'f7']);
  });

  it('showOpp is a real boolean, not the string "true"', () => {
    const on = TB.buildBoardEntry(store({ fa_tactic_show_opp: 'true' }), { name: 'B' });
    const off = TB.buildBoardEntry(store({ fa_tactic_show_opp: 'false' }), { name: 'B' });
    assert.strictEqual(on.showOpp, true);
    assert.strictEqual(off.showOpp, false);
  });
});

describe('buildBoardEntry — the three call shapes', () => {
  /* These are the shapes shard.js routes on, so they are not cosmetic:
     - library entries carry their own `category` stamp (shard.js:74)
     - training entries too, because the bucket is keyed by DATE and two
       categories training the same evening share one (shard.js:78)
     - match entries carry NEITHER: they are routed by joining the map key
       through fa_matches (shard.js:92) */

  it('Save / Save As carry an id and a category', () => {
    const e = TB.buildBoardEntry(store(DRAWN), { id: 'tb_1', category: 'cadet', name: 'Pressió' });
    assert.strictEqual(e.id, 'tb_1');
    assert.strictEqual(e.category, 'cadet');
  });

  it('Add to Training carries a category but no id', () => {
    const e = TB.buildBoardEntry(store(DRAWN), { category: 'cadet', name: 'Pressió' });
    assert.strictEqual(e.category, 'cadet');
    assert.ok(!('id' in e), 'training entries must not carry an id');
  });

  it('Add to Match carries neither — the match join supplies the category', () => {
    const e = TB.buildBoardEntry(store(DRAWN), { name: 'Pressió' });
    assert.ok(!('id' in e), 'match entries must not carry an id');
    assert.ok(!('category' in e), 'match entries must not carry a category stamp');
  });

  it('omitted id/category are ABSENT, not undefined', () => {
    // `{id: undefined}` survives Object.keys but vanishes through
    // JSON.stringify, so the in-memory object and the stored blob would
    // disagree about the entry's shape.
    const e = TB.buildBoardEntry(store(DRAWN), { name: 'Pressió' });
    assert.deepStrictEqual(Object.keys(e).filter(k => k === 'id' || k === 'category'), []);
  });

  it('the three shapes differ ONLY in id/category', () => {
    const lib = TB.buildBoardEntry(store(DRAWN), { id: 'tb_1', category: 'cadet', name: 'P' });
    const tra = TB.buildBoardEntry(store(DRAWN), { category: 'cadet', name: 'P' });
    const mat = TB.buildBoardEntry(store(DRAWN), { name: 'P' });
    const strip = (o) => { const c = Object.assign({}, o); delete c.id; delete c.category; return c; };
    assert.deepStrictEqual(strip(lib), strip(mat));
    assert.deepStrictEqual(strip(tra), strip(mat));
  });
});

describe('buildBoardEntry — serialisation', () => {
  it('key order matches the literals it replaced', () => {
    const e = TB.buildBoardEntry(store(DRAWN), { id: 'tb_1', category: 'cadet', name: 'P' });
    assert.deepStrictEqual(Object.keys(e), KEY_ORDER);
  });

  it('key order is stable when id/category are omitted', () => {
    const e = TB.buildBoardEntry(store(DRAWN), { name: 'P' });
    assert.deepStrictEqual(Object.keys(e), KEY_ORDER.filter(k => k !== 'id' && k !== 'category'));
  });

  it('survives JSON round-trip — nested arrays and animation frames included', () => {
    // positions is [[x,y],…]. Firestore cannot store an array of arrays,
    // which is why the payload is a STRING and must stay one.
    const e = TB.buildBoardEntry(store(DRAWN), { id: 'tb_1', category: 'cadet', name: 'P' });
    const back = JSON.parse(JSON.stringify(e));
    assert.deepStrictEqual(back, e);
    assert.deepStrictEqual(back.positions[0], [10, 50]);
    assert.strictEqual(back.positions[2], null, 'a deleted circle slot stays null');
    assert.strictEqual(back.frames.length, 2);
  });

  it('reads every drawing layer off the store', () => {
    const e = TB.buildBoardEntry(store(DRAWN), { name: 'P' });
    // One assertion per layer a coach can draw on: this is the test that
    // fails when a new tool is added to the editor and not to the entry.
    assert.strictEqual(e.formation, '4-3-3');
    assert.strictEqual(e.boardType, 'half');
    assert.strictEqual(e.positions.length, 4);
    assert.deepStrictEqual(e.numbers, ['1', '4', '', '9']);
    assert.deepStrictEqual(e.oppPositions, [[90, 50]]);
    // Per-opponent colours. The opposition had no such layer until v90 — the
    // editor offered the picker and saveState() painted straight over it.
    assert.deepStrictEqual(e.oppColors, ['#00ff00']);
    assert.deepStrictEqual(e.balls, [[50, 50]]);
    assert.strictEqual(e.arrows.length, 1);
    assert.strictEqual(e.rects.length, 1);
    assert.strictEqual(e.texts.length, 1);
    assert.strictEqual(e.penLines.length, 1);
    assert.strictEqual(e.cones.length, 2);
    // Striped kits are board-wide, stored as JSON alongside the base colour
    // because <input type="color"> can only hold a hex.
    assert.strictEqual(e.teamStripes, '{"on":true,"n":4,"dir":"v","c2":"#ffffff"}');
    assert.strictEqual(e.oppStripes, '');
    assert.strictEqual(e.tag, 'Presión');
    assert.strictEqual(e.silhouette, 'one-arm-up');
    assert.strictEqual(e.teamColor, '#3366ff');
    assert.strictEqual(e.oppColor, '#111111');
  });
});

describe('newBoardId', () => {
  it('has the tb_<ts>_<rand> shape the stored ids already use', () => {
    assert.ok(/^tb_\d+_[a-z0-9]{1,6}$/.test(TB.newBoardId()), TB.newBoardId());
  });

  it('does not collide within one millisecond', () => {
    const ids = new Set();
    for (let i = 0; i < 500; i++) ids.add(TB.newBoardId());
    assert.strictEqual(ids.size, 500);
  });
});

describe('app.js has no second copy of the entry literal', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'js', 'app.js'), 'utf8');

  it('builds every board entry through TB.buildBoardEntry', () => {
    /* Five, and NOT the original four. Add to Training and Add to Match
       stopped building entries of their own when sessions started storing
       references: both go through tbEnsureSaved(), because a session cannot
       reference a board that was never saved. tbHasUnsavedWork() then added
       one back — it builds the current editor state in order to COMPARE it
       with what is stored, which is the same construction and must not drift
       from it either.

       The fifth is _tbTemplateEntry(), the platform-library path. It is ONE
       call site for three template operations (Save, Save As and the
       template arm of tbHasUnsavedWork) precisely so the comparison and the
       write cannot disagree — which is the same argument as the fourth, one
       collection along.

       So: Save, Save As, tbEnsureSaved, tbHasUnsavedWork, _tbTemplateEntry.
       The number matters less than the property — entry construction lives
       in one function, and nothing rebuilds that object by hand. */
    const calls = src.match(/TB\.buildBoardEntry\(/g) || [];
    assert.strictEqual(calls.length, 5,
      'expected 5 call sites (Save, Save As, tbEnsureSaved, tbHasUnsavedWork, ' +
      '_tbTemplateEntry), found ' + calls.length);
  });

  it('both add-to-session paths go through tbEnsureSaved', () => {
    // Linking is by id, so an unsaved drawing has nothing to reference.
    ['tb-add-to-training', 'tb-add-to-match'].forEach(function (btn) {
      const i = src.indexOf(btn + "');");
      assert.notStrictEqual(i, -1, btn + ' handler not found');
      const body = src.slice(i, i + 1800);
      assert.ok(/tbEnsureSaved\(/.test(body),
        btn + ' must save the board before linking it');
      assert.ok(/tbSessionRef\(/.test(body),
        btn + ' must store a reference, not a copy');
    });
  });

  it('has no inline board literal left', () => {
    // `tag:` read straight off localStorage is the fingerprint of the four
    // literals this refactor removed. Deliberately NOT keyed on `penLines:`
    // — captureFrameState() reads the same drawing layers to build a
    // keyframe, which is a different object (no id/name/boardType/tag, and
    // it carries a duration) and must stay separate.
    assert.ok(!/tag:\s*localStorage\.getItem/.test(src),
      'an inline board entry literal is back in app.js — build it with TB.buildBoardEntry instead');
  });

  it('mints board ids in one place', () => {
    assert.ok(!/'tb_'\s*\+\s*Date\.now\(\)/.test(src),
      'board ids must come from TB.newBoardId()');
  });
});

describe('changing the formation resets the animation', () => {
  /* Reported as "if I had previously selected a formacio, it kind of appears
     in the first frame of other boards".

     Every animation frame carries its OWN positions. Selecting a formation
     replaced the board's positions but left the frames alone, so the next
     mutation ran autoSaveFrame(), which folded the new formation into
     whichever frame was active — frame 0 after a load — and destroyed the
     animation's first pose. Save As and Add-to-session then copied those
     frames into the next board, which is the cross-board half of the report.

     An animation cannot survive its players being re-shaped, so the frames
     are reset — but only after asking. */
  const src = fs.readFileSync(path.join(__dirname, '..', 'js', 'app.js'), 'utf8');

  function formationHandler() {
    const i = src.indexOf("const f = opt.dataset.val;");
    assert.notStrictEqual(i, -1, 'formation option handler not found');
    return src.slice(i, i + 2400);
  }

  it('clears fa_tactic_frames when a formation is chosen', () => {
    const body = formationHandler();
    assert.ok(/removeItem\('fa_tactic_frames'\)/.test(body),
      'the formation handler must clear the frames it invalidates');
    assert.ok(/removeItem\('fa_tactic_frame_idx'\)/.test(body),
      'a stale frame index outlives the frames it pointed at');
  });

  it('resets the in-memory frames too, not just localStorage', () => {
    // autoSaveFrame() writes from the in-memory array, so clearing only
    // localStorage would let the very next mutation put them straight back.
    const body = formationHandler();
    assert.ok(/frames\s*=\s*\[\]/.test(body), 'in-memory frames not reset');
    assert.ok(/activeFrameIdx\s*=\s*-1/.test(body), 'active frame index not reset');
  });

  it('asks before discarding a real animation', () => {
    const body = formationHandler();
    assert.ok(/frames\.length > 1/.test(body),
      'should only prompt when there is an animation to lose');
    assert.ok(/formation_resets_frames/.test(body), 'no confirmation shown');
  });
});

describe('read-only board playback binds once per button', () => {
  /* bindRoBoardAnimations() selects DOCUMENT-WIDE, but _refreshStdBoards()
     calls it again after replacing only #std-boards-section. Every play button
     outside that section keeps its node and so collected a second listener.
     Because the handler TOGGLES `_roPlaying`, one click then started the
     animation and immediately stopped it — a brief flash of animated positions
     that reverts, throwing nothing and logging nothing.

     Reported as "on replay I briefly got a glimpse of the other board". Same
     leak, and the same guard, as the team-setup listeners in v62. */
  const src = fs.readFileSync(path.join(__dirname, '..', 'js', 'app.js'), 'utf8');

  it('guards .tb-ro-play against double binding', () => {
    const i = src.indexOf('function bindRoBoardAnimations');
    assert.notStrictEqual(i, -1, 'bindRoBoardAnimations not found');
    const body = src.slice(i, i + 1200);
    assert.ok(/_roBound/.test(body),
      'bindRoBoardAnimations must skip buttons it has already bound');
  });

  it('still binds document-wide, so the guard is what prevents the leak', () => {
    // If this ever becomes scoped to a container, the guard is redundant but
    // harmless — this test exists so the two facts stay linked in one place.
    assert.ok(/querySelectorAll\('\.tb-ro-play'\)/.test(src),
      'expected a document-wide .tb-ro-play selector');
  });
});

/* saveTemplate — the library half of the model.
 *
 * A template's `category` is edited in the Biblioteca table, NOT in the board
 * editor, which has no control for it. saveTemplate wrote it unconditionally
 * as `String(entry.category || '')`, so every Save from the editor — whose
 * entry carries no category — silently reset it to ''. Set a category, open
 * the board, press Save, and it was gone.
 *
 * These pin the boundary: the editor owns the drawing and the tag, the table
 * owns the category, the packs and the published flag.
 */
describe('saveTemplate — what the editor may and may not overwrite', () => {
  const src = fs.readFileSync(
      path.join(__dirname, '..', 'js', 'boards.js'), 'utf8');
  const body = src.slice(src.indexOf('function saveTemplate('),
      src.indexOf('function patchTemplate('));

  it('never writes category unconditionally', () => {
    assert.ok(!/category:\s*String\(entry\.category/.test(body),
      'category is written unconditionally again — a Save from the editor, ' +
      'whose entry has no category, will reset it to ""');
  });

  it('writes category only when the entry carries one', () => {
    assert.ok(/if \(entry\.category !== undefined\) metaDoc\.category/.test(body),
      'category must be guarded on the entry actually carrying one');
  });

  it('still writes tag unconditionally — the editor owns it', () => {
    // The opposite case, and the reason this is not just "guard everything":
    // the editor HAS a tag control, so it must be able to clear a tag too.
    assert.ok(/tag:\s*String\(entry\.tag/.test(body),
      'tag must keep writing through — the editor is its source of truth');
  });

  it('gives a brand-new template an explicit category', () => {
    // Absent rather than '' would render as undefined in the table.
    assert.ok(/if \(metaDoc\.category === undefined\) metaDoc\.category = ''/.test(body));
  });

  it('leaves packs and published to the table as well', () => {
    assert.ok(/if \(Array\.isArray\(o\.packs\)\) metaDoc\.packs/.test(body));
    assert.ok(/if \(typeof o\.published === 'boolean'\) metaDoc\.published/.test(body));
  });
});

/* The catalogue cache, and why a save has to dirty it. */
describe('the superadmin catalogue cache', () => {
  const app = fs.readFileSync(
      path.join(__dirname, '..', 'js', 'app.js'), 'utf8');

  it('_abLoad still short-circuits — which is why invalidation is needed', () => {
    assert.ok(/_abState\.loaded && !force/.test(app),
      'if this early return goes, _abInvalidate is dead code and should go too');
  });

  it('both template save paths dirty it', () => {
    // Not the exit button: the sidebar is also a way back to the Biblioteca,
    // and a save followed by ANY navigation showed the pre-edit row.
    const hits = app.match(/_abInvalidate\(\);/g) || [];
    assert.ok(hits.length >= 2,
      'template Save and Save As must both invalidate the catalogue, found ' + hits.length);
  });
});

/* ── The opponent's own shape ─────────────────────────────────────
 * There used to be ONE formation: it placed our team and
 * spawnOppCircles mirrored the same shape back, so a 4-3-3 against a
 * 4-4-2 — most of what a session is about — could not be drawn.
 *
 * The risk in adding it is not the new board, it is the old one.
 * Every board saved before this version has no such key, and must go
 * on mirroring exactly as it did.
 */
describe('buildBoardEntry — the opponent formation', () => {
  it('is empty for a store that has never set one', () => {
    /* '' is the legacy signal, and it has to survive the round trip
       as '' rather than as undefined or null — the reader tests it
       with `||`, and only a falsy value falls through to the mirror. */
    const e = TB.buildBoardEntry(store({}), {name: 'Board'});
    assert.strictEqual(e.oppFormation, '');
  });

  it('carries the shape when one is set', () => {
    const e = TB.buildBoardEntry(
        store({fa_tactic_formation: '4-3-3', fa_tactic_opp_formation: '4-4-2'}),
        {name: 'Board'});
    assert.strictEqual(e.formation, '4-3-3');
    assert.strictEqual(e.oppFormation, '4-4-2');
  });

  it('is independent of ours, which is the entire point', () => {
    const e = TB.buildBoardEntry(
        store({fa_tactic_formation: '4-4-2', fa_tactic_opp_formation: '3-5-2'}),
        {name: 'Board'});
    assert.notStrictEqual(e.formation, e.oppFormation);
  });

  it('sits at the TAIL, so the shard diff rewrites boards once', () => {
    /* db.js compares shards as serialised strings, so a key inserted
       anywhere but the end reorders everything after it and marks
       every board in every club as changed. */
    const e = TB.buildBoardEntry(store({}), {name: 'Board'});
    const keys = Object.keys(e);
    assert.strictEqual(keys[keys.length - 1], 'oppFormation',
        'a new key belongs at the end: ' + keys.join(', '));
  });

  it('a board saved before this version still round-trips', () => {
    /* The real regression risk. An entry with no oppFormation must
       come back with '' — the mirror signal — and never with the
       team formation copied into it, which would freeze the mirror
       into a real value and stop it following later edits. */
    const legacy = TB.buildBoardEntry(
        store({fa_tactic_formation: '4-3-3'}), {name: 'Old'});
    assert.strictEqual(legacy.oppFormation, '');
    assert.notStrictEqual(legacy.oppFormation, legacy.formation);
  });
});
