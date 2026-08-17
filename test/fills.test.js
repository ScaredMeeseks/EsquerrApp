/* Unit tests for circle fills — js/utils.js parseFill / encodeFill / fillCss.
 *
 * Pure logic, no emulator: `npm run test:fills`.
 *
 * A player marker used to be one hex string, held in a dozen places: the
 * per-frame colour arrays, buildBoardEntry, the undo snapshots, copy/paste
 * and the read-only renderer. A striped kit is encoded as a STRING into
 * those same slots so none of them had to change shape, which puts the
 * whole feature's correctness in these three functions.
 *
 * Two properties matter more than the rest:
 *
 *   1. The encoding must survive a double-quoted HTML attribute. Colours are
 *      interpolated raw into `data-color="…"`, `data-tc="…"` and
 *      `data-oc="…"`, so a value containing a quote would break the markup
 *      of every board that used it.
 *   2. A malformed value must degrade to a solid colour, never throw. These
 *      run on every repaint of every circle; a board drawn in the wrong
 *      colour is recoverable, a board that fails to draw is not.
 */
const assert = require('assert');
const { parseFill, encodeFill, fillCss } = require('../js/utils.js');

describe('parseFill', () => {
  it('treats anything without the s| prefix as a plain hex', () => {
    assert.deepStrictEqual(parseFill('#ff0000'), { striped: false, c1: '#ff0000' });
  });

  it('reads a striped fill', () => {
    assert.deepStrictEqual(parseFill('s|v|4|#ff0000|#ffffff'),
      { striped: true, dir: 'v', n: 4, c1: '#ff0000', c2: '#ffffff' });
  });

  it('accepts both directions, defaulting anything else to vertical', () => {
    assert.strictEqual(parseFill('s|h|2|#a|#b').dir, 'h');
    assert.strictEqual(parseFill('s|v|2|#a|#b').dir, 'v');
    assert.strictEqual(parseFill('s|q|2|#a|#b').dir, 'v');
  });

  /* Everything below is the "never throw" contract. Each of these can reach
     a repaint: an empty colour array slot, a half-written value, a count
     from an <input type=number> the user emptied. */
  it('degrades to solid rather than throwing', () => {
    const bad = ['', null, undefined, 's|', 's|v', 's|v|', 's|v|x|#a|#b',
      's|v|1|#a|#b', 's|v|7|#a|#b', 's|v|0|#a|#b'];
    bad.forEach((v) => {
      const f = parseFill(v);
      assert.strictEqual(f.striped, false, JSON.stringify(v) + ' must not parse as striped');
      assert.ok(typeof f.c1 === 'string' && f.c1.length, JSON.stringify(v) + ' must still yield a colour');
    });
  });

  it('an out-of-range count keeps the first colour rather than losing it', () => {
    // 1 and 7 are outside 2-6. Falling back to '#ffffff' would silently
    // white out a player the coach had deliberately coloured.
    assert.strictEqual(parseFill('s|v|7|#123456|#ffffff').c1, '#123456');
  });
});

describe('encodeFill', () => {
  it('returns a bare hex when stripes are off', () => {
    assert.strictEqual(encodeFill(false, 'v', 4, '#ff0000', '#ffffff'), '#ff0000');
  });

  it('round-trips through parseFill', () => {
    const v = encodeFill(true, 'h', 3, '#ff0000', '#00ff00');
    assert.deepStrictEqual(parseFill(v),
      { striped: true, dir: 'h', n: 3, c1: '#ff0000', c2: '#00ff00' });
  });

  it('clamps the count into 2-6', () => {
    assert.strictEqual(parseFill(encodeFill(true, 'v', 99, '#a', '#b')).n, 6);
    assert.strictEqual(parseFill(encodeFill(true, 'v', 0, '#a', '#b')).n, 2);
    assert.strictEqual(parseFill(encodeFill(true, 'v', '', '#a', '#b')).n, 2);
  });

  it('never emits a quote — it lands in a double-quoted HTML attribute', () => {
    const v = encodeFill(true, 'v', 4, '#ff0000', '#ffffff');
    assert.ok(v.indexOf('"') === -1 && v.indexOf("'") === -1,
      'an encoded fill must survive data-color="…" unescaped');
  });
});

describe('fillCss', () => {
  it('a solid fill keeps the old three values', () => {
    const css = fillCss('#ff0000');
    assert.strictEqual(css.background, '#ff0000');
    assert.strictEqual(css.borderColor, '#cd0000');   // darkenHex(c1, 50)
    assert.strictEqual(css.fg, '#fff');               // textColorFor(c1)
  });

  it('an even count alternates the two colours across the circle', () => {
    // 4 stripes = 25% each; the gradient repeats every two, so one unit is 50%.
    assert.strictEqual(fillCss('s|v|4|#ff0000|#ffffff').background,
      'repeating-linear-gradient(90deg,#ff0000 0 25%,#ffffff 25% 50%)');
  });

  it('an odd count still renders that many bands', () => {
    // 3 stripes = 33.3333% each: c1 0-33, c2 33-66, then the repeat puts c1
    // back at 66-100. Three visible bands, which is what "3" has to mean.
    const bg = fillCss('s|v|3|#ff0000|#ffffff').background;
    assert.ok(bg.indexOf('33.3333%') !== -1, bg);
    assert.ok(bg.indexOf('66.6666%') !== -1, bg);
  });

  it('rounds the stops — 100/3 is 33.333333333333336 raw', () => {
    // This string goes in a style attribute on every circle of every board.
    assert.ok(!/\d{6,}/.test(fillCss('s|v|3|#a1a1a1|#b2b2b2').background));
  });

  it('direction picks the gradient angle', () => {
    assert.ok(fillCss('s|v|2|#a1a1a1|#b2b2b2').background.startsWith('repeating-linear-gradient(90deg'));
    assert.ok(fillCss('s|h|2|#a1a1a1|#b2b2b2').background.startsWith('repeating-linear-gradient(180deg'));
  });

  it('border and number follow the FIRST colour, not the encoded string', () => {
    // darkenHex/textColorFor take a hex and return '#NaNNaNNaN' on 's|…'.
    // That is the whole reason fillCss exists.
    const css = fillCss('s|v|4|#ffffff|#000000');
    assert.strictEqual(css.borderColor, '#cdcdcd');
    assert.strictEqual(css.fg, '#222');
    assert.ok(css.borderColor.indexOf('NaN') === -1);
  });
});
