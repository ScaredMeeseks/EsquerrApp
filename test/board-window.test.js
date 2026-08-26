/* The board window: the flat board fitted into it, zoomed and panned.
 *
 * ⚠ Same warning as board3d-menu.test.js — there is no jsdom here, so
 * nothing below renders a board or reads a pixel.
 *
 * The difference is that most of this file does NOT settle for source
 * text. tbFitWidth and tbZoomView were pulled out of the DOM work
 * precisely so they could be evaluated and checked against arithmetic
 * done independently here: a fitted board's footprint is measured
 * against the window it has to sit in, and a zoom is checked by
 * pushing a point through the transform the browser will actually
 * apply and confirming it has not moved. Those are real answers.
 *
 * What is still source-only, and listed as a hand check in the plan:
 * that the gestures feel right, and that a drag lands where the cursor
 * is at 4x zoom. The second is the one that matters — it is the whole
 * premise of using a CSS transform — and it cannot be settled here.
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const app = fs.readFileSync(path.join(ROOT, 'js', 'app.js'), 'utf8');
const css = fs.readFileSync(path.join(ROOT, 'css', 'style.css'), 'utf8');
const bare = app.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

/* Same slicer as the sibling suites: bounded by the next declaration
   at the SAME indent, because a fixed two-space bound swallowed
   thousands of lines for anything nested in bindTactics. */
const fn = (name) => {
  const i = bare.indexOf('function ' + name);
  assert.ok(i !== -1, name + ' not found in js/app.js');
  const lineStart = bare.lastIndexOf('\n', i) + 1;
  const indent = bare.slice(lineStart, i).match(/^\s*/)[0];
  const j = bare.indexOf('\n' + indent + 'function ', i + 10);
  return bare.slice(i, j === -1 ? bare.length : j);
};

/* The two pure helpers, lifted out and run for real. Everything they
   touch is an argument — no DOM, no localStorage — which is the whole
   reason they are separate functions. */
const api = new Function('TB_ZOOM_MIN', 'TB_ZOOM_MAX',
    fn('tbRotatedBox(boardType, vertical)') + '\n' +
    fn('tbFitWidth(availW, availH, ax, rotated)') + '\n' +
    fn('tbZoomView(view, rect, factor, mx, my)') + '\n' +
    'return {tbRotatedBox, tbFitWidth, tbZoomView};')(0.5, 6);

describe('the flat board is fitted to the window', () => {
  /* The footprint a fitted box actually occupies on screen. Written
     here from the definition of rotate(-90deg) rather than imported
     from the code under test — if this repeated the code's own
     branch, it would agree with a wrong answer. */
  const footprint = (w, ax, rotated) =>
      rotated ? {w: w * ax, h: w} : {w: w, h: w * ax};

  const cases = [
    ['a wide window, a full pitch', 1600, 700, 68 / 105, false],
    ['a narrow window, a full pitch', 500, 900, 68 / 105, false],
    ['a square window', 800, 800, 68 / 105, false],
    ['a vertical full board (tall, not rotated)', 1200, 700, 105 / 68, false],
    ['a rotated half board', 1400, 800, 0.77, true],
    ['a rotated area board', 600, 1000, 0.58, true],
    ['a rotated board in a wide short window', 1900, 420, 0.77, true]
  ];

  cases.forEach(([name, availW, availH, ax, rotated]) => {
    it('fits inside the window: ' + name, () => {
      const w = api.tbFitWidth(availW, availH, ax, rotated);
      const f = footprint(w, ax, rotated);
      /* A pixel of slack for floating point, and no more — the point
         of the test is that a board is never wider or taller than the
         space it was given. */
      assert.ok(f.w <= availW + 1e-6, name + ': ' + f.w + ' wide in ' + availW);
      assert.ok(f.h <= availH + 1e-6, name + ': ' + f.h + ' tall in ' + availH);
    });

    it('and is as large as it can be: ' + name, () => {
      /* The other half, and the half a "return 0" would pass without.
         The fit must touch at least one of the two edges, or there was
         room left over. */
      const w = api.tbFitWidth(availW, availH, ax, rotated);
      const f = footprint(w, ax, rotated);
      assert.ok(Math.abs(f.w - availW) < 1e-6 || Math.abs(f.h - availH) < 1e-6,
          name + ': neither edge is reached — ' + f.w + 'x' + f.h +
          ' in ' + availW + 'x' + availH);
    });
  });

  it('the rotated case is NOT the same arithmetic as the upright one', () => {
    /* Guards the branch itself. Dropping it looks harmless — a half
       board's aspect is under 1 either way — but a rotated board fitted
       by the upright formula overflows the window's height by 1/ax. */
    const upright = api.tbFitWidth(1400, 800, 0.77, false);
    const rotated = api.tbFitWidth(1400, 800, 0.77, true);
    assert.notStrictEqual(upright, rotated,
        'the two constraints must swap when the box is turned');
    assert.ok(upright * 0.77 <= 800 + 1e-6);
    assert.ok(rotated <= 800 + 1e-6, 'the rotated box is as TALL as it is wide');
  });

  it('a degenerate aspect asks for nothing rather than NaN', () => {
    [0, -1, NaN, undefined].forEach((ax) =>
      assert.strictEqual(api.tbFitWidth(900, 600, ax, false), 0,
          'ax=' + ax + ' must yield 0, not a width nobody can lay out'));
  });

  it('only half and area turn, and only when vertical', () => {
    assert.strictEqual(api.tbRotatedBox('half', true), true);
    assert.strictEqual(api.tbRotatedBox('area', true), true);
    assert.strictEqual(api.tbRotatedBox('full', true), false,
        'a vertical FULL board is rendered tall, not rotated');
    assert.strictEqual(api.tbRotatedBox('half', false), false);
  });
});

describe('zooming holds the point under the cursor', () => {
  /* The transform the browser will apply, written out from the CSS
     definition of transform-origin:50% 50%: a point p is painted at
     c + k(p - c) + T. If this file derived it from the code instead,
     the test would confirm the code agrees with itself. */
  const paint = (view, rect, p) => ({
    x: rect.cx + view.k * (p.x - rect.cx) + view.x,
    y: rect.cy + view.k * (p.y - rect.cy) + view.y
  });

  const rect = {w: 800, h: 518, cx: 500, cy: 300};

  [['zoom in, off centre', 1.4, 180, 120],
   ['zoom out, off centre', 0.7, 900, 500],
   ['zoom in, dead centre', 1.25, 500, 300],
   ['zoom in from an already panned view', 1.6, 640, 210]
  ].forEach(([name, factor, mx, my]) => {
    it(name, () => {
      const before = /panned/.test(name)
        ? {k: 2.2, x: -140, y: 65} : {k: 1, x: 0, y: 0};
      /* Which board point is under the cursor before the wheel —
         inverting the paint map, not asking the code. */
      const p = {x: rect.cx + (mx - rect.cx - before.x) / before.k,
                 y: rect.cy + (my - rect.cy - before.y) / before.k};
      assert.deepStrictEqual(
          {x: Math.round(paint(before, rect, p).x),
           y: Math.round(paint(before, rect, p).y)},
          {x: mx, y: my}, 'the inverse is wrong — the test is broken, not the code');

      const after = api.tbZoomView(before, rect, factor, mx, my);
      const now = paint(after, rect, p);
      assert.ok(Math.abs(now.x - mx) < 1e-6 && Math.abs(now.y - my) < 1e-6,
          'the point under the cursor moved to ' +
          now.x.toFixed(2) + ',' + now.y.toFixed(2) + ' from ' + mx + ',' + my);
      assert.ok(Math.abs(after.k - before.k * factor) < 1e-9, 'and the zoom applied');
    });
  });

  it('clamps, and stops dead at the clamp rather than drifting', () => {
    /* Two things. The clamp itself, and that a wheel notch which
       changes nothing changes NOTHING — an unclamped translate at a
       clamped scale would slide the board sideways every notch once
       the coach reached the end of the zoom. */
    let v = {k: 1, x: 0, y: 0};
    for (let i = 0; i < 40; i++) v = api.tbZoomView(v, rect, 1.5, 700, 400);
    assert.strictEqual(v.k, 6, 'must not zoom past the maximum');
    const again = api.tbZoomView(v, rect, 1.5, 120, 90);
    assert.deepStrictEqual(again, v, 'a refused notch must move nothing at all');

    for (let i = 0; i < 60; i++) v = api.tbZoomView(v, rect, 0.6, 700, 400);
    assert.strictEqual(v.k, 0.5, 'must not zoom past the minimum');
  });

  it('the clamps are the ones the code declares', () => {
    /* The numbers above are pinned to the source rather than repeated
       as literals, so widening the range fails here on purpose. */
    assert.ok(/TB_ZOOM_MIN = 0\.5, TB_ZOOM_MAX = 6;/.test(bare),
        'the zoom range moved; the assertions above assume 0.5 and 6');
  });
});

describe('the transform carries the quarter turn with it', () => {
  it('an inline transform re-declares every one the stylesheet gives it', () => {
    /* THE TRAP. `.tb-vertical.tb-half` sets transform:rotate(-90deg),
       and an inline transform replaces a rule outright rather than
       adding to it — so a vertical half board would have quietly
       un-rotated the first time a coach touched the wheel.

       Derived rather than pinned: every transform the stylesheet
       applies to the FIELD is collected here, and each has to appear
       in what tbApplyView composes. Adding a second CSS transform on
       the board later fails this until it is composed in too. */
    /* Comments stripped FIRST. Without that the scan reached back
       through the prose above a rule — one paragraph names
       `.tb-vertical` while explaining why the geometry is inline — and
       collected the halfway line's own transform as if it were the
       board's. The test failed on correct code, which is the right way
       round but still a broken scan. */
    const sheet = css.replace(/\/\*[\s\S]*?\*\//g, '');
    /* And only selectors whose LAST compound is the field itself. A
       descendant rule like `.tb-field .tb-corner` transforms a child,
       which an inline transform on the board cannot drop. */
    const fromCss = [];
    const re = /([^{}]*)\{([^}]*)\}/g;
    let m;
    while ((m = re.exec(sheet))) {
      const decl = m[2].match(/transform:\s*([^;]+);/);
      if (!decl) continue;
      const hits = m[1].split(',').map((s) => s.trim()).filter((s) => {
        const last = s.split(/[\s>+~]+/).pop();
        return /\.tb-(?:field|vertical)\b/.test(last) &&
            !/tb-draw-surface|tb-field-readonly|tb-fit/.test(last);
      });
      if (hits.length) fromCss.push(decl[1].trim());
    }
    assert.ok(fromCss.length >= 1,
        'expected at least the vertical half/area rotation; found none — ' +
        'the selector scan is broken, not the code');

    /* Present in the function is NOT enough, and a mutation run said
       so: deleting `+ rot` from the assignment left the string
       `rotate(-90deg)` sitting in the line above, and an
       indexOf-the-whole-function check passed on code that had just
       stopped rotating anything. So: the term has to be CONCATENATED
       into the transform, and the term itself has to carry each
       transform the stylesheet declares. */
    const applied = fn('tbApplyView()');
    const assign = applied.slice(applied.indexOf('field.style.transform ='));
    const rhs = assign.slice(0, assign.indexOf(';') + 1);
    const m2 = /\+ (\w+);$/.exec(rhs);
    assert.ok(m2, 'the transform must END with a term carrying the CSS ' +
        'transforms it replaces: ' + rhs);
    const term = new RegExp('const ' + m2[1] + ' =[\\s\\S]*?;').exec(applied);
    assert.ok(term, m2[1] + ' is concatenated in but never defined here');
    fromCss.forEach((t) => assert.ok(term[0].indexOf(t) !== -1,
        'the stylesheet puts `' + t + '` on the board and the inline ' +
        'transform does not reproduce it — it will be silently dropped'));
  });

  it('and only for the boards that are actually turned', () => {
    const applied = fn('tbApplyView()');
    assert.ok(/tbRotatedBox\(tbBoardType\(\), tbVertical\(\)\)/.test(applied),
        'the rotation must be conditional on the same test the fit uses');
  });

  it('the fit block outranks the rules it has to beat', () => {
    /* .tb-field.tb-fit and .tb-vertical.tb-half are the same
       specificity (0,2,0), so document order decides. Written beside
       the other .tb-field rules at the top of the file, the fit would
       LOSE its max-width:none and the board would cap at 820px inside
       a 1600px window. */
    const fit = css.indexOf('.tb-field.tb-fit {');
    const rotated = css.indexOf('.tb-vertical.tb-half,');
    assert.ok(fit !== -1 && rotated !== -1, 'both rules must exist');
    assert.ok(fit > rotated,
        '.tb-field.tb-fit must come after .tb-vertical.tb-half, or it ' +
        'loses the tie on document order');
    const block = css.slice(fit, css.indexOf('}', fit));
    assert.ok(/position:absolute/.test(block) && /max-width:none/.test(block),
        'the fit must free the board from the flow and from the 820px cap');
  });
});

describe('the gestures the window answers', () => {
  const g = fn('tbBindViewGestures()');

  it('pans on the same buttons the 3D camera does', () => {
    /* board3d: right, middle, or shift-drag. Two views that answer
       different gestures is the thing this whole change is undoing. */
    assert.ok(/e\.button === 1 \|\| e\.button === 2/.test(g),
        'middle and right must pan');
    assert.ok(/e\.shiftKey/.test(g), 'and shift-drag');
    assert.ok(/e\.button === 0 && \(e\.shiftKey \|\| !onField\)/.test(g),
        'a plain drag on the surround must pan too — there is nothing ' +
        'else it could mean, and it is what a hand tries first');
  });

  it('right-CLICK still opens the seven context menus', () => {
    /* The board binds contextmenu on circles, balls, cones, arrows,
       rects, labels and the silhouette. Right-drag pans; only the
       event that follows a real drag may be swallowed, and "real" is
       board3d's own four-pixel slop. */
    assert.ok(/Math\.abs\(dx\) \+ Math\.abs\(dy\) < 4/.test(g),
        'a press that has barely moved is a click, not a pan');
    assert.ok(/if \(!panned\) return;/.test(g),
        'the contextmenu guard must let every un-dragged press through');
    assert.ok(/addEventListener\('contextmenu'[\s\S]{0,200}\}, true\)/.test(g),
        'and run in CAPTURE, ahead of the per-object handlers rather than after');
    const menus = (app.match(/addEventListener\('contextmenu'/g) || []).length;
    assert.ok(menus >= 7,
        'expected the per-object context menus this guard has to protect; found ' +
        menus);
  });

  it('a wheel over the menu scrolls the menu', () => {
    /* The rail had this bug and it took a user report: board3d binds
       wheel on the wrapper, the panels live inside it, so scrolling
       the club library zoomed the board behind it. */
    assert.ok(/closest\('\.tb-m'\)\) return;/.test(g),
        'a wheel that started in the menu must not reach the zoom');
    const init = fn('tbMenuInit(hooks)');
    assert.ok(/menu\.addEventListener\('wheel'[\s\S]{0,60}stopPropagation/.test(init),
        'and the menu must stop it reaching the 3D camera either');
    assert.ok(/railSlot\.addEventListener\('wheel'[\s\S]{0,60}stopPropagation/.test(init),
        'as the rail already does');
  });

  it('two fingers zoom, because the browser will not', () => {
    /* .tb-3d-wrap sets touch-action:none — deliberately, or a drag on
       the board pans the page — which also kills the browser's own
       pinch. Without a handler a tablet could pan and never zoom, and
       a tablet is where this board is actually used. */
    const wrap = css.slice(css.indexOf('.tb-3d-wrap {'), css.indexOf('.tb-3d-loading'));
    assert.ok(/touch-action:none/.test(wrap),
        'the premise: the browser gesture is off, so this must be handled');
    assert.ok(/live\.size === 2/.test(g), 'a second finger must start a pinch');
    assert.ok(/tbZoomAt\(now\.d \/ pinch\.d/.test(g),
        'the zoom must be the ratio of the two spreads');
    assert.ok(/_tbView\.x \+= now\.mx - pinch\.mx/.test(g),
        'and the midpoint\'s own movement must pan, or two fingers ' +
        'moving together pin the board instead of sliding it');
    assert.ok(/\{ pan = null; pinch = spread\(\); \}/.test(g),
        'the pan in progress must be cancelled — its remembered origin ' +
        'would fight the pinch');
    assert.ok(/if \(live\.size > 1\) return;/.test(g),
        'and no new pan may start under two fingers');
  });

  it('the surround looks like something you can grab', () => {
    /* A class on the wrapper rather than `:has(> .tb-fit)`, which says
       the same thing only on browsers new enough for it. Without the
       class the rule is dead CSS and the pan has no affordance at
       all — nothing tells the coach the dark border is draggable. */
    assert.ok(/class="tb-3d-wrap\$\{is3d \? '' : ' tb-wrap-2d'\}"/.test(app),
        'the wrapper must say which view it is holding');
    assert.ok(/\.tb-wrap-2d \{ cursor:grab; \}/.test(css),
        'and the surround must show the grab cursor');
    assert.ok(/\.tb-wrap-2d \.tb-field\.tb-fit \{ cursor:default; \}/.test(css),
        'but not over the board, where a click means something else');
  });

  it('the surround carries the reset, since there is no camera menu', () => {
    assert.ok(/addEventListener\('dblclick'/.test(g), 'double-click must reset');
    assert.ok(/field\.contains\(e\.target\)\) return;/.test(g),
        'but not a double-click on the board — that is a text label being edited');
  });

  it('none of it is bound in 3D, where board3d owns the input', () => {
    assert.ok(/if \(!wrap \|\| tbIs3D\(\)\) return;/.test(g),
        'two zoom handlers on one wrapper is two things fighting for the wheel');
    assert.ok(/if \(tbIs3D\(\)\) return;/.test(fn('tbFit2DBoard(pitchOverride)')),
        'and the fit must leave the draw-surface follow loop alone');
    assert.ok(/if \(!field \|\| tbIs3D\(\)\) return;/.test(fn('tbApplyView()')),
        'nor may a stale 2D transform survive into the overlay');
  });
});

describe('and all of it is actually reached', () => {
  /* The lesson of the temporal-dead-zone bug, generalised: every
     assertion in this file is about a function's TEXT, and a function
     nobody calls has perfect text. Both of these survived a mutation
     run that deleted the call and left the definition. */
  it('the gestures are bound where the menu is', () => {
    const i = bare.indexOf('tbBindViewGestures();');
    assert.ok(i !== -1, 'nothing ever binds the zoom and pan handlers');
    const before = bare.slice(Math.max(0, i - 900), i);
    assert.ok(/if \(tbEditorOpen\(\)\) \{/.test(before),
        'bound when the editor is open, alongside the menu it belongs with');
  });

  it('the fit runs whenever the window is measured', () => {
    /* Called from tbSize3DWindow rather than from the render: the
       window's height is set there, and a board fitted to a height
       that is about to change is a board that has to be fitted twice.
       That also gets it the resize handler for free. */
    const size = fn('tbSize3DWindow()');
    assert.ok(/tbFit2DBoard\(\);/.test(size),
        'the fit must follow the measurement that decides the space it has');
    assert.ok(/window\.addEventListener\('resize', tbSize3DWindow\)/.test(bare),
        'and the measurement must follow the window');
    /* UNCONDITIONALLY, and this is the assertion a mutation run
       demanded: guarding the first measurement with `if (tbIs3D())`
       left every flat board unmeasured and unfitted until something
       else resized the window, and nothing here noticed. The bind and
       the call move together, so pinning the pair pins both. */
    assert.ok(/\n    tbSize3DWindow\(\);\n    if \(!_tb3dSizeBound\) \{/.test(bare),
        'the first measurement must be unconditional and sit directly ' +
        'above the resize binding — both views live in this window now');
  });
});

describe('nothing in the editor measures the board the wrong way', () => {
  it('percentage maths reads a RECT, which is reported after transforms', () => {
    /* The premise of the whole approach. getBoundingClientRect is
       post-transform, so pointer-to-pitch stays exact at any zoom with
       none of the editor's arithmetic touched. offsetWidth and
       clientWidth are NOT — they are layout sizes — so a single one of
       them in a drag path would put strokes somewhere else the moment
       the coach zoomed.

       Bounded to bindTactics, which is where every drag, draw and hit
       test lives. The three legitimate offsetWidth reads belong to
       scaleRoField, on read-only boards, which are not in the window. */
    const i = bare.indexOf('function bindTactics()');
    const editor = bare.slice(i, bare.indexOf('\n  function ', i + 20));
    assert.ok(editor.length > 20000, 'the bindTactics slice looks wrong');
    const layout = editor.match(/\b(?:inner|field)\.(?:offset|client)(?:Width|Height|Left|Top)\b/g);
    assert.deepStrictEqual(layout || [], [],
        'these read a LAYOUT size and ignore the zoom: ' + (layout || []).join(', '));
    assert.ok((editor.match(/inner\.getBoundingClientRect\(\)/g) || []).length >= 10,
        'the drag and draw paths must all go through the rect');
  });

  it('the grip preview re-fits instead of replacing the inline style', () => {
    /* cssText assignment was fine while the inline style was only a
       max-width. It now carries the board's position, its size and
       --tb-ppm, so the old line threw the board into the corner of the
       window for the length of a grip drag. */
    assert.ok(!/field\.style\.cssText/.test(bare),
        'nothing may replace the board\'s inline style wholesale');
    assert.ok(/tbFit2DBoard\(g\);/.test(bare),
        'the grip must preview by fitting the provisional pitch');
  });

  it('the fit owns exactly the properties the render left it', () => {
    const f = fn('tbFit2DBoard(pitchOverride)');
    ['maxWidth', 'margin', 'width', 'left', 'top'].forEach((p) =>
      assert.ok(new RegExp('field\\.style\\.' + p + ' =').test(f),
          'the fit must override ' + p + ', which the flow style still sets'));
    assert.ok(/setProperty\('--tb-ppm'/.test(f),
        'and rewrite the scale, or objects keep the size they had at 820px');
  });
});
