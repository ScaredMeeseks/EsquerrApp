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
    /* The FILE actions group at the top — what you do to the board as
       a thing — then the view toggle, then the tools that change what
       is on it. */
    const order = (html.match(/entry\('(\w+)'/g) || []).map((m) => m.slice(7, -1));
    assert.deepStrictEqual(order,
        ['new', 'open', 'save', 'link', 'view', 'gear', 'squad', 'props', 'draw'],
        'file actions first, then the view, then the drawing tools');
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

  it('BOTH button rows are hidden in 3D, for different reasons', () => {
    /* One holds New Board, which the hamburger carries instead. The
       other held Save and Save As, which are ADOPTED out — so the row
       is left empty, and an empty row still holds its padding. That
       padding is space inside the card below the window, which is
       exactly what stops the window reaching the card's bottom edge.

       Hiding the wrapper cannot affect the buttons: they are no
       longer its children. */
    const rows = (app.match(/class="tb-btn-row[^"]*"/g) || []);
    assert.strictEqual(rows.length, 2, 'expected a New Board row and a Save row');
    rows.forEach((r) => assert.ok(r.indexOf("is3d ? ' tb-controls-3d'") !== -1,
        'this row keeps its space in 3D: ' + r));
  });

  it('nothing is left holding space between the window and the card edge', () => {
    /* The window bleeds to all four edges of the card, which is only
       honest if nothing renders after it. Everything that does is
       either adopted into the menu at runtime or hidden — and this
       lists which, so adding a section below the board without
       handling it fails here rather than by pushing the window up. */
    const i = app.indexOf('tbMenuHtml()');
    const after = app.slice(app.indexOf('tb-3d-hint', i),
        app.indexOf('function bindTactics', i));
    const sections = ['tb-frames-section', 'tb-tag-section', 'tb-match-section',
      'tb-btn-row', 'tb-saved-list', 'tb-lib-list'];
    sections.forEach((c) => {
      if (after.indexOf(c) === -1) return;      // not rendered here at all
      const adopted = init.indexOf(c) !== -1;
      const hidden = new RegExp('class="' + c + '\\$\\{is3d').test(app);
      assert.ok(adopted || hidden,
          c + ' renders below the window and is neither adopted nor hidden');
    });
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

  it('play sits above frame 1', () => {
    /* It arrives in the section HEADER, which is already first, so no
       reversal. This was briefly reversed to put play underneath —
       the owner wants it on top. */
    assert.ok(/flex-direction:column;/.test(rule('.tb-rail .tb-frames-section')),
        'the section must run header-first, so play leads the column');
    assert.ok(!/column-reverse/.test(rule('.tb-rail .tb-frames-section')),
        'reversing it would put play under the last frame');
  });

  it('a wheel over the rail scrolls the frames, not the camera', () => {
    /* board3d binds `wheel` on the WRAPPER as well as the canvas, to
       catch the border and any gap the canvas does not cover — and
       the rail lives inside that wrapper. Every notch over the frame
       list bubbled up and zoomed the board, so a list that had
       `overflow-y:auto` all along could not be reached. */
    assert.ok(/railSlot\.addEventListener\('wheel', \(e\) => e\.stopPropagation\(\)/
        .test(fn('tbMenuInit(hooks)')),
        'the rail must keep its wheel from reaching board3d');
    const strip = rule('.tb-rail .tb-frames-strip');
    assert.ok(/overflow-y:auto/.test(strip), 'and the list must actually scroll');
    assert.ok(/scrollbar-width:none/.test(strip),
        'without showing a bar — it is a 38px column over a pitch');
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

  it('every control on the axis takes the tile token', () => {
    /* The widths were literal 38s repeated across seven rules. One
       token instead, so "the same width" is a fact about the CSS
       rather than a coincidence someone has to maintain. */
    assert.ok(/--tb-tile:\d+px/.test(css), 'the tile width must be declared once');
    ['.tb-rail .tb-frame-thumb', '.tb-rail .tb-frame-add',
     '.tb-rail .tb-frame-play', '.tb-rail .tb-frame-dur',
     '.tb-cams-btn', '.tb-cams-list .tb-cam-btn'].forEach((sel) =>
      assert.ok(/width:var\(--tb-tile\)/.test(rule(sel)),
          sel + ' must take the tile token, not its own number'));
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

describe('three small faults from the first pass', () => {
  const rule = (sel) => {
    const i = css.indexOf(sel + ' {');
    assert.ok(i !== -1, sel + ' not found');
    return css.slice(i, css.indexOf('}', i));
  };
  const init = fn('tbMenuInit(hooks)');

  it('the delete cross does not hang outside the strip at all', () => {
    /* Twice wrong before this. The cross hangs -6px past its PARENT,
       and its parent is `.tb-frame-item` — which I had made
       `width:100%` of the axis, so -6px was outside the strip
       whatever the axis was. Widening the axis could never have
       helped: the item grew with it. The first attempt's test passed
       because it modelled the cross as anchored to the 38px TILE,
       which is not what it is anchored to.
       `overflow-y:auto` clips the top edge too, so the first tile's
       cross also lost its head.

       The cross sits INSIDE the tile's corner now. A negative offset
       on either axis is the bug, so that is what this forbids —
       rather than trying to compute how much room a given layout
       leaves, which is what got it wrong twice. */
    /* Forbidding a negative offset outright was the FIX for the
       clipping and the wrong answer for the design: the cross is
       meant to straddle the tile's corner as a badge, and a badge
       that sits fully inside looks like a mistake.

       The real rule is neither "no overhang" nor a clearance sum from
       the axis. `overflow` clips at the PADDING box, so an absolutely
       positioned child may spill out of the content box by up to the
       padding and still be drawn. That is the invariant: overhang <=
       pad, on every side that has one. */
    const del = rule('.tb-rail .tb-frame-del');
    const pad = parseFloat(/--tb-pad:([\d.]+)px/.exec(css)[1]);
    ['top', 'right', 'bottom', 'left'].forEach((side) => {
      const m = new RegExp(side + ':(-?[\\d.]+)px').exec(del);
      if (!m) return;
      const over = -parseFloat(m[1]);          // negative offset = overhang
      assert.ok(over <= pad,
          side + ':' + m[1] + 'px overhangs by ' + over + 'px into a ' + pad +
          'px pad — the strip clips at its padding box, so it is cut');
    });
    assert.ok(/padding:var\(--tb-pad\)/.test(rule('.tb-rail .tb-frames-strip')),
        'the strip must carry that pad, or there is nothing to spill into');
  });

  it('the three size tokens are consistent with each other', () => {
    /* The axis is not a free number: it is a tile plus two pads. If
       they disagree the tile either overflows the content box or
       floats inside it, and the columns stop sharing a centre line —
       which is the bug this whole run of commits kept re-finding. */
    const g = (k) => parseFloat(new RegExp('--' + k + ':([\\d.]+)px').exec(css)[1]);
    assert.strictEqual(g('tb-axis') - 2 * g('tb-pad'), g('tb-tile'),
        'axis (' + g('tb-axis') + ') must be tile (' + g('tb-tile') +
        ') plus two pads (' + g('tb-pad') + ')');
  });

  it('the item is full width, which is WHY the cross must stay inside', () => {
    /* Recording the trap: the item fills the axis so the column
       cannot shrink to its contents. That is deliberate, and it is
       exactly what makes an overhanging child unclippable-by-luck. */
    assert.ok(/width:100%/.test(rule('.tb-rail .tb-frame-item')),
        'the item fills the axis');
    assert.ok(/overflow-x:hidden/.test(rule('.tb-rail .tb-frames-strip')),
        'and the strip clips, so nothing may overhang it');
  });

  it('a tooltip cannot outlive the element that opened it', () => {
    /* #roster-tooltip is a body-level singleton. Its mouseleave never
       fires when a click re-renders the page out from under the
       cursor — the element is gone — so the label hung over the 3D
       board. Cleared on every bind, which every render runs, and on
       click, which is what triggers those renders. */
    const tt = bare.slice(bare.indexOf('function bindToolbarTooltips()'),
        bare.indexOf('const saveBtn'));
    assert.ok(tt.length > 100, 'the tooltip binder was not found');
    const firstHide = tt.indexOf("tooltipEl.classList.remove('visible')");
    assert.ok(firstHide !== -1 && firstHide < tt.indexOf('.forEach'),
        'a stale tooltip must be cleared BEFORE rebinding, or it survives the render');
    assert.ok(/addEventListener\('click', \(\) => \{[\s\S]{0,80}remove\('visible'\)/.test(tt),
        'and clicking a control that re-renders must close its own tooltip');
  });

  it('hovering away closes the menu, but not instantly', () => {
    /* The panels are DOM children of their entry, so hovering one
       never counts as leaving. The 6px gap between rail and panel
       does, though, and closing on that would flicker the menu shut
       as the coach reaches for it. */
    assert.ok(/menu\.addEventListener\('pointerleave'/.test(init),
        'leaving the menu must close it');
    assert.ok(/setTimeout\(\(\) => setOpen\(false\), \d+\)/.test(init),
        'after a grace period, not at once');
    assert.ok(/menu\.addEventListener\('pointerenter', cancelLeave\)/.test(init),
        'and coming back must cancel it');
    assert.ok(/clearTimeout\(leaveTimer\)/.test(init.slice(init.indexOf('MutationObserver'))),
        'the timer must be cleared on teardown, or it fires into a dead menu');
  });
});

describe('the file actions moved into the menu', () => {
  const init = fn('tbMenuInit(hooks)');
  const rule = (sel) => {
    const i = css.indexOf(sel + ' {');
    assert.ok(i !== -1, sel + ' not found');
    return css.slice(i, css.indexOf('}', i));
  };

  it('the read-only note travels with Save As', () => {
    /* #tb-save is CONDITIONALLY rendered — on a board that is not
       this coach's, tbSaveButtonsHtml emits only Save As plus a note
       saying why. adopt() skips ids it cannot find, so leaving the
       note behind would remove Save and remove the explanation with
       it: the panel would just be missing a button. */
    const save = /adopt\('save', \[([^\]]*)\]/.exec(init);
    assert.ok(save, 'the save panel adopts nothing');
    ['#tb-save', '#tb-save-as', '.tb-readonly-note'].forEach((s) =>
      assert.ok(save[1].indexOf(s) !== -1, s + ' must be adopted'));
    assert.ok(app.indexOf('tb-readonly-note') !== -1,
        'and the note must actually be rendered somewhere');
  });

  it('BOTH link sections are adopted, not just the first', () => {
    /* Match and training share the class `.tb-match-section`. A
       querySelector would take the first and strand training below
       the window — the `.tb-pen-dash-label` bug again, where one
       class served two elements and the second lost its control
       silently. */
    assert.ok(/querySelectorAll\('\.tb-match-section'\)[\s\S]{0,90}appendChild\(sec\)/
        .test(init), 'the link panel must adopt every matching section');
    assert.ok(!/querySelector\('\.tb-match-section'\)/.test(init),
        'a single querySelector would take only the match section');
    const count = (app.match(/class="tb-match-section"/g) || []).length;
    assert.strictEqual(count, 2,
        'expected a match and a training section; found ' + count);
  });

  it('the library title is picked unambiguously', () => {
    /* The library heading carries BOTH .tb-saved-title and
       .tb-lib-title, so a bare .tb-saved-title matches it as well as
       the favourites heading. Relying on which comes first is the
       same trap one function above. */
    assert.ok(/'\.tb-saved-title:not\(\.tb-lib-title\)'/.test(init),
        'the favourites heading must exclude the library one');
  });

  it('every part of the library is adopted, so none is left behind', () => {
    ['#tb-saved-list', '.tb-lib-title', '#tb-lib-search', '#tb-lib-list']
        .forEach((s) => assert.ok(init.indexOf(s) !== -1, s + ' must be adopted'));
  });

  it('the library is two columns, each scrolling on its own', () => {
    /* Stacked, the library started below the fold of the panel and
       its search box scrolled away with it — the one control you
       reach for first. The COLUMNS scroll now, not the panel, so
       reading the favourites never moves the library. */
    const r = rule('#tb-panel-open');
    /* The grid lives on the HOT state now, not on the panel's own
       rule. An id selector beat .tb-m-panel's display:none, so a
       `display:grid` here meant the library was open from the moment
       the menu appeared and nothing ever closed it. */
    assert.ok(!/display:/.test(r),
        'a panel that sets its own display is visible before it is asked for');
    assert.ok(/.tb-m-entry.tb-m-hot > #tb-panel-open {[^}]*grid-template-columns:1fr 1fr/
        .test(css), 'two columns, side by side, when open');
    assert.ok(/max-height:/.test(r), 'the panel must still be bounded');
    const col = rule('#tb-panel-open .tb-m-col');
    assert.ok(/overflow-y:auto/.test(col) && /max-height:/.test(col),
        'each column scrolls within its own height');
  });

  it('the search box sticks, on a ground you cannot see through', () => {
    const search = rule('#tb-panel-open .tb-lib-search');
    assert.ok(/position:sticky/.test(search), 'it must stay put while the list moves');
    /* The BACKGROUND, not the whole rule — the border is legitimately
       translucent and the first version of this rejected it, failing
       on correct CSS. */
    const bg = /background:([^;]+);/.exec(search);
    assert.ok(bg, 'the sticky box must declare its own ground');
    assert.ok(/^#[0-9a-f]{3,8}$/i.test(bg[1].trim()),
        'a translucent sticky box shows the rows scrolling through it; got ' + bg[1]);
  });

  it('nothing the coach reads through is translucent', () => {
    /* The icon buttons SHOULD be translucent — they sit on the pitch
       and are meant to. The surfaces carrying text must not: at 96%
       over a green pitch, turf comes through the words. */
    ['.tb-m-panel', '.tb-m-sub', '.tb-m-kit-opts'].forEach((sel) => {
      const r = rule(sel);
      assert.ok(/background:#[0-9a-f]{6}/i.test(r),
          sel + ' must have a solid ground');
      assert.ok(!/backdrop-filter/.test(r),
          sel + ' needs no blur behind an opaque surface — it is a ' +
          'compositor pass for nothing');
    });
  });

  it('the two dropdowns have their own ground and room to read', () => {
    const list = rule('#tb-panel-link .tb-match-list');
    assert.ok(/background:#[0-9a-f]{6}/i.test(list),
        'behind these is turf, not a page');
    assert.ok(/min-width:\d+px/.test(list) && /right:auto/.test(list),
        'the list must be able to outgrow the toggle it drops from');
  });

  it('Save and Save As build their boxes the same way', () => {
    /* .btn-tb-saveas carries a 2px border and .btn-primary none, so
       the two rules disagreed about where the padding ends. Matching
       the construction beats subtracting padding from one of them and
       hoping the pair stays in step. */
    const b = rule('#tb-panel-save .btn');
    assert.ok(/border:2px solid transparent/.test(b),
        'the primary needs the border Save As already has');
    assert.ok(/flex:1 1 0/.test(b), 'and both share the row evenly');
  });

  it('tags moved in with Save, emptying the page below the window', () => {
    /* A tag is what you set when you FILE the board:
       tbLibraryListHtml groups by b.tag and the search matches on it,
       so it decides where the board turns up next time. */
    assert.ok(/savePanel\.appendChild\(tagSection\)/.test(init),
        'the tag section must be adopted into the save panel');
    assert.ok(/querySelector\('\.tb-tag-section'\)/.test(init),
        'and taken from the page, not rebuilt');
  });

  it('the delete cross is drawn, not typed', () => {
    /* A `✕` character centred with flexbox is centred by its LINE
       BOX, not its ink, and that glyph does not sit centred in its
       own line box. Two rotated bars pinned to the middle have no
       font metrics involved. */
    const del = rule('.tb-rail .tb-frame-del');
    assert.ok(/font-size:0/.test(del), 'the glyph must be dropped');
    assert.ok(/\.tb-rail \.tb-frame-del::before/.test(css) &&
              /\.tb-rail \.tb-frame-del::after/.test(css),
        'and the cross drawn from two bars');
    const bar = css.slice(css.indexOf('.tb-rail .tb-frame-del::before,'));
    assert.ok(/left:50%; top:50%/.test(bar), 'each bar starts at the centre');
    assert.ok(/margin:-0\.75px 0 0 -3\.5px/.test(bar),
        'and is pulled back by half its own size on both axes');
  });

  it('no tb- selector in the stylesheet is written twice', () => {
    /* Widened from the .tb-rail/.tb-cams/.tb-m guard: the same habit
       had produced a second .tb-3d-wrap rule holding the size tokens
       while the first held the geometry. Nothing conflicted, but a
       reader looking for "where is this element styled" had two
       answers. */
    const sels = (css.match(/^[#.]tb-[^{]*\{/gm) || [])
        .map((x) => x.slice(0, -1).trim());
    const seen = {};
    const dup = sels.filter((x) => (seen[x] ? true : (seen[x] = 1, false)));
    assert.deepStrictEqual([...new Set(dup)], [],
        'written twice: ' + [...new Set(dup)].join(', '));
  });
});

describe('the board takes the content area, and gives it back', () => {
  const rule = (sel) => {
    const i = css.indexOf(sel + ' {');
    assert.ok(i !== -1, sel + ' not found');
    return css.slice(i, css.indexOf('}', i));
  };

  it('the flush class is toggled OFF as well as on', () => {
    /* The dangerous half. Added in the tactics code and never
       removed, every other page in the app would lose its 2rem — and
       the symptom would appear on a page nobody was working on. One
       expression, both arms. */
    assert.ok(/classList\.toggle\('dashboard-flush',\s*\n?\s*currentPage === 'tactics' && tbIs3D\(\)\)/
        .test(bare), 'the flush class must be a toggle on a condition, not an add');
    assert.ok(!/classList\.add\('dashboard-flush'\)/.test(bare),
        'never added unconditionally');
  });

  it('the header goes only in 3D, and only in the editor', () => {
    /* The board-type picker still needs a title — it is a page with
       nothing else on it — and 2D keeps its own by the owner's
       decision. */
    /* TWO titles are rendered — the picker's and the editor's — and
       exactly one of them is conditional. Counting bare matches said
       one, because the conditional one contains the same substring;
       the count was wrong, not the code. */
    const titles = (app.match(/<h2 class="page-title">\$\{t\('page\.tactical_board'\)\}<\/h2>/g) || []);
    assert.strictEqual(titles.length, 2, 'the picker and the editor each render one');
    const guarded = (app.match(/\$\{is3d \? '' : `<h2 class="page-title">/g) || []);
    assert.strictEqual(guarded.length, 1,
        'exactly one — the editor\'s — is dropped in 3D; the picker is a page ' +
        'with nothing else on it and keeps its title');
  });

  it('the announcement fires on entering the tab, not on every render', () => {
    /* isNav is already the distinction between a navigation and the
       many re-renders that are not one — a firestore sync, a language
       change, the category bar, and every toggle in the board's own
       menu. Fired on those, the title would flash each time the coach
       picked a formation. */
    assert.ok(/if \(isNav && currentPage === 'tactics' && tbIs3D\(\)\)/.test(bare),
        'the flash must be gated on isNav');
    const flash = fn('tbFlashPageTitle(text)');
    assert.ok(/_tbFlashTimers\.forEach\(clearTimeout\)/.test(flash),
        'a pending fade from the last visit would cut this one short');
    assert.ok(/requestAnimationFrame\(\(\) => requestAnimationFrame\(/.test(flash),
        'two frames: a class on an element the browser has not laid out ' +
        'has no start state to transition from, and the label just appears');
  });

  it('the announcement cannot swallow a click on the board', () => {
    const r = rule('.tb-page-flash');
    assert.ok(/pointer-events:none/.test(r),
        'it sits over the board for two seconds and must not take a click');
    /* ABSOLUTE now, and parented to the board: fixed centred it on
       the browser window, which with the sidebar open is a different
       place from the window the coach is looking at. */
    assert.ok(/position:absolute/.test(r),
        'it must be centred on the board, not on the browser');
  });

  it('one label at a time, removed after it fades', () => {
    const flash = fn('tbFlashPageTitle(text)');
    assert.ok(/_tbFlashEl\.parentNode !== host/.test(flash),
        'the node is reused — two labels crossing is worse than none — but ' +
        'rebuilt when the host changes, since it now lives inside the board');
    assert.ok(/getElementById\('tb-3d-wrap'\) \|\| document\.body/.test(flash),
        'parented to the board, falling back to the body if it is not up yet');
    const hide = flash.indexOf('2000');
    const drop = flash.indexOf('2600');
    assert.ok(hide !== -1 && drop !== -1 && drop > hide,
        'it must be removed AFTER the fade-out, or it vanishes instead');
  });
});

describe('the board is re-measured after the menu rearranges the page', () => {
  it('sizes again once adoption has moved things above it', () => {
    /* THE WHITE BAND. tbMenuInit adopts the board name — which is
       rendered ABOVE the window — into the menu, so the window rises
       by that input's height the moment the menu is built. The height
       computed at mount was for the old position, and the difference
       showed as a strip of page below the board.

       Any future adoption of something above the window has the same
       effect, which is why the re-measure follows tbMenuInit rather
       than being tied to the board name specifically. */
    const at = bare.indexOf('tbMenuInit({onFormation');
    assert.ok(at !== -1, 'the menu is never built');
    const after = bare.slice(at, at + 260);
    assert.ok(/tbSize3DWindow\(\)/.test(after),
        'the window must be measured again AFTER the menu adopts, or it ' +
        'keeps the height it had while the board name was still above it');
  });

  it('and the first measurement still happens before the mount', () => {
    /* Both are needed: the first so board3d fits its camera to the
       real aspect, the second because the page moves underneath it. */
    const first = bare.indexOf('tbSize3DWindow();');
    assert.ok(first !== -1 && first < bare.indexOf('tbMount3D({'),
        'the pre-mount measurement must survive');
  });
});

describe('the sidebar scrollbar', () => {
  const rule = (sel) => {
    const i = css.indexOf(sel + ' {');
    assert.ok(i !== -1, sel + ' not found');
    return css.slice(i, css.indexOf('}', i));
  };

  it('is the same thin pill as the board panels', () => {
    /* The first pass styled the MENU panels, which was the wrong
       element: the ugly bar is the app's own left navigation column,
       where the default is a light-grey slab with stepper arrows on a
       dark ground — the brightest thing in it, and only ever seen
       when a club has enough pages to overflow. */
    const bar = rule('.sidebar');
    assert.ok(/scrollbar-width: ?thin/.test(bar), 'the standard syntax');
    assert.ok(/scrollbar-color: ?rgba\(255,255,255,\.22\) transparent/.test(bar),
        'a translucent thumb on no track');
    assert.ok(/\.sidebar::-webkit-scrollbar-thumb \{/.test(css),
        'and the webkit syntax, for Safari and older Chromium');
    assert.ok(/\.sidebar::-webkit-scrollbar-track \{ background: ?transparent; \}/.test(css),
        'no track — a groove doubles the ink for something that is only a hint');
  });

  it('uses the same values as the board surfaces, not a second palette', () => {
    /* Two nearly-identical greys would be worse than one obvious one. */
    const bar = rule('.sidebar');
    const panel = css.slice(css.indexOf('.tb-m-panel, .tb-m-sub, .tb-m-kit-opts,'));
    const thumb = /scrollbar-color: ?(rgba\([^)]+\))/.exec(bar)[1];
    assert.ok(panel.indexOf(thumb) !== -1,
        'the sidebar thumb ' + thumb + ' must match the board panels');
  });
});

describe('no panel can outrank its own hide rule', () => {
  it('nothing sets display on a panel outside the hot state', () => {
    /* THE STUCK LIBRARY. `.tb-m-panel` carries `display:none` and
       `.tb-m-entry.tb-m-hot > .tb-m-panel` turns it on. But
       `#tb-panel-open` is an ID — specificity (1,0,0) against the
       class rule's (0,1,0) — so a `display:grid` in that rule beat
       the base and the library was open from the moment the menu
       appeared, with nothing to close it.

       The rule is general: a panel may size itself, but only the hot
       state may show it. Written as a check over every panel rule
       rather than a note about the one that broke. */
    const ids = ['#tb-panel-open', '#tb-panel-save', '#tb-panel-link',
      '#tb-panel-gear', '#tb-panel-squad', '#tb-panel-props', '#tb-panel-draw'];
    ids.forEach((id) => {
      const i = css.indexOf(id + ' {');
      if (i === -1) return;                 // not every panel needs a rule
      const rule = css.slice(i, css.indexOf('}', i));
      assert.ok(!/display:/.test(rule),
          id + ' sets display in its own rule, which outranks ' +
          '.tb-m-panel{display:none} and leaves it permanently open');
    });
  });

  it('the base hide rule and the hot rule are both still there', () => {
    /* If either goes, the check above passes for the wrong reason. */
    const base = css.slice(css.indexOf('.tb-m-panel {'),
        css.indexOf('}', css.indexOf('.tb-m-panel {')));
    assert.ok(/display:none/.test(base), '.tb-m-panel must start hidden');
    assert.ok(/\.tb-m-entry\.tb-m-hot > \.tb-m-panel \{ display:flex; \}/.test(css),
        'and the hot state must be what shows it');
  });

  it('the library is wide enough not to need a sideways scrollbar', () => {
    const rule = css.slice(css.indexOf('#tb-panel-open {'),
        css.indexOf('}', css.indexOf('#tb-panel-open {')));
    const w = /width:min\((\d+)px/.exec(rule);
    assert.ok(w && parseInt(w[1], 10) >= 800,
        'two columns of board names need room; got ' + (w ? w[1] : 'none'));
    const col = css.slice(css.indexOf('#tb-panel-open .tb-m-col {'),
        css.indexOf('}', css.indexOf('#tb-panel-open .tb-m-col {')));
    assert.ok(/overflow-x:hidden/.test(col) && /min-width:0/.test(col),
        'and a long name must be cut, not allowed to widen the column');
  });
});
