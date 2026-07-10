# HANDOFF — EsquerrApp

_Rolling document, overwritten each session. Last updated: 2026-07-10 (Phase 2 code complete)._

## Current state

- Repo: `c:\DATA\CLAUDE\EsquerrApp` → https://github.com/ScaredMeeseks/EsquerrApp. Firebase project `esquerrapp`. Frontend = GitHub Pages from `main`; APK = CI build on push; rules/functions = `./deploy.sh` in Cloud Shell. One-off scripts live in `functions/` (root npm installs are broken on Cloud Shell).
- 3-phase overhaul (full plan at `~/.claude/plans/i-have-another-project-inherited-castle.md`; findings + changelog in CONTEXT.md).
- **Phase 1 DEPLOYED to production** (2026-07-10): functions (joinClub v1→v2, scheduler fixes), club codes moved to `clubCodes/`, cleanup-seed applied (fabricated data purged), rules + storage rules, frontend v18. **NOT yet user-tested — all tests deferred to the end (user request).**
- **Phase 2 code COMPLETE on branch `phase2-records-claims`** — NOT yet deployed. The real club's teamId is literally `default` (matters for claims/backfill).

## Session summary (2026-07-10, Phase 2)

Per-record canonical data (`trainingAvail`/`matchAvail`/`rpe`, doc IDs = legacy keys), dual-write in all 8 player handlers + `bridgeLegacyPlayerData` trigger for old clients, custom claims `{teamId, role}` via joinClub v2 + new `setRole` callable + `claimsUpdatedAt` client watcher (no re-login on role change), `backfill-claims.js` + `migrate-player-data.js` (idempotent create-only), HYBRID rules (claims first, doc fallback — no deploy wait), archiveSeason archives record collections before blob reset. Deviations (moved to Phase 3): injuries records, notifications collection, read-time fitness derivation. See CONTEXT.md changelog for detail.

## Pending / next steps (IN THIS ORDER)

1. **Phase 2 deploy (Cloud Shell)**:
   a. Backup: `gcloud firestore export gs://esquerrapp-backup/pre-phase-2-$(date +%F) --project esquerrapp`
   b. From the phase branch (NOT main yet — new JS needs new rules first): `cd ~/EsquerrApp && git fetch && git checkout phase2-records-claims && git pull`
   c. `./deploy.sh functions`
   d. `node functions/backfill-claims.js`
   e. `node functions/migrate-player-data.js` → review → `--apply` → `--verify`
   f. `./deploy.sh rules`
   g. Merge to main + push (deploys frontend v19 + APK): `git checkout main && git pull && git merge phase2-records-claims && git push`
2. **THE DEFERRED TEST SUITE (Phase 1 + Phase 2 together)** — run after Phase 2 deploy:
   - [ ] Two phones, two players answer the SAME training simultaneously → both persist (staff page + `trainingAvail` records in console).
   - [ ] Airplane-mode answer → amber "pendent de sincronitzar" → reconnect → syncs; two-tab session shows the multi-tab warning.
   - [ ] Kill network mid-write → error/retry toast appears (db-write-error path).
   - [ ] RPE from two devices concurrently → both entries persist.
   - [ ] New account joins with real club code (works); wrong code rejected with no orphan account; 11 rapid attempts → rate-limited.
   - [ ] Console as player: self-set `isTeamLead`/foreign `teamId` denied; `collection('clubs').get()` denied; write `trainingAvail/{otheruid}_...` denied; own-uid record with mismatched `uid` field denied.
   - [ ] Staff training detail shows NO fabricated availability for unanswered players.
   - [ ] Force-run `scheduledTrainingReminder` with a training ~4h out → only genuinely-unanswered players notified.
   - [ ] Profile pic upload works; foreign-uid filename denied.
   - [ ] Old-APK device answers availability → record doc appears (`source:'bridge'`); new client sees it. New client answers → old client sees it (blob).
   - [ ] `--verify` migration counts match per team/collection.
   - [ ] Lead changes a member's role via registrations → member's client picks up new claims without re-login (staff pages appear/disappear).
   - [ ] archiveSeason on a test team → blobs AND record collections archived + cleared; non-lead denied.
3. Phase 3 (after tests pass + old APKs extinct — check `bridgeLegacyPlayerData` invocations ≈ 0 in Cloud Logging): retire dual-write + legacy player blobs + rules fallback/allowlist, injuries records + notifications collection, listener consolidation + targeted re-render, scheduler denormalization (`nextTrainingDate`), token uid backfill + collectionGroup, gitignore `www/`, remove hardcoded FCF league defaults, tighten FCF proxy regex, CI CACHE_NAME guard.
4. Future item: move hosting to Firebase Hosting (cache-control; fixes GitHub Pages stale-JS problem).

## Known trade-offs / notes

- Staff-role self-selection still open (onboarding design) — setRole now syncs claims for it; lead-controlled tightening is a product decision for Phase 3.
- Players can still write/delete the allowlisted legacy `data/{key}` docs until Phase 3.
- `fa_injuries` (array) remains the one merge-unsafe player-written blob (rare writes; Phase 3).
- Hybrid rules keep a `me()` doc-read fallback — slightly slower rules until Phase 3 removes it.
- Cloud Shell gotchas: `.firebaserc` is tracked — never `rm` it (deploy.sh checks it); scripts must run from `functions/` (module resolution).
