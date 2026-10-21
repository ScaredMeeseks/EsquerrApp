/* The profile photo, and the 2 MB landmine under it (v232).
 *
 * ⚠ WHAT THIS SUITE IS FOR.
 *
 * `profilePic` is normally a Firebase Storage download URL — about 200 bytes.
 * Until v232 a FAILED upload fell back to reading the whole file back as a
 * `data:` URI (up to 2 MB, ~2.7 MB once base64 expands it) and persisting
 * THAT: into `users/{uid}`, and into `fa_users`.
 *
 * `fa_users` is a synced blob mirrored into `teams/{id}/data/fa_users__{cat}`,
 * and a Firestore document is capped at 1 MB. So one player's failed upload
 * could push that shard over the limit and stop `fa_users` syncing for the
 * WHOLE CLUB — every roster, medical and convocatòria surface reads it. The
 * symptom (a squad that quietly stops updating) looks nothing like the cause
 * (somebody's photo failed to upload weeks earlier), which is what makes it
 * worth a suite of its own rather than a line in another one.
 *
 * `npm run test:pic`, or as part of test:unit.
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const src = fs.readFileSync(path.join(__dirname, '..', 'js', 'app.js'), 'utf8');

function grab(from, to) {
  const i = src.indexOf(from);
  const j = src.indexOf(to, i);
  assert.ok(i !== -1 && j !== -1, 'marker not found in js/app.js: ' + from);
  return src.slice(i, j);
}

/** The real guard, run over a fake localStorage. */
function load() {
  const store = {};
  const localStorage = {
    getItem: (k) => (k in store ? store[k] : null),
    setItem: (k, v) => { store[k] = v; }
  };
  const warnings = [];
  /* invalidateUsersCache is declared just above the slice and is a one-line
     cache reset — stubbed rather than widening the slice, because what is
     under test is what reaches localStorage. */
  let invalidated = 0;
  const api = new Function('localStorage', 'JSON', 'console', 'window',
      'invalidateUsersCache',
      grab('  const MAX_PIC_SRC =', '  // localDateStr → utils.js') +
      '\nreturn {saveUsers, stripHeavyPics, MAX_PIC_SRC};')(
      localStorage, JSON, {warn: (m) => warnings.push(m)}, {},
      () => { invalidated++; });
  return Object.assign(api, {
    store,
    warnings,
    readBack: () => JSON.parse(store.fa_users || '[]')
  });
}

const URL_PIC = 'https://firebasestorage.googleapis.com/v0/b/esquerrapp.appspot.com/o/' +
  'profilePics%2FuidAbc.jpg?alt=media&token=2f0c1a44-1f0e-4a0e-9a0e-1f0e4a0e9a0e';
const DATA_PIC = 'data:image/jpeg;base64,' + 'A'.repeat(400000); // ~400 KB of base64

describe('stripHeavyPics — nothing inline reaches fa_users', () => {
  it('drops a data: URI', () => {
    const api = load();
    const out = api.stripHeavyPics([{id: 'u1', name: 'Marc', profilePic: DATA_PIC}]);
    assert.strictEqual(out[0].profilePic, '');
  });

  it('keeps a real Storage URL, token and all', () => {
    /* The token query string makes these longer than a bare URL, and an
       over-tight cap would silently blank every photo in the club. */
    const api = load();
    const out = api.stripHeavyPics([{id: 'u1', name: 'Marc', profilePic: URL_PIC}]);
    assert.strictEqual(out[0].profilePic, URL_PIC);
    assert.ok(URL_PIC.length < api.MAX_PIC_SRC,
        'a genuine Storage URL is ' + URL_PIC.length + ' chars, cap is ' + api.MAX_PIC_SRC);
  });

  it('touches nothing else on the row it repairs', () => {
    const api = load();
    const row = {id: 'u1', name: 'Marc', email: 'm@x.com', playerNumber: '8',
      position: 'DM', roles: ['player'], profilePic: DATA_PIC};
    const out = api.stripHeavyPics([row])[0];
    assert.strictEqual(out.name, 'Marc');
    assert.strictEqual(out.playerNumber, '8');
    assert.deepStrictEqual(out.roles, ['player']);
  });

  it('leaves every OTHER member alone', () => {
    /* This blob is club-wide and written whole. A guard that rebuilt rows it
       had no business touching would be the same class of bug it exists to
       prevent. */
    const api = load();
    const out = api.stripHeavyPics([
      {id: 'u1', profilePic: URL_PIC},
      {id: 'u2', profilePic: DATA_PIC},
      {id: 'u3', profilePic: ''}
    ]);
    assert.strictEqual(out[0].profilePic, URL_PIC);
    assert.strictEqual(out[1].profilePic, '');
    assert.strictEqual(out[2].profilePic, '');
  });

  it('returns the SAME array when there is nothing to repair', () => {
    // The common case by far; it must not churn objects on every render.
    const api = load();
    const rows = [{id: 'u1', profilePic: URL_PIC}];
    assert.strictEqual(api.stripHeavyPics(rows), rows);
  });

  it('says so, rather than repairing in silence', () => {
    const api = load();
    api.stripHeavyPics([{id: 'u1', profilePic: DATA_PIC}]);
    assert.strictEqual(api.warnings.length, 1, 'a silent repair hides the cause');
    assert.ok(/profilePic/.test(api.warnings[0]), api.warnings[0]);
  });

  it('survives a row with no profilePic at all', () => {
    const api = load();
    assert.doesNotThrow(() => api.stripHeavyPics([{id: 'u1'}, null, {id: 'u2', profilePic: null}]));
  });
});

describe('saveUsers — the single funnel into the synced blob', () => {
  it('applies the guard on the way through', () => {
    /* Asserted through saveUsers, not stripHeavyPics: the guard being
       correct is worth nothing if the writer does not call it. */
    const api = load();
    api.saveUsers([{id: 'u1', name: 'Marc', profilePic: DATA_PIC}]);
    assert.strictEqual(api.readBack()[0].profilePic, '');
    assert.ok(api.store.fa_users.length < 1000,
        'the blob still carries the base64: ' + api.store.fa_users.length + ' chars');
  });

  it('a whole squad of failed uploads still fits well inside the 1 MB cap', () => {
    // The actual failure being prevented, stated as the number that broke.
    const api = load();
    const squad = [];
    for (let i = 0; i < 25; i++) {
      squad.push({id: 'u' + i, name: 'Player ' + i, email: 'p' + i + '@x.com',
        profilePic: DATA_PIC});
    }
    api.saveUsers(squad);
    const bytes = api.store.fa_users.length;
    assert.ok(bytes < 100 * 1024,
        'fa_users would be ' + Math.round(bytes / 1024) + ' KB — the shard doc is capped at 1 MB');
  });
});

describe('the upload paths keep no copy of what failed', () => {
  const SETUP = grab('  async function handleProfileSetup(e) {', '  function showRoleSelection');
  // v298: the Inici photo's handler became changeOwnPic(), shared by every own photo.
  const HERO = grab('  function changeOwnPic() {', '  /** Every `[data-own-pic]`');

  it('neither path falls back to a data URI', () => {
    [['profile setup', SETUP], ['the Inici hero', HERO]].forEach(([which, block]) => {
      assert.ok(!/readAsDataURL/.test(block),
          which + ' still stores the file inline when the upload fails');
      assert.ok(!/dataset\.src/.test(block),
          which + ' still reads back the preview data URI');
    });
  });

  it('both tell the member the photo was not saved', () => {
    /* Dropping the fallback without saying anything would be a photo that
       silently does not appear — which is how the old behaviour got written
       in the first place. */
    [['profile setup', SETUP], ['the Inici hero', HERO]].forEach(([which, block]) => {
      assert.ok(block.includes('pic.failed_t'), which + ' fails silently');
    });
  });

  it('both downscale before uploading', () => {
    [['profile setup', SETUP], ['the Inici hero', HERO]].forEach(([which, block]) => {
      assert.ok(/iniShrinkImage\(/.test(block), which + ' uploads the original');
    });
  });

  it('a re-encoded image is stored as .jpg, not under its old extension', () => {
    // iniShrinkImage returns JPEG bytes; keeping `.png` would write a PNG
    // object whose content is a JPEG.
    [['profile setup', SETUP], ['the Inici hero', HERO]].forEach(([which, block]) => {
      assert.ok(/blob === /.test(block) && /'jpg'/.test(block),
          which + ' does not correct the extension after re-encoding');
    });
  });

  it('a failed photo does not abort the rest of profile setup', () => {
    /* The name, dob and phone are the point of that screen. Throwing here
       would strand a new member on it with no way past over an avatar. */
    const after = SETUP.slice(SETUP.indexOf('pic.failed_t'));
    assert.ok(/setSession\(/.test(after), 'setup no longer completes after a failed photo');
    assert.ok(!/\breturn\b/.test(after.slice(0, after.indexOf('setSession'))),
        'it returns early instead of finishing setup');
  });
});

describe('setSession — the personal document is guarded too', () => {
  it('blanks an oversized profilePic before the merge', () => {
    /* Not just wasteful: ~2.7 MB against a 1 MB document cap makes the write
       FAIL, and it takes the name, dob and phone in the same merge with it. */
    const block = grab('  function setSession(user) {', '  function clearSession()');
    const i = block.indexOf('MAX_PIC_SRC');
    const write = block.indexOf("db.collection('users')");
    assert.ok(i !== -1, 'the personal document has no guard');
    assert.ok(i < write, 'the guard runs after the write it is meant to protect');
  });
});

describe('iniShrinkImage — an optimisation that may never block a photo', () => {
  const BLOCK = grab('  function iniShrinkImage(file, max) {', '  function handleProfilePicChange');

  it('hands back the original when it cannot decode', () => {
    /* An old WebView with no toBlob, or an image the decoder rejects. If
       shrinking failed closed, those players simply could not set a photo —
       and the APK is exactly where old WebViews live. */
    assert.ok(/img\.onerror[\s\S]{0,80}resolve\(file\)/.test(BLOCK), BLOCK.slice(0, 200));
    assert.ok(/if \(!c\.toBlob\) return resolve\(file\)/.test(BLOCK));
    assert.ok(/catch \(err\) \{ resolve\(file\); \}/.test(BLOCK));
  });

  it('never returns something BIGGER than what it was given', () => {
    // Re-encoding an already-optimised JPEG can grow it.
    assert.ok(/blob\.size < file\.size \? blob : file/.test(BLOCK), BLOCK);
  });

  it('leaves an SVG alone', () => {
    // Rasterising a vector to 256px is a downgrade, not a saving.
    assert.ok(/svg/.test(BLOCK), BLOCK.slice(0, 400));
  });

  it('revokes the object URL on every path out', () => {
    /* Four exits: already-small, drawn, the throw inside onload, and a
       decode error. ⚠ Asserted PER PATH. Counting sites and checking `>= 3`
       let the onerror path lose its revoke and still pass — there were four,
       so removing one left three. A leak there is the likeliest one, since
       it is the path a broken image takes. */
    const paths = [
      [/if \(scale >= 1[\s\S]{0,120}?revokeObjectURL/, 'the already-small early return'],
      [/drawImage[\s\S]{0,80}?revokeObjectURL/, 'the drawn path'],
      [/catch \(err\) \{\s*URL\.revokeObjectURL/, 'the throw inside onload'],
      [/img\.onerror = function \(\) \{ URL\.revokeObjectURL/, 'the decode-error path']
    ];
    paths.forEach(([re, which]) => assert.ok(re.test(BLOCK), which + ' leaks the object URL'));
  });
});

/* ═══════════════════════════════════════════════════════════════════════════
   THE PERSON IS TOLD, RATHER THAN LEFT WITH AN INVISIBLE PHOTO (v249)
   ═══════════════════════════════════════════════════════════════════════════
   ⚠ The guards above are correct and they are also silent. A pre-v232 failed
   upload leaves a `data:` URI on the personal document: it renders wherever
   the SESSION is read — this person's own profile, the nav avatar — and
   stripHeavyPics drops it from the club-wide blob every roster surface reads.
   The photo is therefore visible to exactly one person, with nothing on
   screen connecting the two halves, and no sync fix can reach it because the
   bytes are the residue of an upload that never completed. Reported by the
   owner as "he is only showing it in his profile".
   ═══════════════════════════════════════════════════════════════════════════ */
describe('the oversized photo says so, instead of silently vanishing', () => {
  const strings = src.slice(src.indexOf("'pic.stale_t'"), src.indexOf("'pic.stale_b'") + 400);

  it('has the prompt in all three languages', () => {
    ['pic.stale_t', 'pic.stale_b'].forEach((k) => {
      assert.ok(src.includes("'" + k + "'"), k + ' is missing');
    });
    ['ca:', 'es:', 'en:'].forEach((lang) =>
      assert.ok(strings.includes(lang), 'the prompt has no ' + lang + ' string'));
  });

  it('fires on the SESSION\'s own value, not on whoever is looking', () => {
    /* stripHeavyPics runs on every device and repairs everybody's row; the
       prompt must reach the one person who can act on it. */
    /* Anchored on the GUARD, not on the first mention of the latch — that is
       the declaration, hundreds of lines above, and slicing from it read a
       region the check is not in. */
    const at = src.indexOf('if (!_stalePicWarned');
    assert.ok(at !== -1, 'the guard is gone');
    const guard = src.slice(at, at + 400);
    assert.ok(/session\.profilePic/.test(guard),
        'the prompt is not keyed on the viewer\'s own photo');
    assert.ok(/MAX_PIC_SRC/.test(guard),
        'the prompt uses its own size rule instead of the one that does the stripping');
  });

  /* ⚠ renderPage runs on every category change, every firestore-sync callback
     and every language switch. A prompt without a latch is a toast storm. */
  it('shows once per session, not once per render', () => {
    assert.ok(/let _stalePicWarned = false;/.test(src), 'there is no latch');
    const guard = src.slice(src.indexOf('if (!_stalePicWarned'),
        src.indexOf('if (!_stalePicWarned') + 400);
    assert.ok(guard.indexOf('_stalePicWarned = true;') !== -1,
        'the latch is never set, so the toast repeats on every render');
    assert.ok(guard.indexOf('_stalePicWarned = true;') < guard.indexOf('_showPushToast'),
        'the latch is set after the toast — an early return would repeat it');
  });

  it('says what to DO, not just that something is wrong', () => {
    /* The one action that fixes it is re-uploading; a message that only
       reports the fault leaves the person exactly where they started. */
    const i = src.indexOf("'pic.stale_b'");
    const ca = src.slice(src.indexOf("ca:'", i) + 4, src.indexOf("', es:", i));
    assert.ok(ca.length > 20, 'no Catalan body: ' + ca);
    assert.ok(/torna a pujar|torna-la a pujar|torna a pujar-la/i.test(ca),
        'the message does not ask for a re-upload: ' + ca);
  });
});

/* ═══════════════════════════════════════════════════════════════════════════
   v298 — YOUR PHOTO, WHEREVER IT SHOWS, CHANGES IT.

   The owner: "users should be able to change their profile pic by clicking on
   their profile pic once in the app". Until v298 only the player's Inici photo
   did, through a handler bound by id; a coach (no Inici photo) had no way at
   all once past profile setup.

   ⚠ Driven, not read. The picker, the upload and the top bar below RUN, in
   jsdom, over a Storage stand-in: v238 shipped a page that rendered nothing
   past 3080 green tests that only read source.
   ═══════════════════════════════════════════════════════════════════════════ */
const { JSDOM } = require('jsdom');
const utilsSrc = fs.readFileSync(path.join(__dirname, '..', 'js', 'utils.js'), 'utf8');
const SANITIZE_SRC = utilsSrc.slice(utilsSrc.indexOf('function sanitize(str) {'),
    utilsSrc.indexOf('// ---------- Tactical Formations ----------'));
// Comment-stripped, so a banner naming the hook in prose cannot pass for code.
const bare = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

function ownPic(o) {
  o = o || {};
  const dom = new JSDOM('<!doctype html><body><span id="nav-user-name"></span>' +
      (o.body || '') + '</body>');
  const win = dom.window;
  const doc = win.document;
  const env = { win, doc, inputs: [], puts: [], saved: [], toasts: [], alerts: [], renders: 0 };
  // The picker never opens in jsdom; record the input it would have opened.
  win.HTMLInputElement.prototype.click = function () { env.inputs.push(this); };
  env.session = Object.assign({ id: 'p1', name: 'marc', profilePic: '' }, o.session);
  const storage = {
    ref: (p) => ({
      put: (blob) => {
        env.puts.push({ path: p, blob });
        return o.putFails ? Promise.reject(new Error('offline')) : Promise.resolve();
      },
      getDownloadURL: () => Promise.resolve('https://storage.test/' + p + '?token=t1'),
    }),
  };
  const api = {
    document: doc,
    $: (s) => doc.querySelector(s),
    t: (k) => 'T(' + k + ')',
    getSession: () => env.session,
    auth: { currentUser: o.signedOut ? null : { uid: 'uidAbc' } },
    storage,
    iniShrinkImage: o.shrink || (() => Promise.resolve({ reencoded: true })),
    setSession: (s) => env.saved.push(Object.assign({}, s)),
    renderPage: () => { env.renders++; },
    _showPushToast: (a, b) => env.toasts.push([a, b]),
    alert: (m) => env.alerts.push(m),
    console: { error() {} },
  };
  const fns = new Function(...Object.keys(api), SANITIZE_SRC +
      grab('  function changeOwnPic() {', '  async function handleProfileSetup(e) {') +
      '\nreturn { changeOwnPic, bindOwnPicChange, paintNavUser, OWN_PIC_CAM };')(
      ...Object.values(api));
  return Object.assign(env, fns);
}

/** Choose `file` in the picker that the last tap opened, and let it finish. */
async function choose(env, file) {
  const inp = env.inputs[env.inputs.length - 1];
  assert.ok(inp, 'no picker was opened');
  Object.defineProperty(inp, 'files', { value: file ? [file] : [] });
  await inp.onchange();
}

describe('v298 — tapping your own photo opens the picker', () => {
  it('opens one image picker per tap, however often the binder runs', () => {
    const env = ownPic({ body: '<button type="button" id="me" data-own-pic>me</button>' });
    // bindDynamicActions runs after EVERY render: three renders, one listener.
    env.bindOwnPicChange(); env.bindOwnPicChange(); env.bindOwnPicChange();
    env.doc.getElementById('me').click();
    assert.strictEqual(env.inputs.length, 1, 'a tap opened ' + env.inputs.length + ' pickers');
    assert.strictEqual(env.inputs[0].type, 'file');
    assert.strictEqual(env.inputs[0].accept, 'image/*');
    env.doc.getElementById('me').click();
    assert.strictEqual(env.inputs.length, 2, 'the second tap opened nothing');
  });

  it('a photo without the mark opens nothing', () => {
    const env = ownPic({ body: '<button type="button" id="other">them</button>' });
    env.bindOwnPicChange();
    env.doc.getElementById('other').click();
    assert.strictEqual(env.inputs.length, 0);
  });

  it('the tap stops at the photo — it does not also open what is under it', () => {
    const env = ownPic({ body: '<div id="card"><button type="button" id="me" data-own-pic>me</button></div>' });
    let cardTaps = 0;
    env.doc.getElementById('card').addEventListener('click', () => { cardTaps++; });
    env.bindOwnPicChange();
    const ev = new env.win.MouseEvent('click', { bubbles: true, cancelable: true });
    env.doc.getElementById('me').dispatchEvent(ev);
    assert.strictEqual(cardTaps, 0, 'the card under the photo got the tap too');
    assert.ok(ev.defaultPrevented, 'the default action was not prevented');
  });
});

describe('v298 — the chosen photo', () => {
  it('is uploaded under your own uid, saved, and shown at once', async () => {
    const env = ownPic();
    env.changeOwnPic();
    await choose(env, { name: 'me.png', size: 300 * 1024 });
    assert.deepStrictEqual(env.puts.map((p) => p.path), ['profilePics/uidAbc.jpg']);
    assert.deepStrictEqual(env.puts[0].blob, { reencoded: true }, 'the original went up, not the downscaled one');
    assert.strictEqual(env.saved.length, 1, 'the session was not saved');
    assert.strictEqual(env.saved[0].profilePic, 'https://storage.test/profilePics/uidAbc.jpg?token=t1');
    assert.ok(env.doc.querySelector('#nav-user-name img.nav-avatar[src="https://storage.test/profilePics/uidAbc.jpg?token=t1"]'),
        'the top bar still shows the old face');
    assert.strictEqual(env.renders, 1, 'the page was not redrawn with the new photo');
  });

  it('an image it could not re-encode keeps its own extension', async () => {
    const env = ownPic({ shrink: (f) => Promise.resolve(f) });
    env.changeOwnPic();
    await choose(env, { name: 'me.webp', size: 1000 });
    assert.deepStrictEqual(env.puts.map((p) => p.path), ['profilePics/uidAbc.webp']);
  });

  it('over 2 MB is refused before anything is uploaded', async () => {
    const env = ownPic();
    env.changeOwnPic();
    await choose(env, { name: 'big.jpg', size: 2 * 1024 * 1024 + 1 });
    assert.strictEqual(env.alerts.length, 1, 'no message about the size');
    assert.strictEqual(env.puts.length, 0);
    assert.strictEqual(env.saved.length, 0);
  });

  it('a failed upload saves nothing and says so', async () => {
    const env = ownPic({ putFails: true, session: { profilePic: 'https://storage.test/old.jpg' } });
    env.changeOwnPic();
    await choose(env, { name: 'me.jpg', size: 1000 });
    assert.deepStrictEqual(env.toasts, [['T(pic.failed_t)', 'T(pic.failed_b)']]);
    assert.strictEqual(env.saved.length, 0, 'a failed upload still wrote the session');
    assert.strictEqual(env.session.profilePic, 'https://storage.test/old.jpg',
        'the old photo was replaced by something that never uploaded');
  });

  it('closing the picker without choosing changes nothing', async () => {
    const env = ownPic();
    env.changeOwnPic();
    await choose(env, null);
    assert.strictEqual(env.puts.length + env.saved.length + env.renders, 0);
  });

  it('signed out, nothing is uploaded', async () => {
    const env = ownPic({ signedOut: true });
    env.changeOwnPic();
    await choose(env, { name: 'me.jpg', size: 1000 });
    assert.strictEqual(env.puts.length, 0);
  });
});

describe('v298 — the top bar shows you, and the face is the button', () => {
  it('your photo, as a button that changes it, with your name beside it', () => {
    const env = ownPic({ session: { name: 'Marc Rovira', profilePic: 'https://storage.test/me.jpg' } });
    env.paintNavUser(env.session);
    const btn = env.doc.querySelector('#nav-user-name button.nav-me[data-own-pic]');
    assert.ok(btn, 'no button in the top bar');
    assert.strictEqual(btn.type, 'button');
    assert.strictEqual(btn.getAttribute('aria-label'), 'T(home.change_photo)');
    assert.strictEqual(btn.querySelector('img.nav-avatar').getAttribute('src'), 'https://storage.test/me.jpg');
    assert.strictEqual(env.doc.querySelector('#nav-user-name .nav-user-n').textContent, 'Marc Rovira');
    assert.ok(!btn.contains(env.doc.querySelector('.nav-user-n')),
        'the name is inside the button — on a phone it is hidden, and so would the tap target be');
  });

  it('no photo yet: your initial, which is just as tappable', () => {
    const env = ownPic({ session: { name: 'marc', profilePic: '' } });
    env.paintNavUser(env.session);
    assert.strictEqual(env.doc.querySelector('#nav-user-name img'), null);
    assert.strictEqual(env.doc.querySelector('#nav-user-name [data-own-pic] .nav-avatar-ph').textContent, 'M');
    env.doc.querySelector('#nav-user-name [data-own-pic]').click();
    assert.strictEqual(env.inputs.length, 1, 'the initial does not open the picker');
  });

  it('is live straight after painting, and a repaint does not stack pickers', () => {
    const env = ownPic({ session: { profilePic: 'https://storage.test/me.jpg' } });
    env.paintNavUser(env.session);
    env.bindOwnPicChange(); // the per-render binder runs over it too
    env.doc.querySelector('.nav-me').click();
    env.paintNavUser(env.session);
    env.bindOwnPicChange();
    env.doc.querySelector('.nav-me').click();
    assert.strictEqual(env.inputs.length, 2, 'two taps opened ' + env.inputs.length + ' pickers');
  });

  it('a name or a URL cannot inject markup', () => {
    const env = ownPic({ session: {
      name: '<img src=x onerror=alert(1)>',
      profilePic: 'https://storage.test/a.jpg" onerror="alert(1)',
    } });
    env.paintNavUser(env.session);
    const imgs = env.doc.querySelectorAll('#nav-user-name img');
    assert.strictEqual(imgs.length, 1, 'the name became an element');
    assert.ok(!imgs[0].hasAttribute('onerror'), 'the URL broke out of src');
    assert.strictEqual(env.doc.querySelector('.nav-user-n').textContent, '<img src=x onerror=alert(1)>');
  });
});

describe('v298 — only YOUR photo is the button', () => {
  /* ⚠ A coach looks at every player's face — Plantilla, a player's stats, the
     convocatòria. The mark on one of those would let a coach's tap upload
     a photo over THEIR OWN (the picker always writes the signed-in user), which
     reads as "it changed the wrong person" and is worse than no button. */
  it('the mark appears in your own places and nowhere else', () => {
    const owners = [];
    let at = bare.indexOf('data-own-pic');
    while (at !== -1) {
      const before = bare.slice(0, at);
      // The enclosing TOP-LEVEL function: renderPlayerHome holds helpers of its own.
      const fn = (before.match(/\n {2}(?:async )?function (\w+)\s*\(/g) || []).pop();
      owners.push(fn && fn.replace(/^\s*(async )?function |\s*\($/g, ''));
      at = bare.indexOf('data-own-pic', at + 1);
    }
    assert.deepStrictEqual([...new Set(owners)].sort(),
        ['bindOwnPicChange', 'paintNavUser', 'renderPlayerHome', 'renderPlayerStats']);
  });

  it('the per-render binder picks every one up', () => {
    const body = bare.slice(bare.indexOf('function bindDynamicActions() {'));
    assert.ok(/bindOwnPicChange\(\)/.test(body.slice(0, body.indexOf('\n  }\n'))),
        'bindDynamicActions no longer binds own photos — the Inici and stats photos go dead');
  });

  it('the top bar is painted through paintNavUser, and only there', () => {
    /* renderDashboard cannot run in jsdom (it is the whole shell). A paint of
       its own would put back the plain name and lose the button. */
    const dash = bare.slice(bare.indexOf('function renderDashboard(session) {'));
    assert.ok(/paintNavUser\(session\)/.test(dash.slice(0, dash.indexOf('\n  }\n'))),
        'renderDashboard no longer paints the top bar\'s you');
    const writers = [];
    let at = bare.indexOf('nav-user-name');
    while (at !== -1) {
      writers.push((bare.slice(0, at).match(/\n {2}(?:async )?function (\w+)\s*\(/g) || []).pop().trim());
      at = bare.indexOf('nav-user-name', at + 1);
    }
    assert.deepStrictEqual([...new Set(writers)], ['function paintNavUser('],
        'something else writes the top bar\'s you');
  });

  it('on a phone the top bar keeps your face and drops only the name', () => {
    const css = fs.readFileSync(path.join(__dirname, '..', 'css', 'style.css'), 'utf8')
        .replace(/\/\*[\s\S]*?\*\//g, '');
    assert.ok(!/(^|[\s}])\.nav-user\s*\{\s*display:\s*none/.test(css),
        'the whole top-bar you is hidden somewhere — on that width there is nothing to tap');
    assert.ok(/\.nav-user \.nav-user-n\s*\{\s*display:\s*none/.test(css), 'the name is no longer dropped');
  });
});
