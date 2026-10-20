/* Wait for the Functions emulator to work through every trigger event queued
 * before this call.
 *
 * WHY. Every data/ write in every suite fires guardFcfActa and
 * updateTeamDates, and every club write onClubLeadChanged — some 600 events
 * in one `test:functions` run, delivered one after another. A suite late in
 * the run that waits on a trigger waits behind all of them: on 2026-10-20 the
 * acta guard's first event for its stale-phone test arrived 33 s after the
 * write, past that test's 25 s, and the suite failed one run in two. The
 * wipe-team-data.js runs in wipe.test.js started while that tail was still
 * being worked through, and failed under the load. Which test failed changed
 * from run to run, and a clean worktree on a quieter machine passed — timing,
 * not code.
 *
 * HOW. Write a probe shard whose one effect is updateTeamDates copying its
 * date onto the probe team's doc, and wait for that date. The emulator
 * delivers in order, so once the probe has been handled, so has everything
 * queued before it. The probe is `fa_training`, which guardFcfActa ignores.
 *
 * ⚠ ITS OWN APP, ON THE FUNCTIONS' PROJECT. Triggers fire for the project
 * the emulators were started with (`--project`, GCLOUD_PROJECT) and no other.
 * wipe.test.js works in project `esquerrapp` — its script's hardcoded id — so
 * a probe written with ITS db is never handled and the drain waits for ever.
 */
const admin = require('firebase-admin');

const PROBE_TEAM = '_triggerDrain';
const PROJECT = process.env.GCLOUD_PROJECT || 'demo-esquerrapp';
let seq = 0;
let probeDb = null;

async function drainTriggers(ms) {
  if (!probeDb) {
    const app = admin.apps.find((a) => a && a.name === 'trigger-drain') ||
      admin.initializeApp({projectId: PROJECT}, 'trigger-drain');
    probeDb = app.firestore();
  }
  const token = 'drain-' + process.pid + '-' + Date.now() + '-' + (++seq);
  const team = probeDb.doc('teams/' + PROBE_TEAM);
  await team.collection('data').doc('fa_training__none').set({
    category: 'none', v: JSON.stringify([{id: 'probe', date: token}]),
  });
  const started = Date.now();
  const deadline = started + (ms || 100000);
  for (;;) {
    const snap = await team.get();
    if (((snap.data() || {}).trainingDates || []).includes(token)) return Date.now() - started;
    if (Date.now() > deadline) {
      throw new Error('the Functions emulator did not reach the drain probe in ' +
          Math.round((Date.now() - started) / 1000) + ' s — is updateTeamDates loaded?');
    }
    await new Promise((r) => setTimeout(r, 250));
  }
}

module.exports = {drainTriggers, PROBE_TEAM};
