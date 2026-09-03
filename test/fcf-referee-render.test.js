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
const {readCss} = require('./read-css');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const appSrc = fs.readFileSync(path.join(root, 'js', 'app.js'), 'utf8');
const utilsSrc = fs.readFileSync(path.join(root, 'js', 'utils.js'), 'utf8');
const cssSrc = readCss();
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
    '  // #region Calendar');

/* The match-detail card is a second block, further up the file — it renders
   the same figures plus his history with this club.

   ⚠ It ends at the PARTIT banner, not at `function renderMatchDetail()`.
   The v212 redesign put its own builders between the two, and slicing to the
   renderer swept them in: "calls nothing that only exists in functions/" then
   reported parseInt and isNaN as undeclared, which is a true statement about
   a block this test is not about.

   The cut is to the banner's COMMENT OPENER, found by walking back from the
   title line — cutting at the title itself ends the slice inside an open
   `/*`, and every `new Function` built from it dies with a bare
   "Invalid or unexpected token". */
const DETAIL = (() => {
  const title = appSrc.indexOf('     PARTIT — the match detail screen, redesigned');
  assert.notStrictEqual(title, -1, 'the PARTIT banner moved or was renamed');
  const open = appSrc.lastIndexOf('/*', title);
  const from = appSrc.indexOf('  /* ── The referee, on the match detail page ─────');
  assert.notStrictEqual(from, -1, 'the referee detail block moved or was renamed');
  assert.ok(open > from, 'the PARTIT banner must sit after the referee block');
  return appSrc.slice(from, appSrc.lastIndexOf('\n', open) + 1);
})();

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

describe('the referee card on the match detail page', () => {
  function makeDetail(opts) {
    opts = opts || {};
    const factory = new Function(
        'sanitize', 't', 'db', 'currentPage', 'renderPage', 'getSession',
        'fcfRefereeSlug', 'refereeDivisionStats', 'refereeHistoryWithUs',
        'refereeHistoryTally', 'isOurTeam', 'tDateShort',
        'mdRefereeFor', 'mdLoadRefProfile', 'mdLoadAllRefIndices',
        '_refIndex', '_refProfiles',
        DETAIL + '\n return {mdRefDetailHtml, refOffencesHtml, refHistoryHtml};');
    return factory(
        sanitize, (k) => k, {}, 'match-detail', () => {}, () => ({}),
        U.fcfRefereeSlug, U.refereeDivisionStats, U.refereeHistoryWithUs,
        U.refereeHistoryTally,
        (n) => n === opts.club, (d) => String(d),
        () => opts.ref || null,
        () => {}, () => {},
        opts.index || {}, opts.profiles || {},
    );
  }

  const CLUB = "L'Esquerra de l'Eixample F.C.";
  const REF = 'CABRERA VIDAL, DAVID';
  const CREW = {names: [REF, 'ASSISTANT, ONE', 'ASSISTANT, TWO'],
    comp: 'TERCERA CATALANA'};
  const PROF = {
    name: REF, matches: 9,
    byDivision: {'TERCERA CATALANA': {matches: 9, H: 3, D: 2, A: 4,
      reds: 6, doubles: 5, off: {dissent: 3, violent: 2}}},
  };
  const MATCHES = [
    {id: 1, fcfActaId: '101', date: '2025-09-20', home: CLUB, away: 'MONELLS, A.E.'},
    {id: 2, fcfActaId: '102', date: '2025-11-08', home: 'PALS AT.', away: CLUB},
  ];
  const INDEX = {g1: {comp: 'TERCERA CATALANA', actas: {
    101: {r: [REF], c: 1, res: 'H', gh: 3, ga: 1},   // we were home → won 3-1
    102: {r: [REF], c: 1, res: 'H', gh: 2, ga: 0},   // we were away → lost 0-2
  }}};

  function card(extra) {
    const D = makeDetail(Object.assign({
      club: CLUB, ref: CREW, index: INDEX,
      profiles: {[U.fcfRefereeSlug(REF)]: PROF},
    }, extra || {}));
    return D.mdRefDetailHtml({id: 3, fcfActaId: '999'}, MATCHES);
  }

  it('names the crew, which the fixture row has no room for', () => {
    /* On a row three names are noise. On the page a delegate opens the
       morning of the match, knowing whether there IS a full trio is worth a
       line — a Tercera match with three officials is not the usual case. */
    const html = card();
    assert.ok(html.indexOf('ASSISTANT, ONE') !== -1, html);
    assert.ok(html.indexOf('ASSISTANT, TWO') !== -1);
    assert.ok(html.indexOf('ref.assistants') !== -1);
  });

  it('shows our own past matches with him, and the score', () => {
    const html = card();
    assert.ok(html.indexOf('MONELLS, A.E.') !== -1, 'a past fixture is missing');
    assert.ok(html.indexOf('PALS AT.') !== -1);
    assert.ok(html.indexOf('>3-1<') !== -1, 'the home win\'s score is missing');
    assert.ok(html.indexOf('>0-2<') !== -1, 'the away score is missing');
  });

  it('puts the score OUR way round', () => {
    /* Match 102 finished 2-0 to the home side and we were away, so it reads
       0-2. Printing the federation's home-first score unchanged would tell a
       delegate we won 2-0 a match we lost. */
    const html = card();
    assert.ok(html.indexOf('>0-2<') !== -1, 'the away score was not flipped');
    assert.ok(html.indexOf('>2-0<') === -1,
        'the home-side score was printed as though it were ours');
  });

  it('does not report an away defeat as a win', () => {
    /* The single most damaging thing this card could get wrong: telling a
       delegate we beat a side we lost to. The colour carries it, so the
       CLASS is what is asserted rather than any wording. */
    const html = card();
    const away = html.indexOf('PALS AT.');
    const slice = html.slice(away, away + 200);
    assert.ok(slice.indexOf('ref-out-l') !== -1, slice);
    assert.ok(slice.indexOf('ref-out-w') === -1, slice);
  });

  it('marks home and away with an icon, not with words', () => {
    /* "a camp de" ate a third of a narrow row before the opponent's name
       even started, and on a phone the name is what got truncated. */
    const html = card();
    assert.ok(html.indexOf('🏠') !== -1, 'no home icon');
    assert.ok(html.indexOf('✈️') !== -1, 'no away icon');
    assert.ok(html.indexOf('ref.vs_away') === -1, '"a camp de" is still there');
  });

  it('gives the icon an accessible name', () => {
    /* An icon with nothing but a picture is unreadable to a screen reader
       and ambiguous to everyone else. */
    const html = card();
    assert.ok(/aria-label="ref\.at_home"/.test(html), html.slice(0, 200));
    assert.ok(/aria-label="ref\.away"/.test(html));
    assert.ok(/title="ref\.at_home"/.test(html));
  });

  it('falls back to the outcome when an older crawl stored no goals', () => {
    /* Entries written before goals were captured have `res` but no `gh`/`ga`.
       An empty badge would look like a rendering fault; the outcome letter is
       the honest smaller answer. */
    const D = makeDetail({club: CLUB, ref: CREW,
      index: {g1: {comp: 'TERCERA CATALANA', actas: {101: {r: [REF], c: 1, res: 'H'}}}},
      profiles: {[U.fcfRefereeSlug(REF)]: PROF}});
    const html = D.mdRefDetailHtml({id: 3, fcfActaId: '999'}, MATCHES);
    assert.ok(html.indexOf('ref-out-w') !== -1, 'the outcome colour is gone too');
    assert.ok(html.indexOf('ref.w') !== -1, 'nothing at all was shown: ' + html);
  });

  it('says plainly when we have never had him', () => {
    const D = makeDetail({club: CLUB, ref: CREW, index: {},
      profiles: {[U.fcfRefereeSlug(REF)]: PROF}});
    const html = D.mdRefDetailHtml({id: 3, fcfActaId: '999'}, MATCHES);
    assert.ok(html.indexOf('ref.with_us_none') !== -1, html);
  });

  it('lists what his sendings-off were for', () => {
    const html = card();
    assert.ok(html.indexOf('ref.off_dissent') !== -1, 'dissent is not shown');
    assert.ok(html.indexOf('ref.off_violent') !== -1);
    assert.ok(html.indexOf('ref-offence-dissent') !== -1,
        'dissent should be the one that stands out');
  });

  it('always explains what the offence counts do NOT cover', () => {
    /* Without this line, "3 for dissent" reads as a complete account of how
       he handles being argued with. It is only the dissent that reached a
       suspension — a booking that went no further leaves no trace at all. */
    assert.ok(card().indexOf('ref.offences_note') !== -1);
  });

  it('keeps the yellow-card and name-only notes here too', () => {
    const html = card();
    assert.ok(html.indexOf('ref.no_yellows') !== -1);
    assert.ok(html.indexOf('ref.name_only') !== -1);
  });

  it('renders nothing at all when no referee is appointed', () => {
    const D = makeDetail({club: CLUB, ref: null});
    assert.strictEqual(D.mdRefDetailHtml({id: 3}, MATCHES), '');
  });

  it('escapes every name it prints', () => {
    const D = makeDetail({
      club: CLUB,
      ref: {names: ['<img src=x onerror=1>, X'], comp: 'TERCERA CATALANA'},
      index: {}, profiles: {},
    });
    const html = D.mdRefDetailHtml({id: 3, fcfActaId: '999'}, MATCHES);
    assert.ok(html.indexOf('<img') === -1, html);
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
    const code = (BLOCK + '\n' + DETAIL).replace(/\/\*[\s\S]*?\*\//g, '')
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
    const src = BLOCK + '\n' + DETAIL;
    while ((m = re.exec(src))) {
      /* TOKENISED, not split on whitespace. Half these attributes are built
         by concatenation — `class="ref-offence' + (dissent ? ' …' : '') + '"`
         — so a naive split hands back `ref-offence'` with the quote still
         attached and the test fails on a class that is perfectly well styled.
         Both families are collected: `md-ref-*` on the fixture row and
         `ref-*` on the detail card, since a class emitted by one and styled
         only for the other is the gap this exists to close. */
      (m[1].match(/[a-z][a-z0-9-]*/g) || []).forEach((cls) => {
        if (cls.indexOf('md-ref') === 0 || cls.indexOf('ref-') === 0) {
          emitted.add(cls);
        }
      });
    }
    assert.ok(emitted.size >= 16,
        'expected both the panel and the detail card to emit their classes, ' +
        'saw only ' + emitted.size);
    const unstyled = [...emitted].filter((cls) =>
      !new RegExp('\\.' + cls.replace(/[-]/g, '\\-') + '\\b').test(cssSrc));
    assert.deepStrictEqual(unstyled, [],
        'classes with no CSS rule: ' + unstyled.join(', '));
  });

  it('gives the history row fixed lead columns', () => {
    /* A third failure mode the render tests cannot see: the HTML was correct
       and the alignment was not. The two emoji are NOT the same width — ✈️
       carries a variation selector and renders wider than 🏠 — so without a
       fixed box the opponents' names started at a different column on every
       row, and `tabular-nums` on the date keeps the digits even but not the
       box around them.

       Asserting the DECLARATIONS rather than the rendering, because there is
       no browser here; it is the difference between "a rule exists" (which
       the guard above already checks) and "the rule pins the column". */
    const rule = (cls) => {
      const m = new RegExp('\\.' + cls + '\\s*\\{([^}]*)\\}').exec(cssSrc);
      assert.ok(m, cls + ' has no rule at all');
      return m[1];
    };
    assert.ok(/flex:\s*0\s+0\s+[\d.]+rem/.test(rule('ref-hist-date')),
        'the date column can still change width');
    assert.ok(/flex:\s*0\s+0\s+[\d.]+rem/.test(rule('ref-hist-where')),
        'the home/away icon has no fixed box — the two emoji differ in width');
    assert.ok(/text-align:\s*left/.test(rule('ref-hist-opp')),
        'the opponent name is not pinned left');
    assert.ok(/align-items:\s*center/.test(rule('ref-hist-row')),
        'baseline alignment makes an emoji ride high on some rows');
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
