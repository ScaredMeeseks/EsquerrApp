/* The FCF glue inside js/app.js, run for real.
 *
 * Sliced out with the grab() convention from match-notes-render.test.js and
 * executed over stubs, for the same reason: this block is the only thing
 * standing between a club lead's pasted link and an empty standings table,
 * and its failure mode is silent. The August-2026 outage is the proof — a
 * dead feed rendered exactly like a division that had not kicked off, and
 * nobody noticed for weeks.
 *
 * WHAT IS NOT TESTED HERE, deliberately: renderOpponentDatalists(),
 * markOpponentMatch() and refreshLeagueTables() all read and write a live
 * DOM — closest(), dataset, innerHTML on a <tbody>. There is no jsdom in this
 * suite, and a hand-rolled document stub would only assert that the stub
 * behaves the way the test author imagined. Those three are checked by hand
 * in a browser; see HANDOFF. What IS covered is everything that decides WHAT
 * they would render.
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const appSrc = fs.readFileSync(path.join(root, 'js', 'app.js'), 'utf8');
const U = require(path.join(root, 'js', 'utils.js'));

function grab(src, from, to, label) {
  const i = src.indexOf(from);
  const j = src.indexOf(to, i);
  assert.ok(i !== -1 && j !== -1, 'marker not found in ' + label + ': ' + from);
  return src.slice(i, j);
}

const CLUB = 'L\'ESQUERRA DE L\'EIXAMPLE, F.C.';
const LINK = 'https://www.fcf.cat/ca/competicio?temporadaId=22' +
  '&disciplinaId=19308233&competicioId=58161869&grupId=58161881' +
  '&tab=classificacio';

const PRESEASON = JSON.parse(fs.readFileSync(
    path.join(__dirname, 'fixtures', 'fcf-preseason.json'), 'utf8'));

const sanitize = (s) => String(s === undefined || s === null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

/* The FCF region plus opponentInputHtml, which lives with the matchday rows
   it is called from. Both are run in one scope so the <datalist> id the input
   declares and the one renderOpponentDatalists() looks up cannot drift. */
function makeFcf(opts) {
  opts = opts || {};
  const store = Object.assign({}, opts.store);
  const fetched = [];

  const region = grab(appSrc, '  // #region FCF League Standings',
      '  function renderPlayerHome()', 'js/app.js');
  const inputFn = grab(appSrc, '  function opponentInputHtml(',
      '  function matchdayRowHtml(', 'js/app.js');

  const factory = new Function(
      'localStorage', '_clubConfig', 'getCurrentCategory', 'CATEGORY_LABELS',
      'getClubName', 'sanitize', 't', 'getTeamLetters', 'document', 'fetch',
      'parseFcfClassificacio', 'fcfGrupId', 'requestAnimationFrame',
      region + '\n' + inputFn +
      '\n return {getActiveFcfLeagues, fcfTeamsFor, fcfLookup,' +
        ' fcfMatchFields, leagueMessageHtml, buildLeagueSnippet,' +
        ' opponentInputHtml, fetchFcfGroup, mdRowSquad};');

  const api = factory(
      {getItem: (k) => (k in store ? store[k] : null),
        setItem: (k, v) => { store[k] = v; }},
      opts.clubConfig || null,
      () => opts.currentCategory || '',
      {amateur: 'Amateur', juvenil: 'Juvenil'},
      () => CLUB,
      sanitize,
      (k) => k,
      (cat) => {
        const c = (opts.clubConfig && opts.clubConfig.categories || {})[cat];
        return (c && c.letters && c.letters.length) ? c.letters : ['A'];
      },
      // Nothing in the covered surface reaches the DOM; if something starts
      // to, this throws loudly instead of silently returning undefined.
      {getElementById: () => { throw new Error('DOM touched'); },
        querySelectorAll: () => { throw new Error('DOM touched'); }},
      (url) => { fetched.push(url); return new Promise(() => {}); },
      U.parseFcfClassificacio,
      U.fcfGrupId,
      (f) => f,
  );
  api._fetched = fetched;
  api._store = store;
  return api;
}

/* A cache exactly as the app writes it: the parsed rows, keyed by league id. */
function cacheWith(key, json) {
  const rows = U.parseFcfClassificacio(json, CLUB);
  return {fa_league_cache_v2: JSON.stringify({['league-' + key]: rows})};
}

const CONFIG = {
  name: CLUB,
  categories: {amateur: {enabled: true, letters: ['A', 'B']}},
  fcfLinks: {'amateur-A': LINK},
};

describe('getActiveFcfLeagues — which links are live', () => {
  it('carries the pasted link through untouched', () => {
    const F = makeFcf({clubConfig: CONFIG});
    const leagues = F.getActiveFcfLeagues();
    assert.strictEqual(leagues.length, 1);
    assert.strictEqual(leagues[0].id, 'league-amateur-A');
    assert.strictEqual(leagues[0].url, LINK);
  });

  it('a club with no links has no leagues, and asks for nothing', () => {
    const F = makeFcf({clubConfig: {name: CLUB, categories: {}, fcfLinks: {}}});
    assert.deepStrictEqual(F.getActiveFcfLeagues(), []);
    assert.deepStrictEqual(F._fetched, []);
  });
});

describe('fcfTeamsFor — the opponent list', () => {
  it('reads the standings cache, not a second endpoint', () => {
    const F = makeFcf({clubConfig: CONFIG, store: cacheWith('amateur-A', PRESEASON)});
    const teams = F.fcfTeamsFor('amateur', 'A');
    assert.strictEqual(teams.length, 16);
    assert.ok(teams.some((x) => x.name === CLUB));
    teams.forEach((x) => assert.ok(x.teamId, x.name + ' has no teamId'));
    // No request at all: the payload the standings needed already had this.
    assert.deepStrictEqual(F._fetched, []);
  });

  it('fetches the group by grupId when the cache is cold', () => {
    const F = makeFcf({clubConfig: CONFIG});
    assert.deepStrictEqual(F.fcfTeamsFor('amateur', 'A'), []);
    assert.strictEqual(F._fetched.length, 1);
    assert.ok(F._fetched[0].endsWith('?grupId=58161881'), F._fetched[0]);
  });

  it('does not stampede: many rows in one render make one request', () => {
    const F = makeFcf({clubConfig: CONFIG});
    F.fcfTeamsFor('amateur', 'A');
    F.fcfTeamsFor('amateur', 'A');
    F.fcfTeamsFor('amateur', 'A');
    assert.strictEqual(F._fetched.length, 1);
  });

  it('an unconfigured squad asks for nothing', () => {
    // amateur-B exists as a squad but has no FCF link.
    const F = makeFcf({clubConfig: CONFIG});
    assert.deepStrictEqual(F.fcfTeamsFor('amateur', 'B'), []);
    assert.deepStrictEqual(F._fetched, []);
  });

  it('a pre-rebuild link is never fetched', () => {
    /* The whole point of validating the link: the old address 404s, so
       spending a request on it every five minutes buys nothing. */
    const F = makeFcf({clubConfig: Object.assign({}, CONFIG, {fcfLinks: {
      'amateur-A': 'https://www.fcf.cat/classificacio/2025-2026/futbol-11/' +
        'quarta-catalana/grup-10',
    }})});
    assert.deepStrictEqual(F.fcfTeamsFor('amateur', 'A'), []);
    assert.deepStrictEqual(F._fetched, []);
  });

  it('returns [] rather than throwing with no category or letter', () => {
    const F = makeFcf({clubConfig: CONFIG});
    assert.deepStrictEqual(F.fcfTeamsFor('', 'A'), []);
    assert.deepStrictEqual(F.fcfTeamsFor('amateur', ''), []);
  });
});

describe('fcfLookup / fcfMatchFields — which fixtures earn a federation id', () => {
  const F = () => makeFcf(
      {clubConfig: CONFIG, store: cacheWith('amateur-A', PRESEASON)});

  it('an exact name gets the id and the badge', () => {
    const got = F().fcfMatchFields('amateur', 'A', 'CAN BUXERES, F.C.');
    assert.strictEqual(got.opponentTeamId, '33183');
    assert.ok(got.opponentBadge.startsWith(U.FCF_BADGE_BASE), got.opponentBadge);
  });

  it('case and surrounding whitespace do not matter', () => {
    const got = F().fcfMatchFields('amateur', 'A', '  can buxeres, f.c.  ');
    assert.strictEqual(got.opponentTeamId, '33183');
  });

  it('a NEARLY-right name gets nothing — an id is a claim of certainty', () => {
    /* normTeamName() would happily collapse this onto the real club. It is
       tuned for a leg SUGGESTION that a coach confirms; storing an id off the
       back of it would make findFirstLeg trust a guess. */
    assert.strictEqual(
        U.normTeamName('F.C. Can Buxeres'), U.normTeamName('CAN BUXERES, F.C.'),
        'precondition: these two normalise together');
    assert.deepStrictEqual(F().fcfMatchFields('amateur', 'A', 'F.C. Can Buxeres'), {});
  });

  it('punctuation is not forgiven either — exact means exact', () => {
    /* Pins the strictness itself, not just "it is stricter than
       normTeamName". The completion inserts the federation's own string, so
       the path that earns an id is the one where the coach picked from the
       list; anything typed out by hand falls back to the name pairing it has
       always had, and that is the intended cost. */
    assert.deepStrictEqual(F().fcfMatchFields('amateur', 'A', 'Can Buxeres FC'), {});
    assert.deepStrictEqual(F().fcfMatchFields('amateur', 'A', 'CAN BUXERES F.C.'), {});
  });

  it('a club outside the group gets nothing, not an empty id', () => {
    assert.deepStrictEqual(F().fcfMatchFields('amateur', 'A', 'Sants'), {});
    assert.deepStrictEqual(F().fcfMatchFields('amateur', 'A', ''), {});
    assert.deepStrictEqual(F().fcfMatchFields('amateur', 'A', null), {});
  });

  it('a squad with no configured league gets nothing', () => {
    assert.deepStrictEqual(
        F().fcfMatchFields('amateur', 'B', 'CAN BUXERES, F.C.'), {});
  });

  it('fcfLookup returns null, not undefined, for a miss', () => {
    assert.strictEqual(F().fcfLookup('amateur', 'A', 'Nobody'), null);
  });
});

describe('our own club, in capitals like every rival', () => {
  /* The federation writes every club in caps and a club writes its own name
     however it likes, so the fixture list read "CAN BUXERES, F.C. vs Esquerra
     de l'Eixample F.C." — the odd one out was always us.

     A source-level test, like the ones in kits.test.js and cat-badge.test.js,
     because the rule being protected is about WHICH MECHANISM is used, and
     that is visible in the source and nowhere else. */
  const saved = (() => {
    const i = appSrc.indexOf('    function buildSavedRow(m) {');
    assert.notStrictEqual(i, -1, 'buildSavedRow moved');
    return appSrc.slice(i, appSrc.indexOf('\n    }', i));
  })();
  /* Comments stripped, because the rule is about what the CODE does and the
     comment beside it names the very thing it must not call. Testing the
     prose would fail on a correct implementation that explains itself. */
  const savedCode = saved.replace(/\/\*[\s\S]*?\*\//g, '')
      .split('\n').map((l) => l.replace(/\/\/.*$/, '')).join('\n');

  it('wraps our name in the class the stylesheet uppercases', () => {
    assert.ok(/md-our-club/.test(saved), 'the club name is not marked up');
  });

  it('NEVER uppercases the stored value', () => {
    /* isOurTeam() compares the stored name with ===. An uppercased value
       written back would make the app believe we were the other team — every
       fixture would flip home for away, and the squad letter with it. */
    assert.ok(!/toUpperCase/.test(savedCode),
        'the club name must be uppercased in CSS, not in JS');
  });

  it('the stylesheet is what does it', () => {
    const css = fs.readFileSync(path.join(root, 'css', 'style.css'), 'utf8');
    assert.ok(/\.md-our-club\s*\{[^}]*text-transform:\s*uppercase/.test(css),
        '.md-our-club does not uppercase anything');
  });

  it('leaves the RIVAL alone — FCF already sends caps', () => {
    // Marking both sides would be harmless today and wrong the day a club
    // outside the federation is typed in by hand.
    const hits = savedCode.match(/md-our-club/g) || [];
    assert.strictEqual(hits.length, 1, 'expected one shared helper, not two');
  });
});

describe('mdRowSquad — which league a matchday row belongs to', () => {
  /* Not a DOM test. mdRowSquad reads exactly two things off the row —
     dataset.category and whether a squad chip is active — and the substance
     of it is the fallback chain between them, which is what these object
     literals exercise. Row TRAVERSAL is the browser's job and is checked by
     hand; the decision is not.

     This function is one definition on purpose. The ✓ beside the opponent
     box promises that saving will store a federation id, and before it
     existed the tick resolved the squad from the active chip while the save
     resolved it from `g.team` — which is '' for every club with one team per
     category. Those clubs would have seen a ✓ and got no id. */
  const row = (cat, active) => ({
    dataset: {category: cat},
    querySelector: (sel) => (active && sel === '.md-team-circle.active'
      ? {dataset: {team: active}} : null),
  });

  it('takes the letter from the active chip when there is one', () => {
    const F = makeFcf({clubConfig: CONFIG});
    assert.deepStrictEqual(F.mdRowSquad(row('amateur', 'B')),
        {cat: 'amateur', letter: 'B'});
  });

  it('falls back to the only letter when the category has one squad', () => {
    const F = makeFcf({clubConfig: {name: CLUB, fcfLinks: CONFIG.fcfLinks,
      categories: {amateur: {enabled: true, letters: ['A']}}}});
    assert.deepStrictEqual(F.mdRowSquad(row('amateur', null)),
        {cat: 'amateur', letter: 'A'});
  });

  it('refuses to guess when the category has several squads', () => {
    // amateur-A and amateur-B are different leagues. Picking one would offer
    // the wrong club list and mint an id for the wrong competition.
    const F = makeFcf({clubConfig: CONFIG});
    assert.deepStrictEqual(F.mdRowSquad(row('amateur', null)),
        {cat: 'amateur', letter: ''});
  });

  it('a single-squad club still earns the id — the ✓ is not a lie', () => {
    /* The end-to-end version of the fallback: no chip is ever active for
       this club, so if mdRowSquad returned '' the fixture would save without
       a federation id while the tick said otherwise. */
    const F = makeFcf({
      clubConfig: {name: CLUB, fcfLinks: CONFIG.fcfLinks,
        categories: {amateur: {enabled: true, letters: ['A']}}},
      store: cacheWith('amateur-A', PRESEASON),
    });
    const sq = F.mdRowSquad(row('amateur', null));
    assert.ok(F.fcfLookup(sq.cat, sq.letter, 'CAN BUXERES, F.C.'));
    assert.strictEqual(
        F.fcfMatchFields(sq.cat, sq.letter, 'CAN BUXERES, F.C.').opponentTeamId,
        '33183');
  });
});

describe('the opponent box', () => {
  const F = makeFcf({clubConfig: CONFIG});

  it('is a text input with a datalist, not a select', () => {
    const html = F.opponentInputHtml('new-0', '');
    assert.ok(/<input[^>]*class="reg-input md-opponent"/.test(html), html);
    assert.ok(!/<select/.test(html), 'a select cannot express a friendly');
  });

  it('the input points at the datalist that follows it', () => {
    const html = F.opponentInputHtml('edit-1700000000000', '');
    const listed = /list="([^"]+)"/.exec(html);
    const declared = /<datalist id="([^"]+)"/.exec(html);
    assert.ok(listed && declared, html);
    assert.strictEqual(listed[1], declared[1]);
  });

  it('two rows never share a datalist', () => {
    const a = /list="([^"]+)"/.exec(F.opponentInputHtml('new-0', ''))[1];
    const b = /list="([^"]+)"/.exec(F.opponentInputHtml('new-1', ''))[1];
    assert.notStrictEqual(a, b);
  });

  it('the tick starts hidden — absence of a match is not an error', () => {
    assert.ok(/class="md-fcf-tick"[^>]*hidden/.test(
        F.opponentInputHtml('new-0', '')));
  });

  it('escapes the stored rival name', () => {
    const html = F.opponentInputHtml('new-0', '" onfocus="alert(1)');
    assert.ok(!/onfocus="alert/.test(html), html);
    assert.ok(html.includes('&quot;'), html);
  });
});

describe('an empty standings table always says why', () => {
  /* The lesson of the outage, pinned. Before v117 every one of these
     rendered as an empty <tbody> and read as "the season has not started". */
  const F = makeFcf({clubConfig: CONFIG});

  it('renders a message row spanning the whole table', () => {
    const html = F.leagueMessageHtml('some reason');
    assert.ok(/<td colspan="7"/.test(html), html);
    assert.ok(html.includes('some reason'));
  });

  it('escapes the message', () => {
    assert.ok(!F.leagueMessageHtml('<img src=x onerror=alert(1)>')
        .includes('<img'));
  });

  it('a league with no cached rows renders a reason, not a bare table', () => {
    const html = F.buildLeagueSnippet('Amateur A', [], 'league-amateur-A');
    assert.ok(html.includes('league-msg'), html);
    assert.ok(html.includes('fcf.loading'), html);
  });

  it('a league WITH rows renders them and no message', () => {
    const rows = U.parseFcfClassificacio(PRESEASON, CLUB);
    const html = F.buildLeagueSnippet('Amateur A', rows, 'league-amateur-A');
    assert.ok(!html.includes('league-msg'), 'message shown alongside real rows');
    assert.ok(html.includes('CAN BUXERES, F.C.'));
    assert.ok(html.includes('league-ours'), 'our row is not highlighted');
  });
});

describe('fetchFcfGroup — what actually goes over the wire', () => {
  it('sends the grupId, never the pasted URL', () => {
    const F = makeFcf({clubConfig: CONFIG});
    F.fetchFcfGroup('58161881');
    assert.strictEqual(F._fetched.length, 1);
    assert.ok(!F._fetched[0].includes('fcf.cat'), F._fetched[0]);
    assert.ok(F._fetched[0].includes('grupId=58161881'), F._fetched[0]);
  });
});
