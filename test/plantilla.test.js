/* Plantilla — the staff roster redesign (Claude Design handoff).
 *
 * The page is one HTML string over hand-built SVG, so most of it can
 * only be judged by eye. Two parts cannot: the chart GEOMETRY, which is
 * arithmetic and either lands inside the plot or does not, and the
 * WINDOWING, which decides what a coach is looking at.
 *
 * Both run for real here. The rest is pinned as source properties —
 * the handoff's own load-bearing notes, the ones a later edit would
 * undo without noticing.
 *
 * `npm run test:plantilla`, or as part of test:unit.
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const src = fs.readFileSync(path.join(__dirname, '..', 'js', 'app.js'), 'utf8');
const css = fs.readFileSync(path.join(__dirname, '..', 'css', 'style.css'), 'utf8');
const bare = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

function grab(from, to) {
  const i = src.indexOf(from);
  const j = src.indexOf(to, i);
  assert.ok(i !== -1 && j !== -1, 'marker not found in js/app.js: ' + from);
  return src.slice(i, j);
}

/** The geometry helpers, run over a sanitize stub. */
const API = (function () {
  const code = grab('  const PL_GEO =', '  /** Team chart 1') +
    grab('  function plOff(off, total, win)', '  /* ── Attendance');
  // eslint-disable-next-line no-new-func
  return new Function('sanitize',
    code + '\n return {plOff, plItemX, plLabelRowHtml, PL_GEO};')(String);
})();

describe('plOff — which window a chart opens on', () => {
  it('opens on the MOST RECENT window, not the first', () => {
    /* A roster is opened to see where the squad is now. Defaulting to
       offset 0 would open every chart on pre-season. */
    assert.strictEqual(API.plOff(null, 44, 18), 26);
    assert.strictEqual(API.plOff(undefined, 44, 18), 26);
  });

  it('clamps a drag to the ends of the series', () => {
    assert.strictEqual(API.plOff(999, 44, 18), 26, 'cannot scroll past the end');
    assert.strictEqual(API.plOff(-5, 44, 18), 0, 'nor before the start');
    assert.strictEqual(API.plOff(10, 44, 18), 10, 'and leaves a valid one alone');
  });

  it('a series shorter than the window sits at zero', () => {
    /* Week one of a season: five sessions, an 18-wide window. A negative
       offset here would slice() from the end and draw nothing. */
    assert.strictEqual(API.plOff(null, 5, 18), 0);
    assert.strictEqual(API.plOff(null, 0, 18), 0, 'and an empty one too');
  });
});

describe('plItemX — every point lands inside its plot', () => {
  const G = API.PL_GEO.team, R = API.PL_GEO.rail;

  it('centres the first and last item in their own cells', () => {
    /* `+ 0.5` is what centres them. Without it the first point sits on
       the axis and the last hangs a full cell past the plot's end. */
    [1, 2, 8, 12, 18, 44].forEach(function (n) {
      const first = API.plItemX(G, n, 0);
      const last = API.plItemX(G, n, n - 1);
      assert.ok(first > G.gut, 'n=' + n + ': first point is on the axis');
      assert.ok(last < G.gut + G.plot, 'n=' + n + ': last point overflows the plot');
      assert.ok(first < last || n === 1, 'n=' + n + ': points must ascend');
    });
  });

  it('the rail geometry is a different plot, not the same one scaled', () => {
    assert.strictEqual(R.gut, 26);
    assert.strictEqual(R.plot, 388);
    const last = API.plItemX(R, 10, 9);
    assert.ok(last < R.gut + R.plot, 'rail point overflows its plot');
  });

  it('one item sits in the middle', () => {
    assert.strictEqual(API.plItemX(G, 1, 0), G.gut + G.plot / 2);
  });
});

describe('plLabelRowHtml — the axis labels are HTML, not SVG text', () => {
  it('mirrors the viewBox with flex so labels track the chart', () => {
    /* The charts are responsive; SVG <text> scales with the viewBox, so
       dates drawn inside collide at one width and turn to specks at
       another. The row reproduces the gutter/plot/tail proportions
       exactly, which is the only reason a label sits under its point. */
    const row = API.plLabelRowHtml(API.PL_GEO.team, ['a', '', 'c']);
    assert.ok(/flex:40 0 0/.test(row), 'left gutter must match the viewBox');
    assert.ok(/flex:314 0 0/.test(row), 'plot width must match');
    assert.ok(/flex:6 0 0/.test(row), 'tail must match');
    assert.strictEqual((row.match(/<span>/g) || []).length, 3,
        'one cell per data point, blanks included');
  });

  it('keeps a blank cell rather than dropping it', () => {
    /* Every third label is drawn and the rest are empty strings. Dropping
       the empties would let the remaining ones spread out and stop
       pointing at their own dots. */
    const row = API.plLabelRowHtml(API.PL_GEO.rail, ['', '', '']);
    assert.strictEqual((row.match(/<span>/g) || []).length, 3);
  });
});

describe('the A/C bands read the same as the numbers on them', () => {
  /* Five bands, not four. Under-load used to be one flat grey strip
     below 0.8, which put a player at 0.35 in the same place as one at
     0.75 and called neither a warning. Detraining is its own risk, so
     the scale mirrors: red past 1.5 AND below 0.7, amber in the two
     margins either side of the green 0.8–1.3.

     Every rectangle is checked against the SAME formula the ratio line
     uses, so a band edge is exactly where the line crosses it — the one
     way these can disagree is if somebody nudges a literal. */
  const RED = '#F4DAD6', AMBER = '#F6E9D2', GREEN = '#DCE4DC';
  const BOUNDS = [[2.0, 1.5, RED], [1.5, 1.3, AMBER], [1.3, 0.8, GREEN],
                  [0.8, 0.7, AMBER], [0.7, 0, RED]];

  function check(chartFn, endMarker, x, width, base, span, label) {
    const body = grab(chartFn, endMarker);
    const rects = [...body.matchAll(
      new RegExp('<rect x="' + x + '" y="([\\d.]+)" width="' + width +
                 '" height="([\\d.]+)" fill="(#[0-9A-F]{6})"', 'gi'))]
      .map((m) => ({y: +m[1], h: +m[2], fill: m[3].toUpperCase()}));
    assert.strictEqual(rects.length, 5,
        label + ': expected five bands, found ' + rects.length);
    const y = (r) => base - Math.min(r, 2) / 2 * span;
    BOUNDS.forEach(([hi, lo, fill], i) => {
      const want = {y: +y(hi).toFixed(1), h: +(y(lo) - y(hi)).toFixed(1), fill};
      assert.strictEqual(rects[i].fill, want.fill,
          label + ' band ' + i + ' (' + lo + '–' + hi + '): wrong colour');
      assert.ok(Math.abs(rects[i].y - want.y) < 0.06,
          label + ' band ' + i + ': y ' + rects[i].y + ' should be ' + want.y);
      assert.ok(Math.abs(rects[i].h - want.h) < 0.06,
          label + ' band ' + i + ': h ' + rects[i].h + ' should be ' + want.h);
    });
    // They must tile the region with no gap and no overlap.
    for (let i = 1; i < rects.length; i++) {
      assert.ok(Math.abs((rects[i - 1].y + rects[i - 1].h) - rects[i].y) < 0.06,
          label + ': a gap or overlap between bands ' + (i - 1) + ' and ' + i);
    }
  }

  it('the team chart bands sit on its 0–2 scale', () => {
    // y = 80 - ratio/2*70, over the region y 10..80.
    check('  function plAcwrChartHtml', '  /* ── The player rail',
        '40', '314', 80, 70, 'team');
  });

  it('the rail chart bands sit on its own scale, not the team one', () => {
    // y = 70 - ratio/2*58, over the region y 12..70.
    check('  function plRailAcwrHtml', '  /** The body map',
        '26', '388', 70, 58, 'rail');
  });

  it('the zone label and the A/C colour agree with the bands', () => {
    /* From the CONSTANTS down: plAcColor returns PL_RED/PL_AMBER/PL_GREEN,
       so slicing from the function alone leaves them undefined and the
       whole thing throws rather than failing on a value. */
    const code = grab('  const PL_GREEN =', '  /** Thousands separator');
    // eslint-disable-next-line no-new-func
    const f = new Function('t', code + '\n return {plAcColor, plZone};')((k) => k);
    const G = '#5C8F5E', A = '#D39A2F', R = '#C0564C';
    [[1.9, R, 'pl.zone_risk'], [1.4, A, 'pl.zone_watch'],
     [1.0, G, 'pl.zone_ok'], [0.75, A, 'pl.zone_under'],
     [0.4, R, 'pl.zone_under_high']].forEach(([v, col, zone]) => {
      assert.strictEqual(f.plAcColor(v), col, 'colour at ' + v);
      assert.strictEqual(f.plZone(v), zone, 'zone at ' + v);
    });
    /* The boundaries themselves: 0.8 and 1.3 are INSIDE the green, which
       is what the band rectangles draw. */
    assert.strictEqual(f.plAcColor(0.8), G, '0.8 is optimal, not a warning');
    assert.strictEqual(f.plAcColor(1.3), G, '1.3 is optimal, not a warning');
    assert.strictEqual(f.plAcColor(0.7), A, '0.7 is the amber margin');
    assert.notStrictEqual(f.plAcColor(0.69), A, 'below 0.7 must escalate to red');
    /* JUST BELOW the boundary, not merely far below it. Checking 0.4
       against 0.75 leaves the threshold free to sit anywhere between —
       a mutation that moved it to 0.6 passed both. */
    assert.strictEqual(f.plZone(0.65), 'pl.zone_under_high',
        '0.65 is under the 0.7 line and must read as severe');
    assert.strictEqual(f.plZone(0.70), 'pl.zone_under',
        'and 0.70 itself is the amber margin, not the red');
  });
});

describe('the page reuses what the app already computes', () => {
  it('readiness comes from the SHARED cell, not a second one', () => {
    /* readinessCellHtml carries a rule the redesign must not lose: with
       no data behind it, the cell is a grey dot and NO NUMBER — a score
       nobody measured reads exactly like one that was. An early draft of
       this table printed rd.score unconditionally. */
    const body = grab('  function plRosterTableHtml', '  /* ── The player rail');
    assert.ok(/readinessCellHtml\(r\.rd/.test(body),
        'the roster must go through the shared readiness cell');
    assert.ok(!/plReadyColor\(r\.ready\) \+ '"><i class="pl-dot"/.test(body),
        'no hand-rolled readiness cell may come back');
  });

  it('the load series comes from computeReadiness, not a second pass', () => {
    /* The score and the chart beside it must be the same numbers. */
    const rd = grab('  function computeReadiness(playerId)', '  // crSplinePath');
    assert.ok(/weeks: weekSeries/.test(rd), 'computeReadiness must return its weeks');
    assert.ok(/sessions: sessions\.map/.test(rd), 'and its sessions');
    const build = grab('  function plBuildRows', '  /** The team');
    assert.ok(/weeks: rd\.weeks/.test(build) && /sessions: rd\.sessions/.test(build),
        'the page must read them rather than recompute');
  });

  it('the title uses the category LABEL, not the stored key', () => {
    /* `curCat` is the lowercase id the app stores, so printing it gave a
       38px headline reading "amateur A". CATEGORY_LABELS is also where
       the accents live — 'alevi' displays as 'Aleví' — so capitalising
       the first letter by hand would still be wrong for two of the six
       categories, and would duplicate a table that already exists. */
    const page = grab('  function renderStaffRoster', '  /** The squad');
    assert.ok(/CATEGORY_LABELS\[curCat\]/.test(page),
        'the headline must read the label table');
    assert.ok(!/\[curCat \|\| t\('common\.all'\)/.test(page),
        'the raw key must not reach the headline');
    // And the table really does hold capitalised, accented labels.
    const U = require(path.join(__dirname, '..', 'js', 'utils.js'));
    assert.strictEqual(U.CATEGORY_LABELS.amateur, 'Amateur');
    assert.strictEqual(U.CATEGORY_LABELS.alevi, 'Aleví',
        'the accent is why this cannot be done with toUpperCase');
  });

  it('the category badge survives the redesign', () => {
    /* The mock is one category, so it shows only the team letter. Under
       the "Totes" tab this list holds several, and without the badge two
       players with the same name from different squads are one row apart
       and indistinguishable. */
    const body = grab('  function plRosterTableHtml', '  /* ── The player rail');
    assert.ok(/catBadgeHtmlGlobal\(r\.u, catSpan\)/.test(body),
        'the name cell must carry the category badge');
    const page = grab('  function renderStaffRoster', '  /** The squad');
    assert.ok(/catSpanOf\(players\)/.test(page), 'and the span is computed here');
    assert.ok(!/\.map\([^)]*catSpanOf/.test(page), 'never inside a row loop');
  });

  it('the squad load is a MEAN, not a sum', () => {
    /* A squad total moves when somebody is injured, so two identical
       weeks would read differently — the same call the weekly AU figure
       made in v189. */
    const body = grab('  function plTeamWeeks', '  /* ── The roster table');
    assert.ok(/w\.acute \/ w\.n/.test(body) && /w\.chronic \/ w\.n/.test(body),
        'team load must be averaged over the players who have data');
  });
});

describe('the selection cannot outlive the list', () => {
  it('a filter change clears it', () => {
    /* _plSel names a uid. Change category or team and that player may not
       be on screen, leaving the rail describing somebody absent from the
       table beside it. */
    const page = grab('  function renderStaffRoster', '  /** The squad');
    assert.ok(/if \(!sel\) _plSel = null;/.test(page),
        'a selection with no matching row must be dropped');
    /* The FILTER HANDLER's body, not "somewhere after it in the file".
       Slicing to the end of app.js let a mutation that stripped the reset
       out of this handler survive on the strength of the rail's close
       button, hundreds of lines later, doing the same assignment. */
    const i = bare.indexOf("$$('[data-roster-filter]').forEach");
    assert.notStrictEqual(i, -1, 'the team filter handler was not found');
    const handler = bare.slice(i, bare.indexOf('\n    });', i));
    assert.ok(/_plSel = null;/.test(handler),
        'the team filter must clear the selection too');
  });

  it("the rail's own windows reset with the player", () => {
    /* Carrying one man's offset onto another's series opens the chart
       scrolled to a week he has no data for. */
    const bind = grab('  function bindPlantilla', '  function plGetOff');
    assert.ok(/_plOffPS = null; _plOffPW = null;/.test(bind),
        'selecting a player must reset the rail offsets');
  });
});

describe('style', () => {
  it('the rail becomes the page on a narrow screen', () => {
    /* 480px of rail on a 480px phone leaves nothing for the table. */
    const mq = css.slice(css.indexOf('@media (max-width: 900px)'));
    assert.ok(/\.pl-rail\s*\{[^}]*width:\s*100%/.test(mq),
        'the rail must go full width below the breakpoint');
    assert.ok(/\.pl-page\s*\{[^}]*flex-direction:\s*column/.test(mq),
        'and stack under the table');
  });

  it('the injury dot is centred on its own coordinates', () => {
    /* The dot is positioned by the zone centroid, which is the centre of
       the affected area — so the dot has to be centred on that point,
       not hung below and right of it. */
    assert.ok(/\.pl-inj-dot\s*\{[^}]*transform:\s*translate\(-50%,\s*-50%\)/.test(css),
        'the injury dot must be centred on its percentage position');
  });
});
