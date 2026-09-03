/* One way to read css/style.css in a test, and it resolves the palette.
 *
 * ⚠ WHY THIS EXISTS. Until v228 the six paper pages each carried their own
 * copy of the design system's colours as raw hexes — 552 literals — and
 * dozens of assertions across this suite were written against those
 * literals: `assert.ok(css.includes('background: #F6F2E9'))` and the like.
 * Naming them as `--pp-*` custom properties broke seven of those at once,
 * and the two obvious fixes are both wrong:
 *
 *   - Rewriting each assertion to look for `var(--pp-tint)` tests the NAME
 *     and stops testing the colour. A token pointed at the wrong value
 *     would pass every one of them.
 *   - Leaving some files on the raw text makes two kinds of stylesheet in
 *     one suite, and the next colour assertion lands in whichever file the
 *     author happened to open.
 *
 * So `readCss()` returns the stylesheet with every `var(--pp-*)` expanded
 * back to the literal it resolves to — what a browser effectively paints.
 * Assertions keep reading as they always did, and a mis-defined token fails
 * the same test a mis-typed hex used to.
 *
 * `readCssRaw()` is for the handful of tests that are ABOUT the tokens.
 */
const fs = require('fs');
const path = require('path');

const FILE = path.join(__dirname, '..', 'css', 'style.css');

/** The `--pp-*` block, parsed out of the stylesheet itself. */
function palette(src) {
  const out = {};
  const i = src.indexOf('/* ===== The paper palette =====');
  if (i === -1) return out;
  const open = src.indexOf(':root {', i);
  const block = src.slice(open, src.indexOf('}', open));
  const re = /--(pp-[\w-]+):\s*([^;]+);/g;
  let m;
  while ((m = re.exec(block))) out[m[1]] = m[2].trim();
  // One alias in the set (--pp-med-fit-ink is var(--pp-green)); resolve it
  // rather than handing a caller a var() inside a "literal".
  Object.keys(out).forEach((k) => {
    let v = out[k], guard = 0;
    while (/^var\(--pp-[\w-]+\)$/.test(v) && guard++ < 8) {
      v = out[v.slice(6, -1)] || v;
    }
    out[k] = v;
  });
  return out;
}

function readCssRaw() {
  return fs.readFileSync(FILE, 'utf8');
}

function readCss() {
  const src = readCssRaw();
  const pp = palette(src);
  return src.replace(/var\(--(pp-[\w-]+)\)/g, (m, n) => (pp[n] !== undefined ? pp[n] : m));
}

module.exports = {readCss, readCssRaw, palette, FILE};
