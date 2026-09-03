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
const {readCss} = require('./read-css');

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
    /* Still lazy, but no longer by URL: the module is the paid feature
       and is not served as a file any more. It comes from the
       getBoard3d callable and is evaluated as a blob module — see
       test/board3d-gate.test.js, which owns that whole path. What
       matters HERE is only that nothing pays for it up front. */
    assert.ok(/await tbLoad3D\(\)/.test(appSrc),
        'expected the module to be fetched on demand');
    assert.ok(/await import\(\/\* webpackIgnore: true \*\/ url\)/.test(appSrc),
        'and evaluated by dynamic import, not injected as a script tag');
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
       the flag is still in their localStorage.

       The three clauses moved behind `tbCan3D()` when the read-only
       boards grew a 3D button — a fourth copy of the condition is a
       fourth chance to omit a clause, and the APK clause had already
       been omitted from all of them. What this test is about is that
       the saved flag is re-checked AGAINST THE GATE, whatever the gate
       is called; the gate's own contents are pinned just below. */
    assert.ok(/fa_tactic_view_3d'\) === '1'\s*&&\s*tbCan3D\(\)/
        .test(appSrc), 'the saved preference must be re-checked against the gate');
  });

  it('the gate is the entitlement, WebGL, and not the phone', () => {
    const fn = appSrc.slice(appSrc.indexOf('function tbCan3D'),
        appSrc.indexOf('function tbIs3D'));
    assert.ok(/clubFeature\('board3d'\)/.test(fn), 'entitlement not checked');
    assert.ok(/tbWebglOk\(\)/.test(fn), 'WebGL not checked');
    /* The APK bundles neither vendor/three nor board3d.js, but an
       Android WebView passes the WebGL probe — so a premium club on the
       phone saw the toggle and got "load failed". */
    assert.ok(/!tbNativeShell\(\)/.test(fn), 'the native shell is not excluded');
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
  const css = readCss();
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
  const css = readCss();
  const s3 = fs2.readFileSync(p2.join(__dirname, '..', 'js', 'board3d.js'), 'utf8');

  it('fills the content area, with no negative margins to do it', () => {
    /* The mechanism changed three times, so it is worth saying which
       one is in force. It began as a max-width cap; became a bleed
       cancelling the card's padding on two edges, then three, then
       four; and now there is no card padding left to cancel — the
       card gives up its box and the content area gives up its 2rem,
       so the board simply fills what remains.

       NO negative margin, deliberately. The update and push banners
       render into #dashboard-content too, and pulling the board up by
       2rem would slide it OVER one on the days it appears. */
    const wrap = css.slice(css.indexOf('.tb-3d-wrap {'), css.indexOf('.tb-3d-loading'));
    assert.ok(!/max-width:\d+px/.test(wrap),
        'a width cap would stop it filling the area');
    assert.ok(!/margin:-/.test(wrap),
        'a negative margin would slide the board over a banner: ' + wrap);
    assert.ok(/border-radius:0/.test(wrap), 'square, flush on every side');

    const card = css.slice(css.indexOf('.card.tb-card-window {'),
        css.indexOf('}', css.indexOf('.card.tb-card-window {')));
    assert.ok(/padding:0/.test(card) && /background:none/.test(card),
        'the card must stop being a box: ' + card);
    assert.ok(/\.dashboard-flush \{ padding:0 !important; \}/.test(css),
        'and the content area must give up its own padding');
  });

  it('takes its height from the viewport, measured rather than guessed', () => {
    /* CSS cannot see this element's top offset — topnav, breadcrumb
       and board name all vary — so the height is set from JS. The CSS
       value is only what shows before the first measurement. */
    const app = fs2.readFileSync(p2.join(__dirname, '..', 'js', 'app.js'), 'utf8');
    /* Bounded at the NEXT function, not at tbDestroy3D — the fit and
       zoom helpers were inserted between the two, so the old bound
       swallowed five more functions and every assertion below could
       have been satisfied by one of them. */
    const fn = app.slice(app.indexOf('function tbSize3DWindow() {'),
        app.indexOf('function tbRotatedBox('));
    assert.ok(fn.length > 100, 'tbSize3DWindow not found');
    assert.ok(/getBoundingClientRect\(\)\.top/.test(fn),
        'the top offset must be measured');
    assert.ok(/window\.innerHeight - top/.test(fn),
        'the height must run to the bottom of the viewport');
    assert.ok(/Math\.max\(420,/.test(fn),
        'a floor, or a short window can compute a negative height');
    assert.ok(/window\.addEventListener\('resize', tbSize3DWindow\)/.test(app),
        'and it must follow the browser window');
    /* The call has to EXIST before its position means anything.
       Without this line, deleting the call left indexOf at -1 and
       `-1 < anything` passed the ordering check vacuously — the
       mutation survived. */
    const at = app.indexOf('tbSize3DWindow();');
    assert.ok(at !== -1, 'nothing calls tbSize3DWindow');
    assert.ok(at < app.indexOf('tbMount3D({'),
        'sized BEFORE mounting, or the board re-frames itself on every entry');
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
    /* Anchored on the mount and read BACKWARDS. Anchoring on the
       enclosing `if` was a fixed-size window keyed on a string that
       stopped being unique the moment a second guard was added — the
       test then failed on code that was correct. */
    /* Bounded on the BLOCK, not on a character count. The window was
       900 and a helper moved in above the mount pushed the flush out
       of it — the test then failed on code that was correct, for the
       second time in this one assertion and the fifth time in this
       suite. A fixed-width slice is a bug waiting for the next edit. */
    const m = a.indexOf('tbMount3D({');
    assert.ok(m !== -1, 'tbMount3D call not found');
    const open = a.lastIndexOf('if (tbIs3D()) {', m);
    assert.ok(open !== -1, 'the mount is not inside a 3D guard');
    const before = a.slice(open, m);
    assert.ok(before.indexOf('saveState();') !== -1,
        'the flush must happen BEFORE the mount, inside the same block');
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
    /* The attribute is templated now (`data-cam="' + cam + '"`), so
       the literal it used to grep for no longer appears anywhere. */
    assert.ok(/one\('reset'/.test(a) && /_tb3d\.resetCamera\(\)/.test(a),
        'the crosshair entry must exist and must call resetCamera');
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

  it('a path is only SHOWN for something that actually moved', () => {
    /* It used to be only BUILT for something that had moved, which
       left a drag with no entry to update until the release rebuild.
       Now it is always built and gated on visibility — what the coach
       sees is the same invariant, reached a different way. */
    assert.ok(/function moved\(a, b\)/.test(s3));
    const fn = s3.slice(s3.indexOf('function addPathsFor'), s3.indexOf('/* ── Rebuilding'));
    assert.ok(/setPathVisible\(e, moved\(prev\[i\], p\)\)/.test(fn), fn);
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

  it('trails fade to TRANSPARENT, via per-vertex alpha', () => {
    /* This faked the fade by lerping colour toward a flat turf green,
       on the grounds that a custom shader was too much machinery for
       something barely noticeable. Wrong on both counts: the turf is
       lit, mown-striped and shadowed, so a flat green line reads as a
       pale streak over a dark stripe — and the real thing is fifteen
       lines of GLSL. */
    const fn = s3.slice(s3.indexOf('const TRAIL_MAT'), s3.indexOf('function clearTrails'));
    assert.ok(/attribute float alpha/.test(fn), fn.slice(0, 200));
    assert.ok(!/turf\.clone\(\)\.lerp/.test(fn), 'the colour-lerp fake must be gone');
  });

  it('the drawn trajectories come off while the move is running', () => {
    /* A trajectory is a PLAN of a move. While the move is playing it
       duplicates the move, drawn through the very objects it
       describes — and its handles are targets for a gesture nobody can
       make mid-playback. What stays is the trail behind each object
       and the ball's ground shadow, which say where things ARE rather
       than where they were going to go. */
    const vis = s3.slice(s3.indexOf('function setPathVisible'),
        s3.indexOf('function updatePath'));
    assert.ok(/entry\.visible = on;/.test(vis),
        'the entry must keep its own INTENT — has this object moved at all');
    assert.ok(/const show = on && !playing;/.test(vis),
        'and what renders is that intent AND not playing');
    assert.ok(/entry\.meshes\.forEach\(\(m\) => \{ m\.visible = show; \}\)/.test(vis),
        'every mesh of the path — curve, ground track and both handles');
    assert.ok(/entry\.traveller\.visible = show/.test(vis),
        'and the travelling dot, which is animated from its own list');

    /* Re-applied on the toggle, and re-applied rather than remembered:
       applyFrameState pokes a rebuild at every frame boundary during
       playback, which would otherwise put them straight back. */
    const sp = s3.slice(s3.indexOf('setPlaying(on) {'), s3.indexOf('getSelected()'));
    assert.ok(/refreshPathVisibility\(\)/.test(sp),
        'setPlaying must re-apply the visibility over every entry');
    const refresh = s3.slice(s3.indexOf('function refreshPathVisibility'),
        s3.indexOf('function updatePath'));
    assert.ok(/pathEntries\.forEach/.test(refresh), 'over ALL of them');

    /* The two things that must NOT go: they describe the present.
       Sliced to setPosition's own `if (playing)` block rather than
       matched within a character budget — the ball's spin moved in
       above the shadow and pushed it out of a 200-char window, which
       failed reporting that the shadow had gone when it had not. That
       is the seventh fixed-width slice to bite in this suite, and the
       first one I wrote myself. */
    const sp2 = s3.slice(s3.indexOf('setPosition(kind, index, pct, height)'),
        s3.indexOf('setPlaying(on) {'));
    assert.ok(sp2.length > 200, 'the setPosition slice looks wrong');
    const hot = sp2.slice(sp2.indexOf('if (playing) {'));
    assert.ok(/setBallShadow\(/.test(hot),
        'the ball shadow is drawn precisely BECAUSE it is playing');
    assert.ok(/trailPush\(/.test(hot), 'and so is the trail');
  });

  it('and the flat board takes its own down too', () => {
    /* tbPaths2D draws the same curves as SVG. It lives at module
       scope, where `framePlaying` — a local of bindTactics — cannot be
       seen, which is why the flag it reads is set through the one
       function that tells both views. */
    const f = a.slice(a.indexOf('function tbPaths2D'), a.indexOf('function tbIcon'));
    assert.ok(/querySelectorAll\('\.tb-move-path'\)[\s\S]{0,80}remove\(\)/.test(f),
        'the existing lines must be cleared first');
    const iClear = f.indexOf(".tb-move-path");
    const iBail = f.indexOf('if (_tbPlaying) return;');
    assert.ok(iBail !== -1, 'it must stand down during playback');
    assert.ok(iClear < iBail,
        'and stand down AFTER clearing, or switching to playing freezes ' +
        'the lines on the board instead of taking them off');

    /* And SOMETHING has to run it on the toggle. Found by mutation:
       with the redraw removed, the lines only came off at the next
       tb3dTouch — which playback happens to trigger a moment later, so
       it looked correct and was luck. */
    const bare = a.replace(/\/\*[\s\S]*?\*\//g, '');
    const set = bare.slice(bare.indexOf('function tbSetPlaying'),
        bare.indexOf('function tb3dTouch'));
    assert.ok(/_tbPlaying = !!on;/.test(set), 'it must set the module flag');
    assert.ok(/tbPaths2D\(\);/.test(set),
        'and redraw the flat board, rather than waiting for something ' +
        'else to happen to do it');
  });

  it('and stops driving dots nobody can see', () => {
    /* The travelling dots are hidden during playback; walking them
       round their curves anyway forces a redraw every frame, on top of
       the redraws playback is already asking for. */
    const tick = s3.slice(s3.indexOf('if (travellers.length'), s3.indexOf('if (needsRender)'));
    assert.ok(/!playing/.test(tick),
        'the traveller loop must stand down during playback');
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
       around over a static board.

       Through tbSetPlaying now, not `_tb3d.setPlaying` directly: the
       flat board has a trajectory layer to take down too, and it is
       drawn from module scope where `framePlaying` cannot be seen.
       One function tells both, so the pair cannot come apart — which
       is the same split that put the trajectory layer a frame behind. */
    /* SEVEN now, not four, and a PAUSE is one of them, as is the
       explicit stop the editor and the overlay both grew.
       The read-only 3D overlay added its own loop over a saved board's
       frames, and both it and the editor gained a pause — which is an
       exit from the running loop like any other, and wants the dressing
       down for a better reason than the rest: a paused board is the one
       a coach is pointing at, so the planned trajectories should be
       back on screen while it is frozen.

       A count, deliberately. The point of this assertion is that no
       exit is missed, and a loose match would pass with one gone. */
    assert.strictEqual((a.match(/tbSetPlaying\(false\)/g) || []).length, 7);
    assert.ok(/tbSetPlaying\(true\)/.test(a));
    /* And exactly one place still speaks to the scene directly.
       Comment-stripped: tbSetPlaying's own docstring names the call it
       replaced, and counting raw text found that too. */
    const aBare = a.replace(/\/\*[\s\S]*?\*\//g, '');
    assert.strictEqual((aBare.match(/_tb3d\.setPlaying\(/g) || []).length, 1,
        'only tbSetPlaying may drive the scene\'s playback flag');
  });
});

describe('camera presets', () => {
  const fs2 = require('fs');
  const p2 = require('path');
  const s3 = fs2.readFileSync(p2.join(__dirname, '..', 'js', 'board3d.js'), 'utf8');
  const a = fs2.readFileSync(p2.join(__dirname, '..', 'js', 'app.js'), 'utf8');

  it('keeps all four presets, and offers three of them', () => {
    /* The menu shows Realització, Porteria and Zenital, plus a
       crosshair to re-centre. Lateral and follow-ball were taken OUT
       OF THE MENU — not out of the code:

       - `PRESETS.side` stays because board3d-camera.test.js measures
         the transition between every pair of presets, and side->top
         is one of the two that used to whip 172 degrees through the
         overhead singularity. Deleting a button is not worth losing
         that coverage.
       - follow-ball is parked (HANDOFF 19); setFollowBall and
         isFollowingBall are untouched. */
    ['broadcast', 'top', 'goal', 'side'].forEach((k) =>
      assert.ok(new RegExp(k + ':').test(s3), 'missing preset ' + k));
    ['broadcast', 'goal', 'top', 'reset'].forEach((k) =>
      assert.ok(a.includes("data-cam=\"' + cam + '\"") || a.includes("one('" + k + "'"),
          'missing camera entry ' + k));
    assert.ok(!/one\('side'/.test(a), 'lateral must not be in the menu');
    assert.ok(!/one\('follow'/.test(a), 'follow-ball is parked');
    assert.ok(/setFollowBall/.test(s3) && /isFollowingBall/.test(s3),
        'but its code must survive the button');
  });

  it('handles the degenerate overhead case explicitly', () => {
    /* Straight down, the default up vector is parallel to the view
       direction and lookAt's basis collapses — the pitch spins. The
       orbit control forbids the angle; the preset has to survive it.

       Handled in upFor(), which applyCamera and the tween's
       destination-orientation both go through, so the static frame
       and the animated one cannot disagree. */
    const fn = s3.slice(s3.indexOf('function upFor'), s3.indexOf('function positionFor'));
    assert.ok(/phi < 0\.02/.test(fn), fn);
    assert.ok(/Math\.cos\(theta\), 0, Math\.sin\(theta\)/.test(fn),
        'the overhead case needs a horizontal up vector');
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

  it('nothing in the camera menu latches — every entry is an action', () => {
    /* This used to assert the opposite: that Follow latched and read
       its lit class back from the view rather than toggling blind.
       Follow is parked (HANDOFF 19) and its button is gone, so the
       menu now holds only actions — pick a view, or re-centre — and
       an entry that stayed lit would be claiming a state that does
       not exist. The list closes on click instead. */
    const i = a.indexOf('const camsBtn =');
    assert.ok(i !== -1, 'the camera menu wiring was not found');
    /* Bounded on the catch that ends the mount, not on a character
       count. The window was 1400 and a grace timer added to the hover
       wiring pushed the click handler past the end of it — so the test
       failed reporting that the presets had gone, when they had only
       moved. Fixed-width windows have cost this suite four assertions
       now. */
    const end = a.indexOf('} catch (err)', i);
    assert.ok(end !== -1, 'the mount block has no visible end');
    const fn = a.slice(i, end);
    assert.ok(!/tb-cam-follow/.test(fn), 'no latching entry remains');
    assert.ok(/setPreset\(btn\.dataset\.cam\)/.test(fn),
        'and the other entries are plain presets');
    /* Scoped to the BUTTON handler. A window-wide search for
       openCams(false) also found the outside-click dismissal, so
       deleting the close-on-click passed the test unchanged. */
    const at = fn.indexOf("cams.addEventListener('click'");
    assert.ok(at !== -1, 'the camera click handler was not found');
    const click = fn.slice(at, fn.indexOf('});', at));
    assert.ok(/openCams\(false\)/.test(click),
        'choosing a view must close the list — the icons disappear after click');
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
    /* Compared against BALL_R rather than a written-down number, so
       this keeps meaning the same thing when the ball is resized —
       which it has been twice. */
    const ball = require('../js/board-geom.js').OBJ.ball / 2;
    const m = /const dot = flatDot\(([\d.]+), col/.exec(s3);
    assert.ok(m, 'traveller size not found');
    assert.ok(parseFloat(m[1]) < ball * 0.6,
        'traveller is ' + m[1] + ' against a ball of ' + ball);
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
    // A floor must EXIST; its value is a taste call that has moved.
    assert.ok(/Math\.max\(0\.\d+,/.test(fn), 'opacity must still have a floor');
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
    /* One constant for every handle, so "the same size" is structural
       rather than two numbers that happen to match today. */
    assert.ok(/OctahedronGeometry\(HANDLE_R\)/.test(s3));
  });

  it('and every handle is smaller than it was, but bigger than the ball', () => {
    const handle = parseFloat(/const HANDLE_R = ([\d.]+);/.exec(s3)[1]);
    const ball = require('../js/board-geom.js').OBJ.ball / 2;
    assert.ok(handle < 0.45, 'handles should have shrunk: ' + handle);
    assert.ok(handle > ball, 'a handle must stay easy to grab: ' + handle + ' vs ' + ball);
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
    /* The SIGN moved too — broadcast and side sit on +Z now, so they
       are not mirrored against the 2D board. That is measured for
       real in board3d-camera.test.js; this only guards the offset. */
    assert.ok(/broadcast: \{theta: -?Math\.PI \/ 2, phi:/.test(s3),
        'broadcast must not carry a theta offset');
  });
});

describe('the ball is a ball, not a boulder', () => {
  const fs2 = require('fs');
  const p2 = require('path');
  const s3 = fs2.readFileSync(p2.join(__dirname, '..', 'js', 'board3d.js'), 'utf8');

  const num = (re) => {
    const m = re.exec(s3);
    assert.ok(m, 'not found: ' + re);
    return parseFloat(m[1]);
  };

  it('shrank, but is still visible at pitch scale', () => {
    // A real ball is 0.11 m and invisible on a 105 m pitch, so this
    // stays oversized on purpose — just not by as much.
    const r = require('../js/board-geom.js').OBJ.ball / 2;
    assert.ok(r < 0.35 && r > 0.15, 'BALL_R is ' + r);
  });

  it('the travelling dot stays well under it', () => {
    /* They were separated deliberately so a path marker is never
       mistaken for a ball; shrinking one without the other would undo
       that. */
    const ball = require('../js/board-geom.js').OBJ.ball / 2;
    const dot = num(/const dot = flatDot\(([\d.]+), col/);
    assert.ok(dot < ball * 0.6, 'dot ' + dot + ' vs ball ' + ball);
  });

  it('the ground ring is tied to the ball, not a fixed size', () => {
    // A hardcoded radius would be three times the ball after this change.
    assert.ok(/const r = BALL_R \* [\d.]+ \+ height/.test(s3));
  });
});

describe('trails fade to nothing', () => {
  const fs2 = require('fs');
  const p2 = require('path');
  const s3 = fs2.readFileSync(p2.join(__dirname, '..', 'js', 'board3d.js'), 'utf8');

  it('uses per-vertex ALPHA, not a colour lerp toward the turf', () => {
    /* The turf is lit, mown-striped and shadowed, so a flat green
       line does not match it — over a dark stripe the fake fade reads
       as a pale streak, which is the "fading to white" report. */
    const fn = s3.slice(s3.indexOf('const TRAIL_MAT'), s3.indexOf('function clearTrails'));
    assert.ok(/attribute float alpha/.test(fn), 'expected an alpha attribute');
    assert.ok(/gl_FragColor = vec4\(vCol, vAlpha\)/.test(fn), fn.slice(0, 300));
    assert.ok(!/turf\.clone\(\)\.lerp/.test(fn),
        'the colour-lerp fake must be gone');
  });

  it('writes the alpha buffer alongside position and colour', () => {
    const fn = s3.slice(s3.indexOf('function trailPush'), s3.indexOf('function clearTrails'));
    assert.ok(/attributes\.alpha\.needsUpdate = true/.test(fn), fn);
    assert.ok(/alpha\[i\] = /.test(fn));
  });

  it('the newest end is the opaque one', () => {
    // f runs 0 (oldest) to 1 (newest); the tail must be the faint end.
    const fn = s3.slice(s3.indexOf('function trailPush'), s3.indexOf('function clearTrails'));
    assert.ok(/const f = i \/ \(TRAIL_LEN - 1\)/.test(fn), fn);
    assert.ok(/alpha\[i\] = f \* f/.test(fn), 'expected the fade weighted to the tail');
  });
});

describe('a trajectory exists before the first drag', () => {
  const fs2 = require('fs');
  const p2 = require('path');
  const s3 = fs2.readFileSync(p2.join(__dirname, '..', 'js', 'board3d.js'), 'utf8');

  it('builds an entry for anything with a previous position', () => {
    /* It used to skip unmoved objects, so at the moment a drag began
       there was no entry and movePathEnd() bailed — the curve only
       appeared after the release rebuild. */
    const fn = s3.slice(s3.indexOf('function addPathsFor'), s3.indexOf('/* ── Rebuilding'));
    assert.ok(/if \(!prev\[i\] \|\| !p\) return;/.test(fn), fn);
    assert.ok(!/if \(!moved\(prev\[i\], p\)\) return;/.test(fn),
        'the skip-if-unmoved guard is the bug');
  });

  it('hides it until the object has actually moved', () => {
    const fn = s3.slice(s3.indexOf('function addPathsFor'), s3.indexOf('/* ── Rebuilding'));
    assert.ok(/setPathVisible\(e, moved\(prev\[i\], p\)\)/.test(fn), fn);
  });

  it('reveals it mid-drag, from updatePath', () => {
    const fn = s3.slice(s3.indexOf('function updatePath('), s3.indexOf('/** Did this thing'));
    assert.ok(/const should = moved\(p0, p1\)/.test(fn), fn);
    assert.ok(/setPathVisible\(entry, should\)/.test(fn));
  });

  it('an invisible path cannot be clicked', () => {
    /* three.js does not reliably skip invisible meshes in a raycast,
       and an invisible pick-line would swallow a right-click meant
       for the turf. */
    /* The PROPERTY, not the expression. This pinned the exact filter
       text and broke when the same filter grew a second condition for
       drawn marks — a test failing on code that still does what it
       asks for. */
    const fn = s3.slice(s3.indexOf('function pick(ev, includeLines) {'),
        s3.indexOf('const handleModes'));
    assert.ok(/o\.mesh\.visible/.test(fn),
        'the pick pool must exclude invisible meshes');
    assert.ok(fn.indexOf('o.mesh.visible') < fn.indexOf('intersectObjects'),
        'and exclude them BEFORE the raycast, not after');
  });
});

describe('camera moves are eased', () => {
  const fs2 = require('fs');
  const p2 = require('path');
  const s3 = fs2.readFileSync(p2.join(__dirname, '..', 'js', 'board3d.js'), 'utf8');

  it('takes the shortest way round', () => {
    /* theta is an angle: the raw difference sends the camera the long
       way round the pitch about half the time. */
    const fn = s3.slice(s3.indexOf('function tweenCameraTo'), s3.indexOf('/** Advance an in-flight'));
    assert.ok(/while \(dTheta > Math\.PI\) dTheta -= Math\.PI \* 2/.test(fn), fn);
  });

  it('never interpolates the up vector at all', () => {
    /* This test used to demand a BLEND, on the theory that a hard
       switch would flick part-way through a move to Top. The blend
       was worse: it drags `up` toward the view axis across the whole
       band, and the measured result was a 172-degree whip. The right
       answer was to stop interpolating orientation as angles — see
       the slerp — and leave the up rule as a stable hard switch. */
    assert.ok(!/0\.15 - cam\.phi/.test(s3), 'the blend band must be gone');
    const fn = s3.slice(s3.indexOf('function upFor'), s3.indexOf('function positionFor'));
    assert.ok(/phi < 0\.02/.test(fn), fn);
  });

  it('holds the render loop open for the duration', () => {
    // The loop is on demand; otherwise the move shows one frame.
    const fn = s3.slice(s3.indexOf('function tick('), s3.indexOf('const ro ='));
    assert.ok(/stepCameraTween\(/.test(fn), fn);
  });

  it('manual input cancels it — orbit, pan and zoom', () => {
    /* Named sites, not a count. The count broke the moment a fifth
       legitimate caller appeared (the draw lock's pan), which is a
       test failing on correct code — and it would equally have passed
       if someone had moved a cancel from the wheel to somewhere
       useless. Each handler is checked for its own call. */
    const body = (name, end) =>
      s3.slice(s3.indexOf('function ' + name + '('), s3.indexOf(end));
    assert.ok(/cancelCameraTween\(\)/.test(body('onPointerDown', 'function panBy(')),
        'a pointer that grabs the camera must cancel the tween');
    assert.ok(/cancelCameraTween\(\)/.test(body('onPointerMove', 'function movePathEnd(')),
        'an orbit drag must cancel the tween');
    assert.ok(/cancelCameraTween\(\)/.test(body('onWheel', 'const el =')),
        'a zoom must cancel the tween');
  });

  it('the preset computes its destination without moving the camera', () => {
    /* frameBoard() fits the distance to the viewport AND depends on
       the angle, so the target distance has to be measured at the
       preset's angle and then handed to the tween. */
    const fn = s3.slice(s3.indexOf('function setPreset'), s3.indexOf('/* ── Interaction'));
    assert.ok(/tweenCameraTo\(to, 550\)/.test(fn), fn);
    assert.ok(/cam\.target\.copy\(held\.target\)/.test(fn), 'must restore before gliding');
  });

  it('reset glides too', () => {
    const fn = s3.slice(s3.indexOf('resetCamera()'), s3.indexOf('resetCamera()') + 600);
    assert.ok(/tweenCameraTo\(/.test(fn), fn);
  });
});

describe('the camera cannot flip between views', () => {
  const fs2 = require('fs');
  const p2 = require('path');
  const s3 = fs2.readFileSync(p2.join(__dirname, '..', 'js', 'board3d.js'), 'utf8');

  it('interpolates ORIENTATION, not the orbit angles', () => {
    /* Rebuilding the frame from angles each step means passing
       through the overhead singularity, where up goes parallel to
       view and lookAt has no basis. Measured on a Side->Top move:
       up.view reached -1.00 at phi 0.139 and the next step rotated
       172 degrees. A slerp takes the shortest rotation between two
       well-defined frames and cannot pass through a degenerate one. */
    const fn = s3.slice(s3.indexOf('function stepCameraTween'), s3.indexOf('/** Any manual input'));
    assert.ok(/slerpQuaternions\(f\.quat, camTween\.toQuat, e\)/.test(fn), fn);
    assert.ok(/camera\.position\.lerpVectors\(f\.pos/.test(fn));
  });

  it('does NOT rebuild from angles mid-flight', () => {
    /* applyCamera() is exactly what reintroduces the flip. Comments
       stripped before asserting: the function explains WHY it must
       not call applyCamera, and a naive search finds that sentence. */
    const fn = s3.slice(s3.indexOf('function stepCameraTween'), s3.indexOf('if (t >= 1)'))
        .replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
    assert.ok(!/applyCamera\(\)/.test(fn), fn);
  });

  it('lands exactly on the destination and hands control back', () => {
    /* If the tween's final frame and the first applyCamera() after it
       disagreed, the camera would snap once at the end — the same bug
       in a different costume. */
    const fn = s3.slice(s3.indexOf('if (t >= 1)'), s3.indexOf('/** Any manual input'));
    assert.ok(/cam\.theta = to\.theta/.test(fn) && /applyCamera\(\)/.test(fn), fn);
  });

  it('derives the destination orientation with the SAME up rule', () => {
    const fn = s3.slice(s3.indexOf('function quaternionFor'), s3.indexOf('function tweenCameraTo'));
    assert.ok(/upFor\(phi, theta\)/.test(fn), fn);
  });

  it('the up rule is a hard switch again, not a blend', () => {
    /* The blend was worse and measurably so: widening a band around
       the singularity drags up TOWARD the view axis across the whole
       band rather than only at the pole. */
    const fn = s3.slice(s3.indexOf('function upFor'), s3.indexOf('function positionFor'));
    assert.ok(/phi < 0\.02/.test(fn), fn);
    assert.ok(!/0\.15 - /.test(fn), 'the blend band must be gone');
  });

  it('builds the destination with Matrix4, not an Object3D probe', () => {
    /* This test previously asserted the probe — the thing that WAS
       the bug. Object3D.lookAt points +Z at the target and
       Camera.lookAt points -Z, so a plain probe yields an orientation
       rotated by exactly 180 degrees.

       The behaviour is verified for real in board3d-camera.test.js,
       which runs the maths against three.js; this only guards the
       construct from coming back. */
    assert.ok(/orientMatrix\.lookAt\(/.test(s3), 'expected Matrix4.lookAt');
    assert.ok(!/new THREE\.Object3D\(\)/.test(s3),
        'an Object3D probe orients backwards for a camera');
  });
});

describe('decoration is dimmer than the controls', () => {
  const fs2 = require('fs');
  const p2 = require('path');
  const s3 = fs2.readFileSync(p2.join(__dirname, '..', 'js', 'board3d.js'), 'utf8');

  const opacityOf = (re) => {
    const m = re.exec(s3);
    assert.ok(m, 'not found: ' + re);
    return parseFloat(m[1]);
  };

  it('the trajectory curve is a quiet mark', () => {
    const curve = opacityOf(/LineBasicMaterial\(\{color: col, transparent: true, opacity: ([\d.]+)\}\)\);\n\s*objectRoot\.add\(entry\.curve\)/);
    assert.ok(curve <= 0.6, 'curve opacity ' + curve);
  });

  it('the ball ring is subtler still, and keeps a floor', () => {
    const base = opacityOf(/color: 0xffffff, transparent: true, opacity: ([\d.]+),/);
    assert.ok(base <= 0.3, 'ring base ' + base);
    // Still floored, so it cannot fade away entirely when high.
    assert.ok(/Math\.max\(0\.1\d?,/.test(s3), 'the ring must keep a visible floor');
  });

  it('but the HANDLES stay louder than what they sit on', () => {
    /* An ORDERING, not the literals. The previous version pinned the
       exact expression `active === 'bend' ? 1 : 0.25`, so it failed
       the moment the dots were deliberately dimmed — asserting the
       design that was being changed rather than the property worth
       keeping. What must hold is that a control the coach has to hit
       reads more strongly than the curve it sits on, and that the
       active handle beats the inactive one. */
    const num = (re, what) => {
      const m = s3.match(re);
      assert.ok(m, what + ' not found');
      return parseFloat(m[1]);
    };
    const on = num(/const BEND_ALPHA = ([\d.]+);/, 'BEND_ALPHA');
    const off = num(/const BEND_ALPHA_OFF = ([\d.]+);/, 'BEND_ALPHA_OFF');
    const curve = opacityOf(/LineBasicMaterial\(\{color: col, transparent: true, opacity: ([\d.]+)\}\)\);\n\s*objectRoot\.add\(entry\.curve\)/);

    assert.ok(on > curve, 'an active bend dot (' + on +
        ') must read stronger than its curve (' + curve + ')');
    assert.ok(on > off, 'active (' + on + ') must beat inactive (' + off + ')');
    assert.ok(off > 0, 'an inactive handle must still be visible');
    assert.ok(on <= 1 && off < 0.4, 'and neither may be louder than the objects');

    // Both bend dots go through the same pair, so they cannot drift.
    assert.ok(/flatDot\(HANDLE_R, col, active === 'bend' \? BEND_ALPHA : BEND_ALPHA_OFF\)/.test(s3),
        'the ball bend handle must use the shared constants');
    assert.ok(/const h = flatDot\(HANDLE_R, col, BEND_ALPHA\);/.test(s3),
        'player bend dots must use the shared constant too');
  });

  it('keeps the diamond brighter than the dots it pairs with', () => {
    /* Same SIZE so the two read as a pair, but not the same weight:
       the diamond appears once per ball while a bend dot is on every
       trajectory, and it is a lit solid whose dark edges wash out if
       it is made translucent. */
    assert.ok(/opacity: active === 'apex' \? 1 : 0\.25/.test(s3),
        'the apex diamond stays full strength when active');
    assert.ok(/OctahedronGeometry\(HANDLE_R\)/.test(s3),
        'and the same size as a bend dot');
  });
});

describe('the premium entitlement has a sanctioned writer', () => {
  const fs2 = require('fs');
  const p2 = require('path');
  const fns = fs2.readFileSync(p2.join(__dirname, '..', 'functions', 'index.js'), 'utf8');
  const a = fs2.readFileSync(p2.join(__dirname, '..', 'js', 'app.js'), 'utf8');
  const fn = fns.slice(fns.indexOf('exports.setClubFeatures'),
      fns.indexOf('// ── 7a-bis. setClubKits'));

  it('is superadmin only', () => {
    /* A lead who could write `features` could grant their own club the
       premium package from a console in seconds. */
    assert.ok(/!== SUPERUSER_EMAIL/.test(fn), fn.slice(0, 400));
    assert.ok(/permission-denied/.test(fn));
  });

  it('takes the club from the payload, but only for the superadmin', () => {
    // There is no other caller, so there is no claim to read it from.
    assert.ok(/String\(data\.clubId \|\| ""\)/.test(fn), fn);
  });

  it('allowlists the feature keys', () => {
    /* An unknown key would sit forever in a document every member of
       the club downloads on login, and nothing would ever read it. */
    assert.ok(/const KNOWN = \["board3d"\]/.test(fn), fn);
    assert.ok(/Funció desconeguda/.test(fn));
  });

  it('coerces to a real boolean', () => {
    // "false" is truthy; a string here would silently grant premium.
    assert.ok(/features\[key\] === true/.test(fn), fn);
  });

  it('merges rather than replacing', () => {
    /* Firestore merge deep-merges maps, so writing {board3d:false}
       turns the feature off without wiping a sibling flag added
       later. */
    assert.ok(/\{merge: true\}/.test(fn), fn);
  });

  it('logs who flipped it', () => {
    assert.ok(/logger\.info\("setClubFeatures"/.test(fn), fn);
  });

  it('the client goes through the callable, never a direct write', () => {
    const ui = a.slice(a.indexOf(".club-feature-3d')"),
        a.indexOf(".club-maxteams-input')"));
    assert.ok(/httpsCallable\('setClubFeatures'\)/.test(ui), ui);
    assert.ok(!/updateClub\(/.test(ui), 'features must not be written directly');
  });

  it('names the region explicitly, like every other callable', () => {
    const ui = a.slice(a.indexOf(".club-feature-3d')"),
        a.indexOf(".club-maxteams-input')"));
    assert.ok(/functions\('us-central1'\)/.test(ui), ui);
  });

  it('reverts the checkbox if the server refuses', () => {
    // It must not claim a state the server rejected.
    const ui = a.slice(a.indexOf(".club-feature-3d')"),
        a.indexOf(".club-maxteams-input')"));
    assert.ok(/box\.checked = !box\.checked/.test(ui), ui);
  });
});

/* ── Selection and delete ─────────────────────────────────────────
   The delete path is the one place where 3D touches something
   destructive, and both bugs it can have are structural rather than
   graphical: deleting the wrong object because the index was resolved
   differently than the drag resolves it, and deleting state directly
   instead of going through the 2D deleters (which also null the slot
   in every LATER frame — miss that and the two views disagree about
   who exists from the next frame onwards). Both are visible in source.
*/
describe('selection and delete in 3D', () => {
  /* Comments discuss the very identifiers being searched for, so
     every assertion below runs against a comment-stripped copy. */
  const bare = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  const appBare = appSrc.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

  it('only offers deletable objects for selection', () => {
    const m = bare.match(/const SELECTABLE = \[([^\]]*)\]/);
    assert.ok(m, 'SELECTABLE list not found');
    const kinds = m[1].match(/'[^']+'/g).map((s) => s.slice(1, -1)).sort();
    assert.deepStrictEqual(kinds,
        ['balls', 'cones', 'oppPositions', 'positions'],
        'a trajectory handle is part of another object, not a selection');
  });

  it('picking a handle clears the selection rather than selecting it', () => {
    /* setSelected filters by SELECTABLE, so a handle hit arrives and
       comes out null — the important thing is that the hit is not
       stored unfiltered. */
    assert.ok(/SELECTABLE\.indexOf\(hit\.kind\) !== -1/.test(bare),
        'setSelected must filter the hit against SELECTABLE');
  });

  it('picking empty turf deselects', () => {
    const orbit = bare.match(/mode = 'orbit';[\s\S]{0,120}/);
    assert.ok(orbit && /setSelected\(null\)/.test(orbit[0]),
        'starting an orbit (nothing under the ray) must clear the selection');
  });

  it('highlights with a ring, not by recolouring the object', () => {
    /* A recoloured player stops showing their kit, which is the one
       thing a coach reads them by. */
    assert.ok(/selRing[\s\S]{0,200}RingGeometry/.test(bare),
        'the highlight must be a separate ring mesh');
    assert.ok(/selRing\.position\.set\(/.test(bare),
        'the ring must be positioned on the selected object');
  });

  it('keeps the ring on the object through drags and rebuilds', () => {
    /* Both are cases where the meshes move or are replaced wholesale;
       a ring left behind points at nothing. */
    const drag = bare.match(/movePathEnd\(dragging\.kind[\s\S]{0,120}/);
    assert.ok(drag && /drawSelection\(\)/.test(drag[0]),
        'a drag must move the ring with the object');
    const rebuild = bare.match(/addPathsFor\(s, 'balls'\);[\s\S]{0,120}/);
    assert.ok(rebuild && /drawSelection\(\)/.test(rebuild[0]),
        'a rebuild replaces the meshes — the ring must be re-placed');
  });

  it('exposes the selection instead of handling the key itself', () => {
    /* board3d owns no 2D elements and no frame array, so it cannot
       delete correctly; app.js can. */
    assert.ok(/getSelected\(\)\s*\{/.test(bare), 'getSelected must be exported');
    assert.ok(/clearSelection\(\)\s*\{/.test(bare), 'clearSelection must be exported');
    assert.ok(!/'keydown'/.test(bare),
        'board3d must not bind keys — app.js owns the delete');
  });

  it('returns a copy of the selection, not the live object', () => {
    /* Handing out the internal object lets a caller mutate the index
       the ring is drawn from. */
    assert.ok(/getSelected\(\)\s*\{ return selected \? \{kind: selected\.kind, index: selected\.index\}/
        .test(bare), 'getSelected must return a fresh object');
  });

  it('deletes through the 2D deleters, never through state', () => {
    const h = appBare.match(/wrap3d\.addEventListener\('keydown'[\s\S]*?clearSelection\(\);/);
    assert.ok(h, 'the delete handler was not found in app.js');
    const body = h[0];
    assert.ok(/deleteCircle\(el\)/.test(body),
        'players must go through deleteCircle (it nulls later frames)');
    assert.ok(/deleteBall\(el\)/.test(body),
        'balls must go through deleteBall (it nulls later frames)');
    assert.ok(!/setPoints|localStorage\.setItem/.test(body),
        'the handler must not write the scratch keys directly');
  });

  it('resolves the element the same way the drag does', () => {
    /* applyMove addresses cones positionally (spawnCone sets no
       data-idx) and everything else by data-idx. A delete that used
       the other rule would remove a different object than the one
       under the ring.

       ONE RESOLVER now, shared with copy — it was written out inside
       the delete handler and had to be written again for Ctrl+C, which
       is two chances to disagree about what a selection means. */
    const r = appBare.match(/const sel2dEl = \(sel\) => \{[\s\S]*?\n      \};/);
    assert.ok(r, 'the shared selection resolver was not found');
    const h = r[0];
    assert.ok(/querySelectorAll\('\.tb-cone'\)\[sel\.index\]/.test(h),
        'cones are addressed positionally, as in applyMove');
    assert.ok(/data-idx="' \+ sel\.index \+ '"/.test(h),
        'players and balls are addressed by data-idx, as in applyMove');
    assert.ok(/\.tb-circle:not\(\.tb-circle-opp\)/.test(h),
        'own players must exclude opponents — .tb-circle matches both');
    /* And both callers go through it rather than round it. Named
       rather than counted: `const sel2dEl = (sel) =>` is not a call,
       so a count was off by one and said 3 where 2 was right. */
    assert.ok(/sel2dEl\(_tb3d\.getSelected\(\)\)/.test(appBare),
        'copy must resolve through it');
    assert.ok(/const el = sel2dEl\(sel\);/.test(appBare),
        'and so must delete');
  });

  it('is undoable and clears the stale selection', () => {
    const h = appBare.match(/if \(e\.key !== 'Delete'[\s\S]*?clearSelection\(\);/)[0];
    const undos = h.match(/pushUndo\(\)/g) || [];
    /* ONE, not three. It used to be pushed inside each branch; with a
       shared resolver the element is known before the branch, so the
       undo step is pushed once above it — and "every branch pushes"
       becomes "the branch cannot be reached without one". */
    assert.strictEqual(undos.length, 1, 'exactly one undo step, above the branch');
    assert.ok(/if \(el\) \{\s*\n\s*pushUndo\(\);/.test(h),
        'and it must be guarded on the element actually being found — ' +
        'an undo step for a delete that did not happen is a dead press ' +
        'of Ctrl+Z later');
    assert.ok(/_tb3d\.clearSelection\(\)/.test(h),
        'the deleted object must not stay selected');
  });

  it('a shirt number can be set without the flat board', () => {
    /* In 2D you double-click the disc, which focuses the input inside
       it. THAT DOES NOT EXIST IN 3D: the flat board is hidden and what
       the coach clicks is a mesh, so there was no way to number a
       player at all without switching views.

       The right-click menu already works in both — board3d forwards
       the hit to the 2D element, which dispatches its own contextmenu
       — so one row there serves both, rather than a second numbering
       path bolted onto board3d. */
    /* THE SAME GESTURE AS 2D — a double-click, not a right-click. It
       shipped on the context menu first, which worked and was the
       wrong verb: the flat board opens a number by double-clicking the
       disc, and a coach who learns one view should not have to learn a
       second way round in the other. */
    assert.ok(/el\.addEventListener\('dblclick', onDblClick_\)/.test(bare),
        'board3d must forward a double-click on an object');
    /* The HANDLER, not the forwarder. board3d's hook is passed through
       a one-line relay in tbMount3D that carries the same name, and a
       lazy match found that instead — three lines of nothing, against
       which every assertion below was false. */
    const h = appBare.match(
        /onDblClick: \(kind, index, x, y\) => \{\s*\n\s*if \(kind !== 'positions'[\s\S]*?\n        \},/);
    assert.ok(h, 'app.js must handle the forwarded double-click');
    const body = h[0];
    assert.ok(/kind !== 'positions' && kind !== 'oppPositions'/.test(body),
        'players only — a ball has no number, and an empty popup on one ' +
        'is worse than nothing happening');
    /* Written through the SAME input the 2D double-click edits, and
       then through the editor's own save path — a second writer for
       shirt numbers is how the two views come to disagree. */
    assert.ok(/sel2dEl\(\{kind: kind, index: index\}\)/.test(body),
        'it must resolve to the 2D element like every other 3D action');
    assert.ok(/inp\.value = v;/.test(body),
        'and write the 2D input, not the storage key');
    assert.ok(/syncNumbersAcrossFrames\(\)/.test(body),
        'and carry the number forward, as typing into the disc does');
    /* And the field has to be usable the moment it opens: the coach
       double-clicked a player in order to type. */
    assert.ok(/box\.focus\(\); box\.select\(\)/.test(appBare),
        'the field must take focus when the popup opens');
    /* Not on the right-click menu any more — two ways in is two things
       to keep working, and the owner picked the double-click. */
    /* Scoped to the MENU BUILDER — `items.push` — because the
       double-click handler builds a one-row menu of its own and uses
       the same row type, so a bare search for the type matched the
       very code this test is here to require. */
    assert.ok(!/items\.push\(\{\s*\n\s*type: 'number'/.test(appBare),
        'the number must not also hang off the right-click menu — two ' +
        'ways in is two things to keep working, and the owner picked ' +
        'the double-click');
  });

  it('one keypress pastes once', () => {
    /* The 3D wrapper is INSIDE the document, so its Ctrl+V and the
       document-level one both fired on the same keypress and the
       clipboard landed twice. The wrapper calls preventDefault() when
       it acts, which is exactly the signal for "this key is spoken
       for" — and reading it beats a flag, which would be a second
       thing to keep true. */
    const doc = appBare.match(
        /document\.addEventListener\('keydown', e => \{\s*\n\s*if \(!\(e\.ctrlKey[\s\S]*?\n    \}\);/);
    assert.ok(doc, 'the document-level clipboard handler was not found');
    assert.ok(/if \(e\.defaultPrevented\) return;/.test(doc[0]),
        'it must stand down for a key the wrapper already used');
    /* And the wrapper must actually raise that signal, or the guard
       above is guarding nothing. */
    const w = appBare.match(
        /wrap3d\.addEventListener\('keydown', \(e\) => \{\s*\n\s*if \(!_tb3d \|\| !\(e\.ctrlKey[\s\S]*?\n      \}\);/)[0];
    assert.strictEqual((w.match(/e\.preventDefault\(\)/g) || []).length, 2,
        'both copy and paste must mark the key as handled');
  });

  it('the double-click stands down where picking does', () => {
    const f = bare.match(/function onDblClick_\(ev\) \{[\s\S]*?\n  \}/)[0];
    assert.ok(/readOnly \|\| drawLock \|\| !onDblClick/.test(f),
        'a read-only board has nothing to edit, and under the draw lock ' +
        'the gesture already means "draw"');
    assert.ok(/const hit = pick\(ev\)/.test(f),
        'it must use the same picker every other gesture uses');
  });

  it('copy and paste reach the 3D view too', () => {
    /* The document-level handler needs `selected` — the 2D
       multi-select Set — or one of the single-selection globals, and
       3D fills neither: it keeps its own selection and the flat board
       is hidden. So the keys did nothing there while working in 2D,
       which reads as broken rather than absent. */
    const h = appBare.match(
        /wrap3d\.addEventListener\('keydown', \(e\) => \{\s*\n\s*if \(!_tb3d \|\| !\(e\.ctrlKey[\s\S]*?\n      \}\);/);
    assert.ok(h, 'the 3D copy/paste handler was not found');
    const body = h[0];
    assert.ok(/sel2dEl\(_tb3d\.getSelected\(\)\)/.test(body),
        'copy must resolve the 3D selection to its 2D element');
    assert.ok(/copyElementToClipboard\(el\)/.test(body) &&
              /pasteClipboardAtOffset\(PASTE_OFFSET/.test(body),
        'and reuse the 2D clipboard, so a copy in one view pastes in the other');
    assert.ok(/isDrawLocked\(\)\) return;/.test(body),
        'nothing is selectable under the draw lock, so the keys must stand down');
    assert.ok(/INPUT\|TEXTAREA\|SELECT/.test(body),
        'and a Ctrl+C typed into a field must stay in the field');
    assert.ok(/e\.shiftKey\) return;/.test(body),
        'Ctrl+Shift+C is the browser inspector, not a board copy');
  });

  it('takes focus by hand, because preventDefault suppresses it', () => {
    /* onPointerDown calls preventDefault() to kill the browser drag
       gesture; that also cancels the focus a click would give, and
       an unfocused element receives no keys at all. */
    assert.ok(/wrap3d\.addEventListener\('pointerdown', \(\) => wrap3d\.focus\(\)\)/
        .test(appBare), 'the wrapper must focus itself on pointerdown');
    assert.ok(/wrap3d\.tabIndex = 0/.test(appBare),
        'and be focusable in the first place');
  });

  it('binds the key on the board, not the document', () => {
    /* A document-level Delete would fire while typing in a label. */
    const h = appBare.match(/wrap3d\.addEventListener\('keydown'[\s\S]*?clearSelection\(\);/)[0];
    assert.ok(!/document\.addEventListener\('keydown'/.test(appBare.slice(
        appBare.indexOf(h) - 400, appBare.indexOf(h))),
        'the delete must be scoped to the 3D wrapper');
  });

  it('tells the coach the key exists', () => {
    const hint = appBare.match(/'tactics\.orbit_hint':[\s\S]*?\n.*?\},/)[0];
    assert.ok(/Supr/.test(hint) && /Del to delete/.test(hint),
        'the orbit hint must mention delete in every language');
  });
});

/* ── The draw lock ────────────────────────────────────────────────
   Arrows, zones, pen strokes and labels are flat things, so a draw
   tool locks the camera overhead and lays the REAL 2D board over the
   turf. The value of that design is that there is no second
   implementation of drawing — so the assertions below are mostly
   about keeping it that way, plus the handful of details that make
   the overlay land in the right place.
*/
describe('the draw lock', () => {
  const bare = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  const appBare = appSrc.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  const cssSrc = readCss();

  it('reuses the 2D drawing code rather than raycasting onto the turf', () => {
    /* The point of the whole design. If board3d ever grows its own
       arrow/pen/zone input, there are two implementations of the same
       drawing and they will disagree. */
    assert.ok(!/arrowMode|penMode|rectMode|textMode/.test(bare),
        'board3d must not implement drawing input');
    assert.ok(/pitchScreenRect/.test(bare),
        'it exposes where the pitch is, and app.js overlays the 2D board');
  });

  it('locks the camera overhead, and only then', () => {
    const fn = bare.slice(bare.indexOf('function setDrawLock('),
        bare.indexOf('function pitchScreenRect(', bare.indexOf('function setDrawLock(')));
    assert.ok(/setPreset\('top'\)/.test(fn), 'the lock must go top-down');
    assert.ok(/followBall = false/.test(fn),
        'a camera that follows the ball is not locked');
    /* The WHOLE object layer, not just the drawings. The overlay
       brings its own players, ball and cones, and being a DOM layer
       above the canvas its strokes paint over anything of ours
       underneath — which is what made a pen line crossing a player
       look like it floated. */
    assert.ok(/objectRoot\.visible = !on/.test(fn),
        'players, ball, cones, drawings and handles must all hide behind the overlay');
    assert.ok(/ballShadow\.visible = false/.test(fn),
        'the ball marker lives on the scene, not in objectRoot, and needs its own line');
    assert.ok(/else restBallMarker\(\)/.test(fn),
        'and must come back when the tool is put down');
  });

  it('refuses every camera move except pan and zoom', () => {
    /* The buttons are disabled in the UI too, but playback and
       follow-ball can also aim the camera. */
    assert.ok(/setPreset\(name\) \{ if \(!drawLock\) setPreset\(name\); \}/.test(bare),
        'presets must be refused while locked');
    const follow = bare.slice(bare.indexOf('setFollowBall(on) {'),
        bare.indexOf('isFollowingBall()', bare.indexOf('setFollowBall(on) {')));
    assert.ok(/if \(drawLock\) return;/.test(follow), 'follow-ball must be refused');
    const reset = bare.slice(bare.indexOf('resetCamera() {'), bare.indexOf('resize,'));
    assert.ok(/if \(drawLock\) return;/.test(reset), 'reset must be refused');
  });

  it('turns the left button into a pan, not an orbit or a drag', () => {
    const fn = bare.slice(bare.indexOf('function onPointerDown('),
        bare.indexOf('function panBy(', bare.indexOf('function onPointerDown(')));
    const i = fn.indexOf('if (drawLock)');
    assert.ok(i !== -1, 'the lock branch is missing');
    assert.ok(fn.indexOf("mode = 'orbit'") > i && fn.indexOf("mode = 'drag'") > i,
        'the lock must be decided BEFORE picking an object to drag');
    assert.ok(/if \(drawLock\) \{\s*mode = 'pan';/.test(fn),
        'a left drag on the sky still pans');
  });

  it('refuses to report a rect unless the camera really is overhead', () => {
    /* Returning a best guess would position the surface against a
       tilted camera — wrong everywhere, and the coach only finds out
       after drawing on it. */
    const fn = bare.slice(bare.indexOf('function pitchScreenRect('),
        bare.indexOf('function frameBoard(', bare.indexOf('function pitchScreenRect(')));
    /* EXACTLY overhead. The old bound was 0.05 — precisely the range
       in which this function's own affine assumption is wrong, so it
       accepted the camera that made the overlay drift on zoom. The
       remaining tolerance is float noise in the tween's last frame. */
    assert.ok(/if \(Math\.abs\(cam\.phi\) > 1e-6\) return null;/.test(fn),
        'anything but exactly overhead must yield null');
    const projections = fn.match(/\.project\(camera\)/g) || [];
    assert.strictEqual(projections.length, 1, 'one projection helper');
    assert.ok(/toPx\(-e\.ax \/ 2, -e\.ay \/ 2\)[\s\S]*?toPx\(e\.ax \/ 2, e\.ay \/ 2\)/.test(fn),
        'BOTH corners must be projected — perspective scale varies with depth');
  });

  it('hides the surface while the camera is still on its way over', () => {
    const fn = appBare.slice(appBare.indexOf('function tbDrawSurface('),
        appBare.indexOf('function tb3dState(', appBare.indexOf('function tbDrawSurface(')));
    assert.ok(/visibility = r \? '' : 'hidden'/.test(fn),
        'a null rect must hide the surface, not leave it where it was');
  });

  it('follows the camera every frame instead of being pushed once', () => {
    /* The camera moves under the tween, under a pan and under a
       resize; one rAF loop covers all three. */
    const fn = appBare.slice(appBare.indexOf('function tbDrawSurface('),
        appBare.indexOf('function tb3dState(', appBare.indexOf('function tbDrawSurface(')));
    assert.ok(/requestAnimationFrame\(follow\)/.test(fn), 'the follow loop is missing');
    assert.ok(/if \(!_tb3d \|\| !_tb3d\.isDrawLocked\(\)\) \{ _tbDrawRaf = 0; return; \}/.test(fn),
        'the loop must stop when the lock goes');
    assert.ok(/cancelAnimationFrame\(_tbDrawRaf\)/.test(fn),
        'and be cancelled rather than left to race a second one');
  });

  it('tears the surface down with the view', () => {
    const fn = appBare.slice(appBare.indexOf('function tbDestroy3D('),
        appBare.indexOf('var _tbDrawRaf', appBare.indexOf('function tbDestroy3D(')));
    assert.ok(/tbDrawSurface\(false\)/.test(fn),
        'destroying the 3D view must stop the follow loop');
  });

  it('arms on every tool that needs a click on the board', () => {
    /* The ball tool is NOT one: it spawns at the centre spot. */
    ['arrow', 'rect', 'text', 'pen', 'cone'].forEach((k) => {
      const i = appBare.indexOf(k + 'Mode = true;');
      assert.ok(i !== -1, k + 'Mode not found');
      const before = appBare.slice(Math.max(0, i - 120), i);
      assert.ok(/tbSetDrawMode\(true\)/.test(before),
          k + ' must arm the draw lock');
    });
  });

  it('disarms from the one place every tool already calls', () => {
    const fn = appBare.slice(appBare.indexOf('function deactivateDrawTools('),
        appBare.indexOf('function tbSetDrawMode(', appBare.indexOf('function deactivateDrawTools(')));
    assert.ok(/tbSetDrawMode\(false\)/.test(fn),
        'deactivateDrawTools is the single off-switch');
    ['arrow', 'rect', 'text', 'pen', 'cone'].forEach((k) => {
      const i = appBare.indexOf(k + 'Mode = true;');
      assert.ok(/deactivateDrawTools\(\)/.test(appBare.slice(Math.max(0, i - 260), i)),
          k + ' must go through deactivateDrawTools first');
    });
  });

  it('is a no-op in 2D, where the board is already flat', () => {
    const fn = appBare.slice(appBare.indexOf('function tbSetDrawMode('),
        appBare.indexOf('if (arrowToolBtn)', appBare.indexOf('function tbSetDrawMode(')));
    /* tbIs3D(), not `is3d`. The const belongs to renderTactics and
       this function is in bindTactics — see the execution test below,
       which is what actually proves the name resolves. */
    assert.ok(/if \(!tbIs3D\(\)\) return;/.test(fn),
        'tbSetDrawMode must gate on tbIs3D(), which resolves in bindTactics');
  });

  it('forces the 2D board horizontal in 3D, so the overlay aligns', () => {
    /* The 3D pitch lies along X. A board left set to vertical would
       put every stroke a quarter turn from where the hand drew it. */
    assert.ok(/function tbVertical\(\) \{\s*return !tbIs3D\(\) &&/.test(appBare),
        'tbVertical must be false in 3D');
    const readers = appBare.match(/localStorage\.getItem\('fa_tactic_orient'\)/g) || [];
    assert.strictEqual(readers.length, 1,
        'orientation must be read in ONE place (tbVertical); found ' + readers.length);
  });


  it('drops the aspect-ratio padding the outer box normally uses', () => {
    /* The box holds its shape with padding-top; given an explicit
       rect, that padding would push everything down inside it. */
    const rule = cssSrc.slice(cssSrc.indexOf('.tb-field.tb-draw-surface {'),
        cssSrc.indexOf('.tb-field.tb-draw-surface > .tb-field-inner', cssSrc.indexOf('.tb-field.tb-draw-surface {')));
    assert.ok(/padding:0 !important/.test(rule), 'padding must be cleared');
    assert.ok(/position:absolute/.test(rule), 'and the box positioned explicitly');
    assert.ok(/max-width:none !important/.test(rule),
        'the 820px cap would otherwise crop the surface on a wide canvas');
  });

  it('shows a pen cursor, so the lock reads as a mode', () => {
    /* Without it a camera that has stopped orbiting looks broken. */
    const rule = cssSrc.slice(cssSrc.indexOf('.tb-field.tb-draw-surface,'));
    assert.ok(/cursor:url\("data:image\/svg\+xml/.test(rule), 'pen cursor missing');
    assert.ok(/, crosshair;/.test(rule.slice(0, rule.indexOf('}'))),
        'a cursor with no keyword fallback is ignored entirely when the URL fails');
  });

  it('keeps the delete key off the drawing surface', () => {
    /* The surface is a CHILD of the 3D wrapper, so a Backspace typed
       into a label bubbles into the delete handler. */
    const h = appBare.match(/wrap3d\.addEventListener\('keydown'[\s\S]*?clearSelection\(\);/)[0];
    assert.ok(/if \(_tb3d\.isDrawLocked\(\)\) return;/.test(h),
        'delete must be inert while drawing');
    assert.ok(/isContentEditable/.test(h) && /INPUT\|TEXTAREA\|SELECT/.test(h),
        'and must never eat a keystroke meant for a field');
  });

  it('says the view is locked rather than letting it look broken', () => {
    assert.ok(/'tactics\.draw_hint'/.test(appBare), 'the hint key is missing');
    const fn = appBare.slice(appBare.indexOf('function tbSetDrawMode('),
        appBare.indexOf('if (arrowToolBtn)', appBare.indexOf('function tbSetDrawMode(')));
    assert.ok(/tactics\.draw_hint.*:.*tactics\.orbit_hint/.test(fn),
        'the hint must swap both ways');
    assert.ok(/tb-cams-locked/.test(fn) && /tb-cams-locked/.test(cssSrc),
        'the camera buttons must be visibly disabled');
  });
});

/* ── Free variables across the render/bind split ──────────────────
   renderTactics builds the markup; bindTactics wires it up. They are
   SEPARATE functions, so a const declared in one is not in scope in
   the other — and JavaScript only says so when the line actually
   runs.

   tbSetDrawMode read `is3d`, a renderTactics const, from inside
   bindTactics. Every call threw a ReferenceError, and because
   deactivateDrawTools() runs from the play button and from every tool
   button, the throw aborted bindTactics: the drawing tools went dead
   AND playback stopped mid-start. One free variable, two symptoms
   that look unrelated.

   The test that was supposed to cover this asserted the SOURCE TEXT
   `if (!is3d) return;` was present. It passed on the broken code,
   because the text was exactly right — the identifier just did not
   resolve. So these tests RUN the function instead. Inside
   `new Function`, any name that is neither a parameter nor a real
   global throws on read, which is precisely the bug class.
*/
describe('bindTactics does not reach into renderTactics', () => {
  const appSrc2 = fs.readFileSync(path.join(ROOT, 'js', 'app.js'), 'utf8');

  const bindBody = (() => {
    const i = appSrc2.indexOf('  function bindTactics(');
    assert.ok(i !== -1, 'bindTactics not found');
    /* Bounded by the next sibling declaration at the same indent,
       not by a character count. */
    const j = appSrc2.indexOf('\n  function ', i + 10);
    return appSrc2.slice(i, j === -1 ? appSrc2.length : j);
  })();

  it('never names is3d, which belongs to renderTactics', () => {
    /* The general form of the bug, cheap enough to state directly.
       tbIs3D() is the global helper and reads the same thing. */
    /* Comments discuss the identifier — including the one recording
       this very bug — so strip them first. */
    const code = bindBody.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    const hits = code.match(/\bis3d\b/g) || [];
    assert.deepStrictEqual(hits, [],
        'bindTactics must call tbIs3D(), not read renderTactics\' is3d const');
  });

  it('tbSetDrawMode runs without a ReferenceError', () => {
    const i = appSrc2.indexOf('    function tbSetDrawMode(on) {');
    assert.ok(i !== -1, 'tbSetDrawMode not found');
    const j = appSrc2.indexOf('\n    }', i) + '\n    }'.length;
    const body = appSrc2.slice(i, j);

    const calls = [];
    const stubEl = {classList: {toggle: (c, on) => calls.push(['class', c, on])},
                    textContent: ''};
    const make = (is3d) => new Function('tbIs3D', 'tbDrawSurface', 'document', 't',
        body + '\nreturn tbSetDrawMode;')(
      () => is3d,
      (on) => calls.push(['surface', on]),
      {getElementById: () => stubEl, querySelector: () => stubEl},
      (k) => k);

    // 2D: a no-op, and specifically NOT a throw.
    calls.length = 0;
    make(false)(true);
    assert.deepStrictEqual(calls, [], 'must do nothing in 2D');

    // 3D: drives the surface, the buttons and the hint.
    calls.length = 0;
    make(true)(true);
    assert.ok(calls.some((c) => c[0] === 'surface' && c[1] === true),
        'must arm the drawing surface');
    assert.ok(calls.some((c) => c[0] === 'class' && c[1] === 'tb-cams-locked' && c[2] === true),
        'must disable the camera buttons');
    assert.strictEqual(stubEl.textContent, 'tactics.draw_hint');

    calls.length = 0;
    make(true)(false);
    assert.ok(calls.some((c) => c[0] === 'surface' && c[1] === false),
        'must release the surface');
    assert.strictEqual(stubEl.textContent, 'tactics.orbit_hint');
  });

  it('tbDrawSurface only reaches for real globals', () => {
    /* It lives at module level, so its dependencies are different —
       but the same execution check applies. */
    const i = appSrc2.indexOf('  function tbDrawSurface(on) {');
    assert.ok(i !== -1, 'tbDrawSurface not found');
    const j = appSrc2.indexOf('\n  }', i) + '\n  }'.length;
    const body = appSrc2.slice(i, j);

    const seen = [];
    const field = {classList: {add: () => seen.push('add'), remove: () => seen.push('remove')},
                   style: {setProperty(k, v) { this[k] = v; }},
                   hidden: false, parentNode: null};
    const wrap = {appendChild: () => seen.push('reparent')};
    const view = {
      setDrawLock: (on) => seen.push('lock:' + on),
      isDrawLocked: () => true,
      pitchScreenRect: () => ({left: 1, top: 2, width: 3, height: 4})
    };
    /* BS, BG and the board readers are real globals in the app, so
       they are parameters here. The list grows as the function grows,
       and that is the point: a name it reaches for which is NOT here
       and not a real global is the bug this test exists to catch. */
    const fn = new Function('document', '_tb3d', '_tbDrawRaf',
        'requestAnimationFrame', 'cancelAnimationFrame',
        'BS', 'BG', 'tbPitch', 'tbBoardType',
        body + '\nreturn tbDrawSurface;')(
      {getElementById: (id) => (id === 'tb-field' ? field : wrap)},
      view, 0, () => 1, () => {},
      {round2: (n) => Math.round(n * 100) / 100},
      require('../js/board-geom.js'),
      () => null, () => 'full');

    fn(true);
    assert.ok(seen.indexOf('lock:true') !== -1, 'must lock the camera');
    assert.ok(seen.indexOf('add') !== -1, 'must mark the field as the draw surface');
    assert.strictEqual(field.style.left, '1px', 'must position from the rect');

    fn(false);
    assert.ok(seen.indexOf('lock:false') !== -1, 'must release the lock');
    assert.strictEqual(field.hidden, true, 'and hide the field again');
  });
});

/* ── Putting the tool down gives the view back ────────────────────
   Picking a draw tool flies the camera overhead. Releasing it used to
   leave the camera there — so a coach who set up a broadcast angle,
   drew one arrow and put the pen down got a flat board back, with
   nothing to say why. It reads as the board having snapped to the
   wrong orientation, which is exactly how it was reported.
*/
describe('the draw lock gives the camera back', () => {
  const bare = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  const appBare = appSrc.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  const fn = bare.slice(bare.indexOf('function setDrawLock('),
      bare.indexOf('function pitchScreenRect(', bare.indexOf('function setDrawLock(')));

  it('remembers where the camera was before it locks', () => {
    assert.ok(/preLockCam = \{theta: cam\.theta, phi: cam\.phi, dist: cam\.dist,/.test(fn),
        'the angle must be captured, not just the distance');
    assert.ok(/target: cam\.target\.clone\(\)/.test(fn),
        'and the pan target CLONED — the live vector keeps moving');
    assert.ok(fn.indexOf('preLockCam =') < fn.indexOf("setPreset('top')"),
        'it must be captured BEFORE the preset overwrites it');
  });

  it('eases back rather than snapping', () => {
    assert.ok(/tweenCameraTo\(to, 550\)/.test(fn),
        'the return must use the same easing as the trip out');
  });

  it('leaves a coach who was already overhead where they are', () => {
    assert.ok(/Math\.abs\(preLockCam\.phi - cam\.phi\) > 0\.02/.test(fn),
        'an unchanged view must not be nudged');
  });

  it('clears the memory so a later release cannot resurrect it', () => {
    /* Restoring a camera position from two tools ago would be worse
       than not restoring at all. */
    const i = fn.indexOf('preLockCam = null');
    assert.ok(i !== -1, 'preLockCam must be cleared on release');
    assert.ok(i < fn.indexOf('tweenCameraTo'),
        'and cleared before the tween, so an early return cannot skip it');
  });

  it('puts the 2D board back where the render left it', () => {
    /* The overlay reparents #tb-field into the 3D wrapper. Left
       there, the next render replaces the wrapper and takes the board
       with it. */
    const surf = appBare.slice(appBare.indexOf('function tbDrawSurface('),
        appBare.indexOf('function tb3dState('));
    assert.ok(/_tbFieldHome = field\.parentNode/.test(surf),
        'the original parent must be remembered');
    assert.ok(/_tbFieldAfter = field\.nextSibling/.test(surf),
        'and the sibling it sat before, or it comes back in the wrong order');
    assert.ok(/_tbFieldHome\.insertBefore\(field, _tbFieldAfter \|\| null\)/.test(surf),
        'and it must actually go back');
  });

  it('clears the visibility the follow loop may have set', () => {
    /* `hidden` does not override an inline visibility:hidden, so the
       2D board would come back invisible. */
    const surf = appBare.slice(appBare.indexOf('function tbDrawSurface('),
        appBare.indexOf('function tb3dState('));
    const off = surf.slice(surf.indexOf('if (!on) {'), surf.indexOf('_tb3d.setDrawLock(true)'));
    assert.ok(/field\.style\.visibility = ''/.test(off),
        'releasing must clear visibility, not only the geometry');
  });
});

/* ── The overlay hides what the 3D scene already draws ────────────
 *
 * This started as an allow-list of things to hide, and the list named
 * `.tb-markings` — an element that does not exist. The pitch markings
 * are a dozen individual sibling divs, so the rule matched nothing
 * and the 2D lines were painted straight over the 3D ones. It took a
 * user report to find, because the test asserted the STRING
 * '.tb-markings' appeared in the stylesheet before a `display:none`,
 * which it did.
 *
 * The rule is inverted now — hide every child, re-show the two
 * drawing layers — and these tests check the two halves against what
 * the app actually renders, not against a list written from memory.
 */
describe('the drawing overlay hides the 3D scene\'s own marks', () => {
  const cssSrc = readCss();
  const appSrc2 = fs.readFileSync(path.join(ROOT, 'js', 'app.js'), 'utf8');

  /** Every class tbMarkingsHtml can emit, read from the function. */
  const markingClasses = (() => {
    const i = appSrc2.indexOf('function tbMarkingsHtml');
    assert.ok(i !== -1, 'tbMarkingsHtml not found');
    const body = appSrc2.slice(i, appSrc2.indexOf('\n  }', i));
    const out = new Set();
    (body.match(/class="(tb-[a-z-]+)"/g) || []).forEach((m) => out.add(m.slice(7, -1)));
    (body.match(/\((?:'|")(tb-[a-z-]+)(?:'|")/g) || []).forEach((m) => out.add(m.slice(2, -1)));
    return [...out];
  })();

  /** The classes the overlay rule brings back. */
  /* Returns [] rather than throwing when the rule is gone. An assert
     in a describe body runs at COLLECTION time, so it aborts the whole
     suite instead of failing one test — which is how the mutation
     check reported this, and it hides everything else that ran. */
  const shown = (() => {
    const i = cssSrc.indexOf('.tb-field.tb-draw-surface > .tb-field-inner > .tb-');
    if (i === -1) return [];
    const rule = cssSrc.slice(i, cssSrc.indexOf('}', i));
    /* The LAST `> .x` of each selector — the subject. Matching every
       `> .x` in the rule also picked up `> .tb-field-inner`, which is
       the container, not something being re-shown. */
    return rule.split(',').map((sel) => {
      const parts = sel.trim().split('>');
      return parts[parts.length - 1].trim().replace(/\s*\{[\s\S]*$/, '').replace(/^\./, '');
    }).filter(Boolean);
  })();

  it('finds the markings the app really renders', () => {
    // Guards the test: an empty list would make everything below vacuous.
    assert.ok(markingClasses.length >= 8,
        'expected the full set of markings, got ' + markingClasses.join(', '));
    assert.ok(markingClasses.indexOf('tb-halfway') !== -1 &&
              markingClasses.indexOf('tb-center-circle') !== -1,
        'the halfway line and centre circle must be among them');
    assert.ok(markingClasses.indexOf('tb-markings') === -1,
        'there is no .tb-markings element — that assumption was the bug');
  });

  it('hides every child by default, rather than listing what to hide', () => {
    /* The universal selector is the point: a marking added next year
       is hidden without anyone remembering to add it. */
    assert.ok(/\.tb-field\.tb-draw-surface > \.tb-field-inner > \* \{ display:none !important; \}/
        .test(cssSrc), 'the blanket hide rule is missing');
  });

  it('brings back the drawing layers AND the objects', () => {
    /* The objects are here on purpose, not by oversight. Without
       them a pen stroke crossing a player had nothing to disappear
       behind — the overlay is a DOM layer above the canvas, so it
       paints over the 3D players whatever the depth buffer says — and
       the line read as floating above the pitch. */
    assert.ok(shown.length, 'the re-show rule is missing entirely');
    assert.deepStrictEqual(shown.sort(),
        ['tb-arrows-svg', 'tb-ball', 'tb-circle', 'tb-cone', 'tb-text-label'],
        'the drawing layers plus the objects the coach draws around');
  });

  it('pairs the re-show with board3d hiding its own object layer', () => {
    /* Two sets of players otherwise — one flat, one lit, a frame
       apart. The pairing is the invariant: whichever view owns the
       objects, exactly one of them draws them. */
    const b3 = fs.readFileSync(path.join(ROOT, 'js', 'board3d.js'), 'utf8');
    assert.ok(/objectRoot\.visible = !on/.test(b3),
        'board3d must hide its objects while the overlay shows the 2D ones');
  });

  it('never re-shows a pitch marking', () => {
    /* The regression, stated against the real marking list rather
       than a remembered one. */
    markingClasses.forEach((c) => {
      assert.ok(shown.indexOf(c) === -1,
          c + ' is a pitch marking and the 3D scene already draws it');
    });
  });

  it('the two drawing layers are direct children, or the rule misses', () => {
    /* `> .tb-arrows-svg` only matches a DIRECT child. If the render
       ever nests them, the rule silently stops re-showing them and
       the coach draws into an invisible layer. */
    /* The EDITOR's field, not the read-only card's — there are two
       `.tb-field-inner` renders and indexOf found the wrong one,
       failing on markup that was correct. Anchored on the editor's
       unique id and read backwards to its container. */
    const svg = appSrc2.indexOf('id="tb-arrows-svg"');
    assert.ok(svg !== -1, 'the editor arrows layer was not found');
    const i = appSrc2.lastIndexOf('<div class="tb-field-inner"', svg);
    assert.ok(i !== -1, 'no .tb-field-inner encloses it');
    const block = appSrc2.slice(i, svg + 4000);

    /* Some children are interpolated rather than written inline —
       `${circlesHtml}` and `${oppCirclesHtml}` carry the players — so
       follow one level into whatever the block interpolates. Checking
       only the literals reported the players as missing when they are
       there, which is a test failing on correct markup. */
    const interpolated = (block.match(/\$\{([a-zA-Z_]\w*)\}/g) || [])
        .map((m) => m.slice(2, -1));
    const builders = interpolated.map((name) => {
      const at = appSrc2.indexOf(name + ' = ');
      return at === -1 ? '' : appSrc2.slice(at, at + 3000);
    }).join('\n');

    shown.forEach((c) => {
      const re = new RegExp('class="' + c + '[" ]');
      assert.ok(re.test(block) || re.test(builders),
          c + ' must be rendered inside .tb-field-inner, inline or via ' +
          'one of: ' + interpolated.join(', '));
    });
  });

  it('leaves the props and the resize grips hidden', () => {
    /* The silhouette is a 2D-only prop, and dragging a grip resizes
       the pitch — which is not a drawing action and would fight the
       locked camera. */
    ['tb-silhouette', 'tb-pitch-grip'].forEach((c) =>
      assert.ok(shown.indexOf(c) === -1,
          c + ' must not be re-shown on the overlay'));
  });
});

/* ── Right-click in 3D opens the 2D board's own menus ─────────────
   Players, the ball and cones each carry a contextmenu handler in 2D
   — kit editing, copy, duplicate, delete — and bare turf has one for
   adding things. The 3D view had none of them: right-click only
   panned. It does not build menus of its own; it dispatches into the
   ones that exist, which is the same rule the drag and the delete key
   follow.
*/
/* Comment-stripped app.js, at file scope for the helper below
   and the suites that share it. */
const appBareAll = appSrc.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

const ctxImpl = () => {
  const marker = appBareAll.indexOf('if (pct) showFieldCtxMenu(');
  assert.ok(marker !== -1, 'the app-side onContext body was not found');
  const start = appBareAll.lastIndexOf('onContext:', marker);
  /* To the end of the whole hook, not to the first `}` at that
     indent — that one closes the `if (!kind)` guard three lines in,
     and the slice missed the object branch entirely. */
  return appBareAll.slice(start, appBareAll.indexOf('\n      });', marker));
};

describe('right-click in 3D', () => {
  const bare = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  const appBare = appSrc.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  const down = bare.slice(bare.indexOf('function onPointerDown('),
      bare.indexOf('function panBy(', bare.indexOf('function onPointerDown(')));
  const move = bare.slice(bare.indexOf('function onPointerMove('),
      bare.indexOf('function movePathEnd(', bare.indexOf('function onPointerMove(')));
  /* The IMPLEMENTATION, not the forwarder. tbMount3D has a hook of
     the same signature that just passes through, and it comes first
     in the file — indexOf found that one and sliced three lines of
     nothing. Anchored on a line only the real body contains. */

  const ctx = bare.slice(bare.indexOf('function runContext('),
      bare.indexOf('function groundPoint(', bare.indexOf('function runContext(')));

  it('arms on every right-click, not only on a trajectory handle', () => {
    assert.ok(/if \(ev\.button === 2 && !readOnly && !drawLock\) \{[\s\S]{0,200}?mode = 'context';/
        .test(down), 'every right-click must arm a context click');
    assert.ok(/pending = \{hit: pick\(ev, true\)/.test(down),
        'the hit may be null — bare turf has a menu too');
  });

  it('is inert while a draw tool is active', () => {
    /* The 2D overlay sits on top there and handles right-click
       natively, which is the entire point of the overlay. */
    assert.ok(/!drawLock/.test(down.slice(down.indexOf('ev.button === 2'),
        down.indexOf('ev.button === 2') + 60)),
        'the arming condition must exclude the draw lock');
  });

  it('a right-DRAG is still a pan', () => {
    /* Right-drag is the only way to pan, so arming every right-click
       would have killed it. The armed click is promoted once it
       travels past the same slop the release uses. */
    assert.ok(/if \(mode === 'context'\)/.test(move),
        'onPointerMove must handle an armed context click');
    assert.ok(/mode = 'pan';/.test(move.slice(move.indexOf("mode === 'context'"),
        move.indexOf("mode === 'context'") + 400)),
        'a travelling right-press must become a pan');
    const slopMove = /< 4\) return;/.test(move);
    assert.ok(slopMove, 'the promotion must use the four-pixel slop');
  });

  it('hands objects and turf to app.js rather than building a menu', () => {
    assert.ok(/onContext\(/.test(ctx), 'runContext must call the hook');
    assert.ok(!/showCtxMenu|createElement\('div'\)/.test(bare),
        'board3d must not build a context menu of its own');
    assert.ok(/SELECTABLE\.indexOf\(h\.kind\) !== -1/.test(ctx),
        'only real objects route to the menu; handles keep their own behaviour');
  });

  it('reports where the turf was hit, for "add a player here"', () => {
    assert.ok(/BG\.toPercent\(p\.at\.x, p\.at\.z/.test(ctx),
        'a miss must carry the ground position in board percentages');
    assert.ok(/onContext\(h \? h\.kind : null, h \? h\.index : null/.test(ctx),
        'a miss reports a null kind rather than being dropped');
  });

  it('trajectory handles keep their own right-click', () => {
    /* Adding and removing path dots, and swapping the bend handle for
       the apex, all happen on right-click and must not be swallowed. */
    ['pathBend', 'pathApex', 'pathDot', 'pathLine'].forEach((k) =>
      assert.ok(ctx.indexOf(k) !== -1, k + ' lost its right-click'));
  });

  it('app.js dispatches into the 2D handlers, and writes no state', () => {
    const fn = ctxImpl();
    assert.ok(fn.length > 100, 'the app-side onContext was not found');
    assert.ok(/dispatchEvent\(new MouseEvent\('contextmenu'/.test(fn),
        'an object menu must come from the 2D element itself');
    assert.ok(/clientX: x, clientY: y/.test(fn),
        'the 2D handlers place the menu from clientX/clientY');
    assert.ok(!/localStorage\.setItem|BS\.set|pushUndo/.test(fn),
        'opening a menu must not write state');
  });

  it('resolves the element the same way the drag does', () => {
    const fn = ctxImpl();
    assert.ok(/querySelectorAll\(sel\)\[index\]/.test(fn),
        'cones are addressed positionally, as in applyMove');
    assert.ok(/data-idx="' \+ index \+ '"/.test(fn),
        'everything else by index, as in applyMove');
    assert.ok(/\.tb-circle:not\(\.tb-circle-opp\)/.test(fn),
        'own players must exclude opponents');
  });

  it('the turf menu is shared, not reimplemented', () => {
    /* showFieldCtxMenu takes the position as an argument precisely so
       the 3D view can call it — it has a ray hit and no DOM rect. */
    assert.ok(/function showFieldCtxMenu\(pctLeft, pctTop, atX, atY\)/.test(appBare),
        'the turf menu must be a function of the position');
    const calls = appBare.match(/showFieldCtxMenu\(/g) || [];
    assert.strictEqual(calls.length, 3,
        'expected the definition plus one call from each view; got ' + calls.length);
  });
});

/* ── Drawn marks are right-clickable in 3D ────────────────────────
   Arrows, zones, pen strokes and labels were never registered for
   picking, so a right-click on one fell through to the turf and
   opened the "add a player here" menu. They each carry a menu in 2D
   — copy, duplicate, delete — and now reach it.
*/
describe('drawn marks can be right-clicked in 3D', () => {
  const bare = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  const appBare = appSrc.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  const pickFn = bare.slice(bare.indexOf('function pick(ev, includeLines) {'),
      bare.indexOf('const handleModes'));

  it('every mark kind registers itself for picking', () => {
    const kinds = /const MARK_KINDS = \[([^\]]*)\]/.exec(bare);
    assert.ok(kinds, 'MARK_KINDS not found');
    const names = kinds[1].match(/'[^']+'/g).map((s) => s.slice(1, -1)).sort();
    assert.deepStrictEqual(names, ['arrows', 'penLines', 'rects', 'texts']);
    /* Plain substring search, not a built regex. Writing `\.` and
       `\{` into a RegExp string through a shell heredoc lost a
       backslash every time and produced an invalid expression — the
       test threw rather than measuring anything. Nothing here needs
       escaping. */
    const pushes = bare.split('objects.push({');
    names.forEach((k) => assert.ok(
        pushes.some((p) => p.indexOf("kind: '" + k + "'") !== -1 &&
                           p.indexOf("kind: '" + k + "'") < 40),
        k + ' must push itself onto the pick list'));
  });

  it('the kinds are the state keys app.js reads', () => {
    /* A mark's index is its position in `s.<kind>`, so the name has
       to be the key that array comes from or the index means nothing. */
    const rebuild = bare.slice(bare.indexOf('function rebuild()'),
        bare.indexOf('function disposeTree'));
    ['rects', 'arrows', 'penLines', 'texts'].forEach((k) =>
      assert.ok(new RegExp('s\.' + k + ' \|\| \[\]').test(rebuild),
          k + ' must be built from s.' + k));
  });

  it('marks are pickable by BOTH buttons, so they can be dragged', () => {
    /* They were right-click only for a while, on the reasoning that a
       dragged object commits a single position and an arrow has two
       endpoints. True, but the answer was to commit a DELTA, not to
       refuse the drag — which is exactly what the 2D board does. */
    assert.ok(!/MARK_KINDS\.indexOf\(o\.kind\) === -1/.test(pickFn),
        'marks must not be gated out of the left-button pool');
    assert.ok(/objects\.filter\(\(o\) => o\.mesh\.visible\)/.test(pickFn),
        'the pool is every visible object');
  });

  it('a mark drag commits an OFFSET, never a position', () => {
    /* An arrow has two endpoints, a zone four corners and a pen
       stroke a whole polyline; there is no single place to put any of
       them. The 2D board translates them, and so does this. */
    const up = bare.slice(bare.indexOf('function onPointerUp(ev) {'),
        bare.indexOf('function onWheel('));
    assert.ok(/onMarkMove\(dragging\.kind, dragging\.index, \[b\[0\] - a\[0\], b\[1\] - a\[1\]\]\)/
        .test(up), 'the release must report a delta in board percent');
    assert.ok(/Math\.abs\(b\[0\] - a\[0\]\) > 1e-6/.test(up),
        'a click that moved nothing must not push an undo step');
  });

  it('a dragged mark follows the hand by the same offset', () => {
    /* Snapping the mesh to the cursor would jump the mark so its
       ORIGIN sat under the pointer — grabbing an arrow by its head
       would teleport the tail to your cursor. */
    const move = bare.slice(bare.indexOf('function onPointerMove('),
        bare.indexOf('function movePathEnd(', bare.indexOf('function onPointerMove(')));
    assert.ok(/dragging\.from\.x \+ \(g\.x - dragging\.grab\.x\)/.test(move),
        'the mesh must move by the offset from where it was grabbed');
    const down = bare.slice(bare.indexOf('function onPointerDown('),
        bare.indexOf('function panBy(', bare.indexOf('function onPointerDown(')));
    assert.ok(/dragging\.from = hit\.mesh\.position\.clone\(\)/.test(down),
        'the starting position must be CLONED — the live vector moves');
    assert.ok(/dragging\.grab = groundPoint\(ev\)/.test(down),
        'and the grab point recorded');
  });

  it('app.js runs the 2D translate rather than knowing the storage', () => {
    /* getElPos + moveEl are the pair the 2D pointermove uses. Nothing
       on this path knows how an arrow or a pen stroke is stored. */
    const fn = appBareAll.slice(
        appBareAll.indexOf('applyMarkMove: (kind, index, d) => {'),
        appBareAll.indexOf('onContext: (kind, index, x, y, pct) => {',
            appBareAll.indexOf('applyMarkMove: (kind, index, d) => {')));
    assert.ok(fn.length > 100, 'applyMarkMove was not found');
    assert.ok(/moveEl\(el, getElPos\(el\), d\[0\], d\[1\]\)/.test(fn),
        'it must use the 2D board own translate');
    assert.ok(/pushUndo\(\)/.test(fn) && /autoSaveFrame\(\)/.test(fn),
        'and the same undo and save path the 2D release runs');
    ['saveArrows', 'saveRects', 'savePenLines', 'saveTexts'].forEach((s) =>
      assert.ok(fn.indexOf(s) !== -1, s + ' is missing from the save path'));
    assert.ok(!/setAttribute|style\.left/.test(fn),
        'it must not reach into the element itself — that is moveEl s job');
  });

  it('labels move with the rest, in 2D as well', () => {
    /* getElPos and moveEl had no branch for .tb-text-label, so a
       multi-select drag left labels behind. Adding it for the 3D path
       fixes that too. */
    const pos = appBareAll.slice(appBareAll.indexOf('function getElPos(el) {'),
        appBareAll.indexOf('function moveEl('));
    assert.ok(/tb-text-label/.test(pos), 'getElPos must know labels');
    const mv = appBareAll.slice(appBareAll.indexOf('function moveEl(el, start, dx, dy) {'),
        appBareAll.indexOf('function buildGroupStarts'));
    assert.ok(/tb-text-label/.test(mv), 'moveEl must know labels');
  });

  it('a mark is not selectable, so Delete cannot half-work on it', () => {
    /* The selection ring is a circle sized for a player; there is no
       sensible one for a 40-metre arrow. Delete lives in the mark's
       own right-click menu instead. */
    const sel = /const SELECTABLE = \[([^\]]*)\]/.exec(bare)[1];
    ['arrows', 'rects', 'penLines', 'texts'].forEach((k) =>
      assert.ok(sel.indexOf(k) === -1, k + ' must not be selectable'));
  });

  it('runContext routes marks to app.js like any other object', () => {
    const ctx = bare.slice(bare.indexOf('function runContext('),
        bare.indexOf('function groundPoint(', bare.indexOf('function runContext(')));
    assert.ok(/MARK_KINDS\.indexOf\(h\.kind\) !== -1/.test(ctx),
        'a mark hit must reach the onContext hook');
    assert.ok(ctx.indexOf('MARK_KINDS') < ctx.indexOf('pathBend'),
        'and before the trajectory-handle branches, which are unrelated');
  });

  it('app.js maps every mark kind to its 2D element', () => {
    const fn = ctxImpl();
    // Substring, not a built regex — see the note on the pick test.
    ['arrows', 'rects', 'penLines', 'texts'].forEach((k) =>
      assert.ok(fn.indexOf(k + ": '.tb-") !== -1,
          k + ' has no 2D selector'));
    assert.ok(/arrows: '\.tb-arrow'/.test(fn) && /penLines: '\.tb-pen-line'/.test(fn),
        'the selectors must match the 2D class names');
  });

  it('marks are addressed positionally, as their state is built', () => {
    /* Every save* function reads DOM order, so position IS the index.
       data-idx exists on arrows, zones and labels but only as a cache
       a reindex has to keep true, and pen lines have none at all. */
    const fn = ctxImpl();
    assert.ok(/\['arrows', 'rects', 'penLines', 'texts'\]\.indexOf\(kind\) !== -1/.test(fn),
        'all four must take the positional branch');
    assert.ok(/querySelectorAll\(sel\)\[index\]/.test(fn),
        'positional lookup must be by querySelectorAll index');
  });

  it('the 2D menus are reached by dispatch, not rebuilt', () => {
    /* Arrow, zone and pen menus are delegated off the arrows SVG, so
       a synthetic event on the element resolves and bubbles exactly
       as a real one does. */
    const fn = ctxImpl();
    assert.ok(/dispatchEvent\(new MouseEvent\('contextmenu'/.test(fn));
    assert.ok(/bubbles: true/.test(fn),
        'delegated handlers need the event to bubble to the SVG');
  });
});

/* ── The hover cursor ─────────────────────────────────────────────
   The 2D board gets this from CSS: `.tb-circle { cursor: grab }` and
   `.tb-dragging { cursor: grabbing }`. A canvas has ONE cursor for
   the whole surface, so 3D has to decide it per frame from what the
   ray is over — and the interesting part is which pool it asks.
*/
describe('the 3D cursor says what can be picked up', () => {
  const bare = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  const hover = bare.slice(bare.indexOf('function onHover(ev) {'),
      bare.indexOf('function onPointerMove('));
  const move = bare.slice(bare.indexOf('function onPointerMove('),
      bare.indexOf('function movePathEnd(', bare.indexOf('function onPointerMove(')));
  const up = bare.slice(bare.indexOf('function onPointerUp(ev) {'),
      bare.indexOf('function onWheel('));

  it('uses the same words as the 2D board', () => {
    /* Not `pointer` or `move`: a coach who knows the 2D board reads
       the hand as "this is draggable", and a different cursor for the
       same affordance is a different affordance. */
    /* The VOCABULARY only — the test below pins how the grab value is
       reached. Asserting `setCursor('grab')` here failed on correct
       code, because the value comes out of a ternary. */
    assert.ok(/'grab'/.test(hover), 'hover must offer grab');
    assert.ok(/setCursor\('grabbing'\)/.test(move), 'a drag must show grabbing');
  });

  it('asks the DRAGGABLE pool, not the pickable one', () => {
    /* pick(ev) without includeLines is exactly the set the left
       button can drag. With it, marks and trajectory lines join in —
       and neither can be dragged, so the hand would be a lie. */
    assert.ok(/pick\(ev\) \? 'grab' : ''/.test(hover),
        'the hover test must use the left-button pool');
    assert.ok(!/pick\(ev, true\)/.test(hover),
        'includeLines would offer a hand over things that cannot move');
  });

  it('is silent while a draw tool is active', () => {
    /* The 2D overlay is on top there and shows a pen. Fighting it
       from underneath would flicker between the two. */
    assert.ok(/if \(readOnly \|\| drawLock\) \{ setCursor\(''\); return; \}/.test(hover),
        'draw lock and read-only must clear the cursor and stop');
    const lock = bare.slice(bare.indexOf('function setDrawLock(on) {'),
        bare.indexOf('function pitchScreenRect('));
    assert.ok(/if \(on\) setCursor\(''\)/.test(lock),
        'locking must clear it at once, not wait for the next move');
  });

  it('does not write to the DOM on every mouse move', () => {
    /* pointermove fires at pointer rate; an unconditional style write
       is a style invalidation each time for no change. */
    const setter = bare.slice(bare.indexOf('function setCursor(c) {'),
        bare.indexOf('function onHover('));
    assert.ok(/if \(c === cursorNow\) return;/.test(setter),
        'setCursor must skip a write that changes nothing');
  });

  it('hands the cursor back when the drag ends or the pointer leaves', () => {
    assert.ok(/onHover\(ev\)/.test(up),
        'releasing must re-evaluate, or it stays grabbing until you move');
    assert.ok(/ev && ev\.clientX !== undefined/.test(up),
        'a pointercancel carries no position and must not be used');
    assert.ok(/'pointerleave', \(\) => \{ if \(!mode\) setCursor\(''\); \}/.test(bare),
        'leaving the canvas must clear a stranded hand');
  });

  it('hover work happens only when nothing is being dragged', () => {
    /* A raycast per move is cheap but not free, and during a drag the
       answer is already known. */
    assert.ok(/if \(!mode\) \{ onHover\(ev\); return; \}/.test(move),
        'onHover must run only when there is no active gesture');
  });
});

/* ── The opponent mirror reads their shape, then ours ─────────────
   spawnOppCircles used to read `fa_tactic_formation` — ours — and
   mirror it. It reads the opponent's own key first now, and falls
   back to ours, which is what keeps every board saved before this
   version rendering exactly as it did.
*/
describe('the opponent has a shape of their own', () => {
  const a = appSrc.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  const fn = a.slice(a.indexOf('function spawnOppCircles() {'),
      a.indexOf('\n    }', a.indexOf('function spawnOppCircles() {')));

  it('prefers the opponent key and falls back to ours', () => {
    assert.ok(/fa_tactic_opp_formation/.test(fn),
        'the mirror must look for the opponent formation');
    assert.ok(fn.indexOf('fa_tactic_opp_formation') < fn.indexOf('fa_tactic_formation'),
        'theirs must be read FIRST, or the fallback always wins');
    assert.ok(/fa_tactic_opp_formation'\) \|\|/.test(fn),
        'and ours must remain the fallback, for boards that have no opponent shape');
  });

  it('the key is cleared with the rest of the editor', () => {
    /* tbClearEditor exists because two lists that must stay in step
       is how a New Board once kept a layer from the old one. */
    const clear = a.slice(a.indexOf('function tbClearEditor() {'),
        a.indexOf('\n  }', a.indexOf('function tbClearEditor() {')));
    assert.ok(/fa_tactic_opp_formation/.test(clear),
        'a new board would otherwise inherit the last opponent shape');
  });

  it('is restored when a board is loaded', () => {
    assert.ok(/setItem\('fa_tactic_opp_formation', board\.oppFormation \|\| ''\)/.test(a),
        'loading must restore it, defaulting to the mirror for old boards');
  });
});

/* ── The goals stand on the goal lines, in every view ──────────────
 *
 * Not a source assertion: the placement arithmetic is lifted out of
 * buildPitch and RUN against board-geom, and the answer is compared
 * with the pitch's own edges — which is the thing a goal has to line
 * up with, and the thing source text cannot tell anyone.
 *
 * What it caught: `position.set(w.x, 0, 0)` pinned every goal to the
 * centre line, and the mouth's centre was computed with `gl.h`, the
 * goal's HEIGHT, as though it were a span in plan. A full pitch hides
 * both — its goals belong on the centre line and the discarded value
 * was the wrong one anyway. A half or area board put its single goal
 * in the middle of the pitch, turned ninety degrees, at the x of its
 * own left post.
 */
describe('the goals stand on the goal lines, in every view', () => {
  const BG3 = require('../js/board-geom.js');

  /* buildPitch's arithmetic, extracted from the source so a change
     there breaks this rather than sailing past it.

     BUILT LAZILY, inside the tests. An assert in a describe BODY
     throws at collection time and takes the entire run with it — so a
     mutation that moved either anchor reported "Exception during run"
     with no failing test name, which is a worse signal than a red
     assertion even though the mutation was caught. Third time this
     suite has met that trap. */
  const place = (() => {
    let fn = null;
    return (...args) => {
      if (!fn) {
        const src2 = fs.readFileSync(path.join(ROOT, 'js', 'board3d.js'), 'utf8');
        const i = src2.indexOf('const portrait = !!e.swap;');
        assert.ok(i !== -1, 'the portrait flag was not found in buildPitch');
        const j = src2.indexOf('grp.position.set(w.x, 0, w.z);', i);
        assert.ok(j !== -1,
            'the goal placement was not found — buildPitch must position a ' +
            'goal at BOTH of the coordinates it just computed');
        fn = new Function('BG', 'portrait', 'gl', 'e', 'pitch', 'bt',
            src2.slice(src2.indexOf('const cx = portrait', i), j) + '\nreturn w;');
      }
      return fn(...args);
    };
  })();

  const goalsFor = (bt) => {
    const e = BG3.extent(null, bt, false);
    const m = BG3.markings(null, bt, false);
    const portrait = !!e.swap;
    return {
      e, portrait,
      at: [m.goalLeft, m.goalRight].filter(Boolean)
          .map((gl) => place(BG3, portrait, gl, e, null, bt))
    };
  };

  it('a full pitch has two, one on each goal line, centred', () => {
    const {e, at} = goalsFor('full');
    assert.strictEqual(at.length, 2, 'a full pitch has two goals');
    at.forEach((w) => {
      assert.ok(Math.abs(Math.abs(w.x) - e.ax / 2) < 1e-9,
          'a goal must sit ON the goal line (x = +/-' + (e.ax / 2) +
          '); got ' + w.x.toFixed(2));
      assert.ok(Math.abs(w.z) < 1e-9,
          'and centred between the touchlines; got z=' + w.z.toFixed(2));
    });
    assert.ok(at[0].x * at[1].x < 0, 'and one at each END, not both at one');
  });

  ['half', 'area'].forEach((bt) => {
    it('a ' + bt + ' board has one, at the top edge, centred', () => {
      /* board-geom draws these portrait with the goal at the top —
         which is the whole reason the placement has two cases. */
      const {e, at, portrait} = goalsFor(bt);
      assert.ok(portrait, bt + ' must be a portrait board');
      assert.strictEqual(at.length, 1, bt + ' shows one goal, the attacking one');
      const w = at[0];
      assert.ok(Math.abs(w.z + e.ay / 2) < 1e-9,
          'it must sit on the goal line at the TOP (z = ' + (-e.ay / 2) +
          '); got ' + w.z.toFixed(2));
      assert.ok(Math.abs(w.x) < 1e-9,
          'and centred across the pitch; got x=' + w.x.toFixed(2));
    });
  });

  it('and a portrait goal is turned to face down the pitch', () => {
    /* The posts are built along local Z. Without the rotation a half
       board's goal spans the wrong axis — the mouth faces the corner
       flag instead of the pitch. */
    const src2 = fs.readFileSync(path.join(ROOT, 'js', 'board3d.js'), 'utf8');
    assert.ok(/if \(portrait\) grp\.rotation\.y = Math\.PI \/ 2;/.test(src2),
        'a portrait goal must be rotated a quarter turn');
  });

  it('the arcs come from board-geom, not from a second derivation', () => {
    /* board3d used to work the sweep out itself and handled only the
       two landscape cases — it clipped against an x edge, so a half or
       area board drew a sliver hidden inside its own penalty box and
       the arc was missing. board-geom already answered this for the 2D
       clip-path; one rule, two renderers.

       Found by mutation, twice over: deleting the arc drawing was
       killed only INCIDENTALLY, by the byte-identity guard noticing
       that functions/private/board3d.js had drifted. Nothing actually
       checked the arcs were drawn at all. */
    const src2 = fs.readFileSync(path.join(ROOT, 'js', 'board3d.js'), 'utf8');
    /* markingsTexture, which is where the lines are painted —
       buildPitch only hangs the result on the turf. The first version
       of this sliced buildPitch and failed on correct code, because
       the arcs are drawn one function earlier. */
    const pitch = src2.slice(src2.indexOf('function markingsTexture'),
        src2.indexOf('function buildPitch'));
    assert.ok(pitch.length > 500, 'the markingsTexture slice looks wrong');
    assert.ok(/BG\.arcRange\(m, which\)/.test(pitch),
        'the sweep must come from board-geom');
    assert.ok(/circ\(c, r\.from, r\.to\)/.test(pitch),
        'and be USED — a circ() without a range draws the whole circle, ' +
        'straight through the penalty area');
    assert.ok(!/Math\.acos\(/.test(pitch),
        'no second derivation may survive here: ' + (pitch.match(/Math\.acos\([^)]*\)/) || [''])[0]);
    /* And the module it delegates to really offers it. */
    assert.ok(typeof require('../js/board-geom.js').arcRange === 'function',
        'board-geom must export arcRange');
  });

  it('the mouth is measured by its SPAN, never by its height', () => {
    /* gl.h is 2.44 m of goal above the turf and is not a plan
       measurement at all. Using it as one is what the full board hid. */
    const src2 = fs.readFileSync(path.join(ROOT, 'js', 'board3d.js'), 'utf8');
    const block = src2.slice(src2.indexOf('const cx = portrait'),
        src2.indexOf('grp.position.set(w.x, 0, w.z);'));
    assert.ok(!/gl\.h/.test(block),
        'the goal height must play no part in where the goal is placed: ' +
        block);
    assert.ok(/gl\.w \/ 2/.test(block), 'the span is what centres it');
  });
});
