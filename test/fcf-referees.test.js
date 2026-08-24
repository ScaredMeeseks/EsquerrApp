/* Building the referee database.
 *
 * The crawl itself is I/O and lives in functions/index.js; everything that
 * DECIDES anything is here, and every one of these decisions is a way the
 * feature can be quietly wrong rather than loudly broken:
 *
 *   - fetching an acta again once it has been played (or never doing so,
 *     which is invisible for months);
 *   - resolving competition ids per season instead of hardcoding them (a
 *     hardcoded id backfills the wrong year without complaining);
 *   - crediting the referee rather than his assistants;
 *   - counting sendings-off from `sanciones`, which is the only place the
 *     federation records them at all.
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const F = require(path.join(__dirname, '..', 'functions', 'fcf.js'));

const fixture = (n) => JSON.parse(
    fs.readFileSync(path.join(__dirname, 'fixtures', n), 'utf8'));
const SANCIONS = fixture('fcf-sancions.json');
const PARTIDOS = fixture('fcf-partidos.json');

describe('picking the five senior tiers', () => {
  /* Shaped exactly like /api/competition/competicions, including the cup and
     play-off competitions that share a prefix with a tier.
     The Terres Ebre variants are listed BEFORE the tier they shadow, on
     purpose: FCF's real payload happens to put the plain "QUARTA CATALANA"
     first, so a prefix match would pick the right row anyway and the test
     would pass on ordering luck rather than on the rule. Ordered like this it
     tests the rule. */
  const COMPS = [
    {value: '58163288', label: 'QUARTA CATALANA - COPA TERRES EBRE'},
    {value: '58163292', label: 'QUARTA CATALANA - FASE ASCENS TERRES EBRE'},
    {value: '58161860', label: 'LLIGA ELIT'},
    {value: '58952721', label: 'COPA CATALUNYA MASCULINA'},
    {value: '58161856', label: 'PRIMERA CATALANA'},
    {value: '58161862', label: 'SEGONA CATALANA'},
    {value: '58161869', label: 'TERCERA CATALANA'},
    {value: '58161888', label: 'QUARTA CATALANA'},
    {value: '58163178', label: 'PROMOCIÓ ASCENS A TERCERA CATALANA'},
    {value: '58161926', label: 'LLIGA NACIONAL JUVENIL'},
  ];

  it('takes exactly the five, in tier order, with the right ids', () => {
    /* The IDS are the assertion that matters. The label comes back from the
       wanted list either way, so checking labels alone would pass even if
       every competition resolved to the wrong competition — which is exactly
       what a loose match does. */
    assert.deepStrictEqual(F.pickFcfTiers({data: COMPS}), [
      {competicioId: '58161860', label: 'LLIGA ELIT'},
      {competicioId: '58161856', label: 'PRIMERA CATALANA'},
      {competicioId: '58161862', label: 'SEGONA CATALANA'},
      {competicioId: '58161869', label: 'TERCERA CATALANA'},
      {competicioId: '58161888', label: 'QUARTA CATALANA'},
    ]);
  });

  it('does NOT resolve a tier to the cup that shares its prefix', () => {
    /* "QUARTA CATALANA - COPA TERRES EBRE" is a different competition, and in
       this fixture it is listed FIRST. A prefix match would silently crawl
       the cup instead of the league — same tier name in the UI, entirely the
       wrong groups underneath. */
    const quarta = F.pickFcfTiers({data: COMPS})
        .find((t) => t.label === 'QUARTA CATALANA');
    assert.strictEqual(quarta.competicioId, '58161888',
        'the cup was picked instead of the league');
  });

  it('survives a season that is missing a tier', () => {
    const got = F.pickFcfTiers({data: [{value: '1', label: 'TERCERA CATALANA'}]});
    assert.deepStrictEqual(got, [{competicioId: '1', label: 'TERCERA CATALANA'}]);
  });

  it('returns nothing rather than throwing on a bad payload', () => {
    [null, undefined, {}, {data: null}, 'nope', 42].forEach((j) => {
      assert.deepStrictEqual(F.pickFcfTiers(j), [], JSON.stringify(j));
    });
  });

  it('reads every shape FCF wraps a list in', () => {
    const rows = [{value: '9', label: 'LLIGA ELIT'}];
    [rows, {data: rows}, {data: {anything: rows}}].forEach((j) => {
      assert.strictEqual(F.pickFcfTiers(j).length, 1, JSON.stringify(j));
    });
  });
});

describe('which actas are due', () => {
  const match = (id, closed, extra) => Object.assign({
    CODACTA: id, JORNADA: '3', CERRADA: closed ? '1' : '0',
    GOLES_CASA: '2', GOLES_FUERA: '1', COMIENZO1: '2025-09-14 18:00:00',
  }, extra || {});

  it('asks for a played match it has never seen', () => {
    const due = F.fcfActasDue({3: [match('111', true)]}, {});
    assert.strictEqual(due.length, 1);
    assert.strictEqual(due[0].actaId, '111');
    assert.strictEqual(due[0].closed, true);
    assert.strictEqual(due[0].result, 'H');
  });

  it('does NOT ask again for one already indexed as played', () => {
    /* This is what keeps the weekly pass at minutes rather than re-fetching
       fourteen thousand pages. */
    const due = F.fcfActasDue({3: [match('111', true)]}, {111: {c: 1, r: ['A, B']}});
    assert.deepStrictEqual(due, []);
  });

  it('DOES ask again once a match it saw unplayed has been played', () => {
    /* The guard whose absence is invisible. The Friday job reads unplayed
       actas for the appointments, so by Monday the index already "has" the
       match. Keyed on presence alone, its result and its cards would never be
       collected — and the only symptom, months later, is referees whose
       records stopped growing. */
    const indexed = {111: {r: ['TORRIJO SIERRA, ANDREA'], j: 3}};
    const due = F.fcfActasDue({3: [match('111', true)]}, indexed);
    assert.strictEqual(due.length, 1, 'a played match was never re-fetched');
    assert.strictEqual(due[0].closed, true);
    assert.strictEqual(due[0].result, 'H');
  });

  it('does not re-ask for an unplayed match it already holds', () => {
    const indexed = {111: {r: ['TORRIJO SIERRA, ANDREA'], j: 3}};
    assert.deepStrictEqual(F.fcfActasDue({3: [match('111', false)]}, indexed), []);
  });

  it('returns unplayed matches too, flagged, for the appointments pass', () => {
    const due = F.fcfActasDue({3: [match('111', false)]}, {});
    assert.strictEqual(due.length, 1);
    assert.strictEqual(due[0].closed, false);
    assert.strictEqual(due[0].result, '', 'an unplayed match has no result');
  });

  it('reads a real group payload', () => {
    const due = F.fcfActasDue(PARTIDOS, {});
    assert.strictEqual(due.length, 240, 'a full group is 30 jornades of 8');
    assert.ok(due.every((d) => /^\d+$/.test(d.actaId)));
    assert.ok(due.every((d) => d.jornada >= 1 && d.jornada <= 30));
    // Sorted by jornada, so a budget-limited run walks the season in order
    // instead of leaving arbitrary holes.
    const js = due.map((d) => d.jornada);
    assert.deepStrictEqual(js, js.slice().sort((a, b) => a - b));
  });

  it('never returns the same acta twice', () => {
    const dup = {3: [match('111', true)], 4: [match('111', true)]};
    assert.strictEqual(F.fcfActasDue(dup, {}).length, 1);
  });

  it('skips rows with no acta id', () => {
    assert.deepStrictEqual(F.fcfActasDue({3: [match('', true)]}, {}), []);
  });

  it('shrugs off a bad payload', () => {
    [null, undefined, {}, {3: null}, {3: 'nope'}].forEach((p) => {
      assert.deepStrictEqual(F.fcfActasDue(p, {}), [], JSON.stringify(p));
    });
  });
});

describe('reading a result', () => {
  it('is from the home side\'s point of view', () => {
    assert.strictEqual(F.fcfMatchResult('3', '0'), 'H');
    assert.strictEqual(F.fcfMatchResult('0', '3'), 'A');
    assert.strictEqual(F.fcfMatchResult('1', '1'), 'D');
  });

  it('treats 0-0 as a draw, not as missing', () => {
    // The scores are STRINGS in the payload, and "0" is falsy-adjacent in
    // every language that has bitten someone before.
    assert.strictEqual(F.fcfMatchResult('0', '0'), 'D');
  });

  it('is empty when it cannot be read', () => {
    [['', ''], [null, '1'], ['x', 'y'], [undefined, undefined]]
        .forEach(([a, b]) => assert.strictEqual(F.fcfMatchResult(a, b), ''));
  });
});

describe('sendings-off, from sanciones', () => {
  const byActa = F.parseFcfSanctionsByActa(SANCIONS);

  it('counts second bookings and direct expulsions separately', () => {
    const total = Object.keys(byActa).reduce((acc, k) => {
      acc.reds += byActa[k].reds;
      acc.doubles += byActa[k].doubles;
      return acc;
    }, {reds: 0, doubles: 0});
    assert.strictEqual(total.doubles, 11, 'code 102 = a second booking');
    assert.strictEqual(total.reds, 16, 'code 103 = sent off directly');
  });

  it('attributes every one of them to a match', () => {
    assert.ok(Object.keys(byActa).length > 0);
    assert.ok(Object.keys(byActa).every((k) => /^\d+$/.test(k)));
  });

  it('ignores accumulations — they are not a sending-off', () => {
    /* Code 101 is the fifth-booking ruling. It IS evidence of a yellow card
       in that match, which is tempting, but it fires once every five: counted,
       it would produce a number that reads like a yellow tally and is a fifth
       of one. Yellows stay unpublished, and the UI says so. */
    const all = [];
    Object.keys(SANCIONS).forEach((j) => (SANCIONS[j] || []).forEach((r) => all.push(r)));
    const accumulations = all.filter((r) => String(r.cod_tiposancion) === '101');
    assert.ok(accumulations.length > 0, 'the fixture must contain one to prove this');
    const counted = accumulations.reduce((n, r) =>
      n + (byActa[String(r.codacta)] ? 1 : 0), 0);
    const alsoSentOff = accumulations.filter((r) => all.some((o) =>
      String(o.codacta) === String(r.codacta) &&
      (String(o.cod_tiposancion) === '102' || String(o.cod_tiposancion) === '103')));
    assert.strictEqual(counted, alsoSentOff.length,
        'an accumulation was counted as a card');
  });

  it('ignores rulings against a club', () => {
    /* Fines and closed grounds belong to nobody on the pitch. They also carry
       no type code, so they would otherwise fall through as reds. */
    const teamRows = [];
    Object.keys(SANCIONS).forEach((j) => (SANCIONS[j] || []).forEach((r) => {
      if (String(r.tipo) === 'equipo') teamRows.push(r);
    }));
    assert.ok(teamRows.length > 0, 'the fixture must contain one to prove this');
    const only = F.parseFcfSanctionsByActa({1: teamRows});
    assert.deepStrictEqual(only, {});
  });

  it('ignores a club ruling even if it ever carried a sending-off code', () => {
    /* SYNTHETIC. Today every `tipo:"equipo"` row has a null code, so the code
       filter alone would already drop them and the `tipo` check looks
       redundant — which is exactly why it is worth pinning. If the federation
       ever stamps a code on a club ruling (a closed ground after a brawl is
       not far-fetched), that fine would be recorded as a referee's red card
       against a player who does not exist. */
    const stamped = {1: [{
      codacta: '999', tipo: 'equipo', cod_tiposancion: '103',
      nombre_equipo: 'SOME CLUB', motivo_sancion: 'multa',
    }]};
    assert.deepStrictEqual(F.parseFcfSanctionsByActa(stamped), {});
  });

  it('shrugs off a bad payload', () => {
    [null, undefined, {}, {1: null}, 'nope'].forEach((j) => {
      assert.deepStrictEqual(F.parseFcfSanctionsByActa(j), {}, JSON.stringify(j));
    });
  });
});

describe('the derived profiles', () => {
  const REF = 'TORRIJO SIERRA, ANDREA';
  const OTHER = 'BOADA BARCELONA, MARC';
  const groups = [
    {comp: 'TERCERA CATALANA', season: '21', actas: {
      1: {r: [REF, OTHER], c: 1, res: 'H', j: 1, d: '2025-09-14'},
      2: {r: [REF], c: 1, res: 'D', j: 2, d: '2025-09-21'},
      3: {r: [REF], c: 1, res: 'A', j: 3, d: '2025-09-28'},
      4: {r: [REF], j: 4, d: '2026-05-01'},            // appointed, not played
    }},
    {comp: 'QUARTA CATALANA', season: '21', actas: {
      5: {r: [REF], c: 1, res: 'H', j: 1, d: '2025-10-05'},
    }},
  ];
  const cards = {1: {reds: 1, doubles: 2}, 5: {reds: 3, doubles: 0}};
  const out = F.aggregateFcfReferees(groups, cards);
  const p = out[F.fcfRefereeSlug(REF)];

  it('credits the referee, never his assistants', () => {
    /* r[0] took the decisions; the rest ran the line. Crediting all three
       would treble every count and attribute cards to people who did not
       give them. */
    assert.ok(p, 'the referee has no profile');
    assert.ok(!out[F.fcfRefereeSlug(OTHER)],
        'an assistant was given a record of his own');
  });

  it('splits by division, because that is what the match page reads', () => {
    /* A referee's Quarta record says nothing useful about how he will handle
       a Segona match, and a blended career average mixes the two silently. */
    assert.strictEqual(p.byDivision['TERCERA CATALANA'].matches, 3);
    assert.strictEqual(p.byDivision['QUARTA CATALANA'].matches, 1);
    assert.strictEqual(p.matches, 4);
  });

  it('keeps home, draw and away apart within a division', () => {
    const t = p.byDivision['TERCERA CATALANA'];
    assert.strictEqual(t.H, 1);
    assert.strictEqual(t.D, 1);
    assert.strictEqual(t.A, 1);
    assert.strictEqual(p.byDivision['QUARTA CATALANA'].H, 1);
    assert.strictEqual(p.byDivision['QUARTA CATALANA'].D, 0);
  });

  it('counts sendings-off into the division they happened in', () => {
    assert.strictEqual(p.byDivision['TERCERA CATALANA'].reds, 1);
    assert.strictEqual(p.byDivision['TERCERA CATALANA'].doubles, 2);
    assert.strictEqual(p.byDivision['QUARTA CATALANA'].reds, 3);
    assert.strictEqual(p.byDivision['QUARTA CATALANA'].doubles, 0);
  });

  it('ignores a match that has not been played', () => {
    /* An appointment is not a record. Counting jornada 4 would give the
       referee a match he has not refereed and a result he cannot have. */
    const t = p.byDivision['TERCERA CATALANA'];
    assert.strictEqual(t.H + t.D + t.A, 3);
    assert.strictEqual(t.matches, 3);
  });

  it('records when he was first and last seen', () => {
    assert.strictEqual(p.firstSeen, '2025-09-14');
    assert.strictEqual(p.lastSeen, '2025-10-05');
  });

  it('counts his matches per season', () => {
    assert.strictEqual(p.seasons['21'], 4);
  });

  it('is one person even when FCF drops the accents', () => {
    /* The federation's spelling drifts between seasons. A split record halves
       everyone's match count and nothing on screen would say so. */
    const drifted = F.aggregateFcfReferees([
      {comp: 'TERCERA CATALANA', season: '20', actas: {
        1: {r: ['DOMÍNGUEZ GUTIÉRREZ, FRAN'], c: 1, res: 'H', d: '2024-09-01'},
      }},
      {comp: 'TERCERA CATALANA', season: '21', actas: {
        2: {r: ['DOMINGUEZ GUTIERREZ, FRAN'], c: 1, res: 'A', d: '2025-09-01'},
      }},
    ], {});
    assert.strictEqual(Object.keys(drifted).length, 1, 'the record split in two');
    const only = drifted[Object.keys(drifted)[0]];
    assert.strictEqual(only.matches, 2);
    assert.strictEqual(only.name, 'DOMINGUEZ GUTIERREZ, FRAN',
        'the newest spelling should be the one displayed');
  });

  it('needs no sanctions to work', () => {
    // The crawl and the cards join are separate passes; one must not require
    // the other to have run.
    const bare = F.aggregateFcfReferees(groups, null);
    const q = bare[F.fcfRefereeSlug(REF)];
    assert.strictEqual(q.matches, 4);
    assert.strictEqual(q.byDivision['TERCERA CATALANA'].reds, 0);
  });

  it('shrugs off a bad payload', () => {
    [null, undefined, [], [null], [{}], [{actas: null}]].forEach((g) => {
      assert.deepStrictEqual(F.aggregateFcfReferees(g, {}), {}, JSON.stringify(g));
    });
  });

  it('ignores an acta with no referee on it', () => {
    const none = F.aggregateFcfReferees([{comp: 'X', season: '21', actas: {
      1: {r: [], c: 1, res: 'H'}, 2: {c: 1, res: 'D'},
    }}], {});
    assert.deepStrictEqual(none, {});
  });
});

describe('when to rebuild the crawl queue', () => {
  const scope = '22,21|LLIGA ELIT|';
  const full = {scope, queue: [1, 2, 3], at: 1, freshFor: '2026-08-28'};

  it('carries on mid-queue', () => {
    assert.strictEqual(F.fcfShouldRebuild(full, scope, '2026-08-28'), false);
  });

  it('rebuilds when the scope changed', () => {
    /* Widening from our own groups to all 64 must not walk a queue built for
       the old scope and then report itself finished. */
    assert.strictEqual(F.fcfShouldRebuild(full, 'something else', ''), true);
  });

  it('rebuilds when the pass reached the end', () => {
    /* Without this the job runs once, then sits at the end of a finished
       queue for ever — doing nothing, and looking perfectly healthy. */
    assert.strictEqual(
        F.fcfShouldRebuild({scope, queue: [1, 2, 3], at: 3}, scope, ''), true);
  });

  it('rebuilds from an empty or missing state', () => {
    [null, undefined, {}, {scope}, {scope, queue: []}].forEach((s) => {
      assert.strictEqual(F.fcfShouldRebuild(s, scope, ''), true, JSON.stringify(s));
    });
  });

  it('starts a new sweep each week, not each firing', () => {
    /* The Friday pass fires three times because a weekend does not fit in one
       540-second function. The 06:00 run must start over; 07:00 and 08:00
       must continue, or the same groups are crawled three times and the far
       end of the queue is never reached at all. */
    assert.strictEqual(F.fcfShouldRebuild(full, scope, '2026-09-04'), true);
    assert.strictEqual(F.fcfShouldRebuild(full, scope, '2026-08-28'), false);
  });

  it('ignores freshFor when the caller does not use it', () => {
    // The nightly backfill has no weekly rhythm; it just keeps going.
    assert.strictEqual(F.fcfShouldRebuild(full, scope, ''), false);
    assert.strictEqual(F.fcfShouldRebuild(full, scope, undefined), false);
  });
});

describe('the index document id', () => {
  it('is season and group, so two seasons never overwrite each other', () => {
    assert.strictEqual(F.fcfRefIndexId('21', '54322937'), '21_54322937');
    assert.notStrictEqual(
        F.fcfRefIndexId('21', '999'), F.fcfRefIndexId('22', '999'));
  });
});

describe('one acta\'s entry', () => {
  it('carries the result only once the match is played', () => {
    const closed = F.fcfActaEntry(
        {jornada: 4, closed: true, result: 'H', date: '2025-09-14'}, ['A, B']);
    assert.deepStrictEqual(closed, {r: ['A, B'], j: 4, d: '2025-09-14', c: 1, res: 'H'});

    const open = F.fcfActaEntry(
        {jornada: 4, closed: false, result: '', date: '2026-05-01'}, ['A, B']);
    assert.strictEqual(open.c, undefined, 'an unplayed match must not look played');
    assert.strictEqual(open.res, undefined);
  });

  it('copies the names rather than aliasing them', () => {
    const names = ['A, B'];
    const e = F.fcfActaEntry({jornada: 1, closed: true}, names);
    names.push('C, D');
    assert.deepStrictEqual(e.r, ['A, B']);
  });
});
