/* Unit tests for staff sub-roles: coach / fitness / delegate.
 *
 * Pure logic, no emulator: `npm run test:staffroles`.
 *
 * Two halves, both sliced out of real source by marker the way
 * navigation.test.js does — neither file exports anything, and a copy of the
 * table here would be a copy that drifts. If a marker stops matching, grab()
 * throws naming it, which is a readable failure rather than a green run
 * against code that no longer exists.
 *
 * Worth testing away from a browser because the failure mode is silent in
 * both directions: a sub-role that keeps an access it should have lost looks
 * exactly like a working app until someone deletes a match, and one that
 * loses an access it should have kept looks like a missing sidebar item
 * nobody can explain.
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const appSrc = fs.readFileSync(path.join(__dirname, '..', 'js', 'app.js'), 'utf8');
const fnSrc = fs.readFileSync(path.join(__dirname, '..', 'functions', 'index.js'), 'utf8');

function grab(src, from, to, label) {
  const i = src.indexOf(from);
  const j = src.indexOf(to, i);
  assert.ok(i !== -1 && j !== -1, 'marker not found in ' + label + ': ' + from);
  return src.slice(i, j);
}

// ── The client-side gate ────────────────────────────────────────────────
/* STAFF_ROLE_ACCESS + staffAccess + canViewPage + canEditPage, with the one
   thing they read (the session) injected. */
function makeGate(session) {
  const logic = grab(appSrc,
      '  const STAFF_ROLE_ACCESS = {',
      '  /* The page we were on before this one', 'js/app.js');
  const factory = new Function('getSession', 'sanitize', 't',
      logic + '\n return {staffAccess, canViewPage, canEditPage, ' +
        'shomeLinkAttrs, trainingDetailPageFor, isStaffViewer, ' +
        'canEditMatchRecord};');
  return factory(() => session, (s) => String(s), (k) => k);
}

const staff = (staffRole) => ({roles: ['staff'], staffRole});

// ── The server-side derivation ──────────────────────────────────────────
function makeDerivation() {
  const consts = grab(fnSrc,
      '/** The sub-roles under `staff`',
      '/** Read every roster doc of a club once', 'functions/index.js');
  const fns = grab(fnSrc,
      '/**\n * Collapse the sub-roles an address holds',
      '/* `resolveMembership(clubId, email)` used to live here', 'functions/index.js');
  return new Function(consts + fns +
      '\n return {normStaffRoles, resolveStaffRole, membershipFrom};')();
}

/** One roster doc as loadRosters() hands it over. */
function roster(key, staffEmails, staffRoles, playerEmails) {
  const {normStaffRoles} = makeDerivation();
  return {
    key,
    staff: staffEmails || [],
    players: playerEmails || [],
    staffRoles: normStaffRoles(staffRoles || {}),
  };
}

describe('staff sub-roles', () => {
  describe('the access table', () => {
    it('leaves a coach with everything, exactly as before sub-roles', () => {
      const g = makeGate(staff('coach'));
      ['staff-home', 'registrations', 'manage-roster', 'staff-training',
        'matchday', 'convocatoria', 'staff-matchday', 'medical', 'tactics',
        'staff-notifications', 'training-new'].forEach((p) => {
        assert.strictEqual(g.staffAccess(p), 'edit', p);
      });
    });

    it('treats an absent or unrecognised sub-role as coach', () => {
      // Every account written before this feature has no staffRole at all.
      ['', undefined, null, 'physio', 'COACH'].forEach((v) => {
        assert.strictEqual(makeGate(staff(v)).staffAccess('tactics'), 'edit',
            JSON.stringify(v));
      });
    });

    /* `matchday`, `staff-matchday` and `staff-training` were three pages
       and are one now: `calendar`. That collapse NARROWED the fitness coach
       — they read the fixture list at 'edit' before, and the merged page is
       'view' throughout — which is the honest reading of "scheduling is not
       their job" and is asserted rather than glossed over. */
    it('gives fitness the medical file, and nothing on the calendar to edit', () => {
      const g = makeGate(staff('fitness'));
      assert.strictEqual(g.staffAccess('medical'), 'edit');
      assert.strictEqual(g.staffAccess('medical-detail'), 'edit');
      assert.strictEqual(g.staffAccess('staff-notifications'), 'edit');
      assert.strictEqual(g.staffAccess('registrations'), 'view');
      assert.strictEqual(g.staffAccess('manage-roster'), 'view');
      assert.strictEqual(g.staffAccess('calendar'), 'view');
      /* EDIT since v197: this role cannot create or move a session, but once
         one is scheduled the squad, the staff call, the plan and the material
         are its work. Scheduling stays shut via calendar/training-new. */
      assert.strictEqual(g.staffAccess('staff-training-detail'), 'edit');
      assert.strictEqual(g.staffAccess('convocatoria'), 'hidden');
      assert.strictEqual(g.staffAccess('tactics'), 'hidden');
      assert.strictEqual(g.staffAccess('training-new'), 'hidden');
    });

    it('gives delegate the calendar, and hides the medical file', () => {
      const g = makeGate(staff('delegate'));
      // Running the calendar is most of this role.
      assert.strictEqual(g.staffAccess('calendar'), 'edit');
      assert.strictEqual(g.staffAccess('convocatoria'), 'view');
      assert.strictEqual(g.staffAccess('registrations'), 'view');
      assert.strictEqual(g.staffAccess('manage-roster'), 'view');
      /* EDIT since v197: this role cannot create or move a session, but once
         one is scheduled the squad, the staff call, the plan and the material
         are its work. Scheduling stays shut via calendar/training-new. */
      assert.strictEqual(g.staffAccess('staff-training-detail'), 'edit');
      /* Still hidden, and it is what stops a delegate creating sessions:
         canAddTraining() gates the greyed placeholders and the add menu on
         this page, not on the calendar's own access. */
      assert.strictEqual(g.staffAccess('training-new'), 'hidden');
      assert.strictEqual(g.staffAccess('medical'), 'hidden');
      assert.strictEqual(g.staffAccess('medical-detail'), 'hidden');
      assert.strictEqual(g.staffAccess('tactics'), 'hidden');
      assert.strictEqual(g.staffAccess('staff-notifications'), 'hidden');
    });

    it('a coach may create sessions; a delegate who runs the calendar may not', () => {
      /* The two gates are deliberately different. `calendar: edit` lets the
         delegate schedule fixtures and activities; creating a TRAINING is
         still the coach's, and both routes to it — the placeholder and the
         add menu — read canAddTraining(). Without the second gate the
         placeholder would create a session whose detail page then refuses
         to open. */
      const coach = makeGate(staff('coach'));
      assert.ok(coach.canEditPage('calendar') && coach.canViewPage('training-new'));
      const del = makeGate(staff('delegate'));
      assert.ok(del.canEditPage('calendar'));
      assert.ok(!del.canViewPage('training-new'));
      const fit = makeGate(staff('fitness'));
      assert.ok(!fit.canEditPage('calendar'));
      assert.ok(!fit.canViewPage('training-new'));
    });

    it('lets every sub-role see the home page and a player profile', () => {
      ['coach', 'fitness', 'delegate'].forEach((r) => {
        const g = makeGate(staff(r));
        assert.ok(g.canViewPage('staff-home'), r);
        assert.ok(g.canViewPage('staff-player-stats'), r);
      });
    });

    it('never narrows a lead or the superadmin', () => {
      // They are on no roster staff list, so they have no sub-role to read —
      // and a lead locked out of what they administer could not undo it.
      const lead = {roles: ['lead'], isTeamLead: true, staffRole: 'delegate'};
      const admin = {roles: ['staff'], isAdmin: true, staffRole: 'fitness'};
      [lead, admin].forEach((s) => {
        const g = makeGate(s);
        assert.strictEqual(g.staffAccess('medical'), 'edit');
        assert.strictEqual(g.staffAccess('tactics'), 'edit');
      });
    });

    it('canView and canEdit agree with the three access levels', () => {
      const g = makeGate(staff('delegate'));
      assert.ok(g.canViewPage('convocatoria') && !g.canEditPage('convocatoria'));
      assert.ok(g.canViewPage('matchday') && g.canEditPage('matchday'));
      assert.ok(!g.canViewPage('medical') && !g.canEditPage('medical'));
    });

    it('drops the staff-home shortcut to a page this sub-role may not open', () => {
      const del = makeGate(staff('delegate'));
      assert.strictEqual(del.shomeLinkAttrs('medical-detail', 7), '');
      assert.ok(del.shomeLinkAttrs('staff-player-stats', 7).indexOf('data-shome-link') !== -1);
      const coach = makeGate(staff('coach'));
      assert.ok(coach.shomeLinkAttrs('medical-detail', 7).indexOf('data-shome-id="7"') !== -1);
    });
  });

  describe('normStaffRoles', () => {
    const {normStaffRoles} = makeDerivation();

    it('lowercases both sides and drops unknown values', () => {
      assert.deepStrictEqual(
          normStaffRoles({' A@X.com ': ' Fitness ', 'b@x.com': 'physio', 'c@x.com': 'delegate'}),
          {'a@x.com': 'fitness', 'c@x.com': 'delegate'});
    });

    it('survives a missing or malformed field', () => {
      [undefined, null, 'nope', 42, []].forEach((v) => {
        assert.deepStrictEqual(normStaffRoles(v), {}, JSON.stringify(v));
      });
    });
  });

  describe('resolveStaffRole', () => {
    const {resolveStaffRole} = makeDerivation();

    it('defaults to coach when there is nothing to go on', () => {
      assert.strictEqual(resolveStaffRole([]), 'coach');
    });

    it('takes the single sub-role when every list agrees', () => {
      assert.strictEqual(resolveStaffRole(['fitness']), 'fitness');
      assert.strictEqual(resolveStaffRole(['delegate', 'delegate']), 'delegate');
    });

    it('resolves permissively: one coach entry wins over any downgrade', () => {
      assert.strictEqual(resolveStaffRole(['coach', 'fitness']), 'coach');
      assert.strictEqual(resolveStaffRole(['delegate', 'coach']), 'coach');
    });

    it('falls back to coach when two lists disagree on the downgrade', () => {
      assert.strictEqual(resolveStaffRole(['fitness', 'delegate']), 'coach');
    });
  });

  describe('membershipFrom', () => {
    const {membershipFrom} = makeDerivation();

    it('reads the sub-role off the roster the address is staff on', () => {
      const m = membershipFrom(
          [roster('cadet-A', ['pf@x.com'], {'pf@x.com': 'fitness'})], 'pf@x.com');
      assert.deepStrictEqual(m.roles, ['staff']);
      assert.strictEqual(m.staffRole, 'fitness');
      assert.deepStrictEqual(m.staffCats, ['cadet']);
    });

    it('calls an address with no entry a coach', () => {
      // The shape of every roster doc written before sub-roles existed.
      const m = membershipFrom([roster('cadet-A', ['c@x.com'])], 'c@x.com');
      assert.strictEqual(m.staffRole, 'coach');
    });

    it('leaves staffRole empty for a player', () => {
      const m = membershipFrom(
          [roster('cadet-A', [], {}, ['p@x.com'])], 'p@x.com');
      assert.deepStrictEqual(m.roles, ['player']);
      assert.strictEqual(m.staffRole, '');
    });

    it('resolves across categories, permissively', () => {
      const rs = [
        roster('cadet-A', ['x@x.com'], {'x@x.com': 'fitness'}),
        roster('juvenil-A', ['x@x.com']),   // no entry ⇒ coach here
      ];
      const m = membershipFrom(rs, 'x@x.com');
      assert.strictEqual(m.staffRole, 'coach');
      assert.deepStrictEqual(m.staffCats.slice().sort(), ['cadet', 'juvenil']);
    });

    it('keeps the sub-role when both lists downgrade the same way', () => {
      const rs = [
        roster('cadet-A', ['d@x.com'], {'d@x.com': 'delegate'}),
        roster('juvenil-A', ['d@x.com'], {'d@x.com': 'delegate'}),
      ];
      assert.strictEqual(membershipFrom(rs, 'd@x.com').staffRole, 'delegate');
    });

    it('gives a staff+player the staff sub-role', () => {
      const rs = [roster('cadet-A', ['both@x.com'],
          {'both@x.com': 'delegate'}, ['both@x.com'])];
      const m = membershipFrom(rs, 'both@x.com');
      assert.deepStrictEqual(m.roles.slice().sort(), ['player', 'staff']);
      assert.strictEqual(m.staffRole, 'delegate');
    });
  });
});

/* ------------------------------------------------------------------ *
 * Which training page a click opens.
 *
 * This routed on `canEditPage('calendar')` until v197 — the wrong question,
 * about the wrong page, and wrong for everyone but a head coach. Both
 * failures were silent: no error, just the wrong screen.
 * ------------------------------------------------------------------ */
describe('routing into a training', () => {
  const page = (session) => makeGate(session).trainingDetailPageFor(session);

  it('sends a PLAYER to the player page', () => {
    /* staffAccess has no table for a player, so it falls through to 'edit'
       and the old gate sent them to the STAFF page — where the STAFF_PAGES
       guard in renderPage bounced them to player-home. Clicking a training
       in the calendar took a player to their home screen. */
    assert.strictEqual(page({roles: ['player']}), 'training-detail');
  });

  it('sends someone with no roles at all to the player page', () => {
    assert.strictEqual(page({roles: []}), 'training-detail');
    assert.strictEqual(page({}), 'training-detail');
  });

  it('sends a head coach to the staff page', () => {
    assert.strictEqual(page(staff('coach')), 'staff-training-detail');
  });

  it('sends a FITNESS coach to the staff page, not the player one', () => {
    // `calendar: 'view'` used to send this role to the player page — the one
    // page showing none of the squad, the plan or the material — despite the
    // table granting staff-training-detail outright.
    assert.strictEqual(page(staff('fitness')), 'staff-training-detail');
  });

  it('sends a delegate to the staff page', () => {
    assert.strictEqual(page(staff('delegate')), 'staff-training-detail');
  });

  it('respects a sub-role that has the staff page hidden', () => {
    // No such role today, but the gate must read the table rather than
    // assume every staff member may open it.
    const g = makeGate({roles: ['staff'], staffRole: 'fitness'});
    assert.strictEqual(g.canViewPage('convocatoria'), false,
        'hidden really is hidden');
  });

  it('a player who is ALSO staff gets the staff page', () => {
    assert.strictEqual(page({roles: ['player', 'staff'], staffRole: 'coach'}),
        'staff-training-detail');
  });
});

/* ── Who may change the record of a match ──────────────────────────────
 *
 * Nobody could, from v186 until v202. `renderMatchDetail` gated every
 * editing control on `detailMatchFrom === 'staff-matchday'`, and the page
 * that set that value was folded into the calendar in v186 — its cards
 * went with it, so nothing has emitted `data-go-staff-match` since. The
 * condition was unreachable, so a coach saw no + Event button, no delete
 * on a timeline row, no starter toggle and no Titulars counter.
 *
 * It stayed quiet because the DISPLAY of starters hangs off a separate
 * `isPast` test: the panel went on looking alive while only the editing
 * was gone.
 */
describe('canEditMatchRecord — events and the starting XI', () => {
  const can = (session) => makeGate(session).canEditMatchRecord(session);

  it('a head coach may', () => {
    assert.strictEqual(can(staff('coach')), true);
  });

  it('a delegate may — keeping the match record is most of the role', () => {
    assert.strictEqual(can(staff('delegate')), true);
  });

  it('a fitness coach may NOT', () => {
    // Logging goals is not their job, and neither is picking the eleven.
    assert.strictEqual(can(staff('fitness')), false);
  });

  it('a club lead may, sub-role or not', () => {
    assert.strictEqual(can({roles: ['staff'], isTeamLead: true}), true);
    assert.strictEqual(can({roles: ['staff'], isAdmin: true}), true);
  });

  it('a PLAYER may not — and canEditPage alone would say yes', () => {
    /* The clause that carries this test. A player has no sub-role, so
       `staffAccess` falls through to 'edit' and canEditPage('match-detail')
       returns TRUE for them. Only the isStaffViewer half denies it.
       This is v197 in miniature: a permission standing in for a question
       it does not answer. */
    const g = makeGate({roles: ['player']});
    assert.strictEqual(g.canEditPage('match-detail'), true,
        'the sub-role table cannot answer this on its own');
    assert.strictEqual(g.canEditMatchRecord({roles: ['player']}), false,
        'being staff is the first question');
  });

  it('a playing coach may — he is still staff', () => {
    assert.strictEqual(can({roles: ['player', 'staff'], staffRole: 'coach'}), true);
  });

  it('each sub-role says so out loud rather than falling through', () => {
    /* An id absent from a table resolves to 'edit'. That is exactly how a
       fitness coach came to be able to edit a coach's match notes — the id
       they were keyed on, 'staff-matchday', was in no table at all. Both
       tables name 'match-detail' now so the silence cannot mean two
       different things. */
    const table = grab(appSrc, '  const STAFF_ROLE_ACCESS = {',
        '  /**\n   * What this session may do', 'js/app.js');
    const fitness = table.slice(table.indexOf('fitness:'), table.indexOf('delegate:'));
    const delegate = table.slice(table.indexOf('delegate:'));
    assert.ok(/'match-detail': 'view'/.test(fitness),
        'fitness must be denied in writing');
    assert.ok(/'match-detail': 'edit'/.test(delegate),
        'delegate must be granted in writing');
  });
});

describe('the dead staff-matchday route is gone', () => {
  const bare = appSrc.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

  it('nothing binds or emits data-go-staff-match', () => {
    // A binder for markup that does not exist is a promise the app cannot
    // keep — and this one gated every editing control on the match page.
    assert.ok(!/go-staff-match/i.test(bare) && !/goStaffMatch/.test(bare),
        'the dead binder must be removed, not left as a hook');
  });

  it("'staff-matchday' survives ONLY as a page alias", () => {
    /* Old APKs bundle their own copy of app.js and go on sending the old id
       in push deep links, so the alias has to stay. Nothing else may read
       it: as a `===` it is never true, and as a `canEditPage` argument it
       silently means 'edit'. */
    const hits = bare.match(/'staff-matchday'/g) || [];
    assert.strictEqual(hits.length, 1,
        "expected one surviving mention, in PAGE_ALIASES; found " + hits.length);
    const i = bare.indexOf("'staff-matchday'");
    const aliases = bare.slice(bare.indexOf('const PAGE_ALIASES'),
        bare.indexOf('const ADMIN_PAGES'));
    assert.ok(aliases.indexOf("'staff-matchday'") !== -1 &&
              i > bare.indexOf('const PAGE_ALIASES') && i < bare.indexOf('const ADMIN_PAGES'),
        'the survivor must be the alias entry');
  });

  it('the match page asks the role, not the route', () => {
    const render = bare.slice(bare.indexOf('function renderMatchDetail()'),
        bare.indexOf('function buildCustomSelect'));
    assert.ok(/const isStaff = canEditMatchRecord\(session\)/.test(render),
        'the editing gate must be the predicate');
    assert.ok(!/detailMatchFrom === /.test(render),
        'no entry-point comparison may decide what a coach can do');
  });

  it('the match notes card is gated on the same predicate', () => {
    /* The other half of the same rot, failing the opposite way:
       `!canEditPage('staff-matchday')` resolved to !'edit' → false, so a
       fitness coach could edit a coach's private notes. */
    const notes = bare.slice(bare.indexOf('function mnNotesCardHtml'),
        bare.indexOf('function mnLegBannerHtml'));
    assert.ok(/canEditMatchRecord\(getSession\(\)\)/.test(notes),
        'the notes card must use the predicate too');
  });
});
