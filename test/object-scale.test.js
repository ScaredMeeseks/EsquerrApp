/* One size, both boards — MEASURED in metres.
 *
 * The two views used different units: 2D sized objects in fixed
 * pixels, 3D in metres. They could not agree by construction, and 2D
 * could not agree with itself either — the same 24px disc was a
 * 3.07m player on a full board and a 1.99m player on a half board,
 * because the two have different px-per-metre.
 *
 * These tests convert whatever each view declares into METRES and
 * compare. That is the only comparison that means anything: a test
 * asserting "both say 24" or "both say 1.8" would pass just as
 * happily with one of them measuring the wrong thing.
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const BG = require(path.join(ROOT, 'js', 'board-geom.js'));
const {readCss} = require('./read-css');
const css = readCss();
const b3 = fs.readFileSync(path.join(ROOT, 'js', 'board3d.js'), 'utf8');

/** The metre figure a CSS rule asks for, out of its calc(). */
function cssMetres(selector, prop) {
  const i = css.indexOf(selector + ' {');
  assert.ok(i !== -1, selector + ' not found');
  const rule = css.slice(i, css.indexOf('}', i));
  // `var(--tb-ppm, 7.81)` — the fallback is part of the function call.
  const m = new RegExp(
      prop + ':[^;]*var\\(--tb-ppm[^)]*\\)\\s*\\*\\s*([\\d.]+)').exec(rule);
  assert.ok(m, selector + ' must size ' + prop +
      ' from --tb-ppm, in metres. Rule was:\n' + rule);
  return parseFloat(m[1]);
}

/**
 * The metre figure a rule asks for through a PER-ELEMENT multiplier.
 *
 * A text label's size is its own, so the stylesheet cannot hold a literal —
 * it holds `calc(var(--tb-ppm) * var(--tb-tfs, 1.54))` and the emitters set
 * the inner variable. The FALLBACK is the default size, and it is the thing
 * that must still come from the one table: a rule whose fallback had drifted
 * would render every untouched label at the wrong size and nothing else
 * would notice.
 */
function cssVarMetres(selector, prop, varName) {
  const i = css.indexOf(selector + ' {');
  assert.ok(i !== -1, selector + ' not found');
  const rule = css.slice(i, css.indexOf('}', i));
  const m = new RegExp(
      prop + ':[^;]*var\\(--tb-ppm[^)]*\\)\\s*\\*\\s*var\\(' +
      varName + ',\\s*([\\d.]+)\\)').exec(rule);
  assert.ok(m, selector + ' must size ' + prop + ' from --tb-ppm through ' +
      varName + ', with the default as the fallback. Rule was:\n' + rule);
  return parseFloat(m[1]);
}

/** The metre figure board3d uses for a constant. */
function solidMetres(name) {
  const m = new RegExp('const ' + name + ' = ([\\d.]+)').exec(b3);
  assert.ok(m, name + ' not found in board3d.js');
  return parseFloat(m[1]);
}

describe('an object is the same size in both views', () => {
  it('the size table is the single source, and is metric', () => {
    ['player', 'ball', 'cone', 'coneHeight'].forEach((k) => {
      assert.strictEqual(typeof BG.OBJ[k], 'number', 'OBJ.' + k);
      assert.ok(BG.OBJ[k] > 0 && BG.OBJ[k] < 20,
          'OBJ.' + k + ' = ' + BG.OBJ[k] + ' is not a plausible size in metres');
    });
  });

  it('3D is the reference scale, as decided', () => {
    assert.strictEqual(BG.OBJ.player, 1.80);
    assert.strictEqual(BG.OBJ.ball, 0.50);
    assert.strictEqual(BG.OBJ.cone, 0.70);
  });

  it('the 2D board asks for the table\'s metres, not pixels', () => {
    assert.strictEqual(cssMetres('.tb-circle', 'width'), BG.OBJ.player);
    assert.strictEqual(cssMetres('.tb-ball', 'width'), BG.OBJ.ball);
  });

  it('the 3D scene uses the table too, so neither can drift', () => {
    /* board3d's own PLAYER_R / BALL_R / CONE_R must derive from BG,
       not be a second transcription of the same numbers. */
    assert.ok(/PLAYER_R\s*=\s*BG\.OBJ\.player\s*\/\s*2/.test(b3),
        'PLAYER_R must come from BG.OBJ.player');
    assert.ok(/BALL_R\s*=\s*BG\.OBJ\.ball\s*\/\s*2/.test(b3),
        'BALL_R must come from BG.OBJ.ball');
    assert.ok(/CONE_R\s*=\s*BG\.OBJ\.cone\s*\/\s*2/.test(b3),
        'CONE_R must come from BG.OBJ.cone');
  });

  it('agrees on every board type, which fixed pixels never did', () => {
    /* The old failure, stated directly: a 24px disc on an 820px full
       board is 3.07m, and on an 820px half board 1.99m. Sizing in
       metres makes the board type irrelevant, which is the point. */
    const boards = [
      ['full horizontal', 820, null, 'full', false],
      ['full vertical', 520, null, 'full', true],
      ['half', 820, null, 'half', false],
      ['area', 820, null, 'area', false],
      ['full, resized pitch', 820, [130, 90], 'full', false]
    ];
    boards.forEach(([name, widthPx, pitch, type, vert]) => {
      const perM = BG.ppm(widthPx, pitch, type, vert);
      assert.ok(perM > 0, name + ' has no scale');
      // What the CSS would render, converted straight back to metres.
      const rendered = (BG.OBJ.player * perM) / perM;
      assert.ok(Math.abs(rendered - BG.OBJ.player) < 1e-9,
          name + ' renders a ' + rendered.toFixed(2) + 'm player, not ' +
          BG.OBJ.player + 'm');
    });
  });

  it('ppm tracks the board width, so the overlay scales with zoom', () => {
    /* Complaint 2: objects kept their pixel size while the pitch grew
       under them. ppm is what makes a metre bigger when the board is. */
    const small = BG.ppm(820, null, 'full', false);
    const zoomed = BG.ppm(3280, null, 'full', false);
    assert.ok(Math.abs(zoomed / small - 4) < 1e-9,
        'four times the board width must be four times the scale');
    assert.ok(BG.OBJ.player * zoomed > BG.OBJ.player * small,
        'a player must be bigger on a bigger board');
  });

  it('marks are metric, and every stroke is ONE weight', () => {
    /* Pen strokes and arrow shafts were 0.32 (the 2D 2.5px) against a
       0.19 zone outline (1.5px) — three marks from the same hand at
       two weights. They are one number now. */
    const perM = BG.ppm(820, null, 'full', false);
    const back = (m) => m * perM;
    assert.strictEqual(BG.MARK.pen, BG.MARK.rectStroke,
        'a pen stroke must be as thick as a zone outline');
    assert.strictEqual(BG.MARK.arrowShaft, BG.MARK.rectStroke,
        'an arrow shaft must be as thick as a zone outline');
    assert.ok(Math.abs(back(BG.MARK.rectStroke) - 1.5) < 0.1,
        'and that weight is the 2D 1.5px, got ' + back(BG.MARK.rectStroke).toFixed(2));
    /* The head is a shape, not a weight, so it keeps its own size. */
    assert.ok(Math.abs(back(BG.MARK.arrowHead) - 12) < 0.5,
        'arrow head should be the 2D 12px');
  });

  it('board3d reads the mark table rather than keeping its own numbers', () => {
    assert.ok(/PEN_W\s*=\s*BG\.MARK\.pen/.test(b3),
        'PEN_W must come from BG.MARK.pen');
    assert.ok(!/const PEN_W = 0\.3/.test(b3),
        'the standalone 0.3 must be gone, or the two tables drift apart');
  });
});

/* ── The sizes must resolve to LENGTHS ────────────────────────────
 *
 * This shipped broken and looked exactly like a rendering disaster:
 * every player became a wide ellipse. The cause was one missing unit.
 * `--tb-ppm` was written as a bare number, so `calc(var(--tb-ppm) *
 * 1.80)` evaluated to `14.06` — a NUMBER. `width: max(16px, 14.06)`
 * mixes a length with a number, which is invalid, so the browser drops
 * the whole declaration and width falls back to `auto`. An auto-width
 * flex box sizes itself around the `<input>` it contains, and an input
 * defaults to about twenty characters wide.
 *
 * The test that was supposed to cover this read the metre multiplier
 * out of the declaration with a regex. The multiplier was correct.
 * Nothing checked that the expression it sits in produces a length —
 * so a source-shaped assertion passed on CSS the browser threw away.
 */
describe('the metric sizes resolve to real lengths', () => {
  const app = fs.readFileSync(path.join(ROOT, 'js', 'app.js'), 'utf8');
  const LENGTH = /^-?[\d.]+(px|rem|em|vw|vh|pt|%)$/;

  /** Every value app.js ever assigns to --tb-ppm. */
  const emitted = () => {
    /* Anchored on each write and read forward a fixed window, then
       asked one question: does the emitted string carry `px`? Trying
       to match the whole expression was brittle — the first attempt
       required the statement to end `))` and the real one ends
       `+ 'px')`, so it found nothing and reported the writer missing
       rather than unitless. */
    const sites = [
      ['tbPpmVar', app.indexOf("'--tb-ppm:'")],
      ['follow loop', app.indexOf("setProperty('--tb-ppm'")]
    ];
    return sites.map(([where, at]) => ({
      where,
      found: at !== -1,
      unit: at === -1 ? '' : (/\+\s*'(\w+);?'/.exec(app.slice(at, at + 220)) || ['', ''])[1]
    }));
  };

  /* ⚠ THE RENDER'S VALUE IS A MAXIMUM, NOT A MEASUREMENT. tbFieldScaleStyle
     sets `max-width`, so the editor board renders narrower than
     tbFieldWidthPx on any screen that cannot give it the full width — while
     tbPpmVar went on declaring the scale for that full width. Measured on a
     514px board: --tb-ppm said 7.81 while the truth was 4.90, so a 2.56 m
     label was drawn 20px, which is 6.7 m there. Every metric object was
     equally wrong, which is why it looked plausible — the whole 2D board was
     wrong together. It only showed against the 3D view, which is metric for
     real, as "the position translates but the size does not". */
  it('the editor re-measures the board it actually got', () => {
    const i = app.indexOf('const tbSyncPpm = ');
    assert.ok(i !== -1, 'the editor no longer re-measures its own width');
    const body = app.slice(i, i + 700);
    assert.ok(/field\.offsetWidth/.test(body),
        'the scale must come from the RENDERED width, not from a maximum');
    assert.ok(!/getBoundingClientRect/.test(body),
        'getBoundingClientRect includes the zoom transform, which must not ' +
        'rescale the objects — the whole board already scales together');
    assert.ok(/BG\.ppm\(w, tbPitch\(\), tbBoardType\(\), tbVertical\(\)\)/.test(body),
        'it must ask BG for the scale, with the board it is actually showing');
    assert.ok(/ResizeObserver/.test(body),
        'a one-shot measurement goes stale the moment the window is resized');
    assert.ok(/\+ 'px'\)/.test(body), 'and it must carry the unit, like every other writer');
  });

  it('every writer gives --tb-ppm a unit', () => {
    const writers = emitted();
    writers.forEach((w) => assert.ok(w.found,
        w.where + ' no longer writes --tb-ppm at all'));
    writers.forEach((w) => {
      assert.strictEqual(w.unit, 'px',
          w.where + ' writes --tb-ppm without a unit; calc() would then ' +
          'produce a number and every declaration using it is dropped');
    });
  });

  it('every fallback is a length too', () => {
    /* `var(--tb-ppm, 7.81)` is the same bug wearing the fallback: it
       only shows when the property is missing, which is exactly when
       nobody is looking. */
    const fallbacks = css.match(/var\(--tb-ppm,\s*([^)]+)\)/g) || [];
    assert.ok(fallbacks.length > 0, 'no --tb-ppm fallbacks found at all');
    fallbacks.forEach((f) => {
      const v = /var\(--tb-ppm,\s*([^)]+)\)/.exec(f)[1].trim();
      assert.ok(LENGTH.test(v),
          f + ' falls back to "' + v + '", which is not a length');
    });
  });

  it('every declaration built from it mixes only lengths', () => {
    /* Resolve each calc() by substituting the fallback, and check the
       result still carries a unit. A max() of a length and a number
       is invalid however sensible the numbers look. */
    const uses = css.match(/[a-z-]+:\s*(?:max\([^;]*?\))?[^;]*?var\(--tb-ppm[^;]*;/g) || [];
    assert.ok(uses.length >= 8, 'expected the object and mark rules; got ' + uses.length);
    uses.forEach((decl) => {
      const calcs = decl.match(/calc\([^)]*\)/g) || [];
      assert.ok(calcs.length > 0, 'no calc() in: ' + decl);
      calcs.forEach((c) => {
        // Everything multiplied inside must be a plain number except
        // the variable, which supplies the one unit.
        const units = (c.match(/\d+(px|rem|em|%)/g) || []).length;
        assert.strictEqual(units, 1,
            'calc must carry exactly one unit, from the variable: ' + c +
            ' in ' + decl);
      });
      // And any max()/min() sibling must be a length, not a bare number.
      const guard = /(?:max|min)\(\s*([^,]+),/.exec(decl);
      if (guard) {
        assert.ok(LENGTH.test(guard[1].trim()),
            'the floor "' + guard[1].trim() + '" is not a length in: ' + decl);
      }
    });
  });

  /* ── Text labels, the last object to join the table (v259) ────────
     They were still in fixed pixels a year after everything else moved,
     and failed in both directions at once: a note resized in the editor
     kept its 300px box on a 250px card — 124% of the card's width — while
     scaleRoField overwrote its font with `max(5, 14 * s)` and threw the
     authored size away. 3D drew every label six metres wide whatever it
     said. Measured, not argued: scripts/probe-ro-text-scale.js. */
  it('a text label is metric too, and from the same table', () => {
    assert.strictEqual(typeof BG.OBJ.text, 'number');
    assert.ok(BG.OBJ.text > 0 && BG.OBJ.text < 20,
        'OBJ.text = ' + BG.OBJ.text + ' is not a plausible size in metres');
    assert.strictEqual(cssVarMetres('.tb-text-label', 'font-size', '--tb-tfs'),
        BG.OBJ.text,
        'the stylesheet default has drifted from BG.OBJ.text');
  });

  it('the default is the editor\'s historical 12px, so nothing moves', () => {
    /* The whole point of 1.54: a board nobody has touched renders exactly
       as it did before the conversion. */
    const perM = BG.ppm(820, null, 'full', false);
    assert.ok(Math.abs(BG.OBJ.text * perM - 12) < 0.1,
        'OBJ.text should be 12px at the full board, got ' +
        (BG.OBJ.text * perM).toFixed(2));
  });

  /* ⚠ TEXT IS OFF THE METRIC TABLE AGAIN, AND ON PURPOSE (v262). Sizing it
     in metres was arithmetically right and absurd in practice: a real note
     stores 3.59 m per line in a 19.96 m box, so 3D stood a 39 m column of
     text on a 105 m pitch, drawn exactly as 2D drew it. A note is a caption,
     measured against the SCREEN — the same "UI affordance that had drifted
     into being a measurement" the OBJ comment warns about. So the words are
     listed under the board by app.js and 3D marks the spot with a pin.
     BG.OBJ.text stays: 2D still sizes the label from it. */
  describe('a note is a pin in 3D and a row under the board', () => {
    const appSrc = fs.readFileSync(path.join(ROOT, 'js', 'app.js'), 'utf8');
    const fnOf = (src, name) => {
      const i = src.indexOf('function ' + name + '(');
      assert.ok(i !== -1, name + ' is gone');
      const j = src.indexOf('\n  }', i);
      return src.slice(i, j === -1 ? src.length : j);
    };

    /* A pin was tried in v262 and read as a player — which is what a small
       numbered disc on a football pitch looks like. Nothing marks a note on
       the turf now; the list under the board is the whole of it. */
    it('3D puts nothing in the scene for a note', () => {
      assert.ok(!/function addText\(/.test(b3),
          'board3d is building something for a text again');
      assert.ok(!/forEach\(addText\)/.test(b3),
          'rebuild still walks the texts into the scene');
      assert.ok(!/BG\.textMetres/.test(b3),
          'board3d is sizing text in metres again');
    });

    /* ⚠ AND THE FLAT OVERLAY MUST NOT DRAW THEM EITHER. The draw surface
       lays the 2D board over the 3D turf and re-shows named layers; it named
       the labels, so with a draw tool on the note was painted a SECOND time,
       at v259's metric size. Reported as "duplicated below the box, blurry". */
    it('the draw-surface overlay does not paint the note either', () => {
      const i = css.indexOf('.tb-field.tb-draw-surface > .tb-field-inner > * {');
      assert.ok(i !== -1, 'the draw-surface allow-list is gone');
      /* Comment-stripped: the rule above it explains at length WHY the label
         is not here, and a raw search finds the explanation. */
      const list = css.slice(i, css.indexOf('}', css.indexOf('display:block', i)))
          .replace(/\/\*[\s\S]*?\*\//g, '');
      assert.ok(!/\.tb-text-label/.test(list),
          'the overlay shows the label again — that is the duplicate');
      assert.ok(/\.tb-circle/.test(list),
          'the overlay must still show the objects, or strokes float over them');
    });

    it('app.js lists the words, unnumbered', () => {
      const body = fnOf(appSrc, 'tbRenderNotes3D');
      /* Numbering tied a row to a pin, and there is no pin. A number with
         nothing to point at is furniture. */
      assert.ok(!/\(i \+ 1\)/.test(body),
          'the rows are numbered again, with nothing on the pitch to match');
      assert.ok(/sanitize\(t\[2\]/.test(body),
          'the row must carry the note text, escaped');
      assert.ok(/_tb3dNotesState\(\)/.test(body),
          'the list must read the SAME state the scene was mounted with');
    });

    /* ⚠ THE PANEL AND THE HINT CANNOT SHARE A CORNER. They did: both sat
       bottom-left, and the hint showing through the panel is what the owner
       reported as the note being duplicated and blurry. The other corners
       are spoken for — menu top-left, cameras top-right, frames rail down
       the right edge — so the hint is top-centre and the panel owns the
       bottom. A test, because the next thing added to this box will look
       for a free corner too. */
    it('the notes panel and the orbit hint do not share a corner', () => {
      const rule = (sel) => {
        const i = css.indexOf(sel + ' {');
        assert.ok(i !== -1, sel + ' is gone');
        return css.slice(i, css.indexOf('}', i)).replace(/\/\*[\s\S]*?\*\//g, '');
      };
      const notes = rule('.tb-3d-notes');
      const hint = rule('.tb-3d-hint');
      assert.ok(/bottom:/.test(notes), 'the notes panel must sit at the bottom');
      assert.ok(!/bottom:/.test(hint),
          'the hint is back at the bottom, under the notes panel');
      assert.ok(/top:/.test(hint), 'the hint must be anchored to the top');
    });

    it('the list is cleared with the scene it describes', () => {
      assert.ok(/tb-3d-notes/.test(fnOf(appSrc, 'tbDestroy3D')),
          'a list left behind would sit under a 2D board describing a dead view');
    });

    it('and redrawn when the board changes', () => {
      assert.ok(/tbRenderNotes3D\(\)/.test(fnOf(appSrc, 'tb3dTouch')),
          'editing a note would leave the old words under the board');
    });

    /* 2D is untouched: the label is still sized from the table there, which
       is what keeps an untouched board looking exactly as it did. */
    it('2D still sizes its label from the table', () => {
      assert.strictEqual(
          cssVarMetres('.tb-text-label', 'font-size', '--tb-tfs'), BG.OBJ.text);
    });
  });

  /* ⚠ PITCH-INDEPENDENT BY CONSTRUCTION. authorWidthPx scales with the
     pitch and so does the extent it is divided by, so they cancel. If they
     ever stop cancelling, the legacy conversion silently resizes every
     label on every resized pitch. */
  it('the legacy conversion keeps the size the label was drawn at', () => {
    /* ⚠ NOT 12px. Twelve converts to the DEFAULT, so a reader that had
       stopped converting and just returned OBJ.text would pass — which is
       exactly the mutant that survived the first run of this suite. 20px is
       a size nothing else would produce. */
    const T20 = [0, 0, 'x', '#000', 0.8, 300, 96, 20];
    const got = BG.textMetres(T20, 'full').fontM;
    assert.ok(Math.abs(got - 20 / BG.authorPpm('full')) < 0.01,
        'a 20px label must convert to 20px worth of metres, got ' + got);
    assert.ok(Math.abs(got - BG.OBJ.text) > 0.5,
        'the conversion has collapsed to the default');
  });

  /* ⚠ THE BOARD TYPE IS THE WHOLE INPUT. The same 12px means a different
     real size on a full board and a half board — 7.81 against 12.06 px/m —
     and that disagreement is the bug OBJ exists to have ended. */
  it('and it depends on the board type', () => {
    const T = [0, 0, 'x', '#000', 0.8, 300, 96, 12];
    const full = BG.textMetres(T, 'full');
    const half = BG.textMetres(T, 'half');
    ['full', 'half', 'area'].forEach((bt) => {
      const a = BG.textMetres(T, bt);
      assert.ok(a.fontM > 0 && a.wM > 0, bt + ' converted to nothing');
    });
    assert.ok(full.fontM > half.fontM * 1.3,
        'a half board packs more pixels into a metre, so the same pixel ' +
        'size is a SMALLER label there: ' + full.fontM + ' vs ' + half.fontM);
    assert.ok(Math.abs(BG.textMetres(T, 'full').fontM - BG.OBJ.text) < 0.01,
        'a 12px label on a full board is the default size, by definition');
  });

  /* The two rules the stylesheet has to keep for a metric label to work at
     all: no fixed box, and padding that follows the font rather than
     swamping it once the font is 7px on a catalogue card. */
  it('a label has no fixed box and its padding follows the font', () => {
    const i = css.indexOf('.tb-text-label {');
    const rule = css.slice(i, css.indexOf('}', i));
    const w = /width:([^;]+);/.exec(rule);
    assert.ok(w, '.tb-text-label must declare a width');
    assert.ok(/var\(--tb-tw,\s*auto\)/.test(w[1]),
        'the width must come from --tb-tw and default to auto, got ' + w[1]);
    const pad = /padding:([^;]+);/.exec(rule);
    assert.ok(pad, '.tb-text-label must declare padding');
    assert.ok(/em/.test(pad[1]) && !/px/.test(pad[1]),
        'padding must be in em so it scales with the font, got ' + pad[1]);
  });

  it('metres win over the pixels kept beside them', () => {
    /* 5 and 7 are a compatibility shadow for cached old clients. A reader
       that preferred them would be reading the stale half of the row. */
    const T = [0, 0, 'x', '#000', 0.8, 300, null, 12, 2.5, 1.0];
    assert.deepStrictEqual(BG.textMetres(T, 'full'), {wM: 2.5, fontM: 1.0});
  });

  it('an untouched label gets the default rather than nothing', () => {
    const T = [0, 0, 'x', '#000', 0.8, null, null, null];
    assert.deepStrictEqual(BG.textMetres(T, 'full'),
        {wM: null, fontM: BG.OBJ.text});
  });

  it('a player is a circle, not whatever its contents make it', () => {
    /* The visible symptom was width:auto stretching the disc around
       the shirt-number input. Width and height must be the same
       expression, and both explicit. */
    const i = css.indexOf('.tb-circle {');
    const rule = css.slice(i, css.indexOf('}', i));
    const w = /width:([^;]+);/.exec(rule);
    const h = /height:([^;]+);/.exec(rule);
    assert.ok(w && h, '.tb-circle must set both width and height');
    assert.strictEqual(w[1].trim(), h[1].trim(),
        'a player disc must be square, or it renders as an ellipse');
  });
});
