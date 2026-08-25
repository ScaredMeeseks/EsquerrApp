/* The 3D menu.
 *
 * ⚠ READ THIS BEFORE ADDING A TEST HERE.
 *
 * There is no jsdom in this suite, so nothing below opens a menu or
 * looks at a pixel. Source assertions have failed to catch a real bug
 * three times in this feature's history — `is3d` resolved to nothing,
 * `.tb-markings` matched nothing, `--tb-ppm` produced a number where a
 * length was required — and each time the text was right and referred
 * to something that did not work.
 *
 * So these tests deliberately stick to claims that source CAN settle:
 * that ids referenced actually exist, that the menu MOVES controls
 * rather than duplicating ids, that every label resolves in three
 * languages, and that the listeners it puts on the document are taken
 * off again. Whether a panel appears on hover is a hand check, and is
 * listed as one in the plan rather than faked here.
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const app = fs.readFileSync(path.join(ROOT, 'js', 'app.js'), 'utf8');
const css = fs.readFileSync(path.join(ROOT, 'css', 'style.css'), 'utf8');
/* Comments discuss the very ids and classes under test. */
const bare = app.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

/* Slice a function out of the comment-stripped source, bounded by the
   NEXT declaration at the same indent.

   The first version took an end marker and every call passed a
   comment opener — in a string that has had its comments stripped.
   It found nothing and threw at collection time, which aborts the
   whole run rather than failing one test. Twice now. */
const fn = (name) => {
  const i = bare.indexOf('function ' + name);
  assert.ok(i !== -1, name + ' not found in js/app.js');
  /* Bound at the next declaration at the SAME indent. A fixed
     two-space bound was wrong for anything nested inside bindTactics,
     which sits at four — the slice ran on for thousands of lines and
     swallowed half the editor, so an assertion that something was
     ABSENT found it somewhere else entirely and failed on correct
     code. */
  const lineStart = bare.lastIndexOf('\n', i) + 1;
  const indent = bare.slice(lineStart, i).match(/^\s*/)[0];
  const j = bare.indexOf('\n' + indent + 'function ', i + 10);
  return bare.slice(i, j === -1 ? bare.length : j);
};
describe('the 3D menu — what it offers', () => {
  const html = fn('tbMenuHtml()');

  it('has the six entries, in the order they were asked for', () => {
    const order = (html.match(/entry\('(\w+)'/g) || []).map((m) => m.slice(7, -1));
    assert.deepStrictEqual(order,
        ['new', 'view', 'gear', 'squad', 'props', 'draw'],
        'New Board is first; the rest follow the hamburger design');
  });

  it('only the four that hold something get a panel', () => {
    /* New Board and 2D/3D do a thing and re-render the page. A panel
       on either would open and be destroyed in the same gesture. */
    ['new', 'view'].forEach((k) => assert.ok(
        new RegExp("entry\\('" + k + "'[^\\n]*false\\)").test(html),
        k + ' must not carry a panel'));
    ['gear', 'squad', 'props', 'draw'].forEach((k) => assert.ok(
        new RegExp("entry\\('" + k + "'[^\\n]*true\\)").test(html),
        k + ' must carry a panel'));
  });

  it('every label goes through t(), in all three languages', () => {
    const keys = [...new Set((html.match(/t\('tactics\.[a-z_0-9]+'\)/g) || [])
        .map((m) => m.slice(3, -2)))];
    assert.ok(keys.length >= 6, 'expected a label per entry; got ' + keys.length);
    keys.forEach((k) => {
      const i = app.indexOf("'" + k + "':");
      assert.ok(i !== -1, k + ' has no translation at all');
      const line = app.slice(i, i + 320);
      ['ca:', 'es:', 'en:'].forEach((lang) => assert.ok(line.indexOf(lang) !== -1,
          k + ' is missing ' + lang.slice(0, 2)));
    });
  });

  it('the club name reaches the squad entry', () => {
    /* "Add Esquerra", not "Add team" — the placeholder has to be
       substituted or the coach reads the literal {team}. */
    const squad = fn('tbMenuSquad(hooks)');
    assert.ok(/_clubConfig && _clubConfig\.name/.test(squad),
        'the club name must come from the config');
    assert.ok(/replace\('\{team\}', club\)/.test(squad),
        'the placeholder must be substituted');
  });
});

describe('the 3D menu — it moves controls, it does not copy them', () => {
  const init = fn('tbMenuInit(hooks)');
  const squad = fn('tbMenuSquad(hooks)');

  it('adopts by appendChild, which MOVES the element', () => {
    /* Two elements with one id is the bug that would follow a clone,
       and the visible half would be the one deactivateDrawTools()
       never reaches — it sets the active class by id. */
    assert.ok(/row\.appendChild\(el\)/.test(init),
        'controls must be moved into the panel');
    assert.ok(!/cloneNode|innerHTML \+=/.test(init),
        'nothing here may duplicate a control');
  });

  it('every control it reaches for actually exists in the render', () => {
    /* The `is3d` lesson in a different costume: a selector that
       matches nothing fails silently and leaves an empty panel. */
    const picks = [...new Set((init.match(/'#tb-[a-z0-9-]+'/g) || [])
        .map((m) => m.slice(2, -1)))];
    assert.ok(picks.length >= 12, 'expected the toolbar controls; got ' + picks.length);
    picks.forEach((id) => assert.ok(app.indexOf('id="' + id + '"') !== -1,
        'no element is rendered with id ' + id));

    /* Classes are matched inside the whole attribute, not just at its
       start: the toolbar's labels carry three classes each. The naive
       version reported a class as missing when it was simply last in
       the list — and it also hid a real one, `.tb-pen-dash-label`,
       which genuinely did not exist because the pen's Dash toggle was
       reusing the arrow's class. querySelector returned the ARROW's
       label for both rows, so the pen silently lost its toggle. */
    const classes = [...new Set((init.match(/'\.tb-[a-z0-9-]+'/g) || [])
        .map((m) => m.slice(2, -1)))];
    const attrs = app.match(/class="[^"]*"/g) || [];
    classes.forEach((c) => assert.ok(
        attrs.some((a) => a.slice(7, -1).split(/\s+/).indexOf(c) !== -1),
        'nothing is rendered with class ' + c));
  });

  it('the squad panel adopts the kit controls too', () => {
    ['#tb-team-color', '#tb-opp-color'].forEach((s) =>
      assert.ok(squad.indexOf(s) !== -1, s + ' must move into a kit slot'));
    assert.ok(/tb-stripes\[data-side="team"\]/.test(squad) &&
              /tb-stripes\[data-side="opp"\]/.test(squad),
        'both stripe groups must move into their side');
    assert.ok(/appendChild/.test(squad), 'moved, not copied');
  });

  it('the toolbar is hidden only in 3D', () => {
    assert.ok(/class="tb-controls\$\{is3d \? ' tb-controls-3d' : ''\}"/.test(app),
        'the hide class must be conditional on the 3D view');
    assert.ok(/\.tb-controls-3d \{ display:none !important; \}/.test(css),
        'and it must actually hide it');
  });
});

describe('the 3D menu — opening and closing', () => {
  const init = fn('tbMenuInit(hooks)');

  it('opens on hover where there is a pointer, and on tap everywhere', () => {
    assert.ok(/matchMedia\('\(hover: hover\)'\)/.test(init),
        'hover must be detected, not assumed');
    assert.ok(/if \(canHover\) entry\.addEventListener\('pointerenter'/.test(init),
        'hover opens a panel only where hover exists');
    assert.ok(/entry\.addEventListener\('click'/.test(init),
        'and tap opens it everywhere — a tablet has no hover at all');
  });

  it('closes all four ways', () => {
    assert.ok(/btn\.addEventListener\('click'[\s\S]{0,80}setOpen\(!isOpen\(\)\)/.test(init),
        'the hamburger must toggle');
    assert.ok(/if \(!menu\.contains\(e\.target\)\) setOpen\(false\)/.test(init),
        'a click outside must close');
    assert.ok(/e\.key === 'Escape'\) setOpen\(false\)/.test(init),
        'Escape must close');
    assert.ok(/getElementById\('tb-frame-play'\)[\s\S]{0,60}setOpen\(false\)/.test(init),
        'play must close');
  });

  it('shows one panel at a time', () => {
    /* Two open panels overlap and the coach cannot tell which control
       belongs to which. */
    assert.ok(/classList\.toggle\('tb-m-hot', o === entry\)/.test(init),
        'opening one entry must close the others');
  });

  it('takes its document listeners off again', () => {
    /* Both dismissal listeners are on the DOCUMENT and this menu dies
       with the next render. Left behind, every re-render adds another
       pair, each holding a detached menu. */
    assert.ok(/removeEventListener\('pointerdown', away\)/.test(init) &&
              /removeEventListener\('keydown', esc\)/.test(init),
        'both document listeners must be removed');
    assert.ok(/obs\.disconnect\(\)/.test(init),
        'and the observer that removes them must stop too');
  });

  it('the formation reaches app.js by a hook, never a document event', () => {
    /* A listener on the document would outlive the menu and capture
       this render's frames array — the stale-closure trap the
       tb-ro-play double-binding already taught once. */
    const squad = fn('tbMenuSquad(hooks)');
    assert.ok(/hooks\.onFormation\(opt\.dataset\.side, opt\.dataset\.val\)/.test(squad),
        'the formation must be handed back through the hook');
    assert.ok(!/dispatchEvent\(new CustomEvent/.test(squad),
        'a document event would leak a listener per render');
  });
});

describe('applying a formation is one path, for both sides', () => {
  const apply = fn('applyFormationShape(side, name)');

  it('the 2D dropdown and the 3D menu run the same code', () => {
    /* Two copies of "reset the frames, clear the positions, respawn"
       is how the two views come to disagree about what a formation
       change involves. */
    assert.ok(/applyFormationShape\('team', f\)/.test(bare),
        'the 2D dropdown must call it');
    assert.ok(/applyFormation\(side, name\) \{ applyFormationShape\(side, name\); \}/
        .test(bare), 'and the menu reaches it through applyFormation');
  });

  it('clears only the side being changed', () => {
    /* Clearing both was right when one formation placed both teams.
       Now it would throw the opponent's shape away every time ours
       changed. */
    assert.ok(/const posKey = opp \? 'fa_tactic_opp_positions' : 'fa_tactic_positions'/
        .test(apply), 'the position key must depend on the side');
    assert.ok(!/removeItem\('fa_tactic_opp_positions'\)/.test(apply),
        'no unconditional clear of the opponent');
  });

  it('choosing an opponent shape shows them', () => {
    /* Picking a formation for a side you cannot see is a dead end. */
    assert.ok(/show\.checked = true/.test(apply),
        'the opponent must be switched on');
    assert.ok(/setItem\('fa_tactic_show_opp', 'true'\)/.test(apply),
        'and the choice persisted');
  });

  it('saves through the editor own path', () => {
    assert.ok(/saveState\(\);\s*\n\s*autoSaveFrame\(\);/.test(apply),
        'a formation change is an edit like any other');
  });
});

describe('the camera menu and the frames rail', () => {
  const init = fn('tbMenuInit(hooks)');
  const cams = fn('tbCamsHtml()');

  it('offers three views and a crosshair, and not lateral', () => {
    const order = (cams.match(/one\('(\w+)'/g) || []).map((m) => m.slice(5, -1));
    assert.deepStrictEqual(order, ['broadcast', 'goal', 'top', 'reset'],
        'Realitzacio, Porteria, Zenital, then centre the view');
  });

  it('each view is a drawing, not its name', () => {
    /* Three Catalan words take more room than three pictures, and a
       drawing of the goal end-on answers "what will I get" better
       than the word Porteria. */
    assert.ok(/tbCamThumb\(cam\)/.test(cams), 'the entry must render a thumbnail');
    const thumb = fn('tbCamThumb(kind)');
    ['broadcast', 'goal', 'top', 'reset'].forEach((k) =>
      assert.ok(new RegExp(k + ':').test(thumb), k + ' has no drawing'));
  });

  it('the board name and the frames move into the window', () => {
    /* Both were outside it. The name costs no height beside the
       hamburger, and that height is the point. */
    assert.ok(/nameSlot\.appendChild\(nameInp\)/.test(init),
        'the board name must be adopted into the menu bar');
    assert.ok(/railSlot\.appendChild\(frames\)/.test(init),
        'the frames section must be adopted into the rail');
    assert.ok(/querySelector\('\.tb-frames-section'\)/.test(init),
        'the whole SECTION moves — play lives in its header, and ' +
        'moving only the strip would leave the button under the board');
  });

  it('New Board is hidden in 3D, because the hamburger has it', () => {
    assert.ok(/class="tb-btn-row\$\{is3d \? ' tb-controls-3d' : ''\}"/.test(app),
        'the button row must be hidden in 3D only');
  });

  it('the rail is dimmed until it is wanted', () => {
    /* A permanent column of tiles at full strength competes with the
       pitch for attention the whole time. */
    const rule = css.slice(css.indexOf('.tb-rail {'), css.indexOf('.tb-rail:hover'));
    assert.ok(/opacity:\.35/.test(rule), 'the rail must start dimmed');
    assert.ok(/\.tb-rail:hover, \.tb-rail:focus-within \{ opacity:1; \}/.test(css),
        'and come up on hover — focus-within too, or a keyboard user never sees it');
  });

  it('frame 1 is seeded, so the rail is never an empty column', () => {
    assert.ok(/if \(!frames\.length\) \{[\s\S]{0,160}captureFrameState\(\)/.test(bare),
        'entering 3D with no frames must seed one from the board');
    assert.ok(/activeFrameIdx = 0;/.test(bare), 'and select it');
  });
});

/* ── Nothing touches a `let` before it is declared ────────────────
 *
 * The menu shipped dead: built up in the 3D mount block, it reached
 * for `frames`, which is declared with `let` hundreds of lines below.
 * That is a temporal dead zone — `ReferenceError: Cannot access
 * 'frames' before initialization` — and the throw aborted the rest of
 * the block, so nothing was adopted and the hamburger was never
 * wired. The camera menu kept working only because it is wired
 * earlier in the same function.
 *
 * The whole suite passed. Every assertion about the menu was about
 * source text, and the text was right — it just ran too early. That
 * is the THIRD variant of the same trap here, after `is3d` reaching
 * across functions and `tbDrawSurface` reaching for BS.
 *
 * Ordering is one thing source CAN settle honestly, so these do.
 */
describe('the menu is built after what it reaches for', () => {
  const at = (needle) => {
    const i = bare.indexOf(needle);
    assert.ok(i !== -1, 'not found: ' + needle);
    return i;
  };

  it('runs after every let it touches is initialised', () => {
    const call = at('tbMenuInit({onFormation');
    [['let frames =', 'frames'],
     ['let activeFrameIdx', 'activeFrameIdx']].forEach(([decl, name]) => {
      assert.ok(at(decl) < call,
          'tbMenuInit runs before `' + name + '` exists — a temporal dead zone, ' +
          'and the throw takes the whole block with it');
    });
  });

  it('so does the frame-1 seed, which reads frames directly', () => {
    assert.ok(at('let frames =') < at('if (!frames.length) {'),
        'the seed must come after the declaration');
  });

  it('and it is gated on the 3D view, not on the mount block', () => {
    /* Moving it out of the mount block means it no longer inherits
       that block's `if (3D)`, so it has to carry its own. */
    const i = at('tbMenuInit({onFormation');
    const before = bare.slice(Math.max(0, i - 700), i);
    assert.ok(/if \(tbIs3D\(\)\) \{/.test(before),
        'the menu must only be built in 3D');
  });
});

describe('the rail and the camera share one vertical axis', () => {
  const rule = (sel) => {
    const i = css.indexOf(sel + ' {');
    assert.ok(i !== -1, sel + ' not found');
    return css.slice(i, css.indexOf('}', i));
  };

  it('both columns are one declared width, anchored to one edge', () => {
    /* THE FIX, after two failed attempts at the same thing.

       Matching each control's width did not work and could not:
       both columns were shrink-to-fit and RIGHT-aligned, so each
       one's centre line was wherever its own widest child put it.
       That holds until something gains a border, a scrollbar or a
       padding — and twice it did not hold, while a test comparing
       declared `width:` values passed both times. Declared widths are
       not rendered boxes, and source cannot see the difference.

       So the axis is a number now. Two columns, the same explicit
       width, the same right edge, children CENTRED rather than
       pushed against an edge. That much IS provable from the CSS. */
    assert.ok(/--tb-axis:\d+px/.test(css), 'the axis must be declared once');
    ['.tb-cams', '.tb-rail'].forEach((sel) => {
      const r = rule(sel);
      assert.ok(/width:var\(--tb-axis\)/.test(r),
          sel + ' must take the shared axis width');
      assert.ok(/right:\.75rem/.test(r), sel + ' must use the same right edge');
      assert.ok(/align-items:center/.test(r),
          sel + ' must centre its children, not push them to an edge');
    });
    assert.ok(!/margin-left:auto/.test(rule('.tb-cams-btn')),
        'right-aligning the camera button is what made the axis depend on it');
    assert.ok(!/align-items:flex-end/.test(rule('.tb-cams-list')),
        'and the same for the view circles');
  });

  it('the rail children fill the axis instead of shrinking inside it', () => {
    /* A column that shrinks to its widest child re-introduces the
       whole problem one level down. */
    ['.tb-rail .tb-frames-section', '.tb-rail .tb-frames-strip',
     '.tb-rail .tb-frames-header', '.tb-rail .tb-frame-item',
     '.tb-rail .tb-frame-gap'].forEach((sel) =>
      assert.ok(/width:100%/.test(rule(sel)), sel + ' must fill the axis'));
  });

  it('the frames are not a white box on a pitch', () => {
    /* The 2D board's white tiles and orange borders are a page
       vocabulary. Over turf, a column of white squares is the loudest
       thing on the board. */
    const thumb = rule('.tb-rail .tb-frame-thumb');
    assert.ok(/background:none/.test(thumb), 'a tile must be transparent');
    assert.ok(/border:2px solid transparent/.test(thumb),
        'and carry no border of its own');
    assert.ok(/background:none/.test(rule('.tb-rail .tb-frames-section')),
        'and the section around them must not be a grey box either');
  });

  it('only the current frame is outlined', () => {
    const on = rule('.tb-rail .tb-frame-active .tb-frame-thumb');
    assert.ok(/border-color:#fb8c00/.test(on), 'the active tile must be outlined');
    assert.ok(/box-shadow:none/.test(on),
        'and only outlined — the 2D board doubles it with a glow');
  });

  it('the camera list drops down, it does not run across', () => {
    /* It sits at the top-right corner; a row would run back along the
       top edge and collide with the board name. */
    assert.ok(/flex-direction:column/.test(rule('.tb-cams-list')),
        'the list must stack');
  });

  it('play sits below the frames it runs', () => {
    /* It arrives in the section HEADER, which is above the strip.
       Above them it reads as a title; below, as "run these". */
    assert.ok(/flex-direction:column-reverse/.test(rule('.tb-rail .tb-frames-section')),
        'the section must be reversed so the header lands underneath');
  });
});

describe('the rail sits on the axis, and the CSS says each thing once', () => {
  const rule = (sel) => {
    const i = css.indexOf(sel + ' {');
    assert.ok(i !== -1, sel + ' not found');
    return css.slice(i, css.indexOf('}', i));
  };

  it('nothing reserves scrollbar width on the rail edge', () => {
    /* THE misalignment. `overflow-y:auto` draws a scrollbar on the
       RIGHT, and its width pushed every tile inward while the camera
       button above stayed flush against the same edge. Hiding the bar
       keeps the scrolling and returns the width. */
    const strip = rule('.tb-rail .tb-frames-strip');
    assert.ok(/overflow-y:auto/.test(strip), 'a long animation must still scroll');
    assert.ok(/scrollbar-width:none/.test(strip),
        'but the bar must not take width off the aligned edge');
    assert.ok(/\.tb-rail \.tb-frames-strip::-webkit-scrollbar/.test(css),
        'and the same for WebKit, which ignores scrollbar-width');
  });

  it('the duration input is exactly a tile wide', () => {
    /* At 44px against 38px tiles the column was wider than its own
       contents, so the tiles centred inside it and sat off the axis. */
    const dur = /width:(\d+)px/.exec(rule('.tb-rail .tb-frame-dur'))[1];
    const tile = /width:(\d+)px/.exec(rule('.tb-rail .tb-frame-thumb'))[1];
    assert.strictEqual(dur, tile,
        'the duration is ' + dur + 'px in a column of ' + tile + 'px tiles');
  });

  it('the rail clears the camera list, which opens down the same edge', () => {
    assert.ok(/top:calc\(50% \+ [\d.]+rem\)/.test(rule('.tb-rail')),
        'the rail must sit below centre, or the two meet');
  });

  it('the board name is a title, not another control', () => {
    const name = rule('.tb-m-name .tb-board-name');
    assert.ok(/background:transparent/.test(name),
        'it must have no ground of its own');
    assert.ok(/text-align:left/.test(name),
        'and read from the left — .tb-board-name centres it for the 2D page');
  });

  it('every new selector is written exactly once', () => {
    /* Three selectors had accumulated a second rule while this was
       built in pieces, each time with the later one silently winning
       — and one of those pairs disagreed about a margin. A duplicate
       is not a style bug on its own; it is the thing that makes the
       next style bug impossible to read. */
    const sels = (css.match(/^\.tb-(rail|cams|m)[^{]*\{/gm) || [])
        .map((x) => x.slice(0, -1).trim());
    const seen = {};
    const dup = sels.filter((x) => (seen[x] ? true : (seen[x] = 1, false)));
    assert.deepStrictEqual([...new Set(dup)], [],
        'these selectors are written twice: ' + [...new Set(dup)].join(', '));
  });
});
