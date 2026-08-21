/* Club kits — the model, the era resolver and the SVG paint.
 *
 * Before this, jerseySvg()/sockSvg() knew exactly two words each and every
 * club on the platform wore Esquerra de l'Eixample's kit. Worse, both were a
 * BINARY TEST WITH A SILENT FALLBACK — `variant === 'yellow' ? … : white` —
 * so an unknown value rendered a *wrong* shirt rather than failing. Kits
 * take an object instead, which turns that whole class of bug into an
 * absent icon or a throw.
 *
 * The pieces stay independently selectable (the owner's call): a kit is a
 * SOURCE OF PIECES, not an atomic outfit, so a coach can still mix a 1a
 * shirt with 2a socks — but only from pieces the club owns.
 */
const assert = require('assert');
const U = require('../js/utils.js');

const KITS = [
  {id: 'k1', label: '1a', shirt: '#ffffff', shorts: '#000000', socks: 's|h|6|#ffffff|#222222'},
  {id: 'k2', label: '2a', shirt: 's|v|4|#e53935|#ffffff', shorts: '#e53935', socks: '#e53935'}
];

describe('kits — what an unconfigured club wears', () => {
  it('falls back to today\'s two kits, never to nothing', () => {
    /* An empty picker is a screen with no way to answer. Every caller would
       otherwise need its own guard. */
    assert.deepStrictEqual(U.kitsOf(null), U.DEFAULT_KITS);
    assert.deepStrictEqual(U.kitsOf({}), U.DEFAULT_KITS);
    assert.deepStrictEqual(U.kitsOf({kits: []}), U.DEFAULT_KITS);
    assert.ok(U.kitsOf(null).length > 0);
  });

  it('the fallback IS the current hardcoded look', () => {
    /* The whole "don't make 60 other clubs look different" guarantee. These
       are the exact literals jerseySvg/sockSvg used. */
    assert.strictEqual(U.DEFAULT_KITS[0].shirt, '#FFFFFF');
    assert.strictEqual(U.DEFAULT_KITS[1].shirt, '#FFD662');
    assert.strictEqual(U.DEFAULT_KITS[1].socks, '#FFD662');
    assert.ok(U.parseFill(U.DEFAULT_KITS[0].socks).striped,
        'kit 1 socks are the black-and-white hoops');
    assert.strictEqual(U.parseFill(U.DEFAULT_KITS[0].socks).dir, 'h',
        'hoops are HORIZONTAL — vertical would be a different sock');
  });

  it('never offers more than three', () => {
    assert.ok(U.DEFAULT_KITS.length <= 3);
  });

  it('uses a configured list when there is one', () => {
    assert.deepStrictEqual(U.kitsOf({kits: KITS}), KITS);
  });
});

describe('kits — resolving a stored convocatòria', () => {
  it('era 1: a bare array had no kit, and must not gain one', () => {
    // The legacy form is a plain list of player ids. Painting a kit onto it
    // would be inventing data that was never sent.
    assert.strictEqual(U.resolveKitPieces(['u1', 'u2'], KITS), null);
    assert.strictEqual(U.resolveKitPieces(null, KITS), null);
    assert.strictEqual(U.resolveKitPieces({players: ['u1']}, KITS), null);
  });

  it('era 2: the old words resolve to the colours they meant', () => {
    const r = U.resolveKitPieces({jersey: 'yellow', socks: 'yellow'}, KITS);
    assert.strictEqual(r.shirt, '#FFD662');
    assert.strictEqual(r.socks, '#FFD662');
  });

  it('era 2: a MIX still renders as the mix that was sent', () => {
    /* A coach can already send a white shirt with yellow socks today. That
       record must keep rendering as what was actually sent, which is why
       the resolver returns pieces rather than snapping to a stored kit. */
    const r = U.resolveKitPieces({jersey: 'white', socks: 'yellow'}, KITS);
    assert.strictEqual(r.shirt, '#FFFFFF');
    assert.strictEqual(r.socks, '#FFD662');
  });

  it('era 2: shorts stay undrawn, because they never existed', () => {
    const r = U.resolveKitPieces({jersey: 'white', socks: 'striped'}, KITS);
    assert.strictEqual(r.shorts, null);
    assert.ok(U.parseFill(r.socks).striped);
  });

  it('era 3: ids resolve per piece, so a mix is still expressible', () => {
    const r = U.resolveKitPieces(
        {shirtId: 'k1', shortsId: 'k1', socksId: 'k2'}, KITS);
    assert.strictEqual(r.shirt, '#ffffff');
    assert.strictEqual(r.shorts, '#000000');
    assert.strictEqual(r.socks, '#e53935');
  });

  it('era 3: a DELETED kit shows nothing, never the wrong kit', () => {
    // Falling back to kits[0] would silently repaint history.
    const r = U.resolveKitPieces({shirtId: 'gone', socksId: 'k2'}, KITS);
    assert.strictEqual(r.shirt, null);
    assert.strictEqual(r.socks, '#e53935');
    assert.strictEqual(U.resolveKitPieces({shirtId: 'gone'}, KITS), null);
  });

  it('does not mutate what it is given', () => {
    const entry = {jersey: 'white', socks: 'yellow'};
    const copy = JSON.parse(JSON.stringify(entry));
    U.resolveKitPieces(entry, KITS);
    assert.deepStrictEqual(entry, copy);
  });
});

describe('kits — striped fills are drawn as rects, not a gradient', () => {
  /* It WAS a <linearGradient> with hard stops, and at icon size the stripes
     looked uneven — bands appearing to have different widths and the gaps
     between them varying. A gradient stop lands on a fractional device
     pixel and the browser antialiases each boundary by a different amount,
     so one edge renders sharp and the next as a half-tone smear. At 56px
     with 9 bands each band is barely 3 pixels, which is where that shows
     most. Rects with shape-rendering="crispEdges" snap to the pixel grid. */
  const BOX = {x: 16, y: 6, w: 32, h: 50};
  const rectsOf = (r) => [...r.shapes.matchAll(
      /<rect x="([\d.]+)" y="([\d.]+)" width="([\d.]+)" height="([\d.]+)"/g)];

  it('hands a solid fill through as one path, with no defs', () => {
    const r = U.stripeSvg('#ff0000', 'a', 'M0 0', BOX);
    assert.strictEqual(r.defs, '');
    assert.ok(r.shapes.indexOf('fill="#ff0000"') !== -1);
    assert.strictEqual(rectsOf(r).length, 0);
  });

  it('snaps every band edge to the pixel grid', () => {
    // Without this the whole change is pointless: an antialiased boundary
    // is exactly what made the stripes look irregular.
    const r = U.stripeSvg('s|v|4|#ff0000|#ffffff', 'a', 'M0 0', BOX);
    rectsOf(r).forEach(() => {});
    const crisp = (r.shapes.match(/shape-rendering="crispEdges"/g) || []).length;
    assert.strictEqual(crisp, rectsOf(r).length,
        'every band must be crisp, not just some');
  });

  it('makes every band exactly the same width', () => {
    /* The complaint was "different separations or different widths".
       Boundaries come from i/n each time rather than by accumulating a
       rounded width, which is what drifts. */
    [2, 3, 4, 5, 9].forEach((n) => {
      const r = U.stripeSvg('s|v|' + n + '|#a1a1a1|#ffffff', 'x', 'M0 0', BOX);
      const expect = BOX.w / n;
      rectsOf(r).forEach((m) => {
        assert.ok(Math.abs(Number(m[3]) - expect) < 1e-3,
            'n=' + n + ' band width ' + m[3] + ' != ' + expect);
      });
    });
  });

  it('draws only the alternating bands, over a solid base', () => {
    // Half the rects, and two adjacent same-coloured bands can never show
    // a seam between them.
    assert.strictEqual(rectsOf(U.stripeSvg('s|v|4|#a|#b', 'x', 'M0 0', BOX)).length, 2);
    assert.strictEqual(rectsOf(U.stripeSvg('s|v|9|#a|#b', 'x', 'M0 0', BOX)).length, 4);
    assert.strictEqual(rectsOf(U.stripeSvg('s|v|2|#a|#b', 'x', 'M0 0', BOX)).length, 1);
  });

  it('ends the last band exactly on the shape\'s edge', () => {
    // An accumulated width leaves a hairline of the base colour down the
    // side of every shirt.
    const r = U.stripeSvg('s|v|4|#a1a1a1|#ffffff', 'x', 'M0 0', BOX);
    const last = rectsOf(r).pop();
    assert.strictEqual(Number(last[1]) + Number(last[3]), BOX.x + BOX.w);
  });

  it('agrees with fillCss about DIRECTION', () => {
    /* The one bug no visual check catches: the same kit striping vertically
       on the tactical board and horizontally on the shirt. */
    const v = U.stripeSvg('s|v|4|#a1a1a1|#ffffff', 'x', 'M0 0', BOX);
    assert.ok(U.fillCss('s|v|4|#a1a1a1|#ffffff').background.indexOf('90deg') !== -1);
    const vr = rectsOf(v)[0];
    assert.ok(Number(vr[3]) < BOX.w && Number(vr[4]) === BOX.h,
        'a vertical band is narrow and full height');

    const h = U.stripeSvg('s|h|4|#a1a1a1|#ffffff', 'x', 'M0 0', BOX);
    assert.ok(U.fillCss('s|h|4|#a1a1a1|#ffffff').background.indexOf('180deg') !== -1);
    const hr = rectsOf(h)[0];
    assert.ok(Number(hr[3]) === BOX.w && Number(hr[4]) < BOX.h,
        'a horizontal hoop is full width and short');
  });

  it('clips the bands to the shape', () => {
    // Rects are rectangles; the shirt is not. Without the clip the stripes
    // would run square across the sleeves and out past the hem.
    const r = U.stripeSvg('s|v|4|#a|#b', 'q', 'M1 2 L3 4', BOX);
    assert.ok(r.defs.indexOf('<clipPath id="ksq"') !== -1);
    assert.ok(r.defs.indexOf('M1 2 L3 4') !== -1, 'the shape must be the clip');
    assert.ok(r.shapes.indexOf('clip-path="url(#ksq)"') !== -1);
  });

  it('gives each instance its own id — several kits render at once', () => {
    // Duplicate ids make every shirt take the first one's clip.
    const a = U.stripeSvg('s|v|2|#111111|#ffffff', 1, 'M0 0', BOX);
    const b = U.stripeSvg('s|v|2|#111111|#ffffff', 2, 'M0 0', BOX);
    assert.notStrictEqual(a.defs, b.defs);
    assert.notStrictEqual(a.shapes, b.shapes);
  });

  it('degrades a malformed fill to solid instead of throwing', () => {
    assert.strictEqual(U.stripeSvg('s|v|10|#a|#b', 'x', 'M0 0', BOX).defs, '',
        'n out of range is not a stripe');
    assert.doesNotThrow(() => U.stripeSvg(null, 'x', 'M0 0', BOX));
  });
});


describe('kits — the old hardcoded renderers are gone', () => {
  const fs = require('fs');
  const path = require('path');
  const src = fs.readFileSync(
      path.join(__dirname, '..', 'js', 'app.js'), 'utf8');

  it('no longer calls a renderer with a colour WORD', () => {
    /* The clean statement of "every call site converted". There were six:
       two picker buttons per garment plus the two inline read sites. The
       old pair took a string and fell back silently, so a missed site would
       have rendered a wrong shirt rather than an obviously broken one. */
    const wordCalls = src.match(/(?:jersey|sock)Svg\(\s*['"]/g) || [];
    assert.strictEqual(wordCalls.length, 0,
        'a kit is still being drawn from a hardcoded colour name');
  });

  it('reads the stored kit only through the resolver', () => {
    // sentEntry.jersey / .socks belong to era 2 and are the resolver's
    // business alone; a renderer touching them re-implements the eras.
    assert.strictEqual((src.match(/sentEntry\.jersey|sentEntry\.socks/g) || []).length, 0);
    assert.strictEqual((src.match(/a\.sentJersey|a\.sentSocks/g) || []).length, 0);
  });

  it('writes the sent entry through ONE builder', () => {
    /* Two object literals is what silently dropped startingXI: saveStartingXI
       bolts it onto the existing entry, and a fresh literal threw it away on
       every re-save. */
    const literals = src.match(/sentData\[convSelectedMatchId\] = \{/g) || [];
    assert.strictEqual(literals.length, 0, 'a raw literal overwrite is back');
    assert.ok(src.indexOf('function convSentEntry(') !== -1);
  });

  it('keeps startingXI when a convocatòria is re-saved', () => {
    // The paired negative for the bug above: merging over `prev` is the fix,
    // and this is the line that has to stay.
    const i = src.indexOf('function convSentEntry(');
    const body = src.slice(i, src.indexOf('\n    }', i));
    assert.ok(/Object\.assign\(\{\},\s*prev/.test(body),
        'the previous entry must be merged, not replaced');
    assert.ok(/delete next\.jersey/.test(body) && /delete next\.socks/.test(body),
        'era-2 keys must not linger beside the new ids');
  });

  it('binds all three garment rows with one handler', () => {
    // Two near-identical copies is how a third garment would have become a
    // third copy. The handler keys off the button's own data-field.
    assert.strictEqual((src.match(/conv-jersey-opt|conv-socks-opt/g) || []).length, 0);
    // Exactly one BINDING. (The handler also re-queries to clear the row it
    // was clicked in, so a bare selector count would be 2 and prove nothing.)
    const binds = src.match(/querySelectorAll\('\.conv-kit-opt'\)\.forEach\(btn/g) || [];
    assert.strictEqual(binds.length, 1, 'one handler for all three rows');
  });

  it('clears only the row it was clicked in', () => {
    /* Scoped to `btn.closest('.uniform-toggle')`. A document-wide clear
       would deselect the shirt when the coach picks the socks — the pieces
       are independently selectable by decision. */
    const i = src.indexOf("querySelectorAll('.conv-kit-opt').forEach(btn");
    const body = src.slice(i, src.indexOf('\n    });', i));
    assert.ok(/closest\('\.uniform-toggle'\)/.test(body),
        'deselection must be scoped to one garment row');
  });

  it('leaves the sleeves plain on VERTICAL stripes only', () => {
    /* Real striped shirts have plain sleeves; bands running out to the cuffs
       read as a rugby shirt. Hoops are the opposite — they legitimately
       continue across a sleeve — so the split is conditional, and the
       condition is the thing worth pinning. */
    const i = src.indexOf('function shirtSvg(');
    const body = src.slice(i, src.indexOf('\n  }', i));
    assert.ok(/f\.striped && f\.dir !== 'h'/.test(body),
        'the sleeve split must fire for vertical stripes and not for hoops');
    assert.ok(/SHIRT_SLEEVE_L/.test(body) && /SHIRT_SLEEVE_R/.test(body));
    // The outline is drawn last so the stripes cannot overdraw it.
    const outlineLast = body.lastIndexOf('SHIRT_OUTLINE');
    assert.ok(outlineLast > body.indexOf('SHIRT_SLEEVE_R'),
        'the outline must be painted after the fills');
  });

  it('puts the club badge on the shirt, not the app logo', () => {
    const i = src.indexOf('function shirtSvg(');
    const body = src.slice(i, src.indexOf('\n  }', i));
    assert.ok(/clubBadgeUrl\(\)/.test(body), 'the crest must be the club\'s');
    assert.ok(!/img\/logo\.png/.test(body), 'hardcoded app logo on the shirt');
    // The owner asked for the same geometry as the current Esquerra shirt.
    assert.ok(/x="33" y="18" width="10" height="10" opacity="\.7"/.test(body),
        'the crest moved or resized');
  });
});

describe('kits — nine bands land on whole pixels', () => {
  /* The half-viewBox invariant. Every STRIPED region is exactly 32 of its
     viewBox's 64 units — the shirt body x=16..48, the sock leg y=8..40 — so
     at a rendered size S the span is S/2, and nine bands (the maximum) are
     whole pixels whenever S is a multiple of 18.

     Break either half and the bands land on fractional pixels; crispEdges
     then snaps them to a mix of 3px and 4px, which is precisely the
     "different separations or different widths" that was reported. The
     arithmetic is done here rather than the constants compared, because a
     constant asserted against itself proves nothing. */
  const fs = require('fs');
  const path = require('path');
  const app = fs.readFileSync(path.join(__dirname, '..', 'js', 'app.js'), 'utf8');
  const css = fs.readFileSync(
      path.join(__dirname, '..', 'css', 'style.css'), 'utf8');
  const VIEW = 64;

  const box = (name) => {
    const m = app.match(new RegExp('const ' + name +
        ' = \\{x: (\\d+), y: (\\d+), w: (\\d+), h: (\\d+)\\}'));
    assert.ok(m, 'no ' + name + ' in app.js');
    return {x: +m[1], y: +m[2], w: +m[3], h: +m[4]};
  };

  it('the shirt body is half the viewBox wide', () => {
    assert.strictEqual(box('SHIRT_BODY_BOX').w, VIEW / 2);
  });

  it('the sock leg is half the viewBox tall', () => {
    // The ankle sits at y=40 to make this true; moving it back to 36 breaks
    // the hoops at nine bands.
    const b = box('SOCK_BOX');
    assert.strictEqual(b.h, VIEW / 2);
    assert.strictEqual(b.y, 8, 'the leg starts below the cuff');
  });

  it('every declared icon size puts every band EDGE on a whole pixel', () => {
    /* Two things must hold, and checking only the first was the v106 bug:
       bands of exactly 3px starting at x=13.5px still leave every edge on a
       half pixel, and crispEdges rounds those inconsistently — which is
       what made adjacent stripes look different widths.

       So the ORIGIN is checked as well as the width, and against the real
       shape offsets rather than a rule of thumb. */
    const sizes = [];
    (css.match(/\.conv-uniform-row \.uniform-opt svg \{ height: (\d+)px/g) || [])
        .forEach((s) => sizes.push(+s.match(/(\d+)px/)[1]));
    const ed = css.match(/\.ts-kit-preview svg \{ height: (\d+)px/);
    if (ed) sizes.push(+ed[1]);
    assert.ok(sizes.length >= 2, 'expected the convocatòria and editor sizes');

    const shapes = [
      {name: 'shirt body', origin: box('SHIRT_BODY_BOX').x, span: box('SHIRT_BODY_BOX').w},
      {name: 'sock leg', origin: box('SOCK_BOX').y, span: box('SOCK_BOX').h}
    ];
    sizes.forEach((S) => {
      shapes.forEach((sh) => {
        const perUnit = S / VIEW;
        const origin = sh.origin * perUnit;
        const band = (sh.span * perUnit) / U.STRIPE_MAX;
        assert.ok(Number.isInteger(origin),
            'at ' + S + 'px the ' + sh.name + ' grid starts at ' + origin +
            'px — a fractional origin puts every edge on a part pixel');
        assert.ok(Number.isInteger(band),
            'at ' + S + 'px a ' + sh.name + ' band is ' + band + 'px');
      });
    });
  });

  it('72 is genuinely the smallest size that works', () => {
    // Guards against someone "optimising" it back down. Nothing between 18
    // and 72 satisfies both the origin and the width for both shapes.
    const shapes = [
      {origin: box('SHIRT_BODY_BOX').x, span: box('SHIRT_BODY_BOX').w},
      {origin: box('SOCK_BOX').y, span: box('SOCK_BOX').h}
    ];
    const works = (S) => shapes.every((sh) => {
      const perUnit = S / VIEW;
      return Number.isInteger(sh.origin * perUnit) &&
        Number.isInteger((sh.span * perUnit) / U.STRIPE_MAX);
    });
    for (let S = 2; S < 72; S += 2) {
      assert.ok(!works(S), S + 'px also works — the comment claiming 72 is ' +
        'the minimum is now wrong');
    }
    assert.ok(works(72), '72px must work');
  });
});

describe('kits — the band cap has ONE source', () => {
  const fs = require('fs');
  const path = require('path');

  it('the server agrees with the client', () => {
    /* functions/ deploys on its own and cannot require ../js, so STRIPE_MAX
       is duplicated by hand. A server cap BELOW the client's would reject a
       kit the editor happily offered — the lead would pick 9 bands, hit
       save, and get "Color d'equipació no vàlid" with nothing on screen
       looking wrong. */
    const fn = fs.readFileSync(
        path.join(__dirname, '..', 'functions', 'index.js'), 'utf8');
    const m = fn.match(/const STRIPE_MAX = (\d+);/);
    assert.ok(m, 'functions/index.js has no STRIPE_MAX');
    assert.strictEqual(Number(m[1]), U.STRIPE_MAX,
        'server cap ' + m[1] + ' != client cap ' + U.STRIPE_MAX);
  });

  it('nothing enforces a cap of its own', () => {
    /* There were seven independent literal 6s across three files. Missing
       one when raising the limit means the UI offers a value parseFill then
       silently rejects, so the stripes simply vanish. */
    const app = fs.readFileSync(
        path.join(__dirname, '..', 'js', 'app.js'), 'utf8');
    const utils = fs.readFileSync(
        path.join(__dirname, '..', 'js', 'utils.js'), 'utf8');
    [['js/app.js', app], ['js/utils.js', utils]].forEach(([name, s]) => {
      assert.ok(!/Math\.min\(6,/.test(s), name + ' still clamps to a literal 6');
      assert.ok(!/max = 6;|max="6"/.test(s), name + ' still offers max 6');
    });
  });

  it('accepts the whole range and rejects just past it', () => {
    assert.strictEqual(U.parseFill('s|v|9|#ffffff|#000000').n, 9);
    assert.strictEqual(U.parseFill('s|v|10|#ffffff|#000000').striped, false);
    assert.strictEqual(U.parseFill('s|v|1|#ffffff|#000000').striped, false);
  });
});

describe('kits — the stripe state shared with the board', () => {
  it('clamps the band count both ways', () => {
    // The board's inline `o.n || 2` accepted 9. This is the shared clamp.
    assert.strictEqual(U.normalizeStripeState({n: 99}).n, U.STRIPE_MAX);
    assert.strictEqual(U.normalizeStripeState({n: 1}).n, 2);
    assert.strictEqual(U.normalizeStripeState({n: 'x'}).n, 2);
  });

  it('defaults an unknown direction to vertical', () => {
    assert.strictEqual(U.normalizeStripeState({dir: 'x'}).dir, 'v');
    assert.strictEqual(U.normalizeStripeState({dir: 'h'}).dir, 'h');
  });

  it('survives junk', () => {
    const d = U.normalizeStripeState(null);
    assert.strictEqual(d.on, false);
    assert.strictEqual(d.n, 2);
    assert.strictEqual(d.dir, 'v');
  });

  it('fillFrom builds what the board would have built', () => {
    assert.strictEqual(U.fillFrom('#ff0000', {on: false}), '#ff0000');
    assert.strictEqual(
        U.fillFrom('#ff0000', {on: true, dir: 'h', n: 3, c2: '#ffffff'}),
        's|h|3|#ff0000|#ffffff');
    // Round-trips through the parser the board already uses.
    const f = U.parseFill(U.fillFrom('#ff0000', {on: true, n: 4, c2: '#0000ff'}));
    assert.strictEqual(f.striped, true);
    assert.strictEqual(f.n, 4);
  });
});
