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
    /* `.body-map-overlay` was the injury logger's scrim until v234, when the
       Mèdic redesign replaced it with `.md2-scrim` and the full-screen
       `.md2-sheet-full` the player answers on. Both are listed: the point of
       this test is that NO overlay a tooltip can appear inside outranks it,
       so the list has to name every overlay there is. */
    ['.modal-overlay', '.md2-scrim', '.md2-sheet-full', '.dp-popup'].forEach((sel) => {
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
    /* Scoped to renderStaffTrainingDetail. Searching the whole file broke in
       v243, when the player's page picked up the same `.std-table` some
       10,000 lines EARLIER — `indexOf` then compared the coach's button
       against the player's table and called the order wrong. Neither page
       had moved. */
    const from = appSrc.indexOf('  function renderStaffTrainingDetail');
    const page = appSrc.slice(from, appSrc.indexOf('  function buildDetailBar', from));
    assert.notStrictEqual(from, -1, 'the coach page is not where it was');
    const add = page.indexOf('id="std-add-player"');
    const table = page.indexOf('<table class="std-table">');
    assert.ok(add !== -1 && table !== -1 && add < table,
        'in a space-between header it landed at the far right edge, ' +
        'reading as unrelated to the list below it');
  });
});

/* ══════════════════════════════════════════════════════════════════════════
 * How a paper page sits in the dashboard (v246).
 *
 * Ten page roots, one rule, and it lives beside `.dashboard-content` rather
 * than inside any page's own block — every one of those blocks is sliced from
 * its banner to the next by a suite, so a rule naming ten pages would be read
 * as belonging to whichever region it landed in.
 *
 * WHAT WENT WRONG WITHOUT IT, and what these assertions are really about:
 *
 *  1. The roots had drifted into two camps — four pulled -2rem and bled to
 *     both edges, six pulled -1rem and left a 16px grey band down each side,
 *     under a `.cat-bar` that bleeds the full 32px. A visible step where the
 *     bar met the page, on six of nine pages.
 *  2. ⚠ THE TOP IS NOT THE SIDES. The bar and the root are ADJACENT SIBLINGS
 *     and their margins collapse to `max(positive) + min(negative)`. The bar
 *     leaves 1rem, so a -2rem root climbed 16px OVER it and covered its
 *     `border-bottom`. Both share `--pp-paper`, so that read not as an overlap
 *     but as the filter bar being SHORTER on those pages — three different bar
 *     heights across nine pages, all from one sum.
 *  3. The three banners carry the same 1rem and no top margin, so the same
 *     arithmetic applied to them: the bar rode over whichever was showing.
 *     `.std-page` was the only root that had ever guarded this.
 *  4. Four roots pinned their bleed to their own 700/900 breakpoint — about
 *     columns folding — while `.dashboard-content` changes at 600.
 *
 * ⚠ ONE TEST, NOT ONE PER SUITE. Ten copies of a geometry assertion is how
 * ten copies of the geometry got there in the first place.
 * ══════════════════════════════════════════════════════════════════════════ */
describe('the paper pages sit in the dashboard the same way', () => {
  /* ⚠ v247: eleven. `.cal-page` did not exist — Calendari pulled the bleed on
     `.cal-bar` and `.cal-weeks` individually, plus a `margin-top:-1rem` on the
     bar to stand in for the one a root would have taken. Three declarations
     doing what membership of this list does. */
  const ROOTS = ['.std-page', '.pl-page', '.reg2-page', '.pt-page', '.cv-page',
    '.ini-page', '.md2-page', '.ms-page', '.ac-page', '.nf-page', '.cal-page'];
  /* Comment-stripped: the block above names every selector and every value,
     and an unstripped scan would find the prose instead of the rule. The
     standing trap in this repo. */
  const bare = css.replace(/\/\*[\s\S]*?\*\//g, ' ');

  const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

  /** The declaration block of the first rule whose selector list contains
      `sel` and which sets `margin`, searched from `from`. */
  function marginRuleFor(sel, from) {
    const re = new RegExp('([^{}]*' + esc(sel) + '[^{}]*)\\{([^}]*margin[^}]*)\\}', 'g');
    re.lastIndex = from || 0;
    const m = re.exec(bare);
    return m && { selectors: m[1], body: m[2] };
  }

  it('gives every root the same bleed, in ONE rule', () => {
    const r = marginRuleFor('.ms-page');
    assert.ok(r, 'no shared margin rule names .ms-page at all');
    ROOTS.forEach((sel) => assert.ok(r.selectors.includes(sel),
        sel + ' is not in the shared bleed rule — it will keep its own geometry'));
    assert.ok(/margin:\s*-1rem\s+-2rem\s+-2rem/.test(r.body),
        'the bleed is not -1rem top / -2rem sides and bottom: ' + r.body.trim());
  });

  /* ⚠ -1rem, not -2rem. It cancels the 1rem that the cat-bar and the banners
     each leave below themselves, so the page sits FLUSH under whichever one
     precedes it. -2rem is the overlap that hid the bar's bottom rule. */
  it('cancels exactly the 1rem that the cat-bar and the banners leave', () => {
    assert.ok(/\.cat-bar\{[^}]*margin:\s*0\s+-2rem\s+1rem/.test(bare),
        'the cat-bar no longer leaves the 1rem the roots are cancelling');
    assert.ok(/\.upd-banner\s*\{[^}]*margin-bottom:\s*1rem/.test(bare),
        'the banners no longer leave the 1rem the roots are cancelling');
  });

  /* Nothing above us: pull the whole 2rem and reach the top of the pane. A
     blanket -2rem top is what slides a page over a banner. */
  it('gives every root a :first-child arm', () => {
    const m = /([^{}]*\.ms-page:first-child[^{}]*)\{([^}]*margin-top[^}]*)\}/.exec(bare);
    assert.ok(m, 'the :first-child arm is gone');
    ROOTS.forEach((sel) => assert.ok(m[1].includes(sel + ':first-child'),
        sel + ' has no :first-child arm — it will sit 1rem down with nothing above it'));
    assert.ok(/margin-top:\s*-2rem/.test(m[2]));
  });

  /* ⚠ The bar needs the same guard, and did not have it: a blanket -2rem top
     is why it clipped an update banner on all ten CATEGORY_PAGES. */
  it('guards the cat-bar against the banners the same way', () => {
    assert.ok(/\.cat-bar:first-child\{[^}]*margin-top:\s*-2rem/.test(bare),
        'the cat-bar has no :first-child arm');
    assert.ok(!/\.cat-bar\{[^}]*margin:\s*-2rem/.test(bare),
        'the cat-bar has a blanket negative top margin again; it will ride over a banner');
  });

  /* ⚠ 600 is where `.dashboard-content` goes from 2rem to `.75rem 1rem`. A
     page's own 700 or 900 is about columns folding and is the wrong hook: a
     bleed pinned there negates a padding that has not moved yet. */
  it('follows the container down at 600, not at any page breakpoint', () => {
    const at600 = bare.slice(bare.indexOf('@media (max-width: 600px)'));
    const r = marginRuleFor('.ms-page', bare.indexOf('@media (max-width: 600px)'));
    assert.ok(r && ROOTS.every((sel) => r.selectors.includes(sel)),
        'the 600px arm does not cover every root');
    assert.ok(/margin:\s*-1rem\s+-1rem\s+-\.75rem/.test(r.body),
        'the 600px bleed does not match .dashboard-content\'s .75rem 1rem: ' + r.body.trim());
    assert.ok(/\.cat-bar\{[^}]*margin:\s*0\s+-1rem\s+1rem/.test(at600),
        'the cat-bar does not follow the container down to 1rem');
  });

  it('leaves no per-page margin behind to outrank the shared rule', () => {
    /* A local `.cv-page { margin: … }` would win on source order for that one
       page and put the band back on it alone — which is exactly how the two
       camps formed. `background` and `padding` are each page's own business.
       ⚠ The test is not "no rule mentions this root" — the SHARED rules do,
       and they are the point. It is "every margin-declaring rule that mentions
       a root mentions ALL of them", which only the shared pair can satisfy. */
    const re = /([^{}]*)\{([^}]*)\}/g;
    let m;
    while ((m = re.exec(bare))) {
      if (!/margin\s*:|margin-top\s*:/.test(m[2])) continue;
      /* ⚠ The root must END its compound — `,`, `:first-child`, or the end of
         the list. `.reg2-page .reg-team-circle` is a DESCENDANT and is that
         page's own business; matching it made this fire on every block. */
      const named = ROOTS.filter((sel) =>
        new RegExp('(^|[,\\s])' + esc(sel) + '(:first-child)?\\s*(,|$)').test(m[1]));
      if (!named.length) continue;
      assert.strictEqual(named.length, ROOTS.length,
          'a margin rule names only ' + named.join(', ') +
          ' — that page keeps its own geometry: ' + m[1].trim().slice(0, 120));
    }
  });

  /* ⚠ v247.2 MOVED THIS, and the move is the point.

     It used to check `.reg2-page`, `.cv-page` and `.pl-main` — the ROOTS — for
     `padding: 28px 40px 48px`. That is where the inset was, and it is why the
     owner still saw a grey stripe down each side of those three pages after
     v247: a header band painted edge to edge cannot reach an edge its ancestor
     is holding 40px away from. Mèdic, Inici, Notificacions and Calendari have
     no root padding and looked right, which is exactly the split reported.

     So the root carries the bleed and nothing else, and one body wrapper per
     page carries the inset. Same question — one inset everywhere — asked of
     the element that should answer it. */
  const BODIES = ['.ini-body', '.md2-body', '.ms-body', '.ac-body', '.nf-body',
    '.pl-body', '.reg2-body', '.cv-body'];

  it('insets every paper page\'s content by the same 40px', () => {
    const r = /([^{}]*\.cv-body[^{}]*)\{([^}]*padding[^}]*)\}/.exec(bare);
    assert.ok(r, 'no shared inset rule names .cv-body at all');
    BODIES.forEach((sel) => assert.ok(r[1].includes(sel),
        sel + ' is not in the shared inset rule — that page keeps its own'));
    assert.ok(/padding:\s*32px\s+40px\s+56px/.test(r[2]),
        'the inset is not 40px on the sides: ' + r[2].trim());
  });

  /* ⚠ THE DEFECT ITSELF. A root that sets padding puts the grey stripe back on
     that page alone, and it is invisible in a diff — the page still looks
     "inset", just inset one level too high, with the band inset with it. */
  it('leaves no padding on a page ROOT to hold the band off the edge', () => {
    const re = /([^{}]*)\{([^}]*)\}/g;
    let m;
    while ((m = re.exec(bare))) {
      if (!/padding\s*:|padding-left\s*:|padding-right\s*:/.test(m[2])) continue;
      ROOTS.forEach((sel) => {
        if (!new RegExp('(^|[,\\s])' + esc(sel) + '(:first-child)?\\s*(,|$)').test(m[1])) return;
        assert.fail(sel + ' pads the root, so its header band stops short of the ' +
            'page edge: ' + m[1].trim().slice(0, 80) + ' { ' + m[2].trim().slice(0, 60));
      });
    }
  });

  /* The body has to narrow when the BAND does, or the text steps 24px left of
     its own title. The three pages fixed here used 900, which is 200px of
     width with the two disagreeing. */
  it('steps every body down on the band\'s breakpoint, not its own', () => {
    const at700 = bare.slice(bare.indexOf('@media (max-width: 700px)'));
    const r = /([^{}]*\.cv-body[^{}]*)\{([^}]*padding[^}]*)\}/.exec(at700);
    assert.ok(r, 'the 700px arm does not name .cv-body');
    BODIES.forEach((sel) => assert.ok(r[1].includes(sel),
        sel + ' does not follow the band down at 700'));
    assert.ok(/padding:\s*20px\s+20px\s+40px/.test(r[2]),
        'the phone inset does not match the band\'s 20px: ' + r[2].trim());
  });

  it('leaves the old root inset nowhere in the sheet', () => {
    ['.reg2-page', '.cv-page', '.pl-main'].forEach((sel) => {
      const m = new RegExp(esc(sel) + '\\s*\\{[^}]*padding:').exec(bare);
      assert.ok(!m, sel + ' has its own padding again — the grey stripe is back');
    });
    /* ⚠ Calendari's two blocks state the same 40px with a different vertical
       pair, so they cannot go through the loop above. This is the owner's
       "more left/right margins" ask, and it is the number the band it sits
       under uses — three left edges that have to agree. */
    [['.cal-bar', '12px'], ['.cal-weeks', '4px']].forEach((p) => {
      const m = new RegExp(esc(p[0]) + '\\s*\\{[^}]*padding:\\s*' + p[1] + '\\s+(\\d+)px')
          .exec(bare);
      assert.ok(m, p[0] + ' no longer sets the inset this test is about');
      assert.strictEqual(m[1], '40', p[0] + ' insets by ' + m[1] + 'px, not 40');
    });
  });

  /* ⚠ v249: A PAGE MAY NOT REDECLARE A SHARED BAND ATOM AND QUIETLY WIN.
     `.pl-fig` and `.pl-fig-v` were in the v247 shared rules at 30px/gap:4 AND
     redeclared in Plantilla's own block at 24px/gap:3. Same specificity, the
     page's copy later in the file — so it won, and Plantilla's figures were
     24px while the other nine bands were 30px. The v247 note claims the four
     copies of that value became one; this copy survived the consolidation and
     has been beating the rule that replaced it ever since.

     Nothing failed. That is the point: a consolidation that leaves the old
     copy behind looks exactly like one that worked, and the shared rule is
     then a comment rather than a rule. */
  it('lets no page redeclare a shared band atom later in the sheet', () => {
    /* The atoms, and the property each shared rule is ABOUT. A page may still
       set anything else on them — `.pl-fig-of`'s size, `.pl-fig-risk`'s
       colour — it may just not restate the one thing that is shared. */
    const ATOMS = [
      ['.pl-fig-v', 'font-size'], ['.cv-fig-v', 'font-size'],
      ['.ini-stat-v', 'font-size'], ['.md2-count-v', 'font-size'],
      ['.reg2-fig-v', 'font-size'], ['.ms-fig-v', 'font-size'],
      ['.ac-fig-v', 'font-size'], ['.nf-fig-v', 'font-size'],
      ['.pl-eyebrow', 'font-size'], ['.cv-eyebrow', 'font-size'],
      ['.md2-eyebrow', 'font-size'], ['.ini-eyebrow', 'font-size'],
    ];
    /* Rules OUTSIDE any @media: a phone override is a deliberate second
       value and is not what this is about. */
    const top = bare.replace(/@media[^{]*\{(?:[^{}]*\{[^}]*\})*[^{}]*\}/g, ' ');
    ATOMS.forEach(([sel, prop]) => {
      const re = new RegExp('([^{}]*)\\{([^}]*)\\}', 'g');
      const owners = [];
      let m;
      while ((m = re.exec(top))) {
        /* ⚠ THE WHOLE COMPOUND, not "appears somewhere in the list".
           `.md2-counters-s .md2-count-v` is a DESCENDANT — (0,2,0), a
           deliberate small-counter variant that outranks the shared rule on
           purpose and says so by its shape. A bare `.md2-count-v` is the
           thing this is about: equal specificity, winning on source order,
           invisible. Matching the substring conflated the two. */
        const bare = m[1].split(',').some((part) => part.trim() === sel);
        if (!bare) continue;
        if (!new RegExp(prop + '\\s*:').test(m[2])) continue;
        owners.push(m[1].trim().slice(0, 70));
      }
      assert.ok(owners.length <= 1,
          sel + ' gets its ' + prop + ' from ' + owners.length + ' rules; the later ' +
          'one silently wins and the shared rule becomes a comment: ' + owners.join(' | '));
    });
  });

  /* ⚠ v247.4: a band is one line of title over one line of scope, and the
     scope line has to STAY one line. Registres' intro ran to two sentences,
     wrapped, and made that band the tallest of the ten — the exact thing the
     shared band exists to prevent. Shortening the string fixed that instance;
     this fixes the class, because `ca`, `es` and `en` are three different
     lengths and the next edit is a fourth. */
  it('will not let a scope line wrap and push its band taller', () => {
    const r = /([^{}]*\.reg2-sub-line[^{}]*)\{([^}]*)\}/.exec(bare);
    assert.ok(r, 'the shared scope-line rule is gone');
    ['.md2-sub', '.ac-hero-sub', '.pl-sub', '.cv-sub', '.cal-sub'].forEach((sel) =>
      assert.ok(r[1].includes(sel), sel + ' is not in the shared scope-line rule'));
    assert.ok(/white-space:\s*nowrap/.test(r[2]), 'the scope line can wrap again');
    assert.ok(/text-overflow:\s*ellipsis/.test(r[2]),
        'a long line is clipped with no sign that it was clipped');
    /* ⚠ Without this a flex child refuses to shrink below its content and the
       ellipsis never engages — the line overflows instead. */
    assert.ok(/min-width:\s*0/.test(r[2]), 'the ellipsis will never engage');
    /* And it wraps again on a phone, where there is no neighbouring band to
       match and truncating a sentence would cost information for nothing. */
    const at700 = bare.slice(bare.indexOf('@media (max-width: 700px)'));
    const p = /([^{}]*\.reg2-sub-line[^{}]*)\{([^}]*)\}/.exec(at700);
    assert.ok(p && /white-space:\s*normal/.test(p[2]),
        'the scope line is still truncated on a phone');
  });

  /* ⚠ v247: the band, the legend strip and the grid take their inset from one
     number, and they have to step down together. The band folds at 700; if
     the other two step at 600 or at Calendari's own 560, their left edges
     disagree with the title above them for a whole band of widths. */
  it('steps Calendari\'s strip and grid down on the BAND\'s breakpoint', () => {
    const at700 = bare.slice(bare.indexOf('@media (max-width: 700px)'));
    assert.ok(/\.cal-bar\s*\{[^}]*padding:\s*12px\s+20px/.test(at700),
        'the legend strip does not follow the band down to 20px at 700');
    assert.ok(/\.cal-weeks\s*\{[^}]*padding:\s*4px\s+20px/.test(at700),
        'the month grid does not follow the band down to 20px at 700');
    assert.ok(/\.cal-hero\b[^{}]*\{[^}]*padding:\s*14px\s+20px/.test(at700),
        'the band itself no longer folds to 20px at 700, so the number to match moved');
  });
});
