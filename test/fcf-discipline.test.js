/* Sancions and Top Scorers — reading the federation's discipline and
 * scoring tables.
 *
 * Two things here are not ordinary parsing and are the reason this file
 * exists:
 *
 *   1. `licencia` in both payloads is a Spanish DNI/NIE, for players who in
 *      most of this app's categories are MINORS. It must never leave the
 *      parse boundary. A field that is merely "not rendered" is one
 *      JSON.stringify away from being stored.
 *
 *   2. A ban issued at jornada N for P matches covers N+1 … N+P. Getting
 *      that window wrong tells a coach a player is available when he is
 *      suspended, which he finds out about at the ground.
 *
 * The fixtures are the real Tercera Catalana 2025-26 Grup 1 payloads with
 * every `licencia` and `ficha` REMOVED before committing — this repo is
 * public and served by GitHub Pages, so the real numbers could not go in it.
 * The DNI guard below injects a synthetic one instead, which tests the guard
 * properly and puts nobody's identity document in git.
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');

/* js/utils.js, NOT functions/fcf.js. These parsers are called from the
   browser by the Sancions and Golejadors tabs, and nothing on the server
   parses either payload. They were written on the wrong side of that
   boundary first: every request succeeded, the parser threw ReferenceError
   in the browser, and the catch reported it to the user as "could not
   load". The suite below passed the whole time, because Node could see what
   the browser could not. */
const F = require(path.join(__dirname, '..', 'js', 'utils.js'));

const fixture = (n) => JSON.parse(
    fs.readFileSync(path.join(__dirname, 'fixtures', n), 'utf8'));
const SANCIONS = fixture('fcf-sancions.json');
const SCORERS = fixture('fcf-goleadors.json');

describe('the DNI never leaves the parser', () => {
  const DNI = '41566132A';

  it('is dropped from a sanction, however it arrives', () => {
    const rows = F.parseFcfSanctions({'1': [{
      tipo: 'participante', jornada: '1', partidos_sancion: '1',
      participante_nombre: 'SOMEONE, REAL', codparticipante: '39285834',
      codequipo: '1', nombre_equipo: 'X, C.F.',
      licencia: DNI, ficha: DNI, motivo_sancion: 'x', articulo_salida: '336',
    }]});
    const blob = JSON.stringify(rows);
    assert.ok(!blob.includes(DNI), 'the DNI survived the parser: ' + blob);
    assert.ok(!/licencia|ficha/.test(blob), 'a PII field name survived');
    // The federation's own opaque id is what identifies a player instead.
    assert.strictEqual(rows[0].playerId, '39285834');
  });

  it('is dropped from a scorer', () => {
    const rows = F.parseFcfScorers([{
      nombre_jugador: 'SOMEONE, REAL', codjugador: '524208', codequipo: '1',
      nombre_equipo: 'X', goles: 10, penalti: 1, total: 20, licencia: DNI,
    }]);
    const blob = JSON.stringify(rows);
    assert.ok(!blob.includes(DNI), 'the DNI survived the parser: ' + blob);
    assert.strictEqual(rows[0].playerId, '524208');
  });

  it('and is not in the committed fixtures either', () => {
    /* This repo is public and GitHub Pages serves it. A captured payload
       with real identity numbers in it would be published to the internet by
       the act of committing. */
    [SANCIONS, SCORERS].forEach((f) => {
      const blob = JSON.stringify(f);
      assert.ok(!/licencia|ficha/.test(blob), 'a fixture still carries PII');
      assert.ok(!/"\d{8}[A-Z]"/.test(blob), 'a fixture still carries a DNI');
    });
  });
});

describe('parseFcfSanctions', () => {
  const rows = F.parseFcfSanctions(SANCIONS);

  it('flattens the jornada-keyed payload', () => {
    const raw = Object.keys(SANCIONS)
        .reduce((n, j) => n + SANCIONS[j].length, 0);
    assert.strictEqual(rows.length, raw);
    assert.ok(rows.length > 20, 'the fixture lost its bulk');
  });

  it('comes back newest jornada first', () => {
    const js = rows.map((r) => r.jornada);
    assert.deepStrictEqual(js, js.slice().sort((a, b) => b - a));
  });

  it('separates a ruling against the CLUB from a ban on a player', () => {
    /* 20 of the 48 rulings in this fixture are `tipo: equipo` — fines,
       closed grounds, a match ordered to resume. Listing one as a missing
       player is simply wrong, and every one of them has matches === 0. */
    const team = rows.filter((r) => r.isTeam);
    assert.ok(team.length > 0, 'the fixture has no team rulings left');
    team.forEach((r) => {
      assert.strictEqual(r.player, '', 'a club ruling named a player');
      assert.strictEqual(r.matches, 0);
    });
    rows.filter((r) => !r.isTeam).forEach((r) => {
      assert.ok(r.player, 'a player ban with nobody named');
    });
  });

  it('keeps the reason and the article, which is what a coach reads', () => {
    const one = rows.find((r) => !r.isTeam);
    assert.ok(one.reason.length > 5, one.reason);
    assert.ok(one.article);
  });

  it('survives an empty or malformed payload', () => {
    assert.deepStrictEqual(F.parseFcfSanctions(null), []);
    assert.deepStrictEqual(F.parseFcfSanctions({}), []);
    assert.deepStrictEqual(F.parseFcfSanctions({'1': null}), []);
  });
});

describe('banCoversJornada — who actually misses the next game', () => {
  const ban = (jornada, matches, over) => Object.assign({
    jornada, matches, isTeam: false, teamId: '7',
  }, over);

  it('a one-match ban covers the NEXT round, not the one he was sent off in', () => {
    const r = ban(5, 1);
    assert.strictEqual(F.banCoversJornada(r, 5), false, 'he played in J5');
    assert.strictEqual(F.banCoversJornada(r, 6), true);
    assert.strictEqual(F.banCoversJornada(r, 7), false);
  });

  it('a four-match ban covers exactly four rounds', () => {
    const r = ban(10, 4);
    [11, 12, 13, 14].forEach((j) =>
      assert.strictEqual(F.banCoversJornada(r, j), true, 'J' + j));
    [10, 15, 20].forEach((j) =>
      assert.strictEqual(F.banCoversJornada(r, j), false, 'J' + j));
  });

  it('a CLUB ruling keeps nobody out of anything', () => {
    assert.strictEqual(F.banCoversJornada(ban(5, 2, {isTeam: true}), 6), false);
  });

  it('a zero-match ruling keeps nobody out either', () => {
    // A caution, a fine — recorded, but he plays.
    assert.strictEqual(F.banCoversJornada(ban(5, 0), 6), false);
  });

  it('degenerate input is false, never a throw', () => {
    assert.strictEqual(F.banCoversJornada(null, 6), false);
    assert.strictEqual(F.banCoversJornada(ban(5, 1), null), false);
    assert.strictEqual(F.banCoversJornada(ban(5, 1), 'x'), false);
  });

  it('bansForJornada filters to one team when asked', () => {
    const rows = [ban(5, 1), ban(5, 1, {teamId: '9'}), ban(5, 0)];
    assert.strictEqual(F.bansForJornada(rows, 6).length, 2);
    assert.strictEqual(F.bansForJornada(rows, 6, '7').length, 1);
    assert.strictEqual(F.bansForJornada(rows, 6, '9').length, 1);
    assert.strictEqual(F.bansForJornada(rows, 99, '7').length, 0);
    assert.deepStrictEqual(F.bansForJornada(null, 6), []);
  });

  it('finds real suspensions in the real payload', () => {
    /* Against the captured fixture rather than hand-built rows: if the
       shape ever changes, this notices and the constructed cases above
       would not. */
    const rows = F.parseFcfSanctions(SANCIONS);
    const anyJornada = rows.map((r) => r.jornada);
    const j = Math.min(...anyJornada) + 1;
    const out = F.bansForJornada(rows, j);
    assert.ok(out.length > 0, 'no suspensions found for J' + j);
    out.forEach((r) => {
      assert.ok(!r.isTeam && r.player && r.matches > 0);
    });
  });
});

describe('parseFcfScorers', () => {
  const rows = F.parseFcfScorers(SCORERS);

  it('numbers the table in the order the federation ranks it', () => {
    assert.strictEqual(rows.length, SCORERS.length);
    assert.strictEqual(rows[0].rank, 1);
    assert.strictEqual(rows[rows.length - 1].rank, rows.length);
  });

  it('publishes the OFFICIAL figure, by decision', () => {
    /* The owner's call: FCF's number is what the app shows, even though it
       is arithmetically impossible — the top five of one club sum to 157 for
       a team that scored 106 all season, because `goles` is the home and
       away tallies concatenated as strings. FCF_SCORERS_RAW is the single
       line to flip. */
    assert.strictEqual(F.FCF_SCORERS_RAW, true);
    assert.strictEqual(rows[0].goals, parseInt(SCORERS[0].goles, 10));
  });

  it('`total` is matches played, not goals', () => {
    // FCF's own frontend names it matchesPlayed. Reading it as goals would
    // make every scouting number wrong in a second, different way.
    assert.strictEqual(rows[0].played, parseInt(SCORERS[0].total, 10));
    assert.ok(rows.every((r) => r.played <= 40), 'a season is not that long');
  });

  it('carries the club and its crest, which is the scouting half', () => {
    rows.forEach((r) => {
      assert.ok(r.teamName, 'a scorer with no club');
      assert.ok(r.teamId);
    });
    assert.ok(rows.some((r) => r.badge.startsWith('https://files.fcf.cat/')));
  });

  it('survives an empty or malformed payload', () => {
    assert.deepStrictEqual(F.parseFcfScorers(null), []);
    assert.deepStrictEqual(F.parseFcfScorers([]), []);
    assert.deepStrictEqual(F.parseFcfScorers({}), []);
  });

  it('splitFcfTally is ready for the day the raw figure is abandoned', () => {
    // Not wired in, but kept honest: "76" is 7+6, "05" is 0+5, "8" is 8.
    assert.strictEqual(F.splitFcfTally('76'), 13);
    assert.strictEqual(F.splitFcfTally('05'), 5);
    assert.strictEqual(F.splitFcfTally('8'), 8);
    assert.strictEqual(F.splitFcfTally(''), 0);
    assert.strictEqual(F.splitFcfTally(null), 0);
  });
});
