/* Player metrics — weight, height and fitness tests (v236).
 * `npm run test:metrics`
 *
 * ⚠ WHAT THIS SUITE IS ACTUALLY FOR.
 *
 * The feature is two stores that must behave in opposite ways, and every
 * assertion below defends one of the two:
 *
 *   · a MEASUREMENT follows the player across squads and seasons, so it
 *     carries no category and nothing may ever put one on it; and
 *   · a DEFINITION belongs to the squad that made it, so it is
 *     category-sharded and must never be written without one.
 *
 * Three failures here are silent in production and none of them looks like
 * a bug from the outside:
 *
 *  1. **A promoted player's history splitting in two.** cadet's "Pes" and
 *     juvenil's "Pes" are different catalogue rows with different ids, so a
 *     chart keyed on `metricId` shows two disjoint series with the same
 *     name — and the coach who now needs the history cannot even read the
 *     catalogue shard that names the older half. Grouping by SLUG and
 *     denormalising name/unit onto the record is what prevents it.
 *  2. **A metric created with no squad.** It routes to the `__none` shard,
 *     which firestore.rules makes readable by every member of the club,
 *     players included. Nothing on screen would say so.
 *  3. **Two readings on one day merging into one.** DB.submit writes with
 *     {merge:true}, so a shared document id is not an error — the second
 *     reading quietly overwrites the first and the first also vanishes from
 *     the local cache.
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');
const { readCss, readCssRaw } = require('./read-css');
const Shard = require('../js/shard.js');

const src = fs.readFileSync(path.join(__dirname, '..', 'js', 'app.js'), 'utf8');
const dbSrc = fs.readFileSync(path.join(__dirname, '..', 'js', 'db.js'), 'utf8');
const rules = fs.readFileSync(path.join(__dirname, '..', 'firestore.rules'), 'utf8');
const fnSrc = fs.readFileSync(path.join(__dirname, '..', 'functions', 'index.js'), 'utf8');
const css = readCss();
const bare = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

function grab(from, to) {
  const i = src.indexOf(from);
  const j = src.indexOf(to, i);
  assert.ok(i !== -1 && j !== -1, 'marker not found in js/app.js: ' + from);
  return src.slice(i, j);
}

/* The `.plm-` block, bounded at both ends. ⚠ It sits INSIDE the Plantilla
   region rather than at the foot of the file, because test/medical.test.js
   slices `.md2-` to the end of the stylesheet — anything appended after that
   banner is read as Mèdic's and trips its scans. */
const PLMSTART = css.indexOf('/* ===== Player metrics');
assert.ok(PLMSTART !== -1, 'the plm- block banner is gone from css/style.css');
const PLMEND = css.indexOf('.reg2-sub', PLMSTART);
assert.ok(PLMEND !== -1 && PLMEND > PLMSTART, 'the plm- block has no end bound');
const PLMCSS = css.slice(PLMSTART, PLMEND).replace(/\/\*[\s\S]*?\*\//g, '');
const rawCss = readCssRaw();
const RAWSTART = rawCss.indexOf('/* ===== Player metrics');
const PLMRAW = rawCss.slice(RAWSTART, rawCss.indexOf('.reg2-sub', RAWSTART))
    .replace(/\/\*[\s\S]*?\*\//g, '');

const SANITIZE_SRC = (() => {
  const u = fs.readFileSync(path.join(__dirname, '..', 'js', 'utils.js'), 'utf8');
  return u.slice(u.indexOf('function sanitize(str) {'),
      u.indexOf('// ---------- Tactical Formations ----------'));
})();

const DATA = grab('  const PLM_BUILTIN = [', '  // ---------- Injury helpers ----------');
const CHART = grab('  const PLM_GEO = {', '  /* ---------- Metrics: the two views');

/** The pure data helpers, over a fake localStorage. */
function loadData(store) {
  const dom = new JSDOM('<!doctype html><body></body>');
  const api = {
    document: dom.window.document,
    localStorage: {
      getItem: (k) => (k in store ? store[k] : null),
      setItem: (k, v) => { store[k] = v; },
    },
    t: (k) => k,
    ackSave: (k, v) => { store[k] = v; return Promise.resolve(); },
    JSON, Object, String, Number, Array, Math, Set, Promise, Date,
  };
  // eslint-disable-next-line no-new-func
  return new Function(...Object.keys(api), `
    ${DATA}
    return { PLM_BUILTIN, plmName, plmSlug, getMetricCatalog, saveMetricCatalog,
             metricsForSquad, getPlayerMetrics, playerMetricSeries };
  `)(...Object.values(api));
}

// ═══════════════════════════════════════════════════════════════════════════
describe('metrics — the two stores pull opposite ways, on purpose', () => {
  /* ⚠ THE CENTRAL PROPERTY. A record with a category would be resharded on
     promotion, or frozen where it was measured — either way the history
     stops following the player, which is the one thing that was asked for. */
  it('puts no category on a measurement, anywhere', () => {
    const coll = dbSrc.slice(dbSrc.indexOf('playerMetrics: {'),
        dbSrc.indexOf('};', dbSrc.indexOf('playerMetrics: {')));
    assert.ok(!/category/.test(coll.replace(/\/\*[\s\S]*?\*\//g, '')),
        'the record cache maps a category — the history will stop following the player');
    const write = bare.slice(bare.indexOf('function showAddMetric'),
        bare.indexOf('function showAddMetric') + 6000);
    const rec = write.slice(write.indexOf('const rec = {'), write.indexOf('};', write.indexOf('const rec = {')));
    assert.ok(!/category/.test(rec), 'the written record carries a category');
    assert.ok(/uid:/.test(rec) && /metricId:/.test(rec) && /slug:/.test(rec) &&
      /name:/.test(rec) && /unit:/.test(rec) && /value:/.test(rec) && /date:/.test(rec),
    'a field is missing from the written record');
  });

  it('puts a category on a DEFINITION, and shards on it', () => {
    assert.deepStrictEqual(Shard.ROUTES.fa_metric_catalog,
        { shape: 'array', by: 'field', field: 'category', id: 'id' });
    const write = bare.slice(bare.indexOf('function showAddMetric'));
    const def = write.slice(write.indexOf('metric = {'), write.indexOf('};', write.indexOf('metric = {')));
    assert.ok(/category: cat/.test(def), 'a definition is written without its category');
    assert.ok(/team: letter/.test(def), 'a definition is written without its squad letter');
  });

  /* ⚠ The squad LETTER cannot be a shard — SEP splits `key__cat`, _absorbDoc
     rejects any cat outside ORDER, and the claims carry categories only. It
     is a plain field, so this is a UI filter and not a boundary. */
  it('keeps the letter as a field the router never sees', () => {
    const parts = Shard.partition('fa_metric_catalog',
        [{ id: 'm1', category: 'cadet', team: 'A', name: 'CMJ' },
          { id: 'm2', category: 'cadet', team: 'B', name: 'CMJ' }],
        { userCat: () => '', matchCat: () => '' }, null);
    assert.deepStrictEqual(Object.keys(parts), ['cadet'], 'the letter split the shard');
    assert.strictEqual(parts.cadet.length, 2);
  });

  it('survives the season rollover by being in neither destructive list', () => {
    const seasonKeys = fnSrc.slice(fnSrc.indexOf('const SEASON_KEYS = ['),
        fnSrc.indexOf('];', fnSrc.indexOf('const SEASON_KEYS = [')));
    assert.ok(!/fa_metric_catalog/.test(seasonKeys),
        'the catalogue is archived and reset every season');
    /* The record loop archiveSeason empties. `playerMetrics` must not be in
       it — being in neither list IS the "keep everything" behaviour. */
    const archLoop = fnSrc.slice(fnSrc.indexOf('for (const coll of ["trainingAvail", "matchAvail", "rpe", "matchNotes"]'));
    assert.ok(archLoop.startsWith('for (const coll of ["trainingAvail", "matchAvail", "rpe", "matchNotes"]'),
        'the archive record loop moved — check playerMetrics is still out of it');
  });

  it('is cleaned up when a member or a team goes', () => {
    assert.strictEqual(
        (fnSrc.match(/"trainingAvail", "matchAvail", "rpe", "playerMetrics"/g) || []).length, 2,
        'deleteMember and deleteTeam must BOTH scrub the records');
    /* ⚠ `await`, not merely "the call appears somewhere". Wrapped in an
       `if (false)` the bare name still matches and the scrub never runs —
       which is exactly what a mutation of this line looked like. */
    assert.ok(/\n\s*await scrubShards\(shards, "fa_metric_catalog",/.test(fnSrc),
        'a deleted squad leaves its metric definitions behind');
  });
});

describe('metrics — the catalogue', () => {
  it('offers the two built-ins without storing them', () => {
    const H = loadData({});
    const list = H.metricsForSquad('cadet', 'A');
    assert.deepStrictEqual(list.map((m) => m.slug), ['weight', 'height']);
    assert.ok(list.every((m) => m.builtin));
    assert.deepStrictEqual(H.getMetricCatalog(), [],
        'a built-in was written to the catalogue — it must not be');
  });

  /* ⚠ RESERVED, LITERAL IDS. Comparing two metricsForSquad() calls cannot
     catch a per-squad id: PLM_BUILTIN is a const evaluated once, so both
     calls hand back the same object however it was built. The ids have to
     be pinned as the constants they are — a generated one would put cadet's
     Pes and juvenil's Pes on different keys and split a promoted player's
     weight history in two. */
  it('reserves the built-in ids as literals, club-wide', () => {
    const H = loadData({});
    assert.deepStrictEqual(H.PLM_BUILTIN.map((m) => m.id), ['weight', 'height']);
    assert.deepStrictEqual(H.PLM_BUILTIN.map((m) => m.unit), ['kg', 'cm']);
    H.PLM_BUILTIN.forEach((m) => {
      assert.strictEqual(m.id, m.slug, 'a built-in id must be its own slug');
    });
    const decl = src.slice(src.indexOf('const PLM_BUILTIN = ['),
        src.indexOf('];', src.indexOf('const PLM_BUILTIN = [')));
    assert.ok(!/Date\.now|Math\.random|cat|letter/.test(decl),
        'a built-in id is generated or squad-dependent — the history will split');
  });

  /* ⚠ THE REASON THEY ARE CONSTANTS. Seeded per squad they would be
     different rows with different ids, so a promoted player's weight history
     would split in two — and the new coach cannot read the old category's
     catalogue shard to name the older half. */
  it('gives the built-ins one id across every squad', () => {
    const H = loadData({});
    const a = H.metricsForSquad('cadet', 'A').find((m) => m.slug === 'weight');
    const b = H.metricsForSquad('juvenil', 'B').find((m) => m.slug === 'weight');
    assert.strictEqual(a.id, b.id);
    assert.strictEqual(a.unit, b.unit);
  });

  it('shows a custom metric to its own squad and to nobody else', () => {
    const store = { fa_metric_catalog: JSON.stringify([
      { id: 'm1', slug: 'cmj', name: 'CMJ', unit: 'cm', category: 'cadet', team: 'A' },
    ]) };
    const H = loadData(store);
    assert.ok(H.metricsForSquad('cadet', 'A').some((m) => m.slug === 'cmj'));
    assert.ok(!H.metricsForSquad('cadet', 'B').some((m) => m.slug === 'cmj'),
        'the other letter was offered it');
    assert.ok(!H.metricsForSquad('juvenil', 'A').some((m) => m.slug === 'cmj'),
        'the other category was offered it');
  });

  it('slugs a name down to something two squads can agree on', () => {
    const H = loadData({});
    assert.strictEqual(H.plmSlug('CMJ'), 'cmj');
    assert.strictEqual(H.plmSlug('  Drop Jump  '), 'drop-jump');
    // Accents stripped, so "Alçada màx." and "Alcada max" are one metric.
    assert.strictEqual(H.plmSlug('Alçada màx.'), 'alcada-max');
    assert.strictEqual(H.plmSlug('Salt vertical'), 'salt-vertical');
    assert.strictEqual(H.plmSlug(''), '');
  });

  it('translates a built-in and shows a custom metric as typed', () => {
    const H = loadData({});
    assert.strictEqual(H.plmName({ id: 'weight', builtin: true }), 'plm.weight');
    assert.strictEqual(H.plmName({ id: 'm1', name: 'CMJ' }), 'CMJ');
  });
});

describe('metrics — a promoted player keeps his history', () => {
  /* The whole point of the feature, and the thing that breaks silently. */
  const store = {
    fa_player_metrics: JSON.stringify({
      // Measured in cadet, under cadet's OWN catalogue row...
      d1: { uid: 'p1', metricId: 'm_cadet', slug: 'cmj', name: 'CMJ', unit: 'cm',
        value: 31, date: '2026-02-01' },
      // ...and again in juvenil, under a DIFFERENT row with a different id.
      d2: { uid: 'p1', metricId: 'm_juv', slug: 'cmj', name: 'CMJ', unit: 'cm',
        value: 34, date: '2026-06-01' },
      d3: { uid: 'p2', metricId: 'm_juv', slug: 'cmj', name: 'CMJ', unit: 'cm',
        value: 29, date: '2026-06-01' },
    }),
    fa_metric_catalog: JSON.stringify([
      { id: 'm_juv', slug: 'cmj', name: 'CMJ', unit: 'cm', category: 'juvenil', team: 'A' },
    ]),
  };

  it('groups the two squads\' readings into one series', () => {
    const H = loadData(store);
    const s = H.playerMetricSeries('p1', 'cmj');
    assert.strictEqual(s.length, 2, 'the history split at the category boundary');
    assert.deepStrictEqual(s.map((r) => r.value), [31, 34], 'and it is in date order');
  });

  it('does not mix two players together', () => {
    const H = loadData(store);
    assert.strictEqual(H.playerMetricSeries('p2', 'cmj').length, 1);
  });

  /* ⚠ The cadet catalogue row is NOT in the store — a juvenil coach cannot
     read that shard, which is exactly the situation. The reading still has
     to render with a name and a unit, and it can only get them from itself. */
  it('names a reading whose defining row it cannot read', () => {
    const H = loadData(store);
    const old = H.playerMetricSeries('p1', 'cmj')[0];
    assert.strictEqual(old.name, 'CMJ', 'the older reading lost its label');
    assert.strictEqual(old.unit, 'cm', 'the older reading lost its unit');
    assert.ok(!H.getMetricCatalog().some((m) => m.id === old.metricId),
        'the fixture no longer models an unreadable definition');
  });

  /* ⚠ The assertion above reads a FIXTURE that already carries name and
     unit, so it proves nothing about the mapping that puts them there. This
     one drives db.js's own toEntry — drop `name` from it and the older
     reading renders as a bare number with no label and no unit, which is the
     requirement quietly not met. */
  it('carries the label through the record cache, not just the fixture', () => {
    const decl = dbSrc.slice(dbSrc.indexOf('playerMetrics: {'),
        dbSrc.indexOf('\n    }', dbSrc.indexOf('playerMetrics: {')));
    const body = decl.slice(decl.indexOf('toEntry:'));
    // eslint-disable-next-line no-new-func
    const toEntry = new Function('return ' + body.replace(/^toEntry:\s*/, ''))();
    const out = toEntry({ uid: 'p1', metricId: 'm_old', slug: 'cmj', name: 'CMJ',
      unit: 'cm', value: 31, date: '2026-02-01', category: 'cadet' });
    assert.strictEqual(out.name, 'CMJ', 'the cache drops the label');
    assert.strictEqual(out.unit, 'cm', 'the cache drops the unit');
    assert.strictEqual(out.slug, 'cmj', 'the cache drops the slug the chart groups on');
    assert.strictEqual(out.value, 31);
    assert.strictEqual(out.date, '2026-02-01');
    assert.ok(!('category' in out),
        'the cache carried a category through — that is what freezes the history');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe('metrics — the chart', () => {
  const dom = new JSDOM('<!doctype html><body></body>');
  const api = {
    document: dom.window.document,
    t: (k) => k, tv: (k, v) => k + ':' + JSON.stringify(v),
    localDateStr: (d) => {
      const x = d || new Date();
      return x.getFullYear() + '-' + String(x.getMonth() + 1).padStart(2, '0') +
        '-' + String(x.getDate()).padStart(2, '0');
    },
    plShortDate: (s) => s.slice(8) + '/' + s.slice(5, 7),
    plHitTip: (title, rows) => ' data-pl-tip="' + title + '|' + JSON.stringify(rows) + '"',
    JSON, Object, String, Number, Array, Math, Date,
  };
  // eslint-disable-next-line no-new-func
  const C = new Function(...Object.keys(api), `
    ${SANITIZE_SRC}
    ${CHART}
    return { plmChartHtml, plmNiceTicks, plmNum, PLM_GEO,
      plmSeries, plmSwatchHtml, PLM_SERIES_N };
  `)(...Object.values(api));

  const S = (uid, pts) => ({ uid, label: 'P' + uid, points: pts });

  /* ⚠ NOT ROUNDED, and the comment in the source explains why: three round
     ticks force a step of at least half the span, so a squad weighing 68–89
     was drawn on a 60–100 axis with every line squashed into the middle
     third. Found by rendering it. */
  it('fits the axis to the data instead of to round numbers', () => {
    const [lo, mid, hi] = C.plmNiceTicks(68, 89);
    assert.ok(lo < 68 && hi > 89, 'the data must sit inside the axis');
    assert.ok(lo > 65 && hi < 92, 'the axis is far wider than the data: ' + lo + '..' + hi);
    assert.strictEqual(mid, (lo + hi) / 2);
  });

  it('gives a single reading a band rather than dividing by zero', () => {
    const [lo, mid, hi] = C.plmNiceTicks(72, 72);
    assert.ok(isFinite(lo) && isFinite(hi) && hi > lo);
    assert.strictEqual(mid, 72);
  });

  /* ⚠ A true time axis is the whole reason this chart is not a clone of
     plRailRpeHtml. Two readings a week apart and two six months apart must
     not look the same. */
  it('spaces points by real elapsed time, not by index', () => {
    const html = C.plmChartHtml([S('a', [
      { date: '2026-01-01', value: 10 },
      { date: '2026-01-08', value: 11 },   // +7 days
      { date: '2026-07-08', value: 12 },   // +181 days
    ])], 'kg', 'page');
    const xs = [...html.matchAll(/<circle class="pl-hit" cx="([\d.]+)"/g)].map((m) => Number(m[1]));
    assert.strictEqual(xs.length, 3);
    const gap1 = xs[1] - xs[0], gap2 = xs[2] - xs[1];
    assert.ok(gap2 > gap1 * 10,
        'the six-month gap is drawn like the one-week gap: ' + gap1 + ' vs ' + gap2);
  });

  it('centres a series that happened all on one day', () => {
    const html = C.plmChartHtml([S('a', [
      { date: '2026-01-01', value: 10 }, { date: '2026-01-01', value: 12 },
    ])], 'cm', 'rail');
    const xs = [...html.matchAll(/<circle class="pl-hit" cx="([\d.]+)"/g)].map((m) => Number(m[1]));
    assert.ok(xs.every((x) => isFinite(x)), 'a same-day series produced NaN coordinates');
    assert.strictEqual(xs[0], xs[1]);
  });

  /* ⚠ Bridged, not zeroed. plRailRpeHtml drops an untrained session to zero
     on purpose — "a week off is a reading" — but a player who was not
     weighed in March did not weigh nothing. */
  it('joins the readings a player has and invents none', () => {
    const html = C.plmChartHtml([
      S('a', [{ date: '2026-01-01', value: 70 }, { date: '2026-03-01', value: 72 }]),
      S('b', [{ date: '2026-01-01', value: 80 }, { date: '2026-02-01', value: 81 },
        { date: '2026-03-01', value: 82 }]),
    ], 'kg', 'page');
    assert.strictEqual((html.match(/class="pl-hit"/g) || []).length, 5,
        'a point was invented or dropped');
    assert.ok(!/value="0"/.test(html));
  });

  it('draws one group per player, each with a fat hit path', () => {
    const html = C.plmChartHtml([
      S('a', [{ date: '2026-01-01', value: 1 }, { date: '2026-02-01', value: 2 }]),
      S('b', [{ date: '2026-01-01', value: 3 }, { date: '2026-02-01', value: 4 }]),
    ], '', 'page');
    assert.strictEqual((html.match(/class="plm-line"/g) || []).length, 2);
    assert.strictEqual((html.match(/class="plm-line-hit"/g) || []).length, 2,
        'a 1.6px stroke is not hoverable — each line needs its transparent twin');
    assert.ok(/data-plm-line="a"/.test(html) && /data-plm-line="b"/.test(html));
  });

  it('gives a one-point series no line, but keeps its dot', () => {
    const html = C.plmChartHtml([S('a', [{ date: '2026-01-01', value: 5 }])], '', 'rail');
    assert.ok(!/plm-line-hit/.test(html), 'a single point drew a line to nowhere');
    assert.strictEqual((html.match(/class="pl-hit"/g) || []).length, 1);
  });

  it('labels the axis in dates, as HTML rather than SVG text', () => {
    const html = C.plmChartHtml([S('a', [
      { date: '2026-01-01', value: 1 }, { date: '2026-06-01', value: 2 },
    ])], '', 'page');
    assert.ok(/class="plm-xlabels"/.test(html));
    assert.ok((html.match(/class="plm-xlab"/g) || []).length >= 2);
    /* ⚠ SVG <text> scales with the viewBox, so dates collide at one width
       and go illegible at another — written down at js/app.js:23801 and the
       reason every .pl- chart puts its x labels in HTML. */
    const svg = html.slice(html.indexOf('<svg'), html.indexOf('</svg>'));
    assert.ok(!/<text[^>]*>\d+\//.test(svg), 'a date was drawn as SVG text');
  });

  it('renders nothing at all when there is nothing to draw', () => {
    assert.strictEqual(C.plmChartHtml([], 'kg', 'page'), '');
    assert.strictEqual(C.plmChartHtml([S('a', [])], 'kg', 'page'), '');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe('metrics — who may do what', () => {
  const table = grab('  const STAFF_ROLE_ACCESS = {', '  /**\n   * What this session may do');
  const fitness = table.slice(table.indexOf('fitness:'), table.indexOf('delegate:'));
  const delegate = table.slice(table.indexOf('delegate:'));

  /* ⚠ The fitness coach has `manage-roster: 'view'` and always did. Gating
     metrics on that right would lock out the one role whose job this is;
     flipping it to 'edit' would hand them every field on the roster. */
  it('lets the fitness coach write metrics without opening the roster', () => {
    assert.ok(/'manage-roster': 'view'/.test(fitness), 'the premise changed');
    assert.ok(/'player-metrics': 'edit'/.test(fitness),
        'the fitness coach cannot enter the numbers that are their job');
  });

  it('keeps the delegate out, in writing', () => {
    assert.ok(/'player-metrics': 'hidden'/.test(delegate),
        "silence in that table means 'edit' — a delegate would inherit the right");
  });

  it('gates every write on that right and not on the page', () => {
    const ui = bare.slice(bare.indexOf('function plmRailHtml'), bare.indexOf('function showAddMetric'));
    assert.ok(/canEditPage\('player-metrics'\)/.test(ui));
    assert.ok(!/canEditPage\('manage-roster'\)/.test(ui), 'gated on the page instead of the right');
    const add = bare.slice(bare.indexOf('function showAddMetric'));
    assert.ok(/if \(!canEditPage\('player-metrics'\)\) return;/
        .test(add.slice(0, 300)), 'the sheet opens without checking');
  });

  it('reads and writes staff-only in the rules, unlike its neighbours', () => {
    /* ⚠ Bounded on the closing brace of the BLOCK, not on the first `}` —
       that one is inside `{docId}` and left `head` four words long, so every
       assertion below passed for the wrong reason until it was driven. */
    const from = rules.indexOf('match /playerMetrics/');
    const head = rules.slice(from, rules.indexOf('\n      }', from));
    assert.ok(/allow/.test(head), 'the slice missed the rule body');
    assert.ok(/allow read: if isSuperUser\(\) \|\| isStaffOf\(teamId\)/.test(head));
    /* ⚠ trainingAvail/matchAvail/rpe are all `sameTeam` — readable by every
       player. That is a known backlog item, not a precedent to copy for a
       squad's body weights. */
    assert.ok(!/allow read: if sameTeam/.test(head),
        'a player can read every teammate\'s weight');
    assert.ok(/allow create, delete:/.test(head));
    /* "Delete, not edit" enforced where it is a rule rather than a habit. */
    assert.ok(!/allow update/.test(head),
        'an update rule appeared — a measurement is a fact at a date');
  });
});

describe('metrics — the writes', () => {
  /* ⚠ BOUNDED. An unbounded slice runs to the end of the file, so every
     assertion below could be satisfied by somebody else's code — a
     `btn.disabled = true` a thousand lines away kept a mutation of this
     function's own alive. */
  const addEnd = bare.indexOf('function plInjuryHtml');
  assert.ok(addEnd > 0, 'the end marker moved');
  const add = bare.slice(bare.indexOf('function showAddMetric'), addEnd);
  assert.ok(add.length > 500 && add.length < 20000,
      'the showAddMetric slice lost its end bound: ' + add.length + ' chars');

  /* ⚠ DB.submit writes {merge:true}, so a shared id is not an error: the
     second reading merges over the first, with no toast, and the first
     disappears from the cache too. A player can jump twice in one session. */
  it('makes every document id unique, even twice on one day', () => {
    assert.ok(/Math\.random\(\)\.toString\(36\)\.slice\(2, 6\)/.test(
        add.slice(add.indexOf('const docId'), add.indexOf('const docId') + 200)),
    'two readings on one date will silently merge into one');
    assert.ok(/String\(playerId\) \+ '_'/.test(add), 'the uid prefix owns() relies on is gone');
  });

  it('cannot create a definition without a squad to put it in', () => {
    assert.ok(/const canCreate = !!\(cat && letter\);/.test(add),
        'a metric can be created on "Totes" — it lands in the club-wide none shard');
    assert.ok(/canCreate \? '' :/.test(add) || /!canCreate/.test(add),
        'nothing tells the user why they cannot create one');
  });

  /* ⚠ THE SQUAD COMES FROM THE PLAYER. Reading the page filters meant that
     on "Totes", or with the letter chips on "all" — which is how the page
     opens — `cat` and `letter` were empty, `canCreate` was false, and the
     "Nova mètrica…" option silently vanished: the sheet offered only the two
     built-ins and there was no way to create anything. The man in front of
     you is in exactly one squad whatever the filter says. */
  it('takes the squad from the player, so a filter cannot hide the create option', () => {
    const head = add.slice(0, add.indexOf('const overlay'));
    assert.ok(/const cat = p\.category \|\|/.test(head),
        'the category comes from the page filter, not the player');
    assert.ok(/const letter = p\.team \|\|/.test(head),
        'the letter comes from the page filter, not the player');
    // The rail's own list has to agree, or the picker and the sheet differ.
    const rail = grab('  function plmRailHtml(r)', '  /** The squad-wide section');
    assert.ok(/u\.category \|\| getCurrentCategory\(\)/.test(rail));
    assert.ok(/u\.team \|\|/.test(rail));
  });

  it('refuses a duplicate name inside the same squad', () => {
    assert.ok(/plm\.dup_name/.test(add));
  });

  it('disables the button while saving', () => {
    assert.ok(/btn\.disabled = true;/.test(add),
        'a random id means a double tap writes two rows rather than colliding');
    assert.ok(/btn\.disabled = false;/.test(add),
        'a refused write leaves a dead sheet the coach must close and refill');
  });

  it('mints a metric id rather than using the name', () => {
    assert.ok(/id: 'm_' \+ Date\.now\(\)/.test(add),
        'a coach-typed name would go straight into a Firestore document id');
  });
});

describe('metrics — the stylesheet', () => {
  it('carries no paper colour as a literal', () => {
    const loose = (PLMRAW.match(/#[0-9A-Fa-f]{3,8}\b/g) || [])
        .filter((h) => h.toUpperCase() !== '#FFFFFF');
    assert.deepStrictEqual(loose, [], 'a paper colour is hardcoded in .plm-');
  });

  /* ⚠ Class-driven, not `:hover`. Every line carries a fat transparent hit
     stroke, so where two cross the pointer is inside both and a :hover rule
     lights both — proved with a real pointer over twelve lines. */
  it('dims by class so exactly one line can win', () => {
    assert.ok(/\.plm-lines\.plm-hot \.plm-line\s*\{[^}]*opacity/.test(PLMCSS));
    assert.ok(/\.plm-lines\.plm-hot \.plm-line\.plm-on\s*\{[^}]*opacity:\s*1/.test(PLMCSS));
    assert.ok(!/\.plm-line:hover/.test(PLMCSS),
        'a :hover rule is back — two crossing lines will both light up');
    const bind = grab('  function bindPlmControls', '  /** Repaint the metrics views');
    assert.ok(/closest\('\.plm-line'\)/.test(bind), 'nothing picks the topmost line');
    assert.ok(/classList\.toggle\('plm-on'/.test(bind));
  });

  it('un-caps the svg it would otherwise draw at 440px', () => {
    assert.ok(/\.plm-svg\s*\{[^}]*max-width:\s*none/.test(PLMCSS),
        '.pl-svg caps at 440px outside the rail — a page-wide chart needs the override');
  });

  it('dims a deselected player rather than hiding him', () => {
    assert.ok(/\.plm-off\s*\{[^}]*opacity/.test(PLMCSS));
    assert.ok(!/\.plm-off\s*\{[^}]*display:\s*none/.test(PLMCSS),
        'taking a player off the chart is not the same as saying he has no numbers');
  });

  it('sits before the Mèdic banner, or it becomes Mèdic\'s', () => {
    assert.ok(css.indexOf('/* ===== Player metrics') <
      css.indexOf('/* ===== Mèdic, redesigned'),
    'test/medical.test.js slices md2- to end-of-file and would swallow this block');
  });
});

describe('metrics — the page wiring', () => {
  it('repaints Plantilla when either store changes', () => {
    const map = bare.slice(bare.indexOf('const KEY_PAGES = {'),
        bare.indexOf('};', bare.indexOf('const KEY_PAGES = {')));
    assert.ok(/fa_player_metrics: \[[^\]]*'manage-roster'/.test(map));
    assert.ok(/fa_metric_catalog: \[[^\]]*'manage-roster'/.test(map));
  });

  it('does not open a listener a player would be refused', () => {
    assert.ok(/staffOnly: true/.test(dbSrc), 'the metrics listener is not marked staff-only');
    assert.ok(/if \(cfg\.staffOnly && !_isStaff\) return;/.test(dbSrc),
        'every player device will log a permission error on every load');
  });

  it('exempts the Metrics section from the click that closes the rail', () => {
    const bind = grab('  function bindPlantilla', '  function plGetOff');
    /* The WRAPPER, which is the whole section — head, body, and the gap
       between them. It used to name the two inner classes, and that list
       would have to grow with every element added to the section. */
    assert.ok(/closest\('\.plm-secwrap'\)/.test(bind),
        'ticking a player would toggle the box AND shut the rail');
  });

  /* ⚠ Choosing a VIEW of numbers already on screen must not rebuild the
     page. It did: flipping chart↔table in the rail called renderPage(),
     which rebuilt the roster, the three team charts and the player detail
     around the toggle — for a choice that changed neither. */
  it('repaints in place rather than re-rendering the player detail', () => {
    const bind = grab('  function bindPlmControls', '  /** Repaint the metrics views');
    ['data-plm-mode', 'data-plm-toggle'].forEach((hook) => {
      const i = bind.indexOf(hook);
      assert.ok(i > 0, hook + ' is not bound');
      const handler = bind.slice(i, bind.indexOf('});', i));
      assert.ok(/plmRefresh\(\)/.test(handler), hook + ' still rebuilds the page');
      assert.ok(!/renderPage\(/.test(handler), hook + ' still calls renderPage');
    });
    // Picking a metric is the same kind of choice.
    const sel = bind.slice(bind.indexOf('bindStdSelects('));
    assert.ok(/plmRefresh\(\)/.test(sel) && !/renderPage\(/.test(sel));
    /* Opening the section IS a renderPage — it changes how much of the page
       exists, not just what one block draws. */
    const toggle = bind.slice(bind.indexOf('plm-toggle'), bind.indexOf('data-plm-mode'));
    assert.ok(/renderPage\(/.test(toggle), 'the collapse must still re-render');
  });

  /* ⚠ Both containers are replaced together even when one changed, because
     bindStdSelects binds by kind across the document with no double-bind
     guard — re-binding after replacing only one would give the other's
     picker a second listener, and two listeners on one trigger is the bug
     where the first opens the menu and the second shuts it again. */
  it('replaces both metric containers before re-binding', () => {
    const fn = grab('  function plmRefresh()', '  /**\n   * The add-a-measurement sheet.');
    assert.ok(/plm-rail/.test(fn) && /plm-sec/.test(fn), 'one of the two is not refreshed');
    assert.ok(fn.lastIndexOf('bindPlmControls') > fn.lastIndexOf('plm-sec'),
        'the re-bind happens before the containers are replaced');
  });

  /* ⚠ stdSelect closes on a document-level click, and the rail stops every
     click from reaching the document — so a menu opened inside the rail
     could only be dismissed by picking from it or pressing Escape. */
  /* ⚠ Comment-stripped, both of them. The rail handler's own comment says
     the words "stopPropagation" and "stdSelCloseAll", so an ordering test
     over the raw source measures the prose and not the code — the trap this
     repo has written down as "a test that greps source will match its own
     comment". */
  const nc = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

  it('lets a click in the rail close an open dropdown', () => {
    const bind = nc(grab('  function bindPlantilla', '  function plGetOff'));
    const h = bind.slice(bind.indexOf("rail.addEventListener('click'"));
    const close = h.indexOf('stdSelCloseAll()');
    const stop = h.indexOf('stopPropagation');
    assert.ok(close > 0, 'the rail swallows the click that would close a dropdown');
    assert.ok(stop > 0 && close < stop,
        'the click is stopped before the menu is closed, so it never closes');
  });

  it('puts the metric picker on its own row under the title', () => {
    const ui = nc(grab('  function plmRailHtml(r)', '  /** The squad-wide section'));
    const ret = ui.slice(ui.indexOf('return \'<div class="pl-rail-block'));
    const title = ret.indexOf('plm.section');
    const pickrow = ret.indexOf('plm-pickrow');
    assert.ok(title > 0 && pickrow > title, 'the picker is not below the title');
    assert.ok(!/picker/.test(ret.slice(title, pickrow)),
        'the picker is still on the title row');
  });

  it('uses the app\'s one dropdown rather than a fourth of its own', () => {
    /* ⚠ `bare` has its comments stripped, so a doc-comment marker is not in
       it: indexOf returned -1, slice(start, -1) handed back the rest of the
       file, and the assertion below was reading somebody else's <select>.
       Anchor a slice on a DECLARATION, never on a paragraph about one. */
    const end = bare.indexOf('function plInjuryHtml');
    assert.ok(end > 0, 'the end marker moved');
    const ui = bare.slice(bare.indexOf('function plmRailHtml'), end);
    assert.ok(/stdSelect\(/.test(ui));
    assert.ok(!/<select/.test(ui), 'a native select cannot be styled open');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
/* The squad chart's colours, and the legend that has to agree with them.
 *
 * ⚠ Both halves are RENDERED here, from the same builder the page calls, and
 * the assertions compare one against the other. A test that read the palette
 * out of the source twice would agree with itself no matter which way the
 * legend pointed — and a legend pointing the wrong way is exactly the bug
 * worth catching, because every colour still looks correct on its own.
 */
describe('metrics — one colour per player, and a legend that agrees', () => {
  const SECTION = grab('  function plmSectionHtml(players, catSpan) {',
      '  /**\n   * Every metrics control on Plantilla');

  const dom = new JSDOM('<!doctype html><body></body>');

  /** Render the section for `players`, each with the given readings. */
  function render(players, readings, over) {
    const api = Object.assign({
      document: dom.window.document,
      getCurrentCategory: () => 'amateur',
      rosterTeamFilter: 'A',
      getPlayerMetrics: () => [],
      metricsForSquad: () => [{ id: 'weight', slug: 'weight', unit: 'kg', builtin: true }],
      plmName: () => 'Pes',
      playerMetricSeries: (uid) => (readings[String(uid)] || []),
      stdSelect: () => '<i class="std-sel"></i>',
      plmSegs: () => '<i class="segs"></i>',
      t: (k) => k,
      catBadgeHtmlGlobal: () => '',
      plShortDate: (s) => s.slice(8) + '/' + s.slice(5, 7),
      plHitTip: () => '',
      localDateStr: (d) => d.toISOString().slice(0, 10),
      _plmOpen: true, _plmSecMetric: 'weight', _plmSecMode: 'chart',
      _plmOut: new Set(),
      JSON, Object, String, Number, Array, Math, Date, Set,
    }, over || {});
    // eslint-disable-next-line no-new-func
    const html = new Function(...Object.keys(api), `
      ${SANITIZE_SRC}
      ${CHART}
      ${SECTION}
      return plmSectionHtml(arguments[arguments.length - 1], 1);
    `)(...Object.values(api), players);
    const host = dom.window.document.createElement('div');
    host.innerHTML = html;
    return host;
  }

  const pts = (n) => [{ date: '2026-0' + n + '-01', value: 70 + n },
    { date: '2026-0' + (n + 1) + '-01', value: 72 + n }];

  const squad = (n) => {
    const ps = [], rs = {};
    for (let i = 0; i < n; i++) {
      /* Ids in an order that is NOT the insertion order, so a colour scheme
         quietly depending on getUsers() ordering shows up here. */
      const id = 'p' + String(n - i).padStart(2, '0');
      ps.push({ id: id, name: 'Player ' + id });
      rs[id] = pts((i % 4) + 1);
    }
    return { ps, rs };
  };

  /** The stroke colour of each drawn line, by uid. */
  const strokes = (host) => {
    const out = {};
    host.querySelectorAll('.plm-line').forEach((g) => {
      const p = g.querySelector('path[style*="stroke"]');
      if (p) out[g.dataset.plmLine] = /stroke:\s*([^;"]+)/.exec(p.getAttribute('style'))[1].trim();
    });
    return out;
  };
  /** The legend swatch colour of each table row, by uid. */
  const swatches = (host) => {
    const out = {};
    host.querySelectorAll('.plm-row').forEach((tr) => {
      const sw = tr.querySelector('.plm-sw');
      const btn = tr.querySelector('[data-plm-toggle]');
      out[btn.dataset.plmToggle] =
        /(?:background|border-color):\s*([^;"]+)/.exec(sw.getAttribute('style'))[1].trim();
    });
    return out;
  };

  it('draws each player in a different colour', () => {
    const { ps, rs } = squad(6);
    const s = strokes(render(ps, rs));
    assert.strictEqual(Object.keys(s).length, 6, 'not every player was drawn');
    assert.strictEqual(new Set(Object.values(s)).size, 6,
        'two players share a colour inside the ramp: ' + JSON.stringify(s));
    Object.values(s).forEach((v) => assert.ok(/^var\(--pp-series-\d+\)$/.test(v),
        'a line is drawn in a loose colour rather than a palette token: ' + v));
  });

  it('gives the legend swatch the SAME colour as the line', () => {
    const { ps, rs } = squad(6);
    const host = render(ps, rs);
    assert.deepStrictEqual(swatches(host), strokes(host),
        'the legend points at the wrong lines');
  });

  it('shows a swatch for a player who is OFF the chart too', () => {
    /* His row is what he is turned back on from. A legend that only covered
       the drawn lines would be no use for choosing. */
    const { ps, rs } = squad(4);
    const host = render(ps, rs, { _plmOut: new Set(['p01']) });
    assert.strictEqual(Object.keys(strokes(host)).length, 3, 'he was still drawn');
    assert.ok(swatches(host).p01, 'his row lost its swatch when he came off the chart');
  });

  /* ⚠ THE PROPERTY THAT MAKES A LEGEND USABLE. Both the drawn set and the
     table's order move under the user's hands — ticking a player off, or one
     player gaining a kilo and overtaking another in the value sort. Neither
     may repaint anybody. Indexing colours by position in either list is the
     natural way to write this, and it is wrong. */
  it('keeps a colour when other players are toggled off', () => {
    const { ps, rs } = squad(6);
    const before = strokes(render(ps, rs));
    const after = strokes(render(ps, rs, { _plmOut: new Set(['p06', 'p03']) }));
    Object.keys(after).forEach((uid) => {
      assert.strictEqual(after[uid], before[uid],
          uid + ' changed colour because somebody else was deselected');
    });
  });

  it('keeps a colour when the values re-rank the table', () => {
    const { ps, rs } = squad(5);
    const before = strokes(render(ps, rs));
    // p01 leapfrogs everyone; nothing about anyone's identity changed.
    const bumped = Object.assign({}, rs, { p01: [{ date: '2026-01-01', value: 999 }] });
    const after = strokes(render(ps, bumped));
    Object.keys(before).forEach((uid) => {
      if (uid === 'p01') return;
      assert.strictEqual(after[uid], before[uid],
          uid + ' changed colour because the table re-sorted');
    });
  });

  /* Ten hues, and a squad can be twenty-two. */
  it('marks the second lap so a repeated hue is still one glance apart', () => {
    const { ps, rs } = squad(13);
    const host = render(ps, rs);
    const s = strokes(host);
    const ids = Object.keys(s).sort();
    // The eleventh player in id order comes back round to the first hue.
    assert.strictEqual(s[ids[10]], s[ids[0]], 'the ramp did not wrap as expected');
    const first = host.querySelector('[data-plm-line="' + ids[0] + '"] path[style*="stroke"]');
    const lap = host.querySelector('[data-plm-line="' + ids[10] + '"] path[style*="stroke"]');
    assert.ok(!first.getAttribute('stroke-dasharray'), 'a first-lap line is dashed');
    assert.ok(lap.getAttribute('stroke-dasharray'),
        'the repeated hue is drawn identically to the one it repeats');
    const swOf = (uid) => host.querySelector('[data-plm-toggle="' + uid + '"]')
        .closest('tr').querySelector('.plm-sw');
    assert.ok(!swOf(ids[0]).classList.contains('plm-sw-lap'));
    assert.ok(swOf(ids[10]).classList.contains('plm-sw-lap'),
        'the swatch does not distinguish the repeat, so the legend is ambiguous');
  });

  it('leaves the rail single line the neutral, not series 1', () => {
    /* One player, one line: a colour there would be a distinction with
       nothing to distinguish, and it would read as a category. */
    const dom2 = new JSDOM('<!doctype html><body></body>');
    const api = {
      document: dom2.window.document, t: (k) => k,
      localDateStr: (d) => d.toISOString().slice(0, 10),
      plShortDate: (s) => s, plHitTip: () => '',
      JSON, Object, String, Number, Array, Math, Date,
    };
    // eslint-disable-next-line no-new-func
    const C = new Function(...Object.keys(api),
        `${SANITIZE_SRC}\n${CHART}\nreturn plmChartHtml;`)(...Object.values(api));
    const html = C([{ uid: 'p1', label: 'P', points: pts(1) }], 'kg', 'rail');
    assert.ok(!/--pp-series/.test(html), 'the rail chart took a series colour');
    assert.ok(/stroke:#8C857D/.test(html), 'the rail line lost the neutral');
  });

  it('has as many hues in the stylesheet as the code thinks', () => {
    /* The count lives in js/app.js and the values in css/style.css. If the
       ramp is trimmed and the constant is not, plmSeries hands out
       var(--pp-series-11), which resolves to nothing and renders BLACK. */
    const dom3 = new JSDOM('<!doctype html><body></body>');
    const api = { document: dom3.window.document, t: (k) => k,
      localDateStr: () => '2026-01-01', plShortDate: (s) => s, plHitTip: () => '',
      JSON, Object, String, Number, Array, Math, Date };
    // eslint-disable-next-line no-new-func
    const N = new Function(...Object.keys(api),
        `${SANITIZE_SRC}\n${CHART}\nreturn PLM_SERIES_N;`)(...Object.values(api));
    const defined = (readCssRaw().match(/--pp-series-\d+\s*:/g) || []).length;
    assert.strictEqual(defined, N,
        'PLM_SERIES_N is ' + N + ' but the stylesheet defines ' + defined);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe('metrics — expanding the section leaves the player detail alone', () => {
  /* ⚠ The last of the metrics controls that still rebuilt the page. The
     others were fixed in v237; this one was left because the section BODY
     does not exist while the section is shut, so plmRefresh had nothing to
     replace. The fix is a wrapper that is always there. */
  it('emits the wrapper open AND shut, so there is always a node to swap', () => {
    const sec = grab('  function plmSectionHtml(players, catSpan) {',
        '  /**\n   * Every metrics control on Plantilla');
    const nc = sec.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    assert.ok(/id="plm-secwrap"/.test(nc), 'the section has no stable container');
    /* All THREE exits go through it — collapsed, no-metrics, and open.
       ⚠ Counted rather than matched line by line: the three sit at three
       different indents (one inline after `if`, one inside a block, one at
       the top), and a `return` regex loose enough to catch all three also
       catches the returns inside .find() and .map() callbacks. */
    assert.strictEqual((nc.match(/return wrap\(/g) || []).length, 3,
        'an exit from the section builder skips the wrapper');
    assert.ok(!/return head\b/.test(nc),
        'the collapsed case returns the bare head again — that is the original bug');
  });

  it('toggles the section with plmRefresh, not renderPage', () => {
    const bind = grab('  function bindPlmControls(root) {', '  /** Repaint the metrics');
    const nc = bind.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    const toggle = nc.slice(nc.indexOf("getElementById('plm-toggle')"),
        nc.indexOf('[data-plm-mode]'));
    assert.ok(toggle.length > 40, 'the toggle handler slice is empty');
    assert.ok(/plmRefresh\(\)/.test(toggle),
        'expanding the section still rebuilds the whole page');
    assert.ok(!/renderPage/.test(toggle),
        'expanding the section still tears down any open player detail');
  });

  it('refreshes the WRAPPER, not the body that vanishes when shut', () => {
    const fn = grab('  function plmRefresh() {', '  /**\n   * The add-a-measurement sheet');
    const nc = fn.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    assert.ok(/getElementById\('plm-secwrap'\)/.test(nc),
        'plmRefresh looks for the open body, so the collapsed section cannot be refreshed');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
/* The squad TABLE: one row per player, one column per measurement date.
 *
 * It used to be a summary — latest, when, how many — which is a different
 * question from the one the view is for. Every assertion below is about the
 * matrix being complete and aligned, because a table of numbers that quietly
 * drops one reading is worse than no table: nothing on screen says so.
 */
describe('metrics — the squad table is a matrix of dates', () => {
  const SECTION = grab('  function plmSectionHtml(players, catSpan) {',
      '  /**\n   * Every metrics control on Plantilla');
  const dom = new JSDOM('<!doctype html><body></body>');

  function render(players, readings, over) {
    const api = Object.assign({
      document: dom.window.document,
      getCurrentCategory: () => 'amateur',
      rosterTeamFilter: 'A',
      getPlayerMetrics: () => [],
      metricsForSquad: () => [{ id: 'weight', slug: 'weight', unit: 'kg', builtin: true }],
      plmName: () => 'Pes',
      playerMetricSeries: (uid) => (readings[String(uid)] || []),
      stdSelect: () => '<i class="std-sel"></i>',
      plmSegs: () => '<i class="segs"></i>',
      t: (k) => k,
      catBadgeHtmlGlobal: () => '',
      plShortDate: (s) => s.slice(8) + '/' + s.slice(5, 7),
      plHitTip: () => '',
      localDateStr: (d) => d.toISOString().slice(0, 10),
      _plmOpen: true, _plmSecMetric: 'weight', _plmSecMode: 'table',
      _plmOut: new Set(),
      JSON, Object, String, Number, Array, Math, Date, Set,
    }, over || {});
    // eslint-disable-next-line no-new-func
    const html = new Function(...Object.keys(api), `
      ${SANITIZE_SRC}
      ${CHART}
      ${SECTION}
      return plmSectionHtml(arguments[arguments.length - 1], 1);
    `)(...Object.values(api), players);
    const host = dom.window.document.createElement('div');
    host.innerHTML = html;
    return host;
  }

  /* Two players measured on overlapping but different days, and one of them
     weighed TWICE on the same morning. */
  const PLAYERS = [{ id: 'p1', name: 'Gerard' }, { id: 'p2', name: 'Marc' }];
  const READ = {
    p1: [{ date: '2026-02-03', value: 71 }, { date: '2026-03-10', value: 72.4 },
      { date: '2026-03-10', value: 72.9 }],
    p2: [{ date: '2026-02-03', value: 80 }, { date: '2026-04-01', value: 79.2 }],
  };
  const headers = (h) => [...h.querySelectorAll('thead th')].map((x) => x.textContent.trim());
  const rowOf = (h, uid) => h.querySelector('[data-plm-toggle="' + uid + '"]').closest('tr');
  const cellsOf = (h, uid) => [...rowOf(h, uid).querySelectorAll('td')]
      .slice(1).map((td) => td.textContent.trim());

  it('heads every column with a date, and drops the summary columns', () => {
    const hd = headers(render(PLAYERS, READ));
    assert.strictEqual(hd.length, 4, 'expected the name column plus three dates: ' + hd);
    assert.deepStrictEqual(hd.slice(1), ['03/02', '10/03', '01/04'],
        'the date columns are wrong or out of order');
    ['th_n', 'th_latest', 'th_when'].forEach((k) => {
      assert.ok(!hd.some((x) => x.includes(k)), k + ' is still a column');
    });
  });

  it('gives every player the same columns, so the grid lines up', () => {
    const h = render(PLAYERS, READ);
    const n = headers(h).length - 1;
    PLAYERS.forEach((p) => assert.strictEqual(cellsOf(h, p.id).length, n,
        p.id + ' has a different number of cells from the header'));
  });

  it('marks a date a player was not measured on, rather than leaving a hole', () => {
    const h = render(PLAYERS, READ);
    // Gerard has nothing on 01/04; Marc has nothing on 10/03.
    assert.deepStrictEqual(cellsOf(h, 'p1').map((c) => c === '·'), [false, false, true]);
    assert.deepStrictEqual(cellsOf(h, 'p2').map((c) => c === '·'), [false, true, false]);
  });

  /* ⚠ Two readings on ONE day is the case the record id carries a random
     tail for. A cell that took the last one would drop the first silently,
     in the one view whose entire job is to show every reading. */
  it('shows BOTH readings when a player was measured twice in a day', () => {
    const h = render(PLAYERS, READ);
    const cell = cellsOf(h, 'p1')[1];
    assert.ok(/72,4/.test(cell) && /72,9/.test(cell),
        'a same-day reading was dropped: ' + cell);
  });

  it('says the unit once, not in every cell', () => {
    const h = render(PLAYERS, READ);
    assert.strictEqual(h.querySelectorAll('.plm-unit').length, 1,
        'the unit is repeated per cell, or lost entirely');
    assert.ok(/kg/.test(h.querySelector('.plm-unit').textContent));
  });

  it('keeps the name, the swatch and the tick in the sticky column', () => {
    const h = render(PLAYERS, READ);
    const first = rowOf(h, 'p1').querySelector('td');
    assert.ok(first.classList.contains('plm-stick'), 'the first column does not stick');
    assert.ok(first.querySelector('.plm-sw'), 'the legend swatch scrolled away with the dates');
    assert.ok(first.querySelector('[data-plm-toggle]'),
        'the tick scrolled away, so a player cannot be put back on the chart');
  });

  it('puts the table in a scroll box that can also be dragged', () => {
    const h = render(PLAYERS, READ);
    const box = h.querySelector('[data-plm-drag]');
    assert.ok(box, 'the table has no drag surface');
    assert.ok(box.classList.contains('plm-tblwrap'));
    assert.ok(box.querySelector('table'), 'the drag surface does not contain the table');
    /* ⚠ The overflow must be on the box, not the table: a sticky cell
       positions against its nearest scrolling ancestor, so a scrolling
       table would pin the column to the table and it would never move. */
    assert.ok(/\.plm-tblwrap\s*\{[^}]*overflow-x:\s*auto/.test(PLMCSS),
        'the scroll box does not scroll');
    assert.ok(!/\.plm-squad-tbl\s*\{[^}]*overflow/.test(PLMCSS),
        'the table scrolls itself, which breaks the sticky column');
  });

  it('still shows the table in chart mode, as the line picker', () => {
    const h = render(PLAYERS, READ, { _plmSecMode: 'chart' });
    assert.ok(h.querySelector('[data-plm-drag] table'), 'the picker table vanished');
    assert.ok(h.querySelector('.plm-chart'), 'the chart vanished');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe('metrics — dragging the table moves it and nothing else', () => {
  const BIND = grab('  function bindPlmControls(root) {', '  /** Repaint the metrics');

  /** Bind the real handlers over a table box, and report what got called. */
  function mount(html) {
    const dom = new JSDOM('<!doctype html><body><div id="pl-page">' + html + '</div></body>');
    const doc = dom.window.document;
    const calls = { renderPage: 0, plmRefresh: 0 };
    const api = {
      document: doc, window: dom.window,
      canEditPage: () => false,
      showAddMetric: () => {}, confirm: () => false, alert: () => {},
      ackRemoveRecord: () => Promise.resolve(),
      localStorage: { getItem: () => null },
      t: (k) => k,
      bindStdSelects: () => {},
      renderPage: () => { calls.renderPage++; },
      plmRefresh: () => { calls.plmRefresh++; },
      getSession: () => ({}),
      _plmOpen: false, _plmRailMode: 'chart', _plmSecMode: 'table',
      _plmRailMetric: '', _plmSecMetric: '', _plmOut: new Set(),
      _plDragMoved: false,
      JSON, Object, String, Number, Array, Math, Date, Set, Promise,
    };
    // eslint-disable-next-line no-new-func
    new Function(...Object.keys(api), BIND + '\nbindPlmControls(document.getElementById("pl-page"));')(
        ...Object.values(api));
    return { dom, doc, calls };
  }

  /** jsdom does no layout, so scrollLeft is inert — record what is written
      to it instead. That is the logic under test either way. */
  function traced(el) {
    let v = 0;
    Object.defineProperty(el, 'scrollLeft', {
      get: () => v, set: (n) => { v = n; }, configurable: true,
    });
    return () => v;
  }
  const at = (win, el, type, x) => el.dispatchEvent(
      new win.MouseEvent(type, { clientX: x, bubbles: true, cancelable: true }));
  const atWin = (win, type, x) => win.dispatchEvent(
      new win.MouseEvent(type, { clientX: x, bubbles: true }));

  const HTML = '<div class="plm-tblwrap" data-plm-drag><table><tbody><tr>' +
    '<td><button data-plm-toggle="p1">x</button></td><td>70</td>' +
    '</tr></tbody></table></div>';

  it('pans the box by exactly how far the pointer moved', () => {
    const { dom, doc } = mount(HTML);
    const box = doc.querySelector('[data-plm-drag]');
    const read = traced(box);
    box.scrollLeft = 100;
    at(dom.window, box, 'mousedown', 400);
    atWin(dom.window, 'mousemove', 340);   // dragged 60px left
    assert.strictEqual(read(), 160, 'the table did not follow the pointer');
    atWin(dom.window, 'mousemove', 430);   // now 30px right of the start
    assert.strictEqual(read(), 70,
        'the offset accumulated per move instead of being measured from the start');
    atWin(dom.window, 'mouseup', 430);
  });

  /* ⚠ The whole point of the in-place repaint. A drag that re-rendered would
     rebuild the page — and any open player detail — sixty times a second. */
  it('re-renders nothing at all while dragging', () => {
    const { dom, doc, calls } = mount(HTML);
    const box = doc.querySelector('[data-plm-drag]');
    traced(box);
    at(dom.window, box, 'mousedown', 300);
    for (let x = 300; x > 200; x -= 10) atWin(dom.window, 'mousemove', x);
    atWin(dom.window, 'mouseup', 200);
    assert.strictEqual(calls.renderPage, 0, 'a drag rebuilt the page');
    assert.strictEqual(calls.plmRefresh, 0, 'a drag repainted the section');
  });

  it('lets a click on the tick be a click, not a drag', () => {
    const { dom, doc } = mount(HTML);
    const box = doc.querySelector('[data-plm-drag]');
    const read = traced(box);
    const btn = doc.querySelector('[data-plm-toggle]');
    const ev = new dom.window.MouseEvent('mousedown',
        { clientX: 400, bubbles: true, cancelable: true });
    btn.dispatchEvent(ev);
    assert.ok(!ev.defaultPrevented, 'the drag swallowed a press on the tick box');
    atWin(dom.window, 'mousemove', 300);
    assert.strictEqual(read(), 0, 'pressing the tick started a drag');
  });

  it('suppresses the click a real drag ends with', () => {
    /* Letting go raises a click that reaches the page handler, and that
       handler closes the player rail. The chart drag sets the same flag. */
    const nc = BIND.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    const drag = nc.slice(nc.indexOf('[data-plm-drag]'));
    assert.ok(/_plDragMoved = moved;/.test(drag),
        'a drag that ends over the table will shut the player rail');
  });

  it('carries the scroll position across an in-place repaint', () => {
    /* Ticking a player off rebuilds the table, and without this the view
       snaps back to the first date every time the drawn set changes.
       ⚠ RUN, not read. The first version of this test asserted that
       plmRefresh mentions scrollLeft and that the mention comes before
       replaceWith — both of which stayed true when the line that actually
       restores it was deleted. A mutation caught that. */
    const REFRESH = grab('  function plmRefresh() {',
        '  /**\n   * The add-a-measurement sheet');
    const dom = new JSDOM('<!doctype html><body><div id="pl-page">' +
      '<div id="plm-secwrap"><div class="plm-tblwrap" data-plm-drag>old</div></div>' +
      '</div></body>');
    const doc = dom.window.document;
    const oldBox = doc.querySelector('[data-plm-drag]');
    let v = 340;
    Object.defineProperty(oldBox, 'scrollLeft',
        { get: () => v, set: (n) => { v = n; }, configurable: true });

    /* The replacement is a real node, and its scrollLeft is traced the same
       way — jsdom does no layout, so this is the only way to see the write. */
    let restored = null;
    const holderPatch = (el) => {
      const box = el.querySelector('[data-plm-drag]');
      if (box) {
        Object.defineProperty(box, 'scrollLeft',
            { get: () => restored || 0, set: (n) => { restored = n; }, configurable: true });
      }
    };
    const api = {
      document: doc,
      getUsers: () => [],
      _plSel: null,
      plmRailHtml: () => '',
      plScopedPlayers: () => [],
      catSpanOf: () => 1,
      plmSectionHtml: () => '<div id="plm-secwrap">' +
        '<div class="plm-tblwrap" data-plm-drag>new</div></div>',
      bindPlmControls: () => {},
      __patch: holderPatch,
      JSON, Object, String, Number, Array, Math, Date, Set,
    };
    /* Hook the freshly parsed node before plmRefresh writes to it. The
       builder stub is called first, so patching from createElement's result
       is not possible — patch on the next querySelector instead. */
    const origCreate = doc.createElement.bind(doc);
    doc.createElement = function (tag) {
      const el = origCreate(tag);
      if (tag === 'div') {
        const oldSet = Object.getOwnPropertyDescriptor(
            dom.window.Element.prototype, 'innerHTML').set;
        Object.defineProperty(el, 'innerHTML', {
          set: (h) => { oldSet.call(el, h); holderPatch(el); }, configurable: true,
        });
      }
      return el;
    };
    // eslint-disable-next-line no-new-func
    new Function(...Object.keys(api), REFRESH + '\nplmRefresh();')(...Object.values(api));

    assert.strictEqual(restored, 340,
        'the table jumped back to the first date after the repaint');
  });
});
