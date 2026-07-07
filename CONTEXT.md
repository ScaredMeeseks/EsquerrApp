# CONTEXT.md — EsquerrApp living architecture doc

_Updated after every code change. Newest changelog entries at the bottom._

## Snapshot (2026-07-07, before the overhaul)

Football club management PWA for L'Esquerra de l'Eixample FC, designed to become multi-club. Vanilla JS SPA (`js/app.js` ~14,900 lines), Firebase (Auth/Firestore/Storage/FCM/Functions v2), GitHub Pages frontend, Capacitor Android wrapper, CI APK build on push.

### Data flow
localStorage is the primary synchronous store. `js/db.js` monkey-patches `localStorage.setItem/removeItem` and mirrors ~22 `SYNCED_KEYS` into `teams/{teamId}/data/{key}` docs — blob format `{v:"<json>"}` except `MERGE_KEYS` (training/match availability, staff override) which use per-field merges. `DB.init(teamId)` downloads Firestore→localStorage on login and starts one `onSnapshot` per key; remote changes dispatch `firestore-sync` → debounced full-page re-render.

### Known problems driving the 3-phase overhaul (plan: `~/.claude/plans/i-have-another-project-inherited-castle.md`)
1. **Attendance loss**: fire-and-forget writes (no ack/feedback), `fa_player_rpe` & side-effect blobs (`fa_users`, `fa_staff_notifications`) are last-write-wins whole-blob replaces, `seedMockAvailability()` injects RANDOM answers into real clubs (local `fa_seeded` flag never clears), admin "reset data" mirrors demo data into the live club, multi-tab disables offline write queuing silently.
2. **Club isolation broken**: `clubs` docs (incl. join `code`) world-readable; `users` self-update unrestricted (self-assign `teamId`/`isTeamLead`); players can write/delete ANY `data/{key}`; `archiveSeason` trusts self-reported doc flags; `storage.rules` not wired into firebase.json; profilePics writable by anyone.
3. **Scalability**: blob-per-key docs (1MB limit looming), 22 listeners + full-page re-render per remote change, schedulers full-scan all teams hourly with sequential per-user reads, `www/` (3MB) committed but CI-generated, Esquerra's FCF leagues hardcoded as every club's default. Live bug: `scheduledTrainingReminder` reads `.v` on merge-format availability docs → treats everyone as unanswered.

### Overhaul plan summary
- **Phase 1 (this effort)**: remove seed system; acked player writes with pending/confirmed/queued UI; extend MERGE_KEYS (rpe, injury notes/zone); `joinClub` callable + secret `clubCodes/`; rules rewrite (team-scoped reads, field-level user updates, player write allowlist); storage rules wired+fixed; scheduler dual-format fix; cleanup-seed extended to RPE.
- **Phase 2**: per-record collections (`trainingAvail/{uid}_{date}`, `matchAvail`, `rpe`, `injuries`, `notifications`) with ownership-by-docId rules; Auth custom claims (`teamId`, `role`) via joinClub v2/setRole/backfill; dual-write + server bridge for old clients; migration script.
- **Phase 3** (gated on old-client extinction): retire dual-write/legacy blobs; 1 collection listener + targeted re-render; schedulers query `nextTrainingDate` denormalized fields + collectionGroup tokens; gitignore www/; remove hardcoded FCF defaults; CI CACHE_NAME guard.

## Changelog

### 2026-07-07 — Part A: workspace + workflow setup
- Added `.firebaserc` (esquerrapp), `.gitattributes` (LF normalization), guarded `deploy.sh` (Cloud Shell rules/functions deploys with repo/project asserts), `CLAUDE.md`, this file, `HANDOFF.md`.
- `firebase.json`: wired `storage.rules` (existed but was never deployed).
