/* Source assertions for the page-height invariants.
 *
 * Pure text checks, no emulator and no browser: `npm run test:layout`.
 *
 * These exist because a light band across the foot of the auth pages took
 * three deploys to kill, and each cause was invisible in review:
 *
 *  1. `100vh` is the LARGE mobile viewport — the height the page would have
 *     with the browser toolbars retracted — not what is visible. `body` and
 *     `.view` used it, so a login page with nothing to scroll was 30px
 *     taller than the window and those 30px were bare `--bg`.
 *  2. An explicit `min-height` on a flex item REPLACES `min-height: auto`,
 *     which is what stops a `flex-basis: 0` item shrinking below its
 *     content. Adding one to `.auth-container` collapsed the gradient to
 *     one viewport on the only auth page taller than the screen.
 *  3. `#roster-tooltip` is appended to <body> once and never removed,
 *     hidden by `opacity: 0` alone. While `position: absolute` it sat at
 *     its static position — the end of the body's content — and added
 *     ~29px of scrollable overflow to EVERY page.
 *
 * None of the three is visible in a screenshot: a cream strip at the foot
 * of the page looks identical whether it is a horizontal scrollbar, an
 * uncovered background, or an invisible div hanging off the bottom.
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const css = fs.readFileSync(path.join(__dirname, '..', 'css', 'style.css'), 'utf8');
const appSrc = fs.readFileSync(path.join(__dirname, '..', 'js', 'app.js'), 'utf8');

/** The declarations of one rule, by its selector. */
function rule(selector) {
  const i = css.indexOf(selector + ' {');
  assert.notStrictEqual(i, -1, 'rule not found: ' + selector);
  return css.slice(i, css.indexOf('}', i));
}

describe('layout — viewport units', () => {
  /* `100vh` stays as the fallback for anything predating dvh, so the test is
     "never alone", not "never used". */
  ['body', '.view', '.auth-container'].forEach((sel) => {
    it(`${sel} pairs every 100vh with a 100dvh`, () => {
      const r = rule(sel);
      assert.ok(r.includes('100vh'), sel + ' should keep the fallback');
      assert.ok(r.includes('100dvh'),
          sel + ' sizes to the large viewport, not the visible one');
      assert.ok(r.indexOf('100vh') < r.indexOf('100dvh'),
          'the fallback must come FIRST or it wins the cascade');
    });
  });

  it('#view-dashboard still pins a definite height', () => {
    const r = rule('#view-dashboard');
    assert.ok(r.includes('position: fixed'));
    assert.ok(/height: 100vh;\s*height: 100dvh/.test(r),
        'height, not min-height — the scrolling panes need a DEFINITE height');
  });
});

describe('layout — the gradient must reach the bottom', () => {
  const r = rule('.auth-container');

  it('grows with its content instead of stretching into free space', () => {
    assert.ok(/flex:\s*1 0 auto/.test(r),
        'flex:1 means flex-basis:0, and the explicit min-height below ' +
        'removes the min-height:auto floor that made that survivable');
  });

  it('keeps a viewport floor for the short pages', () => {
    assert.ok(r.includes('min-height: 100vh'));
  });

  it('is the element that paints the background', () => {
    assert.ok(r.includes('linear-gradient'),
        'if the gradient moves, the two rules above move with it');
  });
});

describe('layout — the body-level tooltip', () => {
  it('is fixed, so it cannot extend the document', () => {
    const r = rule('.roster-tooltip');
    assert.ok(r.includes('position: fixed'),
        'absolute + opacity:0 + never removed = scrollable overflow on ' +
        'every page');
  });

  it('is hidden by opacity alone, which is why fixed matters', () => {
    const r = rule('.roster-tooltip');
    assert.ok(r.includes('opacity: 0'),
        'if this ever becomes display:none the coupling is worth revisiting');
  });

  /* Fixed positioning is against the VIEWPORT. Every site placing this
     element must therefore use client coordinates; a stray window.scrollY
     would push the tooltip off-screen by however far the page is scrolled. */
  it('is never positioned in document coordinates', () => {
    const lines = appSrc.split('\n').filter((l) =>
      /(tooltipEl|tip)\.style\.(top|left)/.test(l));
    assert.ok(lines.length >= 3, 'expected the three positioning sites');
    lines.forEach((l) => {
      assert.ok(!l.includes('window.scrollY'),
          'viewport coordinates only: ' + l.trim());
      assert.ok(!/\.page[XY]/.test(l),
          'pageX/pageY are document coordinates: ' + l.trim());
    });
  });

  it('follows the mouse in client coordinates', () => {
    assert.ok(appSrc.includes('e.clientX - tooltipEl.offsetWidth / 2'),
        'the mouse-follow site must read clientX');
  });
});
