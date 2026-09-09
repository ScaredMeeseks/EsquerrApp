/* Configuració — the one-page club settings screen (v254).
 *
 * Until v254 this page was four cards whose first button opened a SEPARATE
 * full-screen wizard (#view-team-setup). The wizard's sections are now folded
 * into the page as tabs, and both screens mount the SAME containers from
 * `_tsSectionsHtml()`, so every `_refreshTeamSetup*()` and `_collect*FromDom()`
 * drives both. That reuse is the whole design, and it creates two hazards this
 * suite exists to hold down:
 *
 *   1. Two copies of every id can be in the document at once (a hidden view is
 *      still in the DOM), so every lookup must be scoped — a document-wide
 *      getElementById would read or write the screen nobody is looking at.
 *   2. `_handleSaveTeamSetup` collects from the DOM, and an ABSENT section
 *      reads as empty rather than "leave alone" — so every panel has to be
 *      rendered, with only one VISIBLE, or a save from one tab wipes another.
 *
 * ⚠ The render test CALLS renderConfiguracio() and mounts it. Slicing a
 * builder and reading its text is what let v238 ship a Plantilla page that
 * rendered nothing past 3080 green tests.
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');
const { readCss } = require('./read-css');

const APP = path.join(__dirname, '..', 'js', 'app.js');
const appSrc = fs.readFileSync(APP, 'utf8');
const css = readCss();

function grab(from, to) {
  const i = appSrc.indexOf(from);
  const j = appSrc.indexOf(to, i);
  assert.ok(i !== -1 && j !== -1, 'marker not found in js/app.js: ' + from);
  return appSrc.slice(i, j);
}
/* Comment-stripped, for the assertions that say a symbol is GONE. The prose
   in app.js names each removed symbol to explain why it went, and a plain
   `includes` reads that as a use of it — same reason registrations.test.js
   carries grabBare(). */
const bare = appSrc.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');

const esc = (v) => String(v == null ? '' : v)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');

const CA = {};
const RE = /'((?:cfg|kits|rem|auth|club|quota|settings|staffrole|page|archive|day|btn|common|error)\.[a-z_0-9]+)':\s*\{\s*ca:\s*'((?:[^'\\]|\\.)*)'/g;
let mm;
while ((mm = RE.exec(appSrc))) CA[mm[1]] = mm[2].replace(/\\'/g, "'");

const CLUB = {
  id: 'club1',
  name: 'L\u2019Esquerra de l\u2019Eixample FC',
  leadEmail: 'lead@club.cat',
  badgeUrl: '',
  maxTeams: 4,
  categories: {
    amateur: { enabled: true, letters: ['A', 'B'] },
    juvenil: { enabled: true, letters: ['A'] },
    cadet: { enabled: true, letters: ['A'] },
    infantil: { enabled: false, letters: ['A'] },
    alevi: { enabled: false, letters: ['A'] },
    benjami: { enabled: false, letters: ['A'] }
  },
  fcfLinks: { 'amateur-A': 'https://www.fcf.cat/x?grupId=1' },
  schedules: {
    'amateur-A': { training: [{ day: 'wed', time: '20:00', endTime: '21:30', location: 'Camp', link: '' }],
      homeGame: { day: 'sat', time: '17:00', location: '', link: '' } },
    'amateur-B': { training: [{ day: 'tue', time: '21:15', endTime: '22:45', location: 'Camp', link: '' }],
      homeGame: { day: 'sat', time: '19:00', location: '', link: '' } },
    'juvenil-A': { training: [{ day: 'mon', time: '18:30', endTime: '20:00', location: 'Camp', link: '' }],
      homeGame: { day: 'sun', time: '12:00', location: '', link: '' } },
    /* No session on purpose: the rail has to flag it. */
    'cadet-A': { training: [], homeGame: { day: 'sat', time: '10:00', location: '', link: '' } }
  },
  reminders: { pushHours: 4, lockHours: 3 },
  homeCoords: { lat: 41.3874, lon: 2.1686 },
  kits: [{ id: 'k1', label: '1a equipació', shirt: '#ffffff', shorts: '#000000', socks: '#ffffff' }],
  rosters: {
    'amateur-A': { staffEmails: ['a@x.com'], staffRoles: {} },
    'amateur-B': { staffEmails: [], staffRoles: {} },
    'juvenil-A': { staffEmails: [], staffRoles: {} },
    'cadet-A': { staffEmails: [], staffRoles: {} }
  }
};

const SETUP = grab('  function _letterChipsHtml(catKey, letters, enabled) {',
    '  // ---------- Profile Setup ----------');
const PAGE = grab('  /** Which tab is showing.',
    '  /* Team-lead field in the club table (superadmin only).');
const TIMES = grab('  function buildTimeOptions(selected) {', '\n  /**');

/** Render and MOUNT the page, returning `{html, doc, errors}`. */
function render(over) {
  const dom = new JSDOM('<!DOCTYPE html><body>' +
      '<div id="view-team-setup" hidden><div class="auth-card" id="ts-card"></div></div>' +
      '<div id="dashboard-content"></div></body>');
  const doc = dom.window.document;
  const errors = [];
  dom.window.addEventListener('error', (e) => errors.push(e.message || String(e)));
  const club = Object.assign({}, CLUB, (over && over.club) || {});
  const session = Object.assign({ id: 'u0', email: 'lead@club.cat', teamId: 'club1',
    isTeamLead: true, isAdmin: false }, (over && over.session) || {});

  const api = {
    document: doc,
    window: dom.window,
    requestAnimationFrame: (fn) => fn(),
    DAY_VALUES: ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'],
    REMINDER_PUSH_HOURS: 4, REMINDER_LOCK_HOURS: 3, REMINDER_HOURS_MAX: 72,
    CATEGORY_ORDER: ['amateur', 'juvenil', 'cadet', 'infantil', 'alevi', 'benjami'],
    CATEGORY_LABELS: { amateur: 'Amateur', juvenil: 'Juvenil', cadet: 'Cadet',
      infantil: 'Infantil', alevi: 'Aleví', benjami: 'Benjamí' },
    _clubConfig: club,
    currentPage: 'settings',
    getSession: () => session,
    sanitize: esc,
    t: (k) => (k in CA ? CA[k] : k),
    tv: (k, v) => String(k in CA ? CA[k] : k).replace(/\{(\w+)\}/g, (s, n) => (n in v ? String(v[n]) : s)),
    seasonStartStr: () => '2026-08-15',
    showModal: () => {}, showView: () => {}, navigate: () => {},
    renderPage: () => {}, renderDashboard: () => {}, showDeleteTeamModal: () => {},
    _showPushToast: () => {}, _showQuotaBlockedModal: () => {},
    normalizeEmail: (v) => String(v || '').trim().toLowerCase(),
    isValidEmail: (v) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v),
    fcfGrupId: (v) => (/grupId=(\d+)/.exec(v || '') || [])[1] || '',
    defaultEndTime: (v) => v,
    parseCoordsInput: (v) => v,
    shirtSvg: () => '<svg></svg>', shortsSvg: () => '<svg></svg>', kitSockSvg: () => '<svg></svg>',
    parseFill: (v) => ({ c1: v || '#ffffff', striped: false, n: 2, dir: 'v', c2: '#ffffff' }),
    fillFrom: (c1) => c1,
    stripeRowEl: () => doc.createElement('span'),
    kitsOf: (c) => (c && c.kits && c.kits.length ? c.kits : [{ id: 'k1', label: '', shirt: '#fff', shorts: '#000', socks: '#fff' }]),
    clubReminders: (c) => (c && c.reminders) || { pushHours: 4, lockHours: 3 },
    clubMaxTeams: () => Math.max(1, Number(club.maxTeams || 1)),
    /* Sliced-in behaviour, not a constant: the hero figure, the rail and the
       quota colour all divide by this, and `() => 4` would make three
       different derivations agree on a number none of them computed. */
    rosterKeys: (cfg) => {
      const cats = (cfg && cfg.categories) || {};
      const out = [];
      ['amateur', 'juvenil', 'cadet', 'infantil', 'alevi', 'benjami'].forEach((k) => {
        if (!cats[k] || !cats[k].enabled) return;
        (cats[k].letters && cats[k].letters.length ? cats[k].letters : ['A'])
            .forEach((l) => out.push(k + '-' + l));
      });
      return out;
    },
    isClubOverQuota: () => false,
    STAFF_SUB_ROLES: ['coach', 'fitness', 'delegate'],
    db: null, firebase: null, storage: null,
    getClub: async () => club, loadRosters: async () => club.rosters,
    saveRosterFields: async () => {}, DB: {}, getTeamLetters: () => ['A', 'B']
  };

  const fn = new Function(...Object.keys(api), `
    ${TIMES}
    ${SETUP}
    ${PAGE}
    _cfgTab = ${JSON.stringify((over && over.tab) || 'club')};
    const host = document.getElementById('dashboard-content');
    /* The onboarding card is mounted TOO when the caller asks for it, so a
       test can put both copies of every id in one document — which is the
       situation the scoping exists for and the only way to prove it works. */
    if (${JSON.stringify(!!(over && over.alsoOnboarding))}) {
      const card = document.getElementById('ts-card');
      card.innerHTML = _tsSectionsHtml('onboarding');
    }
    host.innerHTML = renderConfiguracio();
    const page = host.querySelector('.cfg-page');
    if (page) _tsMount(page);
    return { host: host, api: {
      collectReminders: _collectRemindersFromDom,
      collectKits: _collectKitsFromDom,
      collectSchedules: _collectSchedulesFromDom,
      /* Re-point the club and re-run the kit refresh WITHOUT rebuilding the
         container — which is what a club switch did before v254, when the
         container was a static node in index.html. */
      refreshSchedules: _refreshTeamSetupSchedules,
      switchClubKeepingDom: function (nextClub) {
        _clubConfig = nextClub;
        _refreshTeamSetupKits();
        return _collectKitsFromDom();
      }
    } };
  `);
  const out = fn(...Object.values(api));
  return { host: out.host, inner: out.api, html: out.host.innerHTML, doc, errors, window: dom.window };
}

describe('Configuració — the page renders and mounts', () => {
  it('CALLS the builder and produces a page root', () => {
    const { html, errors } = render();
    assert.strictEqual(errors.length, 0, 'errors during render: ' + errors.join(' | '));
    assert.ok(html.includes('class="cfg-page"'), 'no page root — the builder produced nothing');
    assert.ok(html.includes('cfg-h1'), 'no title');
  });

  /* The sections are FILLED, not just declared. renderConfiguracio() returns
     the containers empty and _tsMount() fills them, so a string assertion on
     the return value alone cannot tell a mounted page from a hollow one. */
  it('mounts every section, not just its container', () => {
    const { host } = render();
    assert.ok(host.querySelector('.ts-cat-row'), 'the categories section did not mount');
    assert.ok(host.querySelector('[data-fcf-key]'), 'the FCF section did not mount');
    assert.ok(host.querySelector('[data-train-time]'), 'the schedules section did not mount');
    assert.ok(host.querySelector('[data-staff-email]'), 'the staff lists did not mount');
    assert.ok(host.querySelector('.ts-kit-block'), 'the kit editor did not mount');
    assert.ok(host.querySelector('#ts-rem-push'), 'the reminder hours did not mount');
    assert.ok(host.querySelector('#ts-home-coords'), 'the coordinates box did not mount');
  });

  /* ⚠ THE ONE THAT MATTERS. _handleSaveTeamSetup collects from the DOM and an
     absent section reads as EMPTY, not as "leave alone" — so if only the
     active tab were rendered, saving from Equipacions would send empty
     schedules and wipe every squad's training times. */
  it('renders EVERY panel whatever the active tab, so a save cannot wipe one', () => {
    ['club', 'cats', 'horaris', 'kits', 'llistes', 'temporades'].forEach((tab) => {
      const { host } = render({ tab });
      ['club', 'cats', 'horaris', 'kits', 'llistes', 'temporades'].forEach((p) => {
        assert.ok(host.querySelector('[data-cfg-panel="' + p + '"]'),
            'panel ' + p + ' is absent while ' + tab + ' is active — a save would clear it');
      });
      // And the sections inside them are mounted, not merely present.
      assert.ok(host.querySelector('[data-train-time]'),
          'the schedules did not mount with ' + tab + ' active');
    });
  });

  it('marks exactly one tab active, and the root says which', () => {
    const { host } = render({ tab: 'kits' });
    assert.strictEqual(host.querySelector('.cfg-page').dataset.cfgActive, 'kits');
    const on = host.querySelectorAll('.cfg-tab-on');
    assert.strictEqual(on.length, 1, 'expected one active tab, got ' + on.length);
    assert.strictEqual(on[0].dataset.cfgTab, 'kits');
  });

  it('falls back to Club when the remembered tab is not on offer', () => {
    // A superadmin leaves on the Clubs tab; a lead must not land on a tab
    // that is not in their strip and see an empty body.
    const { host } = render({ tab: 'clubs' });
    assert.strictEqual(host.querySelector('.cfg-page').dataset.cfgActive, 'club');
  });
});

describe('Configuració — what each role may see and write', () => {
  it('hides the superadmin Clubs tab from a plain lead', () => {
    const { host } = render();
    assert.ok(!host.querySelector('[data-cfg-tab="clubs"]'), 'a lead is offered the Clubs tab');
    assert.ok(!host.querySelector('[data-cfg-panel="clubs"]'), 'a lead is served the Clubs panel');
    assert.ok(!host.querySelector('#club-list'), 'a lead is served the club table');
  });

  it('shows it to the superadmin', () => {
    const { host } = render({ session: { isAdmin: true }, tab: 'clubs' });
    assert.ok(host.querySelector('[data-cfg-tab="clubs"]'), 'the superadmin has no Clubs tab');
    assert.ok(host.querySelector('#club-list'), 'the superadmin has no club table mount point');
  });

  /* firestore.rules lets a lead write only `fcfLinks` and `schedules` on the
     club doc, so the name, the crest and the responsable are superadmin
     fields. Rendering them as inputs for a lead would be a control that
     silently fails — the exact defect the old role toggle shipped. */
  it('renders the club identity read-only for a lead', () => {
    const { host } = render();
    const panel = host.querySelector('[data-cfg-panel="club"]');
    assert.ok(/L\u2019Esquerra/.test(panel.textContent), 'the club name is not shown at all');
    assert.ok(!panel.querySelector('#new-club-name'), 'a lead gets a club-name input');
    assert.ok(!panel.querySelector('.cfg-crest-edit'), 'a lead is offered the crest editor');
    // The one field on this tab a lead MAY write goes through setClubCategories.
    assert.ok(panel.querySelector('#ts-home-coords'), 'the lead cannot edit the coordinates');
  });

  it('offers the crest editor to the superadmin only', () => {
    const { host } = render({ session: { isAdmin: true } });
    assert.ok(host.querySelector('[data-cfg-panel="club"] .cfg-crest-edit'),
        'the superadmin cannot change the crest');
  });

  /* clubCodes is `allow read, write: if isSuperUser()` — a lead cannot read
     their own join code, and it is the credential that gets a stranger into
     the club. The mockup put it in the filter bar; it must not be there. */
  /* Asserts on the WHOLE page, not on one band. The first version read
     `.cfg-bar` — the identity strip above the hero — so when that strip was
     removed the test went on passing while checking an element that no
     longer existed. A gate on a credential has to be checked everywhere it
     could appear, not where it happened to appear once. */
  it('never renders a join code for a lead, anywhere on the page', () => {
    const { host } = render();
    assert.ok(host.querySelector('.cfg-page'), 'no page to check');
    const text = host.textContent;
    assert.ok(!/ESQ2026/.test(text), 'a join code is on the page for a lead');
    assert.ok(!host.querySelector('.cfg-cl-code'), 'the code column rendered for a lead');
  });
});

describe('Configuració — the rail tells the truth', () => {
  it('flags a squad with no session, in red', () => {
    const { host } = render();
    const rail = host.querySelector('.cfg-rail');
    assert.ok(rail, 'no rail');
    assert.ok(/cadet-A/.test(rail.textContent), 'the squad with no session is not named');
    assert.ok(rail.querySelector('.cfg-dot-bad'), 'the empty squad is not flagged red');
  });

  it('says nothing is outstanding when everything is set', () => {
    const full = JSON.parse(JSON.stringify(CLUB));
    full.schedules['cadet-A'].training = [{ day: 'mon', time: '18:00', endTime: '19:00', location: 'x', link: '' }];
    ['amateur-A', 'amateur-B', 'juvenil-A', 'cadet-A'].forEach((k) => {
      full.fcfLinks[k] = 'https://www.fcf.cat/x?grupId=9';
    });
    const { host } = render({ club: full });
    const rail = host.querySelector('.cfg-rail');
    assert.ok(rail.querySelector('.cfg-dot-ok'), 'a fully-configured club still shows a warning');
    assert.ok(!rail.querySelector('.cfg-dot-bad'), 'a fully-configured club shows a red dot');
  });

  it('counts teams against the allowance', () => {
    const { host } = render();
    assert.ok(/4\/4/.test(host.querySelector('.cfg-figs').textContent),
        'the hero does not show teams over the allowance');
  });
});

describe('Configuració — the reuse that makes it safe', () => {
  /* Two screens mount the same ids, and a hidden view is still in the
     document. A document-wide lookup would find whichever comes first in
     source order — so _collectRemindersFromDom could read the onboarding
     card and hand its stale values back to setClubCategories on save. */
  it('scopes every setup lookup instead of using getElementById', () => {
    /* ⚠ Both bounds must survive comment-stripping. `bare` has the `//
       Profile Setup` banner removed, so bounding on it ran this slice to the
       end of the file and reported every unrelated page's lookups. */
    const rFrom = bare.indexOf('function _letterChipsHtml');
    const rTo = bare.indexOf('function showProfileSetup', rFrom);
    assert.ok(rFrom !== -1 && rTo !== -1, 'the team-setup region moved');
    const region = bare.slice(rFrom, rTo);
    /* `#ts-card` and `#dashboard-content` are the MOUNT POINTS — they are
       outside the root being scoped to, so they are the two lookups that
       must stay document-wide. Everything inside them must not be. */
    const leaks = (region.match(/document\.getElementById\([^)]*\)/g) || [])
        .filter((s) => !/'(ts-card|dashboard-content)'/.test(s));
    assert.deepStrictEqual(leaks, [],
        'a setup lookup is document-wide again: ' + leaks.join(', '));
    assert.ok(region.includes('_tsEl('), 'the scoped accessor is gone');
  });

  /* ⚠ THE ONE THAT PROVES IT, and the source grep above does not.
     With both screens in the document there are two #ts-rem-push boxes, and
     the onboarding card comes FIRST in source order — so a document-wide
     lookup returns the card. `_collectRemindersFromDom` feeds
     setClubCategories, which pushes to every player in the club: reading the
     wrong box hands the server the hidden screen's values and silently
     reverts the lead's edit. A mutation that swapped _tsEl back to
     getElementById survived the text assertion and is killed by this. */
  it('collects from the MOUNTED screen when both are in the document', () => {
    const { host, inner, doc } = render({ alsoOnboarding: true });
    const cardPush = doc.querySelector('#ts-card #ts-rem-push');
    const pagePush = host.querySelector('#ts-rem-push');
    assert.ok(cardPush && pagePush, 'the two screens did not both mount');
    assert.notStrictEqual(cardPush, pagePush, 'expected two separate inputs');

    pagePush.value = '7';
    host.querySelector('#ts-rem-lock').value = '2';
    cardPush.value = '9';
    doc.querySelector('#ts-card #ts-rem-lock').value = '8';

    const got = inner.collectReminders();
    assert.strictEqual(got.pushHours, 7,
        'the collector read the hidden onboarding card, not the page');
    assert.strictEqual(got.lockHours, 2, 'the collector read the wrong lock hours');
  });

  /* ⚠ THE BUG THE OWNER REPORTED: one club's kits appearing on another.
     `_refreshTeamSetupKits` reads `typed` out of the DOM and prefers it over
     the stored kits, which is right while the DOM is the SAME club's. Until
     v254 the container was a static node in index.html that nothing emptied,
     so opening the setup screen after a club switch — creating a club as the
     superadmin re-points `_clubConfig` with no reload — found the previous
     club's blocks still there, preferred them, and saved them onto the new
     club. The kits were never the problem: they live in `clubs/{id}.kits`
     and nowhere else, never in localStorage. */
  it('never carries one club\'s kits onto another', () => {
    const { inner } = render();
    const other = Object.assign({}, CLUB, {
      id: 'club2',
      kits: [{ id: 'k9', label: 'Sant Andreu 1a', shirt: '#00ff00', shorts: '#00ff00', socks: '#00ff00' }]
    });
    const got = inner.switchClubKeepingDom(other);
    assert.strictEqual(got.length, 1, 'expected the new club\'s single kit, got ' + got.length);
    assert.strictEqual(got[0].id, 'k9',
        'the previous club\'s kits survived a club switch and would be saved onto this one');
  });

  it('keeps typed kit edits within one club', () => {
    // The other half of the same rule: re-rendering for the SAME club must
    // not throw away what is half-typed, which is why `typed` wins at all.
    const { host, inner } = render();
    const name = host.querySelector('[data-kit-label]');
    name.value = 'a mig escriure';
    const got = inner.switchClubKeepingDom(CLUB);
    assert.strictEqual(got[0].label, 'a mig escriure',
        'a re-render for the same club discarded an unsaved edit');
  });

  /* ⚠ The box shows the LINK, not the pair it parsed to. Until v254 only
     `homeCoords` was stored, so pasting a Maps URL and saving replaced what
     the lead typed with what the app understood — reported as "the link
     reverts to the coordinates". `homeLink` is presentational; `homeCoords`
     is still the only thing the weather sync reads. */
  describe('the ground keeps the link the lead pasted', () => {
    const boxValue = (host) => host.querySelector('#ts-home-coords').value;

    it('shows the stored link rather than the coordinates', () => {
      const club = Object.assign({}, CLUB, {
        homeLink: 'https://www.google.com/maps/place/Camp/@41.3874,2.1686,17z',
        homeCoords: { lat: 41.3874, lon: 2.1686 }
      });
      const { host } = render({ club });
      assert.strictEqual(boxValue(host), club.homeLink,
          'the box replaced the pasted link with the parsed pair');
    });

    it('falls back to the pair for a club configured before homeLink existed', () => {
      const club = Object.assign({}, CLUB, { homeLink: undefined });
      const { host } = render({ club });
      assert.strictEqual(boxValue(host), '41.3874, 2.1686',
          'a club with coordinates but no link shows nothing');
    });

    it('still resolves the hint from the link, not from the stored pair', () => {
      const club = Object.assign({}, CLUB, {
        homeLink: 'https://www.google.com/maps?q=40.4168,-3.7038',
        homeCoords: { lat: 41.3874, lon: 2.1686 }
      });
      const { host } = render({ club });
      assert.ok(/40\.4168, -3\.7038/.test(host.querySelector('#ts-coords-hint').textContent),
          'the green hint is echoing the stored pair rather than reading the box');
    });
  });

  /* The schedule links default to the club's own ground, so a club that set
     it once does not retype it per squad per session. This DEFAULT IS SAVED —
     the collectors read the DOM — so its edges matter more than most. */
  describe('the ground defaulted into the schedule links', () => {
    const linksOf = (host) => Array.from(host.querySelectorAll('[data-train-link], [data-home-link]'))
        .map((el) => el.value);

    it('fills empty links with a tappable Maps link for the ground', () => {
      const { host } = render();
      const links = linksOf(host);
      assert.ok(links.length, 'no link boxes rendered');
      const filled = links.filter((v) => v);
      assert.ok(filled.length, 'no link was defaulted');
      filled.forEach((v) => {
        assert.ok(/^https:\/\/www\.google\.com\/maps\?q=41\.3874,2\.1686$/.test(v),
            'not a tappable Maps link for the club ground: ' + v);
      });
    });

    /* ⚠ Covers BOTH row shapes. The first version checked only a training
       row, and a mutation that overwrote the HOME-GAME link survived it —
       the two are built by different code a hundred lines apart. */
    it('never overwrites a link the club already has', () => {
      const club = JSON.parse(JSON.stringify(CLUB));
      club.schedules['amateur-A'].training[0].link = 'https://maps.app.goo.gl/training';
      club.schedules['amateur-A'].homeGame.link = 'https://maps.app.goo.gl/homegame';
      const { host } = render({ club });
      const links = linksOf(host);
      assert.ok(links.includes('https://maps.app.goo.gl/training'),
          'an existing TRAINING link was replaced by the default');
      assert.ok(links.includes('https://maps.app.goo.gl/homegame'),
          'an existing HOME-GAME link was replaced by the default');
    });

    it('defaults nothing when the club has no ground', () => {
      /* ⚠ `homeCoords: {}`, not `delete` — `render()` merges `over.club` OVER
         the base fixture, so a deleted key is simply refilled from it and the
         test would pass against a club that still had coordinates. `{}` is
         also the exact shape `_collectVenueFromDom` writes to clear them. */
      const club = Object.assign(JSON.parse(JSON.stringify(CLUB)), { homeCoords: {} });
      const { host } = render({ club });
      assert.deepStrictEqual(linksOf(host).filter((v) => v), [],
          'a link was invented for a club with no coordinates');
    });

    /* ⚠ The edge that makes this liveable. A default that comes back every
       time the section re-renders is a box that cannot be emptied — and this
       section re-renders on every category toggle. Rows read from the DOM
       are left exactly as they are. */
    it('does not put the default back after the lead clears it', () => {
      const { host, inner } = render();
      const box = host.querySelector('[data-train-link]');
      box.value = '';
      // A category toggle re-renders the schedules from typed values.
      inner.refreshSchedules();
      const again = host.querySelector('[data-train-link]');
      assert.strictEqual(again.value, '',
          'the cleared link was re-defaulted, so it can never be emptied');
    });
  });

  it('mounts the onboarding card from the same builder as the page', () => {
    assert.ok(bare.includes("_tsSectionsHtml('onboarding')"),
        'the onboarding card no longer shares the section builder');
    assert.ok(bare.includes("_tsSectionsHtml('page'"),
        'the page no longer shares the section builder');
  });

  /* ⚠ The onboarding card is the FORCED entry for a club with no enabled
     category — a brand-new club's lead cannot reach anything else until they
     save here. Its markup moved out of index.html in v254, so it needs a
     test that actually mounts it: if it renders nothing, the club can never
     be configured at all and no other suite would notice. */
  it('still renders a usable onboarding card for a brand-new club', () => {
    const fresh = JSON.parse(JSON.stringify(CLUB));
    Object.keys(fresh.categories).forEach((k) => { fresh.categories[k].enabled = false; });
    fresh.schedules = {}; fresh.fcfLinks = {}; fresh.rosters = {};
    const { doc, errors } = render({ club: fresh, alsoOnboarding: true });
    assert.strictEqual(errors.length, 0, 'errors: ' + errors.join(' | '));
    const card = doc.querySelector('#ts-card');
    assert.ok(card.querySelector('#team-setup-categories'), 'no categories container');
    assert.ok(card.querySelector('#ts-rem-push'), 'no reminder control');
    assert.ok(card.querySelector('#ts-home-coords'), 'no coordinates box');
    assert.ok(card.querySelector('#team-setup-kits-inputs'), 'no kit editor');
    assert.ok(card.querySelector('#btn-save-team-setup'), 'no save button — the gate is a dead end');
    // And no way out: both remaining entries are gates.
    assert.ok(!card.querySelector('#btn-back-team-setup'), 'the forced card has a back button');
  });

  /* index.html used to spell these out. Two copies of every id is two things
     to keep in step with the collectors that read them. */
  it('leaves no second copy of the sections in index.html', () => {
    const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
    ['team-setup-categories', 'team-setup-kits-inputs', 'ts-rem-push', 'ts-home-coords']
        .forEach((id) => {
          assert.ok(!html.includes('id="' + id + '"'),
              'index.html still declares #' + id + ' — there are two of it now');
        });
    assert.ok(html.includes('id="ts-card"'), 'the onboarding mount point is gone');
  });

  it('clears the other screen before mounting, so ids stay unique', () => {
    assert.ok(bare.includes("document.getElementById('dashboard-content')") &&
        /dashContent\.innerHTML = ''/.test(bare),
        'showTeamSetup no longer clears the page before mounting the card');
  });

  /* Switching tab must be a class change. Every panel holds live input, and
     a re-render would throw away everything typed since the last save. */
  it('switches tab without re-rendering the page', () => {
    /* ⚠ Bounded by a marker that survives comment-stripping. The first
       version of this test ended the slice on a `//` comment, which `bare`
       has removed — so the slice ran to the end of the file, found a
       renderPage() belonging to something else, and failed on a bug that was
       not there. */
    const from = bare.indexOf('const cfgPage = document.querySelector');
    const to = bare.indexOf('const newSeasonBtn', from);
    assert.ok(from !== -1 && to !== -1, 'the Configuració binder moved');
    const binder = bare.slice(from, to);
    assert.ok(binder.includes('cfgPage.dataset.cfgActive = id'),
        'the tab switch no longer drives the active panel off the root');
    assert.ok(!/renderPage\(/.test(binder),
        'the tab switch re-renders — unsaved input in the other panels is lost');
  });
});

describe('Configuració — the stylesheet', () => {
  const BANNER = 'CONFIGURACIÓ, redesigned (v254)';
  /* ⚠ BOUNDED AT BOTH ENDS since v255, when `.gu-` was appended after this
     block. An unbounded slice reads the next page's rules as this one's and
     every scan below then fails on a selector Configuració never had — the
     shape that has broken five suites in turn now. If a page is appended
     after `.gu-`, bound THAT block the same way before you add it. */
  const END = 'GESTIÓ D\'USUARIS, redesigned (v255)';
  const start = css.indexOf(BANNER);
  const stop = css.indexOf(END, start);
  assert.ok(start !== -1, 'the cfg- block banner is gone from css/style.css');
  assert.ok(stop !== -1,
      'the gu- block banner that bounds the cfg- slice is gone from css/style.css');
  const block = css.slice(start, stop).replace(/\/\*[\s\S]*?\*\//g, '');

  it('has its own block, at the end of the file', () => {
    assert.ok(start !== -1, 'the cfg- banner is gone from css/style.css');
  });

  /* ⚠ [hidden]{display:none} is a USER-AGENT rule and the author
     `display:flex` on .cfg-nav-list beats it — without this the phone
     section list sits permanently open over the page and the toggle does
     nothing. jsdom does not apply [hidden] at all, so no DOM assertion here
     would have caught it; it was found in a 390px screenshot. */
  it('lets the hidden attribute actually hide the phone section list', () => {
    assert.ok(/\.cfg-nav-list\[hidden\]\s*\{[^}]*display:\s*none/.test(block),
        '.cfg-nav-list[hidden] does not re-assert display:none over the author rule');
  });

  /* Both classes land on the same cell and .cfg-cl-teams is declared later,
     so without an explicit rule the over-quota count stays grey — the one
     cell on that table whose colour carries information. */
  it('keeps the over-quota team count red against the later rule', () => {
    assert.ok(/\.cfg-cl-teams\.cfg-bad\s*\{[^}]*#BD162C/i.test(block),
        'the over-quota team count is overridden back to grey');
  });

  it('drops the rail on the superadmin clubs tab', () => {
    assert.ok(/\[data-cfg-active="clubs"\]\s+\.cfg-rail\s*\{[^}]*display:\s*none/.test(block),
        'the rail still steals width from the ten-column clubs table');
  });

  it('shows one panel at a time, off the root', () => {
    assert.ok(/\.cfg-panel\s*\{[^}]*display:\s*none/.test(block),
        'panels are not hidden by default');
    ['club', 'cats', 'horaris', 'kits', 'llistes', 'temporades', 'clubs'].forEach((p) => {
      assert.ok(block.includes('[data-cfg-active="' + p + '"]'),
          'no rule reveals the ' + p + ' panel');
    });
  });

  it('scrolls the clubs table inside its own wrapper', () => {
    assert.ok(/\.cfg-cl-wrap\s*\{[^}]*overflow-x:\s*auto/.test(block),
        'a ten-column table would scroll the whole page sideways');
  });

  it('sizes the create-club inputs from their grid cell', () => {
    assert.ok(/\.cfg-newclub-grid\s+\.reg-input\s*\{[^}]*width:\s*100%/.test(block),
        'the create-club boxes fall back to a content width and clip');
  });

  /* A new paper page JOINS the shared lists rather than redeclaring them. */
  it('joins the shared bleed, band and body lists', () => {
    const shared = css.slice(0, start);
    assert.ok(/\.cfg-page,\n\.cal-page \{\s*\n\s*margin: -1rem -2rem -2rem;/.test(shared) ||
        shared.includes('.cfg-page,'), '.cfg-page is not in the dashboard-bleed list');
    assert.ok(shared.includes('.cfg-hero'), '.cfg-hero is not in the shared band list');
    assert.ok(shared.includes('.cfg-h1'), '.cfg-h1 is not in the shared 36px title list');
    assert.ok(shared.includes('.cfg-body'), '.cfg-body is not in the shared body-inset list');
  });

  it('does not redeclare the band in its own block', () => {
    assert.ok(!/\.cfg-hero\s*\{/.test(block),
        '.cfg-hero is declared locally as well as joining the shared list');
  });

  /* ── The re-dress ────────────────────────────────────────────────
     The sections are the team-setup builders, written for the app's CHROME:
     pill toggles, 50%-radius chips, grey rounded cards, --primary red. The
     first cut of this page wrapped them without re-dressing them, so the
     frame was paper and the contents were not. These pin the override.
     ⚠ Every one is scoped under `.cfg-page`: the same classes dress the
     onboarding card, which is an auth card and must keep the chrome look. */
  it('squares off every reused control', () => {
    [['.cfg-page .ts-cat-toggle .slider', 'the category toggle is a pill again'],
      ['.cfg-page .ts-letter-chip', 'the letter chips are circles again'],
      ['.cfg-page .ts-kit-block', 'the kit editor is a rounded card again'],
      ['.cfg-page .tb-color-pick', 'the colour swatches are circles again']].forEach(([sel, why]) => {
      const i = block.indexOf(sel);
      assert.ok(i !== -1, 'no rule for ' + sel);
      assert.ok(/border-radius:\s*0/.test(block.slice(i, block.indexOf('}', i))), why);
    });
  });

  it('scopes every re-dress under the page root', () => {
    /* A rule that borrows another page's class family and is NOT scoped
       repaints every other surface that uses it — the tactics board's colour
       picker, the onboarding card, the roster chips. */
    const redress = block.slice(block.indexOf('RE-DRESSING THE REUSED SECTIONS'));
    const unscoped = (redress.match(/^\.(ts|tb|reg)-[\w-]+[^{]*\{/gm) || []);
    assert.deepStrictEqual(unscoped, [],
        'a borrowed class is restyled globally: ' + unscoped.join(', '));
  });

  it('drops the reused sections onto the paper palette', () => {
    const redress = block.slice(block.indexOf('RE-DRESSING THE REUSED SECTIONS'));
    ['var(--primary)', 'var(--border)', 'var(--card)', 'var(--bg)'].forEach((tok) => {
      assert.ok(!redress.includes(tok),
          'the re-dress still reaches for the chrome palette: ' + tok);
    });
  });

  it('shows the add-team label on the page and hides it on the card', () => {
    // One markup, two dressings — the card's control is a 30px circle.
    assert.ok(/\.cfg-page .ts-letter-add .ts-letter-add-l\s*\{[^}]*display:\s*inline/.test(block),
        'the "+ Equip" label is hidden on the page');
    assert.ok(/\.ts-letter-add .ts-letter-add-l\s*\{\s*display:\s*none/.test(css),
        'the label is not hidden on the onboarding card, where it bursts the button');
  });

  it('draws an arrow back onto the selects it strips', () => {
    // appearance:none removes the native arrow; a select that looks like a
    // text box reads as one that will not accept typing.
    const i = block.indexOf('.cfg-page .ts-sched-row select');
    assert.ok(i !== -1 && /background-image:\s*linear-gradient/.test(block.slice(i, i + 600)),
        'the selects lost their arrow along with their chrome');
  });

  it('swaps the tab strip for the phone switcher at the breakpoint', () => {
    const phone = block.slice(block.indexOf('@media (max-width: 700px)'));
    assert.ok(/\.cfg-tabs\s*\{\s*display:\s*none/.test(phone), 'the desktop strip survives on a phone');
    assert.ok(/\.cfg-nav\s*\{\s*display:\s*block/.test(phone), 'the phone switcher never appears');
  });
});

describe('Configuració — the copy', () => {
  it('has ca, es and en for every cfg.* key', () => {
    const keys = [...appSrc.matchAll(/'(cfg\.[a-z_0-9]+)':\s*\{([\s\S]{0,400}?)\},?\n/g)];
    assert.ok(keys.length > 40, 'the cfg.* table did not parse: ' + keys.length);
    keys.forEach(([, key, body]) => {
      ['ca:', 'es:', 'en:'].forEach((lang) => {
        assert.ok(body.includes(lang), key + ' is missing ' + lang.slice(0, 2));
      });
    });
  });

  it('uses every cfg.* key it defines, and defines every one it uses', () => {
    const used = new Set([...appSrc.matchAll(/t\('(cfg\.[a-z_0-9]+)'\)/g)].map((m) => m[1]));
    const defined = new Set([...appSrc.matchAll(/'(cfg\.[a-z_0-9]+)':/g)].map((m) => m[1]));
    const missing = [...used].filter((k) => !defined.has(k));
    const unused = [...defined].filter((k) => !used.has(k));
    assert.deepStrictEqual(missing, [], 'used but not defined — t() ships the raw key: ' + missing);
    assert.deepStrictEqual(unused, [], 'defined but never used: ' + unused);
  });

  /* ⚠ The design handoff promised "Desactivar una categoria no esborra res:
     les dades queden guardades i tornen si la reactives." That is FALSE.
     rosterKeysOf() skips a disabled category, so unticking one is a REMOVAL,
     and setClubCategories refuses removals — a dropped letter orphans its
     matches, medical history and roster doc while joinClub keeps registering
     people onto it. The copy has to say what actually happens. */
  it('does not promise that disabling a category keeps its data', () => {
    const foot = CA['cfg.cats_foot'] || '';
    assert.ok(foot, 'the categories footnote is gone');
    assert.ok(/esborra/.test(foot),
        'the footnote does not say the data goes: ' + foot);
    assert.ok(!/no esborra res|queden guardades/.test(foot),
        'the footnote still promises the data survives: ' + foot);
  });

  it('reuses the existing settings.* strings rather than restating them', () => {
    ['settings.loading', 'settings.no_clubs', 'settings.error_loading',
      'settings.cat_no_club', 'settings.club_name'].forEach((k) => {
      assert.ok(appSrc.includes("t('" + k + "')"),
          k + ' is defined but no longer used — it was a dead key before v254');
    });
  });
});
