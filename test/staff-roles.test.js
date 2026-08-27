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
      logic + '\n return {staffAccess, canViewPage, canEditPage, shomeLinkAttrs};');
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
      assert.strictEqual(g.staffAccess('staff-training-detail'), 'view');
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
      assert.strictEqual(g.staffAccess('staff-training-detail'), 'view');
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
