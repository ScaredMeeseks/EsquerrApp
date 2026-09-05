/* Mèdic, redesigned — the eighth design handoff (v234).  `npm run test:medical`
 *
 * ⚠ WHAT THIS SUITE IS ACTUALLY FOR.
 *
 * Three things on this page fail SILENTLY, and each of them has a section
 * below:
 *
 *  1. **The privacy rule.** A player sees the zone and the dates of his own
 *     injuries. Not the muscle, not the severity, not the staff's notes, not
 *     the documents. It is enforced by NOT BUILDING THE STRING — hiding it
 *     with a class would ship the diagnosis to a phone the player owns and
 *     then hope. A regression here looks like nothing at all.
 *
 *  2. **The blank self-report.** Every field on the player's sheet is
 *     optional and a blank submission is valid; the pending row then renders
 *     in italic as "nobody has described this yet". A fallback label that
 *     made an empty report look described would be invisible to every other
 *     test in this repo and would quietly stop a physio going to ask.
 *
 *  3. **The uploads.** A failed upload must store NOTHING. Parking-lot 12b:
 *     the profile-photo path once fell back to a data URI that `saveUsers`
 *     carried into a synced blob capped at 1 MB, and one failure could stop a
 *     whole club syncing weeks later. The same shape here is a 10 MB PDF
 *     inside `fa_injuries`.
 *
 * Two traps this repo has already paid for, both live in here:
 *  · a stub that returns a constant cannot answer a question about its input,
 *    so `sanitize` and the taxonomy helpers are the REAL ones; and
 *  · jsdom swallows an exception thrown inside a listener, so a handler that
 *    dies on a forgotten stub looks exactly like one that did nothing — every
 *    test that dispatches an event drains a window `error` collector.
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');
const { readCss, readCssRaw } = require('./read-css');
const utils = require('../js/utils.js');

const src = fs.readFileSync(path.join(__dirname, '..', 'js', 'app.js'), 'utf8');
const utilsSrc = fs.readFileSync(path.join(__dirname, '..', 'js', 'utils.js'), 'utf8');
const css = readCss();
/* Comment-stripped for every "is this written down" question, so a banner
   that names its own hooks in prose cannot satisfy an assertion about the
   code. Written down four times in this repo already. */
const bare = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

function grab(from, to) {
  const i = src.indexOf(from);
  const j = src.indexOf(to, i);
  assert.ok(i !== -1 && j !== -1, 'marker not found in js/app.js: ' + from);
  return src.slice(i, j);
}

/* The `.md2-` block on its own. It is currently LAST in the stylesheet, so
   this slice runs to the end — and that is exactly the shape that broke
   test/convocatoria.test.js and then test/inici.test.js in turn. If a ninth
   paper page is appended after Mèdic, give this an end bound naming it. */
const MDSTART = css.indexOf('/* ===== Mèdic, redesigned (v234)');
assert.ok(MDSTART !== -1, 'the md2- block banner is gone from css/style.css');
const MDCSS = css.slice(MDSTART).replace(/\/\*[\s\S]*?\*\//g, '');
const rawCss = readCssRaw();
const MDRAW = rawCss.slice(rawCss.indexOf('/* ===== Mèdic, redesigned (v234)'))
    .replace(/\/\*[\s\S]*?\*\//g, '');

const SANITIZE_SRC = utilsSrc.slice(
    utilsSrc.indexOf('function sanitize(str) {'),
    utilsSrc.indexOf('// ---------- Tactical Formations ----------'));

// ── the real helpers, sliced ──────────────────────────────────────────────
const HELPERS = grab('  const MD2_SHOW_HEATMAP = true;', '  function renderMedical() {');
const DOCS = grab('  const MD2_DOC_MAX =', '  /** The staff logger (screen 1c)');

/** md2* pure helpers over real utils. Nothing here touches the DOM. */
function loadHelpers(over) {
  const dom = new JSDOM('<!doctype html><body></body>');
  const api = Object.assign({
    document: dom.window.document,
    t: (k) => k,
    tv: (k, v) => k + ':' + JSON.stringify(v),
    localDateStr: () => '2026-09-05',
    tDateDayMonth: (d) => 'dm(' + d + ')',
    playerIsCalled: () => true,
    getSession: () => ({ id: 'u9', name: 'Nil Ferrer', teamId: 'club1' }),
    storage: { ref: () => ({}) },
    BODY_ZONES: utils.BODY_ZONES,
    GROUP_SUBS: utils.GROUP_SUBS,
    ZONE_CA: utils.ZONE_CA,
    zoneLabelCa: utils.zoneLabelCa,
    groupLabelCa: utils.groupLabelCa,
    muscleLabelCa: utils.muscleLabelCa,
  }, over || {});
  // eslint-disable-next-line no-new-func
  return new Function(...Object.keys(api), `
    ${SANITIZE_SRC}
    ${HELPERS}
    ${DOCS}
    return { md2SevIdx, md2SevLabel, md2SevCls, md2Days, md2MissedSessions,
             md2ZoneText, md2MuscleText, md2ZoneKey, md2OriginText,
             md2FileCount, md2Head, md2Act, md2StatusPill,
             md2DocKind, md2DocSize, md2UploadDoc, md2DocRowsHtml,
             MD2_SEV, MD2_DOC_MAX, MD2_DOC_ACCEPT, MD2_PLAYER_SEES_DIAGNOSIS };
  `)(...Object.values(api));
}

// ═══════════════════════════════════════════════════════════════════════════
describe('Mèdic — the taxonomy is complete, and it is display-only', () => {
  /* The `|| key` fallback means a missing translation renders in English and
     breaks nothing, which is precisely why nothing would notice it. */
  it('translates every zone, group and structure', () => {
    const zones = [...new Set(utils.BODY_ZONES.map((z) => z.label))];
    assert.deepStrictEqual(zones.filter((z) => !utils.ZONE_CA[z]), []);
    const groups = Object.keys(utils.GROUP_SUBS);
    assert.deepStrictEqual(groups.filter((g) => !utils.GROUP_CA[g]), []);
    const subs = [...new Set(Object.values(utils.GROUP_SUBS).flat())];
    assert.deepStrictEqual(subs.filter((m) => !utils.MUSCLE_CA[m]), []);
  });

  it('translates but does not RENAME — the stored key is untouched', () => {
    // A record stores 'Biceps Femoris' and an index; only the label moves.
    assert.strictEqual(utils.muscleLabelCa('Biceps Femoris'), 'Bíceps femoral');
    assert.strictEqual(utils.groupLabelCa('Hamstrings'), 'Isquiotibials');
    const i = utils.BODY_ZONES.findIndex((z) => z.label === 'Hamstring');
    assert.ok(i > -1);
    assert.strictEqual(utils.zoneLabelCa(i), 'Isquiotibials');
    // ⚠ The array index IS the persisted bodyZone. 38 polygons, both sides.
    assert.strictEqual(utils.BODY_ZONES.length, 38);
  });

  it('falls back to the key rather than rendering blank', () => {
    assert.strictEqual(utils.muscleLabelCa('Nonesuch Muscle'), 'Nonesuch Muscle');
    assert.strictEqual(utils.zoneLabelCa(999), '');
  });
});

describe('Mèdic — one body map builder, seven callers', () => {
  it('draws every zone over the image, in percent space', () => {
    const h = utils.bodyMapHtml({});
    assert.strictEqual((h.match(/<polygon/g) || []).length, 38);
    assert.ok(h.includes('viewBox="0 0 100 100"'));
    assert.ok(h.includes('preserveAspectRatio="none"'));
    assert.ok(h.includes('img/cuerpos.png'));
  });

  /* ⚠ The wrapper holds the image, the overlay and the marker and NOTHING
     with a height of its own. A caption inside it stretches the svg and the
     polygons slide off the body. */
  it('puts nothing but the image, the overlay and the marker in the wrapper', () => {
    const h = utils.bodyMapHtml({ marker: { left: 10, top: 20 } });
    const inner = h.slice(h.indexOf('>') + 1, h.lastIndexOf('</div>'));
    const tags = (inner.match(/<(\w+)/g) || []).map((s) => s.slice(1));
    assert.deepStrictEqual([...new Set(tags)].sort(), ['img', 'polygon', 'span', 'svg']);
  });

  /* ⚠ `fill="none"` removes a polygon from hit-testing: the map would look
     right and answer no clicks at all. Transparent white is the fix and it
     has to stay the default. */
  it('leaves an unpicked polygon hit-testable', () => {
    const h = utils.bodyMapHtml({ interactive: true });
    assert.ok(!/fill="none"/.test(h), 'fill="none" kills the picker');
    assert.ok(h.includes('fill="rgba(255,255,255,0)"'));
  });

  /* ⚠ A PRESENTATION ATTRIBUTE, never inline style. A stylesheet :hover rule
     beats the attribute and loses to an inline style — moving this would
     break the hover with no error anywhere. */
  it('emits the fill as an attribute so the :hover rule can win', () => {
    const h = utils.bodyMapHtml({ fill: () => 'rgba(1,2,3,.5)' });
    assert.ok(h.includes('fill="rgba(1,2,3,.5)"'));
    assert.ok(!/style="[^"]*fill:/.test(h), 'the fill moved into inline style');
    assert.ok(/\.md2-map-live polygon:hover\s*\{[^}]*fill:/.test(MDCSS),
        'nothing gives a picked-over polygon its hover fill');
  });

  it('marks the interactive maps and only those', () => {
    assert.ok(utils.bodyMapHtml({ interactive: true, which: 'rep' })
        .includes('data-md2-which="rep"'));
    assert.ok(!utils.bodyMapHtml({}).includes('data-md2-zone'),
        'a picture of a season took click handlers');
    assert.ok(!utils.bodyMapHtml({}).includes('md2-map-live'));
  });

  it('puts the marker at the polygon centroid, in the same percent space', () => {
    const i = utils.BODY_ZONES.findIndex((z) => z.label === 'Hamstring');
    const c = utils.bodyZoneCentroid(i);
    const pts = utils.BODY_ZONES[i].pts.split(/\s+/).map((p) => p.split(',').map(Number));
    const xs = pts.map((p) => p[0]);
    // Inside the polygon's own bounding box, and expressed 0-100 like the pts.
    assert.ok(c.left >= Math.min(...xs) && c.left <= Math.max(...xs));
    assert.ok(c.top > 0 && c.top < 100);
    assert.ok(utils.bodyMapHtml({ marker: c }).includes('left:' + c.left + '%'));
  });
});

describe('Mèdic — the figures the page prints', () => {
  const H = loadHelpers();

  it('counts a day inclusively, so a one-day injury is 1', () => {
    assert.strictEqual(H.md2Days('2026-09-01', '2026-09-01'), 1);
    assert.strictEqual(H.md2Days('2026-09-01', '2026-09-03'), 3);
    assert.strictEqual(H.md2Days('', '2026-09-03'), 0);
  });

  it('runs an open injury to TODAY, not to nothing', () => {
    // localDateStr is stubbed at 2026-09-05; 1 sep → 5 sep inclusive is 5.
    assert.strictEqual(H.md2Days('2026-09-01', null), 5);
  });

  /* Sessions missed is DERIVED. A stored count is wrong the moment a coach
     adds a session inside the window. */
  it('counts only the sessions inside the injury window', () => {
    const trs = [
      { date: '2026-08-30' }, { date: '2026-09-01' },
      { date: '2026-09-02' }, { date: '2026-09-09' },
    ];
    const inj = { startDate: '2026-09-01', endDate: '2026-09-03' };
    assert.strictEqual(H.md2MissedSessions(inj, { id: 'p1' }, trs), 2);
    // Open: runs to the stubbed today, 2026-09-05.
    assert.strictEqual(
        H.md2MissedSessions({ startDate: '2026-09-01' }, { id: 'p1' }, trs), 2);
  });

  it('does not count a session the player was not called to', () => {
    const H2 = loadHelpers({ playerIsCalled: (tr) => tr.date !== '2026-09-02' });
    const trs = [{ date: '2026-09-01' }, { date: '2026-09-02' }];
    assert.strictEqual(
        H2.md2MissedSessions({ startDate: '2026-09-01', endDate: '2026-09-03' },
            { id: 'p1' }, trs), 1);
  });

  /* ⚠ Both sides of a pair carry the same LABEL and different indices. The
     season map counts by label, or one thigh lights and its twin does not on
     a map whose whole job is "where". */
  it('keys a season tally on the label, so both sides of a pair are one zone', () => {
    const left = utils.BODY_ZONES.findIndex((z) => z.label === 'Hamstring');
    const right = utils.BODY_ZONES.map((z) => z.label).lastIndexOf('Hamstring');
    assert.notStrictEqual(left, right, 'the fixture assumes a left/right pair');
    assert.strictEqual(H.md2ZoneKey({ bodyZone: left }), H.md2ZoneKey({ bodyZone: right }));
  });

  it('says where an injury came from, and says nothing when it does not know', () => {
    assert.strictEqual(H.md2OriginText({ origin: 'match', originLabel: 'Sants' }),
        'md2.origin_match · Sants');
    assert.strictEqual(H.md2OriginText({ origin: 'training' }), 'md2.origin_training');
    // A record from before the field existed is UNKNOWN, not "outside".
    assert.strictEqual(H.md2OriginText({}), '—');
  });

  it('draws no severity chip for a record that has none', () => {
    assert.strictEqual(H.md2SevCls('severe'), 'md2-sev-3');
    assert.strictEqual(H.md2SevCls('minor'), 'md2-sev-1');
    assert.strictEqual(H.md2SevCls(''), '');
    assert.strictEqual(H.md2SevLabel(''), '');
  });

  it('counts attached files, and says Cap rather than 0', () => {
    assert.ok(H.md2FileCount({ docs: [] }).includes('md2.none'));
    assert.ok(H.md2FileCount({}).includes('md2.none'));
    assert.strictEqual(H.md2FileCount({ docs: [1] }), 'md2.files_1');
    assert.strictEqual(H.md2FileCount({ docs: [1, 2, 3] }), 'md2.files_n:{"n":3}');
  });

  it('pulses the open injury and not the one in recovery', () => {
    assert.ok(H.md2StatusPill('active').includes('md2-pill-inj'));
    assert.ok(H.md2StatusPill('recovering').includes('md2-pill-rec'));
    assert.ok(/\.md2-pill-inj \.md2-dot\s*\{[^}]*animation:\s*medPulse/.test(MDCSS));
    assert.ok(/\.md2-pill-rec \.md2-dot\s*\{[^}]*animation:\s*none/.test(MDCSS),
        'the recovering dot pulses too — the animation stops saying "now"');
  });
});

describe('Mèdic — a view-only staff member gets the word, not the button', () => {
  const H = loadHelpers();

  it('renders an inert span instead of a control', () => {
    const on = H.md2Act(false, 'x', ' data-a="1"', 'Alta');
    const off = H.md2Act(true, 'x', ' data-a="1"', 'Alta');
    assert.ok(on.startsWith('<button'));
    assert.ok(off.startsWith('<span') && off.includes('md2-act-off'));
    assert.ok(!off.includes('<button'), 'a disabled button still invites a click');
    assert.ok(!off.includes('data-a="1"'), 'the inert copy still carries its hook');
  });

  it('guards the writes as well as the markup', () => {
    const bindBody = bare.slice(bare.indexOf('function bindMedical()'),
        bare.indexOf('function bindMedicalDetail()'));
    ['md2-btn-confirm', 'md2-btn-dismiss', 'md2-btn-discharge', 'md2-btn-edit']
        .forEach((c) => {
          const i = bindBody.indexOf(c);
          assert.ok(i !== -1, c + ' is not bound at all');
          // Each write-bearing binder sits behind `if (!ro)`.
          assert.ok(/if \(!ro\) page\.querySelectorAll\($/m.test(
              bindBody.slice(0, i).split('\n').slice(-4).join('\n')) ||
            bindBody.slice(0, i).lastIndexOf('if (!ro)') >
              bindBody.slice(0, i).lastIndexOf('page.querySelectorAll') - 40,
          c + ' is bound without the read-only guard');
        });
  });

  it('is a no-op on every other page', () => {
    assert.ok(/function bindMedical\(\) \{\s*const page = document\.getElementById\('md2-page'\);\s*if \(!page\) return;/
        .test(bare), 'bindMedical is not gated on its page root');
    assert.ok(/function bindMedicalDetail\(\) \{\s*const page = document\.getElementById\('md2-page'\);\s*if \(!page\) return;/
        .test(bare), 'bindMedicalDetail is not gated on its page root');
  });
});

describe('Mèdic — the squad filter moved onto the shared bar', () => {
  it('is drawn by the same chips as the other four', () => {
    assert.ok(/currentPage === 'medical'\s*\?\s*catBarLettersHtml\(medicalTeamFilter, 'data-med-team'\)/
        .test(bare), 'Mèdic still draws its own chip row');
    assert.ok(/medicalTeamFilter = btn\.dataset\.medTeam \|\| 'all';/.test(bare),
        'nothing writes the filter');
  });

  it('left no second copy of the control behind', () => {
    assert.ok(!/roster-team-filter/.test(bare.slice(bare.indexOf('function renderMedical()'),
        bare.indexOf('function md2Counter'))), 'the in-page chip row survived');
  });

  it('resets with the category, because a letter belongs to one', () => {
    const i = bare.indexOf("var want = btn.dataset.cat || '';");
    const body = bare.slice(i, bare.indexOf('renderPage', i));
    assert.ok(/medicalTeamFilter = 'all';/.test(body));
  });
});

describe('Mèdic — the documents', () => {
  const H = loadHelpers();

  it('offers exactly the file types it will accept', () => {
    // ⚠ Not the image MIME glob: a slash-star inside a string opens a comment
    // for the naive strippers several suites use, and swallows the source
    // that follows it. This cost a passing Convocatòria assertion once.
    assert.ok(!/image\/\*/.test(H.MD2_DOC_ACCEPT));
    ['pdf', 'doc', 'docx', 'jpg', 'png'].forEach((e) =>
      assert.ok(H.MD2_DOC_ACCEPT.includes('.' + e), '.' + e + ' is not offered'));
  });

  it('refuses a type it cannot label, before it uploads anything', async () => {
    let threw = null;
    await H.md2UploadDoc({ name: 'payload.exe', size: 10 }, 'amateur', 'i1')
        .catch((e) => { threw = e; });
    assert.ok(threw, 'an .exe was accepted');
    assert.strictEqual(threw.message, 'md2.bad_type');
  });

  it('refuses an oversized file before it uploads anything', async () => {
    let threw = null;
    await H.md2UploadDoc({ name: 'scan.pdf', size: H.MD2_DOC_MAX + 1 }, 'amateur', 'i1')
        .catch((e) => { threw = e; });
    assert.ok(threw);
    assert.strictEqual(threw.message, 'md2.too_big');
  });

  /* ⚠ The category is in the PATH because storage.rules cannot read
     Firestore: a path segment is the only thing the `cats` claim can be
     tested against. */
  it('writes under medical/{team}/{category}/{injury}/', async () => {
    let seen = '';
    const H2 = loadHelpers({
      storage: { ref: (p) => { seen = p; return {
        put: () => Promise.resolve(),
        getDownloadURL: () => Promise.resolve('https://x/y'),
      }; } },
    });
    const doc = await H2.md2UploadDoc({ name: 'eco.pdf', size: 10 }, 'juvenil', 'inj7');
    assert.ok(/^medical\/club1\/juvenil\/inj7\//.test(seen), 'path was ' + seen);
    assert.strictEqual(doc.kind, 'PDF');
    assert.strictEqual(doc.url, 'https://x/y');
    assert.strictEqual(doc.by, 'Nil Ferrer');
  });

  /* ⚠ PARKING-LOT 12b. A failed upload stores NOTHING — no data URI, no
     placeholder row. A base64 blob in a synced key once nearly stopped a
     whole club syncing. */
  it('has no data-URI fallback anywhere in the upload path', () => {
    const block = bare.slice(bare.indexOf('const MD2_DOC_MAX'),
        bare.indexOf('function renderMedical()'));
    assert.ok(!/FileReader|readAsDataURL|data:/.test(block),
        'a fallback crept into the medical upload path');
  });

  it('rejects rather than resolving a half-made record', async () => {
    const H2 = loadHelpers({
      storage: { ref: () => ({ put: () => Promise.reject(new Error('boom')) }) },
    });
    let threw = null;
    const doc = await H2.md2UploadDoc({ name: 'eco.pdf', size: 10 }, 'a', 'i')
        .catch((e) => { threw = e; return null; });
    assert.ok(threw, 'a failed put resolved');
    assert.strictEqual(doc, null);
  });

  it('labels each type with its own chip', () => {
    assert.deepStrictEqual(H.md2DocKind('a.pdf'), { ext: 'PDF', cls: 'md2-chip-pdf' });
    assert.deepStrictEqual(H.md2DocKind('a.docx'), { ext: 'DOCX', cls: 'md2-chip-doc' });
    assert.deepStrictEqual(H.md2DocKind('a.JPG'), { ext: 'JPG', cls: 'md2-chip-img' });
    assert.strictEqual(H.md2DocKind('a.zip').cls, 'md2-chip-doc');
    ['md2-chip-pdf', 'md2-chip-doc', 'md2-chip-img'].forEach((c) =>
      assert.ok(MDCSS.includes('.' + c), c + ' has no rule'));
  });

  it('sizes a file the way a person reads one', () => {
    assert.strictEqual(H.md2DocSize(1400000), '1,3 MB');
    assert.strictEqual(H.md2DocSize(820 * 1024), '820 kB');
    assert.strictEqual(H.md2DocSize(0), '1 kB');
  });

  it('offers the × only where a file can be taken off', () => {
    const docs = [{ name: 'a.pdf', size: 10, kind: 'PDF' }];
    assert.ok(H.md2DocRowsHtml(docs, true).includes('data-md2-doc="0"'));
    assert.ok(!H.md2DocRowsHtml(docs, false).includes('data-md2-doc'));
  });
});

describe('Mèdic — storage.rules keep the player out', () => {
  const rules = fs.readFileSync(path.join(__dirname, '..', 'storage.rules'), 'utf8');
  const block = rules.slice(rules.indexOf('match /medical/'));

  it('scopes the path by team AND category, from the claims', () => {
    assert.ok(rules.includes('match /medical/{teamId}/{category}/{injuryId}/{fileName}'));
    assert.ok(/request\.auth\.token\.teamId == teamId/.test(block));
    assert.ok(/category in request\.auth\.token\.cats/.test(block));
  });

  /* ⚠ READ is staff-only too. The app tells the player his files are private;
     this is what makes that true rather than a promise the UI keeps. */
  it('lets no player read them, whatever the UI does', () => {
    const read = block.slice(block.indexOf('allow read:'), block.indexOf('allow create'));
    assert.ok(/isMedStaff\(\)/.test(read));
    assert.ok(!/request\.auth != null;/.test(read),
        'read fell back to "any signed-in user", as profilePics does');
    assert.ok(/role in \['staff', 'lead'\]/.test(block));
  });

  /* ⚠ `request.resource` is null on a delete, so a size check in the same
     rule errors out and denies it. That once meant nobody could delete a
     profile picture at all, not even its owner. */
  it('splits delete out from create/update', () => {
    assert.ok(/allow create, update:/.test(block));
    assert.ok(/allow delete:/.test(block));
    const del = block.slice(block.indexOf('allow delete:'));
    assert.ok(!/request\.resource/.test(del), 'the delete rule reads request.resource');
  });

  it('caps the size and names the types rather than taking anything', () => {
    assert.ok(/request\.resource\.size < 10 \* 1024 \* 1024/.test(block));
    assert.ok(/application\/pdf/.test(block));
    assert.ok(/wordprocessingml\.document/.test(block));
    assert.ok(/contentType\.matches\('image\/\.\*'\)/.test(block));
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// The player's self-report (screen 1d) — real handlers over real markup.
// ═══════════════════════════════════════════════════════════════════════════
const REPORT = grab('  function commitInjuryNote(sid, sel) {',
    '  // #endregion Notifications & Body Map');

function mountReport(opts) {
  opts = opts || {};
  const dom = new JSDOM('<!doctype html><body><div class="avail-btns"></div></body>', {
    runScripts: 'outside-only', pretendToBeVisual: true });
  const win = dom.window;
  const doc = win.document;
  const errors = [];
  win.addEventListener('error', (e) => errors.push(e.error || e.message));

  const store = { fa_training_availability: '{}', fa_injury_notes: '{}',
    fa_injury_zone: '{}', fa_injuries: JSON.stringify(opts.injuries || []) };
  const calls = { save: [], acked: [], notify: [], rendered: 0 };
  const localStorage = {
    getItem: (k) => (k in store ? store[k] : null),
    setItem: (k, v) => { store[k] = v; },
  };
  const SESS = { id: 't7', date: '2026-09-02', focus: 'Pressing' };

  const api = {
    document: doc,
    localStorage,
    t: (k) => k,
    tv: (k, v) => k + ':' + JSON.stringify(v),
    tDateDayMonth: (d) => 'dm(' + d + ')',
    localDateStr: () => '2026-09-05',
    getSession: () => ({ id: 'u1', name: 'Marc Rovira' }),
    getTrainings: () => [SESS],
    getUsers: () => [{ id: 'u1', name: 'Marc Rovira' }],
    saveUsers: () => {},
    getInjuries: () => JSON.parse(store.fa_injuries),
    saveInjuries: (a) => { store.fa_injuries = JSON.stringify(a); },
    addInjury: (i) => {
      i.id = i.id || 'new1';
      const all = JSON.parse(store.fa_injuries);
      all.push(i);
      store.fa_injuries = JSON.stringify(all);
      return i;
    },
    recordKey: (uid, sess) => uid + '_' + sess.id,
    ackSaveRecord: (coll, key, data) => { calls.save.push({ coll, key, data }); },
    ackSave: (k, v) => { calls.acked.push({ k, v }); store[k] = v; },
    addStaffNotification: (n) => calls.notify.push(n),
    renderPage: () => { calls.rendered++; },
    updateActionsBadge: () => {},
    BODY_ZONES: utils.BODY_ZONES,
    GROUP_SUBS: utils.GROUP_SUBS,
    bodyMapHtml: utils.bodyMapHtml,
    zoneLabelCa: utils.zoneLabelCa,
    groupLabelCa: utils.groupLabelCa,
    muscleLabelCa: utils.muscleLabelCa,
    MD2_SEV: ['minor', 'moderate', 'severe'],
    md2SevLabel: (s) => 'sev:' + s,
  };
  // eslint-disable-next-line no-new-func
  const fns = new Function(...Object.keys(api), `
    ${SANITIZE_SRC}
    ${REPORT}
    return { commitInjuryNote, showInjurySelfReport };
  `)(...Object.values(api));

  fns.showInjurySelfReport(doc.querySelector('.avail-btns'), 't7');
  const sheet = doc.querySelector('.md2-rep');
  assert.ok(sheet, 'the sheet did not open');

  return {
    doc, sheet, calls, store, errors,
    click(sel) {
      const el = sheet.querySelector(sel);
      assert.ok(el, 'nothing matched ' + sel + ' — the markup contract moved');
      el.dispatchEvent(new win.Event('click', { bubbles: true }));
      assert.deepStrictEqual(errors, [], 'a handler threw: ' + errors.join(', '));
    },
    injuries: () => JSON.parse(store.fa_injuries),
  };
}

describe('El meu autoreport — every field is optional', () => {
  it('sends a completely blank report, and still records Lesionat', () => {
    const m = mountReport();
    m.click('#md2-skip');
    assert.strictEqual(m.calls.save.length, 1, 'the availability answer was dropped');
    assert.strictEqual(m.calls.save[0].data.value, 'injured');
    assert.strictEqual(m.calls.save[0].key, 'u1_t7');
    const inj = m.injuries();
    assert.strictEqual(inj.length, 1, 'a blank report created no pending row');
    assert.strictEqual(inj[0].selfReported, true);
    assert.strictEqual(inj[0].confirmedBy, undefined, 'a self-report arrived pre-confirmed');
  });

  /* ⚠ THE ITALIC ROW IS THE POINT. A blank report must leave zone, group,
     muscle and severity EMPTY — a plausible fallback label would dress an
     undescribed injury as a described one and stop a physio going to ask. */
  it('leaves a blank report blank, with no stand-in label', () => {
    const m = mountReport();
    m.click('#md2-skip');
    const i = m.injuries()[0];
    assert.strictEqual(i.bodyZone, null);
    assert.strictEqual(i.muscleGroup, '');
    assert.strictEqual(i.muscleSub, '');
    assert.strictEqual(i.severity, '');
    assert.deepStrictEqual(m.calls.acked.filter((a) => a.k === 'fa_injury_zone'), [],
        'a zone was written for a report that named none');
  });

  /* ⚠ THE × IS `Ometre`. The footnote on the screen promises "Marcaràs
     Lesionat encara que ho ometis", so a close that dropped the answer would
     make the screen lie — and getEffectiveAnswer() reads a silent player as
     AVAILABLE, so the coach's sheet would have him down as fit. */
  it('records the answer when the sheet is dismissed, not only when it is sent', () => {
    const m = mountReport();
    m.click('#md2-rep-x');
    assert.strictEqual(m.calls.save.length, 1, 'closing the sheet dropped the answer');
    assert.strictEqual(m.calls.save[0].data.value, 'injured');
  });

  it('carries what the player did pick', () => {
    const m = mountReport();
    const quad = utils.BODY_ZONES.findIndex((z) => z.label === 'Quad');
    m.click('[data-md2-zone="' + quad + '"]');
    m.click('[data-md2-act="muscle"][data-md2-val="Rectus Femoris"]');
    m.click('[data-md2-act="sev"][data-md2-val="minor"]');
    m.click('#md2-send');
    const i = m.injuries()[0];
    assert.strictEqual(i.bodyZone, quad);
    assert.strictEqual(i.bodyZoneLabel, 'Quad');
    assert.strictEqual(i.muscleSub, 'Rectus Femoris', 'the ENGLISH key must be stored');
    assert.strictEqual(i.severity, 'minor');
    assert.strictEqual(i.origin, 'training');
    // The human line the older surfaces read is the CATALAN one.
    const note = m.calls.acked.find((a) => a.k === 'fa_injury_notes');
    assert.ok(JSON.parse(note.v).u1.includes('Recte femoral'));
    assert.ok(JSON.parse(note.v).u1.includes('Quàdriceps'));
  });

  it('picks the zone\'s first group and clears the muscle under it', () => {
    const m = mountReport();
    const quad = utils.BODY_ZONES.findIndex((z) => z.label === 'Quad');
    m.click('[data-md2-zone="' + quad + '"]');
    // Quad offers two groups — Quadriceps and Adductors — and the first is on.
    assert.ok(m.sheet.querySelector('[data-md2-act="group"][data-md2-val="Quadriceps"]')
        .classList.contains('md2-on'));
    m.click('[data-md2-act="muscle"][data-md2-val="Rectus Femoris"]');
    m.click('[data-md2-act="group"][data-md2-val="Adductors"]');
    m.click('#md2-send');
    assert.strictEqual(m.injuries()[0].muscleGroup, 'Adductors');
    assert.strictEqual(m.injuries()[0].muscleSub, '', 'the old muscle survived a group change');
  });

  /* Toggling back to nothing is what makes "blank" reachable after a mis-tap,
     and the handoff calls for it on the severity segments explicitly. */
  it('lets every pick be un-picked', () => {
    const m = mountReport();
    const quad = utils.BODY_ZONES.findIndex((z) => z.label === 'Quad');
    m.click('[data-md2-zone="' + quad + '"]');
    m.click('[data-md2-act="sev"][data-md2-val="severe"]');
    m.click('[data-md2-act="sev"][data-md2-val="severe"]');
    m.click('[data-md2-zone="' + quad + '"]');
    m.click('#md2-send');
    const i = m.injuries()[0];
    assert.strictEqual(i.severity, '', 'the severity would not toggle off');
    assert.strictEqual(i.bodyZone, null, 'the zone would not toggle off');
  });

  it('enriches the open record rather than opening a second one', () => {
    const m = mountReport({ injuries: [{
      id: 'old1', playerId: 'u1', status: 'active', selfReported: true,
      confirmedBy: 'staff9', muscleGroup: 'Calves',
    }] });
    const quad = utils.BODY_ZONES.findIndex((z) => z.label === 'Quad');
    m.click('[data-md2-zone="' + quad + '"]');
    m.click('#md2-send');
    const all = m.injuries();
    assert.strictEqual(all.length, 1, 'a duplicate record was opened');
    assert.strictEqual(all[0].id, 'old1');
    assert.strictEqual(all[0].bodyZone, quad);
    /* ⚠ Once staff have looked at a record, a player adding detail must NOT
       send it back to the pending list. */
    assert.strictEqual(all[0].confirmedBy, 'staff9');
  });

  it('keeps what the player typed across a body-map pick', () => {
    const m = mountReport();
    m.sheet.querySelector('#md2-how').value = 'M\'he girat i he notat un cop';
    const quad = utils.BODY_ZONES.findIndex((z) => z.label === 'Quad');
    m.click('[data-md2-zone="' + quad + '"]');
    assert.strictEqual(m.sheet.querySelector('#md2-how').value,
        'M\'he girat i he notat un cop', 'the repaint ate the only sentence');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// The player's own view (screen 1f) — the privacy rule.
// ═══════════════════════════════════════════════════════════════════════════
const MINE = grab('  function buildInjuryHistoryHtml(uid, opts) {',
    '  /**\n   * The Ready cell');

function mine(forPlayer, injuries) {
  const dom = new JSDOM('<!doctype html><body></body>');
  const H = loadHelpers();
  const api = {
    document: dom.window.document,
    t: (k) => k,
    tv: (k, v) => k + ':' + JSON.stringify(v),
    tDateDMY: (d) => 'dmy(' + d + ')',
    tDateDayMonth: (d) => 'dm(' + d + ')',
    getPlayerInjuries: () => injuries,
    getUsers: () => [{ id: 'p1' }],
    getTrainings: () => [],
    md2Days: H.md2Days,
    md2ZoneText: H.md2ZoneText,
    md2MuscleText: H.md2MuscleText,
    md2SevCls: H.md2SevCls,
    md2SevLabel: H.md2SevLabel,
    md2MissedSessions: H.md2MissedSessions,
    md2Head: H.md2Head,
    MD2_PLAYER_SEES_DIAGNOSIS: false,
  };
  // eslint-disable-next-line no-new-func
  return new Function(...Object.keys(api), `
    ${SANITIZE_SRC}
    ${MINE}
    return buildInjuryHistoryHtml('p1', ${forPlayer ? '{ forPlayer: true }' : 'undefined'});
  `)(...Object.values(api));
}

describe('El meu estat — the player sees the zone and the dates', () => {
  const HAM = utils.BODY_ZONES.findIndex((z) => z.label === 'Hamstring');
  const INJ = [{
    id: 'i1', status: 'active', bodyZone: HAM, muscleGroup: 'Hamstrings',
    muscleSub: 'Biceps Femoris', severity: 'severe', startDate: '2026-08-18',
    expectedReturn: '2026-09-12', notes: 'Elongació de grau 2 per ecografia.',
    docs: [{ name: 'eco.pdf', size: 10, kind: 'PDF' }],
  }];

  /* ⚠ BY OMISSION, NOT BY A CLASS. Hiding the diagnosis with CSS or `hidden`
     ships it to a phone the player owns and then hopes. If this suite ever
     has to assert `display:none` instead, the rule has already been lost. */
  it('never builds the muscle, the severity, the notes or the files', () => {
    const html = mine(true, INJ);
    assert.ok(html.includes('Isquiotibials'), 'the zone is missing');
    assert.ok(html.includes('dm(2026-08-18)'), 'the dates are missing');
    assert.ok(!html.includes('Bíceps femoral'), 'the muscle reached the player');
    assert.ok(!html.includes('Biceps Femoris'), 'the muscle key reached the player');
    assert.ok(!/medical\.severity_severe|md2-sev-3/.test(html), 'the severity reached the player');
    assert.ok(!html.includes('Elongació'), 'the staff notes reached the player');
    assert.ok(!html.includes('eco.pdf'), 'a document reached the player');
  });

  it('says so on the screen, so the rule is visible and not just true', () => {
    assert.ok(mine(true, INJ).includes('md2.privacy_zone'));
    assert.ok(!mine(false, INJ).includes('md2.privacy_zone'),
        'the staff view carries the player\'s privacy note');
  });

  it('keeps the full record for staff, who need it', () => {
    const html = mine(false, INJ);
    assert.ok(html.includes('Bíceps femoral'), 'staff lost the muscle');
    assert.ok(html.includes('md2-sev-3'), 'staff lost the severity');
  });

  it('answers "nothing is wrong" rather than disappearing', () => {
    const html = mine(true, []);
    assert.ok(html.includes('md2.my_fit'));
    assert.ok(html.includes('md2-dot-fit'));
  });

  /* The hover body map is bound by NAME over `.mystats-inj-row`, on both
     my-stats and staff-player-stats — a v45 bug was that list being short by
     one page. The redesign must not have renamed the hook out from under it. */
  it('keeps the hook the hover map binds by name', () => {
    assert.ok(mine(true, INJ).includes('mystats-inj-row'));
    assert.ok(mine(true, INJ).includes('data-zone-idx="' + HAM + '"'));
    assert.ok(/currentPage === 'my-stats' \|\| currentPage === 'staff-player-stats'/.test(bare),
        'bindMyStatsInjuryPopup is no longer called for both pages');
  });

  it('is wired for the player on My stats and for staff on the detail page', () => {
    assert.ok(/buildInjuryHistoryHtml\(uid, \{ forPlayer: true \}\)/.test(bare),
        'the player call site lost its flag — the diagnosis is now shipped');
    // Two CALL sites — the declaration itself matches the same name.
    assert.strictEqual(
        (bare.match(/\$\{buildInjuryHistoryHtml\(uid/g) || []).length, 2,
        'a third caller appeared, or one of the two moved');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// The dashboard itself, rendered for real.
// ═══════════════════════════════════════════════════════════════════════════
const PAGE = grab('  function renderMedical() {', '  /** The staff logger (screen 1c)');

const SQUAD = [];
for (let i = 1; i <= 6; i++) {
  SQUAD.push({ id: 'p' + i, name: 'Jugador ' + i, position: 'ST',
    roles: ['player'], category: 'amateur', team: 'A' });
}
const HAM = utils.BODY_ZONES.findIndex((z) => z.label === 'Hamstring');

/** renderMedical() over stubs, in jsdom. Everything the page reaches for is
    a stub EXCEPT the taxonomy, the body map and sanitize, which are real —
    a stub that returns a constant cannot answer a question about its input. */
function page(opts) {
  opts = opts || {};
  const dom = new JSDOM('<!doctype html><body></body>');
  const status = opts.status || {};
  const env = {
    document: dom.window.document,
    t: (k) => k,
    tv: (k, v) => k + ':' + JSON.stringify(v),
    Date, JSON, Math, Object, String, Number, Array,
    getUsers: () => opts.squad || SQUAD,
    getTrainings: () => [],
    getInjuries: () => opts.injuries || [],
    getCurrentCategory: () => 'amateur',
    medicalTeamFilter: 'all',
    medicalPastExpanded: true,
    canEditPage: () => !opts.readonly,
    viewOnlyBanner: () => '<div class="view-only-banner"></div>',
    catSpanOf: () => 1,
    catBadgeHtmlGlobal: () => '',
    posCirclesHtmlGlobal: () => '<span class="conv-pos-circle">ST</span>',
    posRankGlobal: () => 0,
    localDateStr: () => '2026-09-05',
    seasonStartStr: () => '2026-08-15',
    fitnessContext: () => ({}),
    deriveFitnessStatus: (id) => ({ fitnessStatus: status[id] || 'fit', injuryNote: '' }),
    playerIsCalled: () => true,
    CATEGORY_LABELS: { amateur: 'Amateur' },
    tDateLong: (d) => 'long(' + d + ')',
    tDateDayMonth: (d) => 'dm(' + d + ')',
    tDateDMY: (d) => 'dmy(' + d + ')',
    safeHttpUrl: utils.safeHttpUrl,
    BODY_ZONES: utils.BODY_ZONES,
    GROUP_SUBS: utils.GROUP_SUBS,
    ZONE_CA: utils.ZONE_CA,
    zoneLabelCa: utils.zoneLabelCa,
    groupLabelCa: utils.groupLabelCa,
    muscleLabelCa: utils.muscleLabelCa,
    bodyMapHtml: utils.bodyMapHtml,
    bodyZoneCentroid: utils.bodyZoneCentroid,
  };
  // eslint-disable-next-line no-new-func
  const html = new Function(...Object.keys(env), `
    ${SANITIZE_SRC}
    ${HELPERS}
    ${PAGE}
    return renderMedical();
  `)(...Object.values(env));
  const d = new JSDOM('<!doctype html><body>' + html + '</body>').window.document;
  return { html, doc: d, $: (s) => d.querySelectorAll(s) };
}

function open(id, pid, over) {
  return Object.assign({ id, playerId: pid, status: 'active', bodyZone: HAM,
    muscleGroup: 'Hamstrings', muscleSub: 'Biceps Femoris', severity: 'moderate',
    startDate: '2026-08-20', confirmedBy: 's1', docs: [] }, over || {});
}

describe('Mèdic — the dashboard, rendered', () => {
  /* ⚠ STATUS BEFORE DATE. Sorting on the date alone interleaves the two, and
     a `Recuperant` then heads a list captioned "3 lesionats · 2 recuperant".
     Found by rendering the preview with the whole suite green — no string
     assertion sees an order unless it is written like this one. */
  it('lists who is OUT before who is coming back, then oldest first', () => {
    const p = page({ injuries: [
      open('a', 'p1', { status: 'recovering', startDate: '2026-08-01' }),
      open('b', 'p2', { startDate: '2026-08-25' }),
      open('c', 'p3', { startDate: '2026-08-18' }),
      open('d', 'p4', { status: 'recovering', startDate: '2026-08-28' }),
    ] });
    const ids = [...p.$('.md2-inj')].map((e) => e.dataset.injuryId);
    assert.deepStrictEqual(ids, ['c', 'b', 'a', 'd']);
  });

  it('renders a blank self-report in italic, and a described one as text', () => {
    const p = page({ injuries: [
      open('s1', 'p1', { selfReported: true, confirmedBy: undefined,
        bodyZone: null, muscleGroup: '', muscleSub: '', severity: '' }),
      open('s2', 'p2', { selfReported: true, confirmedBy: undefined }),
    ] });
    const rows = [...p.$('.md2-pend')];
    assert.strictEqual(rows.length, 2);
    assert.ok(rows[0].querySelector('.md2-blank'), 'the empty report is not marked blank');
    assert.ok(!rows[1].querySelector('.md2-blank'), 'a described report was called blank');
    assert.ok(rows[1].textContent.includes('Isquiotibials'));
    // A pending row must NOT also appear as an open injury.
    assert.strictEqual(p.$('.md2-inj').length, 0);
  });

  /* The older half of the same list: an availability answer with no record at
     all. Both halves render identically because to a physio they are one job. */
  it('lists a player marked injured with no record beside the real reports', () => {
    const p = page({ status: { p5: 'injured' }, injuries: [
      open('s1', 'p1', { selfReported: true, confirmedBy: undefined }),
    ] });
    assert.strictEqual(p.$('.md2-pend').length, 2);
    assert.ok(p.html.includes('md2.pending_note:{"n":2}'));
  });

  it('counts what it says it counts', () => {
    const p = page({ status: { p1: 'injured', p2: 'injured', p3: 'doubt' },
      injuries: [open('a', 'p1'), open('b', 'p3', { status: 'recovering' })] });
    const v = [...p.$('.md2-count-v')].map((e) => e.textContent);
    assert.strictEqual(v[0], '2', 'Lesionats');
    assert.strictEqual(v[1], '1', 'Recuperant');
    assert.ok(p.html.includes('md2.squad_note:{"f":3,"n":6}'), 'the fit count is wrong');
  });

  it('gives a view-only member no control at all', () => {
    const inj = [open('a', 'p1'), open('s1', 'p2', { selfReported: true, confirmedBy: undefined })];
    const rw = page({ injuries: inj });
    const ro = page({ injuries: inj, readonly: true });
    assert.ok(rw.$('button.md2-act').length >= 4);
    assert.strictEqual(ro.$('button.md2-act').length, 0, 'a button survived read-only');
    assert.strictEqual(ro.$('#md2-log').length, 0, 'the log button survived read-only');
    assert.ok(ro.$('.md2-act-off').length >= 4, 'the actions vanished instead of going inert');
    assert.ok(ro.doc.querySelector('.md2-page-ro'));
  });

  /* Both are BUILT, always, and the breakpoint picks one. The CSS half of
     this is asserted below; without this half a renderer that stopped
     emitting one of them would leave those rules pointing at nothing. */
  it('renders both the desktop stats and the phone line, and lets CSS choose', () => {
    const p = page({ injuries: [open('a', 'p1', { expectedReturn: '2026-09-20' })] });
    assert.strictEqual(p.$('.md2-inj-stats').length, 1);
    assert.strictEqual(p.$('.md2-inj-meta').length, 1);
    assert.ok(p.$('.md2-inj-meta')[0].textContent.includes('md2.meta_line'));
  });

  it('renders both counter labels, long and short', () => {
    const p = page({ injuries: [] });
    assert.strictEqual(p.$('.md2-count').length, 4);
    assert.strictEqual(p.$('.md2-lbl-l').length, 4, 'a long counter label is missing');
    assert.strictEqual(p.$('.md2-lbl-s').length, 4, 'a short counter label is missing');
    // The two that differ are the two the phone cannot fit.
    const pairs = [...p.$('.md2-count')].map((c) => [
      c.querySelector('.md2-lbl-l').textContent,
      c.querySelector('.md2-lbl-s').textContent]);
    assert.deepStrictEqual(pairs[2], ['md2.days_lost', 'md2.days_lost_s']);
    assert.deepStrictEqual(pairs[3], ['md2.season_inj', 'md2.season_inj_s']);
    // The first two are short enough already and repeat themselves.
    assert.strictEqual(pairs[0][0], pairs[0][1]);
  });

  it('answers an empty page rather than rendering nothing', () => {
    const p = page({ injuries: [] });
    assert.ok(p.html.includes('md2.no_pending'));
    assert.ok(p.html.includes('md2.no_active'));
    assert.ok(p.html.includes('md2.no_closed'));
    // And the rail still draws the squad, all fit.
    assert.strictEqual(p.$('.md2-sq-fit').length, 6);
  });

  /* The prototype never escaped anything, because React did it. An
     innerHTML renderer has to, on every hole — and the names in a real club
     carry apostrophes as a matter of course. */
  it('escapes a name into the text AND into the attribute that carries it', () => {
    const p = page({
      squad: [{ id: 'x1', name: 'O\'Neill <b>"J"</b> & Sons', position: 'ST',
        roles: ['player'], category: 'amateur', team: 'A' }],
      injuries: [open('a', 'x1')],
    });
    assert.ok(!p.html.includes('<b>'), 'a name injected markup');
    assert.ok(p.html.includes('&amp;'), 'the ampersand was not escaped');
    assert.ok(p.html.includes('&#39;') && p.html.includes('&quot;'),
        'the quotes were not escaped — the data attribute is breakable');
    // It still reads as the person's name once parsed.
    assert.strictEqual(p.doc.querySelector('.md2-inj-name').textContent,
        'O\'Neill <b>"J"</b> & Sons');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe('Mèdic — the stylesheet', () => {
  it('carries no paper colour as a literal', () => {
    const loose = (MDRAW.match(/#[0-9A-Fa-f]{3,8}\b/g) || [])
        .filter((h) => h.toUpperCase() !== '#FFFFFF');
    assert.deepStrictEqual(loose, [],
        'a paper colour is hardcoded in .md2- instead of a --pp- token');
  });

  /* ⚠ `.conv-pos-circle` belongs to Convocatòria and is drawn at three sizes
     here. Unscoped, these rules repaint every other page that uses it. */
  it('scopes every borrowed class under its own page root', () => {
    const borrowed = MDCSS.split('\n')
        .filter((l) => /^\s*[^@}\s]/.test(l))
        .filter((l) => /\.(conv-pos-circle|conv-pos-circles|mystats-inj-row)\b/.test(l));
    assert.ok(borrowed.length >= 3, 'the scan found almost no borrowed rules');
    borrowed.forEach((l) => assert.ok(/\.md2-(page|mine|pos)/.test(l),
        'an unscoped borrowed rule repaints another page: ' + l.trim()));
  });

  it('bottom-aligns the counters, so a wrapped label keeps the baseline', () => {
    const m = /\.md2-counters\s*\{([^}]*)\}/.exec(MDCSS);
    assert.ok(m, '.md2-counters has no rule');
    assert.ok(/align-items:\s*flex-end/.test(m[1]),
        'centred counters lift a wrapped label\'s figure off the shared baseline');
  });

  it('has both breakpoints, and no `order:` in the phone one', () => {
    assert.ok(MDCSS.includes('@media (max-width: 1100px)'), 'the rail never folds');
    const i = MDCSS.indexOf('@media (max-width: 700px)');
    assert.ok(i !== -1, 'there is no phone breakpoint');
    /* ⚠ On Inici an `order:3` put a button before the count it belonged to:
       order is a property of the container's CHILDREN, and two cases with
       the same class can have different children. */
    assert.ok(!/order:\s*\d/.test(MDCSS.slice(i)),
        'order: reappeared in the phone block');
  });

  it('gives the phone a real touch target', () => {
    const phone = MDCSS.slice(MDCSS.indexOf('@media (max-width: 700px)'));
    assert.ok(/\.md2-cta\s*\{[^}]*height:\s*44px/.test(phone),
        'the phone CTA is under 44px');
    /* The file page is where a phone discharges an injury, because the list
       above drops its actions. Its buttons have to be reachable. */
    assert.ok(/\.md2-file-acts \.md2-act\s*\{[^}]*height:\s*44px/.test(phone));
  });

  /* Three things are rendered twice and chosen by the breakpoint rather than
     branched on a width in JS: a render that asks how wide the window is
     answers once and is wrong after the next rotation. */
  it('swaps the desktop grid for the phone line, and the long label for the short', () => {
    const phone = MDCSS.slice(MDCSS.indexOf('@media (max-width: 700px)'));
    assert.ok(/\.md2-inj-meta\s*\{\s*display:\s*none/.test(MDCSS), 'the phone line shows on desktop');
    assert.ok(/\.md2-inj-stats\s*\{\s*display:\s*none/.test(phone), 'the five-stat grid survives the phone');
    assert.ok(/\.md2-inj-meta\s*\{\s*display:\s*block/.test(phone), 'the phone gets no summary line');
    assert.ok(/\.md2-lbl-s\s*\{\s*display:\s*none/.test(MDCSS));
    assert.ok(/\.md2-lbl-l\s*\{\s*display:\s*none/.test(phone) &&
      /\.md2-lbl-s\s*\{\s*display:\s*inline/.test(phone), 'both counter labels show at once');
  });

  /* Six columns in 390px collided — "Moderada" ran into "14 jul" — which is
     not a table, it is a smear. The handoff's phone screen has no closed
     section and no heat map, and the phone reaches both through the file. */
  it('drops the heat map and the closed table on the phone', () => {
    const phone = MDCSS.slice(MDCSS.indexOf('@media (max-width: 700px)'));
    assert.ok(/\.md2-rail \.md2-block:first-child\s*\{\s*display:\s*none/.test(phone));
    assert.ok(/\.md2-main \.md2-block:last-child\s*\{\s*display:\s*none/.test(phone));
    /* ⚠ And the actions go with them — the capability does NOT, because the
       name is a link to the file and both live on it. */
    assert.ok(/\.md2-inj-top \.md2-act\s*\{\s*display:\s*none/.test(phone));
    assert.ok(/data-md2-player/.test(bare.slice(bare.indexOf('md2-inj-name'),
        bare.indexOf('md2-inj-name') + 200)), 'the name stopped being the link to the file');
  });

  /* ⚠ A flex item does not shrink below its content by default, so three
     equal segments carrying a long label push straight through the right
     edge of a 560px sheet — no scrollbar, no warning, just a control hanging
     out of the dialog. Caught by rendering the logger with an untranslated
     key standing in for `Moderada`; a longer language gets there honestly. */
  it('will not let a long label push a control out of its sheet', () => {
    const seg = /\.md2-seg\s*\{([^}]*)\}/.exec(MDCSS);
    assert.ok(seg, '.md2-seg has no rule');
    assert.ok(/min-width:\s*0/.test(seg[1]), 'a segment cannot shrink below its text');
    assert.ok(/text-overflow:\s*ellipsis/.test(seg[1]), 'the overflow is not even shown as one');
  });

  it('draws the whole page with no radius but the circles', () => {
    const radii = MDCSS.match(/border-radius:\s*([^;]+);/g) || [];
    radii.forEach((r) => assert.ok(/50%|0\b/.test(r),
        'a paper page grew a corner radius: ' + r));
  });
});
