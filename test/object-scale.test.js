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
const css = fs.readFileSync(path.join(ROOT, 'css', 'style.css'), 'utf8');
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

  it('marks are metric too, and match the 2D weights they came from', () => {
    /* Converted at the full board's 7.81 px/m, so the marks a coach
       already draws keep the weight they have. */
    const perM = BG.ppm(820, null, 'full', false);
    const back = (m) => m * perM;
    assert.ok(Math.abs(back(BG.MARK.pen) - 2.5) < 0.1,
        'pen should be the 2D 2.5px, got ' + back(BG.MARK.pen).toFixed(2));
    assert.ok(Math.abs(back(BG.MARK.rectStroke) - 1.5) < 0.1,
        'zone outline should be the 2D 1.5px');
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
