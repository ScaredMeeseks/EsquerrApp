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
/* And the stylesheet's comments do the same, at length. This one was
   not stripped for a long time and it cost a real assertion: a rule
   whose comment explained why it sets `min-height:0` satisfied a test
   for `min-height:0` after the declaration itself was deleted. */
const cssBare = css.replace(/\/\*[\s\S]*?\*\//g, '');

/**
 * The declarations of ONE rule, by exact selector.
 *
 * There were SIX copies of this in this file, all
 * `css.slice(indexOf(sel + ' {'), indexOf('}'))`, and both of their
 * weaknesses bit:
 *
 *  - they read the COMMENT above and inside a block as if it were
 *    part of the rule, so prose about a declaration passed as the
 *    declaration;
 *  - `indexOf` finds a selector anywhere, so `.tb-m-entry` matched
 *    `.tb-m-entry.tb-m-hot > .tb-m-ico` and an assertion about the
 *    entry silently became one about the thing growing inside it.
 *
 * Anchored to the start of a line, and against the comment-stripped
 * sheet. One copy, so a fix here is a fix everywhere.
 */
const rule = (sel) => {
  const re = new RegExp('^' + sel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') +
      '\\s*\\{([^}]*)\\}', 'm');
  const m = re.exec(cssBare);
  assert.ok(m, sel + ' has no rule of its own');
  return m[1];
};

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
       on either would open and be destroyed in the same gesture.

       Read to the closing paren rather than to the end of the line:
       the view entry is wrapped in a condition now and runs over
       three lines, which a line-bound match silently reported as
       "carries no panel" — true, but for the wrong reason. */
    const call = (k) => {
      const i = html.indexOf("entry('" + k + "'");
      assert.ok(i !== -1, k + ' is not offered at all');
      const j = html.indexOf("entry('", i + 8);
      return html.slice(i, j === -1 ? html.length : j);
    };
    ['new', 'view'].forEach((k) => {
      const c = call(k);
      assert.ok(/false\)/.test(c) && !/true\)/.test(c), k + ' must not carry a panel');
    });
    ['gear', 'squad', 'props', 'draw'].forEach((k) => {
      const c = call(k);
      assert.ok(/true\)/.test(c) && !/false\)/.test(c), k + ' must carry a panel');
    });
  });

  it('the view entry is offered only when there is a view to switch to', () => {
    /* A club without the premium feature has nothing on the other
       side of this button. It used to be unconditional, which was
       harmless while the menu itself was premium-only and is not now
       that the flat board wears it. */
    const i = html.indexOf("entry('view'");
    const before = html.slice(0, i);
    assert.ok(/clubFeature\('board3d'\) && tbWebglOk\(\)\s*\)?\s*$/
        .test(before.trimEnd()) ||
        /clubFeature\('board3d'\) && tbWebglOk\(\)[\s\S]{0,40}$/.test(before),
        'the view entry must be gated on the premium feature and WebGL');
  });

  it('the view entry names where it GOES, not where you are', () => {
    /* Both the glyph and the label. An entry reading "2D" while the
       coach is looking at 2D is a button that appears to do nothing —
       which is exactly what it was, back when only 3D had this menu. */
    const i = html.indexOf("entry('view'");
    const e = html.slice(i, i + 260);
    assert.ok(/tbIs3D\(\) \? '2D' : '3D'/.test(e), 'the glyph must be the target view');
    assert.ok(/tbIs3D\(\) \? 'tactics\.view_2d' : 'tactics\.view_3d'/.test(e),
        'and so must the label');
  });

  it('and presses the button for the view it names', () => {
    /* Found by mutation: the label was made direction-aware and the
       CLICK was not, so a premium coach in 2D read "3D", pressed it,
       and the handler clicked the 2D button — which is already active,
       and whose own listener returns early on exactly that. A button
       that does nothing, which is what the label change was for. */
    const init = fn('tbMenuInit(hooks)');
    const i = init.indexOf("if (which === 'view')");
    assert.ok(i !== -1, 'the view entry has no click handler');
    const h = init.slice(i, i + 300);
    assert.ok(/tbIs3D\(\) \? '2d' : '3d'/.test(h),
        'it must press the toggle for the OTHER view');
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

  it('the toolbar is hidden in BOTH views, and unconditionally', () => {
    /* It was `is3d ? ' tb-controls-3d' : ''`. The flat board wears the
       menu now, so there is no view left in which the strip shows —
       and a leftover condition would put a 32-control strip back above
       a full-bleed window on exactly the clubs this change is for. */
    assert.ok(/class="tb-controls tb-controls-off"/.test(app),
        'the hide class must be unconditional');
    assert.ok(!/tb-controls-3d/.test(app) && !/tb-controls-3d/.test(css),
        'the 3D-flavoured name must be gone from both files');
    assert.ok(/\.tb-controls-off \{ display:none !important; \}/.test(css),
        'and it must actually hide it');
  });

  it('the entries have no ground of their own', () => {
    /* Nine dark pills stacked down the corner read as a panel sitting
       on the pitch. Without them they read as labels on it — but that
       leaves the text with nothing between it and a light turf theme,
       so the shadow is not decoration here, it is the legibility. */
    const e = rule('.tb-m-entry');
    assert.ok(!/background:/.test(e), 'no plate behind an entry: ' + e);
    assert.ok(!/backdrop-filter/.test(e),
        'and nothing to blur, with no ground to blur through');
    assert.ok(/text-shadow:/.test(e),
        'a label with no ground still has to be readable over the turf');
    /* The hamburger KEEPS its ground — it is a button, and it is the
       one thing that has to be findable before the menu is open. */
    assert.ok(/background:rgba\(/.test(rule('.tb-m-btn')),
        'the hamburger itself is a control and keeps its plate');
  });

  it('hovering one entry lifts it and drops the others', () => {
    assert.ok(/\.tb-m-rail:hover \.tb-m-entry \{ opacity:\.\d+; \}/.test(css),
        'the rest must dim while one is pointed at');
    assert.ok(/\.tb-m-rail:hover \.tb-m-entry:hover,\s*\n\.tb-m-entry\.tb-m-hot \{ opacity:1/
        .test(css), 'and the one under the pointer must come back up');
    /* Transitions mention opacity too, so strip them before asking
       whether the entry SETS one — the first version of this read the
       word inside `transition:` and failed on correct CSS. */
    const decls = rule('.tb-m-entry').replace(/transition:[^;]*;/g, '');
    assert.ok(!/opacity/.test(decls),
        'but a rail nobody is pointing at must be evenly legible — the ' +
        'dimming belongs to the :hover state, not to the entry');
  });

  it('the growth is on the children, never on the entry', () => {
    /* THE TRAP. A transform on .tb-m-entry makes it the containing
       block for its absolutely positioned descendants — so scaling the
       entry would have scaled the PANEL inside it, and the club
       library would have opened 8% larger and resampled. */
    assert.ok(!/transform:/.test(rule('.tb-m-entry')),
        'the entry itself must never be transformed — it is the ' +
        'positioning parent of its own panel');
    assert.ok(/\.tb-m-entry\.tb-m-hot > \.tb-m-label \{ transform:scale\(/.test(css),
        'the icon and label carry the growth instead');
    assert.ok(/\.tb-m-ico, \.tb-m-label \{\s*\n\s*transform-origin:left center;/.test(css),
        'grown from the left, which is the rail\'s own axis — from the ' +
        'centre they would drift sideways as they grew');
  });

  it('a panel opens centred on the entry it belongs to', () => {
    ['.tb-m-panel', '.tb-m-sub', '.tb-m-kit-opts'].forEach((sel) => {
      const r = rule(sel);
      assert.ok(/top:50%/.test(r), sel + ' must be centred on its parent');
      assert.ok(/transform:translateY\(-50%\)/.test(r),
          sel + ' must pull itself back by half its own height');
    });
  });

  it('and a centred panel is clamped back inside the window', () => {
    /* Centring is right for a five-row panel and wrong for the club
       library: 620px of it, opening off the second entry from the top,
       would have half of it above the window — where the wrapper's
       overflow:hidden simply cuts it off.

       CSS cannot see the sum that decides this, so it is measured. */
    const init = fn('tbMenuInit(hooks)');
    assert.ok(/const clampPanel = \(entry\) => \{/.test(init),
        'a centred panel must be measured against the window');
    assert.ok(/panel\.style\.marginTop = '';/.test(init),
        'and measured from the CENTRED position, or each open compounds ' +
        'the last one\'s offset');
    assert.ok(/getBoundingClientRect/.test(init.slice(init.indexOf('clampPanel'))),
        'measured, not guessed');
    /* Taller than the window: pin the top. Pinning the bottom instead
       hides the search box, which is the first thing you reach for. */
    assert.ok(/Math\.max\(\(w\.bottom - PAD\) - p\.bottom, \(w\.top \+ PAD\) - p\.top\)/
        .test(init),
        'a panel taller than the window must keep its TOP on screen');
    /* And after the class, not before — a display:none element
       measures zero on every edge. */
    const open = init.slice(init.indexOf('const open = () => {'));
    assert.ok(open.indexOf("classList.toggle('tb-m-hot'") <
              open.indexOf('clampPanel(entry)'),
        'the panel must be visible before it is measured');
  });

  it('the two controls 3D never needed a home for get one', () => {
    /* Both are 2D-only: 3D hides the orientation button outright, and
       in 3D a click on a mesh selects it so the select MODE is
       redundant. Unadopted they are not merely awkward — .tb-controls
       is display:none, so they would be gone. */
    assert.ok(/adopt\('gear', \['#tb-orient'\]/.test(init),
        'orientation must move into the Field panel');
    assert.ok(/adopt\('draw', \['#tb-select-tool'\]/.test(init),
        'select mode must move into the Draw panel');
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

  it('BOTH button rows are hidden, for different reasons', () => {
    /* One holds New Board, which the hamburger carries instead. The
       other held Save and Save As, which are ADOPTED out — so the row
       is left empty, and an empty row still holds its padding. That
       padding is space inside the card below the window, which is
       exactly what stops the window reaching the card's bottom edge.

       Hiding the wrapper cannot affect the buttons: they are no
       longer its children. */
    const rows = (app.match(/class="tb-btn-row[^"]*"/g) || []);
    assert.strictEqual(rows.length, 2, 'expected a New Board row and a Save row');
    rows.forEach((r) => assert.ok(r.indexOf('tb-controls-off') !== -1,
        'this row keeps its space: ' + r));
  });

  it('nothing is left holding space between the window and the card edge', () => {
    /* The window bleeds to all four edges of the card, which is only
       honest if nothing renders after it. Everything that does is
       either adopted into the menu at runtime or hidden — and this
       lists which, so adding a section below the board without
       handling it fails here rather than by pushing the window up. */
    /* Anchored past the FIELD, which lives inside the window now —
       the old anchor was the orbit hint, the last thing before the
       field back when the field was a sibling of the card. */
    const i = app.indexOf('tbMenuHtml()');
    const after = app.slice(app.indexOf('tb-frames-section', i),
        app.indexOf('function bindTactics', i));
    const sections = ['tb-frames-section', 'tb-tag-section', 'tb-match-section',
      'tb-btn-row', 'tb-saved-list', 'tb-lib-list'];
    sections.forEach((c) => {
      if (after.indexOf(c) === -1) return;      // not rendered here at all
      const adopted = init.indexOf(c) !== -1;
      const hidden = new RegExp('class="' + c + ' tb-controls-off"').test(app);
      assert.ok(adopted || hidden,
          c + ' renders below the window and is neither adopted nor hidden');
    });
  });

  it('the board itself renders INSIDE the window', () => {
    /* The whole point of the change: one window, both views. The flat
       board used to be a sibling of the wrapper and only moved inside
       it while a draw tool was on in 3D (tbDrawSurface). Rendered
       outside, it would sit below a full-bleed window with the menu
       floating over empty turf. */
    const open = app.indexOf('id="tb-3d-wrap"');
    const field = app.indexOf('id="tb-field"');
    const frames = app.indexOf('tb-frames-section', open);
    assert.ok(open !== -1 && field > open && field < frames,
        'the field must render between the window opening and the frames');
    assert.ok(/let fieldCls = 'tb-field tb-fit'/.test(app),
        'and carry tb-fit, which is what gives it the centred rect');
  });

  it('the camera menu and the orbit hint are 3D only', () => {
    /* 2D is zenital by construction: there is no camera to pick and
       nothing to orbit, so both would be controls that cannot act. */
    assert.ok(/is3d \? tbCamsHtml\(\)/.test(app),
        'the camera menu must be conditional on the 3D view');
    assert.ok(/is3d \? tbCamsHtml\(\)[\s\S]{0,160}tb-3d-hint/.test(app),
        'and the orbit hint must ride the same condition');
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

  it('and it is gated on the EDITOR being open, not on the view', () => {
    /* Moving it out of the mount block means it no longer inherits
       that block's condition, so it has to carry its own — and the
       condition changed with this feature. It was `tbIs3D()`; both
       views wear the menu now, and the question that decides the
       layout is whether the editor rendered at all. renderTactics'
       other half is the board-type picker, which keeps a plain card
       and a plain header. */
    const i = at('tbMenuInit({onFormation');
    const before = bare.slice(Math.max(0, i - 900), i);
    assert.ok(/if \(tbEditorOpen\(\)\) \{/.test(before),
        'the menu must be built whenever the editor is open');
    assert.ok(!/if \(tbIs3D\(\)\) \{/.test(before),
        'and NOT only in 3D — that is the gate this change replaced');
  });

  it('tbEditorOpen asks the DOM, and asks for the window', () => {
    /* No second copy of the answer to keep in step: both screens
       render under `tactics`, and the wrapper exists on exactly one
       of them. Every caller runs after the render. */
    const f = fn('tbEditorOpen()');
    assert.ok(/return !!document\.getElementById\('tb-3d-wrap'\)/.test(f),
        'it must probe for the window itself');
    assert.ok(!/localStorage|_tb/.test(f),
        'and hold no state of its own');
  });
});

describe('the rail and the camera share one vertical axis', () => {

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

  it('the floating controls do not eat the board underneath them', () => {
    /* THE BUG THIS CAUGHT. Both `.tb-m` and `.tb-cams` hold a list
       that fades with OPACITY rather than display — so it can animate
       — which means each container keeps a full-height layout box
       whether it is open or shut. With no plate drawn on it, nothing
       showed for that box, and it was still a hit target: roughly
       200x340 of dead pitch in the top-left corner and a strip in the
       top-right. In 3D it went unnoticed, because board3d listens on
       the WRAPPER and a swallowed click still bubbled up to it. In 2D
       it means the players in that corner cannot be dragged,
       double-clicked to number, or ctrl-clicked to select.

       Derived rather than pinned: any absolutely positioned overlay in
       this window that holds a fade-out list has to be transparent to
       the pointer, and the control inside it has to take it back. */
    [['.tb-m', '.tb-m-top'], ['.tb-cams', '.tb-cams-btn']].forEach(
      ([box, ctrl]) => {
        assert.ok(/pointer-events:none/.test(rule(box)),
            box + ' covers pitch it does not draw on and must not be a hit ' +
            'target');
        assert.ok(/pointer-events:auto/.test(rule(ctrl)),
            ctrl + ' must take the pointer back, or the menu cannot be opened');
      });
    /* And the two lists inside them turn their own back on when open,
       which is why neither needs naming above. */
    assert.ok(/pointer-events:none/.test(rule('.tb-m-rail')) &&
              /pointer-events:auto/.test(rule('.tb-m.tb-m-open .tb-m-rail')),
        'the rail is off while shut and on while open');
    assert.ok(/pointer-events:none/.test(rule('.tb-cams-list')) &&
              /pointer-events:auto/.test(rule('.tb-cams.tb-cams-open .tb-cams-list')),
        'and so is the camera list');
  });

  it('the cameras highlight and dim like the menu entries', () => {
    const btn = rule('.tb-cams-list .tb-cam-btn');
    assert.ok(/background:none/.test(btn), 'no plate behind a camera thumb');
    assert.ok(/filter:drop-shadow/.test(btn),
        'a drawing with no ground needs its own shadow over the turf — and ' +
        'drop-shadow, not text-shadow, because the mark is an SVG stroke');
    assert.ok(/\.tb-cams-list:hover \.tb-cam-btn \{ opacity:\.\d+; \}/.test(css),
        'the rest must dim while one is pointed at');
    assert.ok(/\.tb-cams-list:hover \.tb-cam-btn:hover \{ opacity:1/.test(css),
        'and the one under the pointer come back up');
    /* The SVG grows, not the button — a scaled 38px button would
       reflow the column it is centred in. Same reason the menu grows
       its icon and label rather than the entry. */
    assert.ok(/\.tb-cams-list:hover \.tb-cam-btn:hover svg \{ transform:scale\(/.test(css),
        'the drawing carries the growth');
    assert.ok(!/transform:scale/.test(btn),
        'the button itself must not scale — the column is centred on it');
  });

  it('play sits ON the centre line, not the rail', () => {
    /* The rail used to be centred as a whole, so play drifted upward
       as frames were added — the one control that should be findable
       in the same place every time was the one that moved. Anchoring
       the rail half a tile above centre puts PLAY across it, and the
       frames grow downward. */
    const r = rule('.tb-rail');
    assert.ok(/top:calc\(50% - var\(--tb-tile\) \/ 2\)/.test(r),
        'the rail must start half a tile above centre');
    assert.ok(/transform:none/.test(r),
        'and drop the centring translate, or it is centred twice');
    assert.ok(/max-height:calc\(50% - [\d.]+rem\)/.test(r),
        'capped against the WINDOW — the rail is absolutely positioned, ' +
        'so a percentage resolves against the wrapper it must stay inside');
  });

  it('and the 3D floor really does clear the camera stack', () => {
    /* Derived, not pinned. The floor exists because the camera list
       opens down this same edge and the centre line is above the
       bottom of that stack on a short window. So: add the stack up
       from the tokens, and require the floor to cover it. */
    const px = (v) => /rem$/.test(v) ? parseFloat(v) * 16 : parseFloat(v);
    const tile = px(/--tb-tile:([\d.]+px)/.exec(css)[1]);
    const cams = rule('.tb-cams');
    const list = rule('.tb-cams-list');
    const btns = (fn('tbCamsHtml()').match(/one\('/g) || []).length;
    assert.ok(btns >= 3, 'expected the camera buttons; got ' + btns);
    const need =
        px(/top:([\d.]+rem)/.exec(cams)[1]) +          // the stack's inset
        tile +                                          // the camera button
        px(/margin-top:([\d.]+rem)/.exec(list)[1]) +    // gap under it
        btns * tile +
        (btns - 1) * px(/gap:([\d.]+rem)/.exec(list)[1]);
    const floor = px(/top:max\(calc\(50% - var\(--tb-tile\) \/ 2\), ([\d.]+rem)\)/
        .exec(rule('.tb-3d-wrap:not(.tb-wrap-2d) .tb-rail'))[1]);
    assert.ok(floor >= need,
        'the floor is ' + floor + 'px and the camera stack reaches ' +
        need + 'px — they will overlap on a short window');
  });

  it('but only in 3D, where there is a camera list at all', () => {
    assert.ok(css.indexOf('.tb-3d-wrap:not(.tb-wrap-2d) .tb-rail') !== -1,
        'the clearance must be scoped to the view that needs it — 2D has ' +
        'no camera stack, and a floor there would push play off centre ' +
        'on exactly the short windows this is meant to help');
  });

  it('the add button survives a scrolled strip', () => {
    /* It is the last child of the scrolling strip, so with enough
       frames it scrolled off the bottom — and the only way to add
       another was to scroll down to the button first. */
    const add = rule('.tb-rail .tb-frame-add');
    assert.ok(/position:sticky/.test(add) && /bottom:0/.test(add),
        'the add button must stay pinned to the bottom of the strip');
    assert.ok(/flex-shrink:0/.test(add),
        'and keep its height — a sticky item squashed to nothing is ' +
        'still invisible');
    /* Sticky floats it over the tiles it has scrolled past, so it
       needs a ground; transparent, the numbers show through it. */
    assert.ok(/background:rgba\(/.test(add),
        'a sticky element over its own scrolled content needs an opaque ground');
    /* And the premise for choosing sticky over moving it: the button
       is written into the strip's innerHTML and re-bound by id on
       every render, so lifting it into a sibling would mean two render
       targets and a button that only sometimes gets its listener. */
    const r = fn('renderFrameStrip()');
    assert.ok(/html \+= `<button class="tb-frame-add" id="tb-frame-add"/.test(r),
        'the add button is part of the strip markup');
    assert.ok(/strip\.innerHTML = html;/.test(r) &&
              /strip\.querySelector\('#tb-frame-add'\)\?\.addEventListener/.test(r),
        'and is re-bound by id after the strip is rewritten');
  });

  it('the strip takes its height from the rail, not from a second cap', () => {
    const strip = rule('.tb-rail .tb-frames-strip');
    assert.ok(/flex:1 1 auto/.test(strip) && /min-height:0/.test(strip),
        'it must flex into what the rail leaves after play');
    assert.ok(!/max-height:min\(/.test(strip),
        'a vh cap of its own would disagree with the rail\'s — two ' +
        'independent height limits is how the column ends up shorter ' +
        'than the room it has');
    assert.ok(/min-height:0/.test(rule('.tb-rail .tb-frames-section')),
        'and the section between them must be shrinkable too, or the ' +
        'default content-based min-height stops the strip ever scrolling');
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

  it('the short panels rest on the pitch, and carry their own legibility', () => {
    /* REVERSED, on the owner's call, and the reason it was safe to
       reverse: these panels are a handful of controls, not prose. What
       made the old opaque rule necessary was TEXT over turf, so the
       ground is traded for a text-shadow rather than simply dropped —
       and the one panel that really is prose keeps its ground below. */
    ['.tb-m-panel', '.tb-m-sub', '.tb-m-kit-opts'].forEach((sel) => {
      const r = rule(sel);
      const bg = /background:([^;]+);/.exec(r);
      assert.ok(bg, sel + ' must still declare a ground, however faint');
      const a = /rgba\([^)]*,\s*([\d.]+)\)/.exec(bg[1]);
      assert.ok(a && parseFloat(a[1]) < 0.5,
          sel + ' must be see-through, not a second window: ' + bg[1]);
      assert.ok(/text-shadow:/.test(r),
          sel + ' carries text over turf now — without a shadow the ' +
          'ground was the only thing making it readable');
      assert.ok(!/box-shadow:/.test(r),
          sel + ' must drop its drop-shadow too — a heavy shadow under ' +
          'a sheet you can see through announces a box that is not there');
    });
  });

  it('but the library keeps a solid one, because it is a long list', () => {
    /* Two scrolling columns. Rows sliding under half-visible turf is
       the one case where the see-through treatment stops working, so
       this panel opts back out by id. */
    const r = rule('#tb-panel-open');
    assert.ok(/background:#[0-9a-f]{6}/i.test(r),
        'the library must have a solid ground');
    assert.ok(/box-shadow:/.test(r),
        'and the shadow that separates it from the board');
    assert.ok(/text-shadow:none/.test(r),
        'and switch the panel text-shadow back off — it is a page again');
    /* An id beats the class it is overriding, so this cannot be a
       document-order accident. */
    assert.ok(css.indexOf('#tb-panel-open {') > 0);
  });

  it('the panel opens beside the LABEL, not beside the padding box', () => {
    /* The entry's .6rem of right padding was invisible while it had a
       plate; with the plate gone it became dead air, and a panel 6px
       off the box read as 16px off the word. */
    const gap = /left:calc\(100% ([-+]) ([\d.]+)rem\)/.exec(rule('.tb-m-panel'));
    assert.ok(gap, 'the panel must be positioned from the entry\'s right edge');
    const pad = /padding:[\d.]+rem ([\d.]+)rem/.exec(rule('.tb-m-entry'));
    assert.ok(pad, 'the entry must declare the padding this pulls back into');
    const off = (gap[1] === '-' ? -1 : 1) * parseFloat(gap[2]);
    assert.ok(off < parseFloat(pad[1]),
        'the panel must sit inside the entry\'s own right padding (' +
        off + 'rem against ' + pad[1] + 'rem), or it reads as floating away');
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

  it('the flush class is toggled OFF as well as on', () => {
    /* The dangerous half. Added in the tactics code and never
       removed, every other page in the app would lose its 2rem — and
       the symptom would appear on a page nobody was working on. One
       expression, both arms. */
    assert.ok(/classList\.toggle\('dashboard-flush',\s*\n?\s*currentPage === 'tactics' && tbEditorOpen\(\)\)/
        .test(bare), 'the flush class must be a toggle on a condition, not an add');
    assert.ok(!/classList\.add\('dashboard-flush'\)/.test(bare),
        'never added unconditionally');
  });

  it('the editor renders no header, in either view', () => {
    /* The board-type picker still needs a title — it is a page with
       nothing else on it. The editor's is announced instead, and that
       is now true of 2D as well: the header was the last thing keeping
       the flat board a different shape from the 3D one. */
    const titles = (app.match(/<h2 class="page-title">\$\{t\('page\.tactical_board'\)\}<\/h2>/g) || []);
    assert.strictEqual(titles.length, 1, 'only the picker renders one');
    assert.ok(!/is3d \? '' : `<h2 class="page-title">/.test(app),
        'and no conditional header is left in the editor');
    /* The one that survives must be the PICKER's. Bounded by the
       editor's own return, which is what tells the two halves of
       renderTactics apart in a comment-stripped string. */
    const editor = app.indexOf('<div class="card tb-card-window">');
    assert.ok(editor !== -1, 'the editor card is not rendered');
    assert.ok(app.indexOf('<h2 class="page-title">${t(\'page.tactical_board\')}</h2>') < editor,
        'the surviving title must be the picker\'s, above the editor');
  });

  it('the announcement fires on entering the tab, not on every render', () => {
    /* isNav is already the distinction between a navigation and the
       many re-renders that are not one — a firestore sync, a language
       change, the category bar, and every toggle in the board's own
       menu. Fired on those, the title would flash each time the coach
       picked a formation. */
    assert.ok(/if \(isNav && currentPage === 'tactics' && tbEditorOpen\(\)\)/.test(bare),
        'the flash must be gated on isNav');
    /* And the zoom rides the same signal, for the same reason turned
       around: a re-render is not a fresh visit, and snapping the board
       back to fit under a coach who has zoomed in would make the zoom
       unusable. */
    const i = bare.indexOf("if (isNav && currentPage === 'tactics' && tbEditorOpen())");
    assert.ok(/tbResetView\(\);/.test(bare.slice(i, i + 700)),
        'the view must be reset on entering the tab, not on every render');
    assert.ok(!/tbResetView\(\)[\s\S]{0,40}\n\s*tbFit2DBoard/.test(bare),
        'and tbFit2DBoard must NOT reset it — it runs on every resize tick');
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

describe('a hovered board row has room to grow', () => {
  it('the column pad covers what scale() adds, on both sides', () => {
    /* `.tb-saved-item` grows by transform:scale() on hover. The
       column clips horizontally — it must, or a long board name
       widens it — and overflow clips at the PADDING box, so the room
       for that growth has to be padding. With none, both edges of
       every hovered row were shaved off.

       Derived, not pinned: read the scale factor, the panel width and
       the pad, and check the arithmetic. Changing the panel width or
       the hover effect without the pad then fails here rather than by
       quietly cutting the rows again. This is the third time the same
       rule has come up — the frame delete cross, the drawing overlay,
       and now this. */
    const hov = css.slice(css.indexOf('.tb-saved-item:hover {'),
        css.indexOf('}', css.indexOf('.tb-saved-item:hover {')));
    const sc = /transform:scale\(([\d.]+)\)/.exec(hov);
    assert.ok(sc, 'no hover scale found: ' + hov);
    const scale = parseFloat(sc[1]);

    const panel = css.slice(css.indexOf('#tb-panel-open {'),
        css.indexOf('}', css.indexOf('#tb-panel-open {')));
    const w = parseInt(/width:min\((\d+)px/.exec(panel)[1], 10);
    const colW = w / 2;                       // two equal columns, gap ignored
    const overhangPerSide = (colW * scale - colW) / 2;

    const pad = parseFloat(/--tb-lib-pad:([\d.]+)px/.exec(css)[1]);
    const col = css.slice(css.indexOf('#tb-panel-open .tb-m-col {'),
        css.indexOf('}', css.indexOf('#tb-panel-open .tb-m-col {')));
    assert.ok(/padding:var\(--tb-lib-pad\)/.test(col),
        'the column must carry that pad: ' + col);
    assert.ok(pad >= overhangPerSide,
        'a row grows ' + overhangPerSide.toFixed(1) + 'px past each edge of a ' +
        colW + 'px column, into a ' + pad + 'px pad — it is clipped');
  });

  it('the column still clips, which is why the pad is needed', () => {
    const col = css.slice(css.indexOf('#tb-panel-open .tb-m-col {'),
        css.indexOf('}', css.indexOf('#tb-panel-open .tb-m-col {')));
    assert.ok(/overflow-x:hidden/.test(col),
        'without this a long board name widens the column instead');
  });
});
