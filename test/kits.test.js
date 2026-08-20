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

describe('kits — the SVG paint', () => {
  it('hands a solid fill straight through, with no defs', () => {
    assert.deepStrictEqual(U.fillSvgPaint('#ff0000', 'a'),
        {paint: '#ff0000', defs: ''});
  });

  it('builds a gradient for a striped fill', () => {
    const r = U.fillSvgPaint('s|v|2|#ff0000|#ffffff', 'a');
    assert.strictEqual(r.paint, 'url(#kfa)');
    assert.ok(r.defs.indexOf('<linearGradient') !== -1);
  });

  it('agrees with fillCss about DIRECTION', () => {
    /* The one bug no visual check catches: the same kit striping vertically
       on the tactical board and horizontally on the shirt. fillCss uses
       90deg for 'v' and 180deg for 'h'; the SVG must use x2 and y2 to
       match. */
    const v = U.fillSvgPaint('s|v|4|#a1a1a1|#ffffff', 'x');
    assert.ok(U.fillCss('s|v|4|#a1a1a1|#ffffff').background.indexOf('90deg') !== -1);
    assert.ok(/x2="1"/.test(v.defs) && /y2="0"/.test(v.defs),
        'vertical bands run left to right');

    const h = U.fillSvgPaint('s|h|4|#a1a1a1|#ffffff', 'x');
    assert.ok(U.fillCss('s|h|4|#a1a1a1|#ffffff').background.indexOf('180deg') !== -1);
    assert.ok(/x2="0"/.test(h.defs) && /y2="1"/.test(h.defs),
        'horizontal hoops run top to bottom');
  });

  it('doubles the stops, which is what makes the edges hard', () => {
    const r = U.fillSvgPaint('s|h|3|#111111|#222222', 'x');
    const stops = r.defs.match(/<stop /g) || [];
    assert.strictEqual(stops.length, 6, '3 bands = 6 stops');
    assert.ok(r.defs.indexOf('offset="0%"') !== -1);
    assert.ok(r.defs.indexOf('offset="100%"') !== -1);
    // The boundary appears twice, once closing a band and once opening it.
    const at33 = (r.defs.match(/offset="33\.3333%"/g) || []).length;
    assert.strictEqual(at33, 2, 'a single stop at a boundary would blur it');
  });

  it('alternates the two colours', () => {
    const r = U.fillSvgPaint('s|v|2|#aaaaaa|#bbbbbb', 'x');
    assert.ok(r.defs.indexOf('#aaaaaa') !== -1 && r.defs.indexOf('#bbbbbb') !== -1);
  });

  it('gives each instance its own id — three kits render at once', () => {
    // Duplicate ids make every shirt take the first one's gradient.
    const a = U.fillSvgPaint('s|v|2|#111111|#ffffff', 1);
    const b = U.fillSvgPaint('s|v|2|#111111|#ffffff', 2);
    assert.notStrictEqual(a.paint, b.paint);
    assert.notStrictEqual(a.defs, b.defs);
  });

  it('degrades a malformed fill to solid instead of throwing', () => {
    assert.strictEqual(U.fillSvgPaint('s|v|10|#a|#b', 'x').defs, '',
        'n out of range is not a stripe');
    assert.doesNotThrow(() => U.fillSvgPaint(null, 'x'));
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
