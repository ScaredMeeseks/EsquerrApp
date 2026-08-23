/* The Sancions and Top Scorers RENDERERS, run for real.
 *
 * Same grab() convention as match-notes-render.test.js, and for the same
 * reason: these are ~250 lines of string building that nothing else
 * executes, and the failure mode of one mistyped identifier is a BLANK PAGE
 * for every coach in the club, discovered by a human.
 *
 * What this pins, beyond "it parses":
 *   - a club with no FCF link gets an explanation, never an empty screen;
 *   - a ruling against a CLUB is never listed as a player who is unavailable;
 *   - both sides of the next fixture are shown, ours and theirs;
 *   - the sort actually sorts, and flips;
 *   - no DNI and no unescaped name ever reaches the HTML.
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const appSrc = fs.readFileSync(path.join(root, 'js', 'app.js'), 'utf8');
const F = require(path.join(root, 'functions', 'fcf.js'));

const SANCIONS = JSON.parse(fs.readFileSync(
    path.join(__dirname, 'fixtures', 'fcf-sancions.json'), 'utf8'));
const SCORERS = JSON.parse(fs.readFileSync(
    path.join(__dirname, 'fixtures', 'fcf-goleadors.json'), 'utf8'));

const CLUB = 'Esquerra de l\'Eixample F.C.';
const LINK = 'https://www.fcf.cat/ca/competicio?temporadaId=22&grupId=58161881';

function grab(src, from, to) {
  const i = src.indexOf(from);
  const j = src.indexOf(to, i);
  assert.ok(i !== -1 && j !== -1, 'marker not found: ' + from);
  return src.slice(i, j);
}

const sanitize = (s) => String(s === undefined || s === null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

function makeTabs(opts) {
  opts = opts || {};
  const store = {fa_matches: JSON.stringify(opts.matches || [])};
  const fetched = [];
  const block = grab(appSrc,
      '  /* ═══════════════════════════════════════════════════════════\n' +
      '     Sancions and Top Scorers',
      '  function renderPlayerHome()');

  const factory = new Function(
      '_clubConfig', 'getCurrentCategory', 'getTeamLetters', 'fcfGrupId',
      'sanitize', 't', 'localStorage', 'currentPage', 'renderPage',
      'getSession', 'parseFcfSanctions', 'bansForJornada', 'parseFcfScorers',
      'isOurTeam', '_leagueCache', 'fetch', 'document',
      block +
      '\n return {renderSancions, renderScorers, sancionsBodyHtml,' +
      ' scorersTableHtml, scorersSortedRows, sancionsNextFixture,' +
      ' fcfOurTeamId, fcfSeasonId, _sancionsState, _scorersState};');

  return factory(
      opts.clubConfig === undefined ?
        {name: CLUB, categories: {amateur: {enabled: true, letters: ['A']}},
          fcfLinks: {'amateur-A': LINK}} : opts.clubConfig,
      () => opts.category || 'amateur',
      (cat) => {
        const c = ((opts.clubConfig || {}).categories || {})[cat];
        return (c && c.letters) ? c.letters : ['A'];
      },
      (u) => (/[?&]grupId=(\d+)/.exec(String(u || '')) || [])[1] || '',
      sanitize,
      (k) => k,
      {getItem: (k) => store[k] || null, setItem: () => {}},
      opts.currentPage || 'sancions',
      () => {},
      () => ({roles: ['staff']}),
      F.parseFcfSanctions,
      F.bansForJornada,
      F.parseFcfScorers,
      (name) => name === CLUB,
      opts.leagueCache || {},
      (u) => { fetched.push(u); return new Promise(() => {}); },
      {querySelectorAll: () => []},
  );
}

const fixture = (o) => Object.assign({
  id: 4119501, home: CLUB, away: 'CAN BUXERES, F.C.',
  date: '2099-09-19', time: '18:00', team: 'A', category: 'amateur',
  fcfActaId: '4119501', fcfJornada: 5, opponentTeamId: '33183',
}, o);

describe('renderSancions', () => {
  it('explains itself when the category has no FCF link', () => {
    /* Never a blank page. This is the state every club is in before a lead
       pastes a link, and it must say what to do about it. */
    const R = makeTabs({clubConfig: {name: CLUB,
      categories: {amateur: {enabled: true, letters: ['A']}}, fcfLinks: {}}});
    const html = R.renderSancions();
    assert.ok(html.includes('fcf.no_link_here'), html);
    assert.ok(!html.includes('sanc.all_title'), 'rendered a table with no data');
  });

  it('renders the archive, and asks for nothing twice', () => {
    const R = makeTabs();
    R.renderSancions();                       // kicks off the fetch
    const rows = F.parseFcfSanctions(SANCIONS);
    const html = R.sancionsBodyHtml(rows, 'amateur', 'A');
    assert.ok(html.includes('sanc.all_title'));
    assert.ok(html.includes('<table'), 'no table rendered');
  });

  it('NEVER lists a ruling against a club as a missing player', () => {
    /* 20 of the 48 rulings in the fixture are `tipo: equipo` — fines and
       procedural decisions. In the players' table they would read as men who
       are unavailable on Sunday. */
    const R = makeTabs();
    const rows = F.parseFcfSanctions(SANCIONS);
    const html = R.sancionsBodyHtml(rows, 'amateur', 'A');
    const players = html.slice(html.indexOf('sanc.all_title'),
        html.indexOf('sanc.club_title') === -1 ?
          html.length : html.indexOf('sanc.club_title'));
    const teamRuling = rows.filter((r) => r.isTeam)[0];
    assert.ok(teamRuling, 'the fixture has no club rulings');
    assert.ok(!players.includes(sanitize(teamRuling.reason).slice(0, 40)),
        'a club ruling appeared in the players table');
    assert.ok(html.includes('sanc.club_title'),
        'club rulings must still be shown, in their own labelled section');
  });

  it('shows BOTH sides of the next fixture', () => {
    const R = makeTabs({matches: [fixture()]});
    const rows = F.parseFcfSanctions(SANCIONS);
    const html = R.sancionsBodyHtml(rows, 'amateur', 'A');
    assert.ok(html.includes('sanc.next_title'));
    assert.ok(html.includes('sanc.ours'), 'our own side is missing');
    assert.ok(html.includes('CAN BUXERES, F.C.'), 'the rival side is missing');
  });

  it('says so when there is no upcoming official fixture', () => {
    // A club that has not imported its calendar has no jornada to ask about.
    const R = makeTabs({matches: []});
    const html = R.sancionsBodyHtml(F.parseFcfSanctions(SANCIONS), 'amateur', 'A');
    assert.ok(html.includes('sanc.no_fixture'), html.slice(0, 200));
  });

  it('picks the SOONEST upcoming official fixture, not a friendly', () => {
    const R = makeTabs({matches: [
      fixture({id: 1, date: '2099-11-01', fcfJornada: 9}),
      {id: 2, date: '2099-09-01', home: CLUB, away: 'A Friendly FC',
        team: 'A', category: 'amateur'},              // no fcfActaId
      fixture({id: 3, date: '2099-10-01', fcfJornada: 7}),
    ]});
    const next = R.sancionsNextFixture('amateur', 'A');
    assert.strictEqual(next.id, 3);
  });

  it('ignores fixtures that have already been played', () => {
    /* "Who is suspended for the next game" is a question about a game that
       has not happened. Without the date filter the answer is a jornada from
       last autumn, and the bans it lists were served months ago. */
    const R = makeTabs({matches: [
      fixture({id: 1, date: '2020-09-19', fcfJornada: 2}),
      fixture({id: 2, date: '2099-10-01', fcfJornada: 7}),
    ]});
    assert.strictEqual(R.sancionsNextFixture('amateur', 'A').id, 2);
  });

  it('and reports none at all when every fixture is in the past', () => {
    const R = makeTabs({matches: [fixture({id: 1, date: '2020-09-19'})]});
    assert.strictEqual(R.sancionsNextFixture('amateur', 'A'), null);
  });

  it('ignores a fixture the federation withdrew', () => {
    const R = makeTabs({matches: [
      fixture({id: 1, date: '2099-09-19', fcfRemoved: true}),
      fixture({id: 2, date: '2099-10-01', fcfJornada: 7}),
    ]});
    assert.strictEqual(R.sancionsNextFixture('amateur', 'A').id, 2);
  });

  it('ignores another squad\'s fixtures', () => {
    const R = makeTabs({matches: [fixture({id: 9, team: 'B'})]});
    assert.strictEqual(R.sancionsNextFixture('amateur', 'A'), null);
  });

  it('reads our own FCF id off the standings cache', () => {
    const R = makeTabs({leagueCache: {'league-amateur-A': [
      {club: 'X', teamId: '111', ours: false},
      {club: CLUB, teamId: '35410', ours: true},
    ]}});
    assert.strictEqual(R.fcfOurTeamId('amateur', 'A'), '35410');
    // No cache yet → '', and bansForJornada then shows EVERYONE rather than
    // nobody, which is the safer way to be wrong.
    assert.strictEqual(makeTabs().fcfOurTeamId('amateur', 'A'), '');
  });

  it('takes the season from the club\'s own pasted link', () => {
    assert.strictEqual(makeTabs().fcfSeasonId(), '22');
  });
});

describe('renderScorers', () => {
  it('asks the user to pick before fetching anything', () => {
    const R = makeTabs({currentPage: 'scorers'});
    const html = R.renderScorers();
    assert.ok(html.includes('sc.pick'), html.slice(0, 300));
    assert.ok(html.includes('data-sc="temporada"'));
    assert.ok(html.includes('data-sc="grup"'));
  });

  it('disables a level until the one above it is answered', () => {
    /* Picking a group before a division is meaningless, and an enabled but
       empty select reads as "there are none". */
    const R = makeTabs({currentPage: 'scorers'});
    const html = R.renderScorers();
    const grup = html.slice(html.indexOf('data-sc="competicio"'));
    assert.ok(/data-sc="competicio"[^>]*disabled/.test(html), 'division not disabled');
    assert.ok(/data-sc="grup"[^>]*disabled/.test(grup), 'group not disabled');
  });

  it('renders the table with the official figures', () => {
    const R = makeTabs({currentPage: 'scorers'});
    const rows = F.parseFcfScorers(SCORERS);
    const html = R.scorersTableHtml(rows);
    assert.ok(html.includes('sc.goals') && html.includes('sc.played'));
    assert.ok(html.includes('<strong>' + rows[0].goals + '</strong>'));
    // And says whose figures they are, since they are FCF's own.
    assert.ok(html.includes('sc.note'));
  });

  it('sorts, and flips', () => {
    const R = makeTabs({currentPage: 'scorers'});
    const rows = F.parseFcfScorers(SCORERS);
    R._scorersState.sortBy = 'goals';
    R._scorersState.sortDir = -1;
    const desc = R.scorersSortedRows(rows).map((r) => r.goals);
    assert.deepStrictEqual(desc, desc.slice().sort((a, b) => b - a));
    R._scorersState.sortDir = 1;
    const asc = R.scorersSortedRows(rows).map((r) => r.goals);
    assert.deepStrictEqual(asc, asc.slice().sort((a, b) => a - b));
  });

  it('sorts names alphabetically, not numerically', () => {
    const R = makeTabs({currentPage: 'scorers'});
    const rows = F.parseFcfScorers(SCORERS);
    R._scorersState.sortBy = 'player';
    R._scorersState.sortDir = 1;
    const names = R.scorersSortedRows(rows).map((r) => r.player);
    assert.deepStrictEqual(names, names.slice().sort((a, b) => a.localeCompare(b)));
  });

  it('does not mutate the rows it was given', () => {
    const R = makeTabs({currentPage: 'scorers'});
    const rows = F.parseFcfScorers(SCORERS);
    const before = rows.map((r) => r.rank);
    R._scorersState.sortBy = 'goals';
    R.scorersSortedRows(rows);
    assert.deepStrictEqual(rows.map((r) => r.rank), before);
  });
});

describe('nothing private, and nothing unescaped, reaches the HTML', () => {
  const XSS = '<img src=x onerror=alert(1)>';
  const DNI = '41566132A';

  /* `!includes('onerror=')` is the WRONG assertion and this repo has learned
     it before: a payload that survives as escaped TEXT still contains that
     substring, and these renderers emit their own `<img … onerror>` for a
     crest that fails to load. What must not appear is an unescaped TAG, so
     the legitimate crests are stripped by their exact markup first and the
     check is for a `<img` that the renderer did not write. */
  const withoutBadges = (html) =>
    html.replace(/<img src="https:\/\/files\.fcf\.cat\/[^"]*" class="sanc-badge" alt="" onerror="[^"]*">/g, '');
  const unescapedTag = (html) => /<img\s+src=x/.test(withoutBadges(html));

  it('a DNI in the payload never appears on screen', () => {
    const R = makeTabs({matches: [fixture()]});
    const sanc = F.parseFcfSanctions({'4': [{
      tipo: 'participante', jornada: '4', partidos_sancion: '1',
      participante_nombre: 'REAL, PERSON', codparticipante: '1',
      codequipo: '33183', nombre_equipo: 'CAN BUXERES, F.C.',
      licencia: DNI, ficha: DNI, motivo_sancion: 'x', articulo_salida: '336',
    }]});
    const html = R.sancionsBodyHtml(sanc, 'amateur', 'A');
    assert.ok(!html.includes(DNI), 'a DNI was rendered');
    const sc = R.scorersTableHtml(F.parseFcfScorers([{
      nombre_jugador: 'REAL, PERSON', codjugador: '1', codequipo: '1',
      nombre_equipo: 'X', goles: 3, penalti: 0, total: 9, licencia: DNI,
    }]));
    assert.ok(!sc.includes(DNI), 'a DNI was rendered');
  });

  it('escapes a player name, a club name and a reason', () => {
    const R = makeTabs({matches: [fixture()]});
    const sanc = F.parseFcfSanctions({'4': [{
      tipo: 'participante', jornada: '4', partidos_sancion: '1',
      participante_nombre: XSS, codparticipante: '1',
      codequipo: '1', nombre_equipo: XSS,
      motivo_sancion: XSS, articulo_salida: XSS,
    }]});
    const html = R.sancionsBodyHtml(sanc, 'amateur', 'A');
    assert.ok(!unescapedTag(html), 'an unescaped tag reached the HTML');
    assert.ok(html.includes('&lt;img'), 'the payload was dropped, not escaped');
  });

  it('escapes them in the scorers table too', () => {
    const R = makeTabs({currentPage: 'scorers'});
    const html = R.scorersTableHtml(F.parseFcfScorers([{
      nombre_jugador: XSS, nombre_equipo: XSS, codequipo: '1',
      goles: 1, penalti: 0, total: 1,
    }]));
    assert.ok(!unescapedTag(html), 'an unescaped tag reached the HTML');
    assert.ok(html.includes('&lt;img'), 'the payload was dropped, not escaped');
  });

  it('escapes the RIVAL name in the next-fixture heading', () => {
    const R = makeTabs({matches: [fixture({away: XSS, home: CLUB})]});
    const html = R.sancionsBodyHtml(F.parseFcfSanctions(SANCIONS), 'amateur', 'A');
    assert.ok(!unescapedTag(html), 'an unescaped rival name reached the HTML');
    assert.ok(html.includes('&lt;img'), 'the rival name was dropped, not escaped');
  });
});
