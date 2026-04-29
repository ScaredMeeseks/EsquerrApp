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

    // Foreground notification received
    PushNotifications.addListener('pushNotificationReceived', (notification) => {
      console.log('Push: foreground notification', JSON.stringify(notification));
      const data = notification.data || {};
      const title = data.title || notification.title || 'EsquerrApp';
      const body = data.body || notification.body || '';
      const type = data.type || 'general';

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

  function _initWeb() {
    if (_initialized || !messaging) return;
    _initialized = true;

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

  async function _removeWebToken() {
    if (!messaging) return;
    try {
      const token = await messaging.getToken();
      if (token) {
        const user = auth.currentUser;
        if (user) {
          await db.collection('users').doc(user.uid)
            .collection('tokens').doc(token).delete();
        }
        await messaging.deleteToken();
      }
    } catch (e) {
      console.warn('Push: token cleanup error:', e);
    }
  }

  // ── Shared helpers ──
  async function _saveToken(token) {
    const user = auth.currentUser;
    if (!user) return;
    const tokenRef = db.collection('users').doc(user.uid)
      .collection('tokens').doc(token);
    await tokenRef.set({
      token: token,
      createdAt: firebase.firestore.FieldValue.serverTimestamp(),
      platform: _isNative() ? 'android-native' : _getPlatform()
    });
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

  // Write a notification document to Firestore (triggers Cloud Function to send push)
  async function sendToTeam(teamId, notification) {
    if (!teamId) return;
    try {
      await db.collection('teams').doc(teamId).collection('pushQueue').add({
        ...notification,
        createdAt: firebase.firestore.FieldValue.serverTimestamp(),
        status: 'pending'
      });
    } catch (err) {
      console.error('Push: failed to queue notification:', err);
    }
  }

  async function sendToPlayers(teamId, playerIds, notification) {
    if (!teamId) return;
    try {
      await db.collection('teams').doc(teamId).collection('pushQueue').add({
        ...notification,
        targetPlayers: playerIds,
        createdAt: firebase.firestore.FieldValue.serverTimestamp(),
        status: 'pending'
      });
    } catch (err) {
      console.error('Push: failed to queue player notification:', err);
    }
  }

  return { init, requestPermission, removeToken, sendToTeam, sendToPlayers };
})();
