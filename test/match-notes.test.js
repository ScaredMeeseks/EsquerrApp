/* Coach match notes — the pure helpers, and the guards on how they are stored.
 *
 * The behavioural security assertions live in rules.test.js, against the real
 * emulator ("a PLAYER of the same club and category cannot read a note"). What
 * is left here is the shape of the thing and the two ways a future change
 * could quietly undo it:
 *
 *   1. widening the matchNotes rule to `sameTeam`, which is one word and
 *      hands the coach's preparation to every player in the category;
 *   2. moving the notes into the localStorage sync layer, which does the same
 *      thing by a different route — the data/{key} read rule is scoped by
 *      CATEGORY, not by role.
 *
 * Both are cheap to assert and neither is obvious to a reviewer, so they are
 * asserted rather than commented.
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const MN = require(path.join(__dirname, '..', 'js', 'match-notes.js'));
const root = path.join(__dirname, '..');
const rules = fs.readFileSync(path.join(root, 'firestore.rules'), 'utf8');
const dbSrc = fs.readFileSync(path.join(root, 'js', 'db.js'), 'utf8');
const shardSrc = fs.readFileSync(path.join(root, 'js', 'shard.js'), 'utf8');
const appSrc = fs.readFileSync(path.join(root, 'js', 'app.js'), 'utf8');
const indexHtml = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const swSrc = fs.readFileSync(path.join(root, 'sw.js'), 'utf8');

/** The body of one `match /<name>/{...} { ... }` block, brace-counted. */
function ruleBlock(src, header) {
  const at = src.indexOf(header);
  assert.notStrictEqual(at, -1, 'no rule block found for: ' + header);
  /* Past the header's own {wildcard}, or the brace counter latches onto that
     and returns the string "{matchId}" — a block that passes every "must not
     contain" assertion and checks nothing at all. */
  let i = src.indexOf('{', at + header.length);
  let depth = 0;
  for (let j = i; j < src.length; j++) {
    if (src[j] === '{') depth++;
    else if (src[j] === '}' && --depth === 0) return src.slice(i, j + 1);
  }
  throw new Error('unterminated rule block: ' + header);
}

describe('MN.keyOf — a match id is a number, a doc id is not', () => {
  it('stringifies', () => {
    assert.strictEqual(MN.keyOf(1700000000000), '1700000000000');
    assert.strictEqual(typeof MN.keyOf(1), 'string');
  });
});

describe('MN.blank', () => {
  const m = {id: 1700000000000, category: 'amateur', team: 'A'};

  it('carries the CATEGORY — the field the rule tests', () => {
    // A note written without it is unreadable by everyone, its author
    // included, because the rule and the listener query both key on it.
    assert.strictEqual(MN.blank(m).category, 'amateur');
  });

  it('starts empty in every slot', () => {
    const b = MN.blank(m);
    // Over PHASES, so a fourth phase cannot be added and left unblanked.
    MN.PHASES.forEach((p) => {
      assert.ok(b[p], p + ' has no slot in a blank note');
      assert.strictEqual(b[p].text, '', p + ' does not start empty');
    });
    assert.deepStrictEqual(b.videos, []);
    assert.deepStrictEqual(b.boards, []);
    assert.strictEqual(b.firstLegId, null);
    assert.strictEqual(b.legDismissed, false);
  });

  it('survives a match with nothing on it', () => {
    const b = MN.blank(null);
    assert.strictEqual(b.category, '');
    assert.deepStrictEqual(b.videos, []);
  });
});

/* The three phases (v213).
 *
 * The match-detail redesign's notes block is PLA / DURANT EL PARTIT /
 * DESPRÉS, where this module had two phases and both writers spelled the
 * test inline as `phase === 'post' ? 'post' : 'pre'` — which is a way of
 * saying "anything I do not recognise is the plan", and would have filed
 * every DURANT EL PARTIT note under PLA without erroring.
 *
 * ⚠ No backfill and no rules change: firestore.rules does not whitelist
 * fields on matchNotes, and a document written before v213 simply has no
 * `live` key, which every reader already treats as an empty phase.
 */
describe('MN.PHASES / phaseKey — three phases, one list', () => {
  it('is the match in order: plan, during, after', () => {
    assert.deepStrictEqual(MN.PHASES, ['pre', 'live', 'post']);
  });

  it('passes each known phase through untouched', () => {
    MN.PHASES.forEach((p) => assert.strictEqual(MN.phaseKey(p), p));
  });

  it('falls back to the PLAN, not to the debrief', () => {
    /* The default matters: a note filed against a phase this version does
       not know is far likelier to be preparation than a verdict. */
    ['', null, undefined, 'nonsense', 'during', 0].forEach((v) => {
      assert.strictEqual(MN.phaseKey(v), 'pre', JSON.stringify(v));
    });
  });

  it('a video is filed under a known phase or under the plan', () => {
    // saveVideos coerces through the same helper, so a video cannot end up
    // in a phase the editor has no column for.
    assert.strictEqual(MN.phaseKey('live'), 'live');
    assert.strictEqual(MN.phaseKey('halftime'), 'pre');
  });

  it('isEmpty counts text in ANY phase, including live', () => {
    /* isEmpty decides whether the document is worth writing at all, so a
       phase it does not know about is a note that silently never saves. */
    const m = {id: 1, category: 'amateur', team: 'A'};
    MN.PHASES.forEach((p) => {
      const n = MN.blank(m);
      n[p] = {text: 'x'};
      assert.strictEqual(MN.isEmpty(n), false,
          'text in ' + p + ' must make the note worth writing');
    });
  });
});

describe('MN.isEmpty', () => {
  const m = {id: 1, category: 'amateur', team: 'A'};

  it('a fresh note is empty', () => {
    assert.strictEqual(MN.isEmpty(MN.blank(m)), true);
    assert.strictEqual(MN.isEmpty(null), true);
  });

  it('a DECLINED leg suggestion is not empty', () => {
    // legDismissed is the whole reason that field exists: without it, an
    // unanswered suggestion and a declined one are the same state and the
    // banner comes back for ever. So it has to count as content.
    const n = Object.assign(MN.blank(m), {legDismissed: true});
    assert.strictEqual(MN.isEmpty(n), false);
  });

  it('any one filled slot is enough', () => {
    [{pre: {text: 'x'}}, {post: {text: 'x'}}, {videos: [{url: 'u'}]},
      {boards: [{boardId: 'b'}]}, {firstLegId: '99'}].forEach((patch) => {
      const n = Object.assign(MN.blank(m), patch);
      assert.strictEqual(MN.isEmpty(n), false, JSON.stringify(patch));
    });
  });
});

/* MN.save against a fake Firestore.
 *
 * `db` and `auth` are read at CALL time, never at load time, so a global
 * stub is enough to drive the real code — no emulator, no browser. */
describe('MN.save — the cache is updated before the write, not after', () => {
  const m = {id: 1700000000000, category: 'amateur', team: 'A'};
  let settle;   // resolve/reject of the in-flight set()
  let sent;

  beforeEach(async () => {
    sent = [];
    const docStub = {
      set: (data) => {
        sent.push(data);
        return new Promise((res, rej) => { settle = {res, rej}; });
      },
    };
    global.db = {collection: () => ({doc: () => ({collection: () => ({
      doc: () => docStub,
      where: () => ({onSnapshot: (cb) => { cb({docChanges: () => []}); return () => {}; }}),
    })})})};
    global.auth = {currentUser: {
      uid: 'coach1',
      getIdTokenResult: async () => ({claims: {role: 'staff', cats: ['amateur']}}),
    }};
    MN.cleanup();
    await MN.init('teamA');
  });

  afterEach(() => { MN.cleanup(); delete global.db; delete global.auth; });

  it('MN.get sees the new text immediately, before the server acks', () => {
    const p = MN.saveText(m, 'pre', 'press their number 6');
    /* THE assertion. A blur fires before the click that follows it, so
       "type a note, then press + Add video" saves and re-renders in that
       order — and with offline persistence on, set() resolves only on a
       SERVER ack. Read the cache after the ack and the re-render shows the
       old text: saved, but apparently lost. */
    assert.strictEqual(MN.get(m.id).pre.text, 'press their number 6');
    settle.res();
    return p;
  });

  it('every write carries matchId, category and team', () => {
    // The CREATE arm of the rule tests request.resource.data.category, which
    // a bare {pre:{…}} patch does not have — so merge:true is not enough.
    const p = MN.saveText(m, 'pre', 'x');
    assert.strictEqual(sent[0].category, 'amateur');
    assert.strictEqual(sent[0].matchId, '1700000000000');
    assert.strictEqual(sent[0].team, 'A');
    settle.res();
    return p;
  });

  it('writes the phase map WHOLE, because merge deep-merges maps', () => {
    const p = MN.saveText(m, 'pre', 'x');
    assert.deepStrictEqual(Object.keys(sent[0].pre).sort(),
        ['text', 'updatedAt', 'updatedBy']);
    assert.strictEqual(sent[0].pre.updatedBy, 'coach1');
    settle.res();
    return p;
  });

  it('rolls the cache back when the write is REFUSED', async () => {
    const p = MN.saveText(m, 'pre', 'never lands');
    assert.strictEqual(MN.get(m.id).pre.text, 'never lands');
    settle.rej(new Error('permission-denied'));
    await assert.rejects(p);
    // Back to nothing: the note never existed before this write.
    assert.strictEqual(MN.get(m.id), null);
  });

  it('a refusal does not undo a LATER write that succeeded', async () => {
    const first = MN.saveText(m, 'pre', 'doomed');
    const doomed = settle;
    const second = MN.saveText(m, 'pre', 'landed');
    settle.res();
    await second;
    doomed.rej(new Error('permission-denied'));
    await assert.rejects(first);
    assert.strictEqual(MN.get(m.id).pre.text, 'landed');
  });

  it('refuses a match with no category rather than writing a dark document', async () => {
    await assert.rejects(MN.saveText({id: 1, category: '', team: 'A'}, 'pre', 'x'),
        /no category/);
    assert.strictEqual(sent.length, 0);
  });

  it('linkFirstLeg and dismissLeg are mutually exclusive', () => {
    const p = MN.linkFirstLeg(m, 998);
    assert.strictEqual(sent[0].firstLegId, '998');
    assert.strictEqual(sent[0].legDismissed, false);
    settle.res();
    const q = MN.dismissLeg(m);
    assert.strictEqual(sent[1].firstLegId, null);
    assert.strictEqual(sent[1].legDismissed, true);
    settle.res();
    return Promise.all([p, q]);
  });

  it('a PLAYER session opens no listener at all', async () => {
    MN.cleanup();
    global.auth.currentUser.getIdTokenResult =
      async () => ({claims: {role: 'player', cats: ['amateur']}});
    let watched = false;
    global.db = {collection: () => ({doc: () => ({collection: () => ({
      where: () => ({onSnapshot: () => { watched = true; return () => {}; }}),
    })})})};
    await MN.init('teamA');
    assert.strictEqual(watched, false,
        'a player must never open the matchNotes listener');
  });
});

/* safeHttpUrl + the one handler both video render sites feed.
 *
 * sanitize() and this solve DIFFERENT problems, which is why having the
 * first was not enough: sanitize() escapes < > & " so a string cannot break
 * out of the attribute it is written into. `javascript:fetch(…)` contains
 * none of those characters, so it passes through untouched — and
 * `dataset.videoUrl` decodes the escaping back to the original string
 * anyway. window.open() on it does not navigate: it RUNS the code, on our
 * origin, in the viewer's signed-in session.
 */
describe('safeHttpUrl', () => {
  const U2 = require(path.join(root, 'js', 'utils.js'));

  it('accepts http and https, and preserves the URL', () => {
    assert.strictEqual(U2.safeHttpUrl('https://youtu.be/abc'), 'https://youtu.be/abc');
    assert.strictEqual(U2.safeHttpUrl('http://x.test/v?a=1&b=2'), 'http://x.test/v?a=1&b=2');
    assert.strictEqual(U2.safeHttpUrl('HTTPS://X.TEST/v'), 'HTTPS://X.TEST/v');
    assert.strictEqual(U2.safeHttpUrl('  https://x.test/v  '), 'https://x.test/v');
  });

  it('refuses every scheme that executes', () => {
    ['javascript:alert(1)',
      'JaVaScRiPt:alert(1)',
      ' javascript:alert(1)',
      'data:text/html,<script>alert(1)</script>',
      'vbscript:msgbox(1)',
      'blob:https://x.test/abc',
      'file:///etc/passwd',
      // No scheme at all: window.open() would resolve it against OUR origin.
      '//evil.test/x',
      '/relative',
      'youtu.be/abc',
    ].forEach((u) => {
      assert.strictEqual(U2.safeHttpUrl(u), '', 'accepted: ' + u);
    });
  });

  it('is total — null, undefined and a number do not throw', () => {
    [null, undefined, 0, 42, {}].forEach((v) => {
      assert.strictEqual(typeof U2.safeHttpUrl(v), 'string');
    });
  });
});

describe('the video click handler is the guard, not the render site', () => {
  /* Source-level, because the handler lives inside bindDynamicActions and
     cannot be sliced out on its own. Weak as a behaviour test; strong as a
     tripwire — deleting the check is what this has to catch. */
  const handler = (() => {
    const at = appSrc.indexOf(".detail-video-link'");
    assert.notStrictEqual(at, -1, 'video link handler not found');
    return appSrc.slice(at, appSrc.indexOf('window.open(url', at));
  })();

  it('checks the scheme BEFORE window.open', () => {
    assert.ok(/safeHttpUrl\(url\)/.test(handler),
        'the handler must refuse a non-http(s) URL before opening it');
  });

  it('and both render sites go through that handler', () => {
    // The convocatòria's links and the coach's notes. If a third render site
    // appears with its own class, this count is what notices.
    const sites = (appSrc.match(/class="detail-video-link"/g) || []).length;
    assert.strictEqual(sites, 2,
        'a video render site was added or removed — does it use the same handler?');
  });
});

/* The call-up banner on the match page.
 *
 * Source-level: the banner is built inside renderMatchDetail, which cannot
 * be sliced out on its own. What matters is the CONDITION, and it is a
 * one-line thing that is easy to "simplify" back into a bug.
 */
describe('the call-up banner is for players, not for staff', () => {
  /* v212 moved the banner. It was `.detail-conv`, built into a `let convHtml`
     above the hero; it is now the `.pt-you` strip under the scoreboard, built
     inline in the return. The CONDITION is what these tests are about and it
     did not change — but both of them named the old shape, and one of them
     sliced between two markers that no longer exist, which made
     `slice(-1, -1)` return '' and the assertion pass against nothing. Anchored
     on the strip itself now, so a slice that finds nothing fails loudly. */
  const at = appSrc.indexOf("'<div class=\"pt-you'");
  const block = appSrc.slice(Math.max(0, at - 400), at + 600);

  it('is gated on having the PLAYER role', () => {
    /* It used to render for anyone the convocatòria had been sent for,
       which meant every coach opening any match was told "No convocat" —
       an answer to a question he had not asked, since a coach is never on
       his own call-up list. */
    assert.notStrictEqual(at, -1, 'the .pt-you strip was not found at all');
    assert.ok(/convSent && isPlayerViewer/.test(block),
        'the call-up banner is no longer gated on the player role');
    assert.ok(/const isPlayerViewer = \(session\.roles \|\| \[\]\)\.includes\('player'\)/
        .test(appSrc), 'isPlayerViewer is not derived from the session roles');
  });

  it('is NOT gated on "not staff" — a playing coach is both', () => {
    // For him "am I called up?" is a real question with a real answer.
    assert.notStrictEqual(at, -1, 'the .pt-you strip was not found at all');
    assert.ok(!/!\s*showNotes/.test(block) && !/!\s*isStaff/.test(block),
        'the banner is gated on NOT being staff, which also hides it from ' +
        'a playing coach');
  });
});

/* The scoreline fitter.
 *
 * It cannot be tested here: it needs real layout, and jsdom has none —
 * offsetWidth is always 0, so every assertion would pass against a function
 * that does nothing. What IS worth pinning is the two ways it goes silently
 * dead, both of which are visible in the source.
 */
describe('fitMnScoreNames — wiring and the measurement trap', () => {
  const fn = (() => {
    const at = appSrc.indexOf('function fitMnScoreNames');
    assert.notStrictEqual(at, -1, 'fitMnScoreNames is gone');
    return appSrc.slice(at, appSrc.indexOf('\n  }', at));
  })();

  it('is called from the post-layout rAF pass', () => {
    // Called before layout, every measurement is 0 and it does nothing.
    const raf = appSrc.slice(appSrc.indexOf('requestAnimationFrame(() => requestAnimationFrame'));
    assert.ok(raf.slice(0, 300).includes('fitMnScoreNames()'),
        'the fitter is no longer run after layout');
  });

  it('re-runs on resize — what fits on one line changes with the window', () => {
    assert.ok(/addEventListener\('resize'[\s\S]{0,220}fitMnScoreNames/.test(appSrc),
        'no resize handler for the scoreline');
  });

  it('does NOT measure with scrollWidth', () => {
    /* THE trap. The container is justify-content:center, and a centred flex
       container overflows symmetrically: the left overflow is not
       scrollable, so scrollWidth can equal clientWidth while the content
       plainly does not fit. A fitter built on it never shrinks anything and
       looks fine in every test. */
    assert.ok(!/scrollWidth/.test(fn),
        'the fitter is measuring scrollWidth on a centred flex container');
    assert.ok(/_mnScoreNeed\(el\)/.test(fn), 'not measuring the children');
  });

  it('has a floor, so a very long name cannot loop it to nothing', () => {
    assert.ok(/size > MIN/.test(fn), 'no minimum font size');
  });

  it('takes its starting size from the STYLESHEET, not a copy of its own', () => {
    /* The header row and the club names are meant to read as one size. A
       maximum hardcoded here would be a second copy of that number in
       another file, and the drift would be silent — the names would simply
       stop matching the title one day. */
    assert.ok(/el\.style\.fontSize = '';/.test(fn),
        'the fitter does not reset to the stylesheet size first');
    assert.ok(/getComputedStyle\(el\)\.fontSize/.test(fn),
        'the fitter does not read its starting size from the stylesheet');
    assert.ok(!/MAX/.test(fn), 'the fitter carries its own maximum again');
  });
});

describe('the briefing has ONE definition of its title size', () => {
  const css = fs.readFileSync(path.join(root, 'css', 'style.css'), 'utf8');

  it('both the header and the club names read --mn-title-size', () => {
    assert.ok(/--mn-title-size:\s*[\d.]+rem/.test(css), 'the token is not defined');
    const users = [...css.matchAll(/([\w.-]+)\s*\{[^}]*font-size:var\(--mn-title-size\)/g)]
        .map((m) => m[1]);
    assert.ok(css.includes('.mn-sb {'), 'the scoreline rule is gone');
    assert.strictEqual(
        (css.match(/font-size:var\(--mn-title-size\)/g) || []).length, 2,
        'expected exactly the header and the scoreline to use it: ' + users);
  });
});

describe('boards use the space they are given', () => {
  const css = fs.readFileSync(path.join(root, 'css', 'style.css'), 'utf8');

  it('are wrapped in a grid, not stacked down one column', () => {
    assert.ok(/'<div class="mn-boards">'/.test(appSrc),
        'boards are not wrapped for the grid');
    assert.ok(/\.mn-boards\s*\{[^}]*grid-template-columns:repeat\(auto-fit/.test(css),
        'the board grid is not auto-fit');
  });

  it('auto-fit, so a LONE board still spans the full width', () => {
    // It is the widest thing in the briefing and needs the room; auto-fit
    // collapses the empty track, auto-fill would leave it holding space.
    assert.ok(!/\.mn-boards\s*\{[^}]*auto-fill/.test(css),
        'auto-fill would strand a single board in half the width');
  });
});

describe('the notes are STAFF-only, and stay that way', () => {
  const live = ruleBlock(rules, 'match /matchNotes/{matchId}');
  const archived = ruleBlock(rules, 'match /matchNotes/{docId}');

  it('the live rule never grants plain club membership', () => {
    // `sameTeam` is every member of the club, players included. One word
    // here is the whole difference between staff-only and squad-wide.
    assert.ok(!/sameTeam\s*\(/.test(live),
        'matchNotes must not be readable by sameTeam()');
  });

  it('the ARCHIVED rule does not either — archiving is not declassification', () => {
    assert.ok(!/sameTeam\s*\(/.test(archived),
        'archived matchNotes must not be readable by sameTeam()');
  });

  it('both are gated on isStaffOf AND the cats claim', () => {
    [['live', live], ['archived', archived]].forEach(([label, block]) => {
      assert.ok(/isStaffOf\s*\(\s*teamId\s*\)/.test(block), label + ': no isStaffOf');
      assert.ok(/'cats' in request\.auth\.token/.test(block), label + ': no cats guard');
      assert.ok(/category in request\.auth\.token\.cats/.test(block),
          label + ': not category-scoped');
    });
  });

  it('the archived copy is written by nobody but the superuser', () => {
    assert.ok(/allow write: if isSuperUser\(\);/.test(archived));
  });

  it('the category is immutable on update', () => {
    // Otherwise a note could be walked from one squad's compartment into
    // another's one write at a time.
    assert.ok(
        /request\.resource\.data\.category == resource\.data\.category/.test(live),
        'matchNotes update must pin the category');
  });
});

describe('the notes stay OUT of the localStorage sync layer', () => {
  /* This is the second way to undo the rule above, and it looks like an
     ordinary refactor: add a key, get sync and offline for free — and hand
     the notes to every player in the category, because the data/{key} read
     rule is scoped by category and not by role. */
  it('no synced key and no shard route mentions match notes', () => {
    assert.ok(!/fa_match_notes/.test(dbSrc), 'js/db.js must not sync match notes');
    assert.ok(!/fa_match_notes/.test(shardSrc), 'js/shard.js must not route match notes');
    assert.ok(!/fa_match_notes/.test(appSrc), 'js/app.js must not read a match-notes blob');
  });

  it('MN is the only way in, and it talks to matchNotes directly', () => {
    const src = fs.readFileSync(path.join(root, 'js', 'match-notes.js'), 'utf8');
    assert.ok(/collection\(COL\)/.test(src));
    assert.ok(/var COL = 'matchNotes'/.test(src));
    // Comments stripped: the header explains at length why localStorage is
    // NOT used, and a bare substring search would fail on the explanation.
    const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
    assert.ok(!/localStorage\s*\./.test(code),
        'MN must not mirror notes into localStorage — that is the leak');
  });
});

describe('the file is actually shipped', () => {
  it('index.html loads it, after db.js and before app.js', () => {
    const order = ['js/db.js', 'js/match-notes.js', 'js/app.js']
        .map((f) => indexHtml.indexOf('src="' + f + '"'));
    order.forEach((i, n) => assert.notStrictEqual(i, -1, 'not in index.html: ' + n));
    assert.ok(order[0] < order[1] && order[1] < order[2],
        'js/match-notes.js must load between db.js and app.js');
  });

  it('the service worker pre-caches it', () => {
    // A new file missing from STATIC_ASSETS is the classic half-shipped
    // release: online it works, offline the app is broken.
    assert.ok(swSrc.includes("'./js/match-notes.js'"),
        'js/match-notes.js missing from STATIC_ASSETS');
  });
});
