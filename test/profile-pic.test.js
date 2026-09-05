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
  const HERO = grab("    const poPicWrap = document.getElementById('po-pic-change');",
      '    // Convocatòria drag-and-drop');

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
