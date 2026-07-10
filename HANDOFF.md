# HANDOFF — EsquerrApp

_Rolling document, overwritten each session. Last updated: 2026-07-10 (Phases 1, 2 and 3a all deployed)._

## Current state

- Repo: `c:\DATA\CLAUDE\EsquerrApp` → https://github.com/ScaredMeeseks/EsquerrApp. Firebase project `esquerrapp`. Frontend = GitHub Pages from `main`; APK = CI build on push; rules/functions = `./deploy.sh` in Cloud Shell. One-off scripts live in `functions/` (root npm installs are broken on Cloud Shell).
- 3-phase overhaul (full plan at `~/.claude/plans/i-have-another-project-inherited-castle.md`; findings + changelog in CONTEXT.md).
- **Phases 1, 2 and 3a ALL DEPLOYED to production** (2026-07-10): functions (incl. schedulers v3 + updateTeamDates + bridge), claims backfilled, data migrated to record collections, hybrid rules, team-date arrays backfilled, frontend **v20** live on Pages (`check-deploy.js`'s one ✘ was Pages deploy latency — verified serving v20 minutes later). The real club's teamId is literally `default`.
- **Phase 3b NOT started** — gated on old-APK extinction (`bridgeLegacyPlayerData` invocations ≈ 0 in Cloud Logging for ~a week) AND the test suite passing.
- **Automated verification done (2026-07-11)**: adversarial code audit of the whole overhaul (inline) — overhaul is structurally sound; found + fixed ONE real bug (record-listener empty-guard left a stale availability entry on other devices when a collection emptied to zero — e.g. coach's view; fixed in js/db.js, frontend now v21, deployed). A `@firebase/rules-unit-testing` club-isolation suite is committed at `test/` — **run it in Cloud Shell: `cd ~/EsquerrApp/test && npm install && npm test`** (needs the emulator/Java; won't run on the dev Windows box).
- **STILL NEEDS A HUMAN: the physical/UI test steps below** (two devices, offline toggling, in-app clicks, browser console, Cloud Console function runs). Fresh APK from the latest Actions run should go on the test devices first.

## Session summary (2026-07-10, Phase 3a)

Listener consolidation (one `data/` collection listener via `docChanges()`; ~5 listeners/client, was 22+), `KEY_PAGES` targeted re-render + always-fresh badges, FCF hardcoded league defaults removed (lead setup hint instead) + full-path proxy regex, schedulers rewritten around denormalized `trainingDates[]`/`matchDates[]` team-doc arrays (new `updateTeamDates` trigger; `array-contains` queries instead of full scans; availability/RPE read from record collections; roster once per team; `Promise.all`; summary-only logs), parallel `getTokensForUsers`, `www/` untracked + gitignored, CI guard failing builds that change js/css/html without an sw.js bump, sw v20.

## Pending / next steps (IN THIS ORDER)

1. **Phase 3a deploy (Cloud Shell)**:
   a. Backup: `gcloud firestore export gs://esquerrapp-backup/pre-phase-3a-$(date +%F) --project esquerrapp`
   b. `cd ~/EsquerrApp && git fetch && git checkout phase3-performance && git pull`
   c. `./deploy.sh functions`
   d. **IMMEDIATELY** `node functions/backfill-team-dates.js` — until it runs, the schedulers see no teams and send no reminders.
   e. Merge to main + push (frontend v20 + APK): `git checkout main && git pull && git merge phase3-performance && git push`
   f. `node functions/check-deploy.js` (now expects v20)
2. **THE DEFERRED TEST SUITE (Phases 1+2+3a)**:
   - [ ] Two phones, two players answer the SAME training simultaneously → both persist (staff page + `trainingAvail` records in console).
   - [ ] Airplane-mode answer → amber "pendent de sincronitzar" → reconnect → syncs; two-tab session shows the multi-tab warning.
   - [ ] Kill network mid-write → error/retry toast appears (db-write-error path).
   - [ ] RPE from two devices concurrently → both entries persist.
   - [ ] New account joins with real club code (works); wrong code rejected with no orphan account; 11 rapid attempts → rate-limited.
   - [ ] Console as player: self-set `isTeamLead`/foreign `teamId` denied; `collection('clubs').get()` denied; write `trainingAvail/{otheruid}_...` denied; own-uid record with mismatched `uid` field denied.
   - [ ] Staff training detail shows NO fabricated availability for unanswered players.
   - [ ] Force-run `scheduledTrainingReminder` (Cloud Console) with a training ~4h out → only genuinely-unanswered players notified; runs with no training today exit instantly ("no team trains today/tomorrow" log).
   - [ ] Profile pic upload works; foreign-uid filename denied.
   - [ ] Old-APK device answers availability → record doc appears (`source:'bridge'`); new client sees it. New client answers → old client sees it (blob).
   - [ ] Lead changes a member's role via registrations → member's client picks up new claims without re-login (staff pages appear/disappear).
   - [ ] archiveSeason on a test team → blobs AND record collections archived + cleared; non-lead denied; team-doc date arrays reset by the trigger.
   - [ ] Phase 3a specific: device B on the tactics page does NOT re-render when device A edits the roster availability; device B on player-home DOES update. Staff edits schedule → team doc `trainingDates` updates within seconds (console).
   - [ ] Player-home for a club WITHOUT fcfLinks shows the setup hint (leads) / nothing (players) — no Esquerra tables.
3. **Phase 3b** (gated on `bridgeLegacyPlayerData` ≈ 0 invocations for a week in Cloud Logging + test suite passed): remove dual-write halves + the 6 legacy player keys from MERGE/SYNCED sets, drop the transitional `data/{key}` player allowlist + the `me()` rules fallback, delete the bridge, final `migrate-player-data.js --apply` reconcile, optionally delete legacy blob docs (`--delete-legacy` flag to add), injuries per-record collection, notifications collection, read-time fitness derivation.
4. Future item: move hosting to Firebase Hosting (cache-control; fixes GitHub Pages stale-JS problem).

## Known trade-offs / notes

- Staff-role self-selection still open (onboarding design) — setRole syncs claims for it; lead-controlled tightening is a product decision for Phase 3b.
- Players can still write/delete the allowlisted legacy `data/{key}` docs until Phase 3b.
- `fa_injuries` (array) remains the one merge-unsafe player-written blob (rare writes; Phase 3b).
- Hybrid rules keep a `me()` doc-read fallback — slightly slower rules until Phase 3b removes it.
- Cloud Shell gotchas: `.firebaserc` is tracked — never `rm` it (deploy.sh checks it); scripts must run from `functions/` (module resolution); read every dry-run before `--apply`.
