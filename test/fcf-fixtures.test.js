/* Importing the FCF calendar, and keeping it fresh without trampling anyone.
 *
 * mergeFcfFixtures() is the only thing in v118 that can destroy work a coach
 * has already done — a wrong merge silently rewrites his kick-off times, or
 * attaches last month's call-up to the wrong game. So the negative cases
 * below matter more than the happy path, and every clause of the rule gets a
 * test that proves removing it breaks something real.
 *
 * The fixtures are REAL captured payloads:
 *   fcf-partidos.json     grupId 58161881 in full — 30 jornades, 240
 *                         fixtures, 30 of them L'Esquerra's.
 *   fcf-equipacions.json  the same group, REDUCED: the endpoint returns a
 *                         542-row cross join, so this keeps, per team, the
 *                         change strip FIRST and then the principal kit
 *                         TWICE — so a parser that takes "the first row per
 *                         team" instead of "the first PRINCIPAL=1 row" fails
 *                         loudly, and the dedupe still has duplicates to
 *                         survive. Plus one row of every distinct pattern.
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const F = require(path.join(__dirname, '..', 'functions', 'fcf.js'));

const fixture = (n) => JSON.parse(
    fs.readFileSync(path.join(__dirname, 'fixtures', n), 'utf8'));
const PARTIDOS = fixture('fcf-partidos.json');
const EQUIPACIONS = fixture('fcf-equipacions.json');

const OUR_ID = '35410';                 // L'ESQUERRA DE L'EIXAMPLE, F.C.
const CLUB = 'Esquerra de l\'Eixample F.C.';   // what the CLUB calls itself
const FCF_NAME = 'L\'ESQUERRA DE L\'EIXAMPLE, F.C.'; // what FCF calls it

const opts = (over) => Object.assign(
    {clubName: CLUB, category: 'amateur', letter: 'A', today: '2026-08-23'},
    over);

/* A match row as js/app.js writes one. */
let _id = 1700000000000;
function manual(o) {
  return {
    id: o.id !== undefined ? o.id : ++_id,
    home: o.at === 'home' ? CLUB : o.rival,
    away: o.at === 'home' ? o.rival : CLUB,
    date: o.date, time: o.time || '12:00',
    score: null, status: 'upcoming',
    location: o.location || '', mapLink: o.mapLink || '',
    team: o.team !== undefined ? o.team : 'A',
    category: o.category !== undefined ? o.category : 'amateur',
  };
}

describe('parseFcfFixtures — one squad out of a whole group', () => {
  const ours = F.parseFcfFixtures(PARTIDOS, OUR_ID);

  it('keeps only our fixtures', () => {
    const all = Object.keys(PARTIDOS)
        .reduce((n, j) => n + PARTIDOS[j].length, 0);
    assert.strictEqual(all, 240);
    assert.strictEqual(ours.length, 30);
  });

  it('a 16-team double round robin: 15 home, 15 away', () => {
    assert.strictEqual(ours.filter((f) => f.isHome).length, 15);
    assert.strictEqual(ours.filter((f) => !f.isHome).length, 15);
  });

  it('never plays itself, and every rival has an id', () => {
    ours.forEach((f) => {
      assert.notStrictEqual(f.opponentTeamId, OUR_ID);
      assert.ok(f.opponentTeamId, 'no opponentTeamId on ' + f.actaId);
      assert.notStrictEqual(F.normTeamNameOf(f.opponentName),
          F.normTeamNameOf(FCF_NAME));
    });
  });

  it('splits the kickoff stamp rather than parsing it', () => {
    /* Going through Date() would drag the SERVER's timezone into a value the
       app only ever shows as local Madrid time. */
    const f = ours[0];
    assert.ok(/^\d{4}-\d{2}-\d{2}$/.test(f.date), f.date);
    assert.ok(/^\d{2}:\d{2}$/.test(f.time), f.time);
    ours.forEach((x) => assert.ok(x.date && x.time, 'gap on ' + x.actaId));
  });

  it('every fixture has a venue, a maps link and a jornada', () => {
    ours.forEach((f) => {
      assert.ok(f.location, 'no venue on ' + f.actaId);
      assert.ok(/^https:\/\/www\.google\.com\/maps\//.test(f.mapLink), f.mapLink);
      assert.ok(f.jornada >= 1 && f.jornada <= 30, String(f.jornada));
    });
  });

  it('comes back in date order', () => {
    const dates = ours.map((f) => f.date);
    assert.deepStrictEqual(dates, dates.slice().sort());
  });

  it('is NEUTRAL about sides — no home/away name strings', () => {
    /* isOurTeam() compares with ===, and FCF spells our club differently
       from the club itself. A row carrying FCF's spelling as `home` would
       make the whole app think we were the away team. */
    ours.forEach((f) => {
      assert.strictEqual(f.home, undefined);
      assert.strictEqual(f.away, undefined);
      assert.strictEqual(typeof f.isHome, 'boolean');
    });
  });

  it('an unknown team id yields nothing, and never throws', () => {
    assert.deepStrictEqual(F.parseFcfFixtures(PARTIDOS, '999999'), []);
    assert.deepStrictEqual(F.parseFcfFixtures(PARTIDOS, ''), []);
    assert.deepStrictEqual(F.parseFcfFixtures(null, OUR_ID), []);
    assert.deepStrictEqual(F.parseFcfFixtures({}, OUR_ID), []);
  });
});

describe('fcfMapsLink', () => {
  it('builds the ?api=1 form fcf.cat itself links to', () => {
    assert.strictEqual(F.fcfMapsLink('41.38742', '2.147157'),
        'https://www.google.com/maps/search/?api=1&query=41.38742,2.147157');
  });

  it('refuses 0,0 — that is the Gulf of Guinea, not a missing value', () => {
    assert.strictEqual(F.fcfMapsLink('0', '0'), '');
  });

  it('refuses anything unparseable rather than linking to NaN', () => {
    ['', null, undefined, 'x'].forEach((v) => {
      assert.strictEqual(F.fcfMapsLink(v, v), '');
      assert.strictEqual(F.fcfMapsLink('41.4', v), '');
    });
  });
});

describe('parseFcfKits', () => {
  const kits = F.parseFcfKits(EQUIPACIONS);

  it('collapses the cross join to one pair of kits per team', () => {
    const teams = new Set(EQUIPACIONS.map((k) => k.CODEQUIPO));
    assert.ok(EQUIPACIONS.length > teams.size, 'fixture has lost its duplicates');
    assert.strictEqual(Object.keys(kits).length, teams.size);
  });

  it('carries BOTH kits — the change strip decides a clash', () => {
    Object.keys(kits).forEach((id) => {
      assert.ok(kits[id].home, id + ' has no first-choice kit');
      assert.ok(kits[id].away, id + ' has no change kit');
    });
  });

  it('does not mix the two up', () => {
    /* The fixture deliberately lists each team's CHANGE strip first, so a
       parser that takes "the first row per team" instead of "the first
       PRINCIPAL=1 row" fails here rather than silently showing the wrong
       shirt all season. */
    Object.keys(kits).forEach((id) => {
      const first = EQUIPACIONS.find((k) => k.CODEQUIPO === id &&
        String(k.PRINCIPAL) === '1');
      const second = EQUIPACIONS.find((k) => k.CODEQUIPO === id &&
        String(k.PRINCIPAL) === '2');
      if (first) assert.strictEqual(kits[id].home.shirt1, first.COLOR_CAMISETA1);
      if (second) assert.strictEqual(kits[id].away.shirt1, second.COLOR_CAMISETA1);
    });
  });

  it('carries the pattern, not just the colours', () => {
    Object.keys(kits).forEach((id) => {
      assert.ok(/^shirt faf faf-/.test(kits[id].home.pattern), kits[id].home.pattern);
      assert.ok(/^shirt faf faf-/.test(kits[id].away.pattern), kits[id].away.pattern);
    });
  });

  it('a team with only one kit registered gets the other as null', () => {
    const one = F.parseFcfKits([{PRINCIPAL: '2', CODEQUIPO: '9',
      COLOR_CAMISETA1: '#111111', CLASE_CSS_CAMISETA: 'shirt faf faf-base'}]);
    assert.strictEqual(one['9'].home, null);
    assert.strictEqual(one['9'].away.shirt1, '#111111');
  });

  it('survives an empty or malformed payload', () => {
    assert.deepStrictEqual(F.parseFcfKits(null), {});
    assert.deepStrictEqual(F.parseFcfKits([]), {});
    // PRINCIPAL 3 is neither kit and must not invent a slot.
    assert.deepStrictEqual(F.parseFcfKits([{PRINCIPAL: '3', CODEQUIPO: '1'}]), {});
  });
});

describe('fcfShirtFill / fcfKitPieces — the rival\'s shirt', () => {
  const U = require(path.join(__dirname, '..', 'js', 'utils.js'));

  it('maps every pattern in the real payload without throwing', () => {
    const seen = new Set(EQUIPACIONS.map((k) => k.CLASE_CSS_CAMISETA));
    assert.strictEqual(seen.size, 11, 'the fixture lost its pattern variety');
    seen.forEach((p) => {
      const v = U.fcfShirtFill(p, '#FF0000', '#0000FF');
      const parsed = U.parseFill(v);
      assert.ok(parsed.c1, p + ' produced no colour');
    });
  });

  it('decodes every class to what the description SAYS it is', () => {
    /* FCF ships the plain-language name alongside the class, so the mapping
       is checkable rather than a guess. Getting this wrong draws a picture
       of a different shirt — "3 rayas horizontales" as generic stripes is
       not the same kit. */
    const WANT = {
      'faf-base': 'plain',                     // Lisa
      'faf-barres': 'stripes',                 // Rayas
      'faf-barres2': 'wide-stripes',           // Rayas anchas
      'faf-barres3': 'wide-stripes',           // Rayas anchas
      'faf-fineshoritzontals': 'fine-hoops',   // Rayas finas horizontales
      'faf-horitzontals3': 'hoops3',           // 3 rayas horizontales
      'faf-franjahoritzontal': 'band-top',     // Franja horizontal arriba
      'faf-lateralesquerra': 'band-left',      // Franja lateral izquierda
      'faf-lateraldreta': 'band-right',        // Franja lateral derecha
      'faf-obliquesinverted': 'diagonal',      // Rayas oblicuas invertidas
      'faf-sinmangas': 'sleeves',              // Mangas colores
    };
    Object.keys(WANT).forEach((cls) => {
      assert.strictEqual(U.fcfShirtPattern('shirt faf ' + cls), WANT[cls], cls);
    });
    // Every class in the REAL payload is accounted for.
    const seen = new Set(EQUIPACIONS.map((k) => k.CLASE_CSS_CAMISETA));
    assert.strictEqual(seen.size, Object.keys(WANT).length);
    seen.forEach((p) => {
      const cls = p.split(/\s+/).filter((c) => c.indexOf('faf-') === 0)[0];
      assert.ok(WANT[cls], 'undecoded class in the payload: ' + p);
    });
  });

  it('only the three stripe forms become a parseFill fill', () => {
    /* The other five are bands, diagonals and coloured sleeves — shapes the
       encoding cannot describe at all. They stay solid HERE and are drawn by
       fcfShirtSvg instead; a fill that pretended otherwise would be the
       wrong shirt with no way to tell. */
    ['faf-barres', 'faf-barres2', 'faf-barres3', 'faf-fineshoritzontals']
        .forEach((p) => {
          const f = U.parseFill(U.fcfShirtFill('shirt faf ' + p, '#FF0000', '#0000FF'));
          assert.strictEqual(f.striped, true, p + ' should stripe');
          assert.strictEqual(f.c1, '#FF0000');
          assert.strictEqual(f.c2, '#0000FF');
        });
    ['faf-base', 'faf-horitzontals3', 'faf-obliquesinverted', 'faf-lateraldreta',
      'faf-lateralesquerra', 'faf-franjahoritzontal', 'faf-sinmangas'].forEach((p) => {
      const f = U.parseFill(U.fcfShirtFill('shirt faf ' + p, '#FF0000', '#0000FF'));
      assert.strictEqual(f.striped, false, p + ' must not become a stripe fill');
      assert.strictEqual(f.c1, '#FF0000');
    });
  });

  it('never stripes one colour against itself', () => {
    /* #FFFFFF/#FFFFFF with a stripe pattern is all over the real payload —
       FCF's way of spelling a plain shirt. */
    const f = U.parseFill(U.fcfShirtFill('shirt faf faf-barres', '#FFFFFF', '#ffffff'));
    assert.strictEqual(f.striped, false);
    assert.strictEqual(f.c1, '#FFFFFF');
  });

  it('an unknown future pattern degrades to solid, not to blank', () => {
    const f = U.parseFill(U.fcfShirtFill('shirt faf faf-brandnew', '#123456', '#abcdef'));
    assert.strictEqual(f.striped, false);
    assert.strictEqual(f.c1, '#123456');
  });

  it('every stripe count is inside what parseFill accepts', () => {
    /* STRIPE_MAX has been raised before; a mapping above it renders SOLID
       and the stripes just vanish, which is exactly the trap the constant's
       own comment warns about. */
    Object.keys(U.FCF_SHIRT_PATTERNS).forEach((cls) => {
      const kind = U.FCF_SHIRT_PATTERNS[cls];
      if (!['stripes', 'wide-stripes', 'fine-hoops'].includes(kind)) return;
      const f = U.parseFill(U.fcfShirtFill('faf ' + cls, '#FF0000', '#0000FF'));
      assert.strictEqual(f.striped, true, cls + ' exceeded STRIPE_MAX');
    });
  });

  describe('the Calendari kits land on whole pixels', () => {
    /* The reported bug: "some stripes that should be the same width are
       looking weird, not the same width".

       The striped torso is exactly 32 of the shirt's 64 viewBox units, so at
       a rendered size S a band is S/(2n) device pixels. When that does not
       divide, crispEdges snaps each edge independently — six bands over a
       16px torso become 3,2,3,3,2,3. The SVGs were built for 72px and then
       SCALED DOWN by CSS to 32, which threw away every bit of the arithmetic
       that made them even in the first place.

       Two things had to hold, and this pins both: the icons are drawn at the
       size they are shown, and that size divides by the stripe counts. */
    const app = fs.readFileSync(path.join(__dirname, '..', 'js', 'app.js'), 'utf8');
    const css = fs.readFileSync(path.join(__dirname, '..', 'css', 'style.css'), 'utf8');
    const MD_KIT_PX = Number((app.match(/var MD_KIT_PX = (\d+);/) || [])[1]);

    it('the Calendari states its own render size', () => {
      assert.ok(MD_KIT_PX > 0, 'MD_KIT_PX is gone from js/app.js');
      assert.ok(/fcfShirtSvg\(pieces, badgeUrl \|\| '', MD_KIT_PX\)/.test(app),
          'the shirt is not drawn at MD_KIT_PX');
      assert.ok(/shortsSvg\(pieces\.shorts, MD_KIT_PX\)/.test(app));
      assert.ok(/kitSockSvg\(pieces\.socks, MD_KIT_PX\)/.test(app));
    });

    it('NO stylesheet rule re-sizes a Calendari kit', () => {
      /* This is the actual bug. Scaling a finished SVG undoes every band
         boundary it computed, and no care inside stripeSvg can survive it. */
      const block = css.slice(css.indexOf('.md-kit-cell'),
          css.indexOf('.md-map-link'));
      assert.ok(!/\.kit-svg[^{]*\{[^}]*(width|height)\s*:/.test(block),
          'a CSS rule is sizing the Calendari kits again: ' + block);
      const mob = css.slice(css.indexOf('.md-kit-cell .kit-icons { gap: 1px; }') - 400,
          css.indexOf('.md-kit-cell .kit-icons { gap: 1px; }') + 60);
      assert.ok(!/\.md-kit-cell \.kit-svg\s*\{\s*width/.test(mob),
          'the mobile block is sizing kits again');
    });

    /* DEVICE pixels, at the scalings Windows actually runs at. This is the
       assertion the first two attempts were missing: 8 bands over a 32px
       shirt is exactly 2px at 100% and 2.5px at 125%, and the screenshot
       that reopened the bug was a 125% display. "Even at 100%" proves
       nothing on its own. */
    const DPRS = [1, 1.25, 1.5, 1.75, 2];
    const VIEW = 64;
    const bandOf = (n) => DPRS.map((d) => (32 * MD_KIT_PX * d) / (VIEW * n));
    const originOf = (u) => DPRS.map((d) => (u * MD_KIT_PX * d) / VIEW);

    it('every stripe count is whole device pixels at EVERY scaling', () => {
      Object.keys(U.FCF_SHIRT_PATTERNS).forEach((cls) => {
        if (!['stripes', 'wide-stripes', 'fine-hoops']
            .includes(U.FCF_SHIRT_PATTERNS[cls])) return;
        const n = U.parseFill(
            U.fcfShirtFill('faf ' + cls, '#FF0000', '#0000FF')).n;
        bandOf(n).forEach((w, i) => {
          assert.ok(Number.isInteger(w),
              cls + ': ' + n + ' bands at ' + (DPRS[i] * 100) + '% scaling is ' +
              w + ' device px each — they will render uneven');
        });
      });
    });

    it('the band GRID starts on a whole pixel too', () => {
      /* A fractional origin puts every edge on a part pixel however evenly
         the bands divide. SHIRT_FULL_BOX starts at y=6, which is 4.5px at
         48px — the horizontal hoops were never aligned, which is why they
         have a box of their own. */
      const app2 = app;
      const hoop = app2.match(/SHIRT_HOOP_BOX = \{x: \d+, y: (\d+), w: \d+, h: (\d+)\}/);
      assert.ok(hoop, 'SHIRT_HOOP_BOX is gone');
      originOf(Number(hoop[1])).forEach((o, i) => {
        assert.ok(Number.isInteger(o),
            'the hoop grid starts at ' + o + 'px at ' + (DPRS[i] * 100) + '%');
      });
      assert.strictEqual(Number(hoop[2]), 32,
          'the hoop span must be half the viewBox, like the torso and the sock');
      // And the vertical torso, which shares the same origin by design.
      originOf(16).forEach((o) => assert.ok(Number.isInteger(o)));
    });

    it('hoops do NOT use the unaligned full-shirt box', () => {
      assert.ok(/f\.striped \? SHIRT_HOOP_BOX : SHIRT_FULL_BOX/.test(app),
          'horizontal stripes are back on SHIRT_FULL_BOX, whose origin is '
          + 'fractional at every display scaling');
    });

    it('the two vertical forms are still visibly different', () => {
      // Both must divide, but 4 and 4 would divide beautifully and look
      // identical, which is not the point of having two.
      const n = (cls) => U.parseFill(
          U.fcfShirtFill('faf ' + cls, '#FF0000', '#0000FF')).n;
      assert.notStrictEqual(n('faf-barres'), n('faf-barres2'));
      assert.ok(n('faf-barres') > n('faf-barres2'),
          '"Rayas" must be finer than "Rayas anchas"');
    });
  });

  it('fcfKitPieces carries the pattern AND the two colours', () => {
    // fcfShirtSvg needs all three to draw a band or a diagonal.
    const kits = F.parseFcfKits(EQUIPACIONS);
    const id = Object.keys(kits)[0];
    const p = U.fcfKitPieces(kits[id].home);
    assert.ok(p.pattern, 'no pattern carried');
    assert.ok(/^#/.test(p.c1) && /^#/.test(p.c2));
  });

  it('two identical colours are a PLAIN shirt, whatever the class says', () => {
    // #FFFFFF/#FFFFFF with a stripe class is all over the real payload.
    const p = U.fcfKitPieces({shirt1: '#FFFFFF', shirt2: '#ffffff',
      pattern: 'shirt faf faf-barres'});
    assert.strictEqual(p.pattern, 'plain');
  });

  it('an unknown future class decodes to plain, not to undefined', () => {
    assert.strictEqual(U.fcfShirtPattern('shirt faf faf-brandnew'), 'plain');
    assert.strictEqual(U.fcfShirtPattern(''), 'plain');
    assert.strictEqual(U.fcfShirtPattern(null), 'plain');
  });

  it('turns a stored kit into the three pieces the renderers take', () => {
    const kits = F.parseFcfKits(EQUIPACIONS);
    const id = Object.keys(kits)[0];
    ['home', 'away'].forEach((slot) => {
      const p = U.fcfKitPieces(kits[id][slot]);
      assert.ok(p.shirt && p.shorts && p.socks, slot + ' kit is incomplete');
      assert.ok(!/\|/.test(p.shorts), 'shorts must be a single colour');
      assert.ok(!/\|/.test(p.socks), 'socks have no pattern in the payload');
    });
  });

  it('returns null when there is nothing to draw', () => {
    assert.strictEqual(U.fcfKitPieces(null), null);
    assert.strictEqual(U.fcfKitPieces({}), null);
  });
});

describe('mergeFcfFixtures — the first import', () => {
  const inc = F.parseFcfFixtures(PARTIDOS, OUR_ID);
  const kits = F.parseFcfKits(EQUIPACIONS);

  it('imports the whole season into an empty calendar', () => {
    const r = F.mergeFcfFixtures([], inc, opts({kits: kits}));
    assert.strictEqual(r.matches.length, 30);
    assert.strictEqual(r.summary.added, 30);
    assert.strictEqual(r.summary.adopted, 0);
  });

  it('writes OUR name on our side, FCF\'s on theirs', () => {
    const r = F.mergeFcfFixtures([], inc, opts({kits: kits}));
    r.matches.forEach((m) => {
      assert.ok(m.home === CLUB || m.away === CLUB,
          'neither side is the club: ' + m.home + ' v ' + m.away);
      assert.ok(m.home !== FCF_NAME && m.away !== FCF_NAME,
          'stored FCF\'s spelling of our own club');
    });
  });

  it('is idempotent — importing twice does not duplicate a season', () => {
    const a = F.mergeFcfFixtures([], inc, opts({kits: kits}));
    const b = F.mergeFcfFixtures(a.matches, inc, opts({kits: kits}));
    assert.strictEqual(b.matches.length, 30);
    assert.strictEqual(b.summary.added, 0);
    assert.strictEqual(b.summary.updated, 0);
    assert.strictEqual(b.summary.removed, 0);
  });

  it('ids come from the acta number, well clear of Date.now() ids', () => {
    const r = F.mergeFcfFixtures([], inc, opts({kits: kits}));
    r.matches.forEach((m) => {
      assert.strictEqual(m.id, Number(m.fcfActaId));
      assert.ok(m.id < 1e9, 'acta ids must not reach Date.now() territory');
    });
    assert.strictEqual(new Set(r.matches.map((m) => m.id)).size, 30);
  });

  it('attaches the opponent crest and BOTH kits', () => {
    const r = F.mergeFcfFixtures([], inc, opts({kits: kits}));
    const withKit = r.matches.filter((m) => m.opponentKit);
    const withAway = r.matches.filter((m) => m.opponentKitAway);
    assert.ok(withKit.length >= 28, 'first kits reached only ' + withKit.length);
    assert.ok(withAway.length >= 28, 'change kits reached only ' + withAway.length);
    assert.ok(/^#[0-9A-Fa-f]{6}$/.test(withKit[0].opponentKit.shirt1));
    assert.ok(/^#[0-9A-Fa-f]{6}$/.test(withAway[0].opponentKitAway.shirt1));
  });

  it('the two kits are stored FLAT, not nested', () => {
    /* v118 shipped `opponentKit` as a flat kit and clubs have already
       imported a season with it. A nested {home, away} would make every
       reader sniff the shape; a second field leaves those rows rendering
       unchanged, with an empty change-strip column until the next sync. */
    const r = F.mergeFcfFixtures([], inc, opts({kits: kits}));
    const m = r.matches.find((x) => x.opponentKit);
    assert.strictEqual(typeof m.opponentKit.shirt1, 'string');
    assert.strictEqual(m.opponentKit.home, undefined);
    assert.strictEqual(m.opponentKit.away, undefined);
  });

  it('a rival with only one registered kit still imports', () => {
    const half = {};
    Object.keys(kits).forEach((id) => { half[id] = {home: kits[id].home, away: null}; });
    const r = F.mergeFcfFixtures([], inc, opts({kits: half}));
    assert.ok(r.matches.every((m) => m.opponentKitAway === undefined));
    assert.ok(r.matches.filter((m) => m.opponentKit).length >= 28);
  });

  it('marks past fixtures played and future ones upcoming', () => {
    const r = F.mergeFcfFixtures([], inc, opts({kits: kits, today: '2026-11-01'}));
    r.matches.forEach((m) => {
      assert.strictEqual(m.status, m.date < '2026-11-01' ? 'played' : 'upcoming');
    });
  });
});

describe('mergeFcfFixtures — the merge rule', () => {
  /* One fixture, so the rule is visible. FCF says 18:00 at the Escola
     Industrial; the coach may or may not have said otherwise. */
  const one = [{
    actaId: '4119501', jornada: 1, isHome: true,
    opponentName: 'INSPIRE SOCCER,F.C.', opponentTeamId: '50599042',
    opponentBadge: 'https://files.fcf.cat/escudos/clubes/escudos/x.png',
    date: '2026-09-19', time: '18:00',
    location: 'CAMP DE FUTBOL ESCOLA INDUSTRIAL',
    mapLink: 'https://www.google.com/maps/search/?api=1&query=41.38742,2.147157',
  }];
  const moved = [Object.assign({}, one[0], {
    date: '2026-09-20', time: '20:00', location: 'UN ALTRE CAMP',
  })];
  const imported = () => F.mergeFcfFixtures([], one, opts()).matches;

  it('an untouched field follows the federation', () => {
    const r = F.mergeFcfFixtures(imported(), moved, opts());
    assert.strictEqual(r.matches[0].time, '20:00');
    assert.strictEqual(r.matches[0].date, '2026-09-20');
    assert.strictEqual(r.summary.updated, 1);
  });

  it('a field the coach edited is never overwritten', () => {
    const rows = imported();
    rows[0].time = '19:30';                      // the coach knows better
    const r = F.mergeFcfFixtures(rows, moved, opts());
    assert.strictEqual(r.matches[0].time, '19:30');
  });

  it('...and the OTHER fields on that same row still update', () => {
    /* The point of per-field ownership. Editing the kick-off must not
       freeze the venue too. */
    const rows = imported();
    rows[0].time = '19:30';
    const r = F.mergeFcfFixtures(rows, moved, opts());
    assert.strictEqual(r.matches[0].location, 'UN ALTRE CAMP');
    assert.strictEqual(r.matches[0].date, '2026-09-20');
  });

  it('the snapshot refreshes even for a field the coach owns', () => {
    /* Otherwise a later FCF change back to the coach's value would silently
       hand the field back to the federation. */
    const rows = imported();
    rows[0].time = '19:30';
    const r = F.mergeFcfFixtures(rows, moved, opts());
    assert.strictEqual(r.matches[0].fcfSnapshot.time, '20:00');
    assert.strictEqual(r.matches[0].fcfSnapshot.location, 'UN ALTRE CAMP');
  });

  it('an edited field stays the coach\'s across MANY syncs', () => {
    let rows = imported();
    rows[0].time = '19:30';
    for (let i = 0; i < 5; i++) rows = F.mergeFcfFixtures(rows, moved, opts()).matches;
    assert.strictEqual(rows[0].time, '19:30');
  });

  it('the opponent name follows the acta id, not the other way round', () => {
    // FCF renames a club mid-season; the id is what identifies it.
    const renamed = [Object.assign({}, one[0], {opponentName: 'INSPIRE SOCCER F.C. 2027'})];
    const r = F.mergeFcfFixtures(imported(), renamed, opts());
    assert.strictEqual(r.matches[0].away, 'INSPIRE SOCCER F.C. 2027');
    assert.strictEqual(r.matches[0].home, CLUB);
  });

  describe('the summary is a CONTRACT — it decides whether anything is saved', () => {
    /* _syncFcfSquad skips the Firestore write when the summary is all zeros,
       to keep the nightly job from re-firing updateTeamDates and every
       client's re-render for every club on the platform.

       That made `summary.updated` load-bearing, and it originally counted
       only the four fields a coach can own. v119 attached the rival's change
       strip; nothing about date/time/location/mapLink moved; so every sync
       reported "no changes", the write was skipped, and `opponentKitAway`
       reached exactly nobody. The merge was correct and the caller discarded
       it — which is why these assert on the SUMMARY, not on the rows. */
    const changedRow = (mutate) => {
      const rows = imported();
      const inc2 = [Object.assign({}, one[0])];
      mutate(rows[0], inc2[0]);
      return F.mergeFcfFixtures(rows, inc2, opts({kits: {'50599042': {
        home: {shirt1: '#111111', pattern: 'shirt faf faf-base'},
        away: {shirt1: '#222222', pattern: 'shirt faf faf-base'},
      }}}));
    };

    it('reports a new kit, even with every owned field unchanged', () => {
      const r = changedRow(() => {});
      assert.strictEqual(r.matches[0].opponentKitAway.shirt1, '#222222');
      assert.ok(r.summary.updated > 0,
          'a new kit was produced but the summary said nothing changed');
    });

    it('reports a changed crest', () => {
      const r = changedRow((row) => { row.opponentBadge = 'https://old/x.png'; });
      assert.ok(r.summary.updated > 0);
    });

    it('reports a changed jornada', () => {
      const r = changedRow((row) => { row.fcfJornada = 99; });
      assert.ok(r.summary.updated > 0);
    });

    it('reports a renamed rival', () => {
      const r = changedRow((row, f) => { f.opponentName = 'RENAMED, C.F.'; });
      assert.ok(r.summary.updated > 0);
    });

    it('still reports NOTHING when nothing at all moved', () => {
      /* The other half of the contract. If this starts counting, the nightly
         job writes every shard of every club every night and wakes every
         client with a full re-render. */
      const kits = {'50599042': {
        home: {shirt1: '#111111', pattern: 'shirt faf faf-base'},
        away: {shirt1: '#222222', pattern: 'shirt faf faf-base'},
      }};
      const first = F.mergeFcfFixtures([], one, opts({kits}));
      const again = F.mergeFcfFixtures(first.matches, one, opts({kits}));
      assert.deepStrictEqual(again.summary,
          {adopted: 0, added: 0, updated: 0, removed: 0});
    });

    it('an adopted row is counted once, as adopted and not as updated', () => {
      const m = manual({rival: 'INSPIRE SOCCER,F.C.', at: 'home',
        date: '2026-09-19'});
      const r = F.mergeFcfFixtures([m], one, opts());
      assert.strictEqual(r.summary.adopted, 1);
      assert.strictEqual(r.summary.updated, 0);
    });
  });

  it('a fixture that vanishes is MARKED, never dropped', () => {
    /* Call-ups, notes, availability and lineups all hang off the match id. */
    const other = [{
      actaId: '9999999', jornada: 2, isHome: false, opponentName: 'X, C.F.',
      opponentTeamId: '1', opponentBadge: '', date: '2026-09-26',
      time: '12:00', location: 'Y', mapLink: '',
    }];
    const r = F.mergeFcfFixtures(imported(), other, opts());
    assert.strictEqual(r.matches.length, 2);
    assert.strictEqual(r.matches[0].fcfRemoved, true);
    assert.strictEqual(r.summary.removed, 1);
  });

  it('an EMPTY response is an outage, not a cancelled season', () => {
    const r = F.mergeFcfFixtures(imported(), [], opts());
    assert.strictEqual(r.matches.length, 1);
    assert.strictEqual(r.matches[0].fcfRemoved, undefined);
    assert.strictEqual(r.summary.removed, 0);
  });

  it('a restored fixture loses the mark', () => {
    const rows = imported();
    rows[0].fcfRemoved = true;
    const r = F.mergeFcfFixtures(rows, one, opts());
    assert.strictEqual(r.matches[0].fcfRemoved, undefined);
  });

  it('a removed fixture is marked once, not counted every night', () => {
    const a = F.mergeFcfFixtures(imported(), [{
      actaId: '9999999', jornada: 2, isHome: true, opponentName: 'X',
      opponentTeamId: '1', opponentBadge: '', date: '2026-09-26', time: '12:00',
      location: '', mapLink: '',
    }], opts());
    const b = F.mergeFcfFixtures(a.matches, [{
      actaId: '9999999', jornada: 2, isHome: true, opponentName: 'X',
      opponentTeamId: '1', opponentBadge: '', date: '2026-09-26', time: '12:00',
      location: '', mapLink: '',
    }], opts());
    assert.strictEqual(b.summary.removed, 0);
  });
});

describe('parseFcfPositions', () => {
  const table = (rows) => ({data: rows.map((r) => ({
    position: r[0], team: {teamId: r[1], name: r[2] || 'X'},
  }))});

  it('maps teamId to position', () => {
    assert.deepStrictEqual(
        F.parseFcfPositions(table([['1', '10'], ['4', '20'], ['12', '30']])),
        {10: 1, 20: 4, 30: 12});
  });

  it('is EMPTY pre-season, rather than inventing positions from the order', () => {
    /* The deliberate difference from parseFcfClassificacio in js/utils.js,
       which falls back to the array index so the TABLE is not a column of
       zeros. A position stamped on a fixture is frozen and read back months
       later: "1r" because a team sorted first in August would be a lie the
       calendar keeps telling. No position is better than a wrong one. */
    assert.deepStrictEqual(
        F.parseFcfPositions(table([['0', '10'], ['0', '20']])), {});
  });

  it('confirms the REAL pre-season payload is that case', () => {
    /* Pinned against the captured response, not against my description of
       it — and asserting the premise first, because "no positions" from a
       fixture that turned out to have none of the shape we are reading
       would be a test of nothing. */
    const pre = fixture('fcf-preseason.json');
    assert.ok(Array.isArray(pre.data) && pre.data.length >= 16,
        'the pre-season fixture no longer holds a table');
    assert.ok(pre.data.every((r) => String(r.position) === '0'),
        'the pre-season fixture is no longer the all-zero case');
    assert.deepStrictEqual(F.parseFcfPositions(pre), {});
  });

  it('takes the real positions once the season is under way', () => {
    // The inverse, from a payload that DOES carry them: proves the parser
    // reads the field at all rather than always returning {}.
    const live = {data: fixture('fcf-preseason.json').data
        .map((r, i) => Object.assign({}, r, {position: String(i + 1)}))};
    const got = F.parseFcfPositions(live);
    assert.strictEqual(Object.keys(got).length, live.data.length);
    assert.ok(Object.values(got).includes(1));
    assert.ok(Object.values(got).includes(live.data.length));
  });

  it('survives junk', () => {
    [null, undefined, {}, {data: null}, {data: [null, {}, {team: {}}]}]
        .forEach((j) => assert.deepStrictEqual(F.parseFcfPositions(j), {}));
  });
});

describe('mergeFcfFixtures — the rival\'s position, frozen at kick-off', () => {
  /* The calendar card names where the opponent stood. On an UPCOMING game
     that has to track the live table; on a PLAYED one it has to be what it
     said that day, or every past result silently rewrites itself as the
     season goes on. Second legs need no special case: a different acta is a
     different row with its own kick-off. */
  const one = [{
    actaId: '4119501', jornada: 1, isHome: true,
    opponentName: 'INSPIRE SOCCER,F.C.', opponentTeamId: '50599042',
    opponentBadge: '', date: '2026-09-19', time: '18:00',
    location: 'CAMP', mapLink: '',
  }];
  const POS = (n) => ({50599042: n});
  const at = (today, nowHM, n) =>
    opts({today: today, nowHM: nowHM, positions: POS(n)});

  const before = () => F.mergeFcfFixtures([], one, at('2026-09-01', '06:00', 4));

  it('stamps the position on a fixture still ahead of us', () => {
    const m = before().matches[0];
    assert.strictEqual(m.opponentPos, 4);
    assert.strictEqual(m.opponentPosAt, '2026-09-01');
  });

  it('follows the table while the fixture is still upcoming', () => {
    const r = F.mergeFcfFixtures(before().matches, one, at('2026-09-18', '06:00', 2));
    assert.strictEqual(r.matches[0].opponentPos, 2);
    assert.strictEqual(r.matches[0].opponentPosAt, '2026-09-18');
  });

  it('is FROZEN once the fixture has been played', () => {
    const r = F.mergeFcfFixtures(before().matches, one, at('2026-10-05', '06:00', 9));
    assert.strictEqual(r.matches[0].opponentPos, 4, 'a past result rewrote itself');
    assert.strictEqual(r.matches[0].opponentPosAt, '2026-09-01');
  });

  it('freezes to the MINUTE, not to the day', () => {
    /* The nightly job runs at 06:00 and never meets this, but the refresh
       button can be pressed at 20:00 on a Saturday — after the 18:00
       kick-off, on a date that is still `today`. */
    const sameDayBefore =
      F.mergeFcfFixtures(before().matches, one, at('2026-09-19', '09:00', 7));
    assert.strictEqual(sameDayBefore.matches[0].opponentPos, 7);
    const sameDayAfter =
      F.mergeFcfFixtures(before().matches, one, at('2026-09-19', '20:00', 7));
    assert.strictEqual(sameDayAfter.matches[0].opponentPos, 4);
  });

  it('stamps nothing on a fixture imported already played', () => {
    // There is no way back to where they stood that day, and today's table
    // dressed as a record is worse than no record.
    const m = F.mergeFcfFixtures([], one, at('2026-10-05', '06:00', 9)).matches[0];
    assert.strictEqual(m.opponentPos, undefined);
    assert.strictEqual(m.opponentPosAt, undefined);
  });

  it('never ERASES a stamp when the rival leaves the standings', () => {
    const r = F.mergeFcfFixtures(before().matches, one,
        opts({today: '2026-09-10', nowHM: '06:00', positions: {}}));
    assert.strictEqual(r.matches[0].opponentPos, 4);
  });

  it('reports the change in the summary, or the write is skipped', () => {
    // summary is the contract with _syncFcfSquad: all zeros means no write.
    const r = F.mergeFcfFixtures(before().matches, one, at('2026-09-18', '06:00', 2));
    assert.ok(r.summary.updated > 0, 'the new position would never be saved');
  });

  it('reports NOTHING when the table has not moved', () => {
    /* The other half, and the one that matters operationally: re-stamping
       `opponentPosAt` on every run would make summary.updated non-zero
       nightly, defeating the skip-the-write guard and re-rendering every
       client on the platform every morning for a table that stood still. */
    const r = F.mergeFcfFixtures(before().matches, one, at('2026-09-18', '06:00', 4));
    assert.strictEqual(r.summary.updated, 0);
    assert.strictEqual(r.matches[0].opponentPosAt, '2026-09-01',
        'the stamp date moved without the position moving');
  });

  it('freezes rather than overwrites when the caller gives no clock', () => {
    // A wrong freeze loses an update; a wrong overwrite destroys a record.
    const r = F.mergeFcfFixtures(before().matches, one,
        opts({today: '', nowHM: '', positions: POS(9)}));
    assert.strictEqual(r.matches[0].opponentPos, 4);
  });

  it('changes nothing at all when no standings are passed', () => {
    // Every other test in this file omits `positions`; this pins that the
    // feature is inert for them rather than quietly rewriting their rows.
    const base = F.mergeFcfFixtures([], one, opts()).matches[0];
    assert.strictEqual('opponentPos' in base, false);
  });
});

describe('mergeFcfFixtures — what it must NOT touch', () => {
  const one = F.parseFcfFixtures(PARTIDOS, OUR_ID).slice(0, 1);

  it('a manually created friendly is passed through untouched', () => {
    const friendly = manual({rival: 'Sants, U.E.', at: 'home',
      date: '2026-08-30', time: '11:00', location: 'Camp Nou'});
    const r = F.mergeFcfFixtures([friendly], one, opts());
    const still = r.matches.find((m) => m.id === friendly.id);
    assert.strictEqual(still, friendly, 'the friendly was copied or rewritten');
    assert.strictEqual(still.fcfActaId, undefined);
  });

  it('another squad\'s fixtures in the same shard are untouched', () => {
    /* amateur-A and amateur-B share one category document and play
       different competitions. */
    const bTeam = manual({rival: 'Sants, U.E.', at: 'home',
      date: one[0].date, time: '11:00', team: 'B'});
    const r = F.mergeFcfFixtures([bTeam], one, opts({letter: 'A'}));
    assert.strictEqual(r.matches.find((m) => m.id === bTeam.id), bTeam);
    assert.strictEqual(r.summary.adopted, 0);
  });

  it('another category\'s fixtures are untouched', () => {
    const juv = manual({rival: one[0].opponentName, at: 'home',
      date: one[0].date, category: 'juvenil'});
    const r = F.mergeFcfFixtures([juv], one, opts({category: 'amateur'}));
    assert.strictEqual(r.matches.find((m) => m.id === juv.id), juv);
    assert.strictEqual(r.summary.adopted, 0);
  });
});

describe('mergeFcfFixtures — adoption', () => {
  const inc = F.parseFcfFixtures(PARTIDOS, OUR_ID).slice(0, 1);
  const f = inc[0];
  const local = (over) => manual(Object.assign({
    rival: f.opponentName,
    at: f.isHome ? 'home' : 'away',
    date: f.date,
  }, over));

  it('claims a hand-typed fixture instead of duplicating it', () => {
    const m = local();
    const r = F.mergeFcfFixtures([m], inc, opts());
    assert.strictEqual(r.matches.length, 1, 'duplicated the fixture');
    assert.strictEqual(r.summary.adopted, 1);
    assert.strictEqual(r.matches[0].id, m.id, 'lost the original match id');
    assert.strictEqual(r.matches[0].fcfActaId, f.actaId);
  });

  it('keeps the original id, which is what preserves the call-up', () => {
    /* matchNotes, matchAvail and fa_match_events are all keyed by match id.
       A new id would orphan every one of them. */
    const m = local({id: 42});
    const r = F.mergeFcfFixtures([m], inc, opts());
    assert.strictEqual(r.matches[0].id, 42);
  });

  it('matches a rival typed in a different style', () => {
    const m = local({rival: 'Inspire Soccer F.C.'});
    const r = F.mergeFcfFixtures([m], inc, opts());
    assert.strictEqual(r.summary.adopted, 1);
  });

  it('claims a fixture that slipped a day', () => {
    const m = local({date: '2026-09-20'});
    const r = F.mergeFcfFixtures([m], inc, opts());
    assert.strictEqual(r.summary.adopted, 1);
  });

  it('refuses one a WEEK away — that is a different question', () => {
    const m = local({date: '2026-09-26'});
    const r = F.mergeFcfFixtures([m], inc, opts());
    assert.strictEqual(r.summary.adopted, 0);
    assert.strictEqual(r.matches.length, 2);
  });

  it('refuses when the venue side disagrees', () => {
    const m = local({at: f.isHome ? 'away' : 'home'});
    const r = F.mergeFcfFixtures([m], inc, opts());
    assert.strictEqual(r.summary.adopted, 0);
  });

  it('refuses a different rival', () => {
    const m = local({rival: 'Sants, U.E.'});
    const r = F.mergeFcfFixtures([m], inc, opts());
    assert.strictEqual(r.summary.adopted, 0);
  });

  it('refuses a TIE rather than guessing', () => {
    /* Two hand-typed rows, same rival, same date, same venue — a coach who
       entered the fixture twice. Claiming either attaches history to a
       coin flip; a duplicate row is something he can see and delete. */
    const r = F.mergeFcfFixtures([local(), local()], inc, opts());
    assert.strictEqual(r.summary.adopted, 0);
    assert.strictEqual(r.matches.length, 3);
  });

  it('prefers the exact date when one candidate is a day out', () => {
    const exact = local();
    const near = local({date: '2026-09-20'});
    const r = F.mergeFcfFixtures([near, exact], inc, opts());
    assert.strictEqual(r.summary.adopted, 1);
    const adopted = r.matches.find((m) => m.fcfActaId);
    assert.strictEqual(adopted.id, exact.id);
  });

  it('two incoming fixtures cannot claim the same local row', () => {
    /* Contrived on purpose — a league cannot really schedule the same rival
       at home on consecutive days. But the adoption pool is consumed as it is
       claimed, and without that the second fixture would overwrite the first
       one's acta id on the same row, quietly losing a fixture. A guard for an
       impossible input is still a guard, and this is the only input that
       exercises it. */
    const twin = Object.assign({}, f, {actaId: '9999999', jornada: 2,
      date: '2026-09-20'});
    const m = local();
    const r = F.mergeFcfFixtures([m], [f, twin], opts());
    assert.strictEqual(r.summary.adopted, 1);
    assert.strictEqual(r.matches.length, 2, 'a fixture was swallowed');
    const actas = r.matches.map((x) => x.fcfActaId).sort();
    assert.deepStrictEqual(actas, [f.actaId, '9999999'].sort());
  });

  it('adoption FILLS BLANKS and never overwrites what was typed', () => {
    /* A hand-typed kick-off predates this feature and is the coach's answer.
       Overwriting it on first import is the surprise that would make him
       distrust the whole thing. */
    const m = local({time: '19:30', location: ''});
    const r = F.mergeFcfFixtures([m], inc, opts());
    assert.strictEqual(r.matches[0].time, '19:30', 'overwrote a typed kickoff');
    assert.strictEqual(r.matches[0].location, f.location, 'did not fill the blank');
  });

  it('after adoption the row syncs normally, blanks or not', () => {
    const m = local({time: '19:30'});
    let rows = F.mergeFcfFixtures([m], inc, opts()).matches;
    const moved = [Object.assign({}, f, {location: 'UN ALTRE CAMP'})];
    rows = F.mergeFcfFixtures(rows, moved, opts()).matches;
    assert.strictEqual(rows[0].location, 'UN ALTRE CAMP');
    assert.strictEqual(rows[0].time, '19:30');
  });

  it('adoption happens once — a second sync adopts nothing', () => {
    const a = F.mergeFcfFixtures([local()], inc, opts());
    const b = F.mergeFcfFixtures(a.matches, inc, opts());
    assert.strictEqual(b.summary.adopted, 0);
  });
});
