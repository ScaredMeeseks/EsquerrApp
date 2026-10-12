// ============================================================
// Firebase Configuration — EsquerrApp
// ============================================================
// Using Firebase 10.x Compat SDK (loaded via <script> in index.html).
// This file must be loaded AFTER the Firebase SDK scripts and
// BEFORE app.js.
// ============================================================

const firebaseConfig = {
  apiKey: "AIzaSyBHFdCz0OCkkH2a5nw97ZlS8R--daoPYAE",
  authDomain: "esquerrapp.firebaseapp.com",
  projectId: "esquerrapp",
  storageBucket: "esquerrapp.firebasestorage.app",
  messagingSenderId: "555691808277",
  appId: "1:555691808277:web:c2ccb2047325ad3209601c",
  measurementId: "G-463JSLGK66"
};

/* Local emulators (v285) — ONLY on localhost, and ONLY when asked with
   `?emu=1` (remembered for the tab in sessionStorage). Lets a sign-up be
   driven end to end — Auth, joinClub, the rules — without creating accounts
   in the live project. Anywhere else, and on localhost by default, this is
   the live project exactly as before. */
let _emu = false;
try {
  if (location.hostname === 'localhost' || location.hostname === '127.0.0.1') {
    if (/[?&]emu=1(&|$)/.test(location.search)) sessionStorage.setItem('_emu', '1');
    _emu = sessionStorage.getItem('_emu') === '1';
  }
} catch (e) { /* no sessionStorage: live */ }
if (_emu) firebaseConfig.projectId = 'demo-esquerrapp';

// Initialize Firebase
firebase.initializeApp(firebaseConfig);

// Shortcuts used across the app
const auth    = firebase.auth();
const db      = firebase.firestore();
const storage = firebase.storage();
if (_emu) {
  auth.useEmulator('http://127.0.0.1:9099');
  db.useEmulator('127.0.0.1', 8080);
  storage.useEmulator('127.0.0.1', 9199);
  firebase.app().functions('us-central1').useEmulator('127.0.0.1', 5001);
  console.warn('[EMU] talking to the local Firebase emulators (demo-esquerrapp)');
}

// Firebase Cloud Messaging (push notifications)
let messaging = null;
try {
  if (firebase.messaging.isSupported()) {
    messaging = firebase.messaging();
  }
} catch (e) {
  console.warn('FCM not supported in this browser:', e.message);
}

// Enable Firestore offline persistence so the app works without internet
// and queued writes sync automatically when connectivity returns.
const _persistenceReady = db.enablePersistence({ synchronizeTabs: true }).catch(err => {
  // Without persistence, offline writes are NOT queued across reloads —
  // the app must warn instead of silently accepting answers (see ackSave in app.js).
  window._persistenceFailed = true;
  if (err.code === 'failed-precondition') {
    // Multiple tabs open — persistence can only be enabled in one tab at a time
    console.warn('Firestore persistence unavailable: multiple tabs open.');
  } else if (err.code === 'unimplemented') {
    // Browser doesn't support required features
    console.warn('Firestore persistence unavailable: browser not supported.');
  }
});
