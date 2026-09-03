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
const {readCss} = require('./read-css');

const css = readCss();
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
    /* Named the element `tooltipEl` when the placement was inline; it is a
       `place(e, el)` helper now that the binding is delegated. The RULE is
       clientX against the element's own width, whatever the element is
       called — pinning the old identifier only pinned the old shape. */
    assert.ok(/e\.clientX - \w+\.offsetWidth \/ 2/.test(appSrc),
        'the mouse-follow site must read clientX');
  });

  /* ⚠ The badges live inside overlays that are injected into document.body
     with NO render behind them — a dozen of them in this file. A loop over
     `[data-tooltip]` inside bindDynamicActions can only ever see what the
     last render produced, so every one of those overlays had dead badges
     until this was delegated. That is the bug the owner reported on the
     Add-Player modal. */
  it('is delegated on the document, not looped over at render time', () => {
    const i = appSrc.indexOf('function bindTooltips');
    assert.notStrictEqual(i, -1, 'bindTooltips is gone');
    const body = appSrc.slice(i, appSrc.indexOf('\n  function ', i + 10));
    assert.ok(/document\.addEventListener\('mouseover'/.test(body),
        'the badges must be delegated, or an injected overlay has none');
    assert.ok(!/querySelectorAll\('\[data-tooltip\]'\)/.test(body),
        'a querySelectorAll loop only sees what the last render drew');
  });

  it('delegates with events that BUBBLE', () => {
    // mouseenter/mouseleave do not bubble, so they cannot be delegated —
    // using them would leave the listener never firing at all.
    const i = appSrc.indexOf('function bindTooltips');
    const body = appSrc.slice(i, appSrc.indexOf('\n  function ', i + 10));
    assert.ok(!/document\.addEventListener\('mouse(enter|leave)'/.test(body),
        'mouseenter/mouseleave do not bubble and cannot be delegated');
  });
});

/* ------------------------------------------------------------------ *
 * Hover tips.
 *
 * The delegation used to live inside a page-specific bind block on
 * #dashboard-content, which gave it two holes that both looked like "the
 * tooltip is broken":
 *   1. It did not exist until you had visited that page.
 *   2. It could never see a modal — an overlay is appended to <body>, so
 *      it is outside the dashboard container entirely.
 * ------------------------------------------------------------------ */
describe('layout — hover tips reach every element that carries one', () => {
  const appSrcT = fs.readFileSync(
      path.join(__dirname, '..', 'js', 'app.js'), 'utf8');

  it('is delegated on the document, not on a page container', () => {
    assert.ok(/document\.addEventListener\('mouseover'/.test(appSrcT),
        'a container-scoped listener cannot see an overlay');
    assert.ok(!/content\.addEventListener\('mouseover'/.test(appSrcT),
        'the page-scoped copy must be gone, not merely supplemented');
  });

  it('keys on the attribute, so a new badge needs no rebinding', () => {
    assert.ok(/closest\('\[data-tip\]'\)/.test(appSrcT));
  });

  it('hides on scroll, in capture, so a tip cannot hang in mid-air', () => {
    assert.ok(/addEventListener\('scroll', hideHoverTip, true\)/.test(appSrcT));
  });

  it('the clash warning carries a tip and is a triangle', () => {
    assert.ok(appSrcT.includes('class="nt-warn" data-tip='));
    assert.ok(/nt-warn[^>]*>⚠</.test(appSrcT), 'a triangle reads as caution at a glance');
  });
});

describe('layout — a tooltip outranks whatever triggered it', () => {
  /* At z-index 1000 .ua-tooltip sat UNDER .modal-overlay (2000), so a badge
     inside the Add-Player popup showed its cursor:help and no bubble. The
     handler ran and the element was positioned; it simply painted
     underneath. Fixing the binding in v78 could not have fixed this. */
  const zOf = (sel) => {
    const m = /z-index:\s*(\d+)/.exec(rule(sel));
    assert.ok(m, sel + ' has no z-index');
    return Number(m[1]);
  };

  it('sits above every overlay that can contain one', () => {
    const tip = zOf('.ua-tooltip');
    ['.modal-overlay', '.body-map-overlay', '.dp-popup'].forEach((sel) => {
      assert.ok(tip > zOf(sel), `.ua-tooltip must outrank ${sel}`);
    });
  });

  it('stays below the toast container, which owns the top', () => {
    assert.ok(zOf('.ua-tooltip') < zOf('#push-toast-container'));
  });

  it('applies to the other body-level tooltip too', () => {
    // .roster-tooltip had the identical latent bug, unnoticed only because
    // nobody had hovered a [data-tooltip] badge inside an overlay yet.
    assert.strictEqual(zOf('.roster-tooltip'), zOf('.ua-tooltip'));
  });
});

/* ------------------------------------------------------------------ *
 * The staff-attendance select.
 *
 * It looked like an empty cell in a screenshot. It was not: the control
 * was there and working, but with no answer and no override `effectiveCls`
 * was '', so it carried no colour class and fell back to `color: #fff` --
 * white text on a white card.
 *
 * The rendering bug hid a worse one. Nothing was marked `selected`, and a
 * <select> with no selected option displays its FIRST one: every
 * unanswered player was silently showing "Yes".
 *
 * v189b: it is no longer a <select> at all. A native one can be styled shut
 * but NOT open -- the popup list is drawn by the OS and ignores every rule
 * we write, which is what still read as "default" after the pill was fixed.
 * It is a stdSelect now: a button and a div. Both invariants above survive
 * the change and are re-asserted against the new markup.
 * ------------------------------------------------------------------ */
describe('training detail — the staff attendance select', () => {
  it('carries a colour class even with no answer', () => {
    assert.ok(appSrc.includes("effective ? cls[effective] : 'avail-unset'"),
        "'' means no class, which means the base color:#fff with no background");
    assert.ok(css.includes('.std-sel-pill .std-sel-t.avail-unset'),
        'the class has to actually style something');
  });

  it('gives that state a real background and a readable colour', () => {
    const r = rule('.std-sel-pill .std-sel-t.avail-unset');
    assert.ok(/background(-color)?\s*:/.test(r),
        'a background, or it inherits the white-on-white it is here to prevent');
    // The TEXT colour, not border-color or background-color — both of those
    // end in "color:" and would satisfy a looser check while proving nothing.
    const fg = /(^|[;{\s])color\s*:\s*([^;}]+)/.exec(r);
    assert.ok(fg, 'and an explicit text colour');
    assert.ok(!/#fff|#ffffff|white/i.test(fg[2]),
        'the text colour must not be white again, got: ' + fg[2].trim());
  });

  it('is not a native select, so its open list is ours to style', () => {
    assert.ok(!/<select class="std-staff-select/.test(appSrc),
        'the native control is gone');
    assert.ok(appSrc.includes("kind: 'staff', cls: 'std-sel-pill'"),
        'and replaced by a stdSelect');
    assert.ok(/\.std-sel-menu\s*\{/.test(css) && /\.std-sel-o\s*\{/.test(css),
        'the popup and its rows have to be styled, or nothing was gained');
  });

  it('hides the popup until it is opened', () => {
    assert.ok(/\.std-sel-menu\s*\{[^}]*display\s*:\s*none/.test(css),
        'closed by default');
    assert.ok(/\.std-sel-open\s+\.std-sel-menu\s*\{[^}]*display\s*:\s*block/.test(css),
        'and shown only by the open class the trigger toggles');
  });

  it('opens with a placeholder, so nothing reads as an answer', () => {
    assert.ok(appSrc.includes("[{ value: '', label: '—', cls: 'avail-unset' }].concat("),
        'the placeholder must come FIRST and carry the unset colour');
  });

  it('every answer carries the colour that names it', () => {
    // The option list sets the pill's class, so picking one recolours it.
    assert.ok(appSrc.includes('allOptions.map(o => ({ value: o, label: labels[o], cls: cls[o] }))'),
        'without cls the pill would keep the previous answer colour');
  });

  it('clears the override instead of storing an empty answer', () => {
    assert.ok(/if \(value\) overrides\[key\] = value;\s+else delete overrides\[key\];/.test(appSrc),
        "overrides[key] = '' would read as a staff call that hides the player's own answer");
  });

  /* The planned-intensity picker opened into the same OS list. Same fix. */
  it('the intensity picker is a stdSelect too', () => {
    assert.ok(!/<select class="std-rpe/.test(appSrc), 'no native control left');
    assert.ok(appSrc.includes("kind: 'rpe', cls: 'std-sel-plain'"));
    assert.ok(/\.std-sel-plain \.std-sel-t\s*\{/.test(css),
        'and it keeps the stat row type rather than a boxed control');
  });
});

describe('training detail — the remove button', () => {
  /* v188 moved the × to the END of the row and made it appear on hover: in a
     page of hairlines a permanent red × in the leading column was the loudest
     thing on screen, and it is the rarest action in the table. */
  it('trails the row in its own column', () => {
    assert.ok(appSrc.includes('<td class="std-drop-cell">'),
        'the × has its own cell so every row lines up');
    assert.ok(css.includes('.std-drop-cell'));
  });

  it('adds a header cell with it, or every column shifts by one', () => {
    assert.ok(appSrc.includes("${squadEditable ? '<th class=\"std-drop-cell\"></th>' : ''}"),
        'the extra <td> is conditional, so the <th> must be gated identically');
  });

  it('is revealed by hovering the row, not painted on every one', () => {
    assert.ok(/\.std-drop\s*\{[^}]*opacity:\s*0/.test(css),
        'it starts invisible');
    assert.ok(/\.std-table tr:hover \.std-drop/.test(css),
        'and the row hover is what brings it back');
    assert.ok(/\.std-drop:focus/.test(css),
        'keyboard focus must reveal it too, or it is mouse-only');
  });

  it('the Add button sits above the table it acts on', () => {
    const add = appSrc.indexOf('id="std-add-player"');
    const table = appSrc.indexOf('<table class="std-table">');
    assert.ok(add !== -1 && table !== -1 && add < table,
        'in a space-between header it landed at the far right edge, ' +
        'reading as unrelated to the list below it');
  });
});
