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
const F = require(path.join(root, 'js', 'utils.js'));

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
      ' fcfOurTeamId, fcfSeasonId, scZone, scClubCardHtml, _fcfClubs,' +
      ' bindFcfTabs,' +
      ' _sancionsState, _scorersState};');

  const api = factory(
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
      opts.document || {querySelectorAll: () => [], addEventListener: () => {}},
  );
  api._fetched = fetched;
  return api;
}

const fixture = (o) => Object.assign({
  id: 4119501, home: CLUB, away: 'CAN BUXERES, F.C.',
  date: '2099-09-19', time: '18:00', team: 'A', category: 'amateur',
  fcfActaId: '4119501', fcfJornada: 5, opponentTeamId: '33183',
}, o);

describe('every helper these tabs call exists IN THE BROWSER', () => {
  /* The bug this exists for: parseFcfSanctions, parseFcfScorers and
     bansForJornada were written in functions/fcf.js, which the browser never
     loads. Every request succeeded, the parser threw ReferenceError, and the
     catch reported it to the user as "could not load the standings".

     Nothing else could have caught it. Node's `require` reaches
     functions/fcf.js perfectly well, and the renderer tests above STUB these
     helpers by name — so both suites were green while the feature was dead
     on every real screen. The only honest check is against the files the
     browser is actually served. */
  const BROWSER_SRC = ['utils.js', 'app.js', 'db.js', 'shard.js', 'boards.js',
    'match-notes.js', 'push.js', 'firebase-config.js']
      .map((f) => {
        try {
          return fs.readFileSync(path.join(root, 'js', f), 'utf8');
        } catch (e) { return ''; }
      }).join('\n');

  const tabsBlock = grab(appSrc,
      '  /* ═══════════════════════════════════════════════════════════\n' +
      '     Sancions and Top Scorers',
      '  function renderPlayerHome()');

  it('the FCF helpers are declared in a file the browser loads', () => {
    ['parseFcfSanctions', 'parseFcfScorers', 'bansForJornada',
      'banCoversJornada', 'fcfGrupId'].forEach((fn) => {
      assert.ok(new RegExp('function\\s+' + fn + '\\s*\\(').test(BROWSER_SRC),
          fn + ' is not defined in any js/ file — the browser cannot see it, ' +
          'however well it works under require()');
    });
  });

  it('and NOT only in functions/, which is never served', () => {
    const server = fs.readFileSync(path.join(root, 'functions', 'fcf.js'), 'utf8');
    ['parseFcfSanctions', 'parseFcfScorers'].forEach((fn) => {
      assert.ok(!new RegExp('function\\s+' + fn + '\\s*\\(').test(server),
          fn + ' is still in functions/fcf.js as well — one definition, or ' +
          'the two drift');
    });
  });

  it('EVERY function these tabs call is reachable from the browser', () => {
    /* The general form, and the one that would actually have caught this.
       Naming the three known helpers is not enough — the next one will be
       called something else. So: every plain function call in the block must
       be declared in the block, declared somewhere in js/, or be a language
       or browser builtin. A call that resolves only under Node's require()
       fails here.

       Member calls (`x.map(`) are excluded: they resolve against a value,
       not a global, and this is about globals. */
    const code = ('/*' + tabsBlock).replace(/\/\*[\s\S]*?\*\//g, '')
        .split('\n').map((l) => l.replace(/\/\/.*$/, '')).join('\n');
    const BUILTIN = new Set(['JSON', 'Date', 'Promise', 'Object', 'String',
      'Number', 'Array', 'Math', 'parseInt', 'parseFloat', 'isFinite', 'isNaN',
      'encodeURIComponent', 'decodeURIComponent', 'fetch', 'setTimeout',
      'clearTimeout', 'requestAnimationFrame', 'console', 'RegExp', 'Set',
      'Map', 'Boolean', 'Error', 'if', 'for', 'while', 'switch', 'catch', 'return',
      'function', 'typeof', 'new', 'delete', 'else']);
    const local = new Set([...code.matchAll(/function\s+(\w+)\s*\(/g)].map((m) => m[1]));
    const called = new Set([...code.matchAll(/(?<![.\w$])([a-zA-Z_$][\w$]*)\s*\(/g)]
        .map((m) => m[1])
        .filter((n) => !BUILTIN.has(n) && !local.has(n)));
    assert.ok(called.size > 0, 'the block calls nothing at all?');
    called.forEach((fn) => {
      assert.ok(new RegExp('function\\s+' + fn + '\\s*\\(').test(BROWSER_SRC),
          fn + '() is called by the tabs but is declared in no js/ file — it ' +
          'will throw ReferenceError in the browser however well it resolves ' +
          'under require()');
    });
  });

  it('every FCF helper the tabs call is one of those', () => {
    /* Catches the NEXT one: any fcf-ish call added to this block has to be
       declared browser-side, or this fails the moment it is written.

       Comments are stripped first — the block's own header says both tabs
       "read through fcfApi()", and scanning prose finds a call that is not
       one. The slice BEGINS inside that header, so there is no opening
       delimiter for the stripper to match and one has to be prefixed.
       Functions the block declares itself are excluded the same way. */
    const code = ('/*' + tabsBlock).replace(/\/\*[\s\S]*?\*\//g, '')
        .split('\n').map((l) => l.replace(/\/\/.*$/, '')).join('\n');
    const local = new Set([...code.matchAll(/function\s+(\w+)\s*\(/g)].map((m) => m[1]));
    /* `(?<![.\w])` and not `\b`: a word boundary matches after a dot too, so
       `JSON.parse(` came back as a call to a global named `parse`. */
    const called = new Set([...code.matchAll(/(?<![.\w])((?:parse|bans|ban|fcf)[A-Za-z]+)\s*\(/g)]
        .map((m) => m[1]).filter((n) => !local.has(n)));
    assert.ok(called.size > 0, 'the block calls no FCF helpers at all?');
    called.forEach((fn) => {
      assert.ok(new RegExp('function\\s+' + fn + '\\s*\\(').test(BROWSER_SRC),
          fn + '() is called by the tabs but defined nowhere in js/');
    });
  });
});

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
  it('offers all four filters, three of them checkbox dropdowns', () => {
    /* The owner's ask, twice over: every filter takes several values and
       leaving one empty means all of it — and it is a DROPDOWN WITH CHECKS,
       not a <select multiple>. A native multi-select needs ctrl-click, shows
       four rows of a hundred, and on a phone loses the selection as often as
       it keeps it. Season stays single: every competition id is
       season-specific, so mixing seasons compares different competitions. */
    const R = makeTabs({currentPage: 'scorers'});
    const html = R.renderScorers();
    assert.ok(/data-sc="temporada"/.test(html), 'season picker missing');
    assert.ok(!/<select[^>]*multiple/.test(html),
        'a native multi-select is back');
    ['disciplina', 'competicio', 'grup'].forEach((f) => {
      assert.ok(html.includes('data-sc-open="' + f + '"'),
          f + ' has no dropdown button');
    });
    assert.ok(html.includes('sc.hint'), 'the empty-means-all rule is unexplained');
  });

  it('the panel opens on click, with a checkbox per option', () => {
    const R = makeTabs({currentPage: 'scorers'});
    const st = R._scorersState;
    st.opts.disciplina = [{value: '1', label: 'Futbol 11'},
      {value: '2', label: 'Futbol 7'}];
    assert.ok(!R.renderScorers().includes('sc-dd-panel'), 'panel open unasked');
    st.open = 'disciplina';
    const html = R.renderScorers();
    assert.ok(html.includes('sc-dd-panel'), 'panel did not open');
    assert.ok((html.match(/type="checkbox" data-sc-pick="disciplina"/g) || []).length === 2,
        'one checkbox per option');
    assert.ok(html.includes('data-sc-none="disciplina"'), 'no way to clear it');
  });

  it('the button says "all" when empty, the name when one, a count when more', () => {
    const R = makeTabs({currentPage: 'scorers'});
    const st = R._scorersState;
    st.opts.disciplina = [{value: '1', label: 'Futbol 11'},
      {value: '2', label: 'Futbol 7'}];
    assert.ok(R.renderScorers().includes('sc.all'));
    st.disciplina = ['1'];
    assert.ok(R.renderScorers().includes('Futbol 11'),
        'one choice should name it, not count it');
    st.disciplina = ['1', '2'];
    assert.ok(R.renderScorers().includes('sc.n_chosen'));
  });

  it('reads NOTHING while a panel is open', () => {
    /* The other half of "unresponsive". Every checkbox tick re-renders, and
       the render used to resolve a scope and fire a fetch — so picking four
       divisions meant four rounds of requests, three of them for a selection
       the user had not finished making. */
    const R = makeTabs({currentPage: 'scorers'});
    const st = R._scorersState;
    st.opts.disciplina = [{value: '1', label: 'F11'}];
    st.opts['comp_1_22'] = [{value: 'c1', label: 'X'}];
    st.opts.grup_c1 = [{value: 'g1', label: 'GRUP 1'}];
    st.open = 'grup';
    const html = R.renderScorers();
    /* Scorer READS specifically. Filling the filter lists themselves is
       fine and expected while picking — it is what puts options on screen. */
    const reads = R._fetched.filter((u) => u.indexOf('goleadores') !== -1);
    assert.strictEqual(reads.length, 0,
        'a group was read while the user was still picking: ' + reads.join(', '));
    assert.ok(html.includes('sc.picking'), 'no explanation of the wait: ' + html.slice(-300));
  });

  it('...and reads as soon as the panel closes', () => {
    const R = makeTabs({currentPage: 'scorers'});
    const st = R._scorersState;
    st.opts.disciplina = [{value: '1', label: 'F11'}];
    st.opts['comp_1_22'] = [{value: 'c1', label: 'X'}];
    st.opts.grup_c1 = [{value: 'g1', label: 'GRUP 1'}];
    st.open = '';
    R.renderScorers();
    const reads = R._fetched.filter((u) => u.indexOf('goleadores') !== -1);
    assert.ok(reads.length > 0, 'closing the panel did not read anything');
  });

  it('opening one panel closes the other', () => {
    // Two floating panels overlapping is a mess, and both are absolute.
    const R = makeTabs({currentPage: 'scorers'});
    const st = R._scorersState;
    st.opts.disciplina = [{value: '1', label: 'F11'}];
    st.opts.competicio = [{value: 'c1', label: 'X'}];
    st.open = 'disciplina';
    const html = R.renderScorers();
    assert.strictEqual((html.match(/sc-dd-panel/g) || []).length, 1,
        'more than one panel is open at once');
  });

  it('shows a bar that fills, not just a count', () => {
    /* The scope has to RESOLVE before the reading state is reachable — the
       waiting branch sits above it — so the tree is primed here. */
    const R = makeTabs({currentPage: 'scorers'});
    const st = R._scorersState;
    st.opts.disciplina = [{value: '1', label: 'F11'}];
    st.opts['comp_1_22'] = [{value: 'c1', label: 'X'}];
    st.opts.grup_c1 = [{value: 'g1', label: 'GRUP 1'}];
    st.loading = true;
    st.scope = new Array(20).fill({value: 'g', label: 'G'});
    st.progress = 5;
    const html = R.renderScorers();
    assert.ok(html.includes('sc.reading'), 'not in the reading state: ' + html.slice(0, 400));
    assert.ok(html.includes('sc-bar-fill'), 'no progress bar');
    assert.ok(/width:25%/.test(html), 'the bar does not reflect progress');
  });

  it('refuses to walk an absurd number of divisions', () => {
    /* "Every division of every discipline" is ~500 divisions and ~3000
       groups; the tree-walk alone is one request per division. The page says
       how wide the selection is instead of trying. */
    const R = makeTabs({currentPage: 'scorers'});
    const many = [];
    for (let i = 0; i < 200; i++) many.push(String(i));
    R._scorersState.competicio = many;
    R._scorersState.opts.disciplina = [{value: '1', label: 'F11'}];
    R._scorersState.opts['comp_1_22'] = [];
    const html = R.renderScorers();
    assert.ok(html.includes('sc.too_wide'), html.slice(0, 400));
  });

  it('asks before reading a large but legitimate selection', () => {
    const R = makeTabs({currentPage: 'scorers'});
    const st = R._scorersState;
    st.opts.disciplina = [{value: '1', label: 'F11'}];
    st.opts['comp_1_22'] = [{value: 'c1', label: 'X'}];
    const groups = [];
    for (let i = 0; i < 60; i++) groups.push({value: 'g' + i, label: 'G' + i});
    st.opts.grup_c1 = groups;
    const html = R.renderScorers();
    assert.ok(html.includes('sc.confirm'), 'no confirmation for 60 groups');
    assert.ok(html.includes('id="sc-go"'), 'no way to proceed');
    // ...and once confirmed it goes ahead.
    st.confirmed = true;
    assert.ok(!R.renderScorers().includes('sc.confirm'));
  });

  it('reads a small selection without asking', () => {
    const R = makeTabs({currentPage: 'scorers'});
    const st = R._scorersState;
    st.opts.disciplina = [{value: '1', label: 'F11'}];
    st.opts['comp_1_22'] = [{value: 'c1', label: 'X'}];
    st.opts.grup_c1 = [{value: 'g1', label: 'GRUP 1'}];
    const html = R.renderScorers();
    assert.ok(!html.includes('sc.confirm'), 'asked about a single group');
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

describe('the markup these tabs emit is actually styled', () => {
  /* v125 shipped the checkbox dropdown with NO stylesheet: the CSS append was
     chained behind a `node --check` that failed, `&&` short-circuited, and
     the rules were never written. The result rendered as a paragraph of run-
     together checkboxes — worse than the <select multiple> it replaced.

     A renderer test cannot catch that: the HTML was perfect. So this checks
     the other half — every class the tabs emit for LAYOUT has a rule in the
     stylesheet. */
  const css = fs.readFileSync(path.join(root, 'css', 'style.css'), 'utf8');

  const NEEDS_STYLE = [
    'sc-dd', 'sc-dd-btn', 'sc-dd-panel', 'sc-dd-opt', 'sc-dd-tools',
    'sc-dd-mini', 'sc-dd-caret', 'sc-dd-label',
    'sc-bar', 'sc-bar-fill',
    'sc-club-card', 'sc-club-bits', 'sc-club-note', 'sc-zone', 'sc-card-row',
    'sanc-tbl', 'sanc-who', 'sanc-why', 'sanc-split', 'sanc-side', 'fcf-empty',
  ];

  it('every layout class the tabs emit has a rule', () => {
    NEEDS_STYLE.forEach((cls) => {
      assert.ok(new RegExp('\\.' + cls + '[\\s,{:.]').test(css),
          '.' + cls + ' is emitted but has no CSS rule — it will render ' +
          'unstyled, which for a dropdown panel means a wall of text');
    });
  });

  it('the floating panel is positioned, and its card does not clip it', () => {
    /* Two rules, both load-bearing. Without `position:absolute` the panel
       shoves the table down the page; with the mobile block's
       `.card { overflow: hidden }` and no override it is clipped to a
       sliver. */
    assert.ok(/\.sc-dd-panel\s*\{[^}]*position:\s*absolute/.test(css),
        'the panel must float, not push the page down');
    assert.ok(/\.card\.sc-filters\s*\{[^}]*overflow:\s*visible/.test(css),
        'the filters card will clip the panel on mobile');
    assert.ok(/\.sc-dd\s*\{[^}]*position:\s*relative/.test(css),
        'an absolute panel with no positioned parent escapes its column');
  });

  it('an option is a row, not a run of inline text', () => {
    // The exact failure the screenshot showed.
    assert.ok(/\.sc-dd-opt\s*\{[^}]*display:\s*flex/.test(css),
        '.sc-dd-opt must lay each option out as its own row');
  });
});

describe('the filter panel dismisses itself', () => {
  /* Reported as "a bit unresponsive": the panel stayed open until you clicked
     its button again. These fire the REAL handlers the block registers — a
     document stub records them, and the test calls them with the kind of
     event a browser would deliver. It is the handler's decision being
     tested, not the browser's event plumbing. */
  function withDoc() {
    const listeners = {};
    const doc = {
      querySelectorAll: () => [],
      getElementById: () => null,
      addEventListener: (type, fn) => {
        (listeners[type] = listeners[type] || []).push(fn);
      },
    };
    const R = makeTabs({currentPage: 'scorers', document: doc});
    R.bindFcfTabs();
    return {R, fire: (type, ev) => (listeners[type] || []).forEach((f) => f(ev))};
  }

  it('closes on a click anywhere else', () => {
    const {R, fire} = withDoc();
    R._scorersState.open = 'disciplina';
    fire('click', {target: {closest: () => null}});
    assert.strictEqual(R._scorersState.open, '');
  });

  it('stays open when the click is INSIDE it', () => {
    // Ticking a second checkbox must not dismiss the panel.
    const {R, fire} = withDoc();
    R._scorersState.open = 'disciplina';
    fire('click', {target: {closest: (sel) => sel === '.sc-dd' ? {} : null}});
    assert.strictEqual(R._scorersState.open, 'disciplina');
  });

  it('closes on Escape', () => {
    const {R, fire} = withDoc();
    R._scorersState.open = 'grup';
    fire('keydown', {key: 'Escape'});
    assert.strictEqual(R._scorersState.open, '');
  });

  it('ignores other keys', () => {
    const {R, fire} = withDoc();
    R._scorersState.open = 'grup';
    fire('keydown', {key: 'a'});
    assert.strictEqual(R._scorersState.open, 'grup');
  });

  it('binds the document listeners ONCE, not per render', () => {
    /* bindFcfTabs runs after every render. Re-registering there would stack
       a fresh listener on every keystroke of every filter. */
    const listeners = {};
    const doc = {
      querySelectorAll: () => [], getElementById: () => null,
      addEventListener: (type, fn) => {
        (listeners[type] = listeners[type] || []).push(fn);
      },
    };
    const R = makeTabs({currentPage: 'scorers', document: doc});
    R.bindFcfTabs(); R.bindFcfTabs(); R.bindFcfTabs();
    assert.strictEqual((listeners.click || []).length, 1,
        'the dismiss listener stacked up');
    assert.strictEqual((listeners.keydown || []).length, 1);
  });
});

describe('the club card — geography, and the only contact that exists', () => {
  /* ⚠ There is NO player contact information in any FCF payload: no email,
     no phone, nothing. The only player-level identifier the federation
     publishes is `licencia`, a DNI/NIE, which this app drops at the parse
     boundary. What does exist, published openly by the federation, is the
     CLUB's own card — and that also carries the closest thing to
     "Barcelonès / Vallès" that the data has. There is no comarca field
     anywhere; FCF divides Catalonia into five DELEGACIONS and records the
     club's town beside it. */
  const INFO = {NOMBRE: 'L\'ESQUERRA DE L\'EIXAMPLE, F.C.',
    DELEGACION: 'DELEGACIÓ BARCELONA', LOCALIDAD: 'Barcelona',
    TELEFONO_1: '610700068', EMAIL: 'a@b.test', WEB: 'www.example.test'};

  const withClub = () => {
    const R = makeTabs({currentPage: 'scorers'});
    R._fcfClubs['2776'] = INFO;
    return R;
  };

  it('reduces the delegation to something readable', () => {
    const R = withClub();
    assert.strictEqual(R.scZone(INFO), 'Barcelona');
    assert.strictEqual(R.scZone(Object.assign({}, INFO, {LOCALIDAD: 'Roses',
      DELEGACION: 'DELEGACIÓ GIRONA'})), 'Roses · Girona');
    assert.strictEqual(R.scZone(null), '');
  });

  it('adds the zona column only once a club has loaded', () => {
    const R = makeTabs({currentPage: 'scorers'});
    const rows = F.parseFcfScorers(SCORERS).slice(0, 3);
    rows.forEach((r) => { r.clubId = '2776'; });
    assert.ok(!R.scorersTableHtml(rows).includes('sc.zone'),
        'an empty column was rendered');
    R._fcfClubs['2776'] = INFO;
    const html = R.scorersTableHtml(rows);
    assert.ok(html.includes('sc.zone') && html.includes('Barcelona'));
  });

  it('opens the contact card under the row it belongs to', () => {
    const R = withClub();
    const rows = F.parseFcfScorers(SCORERS).slice(0, 2);
    rows.forEach((r) => { r.clubId = '2776'; });
    assert.ok(!R.scorersTableHtml(rows).includes('sc-club-card'), 'card open unasked');
    R._scorersState.openClub = '2776';
    const html = R.scorersTableHtml(rows);
    assert.ok(html.includes('sc-club-card'));
    assert.ok(html.includes('tel:610700068') && html.includes('mailto:a@b.test'));
    assert.ok(html.includes('https://www.example.test'), 'a bare domain needs a scheme');
  });

  it('says plainly that these are the CLUB\'s details, not a player\'s', () => {
    const R = withClub();
    assert.ok(R.scClubCardHtml(INFO).includes('sc.club_note'));
  });

  it('renders nothing rather than an empty card', () => {
    const R = withClub();
    assert.strictEqual(R.scClubCardHtml(null), '');
    assert.strictEqual(R.scClubCardHtml({}), '');
    assert.strictEqual(R.scClubCardHtml({NOMBRE: 'X'}), '',
        'a club with no contact details at all should render nothing');
  });

  it('escapes everything in the card', () => {
    const R = withClub();
    const html = R.scClubCardHtml({NOMBRE: '<img src=x onerror=alert(1)>',
      LOCALIDAD: '<img src=x>', EMAIL: '"><img src=x>', WEB: 'javascript:alert(1)'});
    assert.ok(!/<img\s+src=x/.test(html), 'unescaped: ' + html);
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
