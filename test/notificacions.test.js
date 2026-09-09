/* Notificacions — the staff feed, rebuilt in `.nf-` (v245).
 *
 * WHAT FAILS SILENTLY HERE:
 *
 * 1. ⚠ A PRE-v245 RECORD DISAPPEARING. The feed gained `team`, `answer`,
 *    `page` and two new types; every record already in the blob has none of
 *    them. A filter that treats "no team" as "not this team" silently hides
 *    real history, and the only person who would notice is the coach who
 *    remembers an answer that is no longer there.
 * 2. ⚠ A WRITE CLOBBERING ANOTHER CATEGORY. The blob is club-wide and saved
 *    WHOLE. Marking the visible rows read by writing back the filtered array
 *    deletes everyone else's — and looks perfectly fine on the page that did
 *    it.
 * 3. ⚠ THE PAGE MARKING EVERYTHING READ ON RENDER. That is what it used to
 *    do; putting it back would make the unread count meaningless again while
 *    every test about badges still passed.
 * 4. ⚠ THE BADGE COLOUR COMING FROM `detail`. Detail is a stored sentence in
 *    whatever language the app was in at the time. The colour comes from
 *    `answer`.
 *
 * `npm run test:notificacions`.
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { readCss } = require('./read-css');
const utils = require('../js/utils.js');

const src = fs.readFileSync(path.join(__dirname, '..', 'js', 'app.js'), 'utf8');
const utilsSrc = fs.readFileSync(path.join(__dirname, '..', 'js', 'utils.js'), 'utf8');
const css = readCss();
const bare = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

function grab(from, to) {
  const i = src.indexOf(from);
  const j = src.indexOf(to, i);
  assert.ok(i !== -1 && j !== -1, 'marker not found in js/app.js: ' + from);
  return src.slice(i, j);
}

/* The `.nf-` block. It is no longer last in the stylesheet — Configuració
   (v254) was appended after it — so the slice is bounded at BOTH ends. An
   unbounded slice here is the shape that has broken four suites in turn: it
   reads the next page's rules as this one's, and every scan below then fails
   on a selector Notificacions never had. If a page is appended after
   Configuració, bound THAT block the same way before you add it. */
const NFBANNER = '/* ===== Notificacions, redesigned (v245)';
const NFEND = 'CONFIGURACIÓ, redesigned (v254)';
const NFSTART = css.indexOf(NFBANNER);
assert.ok(NFSTART !== -1, 'the nf- block banner is gone from css/style.css');
const NFSTOP = css.indexOf(NFEND, NFSTART);
assert.ok(NFSTOP !== -1,
    'the cfg- block banner that bounds the nf- slice is gone from css/style.css');
const NFCSS = css.slice(NFSTART, NFSTOP).replace(/\/\*[\s\S]*?\*\//g, '');

const SANITIZE_SRC = utilsSrc.slice(
    utilsSrc.indexOf('function sanitize(str) {'),
    utilsSrc.indexOf('// ---------- Tactical Formations ----------'));

// ── fixtures ──────────────────────────────────────────────────────────────
const NOW = new Date(2026, 8, 2, 18, 30);
const ago = (mins) => new Date(NOW.getTime() - mins * 60000).toISOString();

const USERS = [['u1', 'CB'], ['u2', 'ST'], ['u3', 'DM'], ['u4', 'GK'], ['u5', 'LW']]
    .map(([id, position]) => ({ id, name: 'Jugador ' + id, position,
      category: 'amateur', team: 'A', roles: ['player'] }));

/* Every badge, both read states, both squads — and two PRE-v245 records with
   no `team`, no `answer` and no `page`. */
const FEED = [
  { id: 'n1', type: 'injury', uid: 'u1', category: 'amateur', team: 'A', read: false,
    playerName: 'Marc Puig', detail: 'Autoreport', activity: 'Força',
    page: 'medical-detail', pageId: 'u1', timestamp: ago(12) },
  { id: 'n2', type: 'match_avail', uid: 'u2', category: 'amateur', team: 'A', read: false,
    playerName: 'Guillem Roca', detail: 'No Disponible', answer: 'no_disponible',
    activity: 'Partit', page: 'match-detail', pageId: 'm1', timestamp: ago(34) },
  { id: 'n3', type: 'training_avail', uid: 'u3', category: 'amateur', team: 'A', read: false,
    playerName: 'Nil Ferrer', detail: 'Tard', answer: 'late', activity: 'Tàctica',
    page: 'staff-training-detail', pageId: 't2', timestamp: ago(90) },
  { id: 'n4', type: 'training_avail', uid: 'u4', category: 'amateur', team: 'A', read: false,
    playerName: 'Oriol Mas', detail: 'Sí', answer: 'yes', activity: 'Tàctica',
    page: 'staff-training-detail', pageId: 't2', timestamp: ago(120) },
  { id: 'n5', type: 'training_rpe', uid: 'u5', category: 'amateur', team: 'B', read: false,
    playerName: 'Roger Pla', detail: 'RPE 8 · 80 min', activity: 'Força',
    page: 'staff-training-detail', pageId: 't1', timestamp: ago(150) },
  { id: 'n6', type: 'extra_training', uid: 'u1', category: 'amateur', team: 'A', read: true,
    playerName: 'Marc Puig', detail: 'Gimnàs 60 min', activity: 'Extra',
    page: 'staff-player-stats', pageId: 'u1', timestamp: ago(1300) },
  // ── pre-v245: no team, no answer, no page ──
  { id: 'n7', type: 'registration', uid: 'u2', category: 'amateur', read: false,
    playerName: 'Ibrahim Diallo', detail: 'Sol·licitud', activity: '', timestamp: ago(1400) },
  { id: 'n8', type: 'training_avail', uid: 'u3', category: 'amateur', read: true,
    playerName: 'Jordi Vidal', detail: 'No', activity: 'Resistència', timestamp: ago(2000) },
];

function load(over) {
  const o = over || {};
  const saved = [];
  const api = {
    getStaffNotifications: () => JSON.parse(JSON.stringify(o.feed || FEED)),
    saveStaffNotifications: (l) => saved.push(l),
    updateStaffNotifBadge: () => {},
    getStaffNotifications_saved: saved,
    getUsers: () => USERS,
    getVisibleCategories: () => ['amateur'],
    getTeamLetters: () => ['A', 'B'],
    getCurrentCategory: () => ('cat' in o ? o.cat : 'amateur'),
    inMyNotifScope: o.inScope || (() => true),
    canViewPage: o.canView || (() => true),
    CATEGORY_LABELS: { amateur: 'Amateur' },
    POS_COLORS: utils.POS_COLORS,
    localDateStr: utils.localDateStr,
    getCurrentSquad: () => ('letter' in o ? o.letter : 'A'),
    notifUnreadOnly: !!o.unreadOnly,
    t: (k) => k,
    tv: (k, v) => k + ':' + JSON.stringify(v),
    tDayDDMM: (d) => String(d).slice(8) + '/' + String(d).slice(5, 7),
    document: { createElement: () => ({ set textContent(v) { this._v = v; }, get innerHTML() { return String(this._v); } }) },
  };
  // eslint-disable-next-line no-new-func
  return new Function(...Object.keys(api), `
    ${SANITIZE_SRC}
    ${grab('\n  /* ── Notificacions, redesigned (v245) ──', '  /** The position circle beside a name.')}
    ${grab('  function nfPosOf(n) {', '\n  // #endregion')}
    const _now = new Date(${NOW.getTime()});
    const _real = Date;
    Date = function (...a) { return a.length ? new _real(...a) : new _real(_now.getTime()); };
    Date.prototype = _real.prototype; Date.now = () => _now.getTime();
    Date.parse = _real.parse; Date.UTC = _real.UTC;
    try {
      return { html: renderStaffNotifications(), saved: getStaffNotifications_saved,
               nfInLetter, nfTime, nfBadgeHtml };
    } finally { Date = _real; }
  `)(...Object.values(api));
}

const rowIds = (h) => (h.match(/data-nf-id="([^"]+)"/g) || [])
    .map((s) => s.slice('data-nf-id="'.length, -1));

// ═══════════════════════════════════════════════════════════════════════════
describe('Notificacions — the page renders at all', () => {
  it('builds a page, not an exception', () => {
    const h = load().html;
    assert.ok(h.includes('id="nf-page"'), 'no page root');
    assert.ok(h.length > 1500, 'suspiciously short: ' + h.length);
  });

  it('names every nf.* key it renders in all three languages', () => {
    const used = [...new Set((bare.match(/'nf\.[a-z_0-9]+'/g) || []).map((s) => s.slice(1, -1)))];
    assert.ok(used.length > 20, 'only ' + used.length + ' nf.* keys are used');
    const table = src.slice(src.indexOf("'nf.b_avail':"), src.indexOf("// ── Settings ──"));
    used.forEach((k) => {
      const j = table.indexOf("'" + k + "':");
      assert.ok(j !== -1, k + ' is rendered but not translated');
      const entry = table.slice(j, table.indexOf('},', j));
      ['ca:', 'es:', 'en:'].forEach((lang) => {
        assert.ok(entry.includes(lang), k + ' has no ' + lang.slice(0, 2));
      });
    });
  });

  /* ⚠ typeBadge() hardcoded English labels and hex colours and never called
     t(), so the five `notif.*` keys beside it were dead and the page shipped
     "Training Avail" in every language. */
  it('routes every badge label through t()', () => {
    const b = bare.slice(bare.indexOf('const NF_BADGE'), bare.indexOf('function renderStaffNotifications'));
    assert.ok(!/'(?:Training|Match|Extra|Injury|Availability)/.test(b),
        'a hardcoded English badge label is back');
    assert.ok(!/#[0-9a-fA-F]{6}/.test(b), 'a badge colour is a literal again');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe('Notificacions — a pre-v245 record still counts', () => {
  /* ⚠ THE ONE THAT MATTERS. Every record already in the blob predates the
     fields the new page reads. */
  it('shows a record with no `team` under every letter filter', () => {
    ['A', 'B', 'all'].forEach((letter) => {
      const ids = rowIds(load({ letter }).html);
      assert.ok(ids.includes('n7'), 'a teamless record vanished under letter ' + letter);
      assert.ok(ids.includes('n8'), 'a teamless record vanished under letter ' + letter);
    });
  });

  it('does the same for a record with no category, as inMyNotifScope does', () => {
    const { nfInLetter } = load();
    assert.strictEqual(nfInLetter({}, 'A'), true);
    assert.strictEqual(nfInLetter({ team: 'B' }, 'A'), false);
    assert.strictEqual(nfInLetter({ team: 'B' }, 'all'), true);
  });

  it('renders it unbadged-by-answer rather than guessing a colour', () => {
    const h = load().html;
    const row = h.slice(h.indexOf('data-nf-id="n8"') === -1
      ? h.indexOf('Jordi Vidal') - 400 : h.indexOf('data-nf-id="n8"'), h.length);
    const cell = row.slice(0, row.indexOf('</span>', row.indexOf('nf-badge')));
    assert.ok(!/nf-a-(ok|warn|off|bad)/.test(cell),
        'a record with no `answer` was given an answer colour');
  });

  it('leaves it unlinked rather than sending the coach nowhere', () => {
    const h = load().html;
    const i = h.indexOf('Jordi Vidal');
    const before = h.slice(Math.max(0, i - 500), i);
    assert.ok(!/data-nf-page="[^"]+"/.test(before.slice(before.lastIndexOf('<'))),
        'a record with no page target is a link to nothing');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe('Notificacions — the badge is coloured by the ANSWER', () => {
  it('greens a yes, ambers a late, greys a no', () => {
    const h = load().html;
    assert.ok(h.includes('nf-a-ok'), 'a yes is not green');
    assert.ok(h.includes('nf-a-warn'), 'a late is not amber');
    assert.ok(h.includes('nf-a-off'), 'a no is not grey');
  });

  it('reads `answer` and never parses `detail`', () => {
    const b = bare.slice(bare.indexOf('const NF_ANSWER_CLS'), bare.indexOf('function nfTime'));
    assert.ok(b.includes('n.answer'), 'the badge stopped reading the answer');
    assert.ok(!/n\.detail/.test(b), 'the badge is parsing a stored sentence again');
  });

  it('gives the two availability types ONE badge word', () => {
    const b = bare.slice(bare.indexOf('const NF_BADGE'), bare.indexOf('const NF_ANSWER_CLS'));
    assert.strictEqual((b.match(/nf\.b_avail/g) || []).length, 2,
        'training and match availability should share a badge');
  });

  it('falls back for a type it has never seen rather than throwing', () => {
    const { nfBadgeHtml } = load();
    assert.ok(nfBadgeHtml({ type: 'something_new' }).includes('nf-b-other'));
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe('Notificacions — read state', () => {
  /* ⚠ IT USED TO MARK EVERYTHING READ AS A SIDE EFFECT OF RENDERING. */
  it('does NOT write anything just because the page rendered', () => {
    const r = load();
    assert.strictEqual(r.saved.length, 0,
        'rendering the page wrote to the blob — the unread count means nothing again');
  });

  it('counts the unread in scope, and says so in the hero', () => {
    const h = load().html;                      // A: n1 n2 n3 n4 unread, + n7 teamless
    assert.ok(h.includes('nf.hero:'), 'the hero line is missing');
    assert.ok(/nf-fig-v ac-num ac-v-red">5</.test(h),
        'the unread figure is wrong: ' + (h.match(/nf-fig-v[^>]*>\d+/) || [])[0]);
  });

  it('says "tot llegit" and disables the bulk action when nothing is unread', () => {
    const h = load({ feed: FEED.map((n) => Object.assign({}, n, { read: true })) }).html;
    assert.ok(h.includes('nf.hero_read'), 'the all-read wording is missing');
    assert.ok(/id="nf-mark-all" disabled/.test(h), 'mark-all is still live with nothing to mark');
    assert.ok(h.includes('ac-v-ok'), 'the zero is not green');
  });

  it('filters to unread only when asked, and keeps the total in the count line', () => {
    const h = load({ unreadOnly: true }).html;
    assert.ok(!rowIds(h).includes('n6'), 'a read row survived the unread filter');
    assert.ok(h.includes('nf.count_unread:'), 'the count line did not change with the view');
    assert.ok(h.includes('nf-toggle-on'), 'the toggle does not show as on');
  });

  /* ⚠ EVERY WRITE GOES BACK OVER THE FULL LIST. */
  it('marks read over the full blob, never the filtered array', () => {
    const b = bare.slice(bare.indexOf('function bindNotifications'), bare.indexOf('function bindMyStatsInjuryPopup'));
    assert.ok(/const all = getStaffNotifications\(\);/.test(b),
        'markRead is not starting from the whole blob');
    assert.ok(/saveStaffNotifications\(all\)/.test(b),
        'a filtered array is being written back — other categories will be deleted');
    assert.strictEqual((b.match(/saveStaffNotifications\(/g) || []).length, 1,
        'a second writer appeared; the two will drift');
  });

  it('limits the bulk action to the squad the filter is pointed at', () => {
    const b = bare.slice(bare.indexOf("document.getElementById('nf-mark-all')"),
        bare.indexOf("[data-nf-squad]"));
    assert.ok(b.includes('nfInLetter(n, getCurrentSquad())'),
        'Marca-ho tot would clear a squad the coach has not looked at');
  });

  /* The button DELETED rows rather than marking them read. The feed is the
     only record that an answer was given. */
  it('has no Clear All left to destroy the log with', () => {
    assert.ok(!bare.includes('btn-clear-notifs'), 'the destructive button is back');
    assert.ok(!/saveStaffNotifications\(getStaffNotifications\(\)\.filter/.test(bare));
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe('Notificacions — rows go where the action happened', () => {
  it('links a row through the shared navigator, not a second copy', () => {
    const b = bare.slice(bare.indexOf('function bindNotifications'), bare.indexOf('function bindMyStatsInjuryPopup'));
    assert.ok(b.includes('goToDetail(row.dataset.nfPage'), 'the row sets its own page state');
    assert.ok(!/detailTrainingId\s*=|detailMatchId\s*=/.test(b),
        'a parallel target mapping appeared; it will drift from staff-home\'s');
  });

  it('is not a link at all for a viewer who may not open the target', () => {
    const h = load({ canView: () => false }).html;
    assert.ok(!h.includes('nf-row-go'), 'a delegate is offered a page they cannot open');
    assert.ok(!h.includes('data-nf-page='), 'the target survived the permission check');
  });

  it('marks the row read BEFORE navigating away from it', () => {
    const b = bare.slice(bare.indexOf(".nf-row-go'"), bare.indexOf("nf-toggle"));
    assert.ok(b.indexOf('markRead(') < b.indexOf('goToDetail('),
        'the row navigates first, so the read never lands');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe('Notificacions — the record shape', () => {
  it('stamps team, answer and a page target on every new record', () => {
    const b = bare.slice(bare.indexOf('function addStaffNotification'), bare.indexOf('function inMyNotifScope'));
    ['team:', 'answer:', 'page:', 'pageId:'].forEach((f) =>
      assert.ok(b.includes(f), f + ' is not stamped'));
    assert.ok(b.includes('(subject && subject.team)'),
        'the squad letter is not read off the subject the way the category is');
  });

  it('files an injury as its own type, not as an availability answer', () => {
    assert.strictEqual((bare.match(/type: 'injury'/g) || []).length, 2,
        'the two injury sites should both file `injury`');
    assert.ok(!/type: 'training_avail',[\s\S]{0,200}Injured/.test(bare),
        'a self-report is being filed as an availability answer again');
  });

  it('files a registration, which nothing used to do at all', () => {
    assert.ok(bare.includes("type: 'registration'"), 'joining the club still notifies nobody');
  });

  it('files an RPE edit as a SECOND record rather than amending the first', () => {
    const at = bare.indexOf("$$('.ac-save')");
    const b = bare.slice(at, bare.indexOf('ackSaveRecord', at));
    assert.ok(b.includes('wasAnswered'), 'an edit is indistinguishable from a first answer');
    assert.ok(b.includes("t('nf.rpe_changed')"), 'the feed does not say the number moved');
  });

  it('writes availability in Catalan, through t(), not as a stored English word', () => {
    assert.ok(!/answerMap = \{ yes: 'Yes'/.test(bare), 'the English map is back');
    assert.ok(bare.includes("detail: t('avail.' + val)"));
    assert.ok(bare.includes("detail: t('avail.' + btn.dataset.mavail)"));
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe('Notificacions — the filter bar', () => {
  it('joins the other pages on the shared .cat-bar', () => {
    assert.ok(/CATEGORY_PAGES = new Set\(\[[^\]]*'staff-notifications'/.test(bare));
    /* ⚠ v247: one unconditional call, not a per-page arm of a ternary. The
       six variables behind those arms are one `_viewSquad` now. */
    assert.ok(bare.includes("catBarLettersHtml(getCurrentSquad(), 'data-squad-letter')"),
        'the bar is not reading the shared selection');
    assert.ok(bare.includes("$$('[data-squad-letter]')"), 'the chips are never bound');
  });

  /* A stale 'B' under a category with no B filters the whole page away with
     no visible control saying why. Six resets became one clamp on read. */
  it('clamps a stale letter when the category changes', () => {
    assert.ok(/getTeamLetters\(cat\)\.indexOf\(_viewSquad\) === -1 \? 'all'/.test(bare),
        'getCurrentSquad no longer clamps');
    assert.ok(!/notifTeamFilter/.test(bare), 'Notificacions kept a private copy again');
  });

  it('re-scopes the page from the per-squad rail', () => {
    const h = load().html;
    assert.ok(h.includes('data-nf-squad='), 'the rail rows are not clickable');
    const b = bare.slice(bare.indexOf('[data-nf-squad]'), bare.indexOf('function bindMyStatsInjuryPopup'));
    assert.ok(b.includes('_viewCategory ='), 'clicking a squad does not move the category');
    assert.ok(b.includes('_viewSquad ='), 'clicking a squad does not move the letter');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe('Notificacions — the time column', () => {
  it('is relative while it is still today, then dated', () => {
    const { nfTime } = load();
    assert.strictEqual(nfTime(ago(0), NOW), 'nf.just_now');
    assert.strictEqual(nfTime(ago(12), NOW), 'nf.ago_min:{"n":12}');
    assert.strictEqual(nfTime(ago(150), NOW), 'nf.ago_h:{"n":2}');
    assert.ok(nfTime(ago(1300), NOW).startsWith('nf.yesterday'));
    assert.ok(/^\d\d\/\d\d /.test(nfTime(ago(60 * 24 * 4), NOW)),
        'anything older than yesterday should carry its date');
  });

  it('renders nothing for a record with no timestamp rather than "Invalid Date"', () => {
    const { nfTime } = load();
    assert.strictEqual(nfTime('', NOW), '');
    assert.strictEqual(nfTime('not-a-date', NOW), '');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe('Notificacions — the stylesheet', () => {
  it('is last, after Accions', () => {
    assert.ok(NFSTART > css.indexOf('/* ===== Accions, redesigned (v245)'));
  });

  /* ⚠ The rows are read by scanning DOWN one column. A badge sized to its own
     word turns that column into a ragged edge. */
  it('fixes the badge and name columns', () => {
    assert.ok(/\.nf-badge\s*\{[^}]*width:\s*116px/.test(NFCSS), 'the badge column moved');
    assert.ok(/\.nf-name\s*\{[^}]*width:\s*172px/.test(NFCSS), 'the name column moved');
  });

  /* ⚠ The rail's head and the main column's head are in different columns and
     must share one underline; only a fixed line box does that. */
  it('gives the section heads a fixed line box', () => {
    const shared = css.slice(css.indexOf('/* ===== Accions, redesigned (v245)'));
    assert.ok(/\.ac-sec\s*\{[^}]*line-height:\s*18px/.test(shared),
        'the two columns\' heads will not share an underline');
  });

  it('gives an unread row BOTH a wash and a bar', () => {
    assert.ok(/\.nf-row-new\s*\{[^}]*background:\s*#F6F2E9/.test(NFCSS), 'the wash moved');
    assert.ok(/\.nf-row-new \.nf-bar\s*\{[^}]*background:\s*#BD162C/.test(NFCSS), 'the bar moved');
  });

  /* ⚠ The wash must reach the ends of the rules above and below, and the text
     must not touch them — 14px of INNER padding, full column width. */
  it('pads the rail rows inside their own full width', () => {
    assert.ok(/\.nf-s-row\s*\{[^}]*width:\s*100%/.test(NFCSS));
    assert.ok(/\.nf-s-row\s*\{[^}]*padding:\s*13px 14px/.test(NFCSS));
    assert.ok(/\.nf-s-row\s*\{[^}]*box-sizing:\s*border-box/.test(NFCSS),
        'without border-box the padding widens the row past its column');
  });

  /* ⚠ Both rails are sized ABOVE the media queries that fold them. `.nf-rail`
     was once declared after the 1100px override and won the cascade, leaving
     it 372px wide at 390px and pushing the page sideways. */
  it('sizes both rails before the breakpoint that folds them', () => {
    const shared = css.slice(css.indexOf('/* ===== Accions, redesigned (v245)'));
    const decl = shared.indexOf('.ac-rail, .nf-rail {');
    const fold = shared.indexOf('@media (max-width: 1100px)');
    assert.ok(decl !== -1 && decl < fold,
        'a rail width is declared after the override meant to cancel it');
    assert.ok(!/\n\.nf-rail\s*\{/.test(NFCSS), 'a second .nf-rail width rule came back');
  });

  it('indents the phone detail line with padding, not a margin on a 100% basis', () => {
    const phone = NFCSS.slice(NFCSS.indexOf('@media (max-width: 700px)'));
    assert.ok(/\.nf-detail\s*\{[^}]*padding-left/.test(phone));
    assert.ok(!/\.nf-detail\s*\{[^}]*margin-left/.test(phone),
        '100% basis plus a margin is wider than the phone');
  });

  it('does not pull the phone action bar out of flow', () => {
    const phone = NFCSS.slice(NFCSS.indexOf('@media (max-width: 700px)'));
    assert.ok(!/\.nf-acts\s*\{[^}]*position:\s*absolute/.test(phone),
        '`.nf-hero` is not a positioned ancestor; this escapes to the viewport');
  });
});
