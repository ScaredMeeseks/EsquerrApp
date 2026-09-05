/* Registracions — the staff registrations page, redesigned.
 *
 * The page's job is a gate: only an address on one of the club's roster
 * lists may register, and only a placed member is on a squad. Three of
 * its rules are pure functions and run for real here; the rest is pinned
 * as source properties, because the alternative is a browser.
 *
 * ⚠ THE HANDOFF DESCRIBES AN APPROVAL QUEUE THIS APP DOES NOT HAVE.
 * joinClub grants membership the moment somebody signs up — role,
 * category and team all derived server-side from the list their address
 * was invited onto. So "Sol·licituds pendents" is the member nobody has
 * PLACED yet, and its action is Col·loca, not Aprova. Nothing on this
 * page gates access, because nothing on it ever did. Several assertions
 * below exist to keep that honest.
 *
 * `npm run test:registrations`, or as part of test:unit.
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const {readCss} = require('./read-css');

const src = fs.readFileSync(path.join(__dirname, '..', 'js', 'app.js'), 'utf8');
const css = readCss();
const rules = fs.readFileSync(path.join(__dirname, '..', 'firestore.rules'), 'utf8');
const bare = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

function grab(from, to) {
  const i = src.indexOf(from);
  const j = src.indexOf(to, i);
  assert.ok(i !== -1 && j !== -1, 'marker not found in js/app.js: ' + from);
  return src.slice(i, j);
}

/* The same slice with the comments taken out. Prose explaining a class
   is not a use of it — a comment naming `.reg2-chip-on` to say why it
   must NOT be there otherwise reads as the very thing being forbidden.
   `bare` keeps line positions, so the markers still land. */
function grabBare(from, to) {
  const i = bare.indexOf(from);
  const j = bare.indexOf(to, i);
  assert.ok(i !== -1 && j !== -1, 'marker not found in js/app.js: ' + from);
  return bare.slice(i, j);
}
const bareCss = css.replace(/\/\*[\s\S]*?\*\//g, '');

const API = (function () {
  const code = grab('  function regOnAllowlist', '  /** One squad chip') +
    grab('  function regTakenNumbers', '  /* ── Sol·licituds pendents');
  // eslint-disable-next-line no-new-func
  return new Function('normalizeEmail',
    code + '\n return {regOnAllowlist, regInvited, regTakenNumbers, regIsTaken};')(
      (v) => String(v || '').trim().toLowerCase());
})();

const ROSTERS = {
  'amateur-A': {playerEmails: ['A@x.com', 'b@x.com'], staffEmails: ['s@x.com']},
  'amateur-B': {playerEmails: ['c@x.com'], staffEmails: []},
  'juvenil-A': {playerEmails: ['j@x.com'], staffEmails: []}
};

describe('regOnAllowlist — who may register at all', () => {
  it('matches regardless of case or padding', () => {
    /* Addresses are typed by hand into the invite row and again by the
       person signing up; the lists are the gate, so a capital letter
       must not lock somebody out of their own club. */
    assert.strictEqual(API.regOnAllowlist(ROSTERS, 'a@x.com'), true);
    assert.strictEqual(API.regOnAllowlist(ROSTERS, '  A@X.COM '), true);
  });

  it('looks at BOTH lists, not just the players', () => {
    assert.strictEqual(API.regOnAllowlist(ROSTERS, 's@x.com'), true,
        'a staff address is on the allowlist too');
  });

  it('an unlisted address is not on it', () => {
    assert.strictEqual(API.regOnAllowlist(ROSTERS, 'nobody@x.com'), false);
    assert.strictEqual(API.regOnAllowlist(ROSTERS, ''), false);
  });
});

describe('regInvited — invited, and still without an account', () => {
  const users = [{id: 1, email: 'b@x.com'}, {id: 2, email: 'zz@x.com'}];

  it('drops an address the moment that person exists', () => {
    /* The handoff's rule, and the one worth testing: filter against the
       USERS, not against a `claimed` flag. Otherwise somebody sits under
       "waiting to register" after they have already registered — which
       is exactly the state this page exists to resolve. */
    const inv = API.regInvited(ROSTERS, users, 'amateur');
    assert.ok(!inv.some((i) => i.email === 'b@x.com'),
        'b@x.com has an account and must not be listed as waiting');
    assert.ok(inv.some((i) => i.email === 'a@x.com'), 'a@x.com is still waiting');
  });

  it('drops them even when they are in the club but on no squad', () => {
    /* The unplaced member — no category, no team. They have registered,
       so their invitation is spent; leaving it on the list would show
       one person in two sections at once. */
    const unplaced = [{id: 3, email: 'a@x.com', category: '', team: ''}];
    const inv = API.regInvited(ROSTERS, unplaced, 'amateur');
    assert.ok(!inv.some((i) => i.email === 'a@x.com'));
  });

  it('narrows to the chosen category, and shows all of them under Totes', () => {
    assert.ok(!API.regInvited(ROSTERS, users, 'amateur')
        .some((i) => i.email === 'j@x.com'), 'juvenil must not leak into amateur');
    assert.strictEqual(API.regInvited(ROSTERS, users, '').length, 4,
        '"Totes" lists every category');
  });

  it('keeps which list an address came from', () => {
    /* The ✕ has to write back to the same field it was read from —
       removing a staff address out of playerEmails would silently do
       nothing and leave the row on screen. */
    const inv = API.regInvited(ROSTERS, users, 'amateur');
    const staff = inv.find((i) => i.email === 's@x.com');
    assert.ok(staff, 's@x.com should be listed');
    assert.strictEqual(staff.field, 'staffEmails');
    assert.strictEqual(staff.key, 'amateur-A', 'and which roster doc holds it');
    assert.strictEqual(inv.find((i) => i.email === 'c@x.com').field, 'playerEmails');
  });
});

describe('regIsTaken — a dorsal already worn', () => {
  const squad = [
    {id: 1, category: 'amateur', team: 'A', playerNumber: '9'},
    {id: 2, category: 'amateur', team: 'B', playerNumber: '9'},
    {id: 3, category: 'amateur', team: 'A', playerNumber: '9'},
    {id: 4, category: 'amateur', team: 'A', playerNumber: ''},
    /* TWO numberless members in the same squad. With one, nothing can
       collide and the "empty is never a clash" assertion passes however
       the guards are written — the fixture, not the code, was doing the
       work. A whole squad has no dorsals the day it is created. */
    {id: 6, category: 'amateur', team: 'A', playerNumber: ''},
    {id: 5, category: 'juvenil', team: 'A', playerNumber: '9'}
  ];
  const taken = API.regTakenNumbers(squad);

  it('flags two players wearing it in the same squad', () => {
    assert.strictEqual(API.regIsTaken(taken, squad[0]), true);
    assert.strictEqual(API.regIsTaken(taken, squad[2]), true);
  });

  it('does NOT flag the same number in another squad', () => {
    /* Nine in the A team and nine in the B team are two different
       shirts. Flagging that would be wrong in every club that runs two
       squads, which is most of them. */
    assert.strictEqual(API.regIsTaken(taken, squad[1]), false, 'same category, other letter');
    // squad[5], not [4]: adding a second numberless member shifted it, and
    // [4] would have passed for the wrong reason entirely.
    assert.strictEqual(API.regIsTaken(taken, squad[5]), false, 'other category');
    assert.strictEqual(squad[5].category, 'juvenil', 'and it really is the other one');
  });

  it('an empty dorsal is never a clash, even between two of them', () => {
    /* Squad members 4 and 6 both have no number. Nobody is wearing
       "nothing", so neither may light up red — and a new squad, where
       that is everybody, must not come up entirely in red. */
    assert.strictEqual(API.regIsTaken(taken, squad[3]), false);
    assert.strictEqual(API.regIsTaken(taken, squad[4]), false);
  });
});

/* A row that answers querySelector the way the real table would, so the
   save can be RUN rather than read. `has` lists the controls this row
   actually draws — the whole point being what happens to the ones it
   does not. */
function fakeRow(uid, has) {
  const el = (v, ds) => ({value: v, dataset: ds || {}});
  const map = {
    '.reg-number': has.number === undefined ? null : el(has.number),
    '[data-std-sel="regcat"]': has.category === undefined ? null
        : {dataset: {value: has.category}},
    '.reg-status-select': has.status === undefined ? null : el(has.status),
    '.reg-team-circle.active': has.team ? el('', {team: has.team}) : null,
    // v231. A read-only row renders the agent as TEXT, not a disabled input,
    // so its absence here is the real read-only case and not a contrivance.
    '.reg-agent': has.agent === undefined ? null : el(has.agent)
  };
  return {
    dataset: {uid: String(uid)},
    querySelector: (s) => (s in map ? map[s] : null),
    querySelectorAll: (s) => {
      if (s === '.reg-pos-chip.active') {
        return (has.positions || []).map((p) => el('', {pos: p}));
      }
      if (s === '.reg-team-circle') return has.teams === undefined ? [] : has.teams;
      return [];
    }
  };
}

function runSave(row, roster) {
  const users = JSON.parse(JSON.stringify(roster));
  let saved = null;
  // eslint-disable-next-line no-new-func
  const fn = new Function(
    'canEditPage', 'getUsers', 'saveUsers', '_currentSession',
    grab('  function autoSaveFromRow(row) {',
        '  /* ── Bindings') +
      '\n return autoSaveFromRow;')(
      () => true, () => users, (u) => { saved = u; }, null);
  fn(row);
  return (saved || users).find((u) => String(u.id) === String(row.dataset.uid));
}

describe('a save may not clear what the row never showed', () => {
  /* The Membres table has no category select — a placed member does not
     need one. Reading it as `el ? el.value : ''` meant every save from
     that table wrote category:'' , and an empty category IS the
     definition of unplaced: change a member's position and he fell
     straight back into "Pendents de col·locar". */
  const ROSTER = [{
    id: 7, name: 'Pau', roles: ['player'],
    category: 'amateur', team: 'A', position: 'POR', playerNumber: '1'
  }];

  it('keeps the category when the row draws no category select', () => {
    const u = runSave(fakeRow(7, {positions: ['DFC'], number: '1'}), ROSTER);
    assert.strictEqual(u.category, 'amateur', 'the member must stay placed');
    assert.strictEqual(u.position, 'DFC', 'while the change he made goes through');
  });

  it('keeps the squad when the row draws no squad chips', () => {
    const u = runSave(fakeRow(7, {positions: ['DFC'], number: '1'}), ROSTER);
    assert.strictEqual(u.team, 'A');
  });

  it('still writes an empty squad when the chips are there and none is on', () => {
    /* Not the same case: chips present with none active is a coach
       deliberately clearing the squad, and that must reach the record. */
    const u = runSave(
        fakeRow(7, {positions: ['DFC'], number: '1', teams: [{}, {}]}), ROSTER);
    assert.strictEqual(u.team, '', 'an explicit clear must not be undone');
  });

  it('still writes what the row does show', () => {
    const u = runSave(fakeRow(7, {
      positions: ['DFC', 'MC'], number: '5', category: 'juvenil', team: 'B',
      teams: [{}, {}]
    }), ROSTER);
    assert.strictEqual(u.category, 'juvenil');
    assert.strictEqual(u.team, 'B');
    assert.strictEqual(u.playerNumber, '5');
    assert.strictEqual(u.position, 'DFC,MC');
  });

  /* ── the agent field joins the same rule (v231) ──
     It is the page's first per-member free-text control, and it is drawn
     only when the coach may edit. A read-only row, or any future row that
     omits it, must not silently wipe an agency somebody typed in. */
  const AGENTED = [{
    id: 7, name: 'Pau', roles: ['player'], category: 'amateur', team: 'A',
    position: 'POR', playerNumber: '1', agent: 'Gestió Esportiva SL'
  }];

  it('keeps the agent when the row draws no agent input', () => {
    const u = runSave(fakeRow(7, {positions: ['DFC'], number: '1'}), AGENTED);
    assert.strictEqual(u.agent, 'Gestió Esportiva SL',
        'a read-only row wiped an agency it never showed');
  });

  it('writes the agent the row does show', () => {
    const u = runSave(
        fakeRow(7, {positions: ['POR'], number: '1', agent: 'Nova Agència'}), AGENTED);
    assert.strictEqual(u.agent, 'Nova Agència');
  });

  it('trims it, so a stray space is not a different agency', () => {
    const u = runSave(
        fakeRow(7, {positions: ['POR'], number: '1', agent: '  Nova  '}), AGENTED);
    assert.strictEqual(u.agent, 'Nova');
  });

  it('lets a coach clear the agent deliberately', () => {
    // Empty input present = "this player has no agent any more", which must
    // reach the record. Contrast with the absent-input case above.
    const u = runSave(
        fakeRow(7, {positions: ['POR'], number: '1', agent: ''}), AGENTED);
    assert.strictEqual(u.agent, '');
  });
});

describe('the page writes through what already exists', () => {
  it('rows keep the class names the delegated auto-save reads', () => {
    /* autoSaveFromRow is the ONE writer for a member's position, squad,
       number and category, and it collects them from the row by class.
       The redesign keeps those names on purpose: this is a new page, not
       a second way to save. */
    const page = grab('  function regPosCellHtml', '  /** The squad chips');
    assert.ok(/class="reg-pos-chip reg2-pos-c/.test(page),
        'the position chips must be .reg-pos-chip');
    assert.ok(/data-pos="' \+ p/.test(page), 'and carry data-pos');
    const team = grab('  function regTeamCellHtml', '  /** The dorsal field');
    assert.ok(/class="reg-team-circle/.test(team) && /data-team="/.test(team),
        'squad chips must stay .reg-team-circle[data-team]');
    const num = grab('  function regNumberHtml', '  /**\n   * Which dorsals');
    assert.ok(/class="reg-input reg-number/.test(num), 'the dorsal must stay .reg-number');
  });

  it('every position is in the row, so a save can always see them all', () => {
    /* autoSaveFromRow re-reads every chip on EVERY save — type a dorsal
       and it collects the positions too. The popover this replaced had
       to keep hidden copies of the chosen ones for exactly that reason;
       with all nine always present, there is nothing to keep in sync. */
    const body = grabBare('  function regPosCellHtml', '  function regTeamCellHtml');
    assert.ok(/REG_POS\.map/.test(body), 'all nine positions render, not just the chosen');
    assert.ok(!/hidden/.test(body), 'and none of them is a hidden shadow copy');
    assert.ok(/positions\.indexOf\(p\) !== -1/.test(body),
        'the chosen ones are marked .active, which is what the writer reads');
  });

  it('read-only shows only the positions a player actually has', () => {
    /* Nine dimmed circles a coach cannot click is nine pieces of
       furniture. With no edit rights the cell states the fact. */
    const body = grabBare('  function regPosCellHtml', '  function regTeamCellHtml');
    assert.ok(/if \(ro\)/.test(body), 'the read-only branch must come first');
    const roBranch = body.slice(body.indexOf('if (ro)'), body.indexOf('var chips'));
    assert.ok(/reg2-circle/.test(roBranch) && !/reg-pos-chip/.test(roBranch),
        'it renders plain circles, not clickable chips');
  });

  it('reject reuses the leave-squad flow rather than a new writer', () => {
    const body = grab('  function regPendingTableHtml', '  /* ── Membres');
    assert.ok(/btn-remove-reg/.test(body),
        'Rebutja must run the same confirm-and-detach the members table uses');
  });

  it('the dead delegated handlers went with their markup', () => {
    /* #reg-add-btn, .btn-remove-pending and .btn-assign are emitted
       nowhere now. A binder for markup that does not exist is a promise
       the app cannot keep. */
    ['reg-add-btn', 'btn-remove-pending', 'btn-assign', 'reg-assign-cat',
     'addPreRegisteredPlayer', 'removePreRegisteredPlayer'].forEach((dead) => {
      assert.ok(!bare.includes(dead), dead + ' should be gone entirely');
    });
  });
});

describe('what the server will actually allow', () => {
  it('staff may only ever write playerEmails', () => {
    /* The constraint the whole page is shaped around, read from the
       rules rather than assumed. If this ever widens, the lead-only
       gates below can widen with it — and not before. */
    assert.ok(/allow create, update, delete: if isSuperUser\(\) \|\| isLeadOf\(clubId\)/
        .test(rules), 'roster writes are the lead\'s');
    assert.ok(/playerEmails/.test(rules), 'with a narrow exception for playerEmails');
  });

  it('the Staff invite chip is lead-only', () => {
    /* A coach offered the chip would type an address, press Afegeix and
       get a permission error. Left OUT of the markup, not disabled. */
    const body = grab('  function regInviteHtml', '  /* ── Invited, still without');
    assert.ok(/isLead \? regChip\(t\('reg2\.staff'\)/.test(body),
        'the staff kind chip must be gated on isLead');
  });

  it('the rol chips move the address between lists, not setRole', () => {
    /* A role is DERIVED from the lists by onRosterWritten. Writing
       setRole here instead would be overwritten the next time anybody
       touched a roster — the change would appear to work and then
       silently revert. */
    const body = grab('  async function regSetRole',
        '   * Write one Registracions row back');
    assert.ok(/playerEmails/.test(body) && /staffEmails/.test(body),
        'it must rewrite the two lists');
    assert.ok(/saveRosterFields/.test(body), 'in one merge, so the pair cannot half-apply');
    assert.ok(!/setRole/.test(body), 'and must not call setRole');
  });

  it('a member on no list cannot be moved between lists', () => {
    const body = grab('  async function regSetRole',
        '   * Write one Registracions row back');
    assert.ok(/if \(!key\)/.test(body),
        'inventing a roster entry would place them on a squad nobody chose');
  });
});

describe('the positions are in the row, not behind a popover', () => {
  it("there is no picker left to open, close or guard", () => {
    /* The handoff drew a popover per player. It went back to the row
       on the owner's call: this is a page you work straight down, and
       a control you must open, aim at and dismiss for each player
       turns nine clicks into twenty-seven. Everything the popover
       needed — an open-row state, an outside-click guard, and a rule
       about not swallowing the delegated save — is gone with it. */
    ['_regPosOpen', 'data-reg-pop', 'data-pos-uid', 'regPosPickerHtml',
     'reg2-pop'].forEach(function (dead) {
      assert.ok(!bare.includes(dead), dead + ' should be gone entirely');
    });
    assert.ok(!/\.reg2-pop/.test(css), 'and its styles with it');
  });

  it("the chips save through the delegated writer, untouched", () => {
    /* Nothing in bindRegistrations listens on them at all now — the
       handler on #dashboard-content toggles and saves, exactly as it
       did for the page this replaced. */
    const body = grab('  function bindRegistrations', '\n  function parseArchiveDoc');
    assert.ok(!/reg-pos-chip/.test(body),
        'the page must not bind the position chips itself');
  });
});

describe('the controls do not inherit the old page\'s look', () => {
  /* Reusing `.reg-team-circle` and `.reg-pos-chip` is what keeps the
     delegated auto-save working — and it also drags in those rules'
     own properties. Anything this page does not name again goes on
     applying, which is how a selected squad chip came to GROW instead
     of filling in, and how "GK" ended up wrapping inside a 30px circle.
     Each assertion below names one property that actually bit. */
  /** The declarations of one rule. `sel` is a REGEX SOURCE, already
      escaped by the caller — a selector list needs `,\s*` between its
      parts, which an escaper would turn into a literal comma. */
  function rule(sel) {
    const m = new RegExp(sel + '\\s*\\{([^}]*)\\}').exec(css);
    assert.ok(m, sel + ' has no rule');
    return m[1];
  }

  it('a selected squad chip fills in rather than growing', () => {
    /* `.reg-team-circle.active { width:32px; height:32px }` is the old
       rule, and `.active` is the class the DELEGATED writer toggles —
       it has never heard of this page. Style it, or the look and the
       state part company the moment somebody clicks. */
    assert.ok(/\.reg2-page \.reg-team-circle\.active/.test(css),
        'the page must style .active');
    const sel = rule('\\.reg2-page \\.reg-team-circle,\\s*\\.reg2-page \\.reg-team-circle\\.active');
    assert.ok(/width:\s*auto/.test(sel),
        'the old fixed width must be overridden, not merely min-width-ed past');
  });

  it('exactly one class says a squad chip is selected', () => {
    /* The delegated writer clears `.active` from the row and sets it on
       the chip clicked. It cannot clear `.reg2-chip-on`, so a chip
       rendered with BOTH stayed filled after the user picked a
       different squad — two selected letters at once, over a record
       that held only the new one. `.active` is the writer's class, so
       `.active` is the only one allowed to carry the look. */
    const body = grabBare('  function regTeamCellHtml', '  function regNumberHtml');
    assert.ok(/team === l \? ' active' :/.test(body),
        'the selected chip must be marked with .active and nothing else');
    assert.ok(!/reg2-chip-on/.test(body),
        'a class the writer cannot remove must not mark selection');
    assert.ok(!/\.reg-team-circle\.reg2-chip-on/.test(bareCss),
        'and the CSS must not paint one either');

    // The delegated writer is the other half of the contract.
    const w = grab("        const circle = e.target.closest('.reg-team-circle')",
        "        const chip = e.target.closest('.reg-pos-chip')");
    assert.ok(/forEach\(c => c\.classList\.remove\('active'\)\)/.test(w) &&
              /circle\.classList\.add\('active'\)/.test(w),
        'the writer clears .active across the row, then sets the one clicked');
  });

  it('a role chip reads the lists, so it is right at once', () => {
    /* regSetRole moves the address between playerEmails and
       staffEmails; onRosterWritten re-derives `roles` from those
       server-side, a round trip later. A row drawn from `roles`
       therefore redrew identically after the write — old role still
       filled, new one still empty, button apparently dead. Reading the
       lists is not a prediction: they are the thing that changed. */
    const pend = grabBare('  function regPendingTableHtml', '  function regMembersTableHtml');
    const mem = grabBare('  function regMembersTableHtml', '  function renderRegistrations');
    [['pending', pend], ['members', mem]].forEach(([which, body]) => {
      assert.ok(/var isStaff = regStaffOf\(rosters, u\);/.test(body),
          'the ' + which + ' table must take the role from the lists');
      assert.ok(!/isStaff = roles\.indexOf\('staff'\)/.test(body),
          'and not from the record that lags behind, in ' + which);
    });
    assert.ok(/function regMembersTableHtml\(members, rosters,/.test(mem),
        'which is why the members table now gets the rosters');
  });

  it('regStaffOf falls back to the record only when no list knows', () => {
    /* Taken off every list is "detached", not "player": the only thing
       that still remembers what they were is their own `roles`. */
    // eslint-disable-next-line no-new-func
    const api = new Function('normalizeEmail',
      grabBare('  function regIsStaffListed', '  function regStaffOf') +
      grabBare('  function regStaffOf', '  function regInvited') +
      '\n return {regIsStaffListed, regStaffOf};')(
        (v) => String(v || '').trim().toLowerCase());
    /* ⚠ The staff address is stored MIXED CASE and the player address
       lower. Both halves of the comparison have to be folded: with a
       lowercase-only fixture, dropping normalizeEmail from the list
       side still passes and the test proves nothing. `both@` is on both
       lists — see below. */
    const R = {'amateur-A': {
      playerEmails: ['p@x.com', 'Both@X.com'],
      staffEmails: ['S@x.com', 'both@x.com']
    }};

    assert.strictEqual(api.regStaffOf(R, {email: 's@x.com', roles: ['player']}), true,
        'the staff list wins over a stale record, whatever case it is stored in');
    assert.strictEqual(api.regStaffOf(R, {email: '  P@X.COM ', roles: ['staff']}), false,
        'and so does the player list, whatever case it is typed in');

    /* On BOTH lists is not a contradiction — a player-coach. The server
       hands them roles ['player','staff'] (membershipFrom), and every
       `isStaff` in the app is an indexOf('staff') on that, so it reads
       true. Checking staffEmails first is what keeps this page agreeing
       with the record the server will write. */
    assert.strictEqual(api.regStaffOf(R, {email: 'both@x.com', roles: []}), true,
        'on both lists is staff, exactly as the server derives it');
    assert.strictEqual(api.regStaffOf(R, {email: 'gone@x.com', roles: ['staff']}), true,
        'on no list, their own roles are all that is left');
    assert.strictEqual(api.regStaffOf(R, {email: 'gone@x.com', roles: []}), false);
    assert.strictEqual(api.regIsStaffListed(R, 'gone@x.com'), null,
        'null is the third answer, and the fallback depends on it');
    assert.strictEqual(api.regIsStaffListed(R, ''), null);
  });

  it('a role change writes nothing to the member record', () => {
    /* ⚠ `fa_users` is a SYNCED blob and js/db.js's reconcile only ADDS
       members it has not seen — it never refreshes the fields of one
       already in it. So a role guessed here would not self-heal, and
       would propagate to every other client as fact. The lists are the
       write; the record is the server's to derive. */
    const body = grabBare('  async function regSetRole', '  function autoSaveFromRow');
    const after = body.slice(body.indexOf('rosters[key][to] = added;'));
    assert.ok(!/saveUsers/.test(after), 'no local write may follow the roster edit');
    assert.ok(!/\.roles =/.test(after), 'and nothing may set roles');
    assert.ok(/renderPage\(getSession\(\)\)/.test(after),
        'the re-render is the whole of it');
  });

  it('the picker circles reset the padding that squashed them', () => {
    /* `.reg-pos-chip` carries `padding:.2rem .45rem`; inside a 30px
       border-box circle that leaves ~11px for the label and "GK" wraps. */
    const c = rule('\\.reg2-page \\.reg2-pos-c,\\s*\\.reg2-page \\.reg2-pos-c\\.active');
    assert.ok(/padding:\s*0/.test(c), 'padding must be reset');
    assert.ok(/margin:\s*0/.test(c), 'and the stray margin with it');
    assert.ok(/border-radius:\s*50%/.test(c), 'they are circles');
    assert.ok(/box-sizing:\s*border-box/.test(c),
        'or the border pushes them past 30px');
  });

  it('the colour still comes from POS_COLORS', () => {
    /* Inline, because `.reg-pos-chip.active[data-pos="GK"]` would
       otherwise repaint them from a second, older table of colours. */
    const body = grabBare('  function regPosCellHtml', '  function regTeamCellHtml');
    assert.ok(/POS_COLORS\[p\]/.test(body), 'one table of position colours, not two');
    assert.ok(/style="background:/.test(body), 'set inline so the old rules cannot win');
  });

  it('the dorsal is centred in its column', () => {
    const page = grabBare('  function regPendingTableHtml', '  function regMembersTableHtml');
    assert.ok(/reg2-c">' \+ t\('reg2\.th_number'\)/.test(page), 'header centred');
    assert.ok(/reg2-c">' \+ regNumberHtml/.test(page), 'cell centred');
    assert.ok(/text-align:\s*center/.test(rule('\\.reg2-num')), 'and the field itself');
    assert.ok(/\.reg2-table td\.reg2-c\s*\{[^}]*text-align:\s*center/.test(css) ||
              /\.reg2-table th\.reg2-c,\s*\.reg2-table td\.reg2-c\s*\{[^}]*center/.test(css),
        'the .reg2-c column class must exist');
  });

  it('the section subtitles are the loudest thing above their table', () => {
    /* "Convidats", "Pendents de col·locar" and "Membres" were the same
       faint grey as the key-figure captions, and the page read as one
       long undifferentiated list. The eyebrow is now ink and semibold;
       the captions keep the faint treatment under their OWN class, so
       the two cannot drift back into each other. */
    const eb = rule('\\.reg2-eyebrow');
    assert.ok(/font-weight:\s*[6-9]00/.test(eb), 'the subtitles must be bold');
    assert.ok(/color:\s*#2D2926/i.test(eb), 'and ink, not grey');

    const fig = rule('\\.reg2-fig-l');
    assert.ok(!/font-weight:\s*[6-9]00/.test(fig),
        'the key-figure captions must NOT come along');

    const page = grab('  function renderRegistrations', '  async function regAddInvite');
    // Counted, not merely found: there are three key figures, and a
    // single one left on .reg2-eyebrow is exactly the drift this guards.
    assert.strictEqual((page.match(/reg2-fig-l">' \+ t\('reg2\.fig_/g) || []).length, 3,
        'all three captions must use their own class, not the eyebrow');
    assert.ok(!/reg2-eyebrow">' \+ t\('reg2\.fig_/.test(page),
        'and none may be left behind on it');
  });
});

describe('the page is not a grid of rules', () => {
  it('only the title and the tables draw hairlines', () => {
    /* Four rules inside the first 200px — under the title, under the
       figures, under the invite row and over the pending section —
       read as a form to fill in rather than a page to work through.
       Space separates the sections now; a rule means "a table starts
       here" or "the heading ends here", and nothing else. */
    const figures = /\.reg2-figures\s*\{([^}]*)\}/.exec(css)[1];
    assert.ok(!/border/.test(figures), 'the key figures need no rule under them');
    const invite = /\.reg2-invite\s*\{([^}]*)\}/.exec(css)[1];
    assert.ok(!/border/.test(invite), 'nor the invite row');
    const top = /\.reg2-sec-top\s*\{([^}]*)\}/.exec(css)[1];
    assert.ok(!/border/.test(top), 'nor the section above the pending table');
    assert.ok(/padding-top/.test(top), 'space does that job instead');
    // The two that stay.
    assert.ok(/\.reg2-title-row\s*\{[^}]*border-bottom/.test(css),
        'the title keeps its rule');
    assert.ok(/\.reg2-table th\s*\{[^}]*border-bottom/.test(css),
        'and a table its header rule');
  });
});

describe('style', () => {
  it('the position chips wrap inside their column', () => {
    /* Nine 26px circles on one line would push every column after
       them off the table. They wrap instead, inside a width the
       column can hold. */
    const m = /\.reg2-pos-cell\s*\{([^}]*)\}/.exec(css);
    assert.ok(m, '.reg2-pos-cell has no rule');
    assert.ok(/flex-wrap:\s*wrap/.test(m[1]), 'they must wrap');
    assert.ok(/max-width/.test(m[1]), 'within a bounded column');
  });
  it('a duplicate dorsal colours the digits, not only the rule', () => {
    const m = /\.reg2-num-dup\s*\{([^}]*)\}/.exec(css);
    assert.ok(m, '.reg2-num-dup has no rule');
    /* `color:` ANCHORED. Unanchored it matched inside
       `border-bottom-color:`, so a rule that only recoloured the
       hairline satisfied a test asserting the digits changed too — the
       substring trap this codebase keeps rediscovering. */
    assert.ok(/(^|;|\s)color:\s*#C0564C/i.test(m[1]),
        'the digits must change colour, not just the rule under them');
    assert.ok(/border-bottom-color:\s*#C0564C/i.test(m[1]),
        'and the rule with them');
  });

  it('the disabled Afegeix reads as disabled', () => {
    assert.ok(/\.reg2-add:disabled\s*\{[^}]*background:\s*#B7B1A8/i.test(css),
        'the button greys rather than disappearing, so the row still reads');
  });
});

describe('the category picker is the app\'s dropdown, not a fourth one', () => {
  /* ⚠ THE ROUND THIS PAGE COST.
     A native <select> can be styled shut but NOT open — the popup is drawn
     by the OS. That is true, and it is why `stdSelect` was written, at
     js/app.js. This page did not use it: it grew its own control, whose
     menu was hidden with `el.hidden = true` under a rule that also said
     `display:flex`. `[hidden]{display:none}` is a UA rule at (0,1,0) and
     loses to any author `display`, so every menu on the page was
     permanently on screen, stacked at the viewport corner. Clicks landed
     on the wrong row's menu and scrolling left them behind.
     stdSelect toggles a CLASS and cannot reach that state. */

  it('renders through stdSelect, with no picker of its own', () => {
    const page = grabBare('  function regPendingTableHtml',
        '  function regMembersTableHtml');
    assert.ok(/stdSelect\(\{/.test(page), 'the cell must call the shared component');
    assert.ok(/kind: 'regcat'/.test(page), 'tagged so its onPick can find it');
    assert.ok(/std-sel-esc/.test(page),
        'and marked to escape .reg2-wrap, which is overflow-x:auto');

    ['regCatPickerHtml', 'regOpenDropdown', 'regCloseDropdowns', '_regDdBound',
      'reg2-dd'].forEach((dead) => {
      assert.ok(!bare.includes(dead), dead + ' must be gone from the app');
      assert.ok(!bareCss.includes(dead), dead + ' must be gone from the CSS');
    });
  });

  it('no rule may hide the menu the way the deleted one did', () => {
    /* THE GUARD FOR THE CLASS OF BUG, not the instance. jsdom cannot see
       this cascade — it reports display:none for a hidden element whatever
       the author sheet says — so it has to be checked statically. Any rule
       that sets `display` on a selector the app toggles via `.hidden` needs
       an `[hidden]{display:none!important}` companion, which is what the
       four existing cases in style.css already do. */
    const toggled = new Set();
    // Every class the app sets .hidden on, via a querySelector'd class name.
    const re = /querySelector(?:All)?\('([^']*\.[\w-]+)[^']*'\)[^;]{0,200}?\.hidden\s*=/g;
    let m;
    while ((m = re.exec(bare))) {
      (m[1].match(/\.[\w-]+/g) || []).forEach((c) => toggled.add(c.slice(1)));
    }
    const offenders = [];
    [...toggled].forEach((cls) => {
      const rule = new RegExp('\.' + cls + '[^{}]*\{([^}]*)\}', 'g');
      let r;
      while ((r = rule.exec(bareCss))) {
        if (!/display\s*:/.test(r[1])) continue;
        const guard = new RegExp('\.' + cls + '[^{}]*\[hidden\][^{}]*\{[^}]*display\s*:\s*none\s*!important');
        if (!guard.test(bareCss)) offenders.push(cls);
      }
    });
    assert.deepStrictEqual(offenders, [],
        'these classes set display AND are toggled with .hidden — the .hidden ' +
        'will silently do nothing. Add `[hidden]{display:none!important}` or ' +
        'toggle a class instead: ' + offenders.join(', '));
  });

  it('saves through the one writer, reading the picker root', () => {
    /* There is no <select> any more, so `.value` is gone with it. The
       category comes off the stdSelect root's data-value — one control,
       one writer, no shadow copy of the value. */
    const save = grabBare('  function autoSaveFromRow', '  function bindRegistrations');
    assert.ok(/querySelector\('\[data-std-sel="regcat"\]'\)/.test(save),
        'it must read the picker root');
    assert.ok(/catEl \? catEl\.dataset\.value : \(user\.category \|\| ''\)/.test(save),
        'and keep the fallback: a row with no picker must not be cleared');
    assert.ok(!bare.includes('reg-cat-select'),
        'the old select class must be gone entirely');
  });

  it('the writer is reachable by name, not only through an event', () => {
    /* autoSaveFromRow used to be a local inside the delegated-handler
       IIFE, so the only way to invoke it was to fire a DOM event it
       happened to listen for. The picker is a div and fires no `change`;
       lifting the function out is what let bindRegistrations call it
       instead of growing a second writer beside it. */
    assert.ok(/^  function autoSaveFromRow/m.test(bare),
        'it must sit at module level, not nested inside a binder');
    assert.ok(!/typeof autoSaveFromRow === 'function'/.test(bare),
        'and no caller needs to check whether it can see it any more');
  });

  it('choosing a category redraws the letters, saves, then re-renders', () => {
    /* What the deleted `change` branch used to do, moved into onPick —
       and the re-render is what updates the trigger label, which the
       bespoke picker never did. Same shape as the New Training callback. */
    const bind = grabBare('  function bindRegistrations', '  function parseArchiveDoc');
    /* ⚠ Bounded to the CALLBACK. Sliced to the end of bindRegistrations it
       ran on into every other binder, all of which call renderPage — so
       deleting the one that matters here still found a later one and the
       ordering check passed over a missing step. */
    const from = bind.indexOf("bindStdSelects('regcat', function");
    assert.notStrictEqual(from, -1, 'it must claim only its own kind');
    const cb = bind.slice(from, bind.indexOf('\n    });', from));
    /* Ownership is declared in the call, not checked inside the callback:
       bindDynamicActions runs every page's binder on every render, so two
       callers that both claimed every `.std-sel` each bound a click
       listener and the second closed what the first had just opened. */
    assert.ok(/regTeamCellHtml\(row\.dataset\.uid, value, '', false\)/.test(cb),
        'the letters belong to the category, and one renderer draws them');
    ['regTeamCellHtml', 'autoSaveFromRow', 'renderPage'].reduce((prev, name) => {
      const at = cb.indexOf(name);
      assert.notStrictEqual(at, -1, name + ' must be in the callback at all');
      assert.ok(at > prev, name + ' must come after the step before it');
      return at;
    }, -1);
  });
});

/* ── Agent/Agència, the phone, and the faces (v231) ──────────────────
 *
 * Source-and-CSS assertions, like the rest of this suite. What each pins is
 * something whose absence is silent: a column that saves nothing, a `|` with
 * nothing after it, or an avatar that only ever renders a broken image.
 */
describe('the agent column, the phone and the avatars', () => {
  /* ⚠ grabBare() strips comments, so every marker here must be CODE. The
     first version of this block ended PENDING at the comment banner
     '/* ── Membres', which grabBare had already deleted. */
  const WHO = grabBare('  function regWhoCellHtml', '  function regAgentCellHtml');
  const AGENT = grabBare('  function regAgentCellHtml', '  function regPendingTableHtml');
  const PENDING = grabBare('  function regPendingTableHtml', '  function regMembersTableHtml');
  const MEMBERS = grabBare('  function regMembersTableHtml', '  function renderRegistrations');
  // grab(), not grabBare(): this one's end marker IS a comment banner, and
  // it is what the existing runSave() helper above already slices with.
  const SAVE = grab('  function autoSaveFromRow(row) {', '  /* ── Bindings');

  it('BOTH tables draw the agent column, between the name and the rol', () => {
    /* ⚠ Measured inside the RETURNED ROW, not the whole function. `rolCell`
       is a variable declared well above the markup, so searching the
       function body finds its declaration and reports the columns in the
       wrong order — which is how the first version of this failed on
       correct code. */
    [['pending', PENDING], ['members', MEMBERS]].forEach(([which, body]) => {
      const row = body.slice(body.indexOf("'<tr"));
      const who = row.indexOf('regWhoCellHtml');
      const agent = row.indexOf('regAgentCellHtml');
      const rol = row.indexOf('rolCell');
      assert.ok(who !== -1 && agent !== -1 && rol !== -1, which + ' is missing a cell');
      assert.ok(who < agent && agent < rol,
          which + ': the agent column is not between the member and the rol');
    });
  });

  it('both header rows gained the column, or the cells shift under the wrong titles', () => {
    [['pending', PENDING], ['members', MEMBERS]].forEach(([which, src]) => {
      assert.ok(src.includes("t('reg2.th_agent')"), which + ' header missing');
    });
  });

  it('the agent input carries the class the binder looks for', () => {
    assert.ok(/class="reg2-agent reg-agent"/.test(AGENT), AGENT);
    assert.ok(/data-uid="/.test(AGENT), 'the row cannot be identified');
  });

  it('a read-only page renders the agent as TEXT, not a disabled input', () => {
    /* A greyed-out box invites a click that does nothing. It also matters to
       autoSaveFromRow: `.reg-agent` being genuinely absent is what makes the
       "leave it alone" branch fire instead of writing an empty string. */
    const ro = AGENT.slice(AGENT.indexOf('if (ro)'), AGENT.indexOf('<td><input'));
    assert.ok(!ro.includes('<input'), ro);
    assert.ok(ro.includes('reg2-dash'), 'an empty read-only agent shows nothing at all');
  });

  it('the agent commits on BLUR, never on input', () => {
    /* The dorsal beside it saves per keystroke — one Firestore write per
       character, tolerable for two digits and not for an agency name. And
       `blur` does not bubble, so the listener MUST be in the capture phase
       or it silently never fires. */
    const i = src.indexOf("content.addEventListener('blur'");
    assert.ok(i !== -1, 'the blur listener is gone — the field saves nothing');
    const block = src.slice(i, src.indexOf('}, true);', i) + 10);
    assert.ok(block.includes('reg-agent'), block);
    assert.ok(/\}, true\);/.test(block),
        'not in the capture phase: blur does not bubble, so this never fires');
    const inputStart = src.indexOf("content.addEventListener('input'");
    const inputBlock = src.slice(inputStart, i);
    assert.ok(!inputBlock.includes('reg-agent'), 'the agent saves on every keystroke');
  });

  it('the phone sits beside the email, and its separator dies with it', () => {
    /* A `|` emitted before the phone survives an empty one, which is a
       dangling mark on every row of every club that has not collected
       numbers yet — that is, all of them until they do. */
    assert.ok(WHO.includes('reg2-sep'), WHO);
    const sep = WHO.indexOf('reg2-sep');
    const cond = WHO.lastIndexOf('phone ?', sep);
    assert.ok(cond !== -1 && cond < sep,
        'the separator is not gated on the phone being there');
  });

  it('the face is a SIBLING of the two text lines, not inside the first', () => {
    /* v233. Inline inside `.reg2-name` it could only ever be as tall as one
       line of text. Beside the stacked name+email it takes the height of
       both, which is most of the row. */
    const av = WHO.indexOf('avatarHtmlGlobal(u,');
    const txt = WHO.indexOf('reg2-who-txt');
    const name = WHO.indexOf('reg2-name');
    assert.ok(av !== -1 && txt !== -1, WHO);
    assert.ok(av < txt && txt < name,
        'the avatar is back inside the name line, so it cannot span the row');
    assert.ok(/reg2-who"/.test(WHO), 'the flex row wrapper is gone');
    /* And the wrapper has to actually BE a row. Asserting only that the
       class is emitted let `display:block` through — the markup was right
       and the face went back to sitting above the text. */
    const who = /\.reg2-who\s*\{([^}]*)\}/.exec(css);
    assert.ok(who, 'the .reg2-who rule is gone');
    assert.ok(/display:\s*flex/.test(who[1]), who[1]);
    assert.ok(/align-items:\s*center/.test(who[1]), 'the face is not centred on the text');
  });

  it('the enlarged face keeps ONE geometry definition', () => {
    // The modifier sets size; the base still owns radius and object-fit, so
    // the large variant cannot drift out of round with the small one.
    const lg = /\.pp-av-lg\s*\{([^}]*)\}/.exec(css);
    assert.ok(lg, 'the size modifier is gone');
    assert.ok(/width:\s*40px/.test(lg[1]), lg[1]);
    assert.ok(!/border-radius/.test(lg[1]),
        'the modifier redefines the radius instead of inheriting it: ' + lg[1]);
  });

  it('both name cells draw a face', () => {
    assert.ok(WHO.includes('avatarHtmlGlobal(u,'), WHO);
    [['pending', PENDING], ['members', MEMBERS]].forEach(([which, s]) => {
      assert.ok(s.includes('regWhoCellHtml'), which + ' does not use the shared cell');
    });
  });

  it('the save writes the agent through BOTH paths', () => {
    /* saveUsers() reaches the synced fa_users shard, which is what makes it
       visible on another coach's device; the users/{uid} write is what makes
       it survive a blob rebuild. One without the other half-applies it. */
    assert.ok(/user\.agent = agent;/.test(SAVE), 'not written to the local blob');
    assert.ok(/agent: agent/.test(SAVE), 'not written to the user document');
  });

  it('the rejected-write toast is there, so a refused save cannot be silent', () => {
    /* saveUsers() has already run by then, so the screen shows the new value
       while the server has none of it. It used to end in a bare
       `.catch(console.error)` — invisible to the coach, and the edit
       reappears undone on the next device. */
    assert.ok(!/merge: true \}\)\.catch\(console\.error\)/.test(SAVE),
        'the bare console.error catch is back');
    assert.ok(SAVE.includes('reg2.save_failed_t'), SAVE.slice(-800));
  });

  it('the Firestore write stays inside the string-uid guard', () => {
    // runSave() above injects no `db`; an unconditional call would throw in
    // every one of those tests rather than in production.
    const guard = SAVE.indexOf("typeof uid === 'string'");
    const write = SAVE.indexOf("db.collection('users')");
    assert.ok(guard !== -1 && write !== -1 && guard < write, 'the guard moved');
  });

  it('the tables were widened for the new column', () => {
    // Otherwise the row squashes instead of the wrapper scrolling.
    const m = /\.reg2-table\s*\{[^}]*min-width:\s*(\d+)px/.exec(css);
    assert.ok(m, 'the table rule moved');
    assert.ok(Number(m[1]) >= 1000, 'still at the pre-agent width: ' + m[1]);
  });

  it('the avatar is round, and its placeholder shares the geometry', () => {
    const av = /\.pp-av\s*\{([^}]*)\}/.exec(css);
    assert.ok(av, 'the avatar rule is gone');
    assert.ok(/border-radius:\s*50%/.test(av[1]), av[1]);
    assert.ok(/width:\s*26px/.test(av[1]), 'not the position-circle size: ' + av[1]);
    const ph = /\.pp-av-ph\s*\{([^}]*)\}/.exec(css);
    assert.ok(ph, 'the placeholder rule is gone');
    // ⚠ Anchored to a property START. An unanchored `height:` also matches
    // `line-height:`, which the placeholder legitimately sets.
    assert.ok(!/(^|;)\s*(width|height|border-radius)\s*:/.test(ph[1]),
        'the placeholder redefines geometry instead of inheriting it: ' + ph[1]);
  });

  it('the name cells align by baseline, not by flex', () => {
    /* Wrapping these cells in a flex box collapses the margin-left that
       catBadgeHtmlGlobal relies on for all of its spacing — the badge would
       sit flush against the name on every roster row. */
    assert.ok(/\.reg2-name,\s*\.pl-td-name\s*\{[^}]*white-space:\s*nowrap/.test(css),
        'the nowrap rule is gone');
    /* Plantilla only since v233: the Registracions cell became a flex row so
       the face could span both text lines, and nothing in IT depends on the
       badge margin. The Plantilla cell still does, so it keeps baseline
       alignment and must never be made flex. */
    assert.ok(/\.pl-td-name > \*\s*\{[^}]*vertical-align:\s*middle/.test(css),
        'the vertical-align rule the Plantilla inline-flow cell depends on is gone');
    assert.ok(!/\.pl-td-name\s*\{[^}]*display:\s*flex/.test(css),
        'the Plantilla name cell was made flex — that collapses the badge margin');
  });

  it('the staff rules allowlist actually permits what the page writes', () => {
    /* The page writing a field the server refuses is the worst shape this
       change can take: saveUsers() has already painted it locally, so it
       looks saved until another device disagrees. */
    const rules = fs.readFileSync(path.join(__dirname, '..', 'firestore.rules'), 'utf8');
    const staff = rules.slice(rules.indexOf('isStaffOf(resource.data.teamId)'));
    const list = staff.slice(0, staff.indexOf(']'));
    ['phone', 'agent', 'position', 'playerNumber', 'team', 'category']
        .forEach((k) => assert.ok(list.includes("'" + k + "'"),
            k + ' is written by the page but not allowed by firestore.rules'));
  });
});
