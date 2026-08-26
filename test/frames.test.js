/* Frames: which one is "previous", and what a new one inherits.
 *
 * Unlike most of the board suites, almost nothing here is a source
 * assertion. `addFrame` is small and depends only on things that can
 * be passed in, so it is RUN — with stubs that record the order they
 * were called in, which is the whole of the bug it is here to hold
 * down. The frame-derivation helpers are module-scope and pure
 * functions of localStorage, so they are run against a fake one.
 *
 * The bug: `activeFrameIdx` is a local of bindTactics and
 * `fa_tactic_frame_idx` is the copy everything outside reads. Only
 * saveFrames() wrote that copy, and every caller did
 *
 *     activeFrameIdx = i;
 *     applyFrameState(frames[i]);   // ends in tb3dTouch()
 *     saveFrames();                 // ...which is where i lands
 *
 * tb3dTouch() draws the 2D trajectory layer SYNCHRONOUSLY, so it read
 * an index still pointing at the frame just left, and drew the move
 * into THAT frame: on creating frame 3 you saw the curve from frame 1
 * to frame 2, and one frame behind at every count after that. The 3D
 * scene escaped it because its half of tb3dTouch is deferred to an
 * animation frame, by which time saveFrames had run — which is why it
 * only ever showed on the flat board.
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const app = fs.readFileSync(path.join(ROOT, 'js', 'app.js'), 'utf8');
const bare = app.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
const BS = require('../js/board-state.js');

/* A function's source, bounded by the next declaration at the SAME
   indent — anything nested in bindTactics sits at four, and a fixed
   bound has cost this suite six assertions. */
const fn = (name) => {
  const i = bare.indexOf('function ' + name);
  assert.ok(i !== -1, name + ' not found in js/app.js');
  const lineStart = bare.lastIndexOf('\n', i) + 1;
  const indent = bare.slice(lineStart, i).match(/^\s*/)[0];
  /* Bounded at this function's OWN closing brace, not at the next
     declaration. The sibling suites bound on the next `function` at
     the same indent, which is fine for asserting on text and wrong for
     EVALUATING it: addFrame is followed by a `const playBtn =
     document.getElementById(...)` before the next declaration, so the
     slice carried a DOM call into a Node process. */
  const j = bare.indexOf('\n' + indent + '}', i);
  assert.ok(j !== -1, name + ' has no closing brace at its own indent');
  return bare.slice(i, j + indent.length + 2);
};

/** addFrame, run for real against recording stubs. */
const runAddFrame = (frames) => {
  const calls = [];
  const applied = [];
  const make = new Function('frames', 'autoSaveFrame', 'captureFrameState',
      'setActiveFrame', 'applyFrameState', 'saveFrames', 'renderFrameStrip',
      fn('addFrame()') + '\nreturn addFrame;');
  make(
    frames,
    () => calls.push('autoSaveFrame'),
    () => ({positions: [[50, 50]], duration: 1000}),
    (i) => calls.push('setActiveFrame:' + i),
    (f) => { calls.push('applyFrameState'); applied.push(f); },
    () => calls.push('saveFrames'),
    () => calls.push('renderFrameStrip')
  )();
  return {calls, applied, frames};
};

describe('adding a frame', () => {
  /* A board mid-animation: two frames, and the move into the second
     curves — `paths` describes THAT move. */
  const twoFrames = () => ([
    {positions: [[20, 50]], balls: [[25, 50]], duration: 1000},
    {positions: [[60, 50]], balls: [[65, 50]], duration: 1500,
     paths: {positions: {0: {bend: [40, 20]}},
             balls: {0: {bend: [45, 10], apex: 6}}}}
  ]);

  it('copies the last frame\'s positions', () => {
    const {frames} = runAddFrame(twoFrames());
    assert.strictEqual(frames.length, 3, 'a frame must be added');
    assert.deepStrictEqual(frames[2].positions, [[60, 50]],
        'the new frame starts where the last one ended');
    assert.deepStrictEqual(frames[2].balls, [[65, 50]]);
  });

  it('but NOT its curves', () => {
    /* THE SECOND HALF OF THE REPORTED BUG. `paths` describes the move
       INTO a frame — where each object curved on its way here, and how
       high the ball went. A new frame is a copy of the last one's
       positions, so nothing has moved into it yet; the inherited
       curves belong to the previous transition, and left in place they
       bent the coach's next move along a trajectory drawn for a
       different pair of frames. */
    const {frames} = runAddFrame(twoFrames());
    assert.ok(!('paths' in frames[2]),
        'the new frame must carry no trajectories: ' +
        JSON.stringify(frames[2].paths));
    /* And the frame it was copied from keeps its own. */
    assert.ok(frames[1].paths && frames[1].paths.balls[0].apex === 6,
        'the source frame must be left alone');
  });

  it('resets the transition time', () => {
    const {frames} = runAddFrame(twoFrames());
    assert.strictEqual(frames[2].duration, 1000,
        'a new transition is a second, not whatever the last one was');
  });

  it('does not alias the frame it copied', () => {
    const {frames} = runAddFrame(twoFrames());
    frames[2].positions[0][0] = 99;
    assert.strictEqual(frames[1].positions[0][0], 60,
        'the copy must be deep, or moving a player on the new frame ' +
        'moves it on the old one too');
  });

  it('publishes the new index BEFORE anything renders from it', () => {
    /* THE FIRST HALF, and the one that produced the report.
       applyFrameState ends in tb3dTouch(), which draws the trajectory
       layer synchronously from the STORED index. Called before that
       index is updated, it drew the previous transition. */
    const {calls} = runAddFrame(twoFrames());
    const iSet = calls.indexOf('setActiveFrame:2');
    const iApply = calls.indexOf('applyFrameState');
    assert.ok(iSet !== -1, 'the new frame must be selected: ' + calls.join(', '));
    assert.ok(iApply !== -1, 'the new frame must be applied');
    assert.ok(iSet < iApply,
        'the index must be published before the frame is applied — ' +
        'order was: ' + calls.join(', '));
  });

  it('seeds from the board when there are no frames at all', () => {
    const {frames} = runAddFrame([]);
    assert.strictEqual(frames.length, 1);
    assert.deepStrictEqual(frames[0].positions, [[50, 50]],
        'the first frame comes from the board, not from nothing');
  });
});

describe('which frame is the previous one', () => {
  /* The derivation itself, run against a fake store. It was always
     right; what was wrong was the index it was reading. */
  const api = (frames, idx) => {
    const store = {
      fa_tactic_frames: JSON.stringify(frames),
      fa_tactic_frame_idx: String(idx)
    };
    const ls = {getItem: (k) => (k in store ? store[k] : null)};
    return new Function('localStorage', 'BS',
        fn('_tb3dFrames()') + '\n' + fn('_tb3dIdx()') + '\n' +
        fn('_tb3dCurFrame()') + '\n' + fn('_tb3dPrevFrame()') + '\n' +
        'return {_tb3dCurFrame, _tb3dPrevFrame, _tb3dIdx};')(ls, BS);
  };

  const frames = [{n: 1}, {n: 2}, {n: 3}, {n: 4}];

  [0, 1, 2, 3].forEach((i) => {
    it('at frame ' + (i + 1) + ', the previous one is frame ' + i, () => {
      const a = api(frames, i);
      assert.deepStrictEqual(a._tb3dCurFrame(), frames[i]);
      assert.deepStrictEqual(a._tb3dPrevFrame(), i > 0 ? frames[i - 1] : null,
          'frame ' + (i + 1) + ' must follow frame ' + i);
    });
  });

  it('frame 1 has no previous frame — nothing has moved yet', () => {
    assert.strictEqual(api(frames, 0)._tb3dPrevFrame(), null);
  });

  it('an index past the end yields neither', () => {
    const a = api(frames, 9);
    assert.strictEqual(a._tb3dCurFrame(), null);
    assert.strictEqual(a._tb3dPrevFrame(), null,
        'a stale index must draw nothing rather than a transition between ' +
        'frames that are not there');
  });

  it('no index at all is treated as no frame', () => {
    const ls = {getItem: (k) => (k === 'fa_tactic_frames'
      ? JSON.stringify(frames) : null)};
    const a = new Function('localStorage', 'BS',
        fn('_tb3dFrames()') + '\n' + fn('_tb3dIdx()') + '\n' +
        fn('_tb3dCurFrame()') + '\n' + fn('_tb3dPrevFrame()') + '\n' +
        'return {_tb3dCurFrame, _tb3dPrevFrame, _tb3dIdx};')(ls, BS);
    assert.strictEqual(a._tb3dIdx(), -1);
    assert.strictEqual(a._tb3dCurFrame(), null);
  });
});

describe('the stored index moves with the local one', () => {
  /* The general fix. Every place that changes the frame now goes
     through setActiveFrame, which writes both — so no caller can get
     the order wrong again by forgetting a saveFrames(). */
  it('setActiveFrame writes the copy the rest of the app reads', () => {
    const f = fn('setActiveFrame(i)');
    assert.ok(/activeFrameIdx = i;/.test(f), 'it must set the local');
    assert.ok(/localStorage\.setItem\('fa_tactic_frame_idx', i\)/.test(f),
        'and the stored copy, in the same breath');
  });

  it('nothing assigns the index behind its back', () => {
    /* The declaration is the one legitimate assignment; every other
       one was a chance to leave the two out of step. */
    const hits = (bare.match(/activeFrameIdx\s*=\s*[^=]/g) || []);
    assert.strictEqual(hits.length, 2,
        'expected only the `let` declaration and setActiveFrame\'s own ' +
        'assignment; found ' + hits.length);
    assert.ok(/let activeFrameIdx =/.test(bare), 'the declaration must remain');
  });

  it('and the declaration writes its own clamp back', () => {
    /* A board saved with four frames and reopened with two leaves the
       stored index past the end, and that stored index is what the
       trajectory layer reads. */
    const i = bare.indexOf('let activeFrameIdx =');
    const after = bare.slice(i, i + 400);
    assert.ok(/Math\.min\(/.test(after), 'the stored index must be clamped');
    assert.ok(/localStorage\.setItem\('fa_tactic_frame_idx', activeFrameIdx\)/
        .test(after),
        'and the clamped value written back, or the two disagree until ' +
        'the first edit');
  });

  it('every frame move publishes the index before it renders', () => {
    /* The ordering, across all of them rather than only addFrame —
       the thumbnail click, the delete, and the play loop each had the
       same three lines in the same wrong order. */
    const pairs = bare.split('setActiveFrame(').slice(1);
    assert.ok(pairs.length >= 8,
        'expected every frame move to go through setActiveFrame; found ' +
        pairs.length);
    /* For each call, if applyFrameState appears nearby it must appear
       AFTER — which is what the split already guarantees; what is
       checked here is that no applyFrameState is left stranded before
       one, on the same statement run. */
    const bad = bare.match(
        /applyFrameState\([^)]*\);\s*\n\s*setActiveFrame\(/g) || [];
    assert.deepStrictEqual(bad, [],
        'these apply a frame and only then say which one it is: ' +
        bad.join(' | '));
  });
});
