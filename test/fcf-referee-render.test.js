/* The referee block on a fixture, run for real.
 *
 * Same grab() convention as fcf-tabs-render.test.js, and for the same reason:
 * this is string building that nothing else executes, and the two ways it has
 * gone wrong before are both silent.
 *
 *   v123  the Sancions and Golejadors tabs were dead on every screen because
 *         their parsers had been written in functions/, which the browser
 *         never loads. BOTH suites stayed green — Node's require reaches
 *         functions/, and the renderer tests stubbed the helpers.
 *   v125  a whole feature shipped with no stylesheet, because `cat >>
 *         css/style.css` was chained behind a `node --check` that failed on a
 *         Catalan apostrophe and `&&` short-circuited.
 *
 * So the last two tests here are not about this feature at all. They are
 * about those two failures never being possible again.
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const appSrc = fs.readFileSync(path.join(root, 'js', 'app.js'), 'utf8');
const utilsSrc = fs.readFileSync(path.join(root, 'js', 'utils.js'), 'utf8');
const cssSrc = fs.readFileSync(path.join(root, 'css', 'style.css'), 'utf8');
const U = require(path.join(root, 'js', 'utils.js'));

function grab(from, to) {
  const i = appSrc.indexOf(from);
  const j = appSrc.indexOf(to, i);
  assert.ok(i !== -1 && j !== -1, 'marker not found: ' + from);
  return appSrc.slice(i, j);
}

const BLOCK = grab(
    '  /* ═══════════════════════════════════════════════════════════\n' +
    '     Who is refereeing, and what his record in THIS division is',
    '  function renderMatchday()');

const sanitize = (s) => String(s === undefined || s === null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

const REF = 'TORRIJO SIERRA, ANDREA';
const COMP = 'TERCERA CATALANA';

function makeRef(opts) {
  opts = opts || {};
  const reads = [];
  const factory = new Function(
      'sanitize', 't', 'db', 'currentPage', 'renderPage', 'getSession',
      'fcfRefereeSlug', 'refereeDivisionStats', 'fcfGrupId', '_clubConfig',
      BLOCK + '\n return {mdRefereeFor, mdRefereeTagHtml, mdRefPanelHtml,' +
      ' mdLoadRefIndex, mdLoadRefProfile, _state: function () {' +
      ' return {index: _refIndex, profiles: _refProfiles, open: _refOpen}; },' +
      ' _open: function (v) { _refOpen = v; },' +
      ' _seed: function (g, v) { _refIndex[g] = v; },' +
      ' _seedProfile: function (s, v) { _refProfiles[s] = v; }};');
  const api = factory(
      sanitize,
      (k) => k,
      {collection: (name) => {
        reads.push(name);
        return {
          where: () => ({get: () => new Promise(() => {})}),
          doc: () => ({get: () => new Promise(() => {})}),
        };
      }},
      'matchday',
      () => {},
      () => ({}),
      U.fcfRefereeSlug,
      U.refereeDivisionStats,
      U.fcfGrupId,
      opts.clubConfig || {},
  );
  api._reads = reads;
  return api;
}

const PROFILE = {
  name: REF,
  matches: 14,
  byDivision: {
    'TERCERA CATALANA': {matches: 10, H: 5, D: 3, A: 2, reds: 2, doubles: 1},
    'QUARTA CATALANA': {matches: 3, H: 3, D: 0, A: 0, reds: 0, doubles: 0},
  },
};

describe('naming the referee on a fixture', () => {
  it('shows him when the index has him', () => {
    const R = makeRef();
    R._seed('999', {comp: COMP, actas: {77: {r: [REF, 'B, C'], c: 1}}});
    const html = R.mdRefereeTagHtml({id: 5, fcfActaId: '77'});
    assert.ok(html.indexOf(REF) !== -1, html);
    assert.ok(html.indexOf('data-ref-match="5"') !== -1,
        'the match id must ride on the button — a read-only viewer has no ' +
        'edit button to read it off');
  });

  it('names the REFEREE, not an assistant', () => {
    const R = makeRef();
    R._seed('999', {comp: COMP, actas: {77: {r: [REF, 'ASSISTANT, ONE'], c: 1}}});
    const html = R.mdRefereeTagHtml({id: 5, fcfActaId: '77'});
    assert.ok(html.indexOf('ASSISTANT') === -1, 'an assistant was named');
  });

  it('says nothing at all when nobody is appointed', () => {
    /* An unplayed match reads "Sense àrbitres assignats" at the federation,
       and an empty entry must render as absence — not as a blank label with
       a dangling colon. */
    const R = makeRef();
    R._seed('999', {comp: COMP, actas: {77: {r: [], j: 3}}});
    assert.strictEqual(R.mdRefereeTagHtml({id: 5, fcfActaId: '77'}), '');
    assert.strictEqual(R.mdRefereeTagHtml({id: 5, fcfActaId: '404'}), '');
    assert.strictEqual(R.mdRefereeTagHtml({id: 5}), '');
    assert.strictEqual(R.mdRefereeTagHtml(null), '');
  });

  it('draws the fixture list even with no index loaded', () => {
    // The whole list must not wait on a referee lookup.
    const R = makeRef();
    assert.strictEqual(R.mdRefereeTagHtml({id: 5, fcfActaId: '77'}), '');
  });

  it('escapes the name', () => {
    const R = makeRef();
    R._seed('999', {comp: COMP, actas: {77: {r: ['<img src=x onerror=1>, X'], c: 1}}});
    const html = R.mdRefereeTagHtml({id: 5, fcfActaId: '77'});
    assert.ok(html.indexOf('<img') === -1, html);
  });
});

describe('the referee panel', () => {
  function panel(profile, comp) {
    const R = makeRef();
    R._seedProfile(U.fcfRefereeSlug(REF), profile);
    return R.mdRefPanelHtml(REF, comp === undefined ? COMP : comp);
  }

  it('reports the division asked for, and names it', () => {
    const html = panel(PROFILE);
    assert.ok(html.indexOf(COMP) !== -1, 'the division is not named');
    assert.ok(html.indexOf('50%') !== -1, '5 of 10 home wins');
    assert.ok(html.indexOf('30%') !== -1);
    assert.ok(html.indexOf('20%') !== -1);
  });

  it('shows a DIFFERENT record for a different division', () => {
    /* The feature, in one assertion. If these two ever match, the panel is
       showing a career blend and the division label on it is a lie. */
    const a = panel(PROFILE, 'TERCERA CATALANA');
    const b = panel(PROFILE, 'QUARTA CATALANA');
    assert.notStrictEqual(a, b);
    assert.ok(b.indexOf('50%') === -1, 'Tercera figures leaked into Quarta');
  });

  it('refuses to draw percentages from three matches', () => {
    /* Three games at 100% home wins is not a finding, and a delegate who
       trusted it would be worse informed than if we had shown nothing. */
    const html = panel(PROFILE, 'QUARTA CATALANA');
    assert.ok(html.indexOf('%') === -1, 'a percentage was drawn: ' + html);
    assert.ok(html.indexOf('ref.too_few') !== -1, 'and it did not say why');
  });

  it('still shows the counts on a thin sample', () => {
    // The counts are facts; only the inference is suppressed.
    const html = panel(PROFILE, 'QUARTA CATALANA');
    assert.ok(html.indexOf('3/0/0') !== -1, html);
  });

  it('says so when he has never worked this division', () => {
    /* Not zeroes. "0% home wins" for a referee with no record here is a
       statement about him that nothing supports. */
    const html = panel(PROFILE, 'LLIGA ELIT');
    assert.ok(html.indexOf('ref.no_record') !== -1, html);
    assert.ok(html.indexOf('0%') === -1, html);
  });

  it('handles a referee with no profile at all', () => {
    const html = panel('none');
    assert.ok(html.indexOf('ref.no_record') !== -1, html);
  });

  it('says it is loading rather than showing an empty record', () => {
    const html = panel('loading');
    assert.ok(html.indexOf('ref.loading') !== -1, html);
    assert.ok(html.indexOf('ref.no_record') === -1,
        '"loading" must not read as "no record"');
  });

  it('ALWAYS says that yellow cards are unpublished', () => {
    /* The federation publishes none at all. Without this line their absence
       reads as a referee who books nobody, which is the opposite of true. */
    assert.ok(panel(PROFILE).indexOf('ref.no_yellows') !== -1);
  });

  it('ALWAYS says referees are identified by name alone', () => {
    /* FCF publishes no referee id. Two officials sharing a name merge, and
       nothing in the data can separate them — better said than implied. */
    assert.ok(panel(PROFILE).indexOf('ref.name_only') !== -1);
  });

  it('can be closed', () => {
    assert.ok(panel(PROFILE).indexOf('data-ref-close') !== -1);
  });
});

describe('the two ways this has shipped broken before', () => {
  it('calls nothing that only exists in functions/', () => {
    /* v123: the tabs were dead on every screen because their parsers lived
       in functions/fcf.js, which the browser never loads — and both suites
       were green, because Node's require reaches functions/ and the render
       tests stubbed the helpers. Every helper this block calls must be
       declared somewhere the BROWSER will actually have it. */
    const declared = new Set();
    [appSrc, utilsSrc].forEach((src) => {
      const re = /(?:^|\n)\s*(?:function\s+([A-Za-z_$][\w$]*)|(?:var|let|const)\s+([A-Za-z_$][\w$]*)\s*=)/g;
      let m;
      while ((m = re.exec(src))) declared.add(m[1] || m[2]);
    });
    /* Browser and language built-ins, plus the identifiers the block itself
       introduces or receives. */
    const KNOWN = new Set(['Object', 'String', 'Number', 'Array', 'Math', 'JSON',
      'Boolean', 'Date', 'Promise', 'db', 'document', 'window', 'console', 't',
      'sanitize', 'renderPage', 'getSession', 'currentPage', 'if', 'for',
      'return', 'function', 'typeof', 'var', 'while', 'switch', 'catch']);

    /* Comments first. This block is heavily commented and English prose is
       full of "the group's index (one document…" — a word followed by an
       open bracket, which is indistinguishable from a call once you are
       reading with a regex. */
    const code = BLOCK.replace(/\/\*[\s\S]*?\*\//g, '')
        .split('\n').map((l) => l.replace(/\/\/.*$/, '')).join('\n');
    const calls = new Set();
    const callRe = /(?:^|[^.\w$])([a-zA-Z_$][\w$]*)\s*\(/g;
    let c;
    while ((c = callRe.exec(code))) calls.add(c[1]);

    const missing = [...calls].filter((n) => !declared.has(n) && !KNOWN.has(n));
    assert.deepStrictEqual(missing, [],
        'these are called by the referee block but declared in neither ' +
        'js/app.js nor js/utils.js — the browser would throw: ' + missing.join(', '));
  });

  it('has a CSS rule for every class it emits', () => {
    /* v125: a whole feature shipped with no stylesheet because a `cat >>`
       was chained behind a failing `node --check` and `&&` short-circuited.
       Unstyled output is not a visible error; it just looks broken. */
    const emitted = new Set();
    const re = /class="([^"]+)"/g;
    let m;
    while ((m = re.exec(BLOCK))) {
      m[1].split(/\s+/).forEach((cls) => {
        if (cls && cls.indexOf('md-ref') === 0) emitted.add(cls);
      });
    }
    assert.ok(emitted.size >= 8, 'expected the panel to emit its own classes');
    const unstyled = [...emitted].filter((cls) =>
      !new RegExp('\\.' + cls.replace(/[-]/g, '\\-') + '\\b').test(cssSrc));
    assert.deepStrictEqual(unstyled, [],
        'classes with no CSS rule: ' + unstyled.join(', '));
  });

  it('reads the collections the security rules actually allow', () => {
    /* Both are `allow read: if request.auth != null` in firestore.rules;
       fcfCrawl is denied outright and must never be touched from here. */
    const rules = fs.readFileSync(path.join(root, 'firestore.rules'), 'utf8');
    ['fcfRefIndex', 'fcfReferees'].forEach((coll) => {
      assert.ok(BLOCK.indexOf("'" + coll + "'") !== -1, 'never reads ' + coll);
      assert.ok(new RegExp('match /' + coll + '/').test(rules),
          coll + ' has no rule — every read would be denied');
    });
    assert.ok(BLOCK.indexOf('fcfCrawl') === -1,
        'the crawl config is server-only and denied to clients');
  });
});
