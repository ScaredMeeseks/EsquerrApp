/* Pissarres — the superadmin board catalogue and the platform library (v257).
 *
 * ⚠ THE THREE TRAPS THIS PAGE HAS, AND WHY EACH TEST BELOW EXISTS.
 *
 * 1. `tbRoBoardHtml` must be fed `{boardId, name}`, never the tacticBoards
 *    METADATA doc. `tbResolveRef` returns any ref carrying `positions` OR
 *    `formation`, and a metadata doc HAS a `formation` field with no drawing
 *    behind it — so the doc is mistaken for the payload, renders a permanently
 *    empty pitch, emits no `data-ro-thin`, and hydration never comes back. The
 *    real resolver is sliced in here so that mistake actually fails.
 *
 * 2. `TB.warm` swallows its own errors, so a failed read is indistinguishable
 *    from one in flight: the skeleton just says "Carregant…" forever.
 *
 * 3. `_abLoad` used to read every board on the platform. It is a `where()` now,
 *    and the query it issues is asserted rather than the rows it returns —
 *    filtering the same full read client-side would look identical otherwise.
 *
 * ⚠ Every render test MOUNTS the page and awaits the load. Slicing a builder
 * and reading its text is what let v238 ship a page that rendered nothing.
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');
const { readCss } = require('./read-css');

const APP = path.join(__dirname, '..', 'js', 'app.js');
const appSrc = fs.readFileSync(APP, 'utf8');
const fnSrc = fs.readFileSync(
    path.join(__dirname, '..', 'functions', 'index.js'), 'utf8');
const css = readCss();

function grab(from, to) {
  const i = appSrc.indexOf(from);
  const j = appSrc.indexOf(to, i);
  assert.ok(i !== -1 && j !== -1, 'marker not found in js/app.js: ' + from);
  return appSrc.slice(i, j);
}
/* Comment-stripped, for assertions that a symbol is ABSENT. The prose in
   app.js names what was removed and why, and a plain `includes` reads that as
   a use of it — the trap that has fired four times in this repo. */
const bare = appSrc.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');

const esc = (v) => String(v == null ? '' : v)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');

const CA = {};
const RE = /'((?:ab|sidebar|tactics)\.[a-z_0-9]+)':\s*\{\s*ca:\s*'((?:[^'\\]|\\.)*)'/g;
let mm;
while ((mm = RE.exec(appSrc))) CA[mm[1]] = mm[2].replace(/\\'/g, "'");

const PAGE = grab('  // #region Superadmin: board catalogue & platform template library',
    '  // #endregion Superadmin board catalogue');
/* The REAL ref resolver, not a stub. Trap 1 is a property of these three
   functions together, and a stub would make it untestable by construction. */
const REF = grab('  function tbResolveRef(ref) {', '  /**\n   * Is this drawing');
const THIN = grab('  function tbRefIsThin(ref, board) {', '  /**\n   * How a linked board');
const RO_HTML = grab('  /** One read-only board, or a placeholder to be filled in after render. */',
    '  /**\n   * Fill in any placeholders left by tbRoBoardHtml');
const HYDRATE = grab('  async function hydrateRoBoards(roots) {',
    '  function bindRoBoardAnimations() {');
/* Comment-stripped, for the assertions that a symbol is ABSENT from the page. */
const PAGE_BARE = PAGE.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');

// ── Fixtures ────────────────────────────────────────────────────────
const CLUBS = [
  { id: 'c-esq', name: 'UE Esquerra' },
  { id: 'c-gav', name: 'CE Gavà Nord' },
  { id: 'c-pob', name: 'CF Poble Sec' }
];

/* ⚠ `formation` is on every one of these. It is what makes trap 1 silent:
   a metadata doc passed straight through looks like a drawing. */
const BOARDS = [
  { id: 'b1', clubId: 'c-gav', name: 'Sortida de pilota', tag: 'Atac',
    category: 'amateur', formation: '4-3-3', ownerUid: 'u1', bytes: 2048,
    hasFrames: true, frameCount: 4, updatedAt: { seconds: 1757400000 } },
  { id: 'b2', clubId: 'c-gav', name: 'Pressió alta', tag: 'Defensa',
    category: 'amateur', formation: '4-4-2', ownerUid: 'u2', bytes: 900,
    updatedAt: { seconds: 1757300000 } },
  { id: 'b3', clubId: 'c-gav', name: 'Córner curt', tag: 'Atac',
    category: 'juvenil', formation: '4-4-2', ownerUid: 'u1', bytes: 512,
    updatedAt: { seconds: 1757200000 } },
  // Seeded FROM the library: not club work, so not in a catalogue of club work.
  { id: 'b4', clubId: 'c-gav', name: 'Rondo 4v2', formation: '4-3-3',
    sourceTemplateId: 't1', bytes: 400 },
  { id: 'b5', clubId: 'c-esq', name: 'Replegament', tag: 'Defensa',
    category: 'amateur', formation: '5-3-2', ownerUid: 'u3', bytes: 700 }
];

const TEMPLATES = [
  { id: 't1', name: 'Rondo 4v2', tag: 'Escalfament', category: '',
    packs: ['Escola', 'Base'], published: true, bytes: 400 },
  { id: 't2', name: 'Bloc mig 4-4-2', tag: 'Defensa', category: 'amateur',
    packs: ['Amateur'], published: true, bytes: 800 },
  { id: 't3', name: 'Estructura de rebuig', tag: '', category: '',
    packs: [], published: false, bytes: 300 }
];

/* ⚠ `c-gav` is the alphabetically FIRST club, so it is the default scope and
   the one every render test below is looking at. */
const AUTHORS = {
  'c-gav': {
    u1: { name: 'Berta Puig', category: 'amateur', letters: ['A'], active: true },
    u2: { name: 'Quim Tena', category: 'amateur', letters: ['B'], active: false }
  },
  'c-esq': { u3: { name: 'Hugo Camps', category: 'amateur', letters: ['A'] } }
};

const SOURCES = { b2: { templateId: 't9', clubId: 'c-gav' } };

// ── A Firestore stand-in that RECORDS the queries it was asked for ──
function fakeDb(over) {
  const o = over || {};
  const boards = o.boards || BOARDS;
  const log = [];
  const snapOf = (rows) => ({
    docs: rows.map((r) => ({ id: r.id, data: () => r })),
    size: rows.length,
    forEach(f) { this.docs.forEach(f); }
  });
  function collection(name) {
    const q = { name, where: null, limit: 0 };
    const api = {
      where(field, op, value) { q.where = [field, op, value]; return api; },
      limit(n) { q.limit = n; return api; },
      async get() {
        log.push({ name: q.name, where: q.where, limit: q.limit });
        if (q.name === 'clubs') return snapOf(CLUBS);
        if (q.name === 'tacticTemplateSources') {
          return snapOf(Object.keys(SOURCES).map(
              (k) => Object.assign({ id: k }, SOURCES[k])));
        }
        if (q.name === 'tacticBoards') {
          let rows = boards;
          if (q.where) rows = rows.filter((b) => b[q.where[0]] === q.where[2]);
          if (q.limit) rows = rows.slice(0, q.limit);
          return snapOf(rows);
        }
        return snapOf([]);
      },
      doc(id) {
        return {
          collection(sub) {
            return {
              async get() {
                log.push({ name: name + '/' + id + '/' + sub });
                if (o.authorsThrow) throw new Error('denied');
                const m = (AUTHORS[id] || {});
                return snapOf(Object.keys(m).map(
                    (k) => Object.assign({ id: k }, m[k])));
              }
            };
          }
        };
      }
    };
    return api;
  }
  return { collection, _log: log };
}

/** Mount the page and run the real loader against the stubs. */
async function mount(over) {
  const o = over || {};
  const dom = new JSDOM('<!DOCTYPE html><body><div id="dashboard-content"></div></body>');
  const doc = dom.window.document;
  const errors = [];
  dom.window.addEventListener('error', (e) => errors.push(e.message || String(e)));

  const db = o.db || fakeDb(o);
  const payloads = o.payloads === undefined ?
    { b1: { positions: [[50, 50]], name: 'x' }, b2: { positions: [] },
      b3: { positions: [] }, b5: { positions: [] } } : o.payloads;
  const patches = [];
  const removed = [];
  const calls = [];
  const observers = [];
  const toasts = [];
  const confirms = [];
  const navigated = [];
  const cleared = [];
  let warmCount = 0;

  /* ⚠ `peek` answers only for what has been WARMED. TB's real cache behaves
     the same way, and a peek that answered from the start would resolve every
     ref eagerly — which would make every skeleton, and therefore the whole
     lazy path, untestable. */
  const cached = {};
  const TB = {
    templates: async () => JSON.parse(JSON.stringify(o.templates || TEMPLATES)),
    peek: (id) => cached[id] || null,
    warm: async (ids) => {
      warmCount++;
      calls.push({ warm: ids.slice() });
      ids.forEach((id) => { if (payloads[id]) cached[id] = payloads[id]; });
    },
    get: async (id) => payloads[id] || null,
    getTemplate: async (id) => ({ positions: [], name: id }),
    patchTemplate: async (id, patch) => { patches.push({ id, patch }); },
    removeTemplate: async (id) => { removed.push(id); }
  };

  /* jsdom has no IntersectionObserver. The stub records what was observed and
     hands the test a way to fire entries, so the REAL gating code runs. */
  function FakeIO(cb, opts) {
    this.cb = cb; this.opts = opts; this.nodes = []; this.dropped = [];
    observers.push(this);
  }
  FakeIO.prototype.observe = function (n) { this.nodes.push(n); };
  FakeIO.prototype.unobserve = function (n) {
    this.dropped.push(n);
    this.nodes = this.nodes.filter((x) => x !== n);
  };
  FakeIO.prototype.disconnect = function () { this.nodes = []; };
  FakeIO.prototype.fire = function (els) {
    this.cb(els.map((target) => ({ target, isIntersecting: true })));
  };

  const api = {
    document: doc,
    window: dom.window,
    IntersectionObserver: o.noIO ? undefined : FakeIO,
    setTimeout: dom.window.setTimeout.bind(dom.window),
    clearTimeout: dom.window.clearTimeout.bind(dom.window),
    console: { error: () => {}, warn: () => {} },
    alert: (m) => { toasts.push(['alert', m]); },
    db,
    TB,
    CATEGORY_ORDER: ['amateur', 'juvenil', 'cadet', 'infantil', 'alevi', 'benjami'],
    CATEGORY_LABELS: { amateur: 'Amateur', juvenil: 'Juvenil', cadet: 'Cadet',
      infantil: 'Infantil', alevi: 'Aleví', benjami: 'Benjamí' },
    sanitize: esc,
    t: (k) => (k in CA ? CA[k] : k),
    navigate: (p) => { navigated.push(p); },
    tbClearEditor: () => { cleared.push(true); },
    tbHydrateEditor: (b, opts) => { calls.push({ hydrateEditor: opts }); },
    showTbConfirm: (title, body, go) => { confirms.push({ title, body, go }); },
    _showPushToast: (a, b) => { toasts.push([a, b]); },
    /* Marker, not the real renderer: what matters here is WHICH ref reached
       it. The pitch itself is the tactics block's business and has its own
       suite. */
    renderReadOnlyBoard: (b, prefix, thin, key) => {
      calls.push({ ro: b, thin: !!thin, key: key || '' });
      return '<div class="tb-field-readonly" data-ro-name="' +
        esc((b && b.name) || '') + '"></div>';
    },
    scaleRoBoards: () => {},
    bindRoBoardAnimations: () => {},
    firebase: {
      app: () => ({
        functions: () => ({
          httpsCallable: (name) => async (payload) => {
            calls.push({ callable: name, payload });
            if (o.callableThrows) throw new Error('boom');
            return { data: { ok: true, created: 3, skipped: 1 } };
          }
        })
      })
    }
  };

  const build = new Function(...Object.keys(api), `
    ${REF}
    ${THIN}
    ${RO_HTML}
    ${HYDRATE}
    ${PAGE}
    return {
      render: renderAdminBoards,
      load: _abLoad,
      state: function () { return _abState; },
      setState: function (k, v) { _abState[k] = v; },
      rerender: _abRender
    };
  `);
  const P = build(...Object.values(api));

  const host = doc.getElementById('dashboard-content');
  host.innerHTML = P.render();
  await P.load(true);
  // Let the debounced hydration batch flush.
  const tick = () => new Promise((r) => dom.window.setTimeout(r, 60));

  return {
    doc, host, errors, P, db, patches, removed, calls, observers, toasts,
    confirms, navigated, cleared, tick,
    warm: () => warmCount,
    html: () => host.innerHTML,
    cards: () => Array.from(host.querySelectorAll('[data-ab-card]')),
    q: (sel) => host.querySelector(sel),
    all: (sel) => Array.from(host.querySelectorAll(sel)),
    click: (sel) => {
      const el = host.querySelector(sel);
      assert.ok(el, 'nothing to click: ' + sel);
      el.dispatchEvent(new dom.window.Event('click', { bubbles: true }));
      return el;
    },
    tab: async (name) => {
      const el = host.querySelector('[data-ab-tab="' + name + '"]');
      assert.ok(el, 'no tab ' + name);
      el.dispatchEvent(new dom.window.Event('click', { bubbles: true }));
    }
  };
}

// ════════════════════════════════════════════════════════════════════
describe('Pissarres — the page renders', () => {
  it('CALLS the builder, loads, and produces a paper page', async () => {
    const m = await mount();
    assert.ok(m.html().includes('ab-hero'), 'no header band — the load produced nothing');
    assert.ok(m.html().includes('ab-h1'), 'no title');
    assert.ok(m.html().includes('class="ab-body"'), 'no body wrapper to carry the inset');
    assert.deepStrictEqual(m.errors, []);
  });

  it('opens on the clubs tab with a card each, seeded boards excluded', async () => {
    const m = await mount();
    // b1..b3 are c-esq's own work; b4 was seeded from the library; b5 is another club.
    assert.strictEqual(m.cards().length, 3, 'wrong number of cards');
    assert.ok(!/Rondo 4v2/.test(m.html()),
        'a board seeded from the library is listed back as club work');
    assert.ok(!/Replegament/.test(m.html()), 'another club\'s board leaked into the scope');
  });

  it('draws the three tabs, with the clubs one selected', async () => {
    const m = await mount();
    assert.strictEqual(m.all('.ab-tab').length, 3);
    assert.strictEqual(m.q('.ab-tab-on').dataset.abTab, 'clubs');
  });

  it('counts boards, published templates and drafts in the band', async () => {
    const m = await mount();
    const figs = m.all('.ab-fig-v').map((e) => e.textContent);
    assert.deepStrictEqual(figs, ['3', '2', '1'],
        'boards / published / drafts figures are wrong');
  });
});

// ════════════════════════════════════════════════════════════════════
describe('Pissarres — the mini pitch is a REFERENCE, never the metadata doc', () => {
  /* ⚠ THE SILENT ONE. tbResolveRef is `if (ref.positions || ref.formation)
     return ref`, and a tacticBoards metadata doc has `formation`. Passing the
     doc through renders a permanently blank pitch with no `data-ro-thin`, so
     hydration never comes back for it and nothing anywhere says why.

     Asserted on the RENDERED skeleton rather than on the call, so "fixing" it
     by handing the doc to renderReadOnlyBoard directly still fails. */
  it('leaves every card as a skeleton for hydration to fill', async () => {
    const m = await mount();
    m.cards().forEach((c) => {
      const sk = c.querySelector('.tb-ro-skeleton');
      assert.ok(sk, 'a card rendered a pitch instead of a skeleton — the ' +
          'metadata doc was mistaken for the drawing');
      assert.ok(sk.dataset.roId, 'the skeleton carries no board id to hydrate from');
    });
  });

  it('never hands renderReadOnlyBoard a board carrying admin metadata', async () => {
    const m = await mount();
    m.calls.filter((c) => c.ro).forEach((c) => {
      assert.ok(!('clubId' in c.ro) && !('ownerUid' in c.ro),
          'a tacticBoards metadata doc reached the pitch renderer');
    });
  });

  it('keys the ref on boardId, which is not what the admin doc calls it', async () => {
    const m = await mount();
    const ids = m.cards().map((c) => c.querySelector('.tb-ro-skeleton').dataset.roId);
    assert.deepStrictEqual(ids.slice().sort(), ['b1', 'b2', 'b3']);
  });
});

// ════════════════════════════════════════════════════════════════════
describe('Pissarres — hydration is gated on the viewport', () => {
  it('hydrates nothing until a card comes into view', async () => {
    const m = await mount();
    assert.strictEqual(m.observers.length, 1, 'no observer was set up');
    assert.strictEqual(m.observers[0].nodes.length, 3, 'not every card is observed');
    await m.tick();
    assert.strictEqual(m.warm(), 0,
        'the whole page was warmed before anything was on screen');
  });

  it('hydrates the cards that intersect, in ONE batch', async () => {
    const m = await mount();
    const io = m.observers[0];
    io.fire(io.nodes.slice(0, 2));
    await m.tick();
    assert.strictEqual(m.warm(), 1, 'per-card hydration throws away TB.warm\'s batching');
    const warmed = m.calls.filter((c) => c.warm).pop().warm;
    assert.deepStrictEqual(warmed.slice().sort(), ['b1', 'b2'],
        'a card that never came into view was hydrated anyway');
  });

  it('stops observing a card once it has been hydrated', async () => {
    const m = await mount();
    const io = m.observers[0];
    const first = io.nodes[0];
    io.fire([first]);
    await m.tick();
    assert.ok(io.dropped.indexOf(first) !== -1,
        'a card scrolled out and back would re-warm');
    assert.strictEqual(io.nodes.indexOf(first), -1);
  });

  it('replaces the skeleton with the drawn board once the payload lands', async () => {
    const m = await mount();
    const io = m.observers[0];
    const card = io.nodes[0];
    io.fire([card]);
    await m.tick();
    assert.ok(!card.querySelector('.tb-ro-skeleton'), 'the skeleton survived hydration');
    assert.ok(card.querySelector('.tb-field-readonly'), 'nothing was drawn in its place');
  });

  /* ⚠ TB.warm swallows its errors (boards.js), so a denied read is silence.
     b3 has no payload in this fixture: nothing throws, nothing arrives. */
  it('says so when a board never arrives, rather than saying Carregant for ever', async () => {
    const m = await mount({ payloads: { b1: { positions: [] } } });
    const io = m.observers[0];
    io.fire(io.nodes);
    await m.tick();
    const failed = m.all('.ab-thumb-failed');
    assert.strictEqual(failed.length, 2, 'a board that never arrived is not marked');
    assert.ok(!/Carregant/.test(failed[0].textContent),
        'the failed card still reads as loading');
  });

  it('loads everything when the browser has no IntersectionObserver', async () => {
    const m = await mount({ noIO: true });
    await m.tick();
    assert.strictEqual(m.observers.length, 0);
    assert.strictEqual(m.warm(), 1,
        'an old WebView shows sixty empty boxes for ever');
  });

  /* ⚠ hydrateRoBoards has six other callers that want the whole document.
     Narrowing is OPT-IN, and this is what proves the default did not move. */
  it('leaves hydrateRoBoards sweeping the document when given no scope', () => {
    assert.ok(/const scopes = \(roots && roots\.length\) \? Array\.from\(roots\) : \[document\]/
        .test(HYDRATE), 'the default scope is no longer the document');
    assert.ok(/querySelectorAll\('\.tb-ro-skeleton'\)/.test(HYDRATE) &&
        /querySelectorAll\('\[data-ro-thin\]'\)/.test(HYDRATE),
        'hydration must still collect both kinds of node');
  });
});

// ════════════════════════════════════════════════════════════════════
describe('Pissarres — the read scale', () => {
  /* ⚠ ASSERTED ON THE QUERY, NOT THE ROWS. Reading the whole collection and
     filtering it in JS returns exactly the same cards, and that is the version
     that costs 14,000 document reads at three hundred clubs. */
  it('queries one club server-side rather than the whole collection', async () => {
    const m = await mount();
    const boards = m.db._log.filter((q) => q.name === 'tacticBoards');
    assert.strictEqual(boards.length, 1);
    assert.deepStrictEqual(boards[0].where, ['clubId', '==', 'c-gav'],
        'the club scope is a client-side filter over every board again');
  });

  it('reads boardAuthors for the club in view only', async () => {
    const m = await mount();
    const authors = m.db._log.filter((q) => /boardAuthors/.test(q.name));
    assert.deepStrictEqual(authors.map((q) => q.name),
        ['clubs/c-gav/boardAuthors'],
        'every club\'s authors were read to draw one club\'s page');
  });

  it('defaults to the first club, not to all of them', async () => {
    const m = await mount();
    assert.strictEqual(m.P.state().club, 'c-gav');
    assert.ok(/Gavà/.test(m.q('.ab-sub').textContent),
        'the band does not say which club is in view');
  });

  it('caps the cross-club view and says it did', async () => {
    const many = [];
    for (let i = 0; i < 260; i++) {
      many.push({ id: 'x' + i, clubId: 'c-gav', name: 'B' + i, formation: '4-4-2' });
    }
    const m = await mount({ boards: many });
    m.P.setState('club', '');
    m.P.setState('loaded', false);
    await m.P.load(true);
    const q = m.db._log.filter((x) => x.name === 'tacticBoards').pop();
    assert.strictEqual(q.where, null, 'the cross-club view is still scoped');
    assert.ok(q.limit > 0, 'a whole-collection read with no limit');
    assert.ok(m.q('.ab-warn'), 'the cap is silent');
  });

  it('re-reads when the club changes — the scope is a query, not a filter', async () => {
    const m = await mount();
    const before = m.db._log.filter((x) => x.name === 'tacticBoards').length;
    const sel = m.q('#ab-club');
    sel.value = 'c-esq';
    sel.dispatchEvent(new m.doc.defaultView.Event('change', { bubbles: true }));
    await new Promise((r) => setTimeout(r, 20));
    const after = m.db._log.filter((x) => x.name === 'tacticBoards');
    assert.ok(after.length > before, 'switching club re-rendered stale memory');
    assert.deepStrictEqual(after.pop().where, ['clubId', '==', 'c-esq']);
  });
});

// ════════════════════════════════════════════════════════════════════
describe('Pissarres — the tag filter comes from the boards', () => {
  /* ⚠ NOT from getTagList(). `fa_tactic_tags` is plain localStorage, per
     BROWSER PROFILE — not per club, not per account, absent from SYNCED_KEYS.
     On a page showing other clubs' work it would offer whatever the superadmin
     last typed on this device and match none of their boards. */
  it('derives its chips from the loaded boards, not from the editor list', async () => {
    const m = await mount();
    const chips = m.all('[data-ab-tag]').map((e) => e.dataset.abTag);
    assert.deepStrictEqual(chips, ['', 'Atac', 'Defensa']);
    /* ⚠ COMMENT-STRIPPED. The comment above `_abTagList` names getTagList to
       say it is NOT used, and a plain `includes` reads that as a use — the
       trap that has fired four times in this repo. */
    assert.ok(!/getTagList/.test(PAGE_BARE),
        'the catalogue reads the per-device tag list again');
    assert.ok(!/fa_tactic_tags/.test(PAGE_BARE),
        'the catalogue reads localStorage for a cross-club filter');
  });

  it('narrows to one tag, and back', async () => {
    const m = await mount();
    m.click('[data-ab-tag="Atac"]');
    assert.strictEqual(m.cards().length, 2);
    m.click('[data-ab-tag=""]');
    assert.strictEqual(m.cards().length, 3);
  });

  it('shows no chip row at all when nothing is tagged', async () => {
    const m = await mount({
      boards: [{ id: 'z1', clubId: 'c-gav', name: 'Untagged', formation: '4-4-2' }]
    });
    assert.strictEqual(m.all('[data-ab-tag]').length, 0);
  });
});

// ════════════════════════════════════════════════════════════════════
describe('Pissarres — the platform library', () => {
  it('lists every template with its state, drafts first', async () => {
    const m = await mount();
    await m.tab('library');
    const names = m.all('.ab-row .ab-tpl-name').map((e) => e.value);
    assert.strictEqual(names[0], 'Estructura de rebuig', 'the draft is not first');
    assert.strictEqual(m.all('.ab-row').length, 3);
    assert.strictEqual(m.all('.ab-state-live').length, 2);
  });

  it('offers packs as toggle chips, not as a comma-separated string', async () => {
    const m = await mount();
    await m.tab('library');
    assert.strictEqual(m.all('[data-ab-tpl-pack]').length, 3 * 3,
        'every template needs a chip per pack');
    assert.ok(!/ab-tpl-packs/.test(m.html()),
        'the free-text pack input is back — a typo makes a pack nothing else has');
  });

  it('writes the pack toggle through the same packs array', async () => {
    const m = await mount();
    await m.tab('library');
    m.click('[data-ab-tpl-pack="t2"][data-ab-pack="Escola"]');
    await new Promise((r) => setTimeout(r, 10));
    assert.deepStrictEqual(m.patches.pop(),
        { id: 't2', patch: { packs: ['Amateur', 'Escola'] } });
  });

  /* ⚠ A TOGGLE, NOT AN ADD. A chip that only ever adds looks identical on the
     first click and cannot be undone — which a test that only clicks an unlit
     chip would never see. */
  it('takes a pack OFF a template that already carries it', async () => {
    const m = await mount();
    await m.tab('library');
    const chip = m.q('[data-ab-tpl-pack="t1"][data-ab-pack="Base"]');
    assert.ok(chip.classList.contains('ab-pchip-on'), 'the fixture lost its pack');
    chip.dispatchEvent(new m.doc.defaultView.Event('click', { bubbles: true }));
    await new Promise((r) => setTimeout(r, 10));
    assert.deepStrictEqual(m.patches.pop(), { id: 't1', patch: { packs: ['Escola'] } });
    assert.ok(!m.q('[data-ab-tpl-pack="t1"][data-ab-pack="Base"].ab-pchip-on'),
        'the chip is still lit');
    /* ⚠ AND THE PACK IS STILL OFFERED. It was that template's last one, and
       the pack list is derived from the templates — so without the guard in
       _abTogglePack the chip would vanish mid-click and there would be no way
       to put the pack back on. The ✕ is the deliberate way to retire one. */
    assert.ok(m.q('[data-ab-tpl-pack="t1"][data-ab-pack="Base"]'),
        'the emptied pack disappeared from the manager on its own');
  });

  it('counts the templates in each pack', async () => {
    const m = await mount();
    await m.tab('library');
    const packs = m.all('.ab-pack').map((e) => e.textContent);
    assert.ok(packs.some((p) => /Amateur/.test(p) && /1/.test(p)));
    assert.ok(packs.some((p) => /Escola/.test(p) && /1/.test(p)));
  });

  /* ⚠ EVERY TEMPLATE CARRYING IT. Dropping the name from the manager alone
     leaves the templates holding a pack the manager no longer lists and the
     send panel can no longer choose — which is exactly how the editor's own
     local tag list already misbehaves. */
  it('removing a pack patches every template that carried it', async () => {
    const m = await mount();
    await m.tab('library');
    m.click('[data-ab-pack-rm="Base"]');
    assert.strictEqual(m.confirms.length, 1, 'a destructive change with no confirmation');
    await m.confirms.pop().go();
    assert.deepStrictEqual(m.patches, [{ id: 't1', patch: { packs: ['Escola'] } }]);
    assert.ok(!/data-ab-pack="Base"/.test(m.html()), 'the pack is still offered');
  });

  it('creates a pack, and says it is not saved until something carries it', async () => {
    const m = await mount();
    await m.tab('library');
    m.q('#ab-pack-name').value = 'Porters';
    m.click('#ab-pack-add');
    const chip = m.all('.ab-pack').find((e) => /Porters/.test(e.textContent));
    assert.ok(chip, 'the new pack is not offered');
    assert.ok(chip.classList.contains('ab-pack-new'),
        'a pack no template carries is drawn as if it were stored');
    assert.strictEqual(m.patches.length, 0, 'creating a pack wrote something');
    assert.ok(m.q('[data-ab-tpl-pack][data-ab-pack="Porters"]'),
        'the new pack cannot be assigned to anything');
  });

  it('refuses to publish a template with no pack', async () => {
    const m = await mount();
    await m.tab('library');
    m.click('[data-ab-pub="t3"]');
    await new Promise((r) => setTimeout(r, 10));
    assert.strictEqual(m.patches.length, 0, 'an unsendable template was published');
    assert.ok(m.toasts.some((x) => x[0] === 'alert'), 'and nothing said why');
  });

  it('publishes one that has a pack', async () => {
    const m = await mount();
    await m.tab('library');
    m.click('[data-ab-pub="t2"]');
    await new Promise((r) => setTimeout(r, 10));
    assert.deepStrictEqual(m.patches.pop(), { id: 't2', patch: { published: false } });
  });

  it('deletes through the confirm, never directly', async () => {
    const m = await mount();
    await m.tab('library');
    m.click('[data-ab-del-tpl="t1"]');
    assert.strictEqual(m.removed.length, 0, 'deleted without asking');
    await m.confirms.pop().go();
    assert.deepStrictEqual(m.removed, ['t1']);
  });
});

// ════════════════════════════════════════════════════════════════════
describe('Pissarres — the multi-club send', () => {
  it('refuses until a club and a pack are chosen', async () => {
    const m = await mount();
    await m.tab('library');
    m.click('#ab-seed-go');
    await new Promise((r) => setTimeout(r, 10));
    assert.ok(!m.calls.some((c) => c.callable), 'sent with nothing selected');
    assert.ok(!m.q('#ab-seed-result').hidden, 'and said nothing about it');
  });

  it('sends every chosen club in ONE call', async () => {
    const m = await mount();
    await m.tab('library');
    ['c-esq', 'c-gav'].forEach((id) => {
      const box = m.q('[data-ab-send-club="' + id + '"]');
      box.checked = true;
      box.dispatchEvent(new m.doc.defaultView.Event('change', { bubbles: true }));
    });
    const pack = m.q('[data-ab-send-pack="Amateur"]');
    pack.checked = true;
    pack.dispatchEvent(new m.doc.defaultView.Event('change', { bubbles: true }));
    m.click('#ab-seed-go');
    await new Promise((r) => setTimeout(r, 20));
    const call = m.calls.filter((c) => c.callable).pop();
    assert.strictEqual(call.callable, 'seedClubFromTemplates');
    assert.deepStrictEqual(call.payload,
        { clubIds: ['c-esq', 'c-gav'], packs: ['Amateur'] });
  });

  it('reads back the totals the old single-club shape also returned', async () => {
    const m = await mount();
    await m.tab('library');
    const box = m.q('[data-ab-send-club="c-esq"]');
    box.checked = true;
    box.dispatchEvent(new m.doc.defaultView.Event('change', { bubbles: true }));
    const pack = m.q('[data-ab-send-pack="Base"]');
    pack.checked = true;
    pack.dispatchEvent(new m.doc.defaultView.Event('change', { bubbles: true }));
    m.click('#ab-seed-go');
    await new Promise((r) => setTimeout(r, 20));
    const out = m.q('#ab-seed-result').textContent;
    assert.ok(/3/.test(out) && /1/.test(out), 'the result says nothing useful');
  });

  it('picks and clears every club at once', async () => {
    const m = await mount();
    await m.tab('library');
    m.click('#ab-send-all');
    assert.strictEqual(m.all('.ab-box-on').length, 3);
    m.click('#ab-send-none');
    assert.strictEqual(m.all('.ab-box-on').length, 0);
  });
});

// ════════════════════════════════════════════════════════════════════
describe('Pissarres — the editor tab launches the real editor', () => {
  /* The drawing editor is ~4,200 lines bound to the `tactics` page. A second
     copy here would be two of everything for one job. */
  it('does not embed a second editor', async () => {
    assert.ok(!/bindTactics/.test(PAGE_BARE), 'the tactics editor was inlined into the page');
  });

  it('opens a blank board with the template flag cleared', async () => {
    const m = await mount();
    await m.tab('editor');
    m.click('#ab-new-board');
    assert.deepStrictEqual(m.cleared, [true],
        'a new board would open as an edit of the last template');
    assert.deepStrictEqual(m.navigated, ['tactics']);
  });

  it('opens a draft in the editor with its template id', async () => {
    const m = await mount();
    await m.tab('editor');
    m.click('[data-ab-edit-tpl="t3"]');
    await new Promise((r) => setTimeout(r, 10));
    assert.deepStrictEqual(m.calls.filter((c) => c.hydrateEditor).pop().hydrateEditor,
        { templateId: 't3' });
    assert.deepStrictEqual(m.navigated, ['tactics']);
  });

  it('lists the drafts, not the published templates', async () => {
    const m = await mount();
    await m.tab('editor');
    assert.strictEqual(m.all('.ab-list-row').length, 1);
    assert.ok(/Estructura de rebuig/.test(m.html()));
  });
});

// ════════════════════════════════════════════════════════════════════
describe('Pissarres — the club\'s board is never edited from here', () => {
  /* The rules WOULD let the superuser write it — isSuperUser() is an arm of
     every tacticBoards write. A club's library is the club's, and an edit
     landing there without its author knowing is not a thing this product
     should be able to do. The only way out is promoteBoardTemplate, which
     takes an anonymised copy. */
  it('offers only Veure and Copiar on a club board', async () => {
    const m = await mount();
    const acts = m.all('.ab-card-a')[0];
    assert.ok(acts.querySelector('[data-ab-preview]'));
    assert.ok(acts.querySelector('[data-ab-promote]'));
    assert.ok(!acts.querySelector('input, select'), 'a club board became editable');
  });

  it('marks a board already taken into the library', async () => {
    const m = await mount();
    const card = m.cards().find((c) => c.dataset.abCard === 'b2');
    assert.ok(card.querySelector('.ab-done'), 'a promoted board offers to be promoted again');
    assert.ok(!card.querySelector('[data-ab-promote]'));
  });

  it('promotes through the confirm, sending only the board id', async () => {
    const m = await mount();
    m.click('[data-ab-promote="b1"]');
    assert.strictEqual(m.confirms.length, 1);
    await m.confirms.pop().go();
    const call = m.calls.filter((c) => c.callable).pop();
    assert.strictEqual(call.callable, 'promoteBoardTemplate');
    assert.deepStrictEqual(call.payload, { boardId: 'b1' });
  });
});

// ════════════════════════════════════════════════════════════════════
describe('Pissarres — what the rest of the app depends on', () => {
  it('keeps the two literals the tactics suite pins', () => {
    assert.ok(/_abState\.loaded && !force/.test(PAGE),
        'the catalogue cache no longer early-returns on `loaded`');
    assert.ok((bare.match(/_abInvalidate\(\);/g) || []).length >= 2,
        'the editor stopped marking the catalogue dirty after a template save');
  });

  it('stays entirely above the Configuració slice', () => {
    const end = appSrc.indexOf('  // #endregion Superadmin board catalogue');
    const cfg = appSrc.indexOf('  /** Which tab is showing.');
    assert.ok(end !== -1 && cfg > end,
        'new code landed below the region and inside the Configuració harness');
  });

  it('names the sidebar entry through t(), not as a literal', () => {
    assert.ok(/id: 'admin-boards'[\s\S]{0,60}t\('sidebar\.admin_boards'\)/.test(appSrc),
        'the sidebar label is a hardcoded string again');
  });
});

// ════════════════════════════════════════════════════════════════════
describe('seedClubFromTemplates — the widened callable', () => {
  const SEED = fnSrc.slice(fnSrc.indexOf('exports.seedClubFromTemplates'));

  it('accepts the old single-club shape forever', () => {
    /* An APK installed today outlives any migration window, and the service
       worker serves a cached js/app.js until the version bump reaches it. */
    assert.ok(/uniqStrings\(data\.clubIds, data\.clubId\)/.test(SEED),
        '{clubId} is no longer accepted');
    assert.ok(/uniqStrings\(data\.packs, data\.pack\)/.test(SEED),
        '{pack} is no longer accepted');
  });

  it('dedupes both lists', () => {
    const U = fnSrc.slice(fnSrc.indexOf('function uniqStrings'));
    assert.ok(/seen\.has\(s\)/.test(U), 'the dedupe is gone');
    assert.ok(/uniqStrings\(data\.templateIds\)/.test(SEED),
        'templateIds:[t1,t1] creates the board twice again');
  });

  it('validates every club BEFORE it writes anything', () => {
    const i = SEED.indexOf('clubSnaps.some((s) => !s.exists)');
    const j = SEED.indexOf('batch.commit()');
    assert.ok(i !== -1 && j > i,
        'a bad club id in the list leaves the earlier clubs half-seeded');
    assert.ok(/throw new HttpsError\("not-found"/.test(SEED.slice(i, i + 200)),
        'an unknown club must still throw not-found');
  });

  it('updates `already` inside the loop, not only before it', () => {
    const loop = SEED.slice(SEED.indexOf('for (const clubId of clubIds)'));
    const add = loop.indexOf('already.add(tpl.id)');
    const commit = loop.indexOf('batch.commit()');
    assert.ok(add > commit,
        'the in-call duplicate guard is a pre-loop snapshot again');
  });

  it('reads each template once, not once per club', () => {
    const loop = SEED.indexOf('for (const clubId of clubIds)');
    const reads = SEED.indexOf('db.collection("tacticTemplateData").doc(id).get()');
    assert.ok(reads !== -1 && reads < loop,
        'fifty clubs means fifty reads of the same template');
  });

  it('returns the old totals AND the new per-club breakdown', () => {
    assert.ok(/return \{ok: true, created, skipped, byClub\}/.test(SEED),
        'a shipped client reading created/skipped would see undefined');
  });

  it('mints board ids from the collection, not from the clock', () => {
    assert.ok(/db\.collection\("tacticBoards"\)\.doc\(\)/.test(SEED));
    assert.ok(!/"tb_" \+ Date\.now\(\)/.test(SEED),
        'a tight multi-club loop can collide inside one millisecond');
  });

  /* `array-contains` takes one value, so several packs is several queries.
     Adding .where("published","==",true) would need a composite index this
     repo deliberately has none of. */
  it('unions the pack queries without asking for a composite index', () => {
    assert.ok(/packs\.map\(\(p\) =>[\s\S]{0,200}"array-contains", p\)/.test(SEED));
    const packQ = SEED.slice(SEED.indexOf('array-contains'));
    assert.ok(!/published", "=="/.test(packQ.slice(0, 200)),
        'the pack query gained a second where() and now needs an index');
  });

  it('bounds one call', () => {
    assert.ok(/SEED_MAX_CLUBS/.test(SEED) && /SEED_MAX_TEMPLATES/.test(SEED));
  });
});

// ════════════════════════════════════════════════════════════════════
describe('Pissarres — the stylesheet', () => {
  const BANNER = 'PISSARRES, redesigned (v257)';
  const start = css.indexOf(BANNER);
  /* Last in the file, so this slice runs to the end. Bound it by ITS banner
     before appending another page — an unbounded slice has broken five suites
     in turn, and the bound is found by indexOf, so the next banner must not be
     named anywhere inside this block either. */
  const block = css.slice(start).replace(/\/\*[\s\S]*?\*\//g, '');

  it('has its own block, at the end of the file', () => {
    assert.ok(start !== -1, 'the ab- banner is gone from css/style.css');
  });

  it('bounds the Gestió d\'usuaris block that now precedes it', () => {
    const gu = css.indexOf('GESTIÓ D\'USUARIS, redesigned (v255)');
    assert.ok(gu !== -1 && gu < start, 'the two blocks are out of order');
    assert.ok(css.indexOf(BANNER, gu) === start,
        'something before the banner matches it and would cut the gu- slice short');
  });

  /* The old block used --card, --border and --primary. Two blocks for one
     prefix, in two design systems, is how a page ends up half-restyled. */
  it('leaves no second .ab- block in the legacy tokens', () => {
    const before = css.slice(0, start);
    assert.ok(!/\.ab-tabs\s*\{/.test(before), 'the chrome-token .ab- block is still there');
    assert.ok(!/var\(--card\)/.test(block) && !/var\(--primary\)/.test(block) &&
        !/var\(--border\)/.test(block), 'the paper block reaches for chrome tokens');
  });

  it('joins the shared band, bleed, inset and figure lists', () => {
    const shared = css.slice(0, start);
    [/\.ab-page,\n\.cal-page \{/, /\.ab-hero,\n/, /\.ab-h1,\n/,
      /\.ab-body,\n/, /\.ab-hero-l \{/, /\.ab-sub \{/,
      /\.ab-fig-l, \.ab-sec-l,\n/, /\.ab-figs \{/, /\.ab-fig \{/, /\.ab-fig-v \{/]
        .forEach((re) => {
          assert.ok(re.test(shared), 'not in the shared list: ' + re);
        });
    assert.ok(!/^\.ab-hero \{/m.test(block), 'the band is redeclared instead of joined');
  });

  /* ⚠ `.ab-chip:hover` is 0,2,0 and `.ab-chip-on` is 0,1,0, so a bare hover
     rule repaints the SELECTED chip's label on its own dark fill and the text
     disappears. Reported from the running app on the identical control in
     Gestió d'usuaris. */
  it('keeps the selected chip readable under the cursor', () => {
    [['ab-chip', 'the tag chips'], ['ab-pchip', 'the pack chips']].forEach(([c, what]) => {
      assert.ok(new RegExp('\\.' + c + ':hover:not\\(\\.' + c + '-on\\)').test(block),
          what + ': the hover rule still repaints the selected chip');
      assert.ok(new RegExp('\\.' + c + '\\.' + c + '-on:hover').test(block),
          what + ': the selected chip has no hover of its own to win with');
    });
    assert.ok(/\.ab-tab:hover:not\(\.ab-tab-on\)/.test(block),
        'the selected tab greys out under the cursor');
  });

  it('keeps the row ends clear of the page edge', () => {
    /* ⚠ Longhand. A `padding: 12px 4px` shorthand in either the row or an
       override silently resets the side padding — which happened twice on the
       identical row in Gestió d'usuaris. */
    assert.ok(/\.ab-head, \.ab-row \{[\s\S]*?padding-left: 4px; padding-right: 4px;/.test(block),
        'the shared row template lost its side padding');
    assert.ok(!/\.ab-row \{[^}]*padding:\s*\d/.test(block),
        'a padding shorthand on .ab-row resets the side padding');
  });

  it('shares one column template between the head and the rows', () => {
    assert.ok(/\.ab-head, \.ab-row \{[\s\S]*?grid-template-columns:/.test(block),
        'the head and the rows can drift apart');
  });

  it('sizes the card grid without a breakpoint per width', () => {
    assert.ok(/repeat\(auto-fill, minmax\(260px, 1fr\)\)/.test(block));
  });

  /* ⚠ The TAB STRIP may scroll — three uppercase labels do not fit 390px and
     scrolling them inside their own box is the point. Nothing else may: a body
     or a grid that scrolls sideways drags the band and the title with it,
     which is the failure this assertion exists for. */
  it('lets nothing but the tab strip scroll sideways', () => {
    const scrollers = [];
    const RX = /([^{}]+)\{([^}]*overflow-x:\s*(?:auto|scroll)[^}]*)\}/g;
    let hit;
    while ((hit = RX.exec(block))) scrollers.push(hit[1].trim());
    assert.deepStrictEqual(scrollers, ['.ab-tabs'],
        'something other than the tab strip scrolls the page sideways');
  });

  it('folds the six library columns down rather than scrolling them', () => {
    const wide = block.slice(block.indexOf('@media (max-width: 900px)'));
    assert.ok(/\.ab-head \{ display: none/.test(wide), 'the head survives on a phone');
    assert.ok(/\.ab-c-packs, \.ab-c-state, \.ab-c-act \{ grid-column: 1 \/ -1/.test(wide),
        'the row does not fold');
  });

  it('gives the phone real hit targets', () => {
    const phone = block.slice(block.indexOf('@media (max-width: 700px)'));
    ['.ab-input, .ab-btn', '.ab-link', '.ab-row .ab-input'].forEach((sel) => {
      const i = phone.indexOf(sel);
      assert.ok(i !== -1, 'no phone rule for ' + sel);
      assert.ok(/44px/.test(phone.slice(i, phone.indexOf('}', i))), sel + ' is under 44px');
    });
    assert.ok(/\.ab-chip \{ height: 40px/.test(phone), 'the chips lose their hit target');
  });

  it('keeps the skeleton and the drawn board the same shape', () => {
    // The skeleton's own aspect-ratio is what stops the card resizing under
    // the reader when it hydrates; this block must not undo it.
    assert.ok(!/\.tb-ro-skeleton[^}]*aspect-ratio/.test(block),
        'the catalogue overrides the skeleton\'s aspect ratio');
    assert.ok(/\.ab-thumb \.tb-ro-skeleton \{/.test(block),
        'the skeleton is not dressed for the card at all');
  });
});

// ════════════════════════════════════════════════════════════════════
describe('Pissarres — the copy', () => {
  const keys = {};
  const K = /'(ab\.[a-z_0-9]+)':\s*\{([\s\S]*?)\},?\n/g;
  let m2;
  while ((m2 = K.exec(appSrc))) keys[m2[1]] = m2[2];

  it('has ca, es and en for every ab.* key', () => {
    const names = Object.keys(keys);
    assert.ok(names.length > 40, 'the ab.* table is missing');
    names.forEach((k) => {
      ['ca:', 'es:', 'en:'].forEach((lang) => {
        assert.ok(keys[k].includes(lang), k + ' has no ' + lang.slice(0, 2));
      });
    });
  });

  it('uses every ab.* key it defines, and defines every one it uses', () => {
    const used = new Set();
    let u;
    const UR = /t\('(ab\.[a-z_0-9]+)'\)/g;
    while ((u = UR.exec(appSrc))) used.add(u[1]);
    Object.keys(keys).forEach((k) => {
      assert.ok(used.has(k), 'defined but never rendered: ' + k);
    });
    used.forEach((k) => {
      assert.ok(k in keys, 'rendered but never defined — the page shows the raw key: ' + k);
    });
  });

  it('renders no raw key, in any of the three languages', async () => {
    const m = await mount();
    await m.tab('library');
    assert.ok(!/\bab\.[a-z_]+\b/.test(m.host.textContent),
        'a bare i18n key reached the page');
  });

  it('leaves every {placeholder} filled', async () => {
    const m = await mount();
    assert.ok(!/\{(scope|n|t|total|c|s|p|e)\}/.test(m.host.textContent),
        'an unreplaced placeholder reached the page');
  });
});
