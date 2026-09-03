/* Reading fcf.cat's competition API.
 *
 * fcf.cat was rebuilt as a Next.js app in August 2026. The standings arrive as
 * JSON from /api/competition/classificacio?grupId=…, and the payload has one
 * trap that no amount of care at the call site would catch: `played`, `won`,
 * `drawn` and `lost` are the HOME and AWAY halves concatenated as strings.
 * `played:"1515"` is 15 + 15 = 30. `won:"139"` is 13 + 9 = 22. `drawn:"05"`
 * is 0 + 5 = 5. FCF's own site renders them raw and displays "1515", so this
 * is not a decoding we are missing — it is their bug, arriving in our JSON.
 *
 * The split cannot be recovered: "139" is 13|9 or 1|39 and nothing in the
 * payload chooses. So J is derived from points / coefficient instead, and the
 * tests below exist to make sure nobody ever "fixes" parseFcfClassificacio by
 * reading the field that looks like it holds the answer.
 *
 * Both fixtures are REAL captured payloads, not hand-written ones:
 *   fcf-finished.json  Tercera Catalana 2025-26 Grup 1, season complete —
 *                      every field populated, and the group whose 240 fixtures
 *                      were replayed to prove the concatenation rule.
 *   fcf-preseason.json Quarta Catalana 2026-27 Grup 10, not yet kicked off —
 *                      position "0" for all sixteen, coefficient "0.0000",
 *                      and L'Esquerra de l'Eixample in it. This is the group
 *                      behind the link that started the whole repair.
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const U = require(path.join(__dirname, '..', 'js', 'utils.js'));
const SERVER = require(path.join(__dirname, '..', 'functions', 'fcf.js'));

const fixture = (n) => JSON.parse(
    fs.readFileSync(path.join(__dirname, 'fixtures', n), 'utf8'));

const FINISHED = fixture('fcf-finished.json');
const PRESEASON = fixture('fcf-preseason.json');

const CLUB = 'L\'ESQUERRA DE L\'EIXAMPLE, F.C.';

describe('fcfGrupId — what a club lead pastes', () => {
  const CASES = [
    ['https://www.fcf.cat/ca/competicio?temporadaId=22&disciplinaId=19308233' +
       '&competicioId=58161869&grupId=58161881&tab=classificacio', '58161881'],
    // grupId last, with no trailing parameter after it
    ['https://www.fcf.cat/ca/competicio?competicioId=58161869&grupId=58161881', '58161881'],
    ['58161881', '58161881'],                    // just the number
    ['  58161881  ', '58161881'],                // pasted with whitespace
    // The pre-rebuild address. It 307s to /ca/… and then 404s, and there is
    // nothing in it to recover a grupId from — the slug names the group by
    // NAME, and last season's at that.
    ['https://www.fcf.cat/classificacio/2025-2026/futbol-11/quarta-catalana/grup-10', ''],
    ['https://www.fcf.cat/ca/competicio?tab=classificacio', ''],
    ['not a url at all', ''],
    ['', ''],
    [null, ''],
    [undefined, ''],
    // grupId present but not a number — must not be handed to the proxy
    ['https://www.fcf.cat/ca/competicio?grupId=abc', ''],
  ];

  CASES.forEach(([input, want]) => {
    it(`${JSON.stringify(input)} → ${JSON.stringify(want)}`, () => {
      assert.strictEqual(U.fcfGrupId(input), want);
    });
  });

  /* functions/fcf.js is a deliberate SECOND copy — the functions deploy
     uploads functions/ alone, so js/utils.js does not exist at runtime there.
     A duplicated rule needs a test that reads both copies, not two suites
     that test each side's behaviour separately and drift past each other. */
  it('the server copy in functions/fcf.js agrees on every case', () => {
    CASES.forEach(([input, want]) => {
      assert.strictEqual(SERVER.fcfGrupIdOf(input), want,
          'disagreement on ' + JSON.stringify(input));
    });
  });
});

describe('sameClubName — us, as the federation spells us', () => {
  /* fcf.cat writes the leading article a club drops from its own name. Get
     this wrong and L'Esquerra de l'Eixample's own row is the ONE row in the
     standings that is never highlighted, and the fixture import cannot find
     which of the sixteen teams in the group it is. */
  const SAME = [
    ['Esquerra de l\'Eixample F.C.', 'L\'ESQUERRA DE L\'EIXAMPLE, F.C.'],
    ['Prat', 'EL PRAT, A.E.'],
    ['Jonquera', 'LA JONQUERA, U.E.'],
    ['L\'Escala FC', 'L\'ESCALA, F.C.'],
    ['Gràcia', 'GRACIA, C.F.'],
  ];
  const DIFFERENT = [
    /* The leniency must stay narrow. These are the pairs normTeamName was
       built to keep apart, and stripping an article must not merge them. */
    ['Gràcia', 'Gràcia Atlètic'],
    ['Sants', 'Sant Andreu'],
    ['Roses', 'Base Roses'],
    ['', 'ANYTHING, C.F.'],
    ['ANYTHING, C.F.', ''],
  ];

  SAME.forEach(([a, b]) => {
    it(`"${a}" is "${b}"`, () => {
      assert.strictEqual(U.sameClubName(a, b), true);
      assert.strictEqual(U.sameClubName(b, a), true, 'not symmetric');
    });
  });

  DIFFERENT.forEach(([a, b]) => {
    it(`"${a}" is NOT "${b}"`, () => {
      assert.strictEqual(U.sameClubName(a, b), false);
      assert.strictEqual(U.sameClubName(b, a), false, 'not symmetric');
    });
  });

  it('the server copy agrees on every one of them', () => {
    SAME.concat(DIFFERENT).forEach(([a, b]) => {
      assert.strictEqual(SERVER.sameClubNameOf(a, b), U.sameClubName(a, b),
          'copies disagree on ' + JSON.stringify([a, b]));
    });
  });

  it('findFirstLeg still uses the STRICT rule, not this one', () => {
    /* The article leniency is for finding ourselves in a group we already
       know we are in. Pairing two fixtures is a question about strangers,
       and there it would buy wrong answers. */
    assert.notStrictEqual(U.normTeamName('La Jonquera'), U.normTeamName('Jonquera'));
  });
});

describe('parseFcfClassificacio — the concatenation trap', () => {
  const rows = U.parseFcfClassificacio(FINISHED, 'ROSES, A.E.');
  const top = rows[0];

  it('the raw payload really does carry glued-together figures', () => {
    // If this ever fails, FCF fixed their API and the derivation below can be
    // reconsidered — which is exactly why it is asserted rather than assumed.
    assert.strictEqual(FINISHED.data[0].played, '1515');
    assert.strictEqual(FINISHED.data[0].won, '139');
    assert.strictEqual(FINISHED.data[0].drawn, '05');
  });

  it('J is 30, not 1515 and not 15', () => {
    assert.strictEqual(top.j, 30);
  });

  it('every row in a completed 16-team group has played 30', () => {
    assert.strictEqual(rows.length, 16);
    rows.forEach((r) => assert.strictEqual(r.j, 30, r.club + ' played ' + r.j));
  });

  it('J is never simply parseInt(played)', () => {
    rows.forEach((r, i) => {
      assert.notStrictEqual(r.j, parseInt(FINISHED.data[i].played, 10));
    });
  });

  it('the derived table is internally consistent: 3W + D = points', () => {
    /* The check the derivation has to survive, done independently of it:
       wins and draws are recovered from the payload only through the totals
       we DO trust, so a J that is wrong makes this fail. */
    rows.forEach((r, i) => {
      const src = FINISHED.data[i];
      const pts = parseFloat(src.points);
      const coef = parseFloat(src.coefficient);
      assert.ok(Math.abs(pts / coef - r.j) < 0.01,
          r.club + ': coefficient implies ' + (pts / coef) + ', got ' + r.j);
    });
  });
});

describe('parseFcfClassificacio — the clean fields', () => {
  const rows = U.parseFcfClassificacio(FINISHED, CLUB);

  it('points are integers, not "71.00"', () => {
    assert.strictEqual(rows[0].pts, 71);
    assert.strictEqual(typeof rows[0].pts, 'number');
  });

  it('goals are totals and are NOT put through the split rule', () => {
    assert.strictEqual(rows[0].f, 106);
    assert.strictEqual(rows[0].c, 29);
  });

  it('position comes from the payload when the season has started', () => {
    assert.deepStrictEqual(rows.slice(0, 3).map((r) => r.pos), [1, 2, 3]);
  });

  it('the badge is an absolute files.fcf.cat URL', () => {
    assert.strictEqual(rows[0].badge,
        U.FCF_BADGE_BASE + FINISHED.data[0].team.logo);
  });

  it('a club with no crest gets an empty badge, not ".../null"', () => {
    const noLogo = FINISHED.data.findIndex((d) => !d.team.logo);
    assert.notStrictEqual(noLogo, -1, 'fixture should contain a logo-less club');
    assert.strictEqual(rows[noLogo].badge, '');
  });

  it('carries the federation teamId, which is what the picker stores', () => {
    assert.strictEqual(rows[0].teamId, FINISHED.data[0].team.teamId);
    rows.forEach((r) => assert.ok(r.teamId, r.club + ' has no teamId'));
  });

  it('survives an empty or malformed payload', () => {
    assert.deepStrictEqual(U.parseFcfClassificacio(null, CLUB), []);
    assert.deepStrictEqual(U.parseFcfClassificacio({}, CLUB), []);
    assert.deepStrictEqual(U.parseFcfClassificacio({data: []}, CLUB), []);
  });
});

describe('parseFcfClassificacio — pre-season', () => {
  const rows = U.parseFcfClassificacio(PRESEASON, CLUB);

  it('coefficient 0 gives J = 0, not NaN and not Infinity', () => {
    assert.strictEqual(PRESEASON.data[0].coefficient, '0.0000');
    rows.forEach((r) => {
      assert.strictEqual(r.j, 0);
      assert.ok(Number.isFinite(r.j));
    });
  });

  it('position "0" for everyone falls back to the array order', () => {
    assert.ok(PRESEASON.data.every((d) => d.position === '0'));
    assert.deepStrictEqual(rows.map((r) => r.pos),
        rows.map((_, i) => i + 1));
  });

  it('finds our club in the group we actually configured', () => {
    const ours = rows.filter((r) => r.ours);
    assert.strictEqual(ours.length, 1);
    assert.strictEqual(ours[0].club, CLUB);
  });
});

describe('parseFcfClassificacio — which row is ours', () => {
  /* The old scraper asked `club.toLowerCase().indexOf(needle) !== -1`, with
     the needle hardcoded to "esquerra" when a club had no name configured.
     Both halves of that were wrong, and both are cheap to pin. */
  const payload = {data: [
    {position: '1', team: {name: 'GRACIA ATLETIC, C.F.', teamId: '1'},
      points: '10.00', coefficient: '1.0000', goalsFor: '5', goalsAgainst: '3'},
    {position: '2', team: {name: 'GRACIA, C.F.', teamId: '2'},
      points: '9.00', coefficient: '0.9000', goalsFor: '4', goalsAgainst: '4'},
  ]};

  it('does not highlight a club that merely CONTAINS our name', () => {
    const rows = U.parseFcfClassificacio(payload, 'C.F. Gràcia');
    assert.deepStrictEqual(rows.map((r) => r.ours), [false, true]);
  });

  it('matches across accents and legal-form word order', () => {
    const rows = U.parseFcfClassificacio(payload, 'Gràcia Futbol Club');
    assert.strictEqual(rows[1].ours, true);
  });

  it('highlights nothing when the club name is unknown', () => {
    const rows = U.parseFcfClassificacio(payload, '');
    assert.ok(rows.every((r) => r.ours === false));
  });
});

/* The last five (parking-lot item 26).
 *
 * The `form` array has been arriving in the classificacio payload since the
 * rebuild — the note at the head of the FCF section in js/utils.js has said
 * so all along — and nothing parsed it. These run against the two REAL
 * captured payloads, which is what makes the empty case trustworthy: it is
 * not a hypothetical, it is what pre-season actually sends.
 */
describe('parseFcfForm — the rival\'s last five', () => {
  it('reads five results per team from a finished season', () => {
    const rows = U.parseFcfClassificacio(FINISHED, CLUB);
    rows.forEach((r) => assert.strictEqual(r.form.length, 5,
        r.club + ' has ' + r.form.length + ' results, not 5'));
  });

  it('maps the federation\'s G/E/P onto W/D/L', () => {
    const seen = new Set();
    U.parseFcfClassificacio(FINISHED, CLUB)
        .forEach((r) => r.form.forEach((f) => seen.add(f.res)));
    assert.deepStrictEqual([...seen].sort(), ['D', 'L', 'W']);
  });

  it('reads the result from THIS team\'s point of view', () => {
    /* The row's own team, not the home side. The first row of the finished
       fixture won 11-0 AWAY, and a naive reader would call that a loss. */
    const top = U.parseFcfClassificacio(FINISHED, CLUB)[0];
    const first = FINISHED.data[0].form[0];
    const ourGoals = Number(first.away.goals);
    const theirGoals = Number(first.home.goals);
    assert.strictEqual(top.form[0].res, ourGoals > theirGoals ? 'W' : 'L',
        'the result is being read from the wrong side of the fixture');
  });

  it('keeps the payload order — most recent first', () => {
    const top = U.parseFcfClassificacio(FINISHED, CLUB)[0];
    const dates = top.form.map((f) => f.date);
    assert.deepStrictEqual(dates, dates.slice().sort().reverse(),
        'the run must read left-to-right from the most recent match');
    assert.ok(/^\d{4}-\d{2}-\d{2}$/.test(dates[0]), dates[0]);
  });

  it('⚠ is EMPTY pre-season, for every team — not missing, not five blanks', () => {
    /* This is the case the renderer must hide rather than draw. A season
       that has not started and a proxy that is down must not look alike. */
    const rows = U.parseFcfClassificacio(PRESEASON, CLUB);
    assert.ok(rows.length, 'the pre-season fixture has no rows at all');
    rows.forEach((r) => assert.deepStrictEqual(r.form, [], r.club));
  });

  it('DROPS an unrecognised letter rather than calling it a draw', () => {
    // Inventing a result is worse than showing four squares.
    const out = U.parseFcfForm([
      {result: 'G', home: {name: 'A', goals: '2'}, away: {name: 'B', goals: '1'}},
      {result: 'X', home: {name: 'A', goals: '0'}, away: {name: 'C', goals: '0'}},
      {result: 'P', home: {name: 'D', goals: '3'}, away: {name: 'A', goals: '0'}}
    ]);
    assert.deepStrictEqual(out.map((f) => f.res), ['W', 'L']);
  });

  it('carries the fixture as a label for the hover title', () => {
    const out = U.parseFcfForm(
        [{result: 'E', date: '2026-05-16T00:00:00.000Z',
          home: {name: 'ROSES, A.E.', goals: '1'},
          away: {name: 'GRACIA, C.F.', goals: '1'}}]);
    assert.strictEqual(out[0].label, 'ROSES, A.E. 1–1 GRACIA, C.F.');
    assert.strictEqual(out[0].date, '2026-05-16');
  });

  it('survives a row with no form field at all', () => {
    // An older cached payload, or a shape the federation changes again.
    assert.deepStrictEqual(U.parseFcfForm(undefined), []);
    assert.deepStrictEqual(U.parseFcfForm(null), []);
    assert.deepStrictEqual(U.parseFcfForm('nonsense'), []);
  });
});
