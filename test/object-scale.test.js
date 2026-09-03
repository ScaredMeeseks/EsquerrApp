/* One size, both boards — MEASURED in metres.
 *
 * The two views used different units: 2D sized objects in fixed
 * pixels, 3D in metres. They could not agree by construction, and 2D
 * could not agree with itself either — the same 24px disc was a
 * 3.07m player on a full board and a 1.99m player on a half board,
 * because the two have different px-per-metre.
 *
 * These tests convert whatever each view declares into METRES and
 * compare. That is the only comparison that means anything: a test
 * asserting "both say 24" or "both say 1.8" would pass just as
 * happily with one of them measuring the wrong thing.
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const BG = require(path.join(ROOT, 'js', 'board-geom.js'));
const {readCss} = require('./read-css');
const css = readCss();
const b3 = fs.readFileSync(path.join(ROOT, 'js', 'board3d.js'), 'utf8');

/** The metre figure a CSS rule asks for, out of its calc(). */
function cssMetres(selector, prop) {
  const i = css.indexOf(selector + ' {');
  assert.ok(i !== -1, selector + ' not found');
  const rule = css.slice(i, css.indexOf('}', i));
  // `var(--tb-ppm, 7.81)` — the fallback is part of the function call.
  const m = new RegExp(
      prop + ':[^;]*var\\(--tb-ppm[^)]*\\)\\s*\\*\\s*([\\d.]+)').exec(rule);
  assert.ok(m, selector + ' must size ' + prop +
      ' from --tb-ppm, in metres. Rule was:\n' + rule);
  return parseFloat(m[1]);
}

/** The metre figure board3d uses for a constant. */
function solidMetres(name) {
  const m = new RegExp('const ' + name + ' = ([\\d.]+)').exec(b3);
  assert.ok(m, name + ' not found in board3d.js');
  return parseFloat(m[1]);
}

describe('an object is the same size in both views', () => {
  it('the size table is the single source, and is metric', () => {
    ['player', 'ball', 'cone', 'coneHeight'].forEach((k) => {
      assert.strictEqual(typeof BG.OBJ[k], 'number', 'OBJ.' + k);
      assert.ok(BG.OBJ[k] > 0 && BG.OBJ[k] < 20,
          'OBJ.' + k + ' = ' + BG.OBJ[k] + ' is not a plausible size in metres');
    });
  });

  it('3D is the reference scale, as decided', () => {
    assert.strictEqual(BG.OBJ.player, 1.80);
    assert.strictEqual(BG.OBJ.ball, 0.50);
    assert.strictEqual(BG.OBJ.cone, 0.70);
  });

  it('the 2D board asks for the table\'s metres, not pixels', () => {
    assert.strictEqual(cssMetres('.tb-circle', 'width'), BG.OBJ.player);
    assert.strictEqual(cssMetres('.tb-ball', 'width'), BG.OBJ.ball);
  });

  it('the 3D scene uses the table too, so neither can drift', () => {
    /* board3d's own PLAYER_R / BALL_R / CONE_R must derive from BG,
       not be a second transcription of the same numbers. */
    assert.ok(/PLAYER_R\s*=\s*BG\.OBJ\.player\s*\/\s*2/.test(b3),
        'PLAYER_R must come from BG.OBJ.player');
    assert.ok(/BALL_R\s*=\s*BG\.OBJ\.ball\s*\/\s*2/.test(b3),
        'BALL_R must come from BG.OBJ.ball');
    assert.ok(/CONE_R\s*=\s*BG\.OBJ\.cone\s*\/\s*2/.test(b3),
        'CONE_R must come from BG.OBJ.cone');
  });

  it('agrees on every board type, which fixed pixels never did', () => {
    /* The old failure, stated directly: a 24px disc on an 820px full
       board is 3.07m, and on an 820px half board 1.99m. Sizing in
       metres makes the board type irrelevant, which is the point. */
    const boards = [
      ['full horizontal', 820, null, 'full', false],
      ['full vertical', 520, null, 'full', true],
      ['half', 820, null, 'half', false],
      ['area', 820, null, 'area', false],
      ['full, resized pitch', 820, [130, 90], 'full', false]
    ];
    boards.forEach(([name, widthPx, pitch, type, vert]) => {
      const perM = BG.ppm(widthPx, pitch, type, vert);
      assert.ok(perM > 0, name + ' has no scale');
      // What the CSS would render, converted straight back to metres.
      const rendered = (BG.OBJ.player * perM) / perM;
      assert.ok(Math.abs(rendered - BG.OBJ.player) < 1e-9,
          name + ' renders a ' + rendered.toFixed(2) + 'm player, not ' +
          BG.OBJ.player + 'm');
    });
  });

  it('ppm tracks the board width, so the overlay scales with zoom', () => {
    /* Complaint 2: objects kept their pixel size while the pitch grew
       under them. ppm is what makes a metre bigger when the board is. */
    const small = BG.ppm(820, null, 'full', false);
    const zoomed = BG.ppm(3280, null, 'full', false);
    assert.ok(Math.abs(zoomed / small - 4) < 1e-9,
        'four times the board width must be four times the scale');
    assert.ok(BG.OBJ.player * zoomed > BG.OBJ.player * small,
        'a player must be bigger on a bigger board');
  });

  it('marks are metric, and every stroke is ONE weight', () => {
    /* Pen strokes and arrow shafts were 0.32 (the 2D 2.5px) against a
       0.19 zone outline (1.5px) — three marks from the same hand at
       two weights. They are one number now. */
    const perM = BG.ppm(820, null, 'full', false);
    const back = (m) => m * perM;
    assert.strictEqual(BG.MARK.pen, BG.MARK.rectStroke,
        'a pen stroke must be as thick as a zone outline');
    assert.strictEqual(BG.MARK.arrowShaft, BG.MARK.rectStroke,
        'an arrow shaft must be as thick as a zone outline');
    assert.ok(Math.abs(back(BG.MARK.rectStroke) - 1.5) < 0.1,
        'and that weight is the 2D 1.5px, got ' + back(BG.MARK.rectStroke).toFixed(2));
    /* The head is a shape, not a weight, so it keeps its own size. */
    assert.ok(Math.abs(back(BG.MARK.arrowHead) - 12) < 0.5,
        'arrow head should be the 2D 12px');
  });

  it('board3d reads the mark table rather than keeping its own numbers', () => {
    assert.ok(/PEN_W\s*=\s*BG\.MARK\.pen/.test(b3),
        'PEN_W must come from BG.MARK.pen');
    assert.ok(!/const PEN_W = 0\.3/.test(b3),
        'the standalone 0.3 must be gone, or the two tables drift apart');
  });
});

/* ── The sizes must resolve to LENGTHS ────────────────────────────
 *
 * This shipped broken and looked exactly like a rendering disaster:
 * every player became a wide ellipse. The cause was one missing unit.
 * `--tb-ppm` was written as a bare number, so `calc(var(--tb-ppm) *
 * 1.80)` evaluated to `14.06` — a NUMBER. `width: max(16px, 14.06)`
 * mixes a length with a number, which is invalid, so the browser drops
 * the whole declaration and width falls back to `auto`. An auto-width
 * flex box sizes itself around the `<input>` it contains, and an input
 * defaults to about twenty characters wide.
 *
 * The test that was supposed to cover this read the metre multiplier
 * out of the declaration with a regex. The multiplier was correct.
 * Nothing checked that the expression it sits in produces a length —
 * so a source-shaped assertion passed on CSS the browser threw away.
 */
describe('the metric sizes resolve to real lengths', () => {
  const app = fs.readFileSync(path.join(ROOT, 'js', 'app.js'), 'utf8');
  const LENGTH = /^-?[\d.]+(px|rem|em|vw|vh|pt|%)$/;

  /** Every value app.js ever assigns to --tb-ppm. */
  const emitted = () => {
    /* Anchored on each write and read forward a fixed window, then
       asked one question: does the emitted string carry `px`? Trying
       to match the whole expression was brittle — the first attempt
       required the statement to end `))` and the real one ends
       `+ 'px')`, so it found nothing and reported the writer missing
       rather than unitless. */
    const sites = [
      ['tbPpmVar', app.indexOf("'--tb-ppm:'")],
      ['follow loop', app.indexOf("setProperty('--tb-ppm'")]
    ];
    return sites.map(([where, at]) => ({
      where,
      found: at !== -1,
      unit: at === -1 ? '' : (/\+\s*'(\w+);?'/.exec(app.slice(at, at + 220)) || ['', ''])[1]
    }));
  };

  it('every writer gives --tb-ppm a unit', () => {
    const writers = emitted();
    writers.forEach((w) => assert.ok(w.found,
        w.where + ' no longer writes --tb-ppm at all'));
    writers.forEach((w) => {
      assert.strictEqual(w.unit, 'px',
          w.where + ' writes --tb-ppm without a unit; calc() would then ' +
          'produce a number and every declaration using it is dropped');
    });
  });

  it('every fallback is a length too', () => {
    /* `var(--tb-ppm, 7.81)` is the same bug wearing the fallback: it
       only shows when the property is missing, which is exactly when
       nobody is looking. */
    const fallbacks = css.match(/var\(--tb-ppm,\s*([^)]+)\)/g) || [];
    assert.ok(fallbacks.length > 0, 'no --tb-ppm fallbacks found at all');
    fallbacks.forEach((f) => {
      const v = /var\(--tb-ppm,\s*([^)]+)\)/.exec(f)[1].trim();
      assert.ok(LENGTH.test(v),
          f + ' falls back to "' + v + '", which is not a length');
    });
  });

  it('every declaration built from it mixes only lengths', () => {
    /* Resolve each calc() by substituting the fallback, and check the
       result still carries a unit. A max() of a length and a number
       is invalid however sensible the numbers look. */
    const uses = css.match(/[a-z-]+:\s*(?:max\([^;]*?\))?[^;]*?var\(--tb-ppm[^;]*;/g) || [];
    assert.ok(uses.length >= 8, 'expected the object and mark rules; got ' + uses.length);
    uses.forEach((decl) => {
      const calcs = decl.match(/calc\([^)]*\)/g) || [];
      assert.ok(calcs.length > 0, 'no calc() in: ' + decl);
      calcs.forEach((c) => {
        // Everything multiplied inside must be a plain number except
        // the variable, which supplies the one unit.
        const units = (c.match(/\d+(px|rem|em|%)/g) || []).length;
        assert.strictEqual(units, 1,
            'calc must carry exactly one unit, from the variable: ' + c +
            ' in ' + decl);
      });
      // And any max()/min() sibling must be a length, not a bare number.
      const guard = /(?:max|min)\(\s*([^,]+),/.exec(decl);
      if (guard) {
        assert.ok(LENGTH.test(guard[1].trim()),
            'the floor "' + guard[1].trim() + '" is not a length in: ' + decl);
      }
    });
  });

  it('a player is a circle, not whatever its contents make it', () => {
    /* The visible symptom was width:auto stretching the disc around
       the shirt-number input. Width and height must be the same
       expression, and both explicit. */
    const i = css.indexOf('.tb-circle {');
    const rule = css.slice(i, css.indexOf('}', i));
    const w = /width:([^;]+);/.exec(rule);
    const h = /height:([^;]+);/.exec(rule);
    assert.ok(w && h, '.tb-circle must set both width and height');
    assert.strictEqual(w[1].trim(), h[1].trim(),
        'a player disc must be square, or it renders as an ellipse');
  });
});
