// ============================================================
// One credentials check, shared by every one-off script here.
//
// It exists because a failure to authenticate otherwise surfaces as a
// 30-line gRPC stack ending in
//
//     Cannot create property 'refresh_token' on string ''
//
// which reads like a bug in the script. It is not. It means the Admin SDK
// has no usable Application Default Credentials.
//
// What actually goes wrong on Cloud Shell, seen 2026-08-05:
//   * `firebase deploy` keeps working throughout, because the Firebase CLI
//     uses its own stored login rather than ADC. That mismatch is what
//     disguises the problem.
//   * Something (Cloud Shell tooling or the Firebase CLI — not deploy.sh)
//     points CLOUDSDK_CONFIG at a temp dir; the leftover
//     `__TMP_CLOUDSDK_CONFIG=/tmp/tmp.XXXX` is the fingerprint. gcloud then
//     has no credentials in ~/.config/gcloud.
//   * `gcloud auth list` reporting "No credentialed accounts" is the
//     diagnostic. Restart the VM (three-dots menu -> Restart); a new tab is
//     not enough, and unsetting variables does not help.
// ============================================================
"use strict";

/** Marks an error as a user-fixable configuration problem, not a crash. */
function userError(msg) {
  const e = new Error(msg);
  e.userError = true;
  return e;
}

/**
 * Fail fast, and usefully, before a script does any real work.
 * @param {FirebaseFirestore.Firestore} db an initialised Firestore client
 */
async function preflight(db) {
  const fs = require("fs");
  const p = process.env.GOOGLE_APPLICATION_CREDENTIALS;
  if (p && !fs.existsSync(p)) {
    throw userError(
        "GOOGLE_APPLICATION_CREDENTIALS points at a file that does not exist:\n" +
        `      ${p}\n` +
        "    If that looks like /tmp/tmp.XXXX it is a temp dir, not a real path.\n" +
        "      unset GOOGLE_APPLICATION_CREDENTIALS\n" +
        "      unset CLOUDSDK_CONFIG");
  }
  try {
    await db.collection("clubs").limit(1).get();
  } catch (e) {
    throw userError(
        `cannot reach Firestore as an authenticated client: ${e.message}\n\n` +
        "    Check this FIRST — it is the diagnostic, not the stack above:\n" +
        "      gcloud auth list\n\n" +
        "    'No credentialed accounts' means Cloud Shell has lost its\n" +
        "    identity. A deploy can cause that while the Firebase CLI keeps\n" +
        "    working, because the CLI does not use ADC.\n" +
        "    Fix: RESTART THE VM (three-dots menu -> Restart). A new tab is\n" +
        "    not enough, and unsetting variables will not help.\n" +
        "    Afterwards: cd ~/EsquerrApp (a restart drops you in ~).");
  }
}

module.exports = {preflight, userError};
