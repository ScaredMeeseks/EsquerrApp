/* Les meves estadístiques — the player's own page, rebuilt in `.ms-` (v244).
 *
 * WHAT FAILS SILENTLY HERE, and why this file exists:
 *
 * 1. ⚠ AN RPE COMING BACK. The page's whole point is that a player does not
 *    see one: not a session RPE, not a weekly-load chart, not the four
 *    Readiness components that computeReadiness() returns alongside the score.
 *    Putting one back renders perfectly, throws nothing, and is invisible to
 *    every other suite. Nothing but a scan of the rendered HTML notices.
 * 2. ⚠ AN MVP STAR COMING BACK. Teammate voting does not exist; a star wired
 *    to a stand-in signal would look exactly right and mean something else.
 * 3. ⚠ THE BODY MAP MATCHING BY LABEL. BODY_ZONES holds each zone twice,
 *    once per side, under one label. Matching by label lights BOTH legs, which
 *    is what v234 shipped by following the prototype's markup instead of the
 *    data behind it — and the handoff's sample script for THIS page does the
 *    same thing. A one-sided fixture is the only assertion that catches it.
 * 4. ⚠ THE BUILDER NOT BEING CALLED. v238 shipped a Plantilla page that
 *    rendered nothing past 3080 green tests, because every assertion read the
 *    builder's TEXT. Every render test below CALLS renderPlayerStats.
 *
 * `npm run test:ms`, or as part of test:unit.
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
/* Comment-stripped, so a banner that names its own hooks in prose cannot
   satisfy an assertion about the code. */
const bare = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

function grab(from, to) {
  const i = src.indexOf(from);
  const j = src.indexOf(to, i);
  assert.ok(i !== -1 && j !== -1, 'marker not found in js/app.js: ' + from);
  return src.slice(i, j);
}

/* The `.ms-` block on its own. It USED to run to the end of the stylesheet —
   the shape that broke test/convocatoria.test.js, then test/inici.test.js,
   then test/medical.test.js in turn. Accions (v245) was appended after it, so
   this now has the end bound the comment here asked for. */
const MSBANNER = '/* ===== Les meves estadístiques, redesigned (v244)';
const ACBANNER = '/* ===== Accions, redesigned (v245)';
const MSSTART = css.indexOf(MSBANNER);
assert.ok(MSSTART !== -1, 'the ms- block banner is gone from css/style.css');
const MSEND = css.indexOf(ACBANNER, MSSTART);
assert.ok(MSEND !== -1, 'the .ac- banner that bounds this slice is gone');
const MSCSS = css.slice(MSSTART, MSEND).replace(/\/\*[\s\S]*?\*\//g, '');

const SANITIZE_SRC = utilsSrc.slice(
    utilsSrc.indexOf('function sanitize(str) {'),
    utilsSrc.indexOf('// ---------- Tactical Formations ----------'));

// ── fixtures ──────────────────────────────────────────────────────────────
const ME = {
  id: 'p1', name: 'Marc Rovira', playerNumber: 8, position: 'DM,OM',
  team: 'A', category: 'amateur', roles: ['player'],
};

const HAM = utils.BODY_ZONES.findIndex((z) => z.label === 'Hamstring');
const HAM2 = utils.BODY_ZONES.findIndex((z, i) => i > HAM && z.label === 'Hamstring');
const CALF = utils.BODY_ZONES.findIndex((z) => z.label === 'Shin / Calf');

/* Six matches covering V/E/D, home and away, a full 90 and a 45, a row with
   nothing on it, a yellow, and a yellow plus a red. */
const ROWS = [
  ['2026-08-30', 'CF Sants', 'CE L\'Esquerra', 1, 2, 'V', 78, 1, 0, 0, 0],
  ['2026-08-23', 'CE L\'Esquerra', 'UE Poble Sec', 3, 0, 'V', 90, 1, 1, 0, 0],
  ['2026-08-16', 'CE Gràcia', 'CE L\'Esquerra', 1, 1, 'E', 62, 0, 0, 1, 0],
  ['2026-08-09', 'CE L\'Esquerra', 'AD Clot', 0, 2, 'D', 45, 0, 0, 0, 0],
  ['2026-08-02', 'CE L\'Esquerra', 'CF Vallcarca', 2, 2, 'E', 82, 1, 1, 0, 0],
  ['2026-07-26', 'UE Horta', 'CE L\'Esquerra', 0, 1, 'V', 55, 0, 0, 1, 1],
].map(([date, home, away, hs, as, res, min, g, a, y, r]) => ({
  matchId: date, date, home, away, homeScore: hs, awayScore: as,
  resultLetter: res, isOwnTeam: true, minutes: min,
  status: min >= 62 ? 'Titular' : 'Suplent', teamLetter: 'A',
  yellows: y, reds: r, assists: a, goals: g,
  goalBreakdown: { jugada: g, penal: 0, falta: 0 },
}));
const TOTALS = { goals: 3, assists: 2, matches: 6, minutes: 412, titulars: 4 };

const TRAININGS = [];
for (let i = 0; i < 22; i++) TRAININGS.push({ id: 'tr' + i, date: '2026-08-01' });
const ANSWERS = TRAININGS.map((tr, i) => (i < 16 ? 'yes' : i < 19 ? 'late' : 'injured'));

/* ONE hamstring, on ONE side, plus a calf. The whole point of the fixture is
   that BODY_ZONES holds a second Hamstring polygon at HAM2 which must stay
   unfilled. */
const INJURIES = [
  { id: 'i1', playerId: 'p1', status: 'resolved', bodyZone: HAM,
    muscleGroup: 'Hamstrings', muscleSub: 'Biceps Femoris', severity: 'severe',
    startDate: '2026-07-12', endDate: '2026-08-02' },
  { id: 'i2', playerId: 'p1', status: 'resolved', bodyZone: HAM,
    muscleGroup: 'Hamstrings', muscleSub: 'Biceps Femoris', severity: 'moderate',
    startDate: '2025-10-18', endDate: '2025-11-09' },
  { id: 'i3', playerId: 'p1', status: 'resolved', bodyZone: CALF,
    muscleGroup: 'Calves', muscleSub: 'Soleus', severity: 'minor',
    startDate: '2026-03-04', endDate: '2026-03-16' },
];

const READY = { score: 79, color: 'green', acwr: 1.12, matchDaysSince: 7, hasData: true,
  loadRatioScore: 100, matchFatigueScore: 62, loadSpikeScore: 80, rpeTrendScore: 71 };
const NO_DATA = { score: 0, color: 'green', acwr: 0, matchDaysSince: null, hasData: false,
  loadRatioScore: 0, matchFatigueScore: 0, loadSpikeScore: 0, rpeTrendScore: 0 };

/** The real renderPlayerStats, over stubs. Called, not read. */
function render(over) {
  const o = over || {};
  const dom = new JSDOM('<!doctype html><body></body>');
  const api = Object.assign({
    document: dom.window.document,
    getSession: () => ({ id: 'p1', name: ME.name }),
    getUsers: () => [ME],
    getPlayerInjuries: () => (o.injuries || INJURIES),
    getTrainings: () => TRAININGS,
    trainingOnly: (l) => l,
    matchStatsContext: () => ({
      matches: ROWS.map((r) => ({ id: r.matchId, date: r.date, time: '12:00', team: 'A' })),
      allEvents: {}, sentData: {},
    }),
    computePlayerMatchStats: () => ({
      totals: o.totals || TOTALS, matchRows: o.rows || ROWS,
    }),
    computeReadiness: () => (o.rd || READY),
    availContext: () => ({}),
    isTrainingLocked: () => true,
    getEffectiveAnswer: (uid, tr) => ANSWERS[TRAININGS.indexOf(tr)] || 'na',
    isOurTeam: (n) => n === 'CE L\'Esquerra',
    seasonStartStr: utils.seasonStartStr,
    localDateStr: utils.localDateStr,
    bodyMapHtml: utils.bodyMapHtml,
    avatarHtmlGlobal: (u, cls) => '<span class="' + cls + ' ' + cls + '-ph">M</span>',
    posCirclesHtmlGlobal: () => '<span class="conv-pos-circle">DM</span>',
    BODY_ZONES: utils.BODY_ZONES,
    ZONE_CA: utils.ZONE_CA,
    GROUP_SUBS: utils.GROUP_SUBS,
    zoneLabelCa: utils.zoneLabelCa,
    groupLabelCa: utils.groupLabelCa,
    muscleLabelCa: utils.muscleLabelCa,
    playerIsCalled: () => true,
    storage: { ref: () => ({}) },
    t: (k) => k,
    tv: (k, v) => k + ':' + JSON.stringify(v),
    tDateDayMonth: (d) => 'dm(' + d + ')',
    tDateDMY: (d) => 'dmy(' + d + ')',
  }, o.stubs || {});
  // eslint-disable-next-line no-new-func
  return new Function(...Object.keys(api), `
    ${SANITIZE_SRC}
    ${grab('  const MD2_SHOW_HEATMAP = true;', '  function renderMedical() {')}
    ${grab('  /** One donut, three sizes', '  /** The weekday-over-day-number stack')}
    ${grab('  function buildInjuryHistoryHtml(uid, opts) {', '  /**\n   * The Ready cell')}
    ${grab('  /* ── Les meves estadístiques, redesigned (v244)', '  function renderStaffPlayerStats() {')}
    return renderPlayerStats();`)(...Object.values(api));
}

// ═══════════════════════════════════════════════════════════════════════════
describe('Les meves estadístiques — the page renders at all', () => {
  /* ⚠ THE ONE THAT CANNOT BE SKIPPED. A builder that throws on its fifth line
     passes every assertion that only reads its source, and `node --check`
     cannot see it either. */
  it('builds a page, not an exception', () => {
    const h = render();
    assert.ok(h.includes('id="ms-page"'), 'no page root');
    assert.ok(h.length > 2000, 'the page is suspiciously short: ' + h.length);
  });

  it('is reachable, and only by a player', () => {
    assert.ok(/'my-stats': renderPlayerStats/.test(bare), 'the route is gone');
    const items = bare.slice(bare.indexOf('function buildSidebarItems'));
    const i = items.indexOf("id: 'my-stats'");
    assert.ok(i > -1, 'the sidebar entry is gone');
    assert.ok(items.slice(0, i).lastIndexOf("roles.includes('player')") >
        items.slice(0, i).lastIndexOf("roles.includes('staff')"),
    'the my-stats entry left the player-only branch');
  });

  it('names every ms.* key it renders in all three languages', () => {
    const used = [...new Set((bare.match(/'ms\.[a-z_0-9]+'/g) || [])
        .map((s) => s.slice(1, -1)))];
    assert.ok(used.length > 20, 'only ' + used.length + ' ms.* keys are used');
    const table = src.slice(src.indexOf("'ms.matches':"), src.indexOf("// ── Match History ──"));
    used.forEach((k) => {
      const j = table.indexOf("'" + k + "':");
      assert.ok(j !== -1, k + ' is rendered but not translated');
      const entry = table.slice(j, table.indexOf('},', j));
      ['ca:', 'es:', 'en:'].forEach((lang) => {
        assert.ok(entry.includes(lang), k + ' has no ' + lang.slice(0, 2));
      });
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe('Les meves estadístiques — no RPE reaches the player', () => {
  /* ⚠ THE PRODUCT DECISION, and the only thing on this page that a later edit
     could undo with nothing else misbehaving. Owner's roadmap 22. */
  it('renders no RPE figure, key or label in any frame', () => {
    [render(), render({ rd: NO_DATA })].forEach((h) => {
      assert.ok(!/rpe/i.test(h), 'an RPE reached the player: ' +
          (h.match(/.{0,40}rpe.{0,40}/i) || [])[0]);
    });
  });

  it('renders none of the four Readiness components, which are their weights', () => {
    const h = render();
    /* The numbers, not the field names: 100/62/80/71 are the component scores
       in the fixture and none of them is a figure this page shows. */
    ['loadRatioScore', 'matchFatigueScore', 'loadSpikeScore', 'rpeTrendScore',
      'readiness.load_ratio', 'readiness.match_fatigue', 'readiness.load_spike',
      'readiness.rpe_trend'].forEach((k) => {
      assert.ok(!h.includes(k), k + ' reached the player');
    });
    assert.ok(!/>\s*62\s*</.test(h), 'a component SCORE reached the player');
  });

  it('reads only the four derived fields off computeReadiness', () => {
    const body = bare.slice(bare.indexOf('function renderPlayerStats() {'),
        bare.indexOf('function renderStaffPlayerStats'));
    const reads = [...new Set((body.match(/\brd\.[a-zA-Z]+/g) || []))].sort();
    assert.deepStrictEqual(reads, ['rd.acwr', 'rd.color', 'rd.hasData',
      'rd.matchDaysSince', 'rd.score'],
    'the page started reading something else off the Readiness object');
  });

  it('builds no chart, and leaves buildChartsHtml to the staff page', () => {
    const h = render();
    assert.ok(!h.includes('<svg') || !/polyline|<rect/.test(h),
        'a chart was drawn on the player page');
    assert.strictEqual(
        (bare.match(/buildChartsHtml\(/g) || []).length, 2,
        'buildChartsHtml has more or fewer than its declaration plus the staff call');
    assert.ok(!/buildReadinessCard/.test(
        bare.slice(bare.indexOf('function renderPlayerStats() {'),
            bare.indexOf('function renderStaffPlayerStats'))),
    'the Readiness card, which lists the components, is back on this page');
  });

  it('still leaves all three charts on the STAFF page, where they belong', () => {
    const staff = bare.slice(bare.indexOf('function renderStaffPlayerStats'));
    assert.ok(staff.includes('buildChartsHtml('), 'the coach lost the charts');
    assert.ok(staff.includes('buildReadinessCard('), 'the coach lost the components');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe('Les meves estadístiques — no MVP, because there is no voting', () => {
  it('draws no star and no MVP figure', () => {
    const h = render();
    assert.ok(!/MVP/i.test(h), 'an MVP label reached the page');
    assert.ok(!/★|\bstar\b/i.test(h), 'a star reached the page');
  });

  it('has no MVP hook in the source to be switched on by accident', () => {
    const body = bare.slice(bare.indexOf('function msFig('),
        bare.indexOf('function renderStaffPlayerStats'));
    assert.ok(!/mvp/i.test(body), 'an MVP branch is waiting in the page builder');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe('Les meves estadístiques — the season figures', () => {
  it('shows the five figures the handoff asks for', () => {
    const h = render();
    ['ms.matches', 'ms.minutes', 'ms.goals', 'ms.assists', 'ms.titular']
        .forEach((k) => assert.ok(h.includes(k), k + ' is missing'));
    assert.strictEqual((h.match(/class="ms-fig"/g) || []).length, 5 + 1,
        'the five season figures plus Preparació are not what is drawn');
  });

  it('counts the matchdays over the SAME window as the totals beside them', () => {
    /* A season-bounded denominator next to unbounded totals reads as a bug:
       `Partits 6` beside `3 jornades disputades`. */
    /* The stub tv() hands back JSON, and sanitize() turns its quotes into
       `&quot;` — which is what a browser is served, so it is what is matched. */
    const h = render();
    assert.ok(h.includes('ms.jornades:{&quot;n&quot;:6}'),
        'the matchday count disagrees with the Partits figure: ' +
        (h.match(/ms\.jornades:\S{0,30}/) || [])[0]);
  });

  it('counts attendance over ANSWERED sessions, not every session', () => {
    const h = render();
    // 16 yes + 3 late = 19 of 22 answered; 3 injured are the excused ones.
    assert.ok(h.includes('ms.sessions_of:{&quot;a&quot;:19,&quot;b&quot;:22}'), 'the ratio moved');
    assert.ok(h.includes('ms.absences:{&quot;n&quot;:3}'), 'the excused count moved');
    assert.ok(h.includes('>86%<'), 'the donut percentage moved');
  });

  it('says so rather than drawing 0% when nothing has been answered', () => {
    const h = render({ stubs: { getEffectiveAnswer: () => 'na' } });
    assert.ok(h.includes('ms.no_sessions'), 'a 0% donut stands in for no data');
    assert.ok(!h.includes('ms.sessions_of'), 'a ratio was drawn over nothing');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe('Les meves estadístiques — Preparació', () => {
  it('shows the score, the band word and the sentence', () => {
    const h = render();
    assert.ok(h.includes('ms-prep-green'), 'the band colour is missing');
    assert.ok(h.includes('>79<'), 'the score is missing');
    assert.ok(h.includes('ms.band_good'), 'the band word is missing');
    assert.ok(h.includes('ms.prep_help'), 'the explanation is missing');
    assert.ok(h.includes('>1.12<'), 'the acute/chronic ratio is missing');
    assert.ok(h.includes('>7<'), 'the days since the last match are missing');
  });

  it('colours the band from rd.color and nothing else', () => {
    assert.ok(render({ rd: Object.assign({}, READY, { color: 'orange' }) })
        .includes('ms-prep-orange'));
    assert.ok(render({ rd: Object.assign({}, READY, { color: 'red' }) })
        .includes('ms-prep-red'));
  });

  /* ⚠ A green 0 is worse than no answer: it tells a player they are fine on
     the strength of nothing. */
  it('says there is not enough data rather than showing a confident zero', () => {
    const h = render({ rd: NO_DATA });
    assert.ok(h.includes('ms.prep_none'), 'the no-data wording is missing');
    assert.ok(h.includes('ms-prep-none'), 'the no-data figure is still coloured');
    assert.ok(!h.includes('ms.band_good'), 'a band word was drawn with no data');
    assert.ok(!/>0</.test(h.slice(h.indexOf('ms-prep-v'), h.indexOf('ms-prep-help'))),
        'a zero was drawn as the score');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe('Les meves estadístiques — partit a partit', () => {
  it('builds both frames from one row object, so they cannot disagree', () => {
    const h = render();
    assert.strictEqual((h.match(/class="ms-row"/g) || []).length, 6);
    assert.strictEqual((h.match(/class="ms-prow"/g) || []).length, 6);
  });

  it('names the RIVAL, not our own side, whichever way round the fixture is', () => {
    const h = render();
    assert.ok(h.includes('>CF Sants<'), 'an away fixture lost its rival');
    assert.ok(h.includes('>UE Poble Sec<'), 'a home fixture lost its rival');
    assert.ok(!/>CE L&#039;Esquerra<|>CE L'Esquerra</.test(h),
        'our own club name is printed as the rival');
  });

  it('tags the venue from which side we are on', () => {
    const h = render();
    const first = h.slice(h.indexOf('CF Sants'), h.indexOf('UE Poble Sec'));
    assert.ok(first.includes('ms.away'), 'an away fixture is tagged CASA');
    const second = h.slice(h.indexOf('UE Poble Sec'), h.indexOf('CE Gràcia'));
    assert.ok(second.includes('ms.home'), 'a home fixture is tagged FORA');
  });

  it('colours the result tag from the letter', () => {
    const h = render();
    assert.strictEqual((h.match(/ms-res-v/g) || []).length, 3 * 2, 'wins');
    assert.strictEqual((h.match(/ms-res-e/g) || []).length, 2 * 2, 'draws');
    assert.strictEqual((h.match(/ms-res-d/g) || []).length, 1 * 2, 'losses');
  });

  /* An empty cell reads as "not recorded", which is a different statement
     from "none". The em-dash is the one that says none. */
  it('draws an em-dash for a zero and a figure for anything else', () => {
    const h = render();
    const row = h.slice(h.indexOf('AD Clot'), h.indexOf('CF Vallcarca'));
    assert.strictEqual((row.match(/ms-nil/g) || []).length, 3,
        'goals, assists and cards should all be em-dashes on a blank row');
    /* The scored row keeps ONE dash — it has no cards — and must not have
       three. Bounded to the row's own goals and assists cells. */
    const scored = h.slice(h.indexOf('UE Poble Sec'), h.indexOf('ms-c-cards', h.indexOf('UE Poble Sec')));
    assert.ok(!scored.includes('ms-nil'), 'a row with a goal and an assist has a dash');
  });

  it('uses the real card assets, and only where there are cards', () => {
    const h = render();
    assert.strictEqual((h.match(/img\/groga\.png/g) || []).length, 2 * 2,
        'two yellows across two frames');
    assert.strictEqual((h.match(/img\/vermella\.png/g) || []).length, 1 * 2,
        'one red across two frames');
  });

  it('shows a prime on the minutes and survives an NC', () => {
    const h = render();
    // sanitize() escapes the apostrophe, so the prime ships as `&#39;`.
    assert.ok(h.includes('>78&#39;<'), 'the prime is missing');
    const nc = render({ rows: [Object.assign({}, ROWS[0], { minutes: 'NC' })] });
    assert.ok(nc.includes('>NC<'), 'a not-called row lost its minutes');
  });

  it('answers "no matches yet" rather than drawing an empty table', () => {
    const h = render({ rows: [], totals: { goals: 0, assists: 0, matches: 0, minutes: 0, titulars: 0 } });
    assert.ok(h.includes('ms.no_matches'), 'the empty state is missing');
    assert.ok(!h.includes('class="ms-head"'), 'a header was drawn over no rows');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe('Les meves estadístiques — the body map lights ONE side', () => {
  /* ⚠ THE v235 DEFECT, and the handoff's own sample script reproduces it:
     `counts[z.label]` fills every polygon sharing a label, so one torn
     hamstring lights both legs. BODY_ZONES holds each zone twice. */
  it('fills the injured zone only, never its mirror', () => {
    const h = render();
    assert.ok(HAM > -1 && HAM2 > -1 && HAM2 !== HAM,
        'the fixture needs two Hamstring polygons to be worth anything');
    const polys = h.match(/<polygon[^>]*>/g) || [];
    assert.strictEqual(polys.length, utils.BODY_ZONES.length);
    const filled = polys.filter((p) => /rgba\(var\(--pp-bad-rgb\)/.test(p));
    assert.strictEqual(filled.length, 2,
        'expected exactly the hamstring and the calf to be filled, got ' + filled.length);
    assert.ok(/rgba\(var\(--pp-bad-rgb\), \.5\)/.test(polys[HAM]),
        'two injuries in one zone should be the darker fill');
    assert.ok(!/rgba\(var\(--pp-bad-rgb\)/.test(polys[HAM2]),
        'THE MIRROR ZONE IS FILLED — the map is matching by label again');
    assert.ok(/rgba\(var\(--pp-bad-rgb\), \.22\)/.test(polys[CALF]),
        'one injury should be the lighter fill');
  });

  it('counts by index through md2ZoneIdx, not by label', () => {
    const fn = bare.slice(bare.indexOf('function msZoneCounts'),
        bare.indexOf('function msBodyMapHtml'));
    assert.ok(fn.includes('md2ZoneIdx(inj)'), 'the counter stopped using the index');
    assert.ok(!/\.label/.test(fn), 'the counter is reading a label again');
  });

  it('draws no map at all for a player who has never been hurt', () => {
    const h = render({ injuries: [] });
    assert.ok(!h.includes('ms-map-box'), 'an empty body map was drawn');
    assert.ok(h.includes('md2.my_fit'), 'the fit state is missing');
  });

  it('keeps the map out of the way of the hover popup', () => {
    // Not interactive: `interactive: true` is what adds the md2 hover hooks.
    const h = render();
    assert.ok(!h.includes('md2-map-live'), 'the season map became clickable');
    assert.ok(h.includes('mystats-inj-row'), 'the hover popup lost its rows');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe('Les meves estadístiques — the injury history is still zone-only', () => {
  /* The privacy rule lives in buildInjuryHistoryHtml and is covered in
     test/medical.test.js; what THIS suite owns is that the page still calls
     it with the flag, through the page that a player actually opens. */
  it('ships the zone and the dates and nothing else', () => {
    const h = render();
    assert.ok(h.includes('Isquiotibials'), 'the zone is missing');
    assert.ok(!h.includes('Bíceps femoral'), 'the muscle reached the player');
    assert.ok(!h.includes('Biceps Femoris'), 'the muscle key reached the player');
    assert.ok(!/md2-sev-\d/.test(h), 'the severity reached the player');
    assert.ok(h.includes('md2.privacy_zone'), 'the privacy note is missing');
  });

  it('passes the map through the slot rather than rebuilding the block', () => {
    assert.ok(/buildInjuryHistoryHtml\(uid, \{ forPlayer: true, mapHtml:/.test(bare),
        'the page stopped reusing the shared injury block');
    const fn = bare.slice(bare.indexOf('function buildInjuryHistoryHtml'),
        bare.indexOf('function playerStatusHtml'));
    assert.ok(fn.includes('opts.mapHtml'), 'the slot is gone from the shared builder');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe('Les meves estadístiques — the stylesheet', () => {
  it('has its own block, after Mèdic', () => {
    assert.ok(MSSTART > css.indexOf('/* ===== Mèdic, redesigned (v234)'),
        'the .ms- block moved above Mèdic; medical.test.js bounds its slice on it');
    assert.ok(MSCSS.includes('.ms-page {'), 'the page root is gone');
  });

  it('scopes every class it borrows under its own root', () => {
    /* ⚠ Unscoped, these repaint Convocatòria and Mèdic. The rule the other
       eight blocks follow: a borrowed family lives under this page's root. */
    ['conv-pos-circle', 'md2-mine', 'ini-donut'].forEach((cls) => {
      const uses = MSCSS.match(new RegExp('^[^\\n{]*\\.' + cls + '[^\\n{]*\\{', 'gm')) || [];
      assert.ok(uses.length, '.' + cls + ' is no longer styled here at all');
      uses.forEach((sel) => {
        assert.ok(/\.ms-page|\.ms-attend|\.ms-pm-|\.ms-row/.test(sel),
            'unscoped borrowed selector, it will repaint another page: ' + sel.trim());
      });
    });
  });

  /* ⚠ The full-bleed negation is NOT in this block any more. It was one of
     ten copies of the same rule, and they had drifted into two camps — see
     test/layout.test.js, which owns it now for all ten roots at once. What
     stays here is that this block declares no margin of its own, because a
     local one would silently outrank the shared rule for this page only. */
  it('leaves the page geometry to the shared rule', () => {
    /* ⚠ `\s*\{`, not `[^{]*\{` — the latter happily crosses a `}` and finds a
       margin in some later rule entirely. */
    assert.ok(!/\.ms-page\s*\{[^}]*margin\s*:/.test(MSCSS),
        'the .ms- block set its own root margin again; layout.test.js owns it');
  });

  it('picks ONE row markup per frame instead of reordering a shared one', () => {
    const at700 = MSCSS.slice(MSCSS.indexOf('@media (max-width: 700px)'));
    assert.ok(/\.ms-head,\s*\.ms-rows\s*\{\s*display:\s*none/.test(at700),
        'the wide table is still drawn on the phone');
    assert.ok(/\.ms-prows\s*\{\s*display:\s*block/.test(at700),
        'the phone rows are not shown on the phone');
    /* `order:` is what put a Convocatòria button in front of its own count. */
    assert.ok(!/\border:\s*-?\d/.test(MSCSS), 'a row is being reordered by CSS');
  });

  it('takes the win tag from the medical fit pair rather than a second green', () => {
    assert.ok(/\.ms-res-v\s*\{[^}]*#DCE9DC/.test(MSCSS),
        'the win tag grew its own near-identical green');
    assert.ok(/\.ms-res-d\s*\{[^}]*#F2D2CE/.test(MSCSS), 'the loss tag moved');
  });

  /* ⚠ readCss() RESOLVES the tokens, which is the point of it — a colour
     assertion should test the colour and not the token name. So the two legend
     swatches are matched at their resolved value here, and the token spelling
     is checked against the RAW stylesheet, which is where the loose-literal
     scan in paper-palette.test.js would otherwise be the only guard. */
  /* ⚠ ONE GEOMETRY, TWO FILLS — the `.pp-av` idiom. avatarHtmlGlobal() emits
     `class="ms-face ms-face-ph"` for the placeholder and `class="ms-face"` for
     a photo, so the size and the round belong on the BASE class alone. A
     `-ph` that restates them is how a placeholder comes to be a different
     shape from the photo it stands in for, which is the whole reason that
     helper takes its modifier as a separate argument. */
  it('rounds the face on the base class, and only there', () => {
    const base = MSCSS.slice(MSCSS.indexOf('.ms-face {'), MSCSS.indexOf('.ms-face-ph {'));
    assert.ok(/border-radius:\s*50%/.test(base), 'the face is square again');
    assert.ok(/width:\s*96px/.test(base), 'the base class lost its size');
    const ph = MSCSS.slice(MSCSS.indexOf('.ms-face-ph {'));
    const phBody = ph.slice(0, ph.indexOf('}'));
    assert.ok(!/border-radius|width:|height:/.test(phBody),
        'the placeholder restates geometry and can now drift out of round');
    // The narrow override resizes; it must not re-declare the round either.
    const narrow = MSCSS.slice(MSCSS.indexOf('@media (max-width: 700px)'));
    assert.ok(!/\.ms-face-ph\s*\{[^}]*width/.test(narrow),
        'the narrow override sizes the placeholder separately from the photo');
  });

  it('routes every injury alpha through the --pp-bad triple', () => {
    assert.ok(MSCSS.includes('rgba(192,86,76, .5)'), 'the 2+ swatch moved');
    assert.ok(MSCSS.includes('rgba(192,86,76, .22)'), 'the 1 swatch moved');
    const rawMs = readCssRaw().slice(readCssRaw().indexOf(MSBANNER));
    assert.ok(!/rgba\(\s*192,\s*86,\s*76/.test(rawMs),
        'a literal rgba() copy of --pp-bad appeared in the .ms- block');
  });
});
