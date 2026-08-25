/* The 3D board — the parts of it that are checkable without a GPU.
 *
 * js/board3d.js cannot be executed here: it is an ES module that
 * imports three.js and builds WebGL contexts. What CAN be checked, and
 * is worth more than it sounds, is the seam between it and the rest of
 * the app — because every bug found while writing it lived in that
 * seam rather than in the graphics.
 *
 * The one that got through review: board3d read `parseFill(...).on`.
 * parseFill returns `{striped, ...}`; `on` is the first ARGUMENT of
 * encodeFill. Reading the parser's output under the encoder's
 * parameter name renders every striped kit solid — a wrong board that
 * throws nothing, on a feature nobody has looked at yet.
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const src = fs.readFileSync(path.join(ROOT, 'js', 'board3d.js'), 'utf8');
const appSrc = fs.readFileSync(path.join(ROOT, 'js', 'app.js'), 'utf8');
const utilsSrc = fs.readFileSync(path.join(ROOT, 'js', 'utils.js'), 'utf8');

describe('the seam with the rest of the app', () => {
  it('reads the fill shape parseFill actually returns', () => {
    // `striped`, never `on`.
    assert.ok(/\.striped/.test(src), 'board3d must test p.striped');
    assert.ok(!/\bp\.on\b/.test(src),
        'p.on is encodeFill\'s parameter, not parseFill\'s output');
    assert.ok(/return \{striped: true/.test(utilsSrc),
        'utils.parseFill changed shape — board3d assumes {striped,...}');
  });

  it('imports nothing from app.js', () => {
    /* Everything it needs is injected (BG, fillCss, parseFill), which
       is what lets it be an ES module at all — app.js is a classic
       script sharing one global scope and has no exports. */
    const imports = src.match(/^import .*/gm) || [];
    assert.strictEqual(imports.length, 1, 'expected exactly one import');
    assert.ok(/three\.module\.min\.js/.test(imports[0]), imports[0]);
  });

  it('takes its geometry from board-geom rather than re-deriving it', () => {
    // A second opinion about where the penalty spot is would put the
    // 3D pitch and the 2D pitch quietly out of step.
    ['BG.extent(', 'BG.markings(', 'BG.toWorld(', 'BG.toPercent(']
        .forEach((fn) => assert.ok(src.includes(fn), 'missing ' + fn));
    assert.ok(!/16\.5|40\.32|9\.15|7\.32/.test(src),
        'board3d must not hardcode regulation distances');
  });

  it('a 3D drag moves the 2D ELEMENT, it does not write state directly', () => {
    /* This was the other way round and it lost every drag.
       onMove wrote the scratch key, then autoSaveFrame() ran
       captureFrameState(), which begins with saveState() — and
       saveState reads the 2D DOM. The hidden 2D board still held the
       pre-drag position, so it overwrote the 3D write and the player
       snapped back.

       One source of truth: the 3D view is an input device for the 2D
       board, not a second writer. Undo, frames, the number inputs and
       the save path then keep working because nothing is bypassed. */
    const i = appSrc.indexOf('applyMove: (kind, index, pct)');
    assert.ok(i !== -1, 'expected an applyMove hook');
    const fn = appSrc.slice(i, i + 1200);
    assert.ok(/el\.style\.left/.test(fn) && /el\.style\.top/.test(fn),
        'applyMove must position the 2D element');
    assert.ok(/toDisplay\(pct\[0\], pct\[1\]\)/.test(fn),
        'storage space -> display space, like every other writer');
    assert.ok(/saveState\(\)/.test(fn) && /autoSaveFrame\(\)/.test(fn),
        'and then run the editor\'s own save path');

    const mount = appSrc.slice(appSrc.indexOf('async function tbMount3D'),
        appSrc.indexOf('/** The field box\'s own aspect'));
    assert.ok(!/BS\.setPoints/.test(mount),
        'the 3D mount must not write scratch keys behind the 2D board');
  });

  it('takes an undo snapshot before moving anything', () => {
    const i = appSrc.indexOf('applyMove: (kind, index, pct)');
    const fn = appSrc.slice(i, i + 1200);
    assert.ok(fn.indexOf('pushUndo()') < fn.indexOf('el.style.left'),
        'pushUndo must come before the move');
  });

  it('addresses cones positionally, because they carry no index', () => {
    /* spawnCone sets no data-idx and saveCones reads them in DOM
       order, so a [data-idx] lookup finds nothing and the cone
       silently refuses to move. */
    const i = appSrc.indexOf('applyMove: (kind, index, pct)');
    const fn = appSrc.slice(i, i + 1200);
    assert.ok(/querySelectorAll\(sel\)\[index\]/.test(fn), fn);
    assert.ok(/saveCones\(\)/.test(fn), 'cones save through their own writer');
  });

  it('clamps a drag to the pitch', () => {
    /* A drop outside the board would store a percentage beyond 0-100,
       which the 2D view draws off the edge of its box with no way to
       grab it back. */
    assert.ok(/Math\.max\(0, Math\.min\(100,/.test(src), 'onPointerUp must clamp');
  });
});

describe('the load path', () => {
  it('is lazily imported, never a script tag', () => {
    /* three.js is 733 KB. A <script> tag would spend it on every page
       load for a feature most sessions never open. */
    const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
    assert.ok(!/board3d|three\.module/.test(html),
        'the 3D board must not be in index.html');
    assert.ok(/await import\('\.\/board3d\.js'\)/.test(appSrc),
        'expected a dynamic import');
  });

  it('is not precached by the service worker', () => {
    // Precaching it would download 733 KB on first visit — the exact
    // cost the lazy import exists to avoid.
    const sw = fs.readFileSync(path.join(ROOT, 'sw.js'), 'utf8');
    assert.ok(!/board3d|three\./.test(sw));
  });

  it('degrades when WebGL is missing, including when probing THROWS', () => {
    /* Some hardened browsers and remote-desktop sessions throw from
       getContext rather than returning null. An exception there must
       leave a working 2D board, not a broken page. */
    const probe = appSrc.slice(appSrc.indexOf('function tbWebglOk'),
        appSrc.indexOf('var _tb3d ='));
    assert.ok(/try \{/.test(probe) && /catch/.test(probe), probe);
    assert.ok(/_webglOk = false/.test(probe));
  });

  it('says so when the import fails', () => {
    // Offline or a blocked module leaves an empty green rectangle
    // otherwise, which reads as a broken feature rather than a
    // missing download.
    assert.ok(/load_3d_failed/.test(appSrc));
  });
});

describe('the APK never sees any of it', () => {
  const build = fs.readFileSync(path.join(ROOT, 'scripts', 'build-www.js'), 'utf8');

  it('excludes vendor/ and board3d.js', () => {
    assert.ok(/'vendor'/.test(build), 'vendor must be in DENY_EXACT');
    assert.ok(/\^board3d\\\.js\$/.test(build), 'board3d must be in DENY_PATTERN');
  });

  it('applies the patterns at every depth, not just the root', () => {
    /* DENY_EXACT is root-only by design — those are top-level
       directory names — but js/board3d.js is nested, so the patterns
       have to reach it. */
    const copyDir = build.slice(build.indexOf('function copyDir'),
        build.indexOf('function build()'));
    assert.ok(/DENY_PATTERN\.some/.test(copyDir),
        'copyDir must filter by pattern, or nested files always ship');
  });

  it('does not exclude anything the app needs', () => {
    // The patterns now reach every file, so a careless one could drop
    // something load-bearing.
    const DENY = [/\.md$/i, /\.rules$/i, /-preview\.html$/i,
      /-debug\.html$/i, /\.log$/i, /^board3d\.js$/];
    ['app.js', 'utils.js', 'db.js', 'shard.js', 'board-geom.js',
      'board-state.js', 'boards.js', 'style.css', 'index.html', 'sw.js']
        .forEach((f) => {
          assert.ok(!DENY.some((re) => re.test(f)), f + ' would be excluded');
        });
  });
});

describe('the premium gate', () => {
  it('is a superadmin-owned club field, like maxTeams', () => {
    const fn = appSrc.slice(appSrc.indexOf('function clubFeature'),
        appSrc.indexOf('/** Teams the club actually has'));
    assert.ok(/_clubConfig && _clubConfig\.features/.test(fn), fn);
  });

  it('lets the superadmin through', () => {
    const fn = appSrc.slice(appSrc.indexOf('function clubFeature'),
        appSrc.indexOf('/** Teams the club actually has'));
    assert.ok(/s\.isAdmin/.test(fn));
  });

  it('gates both the toggle and the saved preference', () => {
    /* The stored preference alone must not open the view: a club
       whose premium lapses would otherwise keep the 3D board because
       the flag is still in their localStorage. */
    assert.ok(/fa_tactic_view_3d'\) === '1'\s*\n?\s*&& clubFeature\('board3d'\)/
        .test(appSrc), 'the saved preference must be re-checked against the gate');
  });
});

describe('i18n', () => {
  it('every 3D string has all three languages', () => {
    const keys = [...appSrc.matchAll(
        /'(tactics\.(?:view_hint|loading_3d|load_3d_failed))':\s*\{([^}]*)\}/g)];
    assert.strictEqual(keys.length, 3, 'expected 3 keys, found ' + keys.length);
    keys.forEach((m) => {
      ['ca:', 'es:', 'en:'].forEach((l) =>
        assert.ok(m[2].includes(l), m[1] + ' is missing ' + l));
    });
  });
});

describe('the page stays still while orbiting', () => {
  const fs2 = require('fs');
  const p2 = require('path');
  const s3 = fs2.readFileSync(p2.join(__dirname, '..', 'js', 'board3d.js'), 'utf8');
  const css = fs2.readFileSync(p2.join(__dirname, '..', 'css', 'style.css'), 'utf8');
  const wrap = css.slice(css.indexOf('.tb-3d-wrap {'), css.indexOf('.tb-3d-loading'));

  it('registers wheel non-passively, or preventDefault does nothing', () => {
    /* A passive wheel listener cannot cancel the scroll, so the page
       moves while the camera zooms — reported as "the whole page
       scrolls up and down when I orbit". */
    const nonPassive = (s3.match(/'wheel', onWheel, \{passive: false\}/g) || []);
    assert.strictEqual(nonPassive.length, 2,
        'expected the canvas AND its container to take a non-passive wheel');
  });

  it('cancels the default gesture on pointerdown', () => {
    // A mouse drag starting on the canvas otherwise becomes a
    // selection drag that scrolls once it leaves the element.
    const down = s3.slice(s3.indexOf('function onPointerDown'),
        s3.indexOf('function onPointerMove'));
    assert.ok(/ev\.preventDefault\(\)/.test(down), down);
  });

  it('contains overscroll and disables touch panning', () => {
    assert.ok(/overscroll-behavior:contain/.test(wrap), wrap);
    assert.ok(/touch-action:none/.test(wrap), wrap);
  });
});

describe('the 3D surface is bigger than the 2D one', () => {
  const fs2 = require('fs');
  const p2 = require('path');
  const css = fs2.readFileSync(p2.join(__dirname, '..', 'css', 'style.css'), 'utf8');
  const s3 = fs2.readFileSync(p2.join(__dirname, '..', 'js', 'board3d.js'), 'utf8');

  it('is wider than the 820px 2D board and has a real height', () => {
    /* Seen at an angle the far half is foreshortened, so a viewport
       sized for the top-down 2D view is unreadable in 3D. */
    const wrap = css.slice(css.indexOf('.tb-3d-wrap {'), css.indexOf('.tb-3d-loading'));
    const mw = /max-width:(\d+)px/.exec(wrap);
    assert.ok(mw && parseInt(mw[1], 10) > 820, 'expected wider than 820px: ' + wrap);
    assert.ok(/height:clamp\(/.test(wrap), 'height should be viewport-relative');
  });

  it('takes its height from the container, not from a width ratio', () => {
    assert.ok(/container\.clientHeight/.test(s3),
        'resize() must read clientHeight so CSS owns the shape');
  });

  it('frames the pitch against BOTH axes of the frustum', () => {
    /* Fitting only the long axis leaves the pitch overflowing on one
       axis and a band of empty sky on the other, depending on the
       viewport shape. */
    const fb = s3.slice(s3.indexOf('function frameBoard'), s3.indexOf('/* ── Interaction'));
    assert.ok(/camera\.aspect/.test(fb) && /camera\.fov/.test(fb), fb);
  });

  it('stops re-framing once the coach has moved the camera', () => {
    // A window resize must not throw away the angle they chose.
    assert.ok(/if \(!camTouched\) frameBoard\(\)/.test(s3));
    assert.ok(/camTouched = true/.test(s3));
  });
});

describe('the 3D view sees the players immediately', () => {
  const fs2 = require('fs');
  const p2 = require('path');
  const a = fs2.readFileSync(p2.join(__dirname, '..', 'js', 'app.js'), 'utf8');

  it('flushes the 2D DOM into the scratch keys before mounting', () => {
    /* saveState() is only ever called from an interaction, so a board
       whose players came from the formation defaults has them in the
       markup and NOT in fa_tactic_positions. board3d reads the keys,
       so the pitch came up empty until you visited 2D once and moved
       something. */
    const i = a.indexOf("if (document.getElementById('tb-3d-wrap'))");
    const block = a.slice(i, i + 900);
    assert.ok(block.indexOf('saveState();') !== -1, block);
    assert.ok(block.indexOf('saveState();') < block.indexOf('tbMount3D('),
        'the flush must happen BEFORE the mount');
  });
});

describe('the 3D view keeps up with the 2D editor', () => {
  const fs2 = require('fs');
  const p2 = require('path');
  const a = fs2.readFileSync(p2.join(__dirname, '..', 'js', 'app.js'), 'utf8');

  it('is poked from both mutation funnels', () => {
    /* saveState() and autoSaveFrame() between them follow every edit
       the 2D editor makes — choosing a formation, toggling the
       opposition, dragging, recolouring, stepping a frame. Without
       both, the 3D board is a snapshot from mount time that only
       catches up when you leave and come back. */
    const save = a.slice(a.indexOf('function saveState()'),
        a.indexOf('function spawnCircles'));
    assert.ok(/tb3dTouch\(\)/.test(save), 'saveState must poke the 3D view');
    /* Bounded by the NEXT function rather than a character count —
       a fixed window silently stops covering the tail as soon as the
       function grows, and reports the tail as missing. */
    const from = a.indexOf('function autoSaveFrame()');
    const auto = a.slice(from, a.indexOf('function ', from + 40));
    assert.ok(/tb3dTouch\(\)/.test(auto), 'autoSaveFrame must poke the 3D view');
  });

  it('coalesces a burst into one rebuild per frame', () => {
    // saveState fires several times for a single gesture.
    const fn = a.slice(a.indexOf('function tb3dTouch'),
        a.indexOf('function tb3dTween'));
    assert.ok(/_tb3dPending/.test(fn) && /requestAnimationFrame/.test(fn), fn);
  });

  it('rebuilds the pitch only when the pitch actually changed', () => {
    /* Regenerating a 2048px marking texture on every player drag is
       the difference between a smooth board and a stuttering one. */
    const fn = a.slice(a.indexOf('function tb3dTouch'),
        a.indexOf('function tb3dTween'));
    assert.ok(/_tb3dShape/.test(fn), fn);
    assert.ok(/refreshObjects\(\)/.test(fn), 'the cheap path must exist');
  });

  it('drives playback from the SAME tween the 2D view uses', () => {
    /* Two renderers computing their own idea of halfway between two
       frames is exactly what produced v88 and v91. */
    ['positions', 'oppPositions', 'balls'].forEach((k) => {
      assert.ok(a.includes("tb3dTween('" + k + "'"), 'no 3D tween for ' + k);
    });
    const fn = a.slice(a.indexOf('function tb3dTween'), a.indexOf('function tbDestroy3D'));
    assert.ok(/setPosition\(kind, i/.test(fn),
        'playback must move objects, not rebuild the scene each frame');
  });
});

describe('the camera can be moved and recovered', () => {
  const fs2 = require('fs');
  const p2 = require('path');
  const s3 = fs2.readFileSync(p2.join(__dirname, '..', 'js', 'board3d.js'), 'utf8');

  it('right, middle or shift drag pans the target', () => {
    /* Zoom converges on the look-at point, so with the target pinned
       to the centre spot a coach cannot get a close look at a corner. */
    const down = s3.slice(s3.indexOf('function onPointerDown'), s3.indexOf('function panBy'));
    assert.ok(/ev\.button === 2/.test(down) && /ev\.shiftKey/.test(down), down);
  });

  it('suppresses the context menu, or the pan opens a menu over itself', () => {
    assert.ok(/'contextmenu'.*preventDefault/.test(s3));
  });

  it('scales the pan by distance, so it tracks the cursor at any zoom', () => {
    // A fixed rate feels glued when zoomed out and frantic when in.
    const fn = s3.slice(s3.indexOf('function panBy'), s3.indexOf('function onPointerMove'));
    assert.ok(/cam\.dist/.test(fn) && /camera\.fov/.test(fn), fn);
  });

  it('bounds the pan, so the pitch cannot be lost entirely', () => {
    const fn = s3.slice(s3.indexOf('function panBy'), s3.indexOf('function onPointerMove'));
    assert.ok(/Math\.max\(-lim, Math\.min\(lim/.test(fn), fn);
  });

  it('offers a reset that recentres AND re-enables auto-framing', () => {
    const rc = s3.slice(s3.indexOf('resetCamera()'), s3.indexOf('resetCamera()') + 260);
    assert.ok(/camTouched = false/.test(rc) && /frameBoard\(\)/.test(rc), rc);
    assert.ok(/followBall = false/.test(rc), 'reset must also stop following the ball');
    const a = fs2.readFileSync(p2.join(__dirname, '..', 'js', 'app.js'), 'utf8');
    // Reset now lives in the camera preset row rather than on its own.
    assert.ok(/data-cam="reset"/.test(a) && /_tb3d\.resetCamera\(\)/.test(a));
  });
});

describe('playback returns the 3D scene to the start', () => {
  const fs2 = require('fs');
  const p2 = require('path');
  const a = fs2.readFileSync(p2.join(__dirname, '..', 'js', 'app.js'), 'utf8');

  it('applyFrameState pokes the 3D view', () => {
    /* It writes the scratch keys DIRECTLY rather than through
       saveState, so it misses the tb3dTouch every other mutation
       gets. The play loop ends by calling it to return to frame 0 —
       without this the 3D scene sat on the last tweened positions and
       looked frozen on the final frame while the 2D board had already
       reset. Stepping between frame thumbnails had the same gap. */
    const fn = a.slice(a.indexOf('function applyFrameState'),
        a.indexOf('function saveFrames'));
    assert.ok(/tb3dTouch\(\)/.test(fn),
        'applyFrameState must notify the 3D view');
  });

  it('the play loop ends by applying frame 0', () => {
    /* Which is what makes the poke above sufficient.

       Anchored on the EDITOR's play button, not on `function
       playNext()` — there are two of those, and the read-only
       renderer's comes first in the file. Slicing from the wrong one
       finds applyRoFrame and proves nothing about the editor. */
    const start = a.indexOf("const playBtn = document.getElementById('tb-frame-play')");
    assert.ok(start !== -1, 'editor play button not found');
    const loop = a.slice(start, start + 2600);
    assert.ok(/applyFrameState\(frames\[0\]\)/.test(loop), loop.slice(0, 300));
  });
});

describe('trajectories', () => {
  const fs2 = require('fs');
  const p2 = require('path');
  const s3 = fs2.readFileSync(p2.join(__dirname, '..', 'js', 'board3d.js'), 'utf8');
  const a = fs2.readFileSync(p2.join(__dirname, '..', 'js', 'app.js'), 'utf8');

  it('draws the curve with the SAME maths that drives playback', () => {
    /* If the drawn line and the animated motion came from two
       different functions, the ball would visibly leave its own
       trajectory — the one thing a trajectory must never do. */
    assert.ok(/BS\.pathPoint\(/.test(s3), 'board3d must draw via BS.pathPoint');
    assert.ok(/BS\.pathHeight\(/.test(s3));
    assert.ok(/BS\.tweenTrack\(fromBalls, toBalls, t, toPaths\.balls\)/.test(a),
        'playback must be handed the same paths');
  });

  it('has a bend handle and an apex handle, as two pickable kinds', () => {
    assert.ok(/kind: 'pathBend'/.test(s3));
    assert.ok(/kind: 'pathApex'/.test(s3));
  });

  it('the apex handle moves in HEIGHT, never across the turf', () => {
    /* Raycasting a diamond onto the ground plane sends it to the
       horizon as the pointer approaches eye level. */
    const mv = s3.slice(s3.indexOf('function onPointerMove'), s3.indexOf('function onPointerUp'));
    assert.ok(/pathApex/.test(mv), mv);
    assert.ok(/Math\.max\(0, Math\.min\(40,/.test(mv),
        'height must be clamped, not unbounded');
    // And the arc must redraw as it is lifted, not on release.
    assert.ok(/updatePath\(e, Object\.assign\(\{\}, e\.path, \{apex/.test(mv), mv);
  });

  it('the bend handle is NOT clamped to the pitch', () => {
    // An outswinging cross bulges past the touchline.
    const up = s3.slice(s3.indexOf('function onPointerUp'), s3.indexOf('function onWheel'));
    const bendBranch = up.slice(up.indexOf("'pathBend'"), up.indexOf('} else if (onMove)'));
    assert.ok(!/Math\.min\(100/.test(bendBranch), bendBranch);
  });

  it('a path is only drawn for something that actually moved', () => {
    assert.ok(/function moved\(a, b\)/.test(s3));
    const fn = s3.slice(s3.indexOf('function addPathsFor'), s3.indexOf('/* ── Rebuilding'));
    assert.ok(/if \(!moved\(prev\[i\], p\)\) return;/.test(fn), fn);
  });

  it('the travelling dot runs on one shared clock', () => {
    /* Per-dot phases look like noise; in step they read as direction.
       And the render loop can no longer be purely on demand, because
       a static frame cannot show direction. */
    const fn = s3.slice(s3.indexOf('function tick('), s3.indexOf('const ro ='));
    assert.ok(/travellers\.length/.test(fn), fn);
    assert.ok(/% 3000/.test(fn), 'expected one shared period');
  });

  it('clears the travellers on rebuild, or they accumulate', () => {
    const fn = s3.slice(s3.indexOf('function rebuild()'), s3.indexOf('function disposeTree'));
    assert.ok(/travellers\.length = 0/.test(fn), fn);
  });
});

describe('where a trajectory is stored', () => {
  const fs2 = require('fs');
  const p2 = require('path');
  const a = fs2.readFileSync(p2.join(__dirname, '..', 'js', 'app.js'), 'utf8');

  /* Bounded by the function's own closing brace, not by a character
     count. A fixed window silently stops covering the tail as soon as
     the function grows, and then reports the tail as missing — which
     is exactly what happened when applyPath gained the dot
     operations. */
  const applyPathSrc = () => {
    const i = a.indexOf('applyPath: (kind, index, patch)');
    assert.ok(i !== -1, 'applyPath not found');
    return a.slice(i, a.indexOf('\n        }', i));
  };

  it('lives on the frame it leads INTO, like duration', () => {
    const fn = applyPathSrc();
    assert.ok(/frames\[activeFrameIdx\]/.test(fn), fn);
    assert.ok(/saveFrames\(\)/.test(fn));
  });

  it('MERGES a bend/apex patch, so setting height keeps the curve', () => {
    /* The two handles edit one path. Replacing instead of merging
       makes each handle silently undo the other. */
    const fn = applyPathSrc();
    assert.ok(/Object\.assign\(\{\}, cur, patch\)/.test(fn), fn);
  });

  it('handles the player dot operations separately from the ball', () => {
    /* Two path shapes for two different things: {bend, apex} is a
       ball's parabola, {pts} is a player's run. One function, but the
       branches must not bleed into each other. */
    const fn = applyPathSrc();
    ['patch.addDot', 'patch.removeDot', 'patch.moveDot']
        .forEach((op) => assert.ok(fn.includes(op), 'missing ' + op));
    assert.ok(/BS\.insertPointAt\(cur, p0, p1, patch\.addDot\)/.test(fn),
        'adding a dot must go through insertPointAt, which picks the index');
  });

  it('clears a legacy bend when the dots are edited', () => {
    /* A legacy single-bend path reads as one dot, so removing that
       dot has to clear the field it actually came from — otherwise it
       reappears on the next read. */
    const fn = applyPathSrc();
    assert.ok((fn.match(/delete next\.bend/g) || []).length >= 2, fn);
  });

  it('survives autoSaveFrame, which replaces the whole frame', () => {
    /* Paths are not derived from the DOM, so a capture would wipe
       them. Carried across exactly like duration. */
    const from = a.indexOf('function autoSaveFrame()');
    const fn = a.slice(from, a.indexOf('function ', from + 40));
    assert.ok(/existingPaths/.test(fn), fn);
  });

  it('frame 0 has no trajectories, because nothing has moved yet', () => {
    const fn = a.slice(a.indexOf('function _tb3dPrevFrame'),
        a.indexOf('function _tb3dPrevFrame') + 260);
    assert.ok(/i > 0/.test(fn), fn);
  });
});

describe('the 2D board draws the bend, but not the height', () => {
  const fs2 = require('fs');
  const p2 = require('path');
  const a = fs2.readFileSync(p2.join(__dirname, '..', 'js', 'app.js'), 'utf8');
  const fn = a.slice(a.indexOf('function tbPaths2D()'),
      a.indexOf('/** Tear down the 3D view'));

  it('uses the same control point the curve maths derives', () => {
    // Not a re-derivation: the drawn curve and the animated motion
    // must be the same parabola.
    assert.ok(/BS\.bendToControl\(p0, p1, path && path\.bend\)/.test(fn), fn);
  });

  it('ignores the apex, which has no top-down meaning', () => {
    assert.ok(!/apex/.test(fn), '2D must not try to draw arc height');
  });

  it('rotates by the same rule the markings and players use', () => {
    assert.ok(/BG\.isRotated\(bt, vert\)/.test(fn), fn);
  });

  it('rebuilds rather than patching, and is driven by the shared funnel', () => {
    assert.ok(/querySelectorAll\('\.tb-move-path'\)\.forEach\(\(el\) => el\.remove\(\)\)/.test(fn),
        'stale paths must be cleared, not reused');
    const touch = a.slice(a.indexOf('function tb3dTouch()'),
        a.indexOf('function tb3dTouch()') + 400);
    assert.ok(/tbPaths2D\(\)/.test(touch), touch);
  });

  it('draws nothing on frame 0', () => {
    assert.ok(/if \(!cur \|\| !prev\) return;/.test(fn), fn);
  });
});

describe('playback dressing', () => {
  const fs2 = require('fs');
  const p2 = require('path');
  const s3 = fs2.readFileSync(p2.join(__dirname, '..', 'js', 'board3d.js'), 'utf8');
  const a = fs2.readFileSync(p2.join(__dirname, '..', 'js', 'app.js'), 'utf8');

  it('the ball shadow grows with height and fades as it grows', () => {
    /* It is the only cue to altitude from directly overhead, where
       the arc itself is edge-on and invisible. */
    const fn = s3.slice(s3.indexOf('function setBallShadow'), s3.indexOf('/* Player trails'));
    assert.ok(/height \* 0\.12/.test(fn), 'radius must still scale with height');
    assert.ok(/opacity = Math\.max\(/.test(fn), 'and fade as it grows');
    assert.ok(/if \(!\(height > 0\.05\)\)/.test(fn), 'hidden at rest');
  });

  it('the ball height comes from the same path the tween used', () => {
    // Otherwise altitude and plan position could disagree.
    const fn = a.slice(a.indexOf('function tb3dTween'), a.indexOf('function tbDestroy3D'));
    assert.ok(/BS\.pathHeight\(paths\[i\], t\)/.test(fn), fn);
    assert.ok(/kind === 'balls'/.test(fn), 'only the ball has height');
  });

  it('trails fade by vertex colour, not by a shader', () => {
    /* LineBasicMaterial has only a uniform opacity, and a custom
       shader is a lot of machinery for something meant to be barely
       noticeable. Lerping toward the turf reads as a fade. */
    const fn = s3.slice(s3.indexOf('function trailPush'), s3.indexOf('function clearTrails'));
    assert.ok(/vertexColors: true/.test(fn), fn);
    assert.ok(/turf\.clone\(\)\.lerp/.test(fn), 'fade toward the turf colour');
  });

  it('a short trail repeats its oldest point instead of collapsing', () => {
    /* A part-filled buffer would otherwise leave zeroed vertices and
       draw a line to the centre spot. */
    const fn = s3.slice(s3.indexOf('function trailPush'), s3.indexOf('function clearTrails'));
    assert.ok(/tr\.pts\[0\]/.test(fn), fn);
  });

  it('every exit from playback stops the dressing', () => {
    /* There are four ways out of the play loop — finishing, the stop
       button, and two guard paths. Miss one and the trails hang
       around over a static board. */
    assert.strictEqual((a.match(/_tb3d\.setPlaying\(false\)/g) || []).length, 4);
    assert.ok(/_tb3d\.setPlaying\(true\)/.test(a));
  });
});

describe('camera presets', () => {
  const fs2 = require('fs');
  const p2 = require('path');
  const s3 = fs2.readFileSync(p2.join(__dirname, '..', 'js', 'board3d.js'), 'utf8');
  const a = fs2.readFileSync(p2.join(__dirname, '..', 'js', 'app.js'), 'utf8');

  it('offers the four angles plus follow-ball', () => {
    ['broadcast', 'top', 'goal', 'side'].forEach((k) =>
      assert.ok(new RegExp(k + ':').test(s3), 'missing preset ' + k));
    ['broadcast', 'top', 'goal', 'side', 'follow'].forEach((k) =>
      assert.ok(a.includes('data-cam="' + k + '"'), 'missing button ' + k));
  });

  it('handles the degenerate overhead case explicitly', () => {
    /* Straight down, the default up vector is parallel to the view
       direction and lookAt's basis collapses — the pitch spins. The
       orbit control forbids the angle; the preset has to survive it. */
    const fn = s3.slice(s3.indexOf('function applyCamera'), s3.indexOf('const PRESETS'));
    assert.ok(/cam\.phi < 0\.02/.test(fn) && /camera\.up\.set\(/.test(fn), fn);
  });

  it('leaves the distance to frameBoard rather than hardcoding it', () => {
    // A fixed distance crops the pitch on a narrow window.
    const fn = s3.slice(s3.indexOf('function setPreset'), s3.indexOf('/* ── Interaction'));
    assert.ok(/frameBoard\(\)/.test(fn), fn);
    assert.ok(!/dist:/.test(s3.slice(s3.indexOf('const PRESETS'), s3.indexOf('function setPreset'))),
        'presets should not carry their own distance');
  });

  it('a manual orbit or pan stops the camera following the ball', () => {
    // Or the camera and the coach fight each other.
    assert.ok((s3.match(/followBall = false/g) || []).length >= 3, 'orbit, pan and preset');
  });

  it('only Follow can latch, because only Follow is a state', () => {
    const fn = a.slice(a.indexOf("const cams = document.getElementById('tb-3d-cams')"),
        a.indexOf("const cams = document.getElementById('tb-3d-cams')") + 1100);
    assert.ok(/tb-cam-follow/.test(fn) && /isFollowingBall\(\)/.test(fn), fn);
  });
});

describe('real shadows', () => {
  const fs2 = require('fs');
  const p2 = require('path');
  const s3 = fs2.readFileSync(p2.join(__dirname, '..', 'js', 'board3d.js'), 'utf8');

  it('the renderer casts them at all', () => {
    assert.ok(/shadowMap\.enabled = true/.test(s3));
    assert.ok(/PCFSoftShadowMap/.test(s3));
  });

  it('the shadow camera is FITTED to the pitch', () => {
    /* Its default frustum is a couple of units across, so almost the
       whole board would fall outside it and receive no shadow. */
    const fn = s3.slice(s3.indexOf('function fitShadowCamera'), s3.indexOf('/* ── The pitch'));
    assert.ok(/BG\.extent\(/.test(fn), fn);
    assert.ok(/updateProjectionMatrix\(\)/.test(fn));
  });

  it('and refitted when the pitch is rebuilt, because it can be resized', () => {
    const fn = s3.slice(s3.indexOf('function buildPitch'), s3.indexOf('/* ── Objects'));
    assert.ok(/fitShadowCamera\(\)/.test(fn), fn);
    assert.ok(/receiveShadow = true/.test(fn), 'the pitch must receive');
  });

  it('the light target is in the scene, or the light aims nowhere', () => {
    assert.ok(/scene\.add\(key\.target\)/.test(s3));
  });

  it('the solid objects cast', () => {
    // Players, ball, cones and the goal frames.
    assert.ok((s3.match(/castShadow = true/g) || []).length >= 4, s3.length);
  });
});

describe('flat markers, not half-buried balls', () => {
  const fs2 = require('fs');
  const p2 = require('path');
  const s3 = fs2.readFileSync(p2.join(__dirname, '..', 'js', 'board3d.js'), 'utf8');

  it('only the game ball is still a sphere', () => {
    /* The dots were spheres, which read as balls sunk into the turf —
       confusing next to the one round thing that IS a ball. */
    assert.strictEqual((s3.match(/SphereGeometry/g) || []).length, 1);
  });

  it('the flat dot helper lies face-up and does not z-fight', () => {
    const fn = s3.slice(s3.indexOf('function flatDot'), s3.indexOf('function addPath'));
    assert.ok(/CircleGeometry/.test(fn), fn);
    assert.ok(/rotation\.x = -Math\.PI \/ 2/.test(fn), 'must lie flat');
    assert.ok(/depthWrite: false/.test(fn));
  });

  it('the travelling dot cannot be mistaken for the ball', () => {
    // BALL_R is 0.45; the marker has to be clearly smaller.
    const m = /flatDot\(([\d.]+), col\);/.exec(s3);
    assert.ok(m, 'traveller size not found');
    assert.ok(parseFloat(m[1]) < 0.25, 'traveller is ' + m[1] + ', too close to a ball');
  });

  it('the apex diamond stays a diamond', () => {
    // It means "up"; flattening it would make it another ground dot.
    assert.ok(/OctahedronGeometry/.test(s3));
  });

  it('the ball marker is a RING, and holds its opacity', () => {
    /* A filled dark disc is indistinguishable from the ball from
       overhead, and the previous one faded to near-invisible. */
    const fn = s3.slice(s3.indexOf('const ballShadow ='), s3.indexOf('function restBallMarker'));
    assert.ok(/RingGeometry/.test(fn), fn);
    /* Deliberately subtle now — it only has to say where the ball is
       over the pitch, not compete with the ball. Still FLOORED, so it
       cannot fade away to nothing the way the first version did. */
    assert.ok(/Math\.max\(0\.2\d?,/.test(fn), 'opacity must still have a floor');
    assert.ok(/RingGeometry\(0\.9/.test(fn), 'the ring must be thin');
  });

  it('shows for a lofted ball at REST, not only during playback', () => {
    assert.ok(/function restBallMarker/.test(s3));
    const rb = s3.slice(s3.indexOf('function rebuild()'), s3.indexOf('function disposeTree'));
    assert.ok(/restBallMarker\(\)/.test(rb), 'rebuild must place it');
  });
});

describe('curves follow the handle live', () => {
  const fs2 = require('fs');
  const p2 = require('path');
  const s3 = fs2.readFileSync(p2.join(__dirname, '..', 'js', 'board3d.js'), 'utf8');

  it('every drawn trajectory is held, not added anonymously', () => {
    /* The cause of the snapping: the Lines were added with no
       reference kept, so a drag could only move the handle mesh and
       nothing could recompute the curve until the release rebuild. */
    const fn = s3.slice(s3.indexOf('function addPath('), s3.indexOf('function moved('));
    ['entry.curve', 'entry.traveller', 'entry.pickLine']
        .forEach((k) => assert.ok(fn.includes(k), 'not registered: ' + k));
    assert.ok(/pathEntries\.push\(entry\)/.test(fn));
  });

  it('rewrites the existing buffer instead of rebuilding geometry', () => {
    // Allocating a buffer per pointermove is how a smooth drag stutters.
    const fn = s3.slice(s3.indexOf('function updatePath('), s3.indexOf('/** Did this thing moved') + 1);
    assert.ok(/attr\.setXYZ\(/.test(s3), 'must write into the attribute');
    assert.ok(/needsUpdate = true/.test(s3));
  });

  it('all three handle kinds redraw during the move', () => {
    const mv = s3.slice(s3.indexOf('function onPointerMove'), s3.indexOf('function onPointerUp'));
    assert.ok(/updatePath\(/.test(mv), 'the move handler must redraw');
    assert.ok(/pathBend' \|\| dragging\.kind === 'pathDot'/.test(mv), mv.slice(0, 400));
  });

  it('the registry is cleared on rebuild, or entries accumulate', () => {
    const rb = s3.slice(s3.indexOf('function rebuild()'), s3.indexOf('function disposeTree'));
    assert.ok(/pathEntries\.length = 0/.test(rb), rb);
  });
});

describe('the ball bend handle is constrained in 3D', () => {
  const fs2 = require('fs');
  const p2 = require('path');
  const s3 = fs2.readFileSync(p2.join(__dirname, '..', 'js', 'board3d.js'), 'utf8');

  it('constrains DURING the drag, so the dot tracks the cursor', () => {
    /* Constraining only on release would let the dot wander off the
       bisector and then jump when the button comes up. */
    const mv = s3.slice(s3.indexOf('function onPointerMove'), s3.indexOf('function onPointerUp'));
    assert.ok(/BS\.constrainBend\(e\.p0, e\.p1, pct\)/.test(mv), mv.slice(0, 600));
  });

  it('and again on commit, so the stored value never depends on the drag path', () => {
    const up = s3.slice(s3.indexOf('function onPointerUp'), s3.indexOf('function onWheel'));
    assert.ok(/BS\.constrainBend\(/.test(up), up);
  });

  it('player dots are NOT constrained — a run may bend late', () => {
    const mv = s3.slice(s3.indexOf('function onPointerMove'), s3.indexOf('function onPointerUp'));
    const dotBranch = mv.slice(mv.indexOf('} else {'), mv.indexOf('// Snap the handle'));
    assert.ok(!/constrainBend/.test(dotBranch), dotBranch);
  });
});

describe('the shadow setup is sized against the scene', () => {
  const fs2 = require('fs');
  const p2 = require('path');
  const s3 = fs2.readFileSync(p2.join(__dirname, '..', 'js', 'board3d.js'), 'utf8');
  const fn = s3.slice(s3.indexOf('function fitShadowCamera'), s3.indexOf('/* ── The pitch'));

  it('fits the bounding SPHERE, not the longest side', () => {
    /* The shadow camera looks down the light's axis, so what must fit
       is the pitch as seen from the light — and a rectangle viewed
       off-axis projects up to its full diagonal. */
    assert.ok(/Math\.hypot\(e\.ax, e\.ay\)/.test(fn), fn);
  });

  it('scales the light distance with the pitch', () => {
    // A fixed position pushed a large pitch's corners behind the light.
    assert.ok(/key\.position\.copy\(LIGHT_DIR\)\.multiplyScalar\(dist\)/.test(fn), fn);
  });

  it('hugs near and far to the scene', () => {
    /* bias is a fraction of the DEPTH RANGE, so a range six times
       wider than the scene needs makes the bias six times as costly
       in metres. */
    assert.ok(/c\.near = Math\.max\(1, dist - radius/.test(fn), fn);
    assert.ok(/c\.far = dist \+ radius/.test(fn), fn);
    assert.ok(!/c\.far = 400/.test(fn), 'the fixed 400 far plane is the bug');
  });

  it('keeps the bias well under a player height', () => {
    /* THE fault behind "shadows vanish when I orbit": at -0.0008 over
       a 1..400 range the bias was 0.32 m, and a player disc is 0.35 m
       tall — so its shadow was pushed through the turf entirely.
       Invisible from overhead, where the shadow hides under the
       player; gone the moment you orbit. */
    const m = /key\.shadow\.bias = (-?[\d.]+)/.exec(fn);
    assert.ok(m, 'bias not found');
    const bias = Math.abs(parseFloat(m[1]));
    // Worst case depth range across the allowed pitch sizes.
    const BG = require('../js/board-geom.js');
    const e = BG.extent([130, 90], 'full', false);
    const radius = Math.hypot(e.ax, e.ay) / 2 * 1.15 + 12;
    const range = (radius * 2.2 + radius + 20) - Math.max(1, radius * 2.2 - radius - 20);
    const offsetMetres = bias * range;
    assert.ok(offsetMetres < 0.35 * 0.4,
        'bias is ' + offsetMetres.toFixed(3) + ' m against a 0.35 m player');
  });
});

describe('the object drag carries its trajectory', () => {
  const fs2 = require('fs');
  const p2 = require('path');
  const s3 = fs2.readFileSync(p2.join(__dirname, '..', 'js', 'board3d.js'), 'utf8');

  it('re-points the curve end while the object moves', () => {
    // The curve ends where the object is; leaving it until release is
    // the same "snaps into place" complaint as the handles had.
    assert.ok(/movePathEnd\(dragging\.kind, dragging\.index, g\)/.test(s3));
    const fn = s3.slice(s3.indexOf('function movePathEnd'), s3.indexOf('function movePathEnd') + 700);
    assert.ok(/e\.p1 = /.test(fn) && /updatePath\(e, e\.path\)/.test(fn), fn);
  });

  it('re-points the travelling dot too, which holds its own endpoints', () => {
    const fn = s3.slice(s3.indexOf('function movePathEnd'), s3.indexOf('function movePathEnd') + 700);
    assert.ok(/tr\.p1 = e\.p1/.test(fn), fn);
  });
});

describe('the apex diamond reads as a solid', () => {
  const fs2 = require('fs');
  const p2 = require('path');
  const s3 = fs2.readFileSync(p2.join(__dirname, '..', 'js', 'board3d.js'), 'utf8');

  it('is the same size as a bend dot', () => {
    assert.ok(/OctahedronGeometry\(0\.5\)/.test(s3));
  });

  it('has dark edges, because a flat-shaded solid in perspective is a hexagon', () => {
    assert.ok(/EdgesGeometry\(diaGeo\)/.test(s3));
    assert.ok(/flatShading: true/.test(s3), 'faces must separate');
  });
});

describe('broadcast is centred', () => {
  const fs2 = require('fs');
  const p2 = require('path');
  const s3 = fs2.readFileSync(p2.join(__dirname, '..', 'js', 'board3d.js'), 'utf8');

  it('sits square on the touchline, with no off-axis offset', () => {
    /* It carried -0.35, meant as "off the halfway line", which only
       pushed the camera 34% off-axis in X. */
    assert.ok(/broadcast: \{theta: -Math\.PI \/ 2, phi:/.test(s3),
        'broadcast must not carry a theta offset');
  });
});
