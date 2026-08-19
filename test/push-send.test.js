/* Unit tests for the FCM message shape — functions/index.js sendToTokens.
 *
 * Pure logic, no emulator: `npm run test:push-send`.
 *
 * The send path had NO coverage at all before this file, which is how three
 * defects survived in it:
 *
 *   1. web and native got one identical message, so the web SDK displayed a
 *      `notification` payload AND sw.js displayed it again from
 *      onBackgroundMessage — two notifications per event;
 *   2. `webpush.fcmOptions.link` was a bare "/" while the app is served from
 *      a GitHub Pages SUBPATH, so a click from a cold start opened the domain
 *      root instead of the app;
 *   3. the per-session `tag` the reminders compute went only into `data`, and
 *      Android reads `android.notification.tag` — so reminder collapsing
 *      worked on web only and Android stacked them up.
 *
 * `buildMessage` is not exported (functions/index.js must export only
 * deployable functions, or the CLI treats the export as a function to
 * deploy), so it is lifted out of the source the same way reminders.test.js
 * lifts squadForSession.
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const SRC = fs.readFileSync(
    path.join(__dirname, '..', 'functions', 'index.js'), 'utf8');

/** Pull a top-level function out of the source and evaluate it. */
function lift(name, deps) {
  const start = SRC.indexOf('function ' + name + '(');
  assert.notStrictEqual(start, -1, name + ' not found in functions/index.js');
  // Brace-match to the end of the declaration.
  let i = SRC.indexOf('{', start);
  let depth = 0;
  for (; i < SRC.length; i++) {
    if (SRC[i] === '{') depth++;
    else if (SRC[i] === '}') { depth--; if (depth === 0) { i++; break; } }
  }
  const body = SRC.slice(start, i);
  const names = Object.keys(deps || {});
  // eslint-disable-next-line no-new-func
  return new Function(...names, body + '; return ' + name + ';')(
      ...names.map((n) => deps[n]));
}

const APP_BASE_URL = (SRC.match(/const APP_BASE_URL = "([^"]+)"/) || [])[1];
const buildMessage = lift('buildMessage', {APP_BASE_URL});
const isNativeToken = lift('isNativeToken', {});

const PAYLOAD = {
  title: 'Convocatòria publicada!',
  body: 'Girona vs Esquerra',
  type: 'convocatoria',
  tag: 'match-avail-m1',
};

describe('APP_BASE_URL', () => {
  it('is a real subpath, not the domain root', () => {
    // The bug this replaced was literally "/". If this ever goes back to a
    // bare origin, every cold-start notification click misses the app.
    assert.ok(APP_BASE_URL, 'APP_BASE_URL not found');
    assert.ok(/^https:\/\/.+\/.+/.test(APP_BASE_URL),
      'APP_BASE_URL must include the path the app is served from: ' + APP_BASE_URL);
  });
});

describe('isNativeToken', () => {
  it('classifies what the client actually writes', () => {
    // js/push.js stores platform: 'android-native' | 'android' | 'ios' | 'web'
    assert.strictEqual(isNativeToken({platform: 'android-native'}), true);
    assert.strictEqual(isNativeToken({platform: 'android'}), false);
    assert.strictEqual(isNativeToken({platform: 'ios'}), false);
    assert.strictEqual(isNativeToken({platform: 'web'}), false);
  });

  it('treats a token with no platform as web', () => {
    // Tokens written before `platform` was stored have none. Web is what
    // they were, and it is also the safe default: a web-shaped message on a
    // native device shows nothing, where the reverse shows it twice.
    assert.strictEqual(isNativeToken({}), false);
    assert.strictEqual(isNativeToken({platform: ''}), false);
    assert.strictEqual(isNativeToken(null), false);
  });
});

describe('buildMessage — web', () => {
  const msg = buildMessage(['t1', 't2'], PAYLOAD, false);

  it('sends NO notification payload', () => {
    // The whole point: a notification payload is auto-displayed by the SDK
    // and shown again by sw.js. Data-only makes the service worker the one
    // display point.
    assert.strictEqual(msg.notification, undefined);
    assert.deepStrictEqual(msg.data, PAYLOAD);
  });

  it('links to the app, not the domain root', () => {
    assert.strictEqual(msg.webpush.fcmOptions.link, APP_BASE_URL);
    assert.notStrictEqual(msg.webpush.fcmOptions.link, '/');
  });

  it('prefers an explicit url when the payload carries one', () => {
    const m = buildMessage(['t1'], Object.assign({}, PAYLOAD,
      {url: 'https://example.test/deep'}), false);
    assert.strictEqual(m.webpush.fcmOptions.link, 'https://example.test/deep');
  });

  it('carries the tokens it was given', () => {
    assert.deepStrictEqual(msg.tokens, ['t1', 't2']);
  });
});

describe('buildMessage — native', () => {
  const msg = buildMessage(['t1'], PAYLOAD, true);

  it('DOES send a notification payload', () => {
    // Data-only shows nothing on Android once the app is killed, which is
    // exactly when a reminder matters.
    assert.strictEqual(msg.notification.title, PAYLOAD.title);
    assert.strictEqual(msg.notification.body, PAYLOAD.body);
  });

  it('puts the tag where Android actually reads it', () => {
    assert.strictEqual(msg.android.notification.tag, PAYLOAD.tag);
    assert.strictEqual(msg.android.collapseKey, PAYLOAD.tag);
  });

  it('names the channel the app creates and the manifest declares', () => {
    // js/push.js creates 'esquerrapp_default'; AndroidManifest declares it as
    // the default. A mismatch silently drops the notification on Android 8+.
    assert.strictEqual(msg.android.notification.channelId, 'esquerrapp_default');
  });

  it('names the monochrome icon that exists in the drawable folder', () => {
    assert.strictEqual(msg.android.notification.icon, 'ic_notification');
  });

  it('sends high priority', () => {
    assert.strictEqual(msg.android.priority, 'high');
  });

  it('sends no webpush block', () => {
    assert.strictEqual(msg.webpush, undefined);
  });
});

describe('buildMessage — defaults', () => {
  it('falls back to a title rather than sending an empty notification', () => {
    const m = buildMessage(['t1'], {}, true);
    assert.strictEqual(m.notification.title, 'EsquerrApp');
    assert.strictEqual(m.notification.body, '');
  });

  it('omits tag and collapseKey when there is no tag, rather than sending ""', () => {
    // An empty-string collapseKey is not the same as no collapse key.
    const m = buildMessage(['t1'], {title: 'x'}, true);
    assert.strictEqual(m.android.collapseKey, undefined);
    assert.strictEqual(m.android.notification.tag, undefined);
  });
});

/* Source assertions for the parts that are about batching rather than shape,
   and which a unit test cannot reach without a live FCM. */
describe('sendToTokens batching', () => {
  it('chunks at 500 — sendEachForMulticast throws above it', () => {
    assert.ok(/const CHUNK = 500/.test(SRC),
      'the 500-token multicast cap must be chunked, or a large club loses the whole send');
  });

  it('chunks the stale-token deletes too — a write batch caps at 500', () => {
    const i = SRC.indexOf('for (let i = 0; i < stale.length; i += CHUNK)');
    assert.notStrictEqual(i, -1, 'stale-token cleanup must be chunked');
  });

  it('treats invalid-argument as stale, not as a transient failure', () => {
    // It is what a malformed/rotated token surfaces as; leaving those in
    // place means retrying them on every send for ever.
    assert.ok(/messaging\/invalid-argument/.test(SRC));
  });
});

/* The CLIENT half — token registration.
 *
 * v95 moved the permission prompt behind a user gesture, which was right: it
 * had been firing from the auth-state handler with no gesture, which browsers
 * auto-deny and iOS ignores outright. But the soft-ask banner became the ONLY
 * caller of requestPermission(), and it only renders while
 * Notification.permission === 'default'. Since logging out deletes the token
 * by design, a user who granted and then logged out had no token and no UI to
 * make one — silently, with nothing logged.
 *
 * The repair is to acquire a token on init when permission is ALREADY
 * granted, which needs no gesture precisely because there is nothing to
 * prompt. These pin that both platforms do it.
 */
describe('push client — a granted user always ends up with a token', () => {
  const push = fs.readFileSync(
      path.join(__dirname, '..', 'js', 'push.js'), 'utf8');

  it('the web init path acquires a token when permission is granted', () => {
    assert.ok(/_ensureWebToken\s*\(\)/.test(push),
      '_initWeb must call _ensureWebToken, or a granted user who logs out ' +
      'can never register again');
    const fn = push.slice(push.indexOf('async function _ensureWebToken'));
    assert.ok(/Notification\.permission !== 'granted'/.test(fn.slice(0, 600)),
      'it must only run when permission is already granted — otherwise it is ' +
      'the gesture-less prompt v95 removed, reintroduced');
  });

  it('the native init path registers when permission is granted', () => {
    const fn = push.slice(push.indexOf('async function _initNative'),
        push.indexOf('async function _requestNativePermission'));
    assert.ok(/checkPermissions\(\)/.test(fn) && /\.register\(\)/.test(fn),
      '_initNative must register when checkPermissions() reports granted');
  });

  it('still saves the platform, which decides the message shape', () => {
    // 'android' (browser) vs 'android-native' (Capacitor) picks web vs native
    // in buildMessage. Getting it wrong shows nothing on the device.
    assert.ok(/platform: _isNative\(\) \? 'android-native' : _getPlatform\(\)/.test(push));
  });
});
