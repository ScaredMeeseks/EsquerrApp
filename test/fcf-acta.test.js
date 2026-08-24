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

describe('the yellow-card tripwire', () => {
  /* The federation publishes no bookings today, and the owner expects that to
     change. Rather than a note nobody re-reads, the crawler counts the
     card-sized boxes on every acta it fetches and shouts when there are more
     than the legend. These tests pin the baseline that makes it meaningful. */

  /* ⚠ The baseline of 4 is a LIVE observation, and cannot be proved from the
     committed fixtures: those are windows cut around the referee box, and the
     legend sits at the foot of a page whose marks are spread across 400 KB.
     The windows therefore contain none, which is why nothing below asserts
     `=== 4` against them.

     What was actually checked, on the live site:
       acta 3784040 (played, Lliga Elit)     4 marks, 2 yellow swatches
       acta 3781801 (played, Tercera)        4
       acta 4106975 (unplayed, no referees)  4
       acta 3781800 — the one that settles it — 4, and `sanciones` records
         TWO sanctions on it: a player sent off for a second booking, and a
         second man disciplined for his language.
     `node test/fixtures/capture-acta.js` re-runs that check and prints the
     counts, so the baseline is one command away rather than folklore. */

  it('pins the baseline as a literal, not as itself', () => {
    /* Everything else here builds its legend FROM the constant, so it would
       pass just as happily if the constant were wrong — the classic test that
       proves nothing. This one pins the live-observed value: four, on all
       four actas listed above. Changing it should mean someone re-ran
       `node test/fixtures/capture-acta.js` and saw a different number, and
       this failing is the prompt to say so. */
    assert.strictEqual(F.FCF_ACTA_LEGEND_MARKS, 4);
  });

  it('counts the marks a page draws', () => {
    const one = '<div class="w-[18px] h-[22px] bg-[#FFEB3B]"></div>';
    assert.strictEqual(F.fcfActaCardMarks(''), 0);
    assert.strictEqual(F.fcfActaCardMarks(one), 1);
    assert.strictEqual(F.fcfActaCardMarks(one.repeat(4)), 4);
  });

  it('trips as soon as a sheet draws more than the legend', () => {
    /* The day this fires in the crawler's log, parseFcfActa can be taught to
       read bookings, and every profile recomputes from the raw index with no
       re-crawl of ten gigabytes. */
    const one = '<div class="w-[18px] h-[22px] bg-[#FFEB3B]"></div>';
    const legend = one.repeat(F.FCF_ACTA_LEGEND_MARKS);
    assert.ok(!(F.fcfActaCardMarks(legend) > F.FCF_ACTA_LEGEND_MARKS),
        'the legend alone must NOT trip it, or it cries wolf nightly');
    assert.ok(F.fcfActaCardMarks(legend + one) > F.FCF_ACTA_LEGEND_MARKS,
        'one booking beyond the legend must trip it');
  });

  it('rides along with the parse, so nothing extra is fetched', () => {
    /* A second regex over HTML already in hand — not another request. At
       ~29,000 actas, a separate fetch to answer this would double the crawl. */
    const one = '<div class="w-[18px] h-[22px] bg-[#FFEB3B]"></div>';
    assert.strictEqual(F.parseFcfActa(ELIT + one.repeat(4)).cardMarks, 4);
    assert.deepStrictEqual(F.parseFcfActa(ELIT + one.repeat(4)).referees,
        F.parseFcfActa(ELIT).referees, 'the count must not disturb the parse');
  });

  it('the committed windows contain no legend, and that is expected', () => {
    /* Pinned so a future re-capture that widens the window is noticed: if
       these ever stop being 0, the baseline above needs revisiting and so
       does the no-player-names guarantee further down this file. */
    [ELIT, TERCERA, UNASSIGNED].forEach((h) => {
      assert.strictEqual(F.fcfActaCardMarks(h), 0);
    });
  });

  it('is 0, not a crash, on anything unreadable', () => {
    [undefined, null, '', 'nonsense', 42].forEach((v) => {
      assert.strictEqual(F.fcfActaCardMarks(v), 0, JSON.stringify(v));
      assert.strictEqual(F.parseFcfActa(v).cardMarks, 0, JSON.stringify(v));
    });
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

describe('have we had him before, and how did it go', () => {
  const U = require(path.join(__dirname, '..', 'js', 'utils.js'));
  const CLUB = "L'Esquerra de l'Eixample F.C.";
  const isOurs = (n) => n === CLUB;
  const REF = 'TORRIJO SIERRA, ANDREA';
  const OTHER = 'CABRERA VIDAL, DAVID';

  const matches = [
    {id: 1, fcfActaId: '101', date: '2025-09-20', home: CLUB, away: 'MONELLS, A.E.'},
    {id: 2, fcfActaId: '102', date: '2025-10-11', home: 'PALS AT.', away: CLUB},
    {id: 3, fcfActaId: '103', date: '2025-11-02', home: CLUB, away: 'BASE ROSES, C.F.'},
    {id: 4, fcfActaId: '104', date: '2026-04-18', home: CLUB, away: 'SAULEDA, A.D.'},
    {id: 5, fcfActaId: '105', date: '2026-05-02', home: CLUB, away: 'VALLS U.E.'},
    {id: 6, date: '2025-08-30', home: CLUB, away: 'A FRIENDLY F.C.'},
  ];
  const actas = {
    101: {r: [REF], c: 1, res: 'H'},          // we were home, home won  → W
    102: {r: [REF], c: 1, res: 'H'},          // we were away, home won  → L
    103: {r: [REF], c: 1, res: 'D'},          // draw                    → D
    104: {r: [OTHER], c: 1, res: 'H'},        // a different referee
    105: {r: [REF], j: 30},                   // appointed, not yet played
  };

  it('turns the federation\'s home-side result into ours', () => {
    /* `res` says who won, not whether we did. Getting this backwards would
       report a defeat as a win on the page a delegate reads before kick-off. */
    assert.strictEqual(U.ourResultFrom('H', true), 'W');
    assert.strictEqual(U.ourResultFrom('H', false), 'L');
    assert.strictEqual(U.ourResultFrom('A', true), 'L');
    assert.strictEqual(U.ourResultFrom('A', false), 'W');
    assert.strictEqual(U.ourResultFrom('D', true), 'D');
    assert.strictEqual(U.ourResultFrom('D', false), 'D');
  });

  it('is empty when the result is unknown', () => {
    ['', null, undefined, 'X'].forEach((r) =>
      assert.strictEqual(U.ourResultFrom(r, true), '', JSON.stringify(r)));
  });

  it('lists only the matches HE took', () => {
    const rows = U.refereeHistoryWithUs(matches, actas, REF, isOurs);
    assert.deepStrictEqual(rows.map((r) => r.matchId), [3, 2, 1],
        'newest first, and only his');
  });

  it('gets our side of each result right', () => {
    const rows = U.refereeHistoryWithUs(matches, actas, REF, isOurs);
    const byId = {};
    rows.forEach((r) => { byId[r.matchId] = r; });
    assert.strictEqual(byId[1].outcome, 'W');
    assert.strictEqual(byId[1].opponent, 'MONELLS, A.E.');
    assert.strictEqual(byId[2].outcome, 'L', 'an away defeat read as a win');
    assert.strictEqual(byId[2].opponent, 'PALS AT.');
    assert.strictEqual(byId[2].weWereHome, false);
    assert.strictEqual(byId[3].outcome, 'D');
  });

  it('ignores a fixture he has only been appointed to', () => {
    /* Match 5 is this weekend — the very fixture being looked at. Counting
       it would put the upcoming game into its own history. */
    const rows = U.refereeHistoryWithUs(matches, actas, REF, isOurs);
    assert.ok(!rows.some((r) => r.matchId === 5), 'an unplayed match was listed');
  });

  it('ignores friendlies the coach typed himself', () => {
    // No acta id, so the federation never saw it and no referee is known.
    const rows = U.refereeHistoryWithUs(matches, actas, REF, isOurs);
    assert.ok(!rows.some((r) => r.matchId === 6));
  });

  it('credits the referee, not an assistant', () => {
    const withCrew = {201: {r: [OTHER, REF], c: 1, res: 'H'}};
    const ms = [{id: 9, fcfActaId: '201', date: '2025-09-01', home: CLUB, away: 'X'}];
    assert.deepStrictEqual(U.refereeHistoryWithUs(ms, withCrew, REF, isOurs), []);
    assert.strictEqual(U.refereeHistoryWithUs(ms, withCrew, OTHER, isOurs).length, 1);
  });

  it('matches him even when FCF drops the accents', () => {
    const ms = [{id: 9, fcfActaId: '301', date: '2025-09-01', home: CLUB, away: 'X'}];
    const a = {301: {r: ['DOMÍNGUEZ GUTIÉRREZ, FRAN'], c: 1, res: 'H'}};
    assert.strictEqual(
        U.refereeHistoryWithUs(ms, a, 'DOMINGUEZ GUTIERREZ, FRAN', isOurs).length, 1);
  });

  it('tallies what it lists', () => {
    const rows = U.refereeHistoryWithUs(matches, actas, REF, isOurs);
    assert.deepStrictEqual(U.refereeHistoryTally(rows), {W: 1, D: 1, L: 1, played: 3});
  });

  it('shrugs off missing data', () => {
    [[null, actas], [matches, null], [[], {}], [undefined, undefined]]
        .forEach(([ms, a]) => {
          assert.deepStrictEqual(U.refereeHistoryWithUs(ms, a, REF, isOurs), []);
        });
    assert.deepStrictEqual(U.refereeHistoryWithUs(matches, actas, '', isOurs), []);
    assert.deepStrictEqual(U.refereeHistoryTally(null), {W: 0, D: 0, L: 0, played: 0});
  });
});

describe('what the sendings-off were for, on screen', () => {
  const U = require(path.join(__dirname, '..', 'js', 'utils.js'));
  const profile = {name: 'X, Y', matches: 12, byDivision: {
    'TERCERA CATALANA': {matches: 12, H: 5, D: 4, A: 3, reds: 4, doubles: 2,
      off: {dissent: 3, violent: 1, decorum: 3}},
    'QUARTA CATALANA': {matches: 8, H: 4, D: 2, A: 2, reds: 0, doubles: 0},
  }};

  it('lists the offences, most frequent first', () => {
    const s = U.refereeDivisionStats(profile, 'TERCERA CATALANA');
    assert.deepStrictEqual(s.offences, [
      {key: 'decorum', n: 3}, {key: 'dissent', n: 3}, {key: 'violent', n: 1},
    ]);
  });

  it('is an empty list, not undefined, for a division with none', () => {
    /* The renderer checks `.length`; undefined would throw on the page rather
       than simply showing nothing. */
    const s = U.refereeDivisionStats(profile, 'QUARTA CATALANA');
    assert.deepStrictEqual(s.offences, []);
  });

  it('offers no RATE, only counts', () => {
    /* Deliberate. The federation records an offence only when the sanction
       carried a suspension, so a referee who books dissent and stops there
       leaves no trace at all. A percentage would be arithmetic over a
       denominator that does not exist. */
    const s = U.refereeDivisionStats(profile, 'TERCERA CATALANA');
    s.offences.forEach((o) => {
      assert.strictEqual(typeof o.n, 'number');
      assert.ok(!('pct' in o) && !('rate' in o), JSON.stringify(o));
    });
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
