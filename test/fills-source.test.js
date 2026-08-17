/* Source assertions over js/app.js — the same technique
 * tactic-boards.test.js uses for buildBoardEntry, and for the same reason.
 *
 * A striped fill is a STRING (`s|v|4|#a|#b`). Any site that still paints a
 * circle by hand will hand that string to darkenHex() or textColorFor(),
 * which parse hex and return '#NaNNaNNaN' — a silently wrong colour, on one
 * renderer out of five. That is exactly the shape of the v88 opposition
 * flash (the animation disagreed with the static render) and the v90 colour
 * bug (saveState disagreed with everything else).
 *
 * There are five places that draw a circle — the editor's markup, its frame
 * painter, its animation player, the read-only renderer and the read-only
 * animation player — and nothing but this test notices when they diverge.
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const src = fs.readFileSync(path.join(__dirname, '..', 'js', 'app.js'), 'utf8');

describe('app.js paints every circle through the fill helpers', () => {
  it('calls darkenHex nowhere — fillCss owns the border colour', () => {
    const hits = src.match(/darkenHex\(/g) || [];
    assert.strictEqual(hits.length, 0,
      'a circle is being painted by hand again; use paintCircle() or fillCss()');
  });

  it('calls textColorFor only for text labels, never for a circle', () => {
    // Text labels legitimately still take a hex: they have no striped form.
    // So this pins the boundary rather than a count.
    const lines = src.match(/.*textColorFor\(.*/g) || [];
    lines.forEach((l) => {
      assert.ok(!/tb-circle|tb-num|oppBg/.test(l),
        'circle painted via textColorFor: ' + l.trim());
    });
  });

  it('reads a circle fill from dataset.color, never from the style', () => {
    /* style.backgroundColor reads back as '' under a gradient, so a striped
       circle would open its colour picker showing white. The fallback may
       still exist for pre-stripes markup, but dataset.color has to come
       first. */
    const m = src.match(/circle\.style\.backgroundColor/g) || [];
    m.forEach(() => {
      assert.ok(/parseFill\(circle\.dataset\.color/.test(src),
        'a circle fill is being read from style.backgroundColor without ' +
        'parseFill(dataset.color) first');
    });
  });
});
