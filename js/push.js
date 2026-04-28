// ============================================================
// Push Notifications — EsquerrApp
// ============================================================
// Handles FCM token management, permission requests, and
// foreground notification display.
// Depends on: firebase-config.js (messaging, db, auth globals)
// ============================================================

const Push = (() => {
  // VAPID key from Firebase Console > Project Settings > Cloud Messaging > Web Push certificates
  const VAPID_KEY = 'BFRoi6VPfo1CxqDHM0L31hr2Qy-b9BISzJ3yvB_qWKAVkYjeaxwFA9JHgiAsCG2K7u48YK71JJwL4VfDhqnuPRs';

  let _initialized = false;

  // Request notification permission and get FCM token
  async function requestPermission() {
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
      // Get SW registration (our sw.js already handles FCM)
      const swReg = await navigator.serviceWorker.ready;
      const token = await messaging.getToken({
        vapidKey: VAPID_KEY,
        serviceWorkerRegistration: swReg
      });
      if (token) {
        await _saveToken(token);
      }
      return token;
    } catch (err) {
      console.error('Push: failed to get token:', err);
      return null;
    }
  }

  // Save FCM token to Firestore under the user's document
  async function _saveToken(token) {
    const user = auth.currentUser;
    if (!user) return;
    const tokenRef = db.collection('users').doc(user.uid)
      .collection('tokens').doc(token);
    await tokenRef.set({
      token: token,
      createdAt: firebase.firestore.FieldValue.serverTimestamp(),
      platform: _getPlatform()
    });
  }

  // Remove token on logout
  async function removeToken() {
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

  // Detect platform for analytics
  function _getPlatform() {
    if (/android/i.test(navigator.userAgent)) return 'android';
    if (/iphone|ipad/i.test(navigator.userAgent)) return 'ios';
    return 'web';
  }

  // Initialize foreground message handler
  function init() {
    if (_initialized || !messaging) return;
    _initialized = true;

    // Foreground messages: show an in-app toast + native notification
    messaging.onMessage(payload => {
      const data = payload.data || {};
      const title = data.title || payload.notification?.title || 'EsquerrApp';
      const body  = data.body  || payload.notification?.body  || '';
      const type  = data.type  || 'general';

      // Show native notification even in foreground
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

      // Dispatch custom event so app.js can show in-app toast
      window.dispatchEvent(new CustomEvent('push-notification', {
        detail: { title, body, type, data }
      }));
    });

    // Handle messages from SW (notification clicks when app is open)
    navigator.serviceWorker?.addEventListener('message', event => {
      if (event.data?.type === 'PUSH_NAV') {
        _handleNavigation(event.data.notifType, event.data);
      }
    });
  }

  // Navigate to the right page based on notification type
  function _handleNavigation(type, data) {
    // Dispatch event that app.js listens for
    window.dispatchEvent(new CustomEvent('push-navigate', {
      detail: { type, ...(data || {}) }
    }));
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

  // Send to specific players only
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
