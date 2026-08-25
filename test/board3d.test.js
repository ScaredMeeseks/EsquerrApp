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
    const auto = a.slice(a.indexOf('function autoSaveFrame()'),
        a.indexOf('function autoSaveFrame()') + 500);
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
    assert.ok(/resetCamera\(\) \{ camTouched = false; frameBoard\(\)/.test(s3));
    const a = fs2.readFileSync(p2.join(__dirname, '..', 'js', 'app.js'), 'utf8');
    assert.ok(/tb-3d-reset/.test(a) && /resetCamera\(\)/.test(a));
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
