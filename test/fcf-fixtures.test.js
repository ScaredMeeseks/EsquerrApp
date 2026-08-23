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

  it('stripes the six patterns that have a fill, solid for the rest', () => {
    const striped = ['faf-barres', 'faf-barres2', 'faf-barres3',
      'faf-fineshoritzontals', 'faf-horitzontals3'];
    striped.forEach((p) => {
      const f = U.parseFill(U.fcfShirtFill('shirt faf ' + p, '#FF0000', '#0000FF'));
      assert.strictEqual(f.striped, true, p + ' should stripe');
      assert.strictEqual(f.c1, '#FF0000');
      assert.strictEqual(f.c2, '#0000FF');
    });
    // Diagonals and side bands have no fill form and say so by going solid.
    ['faf-obliquesinverted', 'faf-lateraldreta', 'faf-lateralesquerra',
      'faf-franjahoritzontal', 'faf-sinmangas', 'faf-base'].forEach((p) => {
      const f = U.parseFill(U.fcfShirtFill('shirt faf ' + p, '#FF0000', '#0000FF'));
      assert.strictEqual(f.striped, false, p + ' should be solid');
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
    Object.keys(U.FCF_SHIRT_PATTERNS).forEach((p) => {
      const f = U.parseFill(U.fcfShirtFill('faf ' + p, '#FF0000', '#0000FF'));
      assert.strictEqual(f.striped, true, p + ' exceeded STRIPE_MAX');
    });
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
