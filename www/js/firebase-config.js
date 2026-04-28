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

// Initialize Firebase
firebase.initializeApp(firebaseConfig);

// Shortcuts used across the app
const auth    = firebase.auth();
const db      = firebase.firestore();
const storage = firebase.storage();

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
db.enablePersistence({ synchronizeTabs: true }).catch(err => {
  if (err.code === 'failed-precondition') {
    // Multiple tabs open — persistence can only be enabled in one tab at a time
    console.warn('Firestore persistence unavailable: multiple tabs open.');
  } else if (err.code === 'unimplemented') {
    // Browser doesn't support required features
    console.warn('Firestore persistence unavailable: browser not supported.');
  }
});
