// ============================================================
// Service Worker — EsquerrApp PWA + FCM Push
// ============================================================
// Cache-first for static assets (CSS, JS, images, fonts).
// Network-first for everything else.
// Firestore SDK handles its own offline cache — we don't
// intercept those requests.
// Handles Firebase Cloud Messaging background push events.
// ============================================================

// Import Firebase scripts for background messaging
importScripts('https://www.gstatic.com/firebasejs/10.12.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.12.0/firebase-messaging-compat.js');

// Initialize Firebase in the service worker
firebase.initializeApp({
  apiKey:            "AIzaSyBHFdCz0OCkkH2a5nw97ZlS8R--daoPYAE",
  authDomain:        "esquerrapp.firebaseapp.com",
  projectId:         "esquerrapp",
  storageBucket:     "esquerrapp.firebasestorage.app",
  messagingSenderId: "555691808277",
  appId:             "1:555691808277:web:c2ccb2047325ad3209601c",
  measurementId:     "G-463JSLGK66"
});

const fcmMessaging = firebase.messaging();

// Handle background push messages (when app is not in foreground)
fcmMessaging.onBackgroundMessage(payload => {
  const data = payload.data || {};
  const title = data.title || payload.notification?.title || 'EsquerrApp';
  const body  = data.body  || payload.notification?.body  || '';
  const tag   = data.tag   || 'esquerrapp-notif';
  const icon  = './img/logo-192.png';

  return self.registration.showNotification(title, {
    body,
    icon,
    badge: './img/logo-192.png',
    tag,
    data: {
      url: data.url || './',
      type: data.type || 'general',
      page: data.page || '',
      matchId: data.matchId || ''
    },
    vibrate: [200, 100, 200]
  });
});

// Handle notification click — open the app at the right page
self.addEventListener('notificationclick', event => {
  event.notification.close();
  const url = event.notification.data?.url || './';

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clients => {
      // Focus existing window if available
      for (const client of clients) {
        if (client.url.includes('index.html') || client.url.endsWith('/')) {
          client.postMessage({
            type: 'PUSH_NAV',
            url,
            notifType: event.notification.data?.type,
            page: event.notification.data?.page || '',
            matchId: event.notification.data?.matchId || ''
          });
          return client.focus();
        }
      }
      // Otherwise open new window
      return self.clients.openWindow(url);
    })
  );
});

const CACHE_NAME = 'esquerrapp-v3';

const STATIC_ASSETS = [
  './',
  './index.html',
  './css/style.css',
  './js/firebase-config.js',
  './js/db.js',
  './js/push.js',
  './js/app.js',
  './manifest.json',
  './img/logo.png',
  './img/logo-192.png',
  './img/logo-512.png',
  './img/cuerpos.png',
  './img/whistle.png',
  './img/sil-both-arms-up.png',
  './img/sil-one-arm-up.png',
  './img/sil-arms-crossed.png',
  './img/sil-arms-side.png',
];

// Install: pre-cache static assets
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(STATIC_ASSETS))
  );
  self.skipWaiting();
});

// Activate: clean up old caches
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// Fetch: network-first for code/pages, cache-first for images only
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);

  // Skip Firebase/Firestore/Google API requests — let Firestore SDK manage those
  if (url.hostname.includes('googleapis.com') ||
      url.hostname.includes('gstatic.com') ||
      url.hostname.includes('firebaseio.com') ||
      url.hostname.includes('firestore.googleapis.com') ||
      url.hostname.includes('firebaseinstallations.googleapis.com')) {
    return;
  }

  // Google Fonts: network-first
  if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') {
    event.respondWith(
      fetch(event.request).then(response => {
        const clone = response.clone();
        caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
        return response;
      }).catch(() => caches.match(event.request))
    );
    return;
  }

  // Images: cache-first (they rarely change)
  if (/\.(png|jpg|jpeg|gif|svg|webp|ico)(\?|$)/i.test(url.pathname)) {
    event.respondWith(
      caches.match(event.request).then(cached => {
        if (cached) return cached;
        return fetch(event.request).then(response => {
          if (response.ok && url.origin === self.location.origin) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
          }
          return response;
        });
      }).catch(() => caches.match(event.request))
    );
    return;
  }

  // Everything else (JS, CSS, HTML): network-first, fall back to cache
  event.respondWith(
    fetch(event.request).then(response => {
      if (response.ok && url.origin === self.location.origin) {
        const clone = response.clone();
        caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
      }
      return response;
    }).catch(() => {
      return caches.match(event.request).then(cached => {
        if (cached) return cached;
        if (event.request.mode === 'navigate') return caches.match('./index.html');
      });
    })
  );
});
