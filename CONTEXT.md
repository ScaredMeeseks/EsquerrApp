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

### 2026-07-10 — Phase 1: attendance reliability + security hotfix (branch `phase1-reliability-security`)

**1. Demo/seed system removed entirely** (`js/app.js`): `seedData`/`seedDemoPlayers`/`seedPlayerResponses`/`seedMockAvailability` deleted, along with the boot call, the staff-training-detail `fa_seeded` invocation (the source of RANDOM fabricated availability in the real club), the admin "reset data" button+handler (`localStorage.clear()`+reseed mirrored demo data into the live club), and all seed-flag references. Orphaned i18n keys (`settings.reset_*`, `confirm.erase_all`) left in place, harmless.

**2. Acknowledged player writes**:
- `js/db.js`: `fa_player_rpe`, `fa_injury_notes`, `fa_injury_zone` added to `MERGE_KEYS` (flat `{uid}_...` keys → per-field merges; existing legacy-blob migration converts docs on next client load). New `DB.setItemAcked(key,val)` returns the Firestore SERVER-ack promise. All silent `.catch(console.error)` now dispatch a `db-write-error` window event via `_onWriteError`.
- `js/app.js`: new `ackSave(key, value, el)` helper — localStorage write is instant, tapped control shows `save-pending` spinner → `save-confirmed` (green ring) on server ack, or `save-queued` (amber ring) after 4s timeout with a Catalan warning toast when offline/persistence-failed; `db-write-error` listener shows error/permission toasts (reuses `_showPushToast`). Converted ALL player submit paths: training availability (3 handlers + injured path via `commitInjuryNote`), match availability (set/unset), RPE (actions page + extra training), injury note/zone. Page re-render now happens AFTER ack/queue resolution, so the indicator is visible and the UI never claims success early. New i18n keys `save.*` (ca/es/en); CSS states appended to `css/style.css`.
- `js/firebase-config.js`: `enablePersistence` failure sets `window._persistenceFailed` (multi-tab = offline writes NOT queued → ackSave warns loudly).
- Clobber reducers: `deriveFitnessStatus` only rewrites `fa_users` when status/note actually changed; `pruneOldRpe` gated to once/day/device (`fa_last_rpe_prune`, local-only).

**3. Server-side club membership** (`joinClub` callable, `functions/index.js`): validates code format, per-uid rate limit (10/h via `joinAttempts/{uid}`), looks up `clubCodes/{CODE}` → `{clubId}` (new server-only collection), writes `users/{uid}.teamId/isTeamLead` server-side, returns club public config. Client (`js/app.js`): `handleJoinClub` + register flow call the function (register: auth account → joinClub → THEN profile doc create, so failed codes leave no orphan); lead auto-match-by-email queries REMOVED everywhere (leads join with the code; function detects them via `leadEmail`); `getClubByCode` deleted; `createClub` writes `clubCodes/{code}` and no longer stores `code` on the club doc; `_loadClubList` reads codes from `clubCodes` (superuser-only); `setSession` strips server-owned fields (`teamId`/`isTeamLead`/`isAdmin`) from every profile merge. `index.html`: added `firebase-functions-compat.js`. One-time migration `functions/setup-club-codes.js` moves existing codes.

**4. `firestore.rules` rewritten**: `users` reads team-scoped (list queries MUST filter `where('teamId','==',…)`); self-create without `teamId/isTeamLead/isAdmin`; self-update may not CHANGE those three (roles self-selection kept — onboarding design, tightens in Phase 2); staff-of-team updates limited to `[roles, position, playerNumber, team, category, fitnessStatus, injuryNote]` (exactly what the registrations page writes); `data/{key}` writes staff-only except a player-key allowlist (availability/RPE/injuries/fa_users/fa_staff_notifications — the last two still needed by player flows until Phase 2); `clubs` readable by own members only; `clubCodes` superuser-only; `joinAttempts` functions-only. `js/db.js` reconcile now queries `users` with `where('teamId','==',teamId)` (was a FULL collection scan of all clubs' users).

**5. `storage.rules`**: profilePics writes now owner-only (`{uid}.{ext}` filename enforced against auth uid; was: any authed user could overwrite anyone's photo).

**6. Scheduler dual-format fix** (`functions/index.js`): new `parseDataDoc()` reads data docs in blob OR per-field format; applied to availability/RPE reads in all three schedulers (fixes live bug: merge-format docs read via `.v` made every player look unanswered → reminder spam). Server `MERGE_KEYS` synced with client (adds rpe/injury notes/zone) so `archiveSeason` resets those docs per-field.

**7. `functions/cleanup-seed.js` rewritten**: dry-run by default (`--apply` to delete), dual-format reads, covers `fa_player_rpe` (uid-in-roster + real date/matchId; `extra_` entries kept if uid real), demo uids 100001–100006 excluded from the "real" roster, and **fixes a latent bug**: match ids are numbers in `fa_matches` but strings in availability keys — the old `Set.has()` comparison never matched, so the old script would have deleted ALL legitimate match availability. Everything normalized to strings now.

**8. `sw.js`**: `CACHE_NAME` → `esquerrapp-v18`.

**Deploy order (critical)**: functions → `setup-club-codes.js` → `cleanup-seed.js` dry-run/apply → rules → frontend push → APK. Rules before functions would break joins; frontend before functions would break joins for new-JS users.
