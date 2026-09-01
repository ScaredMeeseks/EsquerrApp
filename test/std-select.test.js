/* stdSelect — the app's own dropdown, driven for real.
 *
 * ⚠ WHY THIS FILE EXISTS.
 * The Registracions category picker was rebuilt from scratch three times and
 * shipped broken each time, past a green suite, because every assertion about
 * it checked what the SOURCE SAID. The bug was in the cascade: a menu hidden
 * with `el.hidden = true` under a rule that also set `display:flex` stays
 * visible, because `[hidden]{display:none}` is a UA rule at specificity
 * (0,1,0) and loses to any author `display`. No amount of grepping app.js can
 * see that. So this file renders the markup into a real DOM and clicks it.
 *
 * ⚠ AND WHAT IT STILL CANNOT SEE. jsdom does NOT reproduce that particular
 * cascade — it reports `display:none` for a hidden element even when a
 * higher-specificity author rule says otherwise, which real browsers do not.
 * The `[hidden]` trap is therefore covered by a STATIC guard over style.css
 * (in registrations.test.js), not from here. What jsdom does give us is the
 * behaviour: open, choose, label, close.
 *
 * `npm run test:stdselect`, or as part of test:unit.
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const src = fs.readFileSync(path.join(__dirname, '..', 'js', 'app.js'), 'utf8');
const css = fs.readFileSync(path.join(__dirname, '..', 'css', 'style.css'), 'utf8');

function grab(from, to) {
  const i = src.indexOf(from);
  const j = src.indexOf(to, i);
  assert.ok(i !== -1 && j !== -1, 'marker not found in js/app.js: ' + from);
  return src.slice(i, j);
}

/* The four functions that make up the component, lifted together with the
   real page stylesheet behind them. `sanitize` is the app's, reduced to what
   these call sites need. */
function load(win) {
  const code =
    grab('  function stdSelect(o) {', '  /**\n   * A place, linked to its map');
  // eslint-disable-next-line no-new-func
  return new win.Function('document', 'window', 'sanitize',
    code + '\n return {stdSelect, bindStdSelects, stdSelPlace, stdSelCloseAll};')(
      win.document, win,
      (s) => String(s == null ? '' : s)
          .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'));
}

const OPTS = [
  {value: 'amateur', label: 'Amateur'},
  {value: 'juvenil', label: 'Juvenil'},
  {value: 'cadet', label: 'Cadet'}
];

/** A page with the real stylesheet and one select in it. */
function mount(o, extraHtml) {
  const dom = new JSDOM(
    // extraHtml is a SIBLING: #host is overwritten below, so anything put
    // inside it would be wiped before the test could reach it.
    '<style>' + css + '</style><div id="host"></div>' + (extraHtml || ''),
    {pretendToBeVisual: true});
  const win = dom.window;
  const api = load(win);
  win.document.getElementById('host').innerHTML = api.stdSelect(o);
  const root = win.document.querySelector('.std-sel');
  return {
    win, api, root,
    trigger: root.querySelector('.std-sel-t'),
    menu: root.querySelector('.std-sel-menu'),
    label: () => root.querySelector('.std-sel-l').textContent,
    shown: () => win.getComputedStyle(root.querySelector('.std-sel-menu')).display,
    click: (el) => el.dispatchEvent(new win.MouseEvent('click', {bubbles: true}))
  };
}

describe('stdSelect — it opens, and what opens is ours', () => {
  it('starts shut', () => {
    const s = mount({kind: 'k', value: 'amateur', options: OPTS});
    assert.strictEqual(s.shown(), 'none', 'the menu must start hidden');
    assert.strictEqual(s.label(), 'Amateur', 'the trigger shows the current value');
  });

  it('opens on the trigger and shows every option', () => {
    /* The assertion that would have caught the bug: not "the code sets a
       property" but "the menu is on screen". */
    const s = mount({kind: 'k', value: 'amateur', options: OPTS});
    s.api.bindStdSelects('k', function () {});
    s.click(s.trigger);
    assert.strictEqual(s.shown(), 'block', 'the menu must actually be visible');
    assert.strictEqual(s.root.querySelectorAll('.std-sel-o').length, 3);
  });

  it('is shown by a CLASS, never by the hidden property', () => {
    /* The whole reason this component is reused rather than rewritten.
       `hidden` loses to any author `display:`; a class does not. */
    const s = mount({kind: 'k', value: 'amateur', options: OPTS});
    s.api.bindStdSelects('k', function () {});
    s.click(s.trigger);
    assert.ok(s.root.classList.contains('std-sel-open'));
    assert.ok(!s.menu.hasAttribute('hidden'),
        'the hidden attribute must play no part in this');
    const body = grab('  function stdSelPlace', '  /**\n   * Open, choose, close') +
      grab('  function bindStdSelects', '  /**\n   * A place, linked to its map');
    assert.ok(!/\.hidden\s*=/.test(body),
        'nothing in the component may toggle the hidden property');
  });

  it('a second trigger closes the first', () => {
    const s = mount({kind: 'k', value: 'amateur', options: OPTS},
        '<div id="two"></div>');
    s.win.document.getElementById('two').innerHTML =
      s.api.stdSelect({kind: 'k2', value: 'juvenil', options: OPTS});
    s.api.bindStdSelects(['k', 'k2'], function () {});
    const roots = s.win.document.querySelectorAll('.std-sel');
    s.click(roots[0].querySelector('.std-sel-t'));
    s.click(roots[1].querySelector('.std-sel-t'));
    assert.ok(!roots[0].classList.contains('std-sel-open'), 'only one at a time');
    assert.ok(roots[1].classList.contains('std-sel-open'));
  });
});

describe('stdSelect — choosing', () => {
  it('reports the value and moves the marker', () => {
    const s = mount({kind: 'k', value: 'amateur', options: OPTS});
    const seen = [];
    s.api.bindStdSelects('k', function (root, v) { seen.push([root.dataset.stdSel, v]); });
    s.click(s.trigger);
    s.click(s.root.querySelectorAll('.std-sel-o')[1]);
    assert.deepStrictEqual(seen, [['k', 'juvenil']]);
    assert.strictEqual(s.root.dataset.value, 'juvenil', 'the root holds the value');
    assert.strictEqual(s.shown(), 'none', 'and it closes behind you');
  });

  it('says nothing when the same option is picked again', () => {
    // A no-op save is still a write, a re-render and a sync.
    const s = mount({kind: 'k', value: 'amateur', options: OPTS});
    const seen = [];
    s.api.bindStdSelects('k', function (root, v) { seen.push(v); });
    s.click(s.trigger);
    s.click(s.root.querySelectorAll('.std-sel-o')[0]);
    assert.deepStrictEqual(seen, [], 'picking the current value changes nothing');
  });

  it('carries its caller data through', () => {
    // How the Registracions callback knows which row it is on.
    const s = mount({kind: 'regcat', value: 'amateur', options: OPTS,
      data: {uid: '42'}});
    assert.strictEqual(s.root.dataset.uid, '42');
  });

  it('marks the chosen option so the open menu shows where you are', () => {
    const s = mount({kind: 'k', value: 'juvenil', options: OPTS});
    const on = s.root.querySelectorAll('.std-sel-o-on');
    assert.strictEqual(on.length, 1);
    assert.strictEqual(on[0].dataset.v, 'juvenil');
  });

  it('falls back to the first option when the value matches none', () => {
    const s = mount({kind: 'k', value: 'gone', options: OPTS});
    assert.strictEqual(s.label(), 'Amateur', 'never a blank trigger');
  });

  it('escapes a label that contains markup', () => {
    const s = mount({kind: 'k', value: 'x',
      options: [{value: 'x', label: '<img src=x onerror=1>'}]});
    assert.ok(!s.root.querySelector('img'), 'a label is text, not markup');
  });
});

describe('stdSelect — a menu that escapes a clipping table', () => {
  /* `.std-sel-menu` is absolute, so inside a wrapper with overflow-x:auto it
     is clipped — and a non-visible overflow-x makes the vertical axis clip
     too, so opening one grew the wrapper and put a scrollbar on the section.
     `.std-sel-esc` makes it fixed and bindStdSelects places it. */
  function escMount(rect) {
    const s = mount({kind: 'k', cls: 'std-sel-esc', value: 'amateur', options: OPTS});
    s.trigger.getBoundingClientRect = () => rect;
    Object.defineProperty(s.menu, 'offsetWidth', {value: 160, configurable: true});
    Object.defineProperty(s.menu, 'offsetHeight', {value: 120, configurable: true});
    s.api.bindStdSelects('k', function () {});
    return s;
  }
  const MID = {left: 300, right: 400, top: 200, bottom: 224, width: 100, height: 24};

  it('is fixed, and only position — never display', () => {
    /* If this rule ever sets `display` it becomes the very bug the
       component was reused to avoid. */
    const m = /\.std-sel-esc \.std-sel-menu \{([^}]*)\}/.exec(css);
    assert.ok(m, '.std-sel-esc .std-sel-menu has no rule');
    assert.ok(/position:\s*fixed/.test(m[1]));
    assert.ok(!/display:/.test(m[1]),
        'showing the menu stays with .std-sel-open, which is a class');
    /* The base rule sets `right:0` and `top:calc(100% + 4px)` for an
       ABSOLUTE menu inside .std-sel. On a fixed box those resolve against
       the viewport, and `left` + `right` together stretch the panel from
       the trigger to the right-hand edge of the screen. stdSelPlace owns
       left and top, so the other two have to be released. */
    assert.ok(/right:\s*auto/.test(m[1]),
        'right:0 from the base rule would stretch the fixed panel');
    assert.ok(/bottom:\s*auto/.test(m[1]));
    assert.ok(/right:\s*0/.test(/\.std-sel-menu \{([^}]*)\}/.exec(css)[1]),
        'and the base rule really does set it — that is why this matters');
  });

  it('places itself under its trigger', () => {
    const s = escMount(MID);
    s.click(s.trigger);
    assert.strictEqual(s.menu.style.top, '228px', 'just below the trigger');
    assert.strictEqual(s.menu.style.left, '300px', 'aligned to its left edge');
    assert.strictEqual(s.menu.style.minWidth, '100px', 'at least as wide');
  });

  it('stays on screen at the right edge', () => {
    const s = escMount({left: 990, right: 1010, top: 200, bottom: 224,
      width: 20, height: 24});
    s.click(s.trigger);
    // innerWidth 1024 - 160 wide - 8 pad
    assert.strictEqual(s.menu.style.left, '856px');
  });

  it('flips above the trigger when there is no room below', () => {
    const s = escMount({left: 300, right: 400, top: 700, bottom: 724,
      width: 100, height: 24});
    s.click(s.trigger);
    assert.strictEqual(s.menu.style.top, '576px', '700 - 4 - 120');
  });

  it('does not flip when there is no room above either', () => {
    // Off the top is not an improvement on off the bottom.
    const s = escMount({left: 300, right: 400, top: 40, bottom: 700,
      width: 100, height: 660});
    s.click(s.trigger);
    assert.strictEqual(s.menu.style.top, '704px', 'stays below');
  });

  it('measures the menu only once it is on screen', () => {
    /* Displayed is when a menu has dimensions; measured while still
       display:none every one of them reads 0 and it lands in the corner. */
    const open = grab('  function stdSelPlace', '  /** Shut every open stdSelect');
    const bind = grab('  function bindStdSelects', '  /**\n   * A place, linked');
    assert.ok(/classList\.add\('std-sel-open'\);\s*\n\s*stdSelPlace\(/.test(bind),
        'the class must be added BEFORE the placement runs');
    assert.ok(open.indexOf('offsetWidth') > open.indexOf('getBoundingClientRect'),
        'and the trigger rect read before the menu is measured');
  });

  it('leaves a menu without the class alone', () => {
    // The two original callers are not in a scrolling box.
    const s = mount({kind: 'k', value: 'amateur', options: OPTS});
    s.trigger.getBoundingClientRect = () => MID;
    s.api.bindStdSelects('k', function () {});
    s.click(s.trigger);
    assert.strictEqual(s.menu.style.top, '', 'absolute menus are placed by CSS');
  });
});

describe('stdSelect — closing', () => {
  it('closes on a click anywhere else', () => {
    const s = mount({kind: 'k', value: 'amateur', options: OPTS});
    s.api.bindStdSelects('k', function () {});
    s.click(s.trigger);
    s.click(s.win.document.body);
    assert.strictEqual(s.shown(), 'none');
  });

  it('closes on Escape', () => {
    const s = mount({kind: 'k', value: 'amateur', options: OPTS});
    s.api.bindStdSelects('k', function () {});
    s.click(s.trigger);
    s.win.document.dispatchEvent(
        new s.win.KeyboardEvent('keydown', {key: 'Escape', bubbles: true}));
    assert.strictEqual(s.shown(), 'none');
  });

  it('closes on scroll rather than drifting away from its trigger', () => {
    /* A fixed menu holds viewport coordinates, so it does not follow the
       row when the pane underneath scrolls — the trap hideHoverTip already
       closes on. Captured, because scroll does not bubble out of an inner
       pane, which is exactly where these tables live. */
    const s = mount({kind: 'k', cls: 'std-sel-esc', value: 'amateur', options: OPTS},
        '<div id="pane"></div>');
    s.api.bindStdSelects('k', function () {});
    s.click(s.trigger);
    assert.strictEqual(s.shown(), 'block');
    s.win.document.getElementById('pane')
      .dispatchEvent(new s.win.Event('scroll'));   // does NOT bubble
    assert.strictEqual(s.shown(), 'none', 'an inner pane must still close it');
  });

  it('closes on resize', () => {
    const s = mount({kind: 'k', cls: 'std-sel-esc', value: 'amateur', options: OPTS});
    s.api.bindStdSelects('k', function () {});
    s.click(s.trigger);
    s.win.dispatchEvent(new s.win.Event('resize'));
    assert.strictEqual(s.shown(), 'none');
  });

  it('binds its document listeners once, however often it is re-bound', () => {
    // bindStdSelects runs after every render; the guard is what stops a
    // fresh document listener piling up on each one.
    const bind = grab('  function bindStdSelects', '  /**\n   * A place, linked');
    assert.ok(/if \(!document\._stdSelBound\)/.test(bind), 'the guard');
    // Only what sits INSIDE the guard. The trigger and option listeners above
    // it are meant to be re-bound: their elements are rebuilt every render.
    const guarded = bind.slice(bind.indexOf('if (!document._stdSelBound)'));
    ['click', 'keydown', 'scroll', 'resize'].forEach((ev) => {
      const uses = (guarded.match(new RegExp("'" + ev + "'", 'g')) || []).length;
      assert.strictEqual(uses, 1, ev + ' must be registered exactly once');
    });
  });
});

describe('stdSelect — two binders, one page', () => {
  /* ⚠ THE REGRESSION THAT COST AN AFTERNOON.
     bindDynamicActions runs EVERY page's binder on every render, whatever
     page is on screen — bindStaffTrainingDetail() runs while Registracions
     is showing. While bindStdSelects bound every `.std-sel` in the document,
     both callers claimed the same triggers and each added a click listener.
     On a click the first opened the menu; the second read the class the
     first had just set, saw `wasOpen` as true, and closed it again. The menu
     opened and shut inside one event, so it never appeared at all.

     Naming the kinds is what makes ownership explicit. These tests bind
     twice, the way the app does. */

  function twoKinds() {
    const s = mount({kind: 'regcat', value: 'amateur', options: OPTS},
        '<div id="two"></div>');
    s.win.document.getElementById('two').innerHTML =
      s.api.stdSelect({kind: 'rpe', value: 'juvenil', options: OPTS});
    return s;
  }

  it('a menu still opens when another binder has already run', () => {
    const s = twoKinds();
    s.api.bindStdSelects(['rpe', 'staff'], function () {});   // the other page
    s.api.bindStdSelects('regcat', function () {});           // this one
    s.click(s.trigger);
    assert.strictEqual(s.shown(), 'block',
        'two binders must not cancel each other out');
  });

  it('order does not matter', () => {
    const s = twoKinds();
    s.api.bindStdSelects('regcat', function () {});
    s.api.bindStdSelects(['rpe', 'staff'], function () {});
    s.click(s.trigger);
    assert.strictEqual(s.shown(), 'block');
  });

  it('a picked value reaches its own binder exactly once', () => {
    /* Two listeners also meant two onPick calls — two saves and two
       re-renders for one click. */
    const s = twoKinds();
    const mine = [], theirs = [];
    s.api.bindStdSelects(['rpe', 'staff'], function (r, v) { theirs.push(v); });
    s.api.bindStdSelects('regcat', function (r, v) { mine.push(v); });
    s.click(s.trigger);
    s.click(s.root.querySelectorAll('.std-sel-o')[1]);
    assert.deepStrictEqual(mine, ['juvenil'], 'once, to the owner');
    assert.deepStrictEqual(theirs, [], 'and never to the other page');
  });

  it('a binder leaves other kinds alone entirely', () => {
    // Not merely "ignores them in its callback": it must not bind them.
    const s = twoKinds();
    s.api.bindStdSelects('regcat', function () {});
    const other = s.win.document.querySelector('[data-std-sel="rpe"]');
    s.click(other.querySelector('.std-sel-t'));
    assert.ok(!other.classList.contains('std-sel-open'),
        'an unclaimed control must stay inert, not half-work');
  });

  it('a kind that merely contains another is not claimed', () => {
    /* `own` must be a LIST. Left as the bare string a caller passed,
       `'regcat'.indexOf(k)` is a substring search: a control of kind
       'cat' would be silently adopted by the Registracions binder,
       which is the double-binding bug again with extra steps. */
    const s = mount({kind: 'cat', value: 'amateur', options: OPTS});
    s.api.bindStdSelects('regcat', function () {});
    s.click(s.trigger);
    assert.strictEqual(s.shown(), 'none',
        "'cat' is not 'regcat' and must not be bound");
  });

  it('no two call sites claim the same kind', () => {
    /* The invariant behind the whole change. Every binder runs on every
       render, so overlapping kinds means two listeners on one trigger —
       the second closing what the first opened. */
    const seen = {};
    const dup = [];
    // Up to `, function` — NOT to the first comma, which stops inside an
    // array literal and silently reads only its first element.
    (src.match(/bindStdSelects\((.*?),\s*function/g) || []).forEach((call) => {
      (call.match(/'([^']+)'/g) || []).forEach((k) => {
        if (seen[k]) dup.push(k); else seen[k] = true;
      });
    });
    assert.deepStrictEqual(dup, [], 'these kinds are claimed twice: ' + dup);
    assert.ok(Object.keys(seen).length >= 3, 'regcat, rpe and staff at least');
  });

  it('every call site names its kinds', () => {
    // A caller that forgot would silently claim nothing and look broken.
    const calls = src.match(/bindStdSelects\([^)]*/g) || [];
    const sites = calls.filter((c) => !/^bindStdSelects\(kinds/.test(c));
    assert.ok(sites.length >= 2, 'both pages must be represented');
    sites.forEach((c) => {
      assert.ok(/bindStdSelects\(\s*(\[|')/.test(c),
          'kinds must be passed first, not a bare callback: ' + c.slice(0, 60));
    });
  });
});
