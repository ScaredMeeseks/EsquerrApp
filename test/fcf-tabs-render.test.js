/* The Sancions and Top Scorers RENDERERS, run for real.
 *
 * Same grab() convention as match-notes-render.test.js, and for the same
 * reason: these are ~700 lines of string building that nothing else
 * executes, and the failure mode of one mistyped identifier is a BLANK PAGE
 * for every coach in the club, discovered by a human.
 *
 * What this pins, beyond "it parses":
 *   - a club with no FCF link gets an explanation, never an empty screen;
 *   - a ruling against a CLUB never reaches the page, nor any count on it
 *     (the owner dropped them at v273);
 *   - both sides of the next fixture are shown, ours and theirs, with the
 *     matches still to serve;
 *   - the sort actually sorts, and flips;
 *   - no DNI and no unescaped name ever reaches the HTML.
 *
 * And, since v273, the interactions are DRIVEN: the pages are mounted into
 * jsdom with the real stylesheet and the real stdSelect, and clicked. A
 * source assertion tests intent; three rounds of a dropdown that never worked
 * past a green suite is why these exist.
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const {JSDOM} = require('jsdom');

const root = path.join(__dirname, '..');
const appSrc = fs.readFileSync(path.join(root, 'js', 'app.js'), 'utf8');
const F = require(path.join(root, 'js', 'utils.js'));
const {readCss} = require('./read-css');

const SANCIONS = JSON.parse(fs.readFileSync(
    path.join(__dirname, 'fixtures', 'fcf-sancions.json'), 'utf8'));
const SCORERS = JSON.parse(fs.readFileSync(
    path.join(__dirname, 'fixtures', 'fcf-goleadors.json'), 'utf8'));

const CLUB = 'Esquerra de l\'Eixample F.C.';
const LINK = 'https://www.fcf.cat/ca/competicio?temporadaId=22&grupId=58161881';
const LINK_B = 'https://www.fcf.cat/ca/competicio?temporadaId=22&grupId=58169999';

function grab(src, from, to) {
  const i = src.indexOf(from);
  const j = src.indexOf(to, i);
  assert.ok(i !== -1 && j !== -1, 'marker not found: ' + from);
  return src.slice(i, j);
}

const sanitize = (s) => String(s === undefined || s === null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

/* ⚠ The COLLABORATORS are stubbed and nothing else. A name the block should
   declare for itself must stay out of this list, so that losing its
   declaration throws here instead of in a coach's browser. If this factory
   starts throwing a ReferenceError, adding the name below is the wrong fix
   unless the function genuinely lives outside the block. */
function makeTabs(opts) {
  opts = opts || {};
  const store = {fa_matches: JSON.stringify(opts.matches || [])};
  const fetched = [];
  const block = grab(appSrc,
      '  /* ═══════════════════════════════════════════════════════════\n' +
      '     Sancions and Top Scorers',
      '  function renderPlayerHome()');
  /* The app's own dropdown, lifted whole: the Sancions phone switch IS a
     stdSelect, and a stub would test a dropdown that does not exist. */
  const stdSel = grab(appSrc, '  function stdSelect(o) {',
      '  /**\n   * A place, linked to its map');
  /* The shared category bar, which on Sancions is the page's only squad
     control — so it is lifted and run with the tabs, not trusted. */
  const bar = grab(appSrc, '  function renderCategoryBar() {', '  // ---------- Club helpers') +
    grab(appSrc, '  /* `only` (v274', '  /**\n   * Does this row belong');

  const factory = new Function(
      '_clubConfig', 'getCurrentCategory', 'getCurrentSquad', 'getTeamLetters',
      'fcfGrupId', 'sanitize', 't', 'tv', 'localStorage', 'currentPage',
      'renderPage', 'getSession', 'parseFcfSanctions', 'bansForJornada',
      'parseFcfScorers', 'isOurTeam', 'getClubName', 'sameClubName',
      'clubMonogram', 'safeHttpUrl', 'CATEGORY_LABELS', 'tDay', 'tMonth',
      'tDateShort', '_leagueCache', 'fetch', 'document', 'window',
      'getVisibleCategories',
      block + stdSel + bar +
      '\n return {renderCategoryBar, renderSancions, renderScorers, sancionsBodyHtml,' +
      ' scorersTableHtml, scorersSortedRows, sancionsNextFixture,' +
      ' fcfOurTeamId, fcfSeasonId, scZone, scClubCardHtml, _fcfClubs,' +
      ' bindFcfTabs, sancRemaining, sancActive, _fcfApiCache,' +
      ' _sancionsState, _scorersState};');

  const clubConfig = opts.clubConfig === undefined ?
    {name: CLUB, categories: {amateur: {enabled: true, letters: ['A']}},
      fcfLinks: {'amateur-A': LINK}} : opts.clubConfig;
  const api = factory(
      clubConfig,
      () => (opts.category === undefined ? 'amateur' : opts.category),
      () => opts.squad || 'all',
      (cat) => {
        const c = ((clubConfig || {}).categories || {})[cat];
        return (c && c.letters) ? c.letters : ['A'];
      },
      F.fcfGrupId,
      sanitize,
      (k) => k,
      (k) => k,
      {getItem: (k) => store[k] || null, setItem: () => {}},
      opts.currentPage || 'sancions',
      (...a) => (opts.renderPage || (() => {}))(...a),
      () => ({roles: ['staff']}),
      F.parseFcfSanctions,
      F.bansForJornada,
      F.parseFcfScorers,
      (name) => name === CLUB,
      () => CLUB,
      F.sameClubName,
      (n) => String(n || '').slice(0, 2).toUpperCase() || '?',
      F.safeHttpUrl,
      {amateur: 'Amateur', juvenil: 'Juvenil'},
      (i) => 'day' + i,
      (i) => 'month' + i,
      (d) => 'short ' + d,
      opts.leagueCache || {},
      (u) => { fetched.push(u); return new Promise(() => {}); },
      opts.document || {querySelectorAll: () => [], addEventListener: () => {},
        getElementById: () => null},
      opts.window || {addEventListener: () => {}},
      () => Object.keys((clubConfig || {}).categories || {}),
  );
  api._fetched = fetched;
  return api;
}

const fixture = (o) => Object.assign({
  id: 4119501, home: CLUB, away: 'CAN BUXERES, F.C.',
  date: '2099-09-19', time: '18:00', team: 'A', category: 'amateur',
  fcfActaId: '4119501', fcfJornada: 6, opponentTeamId: '33183',
}, o);

/* One ruling in the payload's own shape, so every test goes through the
   real parser. Defaults: one of OURS, issued at J5, for two matches. */
const ruling = (o) => Object.assign({
  tipo: 'participante', jornada: '5', partidos_sancion: '2',
  participante_nombre: 'MARTÍ SOLANES, ORIOL', codparticipante: '1',
  codequipo: '35410', nombre_equipo: CLUB,
  motivo_sancion: 'Doble amonestació', articulo_salida: '336',
}, o);
const parse = (list) => F.parseFcfSanctions({x: list});
const OURS_CACHE = {'league-amateur-A': [{club: CLUB, teamId: '35410', ours: true}]};

/** HTML → a document to query. No stylesheet: this is for STRUCTURE. */
const docOf = (html) => new JSDOM(html).window.document;
const texts = (doc, sel) => [...doc.querySelectorAll(sel)].map((n) => n.textContent.trim());

/**
 * A page mounted for real: the real stylesheet, the real stdSelect, and a
 * renderPage that does what the app's does — rewrite the host, re-bind.
 */
function mountTabs(page, opts) {
  const css = readCss();
  const dom = new JSDOM('<style>' + css + '</style><div id="host"></div>',
      {pretendToBeVisual: true});
  const win = dom.window;
  const host = win.document.getElementById('host');
  const m = {win, doc: win.document, renders: 0};
  m.render = () => {
    m.renders++;
    host.innerHTML = page === 'sancions' ? m.R.renderSancions() : m.R.renderScorers();
    m.R.bindFcfTabs();
  };
  m.R = makeTabs(Object.assign({}, opts, {
    currentPage: page, document: win.document, window: win, renderPage: m.render,
  }));
  m.click = (el) => el.dispatchEvent(new win.MouseEvent('click', {bubbles: true}));
  m.$ = (sel) => win.document.querySelector(sel);
  m.$$ = (sel) => [...win.document.querySelectorAll(sel)];
  return m;
}

/** Sancions with its rows already read — the fetch in the test never resolves. */
function mountSancions(rows, opts) {
  const m = mountTabs('sancions', opts);
  const st = m.R._sancionsState;
  m.R.renderSancions();                    // sets the key and starts the read
  st.rows = rows;
  st.loading = false;
  m.render();
  return m;
}

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

  /* ⚠ The end marker is the INICI banner, not `function renderPlayerHome()`.
     v230 put the Inici helpers between the two, and they are not part of
     these tabs — sweeping them in made the call scan below read the string
     `var(--pp-ok)` inside a donut's inline style as a call to a global
     named `var`. The bound has to name what actually follows this region. */
  const tabsBlock = grab(appSrc,
      '  /* ═══════════════════════════════════════════════════════════\n' +
      '     Sancions and Top Scorers',
      '     INICI — the two landing pages');

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

  it('asks for a category under "Totes", rather than claiming there is no link', () => {
    const R = makeTabs({category: ''});
    const html = R.renderSancions();
    assert.ok(html.includes('sanc.pick_cat'), html);
    assert.ok(!html.includes('fcf.no_link_here'), 'blamed a link that exists');
    assert.strictEqual(R._fetched.length, 0, 'read a group with no category chosen');
  });

  it('reads the squad the CATEGORY BAR names, not a picker of its own', () => {
    /* v273 deleted the page's private letter picker: the bar above it already
       offers the squad, and the two disagreed. */
    const club = {name: CLUB, categories: {amateur: {enabled: true, letters: ['A', 'B']}},
      fcfLinks: {'amateur-A': LINK, 'amateur-B': LINK_B}};
    const b = makeTabs({clubConfig: club, squad: 'B'});
    const htmlB = b.renderSancions();
    assert.ok(b._fetched.some((u) => u.includes('58169999')), 'did not read B: ' + b._fetched);
    assert.ok(!/data-sanc-letter/.test(htmlB), 'the private squad picker is back');
    // "All squads" has no single group — the first linked squad stands in.
    const all = makeTabs({clubConfig: club, squad: 'all'});
    all.renderSancions();
    assert.ok(all._fetched.some((u) => u.includes('58161881')), 'did not fall back to A');
  });

  describe('the category bar is the page\'s squad control', () => {
    /* v273 deleted the page's own A/B picker in favour of the shared bar —
       which returns '' for a one-category club. Esquerra is one (Amateur A
       and B), so the page could only ever show A. Reported by the owner the
       day it shipped. */
    const ONE_CAT = {name: CLUB, categories: {amateur: {enabled: true, letters: ['A', 'B', 'C']}},
      fcfLinks: {'amateur-A': LINK, 'amateur-B': LINK_B}};
    const chips = (html) => {
      const doc = docOf(html);
      return {
        cats: texts(doc, '.cat-bar-btn'),
        letters: [...doc.querySelectorAll('[data-squad-letter]')].map((b) => b.dataset.squadLetter),
        lit: texts(doc, '.cat-bar-letter.roster-team-btn-active'),
      };
    };

    it('shows for a ONE-category club, with a chip per LINKED squad', () => {
      const c = chips(makeTabs({clubConfig: ONE_CAT}).renderCategoryBar());
      assert.deepStrictEqual(c.cats, ['Amateur'], 'no category to see');
      assert.deepStrictEqual(c.letters, ['A', 'B'],
          'C has no FCF link, and "all" names no group');
    });

    it('lights the squad the page is actually reading', () => {
      // "all" is not a squad Sancions can read; it reads A, so A is lit.
      assert.deepStrictEqual(chips(makeTabs({clubConfig: ONE_CAT, squad: 'all'})
          .renderCategoryBar()).lit, ['A']);
      const b = makeTabs({clubConfig: ONE_CAT, squad: 'B'});
      assert.deepStrictEqual(chips(b.renderCategoryBar()).lit, ['B']);
      b.renderSancions();
      assert.ok(b._fetched.some((u) => u.includes('58169999')), 'lit B but read another group');
    });

    it('offers no "Totes" category, which names no group', () => {
      const two = Object.assign({}, ONE_CAT, {categories: {amateur: {enabled: true, letters: ['A', 'B']},
        juvenil: {enabled: true, letters: ['A']}}});
      const html = makeTabs({clubConfig: two}).renderCategoryBar();
      assert.ok(!html.includes('data-cat=""'), '"Totes" is offered on Sancions');
      assert.deepStrictEqual(chips(html).cats, ['Amateur', 'Juvenil']);
    });

    it('leaves every OTHER page exactly as it was', () => {
      assert.strictEqual(makeTabs({clubConfig: ONE_CAT, currentPage: 'calendar'})
          .renderCategoryBar(), '', 'a one-category club grew a bar on other pages');
      const two = Object.assign({}, ONE_CAT, {categories: {amateur: {enabled: true, letters: ['A', 'B']},
        juvenil: {enabled: true, letters: ['A']}}});
      const html = makeTabs({clubConfig: two, currentPage: 'calendar'}).renderCategoryBar();
      assert.ok(html.includes('data-cat=""') && html.includes('data-squad-letter="all"'),
          'another page lost its "Totes" or its "all" chip');
    });
  });

  it('renders the archive, and asks for nothing twice', () => {
    const R = makeTabs();
    R.renderSancions();                       // kicks off the fetch
    R.renderSancions();
    assert.strictEqual(R._fetched.length, 1, 'fetched twice: ' + R._fetched.join(' | '));
    const doc = docOf(R.sancionsBodyHtml(F.parseFcfSanctions(SANCIONS), 'amateur', 'A'));
    assert.ok(doc.querySelector('.sanc-all .sanc-th'), 'no archive header');
  });

  it('NEVER shows a ruling against a club, nor counts one', () => {
    /* The owner's decision (v273): fines, closed grounds and resumed matches
       are gone from the page. And gone BEFORE counting — a club ruling that
       somehow carried matches must not inflate "Vigents al grup". */
    const R = makeTabs({matches: [fixture()], leagueCache: OURS_CACHE});
    const rows = parse([
      ruling({}),
      ruling({tipo: 'equipo', participante_nombre: null, partidos_sancion: '3',
        motivo_sancion: 'Tancament del camp per incidents'}),
    ]);
    R._sancionsState.filter = 'all';
    const html = R.sancionsBodyHtml(rows, 'amateur', 'A');
    assert.ok(!html.includes('Tancament del camp'), 'a club ruling reached the page');
    const doc = docOf(html);
    assert.strictEqual(doc.querySelectorAll('.sanc-row').length, 1);
    const figs = texts(doc, '.fcf-fig-v');
    assert.deepStrictEqual(figs, ['1', '0', '1'], 'a club ruling was counted: ' + figs);
    // The real fixture has 20 of them; none may surface.
    const teamRuling = F.parseFcfSanctions(SANCIONS).filter((r) => r.isTeam)[0];
    assert.ok(teamRuling, 'the fixture has no club rulings');
    const full = R.sancionsBodyHtml(F.parseFcfSanctions(SANCIONS), 'amateur', 'A');
    assert.ok(!full.includes(sanitize(teamRuling.reason).slice(0, 40)));
  });

  it('shows BOTH sides of the next fixture', () => {
    const R = makeTabs({matches: [fixture()]});
    const html = R.sancionsBodyHtml(F.parseFcfSanctions(SANCIONS), 'amateur', 'A');
    const doc = docOf(html);
    assert.ok(doc.querySelector('.sanc-card-ours'), 'our own side is missing');
    assert.ok(doc.querySelector('.sanc-card-rival .sanc-card-name').textContent
        .includes('CAN BUXERES, F.C.'), 'the rival side is missing');
  });

  it('counts the matches STILL TO SERVE, and prints the window', () => {
    /* At J6: a J5 ban for 2 covers J6–J7, two to go. A J4 ban for 3 covers
       J5–J7 and has served one, so it is TWO to go, not three — the figure a
       coach reads as "how many more games without him". */
    const R = makeTabs({matches: [fixture()], leagueCache: OURS_CACHE});
    const rows = parse([
      ruling({participante_nombre: 'A, A'}),
      ruling({participante_nombre: 'B, B', jornada: '4', partidos_sancion: '3'}),
      ruling({participante_nombre: 'C, C', jornada: '5', partidos_sancion: '4',
        codequipo: '33183', nombre_equipo: 'CAN BUXERES, F.C.'}),
    ]);
    const doc = docOf(R.sancionsBodyHtml(rows, 'amateur', 'A'));
    const ours = [...doc.querySelectorAll('.sanc-card-ours .sanc-ban')].map((b) => [
      b.querySelector('.sanc-ban-p').textContent, b.querySelector('.sanc-left').textContent,
      b.querySelector('.sanc-ban-w').textContent]);
    assert.deepStrictEqual(ours.sort(), [['A, A', '2', 'J6–J7'], ['B, B', '2', 'J5–J7']]);
    const theirs = [...doc.querySelectorAll('.sanc-card-rival .sanc-ban')].map((b) => [
      b.querySelector('.sanc-ban-p').textContent, b.querySelector('.sanc-left').textContent]);
    assert.deepStrictEqual(theirs, [['C, C', '4']]);
    assert.strictEqual(R.sancRemaining({jornada: 4, matches: 3}, 6), 2);
    assert.strictEqual(R.sancRemaining({jornada: 5, matches: 1}, 6), 1);
  });

  it('the hero figures are the cards\' own counts', () => {
    const R = makeTabs({matches: [fixture()], leagueCache: OURS_CACHE});
    const rows = parse([
      ruling({participante_nombre: 'A, A'}),
      ruling({participante_nombre: 'C, C', codequipo: '33183',
        nombre_equipo: 'CAN BUXERES, F.C.'}),
      ruling({participante_nombre: 'D, D', codequipo: '777', nombre_equipo: 'ALTRE, C.F.'}),
      ruling({participante_nombre: 'E, E', jornada: '1', partidos_sancion: '1'}),
    ]);
    const doc = docOf(R.sancionsBodyHtml(rows, 'amateur', 'A'));
    const [ours, rival, active] = texts(doc, '.fcf-fig-v');
    assert.strictEqual(ours, String(doc.querySelectorAll('.sanc-card-ours .sanc-ban').length));
    assert.strictEqual(rival, String(doc.querySelectorAll('.sanc-card-rival .sanc-ban').length));
    assert.strictEqual(active, '3', 'Vigents counts the three live bans, not the served one');
    assert.ok(doc.querySelector('.fcf-fig-hot'), 'our non-zero figure is not red');
  });

  it('finds OUR rows by name when the standings have not loaded', () => {
    /* Until v273 an unknown team id meant "everyone is ours" — the card
       headed NOSALTRES listed the whole group. The name is what the standings
       themselves use to find us. */
    const R = makeTabs({matches: [fixture()]});           // no league cache
    const rows = parse([
      ruling({participante_nombre: 'OURS, O', codequipo: '1', nombre_equipo: CLUB + ' A'}),
      ruling({participante_nombre: 'THEIRS, T', codequipo: '33183',
        nombre_equipo: 'CAN BUXERES, F.C.'}),
    ]);
    const doc = docOf(R.sancionsBodyHtml(rows, 'amateur', 'A'));
    assert.deepStrictEqual(texts(doc, '.sanc-card-ours .sanc-ban-p'), ['OURS, O']);
    assert.deepStrictEqual(texts(doc, '.sanc-card-rival .sanc-ban-p'), ['THEIRS, T']);
  });

  it('says so when a side has nobody out', () => {
    const R = makeTabs({matches: [fixture()], leagueCache: OURS_CACHE});
    const doc = docOf(R.sancionsBodyHtml(parse([ruling({jornada: '1', partidos_sancion: '1'})]),
        'amateur', 'A'));
    assert.deepStrictEqual(texts(doc, '.sanc-clear'), ['sanc.ours_clear', 'sanc.rival_clear']);
  });

  it('Vigent turns Complida exactly when the last round is gone', () => {
    // At J6: a J5 one-match ban covers J6 → Vigent. A J4 one-match ban
    // covered J5 → Complida.
    const R = makeTabs({matches: [fixture()], leagueCache: OURS_CACHE});
    R._sancionsState.filter = 'all';
    const rows = parse([
      ruling({participante_nombre: 'LIVE, L', partidos_sancion: '1'}),
      ruling({participante_nombre: 'DONE, D', jornada: '4', partidos_sancion: '1'}),
    ]);
    const doc = docOf(R.sancionsBodyHtml(rows, 'amateur', 'A'));
    const state = {};
    doc.querySelectorAll('.sanc-row').forEach((r) => {
      state[r.querySelector('.sanc-who-p').textContent] =
        r.querySelector('.fcf-pill').classList.contains('fcf-pill-on');
    });
    assert.deepStrictEqual(state, {'LIVE, L': true, 'DONE, D': false});
  });

  it('says so when there is no upcoming official fixture', () => {
    // A club that has not imported its calendar has no jornada to ask about.
    const R = makeTabs({matches: []});
    const doc = docOf(R.sancionsBodyHtml(F.parseFcfSanctions(SANCIONS), 'amateur', 'A'));
    assert.ok(doc.querySelector('.sanc-next').textContent.includes('sanc.no_fixture'));
    assert.ok(!doc.querySelector('.sanc-card'), 'drew cards for a fixture that does not exist');
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
    assert.strictEqual(makeTabs().fcfOurTeamId('amateur', 'A'), '');
  });

  it('takes the season from the club\'s own pasted link', () => {
    assert.strictEqual(makeTabs().fcfSeasonId(), '22');
  });

  it('turns the federation\'s <br> into a space, not visible markup', () => {
    const R = makeTabs({matches: [fixture()], leagueCache: OURS_CACHE});
    const doc = docOf(R.sancionsBodyHtml(parse([ruling({
      motivo_sancion: 'Primera part<br>Segona part'})]), 'amateur', 'A'));
    assert.strictEqual(doc.querySelector('.sanc-ban-r').textContent, 'Primera part Segona part');
  });
});

describe('Sancions — driven', () => {
  const ROWS = () => parse([
    ruling({participante_nombre: 'OURS LIVE, A'}),
    ruling({participante_nombre: 'THEIRS LIVE, B', codequipo: '33183',
      nombre_equipo: 'CAN BUXERES, F.C.', partidos_sancion: '1'}),
    ruling({participante_nombre: 'OTHER DONE, C', codequipo: '777',
      nombre_equipo: 'ALTRE, C.F.', jornada: '2', partidos_sancion: '1'}),
    ruling({participante_nombre: 'OURS DONE, D', jornada: '1', partidos_sancion: '1'}),
  ]);

  it('the three chips filter the archive: Vigents, Totes, Només nosaltres', () => {
    const m = mountSancions(ROWS(), {matches: [fixture()], leagueCache: OURS_CACHE});
    const names = () => m.$$('.sanc-row .sanc-who-p').map((n) => n.textContent).sort();
    assert.deepStrictEqual(names(), ['OURS LIVE, A', 'THEIRS LIVE, B'], 'Vigents is the default');
    m.click(m.$('[data-sanc-filter="all"]'));
    assert.strictEqual(names().length, 4);
    assert.ok(m.$('[data-sanc-filter="all"]').classList.contains('fcf-chip-on'), 'chip not lit');
    m.click(m.$('[data-sanc-filter="ours"]'));
    assert.deepStrictEqual(names(), ['OURS DONE, D', 'OURS LIVE, A']);
    // …and our rows carry the wash wherever they appear.
    assert.strictEqual(m.$$('.sanc-row-ours').length, 2);
  });

  it('the foot counts what the filter shows, out of all of it', () => {
    const m = mountSancions(ROWS(), {matches: [fixture()], leagueCache: OURS_CACHE});
    // tv() is the identity here, so the key names which sentence was chosen:
    // two rows showing is the plural, one is the singular.
    assert.strictEqual(m.$('.sanc-foot').textContent, 'sanc.foot_n');
    const one = mountSancions(parse([ruling({})]), {matches: [fixture()], leagueCache: OURS_CACHE});
    assert.strictEqual(one.$('.sanc-foot').textContent, 'sanc.foot_1');
  });

  it('the phone switch is the app\'s stdSelect, and it swaps the section by CLASS', () => {
    /* Both sections are always in the DOM; the root's class picks the one a
       phone paints. Never `[hidden]` — see std-select.test.js for why. */
    const m = mountSancions(ROWS(), {matches: [fixture()], leagueCache: OURS_CACHE});
    const page = () => m.$('.sanc-page');
    assert.ok(page().classList.contains('sanc-on-next'));
    assert.ok(m.$('.sanc-next') && m.$('.sanc-all'), 'a section is missing from the DOM');
    const sel = m.$('.std-sel[data-std-sel="sanc-section"]');
    assert.ok(sel, 'the switch is not a stdSelect');
    m.click(sel.querySelector('.std-sel-t'));
    assert.ok(m.$('.std-sel[data-std-sel="sanc-section"]').classList.contains('std-sel-open'),
        'the switch did not open');
    m.click(m.$('.std-sel[data-std-sel="sanc-section"] .std-sel-o[data-v="all"]'));
    assert.ok(page().classList.contains('sanc-on-all'), 'the section did not change');
    assert.strictEqual(m.$('.std-sel[data-std-sel="sanc-section"] .std-sel-l').textContent,
        'sanc.all_title');
  });

  it('each section in the switch carries its count', () => {
    const m = mountSancions(ROWS(), {matches: [fixture()], leagueCache: OURS_CACHE});
    const notes = m.$$('.std-sel[data-std-sel="sanc-section"] .std-sel-note')
        .map((n) => n.textContent);
    assert.deepStrictEqual(notes, ['2', '4'], 'bans at the next fixture, rulings in the group');
  });

  it('and the stylesheet hides the other section on a phone only', () => {
    const css = readCss().replace(/\/\*[\s\S]*?\*\//g, '');
    const phone = css.slice(css.indexOf('.sanc-on-next .sanc-all'));
    const media = css.lastIndexOf('@media', css.indexOf('.sanc-on-next .sanc-all'));
    assert.ok(/max-width:\s*700px/.test(css.slice(media, media + 40)),
        'the section swap is not inside the phone breakpoint');
    assert.ok(/\.sanc-on-next \.sanc-all,\s*\.sanc-on-all \.sanc-next\s*\{\s*display:\s*none/
        .test(phone), 'no rule hides the unchosen section');
  });
});

describe('renderScorers', () => {
  it('offers all four filters as checkbox dropdowns, the season single', () => {
    /* The owner's ask, twice over: every filter takes several values and
       leaving one empty means all of it — and it is a DROPDOWN WITH CHECKS,
       not a <select multiple>. Season stays single: every competition id is
       season-specific, so mixing seasons compares different competitions.
       Since v273 the season is the same control, in single mode. */
    const R = makeTabs({currentPage: 'scorers'});
    const html = R.renderScorers();
    assert.ok(!/<select/.test(html), 'a native select is back');
    ['temporada', 'disciplina', 'competicio', 'grup'].forEach((f) => {
      assert.ok(html.includes('data-sc-open="' + f + '"'), f + ' has no dropdown button');
    });
    assert.ok(html.includes('sc.hint'), 'the empty-means-all rule is unexplained');
    R._scorersState.open = 'temporada';
    R._scorersState.opts.temporada = [{value: '22', label: '2026-27'}];
    assert.ok(!R.renderScorers().includes('data-sc-none="temporada"'),
        'a season can be cleared — "no season" is not a scope');
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
    assert.ok(html.includes('sc.dd_none'), 'the empty panel does not say "all included"');
  });

  it('the button says "all" when empty, the name when one, a count when more', () => {
    const R = makeTabs({currentPage: 'scorers'});
    const st = R._scorersState;
    st.opts.disciplina = [{value: '1', label: 'Futbol 11'},
      {value: '2', label: 'Futbol 7'}];
    const btn = () => docOf(R.renderScorers())
        .querySelector('[data-sc-open="disciplina"] .sc-dd-v').textContent;
    assert.strictEqual(btn(), 'sc.all');
    st.disciplina = ['1'];
    assert.strictEqual(btn(), 'Futbol 11', 'one choice should name it, not count it');
    st.disciplina = ['1', '2'];
    assert.strictEqual(btn(), 'sc.n_chosen');
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

  it('an open panel puts the table away rather than showing stale numbers', () => {
    const R = makeTabs({currentPage: 'scorers'});
    const st = R._scorersState;
    st.opts.disciplina = [{value: '1', label: 'F11'}];
    st.opts['comp_1_22'] = [{value: 'c1', label: 'X'}];
    st.opts.grup_c1 = [{value: 'g1', label: 'GRUP 1'}];
    st.rows = F.parseFcfScorers(SCORERS);
    st.scope = [{value: 'g1', label: 'GRUP 1'}];
    assert.ok(R.renderScorers().includes('sc-tbl'), 'no table with the panel shut');
    st.open = 'grup';
    const html = R.renderScorers();
    assert.ok(!html.includes('sc-tbl') && html.includes('sc.picking'));
    st.open = '';
    assert.ok(R.renderScorers().includes('sc-tbl'), 'closing without a change lost the rows');
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
    const doc = docOf(R.scorersTableHtml(rows));
    assert.deepStrictEqual(texts(doc, '.sc-th .sc-sort').map((s) => s.replace(/ [▾▴]$/, '')),
        ['sc.player', 'sc.goals', 'sc.pens', 'sc.played'], 'the four sortable heads');
    assert.strictEqual(doc.querySelector('.sc-goals-v').textContent, String(rows[0].goals));
    // And says whose figures they are, since they are FCF's own.
    assert.ok(doc.querySelector('.sc-foot').textContent.includes('sc.note'));
  });

  it('the hero counts what was read: groups, players, goals', () => {
    const R = makeTabs({currentPage: 'scorers'});
    const st = R._scorersState;
    st.opts.disciplina = [{value: '1', label: 'F11'}];
    st.opts['comp_1_22'] = [{value: 'c1', label: 'X'}];
    st.opts.grup_c1 = [{value: 'g1', label: 'GRUP 1'}];
    const rows = F.parseFcfScorers(SCORERS);
    assert.deepStrictEqual(texts(docOf(R.renderScorers()), '.fcf-fig-v'), ['—', '—', '—'],
        'figures before anything was read');
    st.rows = rows;
    st.loading = false;            // the stub's read never resolves
    st.scope = [{value: 'g1', label: 'GRUP 1'}];
    const goals = rows.reduce((n, r) => n + r.goals, 0);
    assert.deepStrictEqual(texts(docOf(R.renderScorers()), '.fcf-fig-v'),
        ['1', String(rows.length), String(goals)]);
  });

  it('washes OUR club\'s rows, whatever squad letter FCF gives it', () => {
    const R = makeTabs({currentPage: 'scorers'});
    const rows = F.parseFcfScorers([
      {nombre_jugador: 'OURS', codequipo: '1', nombre_equipo: CLUB + ' A', goles: 5, total: 5},
      {nombre_jugador: 'THEIRS', codequipo: '2', nombre_equipo: 'CAN BUXERES, F.C.', goles: 4, total: 5},
    ]);
    const doc = docOf(R.scorersTableHtml(rows));
    assert.deepStrictEqual(texts(doc, '.sc-row-ours .sc-player-n'), ['OURS']);
  });

  it('a scorer FCF publishes without a name reads as a dash, not a blank row', () => {
    const R = makeTabs({currentPage: 'scorers'});
    const doc = docOf(R.scorersTableHtml(F.parseFcfScorers([
      {nombre_jugador: null, codequipo: '1', nombre_equipo: 'SAN LORENZO CATALUNYA', goles: 2, total: 1},
    ])));
    assert.strictEqual(doc.querySelector('.sc-player-n').textContent, '—');
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

describe('Golejadors — driven', () => {
  /** A resolved one-group scope, so the page is past "waiting". */
  function primed(m) {
    const st = m.R._scorersState;
    st.opts.temporada = [{value: '22', label: '2026-27'}, {value: '21', label: '2025-26'}];
    st.opts.disciplina = [{value: '1', label: 'Futbol 11'}, {value: '2', label: 'Futbol 7'}];
    st.opts['comp_1_22'] = [{value: 'c1', label: 'Quarta Catalana'}];
    st.opts['comp_2_22'] = [];
    st.opts.grup_c1 = [{value: 'g1', label: 'Grup 3'}];
    return st;
  }
  const reads = (m) => m.R._fetched.filter((u) => u.includes('goleadores')).length;

  it('ticking a box keeps the panel open; a click outside closes it and reads', () => {
    const m = mountTabs('scorers');
    primed(m);
    m.R._scorersState.open = 'disciplina';
    m.render();
    const before = reads(m);
    const box = m.$('[data-sc-pick="disciplina"][value="1"]');
    box.checked = true;
    box.dispatchEvent(new m.win.Event('change', {bubbles: true}));
    assert.deepStrictEqual(m.R._scorersState.disciplina, ['1']);
    assert.strictEqual(m.R._scorersState.open, 'disciplina', 'the tick closed the panel');
    assert.strictEqual(reads(m), before, 'a tick started a read');
    m.click(m.$('.fcf-hero'));
    assert.strictEqual(m.R._scorersState.open, '');
    assert.ok(reads(m) > before, 'closing did not read');
  });

  it('the season REPLACES on a tick, and cannot be un-ticked to nothing', () => {
    const m = mountTabs('scorers');
    const st = primed(m);
    st.temporada = '22';
    st.disciplina = ['1'];
    st.open = 'temporada';
    m.render();
    const other = m.$('[data-sc-pick="temporada"][value="21"]');
    other.checked = true;
    other.dispatchEvent(new m.win.Event('change', {bubbles: true}));
    assert.strictEqual(st.temporada, '21', 'the season is not a single value');
    assert.deepStrictEqual(st.disciplina, [], 'a new season kept a stale discipline');
    const cur = m.$('[data-sc-pick="temporada"][value="21"]');
    cur.checked = false;
    cur.dispatchEvent(new m.win.Event('change', {bubbles: true}));
    assert.strictEqual(st.temporada, '21', 'un-ticking emptied the season');
  });

  it('the phone sheet holds the ONLY copy of the pickers, and nothing reads while it is open', () => {
    const m = mountTabs('scorers');
    primed(m);
    m.render();
    // That render began a read the stub never finishes; start from rest.
    m.R._scorersState.loading = false;
    m.R._fetched.length = 0;
    m.click(m.$('[data-sc-sheet="open"]'));
    assert.ok(m.R._scorersState.sheetOpen, 'the sheet did not open');
    assert.strictEqual(m.$$('[data-sc-open="grup"]').length, 1, 'two copies of a picker');
    assert.ok(m.$('.sc-sheet [data-sc-open="grup"]'), 'the pickers are not in the sheet');
    // Open a picker inside the sheet, tick, close it — still inside the sheet.
    m.click(m.$('.sc-sheet [data-sc-open="disciplina"]'));
    assert.ok(m.$('.sc-sheet .sc-dd-panel'), 'the accordion did not open');
    m.click(m.$('.sc-sheet [data-sc-open="disciplina"]'));
    assert.ok(m.R._scorersState.sheetOpen, 'closing a picker closed the sheet');
    assert.strictEqual(reads(m), 0, 'read while the sheet was open');
    assert.ok(m.$('.sc-body').textContent.includes('sc.picking'));
    m.click(m.$('[data-sc-sheet="close"]'));
    assert.ok(!m.R._scorersState.sheetOpen && !m.$('.sc-sheet'));
    assert.ok(reads(m) > 0, '"Tanca i llegeix" did not read');
  });

  it('Escape shuts the innermost thing first: the picker, then the sheet', () => {
    const m = mountTabs('scorers');
    const st = primed(m);
    st.sheetOpen = true;
    st.open = 'grup';
    m.render();
    m.doc.dispatchEvent(new m.win.KeyboardEvent('keydown', {key: 'Escape'}));
    assert.deepStrictEqual([st.open, st.sheetOpen], ['', true]);
    m.doc.dispatchEvent(new m.win.KeyboardEvent('keydown', {key: 'Escape'}));
    assert.strictEqual(st.sheetOpen, false);
  });

  it('a club card opens under ITS row — two rows of one club are two cards', () => {
    /* Keyed by club, as it was until v273, opening one row's card opened it
       under every row of that club. */
    const m = mountTabs('scorers');
    const st = primed(m);
    m.R._fcfClubs['2776'] = {NOMBRE: 'CLUB X', TELEFONO_1: '600000000',
      DELEGACION: 'DELEGACIÓ BARCELONA', LOCALIDAD: 'Barcelona'};
    const rows = F.parseFcfScorers(SCORERS).slice(0, 3);
    rows.forEach((r) => { r.clubId = '2776'; });
    st.rows = rows;
    st.scope = [{value: 'g1', label: 'Grup 3'}];
    m.render();
    const clubCells = m.$$('[data-sc-club]');
    assert.strictEqual(clubCells.length, 3);
    m.click(clubCells[1]);
    const withCard = m.$$('.sc-row').map((r) => !!r.querySelector('.sc-club-card'));
    assert.deepStrictEqual(withCard, [false, true, false]);
    assert.ok(m.$$('.sc-club-n')[1].classList.contains('sc-club-n-on'), 'the name is not marked');
    m.click(m.$$('[data-sc-club]')[1]);
    assert.strictEqual(m.$$('.sc-club-card').length, 0, 'a second click did not close it');
  });

  it('on a desktop, clicking the row outside the club cell does nothing', () => {
    const m = mountTabs('scorers');
    const st = primed(m);
    const rows = F.parseFcfScorers(SCORERS).slice(0, 1);
    rows[0].clubId = '2776';
    st.rows = rows;
    st.scope = [{value: 'g1', label: 'Grup 3'}];
    m.render();
    m.click(m.$('.sc-player-n'));
    assert.strictEqual(st.openClub, '', 'the player name opened a club card');
  });

  it('sorting by a head flips on the second click, and shuts the open card', () => {
    const m = mountTabs('scorers');
    const st = primed(m);
    st.rows = F.parseFcfScorers(SCORERS);
    st.scope = [{value: 'g1', label: 'Grup 3'}];
    st.openClub = 'x#0';
    m.render();
    m.click(m.$('.sc-th [data-sc-sort="played"]'));
    assert.deepStrictEqual([st.sortBy, st.sortDir, st.openClub], ['played', -1, '']);
    m.click(m.$('.sc-th [data-sc-sort="played"]'));
    assert.strictEqual(st.sortDir, 1);
    assert.ok(m.$('.sc-th [data-sc-sort="played"]').textContent.endsWith('▴'));
    // The phone's chips drive the same state.
    m.click(m.$('.sc-sorts [data-sc-sort="player"]'));
    assert.deepStrictEqual([st.sortBy, st.sortDir], ['player', 1]);
  });
});

describe('the markup these tabs emit is actually styled', () => {
  /* v125 shipped the checkbox dropdown with NO stylesheet: the CSS append was
     chained behind a `node --check` that failed, `&&` short-circuited, and
     the rules were never written. The result rendered as a paragraph of run-
     together checkboxes — worse than the <select multiple> it replaced.

     A renderer test cannot catch that: the HTML was perfect. So this checks
     the other half. Since v273 the list is not hand-kept: every `fcf-`,
     `sanc-` and `sc-` class the pages actually EMIT, in every state below,
     must have a rule — a hand list is only as good as the last person to
     remember it. */
  const css = readCss();
  const HOOKS = new Set(['sanc-page', 'sc-page', 'sanc-tbl', 'sc-tbl', 'fcf-crest-m']);

  function everyState() {
    const out = [];
    const R = makeTabs({matches: [fixture()], leagueCache: OURS_CACHE, currentPage: 'scorers'});
    R._sancionsState.filter = 'all';
    out.push(R.sancionsBodyHtml(F.parseFcfSanctions(SANCIONS), 'amateur', 'A'));
    out.push(R.sancionsBodyHtml(parse([ruling({})]), 'amateur', 'A'));
    out.push(makeTabs({matches: []}).sancionsBodyHtml([], 'amateur', 'A'));
    const st = R._scorersState;
    st.opts.temporada = [{value: '22', label: '2026-27'}];
    st.opts.disciplina = [{value: '1', label: 'F11'}];
    st.opts['comp_1_22'] = [{value: 'c1', label: 'X'}];
    st.opts.grup_c1 = [{value: 'g1', label: 'G1'}, {value: 'g2', label: 'G2'}];
    st.disciplina = ['1'];
    st.open = 'disciplina';
    out.push(R.renderScorers());
    st.open = '';
    st.sheetOpen = true;
    st.open = 'grup';
    out.push(R.renderScorers());
    st.sheetOpen = false;
    st.open = '';
    st.loading = true;
    st.scope = [{value: 'g1'}];
    out.push(R.renderScorers());
    st.loading = false;
    const rows = F.parseFcfScorers(SCORERS).slice(0, 4);
    rows.forEach((r, i) => { r.clubId = '2776'; r.groupLabel = 'G' + (i % 2); });
    rows[0].teamName = CLUB;
    R._fcfClubs['2776'] = {NOMBRE: 'X', TELEFONO_1: '1', LOCALIDAD: 'Roses',
      DELEGACION: 'DELEGACIÓ GIRONA'};
    st.rows = rows;
    st.openClub = '2776#0';
    out.push(R.renderScorers());
    return out.join('\n');
  }

  it('every class the tabs emit has a rule', () => {
    const emitted = new Set();
    [...everyState().matchAll(/class="([^"]*)"/g)].forEach((m) => {
      m[1].split(/\s+/).filter((c) => /^(fcf|sanc|sc)-/.test(c)).forEach((c) => emitted.add(c));
    });
    assert.ok(emitted.size > 60, 'the states rendered almost nothing: ' + emitted.size);
    const missing = [...emitted].filter((c) => !HOOKS.has(c) &&
        !new RegExp('\\.' + c + '(?![\\w-])').test(css));
    assert.deepStrictEqual(missing, [], 'emitted but unstyled — for a dropdown panel that ' +
        'means a wall of text');
  });

  it('the floating panel is positioned, and nothing between it and the page clips it', () => {
    /* Without `position:absolute` the panel shoves the table down the page;
       without a positioned parent it escapes its column; and any overflow
       other than visible on the band or the page clips it to a sliver — the
       v125 `.card { overflow:hidden }` trap, which is why this used to name
       a `.card.sc-filters` override. There is no card any more. */
    assert.ok(/\.sc-dd-panel\s*\{[^}]*position:\s*absolute/.test(css),
        'the panel must float, not push the page down');
    assert.ok(/\.sc-dd\s*\{[^}]*position:\s*relative/.test(css),
        'an absolute panel with no positioned parent escapes its column');
    assert.ok(/\.sc-filters\s*\{[^}]*position:\s*relative[^}]*z-index/.test(css),
        'the band must stack above the table the panel floats over');
    ['sc-filters', 'sc-dd-row', 'sc-dd', 'fcf-page'].forEach((c) => {
      const rules = css.match(new RegExp('\\.' + c + '\\s*\\{[^}]*\\}', 'g')) || [];
      rules.forEach((r) => assert.ok(!/overflow(-y|-x)?:\s*(hidden|auto|scroll|clip)/.test(r),
          '.' + c + ' clips the floating panel: ' + r));
    });
  });

  it('an option is a row, not a run of inline text', () => {
    // The exact failure the screenshot showed.
    assert.ok(/\.sc-dd-opt\s*\{[^}]*display:\s*flex/.test(css),
        '.sc-dd-opt must lay each option out as its own row');
  });

  it('the checkbox is drawn, and the real input is still there to be clicked', () => {
    const R = makeTabs({currentPage: 'scorers'});
    R._scorersState.opts.disciplina = [{value: '1', label: 'F11'}];
    R._scorersState.open = 'disciplina';
    const doc = docOf(R.renderScorers());
    const opt = doc.querySelector('.sc-dd-opt');
    assert.strictEqual(opt.tagName, 'LABEL', 'the row is not the input\'s label');
    assert.ok(opt.querySelector('input[type="checkbox"] + .sc-dd-box'),
        'the drawn box must follow the input for :checked + to reach it');
    assert.ok(/\.sc-dd-opt input:checked \+ \.sc-dd-box\s*\{/.test(css), 'nothing ticks the box');
    /* The BOX itself, not merely a rule that mentions it: a `:checked +`
       rule paints a tick into a box that, without this, has no size and no
       border — an empty span, and an option that looks unselectable. */
    assert.ok(/(^|\})\s*\.sc-dd-box\s*\{[^}]*width:\s*15px[^}]*height:\s*15px[^}]*border:/.test(css),
        'the unticked box is not drawn');
    assert.ok(/\.sc-dd-opt input\s*\{[^}]*opacity:\s*0/.test(css),
        'the native checkbox shows beside the drawn one');
  });

  it('the frame switch is by class, with a rule for each frame', () => {
    assert.ok(/@media \(min-width: 701px\) \{ \.fcf-page \.fcf-phone \{ display: none !important; \} \}/
        .test(css), 'the phone pieces show on a desktop');
    assert.ok(/@media \(max-width: 700px\) \{ \.fcf-page \.fcf-desk \{ display: none !important; \} \}/
        .test(css), 'the desktop pieces show on a phone');
  });

  it('both roots sit in the dashboard like every other paper page', () => {
    const raw = css.replace(/\/\*[\s\S]*?\*\//g, '');
    // Anywhere in the selector list — its position is Pissarres' business.
    const geo = /([^{}]*)\{\s*margin:\s*-1rem -2rem -2rem;\s*\}/.exec(raw);
    assert.ok(geo && /\.fcf-page(?![\w-])/.test(geo[1]),
        '.fcf-page is not in the shared geometry rule');
    assert.ok(/\.fcf-hero\s*\{[^}]*padding:\s*34px 40px 26px/.test(raw),
        '.fcf-hero is not the shared header band');
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
    return {R, listeners, fire: (type, ev) => (listeners[type] || []).forEach((f) => f(ev))};
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

  it('the sheet stays open for a click inside it, and closes for one outside', () => {
    const {R, fire} = withDoc();
    R._scorersState.sheetOpen = true;
    fire('click', {target: {closest: (sel) => sel === '.sc-sheet' ? {} : null}});
    assert.strictEqual(R._scorersState.sheetOpen, true);
    fire('click', {target: {closest: () => null}});
    assert.strictEqual(R._scorersState.sheetOpen, false);
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
       a fresh listener on every keystroke of every filter. Counted against
       the first call rather than as "1": the Sancions switch is a stdSelect,
       and stdSelect's own close-all is a (once-only) document listener too. */
    const {R, listeners} = withDoc();
    const after1 = {click: (listeners.click || []).length,
      keydown: (listeners.keydown || []).length};
    R.bindFcfTabs(); R.bindFcfTabs();
    assert.strictEqual((listeners.click || []).length, after1.click,
        'the dismiss listener stacked up');
    assert.strictEqual((listeners.keydown || []).length, after1.keydown);
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
    R._scorersState.openClub = '2776#0';
    const html = R.scorersTableHtml(rows);
    assert.strictEqual((html.match(/sc-club-card/g) || []).length, 1, 'one card, one row');
    assert.ok(html.includes('tel:610700068') && html.includes('mailto:a@b.test'));
    assert.ok(html.includes('https://www.example.test'), 'a bare domain needs a scheme');
  });

  it('names the delegation and the town, as the handoff does', () => {
    const R = withClub();
    const doc = docOf(R.scClubCardHtml(Object.assign({}, INFO,
        {LOCALIDAD: 'Roses', DELEGACION: 'DELEGACIÓ GIRONA'})));
    assert.strictEqual(doc.querySelector('.sc-club-zone').textContent, 'sc.delegacio · Roses');
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
    html.replace(/<img src="https:\/\/files\.fcf\.cat\/[^"]*" class="fcf-crest-img" alt="" onerror="this\.remove\(\)">/g, '');
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

  it('escapes a player name, a club name and a reason — in the cards AND the archive', () => {
    const R = makeTabs({matches: [fixture({fcfJornada: 5})]});
    R._sancionsState.filter = 'all';
    const sanc = F.parseFcfSanctions({'4': [{
      tipo: 'participante', jornada: '4', partidos_sancion: '1',
      participante_nombre: XSS, codparticipante: '1',
      codequipo: '33183', nombre_equipo: XSS,
      motivo_sancion: XSS, articulo_salida: XSS,
      escudo: '"><img src=x onerror=alert(1)>',
    }]});
    const html = R.sancionsBodyHtml(sanc, 'amateur', 'A');
    assert.ok(docOf(html).querySelector('.sanc-card-rival .sanc-ban'),
        'the payload never reached a card, so the card was not tested');
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

  it('escapes the RIVAL name and the ground in the fixture line', () => {
    const R = makeTabs({matches: [fixture({away: XSS, home: CLUB, location: XSS})]});
    const html = R.sancionsBodyHtml(F.parseFcfSanctions(SANCIONS), 'amateur', 'A');
    assert.ok(!unescapedTag(html), 'an unescaped rival name reached the HTML');
    assert.ok(html.includes('&lt;img'), 'the rival name was dropped, not escaped');
  });

  it('the source link is the club\'s own http(s) link, or nothing', () => {
    const bad = {name: CLUB, categories: {amateur: {enabled: true, letters: ['A']}},
      fcfLinks: {'amateur-A': 'javascript:alert(1)//?grupId=58161881'}};
    const html = makeTabs({clubConfig: bad}).sancionsBodyHtml([], 'amateur', 'A');
    assert.ok(!/href="javascript:/i.test(html), 'a javascript: link reached an href');
    const good = makeTabs().sancionsBodyHtml([], 'amateur', 'A');
    assert.ok(docOf(good).querySelector('.sanc-src-a').getAttribute('href') === LINK);
  });
});
