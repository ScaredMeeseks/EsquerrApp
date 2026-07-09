# HANDOFF — EsquerrApp

_Rolling document, overwritten each session. Last updated: 2026-07-10 (Phase 1 code complete)._

## Current state

- Repo: `c:\DATA\CLAUDE\EsquerrApp` → https://github.com/ScaredMeeseks/EsquerrApp. Firebase project `esquerrapp`. Frontend = GitHub Pages from `main`; APK = CI build on push; rules/functions = `./deploy.sh` in Cloud Shell.
- Full senior-dev review completed; 3-phase overhaul plan approved (full plan at `~/.claude/plans/i-have-another-project-inherited-castle.md`; findings + changelog in CONTEXT.md).
- **Phase 1 code is COMPLETE on branch `phase1-reliability-security`** (all JS syntax-checked, CACHE_NAME bumped to v18). **NOT yet deployed** — deploy order matters (server first, see below).

## Session summary (2026-07-07 → 2026-07-10)

1. Review + Part A (workflow files, deploy.sh guard, storage.rules wired).
2. Phase 1 implemented — see CONTEXT.md changelog for the full detail:
   - Demo/seed system removed (incl. `seedMockAvailability` which wrote RANDOM availability into the real club, and the admin reset that mirrored demo data).
   - Acknowledged player writes: `DB.setItemAcked` + `ackSave` (pending spinner → confirmed/queued ring, error toasts via `db-write-error`); RPE/injury keys moved to per-field MERGE_KEYS; re-render deferred until server ack; multi-tab persistence failure now warns.
   - `joinClub` Cloud Function + server-only `clubCodes/` (codes removed from readable club docs); register/join flows call it; lead auto-match removed; `setSession` strips server-owned fields.
   - firestore.rules + storage.rules rewritten (team-scoped users reads, no self teamId/isTeamLead/isAdmin changes, player data-key allowlist, owner-only profile pics).
   - Scheduler dual-format fix (`parseDataDoc`) — fixes live reminder-spam bug; cleanup-seed rewritten (dry-run default, RPE section, fixes number/string matchId bug that would have deleted ALL legit match availability).

## Pending / next steps (IN THIS ORDER)

1. **USER — one-time setup**: add `c:\DATA\CLAUDE\EsquerrApp` to the VS Code workspace; in Cloud Shell: `git clone https://github.com/ScaredMeeseks/EsquerrApp.git ~/EsquerrApp` and `gsutil mb -p esquerrapp gs://esquerrapp-backups`.
2. **Phase 1 deploy sequence (Cloud Shell + git)**:
   a. Backup: `gcloud firestore export gs://esquerrapp-backups/pre-phase-1-$(date +%F) --project esquerrapp`
   b. Merge `phase1-reliability-security` → `main`, push (this also deploys frontend + builds APK — acceptable: new JS join flow needs the function, so do c. immediately after).
   c. `cd ~/EsquerrApp && git pull && ./deploy.sh functions`
   d. `npm install firebase-admin --no-save && node scripts/setup-club-codes.js`
   e. `node functions/cleanup-seed.js` (review dry-run!) → `node functions/cleanup-seed.js --apply`
   f. `./deploy.sh rules`
   g. Install the fresh APK from the Actions run on test devices.
3. **Verify** (Phase 1 checklist, plan §1.8): simultaneous two-player answers both persist; airplane-mode answer shows queued + syncs; wrong club code rejected + rate limit; console attempts to self-set `isTeamLead`/foreign `teamId`/read foreign clubs all denied; staff training detail shows NO fabricated answers; manual `scheduledTrainingReminder` run notifies only genuinely-unanswered players; profile pic upload works, foreign-uid filename denied.
4. Phase 2 (per-record player data + custom claims + dual-write bridge + migration) and Phase 3 (perf: listener consolidation, targeted re-render, scheduler denormalization, gitignore www/, FCF defaults) in later sessions, each gated on the previous phase verified in production.
5. Future item: move hosting to Firebase Hosting (cache-control; fixes GitHub Pages stale-JS problem).

## Known trade-offs / notes

- Staff-role self-selection is still open (any member can pick "staff" at onboarding) — this is the app's current design; Phase 2's `setRole` makes it lead-controlled.
- Players can still write/delete the allowlisted `data/{key}` docs (incl. `fa_users`) until Phase 2's per-record model.
- Orphaned i18n keys (`settings.reset_*`, `confirm.erase_all`) left in app.js — harmless.
- The join code is now REQUIRED at registration for everyone except the superuser (leads included — the function detects them by `leadEmail`).
