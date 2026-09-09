/* Gestió d'usuaris — who is on the club's platform and what they may do (v255).
 *
 * Deliberately NOT Registracions: that is the squad sheet (dorsal, position,
 * agent, the pending queue), and the dorsal here is read-only text.
 *
 * ⚠ THE TRAP THIS PAGE HAS ALREADY FALLEN INTO ONCE. The Player/Staff toggles
 * that used to live in this column rewrote `roles` in the local `fa_users`
 * blob and never called setRole — so the badge changed and the person's real
 * permissions did not. Worse, the lie did not self-heal: js/db.js's reconcile
 * only ever ADDS members it has not seen and never refreshes one already in
 * the blob. Roles move through the roster email lists, and the row READS those
 * lists rather than predicting what the server will derive.
 *
 * ⚠ The render test CALLS renderAdminUsers(). Slicing a builder and reading
 * its text is what let v238 ship a Plantilla page that rendered nothing.
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { readCss } = require('./read-css');
const U = require('../js/utils.js');

const APP = path.join(__dirname, '..', 'js', 'app.js');
const appSrc = fs.readFileSync(APP, 'utf8');
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
const RE = /'((?:gu|users|common|auth|staffrole|btn|page|cat)\.[a-z_0-9]+)':\s*\{\s*ca:\s*'((?:[^'\\]|\\.)*)'/g;
let mm;
while ((mm = RE.exec(appSrc))) CA[mm[1]] = mm[2].replace(/\\'/g, "'");

const CLUB = {
  id: 'club1',
  leadEmail: 'lead@club.cat',
  categories: {
    amateur: { enabled: true, letters: ['A', 'B'] },
    juvenil: { enabled: true, letters: ['A'] }
  },
  rosters: {
    'amateur-A': {
      playerEmails: ['p1@x.com'],
      staffEmails: ['coach@x.com', 'fit@x.com'],
      staffRoles: { 'fit@x.com': 'fitness' }
    },
    'amateur-B': { playerEmails: ['p2@x.com'], staffEmails: [], staffRoles: {} },
    'juvenil-A': { playerEmails: ['p3@x.com'], staffEmails: [], staffRoles: {} }
  }
};

const USERS = [
  { id: 'p1', name: 'Player One', email: 'p1@x.com', category: 'amateur', team: 'A', position: 'CB', playerNumber: '4', roles: ['player'] },
  { id: 'p2', name: 'Player Two', email: 'p2@x.com', category: 'amateur', team: 'B', position: 'ST', playerNumber: '9', roles: ['player'] },
  { id: 'p3', name: 'Player Three', email: 'p3@x.com', category: 'juvenil', team: 'A', position: 'GK', playerNumber: '1', roles: ['player'] },
  { id: 'c1', name: 'The Coach', email: 'coach@x.com', category: 'amateur', team: 'A', roles: ['staff'], staffRole: 'coach' },
  { id: 'f1', name: 'The Fitness', email: 'fit@x.com', category: 'amateur', team: 'A', roles: ['staff'], staffRole: 'fitness' },
  /* No squad — the state this page exists to resolve. */
  { id: 'n1', name: 'No Squad', email: 'n1@x.com', category: '', team: '', position: 'RB', roles: [] },
  /* The lead — carries no category at all, which is why the filter must not
     hide someone whose category is empty. */
  { id: 'L1', name: 'The Lead', email: 'lead@club.cat', category: '', team: '', roles: ['staff'], isTeamLead: true }
];

const PAGE = grab('  /* ── Gestió d\'usuaris ─', '  /**\n   * Show the shared body-level tooltip');

function render(over) {
  const o = over || {};
  const api = {
    getSession: () => ({ id: 'me', email: 'me@x.com', teamId: 'club1', isTeamLead: true, isAdmin: false }),
    getUsers: () => JSON.parse(JSON.stringify(o.users || USERS)),
    _clubConfig: o.club || CLUB,
    CATEGORY_ORDER: ['amateur', 'juvenil', 'cadet', 'infantil', 'alevi', 'benjami'],
    CATEGORY_LABELS: { amateur: 'Amateur', juvenil: 'Juvenil', cadet: 'Cadet',
      infantil: 'Infantil', alevi: 'Aleví', benjami: 'Benjamí' },
    POS_COLORS: U.POS_COLORS,
    /* ⚠ The REAL helpers, not constants. `catSpanOf` answers a question about
       its input — does the list span more than one category — and `() => true`
       would make the badge appear for a reason the app never computed. */
    catSpanOf: U.catSpanOf,
    catBadgeHtmlGlobal: U.catBadgeHtmlGlobal,
    normalizeEmail: (v) => String(v || '').trim().toLowerCase(),
    regStaffOf: (rosters, u) => {
      const e = String(u.email || '').trim().toLowerCase();
      const listed = Object.values(rosters || {}).some(
          (r) => (r.staffEmails || []).some((x) => String(x).toLowerCase() === e));
      return listed || (u.roles || []).indexOf('staff') !== -1;
    },
    sanitize: esc,
    t: (k) => (k in CA ? CA[k] : k)
  };
  const fn = new Function(...Object.keys(api), `
    ${PAGE}
    _guFilter = ${JSON.stringify(o.filter || 'all')};
    _guQuery = ${JSON.stringify(o.query || '')};
    _guSquad = ${JSON.stringify(o.squad || '')};
    return renderAdminUsers();
  `);
  return fn(...Object.values(api));
}

const rowsIn = (h) => (h.match(/class="gu-row/g) || []).length;

describe('Gestió d\'usuaris — the page renders', () => {
  it('CALLS the builder and produces a page root', () => {
    const h = render();
    assert.ok(h.includes('class="gu-page"'), 'no page root — the builder produced nothing');
    assert.ok(h.includes('gu-h1'), 'no title');
    assert.strictEqual(rowsIn(h), USERS.length, 'not every member rendered');
  });

  it('shows the figures the page is judged on', () => {
    const h = render();
    // 7 people, 3 of them staff-or-lead, 2 with no squad.
    assert.ok(/gu-fig-v">7</.test(h), 'member count wrong');
    assert.ok(/gu-fig-v">3</.test(h), 'staff count wrong');
    assert.ok(/gu-fig-v gu-bad">2</.test(h),
        'the no-squad figure is not flagged, or is wrong');
  });

  it('tints the rows of people with no squad', () => {
    const h = render();
    assert.strictEqual((h.match(/gu-row-nosquad/g) || []).length, 2,
        'the state this page exists to resolve is not marked');
  });

  it('renders the dorsal as text, never as a control', () => {
    // The squad sheet is Registracions; this page is about platform access.
    const h = render();
    assert.ok(/gu-dorsal">4</.test(h), 'the dorsal is missing');
    assert.ok(!/gu-dorsal[^>]*>\s*<(input|select)/.test(h),
        'the dorsal became editable — that belongs on Registracions');
  });
});

describe('Gestió d\'usuaris — filtering never hides who you must manage', () => {
  /* ⚠ THE RULE. Staff and the club lead carry NO category, so a filter that
     hid every row whose category does not match would hide exactly the people
     a lead needs this page for. The bar NARROWS; it never hides the
     uncategorised. */
  it('keeps the lead and uncategorised staff when narrowed to one squad', () => {
    const h = render({ squad: 'amateur-A' });
    assert.ok(/The Lead/.test(h), 'the club lead vanished under a squad filter');
    assert.ok(/No Squad/.test(h), 'someone with no squad vanished under a squad filter');
    assert.ok(!/Player Three/.test(h), 'a juvenil player survived an amateur-A filter');
    assert.ok(!/Player Two/.test(h), 'an amateur-B player survived an amateur-A filter');
  });

  /* ⚠ The shared category bar cannot serve this page — renderCategoryBar()
     returns '' outright for a one-category club and catBarLettersHtml()
     returns '' until a category is picked, so the team filter was missing
     entirely. These chips are the page's own and do not depend on either. */
  it('draws a squad chip for every squad in the club, plus Tots', () => {
    const h = render();
    ['amateur-A', 'amateur-B', 'juvenil-A'].forEach((k) => {
      assert.ok(h.includes('data-gu-squad-filter="' + k + '"'), 'no chip for ' + k);
    });
    assert.ok(h.includes('data-gu-squad-filter=""'), 'no way back to every squad');
    // Exactly one chip is lit, and with no squad chosen it is Tots.
    const on = h.match(/gu-chip gu-chip-on" data-gu-squad-filter="([^"]*)"/g) || [];
    assert.strictEqual(on.length, 1, 'expected one lit squad chip, got ' + on.length);
    assert.ok(on[0].endsWith('data-gu-squad-filter=""'), 'a squad is preselected');
  });

  it('works for a club with a single category', () => {
    // The case the shared bar could not serve at all.
    const club = JSON.parse(JSON.stringify(CLUB));
    club.categories = { amateur: { enabled: true, letters: ['A', 'B'] } };
    const h = render({ club });
    assert.ok(h.includes('data-gu-squad-filter="amateur-A"'), 'no squad filter on a one-category club');
    assert.ok(h.includes('data-gu-squad-filter="amateur-B"'));
  });

  it('opens on everyone', () => {
    assert.strictEqual(rowsIn(render()), USERS.length,
        'the default view hides somebody — it must open on Totes');
  });

  it('reaches everyone without a squad', () => {
    const h = render({ filter: 'nosquad' });
    assert.strictEqual(rowsIn(h), 2);
    assert.ok(/No Squad/.test(h) && /The Lead/.test(h));
  });

  /* "Jugadors" is everyone who is NOT staff, which includes someone with no
     roles at all — a person who has registered and not been placed yet. That
     is deliberate: defining it as "has the player role" would drop them out
     of three of the four filters, and this is the page that must not lose
     anybody. Staff counts the lead, who is staff for every purpose here. */
  it('separates players from staff, and keeps the unplaced visible', () => {
    assert.strictEqual(rowsIn(render({ filter: 'player' })), 4);
    assert.ok(/No Squad/.test(render({ filter: 'player' })),
        'someone with no roles yet fell out of every filter but Tots');
    assert.strictEqual(rowsIn(render({ filter: 'staff' })), 3);
  });

  it('searches name and email', () => {
    assert.strictEqual(rowsIn(render({ query: 'coach@' })), 1);
    assert.strictEqual(rowsIn(render({ query: 'player' })), 3);
    assert.ok(/gu-empty/.test(render({ query: 'nobodyatall' })), 'no empty state');
  });
});

describe('Gestió d\'usuaris — what may be changed here, and what may not', () => {
  /* firestore.rules lets ONLY the superadmin write clubs/{id}.leadEmail, so a
     lead cannot hand over their own club. A dropdown offering it would be a
     control that silently fails for the person most likely to try it. */
  it('renders the lead as a badge with no editable role control', () => {
    const h = render();
    assert.ok(/gu-lead-badge/.test(h), 'the lead is not marked at all');
    assert.ok(!/data-gu-role="L1"/.test(h),
        'the lead is offered a role dropdown that the rules would refuse');
  });

  it('offers Jugador and Staff, and nothing else', () => {
    const h = render();
    const opts = h.match(/<select class="gu-role"[\s\S]*?<\/select>/)[0];
    assert.strictEqual((opts.match(/<option/g) || []).length, 2,
        'the role dropdown offers a sub-role it has no writer for');
    assert.ok(opts.includes('value="player"') && opts.includes('value="staff"'));
  });

  /* The sub-role IS shown — it is server-derived and readable — but it is set
     on the roster doc, in Configuració › Staff. Showing it as text rather than
     as a dead control is the honest rendering. */
  it('shows the staff sub-role as text', () => {
    const h = render();
    assert.ok(/gu-subrole/.test(h), 'the sub-role is not shown at all');
    assert.ok(!/data-gu-subrole/.test(h), 'the sub-role became an editable control');
  });

  it('offers every squad the club has, plus "no squad"', () => {
    const h = render();
    const sel = h.match(/<select class="gu-squad"[\s\S]*?<\/select>/)[0];
    ['amateur-A', 'amateur-B', 'juvenil-A'].forEach((k) => {
      assert.ok(sel.includes('value="' + k + '"'), 'missing squad ' + k);
    });
    assert.ok(sel.includes('value=""'), 'no way to clear the squad');
  });

  it('never offers to erase yourself or the lead', () => {
    const h = render();
    assert.ok(!/btn-delete-user" data-uid="L1"/.test(h), 'the lead can be erased');
  });
});

describe('Gestió d\'usuaris — the writers it reuses', () => {
  const region = bare.slice(bare.indexOf('function renderAdminUsers'),
      bare.indexOf('function bindTooltips'));

  /* ⚠ The defect this page shipped once: writing `roles` into the local blob
     changed the badge and not the permissions, and did not self-heal. */
  it('never writes roles into the fa_users blob from this page', () => {
    assert.ok(!/\.roles\s*=/.test(region),
        'the page assigns roles locally again — the badge would lie');
    assert.ok(/regStaffOf\(/.test(region),
        'the row no longer READS the roster lists to decide the role');
  });

  it('routes the role change through regSetRole', () => {
    const binder = bare.slice(bare.indexOf("$$('[data-gu-role]')"),
        bare.indexOf("$$('[data-gu-squad]')"));
    assert.ok(/regSetRole\(/.test(binder), 'the role control no longer calls regSetRole');
  });

  it('routes the squad change through assignMemberToTeam and the detach path', () => {
    const binder = bare.slice(bare.indexOf("$$('[data-gu-squad]')"),
        bare.indexOf("$$('.btn-remove-squad')"));
    assert.ok(/assignMemberToTeam\(/.test(binder));
    assert.ok(/guRemoveFromSquad\(/.test(binder),
        'clearing the squad does not go through the detach path');
  });

  it('erases through the typed-name modal, never directly', () => {
    assert.ok(/showDeleteMemberModal\(/.test(bare));
    // The modal is what carries the typed confirmation.
    const modal = bare.slice(bare.indexOf('function showDeleteMemberModal'));
    assert.ok(/toLowerCase\(\)/.test(modal.slice(0, 2500)),
        'the erase confirmation no longer compares a typed name');
  });

  /* All three were deleted by 90812ff. Two left dangling call sites and threw
     for nine days; this one took its caller with it, so nothing flagged it. */
  it('keeps the three restored functions, and a caller for each', () => {
    ['detachMemberByEmail', 'loadArchivedSeasons', 'assignMemberToTeam'].forEach((fn) => {
      assert.ok(new RegExp('function ' + fn + '\\b').test(bare), fn + ' is gone again');
      const calls = (bare.match(new RegExp('[^\\w.]' + fn + '\\s*\\(', 'g')) || []).length;
      assert.ok(calls >= 2, fn + ' has no caller — it will rot unnoticed');
    });
  });
});

describe('Gestió d\'usuaris — assignMemberToTeam', () => {
  /* Run the real function over stubs that record what it wrote. */
  function run(user, category, letter) {
    const club = JSON.parse(JSON.stringify(CLUB));
    const writes = [];
    const userDocs = [];
    const api = {
      getSession: () => ({ id: 'me', teamId: 'club1' }),
      getUsers: () => [user],
      _clubConfig: club,
      normalizeEmail: (v) => String(v || '').trim().toLowerCase(),
      regStaffOf: (rosters, u) => (u.roles || []).indexOf('staff') !== -1,
      saveRoster: async (clubId, key, field, list) => { writes.push({ key, field, list }); },
      saveUsers: () => {},
      renderPage: () => {},
      getSession_: null,
      db: { collection: () => ({ doc: () => ({ set: async (p) => { userDocs.push(p); } }) }) },
      _showPushToast: () => {},
      t: (k) => k,
      console: console
    };
    const code = grab('  async function assignMemberToTeam(', '\n  /**\n   * Take a member out of their squad, with the confirmation.');
    const fn = new Function(...Object.keys(api),
        code + '\n return assignMemberToTeam;')(...Object.values(api));
    return fn(user.id, category, letter).then(() => ({ writes, userDocs, club }));
  }

  it('puts a PLAYER on playerEmails', async () => {
    const u = { id: 'x1', name: 'X', email: 'x@x.com', category: '', team: '', roles: ['player'] };
    const { writes } = await run(u, 'amateur', 'A');
    const add = writes.filter((w) => w.key === 'amateur-A')[0];
    assert.ok(add, 'nothing was written to the target roster');
    assert.strictEqual(add.field, 'playerEmails');
    assert.ok(add.list.includes('x@x.com'));
  });

  /* ⚠ The original always wrote playerEmails, which would have demoted a
     coach to a player simply by giving them a squad. */
  it('puts a STAFF member on staffEmails, not playerEmails', async () => {
    const u = { id: 'x2', name: 'X', email: 'x2@x.com', category: '', team: '', roles: ['staff'] };
    const { writes } = await run(u, 'amateur', 'A');
    const add = writes.filter((w) => w.key === 'amateur-A')[0];
    assert.strictEqual(add.field, 'staffEmails',
        'a coach was added to the player list and would be re-derived as a player');
  });

  /* ⚠ A move is TWO writes. The original only did the second, so moving a
     player from Amateur A to B left them on A's list — and the roster IS the
     membership gate, so they kept A's permissions. */
  it('takes a moved member OFF their previous squad list', async () => {
    const u = { id: 'p1', name: 'P', email: 'p1@x.com', category: 'amateur', team: 'A', roles: ['player'] };
    const { writes } = await run(u, 'amateur', 'B');
    const off = writes.filter((w) => w.key === 'amateur-A' && w.field === 'playerEmails')[0];
    assert.ok(off, 'the old roster entry was left behind');
    assert.ok(!off.list.includes('p1@x.com'), 'still on the old list');
    const on = writes.filter((w) => w.key === 'amateur-B')[0];
    assert.ok(on && on.list.includes('p1@x.com'), 'not added to the new list');
  });

  it('writes category and team to the member record, which is what reshards them', async () => {
    const u = { id: 'x3', name: 'X', email: 'x3@x.com', category: '', team: '', roles: ['player'] };
    const { userDocs } = await run(u, 'juvenil', 'A');
    assert.deepStrictEqual(userDocs[0], { category: 'juvenil', team: 'A' });
  });

  it('does nothing when the squad has not changed', async () => {
    const u = { id: 'p1', name: 'P', email: 'p1@x.com', category: 'amateur', team: 'A', roles: ['player'] };
    const { writes, userDocs } = await run(u, 'amateur', 'A');
    assert.deepStrictEqual(writes, []);
    assert.deepStrictEqual(userDocs, []);
  });
});

describe('Gestió d\'usuaris — the stylesheet', () => {
  const BANNER = 'GESTIÓ D\'USUARIS, redesigned (v255)';
  const start = css.indexOf(BANNER);
  /* Last in the file, so this slice runs to the end. Bound it by ITS banner
     before appending another page — an unbounded slice has broken five
     suites in turn. */
  const block = css.slice(start).replace(/\/\*[\s\S]*?\*\//g, '');

  it('has its own block, at the end of the file', () => {
    assert.ok(start !== -1, 'the gu- banner is gone from css/style.css');
  });

  /* ⚠ `.gu-chip:hover` is 0,2,0 and `.gu-chip-on` was 0,1,0, so hovering the
     SELECTED chip repainted its label near-black on its near-black fill and
     the text disappeared. Reported from the running app, not caught by any
     assertion on the markup — both classes were on the element as intended. */
  it('keeps the selected chip readable under the cursor', () => {
    assert.ok(/\.gu-chip:hover:not\(\.gu-chip-on\)/.test(block),
        'the hover rule still repaints the selected chip');
    assert.ok(/\.gu-chip\.gu-chip-on:hover/.test(block),
        'the selected chip has no hover of its own to win with');
  });

  it('bounds the Configuració block that now precedes it', () => {
    const cfg = css.indexOf('CONFIGURACIÓ, redesigned (v254)');
    assert.ok(cfg !== -1 && cfg < start, 'the cfg- block moved');
    const cfgTest = fs.readFileSync(path.join(__dirname, 'configuracio.test.js'), 'utf8');
    /* Matched WITHOUT the apostrophe: the banner is written as a JS string
       there, so the source contains `USUARIS` escaped and a literal compare
       against the rendered banner never matches. */
    assert.ok(/USUARIS, redesigned \(v255\)/.test(cfgTest),
        'test/configuracio.test.js still slices to EOF — it would read these rules as its own');
  });

  it('shares one column template between the head and the rows', () => {
    // Two templates is how a header drifts off the column it names.
    const m = block.match(/\.gu-head,\s*\.gu-row\s*\{[^}]*grid-template-columns/);
    assert.ok(m, 'the head and the rows no longer share a grid template');
  });

  /* ⚠ The invert must sit on the GLYPH. On `.gu-circle` it bleaches the
     background too and the delegate's row shows an empty white disc — found
     in a screenshot, not by any assertion on the markup. */
  it('inverts the delegate glyph without bleaching its circle', () => {
    assert.ok(/\.gu-inv\s*\{[^}]*filter:\s*brightness\(0\)\s*invert\(1\)/.test(block),
        '.gu-inv does not carry the inversion');
    assert.ok(!/\.gu-circle\s*\{[^}]*filter:/.test(block),
        'the invert is back on the circle, which bleaches its own background');
  });

  it('collapses to two columns rather than scrolling sideways', () => {
    const phone = block.slice(block.indexOf('@media (max-width: 900px)'));
    assert.ok(/\.gu-head\s*\{\s*display:\s*none/.test(phone), 'the head survives on a phone');
    assert.ok(/grid-template-columns:\s*22px minmax\(0, 1fr\)/.test(phone),
        'the row does not collapse');
    assert.ok(!/overflow-x/.test(block),
        'a page body that scrolls sideways drags the hero with it');
  });

  it('gives the phone real hit targets', () => {
    const phone = block.slice(block.indexOf('@media (max-width: 700px)'));
    ['.gu-chip', '.gu-role, .gu-squad', '.gu-link'].forEach((sel) => {
      const i = phone.indexOf(sel);
      assert.ok(i !== -1, 'no phone rule for ' + sel);
      assert.ok(/44px/.test(phone.slice(i, phone.indexOf('}', i))), sel + ' is under 44px');
    });
  });

  it('joins the shared band, bleed and figure lists', () => {
    const shared = css.slice(0, start);
    ['.gu-page', '.gu-hero', '.gu-h1', '.gu-sub', '.gu-figs', '.gu-fig-v', '.gu-fig-l']
        .forEach((sel) => {
          assert.ok(shared.includes(sel), sel + ' is not in a shared selector list');
        });
    assert.ok(!/\.gu-hero\s*\{/.test(block), '.gu-hero is redeclared locally as well');
  });
});

describe('Gestió d\'usuaris — the copy', () => {
  it('has ca, es and en for every gu.* key', () => {
    const keys = [...appSrc.matchAll(/'(gu\.[a-z_0-9]+)':\s*\{([^\n]*)\}/g)];
    assert.ok(keys.length > 10, 'the gu.* table did not parse: ' + keys.length);
    keys.forEach(([, key, body]) => {
      ['ca:', 'es:', 'en:'].forEach((lang) => {
        assert.ok(body.includes(lang), key + ' is missing ' + lang.slice(0, 2));
      });
    });
  });

  it('uses every gu.* key it defines, and defines every one it uses', () => {
    const used = new Set([...appSrc.matchAll(/t\('(gu\.[a-z_0-9]+)'\)/g)].map((m) => m[1]));
    const defined = new Set([...appSrc.matchAll(/'(gu\.[a-z_0-9]+)':/g)].map((m) => m[1]));
    assert.deepStrictEqual([...used].filter((k) => !defined.has(k)), [],
        'used but not defined — t() ships the raw key');
    assert.deepStrictEqual([...defined].filter((k) => !used.has(k)), [], 'defined but unused');
  });

  it('says where the controls it does NOT offer actually live', () => {
    // The dorsal and the sub-role are read-only here on purpose; the footnote
    // is what stops the next reader filing them as missing.
    const foot = CA['gu.foot'] || '';
    assert.ok(/Registracions/.test(foot) && /Staff/.test(foot),
        'the footnote no longer points at where these are edited: ' + foot);
  });
});
