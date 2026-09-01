/* Scrolling a Plantilla chart, driven for real.
 *
 * ⚠ WHY THIS FILE EXISTS.
 * Dragging a chart called renderPage() on EVERY mousemove — the whole page,
 * table and player rail included, rebuilt per pixel-step while the pointer
 * was still down. The rail is the biggest thing on the page, so scrolling
 * either chart threw it away and rebuilt it tens of times a second and the
 * charts could not be used at all.
 *
 * Every fact worth asserting here is about what happens DURING a gesture —
 * how many times the page was rebuilt, whether a mark redrawn mid-drag still
 * has its tooltip, whether letting go closes the rail. None of that is
 * visible to a source grep, which is why these run in a DOM.
 *
 * `npm run test:plcharts`, or as part of test:unit.
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const src = fs.readFileSync(path.join(__dirname, '..', 'js', 'app.js'), 'utf8');
const bare = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

function grab(from, to) {
  const i = src.indexOf(from);
  const j = src.indexOf(to, i);
  assert.ok(i !== -1 && j !== -1, 'marker not found in js/app.js: ' + from);
  return src.slice(i, j);
}

/* The chart registry, the offsets and bindPlantilla, over a real document.
   The five chart builders are replaced by a stub that records its calls —
   what is under test is which boxes get rebuilt, not their SVG. */
function mount(html) {
  const dom = new JSDOM('<div id="pl-page">' + html + '</div>', {pretendToBeVisual: true});
  const win = dom.window;
  const renders = [];      // every renderPage() call
  const draws = [];        // every chart rebuild

  /* The offsets, the registry, plChartBox and plRedrawCharts come as one
     block — they are the state and the two functions over it. Then plOff
     (which clamps an offset), the binder, and the accessors. */
  const code =
    grab('  var _plSel = null;', '  const PL_ATT') +
    grab('  function plOff(off, total, win)', '  /* ── Attendance') +
    grab('  function bindPlantilla', '  function plGetOff') +
    grab('  function plGetOff', '  /* ── The page');

  // eslint-disable-next-line no-new-func
  const api = new win.Function('document', 'window', 'sanitize', 'renderPage', 'getSession',
    code + '\n return {plChartBox, plRedrawCharts, plRedraws: () => _plCharts,' +
    ' bindPlantilla, plGetOff, plSetOff, sel: (v) => { if (v !== undefined) _plSel = v; return _plSel; },' +
    ' resetCharts: () => { _plCharts = []; }};')(
      win.document, win, (s) => String(s == null ? '' : s),
      () => { renders.push(1); }, () => ({id: 'u1'}));

  /* `key` is what the drag surface carries — the OFFSET it scrolls, not
     the chart's name. Emitting the name instead made every drag address an
     offset no chart was registered under: nothing redrew, and the "does
     not rebuild the page" assertion passed because no gesture happened. */
  const chart = (label, key) => (data, off) => {
    draws.push(label + ':' + off);
    return '<svg><rect class="pl-drag" data-pl-drag="' + (key || label) + '"></rect>' +
      '<circle data-pl-tip=\'{"t":"' + label + ' at ' + off + '","r":[]}\'></circle></svg>';
  };
  return {win, api, renders, draws, chart,
    page: win.document.getElementById('pl-page'),
    tipVisible: () => {
      const t = win.document.getElementById('pl-tip');
      return !!t && t.classList.contains('visible');
    },
    tipText: () => {
      const t = win.document.getElementById('pl-tip');
      return t ? t.textContent : '';
    },
    drag: (el, dx) => {
      el.getBoundingClientRect = () => ({width: 300, left: 0, top: 0, height: 100});
      el.dataset.plWin = '10';
      el.dataset.plTotal = '40';
      el.dispatchEvent(new win.MouseEvent('mousedown', {bubbles: true, clientX: 200}));
      win.dispatchEvent(new win.MouseEvent('mousemove', {bubbles: true, clientX: 200 - dx}));
      win.dispatchEvent(new win.MouseEvent('mouseup', {bubbles: true}));
    },
    click: (el) => el.dispatchEvent(new win.MouseEvent('click', {bubbles: true}))
  };
}

describe('plChartBox — a chart you can redraw on its own', () => {
  it('registers each chart with the offset it scrolls with', () => {
    const h = mount('');
    h.api.resetCharts();
    h.page.innerHTML =
      h.api.plChartBox('S', h.chart('rpe', 'S'), [1]) +
      h.api.plChartBox('W', h.chart('week', 'W'), [2]) +
      h.api.plChartBox('W', h.chart('acwr', 'W'), [2]);
    assert.deepStrictEqual(h.api.plRedraws().map((c) => c.key), ['S', 'W', 'W']);
    assert.strictEqual(h.page.querySelectorAll('.pl-chart-box').length, 3);
    /* Distinct ids, or getElementById hands every redraw the FIRST box and
       one chart is drawn over another. */
    const ids = h.api.plRedraws().map((c) => c.id);
    assert.strictEqual(new Set(ids).size, 3, ids.join(', '));
  });

  it('redraws into its own box, not the first one on the page', () => {
    const h = mount('');
    h.api.resetCharts();
    h.page.innerHTML =
      h.api.plChartBox('S', () => '<i id="was-s"></i>', [1]) +
      h.api.plChartBox('W', () => '<i id="was-w"></i>', [2]);
    h.api.plRedrawCharts('W');
    assert.ok(h.page.querySelector('#was-s'), 'the S chart must be left alone');
    const boxes = h.page.querySelectorAll('.pl-chart-box');
    assert.ok(boxes[1].querySelector('#was-w'), 'and the W redraw lands in the W box');
  });

  it('redraws only the charts bound to the offset that moved', () => {
    /* 'W' drives TWO charts — the weekly load and the A/C ratio under it.
       They read the same weeks and must scroll together, or the ratio
       stops lining up with the bars it is derived from. */
    const h = mount('');
    h.api.resetCharts();
    h.page.innerHTML =
      h.api.plChartBox('S', h.chart('rpe', 'S'), [1]) +
      h.api.plChartBox('W', h.chart('week', 'W'), [2]) +
      h.api.plChartBox('W', h.chart('acwr', 'W'), [2]);
    h.draws.length = 0;
    h.api.plSetOff('W', 3);
    h.api.plRedrawCharts('W');
    assert.deepStrictEqual(h.draws, ['week:3', 'acwr:3'], 'both W charts, and only those');
  });

  it('rebuilds from the data the chart was built with', () => {
    const h = mount('');
    h.api.resetCharts();
    const seen = [];
    h.page.innerHTML = h.api.plChartBox('S', (d, o) => { seen.push(d); return '<i></i>'; }, [7, 8]);
    h.api.plRedrawCharts('S');
    assert.deepStrictEqual(seen, [[7, 8], [7, 8]], 'the same series, not a stale copy');
  });

  it('survives a box whose element is gone', () => {
    // A stale id after a re-render must not throw mid-drag.
    const h = mount('');
    h.api.resetCharts();
    h.api.plChartBox('S', h.chart('rpe', 'S'), [1]);   // never inserted
    h.api.plRedrawCharts('S');
  });
});

describe('dragging a chart', () => {
  function withChart() {
    const h = mount('');
    h.api.resetCharts();
    h.page.innerHTML = h.api.plChartBox('S', h.chart('rpe', 'S'), [1]);
    h.api.bindPlantilla();
    return h;
  }

  it('does NOT rebuild the page', () => {
    /* The bug, stated as a number. Every mousemove used to be a full
       renderPage(); with the rail open that is the whole player card
       thrown away and rebuilt while the pointer is still down. */
    const h = withChart();
    h.drag(h.page.querySelector('[data-pl-drag]'), 90);
    assert.deepStrictEqual(h.renders, [], 'a drag must not re-render the page');
  });

  it('redraws the chart it is scrolling', () => {
    const h = withChart();
    h.draws.length = 0;
    h.drag(h.page.querySelector('[data-pl-drag]'), 90);
    assert.ok(h.draws.length >= 1, 'the chart must actually move');
    assert.notStrictEqual(h.api.plGetOff('S'), null, 'and the offset with it');
  });

  it('leaves a redrawn mark with a working tooltip', () => {
    /* ⚠ The marks are REPLACED by the redraw. Bound per element, the
       tooltip handlers went with the old ones — tooltips worked until the
       first scroll and were dead for every bar the drag drew. */
    const h = withChart();
    h.drag(h.page.querySelector('[data-pl-drag]'), 90);
    const mark = h.page.querySelector('[data-pl-tip]');
    mark.getBoundingClientRect = () => ({left: 10, top: 10, width: 4, height: 4});
    mark.dispatchEvent(new h.win.MouseEvent('mouseover', {bubbles: true}));
    assert.ok(h.tipVisible(), 'a mark drawn by the drag must still have its tip');
    assert.ok(/rpe at/.test(h.tipText()), h.tipText());
  });

  it('hides the tooltip on the way out, but not while moving within a mark', () => {
    const h = withChart();
    const mark = h.page.querySelector('[data-pl-tip]');
    mark.getBoundingClientRect = () => ({left: 10, top: 10, width: 4, height: 4});
    mark.dispatchEvent(new h.win.MouseEvent('mouseover', {bubbles: true}));
    assert.ok(h.tipVisible());
    mark.dispatchEvent(new h.win.MouseEvent('mouseout',
      {bubbles: true, relatedTarget: mark}));
    assert.ok(h.tipVisible(), 'moving inside one mark is not leaving it');
    mark.dispatchEvent(new h.win.MouseEvent('mouseout', {bubbles: true}));
    assert.ok(!h.tipVisible());
  });
});

describe('the rail survives a drag', () => {
  function withRail() {
    const h = mount('<aside id="pl-rail"></aside>');
    h.api.resetCharts();
    h.page.innerHTML += h.api.plChartBox('S', h.chart('rpe', 'S'), [1]);
    h.api.sel('u7');
    h.api.bindPlantilla();
    return h;
  }

  it('a click on a chart does not close it', () => {
    /* The drag surface used to stop its own clicks — but a drag REPLACES
       that element mid-gesture, so the listener died with it and letting
       go over the chart shut the very rail being scrolled. The page
       handler asks the EVENT instead, which survives any redraw. */
    const h = withRail();
    h.click(h.page.querySelector('[data-pl-drag]'));
    assert.strictEqual(h.api.sel(), 'u7', 'the rail must stay open');
    assert.deepStrictEqual(h.renders, []);
  });

  it('releasing a drag outside the chart does not close it either', () => {
    const h = withRail();
    h.drag(h.page.querySelector('[data-pl-drag]'), 90);
    h.click(h.page);                     // the click the release raises
    assert.strictEqual(h.api.sel(), 'u7', 'the drag ends, the rail stays');
  });

  it('but a plain click on the page still closes it', () => {
    // The swallow is for ONE click, not a permanent exemption.
    const h = withRail();
    h.drag(h.page.querySelector('[data-pl-drag]'), 90);
    h.click(h.page);
    h.click(h.page);
    assert.strictEqual(h.api.sel(), null, 'the next click closes as always');
  });

  it('a click on the page closes it when no drag happened at all', () => {
    const h = withRail();
    h.click(h.page);
    assert.strictEqual(h.api.sel(), null);
  });

  it('a press that never moved is a click, and still closes it', () => {
    /* The swallow is for a DRAG. Armed on every mouseup it would eat the
       next click on the page as well, and the rail would take two clicks
       to close for no reason a user could see. */
    const h = withRail();
    const rect = h.page.querySelector('[data-pl-drag]');
    rect.getBoundingClientRect = () => ({width: 300, left: 0, top: 0, height: 100});
    rect.dataset.plWin = '10';
    rect.dataset.plTotal = '40';
    rect.dispatchEvent(new h.win.MouseEvent('mousedown', {bubbles: true, clientX: 200}));
    h.win.dispatchEvent(new h.win.MouseEvent('mouseup', {bubbles: true}));
    h.click(h.page);
    assert.strictEqual(h.api.sel(), null, 'nothing moved, so nothing to swallow');
  });
});

describe('the wiring', () => {
  const CHARTS = ['plRpeChartHtml', 'plWeekChartHtml', 'plAcwrChartHtml',
    'plRailRpeHtml', 'plRailAcwrHtml'];

  it('no chart is rendered outside a box', () => {
    /* One left unwrapped is one that silently stops responding to its own
       drag — the offset moves and nothing redraws.
       ⚠ Named explicitly. A pattern was doing this and it spelled the two
       rail charts `plRail…ChartHtml`, which is not what they are called, so
       the loop ran over an empty list and asserted nothing at all. */
    const page = grab('  function renderStaffRoster', '  function bindPlantilla');
    const rail = grab('  function plRailHtml', '  function renderStaffRoster');
    const where = page + rail;
    CHARTS.forEach((fn) => {
      const uses = (where.match(new RegExp(fn + '\\b', 'g')) || []).length;
      assert.strictEqual(uses, 1, fn + ' should be named once, as a plChartBox argument');
      assert.ok(new RegExp("plChartBox\\('[A-Z]+', " + fn + ',').test(where),
          fn + ' must be rendered through plChartBox');
    });
  });

  it('the weekly load and the A/C ratio scroll on ONE offset', () => {
    /* They are the same weeks drawn twice, the ratio derived from the bars
       above it. On separate offsets they slide out of step and the ratio
       stops belonging to the week underneath it. */
    const page = grab('  function renderStaffRoster', '  function bindPlantilla');
    const keyOf = (fn) => {
      const m = new RegExp("plChartBox\\('([A-Z]+)', " + fn + ',').exec(page);
      assert.ok(m, fn + ' is not in a box');
      return m[1];
    };
    assert.strictEqual(keyOf('plWeekChartHtml'), keyOf('plAcwrChartHtml'));
    assert.notStrictEqual(keyOf('plRpeChartHtml'), keyOf('plWeekChartHtml'),
        'the session chart has its own window');
  });

  it('the registry is emptied when the page is rebuilt', () => {
    // Otherwise it grows every render and holds ids of dead elements.
    const page = grab('  function renderStaffRoster', '    var users = getUsers();');
    assert.ok(/_plCharts = \[\];/.test(page));
  });

  it('the drag no longer calls renderPage', () => {
    const drag = grab("    page.querySelectorAll('[data-pl-drag]')", '  function plGetOff');
    assert.ok(/plRedrawCharts\(k\)/.test(drag));
    assert.ok(!/renderPage/.test(drag.replace(/\/\*[\s\S]*?\*\//g, '')),
        'a drag must never rebuild the page');
  });

  it('the tooltip binding is delegated, on events that bubble', () => {
    const bind = grab('  function bindPlantilla', "    page.querySelectorAll('[data-pl-player]')");
    assert.ok(/page\.addEventListener\('mouseover'/.test(bind));
    assert.ok(/page\.addEventListener\('mouseout'/.test(bind));
    // Comment-stripped: the comment above the handler NAMES mouseenter to
    // say why it is not used, which a bare search reads as a use of it.
    assert.ok(!/mouseenter/.test(bind.replace(/\/\*[\s\S]*?\*\//g, '')),
        'mouseenter does not bubble, so it cannot be delegated');
    assert.ok(!/querySelectorAll\('\[data-pl-tip\]'\)/.test(bare),
        'and nothing may bind the marks one by one again');
  });
});
