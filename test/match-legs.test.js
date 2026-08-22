/* Anada / tornada detection.
 *
 * A match row carries no competition, no round and no leg field, so "this is
 * the return fixture" has to be DERIVED: same rival, venue swapped, earlier
 * date, same season, same squad. findFirstLeg() is the whole of it — the UI
 * only asks the question and stores the coach's yes/no.
 *
 * The negative cases below matter more than the positive one. A false
 * positive is offered to the coach and he can decline it; a wrong link that
 * he accepts without looking puts LAST season's team sheet in front of him as
 * this week's preparation. So every clause of the rule gets a test that
 * proves removing it would pair two matches that are not legs of each other.
 */
const assert = require('assert');
const path = require('path');

const U = require(path.join(__dirname, '..', 'js', 'utils.js'));

const CLUB = 'Esquerra de l\'Eixample F.C.';
const SEASON = '2026-08-15';

/* Matches are built the way js/app.js:16638 builds them: home and away are
   TEAM NAMES, and which side is ours is derived from the club name. `id` is a
   number there, so it is a number here. */
let _id = 1000;
function match(o) {
  const home = o.at === 'home' ? CLUB : o.rival;
  const away = o.at === 'home' ? o.rival : CLUB;
  return {
    id: o.id !== undefined ? o.id : ++_id,
    home: home, away: away,
    date: o.date, time: o.time || '12:00',
    score: o.score || null,
    status: o.status || 'played',
    location: '', mapLink: '',
    team: o.team !== undefined ? o.team : 'A',
    category: o.category !== undefined ? o.category : 'amateur',
  };
}

const find = (cand, all) => U.findFirstLeg(cand, all, CLUB, SEASON);

describe('normTeamName — the same club, typed four ways', () => {
  it('collapses accents, punctuation and legal forms', () => {
    const forms = ['C.F. Gràcia', 'CF Gracia', 'Gràcia F.C.', 'gracia cf'];
    const normed = forms.map(U.normTeamName);
    normed.forEach((n) => assert.strictEqual(n, normed[0],
        forms.join(' / ') + ' did not normalise alike: ' + normed.join(', ')));
    assert.strictEqual(normed[0], 'gracia');
  });

  it('collapses the spelled-out legal form onto the abbreviation', () => {
    assert.strictEqual(U.normTeamName('Unió Esportiva Sants'),
        U.normTeamName('U.E. Sants'));
  });

  it('keeps a parent club and its feeder APART', () => {
    // The one collision that would survive a careless click, so "Atlètic" is
    // deliberately absent from the noise list.
    assert.notStrictEqual(U.normTeamName('Gràcia'),
        U.normTeamName('Gràcia Atlètic'));
  });

  it('does not reduce a name that is nothing but legal form to empty', () => {
    // Two rivals both normalising to '' would be "the same club".
    assert.strictEqual(U.normTeamName('C.F.'), 'cf');
    assert.notStrictEqual(U.normTeamName('C.F.'), U.normTeamName('U.E.'));
  });

  it('is total — null, undefined and a number do not throw', () => {
    [null, undefined, 0, 42].forEach((v) => {
      assert.strictEqual(typeof U.normTeamName(v), 'string');
    });
  });
});

describe('ourSideOf / opponentOf', () => {
  it('reads the side off the club name, exactly like isOurTeam', () => {
    const h = match({rival: 'Gràcia', at: 'home', date: '2026-09-14'});
    const a = match({rival: 'Gràcia', at: 'away', date: '2027-01-18'});
    assert.strictEqual(U.ourSideOf(h, CLUB), 'home');
    assert.strictEqual(U.ourSideOf(a, CLUB), 'away');
    assert.strictEqual(U.opponentOf(h, CLUB), 'Gràcia');
    assert.strictEqual(U.opponentOf(a, CLUB), 'Gràcia');
  });

  it('a renamed club yields no pairing rather than a wrong one', () => {
    // Both rows then read as "away", so the venue-swap clause rejects them.
    // Losing the suggestion is the right way round to fail.
    const first = match({rival: 'Gràcia', at: 'home', date: '2026-09-14'});
    const second = match({rival: 'Gràcia', at: 'away', date: '2027-01-18'});
    assert.strictEqual(
        U.findFirstLeg(second, [first], 'A Different Name F.C.', SEASON), null);
  });
});

describe('findFirstLeg — the pairing it must make', () => {
  it('pairs the return fixture with the first leg', () => {
    const first = match({rival: 'C.F. Gràcia', at: 'home', date: '2026-09-14'});
    const second = match({rival: 'Gracia CF', at: 'away', date: '2027-01-18'});
    const got = find(second, [first, second]);
    assert.ok(got, 'no first leg found');
    assert.strictEqual(got.id, first.id);
  });

  it('works in the other direction too — away first, home second', () => {
    const first = match({rival: 'Gràcia', at: 'away', date: '2026-09-14'});
    const second = match({rival: 'Gràcia', at: 'home', date: '2027-01-18'});
    assert.strictEqual(find(second, [first, second]).id, first.id);
  });

  it('picks the MOST RECENT qualifying earlier match', () => {
    // League double plus a cup tie against the same club. The coach preparing
    // January wants November, not September.
    const sept = match({rival: 'Gràcia', at: 'away', date: '2026-09-14'});
    const nov = match({rival: 'Gràcia', at: 'away', date: '2026-11-23'});
    const jan = match({rival: 'Gràcia', at: 'home', date: '2027-01-18'});
    assert.strictEqual(find(jan, [sept, nov, jan]).id, nov.id);
  });
});

describe('findFirstLeg — the pairings it must REFUSE', () => {
  it('refuses the same venue twice (not a return fixture)', () => {
    const a = match({rival: 'Gràcia', at: 'home', date: '2026-09-14'});
    const b = match({rival: 'Gràcia', at: 'home', date: '2027-01-18'});
    assert.strictEqual(find(b, [a, b]), null);
  });

  it('refuses a different squad letter', () => {
    // amateur-A and amateur-B play different leagues against different clubs.
    const a = match({rival: 'Gràcia', at: 'home', date: '2026-09-14', team: 'B'});
    const b = match({rival: 'Gràcia', at: 'away', date: '2027-01-18', team: 'A'});
    assert.strictEqual(find(b, [a, b]), null);
  });

  it('refuses a different category', () => {
    const a = match({rival: 'Gràcia', at: 'home', date: '2026-09-14',
      category: 'juvenil'});
    const b = match({rival: 'Gràcia', at: 'away', date: '2027-01-18',
      category: 'amateur'});
    assert.strictEqual(find(b, [a, b]), null);
  });

  it('refuses a LATER match — the first leg is the earlier one', () => {
    const later = match({rival: 'Gràcia', at: 'home', date: '2027-03-01'});
    const cand = match({rival: 'Gràcia', at: 'away', date: '2027-01-18'});
    assert.strictEqual(find(cand, [later, cand]), null);
  });

  it('refuses a match on the SAME date', () => {
    const a = match({rival: 'Gràcia', at: 'home', date: '2027-01-18'});
    const b = match({rival: 'Gràcia', at: 'away', date: '2027-01-18'});
    assert.strictEqual(find(b, [a, b]), null);
  });

  it('refuses last season, even for a club that never archives', () => {
    // fa_matches is emptied by archiveSeason, but nothing forces a club to
    // run it — so the season window is the belt for the ones that do not.
    const lastSeason = match({rival: 'Gràcia', at: 'home', date: '2026-04-20'});
    const cand = match({rival: 'Gràcia', at: 'away', date: '2026-09-14'});
    assert.strictEqual(find(cand, [lastSeason, cand]), null);
  });

  it('refuses a different rival', () => {
    const a = match({rival: 'Sants', at: 'home', date: '2026-09-14'});
    const b = match({rival: 'Gràcia', at: 'away', date: '2027-01-18'});
    assert.strictEqual(find(b, [a, b]), null);
  });

  it('never pairs a match with itself', () => {
    const only = match({rival: 'Gràcia', at: 'home', date: '2026-09-14'});
    assert.strictEqual(find(only, [only]), null);
  });

  it('refuses a fixture with no opponent name yet', () => {
    // A row saved with a blank rival must not pair with every other blank one.
    const blank1 = match({rival: '', at: 'home', date: '2026-09-14'});
    const blank2 = match({rival: '', at: 'away', date: '2027-01-18'});
    assert.strictEqual(find(blank2, [blank1, blank2]), null);
  });
});

describe('findFirstLeg — the FCF teamId fast path', () => {
  /* Fixtures whose rival was picked from the configured FCF group carry the
     federation's own team id (v117). When both sides of a candidate pairing
     have one, it answers the question outright — but only then. Everything
     already in the database predates the picker, so the name path is not a
     fallback that may quietly rot: it is still the path most fixtures take. */
  const withId = (o) => Object.assign(match(o), {opponentTeamId: o.fcf});

  it('pairs on the id even when the names would not match', () => {
    // The same club, renamed mid-season on the federation's own site.
    const first = withId({rival: 'GRACIA, C.F.', at: 'home',
      date: '2026-09-14', fcf: '35410'});
    const second = withId({rival: 'CLUB FUTBOL GRACIA 2026', at: 'away',
      date: '2027-01-18', fcf: '35410'});
    assert.strictEqual(find(second, [first, second]).id, first.id);
  });

  it('REFUSES two clubs that normalise together but have different ids', () => {
    /* This is what the id buys. normTeamName collapses these two on purpose —
       it is tuned for a hint a human confirms — and the ids say they are not
       the same club. */
    const first = withId({rival: 'GRACIA, C.F.', at: 'home',
      date: '2026-09-14', fcf: '111'});
    const second = withId({rival: 'C.F. Gràcia', at: 'away',
      date: '2027-01-18', fcf: '222'});
    assert.strictEqual(find(second, [first, second]), null);
  });

  it('falls back to the name when only ONE side has an id', () => {
    // The commonest real case for a season or two: a fixture entered before
    // v117 and its return entered after.
    const first = match({rival: 'C.F. Gràcia', at: 'home', date: '2026-09-14'});
    const second = withId({rival: 'Gracia CF', at: 'away',
      date: '2027-01-18', fcf: '35410'});
    assert.strictEqual(find(second, [first, second]).id, first.id);
  });

  it('falls back to the name when NEITHER side has an id', () => {
    const first = match({rival: 'C.F. Gràcia', at: 'home', date: '2026-09-14'});
    const second = match({rival: 'Gracia CF', at: 'away', date: '2027-01-18'});
    assert.strictEqual(find(second, [first, second]).id, first.id);
  });

  it('an empty-string id is not an id', () => {
    // Stored as '' by an older build, or left behind by a cleared field.
    const first = withId({rival: 'Gràcia', at: 'home', date: '2026-09-14', fcf: ''});
    const second = withId({rival: 'Gràcia', at: 'away', date: '2027-01-18', fcf: ''});
    assert.strictEqual(find(second, [first, second]).id, first.id);
  });

  it('still obeys every other clause — the id is not an override', () => {
    // Same venue twice. A matching id must not smuggle a non-leg through.
    const a = withId({rival: 'Gràcia', at: 'home', date: '2026-09-14', fcf: '9'});
    const b = withId({rival: 'Gràcia', at: 'home', date: '2027-01-18', fcf: '9'});
    assert.strictEqual(find(b, [a, b]), null);
  });
});

describe('findFirstLeg — degenerate input', () => {
  it('returns null rather than throwing', () => {
    const ok = match({rival: 'Gràcia', at: 'home', date: '2026-09-14'});
    assert.strictEqual(U.findFirstLeg(null, [ok], CLUB, SEASON), null);
    assert.strictEqual(find({id: 1}, [ok]), null);           // no date
    assert.strictEqual(find(ok, null), null);
    assert.strictEqual(find(ok, [null, undefined, {}]), null);
  });

  it('compares ids as strings — match ids are numbers, doc ids are not', () => {
    const first = match({id: 1700000000000,
      rival: 'Gràcia', at: 'home', date: '2026-09-14'});
    const second = match({id: '1700000000000',
      rival: 'Gràcia', at: 'away', date: '2027-01-18'});
    // Same id in two types is the SAME match, so it must not pair with itself.
    assert.strictEqual(find(second, [first, second]), null);
  });
});
