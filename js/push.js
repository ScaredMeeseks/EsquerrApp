// ============================================================
// Push Notifications — EsquerrApp
// ============================================================
// Handles FCM token management, permission requests, and
// foreground notification display.
// Supports both:
//   - Native Android via @capacitor/push-notifications
//   - Web browsers via Firebase Cloud Messaging (Service Worker)
// Depends on: firebase-config.js (messaging, db, auth globals)
// ============================================================

const Push = (() => {
  // VAPID key from Firebase Console > Project Settings > Cloud Messaging > Web Push certificates
  const VAPID_KEY = 'BFRoi6VPfo1CxqDHM0L31hr2Qy-b9BISzJ3yvB_qWKAVkYjeaxwFA9JHgiAsCG2K7u48YK71JJwL4VfDhqnuPRs';

  let _initialized = false;
  let _currentToken = null;

  // Detect if running inside Capacitor native shell
  function _isNative() {
    return typeof Capacitor !== 'undefined' && Capacitor.isNativePlatform && Capacitor.isNativePlatform();
  }

  // ── Native Android push (Capacitor) ──
  async function _initNative() {
    if (_initialized) return;
    _initialized = true;

    const PushNotifications = Capacitor.Plugins.PushNotifications;
    if (!PushNotifications) {
      console.warn('Push: PushNotifications plugin not available');
      return;
    }
    console.log('Push: native plugin found, setting up listeners');

    /* Register when permission has ALREADY been granted — the native twin of
       _ensureWebToken. register() was only reachable through
       _requestNativePermission, which only the soft-ask banner calls, so a
       native user who had granted and then logged out (removeToken) had no
       way to get a token back either.

       checkPermissions() prompts nobody; it only reports. */
    PushNotifications.checkPermissions()
      .then((res) => {
        if (res && res.receive === 'granted') {
          console.log('Push: permission already granted, registering');
          return PushNotifications.register();
        }
      })
      .catch((e) => console.warn('Push: permission check failed:', e && e.message));

    // Create notification channel (required on Android 8+)
    PushNotifications.createChannel({
      id: 'esquerrapp_default',
      name: 'EsquerrApp',
      description: 'Notificacions de EsquerrApp',
      importance: 5,
      visibility: 1,
      vibration: true
    }).catch(e => console.warn('Push: channel creation error:', e));

    // Listen for registration success → save token
    PushNotifications.addListener('registration', async (tokenData) => {
      console.log('Push: native token received', tokenData.value?.slice(0, 20) + '...');
      _currentToken = tokenData.value;
      await _saveToken(tokenData.value);
      // Resolve the pending registration promise if any
      if (_registrationResolve) {
        _registrationResolve(tokenData.value);
        _registrationResolve = null;
      }
    });

    // Listen for registration errors
    PushNotifications.addListener('registrationError', (error) => {
      console.error('Push: native registration error', JSON.stringify(error));
      if (_registrationResolve) {
        _registrationResolve(null);
        _registrationResolve = null;
      }
    });

    // Foreground notification received → show system notification via LocalNotifications
    PushNotifications.addListener('pushNotificationReceived', (notification) => {
      console.log('Push: foreground notification', JSON.stringify(notification));
      const data = notification.data || {};
      const title = data.title || notification.title || 'EsquerrApp';
      const body = data.body || notification.body || '';
      const type = data.type || 'general';

      // Show a real system notification (status bar) even while app is open
      const LocalNotifications = Capacitor.Plugins.LocalNotifications;
      if (LocalNotifications) {
        LocalNotifications.schedule({
          notifications: [{
            id: Date.now() % 2147483647,
            title: title,
            body: body,
            channelId: 'esquerrapp_default',
            extra: data
          }]
        }).catch(e => console.warn('Push: local notification error:', e));
      }

      // Also dispatch in-app event for toast
      window.dispatchEvent(new CustomEvent('push-notification', {
        detail: { title, body, type, data }
      }));
    });

    // Notification tapped (app opened from notification)
    PushNotifications.addListener('pushNotificationActionPerformed', (action) => {
      console.log('Push: notification tapped', JSON.stringify(action));
      const data = action.notification?.data || {};
      const type = data.type || 'general';
      _handleNavigation(type, data);
    });

    /* Tap on a notification we re-showed ourselves.

       The foreground handler above does NOT let FCM display the push — it
       schedules a LocalNotification carrying the same payload in `extra`. A
       tap on that one is a LocalNotifications event, not a PushNotifications
       one, so `pushNotificationActionPerformed` never fires for it and the
       deep link was dropped. Which meant the single most common case — the
       23:00 RPE reminder arriving while the player has the app open — did
       nothing at all when tapped. */
    const LN = Capacitor.Plugins.LocalNotifications;
    if (LN) {
      LN.addListener('localNotificationActionPerformed', (action) => {
        console.log('Push: local notification tapped', JSON.stringify(action));
        const data = (action.notification && action.notification.extra) || {};
        _handleNavigation(data.type || 'general', data);
      });
    }
  }

  let _registrationResolve = null;

  async function _requestNativePermission() {
    const PushNotifications = Capacitor.Plugins.PushNotifications;
    if (!PushNotifications) {
      console.warn('Push: PushNotifications plugin not available for permission');
      return null;
    }

    try {
      const result = await PushNotifications.checkPermissions();
      console.log('Push: current permission status:', result.receive);
      if (result.receive !== 'granted') {
        const req = await PushNotifications.requestPermissions();
        console.log('Push: permission request result:', req.receive);
        if (req.receive !== 'granted') {
          console.warn('Push: native permission denied');
          return null;
        }
      }
      // Create a promise that resolves when the registration event fires
      const tokenPromise = new Promise((resolve) => {
        _registrationResolve = resolve;
        // Timeout after 10 seconds
        setTimeout(() => {
          if (_registrationResolve) {
            console.warn('Push: registration event timed out after 10s');
            _registrationResolve = null;
            resolve(null);
          }
        }, 10000);
      });
      // This triggers the 'registration' event
      await PushNotifications.register();
      console.log('Push: register() called, waiting for token...');
      const token = await tokenPromise;
      console.log('Push: registration complete, token:', token ? 'received' : 'none');
      return token;
    } catch (err) {
      console.error('Push: native permission error:', err);
      return null;
    }
  }

  async function _removeNativeToken() {
    try {
      if (_currentToken) {
        const user = auth.currentUser;
        if (user) {
          await db.collection('users').doc(user.uid)
            .collection('tokens').doc(_currentToken).delete();
        }
        _currentToken = null;
      }
    } catch (e) {
      console.warn('Push: native token cleanup error:', e);
    }
  }

  // ── Web push (Firebase Cloud Messaging) ──
  async function _requestWebPermission() {
    if (!messaging) {
      console.warn('Push: FCM not available');
      return null;
    }
    try {
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') {
        console.warn('Push: permission denied');
        return null;
      }
      const swReg = await navigator.serviceWorker.ready;
      const token = await messaging.getToken({
        vapidKey: VAPID_KEY,
        serviceWorkerRegistration: swReg
      });
      if (token) {
        _currentToken = token;
        await _saveToken(token);
      }
      return token;
    } catch (err) {
      console.error('Push: failed to get token:', err);
      return null;
    }
  }

  /**
   * Acquire a token when permission has ALREADY been granted.
   *
   * The soft-ask banner is the only thing that calls requestPermission(), and
   * it only renders while `Notification.permission === 'default'`. So a user
   * who has granted but has no token had no way back:
   *
   *     grant -> token saved -> log out (removeToken deletes it)
   *     -> log back in -> banner hidden, permission is 'granted'
   *     -> no token, no UI to make one, nothing logged
   *
   * Before v95 the auth handler called requestPermission() on every login,
   * which re-saved the token each time. Dropping that call was right — it
   * fired a prompt with no user gesture, which browsers auto-deny and iOS
   * ignores — but it took re-registration with it.
   *
   * No gesture is needed here precisely BECAUSE permission already exists:
   * getToken() prompts nobody when the answer is already 'granted'. The
   * banner keeps owning the actual ask.
   */
  async function _ensureWebToken() {
    if (!messaging) return null;
    if (typeof Notification === 'undefined') return null;
    if (Notification.permission !== 'granted') return null;
    try {
      const swReg = await navigator.serviceWorker.ready;
      const token = await messaging.getToken({
        vapidKey: VAPID_KEY,
        serviceWorkerRegistration: swReg
      });
      if (token) await _saveToken(token);
      return token;
    } catch (err) {
      // Never fatal: a missing token costs notifications, not the app.
      console.warn('Push: could not refresh token:', err && err.message);
      return null;
    }
  }

  function _initWeb() {
    if (_initialized || !messaging) return;
    _initialized = true;

    // Fire and forget — init() is called from the auth handler and must not
    // wait on the network.
    _ensureWebToken();

    messaging.onMessage(payload => {
      const data = payload.data || {};
      const title = data.title || payload.notification?.title || 'EsquerrApp';
      const body  = data.body  || payload.notification?.body  || '';
      const type  = data.type  || 'general';

      if (Notification.permission === 'granted') {
        const n = new Notification(title, {
          body,
          icon: './img/logo-192.png',
          tag: data.tag || 'esquerrapp-fg-' + Date.now(),
          data: { url: data.url || './', type, page: data.page || '', matchId: data.matchId || '' }
        });
        n.onclick = () => {
          window.focus();
          _handleNavigation(type, data);
          n.close();
        };
      }

      window.dispatchEvent(new CustomEvent('push-notification', {
        detail: { title, body, type, data }
      }));
    });

    navigator.serviceWorker?.addEventListener('message', event => {
      if (event.data?.type === 'PUSH_NAV') {
        _handleNavigation(event.data.notifType, event.data);
      }
    });
  }

  /**
   * Drop this device's token on logout.
   *
   * getToken() MUST be given the same options as the one in
   * _requestWebPermission. Called bare it falls back to registering
   * `/firebase-messaging-sw.js`, a file this app does not have — so it threw,
   * the catch below swallowed it, and the token document was never deleted.
   * On a shared device the next push for the previous user still arrived.
   *
   * `_currentToken` is preferred when we have it: after deleteToken() a
   * second getToken() would mint a NEW token, which is the opposite of what
   * logging out should do.
   */
  async function _removeWebToken() {
    if (!messaging) return;
    try {
      let token = _currentToken;
      if (!token) {
        const swReg = await navigator.serviceWorker.ready;
        token = await messaging.getToken({
          vapidKey: VAPID_KEY,
          serviceWorkerRegistration: swReg
        });
      }
      if (!token) return;
      const user = auth.currentUser;
      if (user) {
        await db.collection('users').doc(user.uid)
          .collection('tokens').doc(token).delete();
      }
      await messaging.deleteToken();
      _currentToken = null;
    } catch (e) {
      console.warn('Push: token cleanup error:', e);
    }
  }

  // ── Shared helpers ──
  async function _saveToken(token) {
    const user = auth.currentUser;
    if (!user) return;
    /* A rotated token used to leave the OLD document behind, so
       users/{uid}/tokens filled with dead entries that were only ever
       cleared when a send failed against them. We know the previous one, so
       delete it here rather than waiting for that. */
    const prev = _currentToken;
    _currentToken = token;
    const tokenRef = db.collection('users').doc(user.uid)
      .collection('tokens').doc(token);
    await tokenRef.set({
      token: token,
      createdAt: firebase.firestore.FieldValue.serverTimestamp(),
      platform: _isNative() ? 'android-native' : _getPlatform()
    });
    if (prev && prev !== token) {
      try {
        await db.collection('users').doc(user.uid)
          .collection('tokens').doc(prev).delete();
      } catch (e) {
        console.warn('Push: stale token cleanup failed:', e && e.message);
      }
    }
    console.log('Push: token saved to Firestore');
  }

  function _getPlatform() {
    if (/android/i.test(navigator.userAgent)) return 'android';
    if (/iphone|ipad/i.test(navigator.userAgent)) return 'ios';
    return 'web';
  }

  function _handleNavigation(type, data) {
    window.dispatchEvent(new CustomEvent('push-navigate', {
      detail: { type, ...(data || {}) }
    }));
  }

  // ── Public API (delegates to native or web) ──
  function init() {
    if (_isNative()) {
      _initNative();
    } else {
      _initWeb();
    }
  }

  async function requestPermission() {
    if (_isNative()) {
      return _requestNativePermission();
    } else {
      return _requestWebPermission();
    }
  }

  async function removeToken() {
    if (_isNative()) {
      return _removeNativeToken();
    } else {
      return _removeWebToken();
    }
  }

  /* Queue a notification for named players. Writing the document IS the
     send: onPushQueueCreate picks it up and pushes to their phones.
     ALWAYS a named list. `sendToTeam(teamId, notification)` used to sit here
     — same write with no `targetPlayers`, which the consumer read as "send
     to every member of the team". Nothing ever called it, but it was
     exported, so the broadcast was one autocomplete away from being used,
     and firestore.rules let any member make that write. Both halves are now
     closed and the function is gone: a genuine club-wide announcement should
     be a Cloud Function that decides its own recipients, like the training
     and RPE reminders already do, not a document any phone can write. */
  async function sendToPlayers(teamId, playerIds, notification) {
    if (!teamId) return;
    const targets = (playerIds || []).filter(Boolean);
    // No recipients is not a broadcast — it is nothing to do.
    if (!targets.length) return;
    try {
      await db.collection('teams').doc(teamId).collection('pushQueue').add({
        ...notification,
        targetPlayers: targets,
        createdAt: firebase.firestore.FieldValue.serverTimestamp(),
        status: 'pending'
      });
    } catch (err) {
      console.error('Push: failed to queue player notification:', err);
    }
  }

  return { init, requestPermission, removeToken, sendToPlayers };
})();
