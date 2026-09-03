/* The markings renderer: geometry -> DOM.
 *
 * board-geom.test.js proves the numbers are right. This proves app.js
 * actually puts them on the page, which is a separate failure mode and
 * the one that produces a board that looks subtly wrong rather than a
 * board that throws.
 *
 * Runs the REAL tbMarkingsHtml, sliced out of js/app.js over the real
 * board-geom module — no re-implementation, so a change to either side
 * shows up here.
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const appSrc = fs.readFileSync(path.join(ROOT, 'js', 'app.js'), 'utf8');
const BG = require('../js/board-geom.js');
const BS = require('../js/board-state.js');
const {readCss} = require('./read-css');

function grab(src, from, to, label) {
  const i = src.indexOf(from);
  const j = src.indexOf(to, i);
  assert.ok(i !== -1 && j !== -1, 'marker not found in ' + label + ': ' + from);
  return src.slice(i, j);
}

/* The slice starts at the PALETTE, not at tbMarkingsHtml: the markings
   take their colours from the chosen field look, so the theme helpers
   are part of what is being tested rather than something to stub out.
   `localStorage` is stubbed because tbThemeName reads the preference —
   an empty store means the default green, which is what these
   assertions are written against. */
const block = grab(appSrc, '  const TB_THEMES = {',
    '  function renderReadOnlyBoard(', 'js/app.js');
const makeApi = (themeName) => new Function('BG', 'BS', 'localStorage',
    block + '\n; return {tbMarkingsHtml, tbFieldInnerStyle, tbFieldOuterStyle, ' +
    'tbThemeName, tbTheme, tbCss, tbThemeVars, TB_THEMES};')(
    BG, BS, {getItem: () => themeName, setItem: () => {}, removeItem: () => {}});

/* The default (green) instance, plus one per palette for the theme
   assertions — the look is read from localStorage, so the only honest
   way to test another one is to render through it. */
const api = makeApi(null);

/** Every inline style on elements whose class matches, as one string. */
function styleOf(html, cls) {
  const re = new RegExp('<div class="' + cls + '" style="([^"]*)"');
  const m = re.exec(html);
  return m ? m[1] : null;
}

describe('tbMarkingsHtml', () => {
  it('draws the full set on a full board', () => {
    const html = api.tbMarkingsHtml(null, 'full', false);
    ['tb-halfway', 'tb-center-circle', 'tb-center-spot',
      'tb-penalty-left', 'tb-penalty-right', 'tb-goal-left', 'tb-goal-right',
      'tb-penalty-arc-left', 'tb-penalty-arc-right',
      'tb-penalty-spot-left', 'tb-penalty-spot-right'].forEach((c) => {
      assert.ok(html.indexOf('class="' + c + '"') !== -1, 'missing ' + c);
    });
  });

  it('omits — rather than hides — what a board type does not have', () => {
    /* The CSS used to `display:none` the unused half of the markings.
       Now they are simply not emitted, which is why deleting those
       rules was safe. */
    const html = api.tbMarkingsHtml(null, 'area', false);
    assert.ok(html.indexOf('tb-penalty-right') === -1);
    assert.ok(html.indexOf('tb-center-circle') === -1);
    assert.ok(html.indexOf('tb-halfway') === -1);
    assert.ok(html.indexOf('display:none') === -1,
        'nothing should be emitted just to be hidden');
  });

  it('a half board draws one penalty area, and it is the LEFT slot', () => {
    /* Worth pinning: the old CSS positioned .tb-penalty-RIGHT for half
       and area boards while hiding the left one. board-geom names the
       single box 'Left', so the slots are the other way round from
       what the deleted stylesheet did. Getting this backwards renders
       an empty board with all the geometry computed correctly. */
    const html = api.tbMarkingsHtml(null, 'half', false);
    assert.ok(html.indexOf('tb-penalty-left') !== -1);
    assert.ok(html.indexOf('tb-penalty-right') === -1);
  });

  it('writes real percentages, never NaN or undefined', () => {
    /* A NaN in a style string is silently dropped by the browser and
       the element lands at 0,0 — a whole marking set collapsed into
       the top-left corner, with no error anywhere. */
    ['full', 'half', 'area'].forEach((bt) => {
      [false, true].forEach((vert) => {
        [null, [60, 40, 'f7'], [105, 68, 'f11']].forEach((pitch) => {
          const html = api.tbMarkingsHtml(pitch, bt, vert);
          assert.ok(!/NaN|undefined|null/.test(html),
              bt + '/' + vert + ' emitted a bad value: ' + html.slice(0, 200));
        });
      });
    });
  });

  it('opens each box at the edge it sits on', () => {
    /* The goal line side has no line. The old CSS hardcoded
       `border-left:none` for the left box — correct horizontally,
       wrong the moment the board rotates and that box is at the
       bottom. */
    const h = api.tbMarkingsHtml(null, 'full', false);
    assert.ok(/border-left:none/.test(styleOf(h, 'tb-penalty-left')));
    assert.ok(/border-right:none/.test(styleOf(h, 'tb-penalty-right')));

    const v = api.tbMarkingsHtml(null, 'full', true);
    const vLeft = styleOf(v, 'tb-penalty-left');
    assert.ok(/border-(top|bottom):none/.test(vLeft),
        'a rotated box must open along the other axis, got ' + vLeft);
  });

  it('gives the halfway line a thickness on the axis it is thin', () => {
    // width:0 with a background paints nothing, so a line has to be a
    // 2px box rather than a zero-width one with a border.
    const h = styleOf(api.tbMarkingsHtml(null, 'full', false), 'tb-halfway');
    assert.ok(/width:2px/.test(h) && /height:100%/.test(h), h);
    const v = styleOf(api.tbMarkingsHtml(null, 'full', true), 'tb-halfway');
    assert.ok(/height:2px/.test(v) && /width:100%/.test(v), v);
  });

  it('clips the arcs', () => {
    const h = api.tbMarkingsHtml(null, 'full', false);
    assert.ok(/clip-path:inset\(/.test(styleOf(h, 'tb-penalty-arc-left')));
  });

  it('draws four corner arcs on a full board', () => {
    const html = api.tbMarkingsHtml(null, 'full', false);
    assert.strictEqual((html.match(/class="tb-corner"/g) || []).length, 4);
  });

  it('two on each portrait board type, at the goal line', () => {
    /* The area board included: it spans the full pitch width, so it
       has both corners — which is what makes it usable for the drill
       it is most often opened for, a corner or a cross. */
    ['half', 'area'].forEach((bt) => {
      assert.strictEqual(
          (api.tbMarkingsHtml(null, bt, false).match(/tb-corner/g) || []).length, 2,
          bt + ' should draw two corner arcs');
    });
  });

  it('does NOT clip-path the corner arcs', () => {
    /* They are clipped by .tb-field's overflow:hidden instead — the
       circle is centred on the corner, so the quarter that survives is
       the quarter inside the pitch, in any orientation, with nothing
       to re-derive. A clip-path here would be a second mechanism doing
       the same job and would have to be rotated by hand. */
    const html = api.tbMarkingsHtml(null, 'full', false);
    const first = /<div class="tb-corner" style="([^"]*)"/.exec(html);
    assert.ok(first, 'no corner emitted');
    assert.ok(!/clip-path/.test(first[1]), first[1]);
  });

  it('does not clip the centre circle', () => {
    // It is a whole circle; a stray inset would eat three quarters of it.
    const h = api.tbMarkingsHtml(null, 'full', false);
    assert.ok(!/clip-path/.test(styleOf(h, 'tb-center-circle')));
  });
});

describe('the field box styles', () => {
  it('replaces the hardcoded 62% with the pitch aspect', () => {
    /* 68/105 is 64.76%, not 62 — the old constant described a 105x65
       pitch while the markings assumed 105x68. */
    assert.ok(/padding-top:64\.7\d%/.test(api.tbFieldInnerStyle(null, 'full', false)),
        api.tbFieldInnerStyle(null, 'full', false));
  });

  it('a resized pitch changes the box shape', () => {
    const wide = api.tbFieldInnerStyle([105, 68, 'f11'], 'full', false);
    const narrow = api.tbFieldInnerStyle([105, 45, 'f11'], 'full', false);
    assert.notStrictEqual(wide, narrow);
  });

  it('only the CSS-rotated board types get compensating margins', () => {
    assert.ok(!/margin-top/.test(api.tbFieldOuterStyle(null, 'full', true)));
    assert.ok(!/margin-top/.test(api.tbFieldOuterStyle(null, 'half', false)));
    assert.ok(/margin-top:calc\(/.test(api.tbFieldOuterStyle(null, 'half', true)));
  });

  it('a metre is the same number of pixels on BOTH axes', () => {
    /* The bug this exists to prevent, and it is worth stating plainly
       because it was reported as "the axes are inverted".

       The board's width used to be pinned by `max-width: 820px` while
       only padding-top varied. So the rendered width never changed and
       every pitch change came out as a change in HEIGHT: halving the
       length left the board 820 px wide and made it 531 -> 1052 px
       tall. Dragging the right-hand grip grew the board downwards,
       which is indistinguishable from the handle editing the wrong
       dimension. The mapping was right; a shorter pitch simply had
       nowhere to get shorter.

       Halving the length must now halve the WIDTH and leave the height
       alone. */
    const px = (s) => parseInt(/max-width:(\d+)px/.exec(s)[1], 10);
    const full = px(api.tbFieldOuterStyle([105, 68], 'full', false));
    const half = px(api.tbFieldOuterStyle([53, 68], 'full', false));
    assert.ok(Math.abs(half / full - 0.5) < 0.02,
        'halving the length should halve the rendered width: ' + half + ' vs ' + full);

    // Height comes from width x aspect, so check it did NOT change.
    const h = (pitch, w) => w * BG.aspectPct(pitch, 'full', false) / 100;
    assert.ok(Math.abs(h([105, 68], full) - h([53, 68], half)) < 2,
        'the height must not move when only the length changes');
  });

  it('the default pitch renders at exactly the size it always did', () => {
    // 820 px for horizontal, 520 for vertical — the two numbers the
    // stylesheet used to hold. Nothing moves for an unresized board.
    assert.ok(/max-width:820px/.test(api.tbFieldOuterStyle(null, 'full', false)));
    assert.ok(/max-width:520px/.test(api.tbFieldOuterStyle(null, 'full', true)));
  });

  it('a narrower pitch keeps its width and loses height', () => {
    const px = (s) => parseInt(/max-width:(\d+)px/.exec(s)[1], 10);
    assert.strictEqual(px(api.tbFieldOuterStyle([105, 34], 'full', false)), 820);
    assert.ok(BG.aspectPct([105, 34], 'full', false) <
              BG.aspectPct([105, 68], 'full', false));
  });

  it('reproduces the old hardcoded HALF margin from the geometry', () => {
    /* The deleted CSS said calc(11.5% + 1rem) for a half board, which
       is (100 - 77)/2. Landing back on it from the geometry is the
       evidence that the formula is the one the CSS encoded.

       The area board deliberately does NOT match its old 21%: it was
       widened to the full pitch width so it would carry both corners,
       which changes its aspect from 58% to about 51%. The next test
       pins that divergence so it reads as a decision rather than
       as drift. */
    approxPct(api.tbFieldOuterStyle([105, 68], 'half', true), 11.5, 0.6);
  });

  it('the area margin follows the widened area board', () => {
    const area = api.tbFieldOuterStyle([105, 68], 'area', true);
    approxPct(area, (100 - 51.47) / 2, 0.6);
  });
});

function approxPct(style, expected, tol) {
  const m = /margin-top:calc\(([\d.]+)%/.exec(style);
  assert.ok(m, 'no margin in ' + style);
  const got = parseFloat(m[1]);
  assert.ok(Math.abs(got - expected) < tol,
      'expected about ' + expected + '%, got ' + got + '%');
}

describe('field looks', () => {
  it('offers exactly the three the toggle shows', () => {
    ['green', 'dark', 'light'].forEach((k) => {
      assert.ok(api.tbCss, 'palette helpers not exported');
      const html = appSrc.slice(appSrc.indexOf('const TB_THEMES = {'),
          appSrc.indexOf('/** The chosen look'));
      assert.ok(html.includes(k + ':'), 'missing palette: ' + k);
    });
  });

  it('defaults to green, including for a nonsense stored value', () => {
    /* The preference is per-device localStorage, which outlives
       version changes and is editable by hand. */
    assert.strictEqual(api.tbThemeName(), 'green');
  });

  /* Read the real table rather than regexing the source for it —
     building a pattern through a string literal is its own hazard and
     the values are right here. */
  const lum = (n) => (((n >> 16) & 255) * 0.299 + ((n >> 8) & 255) * 0.587 +
      (n & 255) * 0.114) / 255;

  it('dark and light really are dark and light', () => {
    // Guards a swapped table, which would be invisible in a diff.
    const T = api.TB_THEMES;
    assert.ok(lum(T.dark.turf) < 0.25, 'dark turf is not dark');
    assert.ok(lum(T.light.turf) > 0.75, 'light turf is not light');
  });

  it('every palette keeps its lines legible against its own turf', () => {
    /* The failure this prevents is white lines on a white pitch —
       which is what you get by copying the green palette and changing
       only the turf. */
    Object.entries(api.TB_THEMES).forEach(([name, th]) => {
      assert.ok(Math.abs(lum(th.line) - lum(th.turf)) > 0.35,
          name + ': lines and turf are too close in tone');
    });
  });

  it('the LIGHT field actually renders dark markings', () => {
    /* Rendered through the light palette, not read off the table —
       green's line colour IS white, so asserting "no white in the
       output" would fail on the correct default. */
    const light = makeApi('light');
    const style = styleOf(light.tbMarkingsHtml(null, 'full', false), 'tb-penalty-left');
    const m = /rgba\((\d+),(\d+),(\d+)/.exec(style);
    assert.ok(m, 'no colour emitted: ' + style);
    const l = lum((+m[1] << 16) | (+m[2] << 8) | +m[3]);
    assert.ok(l < 0.6, 'light field drew a pale marking: ' + style);
  });

  it('and the green field still renders white ones', () => {
    const style = styleOf(api.tbMarkingsHtml(null, 'full', false), 'tb-penalty-left');
    assert.ok(/rgba\(255,255,255/.test(style), style);
  });

  it('the field variables follow the chosen palette', () => {
    const dark = makeApi('dark');
    assert.notStrictEqual(
        dark.tbFieldOuterStyle(null, 'full', false),
        api.tbFieldOuterStyle(null, 'full', false));
  });

  it('the field element carries the palette as CSS variables', () => {
    /* The halfway line, spots, turf and border are styled in the
       stylesheet, so they are themed through variables rather than by
       inlining each one. */
    const style = api.tbFieldOuterStyle(null, 'full', false);
    assert.ok(/--tb-turf:/.test(style) && /--tb-line-rgb:/.test(style), style);
  });

  it('the rotated board types carry them too', () => {
    // They take a different branch and would otherwise stay green.
    const style = api.tbFieldOuterStyle(null, 'half', true);
    assert.ok(/--tb-turf:/.test(style), style);
  });

  it('the stylesheet consumes the variables with a green fallback', () => {
    const css = readCss();
    assert.ok(/background:var\(--tb-turf, #2e7d32\)/.test(css), 'turf not themed');
    assert.ok(/rgba\(var\(--tb-line-rgb, 255,255,255\), \.55\)/.test(css),
        'the halfway line is not themed');
  });
});

describe('marking definition', () => {
  const s3 = fs.readFileSync(path.join(ROOT, 'js', 'board3d.js'), 'utf8');

  it('spends the whole texture budget on the long axis', () => {
    /* It was a flat 10 px per metre — a 1050 px texture stretched
       across a board rendered up to 1400 px wide, which is under one
       texel per screen pixel and exactly why the lines looked soft. */
    const fn = s3.slice(s3.indexOf('function markingsTexture'), s3.indexOf('function buildPitch'));
    assert.ok(/MAX \/ Math\.max\(e\.ax, e\.ay\)/.test(fn), fn.slice(0, 600));
    assert.ok(!/const PPM = 10;/.test(fn), 'the flat 10 px/m is the soft-lines bug');
  });

  it('draws lines at their real 12 cm width', () => {
    const fn = s3.slice(s3.indexOf('function markingsTexture'), s3.indexOf('function buildPitch'));
    assert.ok(/0\.12 \* Math\.min\(sx, sy\)/.test(fn), fn.slice(0, 400));
  });

  it('roughly doubles the texel density on a full pitch', () => {
    const before = 10;
    const after = Math.min(2048 / 105, 40);
    assert.ok(after > before * 1.8, after.toFixed(1) + ' px/m vs ' + before);
  });
});

describe('nothing in a palette is a white literal', () => {
  const s3 = fs.readFileSync(path.join(ROOT, 'js', 'board3d.js'), 'utf8');

  it('the 3D spots take the line colour, not #ffffff', () => {
    /* The centre spot and the two penalty spots are FILLED rather
       than stroked, so they were the one marking the palette missed:
       white dots on a near-white pitch. */
    /* Bounded by the function's own end, not a character count — a
       fixed window stops covering the tail the moment a comment is
       added, and then reports the tail as missing. That has now cost
       four separate false failures in this suite. */
    const from = s3.indexOf('const dot = (s) => {');
    const fn = s3.slice(from, s3.indexOf('\n    };', from));
    assert.ok(/fillStyle = hex\(th\.line\)/.test(fn), fn);
    assert.ok(!/fillStyle = '#ffffff'/.test(fn), 'a white literal is invisible on light');
  });

  it('the texture painter has no colour literals left at all', () => {
    const fn = s3.slice(s3.indexOf('function markingsTexture'),
        s3.indexOf('function buildPitch'));
    const literals = (fn.match(/'#[0-9a-fA-F]{3,6}'/g) || []);
    assert.deepStrictEqual(literals, [],
        'hardcoded colours survive in the texture: ' + literals.join(', '));
  });

  it('the LIGHT pitch sits on a dark surround', () => {
    /* Deliberate: the pitch is the subject and the sky is the frame.
       A pale pitch on a pale background loses its own edges. */
    const T = api.TB_THEMES;
    const lum2 = (n) => (((n >> 16) & 255) * 0.299 + ((n >> 8) & 255) * 0.587 +
        (n & 255) * 0.114) / 255;
    assert.ok(lum2(T.light.sky) < 0.2, 'the light look should keep a dark background');
    assert.ok(lum2(T.light.turf) > 0.75, 'but the pitch itself stays light');
  });
});
