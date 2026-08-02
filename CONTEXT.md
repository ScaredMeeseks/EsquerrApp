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

### 2026-07-10 — Phase 2: per-record player data + custom claims (branch `phase2-records-claims`)

**Data model**: player-submitted data is now CANONICAL in per-record subcollections — `teams/{id}/trainingAvail/{uid}_{date}` (`{uid, date, value, updatedAt, source}`), `teams/{id}/matchAvail/{uid}_{matchId}`, `teams/{id}/rpe/{legacy key verbatim}` (`{uid, rpe, minutes, ua, tag, date, …}`). Doc IDs = the legacy blob keys, so rules enforce ownership by ID prefix and migration is an identity map. `source` ∈ `client|bridge|migration`.

**Dual-write + bridge (old-client compatibility until Phase 3)**:
- New clients: `ackSaveRecord()`/`ackRemoveRecord()` in app.js write the legacy localStorage blob (mirrored to the legacy merge doc by the monkey-patch — old clients keep seeing new answers) AND the canonical record via `DB.submit()`/`DB.removeRecord()`; the Phase-1 ack UI (pending/confirmed/queued) now tracks the RECORD write. All 8 player write sites converted (training avail ×3 + injured path, match avail set/unset, RPE actions + extra, un-answer paths).
- Old clients: `bridgeLegacyPlayerData` Firestore trigger (functions/index.js) diffs every write to the 3 legacy keys and upserts/deletes record docs (`source:'bridge'`). Loop-safe: value-identical rebuilds don't re-dispatch.
- db.js: record-collection `onSnapshot` listeners rebuild the localStorage blobs (read paths unchanged); guard skips rebuild when the collection is empty but the blob isn't (pre-migration safety). Legacy doc listeners removed for those 3 keys.

**Custom claims `{teamId, role: lead|staff|player}`**:
- `joinClub` v2 sets claims + stamps `users/{uid}.claimsUpdatedAt`; new callable `setRole({uid, roles[]})` — self (player/staff, current onboarding design), lead-of-team, or superuser; keeps doc roles + claims in sync. `archiveSeason` authorizes via claims (users-doc fallback) and now archives+clears the record collections BEFORE resetting blobs (bridge would otherwise delete records pre-archive).
- Client: token force-refresh after join/register; `claimsUpdatedAt` snapshot watcher refreshes the token and re-inits DB if the teamId claim changes (e.g. setRole by lead — no re-login needed); `persistSessionRoles` (onboarding pick) and registrations `autoSaveFromRow` route roles through `setRole`.
- `functions/backfill-claims.js`: one-time claims stamp for existing users (NOTE: the real club's teamId is literally `default`).
- `functions/migrate-player-data.js`: blob→records; `create()` ignoring ALREADY_EXISTS (idempotent, never clobbers dual-written records); `--apply`/`--verify` modes; legacy docs left in place.

**Rules (HYBRID — claims first, `me()` doc fallback for pre-refresh tokens; fallback removed in Phase 3)**: no deploy-wait needed. Per-record collections: read same-team; create/update owner-only (`docId` prefix + `uid` field match) or staff; delete owner/staff. Legacy `data/{key}` player allowlist unchanged (transitional). `users` self-update also blocks `claimsUpdatedAt`; roles self-changes still allowed transitionally (old clients write them directly). Seasons wildcard covers record archives. Storage rules unchanged (lead badge upload isn't a feature yet).

**Deviations from the approved plan (deliberate scope cuts, moved to Phase 3)**: injuries records (`fa_injuries` array is staff-dominated; notes/zone already merge-safe) and the notifications collection (informational; blob kept). `deriveFitnessStatus` keeps the Phase-1 write-on-change behavior instead of full read-time derivation.

**`sw.js`**: `CACHE_NAME` → `esquerrapp-v19`.

**Deploy order (critical)**: functions (bridge starts materializing records) → `backfill-claims.js` → `migrate-player-data.js` dry→apply→verify → rules → frontend merge+push (records need rules BEFORE new JS) → APK. No wait needed between backfill and rules thanks to the hybrid fallback.

**Phase 2 deploy incidents (2026-07-10, all resolved)**: the first pass deployed only functions (backfill/migrate/rules/frontend skipped) — caught by `functions/check-deploy.js`; Phase 1's `cleanup-seed --apply` had also been skipped AND had a silent no-op bug on blob-format docs (`FieldValue.delete()` on `{v}` docs does nothing) so the fabricated data got migrated into the record collections — fixed cleanup to rewrite the `v` blob (bridge then pruned the fake records automatically) and re-ran the whole sequence. `check-deploy.js` now guards every deploy.

### 2026-07-10 — Phase 3a: performance + housekeeping (branch `phase3-performance`)

Phase 3 is split: **3a (this)** = everything not gated on old clients; **3b (later, gated on `bridgeLegacyPlayerData` invocations ≈ 0)** = retire dual-write/legacy player blobs/rules fallback + transitional allowlist, injuries records, notifications collection.

- **db.js**: ONE `onSnapshot` on the whole `data/` collection using `docChanges()` (was one listener per key). Total listeners per client now ~5 (data + 3 record collections + own user doc), down from 22+.
- **app.js targeted re-render**: `KEY_PAGES` map gates the `firestore-sync` full-page re-render to pages that actually display the changed key; unmapped keys (e.g. `fa_users`) still re-render everywhere; badges (`updateActionsBadge`, `updateStaffNotifBadge`) refresh on every sync event. Debounce + edit-page skip-list kept.
- **FCF**: removed the hardcoded Esquerra league defaults — clubs without `fcfLinks` config show a setup hint to leads (nothing to players). `fcfClassificacio` proxy allowlist tightened to a full-path regex.
- **Schedulers rewritten** (functions/index.js): new `updateTeamDates` trigger denormalizes `trainingDates[]`/`matchDates[]` onto team docs from the fa_training/fa_matches blobs; all three schedulers now query `array-contains`(-any) on those instead of full team scans, read availability/RPE from the **record collections**, query the roster once per team (was per-match), fan out with `Promise.all`, and log one summary line per team (was per-user/session). `getTokensForUsers` parallelized. **`functions/backfill-team-dates.js` MUST run right after deploying — until then schedulers see no teams.**
- **Housekeeping**: `www/` untracked + gitignored (CI rsyncs it fresh every build); CI guard step fails the build when `js/`/`css/`/`index.html` change without an `sw.js` bump (checkout fetch-depth: 2); `check-deploy.js` expects the current cache version (single `CURRENT` constant).
- **`sw.js`**: `CACHE_NAME` → `esquerrapp-v20`.

**Deploy order**: functions → `backfill-team-dates.js` (immediately!) → frontend merge+push. No rules changes in 3a.

### 2026-07-11 — Automated verification (audit + rules tests)

Spawned two subagents (Sonnet: rules tests; Opus: adversarial audit) — both hit the shared session limit early, so the work was done inline instead.

- **Adversarial audit** of the full overhaul diff: verified setRole can't escalate to lead (claim role derives from the target's existing `isTeamLead`; requested roles constrained to player/staff), matchId is consistently stringified across bridge/migration/scheduler, the claims watcher no-ops on the first snapshot (no refresh storm; guards pending serverTimestamp), archiveSeason archives record collections BEFORE the blob reset, KEY_PAGES falls back to re-render-everywhere for unmapped keys, and `removeItem` only touches local-only `fa_tactic_*` keys (never synced docs).
- **Bug found + fixed** (js/db.js): the record-listener empty-guard (`if (snap.empty && existing !== '{}') return`) also fired when the LAST record in a collection was deleted on another device, leaving a stale entry in that device's blob (e.g. a coach still seeing a withdrawn availability). Now tracks a per-collection "seen populated" flag so only the genuine pre-migration first-load is guarded; real "all deleted" snapshots clear the blob. Frontend → **v21**, deployed.
- **Rules test suite** (`test/`): self-contained `@firebase/rules-unit-testing` covering cross-club isolation, self-escalation, staff scope, data-key allowlist, per-record ownership, club-code secrecy, superuser overrides. Can't run on the dev Windows box (no Java); run in Cloud Shell: `cd ~/EsquerrApp/test && npm install && npm test`.

### 2026-07-19 — Phase 3b: legacy retirement (branch `phase3b-legacy-retirement`)

**Scope note**: implemented WITHOUT the manual UX pass (user time constraint). Risk contained by: bridge-extinction Cloud Logging check is step 1 of the deploy (abort if old APKs still write); legacy blob docs NOT deleted (`--delete-legacy` exists but deliberately not run — full rollback = redeploy previous functions/rules + revert frontend). The deferred 3b tail (injuries per-record collection, notifications collection, read-time fitness derivation, staff-role self-selection tightening) is new-feature work needing its own testing — **still pending**.

- **js/db.js**: `fa_training_availability`/`fa_match_availability`/`fa_player_rpe` removed from `SYNCED_KEYS`+`MERGE_KEYS` — their localStorage blobs are now local-only read caches rebuilt from record snapshots; the monkey-patch no longer mirrors them to `data/` docs (dual-write half gone). Legacy docs are never loaded at init; instead `init()` awaits the FIRST snapshot of each record collection (cache or server, error-safe) so the first render still sees availability/RPE. Record-cache keys flushed on team switch + `flush()`. Data-listener `RECORD_LS_KEYS` skip removed (redundant now).
- **js/app.js**: `ackSaveRecord`/`ackRemoveRecord` unchanged in behavior (their blob write is now local-only) — comments updated. `pruneOldRpe` rewritten: deletes >1yr `rpe` RECORD docs via `DB.removeRecord` (players only own-uid records, staff everything) instead of rewriting the blob — the old blob-prune would have been resurrected by every record snapshot.
- **firestore.rules**: claims-only auth — `me()` users-doc fallback DELETED from `sameTeam`/`isStaffOf`/`isLeadOf` (claims backfilled 2026-07-10, tokens refresh hourly; no live session can lack them). `data/{key}` player allowlist shrunk: the 3 record-backed keys removed (frozen legacy docs now staff-only); `fa_injury_notes`/`fa_injury_zone`/`fa_injuries`/`fa_users`/`fa_staff_notifications` remain until the deferred items land.
- **functions/index.js**: `bridgeLegacyPlayerData` + `BRIDGE_KEYS` DELETED (deploy prompts to confirm the function deletion — answer yes). archiveSeason unchanged (server `MERGE_KEYS` intentionally still lists the frozen merge docs — it describes doc FORMAT for resets, now a superset of client MERGE_KEYS).
- **functions/migrate-player-data.js**: new `--delete-legacy` mode (dry-run by default, `--apply` to act; per-doc guard refuses deletion while records < blob entries). NOT run this phase.
- **functions/check-deploy.js**: bridge check INVERTED (legacy write must produce NO record within 30s); migration-count mismatches downgraded to warnings (frozen blob legitimately diverges once un-answers/pruning delete records); expects **v22**.
- **test/rules.test.js**: legacy-availability player write flipped to DENIED (+ RPE), staff-still-can case added, new "claims-only" suite proving doc-only membership (no claims) is denied everywhere the `me()` fallback used to allow.
- **sw.js**: `CACHE_NAME` → `esquerrapp-v22`.

**Deploy order (critical)**: bridge-extinction logging check (GATE — abort if invocations) → backup → functions (confirm bridge deletion) → `migrate-player-data.js` final reconcile `--apply` + `--verify` → rules → frontend merge+push → `check-deploy.js`. Rules before the reconcile would be harmless (players stopped writing legacy docs when v21 clients dual-wrote records anyway), but keep the order — the reconcile snapshots whatever the last legacy writes were.

### 2026-08-02 — Phase 4: roster-driven membership + category-scoped staff

Closes the "lead-controlled staff-role tightening" item that has been on the deferred list since 3b, and answers the two questions it left open: there was nowhere to say who the staff are, and nowhere to say who the players are. Membership now comes from per-team email lists that the lead and staff maintain; registration is a **hard gate** against them, and staff see only their own categories.

**Data model** — new subcollection `clubs/{clubId}/rosters/{category}-{letter}` (same key shape as `fcfLinks`/`schedules`) holding `{staffEmails[], playerEmails[], updatedAt}`. Deliberately NOT on the club doc: that is readable by every member and these are addresses, often of minors. New server-owned `users/{uid}.staffCategories[]` and a third custom claim **`cats`** alongside `{teamId, role}`.

- **firestore.rules**: new nested `match /rosters/{teamKey}` (subcollections do not inherit the parent match). Read = superuser | lead | staff whose `cats` claim contains `teamKey.split('-')[0]`; staff writes restricted to `playerEmails` in their own categories, with `create` and `update` as separate rules because `resource` is null on create. `users` self-update and self-create now also block **`roles`, `category`, `team`, `staffCategories`** — leaving them open made the gate bypassable from the console — and `roles` is out of the staff allowlist (it only moves through `setRole`).
- **functions/index.js**: `loadRosters`/`membershipFrom`/`resolveMembership`/`claimsFor` helpers. **`joinClub`** refuses any address on no list (lead + superuser bypass, or a new club could never bootstrap) and writes `roles`/`category`/`team`/`staffCategories` + the `cats` claim server-side, returning them so the client skips the role screen. **`setRole`**: a SELF call can no longer choose its own roles — they are re-derived from the lists (this was a straight path to staff); `cats` is never caller-supplied. New **`onRosterWritten`** trigger (`clubs/{clubId}/rosters/{teamKey}`) diffs per-address membership *signatures* (so an address moved between the two lists is caught too) and re-applies claims to already-registered members — that is what makes a grant or a revoke land live.
- **js/app.js — lead UI**: fourth section in "Configura el teu club" (`_refreshTeamSetupStaff`, `_buildStaffEmailRow`, `_collectStaffEmailsFromDom`), one block per team, reusing the `.ts-training-list` repeatable-row pattern. Unlike the FCF/schedule sections it re-renders from the DOM first, so toggling a letter does not wipe half-typed addresses. Saved as separate roster writes, only for lists that actually changed.
- **js/app.js — staff UI**: `renderPreRegisteredPlayers` card on Registrations, scoped to the selected category, showing per address whether it has been claimed. `savePlayerEmailList` is awaited and toasts on failure.
- **js/app.js — scoping**: `canSeeAllCategories()` → **`getVisibleCategories()`** (lead/admin: all enabled; staff: intersection with `staffCategories`; player: own). `getCurrentCategory()` clamps a stale `_viewCategory`, the cat-bar click handler clamps again, and staff with no categories get an `error.no_categories` empty state instead of blank pages. Roster docs are fetched **by id, never as a collection query** (one denied doc fails the whole query).
- **Pages that never filtered, now do**: medical (+`medical-detail` drill-down guard, + added to `CATEGORY_PAGES`), matchday **draft** rows, notifications (new `uid`/`category` on each entry; historic ones with neither stay visible to all). `tactics` REMOVED from `CATEGORY_PAGES` — its boards have no category, so the bar implied a filter that did nothing. Uncategorised players no longer leak into every squad list (`manage-roster`); they still show on Registrations, which is where they get assigned.

**Three pre-existing bugs fixed because the feature depends on them:**
1. **Silent `setRole` rejection** — a non-lead staff member changing a role got `permission-denied` swallowed into `console.warn` while `fa_users` kept the new value, so the roster displayed a role that did not exist. Now awaited, reverted and toasted; the status dropdown is lead-only (dead path for anyone else).
2. **`renderStaffTraining` index misalignment** — rows were numbered off the *filtered* list but `readTraining()`/remove index into the full `fa_training` blob, on every keystroke. Rarely bit before because staff usually had no filter; with scoping they always do. Rows now carry their index into the full array.
3. **`handleRegister` overwriting the server** — it merged `roles:[]`, `category:''`, `team:''` straight over what `joinClub` had just derived. `setSession` stripped only `teamId/isAdmin/isTeamLead`; it now strips the membership fields too.

Also: whole-blob writes that the new filtering would have turned into data loss are now merge-aware — matchday draft save/remove/add and notification mark-read/clear-all all carry the out-of-scope entries through instead of writing only what is on screen. Fixed `cat + '_' + letter` → `cat + '-' + letter` in the matchday add-row handler (schedules are hyphen-keyed, so home-game defaults never resolved). Staff self-selection removed from the role screen.

**New**: `functions/prefill-rosters.js` (dry-run + `--apply`) seeds the lists from current members and reports anyone it cannot place. `check-deploy.js` gains a `[1b/5]` roster check (everyone listed, staff have categories, `cats` claim matches the doc) and expects **v23**. `test/rules.test.js` gains a roster suite + membership-field self-write denials; the pre-existing "self-create with roles" case flipped to denied.

**Deploy order (critical)**: `prefill-rosters.js` dry-run → fix every UNPLACEABLE (they are locked out otherwise) → `--apply` → `./deploy.sh` (rules + functions) → bump/push frontend → fresh APK → `check-deploy.js`. Rules and functions MUST precede the frontend, or the new UI writes into a ruleset that rejects it.

### 2026-08-02b — "+ Entrenament" could create a session in the past (v24)

Reported straight after the Phase 4 deploy, unrelated to it. `addTraining()` seeds from the latest existing training and steps forward to the next configured weekday. With the club's last session back in May, that stepped to the next Tue/Thu **in May** — right weekday, months in the past. The no-history branch already seeded from yesterday so its result was always in the future; the has-history branch had no such floor.

- `js/app.js` `addTraining()`: the seed is now `max(lastDate, yesterday-noon)`, so an old last session falls back to the from-today search while a current one still cycles on from itself exactly as before. Noon anchoring kept, since `toISOString()` would otherwise shift the date across the UTC offset.
- `lastDate` is now scoped to the **current category** (leniently — undated/uncategorised legacy rows still count, matching how the list filters). The slots it pairs with come from that category's schedule, so taking the last date from a different category was inconsistent.
- Removed a leftover `console.log` that dumped the whole club schedule on every click.

`sw.js` → `esquerrapp-v24`. `check-deploy.js` still expects v23 — update it there if it starts failing the frontend check.
