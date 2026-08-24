/* Who refereed the match.
 *
 * The federation publishes no referee anywhere in its JSON API — the name
 * exists only in the HTML of the acta page. So parseFcfActa() is SCRAPING,
 * and it is the piece of the FCF integration a redesign is most likely to
 * kill silently. That already happened once: fcf.cat's rebuild took the old
 * standings scrape with it and cost us v117, and the tell was that everything
 * kept "working" while returning nothing.
 *
 * These tests therefore care less about the happy path than about the two
 * ways this can go quietly wrong — returning nothing when there IS a referee,
 * and returning something that is not a referee at all.
 *
 * The fixtures are WINDOWS of real acta pages, not whole ones; see
 * fixtures/capture-acta.js for why, and for how to regenerate them.
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const F = require(path.join(__dirname, '..', 'functions', 'fcf.js'));

const acta = (n) => fs.readFileSync(path.join(__dirname, 'fixtures', n), 'utf8');
const ELIT = acta('acta-elit.html');
const TERCERA = acta('acta-tercera.html');
const UNASSIGNED = acta('acta-unassigned.html');

describe('reading the referees off an acta', () => {
  it('reads a trio, in role order', () => {
    /* Elit, Primera and Segona always appoint three. The ORDER is the role:
       the referee first, then his assistants — which is the whole reason
       `principal` can be taken from the list rather than guessed at. */
    const r = F.parseFcfActa(ELIT);
    assert.deepStrictEqual(r.referees, [
      'BOADA BARCELONA, MARC',
      'CÁCERES CORREA, FEDERICO DANIEL',
      'DOMÍNGUEZ GUTIÉRREZ, FRAN',
    ]);
    assert.strictEqual(r.principal, 'BOADA BARCELONA, MARC');
  });

  it('reads a lone referee', () => {
    const r = F.parseFcfActa(TERCERA);
    assert.deepStrictEqual(r.referees, ['TORRIJO SIERRA, ANDREA']);
    assert.strictEqual(r.principal, 'TORRIJO SIERRA, ANDREA');
  });

  it('accents survive', () => {
    /* Not decoration: fcfRefereeSlug folds them deliberately, and it can only
       be shown to fold them if they arrive in the first place. A mojibaked
       name would slug differently and split a referee's record in two. */
    assert.ok(F.parseFcfActa(ELIT).referees[1].indexOf('Á') !== -1);
    assert.ok(F.parseFcfActa(ELIT).referees[2].indexOf('Í') !== -1);
  });

  it('an unappointed match yields nothing, not a placeholder', () => {
    /* The federation reuses the SAME markup for "Sense àrbitres assignats",
       so a parser that just took every row in the box would file that string
       as a referee and build it a career. */
    const r = F.parseFcfActa(UNASSIGNED);
    assert.deepStrictEqual(r.referees, []);
    assert.strictEqual(r.principal, '');
  });

  it('ignores the role legend sitting right above the box', () => {
    /* "PREPARADOR FÍSIC, MERGE O A.T.S" has a comma, is in capitals and is
       two hundred bytes from the referee names. It is the reason the block is
       bounded at the next <h3> instead of scanned loosely, and it is in the
       fixture on purpose. */
    const all = F.parseFcfActa(ELIT).referees.join('|');
    assert.ok(all.indexOf('PREPARADOR') === -1, all);
    assert.ok(all.indexOf('AUXILIAR') === -1, all);
    assert.ok(all.indexOf('COORDINADOR') === -1, all);
  });

  it('stops at the next section, so a later one cannot donate names', () => {
    /* SYNTHETIC, and deliberately so. No acta today has a flat comma-bearing
       `border-b` row after the referee box — the goals and cards rows nest a
       div inside, which the row pattern cannot match. But every section on the
       page already shares that same `border-b` class, so the day FCF flattens
       the goals markup, every scorer on the sheet becomes a referee. The
       bound costs one indexOf and removes that entirely, so it stays; this
       test is here to say what it is for, since no real page can show it. */
    const later = '<h3>Àrbitres</h3><div class="border-b">REF, ONE</div>' +
      '<h3>Gols</h3><div class="border-b">SCORER, TWO</div>';
    assert.deepStrictEqual(F.parseFcfActa(later).referees, ['REF, ONE']);
  });

  it('takes the LAST heading, not the first', () => {
    /* No real page has two today — the nav link and the RSC payload both say
       "Àrbitres" but neither is followed by </h3>, so neither can match. This
       is the guard for the day a redesign adds one, and it is pinned here
       rather than with another 400 KB fixture. */
    const two = '<h3>Àrbitres</h3><div class="border-b">DECOY, ONE</div>' +
      '<h3>Gols</h3>' +
      '<h3>Àrbitres</h3><div class="border-b">REAL, TWO</div><h3>Gols</h3>';
    assert.deepStrictEqual(F.parseFcfActa(two).referees, ['REAL, TWO']);
  });

  it('degrades to empty instead of throwing', () => {
    /* A rebuilt fcf.cat must cost us the data, not the scheduled job. Every
       one of these is a shape the crawler can genuinely be handed: a 404
       body, an error page, a truncated response. */
    [undefined, null, '', 'nonsense', '<html><body>Error 500</body></html>',
      '<h3>Àrbitres</h3>', '{"json":"not html"}', 12345,
    ].forEach((input) => {
      const r = F.parseFcfActa(input);
      assert.deepStrictEqual(r.referees, [], JSON.stringify(input));
      assert.strictEqual(r.principal, '', JSON.stringify(input));
    });
  });

  it('a name is never counted twice', () => {
    const dup = '<h3>Àrbitres</h3><div class="border-b">SAME, NAME</div>' +
      '<div class="border-b">SAME, NAME</div><h3>Gols</h3>';
    assert.deepStrictEqual(F.parseFcfActa(dup).referees, ['SAME, NAME']);
  });

  it('decodes the entities a name can actually contain', () => {
    const esc = '<h3>Àrbitres</h3>' +
      '<div class="border-b">D&#x27;ANGELO ROIG, JOAN &amp; SON</div><h3>x</h3>';
    assert.deepStrictEqual(F.parseFcfActa(esc).referees,
        ["D'ANGELO ROIG, JOAN & SON"]);
  });
});

describe('keying a referee', () => {
  it('folds accents, so one person stays one person', () => {
    /* The federation is inconsistent about accents between seasons. A split
       record is worse than a merged one: it silently halves the match count
       and nothing on screen says so. */
    assert.strictEqual(
        F.fcfRefereeSlug('DOMÍNGUEZ GUTIÉRREZ, FRAN'),
        F.fcfRefereeSlug('DOMINGUEZ GUTIERREZ, FRAN'));
  });

  it('is stable across the punctuation and spacing FCF varies', () => {
    const want = F.fcfRefereeSlug('BOADA BARCELONA, MARC');
    ['BOADA  BARCELONA,MARC', 'Boada Barcelona, Marc', 'BOADA BARCELONA , MARC ']
        .forEach((v) => assert.strictEqual(F.fcfRefereeSlug(v), want, v));
  });

  it('keeps different people apart', () => {
    assert.notStrictEqual(
        F.fcfRefereeSlug('BOADA BARCELONA, MARC'),
        F.fcfRefereeSlug('BOADA BARCELONA, MARTA'));
  });

  it('never yields a slug Firestore would reject as a document id', () => {
    /* A leading or trailing separator, or an empty string, is a write that
       fails at 3am inside a scheduled job. */
    ['', null, undefined, '   ', ',', '---', '???'].forEach((v) => {
      const s = F.fcfRefereeSlug(v);
      assert.ok(!/^-|-$/.test(s), JSON.stringify(v) + ' -> ' + s);
      assert.ok(s.indexOf('/') === -1, s);
    });
  });
});

describe('the two copies of the slug', () => {
  /* The crawler KEYS profile documents with the server copy and the app LOOKS
     THEM UP with the browser copy. A disagreement is not a style question — it is
     every referee silently having no record, with both suites green. */
  const U = require(path.join(__dirname, '..', 'js', 'utils.js'));

  it('agree on every case', () => {
    ['BOADA BARCELONA, MARC', 'DOMÍNGUEZ GUTIÉRREZ, FRAN',
      "D'ANGELO ROIG, JOAN", 'TORRIJO SIERRA, ANDREA', 'Ñ Ü Ç, ÀÈÍÒÚ',
      'PASCA, MIHAI ANDREI', 'GONZALEZ-CARRATO SORIANO, ADRIAN',
      '', '   ', ',', '---', null, undefined, 'a', '123',
    ].forEach((input) => {
      assert.strictEqual(U.fcfRefereeSlug(input), F.fcfRefereeSlug(input),
          'copies disagree on ' + JSON.stringify(input));
    });
  });

  it('agrees on names taken from a real acta', () => {
    F.parseFcfActa(ELIT).referees.forEach((n) => {
      assert.strictEqual(U.fcfRefereeSlug(n), F.fcfRefereeSlug(n), n);
    });
  });
});

describe('what the match page shows about a referee', () => {
  const U = require(path.join(__dirname, '..', 'js', 'utils.js'));
  const profile = {
    name: 'TORRIJO SIERRA, ANDREA',
    matches: 14,
    byDivision: {
      'TERCERA CATALANA': {matches: 10, H: 5, D: 3, A: 2, reds: 2, doubles: 1},
      'QUARTA CATALANA': {matches: 4, H: 4, D: 0, A: 0, reds: 0, doubles: 0},
    },
  };

  it('reports only the division asked for', () => {
    /* The whole point of the split. A Quarta record says nothing about how a
       Segona match will be handled, and a career average mixes them silently. */
    const t3 = U.refereeDivisionStats(profile, 'TERCERA CATALANA');
    assert.strictEqual(t3.matches, 10);
    assert.strictEqual(t3.pct.H, 50);
    const t4 = U.refereeDivisionStats(profile, 'QUARTA CATALANA');
    assert.strictEqual(t4.matches, 4);
    assert.notStrictEqual(t3.matches, t4.matches);
  });

  it('suppresses percentages on a thin sample, but keeps the counts', () => {
    /* Four matches at 100% home wins is not a finding. The counts are facts
       and stay; the percentage is an invitation to conclude something. */
    const t4 = U.refereeDivisionStats(profile, 'QUARTA CATALANA');
    assert.strictEqual(t4.thin, true);
    assert.strictEqual(t4.pct, null);
    assert.strictEqual(t4.H, 4);
  });

  it('shows percentages once there are enough', () => {
    const t3 = U.refereeDivisionStats(profile, 'TERCERA CATALANA');
    assert.strictEqual(t3.thin, false);
    assert.deepStrictEqual(t3.pct, {H: 50, D: 30, A: 20});
  });

  it('is null when he has never worked this division', () => {
    /* Not zeroes: a referee with no record here must read as "no data", never
       as "0% home wins". */
    assert.strictEqual(U.refereeDivisionStats(profile, 'LLIGA ELIT'), null);
    assert.strictEqual(U.refereeDivisionStats(null, 'TERCERA CATALANA'), null);
    assert.strictEqual(U.refereeDivisionStats({}, 'TERCERA CATALANA'), null);
    assert.strictEqual(U.refereeDivisionStats(
        {byDivision: {X: {matches: 0}}}, 'X'), null);
  });

  it('counts sendings-off per match', () => {
    const t3 = U.refereeDivisionStats(profile, 'TERCERA CATALANA');
    assert.strictEqual(t3.reds, 2);
    assert.strictEqual(t3.doubles, 1);
    assert.strictEqual(t3.perMatch, 0.3);
  });
});

describe('what the committed fixtures are allowed to contain', () => {
  /* This repo is PUBLIC and GitHub Pages serves it. An acta page carries two
     squads' worth of player names; the fixtures are windows precisely so that
     none of them are republished to fix a parser that only reads one box. */
  it('carries no player identity documents', () => {
    [ELIT, TERCERA, UNASSIGNED].forEach((h) => {
      assert.ok(!/licencia|ficha/i.test(h), 'a fixture carries licencia/ficha');
      assert.ok(!/\b\d{7,8}[ -]?[A-Z]\b/.test(h), 'a fixture carries a DNI');
    });
  });

  it('names nobody but the referees', () => {
    /* Every visible string in the window is either a referee, a role label
       or a section heading. If a re-capture ever widens the window into the
       line-ups, this fails rather than quietly publishing them. */
    const ALLOWED = /^(Àrbitres|Gols|Dorsal|DELEGAT\/DA|AUXILIAR|COORDINADOR\/A|E\. Porters|ENCARREGAT \/ DA MATERIAL O ALTRES|PREPARADOR FÍSIC, MERGE O A\.T\.S|Sense àrbitres assignats|No hi ha gols registrats|GOL NORMAL|Vocals)$/;
    [ELIT, TERCERA, UNASSIGNED].forEach((h) => {
      const refs = F.parseFcfActa(h).referees;
      (h.match(/>[^<>]{4,}</g) || []).forEach((raw) => {
        const text = F.decodeHtmlEntities(raw.slice(1, -1)).trim();
        if (!text || /^[\s\d.,:;|—-]*$/.test(text)) return;
        assert.ok(ALLOWED.test(text) || refs.indexOf(text) !== -1,
            'unexpected text in a committed fixture: ' + JSON.stringify(text));
      });
    });
  });
});
