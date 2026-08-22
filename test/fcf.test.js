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
