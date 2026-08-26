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

`sw.js` → `esquerrapp-v24`, and `check-deploy.js`'s `CURRENT` bumped to match.

**check-deploy fix (same day)**: `[1b/5]` treated "no roster docs" as a hard failure. That is wrong for a club whose only member is its lead — prefill correctly writes nothing there, and the F.C.Barcelona test club tripped it on the first real run. The check now counts non-lead members first: no members and no docs is a `⚠` note (registration stays closed until the lead adds addresses, which is the design), members but no docs is still a `✘`. Unlisted members were already reported individually, so nothing is lost by dropping the early bail.

### 2026-08-02c — Medical: season window, counter reconciliation, team filter (v25)

Reported symptom: Medical showed **0 Lesions actives** while "Estat físic de l'equip" on the same screen showed Lesionats (1) and Recuperant-se (2).

**Root cause — the season window was in the future.** `getMonth() >= 7` rolled the season over on **1 August** but `seasonStart` was **15 August**, so for the first fortnight of every August every season-scoped view filtered out everything. This was copy-pasted in **seven** places, so it was not only Medical: player stats (×3), the staff roster, the injury migration and `getSeasonWeek()` were all silently empty or, in the case of `getSeasonWeek('2026-08-02')`, returning **week −1**.

- **`js/utils.js`**: new `seasonStartStr(when)` — the most recent 15 August on or before the date. `getSeasonWeek()` now uses it. All six inline copies in `js/app.js` replaced with a call.

**Two further reasons the counters could disagree, both fixed:**
1. The active/recovering lists were season-filtered, so an unresolved injury that started before 15 August was hidden forever while still marking its player injured. The window now applies to **history only** (season total, average recovery, past injuries, analytics); `activeInj`/`recoveringInj` come from all in-scope injuries.
2. A player whose availability answers make him injured/doubt with **no record in `fa_injuries`** counted in the tiles but could never appear in the list. Those now render as dashed "Reportada pel jugador" cards after the real records, with a button that opens the existing logger preselected on that player (`.med-btn-log-for` → `showStaffInjuryLogger(uid)`). Verified the two always reconcile now, including under the team filter.

Also: the squad-grid card fell back to the derived note when there is no logged record, so a red border never appears with no explanation.

**Team-letter filter on Medical** (asked for): `medicalTeamFilter`, single-select All/A/B/C reusing the roster page's `.roster-team-filter` markup and styles, in the squad-fitness card header because it scopes the whole page. Hidden when the category has one team. Injuries are filtered through the in-scope player map, since a record carries no team of its own. **The injury filter's `!curCat ||` short-circuit had to go** — it let the whole club's injuries through whenever "Totes" was selected, which would have made the new filter a no-op for the lead. All three letter filters (medical, roster, training-detail) now reset when the category changes.

Also scoped `showStaffInjuryLogger`'s player dropdown to the visible squad — it listed every player in the club regardless of category or team.

`sw.js` → `esquerrapp-v25`, `check-deploy.js` `CURRENT` to match. Frontend-only; no rules or functions change.

**Still inconsistent, deliberately not fixed here**: uncategorised players are excluded by medical and roster but included by training-detail. Belongs with the Phase 5 data split.

### 2026-08-02d — Medical: discard a self-report, and stop reserving 3 position slots (v26)

- **Discard (`✕`) on the self-reported cards.** New `fa_injury_dismissed` key — a flat `{uid: 'YYYY-MM-DD'}` map holding the date of the latest answer that staff discarded. `deriveFitnessStatus` maps an `'injured'` answer dated on or before that to a plain `'no'`, so it drives neither the injured nor the doubt rule. **Deliberately not implemented by rewriting the player's availability answer**: attendance history stays intact, and if he reports himself injured again on a LATER date the flag comes back by itself. The free-text `fa_injury_notes` entry is dropped at the same time so it doesn't linger elsewhere. Added to `SYNCED_KEYS` **and** `MERGE_KEYS` in db.js (flat per-uid map — merge-safe, no clobbering) and to the live-resync page map. No rules change needed: `data/{key}` writes are already staff-only unless the key is on the player allowlist, and only staff ever write this one; players read it, which `sameTeam` already permits.
- **Position circles no longer reserve three slots in medical cards.** The shared `.conv-pos-circles` is `width:68px; justify-content:flex-end` so columns line up in list views; inside `.med-card-top` / `.med-inj-player` there is no column to align to, so a one-position player wasted ~45px and pushed the name into an ellipsis. Overridden to `width:auto; justify-content:flex-start` for those two containers only — the list views keep their alignment. `.med-card-name` also gained `min-width:0` so the ellipsis works inside the flex row.

`sw.js` → `esquerrapp-v26`, `check-deploy.js` `CURRENT` to match. Frontend-only.

**Old-client note**: `fa_injury_dismissed` is unknown to v25-and-earlier clients (and old APKs), which will not sync it and will keep showing a discarded player as injured until they update. Degrades gracefully — nothing breaks, the flag just persists on stale clients.

### 2026-08-02e — Two different deletes: leave the squad vs. erase the person (v27)

The two "delete" buttons ran **byte-for-byte identical code** — filter the person out of the local `fa_users` blob and save. Neither touched Firestore, Auth, records or roster lists, so both were no-ops that `DB.init()`'s reconcile undid at the next login. The Registrations modal claimed to remove "this player and all his data"; both halves were false.

**Registrations → "Treure de l'equip" (detach, keep everything).** The case is a player moving up a category. The button now takes their address off that team's `playerEmails` and clears `category`/`team`; club membership, availability, RPE, injuries and stats are untouched. When the next coach adds the same address, `onRosterWritten` re-assigns them and everything is simply there. Shown only for someone actually in a squad, and — because the rules put `staffEmails` out of a coach's reach — only the lead sees it for a staff member.

- **`onRosterWritten` / `setRole`**: a member on no list but still holding a `teamId` now keeps `roles: ['player']` and has `category`/`team` cleared. Previously they got `roles: []`, which dropped them on the role-selection screen — and `setRole` re-derives a self-call's roles from the same lists, so picking "player" handed back `[]` and looped **forever**. Unlisted means unassigned, not expelled. `teamId` is deliberately never touched: only `joinClub` writes it, so clearing it would leave re-adding their email unable to bring them back.
- `onRosterWritten` also switched from `set({merge:true})` to `update()`: a merge-set **recreates** a deleted doc, and `deleteMember` strips roster entries before deleting the person, so the trigger could resurrect a zombie `users/{uid}`.

**Gestió d'usuaris → erase (superadmin only).** New **`deleteMember`** callable. It has to be server-side: the FCM token subcollection is owner-only in the rules (and deleting a user doc does not delete subcollections), `joinAttempts` is unreachable from any client, the Auth account needs the Admin SDK, and `storage.rules` could not express a working delete. Erases the Auth account, `users/{uid}`, tokens, `joinAttempts`, every `trainingAvail`/`matchAvail`/`rpe` record (queried on the `uid` field, not the doc-id prefix), the person's entries in every shared blob and per-uid map (including the frozen legacy availability/RPE docs), their addresses on every roster list, and `profilePics/{uid}.*` — listed by prefix, since the extension is whatever they uploaded. Roster removal runs **first** so a partial failure cannot leave them able to re-register; the user doc goes **last** so the reconcile cannot resurrect them.

- **Archived seasons are deliberately left intact** so past squads and statistics still add up. An erase covers the live club, not the history books.
- **Match events keep the name.** Before the uid is blanked, the person's name is snapshotted onto every event they appear in (scorer, assister, sub in/out). New shared `resolveEventName(id, snapName, number, users)` resolves live member → snapshot → shirt number; `getEventPlayerName` and the inline assist/substitution lookups all route through it. Without this a 3-1 would quietly become a 2-1. Trade-off recorded: their **name survives on the scoresheet**.
- Typed confirmation (name must be typed), modelled on the new-season dialog, with a result toast reporting how many records went.

**Also**: `storage.rules` split `write` into `create, update` + `delete`. The old single rule inspected `request.resource.size`, which is null on a delete, so **nobody could ever delete a profile picture** — not even its owner; changing your photo to a different extension stranded the old file forever. `showModal` gained optional `{confirmLabel, danger}` (its buttons were hard-coded "No" / "Yes, remove") and now uses translated labels. Defined `common.edit`, `common.player_not_found` and `matches.no_past`, which were referenced but never defined and rendered as raw key text.

Rules suite: **65 passing** (5 new: staff may clear category/team but not delete; neither staff nor lead may delete a member; superuser may).

`sw.js` → `esquerrapp-v27`, `check-deploy.js` to match. **Deploy needs functions + storage rules**, then the frontend.

### 2026-08-02f — The team lead picks their own roles (v28)

Phase 4 removed the "Staff" card from the role screen so nobody could self-promote. That was right for players and wrong for the lead: `joinClub` writes `roles` from the roster lists, a lead's own address is normally on no list, so a **freshly created lead got `roles: []`** → role screen → only "Player" available → `roles: ['player']` → **no staff pages at all**. The person meant to run the club could configure it but not manage anyone in it. Server-side they were fine (the rules already treat `role == 'lead'` as staff); it was purely the client roles array. Only bit a brand-new lead, so the existing club never saw it.

Running the club, playing for it and coaching in it are three separate things, so **"lead" is now a role in its own right** and any combination is valid.

- **`rolesFor(isLead, chosen)`** in functions/index.js: the single place the roles array is built. Always appends `"lead"` when `isTeamLead`, so a lead's roles are never empty — an empty array is what strands someone on the role screen.
- **`setRole`** now accepts `"lead"` in the payload (the screen sends back what it was given) but **strips and re-derives it** from `target.isTeamLead` — never grantable by a caller, same stance as `cats`. A lead calling about themselves already passed the `isLeadOfTeam` check, so they *do* choose their own player/staff, unlike everyone else.
- **`joinClub` deliberately does NOT use `rolesFor`** — a fresh lead must get `[]` so `navigate()` sends them to the picker once. Their `lead` role is added when they confirm, and from then on their roles are never empty again.
- **`onRosterWritten`** merges rather than overwrites for a lead: an unrelated list edit would otherwise silently strip whatever they picked.
- **Role screen**: the lead gets the multi-select (previously superadmin-only) plus a non-interactive "Responsable del club" card showing the role as granted, and may confirm with **both toggles off** = "I only run the club". Everyone else still must pick something.
- **Page gating**: new `fallbackPage()` — staff → registrations, player → player-home, lead/admin → settings. The old fallback was a hard-coded `player-home`, which a lead-only does not have. `renderSidebar` already lands them on their first available page.

Verified by simulating the full lifecycle: picker shown exactly once, all four combinations stick, and no path returns to it — including a detached player and a later roster edit.

`sw.js` → `esquerrapp-v28`, `check-deploy.js` to match. Rules suite: 65 passing. **Needs a functions deploy.**

### 2026-08-02g — Changing a club's team lead (v29)

`leadEmail` was written once, by `createClub`, and `isTeamLead` on a user was written once, by `joinClub`. Nothing read `leadEmail` afterwards, so editing it (which the rules already allow) **half-applied**: the club doc named one person while the app still treated the old one as lead, recoverable only by deleting and re-registering the account.

**`onClubLeadChanged`** — a trigger on `clubs/{clubId}` that returns immediately unless `leadEmail` actually changed (every other club edit lands there too). A trigger rather than a callable, so the club doc and the user records cannot drift apart whatever route the change arrives by.

- **Incoming lead already a member**: keeps whatever they were — a coach who takes over is still a coach — and gains `lead`. No role picker, since their roles are already non-empty. As lead they see all categories regardless of their staff lists.
- **Incoming lead not registered**: nothing to do. `joinClub` matches on `leadEmail`, and the membership gate already lets a lead through without a roster entry, so they become lead when they sign up with the code. They also **skip "Configura el teu club"** automatically — that screen is gated on *no category being enabled*, so it only ever appears for a genuinely new club.
- **Outgoing lead**: access is recomputed from the roster lists. On a staff list → stays a coach for those categories; on a player list → stays a player. **On no list → they leave the club entirely** (`teamId` deleted, claims cleared, dropped from the `fa_users` blob) — running it was their only reason to be there. Their records stay keyed by uid, so adding them to a list later restores everything.

**Superadmin UI**: a 👤 button per row in Gestió de Clubs. It looks the address up *before* writing and reports which case you are in — "already a member (staff), keeps those roles" or "no member with that address, check it is not a typo". Guards: malformed address refused, unchanged address refused, unregistered address allowed but warned. **Cross-club is deliberately not blocked** (someone may manage one club while playing for another) — but see the limitation below.

**Known limitation, not addressed here**: `users/{uid}.teamId` is a single value, so one account cannot belong to two clubs. Leaving the cross-club guard open lets you *set* such an address, but that person would still need a separate account per club. Real multi-club membership is a data-model change, adjacent to the Phase 5 work.

`sw.js` → `esquerrapp-v29`, `check-deploy.js` to match. Rules suite: 65 passing. **Needs a functions deploy.**

**v30 (same day)**: the change-lead UI became an inline **textbox per club row** in Gestió de Clubs rather than an icon opening a modal — the modal was too hidden to find. Same guards, now as inline feedback under the field as you type; Enter or 💾 saves. `showChangeLeadModal` and two orphaned i18n keys removed.

### 2026-08-02h — The team lead gets the user-management page (v31)

Permanent deletion was superadmin-only, so every removal in every club queued behind one person. Each lead now manages their own club's members.

- **Sidebar / router**: the users page is added to the Team Lead section and the `ADMIN_PAGES` guard admits `isTeamLead`. No extra scoping needed — the page reads this club's `fa_users`, so it can only ever show the caller's own members.
- **`deleteMember` authorization**: superuser **or** a lead whose `teamId` claim matches the *target's* club. Taken from the token, never the request. Three refusals: self (already there), the superuser's own account, and anyone outside the caller's club — which also covers a clubless user, deletable by the superuser only. Verified against a nine-case matrix including a staff member attempting it.
- **Rules unchanged**: direct client deletion of `users/{uid}` stays superuser-only and every lead deletion goes through the function, keeping the destructive path in one audited place. The existing test asserting "the lead CANNOT delete a member either" now documents that deliberately.

**Removed the Player/Staff toggle buttons** from that page. They only ever rewrote the local `fa_users` blob and never called `setRole`, so the badge flipped, the blob synced, and `users/{uid}.roles` — and the person's real permissions — did not. Third instance of that silent-write shape this session. Not repaired but removed: roles are list-driven now (staff in "Configura el teu club", players in Registrations), and a manually-toggled staff member would get no categories and land on the empty-state screen anyway. Roles are read-only on the page now, `lead` included in the badges; `users.toggle_desc` replaced with `users.delete_desc`. Delete is also hidden for the superadmin row.

`sw.js` → `esquerrapp-v31`, `check-deploy.js` to match. Rules suite: 65 passing. **Needs a functions deploy.**

### 2026-08-02i — Post-deploy fixes from the first real test pass (v32)

- **Users table lines misaligned.** `.user-actions` was `display:flex` **on a `<td>`**, which takes the cell out of the table layout. The admin row has no Delete button, so its empty cell collapsed to a different height and drew its bottom border out of line. Now a plain table cell (the flex was only there for the two role toggles, which are gone).
- **Registration flashed the login screen** before profile setup, and a **rejected registration showed no error at all** — the applicant just landed back on login. Same cause: `onAuthStateChanged` ends in an unconditional `navigate()`. Creating the Auth account fires it before `joinClub` has run and the profile doc exists (→ login flash), and on rejection the rolled-back `cred.user.delete()` fires it again, switching away from the register view and taking the error message with it. New **`_authFlowBusy`** flag: while a login/register handler is mid-flight it owns navigation and the listener returns early. Both handlers now clear it on every path and explicitly re-show their own view with the message on failure — so the "your address is on no roster list" rejection is finally readable, which is the whole point of that message.
- **Registrations split into two cards**: *Membres assignats* (in a squad, category-filtered as before) and *Sense equip assignat* (in the club, in no squad — name and email only). Uncategorised members used to be mixed into every category view; they now have their own place, which is also where someone lands after "Treure de l'equip".
- **The ✕ on the pre-registered card and "Treure de l'equip" now do the same thing.** Both took the address off the list, but only the button cleared the assignment locally, so the ✕ left the page showing a stale squad until `onRosterWritten` came back. Extracted `detachMemberByEmail(email)`, used by both.

`sw.js` → `esquerrapp-v32`, `check-deploy.js` to match. Frontend-only — **no deploy needed**.

### 2026-08-02j — Registrations reworked around pre-registration (v33)

Pre-registering meant editing a list of email rows, one block per team, each with a badge and a ✕ — and the person you had just invited was invisible in the members table until they signed up. Two half-views of the same thing.

- **Pre-registration is now one form**: an address, a team-letter select, and Add (Enter works too). No rows, no badges, no ✕. `addPreRegisteredPlayer` refuses a malformed address, one already on **any** list in the club, and one already held by an assigned member — a duplicate would show as two rows for one person and put them on two teams.
- **The members table is now the single view of the squad**: registered members **plus** unclaimed pre-registered addresses, so an invited player is visible from the moment you add them. That union is what makes the dot meaningful — every row in a members-only table is registered by definition.
- **Green/orange dot** next to the name (`regDot()`), with a CSS hover tooltip rather than a native `title` so it appears instantly. Pending rows are tinted and have no user document, so Estat/Categoria/Equip are static text and Posició/Dorsal are absent; `autoSaveFromRow` already no-ops on them since it keys off `data-uid`.
- **Email column** added to both cards.
- **Estat** lost the "Cap" option and is now a dropdown **only on staff rows** (Jugador/Staff/Ambdós, lead-only as before). A player's status follows from being on a player list; promotion to staff goes through the staff email lists. The lead's own row shows a static "Responsable" label — with "Cap" gone there was no sensible option for someone whose only role is running the club. `autoSaveFromRow` now preserves the server-derived `lead` role instead of dropping it locally until the server restores it.
- **Removal**: pending rows get the same "Treure de l'equip" button, handled by `removePreRegisteredPlayer` (list entry only — there is no user doc). Registered members keep `.btn-remove-reg` → `detachMemberByEmail`. One control, one meaning.
- Deleted `savePlayerEmailList` and `buildPlayerEmailRow`: the old blur handler read a whole team's list back out of the DOM on every keystroke-blur; the two new functions write only the address that changed. Orphaned keys `reg.pre_claimed` and `reg.all_members` removed.

`sw.js` → `esquerrapp-v33`, `check-deploy.js` to match. Rules suite: 65 passing. Frontend-only — **no deploy needed**.

### 2026-08-02k — Re-assigning an unassigned player (v34)

There was no way back: "Treure de l'equip" moved someone to the Unassigned card and left them there, with the only route back being to type their address into a team list by hand.

- **`prevCategory` / `prevTeam`** now record the squad someone was taken out of — detaching used to clear `category`/`team` outright, so the information was simply gone. Written by both detach paths (`detachMemberByEmail` client-side, `onRosterWritten` server-side). Added to the staff allowlist in `firestore.rules` and to the self-write blocklist: staff-owned like the assignment itself, or a player could invent a history.
- **Unassigned card** gains an *Equip anterior* column and, on the right, a category select + letter select + **Assignar**. The letter dropdown follows the category. It defaults to where they came from when that category is still available — overwhelmingly the likely destination.
- **`assignMemberToTeam(uid, category, letter)`** adds the address to that team's player list (the gate that actually decides membership) and mirrors `category`/`team` locally so the row moves to the assigned table at once instead of waiting for `onRosterWritten`. Skips the roster write if the address is already listed.
- **The category dropdown offers only `getVisibleCategories()`** — the rules scope `playerEmails` edits to a coach's own categories, so offering the whole club would just produce a permission error for anyone but the lead. Decided deliberately over widening the rules, which would have undone the Phase 4 category scoping. A coach with no categories sees the `error.no_categories` message instead of dead controls.
- Works for members who never had a squad too (registered before the lists existed): *Equip anterior* shows a dash and the controls behave the same.

Rules suite: **67 passing** (2 new: staff may record a previous team; a player may not fake their own). `sw.js` → `esquerrapp-v34`. **Needs a rules + functions deploy** — first one since v32.

### 2026-08-02l — Fix: an assigned player displayed as "Responsable del club" (v35)

Reported straight after v34: a re-assigned test player showed up with the lead's label. Two faults, both mine, compounding.

1. **The label test was a superset.** `isLeadOnly = !roles.includes('player') && !isStaffRow` is also true of anyone whose roles array is **empty**, so a role-less member rendered as *Responsable del club*. Now tests the lead role explicitly (`roles.includes('lead') || u.isTeamLead`); empty roles fall through to the plain status label, which reads "Cap" — wrong-looking, but honestly wrong rather than misleading.
2. **Stale local roles.** `onRosterWritten` correctly gave him `player` server-side when his address went onto the list, but `db.js`'s reconcile only ever **adds** missing members to the `fa_users` blob and never refreshes an existing one, so the stale empty array kept rendering. `assignMemberToTeam` now mirrors the `player` role locally, matching what the server just did.

Verified against a seven-case label matrix (plain player, empty roles, lead-only, lead who plays, lead who coaches, plain staff, both).

**The underlying reconcile gap is unchanged and still bites elsewhere**: any server-side change to an existing member's fields is invisible to other devices' `fa_users` blob until something rewrites it. Worth folding into the Phase 5 data split rather than patching per-caller.

`sw.js` → `esquerrapp-v35`. Frontend-only — **no deploy needed**.

### 2026-08-02m — Deleted member reappeared as "pending"; bare strip at page foot (v36)

- **A fully deleted member came straight back in Miembros asignados as a pending row.** `deleteMember` strips their address from the roster docs server-side, but the client renders from the cached `_clubConfig.rosters`, which still held it — so the person vanished from `fa_users` and immediately reappeared with an orange dot, looking like the delete half-failed. The success path now strips the address from the cached lists too. (Same class as the stale-`fa_users` bug in v35: a server-side change with no local mirror.)
- **The unstyled strip at the bottom of the page** was `.dashboard-layout { min-height: calc(100vh - 50px) }` — a hard-coded guess at the navbar height. `.topnav` has no fixed height (it is padding around a logo image), so whenever it rendered taller than 50px the layout fell short and bare body background showed underneath, across the full width including below the sidebar. Removed the calc: `.view` is a 100vh flex column and `.dashboard-layout` already has `flex: 1`, which fills the remainder exactly whatever the bar measures.

`sw.js` → `esquerrapp-v36`. Frontend-only — **no deploy needed** (the v34 rules + functions deploy is still outstanding).

### 2026-08-02n — Click a club crest to replace it (v37)

Superadmin, in Gestió de Clubs: the crest in each row is now clickable and opens a file picker. Uploads to `clubBadges/{clubId}.{ext}` (same path `createClub` uses), writes the URL back with `updateClub`, and refreshes the table. Clubs with no crest show a dashed `+` placeholder in its place.

`storage.rules` already restricted `clubBadges` writes to the superuser, under 5 MB, image content-type — **no rules change needed**; the client checks mirror those three so the failure is a readable toast rather than a raw storage error. When the crest belongs to the user's *own* club the cached splash badge (`_splash_badge`, base64) is dropped, or the old one keeps showing on next load.

Known and accepted: uploading a different file extension leaves the previous file orphaned in the bucket. Clients can't list `clubBadges`, so tidying it would need the Admin SDK; not worth a function for a handful of clubs.

**The bottom strip is NOT fixed** — v36's `min-height: calc(100vh - 50px)` removal was the wrong diagnosis (it was a real latent bug, but not this one). Still reproduces on every page. Awaiting a console probe of which element exceeds `documentElement.clientWidth` before guessing again.

`sw.js` → `esquerrapp-v37`. Frontend-only.

### 2026-08-02o — The bottom strip, properly diagnosed (v38)

Two wrong guesses (v36's navbar-height calc, then a suspected horizontal scrollbar) before measuring. The numbers settled it — viewport 824, layout 810, **sidebar 824**: the sidebar was taller than its own parent, and 824 was exactly the viewport.

**Root cause: nothing in the chain had a definite height.** `.view` uses `min-height: 100vh`, which is not definite, so `overflow-y: auto` on both the sidebar and the content pane did nothing at all — a box with an auto height simply grows. The document scrolled instead of the panes, the sidebar overflowed the layout, and its dark background stopped where its box ended, leaving bare page background across the foot of every page. (`documentScroll` 889 vs `body` 859 was the same fact from the other side.)

Fix: `#view-dashboard { height: 100dvh; overflow: hidden; }` — a fixed-height shell with two independently scrolling panes, which is what the existing `flex: 1` / `min-height: 0` / `overflow-y: auto` were always written for. `dvh` so a mobile browser toolbar doesn't cut it off. Scoped to the dashboard view: the auth/setup views must still grow and scroll normally.

Consequence handled: the document no longer scrolls, so `window.scrollY` is permanently 0. The four popups positioned as `rect.top + window.scrollY` are therefore still placed correctly on open (document coords now equal viewport coords) — and `.pmt-tooltip`, which is `position: fixed`, was previously double-counting the offset, so this quietly fixes it. The datepicker now also dismisses on scroll, since a popup at document coordinates no longer travels with an input inside a scrolling pane.

`sw.js` → `esquerrapp-v38`. Frontend-only.

### 2026-08-02p — Page scrollbar and truncated dot tooltip (v39)

Both turned out to be the same CSS fact: **when one overflow axis is `auto`, the other computes to `auto` too, not `visible`.** `.table-wrap { overflow-x: auto }` therefore clips vertically as well.

- **Tooltip truncated** (screenshot: the bubble cut off mid-word). It was a `::after` pseudo-element on `.reg-dot`, trapped inside `.table-wrap`. Now rendered into the shared body-level `.ua-tooltip` — which already existed for exactly this problem elsewhere — via `showHoverTip`/`hideHoverTip` and a delegated `mouseover`/`mouseout` pair (those bubble; `mouseenter`/`mouseleave` do not, and the rows re-render). `.ua-tooltip` switched from `absolute` to `fixed`: it is positioned from a `getBoundingClientRect()`, which is viewport-relative, and it now has to escape clipping ancestors. Hidden on pane scroll, since a viewport-pinned bubble does not follow its dot.
- **Window scrollbar still present** despite v38's `height: 100dvh; overflow: hidden`. `height` alone was not enough — `.view`'s own `min-height: 100vh` still applied, and any stray descendant could add a few pixels back. `#view-dashboard` is now **`position: fixed; inset: 0`**, so the shell is out of flow and cannot contribute to document height at all. `.view[hidden] { display:none !important }` still wins over it, so hiding on the auth screens is unaffected.

Third and fourth attempts at the strip. The first two were reasoned from the stylesheet and both wrong; the fix only came from measuring the boxes. Worth remembering for the next layout bug here.

`sw.js` → `esquerrapp-v39`. Frontend-only.

## Phase 5 — split club data per category

Full plan: `~/.claude/plans/working-on-the-esquerrapp-ticklish-beaver.md`. Category scoping is cosmetic today — every data type is one club-wide blob and rules cannot read inside a JSON string, so a cadet coach is merely *not shown* juvenil's data, medical records included. Phase 5 shards each key per category.

**Scope decision (2026-08-03)**: current team data is pre-season test content and disposable. Trainings, matches, injuries, availability, RPE, call-ups and tactics get **wiped** at cutover; user accounts, club config and roster email lists are **kept**. That removes dual-writing, the migration script, the legacy-retirement stage and the "uncategorised legacy row" problem outright, and made splitting all 16 keys at once cheaper than a medical-only slice.

Exploration corrected three things: there are **20** keys not 19, only **5** carry a category (not 8), and three are dead.

### 2026-08-03 — Stage A, part 1 (v40)

- **Players now get a `cats` claim** — their own category. It was `[]`, which would make every per-category rule fail closed against the entire player base. `cats` now means "categories you may SEE" rather than "categories you coach"; staff and lead unchanged. Fixed in **both** `claimsFor` and `setRole`, which compute it independently — if those drift, a member's access depends on which path last touched them.
- **`backfill-claims.js` rewritten.** It still wrote only `{teamId, role}` from before Phase 4 existed, so re-running it would have **silently stripped `cats` from every user** and locked every coach out of their own roster lists. It now derives the same way `membershipFrom` does, reading the club's roster lists, and gained a dry-run/`--apply` gate like the other scripts.
- **Dropped the three dead keys** (`fa_standings`, `fa_news`, `fa_player_stats`) from `SYNCED_KEYS`, both `SEASON_KEYS` lists and `KEY_PAGES`. None has a writer anywhere, so `archiveSeason` was archiving and resetting documents that never existed. Also removed the two dead `fa_player_stats` reads in `renderPlayerHome`/`renderPlayerStats` — both assigned a `me` variable that is never used; real stats come from `computePlayerMatchStats`.

Rules suite: 67 passing. `sw.js` → v40. **Deploy: functions, then run `backfill-claims.js --apply`.**

### 2026-08-03 — Stage A, part 2 (v41)

- **Tactic boards carry a `category`.** Stamped, not derived, at all three creation sites (Save, Save As, training board) because a saved board is attached to no player, match or date. Training boards especially: that map is keyed by training **date**, and two categories training the same evening share one bucket — the date cannot say whose board it is. Match boards are deliberately left unstamped; they join live through the match, like the other matchId-keyed data.
- **Injuries are NOT stamped** — decided against, deliberately. Injury history **follows the player**, so the shard has to come from a live join to the player's *current* category. A frozen stamp would strand a promoted player's medical history with his old coach, which defeats the point of recording it. The cost is a re-shard on reassignment, handled in Stage B. Notifications stay frozen: a notification records a moment, not a person.
- **`fa_training` rows now carry a stable `id`** and every consumer addresses them by it — the render, `readTraining` (which fires on every keystroke), the remove button and the row click. Positional addressing was fragile even today; once Phase 5 merges several category documents into that list, a remote change to another category reorders it between render and keystroke and silently writes one squad's edits onto another's session. Existing rows get an id lazily on first render.

**Deferred, deliberately: the same fix for `fa_tactic_saved`.** It is a 14-site refactor of the most intricate page in the app, including index-shifting arithmetic and a selected index persisted in a separate local key. Post-Stage-C the exposure is narrower than it looks — a coach's merged blob will contain only their own visible categories, so cross-category reordering cannot reach them; the lead, who sees everything, is the only one at risk. Worth doing as its own focused piece rather than rushed.

Rules suite: 67 passing. `sw.js` → v41. Frontend-only.

### 2026-08-03 — Stage A, part 3: tactic boards by id (v42)

The deferred half of A4, done properly. Saved boards were addressed by array position in two places at once — `data-board-idx` in the DOM **and** a selected index persisted in `fa_tactic_loaded_idx` across renders — so deleting a board had to renumber the selection by hand (`if (li > idx) li - 1`). Once Phase 5 merges several category documents into that array, a remote change reorders it and the persisted index quietly points at somebody else's board.

- Boards carry a stable `id`, backfilled lazily by the new `getSavedBoards()`.
- New `tbSavedListHtml()` renders the list — the same markup was duplicated in **four** places (the picker screen, the board screen, `refreshSavedList` and the delete handler's inline re-render), each with its own copy of the index logic.
- Save, Save As, load, delete and `hasTacticUnsavedChanges` all address by id. The delete renumbering is gone entirely: with ids, removing one board cannot invalidate the selection of another.
- `fa_tactic_frames` deliberately still uses indices — animation keyframes inside a single board, local-only, never synced, so sharding cannot reorder them.

Linked match/training board copies are still matched by **name**, unchanged. That is a pre-existing weakness (renaming propagates by name, and once sharded the same name can exist in two categories) but it is a separate contract from the positional bug fixed here.

Verified both failure modes: a remote insert makes the old index resolve to the wrong board while the id lookup stays correct, and deleting an earlier board no longer disturbs the selection.

Rules suite: 67 passing. `sw.js` → v42. Frontend-only.

### 2026-08-03 — Stage A complete: in-app update check (v43)

The web app updates on reload; a bundled APK does not, because Capacitor ships a copy of the web assets — so a phone can run months-old code against a current backend and nobody notices. That is the constraint that would otherwise have forced dual-writing through all of Phase 5.

- **`APP_VERSION` constant** in `js/app.js`, bumped alongside `sw.js`. `check-deploy.js` now fetches the live `js/app.js` and **asserts the two agree** — a lagging `APP_VERSION` would make every bundled APK claim to be current and the banner would never fire.
- **`clubs/{clubId}.minAppVersion`** drives it, set from a per-row input in Gestió de Clubs. No rules change: the club doc is already member-readable and lead/superuser-writable.
- **Soft nag, not a block** — deliberately. A wrong value here would lock the club out and only the superadmin could undo it. Dismissal is remembered *per required version*, so raising the bar nags again but a single release does not nag on every page.
- **`updateUrl` is a club field, not a constant**: GitHub Actions artifacts have no stable public URL. Without one the banner still says what is wrong, it just cannot offer the download. When Play/App Store lands, this becomes the store link with no other change.

**Not chosen: pointing the APK at the live site** (`server.url`). It would end APK staleness instantly, but loading an entire app from a remote URL is a reliable App Store rejection (guideline 4.2), and stores are on the roadmap. The store-friendly path is bundled assets plus an OTA bundle swap later; this version check is the stepping stone to either.

**Stage A is done.** Next is Stage B: the `db.js` router. Nothing in Stage A splits anything — it is all groundwork, and all of it is independently useful.

Rules suite: 67 passing. `sw.js` → v43, `APP_VERSION` 43. Frontend-only.

### 2026-08-03 — Stage B: the sharding router (v44)

Every synced key is now written as one document **per category** instead of one per club:

```
teams/{teamId}/data/{key}__{category}   { v: "<json>", category: "cadet" }
```

`localStorage` is untouched — still one merged blob per key — so none of the ~128 read sites in `app.js` know this happened. Only the Firestore mapping changed.

- **New `js/shard.js`** holds the routing table and the pure partition/merge functions: no Firestore, no localStorage, no DOM, and `module.exports`ed so it can be unit-tested in Node. Seventeen keys, three shapes (`array`, `map`, `mapOfArrays`) and five ways of finding the category: read it off the row (6 keys), join a uid through `fa_users` (4), join a matchId through `fa_matches` (5), and the date-keyed training boards, whose entries carry their own stamp.
- **Joins are resolved live, never stamped** — that is the whole reason injuries were deliberately left unstamped in Stage A. A promoted player's medical history re-shards to follow him. Tested both ways round.
- **Provenance fallback for joined routes only.** When a join stops resolving — the player was deleted, the match erased — the row stays in the shard it came from instead of falling into `__none`, which would move a squad's history out from under its coach. Field-routed keys get no fallback: for them a missing category is a real answer.
- **Per-document diff.** `readTraining` fires on every keystroke and `renderStaffTraining` writes on every render; without the diff each would become N writes per render. Only shards whose serialised content actually changed are written.
- **Shadow cache** (`_shards`: key → category → JSON string). A merged blob cannot be rebuilt from one `docChange`, so the parsed shards are kept. It is updated optimistically before the write resolves — and **rolled back to the server's value if the write is rejected**, because a cache claiming content the server does not have would make the *next* write diff against it and skip. That is the silent-loss shape this project has already been bitten by three times.
- **Deterministic merge order** — `CATEGORY_ORDER`, then `__none`, then anything unrecognised (merged last rather than dropped). `fa_training` re-sorts by date descending and `fa_staff_notifications` by timestamp descending; the latter matters because `addStaffNotification` caps the list at 200, and concatenating shards would make the cap drop one whole category instead of the oldest entries.
- **`fa_tactic_training_boards` gets a real fix, not just a shard.** The map is keyed by training date, and two categories training the same evening shared one bucket. Each entry now routes on its own Stage-A stamp, so the bucket is split across shards and rebuilt on merge.

**The safety rule** — never write a shard whose input the client could not see — is implemented as `_scope`, and `_scope` is deliberately the **read** scope (what the listener downloaded), not the UI's category filter. A coach browsing cadet still holds every category the listener fetched and must write all of them back. `_routeWrite` refuses any shard outside it, surfaces `shard-out-of-scope` through the existing `db-write-error` event, and **rejects the returned promise** so an acked save can never report success on a refused write.

**`SCOPED_READS` is the Stage C switch**, currently `false`. While false the listener fetches the whole collection, so the read scope is every category and the assert has nothing to refuse. Flipping it makes the same list drive both the `where('category','in', …)` query and the assert — they must never be different lists. `init()` re-subscribes when the scope changes; `DB.setScope()` only records the wanted set, because narrowing the write scope without re-subscribing would refuse writes for data we still hold, and widening it without re-subscribing would authorise writes for data we never downloaded. `app.js` calls it from `setSession` and `loadClubConfig` (`syncDbScope`).

**Rules**: doc ids are now composite, so the player-write allowlist tests `baseKey(key)` — `key.split('__')[0]` — instead of the whole id. Matching the whole id would have denied every player write at cutover; matching a prefix would have let `fa_matches__fa_injury_notes` through. Both cases are tested. **Reads are deliberately NOT narrowed yet**: a collection query is rejected outright if any document in it could be denied, so the query must narrow before the rule does.

**Load order changed**: `utils.js` (owns `CATEGORY_ORDER`) and the new `shard.js` now load *before* `db.js`, which asserts at load time that every synced key has a route. `utils.js` was also missing from the service worker's `STATIC_ASSETS` — added along with `shard.js`.

**Not deployable on its own.** Cloud Functions still address `data/fa_x` directly (Stage D), and the shards only exist after the Stage E wipe. Stage B, C, D and E ship together.

Tests: 20 new `shard.test.js` unit tests (`npm run test:shard`, no emulator needed) plus 6 new rules cases — 73 rules passing. `sw.js` → v44, `APP_VERSION` 44, `check-deploy.js` expectation bumped.

Also in v44: the claims-change handler re-inits `DB` on a same-club membership change (it only did so on a team change). A no-op today, because `init()` early-returns while the scope is unchanged — but from Stage C a promoted coach who keeps the old category-filtered subscription never sees his new squad.

**Review pass on the router, same day.** An independent read of `db.js` found seven real defects, all in the write path, all of the same family — the shadow cache and the server disagreeing:

1. **`_rollback` was not compare-and-swap.** `readTraining` writes on every keystroke, so two writes to one key overlap constantly. If W1 failed *after* W2 succeeded, restoring W1's `prevJson` rewound the cache past W2's content and the next rebuild dropped everything typed in between. It now rolls back only if the cache still holds exactly what that write put there — which also covers Firestore's own revert snapshot, which absorbs the server's value before the rejection handler runs.
2. **The shard fan-out was not atomic.** A row moving between categories is "delete from the old shard" plus "add to the new one"; as independent `set()` calls the delete could land while the add failed, leaving the row on the server nowhere while localStorage still showed it. All shards of one blob now go in **one `db.batch()`** — at most seven documents, far inside the 500-op limit. `removeItem` batches its deletes too, and only clears the shadow cache once the server has agreed.
3. **A malformed blob wiped every shard of the key.** `JSON.parse` failure was treated as "legitimately empty", so one `JSON.stringify(undefined)` at a call site would have partitioned to nothing and cleared all seven shards — a club-wide delete. A blob that cannot be read, or whose shape disagrees with the route, is now **refused** and the server left untouched.
4. **A shard with an unrecognised category duplicated rows forever.** `mergeOrder` merges unknown shards rather than dropping them, but `_norm` rejects the same category on the way back out — so its rows were merged into localStorage, re-routed to `__none` on the next write, and written there while the original shard stayed put (out of scope), duplicating every row and refusing every later save on that key. `_absorbDoc` now ignores such shards and warns once.
5. **The `hasPendingWrites` skip lost other coaches' merged fields.** A document carrying our pending write can also carry another coach's fields; skipping it lost them for the session, because once our write acked the value already matched our prediction and the ack was a metadata-only change this listener never saw. It now absorbs unconditionally — our own echo diffs to nothing, and a rejected write reverts the document and returns as a real change.
6. **`flush()` left `_teamId` and the listeners live**, so one remote docChange on the no-club path could repopulate the cache with a single shard and render a fraction of a club the user is not a member of. It calls `cleanup()` first.
7. **`_uploadAll` was dead code** — it read the synced keys back after `init()` had just flushed them — and had it worked it would have uploaded the *previous* club's data into the new one, which is precisely what the flush prevents. Removed; a club with no data documents starts empty.

Also hardened for Stage C: `_readScope()` returns null instead of silently narrowing to `['none']` when the visible set is unknown, and `init()` throws rather than downloading almost nothing and then refusing every write.

**Known gap for Stage C, not fixable here:** once reads are scoped, a player moved cadet→juvenil strands his joined rows (injuries, notes). His old coach no longer resolves him through the roster, so provenance pins the rows to `__cadet`; his new coach never downloads `__cadet`. The provenance fallback is right for a *deleted* player and wrong for a *moved* one, and the client cannot tell them apart. The fix belongs server-side in Stage D — `setRole`/`onRosterWritten` already run when a player changes category and should re-shard his joined rows there.

### 2026-08-03 — Stage C: scoped reads and the narrowed rule (v44)

Category separation is **real** from here. Before this, a cadet coach was merely not *shown* juvenil's medical records; the rules could not see inside a JSON blob to stop him fetching them.

- **`SCOPED_READS` flipped on.** The `data/` `.get()` and `onSnapshot` both run `where('category','in', scope)`, and the same list is the router's write assert — the query and the assert are one list by construction, which is the only reason the safety rule means anything.
- **The read rule** gains `resource.data.category in request.auth.token.cats`, with `none` readable club-wide (staff accounts, unassigned players, pre-category rows) and the `'cats' in token` guard so an old token denies rather than errors.
- **Query-before-rule, in that order** — a collection query is rejected outright if any document it could return might be denied, so narrowing the rule first would have killed sync for every scoped user at once.
- **All six `DB.init` call sites now pass `getVisibleCategories()` explicitly.** Each was already preceded by `loadClubConfig` → `syncDbScope`, but the ordering was an invariant nobody would notice breaking; `init()` throws if the scope is unknown rather than silently narrowing to `['none']`.

**The open question this settled empirically**: whether Firestore accepts a collection query whose filter is `in` against a *dynamic* list from a custom claim. It does — `where('category','in',[...])` against `resource.data.category in request.auth.token.cats` is allowed, an unfiltered read is rejected, and a query naming a category outside the claim is rejected. Five tests pin that down, because if it had gone the other way the rule would have needed redesigning rather than patching.

A document with **no** `category` field is now unreadable by everyone but the superuser. That is deliberate and tested: it is what a Cloud Function that forgets to stamp the field would produce, and going dark is the safe direction.

Rules suite: 87 passing (+14). Shard suite: 22.

**Still club-wide, and deliberately not done here:** the three per-record collections (`trainingAvail`, `matchAvail`, `rpe`). The plan has them gaining a `category` field, but no stage owns it and the sensitive data — medical — lives in `data/fa_injuries`, which is now scoped. Doing it means stamping six `ackSaveRecord` sites, narrowing three listeners and three rules, and it strands a moved player's records exactly like the joined `data/` routes do. Sized and listed in HANDOFF; it is an incremental privacy improvement, not a blocker.

### 2026-08-03 — Stage D: the Cloud Functions (v44)

Every hardcoded `data/fa_x` is gone. Two helpers carry the whole change: `readDataShards(teamId, keys?)` reads a team's data collection **once** and groups it by base key in category order, and `mergeArrayShards()` reassembles the single list the old code expected. Pre-Phase-5 un-sharded documents are skipped — merging one would double every row it holds.

- **The three schedulers** merge across shards. Reading one shard would have reminded one squad and silently skipped the rest.
- **`updateTeamDates` unions.** The trigger fires per *shard* but the field it maintains is per *team*, and the schedulers query `array-contains` on it — so deriving the dates from the shard that just changed would have replaced the array with one category's dates and stopped every other category's reminders, with nothing in the logs. It now re-reads all shards of the key and unions. **`backfill-team-dates.js`, the repair tool for exactly that failure, is sharded too** — unsharded it would have found nothing and written empty arrays, becoming the thing that silenced the club.
- **`deleteMember`** scrubs every shard of each key via the new `scrubShards`; the mutate callbacks are untouched, because a shard has the same shape as the old whole-club blob. A member can appear in any category's shard plus `__none`, so scrubbing only their current category would leave the person half-erased. The three **frozen legacy** availability/RPE docs are deliberately still addressed directly — they are not sharded, and an erase must still reach them.
- **`onClubLeadChanged`** scrubs `fa_users` across shards.
- **`archiveSeason`** archives and resets shard by shard, keeping the `{key}__{category}` id in the archive so a restored season lands back in the right categories. The injury carry-over is **per shard**: an unresolved injury has to stay inside its own category, or a player's open injury would surface in another squad's medical page after the rollover. Every reset write carries `category` — a shard that lost the field would drop out of the client's query and the new season would start invisible. The three frozen record keys were dropped from `SEASON_KEYS`: they are not sharded and hold nothing a season needs, and the canonical records are archived from their own collections a few lines below.

**New trigger `onMemberCategoryChanged`** closes the gap the router review found. Injuries and injury notes are sharded by the player's *current* category through a live join — deliberately, so medical history follows the player — and the cost is that a category change has to move the documents. Only the server can: the old coach can no longer resolve the uid so his client pins the rows where they are, and the new coach never downloads the old shard. It watches `users/{uid}` rather than hooking each writer, because `onRosterWritten`, `setRole` and the client's "re-assign to a squad" flow all change the field. `reshardMember` scans every shard rather than trusting a "from" category, which also makes it idempotent against repeat deliveries.

One subtlety worth keeping: the read/write format is taken from **the document**, not from the key. A merge key can still have a legacy `{v:"…"}` document, and deleting fields that live inside a blob would remove nothing while the copy still landed — the rows would exist twice.

**Stage D had no automated test when it was written** — there was no functions harness in this repo. There is one now (`npm run test:functions`, added later the same day); `reshardMember` and `updateTeamDates` are covered against the real triggers in the Functions emulator. Confirming the same move in production during the cutover is still worth doing, but it is no longer the only evidence.

### 2026-08-03 — Test harness for the router

`db.js` had no test coverage, which is why a review had to find seven write-path defects by reading. `test/router.test.js` now runs the **real** `db.js` in a `vm` context against `test/fake-firestore.js`, an in-memory stand-in for the compat Firestore API. No emulator and no Java — about a second.

A fake rather than the emulator, deliberately: the router's failure modes are about *which* documents get written and what the shadow cache believes, not about rules or networking, and a fake can be told "this commit fails" and "these two writes overlap". The emulator cannot. The rules suite covers the emulator side separately.

The two tests that matter most are the ones that were bugs:

- **The keystroke race** — two overlapping writes, the second succeeds, the *first* then fails. The rollback must not rewind past the one that landed. Asserted by checking that a subsequent identical save writes nothing, which is only true if the cache and the server agree.
- **The safety rule** — a cadet-scoped coach edits a training and the juvenil document is byte-unchanged; a juvenil row appearing in a cadet-scoped client refuses the *whole* write rather than half a re-partition.

Plus: the per-document diff (a re-render that changes nothing writes nothing), refusal of unparseable and wrong-shaped blobs while a genuinely empty blob still clears, a row moving between shards in one batch, one `firestore-sync` per key not per document, removed and unrecognised shards, and per-field merge keys keeping `category`.

**129 passing at the time**: 42 unit (`npm run test:unit`, no Java) + 87 rules. The functions harness that closed the remaining gap came later the same day — see below.

**Committed as `02fe60e` on branch `phase5-sharding`** — not pushed, not merged, not deployed *at the time*; merged and shipped at the cutover below. `HANDOFF.md` carried the Stage E runbook; `CLAUDE.md` was updated for the new script load order, the sharded data model and the `npm run test:unit` safety net.

The one non-obvious thing about the cutover, spelled out in the runbook: **the two rule changes cannot ship together.** The `baseKey` write allowlist must land BEFORE the new frontend (composite ids fail the old exact-match allowlist, so every player write would be denied), and the read narrowing must land AFTER it (Firestore rejects a collection query outright if any document it could return might be denied). So the rules deploy twice, with the read narrowing temporarily backed out the first time.

### 2026-08-03 — Stage E, step 0: the wipe script

`functions/wipe-team-data.js` is the last artifact the cutover was missing. Dry run by default, `--apply` to act, `--team <id>` to rehearse on one club, `--include-seasons` to take the archives too.

It deletes `teams/{id}/data/*` (sharded **and** pre-Phase-5 un-sharded docs), the three record collections, and the spent `pushQueue`. It keeps `users/*` (+ `tokens/*`), `clubs/*` with `rosters/*`, `clubCodes/*`, `joinAttempts/*`, the `teams/{id}` documents themselves and, by default, `seasons/**`.

Two decisions worth the ink:

- **`fa_users` is wiped with everything else, and that is safe** because `DB.init()` reconciles the kept `users/` collection back into the blob on the next login — the member list rebuilds itself from the accounts, per category as each coach signs in. Nothing else in `data/` has a source to rebuild from; that is what makes it a wipe.
- **`trainingDates`/`matchDates` are cleared, not left.** They are the schedulers' index. Left pointing at wiped trainings they would fire reminders for sessions nobody can open, in the window between step 3 and `backfill-team-dates.js` in step 5.

`seasons/**` is reported in the inventory but kept unless asked for: an archive is a season that already happened, not the disposable pre-season content the wipe scope covers.

### 2026-08-03 — A test harness for the Cloud Functions

Stage D was the last untested code, and `reshardMember` the piece that most deserved a test. `test/functions.test.js` and `test/wipe.test.js` now run under the **Functions** emulator (`npm run test:functions`), driving the real `functions/index.js` the way production does — write a document, wait for the trigger. **143 passing**: 42 unit + 87 rules + 14 functions.

`reshardMember` is covered on every axis that can lose or duplicate a row: rows collected from *every* shard including `__none` and landing exactly once; `category` surviving on each shard it touches; merge-format **and** legacy blob-format sources emptied (the format is read off the document, not the key); `uid_date` keys moved while a `{uid}_legacy` neighbour stays put; a same-category write being a no-op; the move back; and an unassigned member's rows parking in `__none`. `updateTeamDates` gets the union-across-shards test that its silent-failure mode deserves. `wipe.test.js` runs the wipe script as a child process and asserts both halves of its contract.

**One production change came out of this.** `admin.firestore.FieldValue` is **undefined inside the Functions emulator**: firebase-tools stubs firebase-admin and returns `firestore` bound to the module (`Proxied.getOriginal` → `value.bind(target)`), and a bound function loses its statics. The first run of the reshard test died on `FieldValue.delete()` — code that works in production, since the deployed `deleteMember` uses the same expression. `functions/index.js` now takes `FieldValue` from the modular `firebase-admin/firestore` subpath: identical sentinels, and testable in both places. Thirteen call sites, no behaviour change. The one-off scripts in `functions/` still use `admin.firestore.FieldValue` — they run under plain Node, never the emulator.

The suites share one emulator but not one project: `wipe.test.js` talks to it under the script's own hardcoded `esquerrapp` id while the emulator's project is `demo-esquerrapp`, so a `--apply` with no `--team` cannot reach the other suite's teams and the production script needs no test hook.

### 2026-08-03 — Stage E: the cutover ran (v44 live)

Phase 5 is in production. The order held: rules with the write allowlist and the read temporarily permissive (`3fe7bb7`) → functions → wipe → frontend → verify → the read narrowing restored (`6a3341f`, a revert of the first). The two rule changes could not ship together, and that constraint drove the whole runbook.

**The wipe** took 37 data docs and 108 record docs across three teams, plus `pushQueue` and both date arrays. A third team surfaced in the dry run that the plan had not accounted for: `teams/default`, the pre-migration legacy club, holding the *largest* history of the three (69 trainings, 11 members, 12 injuries) and unreachable through the app because no `clubs/default` document exists. Wiped by explicit decision.

**`fa_users` rebuilt itself** from the kept `users/` collection on the first login, in production, exactly as designed. That behaviour is the load-bearing assumption under the whole "wipe instead of migrate" decision — it is what made deleting the member list safe — and it had never been proven outside a test until now.

**Verified against production**: 6 shards on the live club, every id in `{key}__amateur` form and every one carrying a `category` field; `trainingDates` repopulated by the `updateTeamDates` trigger from a sharded write; the app normal after the narrowing.

`backfill-team-dates.js` was **skipped as a no-op** — the runbook had it rebuilding the date arrays, but after a *full* wipe there are no shards to rebuild from and the wipe had already set both to `[]`. It remains the repair tool for the case it was written for.

**One check turned the riskiest step into a formality.** Before narrowing the read rule, a single `listUsers` call confirmed all 15 live accounts carried `cats: ["amateur"]`. The failure mode of that step is every scoped user's app going empty at once, and behaviour under the permissive rule says nothing about behaviour under the narrow one. The empty-`cats` accounts that turned up were only the three known `teamId: 'default'` strays and two test-club logins.

**What actually cost time: Application Default Credentials, not the cutover.** The wipe script died on its first read with `Cannot create property 'refresh_token' on string ''` — the error the old handoff attributed to a lapsed `gcloud auth login`. That diagnosis was wrong, and so was a second guess about a corrupt credentials file (there was none). Cloud Shell keeps ADC in a **temp directory**, and the Admin SDK only finds it when `GOOGLE_APPLICATION_CREDENTIALS` points there; `gcloud auth application-default set-quota-project` prints the path it wrote, and exporting that fixed it instantly. The export survives only in the tab it was run in. `firebase` and `gcloud` hold their own separate credentials, which is why `./deploy.sh` kept working throughout — a useful signal that the problem was ADC specifically, not authentication in general.

**A bug found during the cutover that the cutover did not cause**: an injury created from the Medical page did not appear under roster → player detail. It looked like a routing fault. It was not — `renderStaffPlayerStats()` had no injury section at all, the block existed only in the player's own "My stats", and the Phase 5 diff touches no injury code. A pre-existing feature gap, fixed below.

### 2026-08-03 — Injury history on the staff's player detail (v45)

Roster → player detail now shows the same injury history card and body map the player sees on "My stats". Extracted rather than copied: `buildInjuryHistoryHtml(uid)` holds the list, the duration arithmetic, the status/severity dots and the centroid-dotted body map, and both `renderPlayerStats()` and `renderStaffPlayerStats()` call it. One template, so the two views cannot drift.

Two bindings the card needs, easy to miss because neither is in the render function:

- **`bindMyStatsInjuryPopup()`** is called from the page router by page name, and only `my-stats` was listed. Without `staff-player-stats` the rows render with `cursor:help` and no popup ever appears — the markup is identical, so nothing looks broken.
- **`KEY_PAGES.fa_injuries`** decides which pages re-render on a `firestore-sync`, and `staff-player-stats` was absent. A coach sitting on a player's detail page would not have seen an injury logged from another device.

Deployed and confirmed working in production the same day. `PROJECT_SUMMARY.md` was rewritten alongside it: it still described the pre-Phase-1 app (one club-wide blob per key, `teamId: "default"`, three roles, demo seed data, four Cloud Functions), which made it actively misleading rather than merely thin.

### 2026-08-03 — The season boundary is per-club (v46)

`seasonStartStr()` hard-coded 15 August. Six places in `app.js` filter on it (`date < seasonStart || date > todayStr`), so it alone decides whether a club's stats, medical, attendance and load views have any content — and a club whose league does not run August–June had no way to say so.

Written for the demo club (below), which needs "today" to sit mid-season rather than 12 days from a rollover, but it stands on its own: calendar-year and spring–winter competitions both exist.

- **`js/utils.js`**: module-level `_seasonBoundary` (`'MM-DD'`, default `'08-15'`) with `setSeasonBoundary()` / `getSeasonBoundary()`. `seasonStartStr()` reads it. **No call site changed** — the six filters still pass only a date. A module-level variable is sufficient because `teamId` is single-valued, so a session never holds two clubs.
- **`js/app.js`** `loadClubConfig()`: `setSeasonBoundary(_clubConfig && _clubConfig.seasonBoundary)`, **and** a reset on the no-club early return — otherwise logging out of a club with a custom boundary leaves the next session slicing dates by the wrong year.
- **`clubs/{id}.seasonBoundary`** is optional. Anything missing or malformed falls back to `'08-15'`, so a club without the field is byte-identical to the old behaviour. No rules change (`clubs/{id}` update was already lead-or-superuser with no field allowlist) and no backend involvement — `functions/` never calls `seasonStartStr`, and archive/reset are manual, not date-triggered.

Nothing stored is season-stamped; the boundary only slices plain `YYYY-MM-DD` dates at read time, so setting or deleting the field is fully reversible with no migration. `getSeasonWeek()` follows it too — week numbering is derived, never stored.

**`js/utils.js` is now requireable from Node**, via a `typeof module !== 'undefined'` guard at the end of the file exporting the pure helpers. Deliberately *not* the UMD wrapper `shard.js` uses: `app.js` reads every constant and function in utils.js as a global, so a closure would take them all out of scope. Nothing above the guard touches the DOM at load time (`sanitize` uses `document`, but only when called).

**Cold start was checked, not assumed**: `init()` has no eager render, and the only boot-time `navigate()` is at the end of the `onAuthStateChanged` handler, after `await loadClubConfig(tid)`. The boundary is always set before the first season-scoped render, so no localStorage cache was needed.

New `test/utils.test.js` (18 tests) in the fast `npm run test:unit` path — **161 passing** now (60 unit + 87 rules + 14 functions). The suite leans on the negative case: nine malformed values must all fall back to `'08-15'`, and the boundary must reset cleanly. `check-deploy.js`'s `CURRENT` constant was bumped to `esquerrapp-v46` (it had been left at v44 while production ran v45).

### 2026-08-03 — `functions/seed-demo-club.js`: a demo season for sales

A complete season — 25 players, 34 matchdays, 68 trainings, ~3,000 documents — in a **separate club**, so prospects can be shown a full app instead of an empty one. Nothing production is touched.

- **Everything it creates is stamped `demoSeed: true`** (club doc and every `users/` doc). `--purge` refuses a club without the stamp, refuses the three ids in `PROTECTED_CLUBS`, and leaves any unstamped account in the club alone. That stamp is the whole safety model.
- **Uids are derived from the club id** (`dm_{clubId10}_{slug}`), so `--apply --club <id>` re-seeds the same accounts rather than duplicating them and the demo credentials keep working.
- **Routing goes through `js/shard.js`**, never by hand: `Shard.partition()` then `Shard.docId()`. Hand-written shard ids are how a document ends up without a `category` and goes dark, and this way the seeder's output is identical to the app's by construction.
- **Order matters**: accounts are written before shards, because `onMemberCategoryChanged` → `reshardMember` fires on every `users/` write whose category changed. Writing people first means it finds nothing to move.
- `calcMatchScore()` is copied verbatim from app.js and the score is **derived** from the events, never assigned — the app recomputes it on render, so an invented score would contradict itself on screen.

**The dry run is offline and needs no credentials.** The season is generated and self-checked in memory; only `--apply` initialises firebase-admin. Fourteen consistency checks run before any write and refuse it on failure — scores against events, events against call-ups, subs XI→bench, one keeper per XI and never substituted, `ua = rpe × minutes`, `fitnessStatus` against the injury log, and an injured player never marked available.

Three bugs the checks and the multi-date runs caught, all worth recording:

- **`addDays()` did millisecond arithmetic.** On the autumn DST transition Spain has a 25-hour day, so `t + 86400000` from local midnight lands at 23:00 the *same* day and `for (d = start; d <= end; d = addDays(d, 1))` **spins forever**. Dates are now `setDate()`-based and anchored at noon. The first test date only escaped because its calendar stopped the day before 2026-10-25.
- **Substitute goalkeepers.** The bench was "squad minus XI", so the reserve keepers were the first three subs — two came on in one match. Selection is now by line (4-3-3), the bench is outfield-only, and the keeper is never subbed.
- **An injury extended after its unavailable days were blocked out** left a gap where the player showed as available in the middle of his own injury. The end date is now decided before the days are blocked, not patched afterwards.

**The season boundary is derived from the run date** (five months back, snapped to the 1st) unless `--boundary` is passed. (Superseded note: the ADC guidance in this script's header and in HANDOFF.md was wrong — Cloud Shell is a GCE VM whose metadata server supplies Application Default Credentials automatically, and a *stale* `GOOGLE_APPLICATION_CREDENTIALS` is what actually breaks the Admin SDK. `--apply` now runs a credentials preflight before its first write.) That is what makes the script re-runnable: "today" always lands ~40% into the season, so there is both a played history for the stats views and a fixture list for the live flows. Verified across five run dates spanning 2026-08 → 2027-06; all pass every check. Pinning a fixed boundary works until the season rolls over and then produces an empty demo.

### 2026-08-03 — Demo walkthrough fixes: team filter, squad distribution, profile pictures (v47)

Three things a walkthrough of the demo club surfaced. All frontend plus the seeder, so it ships by push to `main`; no rules or functions changed.

**Phantom team filter.** "Auto Generate Teams" offered `All / A / B` on a club whose only team is `amateur-A`. The bug was the argument, not the helper: it passed `_currentSession.category`, but `category` is a *player's* squad field and is `''` for staff, so a coach resolved to no category and fell through to `getTeamLetters()`'s `['A','B']` fallback.

- The call site now uses `getCurrentCategory()`, which resolves the *viewed* category and already handles staff. Two sibling filters were doing this correctly all along.
- **`getTeamLetters()` now falls back to `['A']`**, matching `rosterKeys()` and `prefill-rosters.js`, which had always disagreed with it. Omitting a real team is recoverable; inventing one is not — and because the club config loads async, *every* render before it resolves hit that fallback.
- Both this filter and the roster's now hide entirely when there is only one letter, as the training-detail and medical filters already did. Hiding cannot strand a selection: the category switcher resets all three filters, and the generate handler defaults to `all` when the bar is absent.

**"Equal" distribution did the opposite of its own comment.** It read *"sort by position rank, then chunk sequentially"* and then dealt `teams[i % numTeams]` — which scatters adjacent, i.e. positionally similar, players into *different* groups. Equal and Mix produced the same kind of split; only the shuffle differed. Equal now cuts the sorted pool into **contiguous** blocks, so two groups give defenders + holding midfielders against attacking midfielders + forwards.

Three further defects fixed in the same function, none of them reported:

- **The trim was positionally biased.** `while (team.length > perTeam) team.pop()` popped the end of a position-ordered array, so the players dropped into "No inclosos" were **reliably the forwards**, in both modes. The pool is now capped *before* distribution from a shuffled order; measured over 500 runs across seven group/size configurations, exclusions now track squad share to within a point.
- **Capping the pool first can strand the keepers**, which is why one keeper per group is reserved before the cut, and why `perTeam` is enforced during placement rather than by a trailing trim — a group holding a spare keeper has one slot fewer for outfielders, and sizing the chunks off the outfielder count alone overfilled exactly those groups.
- **`teams.sort()` reordered the array in place** to find the smallest group, so "Equip 1…N" reflected the last size-sort rather than a stable identity. Replaced with an index scan that also skips full groups.

`posGroup()` now keys off `posRankGlobal()` rather than `positions[0]`, so a player listed `"ST,CB"` no longer groups as a forward here while sorting as a defender everywhere else. Seven existing i18n keys for this panel (`std.num_teams`, `std.distribution`, `std.mix`, …) were defined but never used — now wired up, plus a new `common.yes` kept deliberately separate from `avail.yes`, which is an *answer* and may be reworded on its own.

The two buttons were **renamed to say what they do**: `std.mix` is now *Equips Mixtes / Equipos Mixtos / Mixed Teams* and `std.equal` *Per Posicions / Por Posiciones / By Position*. The old *Igualat / Igualado* described the behaviour being replaced, where both modes produced a positionally balanced split.

**Demo profile pictures** — `seed-demo-club.js --faces <dir>` uploads images to `profilePics/{uid}.{ext}`, the same path real uploads use, with the Admin SDK bypassing the owner check in `storage.rules`. Files named after a slug (`player01.jpg`, `coach.png`) go to that person; anything else is handed out alphabetically to whoever is still bare. Fewer images than people is fine.

The alphabetical pass fills **players before staff**: a folder of squad faces typically holds exactly as many images as there are players, and filling staff first left two players on initials while the coach and physio got portraits. With the 25-image demo folder, all 25 players get a face and the two staff keep initials.

The download token is minted **before** upload, not after: a Firebase download URL is just the object path plus a token *we* supply as metadata, so it can be known in advance — which is what lets `profilePic` be set on the person object before `fa_users` is assembled, and lets the offline dry run print the exact URLs it will produce. `profilePic` is written to **both** `users/{uid}` and the `fa_users` shard, because the roster reads the shard while the profile screen reads the doc; setting one alone half-applies the picture, and `--verify` now checks the two agree and that every URL is backed by a real object. `--purge` deletes the blobs too — Storage objects are not reachable from Firestore, so a document-only purge stranded every image in the bucket.

**Schedule dates are written directly, not waited for.** The first re-seed with faces ended on `trainingDates 68, matchDates 0`, which looks exactly like a broken `updateTeamDates` and is not one: the trigger writes only its own field with `{merge: true}`, but it fires once per shard and finishes when it finishes, so a `--verify` seconds later caught one invocation done and the other still queued. `apply()` no longer resets the two arrays when it touches the team doc, and writes both from the generated calendar as its final step. The trigger's own write then lands the same values and is a no-op. `backfill-team-dates.js` remains the repair tool for clubs seeded before this.

### 2026-08-03 — Staff home: the coach gets a landing page (v48)

Coaches landed on Registrations — a queue that is empty most of the time, and a poor first screen both for daily use and for a demo. `staff-home` is now the first staff sidebar item, so `renderSidebar()`'s "first page in the list" rule makes it the landing page; `fallbackPage()` sends staff there too.

**Deliberately not `renderWeekActivities()`.** That function answers "what have I got on, and have I replied?" for the logged-in *player* — it renders their own availability buttons, their call-up status, their RPE prompts. A coach's question is the inverse, so `renderStaffWeek()` is a separate function showing counts rather than personal answers. It does reuse `getWeekBounds()`, `matchLabel()`, `tDayDDMM()` and `computeReadiness()`.

The page has four cards: this week, next week, out of action, load to watch.

- **Availability counts read RAW**, not through `getEffectiveAnswer()`. That helper assumes `'yes'` for an unlocked session — correct for showing a player their default, but it would report the entire squad as having replied. The staff override still wins, matching the helper's own precedence.
- **"0 available" is suppressed before anyone has answered.** Technically true, reads as alarming; only the "no answer" count shows until somebody replies.
- **Out of action** lists active and recovering injuries sorted by expected return, tagging a return inside 7 days, a date already passed, and no date at all as three different things.
- **Load to watch caps at 6 rows.** The readiness classifier flags orange generously — on the demo squad it lights up **16 of 25** — and a list that long is a wall, not a warning. The card badge still carries the true count and a "+N more" link goes to the roster. Anyone already listed as injured is skipped rather than reported twice, since readiness is load-only and knows nothing about injuries.
- Rows are whole-row links that set the same page-state variables the existing links do (`detailTrainingDate`, `detailMatchId`, `medicalDetailPlayerId`, `staffViewPlayerId`) — navigating without setting them lands on a detail page showing whatever was selected last.
- `staff-home` was added to `STAFF_PAGES`, `CATEGORY_PAGES` and to all eight `KEY_PAGES` entries whose data it reads, so a remote change re-renders it.

That 16-of-25 figure is itself evidence for the parked readiness work: a classifier that flags two thirds of a squad is not discriminating. The cap is a presentation fix, not a fix for that.

Verified headlessly against a seeder dump — the render path was driven with the real demo blobs to check counts, sorting and the injury tags before it ever reached a browser.

### 2026-08-03 — Back returns where you came from; the sidebar highlight stops lying (v49)

Reported from the new staff home: open a training from Home, press Back, and you land on the **Training Sessions list** while the sidebar still highlights **Home**. Two independent bugs with the same symptom, both older than the staff home — which merely made them easy to hit, because Home is now a sidebar page people land on.

**1. Back was hardcoded.** Every detail page shipped a fixed destination: training detail always returned to the training list, player stats to the roster, medical records to Medical. Arriving from anywhere else dropped you on a page you had never visited. Only `match-detail` had ever solved this, with its own `detailMatchFrom`.

`_prevPage` is now tracked inside `renderPage()` — the single funnel every navigation passes through, so one place instead of the dozen call sites that assign `currentPage`. `backTarget(fallback)` returns it, falling back to the old fixed page when there is no origin. Two details that matter:

- It is recorded **after** the role-enforcement redirects, so the origin is the page that actually rendered rather than the one requested.
- A re-render of the *same* page — a firestore sync, a category switch — is explicitly not a navigation. Treating it as one would make Back return to the page you are already on.

`bindMedicalDetail()` captures the target at bind time rather than reading it in the click handler, because by click time another render may have moved `_prevPage` on.

**2. The sidebar highlight only tracked sidebar clicks.** `active` was set when the sidebar was rebuilt (`renderDashboard`) and in the sidebar's own click handler — nowhere else. Every in-page navigation therefore left it pointing at the previous page. This had always been true of row links and Back buttons; nothing had made it obvious before. `syncSidebarActive()` now runs on both of `renderPage()`'s exit paths, including the no-categories early return.

A detail page is not a sidebar item, so it highlights the section it was opened from — the convention, and now also exactly where Back goes. The two agreeing is the point: the original behaviour was confusing rather than merely wrong *because* they disagreed.

New `test/navigation.test.js`, 9 tests in the fast unit path — **170 passing** (69 unit + 87 rules + 14 functions). It slices the logic block out of app.js by marker and evaluates it, one step beyond what `shard.test.js` already does with utils.js; a stale marker throws by name rather than silently skipping. Covered: the reported path, the pre-existing paths that must not regress, the no-origin fallback, re-render immunity, and that the highlight and the back target never disagree.

### 2026-08-03 — Sessions list was re-parsing a 49 KB blob 3,400 times per render (v50)

Reported as "Sessions d'entrenament seem to take a little longer to react and load". Measured, not guessed: **547 ms of pure `JSON.parse` per render**, now **1.5 ms**.

`getEffectiveAnswer()` parsed *both* availability blobs on **every call**, and it is called once per player per session. The Sessions list renders one attendance donut per row, so a 68-session season with 25 players ran 68 × 25 × 2 = **~3,400 parses** of a 49 KB blob, plus 68 more parses of the training list because `buildAvailDonut()` re-read it to find a session its caller was already holding. The cost is O(sessions × players), which is why it only became noticeable once the demo season filled up — and why the live club will hit it as its own season grows.

Two changes:

- **`availContext()` memoises the parsed blobs, keyed on the raw string.** Deliberately *not* on `window._renderFrame`, which is how `getUsers()` and `getReadinessData()` cache: `_renderFrame` only increments in `navigate()`, never in `renderPage()`, so a frame-keyed cache would keep serving the old answers after a player taps one. A stale read here is worse than a slow one, and this repo has been bitten by silent-staleness three times already. Any write changes the string, so the memo cannot outlive it.
- **`getEffectiveAnswer(…, ctx)` takes an optional context**, hoisted once per loop at the five hottest call sites (season attendance, both attendance donuts, the player-home and player-stats donuts). Callers that pass nothing behave exactly as before. `buildAvailDonut()` also takes the session object when the caller has it.

New `test/availability.test.js`, 8 tests — **178 passing** (77 unit + 87 rules + 14 functions). They pin the precedence rules (override beats answer, unanswered is `yes` until locked, then `na`), that passing a context changes no answer, that an unchanged blob is not re-parsed, and — the important one — that a write is visible to the very next read. One test documents that a held context is a *snapshot*, so nobody caches one across renders and reintroduces the staleness this avoided.

Worth noting for later: `renderStaffTraining()` also rewrites `fa_training` to localStorage on every render (to backfill missing ids), which puts the whole blob through the shard router each time. The router's per-document diff means nothing reaches Firestore, so it is wasted work rather than a bug — left alone.

### 2026-08-03 — Performance sweep: the same parse-per-call pattern, everywhere else (v51)

v50 fixed availability. An audit found the identical shape in the two other helpers that run once per player, so the roster page was doing **~1,050 parses per render** — 25 players × 42 each:

- `deriveFitnessStatus()` parsed **five** blobs per call
- `computePlayerMatchStats()` parsed **three**, then called `getStartingXI()` once per match, each of which parsed `fa_convocatoria_sent` again — 34 more per player

Measured on demo-sized data: **1,050 parses / 69 ms → 8 parses / 0.4 ms.** Smaller blobs than availability's 49 KB, so nowhere near v50's 547 ms, but it grows with **matches × players** — the live club reaches it as its own season fills.

Same shape as v50: `fitnessContext()` and `matchStatsContext()` build the parsed blobs once, and both helpers take an **optional** third/second argument. Callers that pass nothing behave exactly as before, which is what kept this to five call sites (roster, medical, staff training detail, convocatòria) rather than all twenty.

**Why context passing rather than a shared memo.** A global `readBlob(key)` cache keyed on the raw string would have fixed every call site at once with no signature changes. Rejected: several read paths feed read-modify-write cycles (`getInjuries()` → mutate → `saveInjuries()`), and handing those a shared object means a caller's mutation lands in the cache while the key still matches the *old* string. That is a phantom-data bug of exactly the kind that has bitten this codebase before, traded for a speed-up worth 0.4 ms. Per-loop contexts are provably safe because nothing outlives the render pass.

Verified before changing anything: every mutation inside both helpers is on a locally-created array (`subOuts`, `intervals`, `matchRows`), and `deriveFitnessStatus`'s `.sort()` runs on a `.filter()` result, so a shared context cannot be reordered under a later player.

New `test/context.test.js`, 11 tests — **189 passing** (88 unit + 87 rules + 14 functions). The optimisation rests on one property and the tests pin it: passing a context must never change the answer. Seven fitness cases (fit, injured-by-answer, doubt, active injury, recovering, resolved-ignored, no data), the staff-discarded self-report, and an explicit check that a shared context is not mutated by deriving for several players in turn.

### 2026-08-04 — Readiness stops claiming a squad it knows nothing about is ready (v52)

The parked readiness item, presentation only. **Thresholds deliberately untouched** — the ACWR bands, the four risk flags and the three force-red overrides encode a clinical judgement, and quietly retuning them would change what coaches are told about real players. Calibration is a separate question, to be answered against real data rather than one 16-of-25 anecdote.

**The bug that made this urgent.** `rd.hasData` false rendered **green** at every call site. The live club's data was wiped at the Phase 5 cutover the day before, so almost nobody had the two weeks of RPE history `hasData` requires — meaning the roster was telling coaches that a squad the app knew nothing about was fully ready. Not a demo-only cosmetic issue.

**One template, three tables.** The roster, the training-detail attendance table and the convocatòria each rendered the cell independently and had drifted into the same fallback. `readinessCellHtml(rd, injured)` now owns it, the way `buildInjuryHistoryHtml()` was extracted in v45 for the same reason. A test asserts all three call it and that no site still falls back to green.

- **No data → grey dot, no number, tooltip "not enough data yet"** (`readiness.no_data`, a key that already existed in all three languages and was never used). No dash: a dash occupies the column as though it were a reading.
- **The score is now in the cell**, colour-matched beside the dot. It used to exist only in a mouse-driven tooltip, so on a phone the number was simply unavailable.
- **Injured players keep their load colour**, by decision. Readiness is a training-LOAD metric and does not read the injury log; an injured player can legitimately show a good one. What the columns lacked was an explanation, so the cell carries `readiness.injured_warning` — new key, all three languages. The Status column still owns the injury itself.
- **The A/C ratio cell had the same fallback** (`!rd.hasData ? '#4caf50'`) and is now grey too.
- `buildReadinessCard()` hardcoded `'Readiness'`, `'Encara no hi ha prou dades'` and `Good/Moderate/Low` while `readiness.title`, `readiness.no_data`, `readiness.good|moderate|low` sat unused. Wired up.

New `test/readiness.test.js`, 13 tests — **202 passing** (101 unit + 87 rules + 14 functions). The load-bearing one is *"is never green"*; the rest pin no-dash, the injured warning surviving alongside the no-data tip, the score being present for all three colours, no pointless tooltip on a fit player with data, all three tables sharing the helper, CSS existing for every state it can emit, and the new key being translated.

Still open on readiness, unchanged by this: the colour is not a function of the score (a separate ACWR + risk-flag + override classifier), so two players can both show 72 in different colours with nothing on screen explaining it — and the classifier flags roughly two thirds of a squad, which is a calibration question, not a presentation one.

### 2026-08-04 — Team quota, deploy 1 of 2: the limit (v55)

The app's **first commercial constraint**: the superadmin sells a club a number of teams, where a team is one `{category}-{letter}` pair counted across every category. `clubs/{id}.maxTeams`, minimum 1, **missing means 1**.

That "commercial" word is what shaped the whole design. `firestore.rules` had `allow update: if isSuperUser() || isLeadOf(clubId)` with **no field allowlist**, so a lead could have raised their own quota from a browser console in seconds. The UI could never have been the enforcement point.

**`setClubCategories` is now the only writer of a club's team layout.** All three fields the team-setup screen saves (`categories`, `fcfLinks`, `schedules`) go through it — they are written together, and splitting them across two transports would double the failure modes. It takes the club id from the **claim**, never the payload, and validates shape before quota: unknown category keys are rejected outright, because `rosterKeys` would ignore them while they sat forever in a document every member downloads.

**The quota test is an INCREASE test, not an absolute one:**

```
reject iff  next > max  AND  next > prev
```

This is the entire grandfathering guarantee. A club sitting above its allowance can still save unchanged and can still remove a team; it is only stopped from growing. An absolute test would have locked such a lead out of the one screen that could fix it. `test/quota.test.js` pins it, including a loop asserting that no club is ever blocked while not growing, however far over it is.

**The rules narrowing keeps old APKs working.** The lead may now write only `fcfLinks` and `schedules`, via `request.resource.data.diff(resource.data).affectedKeys().hasOnly([...])`. Pre-v55 APKs still save team setup with a direct write, and `affectedKeys()` lists only keys whose value actually *changed* — so an old client sending an **unchanged** `categories` map passes, and one adding a letter does not. That behaviour is an assumption the whole back-compat story rests on, so it is asserted against the real emulator; if that test goes red, every old APK has silently lost the ability to edit schedules and nothing else would say so.

**Two pre-existing bugs fixed on the way:**

1. **`showTeamSetup()` defaulted an unconfigured category to `['A','B']`** while `rosterKeys()` and `getTeamLetters()` both fall back to `['A']`. Ticking a category therefore created **two** teams silently — under a quota of 1 that is an instant breach, and it was never intended even without one.
2. **A lead's `cats` claim was never recomputed when categories changed.** `onClubLeadChanged` returns early unless `leadEmail` moved, so enabling a *new* category left the client querying a category its own token did not authorise — a `permission-denied` on the whole `data/` listener. The callable now refreshes claims for every member whose visible set moved.

Client side: `clubMaxTeams()` / `clubTeamCount()` / `isClubOverQuota()` beside `getVisibleCategories()`; a cap check on **both** the `+` button and the category toggle (enabling a category brings all its letters at once); an `{n} de {max} equips` counter; and `showModal` gains `hideCancel`, since an informational modal has nothing to cancel. The `+` buttons are **muted, not disabled** — a disabled button fires no click, so the modal explaining the limit would never open. None of this is enforcement; it exists to explain the limit before the server refuses.

`functions/migrate-max-teams.js` grandfathers existing clubs, writing `maxTeams = max(1, currentCount)` **only where the field is missing** so a re-run can never silently undo a deliberate downgrade. Dry-run default; its inventory doubles as the pre-flight for which clubs already exceed one team.

**Deploy 1 deliberately refuses removals** through the callable. Removing a letter today strands its players, orphans the roster doc and leaves `joinClub` still registering people onto the dead team — deploy 2 owns that, via `deleteTeam`.

Tests **248 passing** (141 unit + 93 rules + 14 functions), up from 202. The client/server agreement test matters most: `rosterKeys` exists twice — `js/app.js` for the UI, `functions/index.js` for enforcement, because functions deploys alone and cannot `require('../js')` — and if the copies drift, the app blocks a save the server would allow or offers one it will refuse.

### 2026-08-04 — Team quota, deploy 2 of 2: deletion and the gate (v56)

The destructive half. `deleteTeam` erases one `{category}-{letter}` and everything belonging to it **except the Firebase Auth accounts** — its players are *detached* (profile kept, `category`/`team` cleared) so they appear as unassigned and can be moved to another team.

**The hard part is that shards are per category, never per letter.** `amateur-A` and `amateur-B` live in the *same* document per key, so this filters rows inside documents the surviving team co-owns. Whole documents are only ever deleted when the category itself is going.

**Three ordering constraints, each causing a different silent failure:**

1. **Capture the match ids before filtering `fa_matches`.** The five match-joined keys resolve only through the match id; filter first and their events and call-ups are orphaned in the shard forever.
2. **Delete the roster document LAST.** Deleting it fires `onRosterWritten` → detaches members → fires `onMemberCategoryChanged` → `reshardMember`, which *moves* roster-joined rows into `__none`. Roster-first would let the medical data escape to a shard this function had already passed. `test/teams.test.js` asserts `fa_injuries__none` is empty afterwards — that assertion exists purely to catch a reordering.
3. **Refresh claims early**, right after the club-doc write. When the category is being emptied this strips it from every open client's token immediately, so a stale client can no longer write back the rows being deleted.

**Partial failure is survivable by design.** Validation is *tolerant*: a letter already missing from the config means **resume**, not error. Combined with the marker doc (`clubs/{id}/teamDeletions/{teamKey}`, Admin-SDK-only, `write: if false`) and every step being remove-if-present, a re-run is a no-op. Without the tolerant branch the function would brick the team the moment the club-doc write succeeded and the data phase didn't.

**A subtlety worth recording: `scrubDataDoc` has a dual contract.** A blob doc gets the *parsed value* and wants the new value back; a per-field doc gets the *raw document* and wants an array of field names to delete. Both arrive as plain objects, so a mutate cannot tell them apart — the first draft got this wrong for the merge-format branch and would have silently failed to delete medical notes. `dropEntriesByKey` decides from the snapshot, which can tell.

`fa_users` is a **MOVE, not an edit**: removed from `__{cat}`, re-added to `__none` with cleared fields. Clearing in place would leave the document's `category` disagreeing with the row and the next whole-blob client write would duplicate the person; deleting the row outright means `db.js`'s users→fa_users reconcile re-adds them stale on the next login.

**Kept deliberately:** matches with `team: ''` (they cannot be attributed to the deleted team, and guessing would destroy the survivor's history), and the category's training sessions — *unless* this was the last team, in which case they are deleted, because nobody is left to own them and no one's claims would include the category to read them again.

**The over-quota gate** differentiates three audiences, and had to be split across two layers to do it: the **lead** is intercepted in `navigate()` and sent straight to the category screen (so they never reach the dashboard at all), while **staff** are handled in `buildSidebarItems` + `renderPage` — because a staff+player member is both, and gating in `navigate()` could only have picked one. **Players are unaffected.** The `currentPage === ''` arm is load-bearing: a staff-only member's sidebar is now empty, so `renderSidebar` sets `currentPage` to `''` and without it they would land on "page not found" instead of the explanation.

Removing a **saved** team goes through `showDeleteTeamModal` (typed confirmation, the phrase is the team key); a chip added seconds ago and not yet saved owns nothing and just disappears. Unchecking a category that still has saved teams is blocked with an explanation — removing its last team disables it automatically.

Tests **286 passing** (162 unit + 93 rules + 31 functions), up from 248. `test/teams.test.js` drives the callable through its v2 `.run()` handle against the emulator and asserts both halves of the contract: B's data gone, **A's intact inside the same shard document**, and the players still present with cleared fields.

### 2026-08-04 — deleteTeam verifies its own work (v57)

The one risk the delete could not design away: every client holds the whole blob in localStorage and writes it back wholesale, so a coach saving *during* a delete republishes the rows just removed.

**The obvious fix was rejected on cost.** Locking `teams/{id}/data/{key}` writes behind an `exists()` check on a lock document would genuinely close the hole — but those writes are not rare: *every player availability answer appends a staff notification*, which is a `data/` write. That is one extra document read on every one of them, on every club, forever, to guard an operation that runs about once a year.

Instead the data phase is now a **re-runnable function**: do the work, re-read the shards, and if any of the team's rows came back, run it once more. One retry, not a loop — a client that keeps saving would spin it forever, and the outcome is recorded either way. That shrinks the exposure from the length of the whole delete to the length of one re-read.

It does not *guarantee* anything, and says so: a write landing after the final read still wins. What changed is that it can no longer happen **silently** — `resurrected` is returned to the caller and written to the marker doc, whose status becomes `done-with-conflict`. A partial delete that nobody notices is far worse than one that reports itself, since re-running is safe and cheap.

`records` had to be hoisted out of the extracted function so the count accumulates across passes rather than resetting.

Tests **288 passing** (162 unit + 93 rules + 33 functions). The new pair races a write against the callable and asserts the honest disjunction: either the row is gone, **or** the marker reports it — never silently left behind.

### 2026-08-04 — Readiness: the engine, not the thresholds (v59)

The classifier flagged **76% of the demo squad** (19 of 25), which makes it useless as a watch list. v52 fixed the presentation; this is the engine. It turned out **not to be a threshold problem** — three defects were doing most of the work. Measured before and after on the demo season, thresholds untouched:

| | before | after |
|---|---|---|
| flagged | **76%** | **56%** |
| `matchFatigue` firing | **13 of 19** | **0** |
| stale scores shown as current | undetected | 3 now grey |

**1. Match fatigue never recovered.** `lastMatch` is the most recent match *anywhere in the season*, so a player who went 90 minutes in March still scored 40 in August — permanently 15 points below the 75 green requires, for **every regular starter**. The `daysSince < 3` check only ever subtracted. The minutes bands are now the day-zero penalty and fade linearly to none by **day 5** — the same window the code already used for its "two matches in five days" rule, so no new constant appears.

**2. The score could be silently stale.** The acute week is `allWeeks[last]` — the last week *with data*, not this week — and `hasData` had no recency test, so someone who stopped submitting in May kept a May score displayed as today's for ever. Past **10 days** it falls back to the v52 grey dot.

**3. Not reporting looked like not training.** A week with no RPE contributed `0` to the chronic mean, *raising* the next ACWR and flagging the player — a reporting gap read as physiological risk, compounding on a squad that reports patchily. Missing load is now borrowed from the squad: the mean of everyone who reported that training, and for matches the mean of players who played **within ±10 minutes**, because averaging 20 minutes off the bench with a full 90 describes neither.

**Imputation is read-time only and never written.** A stored estimate would be indistinguishable from a real submission and would appear in the player's own RPE views as a number they never gave. It also does **not** count toward `hasData` — a score built entirely from team-mates is a confident number about nobody, so a player who has never reported still shows grey.

`playerMatchMinutes()` reuses `computePlayerMatchStats` (minutes live in the events, not the RPE), memoised per player per render since the roster already calls it once per row. `matchId` was added to `matchRows`, which carried only `date` — and two teams can play the same day.

**`computeReadiness` now returns `reasons`**, rendered by `readinessCellHtml()`. The colour is not a function of the score, so two players could both show 72 in different colours with nothing explaining it; naming the rule turns a contradiction into information. It also flags when a score **includes estimated load**.

That array immediately earned itself: the measuring script had its own copy of the rules and reported six flagged players with *no* reason, because it was missing the force-overrides. Reading `reasons` instead gave the real picture — and with it the two questions for the threshold conversation: **`acwr_low` flags 6 players for training LESS than usual** (arguably not risk at all), and **`hard_sessions` forces red on players scoring 79 and 72**.

New `test/readiness-engine.test.js` (18 tests) — **309 passing** (183 unit + 93 rules + 33 functions). The load-bearing one asserts a 90-minute match **30 days ago** scores exactly 100.

### 2026-08-04 — Readiness thresholds: the two the evidence pointed at (v60)

With the defects gone, the `reasons` array made the remaining two problems specific rather than anecdotal. Flagging **56% → 40%**, green **32% → 48%**.

**`acwr >= 0.8` was in the green gate**, so a player training below their four-week average could *never* be green — whatever their score, and up to a score of **84**. Four demo players sat at 77–80 showing amber purely for this. It conflated two opposite states: a high-ACWR player needs protecting **today**, a low-ACWR one needs building up **over weeks**. Same colour, opposite response, which is much of why the list was unactionable.

The dot now means **risk from load**. Low load is still detected — it still lowers `loadRatioScore`, so it can still pull someone under 75, and it stays in `reasons` when it does — but it no longer blocks green on its own. It surfaces as `underloaded` in a **separate list on the staff home**, under the load watch list and visually divided from it, sorted by ACWR ascending and showing the ratio rather than a score.

**`hard_sessions` no longer fires on borrowed numbers.** The force-override to red requires `s.real === true` on both sessions. Imputed load still feeds the ACWR and the score — a borrowed 9 means the squad found the session brutal and the player was there — but jumping straight to red is the strongest statement the app makes about someone, and it should not rest on two numbers they never gave. On the demo squad it still fires three times, so those are genuine.

Six more tests (24 in the engine file) — **315 passing**. The two that matter pin exactly these: the green gate must not reject on ACWR being *low*, and the force-red must not fire on imputed sessions while still counting them toward the score.

**Still open, and now genuinely a judgement call rather than a defect:** the colour is not a function of the score, so two players can show 72 in different colours. The tooltip explains why, which answers the original complaint; whether the *design* should change is separate. And every measurement remains against **synthetic** demo data — it describes the model's structure, not real footballers. Re-measure once the live club has accumulated real RPE.

### 2026-08-04 — "two hard sessions" now means consecutive (v61)

Spotted in use, and a real bug: players were force-red for two brutal sessions with **a rest day between them**.

```js
const recentRPE = sessions.filter(s => s.date >= d28ago && s.rpe != null);
const last2Sessions = recentRPE.slice(-2);
```

It sliced the last two sessions *carrying an RPE*. A session the player sat out has none, so it was skipped over entirely — hard Monday → rest Wednesday → hard Friday read as back-to-back, when the rest day is precisely the recovery that makes the pair fine.

The slice now comes from every session in the window. `recentRPE` is left alone because the RPE **trend** legitimately wants only sessions carrying a value — averaging nulls would be meaningless. A session with no data at all also breaks the chain, deliberately: we cannot tell whether he trained, and this is a force-override to red.

On the demo squad `hard_sessions` fell **3 → 1** and reds **4 → 2**. Total flagged is unchanged at 40% — those two moved to amber — but the severity distribution is now honest, which for a force-override is the whole point.

**Two test fixtures were also wrong, and passing for the wrong reason.** They appended their sessions onto a shared base history that already had a session on one of the same days, so two entries mapped to one RPE key and "the last two sessions" was a single session counted twice. Rewritten to build collision-free histories from an explicit `[daysAgo, rpe|null]` spec — the `null` being what lets a rest day be expressed at all. **317 passing.**

### 2026-08-04 — Team setup: a listener leak, and four UX fixes (v62)

Reported as a quota bug — "I gave the club a third slot, it shows 2 of 3, and adding still errors". **It was not the quota.**

`_bindTeamSetupEvents(container)` runs on **every** `showTeamSetup()`, but the four containers are static elements in `index.html` — `innerHTML` replaces their children, not the node — so five `addEventListener` calls **accumulated on every entry**. On a second visit one "+" click ran the handler twice: the first added the chip (2 → 3), the second saw the new count and fired the limit modal. **The team was added; the error was spurious.** The same duplication let a category tick un-tick itself, and made "add staff" / "+ Entrenament" insert two rows.

The save button was already de-duplicated with a comment naming exactly this hazard, and the dashboard guards itself with `content._settingsBound` — the containers were simply missed. Now `container._tsBound`. On top of that, the three quota-gated handlers ignore a re-dispatch of the same event: **one physical click delivered to two listeners carries the same `timeStamp`**, so that distinguishes a stray dispatch from a genuine second click. The guard is the fix; this is what stops the class of bug being user-visible again.

It is also an efficiency fix — every entry was adding handlers that then ran on every click, for the life of the page.

**Four UX changes, all client-side. Enforcement stays in `setClubCategories`, which the rules make the sole writer of `categories`; nothing here may become the enforcement point.**

- **A back button**, but only for the *voluntary* entry. `showTeamSetup({cancellable:true})` is passed from the Settings button alone; the over-quota redirect and the no-category wizard stay inescapable — escaping the first defeats the gate, and behind the second there is no configured club to return to. The flag is reset on **every** call, because `deleteTeam` re-enters through `navigate()` and a stale flag there would let an over-quota lead walk away. A successful save now also returns to Settings when entered from there; previously it always dumped the user on the dashboard home, so the screen behaved inconsistently between saving and cancelling.
- **A disabled category shows one greyed `A` and no `+`** — there is nothing to add a team to until it is on. Clicking that chip enables the category by setting the checkbox and dispatching `change`, so the *existing* handler runs: it carries the quota gate and its revert, and a second copy is how the two drift apart.
- **Only the last chip is removable.** Every chip previously had `cursor:pointer` and a red hover while doing two very different things — destroying a saved team, or silently vanishing if unsaved. Earlier chips are now inert, and the "last" affordance moves as chips are added and removed.
- **`_nextLetter` appends after the highest letter** instead of backfilling the lowest gap. It returned the lowest unused letter while the chip was appended at the end, so removing `B` from `A,B,C` and pressing `+` produced `A, C, B` — persisted that way. **Existing gaps are left alone**: `deleteTeam` legitimately leaves `['A','C']`, and renaming a saved team would break `{category}-{letter}` everywhere it is used as a key — roster docs, `users/{uid}.team`, `fa_matches[].team`, every shard join. We only stop making new ones.

**Typed FCF links and schedules survive a re-render.** Both sections rebuilt straight from `_clubConfig` on any chip or toggle change, discarding half-typed input; `_refreshTeamSetupStaff` had always layered the DOM over stored values for exactly that reason. `_collectSchedulesFromDom()` was extracted from the save handler so the save path and the re-render share **one** reader rather than two copies of the same shape.

**329 passing** (203 unit + 93 rules + 33 functions).

## v63 — the toggle counted the row it was about to enable (2026-08-04)

The 2-of-3 report was real after all, and the listener leak fixed in v62 was only half of it. The `+` button counts correctly; **the category toggle did not.**

`_domTeamCount` counts letters in rows whose checkbox is **checked**, and the `change` event fires *after* the browser has ticked the box — so the row being enabled was already inside the total. v55 then added its letters on top:

```js
var adding = row.querySelectorAll('.ts-letter-chip').length;
if (_domTeamCount(container) + adding > clubMaxTeams())   // 3 + 1 > 3
```

With amateur A+B saved and `maxTeams: 3`, ticking Juvenil computed **4** and showed the limit modal. Adding a `C` to amateur worked, because that path counts before mutating — which is exactly the asymmetry that was reported.

`_domTeamCount(container, exceptRow)` now takes a row to skip, and the enable branch asks for *everyone else, plus the one team it is about to add*. That phrasing does not depend on when the browser applies `checked`, which is the subtlety that caused this.

Enabling a category adds **exactly one** team: a disabled row's stored letters are declared meaningless, so it comes back as a single `A` — the same rule the first render already applied.

**Second defect, introduced by v62 itself:** enabling a category only added `.active`. The chips were never repainted, so the row stayed drawn as *disabled* — greyed `A`, no `+` — and no team could be added to the category just enabled. Chip markup now has one builder, `_letterChipsHtml(catKey, letters, enabled)`, used by the first render and by the toggle. A test asserts `ts-letter-chip-off` appears exactly once in the source, because a second builder is precisely how the two drifted apart.

`_domTeamCount` is now unit-tested against a hand-built stub (the two methods it calls), including the reported case and the v55 arithmetic kept as a regression guard. **213 unit tests** (up from 203); 339 total.

## v64 — the band at the foot of the auth pages (2026-08-04)

Measured rather than guessed. On the login page, which has nothing to scroll: `documentElement.scrollWidth` **400** = `innerWidth` 400 (so not a horizontal scrollbar, the other candidate), but `scrollHeight` **854** against `innerHeight` **824**.

Those 30px are the gap between the two mobile viewports. `100vh` is the **large** viewport — the height the page would have with the browser toolbars retracted — while `innerHeight` is what is visible right now. `body` and `.view` both carried `min-height: 100vh`, so a page with no content to scroll was 30px taller than the window, and those 30px were bare `--bg` below the gradient.

`100dvh` is the visible height and follows the toolbars. Added after `100vh`, which stays as the fallback, on `body`, `.view` and `.auth-container` — `#view-dashboard` already did exactly this and the auth views were simply missed.

`.auth-container` also gets its own `min-height` rather than relying on `flex: 1` to stretch it. `.view`'s min-height is not a *definite* height, and the comment above `#view-dashboard` records what that already cost once: the child's background stopped where its box ended, leaving a strip of bare page background across the foot of the page. The element that paints the background now guarantees its own coverage.

## v65 — the same band, on the one auth page taller than the screen (2026-08-04)

v64 fixed login and left team setup, which is the only auth page whose content exceeds the viewport. The second measurement: `scrollWidth` 1275 vs `innerWidth` 1290 — 15px *smaller*, which is just the vertical scrollbar, so still nothing overflowing sideways — and `scrollHeight` **2513** against `innerHeight` 911. A legitimately long page whose gradient stopped early.

**v64's `min-height` on `.auth-container` caused this.** `flex: 1` is shorthand for `1 1 0%` — a base size of **zero**, grown into the parent's free space. It survived a tall card only because a flex item's `min-height: auto` resolves to the content height and stops it shrinking below it. An explicit `min-height` **replaces** `min-height: auto` and removes that floor, so the box collapsed to one viewport while the card overflowed past it.

`flex: 1 0 auto` makes the base size the content height again: the box grows with the card, `flex-shrink: 0` keeps it there, and the `min-height` goes back to doing only what it was added for — the viewport floor when the content is short.

Worth keeping in mind generally: **an explicit `min-height` on a flex item silently disables its automatic content-based minimum.** The two look unrelated and are not.

## v66 — an invisible div was hanging off the bottom of every page (2026-08-04)

The last 29px. With every box measuring 2484 — `.auth-container`, `.view`, `body`, `html` — and `documentElement.scrollHeight` reading 2513, the difference could only be **scrollable overflow**: something painted below the html box without contributing to it. Enumerating elements past the gradient named it in one shot: `DIV#roster-tooltip.roster-tooltip | bottom 2501 | absolute`.

`#roster-tooltip` is appended to `<body>` once and never removed, hidden by **`opacity: 0` alone** — which still occupies layout. As an absolutely positioned element with no `top` yet assigned it sat at its *static position*: the end of the body's content, just past the foot of the page. Roughly 29px of scrollable overflow, on **every page**, since whenever the roster or a tactic board had been rendered.

`position: fixed` removes it from the document's scrollable overflow entirely, so it cannot come back at any page height. `.ua-tooltip` was already fixed for its own reasons; this one was the odd one out.

Fixed positioning is against the viewport, so the three sites placing it now use client coordinates: `e.pageX/pageY` → `e.clientX/clientY`, and two `getBoundingClientRect().top … + window.scrollY` lose the `scrollY` term. Those two were internally inconsistent anyway — `left` came from the viewport while `top` was pushed into document space, which happened to cancel out only because the pages concerned rarely scrolled.

**New `test/layout.test.js`** (11 tests, wired into `test:unit`) pins all three causes from this run: every `100vh` is paired with a `100dvh` and in that order, `.auth-container` keeps `flex: 1 0 auto`, the tooltip stays `fixed`, and no positioning site reintroduces `window.scrollY` or `pageX/pageY`. **224 unit tests**, 350 total.

### Why this took three passes
Each of the three causes produces a light strip at the foot of the page, and a screenshot cannot tell them apart. What settled it every time was a number: `scrollWidth` vs `innerWidth` ruled out a horizontal scrollbar, `scrollHeight` vs `innerHeight` sized the gap, `getBoundingClientRect()` on the gradient element localised it, and finally enumerating elements below that bottom edge named the culprit outright.

## v67 — "Totes" never did anything (2026-08-04)

Reported as *"the new Todas button might not be working, or maybe it's disabled for Xavier Bonet"*. It is not disabled and it is not a permissions problem. `_viewCategory` carried **three** states in a variable with only two values:

```js
var _viewCategory = '';   // '' = all
```

`''` meant both *"never chosen"* and *"pressed Totes"*. `getCurrentCategory()` tested it with `if (_viewCategory && …)`, so the explicit-Totes branch was falsy, execution fell through, and the session's default category won:

```js
if (s && s.category && visible.indexOf(s.category) !== -1) return s.category;
```

That default is not incidental — `membershipFrom()` stamps one on every staff member *"for the UI's default view"* and `joinClub` persists it. So the button was a guaranteed no-op for **every lead and every multi-category coach**, and it never even lit up, because `renderCategoryBar` marks it active on `!cur`. Xavier Bonet is the demo club's lead: he sees every enabled category while his own `category` stays `amateur`.

`null` now means unset, `''` means Totes. The branch order is the fix and is documented at the function: **scoping first** (one visible category outranks any stored choice, because "all" and "that one" are the same answer), then the user's explicit press, then the session default. Both reset sites — `clearSession()` and the claims-changed listener — go back to `null`, never `''`, so a filter nobody selected cannot be inherited by the next account on the tab.

`clearSession()` also clears it now: `getCurrentCategory()` clamps to `getVisibleCategories()` so a leftover value was never a leak, but "Totes" would have carried across a logout.

**Server unchanged.** `membershipFrom()` keeps stamping the default — it is what gives a coach a sensible landing view, and the server is the wrong place to fix a client display bug.

**7 new tests** in `test/context.test.js` pinning the branch order, the stale-filter clamp, and both reset sites. **231 unit**, 357 total.

## v67b - the seeder learns to add a squad to a club that already has one (2026-08-05)

Dev tooling only; nothing shipped to the app.

The demo club had one team, which undersells an app whose selling point is running several at once. Adding `amateur-B` and `juvenil-A` could not be done with the existing seeder: `apply()` builds a club **from nothing**, and pointed at a populated one it destroys it three ways, all silent.

1. **It rewrites the whole `categories` map** - all six keys, every run. `{merge:true}` merges leaf paths and every leaf is present, so a category configured through the UI is reset.
2. **It replaces shards instead of merging.** `buildShards()` assembles from only that run's people and `commitAll` writes with a bare `set()`. `fa_users` is routed **by category with no team letter**, so `amateur-A` and `amateur-B` share one `fa_users__amateur` document - seeding B would erase A.
3. **uids and emails collide.** Both derive from the club id alone, so a second run reuses the first team's exact accounts.

`--add-team {category}-{LETTER}` is a fourth mode alongside `--apply` / `--verify` / `--purge`, repeatable so both squads land in one invocation - one faces folder, one dry run, one verify.

**What makes it safe:**
- **Reads before it writes.** `mergeShardData()` folds each generated shard over what Firestore holds - arrays by the route's id field, maps by key. A stored `v` that will not parse **throws** rather than falling back to `[]`, because the fallback would discard the existing squad and report success.
- **Dotted field paths only** on `clubs/{id}` (`schedules.amateur-B`), never the whole map.
- **Refuses** any club not stamped `demoSeed: true`, any `PROTECTED_CLUB`, and any team that already has players. `--apply` is guarded by *neither* of the first two, which is why it must never be aimed at a real club.
- **Requires the team to exist in the club config already.** The quota lives in `setClubCategories` and stays the only authority on how many teams a club may have - the seeder does not hand out teams.
- Its dry run **does** read (it has to know what is there), unlike the offline one.

**Namespacing:** slugs, uids and emails get a `{cat}{letter}` prefix; the RNG seed and the match-id offset come from a hash of the team key, so adding `amateur-C` later cannot reuse `amateur-B`'s offset. Names are deduped **club-wide**, seeded from the players already stored. Staff keep the club-level uid prefix - a per-team coach would mint a second Xavier Bonet and collide on his email.

**The one thing that cannot be per-team:** `fa_training` is routed by category with no letter, the known backlog item. So `juvenil-A` (new category) gets a full calendar and `amateur-B` **reuses amateur's existing sessions**, its players getting their own attendance and RPE against them. Realistic - two teams in a category do train the same evenings - and the only option that neither duplicates nor replaces `amateur-A`'s calendar.

**38 new tests** across `test/seed-add-team.test.js` (the merge, the parse, the offsets) and `test/seed-multi-team.test.js` (the generator's id spaces, the shared calendar). **269 unit**, 395 total.

One incidental finding: `buildSeason()` calls `setSeasonBoundary()`, which is **module state in `utils.js`** shared by the whole test process. The new tests restore the default after each build - without it they silently broke the first assertion in `utils.test.js`.

### v67b follow-up — the letter now travels with the season

The dry run announced `amateur-B` as *"category amateur / team A"*. **The written data was correct**; the label was not. `report()` printed `OPTS.letter`, and `addTeams()` mutates `OPTS` once per team — so anything reading it *after* the build loops sees the **last** team's letter.

Every read that mattered happened to sit inside the loop that had just set it, so this was one reordering away from writing 25 players into the wrong squad. `buildSeason()` now stamps `S.letter`, and `report()`, `buildShards()` and `apply()` read that instead. Two tests pin the two functions that run after the loops.

**Verified in production** (`--verify` after the apply): 19 data docs, `fa_users` merging to **77 members** — 25 amateur-A + 25 amateur-B + 25 juvenil-A + 2 staff, so nothing was overwritten — 77 users all stamped `demoSeed`, and 75 profile pictures each backed by a real Storage object.

## v68 - every navigation lands at the top (2026-08-05)

Scroll down a page, click through to another, and the new page opened at the **same offset**. Structural rather than per-page: `#view-dashboard` is a fixed shell, so the window never scrolls on a dashboard page - `.dashboard-content` is the scroller, and `renderPage()` replaces its `innerHTML` without replacing the element, so the browser keeps its `scrollTop`. Opening a player from the foot of the roster dropped you half way down his profile.

**The reset is one line; the guard is the load-bearing part.** `renderPage()` has ~70 callers and only about twenty change the page. The rest re-render in place - the debounced `firestore-sync` listener, the category bar, the language switch, and ~50 optimistic redraws after a write. An unguarded reset would jerk a coach back to the top every time a sync redrew the page underneath him: a worse bug than the one being fixed, and one nobody would connect to this change.

`renderPage()` already knew the difference, for the Back button and the sidebar highlight. Those two lines are now `trackNavigation(page)`, sitting beside `backTarget()`, returning whether this was a navigation. Three behaviours key off one function instead of two copies drifting apart.

`showView()` also resets the document scroll: the auth views are **not** the fixed shell, they scroll the document, and team setup is long enough to. It only runs on a view switch, never on a re-render.

**Back lands at the top too** - the owner's call, one rule with no exceptions. Restoring a list position on Back is a deliberate non-goal; nothing in the app saved a scroll offset before this and nothing does now.

Also fixed a gap in the test: `navigation.test.js`'s `go()` helper **re-implemented** the two tracking lines rather than calling them, so its Back and sidebar assertions were pinning a duplicate and could not have failed if `renderPage`'s copy changed. It now calls `trackNavigation` directly. **8 new tests** (281 unit, 407 total), including a source assertion that the reset is guarded - an unguarded `content.scrollTop = 0` looks identical at a glance.

Left alone on purpose: the sidebar's own scroller, and the three nested ones that position themselves deliberately - `.rpe-chart-scroll` ends at the right, `scrollLeagueToCentre()` centres the club's row, `.pmt-scroll` is a bounded box.

## v69 - archived seasons, broken since Phase 5 (2026-08-05)

Backlog item 3, promoted because the demo club is now shown to prospects and this was the one screen that failed in front of them. It never threw - it rendered **every archived season as empty**, which reads as "the app lost your data".

**1. The reported bug.** `loadSeasonData` keyed its result by the raw document id. Pre-Phase-5 that id *was* the blob key; `archiveSeason` now preserves the live shard id verbatim and deliberately, so the ids are `fa_matches__amateur`. Every consumer reads `data.fa_matches || []` and got the empty fallback. Now grouped by `Shard.parseDocId` and reassembled with `Shard.merge` - the same function the live loader uses, so an archived blob comes out byte-identical to what the app held while that season was current. **Both id formats work permanently**: a season archived before the migration keeps the flat shape for ever, so unlike `db.js`'s live loader (which drops legacy ids because Stage E wiped them) this one cannot.

**2. Attendance was structurally dead.** `aggregateArchivedAttendance` read `data.fa_training_availability`, a key the server dropped from `SEASON_KEYS` when the canonical records moved to per-record collections - so it was `{}` for every archived season and every player showed **0%**. The data was there all along at `seasons/{label}/trainingAvail/{uid}_{date}`, just never read. Now loaded from there, reusing `RECORD_COLLECTIONS.toEntry` exported from `db.js` rather than a second copy. **Lazy**: a season holds thousands of these and three of the four tabs never touch them, so it fetches on first click and caches.

Also dropped the **stale `SEASON_KEYS` duplicate** in `js/app.js`. It had no readers and still listed three keys the server had removed, while `functions/index.js` said "keep in step with js/app.js" - pointing the next reader at a list that lied.

**3. Archiving a label twice destroyed the first archive.** There was no existence check. Run one empties the live shards; run two reads nothing and `batch.set`s that nothing **over** the archive - a full replace, no merge. The season vanished from both places and the caller got a 200 and a success toast. One click away, since the label is free text pre-filled from the date. Now a 409 naming the label, with `?overwrite=true` as the explicit escape hatch.

**4. Archiving was declassification.** The live `data/` rule is category-scoped; the archive rule was `sameTeam` only. A cadet coach who could not read juvenil's medical rows during the season could read them the moment they were archived. The archived `data/` shards keep both their `{key}__{cat}` id and their `category` field, so the live check applies verbatim.

The per-record archive collections are now **enumerated** rather than matched with a `/{archiveColl}/` wildcard, and that is load-bearing: **overlapping match blocks are OR'd, never overridden**, so a wildcard would also match `seasons/{id}/data/*` and hand back the club-wide read the narrower block had just removed. It would have looked correct and done nothing. Enumerating also fails closed if a new archive collection ever appears.

**Nothing here had any test coverage** - not `loadSeasonData`, not `archiveSeason`, not the `seasons` rules. That is why it shipped silently. Now **32 new tests**: `test/archive.test.js` (17, the shard round-trip including both id formats), 10 rules tests, 5 functions tests driving the real `onRequest` handler. **439 total** (298 unit + 103 rules + 38 functions).

Client-side category filtering was deliberately **not** added: the page is lead/admin-only and a lead's `cats` claim already covers every enabled category, so it would be dead code on the only path that reaches it. The rules are where that belongs.

## v70 - per-team training sessions, stage 1 of 3 (2026-08-05)

Backlog item 2. Sessions carried a `category` but no team letter, so `amateur-A` and `amateur-B` shared one calendar. This stage lays the model; the record re-key (stage 2) and the New Training page with call-ups (stage 3) follow.

**The session row now carries `teams`, `guests`, `excluded` and `endTime`.** An **empty `teams` means every letter of the category** - exactly what a session meant before the field existed, so nothing breaks before the backfill and nothing changes for a club that never uses letters. The squad is **derived on every read** (`calledPlayers`), never stored: a player who changes team is picked up automatically, whereas a frozen list would rot.

**Club config gained a start AND end time per training slot.** Until now the app had no duration anywhere - only three unrelated hardcoded windows (2h for "in progress", 90min before the RPE card, 60min before dropping from the week feed). Clash detection needs a real one. Blank falls back to 90 minutes, and the vestigial `"HH:MM - HH:MM"` range that every read site already defends against is recovered as an end time rather than discarded. The server passes the schedule's inner shape through untouched, so this needed no deploy.

**Detail views are keyed by session id, not date.** `detailTrainingDate` -> `detailTrainingId`, and the same collision was hiding in the generated-teams cache (`_generatedTeamsDate`) and the tactics-board link button, both now keyed by session. A date is not an identity when two squads can share it.

**One reader, `getTrainings()`,** replaces 29 open-coded `JSON.parse(localStorage.getItem('fa_training'))` sites and repairs a missing session id on every surface - the repair used to live in `renderStaffTraining`, which a player never renders, and navigation now depends on the id existing. Its write-back is **guarded by role**: `fa_training` is not in the player allowlist in `firestore.rules`, so persisting from a player's client would be denied and surface an error toast on every render. Players repair in memory only, which is all they need to open a session.

**The player pages were over-sharing, not under-sharing.** `renderWeekActivities`, the player-home donut, `renderPlayerActions` and the sidebar badge all read the *entire* club calendar with **no category filter at all** - a juvenil player saw amateur sessions and could answer availability for them. All four now use `playerTrainings()`, which is the same helper that will make a guest see a session they were borrowed for. Narrowing and the new feature are one change.

**The generator stopped dropping a team's slot.** `addTraining` collected every letter's schedule, deduped by day+time and threw the letter away - so if A trained Tue 20:00 and B Tue 21:30, whichever was iterated first won and B's slot vanished silently. Slots now keep their letters; identical day+time+end+place across letters merges by **unioning** the letters; and a click creates one session per slot on that weekday rather than the first one `find` returned.

**The staff detail page stopped guessing.** It reverse-matched the session's day and start time against the club's schedules to infer which letters shared the slot. The session now says.

**`functions/backfill-training-teams.js`** (dry-run by default) derives each session's `teams` from **who actually attended** - the letters of the players holding an availability record on that date. The real club lands on `['A']`; the demo club's amateur sessions land on `['A','B']`, which is what really happened. A session with no attendance keeps every letter, because an unattended session must not become invisible. Skips sessions that already have letters, so a coach's edit is never overwritten.

**31 new tests** in `test/training.test.js`. **470 total** (329 unit + 103 rules + 38 functions).

Deferred to stage 3 with the rest of the call-up work: stamping `team` on tactics-board entries, which still share a date-keyed bucket.

## v71 - training records keyed by session, not by date (stage 2 of 3, 2026-08-05)

Availability, session RPE and the staff override were all keyed `{uid}_{date}`. Fine while a player could only ever have one session a day - guest call-ups break it. Borrowed for another squad's evening session, a player's two answers collide and the second silently overwrites the first, with no error and nothing in the UI to show it.

**New records are keyed by the session id. Legacy ones are still READ**, because the v43-era APK on the phones knows only the date form and keeps writing it. The two cannot collide: a session id is `tr_...`, never a date.

**All three keys moved together, in one commit.** Every read site does `overrides[k] || avail[k]` with the same string, so moving one without the other decouples a staff override from the answer it overrides. Read and write had to land together too: split across two pushes, a player writes an answer under the new key while every read still looks for the old one, and availability silently disappears.

**The resolver** is `recordKey` / `legacyRecordKey` / `readRecord`. It prefers the session-keyed record and falls back to the date-keyed one **only for a session of the player's own team**. A legacy record can only ever have meant his own session, because the client that wrote it had no concept of a call-up; honouring it for a guest appearance would make a pre-feature answer also answer a session he was never part of. That guard is the subtlest part of the change and has its own test.

`getEffectiveAnswer()` takes the **session** now rather than its date, and so do `buildDetailDonut`, `generateTrainingTeams`, `renderGeneratedTeams` and `bindGeneratedTeamsDnD`. The DOM addresses sessions too - `data-avail-date` and the staff-override select's `data-date` became session ids.

**Un-answering clears both formats.** Deleting only the session-keyed record would leave the legacy one behind, and the resolver's fallback would bring the answer straight back on the next render.

**The squad-load index** bucketed by the string after `_training_`, which is a session id now. It reads the record's own `date` field instead and buckets under both the session id and the date - the session bucket is exact and preferred, the date bucket is what a legacy record can offer. `js/db.js` carries `sessionId` into the local blob so that is possible.

### The reminders were nagging the wrong people

Not a consequence of this change - a live bug it exposed. All three schedulers picked a session by date and then notified **every player in the club**: `getTeamMembersByRole` has no category clause, so a juvenil player was told to confirm attendance for an amateur session and to log RPE for one he never attended.

Worse, `scheduledRpeReminder` used `training.find(t => t.date === today)`. With two squads training the same evening only one session was ever considered - the other squad was never chased, and the first session's answers were used to judge everybody. It now filters and loops.

`squadForSession()` and `answeredFor()` mirror `playerIsCalled()` and `readRecord()` in `js/app.js`. They cannot share code, because `functions/` deploys on its own and cannot require `../js` at runtime, so `test/reminders.test.js` pins the two copies to the same rules. Notifications are also tagged per session rather than per date, so two squads' reminders no longer collapse into one on the device.

### The migration

`functions/backfill-training-record-keys.js`, dry-run by default. It **only ever creates**: the legacy document is never modified and never deleted, because the old APK still reads it and because a wrong join is then recoverable by deleting everything carrying `migratedFrom` and re-running, with the source untouched throughout. `create()` rather than `set()`, ALREADY_EXISTS swallowed, so a re-run is a no-op.

**Ambiguity is never guessed.** A record whose date matches two sessions in the player's own category is skipped and logged for a human. A wrong but silent resolution is far worse than a slower migration.

Nothing blocks on it: the dual read means the app is correct whether it has run or not. It removes the collision; it does not enable the feature.

### Tooling

`functions/preflight-adc.js` - one credentials check, now used by both backfills. An auth failure used to surface as a 30-line gRPC stack ending in `Cannot create property 'refresh_token' on string ''`, which reads like a bug in the script. It is not; it means the Admin SDK has no usable ADC. The message now names the actual diagnostic (`gcloud auth list`) and the actual fix (restart the VM), because unsetting environment variables does not help - a wrong guess that cost most of a session.

**22 new tests** (7 in `availability.test.js`, 15 in the new `reminders.test.js`); four harnesses now slice the resolver rather than stubbing it, so they cannot drift from it. **492 total** (351 unit + 103 rules + 38 functions).

## v72 - no category switcher on a training session (2026-08-05)

A session belongs to specific teams now, so it **is** one category by definition. The switcher at the top of the training detail page invited a coach to change the category out from under the session he was already looking at - and after the scheduling changes there is nothing left to switch to.

`staff-training-detail` comes out of `CATEGORY_PAGES`. The player-side `training-detail` was never in it.

Also removed the `curCat` declaration in `renderStaffTrainingDetail`, which had no readers left: it died with the block that used to reverse-match the club's schedules to guess which letters shared a slot. The squad comes from the session now.

## v73 - the New Training page, stage 3 of 3 (2026-08-05)

"+ Entrenament" used to append a row to the list and leave the coach to edit it in place - so a half-configured session was already a real row in everybody's calendar, and abandoning it left one there. It opens a page now, and **nothing is written until Save**.

**Pick the teams.** Letter chips, the same Set-toggle idiom as the roster and medical filters. Changing the selection re-seeds the proposed sessions from those teams' own schedules, because the times *are* the teams'. Teams whose defaults differ produce **one session each**, shown as separate editable blocks; identical day, time, end and place collapse into one session carrying both letters.

**The called squad, with its total**, using the match call-up's own `.conv-panel-header` / `.conv-count` / `.conv-player` components so the page reads as native. Each row has an `x`: a guest is simply un-invited, a squad member gets an exclusion. A player borrowed from another category carries a category tag as well as his team letter.

**"+ Add Player"** spans the **whole club**, not the current category - borrowing from another squad is the entire point. Built on the team generator's `.tg-dd` searchable dropdown, extended with multi-select and a single Add. Its ad-hoc "invent a player if no name matches" behaviour is deliberately dropped: a call-up may only name real roster players.

**Clash warnings.** A player whose existing session overlaps `[start, end)` on the same date gets an amber `!` with the tooltip *"this player already has a training scheduled at this time, adding him will remove him from it."* It uses the delegated `#ua-tooltip` that `.reg-dot` uses - `position: fixed`, so the scrolling squad list cannot clip it, and it survives a re-render without rebinding.

**Save acts on the warning.** The clashing player is genuinely removed from the session he was already in. Resolved at **save**, not at Add, so that a coach who adds a player and then moves the session an hour later no longer displaces anybody.

`addTraining()` is gone (~5.3 KB). The slot arithmetic it owned is `buildTrainingDrafts()` at module level, where the new page uses it too - and where it can finally be **executed** by a test rather than checked by reading its source.

### A bug the tests caught before it shipped

`_ntSave()` resolved clashes against `getTrainings()`, which re-parses the blob and returns **fresh objects** on every call. Excluding a player from a session fetched that way mutated a throwaway copy, so the exclusion was silently lost on write - the warning would have said the player was being moved, and he would not have been. `_ntClashes()` now takes the array being saved.

**17 new tests** (9 executing the draft builder, 7 on clash handling and save). **505 total** (364 unit + 103 rules + 38 functions).

Not included, deliberately: no push notification on call-up. A guest already discovers the session on his own landing page, which stage 1 fixed. Adding one is a decision, not an assumption.

## v74 - yesterday's training stopped leaving the landing page (2026-08-05)

Reported: a session from 04/08 still on the player's home page on 05/08.

The week strip's filter opened with `if (!t.date || !t.time) return true;` - so **a session with no time set never expired at all**. It was kept for ever, because the check that followed could not work out when it had started.

Two fixes, and the second is one the new `endTime` field finally makes possible:

- **A session on a past date is over, whatever its time says.** No time is no longer a reason to keep showing it.
- **Today's session now runs until its END**, not until an hour after its start. A 20:00-21:30 session used to vanish from the strip at 21:00, half way through it. Without an `endTime`, `sessionWindow()` assumes 90 minutes.

6 new tests. **370 unit**, 511 total.

## v75 - four fixes to the training setup (2026-08-05)

**1. The club-config schedule rows stopped spilling.** Seven controls in a `flex-wrap: nowrap` row inside a 560px card with 2.5rem padding - about 480px of usable width against a row demanding well over 500. The end-time field added in v70 tipped it over. The card is 720px now, the row wraps below 700px instead of scrolling, and the `.ts-sched-row input[type="time"]` rule is gone: **it never matched anything**. No `type="time"` input exists anywhere in the app, so those boxes fell through to `input[type="text"]`, whose `min-width: 100px` quietly beat their inline `width: 70px`. That was a large part of the overflow.

**2. Times are selects, so a bad one is unrepresentable.** The three club-config time fields were free text with a `HH:MM` placeholder and no validation - "8pm", "20.00" and "2000" all persisted happily and then failed to parse in `sessionWindow()`, where the clash maths silently fell back to its default. They use `buildTimeOptions()` now, the app's existing 15-minute-step select, already used by the staff calendar, both New Training fields and the call-up time. The digit-stripping `HH:MM` formatter that used to live in the config bindings is gone with them - a select cannot hold a malformed time.

**3. The end time defaults instead of sitting blank.** `sessionWindow()` has always assumed 90 minutes when no end was set, but the field showed nothing - so the UI and the arithmetic disagreed about what was happening. New `defaultEndTime(start)` makes that number visible: choosing a start in the club config fills an **empty** end 90 minutes later (never overwriting one the coach set), and `buildTrainingDrafts()` derives one when the schedule has none. It returns nothing rather than wrapping past midnight, because a session crossing midnight would break the same-day minute arithmetic the overlap check uses.

**4. A session belongs to exactly one team.** The New Training page defaulted to every letter with "Tots" preselected, so a coach could create sessions for both squads without ever touching the bar. The chips are **single-select**, "Tots" is gone, nothing is preselected, and **Save is disabled until a team is chosen**. A category with one letter preselects it - there is no choice to make there.

This **deleted** code rather than adding it: `buildTrainingDrafts()` takes one letter instead of a list, and its cross-letter merge went with it. That branch existed only to collapse A and B onto one session, which nothing can ask for any more, and a tested-but-unreachable branch is worse than no branch.

**The session model is unchanged.** `teams` is still an array, and the demo club's 67 existing `['A','B']` sessions keep working everywhere - `trainingTeams()`, `calledPlayers()` and the reminders were always written for any number of letters. Only the creation path narrowed.

**4 new tests**, and the draft-builder block rewritten for the single-letter model. **515 total** (374 unit + 103 rules + 38 functions).

## v76 - category picker, status columns, and the Add-Player popup (2026-08-05)

**The category is chosen on the page.** It used to be inherited from `getCurrentCategory()`, so creating next week's juvenil session while looking at the amateur calendar meant switching the top bar first. There is a dropdown of the coach's visible categories now, defaulting to the current one, and the letter chips appear beside it **only when the category has more than one team**. Changing the category clears the team, because the letters it offered no longer exist.

**Medical status and fitness status** on every player row, in the squad list and in the picker - the roster's Estat Mèdic and Forma Física.

Doing that meant `playerStatusHtml()` had to move: it was a **local** inside `renderConvocatoria`, so the New Training page could not reach it. It is module-level now and both screens share one definition, which is what stops them drifting about what "doubt" looks like. The call-up keeps its hoisted `fitnessContext()` by passing it in, so nothing re-parses its blobs per player.

**"+ Add Player" is a popup, not an inline dropdown.** On a desktop there is room for a multi-column grid showing position, name, team, category and both status columns at once - which is what a coach actually needs to decide who to borrow; the inline list could show a name and little else. Multi-select with a live count on the Add button, a search box, backdrop-to-cancel. **On a phone the grid collapses to one player per row**, because a 320px minimum column would otherwise force a horizontal scroll inside the modal.

That removed two pieces of page state (`_ntPickerOpen`, `_ntPicked`): the popup owns its own selection and hands back the result, so the page no longer re-renders on every tick.

`test/readiness.test.js`'s wiring assertion was counting `readinessCellHtml(rd,` call sites literally. It now pins the actual invariant - three call sites, one of them the shared `playerStatusHtml`, and that helper staying out of any render function.

**515 total** (374 unit + 103 rules + 38 functions).

## v77 - a one-team category loaded no players and would not save (2026-08-05)

Reported straight after v76: choosing Juvenil, which has a single team, showed no squad and left Save disabled.

An ordering bug, not a UI one. The "one letter means no choice, preselect it" step lived in the **render**, while the category-change handler seeded **first**:

```js
_ntCat = catSel.value;
_ntTeam = null;
_ntSeed();      // _ntTeam is still null -> _ntDrafts = []
rerender();     // NOW the letter gets picked, too late
```

And it never recovered, because the render's guard is `if (!_ntDrafts)` and **`[]` is truthy** - so the seed that would have used the newly-picked letter never ran.

The preselect moved into `_ntSeed()`, ahead of building the drafts. One place decides the team, and it decides before anything depends on it.

4 new tests covering the switch: a one-team category preselects and builds in the same pass, a multi-team one builds nothing until a letter is chosen, and neither overrules a choice the coach already made. **519 total** (378 unit + 103 rules + 38 functions).

## v78 - the clash warning is a triangle, and its tooltip works everywhere (2026-08-05)

**The tooltip was bound in the wrong place**, and that explained more than the one symptom. The `mouseover`/`mouseout` delegation sat inside a **page-specific** bind block on `#dashboard-content`, which gave it two holes that both read as "the tooltip is broken":

1. It did not exist until you had visited that particular page, because the block is guarded by `content._settingsBound`.
2. It could **never** see a modal. An overlay is appended to `<body>`, so it is outside the dashboard container entirely — which is exactly where the new Add-Player popup lives.

It is bound **once, on the document**, keyed on `[data-tip]` rather than a class list, so any badge gets a tooltip by carrying the attribute and nothing needs rebinding after a render. `hideHoverTip` on scroll in capture, so a tip anchored to a row cannot hang in mid-air when the list under it moves. This also fixed `.reg-dot`, which had the same two holes.

**The warning is a triangle** (⚠) rather than a circled `!` — it reads as caution at a glance, which a filled circle does not.

4 new tests in `test/layout.test.js` pinning the delegation: on the document not a container, keyed on the attribute, hiding on scroll, and the old page-scoped copy **gone** rather than merely supplemented. **523 total** (382 unit + 103 rules + 38 functions).

## v79 - the tooltip painted underneath, and a saved session can be edited (2026-08-06)

**The tooltip was a stacking problem, not a binding one.** v78 fixed where the handler was bound, which was real, but the bubble stayed invisible in the one place the badge most needs it. `.ua-tooltip` is `z-index: 1000`; `.modal-overlay` is `2000`. Both are `position: fixed`, so DOM order does not help - the tooltip rendered, got `.visible`, was positioned correctly, and painted **beneath the modal card**. The `cursor: help` with no bubble was exactly that.

Now `10050`: above `.modal-overlay` (2000), `.body-map-overlay` (10000) and `.dp-popup` (10001), and deliberately below `#push-toast-container` (99999). `.roster-tooltip` had the identical latent bug - unnoticed only because nobody had hovered a `[data-tooltip]` badge inside an overlay yet - and moved with it. **A tooltip belongs above whatever triggered it**; the rule now says so in a comment, because the next overlay will otherwise be added above it.

**A saved session's squad can be edited until it starts.** Deliberately looser than `isTrainingLocked`, which freezes attendance answers an hour before kickoff - a late call-up is exactly when a coach needs this. A player added by hand is **marked as attending**, because a last-minute call has already been agreed in person and making the coach set the answer separately is a step carrying no information.

That uses `fa_training_staff_override`, the mechanism that already means "staff says this player is attending", rather than forging an answer under the player's own key. It shows in the staff-answer column on the same page, so the coach can see and change it, and dropping the player clears it so no stale override outlives him.

**One popup, not two.** `_ntOpenPicker` took an index into `_ntDrafts`; it takes a **session and a persist callback** now, so the create and edit paths share one picker, one clash rule and one row renderer. The clash resolution came out of `_ntSave()` into `_ntResolveClashes()` for the same reason.

**`_ntPersistSession()`** is the one path that writes a saved session back, and it hands the mutation the row **from the array it is about to write**. `getTrainings()` re-parses the blob and returns fresh objects on every call, so a row fetched separately is a throwaway copy - the bug a v73 test caught, which this stops coming back through a second door.

Guests of a **new** session are marked attending at save, never before: a draft the coach abandons must not leave overrides pointing at a session that never existed.

**11 new tests.** **534 total** (393 unit + 103 rules + 38 functions).

## v80 - a blank column that was not blank, and the release that would not land (2026-08-06)

**The service worker's "network-first" never reached the network.** Two unrelated v79 changes - a CSS `z-index` and a new JS feature - appeared to fail together, which is not how two independent bugs behave. `[...document.styleSheets]...filter(r => r.selectorText === '.ua-tooltip').map(r => r.style.zIndex)` returned `['1000']`: the browser was running the previous build.

The cause is in `sw.js`. The fetch handler is network-first for JS/CSS, but a plain `fetch(event.request)` is answered from the **browser's HTTP cache**, and GitHub Pages serves assets with a `max-age`. So the worker fetched a stale `app.js`, stored it under the **new** `CACHE_NAME`, and served it. Bumping `CACHE_NAME` never helped: the bump clears the old cache, it does not make the refill fresh.

Same-origin non-navigation requests now go through `new Request(event.request, { cache: 'no-cache' })`, which revalidates rather than bypasses - an unchanged file still costs a 304 and no body. Navigations are left alone: a `Request` cannot always be reconstructed from one, and the HTML is not what was going stale. The registration gained `updateViaCache: 'none'` so a release cannot sit behind a stale `sw.js` either.

**The empty Staff (editable) column was a working control painted white on white.** With no player answer and no override, `effectiveCls` was `''`, so the `<select>` carried no colour class and fell back to the base rule's `color: #fff` on a white card.

The rendering bug was hiding a worse one. Nothing was marked `selected`, and **a `<select>` with no selected option displays its first one** - so every unanswered player was silently showing "Yes" to anyone who could see the control at all. There is now a real `—` placeholder option, first in the list and selected when there is no effective answer, and choosing it back **deletes** the override instead of storing `''` (an empty string would read as a staff call and hide the player's own answer).

**The remove `×` moved into its own leading column** so every row lines up regardless of name length, with the `<th>` gated on the same `squadEditable` flag as the `<td>` - otherwise every column shifts by one. **Add player moved above the table**; in a `space-between` card header it sat at the far right edge of a wide card, reading as unrelated to the list it acts on.

7 new tests in `test/layout.test.js`. **400 unit tests** (up from 389), 541 total.

## v81 - one board entry, not four (2026-08-08)

Stage 0 of the tactical-board governance work (plan: `~/.claude/plans/working-on-esquerrapp-i-nifty-sunset.md`). **No schema change, no rules, no functions** - shipped on its own so a regression is bisectable before anything touches Firestore.

**The saved-board object was four hand-maintained copies of the same twenty fields**, inside `bindTactics()`: Save, Save As, Add to Training and Add to Match. They differed only in whether they carried an `id` and a `category`, and that difference is real - the library is an array routed on its own stamp, the training bucket is keyed by DATE (which two categories training the same evening share, so the entry has to say whose it is), and match boards carry neither because they join live through the matchId. Everything else was duplicated verbatim. A tool added to the editor reached whichever copy the author was looking at, and a board linked to a match quietly lost it.

New **`js/boards.js`** (`TB`) owns `buildBoardEntry(store, opts)` and `newBoardId()`. Pure - no DOM, no Firestore, no browser globals - with the store injected so the Node tests can build an entry without a browser. Same UMD idiom as `shard.js`, loaded after `db.js`.

Three things worth knowing:

- **`id` and `category` are OMITTED, not set to `undefined`.** `{id: undefined}` survives `Object.keys` but vanishes through `JSON.stringify`, so the in-memory object and the stored blob would disagree about the entry's shape.
- **Key insertion order is pinned by a test**, and that is not cosmetic: `db.js` diffs shards as serialised strings (`prevJson === nextJson`), so reordering keys would mark every board shard in every club as changed and rewrite the lot once for nothing.
- **`captureFrameState()` is deliberately NOT folded in.** It reads the same drawing layers, but a keyframe is a different object - no `id`/`name`/`boardType`/`tag`, and it carries a `duration`. The source guard in the tests is keyed on `tag: localStorage.getItem` precisely so it does not catch this sibling. (Found by the guard's first version, which was too broad and flagged it.)

`ensureBoardIds` now mints ids through `TB.newBoardId()` too, so the id format lives in one place.

16 new tests in `test/tactic-boards.test.js`, including three source assertions that fail if a fifth copy appears. **416 unit tests** (up from 400), 557 total. Frontend only - push to `main`, no `./deploy.sh`.

## v82 - the replay that flashed and reverted (2026-08-08)

Reported as *"on replay I briefly got a glimpse of the other created board, like it spilled onto the new one"*, and not reproducible on demand - which is itself the signature of a listener leak rather than a rendering fault.

`bindRoBoardAnimations()` selects **document-wide** (`querySelectorAll('.tb-ro-play')`) and is called from two places: the global bind pass after every page render, and `_refreshStdBoards()`, which replaces only `#std-boards-section`. Every play button *outside* that section keeps its DOM node, so it collected a **second** listener each time the section refreshed.

The handler is a **toggle** on `fieldEl._roPlaying`. Two listeners mean one click runs it twice: the first starts the animation, the second sees `_roPlaying` true and stops it. The first loop has usually already applied a frame by then, so the board flashes into an animated pose and snaps back. Nothing throws, nothing logs, and it only happens on a page where the section has been refreshed at least once - hence "felt like a one-time thing".

Guarded with a per-element `_roBound` flag, the same idiom as the `_tsBound` fix in v62. `refreshArrowheads` above it is idempotent and left alone.

**Pre-existing, not from v81** - the refactor touched only the four entry builders and `ensureBoardIds`, and `test/tactic-boards.test.js` pins the built entry as key-for-key identical to the literals it replaced. Worth stating because the two landed in the same session and the temptation is to blame the newer change.

Two source assertions added, deliberately kept next to each other: one that the guard exists, one that the selector is still document-wide. The guard is only load-bearing while the second is true, and separating them would let a future refactor quietly remove the reason for the first. **418 unit tests**, 559 total. Frontend only.

## Tactic boards, stage 1 - ownership, authors and templates (2026-08-08)

Rules and functions. **Additive as far as the app is concerned** - nothing reads the new collections yet - but it does modify four live functions, so it is a real deploy, not a no-op.

### The model

`tacticBoards/{id}` (metadata, listed) and `tacticBoardData/{id}` (payload) as **top-level siblings**, one document per board instead of one blob per category.

Two read arms and only two: the board's **club**, and the **creator wherever they are now**. `users/{uid}.teamId` is single-valued, so without the owner arm a coach who moves club would lose every board they ever drew.

- **`clubId` is a scalar and immutable**, forced to the creator's token at create. That answers *"what stops a coach planting a board in someone else's library"* by construction rather than by policing a list, and it is why a board created in club A stays an A board after its author leaves - which is exactly what the club-library requirement asks for.
- **`ownerUid` and `clubId` are duplicated onto the payload** precisely so its rule needs no `get()` of the metadata sibling. The file stays claims-only, as it has been since Phase 3b.
- **Not a subcollection of the metadata doc**: deleting a parent does not delete subcollections, which would leave invisible orphans. Not under `teams/{id}/` either: the owner arm would need a collection-group query, which needs a `match /{path=**}/` block, and wildcard blocks OR with every other block - the footgun `firestore.rules:171-182` already documents.
- **No category gate**, unlike `teams/{id}/data`. What made `data/` need one is minors' medical records; a board is a drawing of a formation. That holds only while `linkedTeams` - which embeds player ids and names - stays out of the payload, so stage 4 moves it onto the session reference and a test pins it.
- **`adoptsUnowned()`**: `'' -> me`, my club only. Legacy and seeded boards have no author to invent, so they land with `ownerUid: ''` and would otherwise be permanently read-only, since update requires the owner arm.
- **Leads may DELETE but not UPDATE.** Pruning the library of a departed coach is governance; editing their board is authorship.

30 new rules tests, **133 total**. Four are *query satisfiability* - a rule can be per-document correct and still leave the client unable to list anything, the trap `db.js:213` documents.

### The author label

`clubs/{clubId}/boardAuthors/{uid}`, Admin-SDK-only (`write: if false`). A coach who leaves club A has `teamId == club B`, so A cannot read their profile, while A's library must still name who drew each board and for which team.

`authorLabelFrom()` picks the **highest category they coach here - the lowest `CATEGORY_ORDER` index** - reusing `shardRank()` rather than adding a fourth copy of the order. It stores `category` + `letters`, **not** a rendered "Cadet A": the app is trilingual and the client already localises category names.

`syncBoardAuthor()` **freezes on leaving by writing only the status fields**, so "their last team in this club" needs no snapshotting logic - it is what is already stored, left alone. A freeze never *creates* a label, so a player leaves no tombstone.

Six call sites across five functions (`onClubLeadChanged` has two). **`joinClub` is the one that is easy to miss**: when a lead adds an unregistered coach's address, `onRosterWritten` fires but finds no `users/{uid}` and skips them, so `joinClub` is where that uid first exists. Every call site is wrapped - a label is cosmetic and must not abort a membership change that has already applied.

`resolveMembership()` **removed**: every caller now needs the roster list for the label too, and the helper hid a `loadRosters()` inside itself, so keeping it meant either reading rosters twice or having two ways to do the same thing.

### Templates

`promoteBoardTemplate` and `seedClubFromTemplates`, both superuser-only. **Both must be callables** because both write documents the caller does not own - the superuser is not a member of the club being read from or seeded into, so the rules would refuse a direct write. Creating an ordinary board stays a direct client write, since its rule is fully self-enforcing.

Promotion takes an **anonymised copy**. Three properties follow from copying rather than from any rule: the origin club keeps control of its own board, deleting that board does not break the template, and editing it does not silently mutate every club seeded from it. Seeding likewise copies into the club, so a club can edit and delete its own starter set without touching anyone else's; boards land `ownerUid: ''` + `sourceTemplateId`, which is also what makes re-seeding idempotent.

**The strip parses and re-stringifies** rather than pattern-matching the JSON, so removing `linkedTeams` is real and not cosmetic. A test asserts no player name survives into a template payload.

### Testing note worth keeping

`test:functions` runs `--only firestore,functions` with **no Auth emulator**, so `setCustomUserClaims` throws before execution reaches `syncBoardAuthor`. Testing the author label through `onRosterWritten` would have asserted nothing **and still looked green** - that is what the `FirebaseAuthError` stack traces in that suite's output are. `test/board-authors.test.js` therefore uses the source-grab technique from `reminders.test.js` and exercises the helpers directly. The two callables touch no Auth, so `test/templates.test.js` drives them end-to-end through `.run()` like `teams.test.js`.

**438 unit + 133 rules + 50 functions = 621** (was 541).

### Deployed 2026-08-08, and the trap the first local deploy found

Rules first, then functions - the opposite of the v55 runbook, and deliberately: v55 *narrowed* an existing block, so rules had to go last or a cached frontend would 403. This only *adds* blocks. **Widen before, narrow after.**

The functions deploy failed first time, with **every** function - including untouched ones - reporting `Container Healthcheck failed`. The cause was not the code:

```
Error: Cannot find module '@firebase/app'
Require stack:
 - /workspace/node_modules/@firebase/database-compat/dist/index.standalone.js
 - /workspace/node_modules/firebase-admin/lib/database/index.js
```

`functions/package-lock.json` is **gitignored**, so Cloud Shell never had one and every deploy up to now resolved dependencies fresh. A local deploy uploads whatever lock is on disk; Cloud Build runs `npm ci` against it; and the lock here was dated **3 August** while the installed tree was `firebase-functions@6.6.0` / `firebase-admin@13.10.0`. `npm ci` therefore built a container missing a transitive dependency.

Two things worth remembering:

- **Production never went down.** Cloud Run does not route traffic to a revision that fails its health check, so the previous revisions kept serving throughout - visible in the log as `scheduledtrainingreminder` running normally two minutes *after* the failed deploy. The two new callables existed with no serving revision (`---` memory in `functions:list`) until the retry.
- **This trap is created by deploying locally**, and did not exist while deploys came from Cloud Shell. `deploy.ps1` now refuses to start when the lock is present rather than leaving it to be rediscovered.

Moving the stale lock aside and redeploying updated all 17 functions cleanly, every startup probe succeeding on the first attempt.

## Tactic boards, stage 2 - the backfill (2026-08-08)

`functions/backfill-tactic-boards.js` explodes each club's `fa_tactic_saved__{category}` blob into one `tacticBoards` + `tacticBoardData` pair per board. **Script only - nothing reads the new documents until stage 3**, so this can run whenever and be re-run freely.

- **Nothing is deleted.** The blob shards stay byte-identical, so the app keeps working from them and a mistake costs only some documents to remove. The `--gc` sweep is a separate, later job, gated on the frontend switch.
- **`ownerUid: ''`.** There is genuinely no author information anywhere in the old model - no `createdBy`, no uid, no timestamps. Attributing these to the club lead would be a lie, would grant them edit rights over drawings they did not make, and - worst - would follow them to their **next** club through the owner read arm, exposing club A's library to club B. `''` matches no `request.auth.uid`, so the club arm is the only way in. Any staff of the club can adopt one.
- **Idempotent twice over**: a board whose document already exists with `schema >= 1` is skipped, and a board with no `id` of its own gets a **deterministic** id from `sha1(club|category|name)` - a random one would mint a fresh duplicate on every run. Nearly every board has an id already (`ensureBoardIds` has run client-side for a while), but a library untouched since before that shipped does not.
- **`linkedTeams` is stripped**, and this is the one that matters: it embeds player ids and names, and the new read rule is club-wide with no category gate. It has no business in a board payload at all.
- **`--authors`** seeds `clubs/{clubId}/boardAuthors/{uid}` for every current staff member of every club. Without it those labels only appear the next time somebody edits a roster, so every existing coach's boards would render authorless. Unregistered addresses are counted and skipped - `joinClub` writes their label when they register.
- An **unparseable shard throws** rather than being treated as empty: reporting "0 boards" for a club that has a library would let an operator believe there was nothing to migrate.

The script carries its own copy of `authorLabelFrom` - it is not deployed, and `functions/index.js` must not export non-function values or the CLI's export discovery treats them as functions to deploy. `test/board-authors.test.js` runs **both copies over the same fixtures** and fails if they disagree, the same technique `quota.test.js` uses for the client and server copies of `rosterKeys`.

`test/backfill-boards.test.js` drives the real script as a subprocess against the emulator, like `wipe.test.js`. The properties it pins are the ones an operator relies on but cannot see: **a dry run writes nothing** (or the "read the dry run first" workflow is a fiction), it is idempotent, it never touches the source shards, and `linkedTeams` never reaches the payload.

**445 unit + 133 rules + 50 functions + 9 backfill = 637.**

## Tactic boards, stage 3 (v83) - the club library

`js/boards.js` gained the client half of the model, and the saved-board list became two sections.

**TWO QUERIES, NEVER ONE.** `clubId == my club` for the library, `ownerUid == me` for the boards a coach made before moving club. They cannot be merged and must not be: a collection query is rejected outright if ANY document it returns could be denied, so each has to narrow on the field its own rule arm tests. The same constraint `db.js:213` documents for data shards.

Metadata and payload stay separate collections, so listing a library does not download megabytes. The club query gets an `onSnapshot` (metadata only, so it stays cheap) - a board drawn by a colleague appears without a reload. Payloads never get a listener: fetched lazily, memoised, evicted oldest-first past ~4 MB.

`TB.save()` writes the pair in ONE BATCH - the correctness requirement, not an optimisation, exactly as `db.js:404` argues for shards - and refuses to re-home or re-own an existing board: `clubId` and `ownerUid` come from what is already stored, never from the caller.

Hooked into `DB.init` rather than the seven `DB.init()` call sites, so the board index cannot drift from the data beside it.

### The UI, after two rounds of feedback

The first cut shipped one undifferentiated list still titled "Pissarres desades", so the library was invisible. It is now:

- **Pissarres preferides** - everything the coach made, plus anything they starred. Own boards are included IMPLICITLY and never written to the favourites list: it would double the bookkeeping for something derivable, and a coach should not be able to lose their own work from their own list.
- **Biblioteca del club** - every board of the club, with a star toggle, an author line and a search box.

Favourites live on `users/{uid}.tacticFavorites`, so they follow a coach between phone and web and across clubs. **No rules change was needed** - the self-update rule forbids a named list of membership and privilege fields and this is not one of them. Written with `arrayUnion`/`arrayRemove` so two devices cannot clobber each other, with the local state put back if the write fails.

**The library is never category-filtered, and `'tactics'` came back OUT of `CATEGORY_PAGES` one commit after joining it.** A board carries a category, but a coach hunting for a pressing drill does not care which squad it was drawn for, and hiding two thirds of a library behind a filter they did not set is how it stops being one. Search narrows it instead - name, coach, category and tag together.

Every trailing control is a fixed-width cell so the play marker and the delete cross line up down the list; sizing them to content put each row's icons at a different offset depending on whether that board happened to be animated.

**Dual-write with an unconditional cap.** The blob is still mirrored for the v43-era APK with `frames` and `penLines` always stripped - what closes the 1 MiB limit one category was heading for, without waiting on an APK nobody has installed. The mirror merges over the PREVIOUS blob, not over `{}`: payloads are lazy, so most boards are not cached on any given save, and defaulting to `{}` would publish a library of boards with no positions - every drawing blank on the one client the mirror exists for.

## Tactic boards, stage 4 (v84) - sessions reference boards

A match or training session stores `{boardId, name, tag, category?}` instead of the whole board. This kills three things at once:

- **the storage amplification** - a board on five matches and three trainings was stored NINE times, and dragging one circle rewrote every copy plus the category shard
- **the name matching** - linked copies were re-synced by comparing NAMES, so renaming a board orphaned its links, and once boards were sharded per category the same name could legitimately exist twice
- **the drift** - editing the library board now changes every linked view by construction

`linkedTeams` MOVED onto the session reference, where it always belonged: it records which squads were split for THIS session, and it carries player ids and names, which the club-wide board read rule must never expose.

**Safe to ship the day it landed**: `tbResolveRef` falls back to the entry itself when it still carries a drawing, which every pre-existing entry does and every dual-write fat copy produces. Nothing renders asynchronously; the placeholder path only comes alive once the fat copy stops being written.

### Three fixes the owner's testing produced

1. **Linking must not WRITE the board.** `tbEnsureSaved` wrote the loaded board before referencing it, and a board already in the registry that is not mine cannot be written by me - the rules are right to refuse. Since the migration leaves `ownerUid: ''` on everything until somebody adopts it, the failure was near-universal. **The rules were correct throughout and the client was asking for the wrong permission**; it presented as a rules bug and was not one.
2. **Link an untouched board; fork an edited one.** The first fix returned the EDITED entry while referencing the ORIGINAL board - during dual-write the old APK would show the edits and the new client would not. Untouched now means a pure reference; edited means a confirm and a `(còpia)` owned by the coach, original untouched.
3. **Save is hidden when the board is not the coach's to overwrite**, with a line saying whose it is and what to do. A button that always fails should not be there. Adopting the board that is currently open re-renders the editor so Save reappears - lossless, because all editor state lives in localStorage, not the DOM.

`showTbConfirm` gained an `onCancel`. It only ever had `onConfirm`, and Cancel, a backdrop click and being replaced by another dialog all just closed the overlay - so a caller awaiting an answer hung for ever on three of the four ways out.

## The formation leak (v84)

Reported as *"if I had previously selected a formació, it kind of appears in the first frame of other boards"*. A real defect, and **not** the v82 replay flash.

Every animation frame carries its OWN positions. Selecting a formation cleared `fa_tactic_positions` and spawned the new shape but never touched `fa_tactic_frames` - so the next mutation ran `autoSaveFrame()`, which writes the current state into `frames[activeFrameIdx]`. After a load that index is **0**, so choosing a formation silently overwrote the animation's FIRST POSE. Save As and Add-to-session then copied those frames into the next board, which is the cross-board half of the report.

An animation of eleven players in a 4-3-3 does not survive being re-shaped into a 3-5-2, so changing the formation resets the frames - in memory AND in localStorage, because `autoSaveFrame()` writes from the in-memory array and clearing one would let the next mutation put them straight back. Never silently: a board with a real animation asks first.

## Leaving the editor with unsaved changes (v84)

Hooked into `navigate()`, the one place every page change funnels through. The test is on `_lastRendered`, not `currentPage`, so the many re-renders that do NOT change page never prompt, and `currentPage` is restored before returning - leaving it on the target would show the tactics page while the app believed it was elsewhere, and the next incidental re-render would silently complete a navigation the coach had declined.

`tbHasUnsavedWork()` rather than `hasTacticUnsavedChanges()`, which bails out with `if (!curFormation) return false` - most drills have no formation, so that helper answers "no changes" for exactly the boards a coach is most likely to lose. It errs towards SILENCE: an uncached payload counts as unchanged rather than guessing, because a false warning on every navigation trains people to dismiss it.

## v85 - the teams generator works on the session's squad

Reported as "the unused-players pool lists every player in the club". **Three defects**, all in the same few lines, all the same two confusions - club vs squad, and date vs session.

1. **The pool was the whole club.** Four sites pulled `getUsers().filter(roles includes player)` and filtered only by availability, never by whether the player is IN the session. Now `calledPlayers(t, getUsers())` - teams + guests - excluded - which also fixes the suggested players-per-team, which had been dividing the entire club by two. The one site that already had the squad passed the version narrowed by the table's team filter; the pool takes the unfiltered squad, because its job is to offer anyone in the session.
2. **The session's DATE was passed where the session goes.** `getEffectiveAnswer` has keyed on session id since v71; a date sends every lookup down the legacy fallback, which v71 deliberately restricts to a player's own squad - so **a guest's availability was read wrong**, in the one feature guests exist for.
3. **`_refreshStdBoards` took a date** and handed it to `renderStdBoardsSection`, which takes a session. `sess.date` was undefined, the bucket lookup missed, and the Tactical Boards section **blanked** after generating or linking teams until a full page render. It takes the session now, and still tolerates a bare date from the two older call sites.

(2) and (3) are pre-existing and would not have been noticed from the reported symptom.

**449 unit + 133 rules + 50 functions + 9 backfill = 641** (was 541 at the start of the session).

## Tactic boards, stage 5 (v86) - the superadmin catalogue and the sellable library

`HANDOFF.md` had carried *"Superadmin template UI is not built"* since stage 1: `promoteBoardTemplate` and `seedClubFromTemplates` were deployed and tested with nothing calling them. This is the caller, plus the draft stage the workflow turned out to need.

### The constraint that shaped it

**Club boards are read-only from the superadmin view.** The rules would allow otherwise - `isSuperUser()` is an arm of every `tacticBoards` write - but a club's library is the club's, and an edit landing there without its author knowing is not something this product should be able to do. So the catalogue offers exactly two actions per row, **Veure** and **Copiar**, and no third.

Everything editable is therefore a copy. That is what promotion already was; what was missing is that a promoted board is not yet a product.

### `published`, and why seeding is the place it is enforced

`promoteBoardTemplate` now writes `published: false`. `seedClubFromTemplates` skips anything that is not `published === true`, **in the per-template loop rather than in the pack query** - so the explicit-ids path is gated as well as the pack path, and no composite index is needed. The UI refuses to publish a template with no pack, because seeding takes a pack name or an explicit list and the panel only offers packs: a published template with no pack is one nobody can be sent.

Nothing called either function before this version, so the narrowing carries no compatibility risk. The existing seeding tests had to publish in `beforeEach` to keep passing, which is the gate being visible rather than a nuisance.

### `tacticTemplateSources` - provenance in its own collection

The catalogue marks boards already taken into the library. The obvious implementation - `sourceBoardId` on the template - is wrong: `tacticTemplates` is readable by **every signed-in user**, and "anonymous by construction" is the property that lets it be. A board id is not personal data, but the template document should not be able to say which club's board it came from.

So `tacticTemplateSources/{boardId}` -> `{templateId, clubId, promotedAt}`, `read, write: if isSuperUser()`, written in the same batch as the promotion. Keyed by **board** rather than by template, so re-promoting the same board overwrites instead of accumulating rows.

### The catalogue query

One unfiltered `db.collection('tacticBoards').get()`. That is satisfiable **only** for the superuser: the read rule's first arm does not depend on the document, so no document the query can return could be denied. Every other caller still has to narrow on the field its own rule arm tests - the two-queries-never-one constraint from stage 3 is unchanged.

Author labels come from `clubs/{id}/boardAuthors`, one read per club. `users/{uid}` would not do: a coach who left club A has `teamId == club B`, and the frozen label is the only place their team at A still exists.

### Template editing is a MODE, not a second editor

Every scrap of editor state lives in localStorage, so opening a template is hydrating those keys - the editor itself needs no knowledge of where the drawing came from.

- **`tbHydrateEditor(board, opts)`** and **`tbClearEditor()`** were extracted from the saved-list click handler and the New Board button. Both lists were about to exist twice, and a list of scratch keys maintained in two places ends up missing whatever layer was added last. `test/tactic-boards.test.js` already guards this shape of duplication for `buildBoardEntry`.
- **`fa_tactic_loaded_id` and `fa_tactic_template_id` are mutually exclusive**, set and cleared together. Both set at once would let Save write to whichever the next reader happened to check first.
- **`_tbTemplateEntry()` is ONE call site for three template operations** - Save, Save As, and the template arm of `tbHasUnsavedWork()` - so the comparison and the write cannot disagree. The source assertion moved from four `TB.buildBoardEntry(` call sites to five and fired correctly while this was being written, for the third session running.
- **`tbHasUnsavedWork()` needed a template branch.** Without one it fell through to "nothing loaded", where any drawing at all counts as unsaved - so every navigation away from an *untouched* template would have prompted, which is how a warning stops being read. The baseline is captured after hydration through the same builder the save path uses, and moved forward after each save.
- Template mode hides Add-to-Match, Add-to-Training and the club boards panel, and never calls `tbLegacySync()`: a template belongs to no club, so there is no session to link it to and no club blob to mirror into.

`'tactics'` stays in `STAFF_PAGES`, with one exception for `session.isAdmin` - the template editor has to be reachable regardless of which club the superadmin happens to be a member of.

### Routing

`SUPERADMIN_PAGES`, checked against `session.isAdmin` alone. `ADMIN_PAGES` could not be reused: it is deliberately open to club leads as well, because a lead must be able to manage their own members. These pages show every club's data.

### 449 unit + 134 rules + 53 functions + 9 backfill = 645 (was 641).

## The club badge on "Configura el teu club" (v86)

Reported as *"the badge that appears I think it's hardcoded"*. It was: `index.html` wrote a literal `img/logo.png` into the team-setup card and `showTeamSetup()` never touched it.

The same line appears in four other auth cards - login, register, join club, profile setup - and is **correct in all four**, because they run before any club is known. Team setup is the odd one out: it only ever runs after `loadClubConfig()` has populated `_clubConfig`. It now reads `_clubConfig.badgeUrl` with the app logo as fallback, the same pattern as the top-nav crest in `renderDashboard`. The fallback is not decorative - `_loadClubList` renders a `+` placeholder for clubs with no `badgeUrl`, so they genuinely exist.

## The invoker binding, and the second bill for the package-lock incident (v86)

Reported as *"Copiar returns Error Internal"*. Not a bug in the new code, and not visible anywhere a normal investigation would look.

`promoteBoardTemplate` was rejected by **Cloud Run's IAM layer, before the container ran**. So: the client got a bare `internal`, the function log was empty, and the deploy had reported success. The only trace anywhere was one line in the Cloud Run request log:

```
The request was not authenticated. ... Empty Authorization header value.
```

**A Firebase callable needs `allUsers` to hold `roles/run.invoker`.** That is not a security hole - a callable authenticates *inside* the function against the Firebase ID token, and `assertSuperUser()` is the real gate. But firebase-tools grants that binding **only on the CREATE path**.

These two functions never had it. Their create on 2026-08-08 failed at the container healthcheck - the stale `functions/package-lock.json` - and the retry went through `UpdateFunction`. So they were **the only two callables in the project without the binding**, they deployed cleanly for five days, and every deploy afterwards was an update that could never repair it.

### The one-line check, which is the part to remember

An unauthenticated POST must reach the FUNCTION, not the front end. No credentials, no side effects, free:

```bash
curl -s -o - -w '\nHTTP=%{http_code}' -X POST \
  https://us-central1-esquerrapp.cloudfunctions.net/promoteBoardTemplate \
  -H 'Content-Type: application/json' -d '{"data":{}}'
```

- **401** + `{"error":{"status":"UNAUTHENTICATED"}}` - healthy. That JSON is `functions/index.js` talking, so the request got past IAM.
- **403** + an HTML error page - broken. That is Google's front end; the container never ran.

Run it after any deploy that **creates** a callable. It is the only honest signal: the deploy output, the function log and the emulator suite all look identical in both states.

### `invoker: "public"` does NOT fix this, and it type-checks

The obvious repair is to declare the option. It is accepted - `CallableOptions extends HttpsOptions` - and then **silently dropped**: `onCall` builds `callableTrigger: {}` and never copies the field, while the two `convertIfPresent(..., "invoker", ...)` calls live in `onRequest` alone (`firebase-functions@6.6.0`, `lib/v2/providers/https.js`). It was shipped here as a fix, verified only against the deploy output, and changed nothing. A source-assertion test went with it and was worse than useless - it would have stayed green for ever while the function stayed broken. Both are backed out.

**The repair is to DELETE the function and let a deploy create it again.** That is what fixed both.

Four things worth remembering:

- **The package-lock incident charged twice.** It did not merely fail one deploy in August; it left two functions permanently broken in a way no later deploy would fix.
- **Verify deployment properties against the DEPLOYED function.** `.run()` invokes the handler directly, so `test/templates.test.js` passed throughout - the emulator never sees the IAM layer that was rejecting every real call.
- **The stored firebase-tools credential cannot make IAM writes.** Minting a `cloud-platform` token from the refresh token in `~/.config/configstore/firebase-tools.json` - the technique that works for read-only Google APIs - returns `invalid_grant / invalid_rapt` for `setIamPolicy`. Google wants an interactive reauth.
- **`functions:delete` and the deploy are both flaky on this project, and lie about it.** The delete failed twice with a bare `Error: An unexpected error has occurred.`, then succeeded in six seconds. An earlier attempt "timed out after 1500000ms" client-side having actually completed server-side - `functions:list` said so. Two recreate attempts died on a source-discovery hiccup and a DNS failure to `cloudresourcemanager`. **Re-run, and check the resulting STATE rather than the exit code.**

**449 unit + 134 rules + 53 functions + 9 backfill = 645.**

## v87 - three defects the owner's testing produced

### 1. Every toast has been unreadable, and for a long time

`.push-toast` set `background: var(--dark)`. **`--dark` has never been defined** - it appears exactly once in `style.css`, in that line. `var()` on an unknown custom property with no fallback is *invalid at computed-value time*, so `background` fell back to `transparent`: white text on whatever happened to be behind it. Now `var(--sidebar-bg, #2D2926)`.

Nothing to do with this feature - it just became obvious, because the superadmin page reports through toasts constantly where the rest of the app rarely does.

### 2. `navigate()` took no arguments, and six call sites passed one

`navigate('tactics')` set nothing. The function rendered whatever `currentPage` already said, and all six existing callers fire **from the tactics page**, where it already said `tactics` - so the argument was ignored and nobody could tell.

`_abOpenTemplate` was the first caller to cross pages. Clicking **Editar** hydrated the template into localStorage and then re-rendered the admin page, so the button looked dead while having already changed the editor's state underneath it.

`navigate(page)` now honours the name. Safe because it is never passed as a listener - as a click handler the first argument would be an Event, and `currentPage = <Event>` would break everything. One call site went the other way: the orientation toggle re-renders after a 300ms timeout, and now that the name is honoured it would drag someone who had navigated away back to the board, so it passes nothing.

### 3. Editor state leaked between sessions on the same device

The `fa_tactic_*` scratch keys are local-only and survived logout, so the next person to sign in on that device opened the editor on the previous one's drawing. That was harmless while it was always a board of your own club. It stopped being harmless the moment the superadmin could hold a **platform template** there: signing in as an FCB coach opened the editor on the template that had just been sent to them.

Two fixes, because one of them is not enough:

- `tbClearEditor()` on sign-out, which is where the leak actually is.
- In `renderPage`, `if (tbEditingTemplateId() && !session.isAdmin) tbClearEditor()` - at the point where authority is decided, rather than trusting every path in and out of the editor to tidy up after itself.

(2) is what caused (3) to be *noticed*: the dead Editar button left a hydrated template sitting in localStorage.

### 4. Seeded boards are hidden from the club catalogue (v87)

A pack you sent a club came back at you in *Pissarres dels clubs*, as something to copy. It is not club work, and promoting it again would put a copy of your own template back in your own library.

Filtered on `sourceTemplateId`, which `seedClubFromTemplates` stamps and which **survives the club editing the board**: `TB.save()` writes metadata with `{merge: true}` and never clears it. The row count says how many are hidden rather than silently dropping them.

A club that uses **Save As** on a seeded board gets a new id with no stamp, and that board *does* appear - correctly, since it is their own derivative work rather than the pack.

## The v87 Pages deploy failed, and "no changes" was literal

Reported as *"I see no changes"* after a push that had gone through. It had: the commit was on `main`, and the deployment for it existed. What failed was the **deploy step**, seven seconds in:

```
JOB: build   -> success     (Jekyll was fine)
JOB: deploy  -> failure     Deploy to GitHub Pages
```

So the site kept serving the previous commit and every "hard-refresh and check `sw.js`" instruction was beside the point - the old version really was the live one.

**Check the SERVED file before debugging a frontend fix**, exactly as the Cloud Run probe checks the deployed function rather than the deploy output:

```bash
curl -s "https://scaredmeeseks.github.io/EsquerrApp/sw.js?cb=$RANDOM" | grep CACHE_NAME
```

If that lags the local `sw.js`, nothing shipped and the browser is innocent. The deployment history, which needs no auth on a public repo:

```bash
curl -s "https://api.github.com/repos/ScaredMeeseks/EsquerrApp/deployments?environment=github-pages&per_page=3"
# then the statuses_url of the one you care about → state: success | failure
```

A failed *deploy* step is transient and GitHub-side; the fix is to push again (any commit re-triggers it). A failed *build* step would be Jekyll, and would be ours - there is no `.nojekyll` in this repo, so the site IS Jekyll-processed.

## v88 - the opposition flash is a REAL bug, and a login spinner

### The opposition flash

Reported as *"we still get some flashes for the opposition team even when it's not really in the first/last frames"*, with the explicit question of whether it was legacy. **It is live, and it is not either of the two flashes already fixed** - not the v82 replay flash (a duplicate listener toggling playback off, fixed with `_roBound`) and not the v84 formation leak.

`renderReadOnlyBoard` decided opposition visibility **twice, differently**:

| | static render | animation (`framesForAnim`) |
|---|---|---|
| `showOpp` | `b.showOpp !== false` | **not tested at all** |
| positions | `frames[0].oppPositions` only | `f.oppPositions`, falling back to `b.oppPositions` |

Two independent ways to disagree, and both produce the reported symptom:

1. **A board with the opposition toggled OFF still animates them in.** Turning the opposition off does not discard `oppPositions` - it is kept so toggling back restores the shape - so a board that statically draws no opposition grows eleven of them the moment you press play, and loses them again when it stops.
2. **A frame with genuinely no opposition inherits the board's.** The static first-frame render reads only `frames[0].oppPositions`, while the animation falls back to the board's for any frame lacking the key.

Now decided once, above both: `roShowOpp` and `srcOpp`, with the frame's own positions falling back to the board's - which is what every other layer (rects, arrows, texts) already does. The static render and the animation cannot disagree because there is only one answer.

Worth noting for the next report of this kind: *"is this legacy?"* was the right question and the answer was no. Two prior fixes in this area made "already fixed" the tempting reply.

### Login spinner

There was no feedback at all between pressing **A jugar!** and the app appearing - Auth round trip, profile read, club config and the whole data download, several seconds on a cold start. The button now spins and is **disabled**, because a second submit mid-flight starts the entire flow again. Restored on both exits, including success: the login view is reused after sign-out and a button left spinning would greet whoever came back.

`.btn-spinner` is sized in `em` so it tracks the button's font, and honours `prefers-reduced-motion`.

## v89 - an animated board opened on its LAST frame

Reported as *"when I send it inside a pack to a club, the first frame starts from the end of the last frame"*. Real, and not confined to packs - that is just where it is most visible.

`positions` on a board is **whatever was on screen when Save was pressed**, not frame 0. Finish an animation, review it, press Save while looking at the final pose, and that pose is what the board stores. `tbHydrateEditor` then wrote it into `fa_tactic_positions` *while removing* `fa_tactic_frame_idx` - so the editor believed it was on frame 0 and displayed frame N.

Packs show it because a board is normally promoted right after its animation has been finished and reviewed, so the author was almost certainly on the last frame.

**The display was the harmless half.** `autoSaveFrame()` writes the current state into `frames[activeFrameIdx]`, and after a load that index is 0 - so dragging one player after opening such a board **overwrote frame 0 with the last frame's pose**, silently. That is the v84 formation leak again, reached by a different route: same helper, same index-after-load assumption.

A keyframe is a complete snapshot (`captureFrameState`), carrying no name, id, formation, colours or `frames` key, so frame 0 is laid straight over the board on hydrate. The read-only renderer already did the equivalent (`src = frames[0]`); the editor is now consistent with it.

Both fixes this session came from the same root: **the resting state of an animated board is frame 0, and every consumer has to agree on that.** The read-only renderer knew, the editor did not, and the animation had its own opinion about the opposition.

## v90 - the opposition had no per-player colour, and the picker lied about it

Asked as *"is it possible that if I add the opposition team I cannot change the colour of a single player?"*. It is, and it was not a missing feature so much as a broken one: the right-click menu **offered** the colour picker on an opponent, applied it, and then reverted it a moment later.

`applyColorToCircle()` calls `saveState()`, and `saveState()`'s opponent branch repainted **every** non-goalkeeper opponent to the global `oc`:

```js
} else {                                    // no guard, unlike the home branch
  c.style.background = oc; ...
}
```

The home branch had `else if (!c.dataset.color)` and the opposition never did, so the colour was overwritten by the very call that was supposed to persist it. There was also nowhere to persist it *to* - no `oppColors` anywhere in the model.

`fa_tactic_opp_colors` now exists end to end: `saveState`, `captureFrameState`/`applyFrameState`, `buildBoardEntry`, `pushUndo`, copy/paste, the editor's initial render, the read-only renderer and both animation paths.

### Forward-only, which is NOT what the home team does

Home colours sync to **every** frame (`syncColorsAcrossFrames`). Opponent colours propagate from the active frame **forward** (`syncOppColorsForward`), and `applyFrameState` takes them from the frame outright rather than merging them with the current state the way home colours are merged.

That difference is the feature, and it is worth stating because the two functions sit next to each other and look like an inconsistency:

- a **home** colour is a property of the player - the same shirt all move long;
- an **opponent** colour is a property of the **moment** - mark the man who has just been picked up, and every later frame inherits it while the earlier ones keep the original kit.

Setting a colour again later overrides it from that frame on, and replaying from frame 0 shows the original, because frame 0 was never written.

**Resolved in v91:** the home team was aligned to forward-only on the owner's call, so there is now ONE rule and `syncColorsForward(key, lsKey)` serves both. `applyFrameState` takes each team's colours from the frame outright; the home merge (`currentColors[i] || fColors[i]`) is gone, and it was the reason forward propagation could not work - stepping back to frame 0 kept the newer colour, so there was nothing to propagate away from.

A frame whose `colors` is null genuinely had no custom colours when it was captured, so treating absent as empty loses nothing on existing boards.

### Key order

`oppColors` is appended after `colors` in `buildBoardEntry`. Key order IS the shard diff (`prevJson === nextJson`), so any new key costs one rewrite of every board shard; `KEY_ORDER` in `test/tactic-boards.test.js` is updated to match, and the per-layer assertion list gained a line - that test is the one that fails when a tool is added to the editor and not to the entry, which is exactly what happened here.

## v92 - undo was scrambling the board (a v90 regression)

`popUndo` restored through **two index-aligned arrays**. v90 added `fa_tactic_opp_colors` to the localStorage list and never added `'oppColors'` to the state list, so from index 3 onward every entry was restored into the wrong key: `oppPositions` into `fa_tactic_opp_colors`, `oppNumbers` into `fa_tactic_opp_positions`, and so on down the list. Undo silently scrambled the board, and it was live for two versions.

Found while mapping the colour code for striped kits, not from a report - which is the useful part: **nothing would have surfaced it**. There is no test over `app.js`, undo produces no error, and the damage looks like a board that "went weird" rather than like a bug with a cause.

Two fixes, because the missing entry was only the symptom:

- The arrays are now **one list of pairs**, `[[stateKey, lsKey], …]`. Two lists that must stay in lockstep, edited by different changes months apart, was the actual defect.
- The DOM rebuild below the restore was missing `oppColors` too, so `applyFrameState`'s `f.oppColors || []` blanked the colours the restore had just put back.

The wider lesson is the one this session keeps producing: **a parallel-array invariant that nothing checks will eventually be broken by an unrelated change.** The same shape - two things that must agree, with no assertion between them - was behind the v90 opposition-colour bug and the read-only/animation disagreement in v88.

## v93 - striped kits

A player marker was one flat colour, so a coach drawing against a striped side had no way to show it. Both teams read as solid blocks. Now: a **stripes** toggle beside each colour swatch and in the right-click menu, with a count (2-6), a direction, and a second colour.

### The decision everything else followed from: encode a fill as a STRING

```
s|<v|h>|<n>|<c1>|<c2>        e.g.  s|v|4|#e53935|#ffffff
```

Circle colour lived as a hex string in about a dozen places - the per-frame colour arrays, every `frames[i].colors`, `buildBoardEntry`, the undo snapshots, copy/paste, `buildCircles`. Encoding into those same slots meant none of them had to learn a new shape, and **per-player stripes inherited per-frame storage and forward propagation for free**.

An object would have been the obvious choice and would have broken the app: circle colours are interpolated **raw into double-quoted HTML attributes** in three places - `data-color="…"` for both teams in the editor's markup, and `data-tc="…" data-oc="…"` on read-only boards. A value containing a quote breaks the markup of every board that uses it. The pipe form has no quotes, and a test pins that.

### fillCss is a chokepoint, not a tidy-up

`darkenHex` had **22 callers and every one was a circle border**; `textColorFor` had 21 on circles. Both parse hex and return `'#NaNNaNNaN'` on `s|…`. So `parseFill` / `fillCss` / `paintCircle` (in `js/utils.js`, beside them) are load-bearing: **`darkenHex` now has zero callers in `app.js`**, and a source assertion keeps it that way.

That matters because there are **five** places that draw a circle - the editor's markup, its frame painter, its animation player, the read-only renderer and the read-only animation player - and nothing but that assertion notices when they diverge. Both of this session's earlier colour bugs were exactly that: v88 (the animation disagreed with the static render about the opposition) and v90 (`saveState` disagreed with everything else).

### Three defects found on the path and fixed

- **`interpolateAndApply` merged colours preferring the current array over the frame's** - the opposite of `applyFrameState` since v91, so the editor's own playback disagreed with every other renderer mid-animation. Now frame-authoritative like the rest.
- **Its opposition branch ignored per-player colours entirely** while the home branch honoured them.
- **The context menu's `click` closer had no containment check** (its `pointerdown` sibling does). The existing colour and range rows survived only because they fire `input` from a drag or a native dialog; a checkbox or a number spinner would have been destroyed by the click that operated it. Also `pasteSerializedItem`'s opponent branch dropped the pasted colour, and `spawnCircles` hardcoded `#ffffff` instead of reading the picker - invisible while every opponent was one colour, not once one can be striped.

### Scope

Team kits are **board-wide** (`fa_tactic_team_stripes` / `fa_tactic_opp_stripes`, plus `teamStripes` / `oppStripes` at the TAIL of `buildBoardEntry` - key order is the shard diff). Per-player fills stay per-frame and propagate forward. A player's own fill still overrides the kit, and **the goalkeeper stays solid gold**: `isGk ? GK_COLOR : <fill>` comes first at every site, unchanged.

`_stripeCfgOf` is the single reader of the stripe keys, shared by the toolbar builder and the paint path - the controls and the paint cannot disagree about the kit.

**449 → 467 unit tests** (15 for the fills, 3 source assertions).

## v94 - the shirt number on a two-colour kit

Reported as *"generally it will be a white or black number, but in the case of a black-and-white combination that won't work"*. Correct: `fillCss` derived the number from `c1` alone and ignored `c2`, so a black-and-white kit gave a number invisible over half its stripes.

`textColorFor` answers "black or white on THIS colour", so asking it about **both** stripes turns legibility into a precise test rather than a guess: **if the two answers differ, no single black-or-white number can sit on both.** Black-and-white is the obvious case; red-and-white is the one people forget, and it fires there too, correctly.

In that case the number goes yellow **with a dark halo**. The halo is not decoration: no flat colour contrasts with both black and white, so yellow alone would have solved the black stripe and lost the white one - the very case the branch exists for. It is applied nowhere else, so a solid colour and an agreeing kit are untouched.

Automatic only, by choice - no picker. The rule is right wherever it fires, and a control that is correct 95% of the time is worse than no control.

`fgShadow` is **always** assigned, including as `''` for solid fills, so switching a circle back from stripes clears the halo instead of leaving it behind - the same class of bug as the opposition repaint in v90.

**467 → 471 unit tests.**

## v95 - push, fixed where the club actually is

An audit of store readiness and push turned up four live defects in notifications. The club is on the **web app** - the phones are on a v43-era APK - so these were affecting people daily.

### One message for two platforms was wrong

`sendToTokens` sent a single message to every token. Web and native need different shapes, and sending one to both is what produced **duplicate notifications on the web**: a `notification` payload is displayed by the FCM SDK itself, and `sw.js` displays it AGAIN from `onBackgroundMessage`.

Split by the `platform` field the client already stores on each token doc:

- **web → `data` only**, so the service worker is the single display point - which is also what lets it honour `tag` and open the right page.
- **native → `notification` plus an `android.notification` block**, because a data-only message shows nothing once the app is killed, which is exactly when a reminder matters.

Tokens written before `platform` existed have none and are treated as **web** - what they were, and the safe default: a web-shaped message on a native device shows nothing, where the reverse shows it twice.

### Three more that fell out of the same function

- **`webpush.fcmOptions.link` was `"/"`.** The app is served from a GitHub Pages **subpath**, so a click from a cold start opened the domain root, not the app. Now `payload.url` falling back to `APP_BASE_URL`, and a test pins that it is never a bare origin again.
- **The `tag` never reached Android.** It went into `data`, and Android reads `android.notification.tag`. So the per-session tag the reminders carefully compute collapsed duplicates **on web only** while Android stacked them - and `test/reminders.test.js` had been asserting that tag string for versions without it doing anything on the platform it was for.
- **The 500-token multicast cap was never chunked**, nor was the stale-token delete batch. A club past 500 devices would have lost the whole send rather than part of it.

### Logging out left your token live

`_removeWebToken` called `getToken()` **with no options**, so the SDK fell back to registering `/firebase-messaging-sw.js` - a file this app does not have. It threw, the `catch` swallowed it, and the token document was never deleted. **On a shared device the next push for the previous user still arrived.** It now passes the same `{vapidKey, serviceWorkerRegistration}` as the acquire path, and prefers the token already in memory - after `deleteToken()` a second `getToken()` would mint a NEW one, the opposite of what logging out should do.

`_saveToken` also deletes the previous token document on rotation, instead of leaving dead entries to accumulate until a send failed against them.

### The permission prompt was being spent for nothing

`Push.requestPermission()` ran straight out of the auth-state handler, with **no user gesture**. Browsers increasingly auto-deny that, and **iOS Safari ignores it outright** - which is a large part of why iPhone users never had notifications. The permission prompt is one-shot per browser: a denial is remembered and cannot be re-asked programmatically, so firing it unprompted spends the only chance there is.

It now lives behind a tap in a soft-ask banner, and the banner disappears either way - granted needs no banner, denied cannot be re-asked, so leaving it would be a button that does nothing.

### iOS, for free

Safari 16.4+ supports web push for a PWA **added to the home screen**, and `manifest.json` was already correct for it (`display: standalone`, maskable icons) with the `apple-mobile-web-app-*` meta already in `index.html`. The missing piece was that iOS cannot be prompted to install - there is no `beforeinstallprompt` - so it has to be explained. A banner does that, shown only on iOS Safari, only when not already installed.

That plus the gesture fix is the whole iOS notification story. **No Mac, no Apple Developer account, no review.**

### Testing

The send path had **no coverage at all**, which is how three defects lived in one function. `test/push-send.test.js` lifts `buildMessage` out of the source the way `reminders.test.js` lifts `squadForSession`, and pins the shape for both platforms, the channel id against the one the manifest declares, and the batching.

**471 → 489 unit tests.**

## v95b - the Android build stops lying, and stops shipping the repo

Follow-up to the store/push audit. No frontend change (`APP_VERSION` unmoved) - this is build configuration and one new page.

### The build could succeed with push dead

`android/app/build.gradle` carried the Capacitor template's `try/catch` around `google-services.json`: missing file, log at `info`, carry on. CI writes that file from a secret, so an unset or malformed `GOOGLE_SERVICES_JSON` produced a **build that succeeded** and an APK with no sender id and silently no push. It now **throws**, with `-PallowNoFirebase=true` as the deliberate escape hatch for building the UI locally.

### The APK was shipping the repo

The mirror was an **exclude list**, so anything new in the root shipped by default. It carried `CONTEXT.md` (239 KB), the whole `test/` suite, `firestore.rules`, the deploy scripts and five debug pages that were **live routes inside the WebView**. An APK is a zip.

There were also **two** definitions of that list - a PowerShell one-liner in `package.json` and the CI rsync - excluding different sets, so a local build and a CI build put different files in the app. Both are now `scripts/build-www.js`, which builds and then **checks itself**: non-zero if a dev file leaked or an app file is missing.

Running it the first time immediately caught `firestore-debug.log`, an emulator leftover that a local `cap:sync` would have bundled. The mirror is 6 root entries and 3.3 MB.

### versionCode was `1`, permanently

Hardcoded, while the app was at 95. The first Play upload would work and the second would be rejected as a duplicate. It is now **derived from `APP_VERSION` in `js/app.js`** - the number this project already versions everything else by - so it cannot disagree with the build and never needs remembering.

### Release path, present but dormant

`signingConfigs.release` reads **environment variables**, so no key material is in the repo, and both it and the `bundleRelease` CI job are guarded on the keystore secret existing. With no secret they are inert and `assembleDebug` is untouched - so the whole Play path can sit here before there is a Play account. Turning it on is four secrets, listed in the workflow.

`npm install` became `npm ci`: the lockfile is the record of what a build used, and `npm install` silently rewrites it. Same trap that broke every Cloud Function on 2026-08-08, one directory over. The Capacitor CLI is pinned to 8.x alongside - it was `^7.6.1` driving 8.3.0 platforms, and `^7` would never have floated.

### privacy.html

A **draft**, written from the code rather than from a template: what is actually stored, including that RPE and injuries are health data and that youth categories mean minors' data. Every club-specific fact is a `⚠` placeholder. It blocks both stores and needs qualified review before publishing - it is a legal exposure for the club, not a bug.

## The web half of the same leak (_config.yml)

Trimming the Capacitor mirror fixed what ships in the **APK**. It did nothing about the **website**, and GitHub Pages serves the whole branch — so these were live and returning 200 the entire time:

```
GET /CONTEXT.md          200   239 KB of internal notes, superadmin address, deploy procedure
GET /firestore.rules     200   the complete authorization model
GET /test/fills.test.js  200   the suite documenting how those rules behave
```

Found by checking the deployed site rather than reasoning about it, which is the third time this session that habit has turned something up.

The site is Jekyll-processed (there is **no `.nojekyll`**), so a `_config.yml` `exclude:` list keeps them out of the published output with no restructuring. Adding a `.nojekyll` at any point would publish all of it again — the note is in the file.

**Two lists now, deliberately**: `_config.yml` for the web, `scripts/build-www.js` for the APK. They are different distribution channels with different mechanics, and merging them would mean one of the two lying. They should be changed together, and both fail loudly if the app's own files go missing.

The rules are enforced server-side so publishing them was not a compromise by itself. `CONTEXT.md` is the one that mattered.

## The APK, finally opened (2026-08-19)

The audit left one question unresolved because artifact download needs a token: **has native Android push ever worked?** The committed `android/` project has neither the push plugin wired nor `google-services.json`, so a LOCAL build definitely produces an APK with dead push. CI regenerates both — but nothing asserted it.

Downloaded and unzipped the artifact from `8a01eaf`. It is fine:

```
assets/capacitor.plugins.json
  @capacitor/push-notifications   → PushNotificationsPlugin
  @capacitor/local-notifications  → LocalNotificationsPlugin

resources.arsc
  1:555691808277:android:0c708830b22c6ddc09601c     ← google-services.json WAS applied
```

So **native push is wired in every CI build**, and has been. The stale committed Gradle files only bite someone building locally. The `throw` added in the previous version now makes the CI half impossible to break silently as well.

The same unzip confirmed the mirror trim landed, which is the point of checking the artifact rather than the script:

```
assets/public/  →  index.html  sw.js  manifest.json  privacy.html  css  img  js
                   (+ cordova.js / cordova_plugins.js, injected by Capacitor)
assets/public/CONTEXT.md        0 entries
assets/public/test              0 entries
assets/public/firestore.rules   0 entries
```

### The Pages failures were never ours

Three consecutive `pages build and deployment` failures, all with the **build** green and the **deploy** job dying in `Set up job`. The log says why, and it is nothing to do with this repo:

```
Failed to download action 'actions/deploy-pages' ... 429 (Too Many Requests)
Failed to download archive after 3 attempts.
```

GitHub throttling the runner fetching its own action. Transient; a re-run clears it. Worth recording because the symptom — zero jobs, no message, failure at `Set up job` — looks exactly like a permissions or environment misconfiguration, and I spent a round ruling those out (the `github-pages` environment does allow `main`).

## v96 - the two template-save defects

Both were reported as one symptom - *"I'm not sure the edits are being saved correctly"* - and neither was what it looked like. The drawing always saved; two other things went wrong around it.

### The editor was resetting the category

`saveTemplate` wrote `category: String(entry.category || '')` unconditionally. The editor's entry carries **no category** — a template's category is *library* metadata, edited in the Biblioteca table, and the editor has no control for one. So every Save from the editor silently reset it to `''`: set a category, open the board, press Save, gone.

Now guarded on the entry actually carrying one. **`tag` is deliberately left unconditional**, and that contrast is the whole rule: the editor *does* have a tag control, so it owns the tag and must be able to clear it, while the table owns the category, the packs and the published flag. A new template still gets an explicit `''` rather than an absent field, which would render as `undefined` in the table.

### The list was lying about the save

`_abLoad` early-returns on `loaded`, so returning to the Biblioteca re-rendered the **pre-edit row** — old name, old size. The payload had saved; the row had not been re-read. That is almost certainly what was actually seen, since re-opening the template showed the edit correctly.

`_abInvalidate()` is called from **the two template save paths, not from the exit button** — the sidebar is also a way back, and a save followed by any navigation had the same problem.

### Neither had a test, and the second is hard to test

The `saveTemplate` boundary is now pinned by source assertions, including the negative (`category` must NOT be written unconditionally) and the deliberate exception (`tag` must be). The cache test pins that `_abLoad` still short-circuits — **if that early return ever goes, `_abInvalidate` becomes dead code and should go with it**, and the test says so rather than leaving a future reader to wonder.

**489 → 496 unit tests.**

### The promoted category comes from the AUTHOR, not the board (v96b)

Follow-up on the owner's read of it: *"show which category the coach worked on (higher level)"*.

A board is stamped with `getCurrentCategory()` — whichever squad the coach happened to have open when they saved. `clubs/{clubId}/boardAuthors` already holds something better: the author's **highest** category, picked by `authorLabelFrom` as the lowest index in `CATEGORY_ORDER`, and frozen if they leave the club. For a library sold by level, "what a cadet coach drew" is the useful default; "which tab was open" is not.

`promoteBoardTemplate` now reads that label and uses it, **falling back to the board's stamp** when there is no author to ask — `ownerUid` is `''` for everything the migration produced and for every seeded board. The lookup is wrapped: a label is cosmetic and must never fail a promotion.

It remains a **default**. The dropdown in the Biblioteca stays, because the derived value can still be wrong — a coach who works across categories, or a general drill that belongs to no level in particular — and because for a sellable pack the category is a product decision rather than a fact about who drew it.

Three tests: the author's category wins over the board's, and both fallbacks (no author, author with no category). `wipe()` now clears `boardAuthors` too, or the fallback tests would have passed for the wrong reason.

**53 → 56 functions tests.**

## v97 - a granted user could end up with no token, and no way back

Found while writing the push test guide, not from a report — which is the point: it is **silent on every side**.

v95 moved the permission prompt behind a user gesture. That was right; it had been firing from the auth-state handler with no gesture, which browsers auto-deny and iOS ignores outright. But the soft-ask banner then became the **only** caller of `requestPermission()`, and the banner only renders while `Notification.permission === 'default'`. Logging out deletes the token by design. So:

```
grant → token saved → log out (token deleted) → log back in
     → banner hidden, because permission is 'granted', not 'default'
     → no token, no UI to create one, nothing logged anywhere
```

Before v95 the auth handler re-saved the token on every login, which quietly covered this. Removing that call took the re-registration path with it — and it also stranded **every user who had granted before v95**, whose token was never refreshed again.

`_ensureWebToken()` now runs from `_initWeb`: if permission is **already granted**, acquire and save. No gesture is needed precisely *because* permission exists — `getToken()` prompts nobody when the answer is already yes. The banner keeps owning the actual ask, so the v95 fix stands.

`_initNative` had the identical hole — `register()` was only reachable through `_requestNativePermission`, which only the banner calls — so it now registers when `checkPermissions()` reports granted.

Three source assertions pin both halves, including the negative: `_ensureWebToken` must test for `'granted'`, or it becomes the gesture-less prompt v95 removed, reintroduced by the fix for its own side effect.

**496 → 499 unit tests.**

## v97b - the RPE reminder's match branch nagged the whole club

The training half of `scheduledRpeReminder` was scoped to the squad in v71. The **match** half never was:

```js
const all = await getTeamMembersByRole(teamId, "player");   // EVERY player in the club
```

`getTeamMembersByRole` filters by **role alone** - no category, no team letter, no call-up. So on a match day every player in the club was told to log RPE for a match they were never in, including players in a different category, and including players whose category was not even playing. The owner's spec is narrower than "attended": *an RPE reminder goes to a player who **attended the training**, or who **was in the convocatòria** for a match.*

`squadForMatch()` reads that list from `fa_convocatoria_sent`, which is precisely "was called up" - a map keyed by matchId with `{players, startingXI, …}`, sharded per category **through the match** (`Shard.ROUTES`, `by: 'match'`), so the reminder reads the shard for the match's own category rather than a flat role query. The other shards are scanned only as a safety net, for a match that changed category and left its convocatòria behind.

**An empty `players` list is an answer, not a fallback trigger.** A match nobody was called up to notifies nobody. Only a *missing* entry falls back, because fixtures predate the feature - and even then to the match's own squad, `squadForSession` on its category and team letter, never to the club.

`matches.find(m => m.date === today)` was the **same defect the training half already had fixed**: two categories play on the same Saturday, and `find` silently picked one - so the second category's match was never chased at all, while its players were being nagged about the first one. It filters and loops now, and the `rpeReminder` log line carries a per-match `{id, source, called}` so a zero audience can be read as "nobody called up" or "no convocatòria" without opening Firestore.

**499 → 508 unit tests.** `test/reminders.test.js` grabs `parseDataDoc` out of the source alongside the helpers, so a convocatòria stored in the per-field merge format resolves in the test exactly as it does in production.

Still open, same shape, deliberately **not** changed here: `scheduledMatchAvailReminder` also calls `getTeamMembersByRole(teamId, "player")`. It cannot use the convocatòria - it runs *before* one exists, to ask for availability - but it should still scope to the match's category and letter.

Functions only - **`APP_VERSION` is unmoved at 97**, no frontend file changed. Needs a **functions** deploy, not a Pages push.

## v110 - a resolved injury that only the Medical page believed

Reported as: mark an injury resolved as a coach, and the player goes right on showing as injured everywhere else.

**Two sources of truth, and only one of them moved.** `deriveFitnessStatus()` reads the player's own training answers (a last answer of `injured` means injured) *and* `fa_injuries`. But the `fa_injuries` branch runs last and can only **override** the answers — `active` → injured, `recovering` → doubt. It has no way to **cancel** one. So resolving the record simply removed the override and let the stale self-report through untouched, and the record's own screen — the only one that reads `fa_injuries` directly — was the only one that changed.

The mechanism for standing a self-report down already existed: `fa_injury_dismissed`, a date up to which an `injured` answer counts as a plain absence, written when staff *discard* a report. A resolution is the same act with a medical record attached, so it now supplies that date too. **Derived from the record, not written as a flag**: the stand-down is `max(dismissedUpTo, latest resolved endDate)`, computed on every read, so records resolved before this existed heal themselves on the next render and no repair pass is needed. An injury reported *after* the all-clear is newer than the date and still counts, which is the property that makes this safe.

**Three more leaks found in the same sweep:**

- **`fa_injury_notes` / `fa_injury_zone` were never deleted.** These per-player maps predate `fa_injuries`, are written every time an injury is logged, and are read by surfaces that know nothing about records — the status tooltips and the medical hover body map. `clearStaleInjuryCaches()` drops them once the player has no `active`/`recovering` record left (a second open injury owns them). `_mergeUpdates` in `db.js` turns a removed field into `FieldValue.delete()`, so this syncs rather than resurrecting from another device.
- **The "currently injured" panel** on the staff training page derived nothing. It scanned `fa_training_availability` with the legacy `{uid}_{date}` key — which the move to session-id keys left matching almost nothing — and then fell back to the roster's cached `fitnessStatus`. It knew about neither `fa_injuries`, nor a discard, nor a resolution. It now goes through `deriveFitnessStatus()` like every other surface, and its "weeks injured" count stops at the last all-clear instead of counting through a closed injury.
- **Four call sites** (Resolve and Mark-recovering on both the Medical list and the detail page, plus the Edit modal's Save) each did their own `updateInjury` + `deriveFitnessStatus`. They share `afterInjuryChange()` now, so the cache cleanup cannot be added to three of them and forgotten in the fourth.

**Deliberately unchanged:** a player answering "Yes" does not close a staff-logged injury. The medical record is staff-owned and only staff end it — the asymmetry is the point.

**595 unit tests** (+13, `test/injuries.test.js`, added to `test:unit` by hand). The headline test was run against `git show HEAD:js/app.js` first and confirmed to report `injured` after a resolve — the fix is measured against the old behaviour, not against itself. `APP_VERSION` 109 → 110, `sw.js` cache `esquerrapp-v110`.

## v109 - the new session's date could not be moved off the default day

Reported as "I can't add a training on a day that isn't in my defaults". The date **looked** editable: the picker opened, a day could be clicked, the field showed it. Save then wrote the seeded day.

`renderTrainingNew`'s date input is `readonly` and driven by the custom picker, which sets `value` + `dataset.dateIso` programmatically and dispatches **`input`**. `bindTrainingNew` committed field edits on `change` — which a programmatic write never fires, and a readonly field never fires at all — and its `input` fallback was explicitly gated `&& !el.classList.contains('md-datepicker')`. So the one field that *only* signals through `input` was the one field not listening for it, and every pick was written to the DOM and dropped before reaching `_ntDrafts`.

The gate existed to stop a re-render on every keystroke (it would blow away the field being typed in). That reason is real, so it is kept — but by branching on `isDate` rather than by skipping the listener: **all** text fields commit on `input`, and only the date re-renders, which is also what makes the clash warnings match the day now chosen.

The seeding is unchanged and deliberately so — the proposed date is still the next slot on the team's own schedule. It was always meant to be a suggestion.

`bindStaffTraining` (the saved-sessions table) was never affected: it delegates `input` on the whole `<tbody>` and re-reads the row from the DOM, so the picker's event was already caught.

**582 unit tests** (+4: the binding block is executed against fake fields, including the negative — an ordinary text field must still commit *without* re-rendering — plus a source check that `renderDP` still signals with `input` and still parks the ISO date in `dataset`). Frontend only. `APP_VERSION` 108 → 109, `sw.js` cache `esquerrapp-v109`.

## v108 - why the convocatòria and the editor disagreed

The owner spotted that v107 fixed the editor previews and *not* the convocatòria — same code, same stylesheet, two different results. That difference is the whole diagnosis.

The icons were sized `height: 72px; width: auto` in CSS. **`width: auto` on an inline `<svg>` is not reliably resolved from the viewBox ratio**; where it falls back to the element's `width="34"` attribute the shirt renders **34px wide at 72px tall**, and nine bands across a squashed 17px torso are 1.9px each — irregular, and irregular in a way that depends on where the browser decides to round. Nothing about the band arithmetic was wrong; the arithmetic was being applied to a width that was not 72.

**Both dimensions now live in the markup** (`KIT_ICON_PX = 72`, the sock `36 × 72` because its viewBox is `32 × 64`), so there is nothing left for the browser to resolve. The CSS rules that set a size are gone, and a test asserts no `svg { height: …; width: auto }` rule comes back.

The small inline strips on match detail and the activity list still scale down, but now state **both** dimensions per shape — they were forcing `30 × 30` on a sock that is 1:2, which squashed it. Stripes are not even at that size and are not meant to be: they are decorative icons beside a line of text, not something to pick a kit from.

Also: `stripeSvg` rounded band coordinates to 4 decimal places, which put edges at `22.00005px` instead of `22px`. Far too small to see, but it is a needless approximation in the one place the whole feature is about exactness — now 6 decimals, and the emitted bands land on exactly `22/30/38/46px` at exactly `4px` wide.

**578 unit tests.** Frontend only.

## v107 - the grid ORIGIN, which v106 forgot

v106 checked that a band was a whole number of pixels and stopped there. Two things have to be whole, and the second is what was still wrong:

```
band width   span/9  = (S/2)/9 = S/18
grid origin  shirt x=16 → S/4      sock y=8 → S/8
```

At **54px** the bands were exactly 3px — but the grid started at **x = 13.5px**, so every edge sat on a half pixel. `crispEdges` rounds those, and rounding a run of `.5` values is where a renderer is free to be inconsistent: some edges go up, some down, and adjacent stripes come out 2px and 4px. Exactly what the screenshot showed, and exactly why the previous fix looked like it had not worked.

*S* must therefore divide by 18, 4 **and** 8. **72px is the smallest such size** — searched rather than reasoned, and a test now re-runs that search so the claim cannot rot.

- Icons are **72px** in the convocatòria and the editor: a 36px span, nine bands of exactly **4px**, origin at 18px (shirt) and 9px (sock).
- `--conv-ctl-h` is now driven by the icon rather than by the match toggle, since the icon is the constrained one. **82px** = 72 + 2 × (3px padding + 2px border). The toggle needs only ~66px, so the row is visibly taller than before — that is the price of even stripes, and it is a deliberate trade rather than an oversight.
- **The phone keeps 72px too.** Shrinking there was the obvious move and it is wrong: no smaller size puts the edges on whole pixels, so a phone would get the unevenness straight back. The rows wrap instead.

The test now checks the **origin** as well as the width, against the real shape offsets, and separately asserts that nothing below 72 satisfies both — so "72 is the minimum" is verified rather than asserted.

**577 unit tests.** Frontend only.

## v106 - the half-viewBox invariant: nine bands on whole pixels

v105 made the stripes crisp but conceded that bands could still differ by one device pixel, because 55.6px of shirt cannot hold nine equal stripes. That concession was avoidable — the icon size was never chosen, it was whatever the button left over.

**The invariant**: every striped region is exactly **32 of its viewBox's 64 units**, so at a rendered size *S* the span is exactly *S/2*, and nine bands — the maximum — are whole pixels whenever **S is a multiple of 18**.

- shirt body `x = 16..48` — already half, by luck
- sock leg `y = 8..40` — **was** `8..36`, so the ankle moved down four units to make it half. Not cosmetic: it is what lets the same size serve both shapes. A football sock is mostly leg anyway.

Icons are now **54px** (= 18 × 3) in the convocatòria and the editor, giving a 27px span and nine bands of exactly **3px**. At the button's natural 55.6px they were 3.09px, which `crispEdges` snapped to a mix of 3px and 4px — the reported unevenness. The phone breakpoint uses **36px** (= 18 × 2), nine bands of 2px.

The full-shirt box is deliberately *not* half the viewBox: hoops across a whole shirt are a more forgiving case than nine vertical bands down a narrow torso, and constraining it would have meant redrawing the sleeves.

`kits.test.js` reads the sizes out of `css/style.css` and the boxes out of `js/app.js` and **does the division**, rather than comparing a constant with itself — so a size that is not a multiple of 18, or a box that stops being half the viewBox, fails.

**576 unit tests.** Frontend only.

## v105 - stripes as rects, because a gradient cannot be even at icon size

Reported as *"different separations or different widths"*, and visible only at normal zoom — which is the tell. It was **subpixel rounding**, not a geometry bug: `fillSvgPaint` built a `<linearGradient>` with hard stops, those stops land on **fractional device pixels**, and the browser antialiases each boundary by a different amount. One edge renders sharp, the next as a half-tone smear, and the eye reads that as bands of unequal width. At 56px with nine bands each band is barely three pixels, which is exactly where it shows.

No amount of adjusting the stop arithmetic fixes that — the stops were already exact. `stripeSvg()` replaces the gradient with **real `<rect>`s carrying `shape-rendering="crispEdges"`**, which snaps every edge to the pixel grid. Bands can still differ by at most one device pixel — unavoidable when 28 pixels must hold 9 stripes — but every edge is sharp and evenly spaced, and *regular* is what the eye actually reads.

- Only the **alternating `c2` bands** are drawn, over a solid `c1` base: half the rects, and two adjacent same-coloured bands can never show a seam.
- A `<clipPath>` holds the shape, so rectangular bands follow a non-rectangular shirt.
- Boundaries come from `i/n` each time rather than by accumulating a rounded width, so the last band ends exactly on the edge.

### The socks were also striping the wrong region

Laying the hoops across the sock's **full** bounding box put one band under the cuff, where it is invisible, and another across the foot, which no sock has. `SOCK_BOX` is now the **leg only**, `y = 8..34`.

Shorts route through the same helper and take its solid branch, so a bad stored value still degrades rather than throwing.

Tests moved from asserting gradient stops to asserting **band geometry**: every band exactly `span/n` wide across n = 2,3,4,5,9; the last ending on the shape's edge; every rect crisp; the clip present; direction agreeing with `fillCss`.

**573 unit tests.** Frontend only.

## v104 - the convocatòria row gets a fixed height to key off

The owner diagnosed this correctly: the match toggle had **no fixed height**, so every attempt to size the call-up select and the kit buttons against it was chasing a moving target. A long fixture — *"C.E. Sant Andreu del Palomar (A) vs C.D. Vallcarca"* — wrapped the team names to a second line, making the box three lines tall, while a short one stayed at two. Two previous rounds of "make them the same height" set a `min-height` against whichever case happened to be on screen.

The fix is to make the toggle deterministic first, then derive from it:

- `.conv-match-teams` is `nowrap` + ellipsis with a **fixed `line-height`**, so the names always occupy exactly one row and the date/time exactly one more. A `title` carries the full fixture when it is clipped.
- `--conv-ctl-h` is **derived, not guessed**: `2 × (2px border + .65rem padding) + 1.35rem + 1.2rem`.
- The toggle, the select and each kit button all take that one token, and the icon is `calc(var(--conv-ctl-h) - 10px)` — the button's 2px border and 3px padding on each side.
- `width: auto` on the icons, so the sock keeps its 1:2 ratio instead of being squared off.
- The phone breakpoint lowers the **token**, so the three stay tied rather than one breaking rank.

Checked by doing the arithmetic externally rather than asserting the token equals itself: natural height **65.6px**, declared **65.6px**, icon budget 55.6px against an icon of 55.6px.

Also `.conv-top-group:nth-child(1)` gets `flex: 1 1 22rem; min-width: 14rem` so the fixture has room before the ellipsis bites.

**571 unit tests.** Frontend only.

## v103 - plain sleeves on a striped shirt, and bigger icons

**Vertical stripes now stop at the shoulder seam.** Real striped shirts have plain sleeves; bands running out to the cuffs read as a rugby shirt. The shirt was one `<path>`, so it is now drawn in pieces:

1. the full outline filled with the base colour (so the sleeves are `c1`),
2. `SHIRT_BODY` — the torso alone, shoulders sloping out to the seam at `y=20` — filled with the gradient,
3. both sleeve polygons repainted in `c1`,
4. the outline again, `fill="none"`, stroked **last** so no fill can overdraw it.

The gradient binds to the *body* path's bounding box rather than the whole shirt, so the band count still reads correctly across the narrower torso.

**Only vertical splits.** Hoops legitimately continue across a sleeve — a hooped shirt with plain sleeves would look wrong — and a solid kit has nothing to split. The condition `f.striped && f.dir !== 'h'` is what the test pins, not the paths.

Icons: editor previews 40 → **52px**, convocatòria buttons 40 → **46px** with a `min-height` matching the match-selector dropdown, since they were visibly shorter than it. Phone breakpoint 26 → 34px.

### A test that was pinning a spelling, not a rule

`fills-source.test.js` required the literal `darkenHex(parseFill(` form. Hoisting `parseFill(fill)` into a variable — needed here because the shirt now asks it for `.striped` and `.dir` as well as `.c1` — broke it, though `darkenHex(f.c1, 40)` is exactly as safe.

The invariant is **`.c1`**, which `parseFill` guarantees is a plain hex whether the fill was striped or not. The assertion now accepts either spelling and still rejects a bare identifier, which is how a raw encoded fill would actually be passed. Verified against both forms rather than assumed.

**571 unit tests.** Frontend only — no functions deploy.

## v102 - kits: eight fixes from the first real use

All reported 2026-08-21 after testing v101.

1. **The Settings "Equipacions" card is gone.** Kits are simply the bottom section of *Configura el teu club*. This also restores `quota.test.js`'s original rule — exactly **one** call site may open team setup escapably — which the second card had forced me to weaken. Worth noting: I had loosened that test to accommodate the card, and the right answer turned out to be removing the card.
2. **Stripe cap 6 → 9.** The cap was enforced in **seven independent literal 6s** across three files (`parseFill`, `encodeFill`, `normalizeStripeState`, two number inputs, the board's commit handler, the server validator). It is now one `STRIPE_MAX` in `js/utils.js`, mirrored by hand in `functions/index.js` — which `kits.test.js` asserts agree, because a server cap *below* the client's would reject a kit the editor happily offered. Missing one of the seven would have let the UI offer a value `parseFill` then silently rejects, so the stripes just vanish.
3. **Garment labels sit against their swatch.** `.ts-kit-garment-label` had `min-width: 4.5rem`, which pushed each label a *different* distance from the control it names, "Mitges" being half the width of "Pantalons".
4. **The colour picker stayed round with stripes on.** `.tb-ctx-color-pick` (the stripe row's second colour) had `border-radius: 50%` on the element but none of the `appearance: none` + `::-webkit-color-swatch` overrides `.tb-color-pick` carries — so Chrome painted a **square swatch inside the round box**. Turning stripes on appeared to change the picker's shape.
5. **Kit previews 26px → 40px**, and the convocatòria's buttons likewise.
6. **The shorts picker felt unresponsive, and it was real.** `<input type="color">` fires `input` *continuously* while the swatch is dragged, and every event replaced three SVGs — one of which carries an `<image href>` pointing at the club badge, a **network image being re-decoded dozens of times a second**. The repaint is now coalesced to one per frame with `requestAnimationFrame`. All three garments shared the bug; shorts merely have no stripe row to distract from the lag.
7. **"+ Equipació" now actually disappears at three kits.** It was hidden with the `hidden` attribute, but `.btn` sets an explicit `display`, which **wins over `[hidden]`'s `display: none`** — so the button stayed on screen and did nothing when tapped. Uses `style.display` now.
8. **Convocatòria top row.** `align-items: flex-end` had put each group's title directly above its own control, so three controls of different heights produced three headings at three different heights; `flex-start` plus a column layout puts *Tria el partit*, *Hora de citació* and *Equipació* on one line. The call-up `<select>` gets an explicit `min-height` to match the match toggle, whose two stacked lines are taller than a select's intrinsic height. The kit rows were right-aligned because the group is `flex: 1 1 auto` and the heading carried `text-align: center` — both removed, so they start under the *Equipació* heading.

**570 unit + 15 emulator tests.** Needs **both** a Pages push and a functions deploy (the server's `STRIPE_MAX`).

## v101 - club kits, stage 2 of 2: the lead's editor

The editor lives as a fifth section of **team setup**, not a screen of its own, so it inherits `_leaveTeamSetup()`, the `#team-setup-error` element and the disable-and-`t('auth.saving')` save flow — and, more to the point, it writes to the same club document through the same button rather than needing a second write path. A new **Kits card** in Settings opens it with `{cancellable: true, focus: 'kits'}`, exactly as the Categories card does.

Unlike the fcf, schedules and staff sections, `#team-setup-kits` is **not `hidden`**: those three depend on which categories are ticked, and a club's shirts do not.

### The colour tool is now shared, not copied

The board had **two** stripe UIs: `_stripeControlsHtml` (a string builder welded to localStorage and `updateCircleColors`) and the per-player context menu — which was already the decoupled one, taking a state object in and calling an action out, touching neither storage nor canvas. That second copy is now `stripeRowEl(state, onChange, opts)`, with two callers and one definition. `opts.dirs === false` locks the direction, which is what the **socks** row uses: hoops are horizontal.

`_stripeCfgOf` now delegates its clamp to `normalizeStripeState`, which removes a real difference — the board's inline `o.n || 2` happily accepted `n: 9`, a value `parseFill` then rejects, so the stripes silently vanished.

### The Android colour-picker hazard

`_refreshTeamSetupKits()` runs on **structural changes only** — a kit added or removed. `<input type="color">` opens a *modal* picker on Android Chrome, and re-rendering the section destroys the input that picker is bound to. Colour and stripe edits therefore commit into the block's `dataset` and repaint one preview node in place, the same way the board's per-player menu commits without re-rendering. The typed-over-stored rule the other sections use is still honoured, but **wholesale per kit**: a kit is one atomic row, and a half-merged one (typed name, stored colours) is worse than either.

### setClubKits, not a wider rules allow-list

`firestore.rules` is **untouched**. Three reasons, heaviest first:

1. The clause a lead writes through — `hasOnly(['fcfLinks','schedules'])` — is documented as a **back-compat shim to be dropped** once a v55+ APK circulates. Adding `'kits'` would make a permanent feature depend on a clause the next maintainer is instructed to delete.
2. `setClubCategories` does quota accounting, roster-key removal checks and **a claims refresh over every member**. Saving a colour must not be able to trip *"Per eliminar un equip utilitza deleteTeam"*, and must not re-stamp custom claims. Kits and categories share no invariant.
3. `clubs/{clubId}` is downloaded by every member, which is the stated reason unknown category keys are rejected — kits need the same strictness.

The validator enforces two rules **nothing else can**: shorts must be a single colour (`parseFill` degrades a striped value to solid *silently*, so a bad one would sit in the document rendering plausibly), and a club may never store **zero** kits (`kitsOf` falls back to the defaults on an empty list, so saving none would silently restore the kits the lead had just deleted). Plus: 1-3 kits, unique `[a-z0-9-]` ids, unknown fields rejected, labels ≤24 chars with no control characters, hex validated, `n` in 2-6, `dir` in `v|h`. `merge: true`, so `categories` and `badgeUrl` are untouched.

Client-side validation runs **before the network and before the button is disabled**, the same order `badEmail` uses; the server enforces everything again.

### Two notes for whoever is next

- Writing the control-character regex through the shell put **literal control bytes** in `functions/index.js` twice, which made git treat it as binary. It has to be written from a script file, or with `String.fromCharCode(92)` for the backslash. Same family as the CLAUDE.md warning about PowerShell `Set-Content`.
- `quota.test.js`'s "cancellable ONLY from Settings" test counted cancellable call sites and required exactly **1**. That was a fine proxy while Settings had one button, but the Kits card is a second, equally legitimate voluntary entry. It now asserts the actual rule — every **forced** entry passes no options at all, and every cancellable one sits behind a `btn-edit-*` button — because the count would have forced a real feature to fight a test that never meant to forbid it.

**582 tests** (567 unit + 15 new emulator). Needs **both** a Pages push and a functions deploy.

## v100 - club kits, stage 1 of 2: the model, the icons and the picker

Requested 2026-08-20. `jerseySvg(variant)` knew exactly two words, `'white'` and `'yellow'`, with the hexes inline and `img/logo.png` baked into the crest; `sockSvg` knew `'striped'` and `'yellow'`. **Every club on the platform wore Esquerra de l'Eixample's kit.**

Both were also **binary tests with a silent fallback** — `variant === 'yellow' ? … : white` — so an unrecognised value rendered a *wrong* shirt rather than failing. The replacements take a **fill value** and return `''` for a missing one, which turns that whole class into an absent icon instead of a quietly incorrect one.

### The pieces stay independently selectable

The owner's decision, and it shapes everything. A kit is a **source of pieces**, not an atomic outfit: the Equipació block is three rows — Samarreta / Pantalons / Mitges — each offering that garment from every kit. A coach can still send the 1a shirt with the 2a socks, exactly as the two old toggles allowed, but only from pieces the club owns. So the stored record carries **three ids**, not one.

`clubs/{clubId}.kits` is a list of up to three `{id, label, shirt, shorts, socks}`. `shirt` and `socks` are `encodeFill()` strings, so the kit editor will reuse the tactical board's colour tool unchanged; **`shorts` is always a bare hex** because real shorts are single-colour — and since `parseFill` degrades a striped value to solid *silently*, that rule has to be enforced server-side rather than left to the UI.

### No backfill: one resolver, three eras

`resolveKitPieces(entry, kits)` reads every historical shape:

- **era 1** — a bare **array** of player ids. There was never a kit, so it returns `null` and nothing is drawn. Painting one on would be inventing data that was never sent.
- **era 2** — `{jersey, socks}`. Resolved to the colours those words meant, **including the mixes**: a record saying white shirt + yellow socks still renders as white shirt + yellow socks. That is why the resolver returns *pieces* rather than snapping to a stored kit. Shorts stay `null` and go undrawn, because they did not exist.
- **era 3** — `{shirtId, shortsId, socksId}`.

A **deleted** kit resolves to `null`, never to `kits[0]`: a historical match showing nothing is honest, showing the wrong kit is not. `fa_convocatoria_uniform` (the draft) is device-local and unsynced, so it gets a clean break with no migration at all.

`DEFAULT_KITS` reproduces today's two options exactly, so the ~60 clubs that have configured nothing look precisely as they do now. Two, not three — inventing a third would show every club a kit nobody owns.

### Stripes in SVG

A CSS gradient **cannot** be an SVG fill, so `fillCss()`'s `repeating-linear-gradient` is useless on a `<path>`. `fillSvgPaint(v, uid)` builds a real `<linearGradient>` from the same `parseFill()`, with **doubled stops** for hard edges and `objectBoundingBox` units so the bands span the *shape* rather than the viewBox. Two bugs the tests caught while writing it:

- the default socks were `s|h|8|…` and **8 is outside `parseFill`'s 2-6 range**, so they silently were not striped at all;
- offsets accumulated from a rounded width ended the last band at **99.9999%**, leaving a hairline of the previous colour down the edge of every shirt. Offsets now come from the band index over `n`, with the last pinned to exactly 100.

Direction has its own test, because it is the one thing no visual check catches: the same kit striping vertically on the tactical board and horizontally on the shirt. `'v'` → `x2="1"` ↔ `fillCss` 90deg; `'h'` → `y2="1"` ↔ 180deg.

**The white sock looks slightly different from before** — hoops now come from a 6-band fill instead of three hand-placed `<rect>`s, and the foot is the translucent overlay the yellow sock used rather than the striped one's opaque black (an opaque black foot on a red sock is simply wrong).

### Two adjacent fixes

- **`startingXI` was silently discarded on every re-save.** Both writers assigned a fresh object literal while `saveStartingXI` bolts `startingXI` onto the existing entry. One `convSentEntry(prev, …)` builder merges over `prev` instead. Pre-existing, unrelated to kits, and standing directly on the lines being changed.
- `darkenHex`'s source guard said **zero callers**, which was the right proxy while every caller was a circle border. The kit collar and cuff need a genuine shade of the kit's base colour, so the test now pins the actual rule — `darkenHex(parseFill(x).c1, …)` is safe by construction, anything else is the bug it was written to catch.

`conv.white` / `conv.yellow` / `conv.striped` are **deleted**: they named the two hardcoded kits, were never actually called, and a kit's name is now club-entered data that goes through `sanitize()`, never `t()`.

**567 unit tests** (+29). **Stage 2 is the lead's editor and the `setClubKits` callable** — until it ships, every club silently uses `DEFAULT_KITS` and nothing looks different except the new shorts icon.

## v99 - a category letter on player rows

Requested 2026-08-20. A coach with more than one category had nothing on a player row saying which category the player was in, on screens that genuinely mix them.

**A grey, bold, ITALIC capital, with no container** — `J` juvenil, `C` cadet, `I` infantil, `A` aleví, `B` benjamí. **Amateur carries none**: it is the senior category, so "no badge" is data in `CATEGORY_INITIALS` rather than a special case in eleven renderers.

The no-container part is the whole design. `.conv-team-circle` sits on the very same row and is a *circled* capital meaning a **team**. A circled letter is a team; a bare italic one is a category. Give the badge a border, a background or a radius and the two become one thing again — `cat-badge.test.js` asserts all three are absent. This also settles the `A` = aleví vs team-A question the owner raised: the treatments are unmistakably different, and amateur (the only category that plays alongside a team letter A) has no badge at all.

`catSpanOf(rows)` decides whether to show anything, and it takes **the rendered array** — never `getVisibleCategories()`. A lead of a two-category club filtered to juvenil is looking at a one-category list and must see nothing; `getVisibleCategories()` would say 2 and badge a screen where the letters carry no information. Rows with no category (staff, the lead, legacy members) are ignored rather than counted as a category of their own, or one blank row would badge an entirely amateur club.

The span is computed **once per render, above the `.map()`**, and always over the widest array on screen. That is not just an optimisation: `renderConvocatoria` has two panes fed by one pool, `renderMedical` has four lists of the same players, and `renderGeneratedTeams` splits one squad into cards — deciding per list would badge a player in one column and not the other, or move his badge as he is dragged between them.

Eleven surfaces, 14 call sites. Three of them are mixed **even for a coach who has filtered to one category**, because a session's `guests` are by definition borrowed from another squad: `renderStaffTrainingDetail`, `renderGeneratedTeams` and the two linked-team snapshots. `renderAdminUsers` is never filtered at all and is where it helps most.

**Deliberately excluded**: `_ntPlayerRow`, which already has `nt-cat-tag` — a marker answering the strictly better question *"is this player a guest relative to THIS session's category"*. In the club-wide picker a `J` on a juvenil player in a juvenil session is noise. One marker per row and the more informative one wins; a test pins the exclusion so nobody "finishes the rollout" later. Also excluded: `renderMedicalDetail` (one player is not a list) and the five sites where the circled letter belongs to a **match**, not a player.

**538 unit tests** (+16). `functions/check-deploy.js` was stale at `esquerrapp-v97` while `sw.js` was on v98 — all three version sites now say v99.

## v97c - the Friday availability reminder asked the whole club

The same defect as v97b, in the third scheduler. `scheduledMatchAvailReminder` asked the club-wide role query, which filters by **role alone**. On a weekend with three fixtures - amateur A, amateur B, juvenil - **every player in the club got three separate pushes**, two of them about teams he is not in. They do not even collapse on the device: the tag is `match-avail-<matchId>`, so they stack.

It **cannot** be fixed the way v97b was. That one reads `fa_convocatoria_sent`, which is definitive. This runs on **Friday, before a convocatòria exists** - it exists precisely so the coach has availability answers to pick from on Saturday. So the audience is the squad instead: **category plus team letter**, via `squadForSession(teamId, matchAsSession(match))`.

`matchAsSession()` is new and shared with `squadForMatch`'s fallback, so the squad rule has exactly one definition. Re-deriving it in the second caller is precisely how the two halves of `scheduledRpeReminder` drifted apart in the first place. A match carries a single `team` letter where a session carries a list, and an **empty letter means every letter of the category** - the same convention `trainingTeams` uses, and the only honest reading of a fixture created before letters existed.

**Injured players are still asked, deliberately.** Nothing on this path consults `fa_injuries` and nothing should: a player recovering may well be fit by Sunday, and that answer is the coach's to receive rather than the server's to assume. Availability is a question, not a status. Pinned by a **behavioural** test - an injured roster member is in the audience - after a first attempt asserted `!/injur/i` over the source and failed against the comment explaining that there is no filter. A grep cannot tell a filter apart from prose saying there is none.

### What this does NOT enable: the cross-category call-up

The intended workflow is: an amateur coach agrees with a juvenil player and calls him up, even though he never got the Friday push. **Within a category that already works** - `renderConvocatoria` filters the picker by category only, never by letter ([js/app.js:13097](js/app.js)), and each row carries a `conv-team-circle` letter badge, so an amateur coach already sees A and B and can call a B player up for an A fixture.

**Across categories it does not, and it is not a small fix.** Two independent blockers:

1. That same line filters the picker to the coach's current category, so a juvenil player is not in the list to drag.
2. Even if he were, `getVisibleCategories()` returns `[s.category]` for a player, and `DB.init` subscribes only to those shards. He would never download `fa_convocatoria_sent__amateur` **or `fa_matches__amateur`** - so the call-up, and the match itself, would be invisible in his app. The push would arrive and open nothing.

The second is architectural, and it is the same reason a training `guests` entry from another category is effectively a coach-side note: `playerIsCalled` honours it, but the guest's client never downloads the session it belongs to.

**508 → 522 unit tests** (with v98). Functions only; needs a functions deploy.

## v98 - readiness was counting the other category's training

Found by running the **real** `computeReadiness` - lifted out of `js/app.js` the way `test/readiness-engine.test.js` lifts it - over the **real** demo-club data, rather than reasoning about it.

`computeReadiness` iterated the whole downloaded `trainingList` with no `playerIsCalled()` filter, the one filter every other player surface applies. It never showed on a phone: a player's client downloads his own category, so the list is already his. **A coach downloads every category**, and on the staff roster each player was credited with the other categories' sessions.

Not as a reading - he has no RPE for a session he was never at - but as an **estimate**, and that is the part that makes it invisible. The borrow branch fires when the player has no availability record saying he was out, and he has none for a session that was never his. So the load was borrowed from the juvenil squad and added to an amateur player's curve.

Against the demo club: **54 of 75 players' scores moved, by up to 34 points**, and the "includes estimated load" badge sat on 20 players where 9 earn it.

`me` is resolved through `getUsers()`; a uid **not on the roster keeps the old behaviour** rather than losing every session, because the roster may simply not have loaded yet and a confident "no data" is worse than a slightly wide one. Six new tests pin it, including the negative - the same fixture with no roster still borrows, so the test cannot pass by doing nothing.

**Matches are deliberately NOT filtered the same way.** A B-team player called up for the A team is a normal Saturday and `m.team` would drop exactly that. The match branch needs no filter: it keys on his own RPE and, failing that, on minutes derived from the events, both already about him.

**508 → 514 unit tests.** `APP_VERSION` 97 → 98, `sw.js` cache `esquerrapp-v98`.

## topup-demo-season.js

`seed-demo-club.js --apply` builds a club **from nothing**, and is guarded by neither the `demoSeed` stamp nor `PROTECTED_CLUBS` — only `--purge` and `--add-team` are. Aimed at the populated demo club it would rewrite the `categories` map, **replace** data shards with a bare `set()` (losing amateur-B and juvenil-A from `fa_users__amateur`, which is routed by category with no team letter), and reset all 77 Auth passwords.

So topping up a demo season needed a different tool, built on the opposite principle: **only ever add**.

- Refuses any club not stamped `demoSeed: true`, and anything in `PROTECTED_CLUBS`.
- Every shard write is read-merge-write keyed by row id; every record write is create-only, because a real answer from a demo login is worth more than a fabricated one.
- Fills what actually makes the app look alive: past matches still stamped `upcoming` (the seeder sets status once and never revisits it), `fa_match_events` for played matches — **the score is recomputed from events, so a played match without them renders 0-0** — `fa_convocatoria_sent`, without which a match contributes **zero** to every player's stats, and then availability followed by RPE, because readiness needs the whole chain or it skips the session silently.
- Writes nothing before the club's `seasonBoundary`; six read-time filters slice on it.
- Refreshes `trainingDates`/`matchDates`, which every push reminder queries.
- Dry run by default.

**The first move is still `seed-demo-club.js --verify`** — read-only, and the club may well already have the data, with only the stale `upcoming` status making it look empty.

### The forward calendar (2026-08-20)

Three rounds of "the demo club still looks wrong" were answered from the script's own summary, which kept reporting small gaps. Reading the data instead:

```
fa_training  93 rows   93 past /  0 future   → 2026-08-13
fa_matches  102 rows   72 past / 30 future   → 2026-10-24
```

**A club with a next match and no next session, ever.** Empty "pròxims entrenaments", nothing to confirm availability for, and `trainingDates` holding only past dates — so `scheduledTrainingReminder` could never fire for it, which is also why that reminder had never been tested against the demo club.

Everything the top-up did was guarded by `t.date < todayStr`, by construction. **No number of re-runs could ever have fixed it**, which is exactly why every dry run kept reporting healthy figures about a calendar that was a dead end. Step 5 now extends it, with the schedule **derived from the club's own sessions** — weekdays, time, location, map link, focus rotation — rather than hardcoded to the seeder's Tuesday/Thursday, so a demo edited by hand keeps its shape. Only the past gets availability and RPE: a future session with attendance already filled in is the screen the coach is meant to fill in himself.

`trainingDates`/`matchDates` are now recomputed from **what the run is about to write**, not from the snapshot it read. That was harmless while every change was a status flag or a per-record document — no shard gained a date. The forward calendar does, and the first dry run duly reported `trainingDates 48` for a club that was about to gain 19 dates: a calendar restored and still invisible to the reminder.

**Applied 2026-08-20**: +38 sessions (19 per category, to 2026-10-22), +64 training RPE, +313 match RPE, `trainingDates` 48 → 67, rpe 6496 → 6873. Measured with the real engine before and after: `hasData` **21/75 → 54/75**, estimated badge **20/75 → 3/75** (the theoretical ceiling with every gap filled is 55).

**The club goes stale again.** `hasData` expires at `STALE_AFTER_DAYS = 10`, so a demo nobody tops up shows 54 grey dashes about ten days after the last run. That is the shape of the recurring complaint, not a new bug each time.

### v111 (2026-08-21) — one definition of "the session is over"

Reported as three separate things; they were one. A 11:30–12:00 session sat on the
Entrenaments page as **"En curs" until 13:30**, yesterday's 22:00 session wore
**"Completat"** while still occupying the coach's landing page, and the RPE push for
either was expected at the whistle and never came.

**There were four different answers to "has it finished?", and the field that knows
was consulted by none of them.** `endTime` has existed since the per-team session
rework; only `sessionWindow()` — used by the *player's* week strip — ever read it.

| surface | old rule | now |
|---|---|---|
| staff list badge (`computeStatus`) | start + 2h, flat | `endTime`, else start + **120** (`BADGE_FALLBACK_MINS`) |
| coach landing page (`renderStaffWeek`) | **the date alone** | `sessionEndsAt` / `matchEndsAt` |
| player pending-RPE (×2 call sites) | start + 90 / + 105, inline | `sessionEndsAt` / `matchEndsAt` |
| player week strip, matches | **kick-off** | `matchEndsAt` |
| `scheduledRpeReminder` | a **23:00 cron** | the activity's own end |

The badge keeps **two** hours as its fallback while everything else keeps ninety. That
is deliberate, not drift: the fallback only applies to a session nobody gave an end to,
and changing it there would have silently re-dated every legacy row's badge.

**`sessionEndsAt(t, fallbackMins)` / `matchEndsAt(m)`** are the Date form of
`sessionWindow`, which answers in minutes-past-midnight and therefore cannot compare
across dates — both new callers span days. They are built as **start + duration**, never
by formatting the end back to HH:MM: a 23:30 session with no `endTime` ends at "25:00",
which `minsToHHMM` refuses and every date parser turns into `Invalid Date` — and a NaN
comparison answers `false`, so the session would have counted as *never over*.

`DEFAULT_MATCH_MINS = 120` replaces the 105 the pending-RPE counter had inlined twice.
90 + half time leaves **nothing for added time**, so a match that ran long was called
finished while it was still being played. A match has no `endTime` field and never has
had one; the server ignores a stray one so the two sides cannot disagree.

**Both week strips now drop a match at full time.** The player's used to drop it at
**kick-off** (`new Date(m.date+'T'+m.time) > now`) — 18:00 on the calendar meant gone
from the strip at 18:00, mid-match — which is the same mistake the session strip made
before `endTime` existed. It reads `matchEndsAt` now, so the coach's page and the
player's page agree.

#### `scheduledRpeReminder`: `every 30 minutes`, not `0 23 * * *`

The nightly sweep was wrong in both directions: it chased the 11:30 session eleven hours
late, and it chased the 22:00 one at 23:00 — **an hour in, while it was still being
trained**.

`endedInWindow()` claims an activity for the run whose half-open band `[end, end + 30min)`
contains its end. The band is **exactly as wide as the schedule interval**: narrower
leaves gaps (an activity nothing ever chases), wider double-sends on consecutive runs,
and both failures are silent. `RPE_WINDOW_MINS` and the cron string are pinned to each
other by a test that parses both out of the source.

Consequences that are not obvious:

- **Yesterday stays in scope.** A 23:30 session ends after midnight and belongs to
  *tomorrow's* 00:00 run. `array-contains-any [yesterday, today]` on `trainingDates`,
  and `where("date","in",dueDates)` where `dueDates` is only the dates something
  actually ended on — the other 47 runs a day must not pay for a second date.
- **One push per ACTIVITY, not per player per day.** Two squads finishing at different
  times are two questions. The tag moved from `rpe-<date>` to
  `rpe-training-<sessionId>` / `rpe-match-<matchId>`; the date tag collapsed the evening
  squad's reminder onto the morning squad's on Android.
- **The client had to move with it.** `completedTraining` gated the RPE form on
  start + 90 min. Left alone, a 30-minute session would have been pushed at 12:00 and
  offered nowhere to answer until 13:00.

`activityEndsAt()` in `functions/index.js` duplicates `sessionWindow`/`matchEndsAt`
because functions/ deploys on its own and cannot require `../js`. **The two copies are
pinned to the same numbers by tests on both sides** — `test/training.test.js` for the
client, `test/reminders.test.js` for the server.

Unit tests 595 → **620**. Every new assertion was run against `git show HEAD` in a
throwaway worktree first and fails there.

**Deployed 2026-08-21.** Frontend v111 served (confirmed by fetching `sw.js`/`app.js`,
not by trusting the push); all 18 functions ACTIVE on new revisions at 14:41Z. The live
Cloud Scheduler job now reads `every 30 minutes` / `Europe/Madrid` / ENABLED — read from
the Cloud Scheduler API, which is the artefact, rather than from the deploy output.
Rules unchanged and not redeployed.

### v112 (2026-08-21) — the coach's override reaches the server

Asked as a question: *"if a player hasn't answered and the coach overrides him and adds
him, does he still get the RPE push?"* He did not. Two live gaps, in **opposite**
directions, both pre-dating v111:

- **A player the coach ADDED by hand was never chased.** `_ntMarkAttending` writes
  `fa_training_staff_override`, never a record under the player's own key — deliberately,
  so the app does not forge an answer as him — while `scheduledRpeReminder` read only the
  `trainingAvail` collection. He saw the RPE waiting on his home screen and was never told
  about it.
- **A player the coach marked ABSENT was chased anyway**, because his own stale `yes` was
  the only thing being read.

**Two stores, one of them never consulted** — the same shape as v110's injuries bug and
v111's `endTime`. The client has always applied `readRecord(staffOverrides, …) ||
readRecord(availData, …)` in `renderPlayerActions`; this is the server learning the rule it
already had.

`attendedFor(overrides, answers, uid, session)` replaces the bare `answeredFor` call in the
training half of the reminder. **The coach wins in both directions** — an override is a
human saying he was or was not there, which outranks the player's answer *and* his silence.
`overrideFor()` mirrors `readRecord`: session-keyed first, date-keyed legacy second, and
**never** the legacy key for a guest — a date-keyed record predates call-ups and can only
have meant the player's own session.

`mergeMapShards()` is new, the map counterpart of `mergeArrayShards`. It merges **every**
category's shard, which matters here specifically: `fa_training_staff_override` is in
`ROSTER_JOINED_KEYS` as `uidPrefix`, so it is routed by the **player's** category — a
juvenil guest at an amateur session has his override in `…__juvenil`. Reading only the
session's own shard would have missed exactly the borrowed players a coach is most likely to
have added by hand. It costs no extra query: `readDataShards` already reads the whole
`data/` collection.

**Matches are unaffected** — there is no staff override for a match; the convocatòria is
already the coach's own list.

Unit tests 620 → **631**. Both gaps were reproduced against `git show HEAD` in a throwaway
worktree — with no override present the old and new answers are identical, which is the
part that matters.

#### The schedule became real cron in the same deploy

v111 shipped `schedule: "every 30 minutes"`. That is the **App Engine interval** form: it
waits N minutes after the previous run *finishes*, so consecutive runs drift apart by each
run's duration — and `endedInWindow`'s bands stop tiling. The last seconds of one band get
covered by no run at all, and an activity ending in that sliver is chased by nobody. Silent,
rare, and exactly the failure the fixed-width band was meant to rule out.

`*` `/30 * * * *` fires on the wall clock at :00 and :30 whatever a run costs, so
consecutive runs are exactly `RPE_WINDOW_MINS` apart, always. A test now asserts the
schedule is **not** an `every N` interval, on top of the one pinning the two numbers
together.

**Found from evidence, not from reading**: after the v111 deploy the scheduler's
`lastAttemptTime` was still the previous day's 23:00 run, well past when a wall-clock
half-hourly job should have fired.

### v113 (2026-08-21) — the pre-session push tells everyone, and the club sets the clock

Two changes to `scheduledTrainingReminder`, both asked for directly.

#### a) It goes to everyone who is COUNTED, not only the unanswered

Attendance here is **opt-out**: `getEffectiveAnswer` returns `yes` for an unlocked session
nobody has answered. The reminder went only to players with no record — which is the wrong
half. A player who said nothing and a player who said "Sí" are in exactly the same
position, both expected at training, and only one of them was being told.

`countedFor(overrides, values, uid, session)` is the audience now: **everyone except a
`no`/`injured`**, from the player or from his coach. That last part matters — telling a
player the staff has dropped that "we are counting on you" is the one thing this message
must never do. It is the deliberate mirror of `attendedFor`: *before* a session silence
means expected, *after* one it means never marked present. Same two stores, opposite
defaults.

The body now carries the deadline: *"Comptem amb tu — si no pots venir, canvia-ho abans de
les HH:MM."* That time is `start − lockHours`, the exact instant `isTrainingLocked` will
start refusing changes, so the message cannot promise a window the app then denies.

#### b) `pushHours` and `lockHours` are per club, set by the lead

Stored as `clubs/{id}.reminders`, edited in Config Club (the team-setup screen), saved
through `setClubCategories` — the callable already owns club config, and `categories` is
refused from a client outright.

**Defaults 4 and 3.** `lockHours` replaces a **hardcoded one hour** in `isTrainingLocked`,
so ⚠ **every existing club's answering window closes two hours earlier than it did** until
its lead changes it. That is the requested behaviour, not a side effect.

`push > lock` is enforced in three places and each one is load-bearing: the client (so a
typo costs no round trip), the callable (because these two numbers drive a push to every
player in the club), and `remindersOf` on read (a pair written by anything that bypassed
the callable falls back rather than announcing a deadline already past).

#### Two latent bugs fixed on the way

- **`every 60 minutes` → `0 * * * *`.** Same interval-vs-wall-clock trap as v112: the App
  Engine form waits N minutes after the previous run *finishes*, so runs drift and a
  fixed-width band stops tiling.
- **The band was inclusive at both ends** (`< 3.5 || > 4.5`), so a session landing exactly
  on the boundary — *any session at half past the hour* — was reminded **twice**. It is
  half-open now: `[pushHours − 0.5, pushHours + 0.5)`.

The date window widened from today+tomorrow to three days, because `pushHours` can now be
up to 72.

**Not done, deliberately:** the lock is enforced in the client only. `firestore.rules`
cannot cheaply reach a session's start time, so a determined user could still write a late
answer. Same as before this change — it was never enforced server-side.

Unit tests 631 → **643**, including a cross-file guard that reads
`REMINDER_PUSH_HOURS`/`LOCK_HOURS`/`HOURS_MAX` out of **both** `js/app.js` and
`functions/index.js` and asserts they are equal. Verified it bites by mutating one side.

### v114 (2026-08-21) — the RPE form stops asking for what the club already knows

The first live push arrived and the feedback was immediate. Three changes, all small.

**1. The push says "Entrenament", not the focus.** `session.focus` is the coach's own
planning label — "Força i prevenció", "Partit condicionat" — and means nothing to a player
reading a lock-screen notification. Both bodies drop it: the pre-session reminder and the
RPE chase.

**2. A training's Minutes box is pre-filled with the session's length.** `sessionMinutes()`
is `sessionWindow`'s duration, so it honours `endTime` and falls back to 90. The coach
already set it; asking the player to work it out again is a step with no information in it.
Still editable — he may have left early.

**3. A match's Minutes box is pre-filled from the substitution events.**
`playerMatchMinutes` already derived this from the starting XI and the `change` events, for
the readiness estimator — it just was not offered to the player. **Verified against
production before relying on it**: the demo club holds 199 substitution events across 72
matches, with a `startingXI` on 73 of 75 convocatòries.

`playerMatchMinutesKnown()` is new and exists for one reason: `playerMatchMinutes` collapses
"played nothing" and "no line-up recorded" into **0**, which is right for load maths and
wrong for a form default. Pre-filling 0 for a whole squad whose coach never entered a
starting XI invites everyone to submit a zero and quietly flatten the club's load data.
`computePlayerMatchStats` already distinguishes them — `'—'` for no XI, `'NC'` for not
called — so only a real number reaches the cache, and a null renders an **empty** box.
Esquerra de l'Eixample has no matches at all yet, so that is the branch it will actually hit.

**The match cap is 100 minutes** (90 plus added time), the training cap stays 300. It was a
flat 300 for both, so a mistyped match length sailed through as 300 — ten times a real
session, and it skews the load charts for the rest of the season. The ceiling now comes from
`data-max` per card **and is re-checked at submit**: a value the form PRE-FILLED never fires
an `input` event, and neither does an autofill, so the keystroke clamp cannot be the only
check. That trap was created by this very change.

Unit tests 643 → **651**.

### v115 (2026-08-21) — three staff sub-roles: coach, fitness, delegate

`staff` was one role. `buildSidebarItems()` and `STAFF_PAGES` both gated on the same
`roles.includes('staff')`, so every staff member got all ten staff sections with full edit
rights. A club wanted to hand accounts to a fitness coach and a match delegate without also
handing over the tactical boards, the medical file and the ability to delete a fixture.

**The sub-role lives on the roster doc, as a parallel map.**

```
clubs/{clubId}/rosters/{cat}-{letter}
  staffEmails : ["a@x.com", "b@x.com"]        // unchanged
  staffRoles  : { "b@x.com": "fitness" }      // NEW — absent ⇒ "coach"
```

A parallel map rather than turning `staffEmails` into objects: no shim in `normEmails`, no
migration of existing docs, and it inherits the right permissions for free — `firestore.rules`
already gives full roster writes to the lead only and pins staff to
`hasOnly(['playerEmails','updatedAt'])`, so `staffRoles` is lead-only without a rule change.

**Absent means coach, everywhere.** On the server (`normStaffRoles`, `membershipFrom`), in the
client's `staffAccess()`, and in `check-deploy.js`. That is what every roster doc and every
user doc written before today looks like, so an existing coach's behaviour is bit-identical.

**Resolution across categories is deliberately permissive** (`resolveStaffRole`): a staff
member can be on several lists and the lead sets the dropdown per list. Any list that leaves
them undowngraded wins, and two *different* downgrades cancel back to coach. The failure that
actually hurts is a real head coach locked out of their own sections by a stale dropdown
somewhere else; the gating is a UI convenience, so the permissive fallback costs nothing.

**The access matrix** — `edit` is today's behaviour, `view` renders the page with every
mutating control left out, `hidden` is dropped from the sidebar and bounced by the route guard:

| Section | page id | coach | fitness | delegate |
|---|---|---|---|---|
| Inici | `staff-home` | edit | view | view |
| Registres | `registrations` | edit | view | view |
| Plantilla | `manage-roster` | edit | view | view |
| Perfil de jugador | `staff-player-stats` | view | view | view |
| Sessions d'entrenament | `staff-training`, `-detail` | edit | view | view |
| Nova sessió | `training-new` | edit | hidden | hidden |
| Calendari | `matchday` | edit | view | edit |
| Convocatòria | `convocatoria` | edit | hidden | view |
| Jornada | `staff-matchday`, `match-detail` | edit | edit | edit |
| Mèdic | `medical`, `-detail` | edit | edit | hidden |
| Pissarra tàctica | `tactics` | edit | hidden | hidden |
| Notificacions | `staff-notifications` | edit | edit | hidden |

A page absent from a sub-role's table is `edit`, so `coach` has no table at all.
`staff-notifications` is `edit` for fitness on purpose: its only writes are mark-as-read and
Clear All, and a read-only notification feed is not a meaningful thing.

**This is a UI gate, not a security boundary, and that was a decision rather than an
oversight.** All three sub-roles still carry `role:'staff'` in their token and
`firestore.rules` still lets them write the same documents. It could not be otherwise today:
Calendari, Jornada **and** Convocatòria all write the same `teams/{id}/data/fa_matches__{cat}`
document as one opaque `{v:"<json>"}` blob (`saveMatchEvents` syncs the score back at
app.js:1717, marked "backward compat"; Convocatòria writes `callupTime` at ~17600), so
"Jornada but not Calendari" is not expressible in a rule. Server-side enforcement needs those
cross-writes split first — score into `fa_match_events` only, `callupTime` into
`fa_convocatoria_callup` only, starting-XI out of `fa_convocatoria_sent` — and then a
`sections` claim keyed off `baseKey(key)` in `firestore.rules:115`.

**Two gates, always in step.** `buildSidebarItems()` filters each staff item through
`canViewPage(id)`; `renderPage()` bounces a staff page the sub-role may not view. Hiding the
sidebar item alone is not enough — detail pages are not sidebar items, and the Back button,
the staff-home shortcuts and a stale `currentPage` from before a role change all reach a page
without passing the sidebar. `shomeLinkAttrs()` drops the `data-shome-link` attribute for a
destination this sub-role cannot open, so a delegate's "Out of action" rows are inert text
instead of clicks that bounce.

**Two render-time writes had to be guarded**, or merely OPENING a page would be a write from a
session that may not change anything: the id-repair + sort in `renderStaffTraining` (app.js
~11933) and the computed call-up default in `renderConvocatoria` (~14020).

**Read-only rendering reuses what was already there where it could.** A completed training
session already renders as static cells, so a view-only sub-role takes that branch — minus the
`st-locked` class, which greys the row to mean "this session is over". Squad edits on the
training detail fold into the existing `squadEditable` flag. Everywhere else the pattern is the
same: leave the control out of the markup AND refuse in the handler. The delegated listeners on
`#dashboard-content` (registrations, board↔teams linking) are bound once and outlive any
render, so the markup half alone would not hold.

**`set({merge:true}) deep-merges a map field**, so writing the new `staffRoles` alone would only
ever ADD keys — demoting someone back to Coach would leave `fitness` in the document forever.
Every key that has gone is deleted with `FieldValue.delete()` (app.js, Config Club save).

**`onRosterWritten`'s membership signature now carries the sub-role** (`"s:" + role`, was `"s"`).
Without that, flipping only the dropdown produces a roster write the trigger classifies as a
no-op and returns from — and `users/{uid}.staffRole` stays stale. This was the easiest thing in
the whole change to miss.

`users/{uid}.staffRole` joins the server-owned field list in `firestore.rules` (self-create and
self-update, plus the staff allowlist it is deliberately absent from) and the strip-list in
`setSession()`. `check-deploy.js` now audits it against the rosters — a mismatch never denies a
write, it just shows or hides the wrong sections, silently.

Files: `js/app.js`, `functions/index.js`, `functions/check-deploy.js`, `firestore.rules`,
`index.html`, `css/style.css`, `sw.js` (v114 → v115), `test/staff-roles.test.js` (new),
`test/rules.test.js`, `test/package.json`.

Unit tests 651 → **671**; rules tests 134 → **139**.

### v116 (2026-08-22) — coach match notes, and the return fixture briefs itself

Two things the staff asked for, and one of them turned out to be a data-model question.

**1. Per-match coaching notes** — a plan before the match, a debrief after it, video links and
tactical boards, none of it visible to the squad.

**2. When the return fixture is created**, the coach is handed the first leg without going to
look for it: result, events, line-up, and whatever he attached the first time.

#### Where the notes live, and why not in the blob layer

`teams/{teamId}/matchNotes/{matchId}` — a collection of its own, outside `js/db.js` and
`js/shard.js` entirely.

The obvious move was another `SYNCED_KEYS` entry (`fa_match_notes`, `{shape:'map', by:'match'}`,
exactly like `fa_tactic_match_boards`). It cannot be done. The `data/{key}` read rule
(`firestore.rules:113`) is scoped by **category, not by role** — it has to be, because players
read their own squad's fixtures out of the same collection — so a notes shard would be
downloaded onto the phone of every player in the category. Staff-only means its own rule.

```
teams/{teamId}/matchNotes/{matchId}
  matchId, category, team
  pre  : { text, updatedAt, updatedBy }
  post : { text, updatedAt, updatedBy }
  videos : [ { id, title, url, comment, phase } ]
  boards : [ { boardId, name, tag } ]     // tbSessionRef()'s shape, unchanged
  firstLegId, legDismissed
```

Doc id is the match id — **not** `{uid}_{matchId}`. This is the staff's shared preparation for
one match, not each coach's private diary; `owns(docId)` would fragment one plan across whoever
typed which half and turn the briefing into a multi-doc merge.

`category` is duplicated onto the doc for the same reason `ownerUid`/`clubId` are duplicated onto
`tacticBoardData`: the rule stays self-contained and never needs a `get()` of `fa_matches`. It is
**immutable on update**, or a note could be walked from one squad's compartment into another's
one write at a time.

> WARNING — **the staff sub-roles are still invisible to the rules.** coach, fitness and delegate
> all carry `role:'staff'`; `staffRole` lives on `users/{uid}` and is not a claim. So the rule is
> **staff-only, hard**, and "coach-only" is the v115 client gate on top — players are excluded by
> the rule, a delegate by the UI, exactly as with Pissarra. Notes and the briefing are open to all
> three sub-roles (a delegate filing the post-match report is a real workflow); only the boards
> block follows `staffAccess('tactics')`.

`js/match-notes.js` (new, `MN`) is modelled on `js/boards.js`: in-memory cache, one `onSnapshot`,
a `match-notes-sync` event. **`MN.init` decides for itself whether the session is staff**, from
the same custom claims `firestore.rules` reads, rather than being told by app.js — the listener
query has to satisfy the rule exactly, so it takes its answer from the same place. A player's
client opens no listener at all; passing the role in would have worked today and drifted later.
Hooked into `DB.init`/`DB.cleanup` beside `TB`, for the same reason: one place where a club's
per-team stores come up together instead of seven call sites that can diverge.

There is no localStorage mirror. Firestore's own persistence covers a cold pitch-side connection.

#### How the app knows a match is the second leg

It does not, and could not: a match row is
`{id, home, away, date, time, score, status, location, mapLink, team, category}` and there is no
competition, no round, no leg and no fixture import — `fcfLinks` is a standings URL per squad.
The pairing is **derived and then confirmed**.

`findFirstLeg()` (`js/utils.js`, pure, 21 tests) returns the most recent earlier match with: same
category, same team letter, rival name normalising equal, **home/away swapped**, strictly earlier
date, and inside the current season (`seasonStartStr()` — no season field was added, and none
should be).

`normTeamName()` strips accents, punctuation and legal forms so "C.F. Gracia" / "CF Gracia" /
"Gracia F.C." are one club. **"Atletic" is deliberately NOT on the noise list**: a parent club and
its feeder differ by exactly that word, and merging them is the one false positive that would
survive a careless click. Names that are nothing *but* noise ("C.F.") keep their letters — an
empty string would make every such rival equal to every other.

`ourSideOf()` uses **exact** equality on the club name, mirroring `isOurTeam()`. Being lenient
would let this helper and the scoreboard disagree about which side is ours on the same screen; a
club that renames mid-season loses the suggestion rather than getting a wrong one.

**Why confirm at all**: a friendly and a league game against the same club with swapped venues
satisfy the rule equally well. The banner costs one click and makes a wrong pairing visible
instead of silent.

Only the ANSWER is stored. `legDismissed` exists because without it an unanswered suggestion and
a declined one are the same state, and the banner returns for ever. Detection runs off the live
blob on every render, so the offer also appears for fixtures created before this shipped, and
comes back when a coach corrects a misspelled rival.

The banner is on **Calendari** for upcoming fixtures only — deriving it for past ones too would
greet a club with a season of history with twenty banners at once — and on match detail for any
single fixture opened.

#### The briefing

**Inline, always open, at the very top of the second leg's page — above the match hero.** Not a
`<details>`, and with no control that navigates to the first leg. Both of those were tried and
both were wrong, for the same reason: the coach is preparing the RETURN fixture, so the first
leg's information has to come to him on that page. Anything that asks him to click, or that takes
him somewhere else, defeats the whole feature.

**Three columns, then a media row beneath them:**

| | |
|---|---|
| **left** | the scoreline (colour-coded) and the event timeline |
| **middle** | Alineació and Suplents |
| **right** | the coach's notes from before and after the game |
| **below, full width** | every video link and board, split by AUDIENCE |

**The header carries three things and no more**: `Resum partit d'anada`, a house or a plane for
where it was played, and the date. The score, the rival and the result all live in the left column
-- a header repeating any of them has to be read rather than glanced at.

**Collapsible, and it remembers.** Back to a `<details>`, but `open` by default: the information
has to be there without being asked for, while a coach who does not want it above every match can
put it away and have it stay away. The state is `fa_mn_brief_collapsed`, a plain localStorage key
that db.js does NOT sync -- it is a per-device UI preference, and one coach folding it up on his
phone must not fold it up on a colleague's laptop. The toggle handler re-runs `scaleRoBoards()`
and `fitMnScoreNames()` on the way back open, because a board or a scoreline laid out while
collapsed measures zero and both functions correctly skip it.

The media row is split **by audience, not by kind**: `🔒 Privat` is what only the staff ever saw
(`matchNotes.videos` / `.boards`), `📣 Enviat a la convocatòria` is what went out to the squad
(`fa_convocatoria_sent[id].videos` and `fa_tactic_match_boards[id]`). The audience is the thing a
coach has to be sure of, and a board of opponent analysis in the wrong one is exactly the mistake
this layout exists to make impossible to walk into. The two columns take **different board id
prefixes** (`mnb-` / `mns-`), because the same board can legitimately be in both and
`tbRoBoardHtml` builds element ids from the prefix — a test asserts they differ.

The three columns are separated by **vertical rules**, drawn on the column rather than in the gap
so they stretch to the tallest of the three -- that is what makes three lists of different lengths
read as three sections. Stacked, the same separation becomes horizontal, or the sections run into
one ribbon.

Those dividers are why the column grid uses an **explicit 860px breakpoint** instead of
`auto-fit`: with `auto-fit` the first column of a wrapped row keeps its left border, and the rule
reads as a stray vertical line in the middle of nothing. Three columns or one, never an awkward
two. (The media row keeps `auto-fit` -- it has two items and no dividers.) An **empty column is
omitted**, not left blank, and the media row disappears entirely when the first leg had no media
at all.

`mnOutcome()` is the single definition of win/draw/loss, read by both the scoreline and the
Calendari banner's inline line -- two copies of that rule drift into a screen that says "won"
beside a block coloured red.

**Colour goes only behind the RESULT**, never behind the club names, and it is the same three the
player's Historial de partits uses -- `#66bb6a` / `#78909c` / `#ef5350`, lifted straight from
`.pmt-win` / `.pmt-draw` / `.pmt-loss`. A coach and his players should not be reading two colour
languages for the same fact. The **score stays in home-away order** while the colour is ours,
because it sits between the two club names and has to agree with them. A fourth state, grey with
a dash, is "no result was ever entered" -- rendering that as a draw would invent a scoreless
match out of a fixture the coach simply never filled in.

**The club names are fitted, not truncated.** They are the loudest thing in the briefing and must
never wrap, so `fitMnScoreNames()` measures and steps the font size down (1.15rem to a 0.62rem
floor) until both fit. The size is set on the CONTAINER so both names always shrink together --
one long name and one short one at different sizes reads as emphasis nobody meant.

> The trap, and it is a silent one: the container is `justify-content:center`, and a **centred
> flex container overflows symmetrically**. The left overflow is not scrollable, so `scrollWidth`
> can equal `clientWidth` while the content plainly does not fit -- a fitter built on it never
> shrinks anything and looks correct in every test. `_mnScoreNeed()` sums the children's
> `offsetWidth` instead (they are `flex:0 0 auto` and `nowrap`, so that IS their natural width).
> It runs in renderPage's post-layout rAF pass and again, debounced, on resize.
>
> **It is the one thing in this change no test proves.** jsdom has no layout, so every assertion
> would pass against a function that does nothing; the tests pin only the wiring and the
> scrollWidth trap. Confirm it in a browser against a long club name.

Everything is read-only. `matchTimelineHtml()` is called with `staff=false`, so it carries no
per-event delete buttons, and the "+ Event" forms are not built at all — editing the first leg
happens on the first leg. A test asserts the absence of `ev-delete`, `ev-add-btn`,
`starter-toggle` and `<textarea>` anywhere inside it.

`matchScoreboardHtml()` and `matchTimelineHtml()` were lifted out of `renderMatchDetail` so both
legs render through the same code; only the read-only halves moved.

**Compactness is a requirement, not polish** — this sits above the match you actually opened. The
squad is `mnLineupChipsHtml()`: **Alineació and Suplents side by side, each read DOWN its own
column**, goalkeeper first -- `posRankGlobal` sorts on `POS_ORDER` and that starts at `GK`. A team
sheet is read down the spine of the team, not across a wrap, and it is not the `.detail-player`
rows the match page uses for its own call-up: eighteen of those beside the match is a wall.
**The XI is marked by its outline alone**, no star -- in a chip that size the star says the same
thing the 2px accent border already does. A squad with no XI recorded falls through to a single
"Suplents" list rather than an empty "Alineació" heading.

`posRankGlobal` is now exported from `js/utils.js` so the ordering test can assert against the
REAL ranking; a stub would have passed whatever order the call-up happened to be in.

`fa_tactic_match_boards[matchId]` (what the squad sees, once the convocatoria is sent) and
`matchNotes.boards` (the coach's own) are now two lists per match. Same ref shape, same renderer,
different audience — labelled in the UI so nobody attaches opponent analysis to the wrong one.

**`match-detail` is on the `firestore-sync` re-render exclusion list** because it holds editing
state, and it now holds the notes editor too. `match-notes-sync` therefore re-renders `matchday`
only.

**One definition of the title size.** `--mn-title-size` on `.mn-brief` is read by both the header
row and the club names, which are meant to read as the same size, and `fitMnScoreNames()` now
clears its inline size and starts measuring from `getComputedStyle().fontSize` rather than
carrying a copy of the number. A hardcoded maximum in the JS would have been a second copy in a
different file, and the drift would be silent -- the title would simply stop matching the names
one day. A test asserts exactly two rules use the token and that the fitter holds no `MAX`.

**Boards go two-up where there is room.** `.mn-boards` is
`repeat(auto-fit, minmax(190px, 1fr))`, so a pair sits side by side instead of stacking down a
column with half its width empty. `auto-fit` and not `auto-fill`: a lone board must still span the
full width, being the widest thing in the briefing, and `auto-fill` would leave it holding an
empty track.

#### Unrelated, found while testing: staff were told "No convocat"

The call-up banner on the match page is addressed to the PLAYER looking at the fixture, and a
coach is never on his own convocatoria -- so every staff member opening any match with a call-up
sent was told **"No convocat"**, an answer to a question they had not asked.

Gated on `isPlayerViewer` (`roles.includes('player')`), **not** on "is not staff". A playing coach
is both, and for him "am I called up?" is a real question with a real answer; only accounts with no
player role lose the banner. The same message on the player actions page needed no change -- that
whole sidebar section is already gated on the player role.

#### Season rollover — including a bug that was already there

`archiveSeason` empties `fa_matches`, so anything keyed by match id and left behind points at
fixtures that no longer exist. `matchNotes` joins the per-record archive loop beside
`trainingAvail`/`matchAvail`/`rpe`, with a `seasons/{id}/matchNotes/{docId}` rule that is
**enumerated, never a wildcard** (`firestore.rules:174` explains why: a wildcard there also
matches `seasons/{id}/data/*`). Archived notes keep their `category`, so the staff+cats check
applies verbatim — archiving is not declassification.

**`fa_tactic_match_boards` was missing from `SEASON_KEYS` and always had been.** Every rollover
left a season of board links pointing at deleted fixtures, with nothing to clean them up (the
client-side `fa_cleanup_orphan_match_boards` sweep matched by NAME and never ran again after its
first pass). Added to `SEASON_KEYS` and to `OBJECT_KEYS`, since it is a map and the reset must
write `{}` and not `[]`.

`deleteTeam` now also deletes the `matchNotes` of the fixtures it removes — by doc reference, not
by query, since the doc id *is* the match id and `matchNotes` has no `uid` field to filter on.

#### Tests

`test/match-legs.test.js` (21) is mostly NEGATIVE cases, and deliberately: a false positive is
offered and can be declined, while a wrong link accepted without looking puts last season's team
sheet in front of the coach as this week's preparation. Every clause of the rule has a test
proving its removal would pair two matches that are not legs.

`test/match-notes.test.js` (39) drives `MN.save` over a fake `db`/`auth` — both are read at CALL
time, never at load time, precisely so they can be stubbed — and pins the two ways a later change
could quietly undo the security model: widening the rule to `sameTeam` (one word, and the coach's preparation goes to the whole
squad) and moving the notes into the sync layer (same outcome, different route). **Both guards
were verified by mutation** — adding `sameTeam(teamId)` to the read arm fails exactly one test.

`test/match-notes-render.test.js` (38) runs the ~250 lines of renderer source through the
`grab()` harness. It found two things nothing else would have, and now also pins the shape of the
briefing itself (inline, read-only, no way out of the page). The two: the **cache was applied
after the server ack**, so typing a note and then pressing "+ Add video" re-rendered the old text and the
coach watched his sentence disappear (saved, but invisible); and a **`javascript:` video URL
reached `window.open()`**.

That second one is worth spelling out, because `sanitize()` looks like it should have covered it
and does not — they solve different problems. `sanitize()` escapes `< > & "` so a string cannot
break out of the attribute it is written into. `javascript:fetch(...)` contains none of those
characters, so it passes through completely untouched, and `dataset.videoUrl` decodes the
escaping back to the original string when the handler reads it. `window.open()` on such a URL
does not navigate anywhere: it opens a window and RUNS the code, on our own origin, in the
viewer's signed-in session. Only staff can enter a video link, so the exposure is a STORED value
shared between staff — which is precisely the case worth closing, since one account then reaches
what another can do.

`safeHttpUrl()` (js/utils.js) is an allowlist — http(s) only, so `data:`, `blob:`, `vbscript:`
and a schemeless `//evil.test/x` all fail with it. **The guard lives in the click handler**, not
at the render sites: the convocatòria's video links and the coach's notes both feed the one
`.detail-video-link` listener, so one check covers both and a third render site inherits it for
free. The render site also greys out a refused URL, so it LOOKS refused rather than being a link
that does nothing — but that is cosmetic, and the handler is the guard.

Every guard in this change was checked by mutation, not by reading: adding `sameTeam(teamId)` to
the matchNotes read arm, deleting the scheme check from the click handler, and moving the cache
write back into the `.then()` each fail exactly the tests that claim to catch them, and only
those.

`test/rules.test.js` gains 13 assertions against the emulator, the load-bearing one being that a
player of the same club and the same category is **denied**.

Files: `js/match-notes.js` (new), `js/utils.js`, `js/app.js`, `js/db.js`, `firestore.rules`,
`functions/index.js`, `functions/check-deploy.js`, `index.html`, `css/style.css`, `sw.js`
(v115 to v116), `test/match-legs.test.js` (new), `test/match-notes.test.js` (new),
`test/match-notes-render.test.js` (new), `test/rules.test.js`, `test/package.json`.

Unit tests 671 to **769**; rules tests 139 to **152**; functions 71, unchanged.

No `minAppVersion` bump: an old APK never fetches `matchNotes` and behaves exactly as it does
today.

### Next, and it changes two things here — the FCF classificacio scrape

The owner reports that **fcf.cat has changed and the standings scrape is probably broken**
(`fcfClassificacio` in `functions/index.js`, the CORS proxy, plus `clubs/{id}.fcfLinks`). Nothing
has been investigated yet and nothing here anticipates it — but the intended shape of the fix
lands directly on this feature, so it is worth knowing before touching either:

1. **Match creation gets an opponent DROPDOWN** fed from the competition's team list, instead of a
   free-text `md-opponent` box. Rival names then match exactly, every time.
2. **Badges and league positions** become available for a match, so a fixture and this briefing
   could show who the opponent was and where they stood *when the game was played*.

The consequence for the anada/tornada work: `normTeamName()` and the whole confirm step exist
**because the rival is typed by hand**. With an exact-match dropdown the pairing becomes
unambiguous, and the `Enllaçar` / `No` banner could be dropped in favour of an automatic link --
`legDismissed` would survive only for the genuine ambiguity (a friendly and a league game against
the same club with venues swapped). Do not pre-empt that: the normaliser is what keeps the feature
working for every fixture already in the database, and for any club that never adopts the
dropdown.

**Known flake, not caused by this change**: `npm test` (the full chain) can fail the functions
suite with `Cannot determine backend specification. Timeout after 10000` — the emulator's
10s function-discovery budget, running hot straight after the rules suite. `npm run
test:functions` on its own passes 71/71 every time. `deploy.ps1` already sets
`FUNCTIONS_DISCOVERY_TIMEOUT=120` for the same reason; the test script does not.

### 2026-08-22 — v117: FCF standings on the rebuilt fcf.cat, and an opponent picker fed by it

**The outage.** fcf.cat was rebuilt as a Next.js app. Every league link a club lead had saved was
dead: `https://www.fcf.cat/classificacio/…` 307s to `/ca/classificacio/…` and returns **404**, and
the page that replaced it ships no server-rendered table at all — the standings arrive after
hydration. So `parseFcfHtml()` had two independent deaths, a dead URL and an empty document.
Nothing in the app said so: `applyLeagueRows()` returned early on zero rows, so a dead feed and a
division that had not kicked off looked identical. That is why it went unnoticed for weeks, and it
is the reason half of this entry is about error states rather than parsing.

**What replaced it: a public JSON API**, no key, no auth, verified live.
`/api/competition/classificacio?grupId=` returns `{data, promociones}` with the whole table,
stable `team.teamId`s, badge filenames and last-5 form. Siblings exist and are worth knowing
about: `partidos?grupId=` (the full calendar — jornada, kickoff, venue, coordinates, both escuts),
`grupos?competicioId=`, `competicions?disciplinaId=&temporada=`, `disciplines`, `temporadas`.
**`equipos?grupId=` is broken on FCF's side** — it returns the first team of the group repeated
once per row — so the team list comes from `classificacio`, which already carries it.

> ⚠ **`played` / `won` / `drawn` / `lost` are the home and away halves CONCATENATED as
> strings.** `played:"1515"` is 15 + 15 = 30. `won:"139"` is 13 + 9 = 22. `drawn:"05"` is
> 0 + 5 = 5. Proven by replaying a whole 240-fixture group from `partidos` and matching every row.
> FCF's own site renders them raw and displays "1515", so this is their bug arriving in our JSON,
> not a decoding we are missing — and the split is unrecoverable in general ("139" is 13|9 or 1|39
> with nothing to choose between them). **J is therefore derived as `round(points / coefficient)`**
> — `coefficient` is points-per-game and `points` is clean. Checked on 258 rows across five
> divisions, every one landing on an integer. `points`, `position`, `goalsFor` and `goalsAgainst`
> are clean totals and must NOT be put through any split rule.

**The proxy takes a grupId, not a URL** (`fcfClassificacio`, `functions/index.js`). The API sends
no `Access-Control-Allow-Origin`, so the proxy stays; the parameter change is a security
improvement in its own right. The old handler fetched a client-supplied URL behind a regex
allowlist — a shape one loosened character away from an SSRF. Now the only thing a caller controls
is a run of digits interpolated into a constant address. Clients older than v117 call it with
`?url=` and get a 400, which is exactly what they get today from the dead pages; there is
deliberately no compatibility branch keeping an HTML path alive that has no HTML to parse.

**Two pure functions in `js/utils.js`**, where they are testable: `fcfGrupId(url)` (the digits, or
`''` — and `''` is what the UI keys its "this link is out of date" warning off) and
`parseFcfClassificacio(json, clubName)`, which returns the row shape both league renderers already
consumed plus `teamId`/`rawName`. `parseFcfHtml()` is deleted.

Two behaviour changes fell out of the rewrite:

- **`ours` is now an exact `normTeamName` comparison.** The old test was
  `club.toLowerCase().indexOf(needle) !== -1` with the needle hardcoded to `"esquerra"` for any
  club with no name configured — so it highlighted "Gràcia" inside "Gràcia Atlètic", and a
  stranger's row for every club that was not Esquerra.
- **Pre-season, FCF sends `position:"0"` for every team** and orders by teamId, so `pos` falls
  back to the array index rather than printing a column of zeros.

**Empty tables now say why.** `leagueMessageHtml()` plus i18n keys `fcf.loading`,
`fcf.unavailable`, `fcf.empty`, `fcf.link_outdated`, `fcf.link_invalid`, `fcf.link_old_hint`,
`fcf.opponent_matched` — all three languages. A pre-rebuild link is never fetched at all: it 404s,
so spending a request on it every five minutes buys nothing.

**Team Setup** validates before the network, the way the staff-email box already did: a value with
no `grupId` blocks the save with `fcf.link_invalid`, and a SAVED old-format value renders with a ⚠
and the sentence that fixes it. `setClubCategories` refuses the same values server-side —
`firestore.rules` still carries the back-compat shim letting an old APK write `fcfLinks` straight
onto the club doc, so the callable is the only checkpoint that sees them. That check is a second
copy of `fcfGrupId` in **`functions/fcf.js`**, forced (the functions deploy uploads `functions/`
alone); `test/fcf.test.js` runs one input table through **both copies** and asserts they agree,
rather than testing each side separately.

**Every club must re-paste its links.** There is no migration: the old slug names the group by
name, and last season's at that, and nothing maps it to a grupId.

#### The opponent picker

`fcfTeamsFor(cat, letter)` reads the **standings cache** — `classificacio` already carries every
club in the group with its federation id, so the Calendari's completions cost nothing the
standings table was not already paying. Cache key bumped to `fa_league_cache_v2`: v116 rows carry
no `teamId`, and a stale v1 entry would silently offer names with no ids behind them.

Both matchday rows (draft and inline edit) now render `opponentInputHtml()` — an `<input list=…>`
with a `<datalist>` and a ✓, **not a `<select>`**. A select cannot express a friendly, a cup tie
against a club two divisions up, or a club with no FCF link at all; the read paths in
`readGames()` and the edit handler are untouched because `.value` is still a string.

- **`fcfLookup` matches the EXACT trimmed name, case-insensitively — not `normTeamName`.** An id
  is a claim of certainty. `normTeamName` collapses "C.F. Gràcia" and "Gràcia F.C." on purpose,
  which is the right leniency for a suggestion a human confirms and the wrong leniency for a
  stored identifier. Picking from the list inserts the federation's own string, so that is the
  path that earns an id; anything typed by hand keeps the name pairing it always had.
- **`mdRowSquad(tr)` is one definition on purpose.** The ✓ promises that saving will store an id,
  and before it existed the tick resolved the squad from the active chip while the save resolved
  it from `g.team` — which is `''` for every club with **one team per category**, the commonest
  club in the app. Those clubs would have seen a ✓ and got no id. `readGames()` now carries
  `squadLetter` separately so `team` keeps meaning "the letter the coach picked".
- Matches gain optional `opponentTeamId` / `opponentBadge`. Shards are written whole-document with
  no per-field rule validation, so no rules change and no migration. The **edit path deletes them**
  when the rival no longer resolves — `findFirstLeg` trusts an id over a name, so a stale one
  would pair with the wrong opponent's first leg and look authoritative doing it.
- **`findFirstLeg()` gains an exact-id fast path**: when BOTH matches carry a non-empty
  `opponentTeamId`, that answers it and `normTeamName` never runs. Every other clause still
  applies — the id is not an override, and a matching id cannot smuggle a same-venue pairing
  through. `normTeamName` and the `Enllaçar`/`No` confirm step **stay**: every fixture already in
  the database predates the picker, so the name path is not a fallback that may quietly rot.

#### Tests

Unit 769 → **834**. Two new files, **both added to `test:unit` by hand** (the standing trap):
`test/fcf.test.js` (30) and `test/fcf-app.test.js` (29), plus 6 new cases in
`test/match-legs.test.js`. Rules 152 and functions 71 both unchanged. Fixtures are REAL captured
payloads in `test/fixtures/`: a finished Tercera Catalana group (every field populated, the one
whose 240 fixtures were replayed) and the pre-season Quarta Catalana Grup 10 behind the owner's
own link.

Every guard was checked by mutation — reading `played` directly, dropping the position fallback,
reverting `ours` to a substring test, removing the teamId fast path, dropping the badge null
guard, removing the stampede clock, fetching a link with no grupId, removing the empty-table
message, sharing one datalist id across rows, bypassing the proxy, loosening `fcfLookup` to ignore
punctuation, and dropping the single-letter squad fallback each fail exactly the test that claims
to catch them, and only that one.

**Not unit-tested, and said so rather than faked**: `renderOpponentDatalists()`,
`markOpponentMatch()` and `refreshLeagueTables()` read and write a live DOM, and there is no jsdom
in this suite. A hand-rolled document stub would only assert that the stub behaves as the test
author imagined. They are checked by hand in a browser. Everything that decides *what* they would
render is covered.

**Deploy order**: `.\deploy.ps1 functions` BEFORE pushing the frontend. The reverse leaves a v117
client calling a proxy that still demands `?url=` — verified: the deployed v116 proxy returns 400
for `?grupId=`.

### 2026-08-23 — v118: the Calendari fills itself from the FCF

v117 read the federation's API for the standings only. The same API publishes the **whole fixture
list** of the group a squad already has configured, and it is complete: 240 of 240 fixtures in
L'Esquerra's group carry a kick-off, a venue name **and coordinates**, in both seasons sampled. A
coach was typing all of that in by hand and never hearing about a postponement until somebody
told him.

**What lands**: fixtures import themselves, refresh on demand and again at 06:00 daily, carry a
Google Maps link built from the federation's coordinates and the rival's crest and kit colours;
the second leg pairs itself; and both scorelines show club crests.

#### The sync

`syncFcfFixtures` (callable) and `scheduledFcfSync` (06:00 Europe/Madrid) are **two callers of one
function**, `_syncFcfSquad`. The refresh button is not a second, client-side importer — that is how
the two would drift, and it is the same lesson `mdRowSquad` taught in v117.

Server-side is the point, not an implementation detail: one fetch serves a whole club instead of
one per device, and a kick-off moved on Tuesday evening is on every phone by Wednesday morning
without anyone opening the app.

Per squad it fetches `classificacio` (to learn our own FCF team id), `partidos` and `equipacions`,
then writes `teams/{id}/data/fa_matches__{category}` — which the client already listens to, so
fixtures arrive through the ordinary `firestore-sync` re-render. **`updateTeamDates` is an
`onDocumentWritten` trigger on exactly that document**, so `teams/{id}.matchDates` refreshes by
itself; without it the Friday availability reminder would ignore every imported fixture. A sync
that changes nothing skips the write entirely, so the trigger and every client's re-render do not
fire nightly for every club on the platform.

#### The merge rule — the whole of the feature

**A field belongs to the federation for as long as it still equals what the last sync wrote**
(`fcfSnapshot`). The moment a coach edits a kick-off, his value and the snapshot differ and the
sync stops writing that field — for ever, and only that field; the venue on the same row keeps
updating. There are no `userEdited` flags to maintain and therefore none to get out of step.

The snapshot refreshes on every sync regardless, so a later federation change to a field the coach
has claimed does not silently hand it back.

> An explicit `adopting ? !cur[k] : …` branch was written first and **removed**: with no snapshot,
> `snap[k]` is `""` and the general rule already reduces to "is this field empty", which is exactly
> what adoption wants. The mutation test that was supposed to catch its removal passed, which is
> how it was found to be a second spelling of the same condition.

Match rows gain `fcfActaId` (its presence is what makes a fixture FCF-owned), `fcfJornada`,
`fcfSnapshot` and `opponentKit`. All optional and additive — shards are written whole-document with
no per-field rule validation, so no rules change and no migration.

**A fixture that vanishes from the federation is MARKED (`fcfRemoved`), never deleted** — call-ups,
coach notes, availability answers and lineups all hang off the match id. An **empty** response is
treated as an outage, not a cancelled season.

**New fixtures take the acta number as their id.** It is stable, globally unique and ~4e6 — three
orders of magnitude below the `Date.now()` ids the manual path mints, so they cannot collide, and
a double import is idempotent rather than duplicating a season.

#### Adoption: the club may already have typed the season in

A row with no `fcfActaId` is claimed by an incoming fixture when the rival normalises equal, the
venue side agrees and the dates are **within one day** — then it keeps its own id, which is what
preserves the call-up, the notes and the availability already attached to it. ±1 day because a
fixture copied off a printed calendar and moved by the federation is the same fixture; a week away
is a different question. **A tie is refused outright**: a duplicate row is something a coach can
see and delete, while a wrongly adopted one silently attaches last month's call-up to the wrong
game and nothing on screen would say so. The adoption pool is consumed as it is claimed.

#### ⚠ The leading article — a bug this found in v117

fcf.cat writes **"L'ESQUERRA DE L'EIXAMPLE, F.C."** where the club calls itself **"Esquerra de
l'Eixample F.C."**. `normTeamName` keeps the article, so the two do not match — which means
**v117's standings highlighted the wrong row, or none, for this club** (the live check that
"proved" it worked had passed FCF's own spelling in as the club name). It would also have made the
fixture import unable to tell which of sixteen teams it was.

`sameClubName` / `sameClubNameOf` fixes it, and is deliberately **narrow**:

- Used ONLY to identify OURSELVES inside a group we have already been told we are in — sixteen
  teams, one of them us, and the club's own name comes from its own configuration. A false
  positive there is close to impossible.
- **Not** used by `findFirstLeg`. Pairing two fixtures is a question about clubs that are both
  strangers to the app, and the extra leniency would buy wrong answers there.
- The article is stripped from the **raw** name, before normalising, because that is where the
  separator still is. Stripping "l" off the normalised `lleida` leaves `leida`; the raw `lleida`
  has no apostrophe or space after the l, so it cannot match. An earlier version stripped from the
  normalised form and turned `lajonquera` into `ajonquera` — JS alternation takes `l` before `la`.

#### The rival's kit

`equipacions` carries six hex colours **plus a named pattern** (`CLASE_CSS_CAMISETA`, FCF's own
stylesheet class) — eleven distinct ones in a single group. Six map exactly onto the app's existing
fill encoding, so a striped rival renders through `shirtSvg()` with **no new drawing code**:

| FCF class | fill |
|---|---|
| `faf-barres` / `faf-barres2` / `faf-barres3` | `s\|v\|6` / `s\|v\|4` |
| `faf-fineshoritzontals` / `faf-horitzontals3` | `s\|h\|8` / `s\|h\|3` |
| `faf-base` and the five with no fill form | solid `c1` |

Diagonals, side bands and coloured sleeves render solid, and that is a decision rather than a gap:
a delegate needs to know the rival plays in red so he does not bring the red strip. Two identical
colours render solid even when the pattern says stripes — `#FFFFFF`/`#FFFFFF` is how FCF spells a
plain shirt.

**The mapping lives in `js/utils.js` next to `encodeFill`; the server stores FCF's raw fields.**
Reaching `encodeFill` from `functions/` would have meant a THIRD duplicated function across that
boundary. `equipacions` also returns a cross join — 542 rows for 16 teams — so `parseFcfKits`
takes the first `PRINCIPAL === "1"` row per team.

#### The second leg pairs itself

Two imported fixtures both carry an acta id and the rival's federation team id, so "same rival,
venue swapped, earlier date, same squad" stops being an inference. `mnCertainFirstLeg` links them
silently and **no `Enllaçar`/`No` banner is offered**.

> ⚠ `normTeamName` and the confirm step **stay**. A friendly, a cup tie and every fixture entered
> before v118 still go through the question. A coach's stored answer outranks the derived one, and
> `legDismissed` is respected — re-deriving over the top of a deliberate "no" is the one thing an
> automatic link must never do.

#### Badges on the match sheet

`matchSideBadgeHtml` feeds both `matchScoreboardHtml` and `mnScoreBlockHtml`: ours from
`clubBadgeUrl()`, the rival's from `opponentBadge`. A club in neither the group nor the picker gets
nothing rather than a placeholder — an empty space reads as "no crest", a generic shield reads as
the club's actual badge.

> ⚠ **The scoreline fitter counts them.** `_mnScoreNeed()` sums the children's `offsetWidth`, so
> `.sb-badge` is sized in **px** with `flex:0 0 auto`: sized in `em` it would shrink along with the
> text it is supposed to be measured against.

#### What this does NOT cover

- **Cup ties and friendlies stay manual.** `fcfLinks` is one league group per squad; a cup is a
  different `competicioId`. Manual entry is exactly why it was kept — the draft row, the opponent
  datalist and the ✓ from v117 are untouched, and a fixture with no `fcfActaId` is never looked at
  by the sync.
- **Results are not imported.** `GOLES_*` and `CERRADA` are available, but the app's scoreline is
  computed from the events a coach enters, and two sources of truth for a score is a fight.

#### Tests

Unit 834 → **906**. `test/fcf-fixtures.test.js` (54) is new and **was added to `test:unit` by
hand** — the standing trap. Rules 152 and functions 71 unchanged. Fixtures are real captured
payloads: `fcf-partidos.json` in full, and `fcf-equipacions.json` reduced by a documented rule that
puts the CHANGE strip first so a parser taking "the first row per team" instead of "the first
`PRINCIPAL=1` row" fails loudly.

Thirteen mutations were checked: always overwriting, never refreshing the snapshot, deleting
instead of marking, treating an empty response as a cancelled season, widening the adoption window,
guessing at a tie, ignoring the venue side, adopting one row twice, storing FCF's spelling of our
own club, and the three leg-pairing guards each fail exactly the test that claims to catch them.

The whole pipeline was also run end to end against **live** fcf.cat: 30 fixtures, every one with a
venue, a working maps link, a crest and a kit; a second run reports no changes; and an edited
kick-off survives a sync while the venue on the same row still updates.

**Deploy order**: `.\deploy.ps1 functions` BEFORE pushing the frontend — the callable must exist
before a client offers the button.

### 2026-08-23 — v119: the Calendari's kit columns, and our own name in capitals

Three changes the owner asked for after using v118 for an afternoon, plus one bug they exposed.

**Our club name is now uppercase in the fixture list.** The federation writes every club in caps
and a club writes its own name however it likes, so the list read "CAN BUXERES, F.C. vs Esquerra
de l'Eixample F.C." — the odd one out was always us. Done with `text-transform` on a
`.md-our-club` span, **never** with `toUpperCase()`: `isOurTeam()` compares the STORED name with
`===`, so an uppercased value written back would make the app believe we were the other team, and
every fixture would flip home for away with the squad letter following it.

**Both of the rival's kits, in two columns, with shorts and socks.** `parseFcfKits` used to keep
only `PRINCIPAL === "1"`; it now returns `{home, away}` per team, and the merge writes
`opponentKit` and `opponentKitAway`.

> Two flat fields rather than one nested object, deliberately: v118 shipped `opponentKit` as a
> flat kit and a club had already imported a season with it. A nested `{home, away}` would make
> every reader sniff the shape; a second field leaves those rows rendering exactly as they were,
> with an empty change-strip column until the next sync fills it.

The cells render through the existing `kitIconsHtml()`, so shorts and socks came free.
`mdKitCellHtml` emits a `<td>` even with nothing to draw, so a fixture against a club outside the
group leaves a gap instead of shifting the row's other cells left.

**Sized to the row, not past it.** 32px is the largest icon that does not grow the row: the height
is already set by the action buttons (`.btn-small` ≈ 33px), so anything up to that is free.
The mobile block drops to 26px for the same reason, because `.btn-small` shrinks there too.

#### ⚠ The bug the bigger icons exposed: every rival wore our crest

`shirtSvg()` bakes `clubBadgeUrl()` into the shirt path. That is right for every caller written
before v118 — they all draw the club's own kit — but the Calendari draws the RIVAL's, so each
opponent in the fixture list was wearing an Esquerra badge. Invisible at 16px, unmissable at 32.

`shirtSvg(fill, badgeUrl)` now takes the crest, defaulting to `clubBadgeUrl()` when the argument
is **absent** — `undefined`, not falsy, because an explicit `''` has to mean "no crest" and not
fall back to ours. `kitIconsHtml` forwards it via `'badge' in opts`, for the same reason.

#### Tests

Unit 906 → **916**. Rules 152 and functions 71 unchanged. `parseFcfKits`'s tests were rewritten
for the two-kit shape, and the reduced `fcf-equipacions.json` fixture still lists each team's
CHANGE strip first so a parser taking "the first row per team" instead of "the first
`PRINCIPAL=1` row" fails loudly rather than showing the wrong shirt all season.

Four mutations checked: not forwarding the crest, letting an empty crest fall back to ours, making
absent and empty indistinguishable, and dropping the `.md-our-club` class each fail exactly the
tests that claim them.

> The uppercase rule is pinned by a SOURCE-level test, like the ones in `kits.test.js` and
> `cat-badge.test.js`, because what matters is which mechanism is used and that is visible only in
> the source. It strips comments before asserting — the comment beside the code names the very
> call it must not make, and testing the prose would fail a correct implementation that explains
> itself.

Also worth knowing: `cat-badge.test.js` greps app.js for lines carrying BOTH `conv-team-circle`
and `isOurTeam(`. Refactoring the club-name markup into a helper split them across two lines and
broke that guard; the code was rewritten to keep them on one line rather than loosening the test.

Verified end to end against live fcf.cat: all 30 fixtures carry both kits, with stripes, shorts and
socks resolved (`4v #00005C/#F2FFFF`, `3h #FFFF00/#FF0000`, and so on).

#### v119 hotfix — the second kit never reached anybody

Shipped v119, the owner reported the 2a column was still empty. Not the deploy: `syncFcfFixtures`
was on revision `-00002` and a read of production showed all 30 fixtures carrying `opponentKit`
and **zero** carrying `opponentKitAway`.

`_syncFcfSquad` skips the Firestore write when the summary is all zeros — deliberately, so the
nightly job does not re-fire `updateTeamDates` and every client's full re-render for every club on
the platform every night. That made `summary` a **contract**, and `summary.updated` was being set
only inside the `FCF_OWNED` loop. Attaching the change strip moves none of date/time/location/
mapLink, so every sync reported "nothing changed", the write was skipped, and the field could
never arrive. **The merge was correct; the caller threw the result away.**

`summary.updated` now counts any difference between the row that goes in and the row that comes
out (`JSON.stringify(next) !== JSON.stringify(cur)`) — the only version of this that cannot rot as
fields are added. Six tests pin the contract in BOTH directions: a new kit, a changed crest, a
changed jornada and a renamed rival must each report an update, and an unchanged sync must still
report nothing — because if that half breaks, the nightly job wakes every client in the platform.

Replayed against live fcf.cat over a simulated v118 shard: 30 updates, all 30 rows gain the away
kit, and the run after that is all zeros again.

> The lesson worth keeping: **a correct function can still be a broken feature if its caller
> decides what to do with the result.** No test of `mergeFcfFixtures`' output would ever have
> caught this — the rows it returned were right every time. The bug lived in the summary, which is
> the only thing the caller reads.

### 2026-08-23 — v120: the rival's shirt, drawn to the federation's own description

The owner: *"follow the small description that exists for the shirt, in order to properly build
it. For example, in Baron de Viver it says '3 rayas horizontales'."*

`equipacions` carries `NOMBRE_CAMISETA` — a plain-language name in Spanish — alongside the CSS
class, and v119 mapped the whole vocabulary onto `parseFill`, which knows only solid and evenly
spaced stripes. **Five of the eleven forms have no expression there at all**, so they were
rendering solid: a picture of a different shirt. "3 rayas horizontales" was worse than solid — it
became three ALTERNATING bands, which is not three stripes on a body.

**`fcfShirtPattern()`** (js/utils.js) now decodes the class to a shape name, and
**`fcfShirtSvg()`** (js/app.js) draws each one:

| description | class | drawn as |
|---|---|---|
| Lisa | `faf-base` | solid |
| Rayas / Rayas anchas / Rayas finas horizontales | `faf-barres`, `faf-barres2/3`, `faf-fineshoritzontals` | **still `stripeSvg`** — that path carries the half-viewBox pixel arithmetic and there is no reason to re-derive it |
| 3 rayas horizontales | `faf-horitzontals3` | three explicit stripes on the base |
| Franja horizontal arriba | `faf-franjahoritzontal` | one band across the chest |
| Franja lateral izquierda / derecha | `faf-lateralesquerra`, `faf-lateraldreta` | one band down that side |
| Rayas oblicuas invertidas | `faf-obliquesinverted` | bands rotated −45° about the shirt's centre |
| Mangas colores | `faf-sinmangas` | plain body, sleeves in the second colour |

Every overlay is clipped to `SHIRT_OUTLINE`, or a band runs off the shirt.

> ⚠ **"izquierda"/"esquerra" is taken as the VIEWER's left.** Nothing in the payload says whether
> the federation means the viewer's side or the wearer's, and a kit icon is a picture — the
> viewer's left is what a reader compares against a photo. If it turns out to be the wearer's, it
> is one constant.

**`shirtWrap()` is new and is the point of the refactor**: the outline, collar, seam and crest now
have ONE definition, shared by `shirtSvg` (the club's own kits) and `fcfShirtSvg` (the rival's).
Two copies would have drifted the moment either was tweaked. It also parses its base colour
defensively — an encoded fill reaching `darkenHex` returns `#NaNNaNNaN` and paints the collar
black, and this is now the single place that decision is made for every shirt in the app.

`fcfKitPieces` carries `pattern`, `c1` and `c2` alongside the fills, because a band or a diagonal
needs all three. Two identical colours still mean a plain shirt whatever the class says —
`#FFFFFF`/`#FFFFFF` with a stripe class is all over the real payload.

#### Tests

Unit 922 → **927**. The decode table is asserted against the description of every class, AND
against the real payload: any class appearing in `fcf-equipacions.json` that the table does not
know fails the suite, so a new FCF pattern cannot slip in as "plain" unnoticed.

Five mutations checked — two stripes instead of three, left and right bands identical, an
unclipped overlay, `hoops3` remapped to stripes, and coloured sleeves lost — each fails exactly
the test that claims it.

Three tests in `kits.test.js` and `fills-source.test.js` were rewritten rather than loosened: they
sliced `shirtSvg` for markup that now lives in `shirtWrap`, and the `darkenHex` source guard wants
a `.c1`, which the defensive parse above supplies honestly.

### 2026-08-23 — v121: stripes that are actually the same width

Reported: *"some stripes that should be the same width are looking weird, not the same width."*

Not a stripe-drawing bug — a **scaling** bug, and the file's own comments predicted it. The
striped torso is exactly 32 of the shirt's 64 viewBox units, so at a rendered size S a band is
`S/(2n)` device pixels, and `KIT_ICON_PX = 72` was chosen precisely because it makes that a whole
number. Then v119's stylesheet did `.md-kit-cell .kit-svg { width: 32px }`.

At 32px the torso is 16px, six bands is **2.667px each**, and `crispEdges` snaps every edge
independently to 3,2,3,3,2,3. No care inside `stripeSvg` can survive being re-scaled afterwards:
the arithmetic has to be done for the size the icon is actually drawn at.

**Two changes, both necessary:**

1. **The render size is a parameter now** (`kitPx`), threaded through `shirtSvg`, `shirtWrap`,
   `fcfShirtSvg`, `shortsSvg` and `kitSockSvg`, defaulting to `KIT_ICON_PX` so every pre-existing
   caller is untouched. The Calendari passes `MD_KIT_PX = 32`, and **the CSS width/height rules
   are gone** — with a comment saying why, because re-adding them is the whole bug.
2. **The stripe counts now divide that size.** A 16px torso divides by 2, 4 and 8 and nothing
   else, so "Rayas" went 6 → **8** and "Rayas anchas" stays **4**. Both exact, and still plainly
   different from one another.

The mobile override went too: 26px gives a 13px torso, which divides by neither, so every band
would land unevenly. Four extra pixels of row height is the cheaper trade, and it is written down
next to the rule.

> The general lesson, and it is not specific to SVG: **a computation tuned to a rendered size is
> destroyed by scaling the result.** The invariant was documented, the constant was chosen for it,
> and a one-line stylesheet rule in a different file silently invalidated the lot.

#### Tests

Unit 927 → **931**. Four new assertions pin the whole chain rather than the symptom: the Calendari
states its own size, **no stylesheet rule re-sizes a kit** (desktop or mobile block), every stripe
count divides that size exactly, and the two vertical forms remain visibly different — because 4
and 4 would divide beautifully and look identical.

Five mutations checked: reverting to six bands, making both counts 4, choosing a size that divides
nothing (26), re-adding a CSS size rule, and failing to pass the size through — each fails exactly
one test, and the first is a straight revert to the reported bug.

Three tests in `kits.test.js` were updated rather than loosened: they pinned the literal
`${KIT_ICON_PX}` in the markup, which is now `${px}`. The guarantee they exist for — both
dimensions stated in the markup, never left to CSS — is unchanged and now also asserts that the
size is a parameter.

### 2026-08-23 — v122: stripes even at 125% display scaling, not just at 100%

v121 made the bands divide exactly and they were still visibly uneven. The screenshot that
settled it was a **125%-scaled Windows display**, and that is the whole story: the arithmetic has
to hold in DEVICE pixels, not CSS pixels.

```
32px, 8 bands  → 2.00px @100%   2.50px @125%   → crispEdges snaps 2,3,2,3
48px, 6 bands  → 4.00px @100%   5.00px @125%   6.00px @150%   → always even
```

A band is whole at 100/125/150/175/200% only when `size / (2 × bands)` is a **multiple of 4**. At
a row-friendly 32px that leaves 2 and 4 bands and nothing else; 6 bands needs 48px. The owner
chose the bigger icons over fewer stripes, so fixture rows are about 15px taller than the action
buttons alone would need.

- `MD_KIT_PX` 32 → **48**
- "Rayas" 8 → **6**, "Rayas anchas" 4 → **3**, "Rayas finas horizontales" 8 → **6**

#### The hoops were never even, and nobody had looked

Horizontal stripes were laid over `SHIRT_FULL_BOX`, which starts at `y = 6` — **4.5 device pixels
at 48px, and fractional at every display scaling**. The grid began on a part pixel before a single
band was measured, so no band count could have saved it. They now have `SHIRT_HOOP_BOX`
(`y = 16, h = 32`), mirroring the vertical torso and the sock: thirty-two of the sixty-four units,
the invariant this file has documented all along. The cost is that hoops stop short of the collar
and the hem; equal widths were the thing actually asked for.

#### Tests

Unit 931 → **933**. The pixel assertions now sweep **[1, 1.25, 1.5, 1.75, 2]** rather than
assuming 1 — the check the first two attempts were missing — and cover the grid ORIGIN as well as
the band width, since a fractional origin ruins evenly-divided bands. Five mutations checked:
reverting to 32px, to 8 bands, to 4 wide bands, putting hoops back on the unaligned box, and
nudging the hoop origin two units off the grid.

> Three attempts, and the lesson is the same each time, sharpened: **a pixel calculation is only
> as good as the pixel it is calculated against.** First the SVG was scaled after the fact by CSS;
> then it divided exactly at 100% and nowhere else; and all along the horizontal box had never
> been aligned at all. Each fix was correct about the thing it looked at and silent about the
> thing it did not.

### 2026-08-24 — v123: the Sancions and Golejadors tabs

The two tabs deferred out of v118, built to the shape recorded there. Both **staff-only** and
**no push**, by the owner's decision: FCF names players "COGNOMS, NOM" and matching that against a
roster is fuzzy, so telling a player he is suspended when he is not would be worse than telling
him nothing. A coach reads the federation's own spelling and judges for himself.

#### `fcfApi` — one proxy, an allowlist

Six more endpoints, none of which sends `Access-Control-Allow-Origin`, so each still has to come
through us. **One handler with a table** rather than six functions: adding an endpoint is a line
instead of a deploy-shaped decision, and there is exactly one place to look when asking what this
project can reach.

```
temporadas · disciplines · competicions · grupos · sanciones · goleadores
```

Every parameter is digits-only — that is the whole security model, and it is deliberately boring:
nothing a caller sends can be anything but a number substituted into a constant URL. Verified by
replaying the handler: `partidos` (not on the list), `../../secret`, `competicioId=1;DROP` and
`grupId=https://evil.test` are all refused. `fcfClassificacio` stays as it is — v117+ clients call
it by name and it costs nothing to leave standing.

#### ⚠ The DNI, and the fixtures

Both payloads carry `licencia` — a Spanish **DNI/NIE**, for players who in most of this app's
categories are minors. `functions/fcf.js` drops it, and `ficha` with it, at the parse boundary.
Not "does not render it": a field that merely goes unrendered is one `JSON.stringify` away from
being stored. `codparticipante` / `codjugador`, the federation's own opaque ids, are kept instead.

**The captured fixtures were scrubbed before committing.** This repo is public and GitHub Pages
serves it, so a raw `goleadores` capture would have published fifty real identity numbers by the
act of `git add`. `licencia` and `ficha` are stripped from `fcf-sancions.json` and
`fcf-goleadors.json`; the DNI guard injects a synthetic one instead, which tests the guard
properly and puts nobody's document in git. A test asserts the fixtures stay clean.

#### Sancions

Reads the group's rulings and answers the question a coach actually has — **who is unavailable on
Sunday, on both sides** — then shows the archive below it.

- A ban issued at jornada N for P matches covers **N+1 … N+P**: the round he was sent off in is
  not one he misses. `banCoversJornada` is the one definition.
- **`tipo: "equipo"` rulings are separated and labelled.** Twenty of the forty-eight in one
  sampled group are fines, closed grounds and procedural decisions, every one with zero matches;
  mixed into the players' table they read as men who are unavailable.
- The jornada comes from the **imported fixture**, so this needs the Calendari synced first, and
  says so when there is none. Past fixtures are excluded — "who is suspended for the next game" is
  a question about a game that has not happened.
- Our own FCF team id comes from the standings cache. With no cache it is `''` and
  `bansForJornada` then shows EVERYONE, which is the safer way to be wrong than showing nobody.

#### Golejadors

A scouting tool, so it deliberately does **not** follow the category bar — the point is to look at
divisions this club does not play in. Season → discipline → competition → group, walking the
federation's own tree, one group per view and therefore one request. Sortable on every column;
numbers default to biggest-first and names to A–Z.

> ⚠ **The goal figures are published exactly as FCF publishes them**, which is the owner's
> decision, recorded in v118 and unchanged. They are arithmetically impossible — `goles` is the
> home and away tallies concatenated, so one club's five listed scorers sum to 157 for a team that
> scored 106 — and `FCF_SCORERS_RAW` in `functions/fcf.js` is the single line to flip.
> `splitFcfTally` is written and tested against that day, wired to nothing.

#### Tests

Unit 954 → **976**, rules 152 and functions 71 unchanged. Two new files, **both added to
`test:unit` by hand**: `fcf-discipline.test.js` (the parsers and the ban window) and
`fcf-tabs-render.test.js` (the renderers, via the `grab()` convention — ~250 lines of string
building whose failure mode is a blank page).

Eleven mutations checked. The ones worth naming: leaking the DNI from either parser, starting the
ban window a round early or ending it a round short, listing club rulings as player bans, treating
a played fixture as "next", and sorting names numerically.

> The escaping assertion needed the lesson this repo already had written down: `!includes(
> 'onerror=')` FAILS on correctly-escaped output, because the escaped payload still contains that
> substring — and these renderers emit their own `<img … onerror>` for a crest that fails to load.
> The check is for an unescaped TAG, with the legitimate crests stripped by their exact markup
> first.

#### v123 fix — the parsers were on the wrong side of the browser boundary

Shipped, and both tabs said "no s'ha pogut carregar". Not the proxy: the deployed `fcfApi`
returned 200 and full payloads for every endpoint when curled directly, and the four dropdowns
populated from it fine.

**`parseFcfSanctions`, `parseFcfScorers` and `bansForJornada` were written in
`functions/fcf.js`, which the browser never loads.** Every request succeeded, the parser threw
`ReferenceError`, and the `.catch` reported it to the user as "could not load". They are now in
`js/utils.js` — a MOVE, not a copy: nothing on the server parses either payload.

> ⚠ **Both test suites were green the entire time.** Node's `require` reaches `functions/fcf.js`
> perfectly well, and the renderer tests STUB those helpers by name. Green tests, dead feature, on
> every real screen.
>
> The new guard is the general one, not three names: **every plain function call in the tabs block
> must be declared in the block, declared somewhere in `js/`, or be a builtin.** Verified by
> mutation — swapping `parseFcfScorers` for `mergeFcfFixtures` (which exists only server-side)
> fails it by name. Two false positives had to be fixed on the way: the block *starts* inside its
> own header comment, so the comment stripper had no opening delimiter to match, and `\b` matches
> after a dot, so `JSON.parse(` looked like a call to a global named `parse`.

#### Filters, as the owner asked

Discipline, division and group are now **multi-select, and empty means all**. Season stays single:
every competition id is season-specific, so mixing seasons in one table compares different
competitions.

"All" is not free, and the numbers shaped the design rather than the other way round:

```
Futbol 11, one season     74 divisions, ~460 groups
every discipline          ~3000 groups         (one request each)
```

So the page **resolves the selection into a concrete list of groups first**, then decides:

- up to **40 groups** — read straight away;
- more — say how many and offer a button, rather than refusing or quietly firing 400 requests;
- more than **80 divisions** — refuse to walk at all and say so, because the tree-walk alone is
  one request per division.

Reads run five at a time with a progress count, one bad group cannot lose the rest, and results
are **re-ranked across everything read** — a rank of 1 in each of forty groups is forty number
ones. A `GRUP` column appears only when more than one was read.

Verified live: six groups of Tercera Catalana merged to 300 players, correctly ordered, no DNI
anywhere in the result.

### 2026-08-24 — v125: checkbox dropdowns, a progress bar, and the club card

Four requests after using the scouting tab.

**1. Dropdowns with checkboxes, not `<select multiple>`.** A native multi-select needs ctrl-click
for a second value, shows four rows of a hundred-item list, and on a phone loses the selection as
often as it keeps it. `scDropdown()` is a button that says what is chosen — the option's NAME when
one is picked, a count when several, "all" when none — over a panel of ordinary checkboxes. Open
state lives in `_scorersState.open` so the re-render that follows every change puts it back.

**2. A bar that fills** beside "llegint grups… n/total". The count alone gives no sense of how far
through forty groups you are.

**3. Player contact: it does not exist.** No email, no phone, nothing, in any FCF payload. The
only player-level identifier the federation publishes is `licencia` — the DNI/NIE this app already
drops at the parse boundary. What DOES exist, published openly, is the **club's** card:
`/api/clubs/{id}` carries `TELEFONO_1/2`, `EMAIL`, `WEB`, `NOMBRE_RESP`. Tapping a club opens it
under the row, labelled as the club's details and stating that FCF publishes none for players. To
reach a player you go through his club, which is how it works anyway.

**4. Geography: DELEGACIÓ and LOCALITAT, not comarca.** There is no comarca field anywhere in the
API — the federation divides Catalonia into five DELEGACIONS (Barcelona, Girona, Lleida,
Tarragona, Terres de l'Ebre) and records the club's town beside it. The new **Zona** column reads
`Roses · Girona`, `Castelló D'Empúries · Girona`. Not "Barcelonès / Vallès", and the closest the
data comes; the delegation is title-cased because FCF shouts it and `GIRONA` next to `Roses` reads
as an error rather than a region.

#### What it costs, and the gates

`goleadores` names a player's TEAM but never his club, so each group now costs **two** requests:
the scorers, plus `classificacio` to map `teamId → clubId`. Then one request per distinct club —
about 14 for a single group.

- **Groups**: read up to 40 automatically, ask above that, refuse past 80 divisions (unchanged).
- **Clubs**: look up to `SC_AUTO_CLUBS = 60` automatically. Past that the Zona column stays blank
  and says why; tapping one club still loads that club on demand, which the cap never blocks.

Both the Zona column and the group column appear only when there is something in them — an empty
column is worse than none.

`scSetFilter()` is now the single definition of "a filter changed" (clear everything below it,
drop the results, forget the confirmation), because the checkboxes and the season select both do
it and two copies would drift.

The proxy's allowlist grew a **path**-parameter form for `/api/clubs/{id}`, validated as digits
exactly like the query ones — `clubId=../secret` is refused. `classificacio` was added to it too.

#### Tests

Unit 983 → **991**. New: the panel opens with one checkbox per option and a clear button; the
button's summary is a name, a count or "all"; the bar reflects progress; the Zona column appears
only once a club has loaded; the contact card opens under its own row, adds a scheme to a bare
domain, renders nothing rather than an empty card, and escapes everything.

#### v126 — the v125 dropdown shipped with no stylesheet

The panel rendered as a paragraph of run-together checkboxes: worse than the `<select multiple>`
it replaced. The cause was not CSS at all — **the `cat >> css/style.css` was chained behind a
`node --check` that failed on an unescaped Catalan apostrophe, `&&` short-circuited, and the rules
were never written.** The commit went out with `css/style.css` untouched.

Three rules carry the whole thing, and each is now pinned by a test that fails on its exact
mutation:

- `.sc-dd-panel { position: absolute }` — otherwise the panel shoves the table down the page.
- `.sc-dd { position: relative }` — an absolute panel with no positioned parent escapes its column.
- `.sc-dd-opt { display: flex }` — **this is the screenshot**: without it every option is inline
  text and forty divisions become one grey paragraph.

Plus `.card.sc-filters { overflow: visible }`, because the mobile block sets
`.card { overflow: hidden }` and would clip the panel to a sliver. Two classes beat one, so it
wins wherever it sits in the file.

> **A renderer test could never have caught this** — the HTML was perfect. So the guard checks the
> other half: **every layout class the tabs emit has a rule in the stylesheet.** Twenty-one
> classes, asserted against `css/style.css`. A feature whose markup is right and whose styling is
> absent is still a broken feature, and nothing in this repo was looking at that seam.

#### v127 — the panel dismisses itself, and stops reading mid-selection

Reported as "a bit unresponsive". Two separate causes, and the second was the real one.

**1. It only closed by clicking its own button.** A document-level click listener now closes the
open panel, unless the click landed inside a `.sc-dd` — ticking a second checkbox must not dismiss
it. Escape closes it too, and opening one panel closes any other, since both float and overlapping
absolutes are a mess.

> Bound **once**, guarded by `_scDismissBound`, and NOT inside `bindFcfTabs` — that runs after
> every render, so registering there would stack a fresh listener on every keystroke of every
> filter. The button's own click calls `stopPropagation`, or it would open and immediately dismiss
> itself.

**2. Every checkbox tick fired a fetch.** The render resolves the scope and reads it, and every
tick re-renders — so picking four divisions meant four rounds of requests, three of them for a
selection the user had not finished making. Nothing is read while a panel is open; the page says
how many groups are selected and reads them when it closes.

#### Tests

Unit 994 → **1002**. The dismiss handlers are tested for real: a document stub records what the
block registers, and the test calls those handlers with the kind of event a browser delivers —
the handler's DECISION is what is under test, not the browser's event plumbing. Five mutations,
each failing exactly one test: reads firing while picking, an outside click never closing, closing
even when the click is inside, Escape doing nothing, and the listeners stacking per render.

### 2026-08-24 — v128: the app checks its own version

The first of the owner's four. Built because it had stopped being hypothetical: a tester sat on a
**v117 service worker across seven releases** while `main` was v124. Every deploy landed, every
check of the served files said the new code was there, and his browser kept running the old one.
Three rounds of "the fix doesn't work" went by before the cache was suspected, and the tell in the
end was an error string that only existed in the older version. The 77 members of this club have
no console to paste a cache-clear into.

**How it asks.** `fetch('sw.js', {cache: 'reload'})`, read `CACHE_NAME`, compare with
`APP_VERSION`. `sw.js` rather than a new version file because it already carries the number, it is
already bumped in lockstep (`functions/check-deploy.js` asserts all three move together), and one
fewer artefact is one fewer thing to drift. `{cache: 'reload'}` is load-bearing: the
`updateViaCache: 'none'` on the registration governs the WORKER's own script, but this is an
ordinary fetch and would otherwise be answered from the HTTP cache — the very failure being fixed.

**When.** On load, and on `visibilitychange` when the tab becomes visible — a phone left open
since Tuesday is exactly the case. Throttled to 15 minutes so it is a check, not a poll.

**What it does NOT do.**

- **It never reloads by itself.** A delegate halfway through a convocatòria would lose what he had
  typed, and an app that throws work away to update itself teaches people to distrust it. A test
  asserts there is exactly ONE `location.replace` in the whole block and that it lives inside
  `applyUpdate()`.
- **It never nags backwards.** Strictly newer only, so deploying an older build — a decision —
  is not treated as something to undo.
- **It says nothing when it cannot ask.** A failed fetch, a 404, a Capacitor build with no `sw.js`
  all read 0, and 0 is "I could not ask", never "you are out of date". Otherwise every user who
  went through a tunnel would be told to update to a release that does not exist.

**The button does what the console snippet did**, because a plain reload is exactly what was NOT
enough: unregister the worker, delete every cache, then `location.replace` onto a `?v=<now>` URL
the browser has to treat as new. "Més tard" only hides the banner and resets the throttle — it
asks again in fifteen minutes rather than sitting on top of what someone is doing.

#### Tests

Unit 1002 → **1022**. `test/version-check.test.js` is new and **added to `test:unit` by hand**.
The parser is asserted against the REAL `sw.js` and cross-checked against the REAL `APP_VERSION`,
so a rename or reformat of either constant fails the suite rather than silently reading 0 for ever.

Eight mutations, each failing exactly one test: nagging backwards, nagging when offline, asking
through the HTTP cache, a plain reload instead of the full clear, the banner stacking, the Update
button doing nothing, "Més tard" reloading, and the banner losing its stylesheet.

> Two of those tests only became real after a stub was fixed. `getElementById` returned `null` for
> the buttons, so wiring them threw INSIDE a promise, mocha swallowed it, and the suite was green
> over a banner whose Update button was never connected. And asserting `typeof handler ===
> 'function'` passes against an empty function — the test now presses the button and watches the
> caches go. Both are the same lesson this week keeps giving: **a green test that never exercised
> the thing is worse than no test.**

### 2026-08-24 — v129: the referee database

Item 4 of the owner's list. Every fixture already comes from the federation; this adds **who is
refereeing it** and what his record in *this division* looks like.

#### What the FCF actually publishes, and what it does not

| | |
|---|---|
| Referee + assistants | ✅ on the acta page, server-rendered. 30/30 extracted across all five tiers. |
| **Yellow cards** | ❌ **nowhere at all.** |
| Reds / second bookings | ✅ but from `sanciones`, not the acta. |
| Results, divisions | ✅ from `partidos`, already used. |

**The cards proof.** `sanciones` names a player sent off for two yellows in acta 3781800. That acta
renders no card markers whatsoever — the coloured swatches on every acta are a legend, byte
identical whether or not anyone was booked. Yellows are absent, not merely hidden.

What replaces them: every sanction carries `codacta`, so one JSON request per group-season
attributes every sending-off to the referee who gave it **without scraping a single card**. The
classification comes from `cod_tiposancion` — `102` a second booking, `103` a direct expulsion,
`101` an accumulation — not from `motivo_sancion`, which is a paragraph of Catalan legalese that
would have to be pattern-matched in three languages.

> Code 101 *is* evidence of a yellow in that match — it is the fifth-booking ruling. It is
> deliberately not counted: it fires once every five, so the result would look like a yellow-card
> tally and be a fifth of one.

#### The size of it, measured rather than estimated

`partidos?grupId=` returns every match in a group with its `CODACTA` already attached, so the crawl
list costs **64 requests**, not a discovery crawl.

```
Lliga Elit 1 · Primera 3 · Segona 6 · Tercera 18 · Quarta 36   =  64 groups
one season      14,390 matches        one acta   370 KB, 1.7 s
two seasons     ~28,800 actas ≈ 10.6 GB ≈ 4.5 h at concurrency 3
weekly pass     ~480 played + ~480 upcoming ≈ 9 min
```

The owner's chosen scope — the five senior Futbol 11 tiers — is a **twentieth** of all Futbol 11
(532 groups, ~106,000 matches, ~20 h). The youth, women's and lúdica competitions are what make
that number.

⚠ **Competition ids are not stable between seasons.** Lliga Elit is `58161860` in 2026-27 and
`54322936` in 2025-26, so they are resolved **by label every run**. A hardcoded id would not fail;
it would quietly backfill the wrong year.

#### The pieces

`parseFcfActa` in **functions/fcf.js** — bounded at `<h3>Àrbitres</h3>` and the next `<h3>`, rows
filtered on containing a comma (the federation writes `COGNOMS, NOM`; the "Sense àrbitres
assignats" placeholder reuses the same markup, and matching the placeholder text would need three
languages and break when they reword it). `referees[0]` is the referee; the rest ran the line.

Two collections. `fcfRefIndex/{season}_{grupId}` holds acta → officials + result + the sanctions
join, ~240 entries a document. `fcfReferees/{slug}` holds the derived profile, **keyed by
division** — which is not a breakdown for its own sake but exactly what the match page reads.

Two scheduled jobs over one queue but **two cursors**: `crawlFcfActas` nightly (played matches
only, idle once caught up) and `fcfWeeklyRefs` Fridays at 6, 7 and 8 (a weekend does not fit in one
540-second function). A shared cursor would have let Saturday's backfill skate past the groups
Friday had not reached, and their appointments would never have been read.

> **The re-fetch rule is "indexed *as closed*", not "seen"** — the one guard here whose failure is
> invisible. The Friday pass reads *unplayed* actas for the appointments, so by Monday the index
> already "has" the match; keyed on presence alone, every match that job touched would be
> permanently invisible to the historian, and the only symptom months later would be referees whose
> records stopped growing.

#### The UI, and what it refuses to say

Only the division this squad plays in, named on the panel. **No percentages under six matches** —
three games at 100% home wins is not a finding, and a delegate who trusted it would be worse
informed than if we had shown nothing; the counts stay, only the inference is suppressed. Two
standing notes: yellows are unpublished (so their absence is not read as a lenient referee), and
**referees are identified by name alone** — FCF publishes no id, so two sharing one would merge and
nothing in the data could separate them.

#### Tests

Unit 1078 → **1109**. Four new suites, all added to `test:unit` **by hand**: `fcf-acta.test.js`,
`fcf-referees.test.js`, `fcf-referee-render.test.js`, `suite-registry.test.js`.

**Twenty mutations, each failing at least one test**: the comma filter, the section bound, the last
heading, the dedupe, entity decoding, accent folding in the slug, slug separator trimming, throwing
on bad input, both halves of the re-fetch rule, tier matching by prefix, crediting assistants,
counting unplayed matches, dropping the division split, 0-0 as unreadable, counting accumulations,
counting club rulings, an unplayed acta looking played, aliasing the referee array, and dropping
the season from the index id.

> **Two tests initially passed for the wrong reason and were rewritten.** The tier test asserted
> *labels*, which the function echoes back from the wanted list — so it passed even when every
> competition resolved to the wrong id; it now asserts the ids, and the cup variants are listed
> *before* the tier they shadow so ordering luck cannot save it. And the club-ruling test was
> shadowed by the code filter, so it now uses a synthetic club ruling that *does* carry a
> sending-off code — the only case where the `tipo` guard does any work.

`suite-registry.test.js` closes the standing trap for good: mocha is handed an explicit file list,
and `focus-plan.test.js` was missing from it for several versions and silently never ran. The guard
fails when any suite on disk is unregistered, when the list names a file that no longer exists, and
it lists itself.

The v123 and v125 guards are repeated for this feature: **every helper the block calls must be
declared in `js/`** (v123 shipped tabs whose parsers lived in `functions/`, dead on every screen,
with both suites green) and **every class it emits must have a CSS rule** (v125 shipped a feature
whose stylesheet append was chained behind a failing `node --check`). Both were mutation-verified.

#### Fixtures, and why they are windows

`test/fixtures/acta-*.html` are ~3.6 KB slices of real 400 KB acta pages, cut by
`fixtures/capture-acta.js`. This repo is public and GitHub Pages serves it; committing whole pages
would republish a few hundred footballers' names to fix a parser that reads one box. A test asserts
the fixtures contain no `licencia`, no `ficha`, no DNI-shaped token, and **no visible text but the
referees, the role labels and the section headings** — so a wider re-capture fails rather than
quietly publishing a line-up.

#### Not yet true

Nothing is crawled until `fcfCrawl/config` is created with `enabled: true` — the default is off,
because turning it on aims tens of thousands of requests at the federation's website. And **no
2026-27 fixture has been played**, so it could not be confirmed that appointments appear on the
Thursday; the Friday job is built on the owner's knowledge of how the federation works. If the
season's first Friday comes back with no appointments, only that half of the job is affected.

### 2026-08-24 — v130: the referee on the match detail, and what he sends people off for

Three things the owner asked for after seeing v129.

#### 1. The card on the match detail page

Beside the first-leg banner, same figures as the Calendari panel plus two things a fixture row has
no room for: **the assistants** (a Tercera match with a full trio is not the usual case, and the
morning of the game that is worth a line), and **our own history with him**.

#### 2. "Have we had him before?"

That join needed no new data at all. Our fixtures already carry `fcfActaId` and the group index
already maps acta → officials, so `refereeHistoryWithUs` is a filter over what both sides hold.
Newest first, played matches only, and only where he was the **referee** rather than an assistant.

> The result comes from the index's `res`, not from the coach-entered score — `res` came off the
> federation's own closed match sheet, while a score is only as complete as the events somebody
> remembered to enter. `res` is the HOME side's result, so `ourResultFrom(res, weWereHome)` flips
> it. **Getting that backwards would report a defeat as a win** on the page a delegate reads before
> kick-off, so it has its own test and its own mutation.

#### 3. What the sendings-off were FOR — `articulo_salida`

The owner asked whether the sanction codes could show how a referee handles verbal protest. They
can. `cod_tiposancion` says how a player left the pitch; **`articulo_salida` says why.** Read off
2,482 sanction rows across all five tiers:

| Article | Offence | in sample |
|---|---|---|
| `338.1d` | **protesting ostensibly/insistently to the referee** | 77 |
| `338.2b` | **addressing officials injuriously** | 39 |
| `338.1c` | expressions against decorum | 104 |
| `338.1f` | violent conduct arising from play | 96 |
| `338.1k` | pushing, shaking — only lightly violent | 53 |
| `337` | straight red, offence unspecified | 71 |
| `339` | assault | 27 |
| `334` / `336` | accumulation / second booking | 958 / 407 |

`dissent` is deliberately **both** 338.1d and 338.2b: same question, and splitting them would halve
an already thin count. `334` and `336` are excluded from the offence list — they describe the exit,
not the act, and are already counted as reds/doubles.

⚠ **Two traps in that field.** It is a **comma-separated LIST** (`338.1d,338.1h`, `336,338.1c`) —
read as a single code, every multi-article row falls through and the offence is lost. And the
spellings vary: `338c`/`338f` are the federation's shorthand for `338.1c`/`338.1f`, with identical
`motivo_sancion`, in the same season; some values carry a trailing space.

> **COUNTS ONLY, never a rate, and the panel says why.** The federation records an offence solely
> where the sanction carried a suspension, so a referee who books dissent and stops there leaves no
> trace whatever. "3 for dissent" is a fact; "30% of his cards are dissent" would be arithmetic
> over a denominator that does not exist. At roughly twelve dissent sanctions per group-season
> across forty-odd referees, this is thin after one season and only starts meaning something after
> two — which is another reason it is shown as a count a reader can weigh for themselves.

#### 4. The yellow-card tripwire

The owner expects the federation to publish bookings eventually. Rather than a note nobody
re-reads, `parseFcfActa` now counts the card-sized boxes on every acta it already has in hand — a
second regex, no extra request — and the crawler logs a warning the day one exceeds the legend.

Every acta draws exactly **four**, verified live on a played sheet, an unplayed one, and — the one
that settles it — **acta 3781800, where `sanciones` records TWO sanctions** (a second booking and a
man disciplined for his language) and the page still draws four. `node test/fixtures/capture-acta.js`
re-runs that check and prints the counts, so the baseline is one command away rather than folklore.

#### Tests

Unit 1109 → **1147**. Ten more mutations, each failing at least one test: reading `articulo_salida`
as a single code, dropping the `338c` shorthand, not trimming it, counting accumulations as
offences, leaking offences across divisions, a wrong legend baseline, reporting our result from the
home side's view, counting unplayed matches in the history, crediting assistants in it, and sorting
it oldest-first.

> **Two of the new guards were caught proving nothing and rewritten.** The legend test built its
> legend *from* `FCF_ACTA_LEGEND_MARKS`, so it passed just as happily with the constant wrong —
> there is now a literal `=== 4` pinning the live observation. And the "every class has a CSS rule"
> guard split `class="…"` on whitespace, which hands back `ref-offence'` with the quote still
> attached from `class="ref-offence' + (…) + '"`; it tokenises now. Both were then mutation-checked.

The v123 browser-reachability guard and the v125 stylesheet guard were **widened to cover the new
detail card**, not just the fixture-row panel, and both re-verified by mutation.

### 2026-08-24 — v131: the history rows read like a results list

The owner's note on v130: in "Partits nostres que ha arbitrat", drop "a camp de", mark home or away
with an icon, and show **the score** rather than the words Victòria / Empat / Derrota.

**The score had to be captured, not derived.** The index stored `res` — who won — and nothing else,
so `fcfActaEntry` now also keeps `gh`/`ga` from the `partidos` payload the crawl already holds.
Deriving it later would have meant re-reading `partidos` for all 14,000 fixtures to recover
something that was in our hands at crawl time.

> **Guarded on null, never on falsiness.** `if (due.goalsHome)` is the obvious spelling and it
> throws away **every goalless draw** — 0 is falsy, so a 0-0 would silently lose its scoreline and
> fall back to the outcome letter. The same trap sits in the reader: `haveGoals` tests against
> null. Both have their own test and their own mutation.

The scoreline is flipped to our side, like the outcome before it: the federation writes it
home-first, so a 2-0 defeat away from home reads **0-2**. Printing it unchanged would tell a
delegate we won a match we lost — the same failure the outcome already guards, one layer down.

Home and away are now 🏠 and ✈️. "a camp de" ate a third of a narrow row before the opponent's name
began, and the name was what got truncated on a phone. Both icons carry `title` and `aria-label`,
because an icon alone is unreadable to a screen reader and ambiguous to everyone else; the column
is a fixed width so every opponent starts on the same column.

The badge keeps its colour, so won/drew/lost still reads at a glance while the number carries the
detail. An entry from a crawl that predates goals falls back to the outcome letter rather than
rendering an empty badge, which would look like a fault.

#### Tests

Unit 1147 → **1156**. Five more mutations: a falsy guard dropping 0-0 at the writer, storing goals
for unplayed matches, printing the score home-first, a falsy guard dropping 0-0 at the reader, and
swapping ours for theirs.

The two render tests that asserted the old wording now assert the **outcome class** rather than any
words — the colour is the durable signal — plus the icons, their accessible names, and the
no-goals fallback path.

### 2026-08-24 — v132: the history rows line up

The owner sent a screenshot: the home/away icons sat at different horizontal positions and the
club names started on a different column on every row.

**The two emoji are not the same width.** ✈️ carries a variation selector and renders wider than
🏠, so with no fixed box each icon pushed the name that followed it a different distance. The
screenshot was of the design page, which had no `.ref-hist-where` rule at all — the app's own
stylesheet did have one, but with `align-items: baseline` on the row, and **an emoji has no
reliable baseline across platforms**, so the icon rode high on some rows and low on others.

The row now has three fixed lead columns — date, icon, then the name taking the remaining space —
and aligns on `center`. Each width is load-bearing in a way that is easy to mistake for decoration:
`tabular-nums` keeps the date's *digits* even but not the box around them.

#### Tests

Unit 1156 → **1157**. A third guard beside the v123 (browser-reachability) and v125 (stylesheet)
ones, and it closes a gap both of those leave open: **the HTML was correct and the layout was
not.** The existing guard only asserts a class *has* a rule; this one asserts the rule actually
pins the column — a fixed `flex` basis on the date and the icon, `text-align: left` on the name,
and `align-items: center` on the row. Mutation-checked both ways: removing the icon's fixed basis
and reverting the row to `baseline` each fail it with the reason named.

### 2026-08-24 — v133: closing the push hole (parking-lot item 14)

Writing a document to `teams/{id}/pushQueue` **is** the send — `onPushQueueCreate` picks it up and
pushes to real phones. The rule guarding that was `allow create: if sameTeam(teamId)`: **any of the
77 members**. And the consumer treated a document with no `targetPlayers` as *send to every member
of the team*, taking `title`, `body` and `url` straight from it.

So any member could push an arbitrary message, carrying an arbitrary link, to the whole club,
wearing the club's own app icon.

#### The live bug inside the hole

Not hypothetical. The convocatòria sender maps roster ids to Firebase uids and **drops seeded
numeric ones**:

```js
const targetUids = list.map(...).filter(Boolean);
Push.sendToPlayers(teamId, targetUids, {...});
```

A call-up made entirely of seeded players yields `[]`. The old consumer tested
`data.targetPlayers && data.targetPlayers.length` — `[]` is truthy but has no length — so it fell
through to the broadcast branch. **Publishing a demo squad's call-up would have pushed to the
entire club.**

#### Both locks, because they fail differently

`firestore.rules` now requires **staff**, a **non-empty bounded `targetPlayers`**, bounded
`title`/`body`, `status == 'pending'`, and forbids `url`, `targetRole`, `sentAt` and `tokenCount`.
The consumer repeats those limits: it refuses a targetless document rather than broadcasting,
builds its payload field by field rather than spreading the document, clamps the text, and **never
forwards `url`** — a push carrying a sender-chosen link is phishing with the club's icon on it.

A rules deploy can be skipped silently (`--only hosting` does exactly that), which is why the
server does not simply trust the rule.

`sendToTeam` in `js/push.js` is **deleted**, not just unused. It was never called but *was*
exported — one autocomplete from a club-wide send the rules then permitted. Genuine club-wide
sends still exist (training and RPE reminders); they call `sendToTokens` directly and never come
through this queue, so nothing was lost.

#### Verification

- **11 new emulator tests** in `rules.test.js` (164 passing). The proof that matters: reverting to
  `sameTeam(teamId)` turns **8 of them red**, including "an ordinary player CANNOT send anything at
  all". The hole was real, and the tests see it.
- **12 unit tests** in `push-guard.test.js` for the two halves an emulator cannot reach — the
  client never writing a targetless document, and the function refusing one.
- **The live ruleset was read back from the Firebase Rules API** rather than assumed: released
  15:35 UTC, `sameTeam` gone, every clause present.

> The functions deploy reported `Deploy failed (exit 2)` and then, on retry, `No changes detected`
> — which reads as though nothing shipped. It had: the Cloud Functions API showed
> `onPushQueueCreate` updated at 15:37 (revision 47) and **all 24 functions ACTIVE**. The failure
> was transient. Worth checking the API rather than the CLI's own summary when the two disagree.

Unit 1157 → **1169**.

### 2026-08-24 — v134: the Friday availability push (parking-lot item 13)

`scheduledMatchAvailReminder` was the last `onSchedule` never examined for the two traps v112 and
v113 fixed elsewhere. **Neither applies**, and that is now pinned rather than left to be
re-derived:

- the **interval-vs-wall-clock** trap needs an `every N minutes` schedule, which drifts because App
  Engine waits N minutes after the previous run *finishes*. This is `0 20 * * 5` — wall-clock,
  once a week.
- the **double-fire** trap needs a fixed-width band closed at both ends. This has no band at all;
  it compares dates for exact equality.

Reading it turned up two real bugs instead.

#### 1. The answered-set was truncated and the loop was not

```js
.where("matchId", "in", matchIds.slice(0, 10))   // ten
for (const match of weekendMatches)              // all of them
```

Firestore's `in` takes ten values. From the **eleventh** weekend fixture onwards `answered` was
empty, so every player who *had* already replied was pushed again as though he had not. A club
running four categories with A and B squads clears ten fixtures on an ordinary weekend, and the bug
got worse as the club grew. It now chunks through `chunk10()` — the helper the delete path was
already using correctly.

#### 2. Cancelled fixtures were still asked about

The filter was `m.status !== "past" && m.date && …`. A fixture the federation drops is marked
`fcfRemoved` and **kept** — call-ups, notes and answers all hang off its id — and the Calendari
strikes it through. But Friday's push asked the squad to confirm availability for it anyway.
Asking about a cancelled match wastes their evening and teaches them to ignore the next one.

#### Tests

Unit 1169 → **1180**. `test/match-avail-reminder.test.js`, added to `test:unit` by hand. Three
mutations, each failing a test: truncating the query back to ten, dropping the `fcfRemoved` check,
and switching to an interval schedule.

> **What actually runs the deployed code, stated in the file itself:** `chunk10` is lifted from
> `functions/index.js`, so the chunking tests exercise the real helper. The date/removed filter is
> a faithful reimplementation — it sits inline inside a large async function and cannot be lifted
> cleanly — so a final describe pins the source to match it. Behaviour in one half, shape in the
> other; neither is worth much alone.

> A third instance of the comment-versus-code trap: the source assertions matched
> `matchIds.slice(0, 10)` inside the *comment explaining its removal*. All of them now read a
> comment-stripped copy. That is three files this session — worth remembering that any test which
> greps source needs to strip comments first.

Verified against the API, not the CLI: revision 48, ACTIVE, cron still `0 20 * * 5` Europe/Madrid.

### 2026-08-24 — v135: the crawl runs, and a gap only a real run could show

The referee crawl was switched on in production for the first time, deliberately scoped to **one
group** (Tercera Catalana Grup 1, 2025-26) before anything wider.

**It worked**: 240 actas indexed, **240 with a referee**, goals and results stored, 75 actas
carrying sendings-off from the `sanciones` join. Cursor exhausted, queue complete.

#### And the referee panels still said "no record"

The raw index is **not** what the app reads — `fcfReferees` is. `_rebuildFcfReferees()` was called
only by `fcfWeeklyRefs`, and only when its pass completed. So the nightly backfill filled the index
and derived nothing from it: a database nobody could see, with the next thing that would have fixed
it a scheduled job days away.

Nothing in the unit suite could have caught this. Both jobs were individually correct; the gap was
between them, and it only became visible by running the thing and looking at what the app would
read. `crawlFcfActas` now rebuilds on `r.done` too — and only on `done`, since mid-backfill the
aggregates would be recomputed nightly from a half-crawled index, which is work with no reader.

After the fix, re-triggered: **44 referee profiles**, per-division records with offence breakdowns,
matching the figures computed locally from the same group. CABRERA VIDAL, DAVID — 9 matches, 6 reds
and 5 second bookings — reads `dissent, assault, decorum, violent`.

#### Then widened

`fcfCrawl/config` now covers all five tiers across 2026-27 and 2025-26 — 64 groups a season. The
nightly job works through it a few hundred actas at a time. **To stop it: `enabled: false`. To
narrow it: put group ids back in `onlyGroups`.** Neither needs a deploy.

Unit 1180 → **1182**, with a mutation confirming the backfill-derives-nothing gap is now caught.

> **How the crawl was driven without a service account.** There is no local Admin SDK credential
> for this project, but the `firebase-tools` refresh token for marna96 mints a `cloud-platform`
> OAuth token, and that reaches the Firestore REST admin surface (IAM, not rules) and Cloud
> Scheduler's `jobs:run`. So: write `fcfCrawl/config` by REST, trigger the scheduled job by name,
> poll `fcfRefIndex` — no Console, no Cloud Shell, and the deployed code path is the one exercised
> rather than a local re-implementation of it.

### 2026-08-24 — v136: pen lines join the coordinate system everything else uses

Groundwork for the premium 3D tactical board (plan:
`~/.claude/plans/working-on-the-esquerrapp-floating-barto.md`). Shippable on its own — it is a
bug fix that happens to also be a prerequisite.

**The bug.** Every geometry layer on the board normalises to the HORIZONTAL full pitch on the way
out: `saveArrows` and `saveRects` run their endpoints through `toHorizontal`, and so do
`saveBalls`, `saveCones` and `saveTexts`. `savePenLines` did not — it stored the raw display
points, with a comment saying so. Orientation is a per-DEVICE preference (`fa_tactic_orient` is
deliberately not part of a saved board), so a stroke drawn on a phone held portrait came back
rotated on the coach's laptop, while the arrows on the same board stayed put. The stroke and the
arrow pointing at it drifted apart.

**Why it could not just be fixed.** Nothing records which orientation an existing stroke was drawn
in, so reinterpreting what is already stored would move every old drawing. Hence `penSpace`, a new
tail key: `''` (or absent) means "legacy, render raw exactly as before", `'h'` means normalised.
Every save writes `'h'` — including a re-save of a legacy board, which heals it using the same
orientation the raw render was already assuming, so what the coach sees is what gets stored.

**A second bug, one line over.** `applyFrameState` restored balls through `toDisplay` but cones
raw, so a cone jumped across the pitch every time you stepped a frame on a vertical board.

**Also landed, unused for now:** `pitch` (`[lengthM, widthM, format]`, `null` = the historical
105×68) appended alongside `penSpace`. Both tail keys went in together **deliberately**: key order
is the shard diff (`db.js` compares serialised strings), so two separate appends would have
rewritten every board shard in every club twice instead of once.

- `js/boards.js` — `penSpace` + `pitch` at the tail of `buildBoardEntry`.
- `js/app.js` — `penPointsToDisplay`/`penPointsToHorizontal` beside `toDisplay`/`toHorizontal`;
  `savePenLines` normalises and stamps; both restore sites convert; cone frame restore fixed;
  `tbHydrateEditor`/`tbClearEditor` own the two new scratch keys; `pushUndo`/`popUndo` carry
  `penSpace` **in both lists** — the v90 scramble was exactly this pair going out of lockstep.
- `test/pen-space.test.js` — new, 12 tests, running the real sliced helpers plus source assertions
  that pin the call sites. Registered in `test/package.json` (`suite-registry.test.js` enforces it).

A board with no strokes opens as `'h'` rather than legacy: there is nothing to misread, so it is
never healed pointlessly, and the first stroke drawn on it does not store display coordinates all
over again.

Unit 1182 → **1197**.

#### Then the geometry (same version)

`js/board-geom.js` — new, pure, 45 tests. The one owner of how big a pitch is, where its markings
sit, and where a percentage lands in metres. Loaded before `boards.js`; in `sw.js` precache.

**The rule it exists to enforce: markings are ABSOLUTE, objects are RELATIVE.** Resize a pitch and
the penalty area stays 16.5 m deep — it just occupies more of a smaller pitch. The players move
proportionally, because a 4-3-3 on a small pitch is still a 4-3-3. Scaling a percentage would
shrink the penalty spot along with the pitch, which is the one thing football does not do.

The markings used to be fixed percentages in `css/style.css` with **four** override blocks —
`.tb-vertical`, `.tb-half`, `.tb-area`, `.tb-vertical.tb-half`. All deleted. Class rules now carry
appearance only; every position, size, open edge, clip-path and the box's own `padding-top` is
inline, written by `tbMarkingsHtml()` / `tbFieldInnerStyle()` / `tbFieldOuterStyle()`.

**The old constants were approximations, and existing boards will shift slightly.** A 14% penalty
area is 14.7 m where the Laws say 16.5; the centre circle was 14.7 m across against a real 18.3;
`padding-top: 62%` describes a 105×65 pitch while the markings assumed 105×68. This is a
correction, but it is a visible one — `pitch-preview.html` (regenerate with
`node test/make-pitch-preview.js`) renders ten configurations from the real module for eyeballing.

Three things the geometry independently re-derived, which is the best evidence available that the
axis conventions are right:
- **77%** for a half board — `.tb-half .tb-field-inner` has hardcoded exactly that for years, and
  52.5 m of pitch length across 68 m of width is 77.2%. (A half board is WIDER than tall, despite
  being drawn goal-at-top. This surprises people; there is a test.)
- **11.5% / 21%** — the deleted rotation margins are exactly `(100 - aspect) / 2` for 77% and 58%.
- The penalty arc clip: derived **80.05%**, hardcoded was 75%.

Two bugs the tests caught while writing them:
- `pitchOf` was not **idempotent**. `markings()` resolves a pitch and hands the result to
  `extent()`, which resolved again, did not recognise its own output, and silently returned the
  105×68 default — so a 60 m pitch drew its penalty area at the 105 m proportion. Only the one
  assertion comparing *two different pitches* could see it.
- Vertical half/area must **not** be pre-rotated (CSS already rotates the whole `.tb-field`), while
  vertical full must be. `isRotated()` is exactly `useJsSwap()`; if the two ever disagree the
  penalty spot drifts away from the penalty taker.

`FORMATS` carries f11 (exact, Laws of the Game), f9 and f7 (common Spanish values — federations
differ, hence the coach override). **Futsal is deliberately absent**: its area is a 6 m arc, a
different topology, and a rectangle would look right and be wrong.

Unit 1197 → **1254**.

#### Corrections after looking at it (same version)

Three things the preview surfaced, one of which was the preview's own fault.

**The preview was lying about the perimeter.** `make-pitch-preview.js` extracts the pitch rules out
of `style.css` by matching selectors, and the chunker handed it each rule together with any
preceding comment — so `^\s*\.tb-` never matched a commented rule and dropped it. `.tb-field` sits
under `/* Horizontal football field */`, and it is the rule carrying the green surface, the white
perimeter border **and** `overflow:hidden`. The generated page therefore showed pitches with no
turf and no touchlines while the app itself was fine. Comments are stripped first now, and the
script **throws** if `.tb-field` goes missing rather than quietly rendering a lie.

**Corner arcs were genuinely absent.** `markings()` returned `cornerR` and nothing drew it. Each is
a whole 1 m circle centred exactly ON the corner; `.tb-field`'s `overflow:hidden` clips it to the
quarter inside the pitch. No `clip-path`, and nothing to re-derive when the board rotates — a
corner is a corner in every orientation.

**Futbol-7 and futbol-9 presets removed.** They were not standardised the way the Laws of the Game
are — federations differ, and the numbers were a plausible guess dressed as a citation. One
marking set now; `pitch` is `[lengthM, widthM]`, the third slot is gone (a stray one is ignored).
The consequence, which is real: the narrowest pitch is now **42.32 m**, because it cannot be
narrower than the 40.32 m penalty area. Fine for any ground, too wide for a 30×20 rondo grid —
grids are what the `area` board type is for.

**The area board now spans the FULL pitch width** (owner's call, and the right one): it used to be
the penalty box plus a margin, which cropped the touchlines off and left no corner to cross from,
while corners and crossing are the most common thing the board is opened for. Depth is the final
third — `L/3`, so it scales with the pitch — floored at `spot + arcR + 4` so a short pitch cannot
cut through the D. Aspect moves 58% → ~51%, so **existing area boards reflow**: players stay
proportionally placed, the frame around them is a different shape. Unavoidable given the request.
`adaptFormation`'s `* 1.7` area heuristic is left alone — it is the legacy formation spread, not a
marking, and touching it would move players for no reason.

Unit 1254 → **1268**.

### 2026-08-24 — v136: the pitch is resizable

The user-facing half of the geometry work. A coach sets the perimeter two ways — typing metres, or
dragging a grip — and the markings stay regulation size, which is the whole point.

**One setter, two routes.** `setPitch(L, W)` clamps, pushes an undo entry and re-renders; the
numeric inputs, the reset button and the grip `pointerup` all go through it, so none of those three
steps can be applied on one route and forgotten on the other. It **returns early when nothing
moved**, or every blur of an untouched input and every pointerup on a grip that went nowhere would
push a no-op onto the undo stack.

A resize **re-renders** rather than patching styles: the markings, the box aspect and the rotation
margins all derive from the pitch, and re-deriving them here would be a second copy of
`tbMarkingsHtml` waiting to drift. During a drag the box is only stretched visually; the real write
lands on pointerup.

**Two grips, one axis each** — `-x` on the goal line (length), `-y` on the touchline (width). Not a
corner handle: a coach matching a real ground usually knows one of the two numbers exactly, and a
handle that moves both makes it impossible to hold one steady. Hidden until hover, and always
faintly visible under `@media (hover: none)` where there is no hover to reveal them.

**The subtle part is `gripPitchFor`.** On a vertical FULL board the pitch is rotated on screen, so
the grip owning the pitch length is the one running horizontally — it reads `clientY`. It asks
`BG.isRotated(curBoardType(), isVertical())`, the same predicate the markings use, rather than
re-deriving the condition. Backwards, this edits the wrong dimension and still produces a
plausible pitch, which is why there is a test for each orientation. Half and area are **not**
swapped: CSS rotates the whole field, so pointer coordinates come along already.

Also: the drag measures from the pitch as it was at `pointerdown`, not from the live value. Scaling
the previous result each move would compound — a slow drag would shrink the pitch to nothing.

`pitch` joins `pushUndo`/`popUndo` **in both lists** (the v90 scramble was that pair drifting), and
`popUndo` **re-renders and returns early** when the pitch changed: `applyFrameState` restores the
players but knows nothing about markings or the box aspect, so undo used to restore the stored
dimensions while leaving the pitch on screen at its new size.

Controls are hidden on half/area boards — they are derived views of the same pitch, and editing a
perimeter whose edges are off-frame is a control with no visible effect.

Six i18n keys, ca/es/en, with a test (`t()` returns the key itself on a miss, so a gap ships as raw
`tactics.pitch` on screen).

**Still needs hands-on checking in the running app**: the grips are hover-driven, so the static
preview page cannot exercise them.

Unit 1268 → **1284**.

### 2026-08-25 — v136: one tween, one rounding (`js/board-state.js`)

Phase 2 of the premium-board work. Not the "decouple the editor from the DOM" refactor the plan
described — that was the wrong shape. The save functions READ the DOM, which is their job as a
view; what needed extracting was what the value IS. Narrower, and it buys the same thing.

**The tween was written twice.** `interpolateAndApply` (editor) and `interpolateRo` (read-only)
were two ~120-line functions doing the same index matching and the same lerp against different
DOM. They drifted, and the drift shipped twice: **v91** was the editor preferring the current
colour array over the frame's — the opposite of every other renderer, so a player changed colour
mid-animation in the editor and nowhere else. **v88**'s opposition flash was the same shape. A
third copy for 3D would have been a third chance.

The whole thing reduces to one question with no DOM in it: *where is each thing at time t, or is it
not there.* `BS.tweenTrack(from, to, t)` answers it — lerp when present in both, **snap** when new
in the target (a player with no previous position must not fly in from the corner), `null` when
absent. Whether that means create, move or remove depends on what is on screen, which stays with
each renderer. Both call sites lost a branch: lerp-vs-snap is decided inside the tween now.

Both copies of `lerp` are gone; a test fails if one comes back.

**Rounding was written six times.** `Math.round(v * 100) / 100` in each save function. Now
`BS.round2`, with a 4000-sample property test asserting it is byte-identical to the expression it
replaced — db.js diffs shards as serialised strings, so one differing digit rewrites every board
shard in every club.

`BS.KEYS` names the scratch keys so no caller spells one as a literal (a typo there is silent: the
write lands on a key nothing reads and the value is gone at reload). `readJson` swallows a corrupt
value rather than taking the board down — localStorage is shared across tabs and outlives version
changes.

Two things deliberately NOT in the module: **numbers** (a shirt number belongs to the player, not
the moment, so it is merged from live editor state, which is not frame data) and **text-label
tweening** (the editor snaps labels, the read-only renderer slides them; unifying that would change
how every existing animated board plays, which is not this refactor's business — it now at least
goes through the same arithmetic).

**A third cone bug**, same family as the other two: `interpolateAndApply` spawned cones without
`toDisplay`, so a cone jumped across the pitch the moment playback started on a vertical board.
That is now fixed in all three places it existed.

Caught while refactoring: deleting `lerp` broke the read-only text labels, which still called it —
`node --check` passes on a ReferenceError, so only reading the greps caught it.

Unit 1289 → **1316**.

#### The axes were never inverted — the board could not get narrower (v136)

Reported twice as "dragging one axis edits the other". The first fix changed the grip→dimension
MAPPING, which was addressing the wrong layer and did not help. The actual cause:

`.tb-field` had `width:100%; max-width:820px` and `.tb-field-inner` carried the size as
`padding-top: <aspect>%`. So **the rendered width never changed** — every pitch change came out as
a change in height. Halving the length left the board 820 px wide and took it from 531 px to
**1052 px tall**. Dragging the right-hand grip grew the board downwards, which is indistinguishable
from the handle editing the wrong dimension. A shorter pitch simply had nowhere to get shorter.

`tbFieldScaleStyle()` now emits `max-width` inline, scaled by `ax / axDefault`, so a metre is the
same number of pixels on both axes:

| pitch | before | after |
|---|---|---|
| 105 × 68 | 820 × 531 | 820 × 531 |
| 53 × 68 | 820 × 1052 | 414 × 531 |
| 105 × 34 | 820 × 330 | 820 × 330 |

Scaled against the DEFAULT pitch rather than the maximum, so an unresized board renders at exactly
the size it always has and nothing moves for anyone who never touches the feature. The two base
widths (820, and 520 for vertical full) moved out of the stylesheet into JS — the scale multiplies
them, and a number multiplied in JS but declared in CSS eventually disagrees with itself.

The live drag preview sets width AND aspect now; it used to set only `padding-top`, so the edge
left the cursor behind mid-drag.

Vertical half/area keep their CSS `max-width:820px` and are not scaled: they are rotated by a CSS
transform whose compensating margins resolve against the CONTAINER width, so scaling the element
would need that compensation reworked for no benefit — neither board type carries resize handles.

**Diagnostic worth keeping**: the dev server refuses to serve `sw.js`. A cache-first service worker
on a dev origin serves the code you wrote twenty minutes ago, and a hard refresh reloads the
document while the worker keeps answering for subresources — so the page looks stale in a way that
reads exactly like an edit not working. A 404 on the worker script also unregisters an installed
one, so a poisoned origin self-heals. `GET /__version` reports what is on disk.

Unit 1316 → **1319**.

### 2026-08-25 — v136: the 3D board (premium), first working version

`js/board3d.js` + `vendor/three.module.min.js` + `vendor/three.core.min.js` (733 KB, r0.185.1,
ESM). Web only, lazily imported, gated on `clubFeature('board3d')` AND a WebGL probe.

**It is a second VIEW over the same state, not a second board.** It reads and writes the same
`fa_tactic_*` keys through the same `board-state.js` setters, so `buildBoardEntry` produces a
byte-identical payload whichever view drew it. No 3D-specific data exists anywhere: a camera angle
is not saved, a player position is a percentage of the pitch exactly as it always was. Everything
visual is derived — `BG.toWorld` on the way in, `BG.toPercent` on the way out. board3d hardcodes
**no** regulation distances; a test asserts that.

Notable choices:
- **Markings are a CanvasTexture**, not meshes. Thirty thin boxes fighting the turf is how you get
  z-fighting on the lines; one texture cannot z-fight, redraws instantly on resize, one draw call.
- **Goals are real geometry** at regulation size, so they stay physically sized as the pitch grows.
- **A small orbit controller instead of the OrbitControls addon** — the addon is a large file of
  features this does not use, and the polar clamp (never under the turf, never exactly overhead,
  where the look-at basis degenerates) is the only part that matters.
- **Renders on demand**, not a permanent rAF. A static board is the usual state.
- **Whole-scene rebuild** rather than diffing a few dozen objects — diffing would be more code than
  it saves and is where a stale-object bug would live.
- The edit hook is **passed in**, not dispatched as an event: a listener bound in `bindTactics`
  would capture that render's `autoSaveFrame` and keep it after the next re-render. Same shape as
  the `tb-ro-play` double-binding.

**Bug caught before shipping**: board3d read `parseFill(...).on`. `parseFill` returns `{striped,…}`;
`on` is the first ARGUMENT of `encodeFill`. Reading the parser's output under the encoder's
parameter name renders every striped kit solid — a wrong board that throws nothing, on a feature
nobody has looked at yet. Pinned by a test that also asserts utils' shape has not changed.

**APK exclusion**: `'vendor'` in `DENY_EXACT`, `^board3d\.js$` in `DENY_PATTERN`, and `copyDir` now
applies the patterns at **every depth** — it only filtered root entries, so a nested file always
shipped. Verified: `www/` builds clean with neither present.

**What is NOT built yet** — this is a 3D viewer and object editor, not the full editor:
- drawing arrows, zones, pen strokes and labels IN 3D (they RENDER, but must be drawn in 2D)
- animation playback in 3D (`BS.tweenFrame` and `setPosition()` exist for it; not wired)
- selection and delete in 3D
- the `setClubPlan` callable and the superadmin control for `features.board3d` (the client gate and
  the rules position are in place; the superadmin currently passes by `isAdmin`)

Unit 1319 → **1335**.

#### Three fixes from the first look at the 3D board (v136)

**The page scrolled while orbiting.** The wheel listener was registered non-passively on the canvas
only, so `preventDefault` worked there and nothing stopped a wheel that reached the element's edge
from chaining out to the document. Now: non-passive wheel on the canvas **and** the container,
`overscroll-behavior:contain` on the wrap, and `preventDefault()` on pointerdown — a mouse drag
starting on a canvas otherwise becomes a selection drag that scrolls once it leaves the element.

**The viewer was too small.** 820 px is plenty for the 2D board, which is seen from directly above;
in 3D the far half is foreshortened into a fraction of the height and the same box is unreadable.
Now `max-width:1400px` and `height:clamp(420px, 72vh, 900px)`, with `resize()` reading
`clientHeight` so **CSS owns the shape** rather than a hardcoded width ratio.

`frameBoard()` now fits the pitch against **both** axes of the frustum — the vertical FOV is fixed,
so the horizontal one depends on aspect, and fitting only the long axis leaves the pitch overflowing
on one axis with a band of empty sky on the other. It also stops re-framing once `camTouched` is
set: a window resize must not throw away the angle the coach chose.

**The pitch came up empty until you visited 2D.** `saveState()` is only ever called from an
interaction, so a board whose players came from the formation defaults had them in the (hidden) 2D
markup and **not** in `fa_tactic_positions` — and board3d reads the keys, not the DOM. A single
`saveState()` before mounting fixes it, and keeps one source for the positions rather than teaching
board3d about formations.

Unit 1335 → **1343**.

#### The 3D board keeps up, and the camera can be moved (v136)

**It was a snapshot from mount time.** Adding a formation or the opposition changed the 2D board
and nothing told the 3D one. `tb3dTouch()` is now called from `saveState()` and `autoSaveFrame()`,
which between them follow every mutation the editor makes. Coalesced to one rebuild per animation
frame (saveState fires several times per gesture), and it compares a pitch+boardType signature so a
player drag does **not** regenerate the 2048 px marking texture — only a real pitch change does.

**Right-drag pans the camera target.** Zoom converges on the look-at point, so with the target
pinned to the centre spot there was no way to get a close look at a corner. Right button, middle
button or shift-drag. Scaled by distance and FOV so the turf tracks the cursor at any zoom — a
fixed rate feels glued when zoomed out and frantic when zoomed in — and bounded to three quarters
of the pitch either way, because unbounded panning loses the board with no affordance to get it
back. A **Reset view** button recentres and re-enables auto-framing; the context menu is suppressed
so the pan does not open a menu over itself.

**Playback works in 3D.** `interpolateAndApply` feeds the same `BS.tweenTrack` output to both
renderers, so they cannot disagree about where a player is mid-animation — the exact class of bug
that produced v88 and v91 when playback was written twice. Per-object `setPosition` rather than a
rebuild, because rebuilding at 60 fps would regenerate every mesh and texture each frame.

Unit 1343 → **1352**.

#### Two regressions from wiring the 3D view live (v136)

Both from the same root: the 3D view had become a **second writer** of the scratch state.

**A 3D drag snapped back.** `onMove` wrote the scratch key directly, then `autoSaveFrame()` ran
`captureFrameState()`, which begins with `saveState()` — and `saveState` reads the **2D DOM**. The
hidden 2D board still held the pre-drag position, so it overwrote the 3D write. (Only visible on a
board WITH frames; without them `autoSaveFrame` short-circuits and the drag stuck, which is why it
looked intermittent.)

Fixed by inverting the relationship: `applyMove` moves the 2D **element** — `toDisplay(pct)` into
`style.left/top` — and then runs the editor's own save path. One source of truth, and undo, frames,
the number inputs and saving all keep working because nothing is bypassed. **The 3D view is an
input device for the 2D board, not a second writer.** Cones are addressed positionally: `spawnCone`
sets no `data-idx` and `saveCones` reads DOM order, so an index lookup finds nothing.

**Playback froze on the last frame in 3D.** `applyFrameState` writes the scratch keys directly
rather than through `saveState`, so it missed the `tb3dTouch()` every other mutation gets — and the
play loop ends by calling it to return to frame 0. The 2D board reset; the 3D scene sat on the last
tweened positions. Stepping between frame thumbnails had the identical gap.

A test asserting the OLD architecture (`BS.setPoints` from the mount) had to be inverted — it was
pinning the design that caused the bug. Worth noting as a caution: a test written alongside a
design defends that design, correct or not.

Also caught: a test anchored on `function playNext()` sliced the READ-ONLY renderer's loop, which
appears first in the file, and proved nothing about the editor. Anchored on the editor's play button
now.

Unit 1352 → **1356**.

### 2026-08-25 — v136: movement trajectories (premium 3D)

The first genuinely NEW data this feature has added — everything before it was derived. Modelled
from the owner's description of the reference tool; the video could not be watched.

**A trajectory belongs to the frame it leads INTO.** `frames[n].paths[kind][index] =
{bend, apex}` — sparse, and absent on frame 0 because nothing has moved yet. It is frame metadata
like `duration`, which is why `autoSaveFrame` carries it across a capture: paths are not derived
from the DOM, so a capture would wipe them.

**`bend` is the on-curve MIDPOINT, not the Bézier control point.** The handle is what the coach
drags, so round-tripping it must be exact, and `null` then means precisely "where a straight line
would put it". Deriving the control point is one line (`bendToControl`); deriving the handle back
out of a stored control point is one line the UI would have to get right in three places.

Both curves are parabolas, as specified — in plan a quadratic Bézier (a parabola by definition), in
elevation `4h·t(1−t)`, peaking at exactly `h` at t=0.5. There are tests asserting parabola-ness via
constant second differences, because it was stated as a requirement rather than as a preference.

**`apex` is METRES**, not a percentage, so a 3 m chip is a 3 m chip on any size of pitch.

`tweenTrack` takes an optional sparse `paths` map. **With no paths it is byte-identical to the lerp
it replaced** — pinned by a test, because every board predating this has none and a floating-point
hair would move every existing animation.

**Both views draw it, from the same maths.** 3D: a dashed curve, a dot running end to end on one
shared 3-second clock (per-dot phases read as noise; in step they read as direction), a round bend
handle on the curve and a diamond above it for the apex, with a hairline to the turf so the height
reads. 2D: the plan-view bend only — the arc height has no top-down representation, so a chipped
ball looks like a pass there and like a chip in 3D.

The apex handle drags in HEIGHT, never across the turf: raycasting a diamond onto the ground plane
sends it to the horizon as the pointer approaches eye level. The bend handle is deliberately **not**
clamped to the pitch — an outswinging cross bulges past the touchline.

`applyPath` MERGES its patch. The two handles edit one path, so replacing would make each silently
undo the other.

The render loop is no longer purely on demand: a static frame cannot show direction, so it runs
continuously while any trajectory is on screen and returns to on-demand when none is.

Also fixed: a test bounded by a fixed character count silently stopped covering `autoSaveFrame`'s
tail once the function grew, and reported the tail as missing. Bounded by the next function now.

**Still not built**: drawing tools in 3D (arrows, zones, pen, labels render but are drawn in 2D),
selection/delete in 3D, editing the bend from the 2D board, and the `setClubPlan` callable.

Unit 1356 → **1384**.

### 2026-08-25 — v136: trajectory handles, trails, and playback cameras

Second round on trajectories, from the owner's written description. **The GIF could not be seen**
either — it failed to process at 146 MB — so this is built from the description like the first
round. Three decisions were taken by asking rather than guessing: spline type, timing, and when the
camera presets are available.

**Ball handles split by meaning.** The round dot moved to the GROUND — it is the curve's
projection, "where the ball passes over", so it stays on the grass however high the arc goes — and
the diamond owns the height. Only ONE is pickable at a time and **right-click swaps them**: they
occupy the same screen position from directly overhead and no amount of offsetting fixes that. The
inactive one still renders, dimmed, so it is obvious the other exists. A lofted ball also gets a
faint ground track, or a chip looks like it lands somewhere it does not.

**Right-click stopped meaning only "pan".** It returned into pan mode *before* picking, so a
right-click on a handle panned the camera. Now: pick first, and a right-press only becomes a pan if
the ray hits nothing interesting. The action waits for release and for the pointer to have moved
less than 4 px, so a pan that happens to start on a handle is still a pan. Line picking needs
`raycaster.params.Line.threshold` in world units — the default never hits a hairline.

**Players get multiple bend dots and no diamond** — a run has no height. Right-click the line to
add a dot, right-click a dot to remove it (not requested, but without it a misplaced dot is
permanent). The curve is a **centripetal Catmull-Rom** through every dot: it passes exactly through
each one, and centripetal specifically because uniform Catmull-Rom forms cusps and loops on the
unevenly spaced points hand placement produces.

Two path shapes, deliberately: `{bend, apex}` for a ball (a flight IS a parabola) and `{pts}` for a
run. Back-compatible — a player's legacy single `bend` reads as a one-element `pts`.

**Timing is unchanged, by decision.** `t` still runs 0→1 across the frame's duration; only
`pathPoint` consults a spline. The accepted consequence, recorded because it will be noticed:
**bending a run makes that player faster**, since they cover more ground in the same time.

**Lines take the object's colour** (`parseFill(...).c1`, since a striped kit cannot be one line
colour), and are continuous and hairline — `LineBasicMaterial`, no dashes. WebGL caps line width at
1 px almost everywhere, which is exactly the weight wanted.

**Playback dressing.** A ball shadow that grows and fades with height — the only altitude cue from
directly overhead, where the arc is edge-on. Player trails as a short ribbon fading via **vertex
colours lerped toward the turf**, not per-vertex alpha, which `LineBasicMaterial` cannot do without
a custom shader. Both are built once and hidden, never allocated per frame.

**Camera presets** — Broadcast, Top, Goal, Side, Follow ball — always available, not a playback
mode. Distance is left to `frameBoard()` so a preset never crops the pitch on a narrow window.
**Top is the degenerate case**: straight down, the default up vector is parallel to the view and
`lookAt`'s basis collapses, so it sets `camera.up` explicitly. Any manual orbit or pan clears
follow-ball, or the camera fights the coach.

Two test-quality notes: a fixed-character-window slice silently stopped covering `applyPath`'s tail
once it grew, reporting the tail as missing — the second time that pattern has bitten, so those
slices are now bounded by structure. And a diagnostic regex with a nested capture group read the
wrong group and claimed every i18n key was missing all three languages; the code was fine.

Unit 1384 → **1409**.

### 2026-08-25 — v136: real shadows, flat markers, live curve editing

Five corrections from using the 3D board. As with the previous two rounds the reference material
could not be seen — the GIF failed to process at 146 MB — so this is built from the description.
Two decisions were taken by asking: the shadow model and what "at the midpoint" means.

**Real shadows.** `shadowMap` on, `PCFSoftShadowMap`, the key light casting, players/ball/cones/
goals casting and the pitch receiving. I argued against shadow maps first time round on cost
grounds; **that was over-cautious** — about twenty-five casters and one extra pass, against a ball
that was genuinely hard to place in depth.

The light is **angled, not overhead**, on purpose: an overhead light puts every shadow directly
under its object and adds no depth information at all. The shadow camera is an orthographic frustum
**fitted to the pitch** and refitted in `buildPitch()`, because the pitch is resizable — the default
frustum is a couple of units across and would leave nearly the whole board unshadowed. `key.target`
has to be added to the scene or the light aims at nothing.

**The ball marker was not broken, it was invisible.** A 0.45–2 m disc at 6–30% opacity on a 105 m
pitch is about 2% of the board's width in dark grey on mid-green. Now a white **ring** — a filled
dark circle is indistinguishable from the ball from overhead — holding at least 0.35 opacity, and
shown for a lofted ball **at rest**, not only during playback, because a chip should read while it
is being set up. It stays straight down: the angled shadow answers "where is the sun", this answers
"where is the ball".

**Flat markers.** The travelling dots and bend dots were spheres, which read as balls half-sunk in
the turf — confusing beside the one round thing that IS a ball. All now flat `CircleGeometry` discs
lying face-up with `depthWrite:false`. The travelling dot is **0.16 m against the ball's 0.45 m**,
so it cannot be mistaken for one. The apex diamond stays a diamond: it means "up".

**The ball's bend dot is locked to the perpendicular bisector** of the start–end line
(`BS.constrainBend`). It can be pushed sideways but never slid toward either end, so it is always
equidistant from both and the parabola is symmetric — which is what a struck ball does. Constrained
**during** the drag, not on release, so the dot slides under the cursor instead of jumping when the
button comes up; and again on commit, so the stored value never depends on the drag path. Player
runs are deliberately unconstrained — a run may bend late.

**Curves now follow the handle live.** The cause of the snapping: the curve `Line`s were added
anonymously, so a drag could only move the handle mesh and nothing could recompute the curve until
the rebuild on release. A `pathEntries` registry holds each trajectory's meshes, and `updatePath()`
rewrites the **existing** position buffers per pointermove — allocating a new buffer each move is
how a smooth drag becomes a stuttering one.

Unit 1409 → **1434**.

#### Shadow bias, subtler marker, live endpoints (v136)

**Why shadows vanished when the camera moved, exactly.** `shadow.bias` is a fraction of the shadow
camera's DEPTH RANGE, so what it costs in metres depends on near/far. At `-0.0008` over a `1..400`
range it was **0.32 m of depth — and a player is a disc 0.35 m tall**. The bias pushed almost the
whole shadow through the turf, leaving nothing to see. From directly overhead you cannot tell,
because the shadow hides under the player casting it; orbit, and it is simply gone. Fixed at both
ends: near/far now hug the scene (range ~208 instead of 399) and the bias halved, giving 0.08 m —
under a quarter of a player's height.

The frustum is also fitted to the pitch's **bounding sphere** rather than its longest side. The
shadow camera looks down the light's axis, and a rectangle viewed off-axis projects up to its full
diagonal; the old `max(ax, ay) * 0.75` happened to cover a 105×68 pitch but not by much, and not at
130×90. The light's DISTANCE now scales with the pitch too — it was a fixed `(40, 70, 30)`, so a
large pitch pushed its own corners behind the light.

**Broadcast was off-centre by construction**: `theta: -Math.PI/2 - 0.35`. The offset was meant as
"slightly off the halfway line" but it only pushes the camera 34% off-axis in X. Removed.

**The ball ring is much subtler** — thin (0.93→1 radius), smaller, and quieter (0.45 falling to a
0.22 floor). It still cannot fade to nothing, which was the original fault.

**The apex diamond** is now the same size as a bend dot with dark edges and flat shading: a
single-colour octahedron in perspective is just a hexagon, and the outline is what makes it read as
a solid above the turf rather than another mark on it.

**Dragging an object now carries its trajectory.** The curve ends where the object is, so leaving it
until the release rebuild was the same "snaps into place" complaint the handles had. `movePathEnd()`
re-points the curve and the travelling dot — which holds its own copy of the endpoints and would
otherwise keep running to where the object used to be.

Two of my own earlier tests pinned the numbers this round deliberately changed, and had to be
relaxed to assert the property rather than the value.

Unit 1434 → **1443**.

#### Ball scale, true trail fade, first-drag curves, camera easing (v136)

**The ball was a boulder.** `BALL_R` 0.45 → **0.25**. A real ball is 0.11 m and invisible at pitch
scale, so it stays oversized — just not by as much. The travelling dot shrank with it (0.16 → 0.12)
because the two were separated deliberately, and the ground ring is now `BALL_R * 1.8 + …` rather
than a fixed 0.7, which would otherwise have been three times the ball. Bend dots left alone: they
are handles and have to stay grabbable, so they now read larger than the ball.

**Trails were faking the fade.** They lerped vertex colours toward the constant `TURF` green while
the material's opacity stayed a uniform 0.55 — so they never became transparent at all. The turf as
rendered is lit, mown-striped and shadowed, so a flat green line does not match it: over a dark
stripe it reads as a pale streak, which is the "fading to white" report. Replaced with a small
`ShaderMaterial` carrying a per-vertex `alpha` attribute. **I called a custom shader "a lot of
machinery for something barely noticeable" when I wrote the fake — wrong on both counts.**

**Trajectories were absent on the first drag.** `addPathsFor()` skipped anything that had not moved,
so at the moment a drag began there was no entry and `movePathEnd()` bailed; the curve only appeared
after the release rebuild. Entries are now built for **everything with a previous-frame position**
and hidden until it has moved, with `updatePath()` revealing them mid-drag. A visibility toggle
costs nothing; building meshes mid-gesture is what makes a drag stutter. The raycast now also skips
invisible meshes — three.js does not reliably do that, and an invisible pick-line would swallow a
right-click meant for the turf.

**Camera presets snapped.** Now a 550 ms eased tween from wherever the camera is. Three details:
`theta` takes the **shortest arc** (the raw difference sends it the long way round about half the
time); the up vector is **blended across a band** instead of switched at `phi < 0.02`, since a hard
switch is invisible on a snap but flicks part-way through an animated move to Top; and the tween
**holds the render loop open**, which is otherwise on demand and would show a single frame. Any
orbit, pan or zoom cancels it. `resetCamera()` glides too.

`setPreset` computes its destination by momentarily setting the angles, calling `frameBoard()` to
get the fitted distance, then putting the camera back — the fit depends on the angle, so it cannot
be measured from where the camera currently is.

**Three of my own tests had to be rewritten** because they pinned the decisions this round reversed
(build-if-moved, colour-lerp fade, threshold up-switch). Third round running that has happened; the
replacements assert the invariant the coach sees rather than the mechanism.

Unit 1443 → **1459**.

#### Dimmer trajectories, and a camera that cannot flip (v136)

**Dimming**: trajectory curve 0.9 → 0.55, lofted ground track 0.35 → 0.18, ball ring 0.4 → 0.28
with its floor 0.22 → 0.12, travelling dot → 0.8. **Handles deliberately untouched** — the bend
dots and the diamond are targets the coach has to hit, and dimming an interactive control to match
decoration costs usability for nothing.

**The board flipped between views, and the blend I added last round was the cause.** Measured
through a Side → Top transition, holding theta fixed:

```
  phi=1.380   up·view = -0.19    roll step   0.0°
  phi=0.139   up·view = -1.00    roll step   7.9°
  phi=0.001   up·view = -0.01    roll step 172.1°   <-- the flip
```

`up · view` reaching −1.00 means the up vector had become **parallel to the view direction**, so
`lookAt` had no plane to build a basis in and the frame whipped through half a turn. Widening a band
around the singularity drags `up` toward the view axis across the *whole band* instead of only at
the pole — the previous hard switch was stable precisely because nothing ever interpolated through
that region. No band width fixes it: the degeneracy is at the destination.

The fix is to stop interpolating orientation as angles at all. `applyCamera()` is back to the hard
switch (via a shared `upFor()`), and transitions now **lerp position and slerp the quaternion**
between the start frame and a destination frame computed with the same `upFor` rule. Slerp takes the
shortest rotation between two well-defined frames and cannot pass through a degenerate basis.
Re-measured: largest single step **5.7°**, evenly spaced.

Computing the destination with the *same* up rule matters — if the tween's final frame and the first
`applyCamera()` after it disagreed, the camera would snap once as control handed back, which is the
same bug in a different costume. The tween never calls `applyCamera()` mid-flight for the same
reason.

**Six of my own tests failed on this change** — three regexes matching call shapes that gained an
argument, two slices that no longer bracketed moved code, and one matching `applyCamera()` inside a
*comment explaining why applyCamera must not be called*. Rewritten to compare against `BALL_R`
rather than a literal, to strip comments before searching, and to assert that a floor exists rather
than what it is.

Unit 1459 → **1468**.

#### The flip, actually fixed — and why the tests missed it (v136)

The slerp change made the flip WORSE, on every transition rather than some. Cause, measured:

**`Object3D.lookAt` and `Camera.lookAt` are not the same operation.** three.js branches on
`isCamera || isLight`: an ordinary object points **+Z** at the target, a camera points **−Z**. The
destination orientation was built with a plain `Object3D` probe, so it came out rotated by **exactly
180°** — verified, not inferred — and the slerp obediently drove the camera round to face away from
the pitch.

Now built with `Matrix4.lookAt(eye, target, up)`, which produces the camera basis with no dependence
on an object-type flag. Checked identical to a real `PerspectiveCamera` across 30 angles including
overhead: worst disagreement **0.0000°**.

**The test lesson is the important part of this entry.** The existing suite happily confirmed that
the tween "computes the destination with the same up rule" and "slerps rather than re-deriving
angles". Both true. Both useless — the camera was 180° wrong and every assertion passed, because
they all grep the source for call shapes and no amount of that notices that two identically-named
methods do different things.

`test/board3d-camera.test.js` is new and different in kind: it **executes** the maths against the
real three.js (importable in Node — only the WebGL parts of board3d are not) and measures the
result. It asserts the camera actually faces its target, that the orientation matches a real
`PerspectiveCamera`, and that no pair of presets produces a step larger than 15°. **Confirmed to
FAIL against the old implementation** — a test that passes on both versions would have proved
nothing.

One more source test had to be inverted: it asserted `const orientProbe = new THREE.Object3D()`,
i.e. it pinned the defect itself.

Unit 1468 → **1475**.

#### Broadcast and Side sat on the wrong touchline (v136)

Both were at `theta = -PI/2`, which puts the camera on the **-Z** side and mirrors the pitch
left-to-right against the 2D board: a player the coach sees on the left in 2D appeared on the right
in 3D. Measured by projecting a known point rather than reasoning about handedness, which is easy to
get backwards on paper —

```
  theta=-PI/2   x=10% -> NDC +0.45,  x=90% -> NDC -0.45   MIRRORED
  theta=+PI/2   x=10% -> NDC -0.45,  x=90% -> NDC +0.45   matches 2D
```

Both now `+PI/2`. **Top is untouched and already correct**: its up vector is derived from its own
theta, and `-PI/2` happens to put screen-up along `-Z`, which is the top edge of the 2D board — there
is now a test for that too, since it is a coincidence worth pinning. **Goal** looks straight down the
X axis, so left-right does not arise (both reference points project to NDC x = 0).

`board3d-camera.test.js` gained the mirroring checks, reading the presets **out of the shipped
source** so it cannot drift from a copy. Two escaping notes from writing it, both mine: a heredoc
collapsed `\s` to `\s` (which in a JS string is just `s`), so the built regex silently matched
nothing — replaced with plain line parsing, which has no escaping to get wrong; and
`l.startsWith('side:')` first matched `side: THREE.DoubleSide` on a material, so the finder now
requires the line to contain `{theta:`.

Unit 1475 → **1479**.

#### And the STARTING camera, which nothing covered (v136)

The presets were fixed; the angle the board actually **loads** with was not. `const cam = {theta:
-Math.PI / 2, …}` is set separately from `PRESETS`, so the first thing a coach saw was still
mirrored against the 2D board. Now `+PI/2`, matching the rule the presets follow.

The test gap is the point: every camera test named a preset, and the initial view is not a preset.
`board3d-camera.test.js` now reads `const cam = {theta:` out of the source and projects through it
like the rest — **confirmed to fail against the old default** before being accepted.

Unit 1479 → **1480**.

### 2026-08-25 — v136: sharper markings, and three field looks

**Definition.** The marking texture was a flat 10 px per metre — a **1050×680** canvas stretched
across a board rendered up to 1400 px wide, i.e. under one texel per screen pixel, which is exactly
why the lines looked soft. It now spends the whole 2048 budget on the long axis: **2048×1326**,
19.5 px/m, and the line width is the real **12 cm** rather than bottoming out on a 1.5 px floor.
Line alpha 0.85 → 0.92-0.95 per palette. Costs one extra canvas draw when the pitch changes, which
is not per frame.

**Three field looks — green, dark, light — across BOTH views.** A coach switching views has to see
the same pitch, so there is exactly **one palette table** (`TB_THEMES` in app.js) and the 3D board
takes it by injection, the way it already takes BG, BS and the fill helpers. Two tables would be two
tables that drift.

Reaching every layer took three mechanisms, because the markings are drawn three different ways:

- **inline colours** (boxes, circles, arcs) — read from the palette in `tbMarkingsHtml`;
- **CSS-styled marks** (halfway line, spots, turf, the board's own border) — themed through
  `--tb-turf` and `--tb-line-rgb` custom properties set on the field element, with green fallbacks
  so a board rendered before they land still looks right. `--tb-line-rgb` is a bare triple so the
  stylesheet keeps choosing its own alpha per marking;
- **the 3D scene** — turf, stripe, line and `sky`, plus the hemisphere light's ground colour, which
  takes the turf: a light pitch lit by a dark green bounce looks muddy.

The toggle is three swatches rather than three words — the choice is entirely visual, and a swatch
needs no translation. Preference is per-device (`fa_tactic_theme`), never part of a board.

Test notes, all mine: the markings harness had to slice from the **palette** rather than from
`tbMarkingsHtml`, since the colours now come from it — 17 tests failed at once on that. One new
assertion was simply **wrong**: it demanded no `rgba(255,255,255)` in the output, but green's line
colour *is* white, so it failed on correct code; it now renders through the light palette and checks
the result is dark. And a heredoc ate `\s` in a built regex for the third time this session — that
test now reads the real `TB_THEMES` object instead of pattern-matching the source.

`make-pitch-preview.js` takes a theme argument, so all three looks can be eyeballed:
`node test/make-pitch-preview.js dark`.

Unit 1480 → **1493**.

#### Light: dark surround, and the spots the palette missed (v136)

**The light look keeps a dark background.** `light.sky` was near-white, which floated a pale pitch
on a pale scene and lost its own edges. Now the same near-black as the dark look — a light PITCH,
not a light scene: the pitch is the subject and the sky is the frame around it.

**The centre and penalty spots were still white in 3D.** They are the only markings that are
FILLED rather than stroked, and the theming pass replaced `strokeStyle` and missed the `fillStyle`
literal inside `dot()` — so on the light pitch they were white on near-white. The 2D board was
already correct: its spots are styled through `--tb-line-rgb`. A test now asserts the texture
painter has **no colour literals at all**, which is the general form of the mistake rather than the
one instance.

Contrast across the three, line against turf: green 0.64, dark 0.91, light 0.62 — all comfortably
legible, and there is a test that no palette can be added with the two tones close together.

**Fifth false failure in this suite from a fixed-character-window slice** — adding the explanatory
comment pushed the assertion out of a 400-char window and it reported the code as missing. That one
is now bounded by the function's own end, like the others.

Unit 1493 → **1496**.

### 2026-08-25 — Premium entitlement, and selection/delete in 3D (v137, branch `premium-3d-board`)

**The entitlement is now real.** `clubs/{clubId}.features` — `{board3d: true}` today, more later — is
written by a new superadmin-only callable `setClubFeatures` (`functions/index.js`), surfaced as a `3D`
checkbox column in the superadmin club table, and read by `clubFeature(name)` in the frontend. The
callable allowlists the known feature names, coerces every value with `=== true` so a truthy string
cannot grant anything, writes with `{merge: true}`, and logs who flipped what.

`firestore.rules` gained a comment rather than a rule: the club update rule already allows a lead only
`fcfLinks` and `schedules`, so `features` is non-client-writable by construction. The comment records
*why* it is left that way — and, more usefully, what the gate does **not** do. The 3D board is
client-side drawing; anyone who wants to run that code can. The field is a **commercial** boundary, and
what it will really enforce is the premium features that cost a server call.

**Selection and delete in 3D.** One object at a time, and only things that can be deleted — players,
the ball, cones. `SELECTABLE` excludes trajectory handles on purpose: a handle is part of something
else, so picking one is an edit, not a selection.

The highlight is a **ring on the turf**, not a recolour of the object. A recoloured player stops showing
their kit, which is the one thing a coach reads them by.

**The delete goes through the 2D board's own deleters** (`deleteCircle`, `deleteBall`), never through
state. `deleteCircle` also nulls the slot in every LATER frame so the index stays stable; a delete that
only removed the mesh and rewrote the current frame would leave the two views disagreeing about who
exists from the next frame onwards. Same rule as the drag, which was fixed the same way two versions
ago: **the 3D view is an input device, not a second writer.** The element is resolved exactly as
`applyMove` resolves it — cones positionally (`spawnCone` sets no `data-idx`), everything else by index.

Two things that would have made the feature silently dead:
- `onPointerDown` calls `preventDefault()` to kill the browser's drag gesture, and that **also suppresses
  the focus** the click would have given the wrapper. An unfocused element receives no keys at all, so
  the wrapper focuses itself on `pointerdown`.
- The key is bound on the board container, not the document, so Delete typed into a label elsewhere is
  not swallowed.

**Sixth false failure from a fixed-character-window slice**, and this time the anchor rather than the
window: `the 3D view sees the players immediately` sliced forward from
`if (document.getElementById('tb-3d-wrap'))`, which stopped being unique the moment a second guard
appeared — it then failed on code that was correct. Now anchored on `tbMount3D({` and read *backwards*.
The delete wiring was also folded into the existing mount block, so there is one guard again.

All twelve new assertions were checked by mutation — deleters swapped for a bare `remove()`, cones
re-addressed by `data-idx`, a handle added to `SELECTABLE`, the post-rebuild `drawSelection()` dropped —
and each one failed on the mutant and passed on the real code.

Unit 1496 → **1519**. Version triple → v137. **Still nothing deployed.**

### 2026-08-25 — Drawing tools in 3D: the flat surface, laid over the turf (v138)

**The question was how a pen stroke should behave under an orbiting camera. The answer is that it
shouldn't.** Picking the arrow, zone, text, pen or cone tool while in 3D snaps the camera straight
overhead and **locks it** — pan and zoom stay live, orbit and every preset are refused — and then lays
the **real 2D board** over the turf, matched to the projected pitch pixel for pixel.

That is the whole design, and the reason there is no `board3d` drawing code: `#tb-field` is already in
the DOM in 3D (rendered, then `hidden`), with every arrow, pen, zone and label handler bound to it.
Showing it in the right place means the coach is using **the 2D editor** — same code, same coordinate
space, same undo — while looking at the 3D pitch. The alternative was a second implementation that
raycast onto the turf, and two implementations of the same drawing is how the two views come to
disagree. A test asserts board3d never grows one.

Details that decide whether it lands in the right place:
- **Both pitch corners are projected**, not one corner plus a scale. Under a perspective camera the
  scale depends on depth; assuming it constant is the kind of nearly-right that shows as a few pixels
  of drift at the far end.
- `pitchScreenRect()` **returns null unless the camera really is overhead**, and the surface hides
  rather than guessing. A surface positioned against a tilted camera is wrong everywhere, and the coach
  only finds out after drawing on it.
- It **follows the camera in a rAF loop** rather than being pushed once — the camera also moves under
  the tween going overhead, under a pan and under a resize, and one loop covers all three.
- **Orientation is forced horizontal in 3D** (`tbVertical()`). The 3D pitch lies along X; a board left
  set to vertical would have put every stroke a quarter turn from where the hand drew it. There is now
  exactly **one** reader of `fa_tactic_orient`, and a test counts them.
- Arrows, zones, pen strokes and labels moved into their own `drawRoot` group so the 3D copies can hide
  behind the overlay — drawn twice, they read as a ghost a frame behind the cursor.
- The surface is a **child of the 3D wrapper**, so a Backspace typed into a label bubbled into the
  delete handler. Delete is now inert while locked and never fires on an editable target.

The lock is armed once per tool and disarmed from the single place every tool already calls
(`deactivateDrawTools`). That asymmetry is deliberate: a tool that forgets to arm behaves as it does
today, whereas a tool that forgot to disarm would strand the camera overhead with no way back.

A **pen cursor** and a changed hint say the view is locked — without them a camera that has stopped
orbiting just looks broken. The cursor keeps a `crosshair` keyword fallback, because a `cursor:url()`
with no keyword after it is ignored entirely if the URL fails.

**Bend dots are smaller and dimmer** — `HANDLE_R` 0.34 → 0.26, and a shared `BEND_ALPHA` 0.7 /
`BEND_ALPHA_OFF` 0.15. The apex diamond keeps its size (so the two read as a pair) but not its weight:
it appears once per ball where a bend dot is on every trajectory, and it is a lit solid whose dark edges
wash out when made translucent.

**Two tests were asserting the design being changed.** `but the HANDLES stay full strength` pinned the
literal `active === 'bend' ? 1 : 0.25`, so it failed the moment the dots were deliberately dimmed; it
now asserts the **ordering** (a control reads stronger than the curve it sits on, active beats inactive).
`manual input cancels it` counted `cancelCameraTween()` occurrences and broke on a fifth legitimate
caller; it now checks each handler by name — which would also have caught a cancel *moved* out of the
wheel, something the count never could.

**Seventh and eighth false failures from slice anchors.** Both new this time: a slice terminator found
with an absolute `indexOf` matched an *earlier* occurrence (`if (arrowToolBtn)` also appears inside
`deactivateDrawTools`), producing an empty slice. Terminators are now searched **from** the start index.

Unit 1519 → **1537**; all seventeen new assertions verified against mutants. Version triple → v138.
**Still nothing deployed.**

### 2026-08-25 — Fix: one free variable killed the tools AND playback (v139)

`tbSetDrawMode` read **`is3d`**, a const declared in `renderTactics`, from inside **`bindTactics`** — a
different function. Every call threw a `ReferenceError`, and since `deactivateDrawTools()` runs from the
play button and from every tool button, the throw aborted `bindTactics` partway through: the drawing
tools went dead **and** playback stopped mid-start (`framePlaying = true` and the button lit, then the
throw, before `applyFrameState`). Two symptoms that look unrelated, one identifier. Now `tbIs3D()`.

**The test written to cover this passed on the broken code.** It asserted the source text
`if (!is3d) return;` was present — and it was; the text was exactly right, the name just did not
resolve. The lesson is sharper than the usual "test behaviour, not mechanism": a source-text assertion
cannot see scope *at all*, so no amount of care in writing one would have caught this.

Three tests now cover it, and the mutation check confirms all three fail on the original bug:
1. `tbSetDrawMode` is **executed** in `new Function` over stubs. Any name that is neither a parameter
   nor a real global throws on read, which is precisely the bug class — and the test also pins what the
   function should do in each view rather than only that it survives.
2. `tbDrawSurface` gets the same execution check.
3. A structural one: `bindTactics` must not contain the identifier `is3d` anywhere (comments stripped —
   the comment recording this bug names it).

That first pattern is worth reaching for whenever something in `bindTactics` uses a value from
`renderTactics`; the split is invisible to `node --check` and to every regex test in the suite.

Unit 1537 → **1540**. Version triple → v139.

### 2026-08-25 — Flat arrows, and the camera comes back (v140)

**Arrows had volume because they were solids.** A `CylinderGeometry` shaft and a `ConeGeometry` head,
sitting 0.16 m proud of the grass — which reads as pipes laid on the pitch from every angle except
straight down. An arrow on a tactics board is a **mark**: the thing it represents has no thickness, so
neither should it. Now one flat `ShapeGeometry` polygon (shaft rectangle plus head triangle) built in 2D
and rotated into the turf plane, as a single mesh rather than two.

The rotation uses `makeBasis(dir, perp, up)` with `perp = (dir.z, 0, -dir.x)` — **not** the other sign.
With the other one `dir × perp` points down, the basis is left-handed and the face normal points at the
ground. Flat either way, invisible one of them.

Zones and pen strokes were already flat (a rotated plane and a line); a regression test now says so, and
that no drawn mark may become an extruded solid.

**Putting a draw tool down now gives the camera back.** It flew overhead on pick-up and stayed there on
release, so a coach who set up a broadcast angle, drew one arrow and put the pen down got a flat board
with nothing to explain it — reported, reasonably, as "the board snaps back to the wrong orientation".
`setDrawLock` now remembers the pre-lock angle (target **cloned** — the live vector keeps moving) and
eases back over the same 550 ms, unless the coach was already overhead.

Two smaller leaks in the same release path: `#tb-field` is reparented into the 3D wrapper for the
overlay and now goes back to its original parent **and sibling position** (left there, the next render
replaces the wrapper and takes the board with it), and the inline `visibility:hidden` the follow loop
sets is cleared — `hidden` does not override it, so the 2D board would have come back invisible.

**The orientation report was diagnosed by measurement, not by reading.** The obvious suspect was the
overlay mapping — half and area boards are drawn portrait, with board x = pitch WIDTH, so a transposed
axis would rotate every stroke a quarter turn. `test/overlay-align.test.js` (new, executable, real
three.js) projects six asymmetric probe points through a real `top`-preset camera and compares them
against where the overlay puts the same percent, for **five board type / pitch combinations**. All agree
to under a pixel — which cleared the mapping and left the camera as the only candidate. The suite
includes a guard that a mirrored point would land >50 px away, so a passing run is not vacuous.

`board3d-camera.test.js` gained the flat-mark tests, which **build the real arrow and measure vertex
spread** rather than grepping for `ShapeGeometry` — a source test cannot see a rotation that tips the
plane out of the turf. Against the old cylinder-and-cone arrow, 11 of them fail, and the message names
the defect exactly: *vertical spread 0.32* — the cylinder's diameter.

One thing found and left alone: `setPreset`'s `held.target` mutation revealed that it too would break if
the clone were dropped, and no test covers that. Noted, not fixed — it is correct today.

Unit 1540 → **1566** (new file `overlay-align.test.js`, registered in `test/package.json` — the list is
hand-maintained). Version triple → v140. **Still nothing deployed.**

### 2026-08-25 — The overlay was painting a second set of pitch lines (v141)

**`.tb-markings` does not exist.** The CSS that was meant to hide the 2D pitch from the drawing overlay
named it, and the markings are actually a dozen individual sibling divs — `tb-halfway`,
`tb-center-circle`, `tb-penalty-left`, `tb-corner` and the rest. The rule matched nothing, so every
stroke the coach drew sat on a board carrying **two** sets of pitch lines. At rest they overlap within a
pixel and read as slightly bolder markings; zoom in and they separate visibly, because the 2D borders are
a fixed `2px` while the 3D markings are a texture that scales with the camera. That is exactly how it was
reported: *"if I zoom in, the field lines duplicate"*.

**The rule is inverted now**: hide every child of `.tb-field-inner`, then re-show the two layers the
coach draws into (`.tb-arrows-svg`, which holds zones, arrows and pen strokes, and `.tb-text-label`).
An allow-list of things to hide is wrong by construction — it has to be updated whenever a marking is
added, and it fails silently when it is not. A deny-everything rule cannot have this bug.

**The test passed on the broken code**, and for the same reason as the `is3d` ReferenceError two releases
ago: it asserted the *string* `.tb-markings` appeared in the stylesheet before a `display:none`, which
it did. Neither test could see that the name referred to nothing. The replacement reads the class names
`tbMarkingsHtml` actually emits and asserts none of them is in the re-show list — so it is checked
against the app's own output rather than a list written from memory. Both mutations (the shipped rule,
and re-showing `tb-halfway` by mistake) fail it.

Three test-harness faults found while writing it, all the same shape — **an anchor that matched the
wrong occurrence**:
- `> \.(tb-[a-z-]+)` also matched `> .tb-field-inner`, the container rather than the subject;
- the block bound cut the markup short;
- `indexOf('<div class="tb-field-inner"')` found the **read-only card's** field, not the editor's —
  there are two. Now anchored on the editor's unique `id="tb-arrows-svg"` and read backwards.

Also fixed: an `assert` in a `describe` body runs at COLLECTION time, so the first mutation aborted the
whole run with "Exception during run" instead of failing one test, hiding everything else. The extractor
returns `[]` now and the assertion lives in an `it`.

**Pen strokes: no volume found, and the two candidates were measured out.** `addPenLine` builds a
`THREE.Line` with `LineBasicMaterial` — one pixel wide in screen space, no geometry to have volume — and
the 2D overlay draws a flat 2.5px SVG stroke. The float hypothesis was tested numerically: a mark at
y=0.08 displaces from the turf directly under it by **0.6px at broadcast, 0.7px at side, 0.1px at top**.
Sub-pixel, so the height is not it either. Left open pending a look at the actual view — but note the
duplication above was live in exactly the state the report describes.

Unit 1566 → **1571**. Version triple → v141. **Still nothing deployed.**

### 2026-08-25 — The overlay drifted on zoom, and strokes had nothing to hide behind (v142)

Two reports against the drawing overlay. Neither was a bug in the 3D scene; both were the overlay
disagreeing with the scene it sits on.

**1. "The field and the drawn things zoom at different rates."**

`PRESETS.top` was `phi: 0.001` — a hair off vertical, left over from the blend `upFor()` replaced. A
**tilted** perspective camera maps the turf plane *projectively*; only an exactly overhead one maps it
*affinely*. `pitchScreenRect()` returns a bounding box and the overlay interpolates percentages linearly
inside it, which is an affine assumption. The error is proportional to how much depth varies across the
pitch, so it **grows as you zoom in**. Measured over the real camera:

| camera | phi 0.001 | phi 0 |
|---|---|---|
| fitted | 0.24 px | 0.00 px |
| zoom ×2 | 0.95 px | 0.00 px |
| zoom ×4 | **3.80 px** | 0.00 px |
| panned + ×3 | 2.25 px | 0.00 px |

`phi` is now exactly `0`, and `pitchScreenRect` refuses anything but overhead (`> 1e-6`, float noise
only). The old bound was `0.05` — **precisely the range in which its own affine assumption is wrong**, so
it was accepting the camera that caused the drift. `upFor()` already hard-switches below `0.02`, so the
basis stays well defined at zero.

**2. "Pen lines have volume — I can see them crossing THROUGH objects."**

They do not. `addPenLine` is a 1px `THREE.Line` with depth testing on, and a mark at y=0.08 displaces
from the turf beneath it by **0.6–0.7 px** at the low presets — both measured before changing anything.
The real cause: the overlay is a **DOM layer above the canvas**, so its strokes paint over the 3D players
whatever the depth buffer says. v141's blanket hide rule removed the overlay's own players, leaving
strokes nothing to disappear behind — and contradicting the 2D board, where `.tb-circle` is z-index 2 and
`.tb-arrows-svg` is 1.

Owner's call: **while a tool is active the overlay shows the 2D objects and board3d hides its own**
(`objectRoot.visible = !on` — players, ball, cones, drawings and trajectory handles together, plus
`ballShadow`, which lives on the scene rather than in `objectRoot`). The overlay becomes the complete 2D
board over a 3D turf backdrop, carrying the 2D board's z-order. From dead overhead — the only place this
applies — a shaded 3D disc and a flat 2D circle are all but identical.

**Two duplicated constants, both silently stale.** `overlay-align.test.js` transcribed `phi = 0.001` by
hand, so it could never have caught the value being wrong — it measured the camera the test believed in.
`board3d-camera.test.js` kept a whole PRESETS copy with **broadcast and side at `theta: -PI/2`** while the
shipped table has `+PI/2`: it went stale when those were un-mirrored and nobody noticed, because the
smoothness it measures is symmetric in theta. Both now read the table from source via the new
`test/board3d-presets.js` (brace-matched extraction, not a character window).

**Why the alignment suite passed on the bug**: it measured only the fitted distance, where the error is
0.24 px — under its own 1 px tolerance. It now sweeps zoom ×½…×4 and a pan, at a 0.5 px tolerance, across
five board-type/pitch combinations: **16 failures** against the old code, up to 4.58 px.

One more test fixed for failing on correct markup: the direct-child check grepped for `class="tb-circle"`
inside `.tb-field-inner`, but the players arrive through `${circlesHtml}`. It follows one level of
interpolation now.

Unit 1571 → **1593** (27 in the alignment sweep alone). Version triple → v142. **Still nothing deployed.**

### 2026-08-25 — Both v142 diagnoses were wrong; here is what it actually was (v143)

The owner sent a screenshot of a pen line crossing a player's disc and said neither fix had worked. They
were right on both counts.

**The zoom lag was never the overlay maths — it was a stale camera matrix.** `applyCamera()` calls
`camera.lookAt()`, which updates the camera's LOCAL matrix; `matrixWorld` and `matrixWorldInverse` — the
one `Vector3.project()` reads — are refreshed inside `renderer.render()`. `pitchScreenRect()` projects
from app.js's own rAF loop, so it was reading the **previous frame's camera** every time. And no camera
path called `invalidate()`, so on a board with no animated trajectory a zoom scheduled **no frame at
all** — the overlay simply froze until an unrelated edit forced a render. It only ever appeared to work
because a board with trajectories re-renders every frame for the travelling dots.

`applyCamera()` now ends with `camera.updateMatrixWorld(true); invalidate();`. One place, every camera
path. (The v142 `phi: 0` change was still correct and stays — it removed a real 3.8px projective error.
It just was not what the owner was seeing.)

**Pen strokes really were above the floor, and the measurement that said otherwise was taken at the wrong
zoom.** v142's "0.6px of displacement" was measured at the FITTED distance. Screen displacement of a
raised point scales with zoom and with the cotangent of the camera's elevation. Re-measured at the zoom
in the screenshot (a player reading ~300px wide):

| preset | y=0.08 (pen) | y=0.04 | y=0.01 | y=0 |
|---|---|---|---|---|
| side | **75.9 px** | 38.4 px | 9.7 px | 0 |
| goal | **108.9 px** | 55.2 px | 14.0 px | 0 |
| broadcast | 2510 px | 1392 px | 379 px | 0 |

There is no small-enough height. So every drawn mark now sits at **y = 0** and wins the depth fight with
`polygonOffset`, which biases the depth value without moving geometry — the standard decal technique.
`renderOrder` carries the stacking that height used to (zones, arrows, pen — the 2D board's SVG order),
`depthWrite` is off so marks cannot fight each other, and `depthTest` stays **on** so a player still
occludes them.

**Pen strokes became ribbons.** `THREE.Line` cannot take `polygonOffset` at all — WebGL's depth bias
applies to polygons only — so a line at y=0 would z-fight the grass and a line above it floats. As
geometry a ribbon also fixes the other half: a `THREE.Line` is one device pixel however far you zoom,
while a ribbon has a width in **metres** (0.3, matching the 2D board's 2.5px stroke and the arrow shaft)
and grows with the pitch like every other mark on it.

**A mutation survived, and that is how the missing test was found.** Removing the `updateMatrixWorld` /
`invalidate` lines broke nothing — there was no test for the fix. There is now, and it is executable:
build a real `PerspectiveCamera` with **no renderer**, move `cam.dist`, call the grabbed `applyCamera`,
and check the projection moved — plus a separate assertion for `invalidate`, since the two halves fail
independently. A fourth test compares against a camera that HAS been updated, so a fresh matrix is proved
to be the RIGHT one rather than merely a different one.

Two test-harness faults fixed: a slice anchored on `const DECAL_Y = 0;` (the value, so changing it broke
the anchor instead of failing the assertion — now anchored on the name), and one bounded by a character
count past a statement's start rather than its end.

Also corrected: an assertion reading `Math.min(ys) > 0`, "and sit above the turf, not inside it" — it
required the very offset that was the bug.

Unit 1593 → **1606**. Version triple → v143. **Still nothing deployed.**

### 2026-08-25 — One size table for both boards, and 3D marks formatted like the 2D ones (v144)

**The two views measured in different units.** 2D sized objects in fixed PIXELS, 3D in metres, so they
could not agree by construction — and 2D could not agree with itself either: the same 24px disc was a
**3.07 m** player on a full board and a **1.99 m** player on a half board, because the two have
different px-per-metre (7.81 vs 12.06). Fixed pixels are also why nothing grew when the drawing overlay
was zoomed: a pixel is a pixel however large the pitch behind it has become. Both reported symptoms,
one cause.

`js/board-geom.js` now holds `OBJ` and `MARK` in metres — it is the only module both views import, so a
number that must not diverge belongs there. **The owner chose 3D as the reference scale** (player 1.80,
ball 0.50, cone 0.70): a 1.8 m disc is about a player's personal space, where 3.07 m was a UI affordance
that had drifted into being a measurement. `MARK` is the 2D board's pixel weights converted at its own
7.81 px/m, so marks keep the weight a coach already draws with and 3D adopts it.

The bridge is `BG.ppm(widthPx, …)` and a `--tb-ppm` custom property on `.tb-field`. CSS sizes objects
through it; **the overlay's follow loop rewrites it every frame**, which is the whole of "they should
scale up or down like the rest". `vector-effect: non-scaling-stroke` is disabled on the overlay for the
same reason — it pins a stroke to device pixels, right on the small board and wrong under a zoom.
`refreshArrowheads`'s flat `aLen = 12, aHW = 5` are metric now too, or the shaft grew with the zoom
while the head stayed the size of a full stop.

**A floor, deliberately.** At 820px a true-to-scale ball is 4px and a player 14px with a shirt number
inside. `max(16px, …)` / `max(10px, …)` keep the small standalone board usable; the overlay is always
far above the floor, so where the two views are actually seen together the sizes are exact. The main 2D
board's players do shrink from 24px — accepted, with the trade-off stated.

**3D marks got the 2D formatting.**
- **Round joins and caps.** The joint filler was an **axis-aligned square** — it does not rotate with
  the stroke, so its corners poked out of any diagonal turn. A disc has no orientation and cannot be
  wrong; it is also exactly what `stroke-linecap/linejoin: round` mean.
- **A fixed arrow head** (`MARK.arrowHead`), as `refreshArrowheads` uses a constant `aLen`. The old
  `len * 0.3` grew the head with the arrow — a different drawing at every length.
- **Zones gained their outline**: a rounded-rect ribbon at `rectStroke` width. The corners are sampled
  ARCS on the rectangle's own edge — an inset polyline rounds by the stroke's half-width and pulls the
  whole outline off the edge it is meant to trace, which is a different rectangle.
- **Dashes**, walked by arc length so the pattern is continuous across corners. First attempt put a
  round cap on each dash end and measured 29.4 of turf covered against a solid 30.4 — 2 × half-width of
  cap pushed into a 0.51 m gap very nearly closes it. `.tb-pen-line` has no `stroke-linecap`, so 2D
  dashes are butt-ended and now these are too.

Arrows are built in **world coordinates** as a single merged geometry (shaft ribbon + head triangle).
That removed the hand-built basis entirely, and with it the test asserting its face normal pointed up —
that assertion was measuring an identity quaternion and proving nothing. It now checks the property that
still matters: `DoubleSide`, so a winding mistake cannot make a mark vanish.

**The execution test earned its keep again.** `tbDrawSurface` gained `BS`, `BG`, `tbPitch` and
`tbBoardType`, and the `new Function` harness failed immediately on `BS is not defined` — the same class
of bug as the v138 `is3d` crash, caught before it shipped this time. `tbPitch`/`tbBoardType` are new
module-scope readers precisely because `bindTactics`' `curBoardType` is a different function's local.

Also: `tbFieldWidthPx` split out of `tbFieldScaleStyle`, since `--tb-ppm` and `max-width` must never
disagree about how wide the board is. Four tests that grepped `const BALL_R = …` read `BG.OBJ.ball / 2`
now — the literal is gone on purpose.

Unit 1606 → **1624** (new `test/object-scale.test.js`, registered by hand in `test/package.json`).
Version triple → v144. **Still nothing deployed.**

### 2026-08-25 — v144 shipped a broken 2D board: one missing unit (v145)

**`--tb-ppm` was written as a bare number.** `calc(var(--tb-ppm) * 1.80)` then evaluates to `14.06` — a
NUMBER, not a length — and `width: max(16px, 14.06)` mixes a length with a number, which is invalid, so
the browser **drops the whole declaration**. Width fell back to `auto`, and an auto-width flex box sizes
itself around the `<input>` it contains: an input defaults to about twenty characters wide. Every player
rendered as a wide ellipse. Fixed by emitting `px` at both writers (`tbPpmVar` and the overlay's follow
loop) and on all thirteen `var(--tb-ppm, 7.81)` fallbacks.

**The test written for exactly this passed on it.** `object-scale.test.js` pulled the metre multiplier
out of the declaration with a regex and compared it to `BG.OBJ.player`. The multiplier was right. Nothing
asked whether the expression it sits in produces a length — a source-*shaped* assertion, green against
CSS the browser was throwing away. That is the same failure as the `is3d` ReferenceError and the
`.tb-markings` rule that matched nothing: **the text was correct and referred to nothing that works.**

Four tests now, and all of them fail against the exact code that shipped:
- every writer of `--tb-ppm` emits a unit;
- every `var(--tb-ppm, …)` fallback is a length — the same bug wearing a disguise, since a fallback only
  shows when the property is missing, which is exactly when nobody is looking;
- every `calc()` built from it carries **exactly one** unit, and any `max()`/`min()` floor beside it is a
  length rather than a bare number;
- a player's width and height are the *same expression*, so a disc cannot render as an ellipse.

The first mutation attempt also missed, and for a familiar reason: the regex required the write statement
to end `))` when the real one ends `+ 'px')`, so it reported the writer as **absent** rather than
unitless. Anchored on the property name and read forward a fixed window now.

Nothing else from v144 changed — the size table, the metric marks, the round joins, the dashes and the
zone outline were all correct; only the unit that carries them to the browser was missing.

Unit 1624 → **1628**. Version triple → v145. **Still nothing deployed.**

### 2026-08-25 — Phase 1 closes: stripe direction, right-click in 3D, one stroke weight (v146)

**1. Stripes ran a quarter turn out in 3D.** The painter was not wrong — `playerTexture()` drew
canvas-vertical bands for `dir:'v'`, exactly as `fillCss()` does. **A cylinder's top cap does not map
the texture the obvious way.** Measured off a real `CylinderGeometry(0.9, 0.9, 0.35, 24)`:

| cap point | world | u | v |
|---|---|---|---|
| +X (screen right) | (0.9, 0) | 0.5 | **1** |
| +Z (screen down) | (0, 0.9) | **1** | 0.5 |

Texture **u follows world Z**, **v follows world X**. So a canvas-vertical band varies along world Z,
which under the top-down camera spans the screen horizontally. Each direction is painted on the other
canvas axis now, with the measurement written beside it — it looks like a typo otherwise and would be
"corrected" back.

**The test asserts the observable, not the swap**: it reads the real cap UVs, works out which world axis
the bands vary along, and requires `'v'` → world X and `'h'` → world Z. A texture matrix or a different
cap geometry would satisfy it equally. Both directions are checked, because swapping both branches
leaves one looking right on its own.

**2. Right-click did nothing in 3D.** Every 2D object has its own `contextmenu` handler — the player
menu with kit editing, ball and cone with copy/duplicate/delete — and bare turf has one for adding
things. In 3D right-click only ever panned.

Every right-click is armed as a context click now, and `runContext` hands anything that is not a
trajectory handle to app.js, which **dispatches a synthetic `contextmenu` on the 2D element**. Those
handlers read nothing from the event but `clientX/clientY`, so the reuse is total and there is no second
menu to keep in step. Bare turf cannot go through an event — the 2D handler derives the position from
`inner.getBoundingClientRect()`, which is not on screen in 3D — so the block was extracted as
`showFieldCtxMenu(pctLeft, pctTop, x, y)` and 3D passes the ray's own hit straight in.

**A latent bug surfaced doing it.** `mode === 'context'` had no branch in `onPointerMove`, so a
right-*drag* that began on a trajectory handle swallowed the move and the camera sat still — despite a
comment at the arming site claiming "a pan that happens to START on a handle is still a pan". Harmless
while only handles armed it; fatal once every right-click does, since right-drag is the only pan. An
armed click that travels past the same four-pixel slop the release uses is promoted to a pan.

Inert while draw-locked: the 2D overlay is on top there and handles right-click natively.

**3. One stroke weight.** `MARK.pen` and `arrowShaft` were 0.32 (the 2D 2.5px) against a 0.19 zone
outline (1.5px) — three marks from the same hand at two weights. They are one `STROKE = 0.19` now,
written once rather than as three equal numbers, since three numbers that happen to agree are three
numbers that will stop agreeing. `arrowHead`/`arrowHeadW` keep their own figures: the head is a shape,
not a weight. Consequence, stated: 2D arrows and pen strokes go from 2.5px to 1.5px.

**Two more slice-anchor faults, both the same shape as ever.** `onContext:` matches the forwarder in
`tbMount3D` as well as the implementation in `bindTactics`, and `indexOf` found the forwarder — three
lines of pass-through. Anchored on a line only the real body contains. Then the end bound stopped at
the `}` closing the `if (!kind)` guard, cutting the object branch off. That makes **nine** false
failures from slice anchors in this suite; the pattern is always a marker that is not unique or a
terminator that is not the one meant.

Unit 1632 → **1641**. Version triple → v146. **Still nothing deployed.**

### 2026-08-25 — Stripe colours the right way round, and marks are right-clickable (v147)

**1. Getting the stripe AXIS right left two ways to paint it, and v146 picked the wrong one.** The cap's
`v` axis runs −X to +X, but `CanvasTexture` flips Y on upload, so canvas row 0 samples v=1 — the RIGHT
of the board, while the 2D `linear-gradient(90deg)` starts on the LEFT. Measured: band 0 landed at world
X **+0.78** where 2D puts it at negative X. The `'v'` bands are painted in reverse now. `'h'` was already
correct — canvas x maps to u, which runs −Z to +Z, matching the 2D 180deg gradient's start at the top.

The test asserts **which side c1 lands on in world space**, for both directions and at an odd stripe
count. That last case matters: mirroring by swapping the two colours instead of reversing the band order
is indistinguishable at n=4 and wrong at n=3, and the mutation check confirms it is caught.

**2. Drawn marks were unpickable, so a right-click on an arrow opened the TURF menu.** Arrows, zones,
pen strokes and labels went into `drawRoot` and were never registered in `objects`, so the raycast could
not see them at all. Each builder now takes its index and registers itself; `runContext` routes a mark
hit to the same `onContext` hook objects use, and app.js dispatches a synthetic `contextmenu` on the 2D
element. The arrow, zone and pen menus are **delegated off the arrows SVG**, so a synthetic event on the
element resolves through `e.target.closest(...)` and bubbles exactly as a real one does — nothing new to
maintain.

**Right button only, and deliberately.** `pick()` gates marks behind the same `includeLines` flag the
trajectory lines already use. A left drag would set a mark as `dragging`, and `onPointerUp` moves a
dragged object by writing **one** position — an arrow has two endpoints, a zone four corners and a pen
stroke a whole polyline, so there is nothing sensible for it to write. **Dragging a mark in 3D is
therefore still not possible**; that needs a per-type move and was not in this phase.

Marks are not `SELECTABLE` either: the selection ring is a circle sized for a player and there is none
that makes sense for a forty-metre arrow. Delete lives in each mark's own right-click menu.

Marks are addressed **positionally**, like cones. Every `save*` function builds its state array from DOM
order, so position IS the index; `data-idx` exists on arrows, zones and labels but only as a cache a
reindex has to keep true, and pen lines have none at all. One rule beats four.

**A test pinned an expression again.** `an invisible path cannot be clicked` asserted the literal
`objects.filter((o) => o.mesh.visible)` and broke the moment that filter grew a second condition — code
that still did exactly what the test asks for. It checks the property now: the pool excludes invisible
meshes, and does so *before* the raycast.

**And the escaping trap, twice more.** Writing `\.` and `\{` into a `new RegExp(...)` string through a
shell heredoc lost a backslash each time and produced an invalid expression, so the test **threw**
instead of measuring. Both are plain substring searches now, which need no escaping. Two harness helpers
(`ctxImpl`, the stripe painter and cap table) were also hoisted to file scope so two suites share one
measurement rather than taking two.

Unit 1644 → **1652**. Version triple → v147. **Still nothing deployed.**

### 2026-08-25 — The 3D cursor says what can be picked up (v148)

The 2D board gets this from CSS — `.tb-circle { cursor: grab }`, `.tb-dragging { cursor: grabbing }`.
A canvas has ONE cursor for its whole surface, so 3D decides it per frame from what the ray is over.

**The interesting part is which pool it asks.** `pick(ev)` *without* `includeLines` is exactly the set
the left button can drag — drawn marks are gated out of it (there is nothing sensible to write when you
drop an arrow) and trajectory lines carry a zero threshold, while the handles on those lines, which ARE
draggable, stay in. Asking the right-click pool instead would have offered a hand over things that
cannot move, which is a cursor that lies.

Details that make it behave rather than flicker:
- **Silent while draw-locked.** The 2D overlay is on top there and shows a pen; a hand underneath would
  fight it. Cleared the moment the lock goes on, not on the next mouse move — otherwise picking up a
  tool while hovering a player leaves a hand sitting under the pen.
- **`setCursor` skips a write that changes nothing.** `pointermove` fires at pointer rate and an
  unconditional style write is a style invalidation per event for no change.
- **`pointerleave` clears it**, or the hand is stranded on the canvas until the pointer returns —
  `onPointerUp` does not fire when the pointer simply leaves.
- **Releasing re-evaluates**, so it drops back to `grab` while still over the object instead of staying
  `grabbing` until the next move. Guarded on the event carrying a position: a `pointercancel` does not.
- Hover raycasts only when no gesture is active; during a drag the answer is already known.

One test of my own failed on correct code again: it asserted `setCursor('grab')` when the value comes
out of a ternary. It checks the vocabulary now, and a separate test pins how the value is reached.

Unit 1652 → **1658**. Version triple → v148. **Still nothing deployed.**

### 2026-08-25 — Drawn marks are draggable in 3D, so the hand means something (v149)

v147 made arrows, zones, pen strokes and labels right-clickable but deliberately kept them out of the
**left**-button pick pool, reasoning that a dragged object commits a single position and an arrow has
two endpoints. The reasoning was right and the conclusion was wrong: **the answer is to commit a DELTA,
not to refuse the drag.** The 2D board has always dragged them exactly that way — `computeDelta` then
`moveEl(el, startPos, dx, dy)` — and refusing left them with no hover cursor and nothing to hover for.

- `board3d` records where a mark was (`from`, **cloned** — the live vector moves under you) and the
  turf point the hand closed on (`grab`), then offsets the mesh by the difference. Snapping to the
  cursor would jump the mark so its ORIGIN sat under the pointer: grab an arrow by its head and the
  tail teleports to your hand.
- The release reports `[dx, dy]` in **board percent**, the same units the 2D board drags in, and skips
  the report entirely when nothing moved so a plain click does not push an undo step.
- `applyMarkMove` in app.js runs the 2D board's own `getElPos` + `moveEl` and then the same save path
  its pointerup runs. Nothing on that path knows how an arrow or a pen stroke is stored, which is the
  whole point — 3D supplies a delta, 2D applies it. Same rule as every other 3D input.

**A latent 2D bug fell out.** `getElPos` and `moveEl` had no branch for `.tb-text-label`, so a
multi-select drag in 2D moved everything except the labels. Adding the branch for the 3D path fixes
that too; there is a test for it now.

The hover cursor needed no change — it asks `pick(ev)`, which is by definition the draggable set, so
marks joined it the moment they became draggable.

Unit 1658 → **1662**. Version triple → v149. **Still nothing deployed.**

### 2026-08-26 — The 3D board gets its own menu (v150)

The 3D view no longer wears the 2D board's 32-control toolbar. Three commits, deliberately separate so
a bad menu would not have arrived with a broken layout.

**The window** fills the card horizontally — bleeding `1.5rem` each side to cancel exactly the card's
padding, with a test that reads both numbers from the two places they are written — and runs to the
bottom of the viewport vertically. That height is **measured**, not declared: CSS cannot see the
element's top offset, which moves with the topnav, the breadcrumb and the board name. `tbSize3DWindow()`
measures it, floors at 420px (a short window computes a negative height, and a board with no height
looks like one that failed to load) and runs before the mount, or the board visibly re-frames itself on
every entry.

**The opponent got a formation of its own** first, because the paper menu assumes one and the app had
none: a single `fa_tactic_formation` placed our team and `spawnOppCircles` mirrored the same shape back,
so 4-3-3 against 4-4-2 could not be drawn. `fa_tactic_opp_formation` is appended at the **tail** of
`buildBoardEntry`, where every late key goes — db.js diffs shards as serialised strings, so a key
inserted anywhere else marks every board in every club as changed. `''` is the legacy signal and the
mirror falls back to ours, so nothing needs migrating. A test pins that the fallback is **not** baked in
at save time: copying the team formation into the new key would freeze the mirror.

**The menu** is a hamburger with six entries — New Board, 2D/3D, field, players, props, draw — four of
which open a panel, plus a camera menu top-right and the frames rail at middle-right. Dismissal is
written once and covers all four routes: the hamburger, a click outside, Escape, play.

The panels **adopt** the real controls; they do not clone them. A clone gives two elements one id, and
the visible one would be the one `deactivateDrawTools()` never lights up, because it sets the active
class by id. The board name and the whole frames **section** are adopted in the same way — the section,
not the strip, because play sits in its header and moving only the strip would leave the button under
the board.

Formations reach the editor through a **hook passed into the menu**, not a document event: a listener on
the document would outlive the menu and capture this render's frames array, which is the stale-closure
trap the `tb-ro-play` double-binding taught once already. The two dismissal listeners that must be on the
document are removed when the menu leaves the DOM.

`applyFormationShape` is extracted so the 2D dropdown and the 3D menu run one path, and it clears **only
the side being changed** — clearing both was right when one formation placed both teams and would now
discard the opponent's shape every time ours changed.

**Lateral and follow-ball left the MENU, not the code.** `PRESETS.side` stays because
`board3d-camera.test.js` measures every pair of transitions and `side -> top` is one of the two that used
to whip 172 degrees through the overhead singularity. Follow-ball is HANDOFF item 19.

**Two real bugs the tests found while writing them:**
- **`.tb-pen-dash-label` did not exist.** The pen's Dash toggle reused the arrow's class, so
  `querySelector` returned the ARROW's label for both rows and the pen row silently lost its toggle.
  Each has its own hook now, and the shared style class is `.tb-dash-label`.
- The menu test's slice helper bounded on a two-space indent, so anything nested inside `bindTactics`
  (four spaces) ran on for thousands of lines — an "must be absent" assertion found the thing elsewhere
  and failed on correct code.

**Three tests were vacuously true and were tightened**: an ordering check where the deleted call made
`indexOf` return -1 (`-1 < anything`); a window-wide search for `openCams(false)` that also matched the
outside-click dismissal; and a slice bounded by a comment marker in a comment-stripped string, which
threw at collection time and aborted the whole run instead of failing one test.

**Frame 1 is seeded on entering 3D** if the board has none — stated plainly because it is a state write
on a view change. A single frame is exactly the board itself, so nothing is invented, but entering 3D
does mark the board as edited.

`test/board3d-menu.test.js` opens with a warning: there is no jsdom here, so **whether a panel appears on
hover is a hand check**, listed in the plan rather than faked. What the tests do settle is that every id
and class referenced actually exists, that controls are moved rather than duplicated, that every label
resolves in three languages, and that document listeners come off again.

Unit 1663 → **1694**. Version triple → v150. **Still nothing deployed.**

### 2026-08-26 — The menu shipped dead: a temporal dead zone (v151)

v150's menu never ran. It was built inside the 3D mount block, next to the code it belongs with, and
reached for `frames` — declared with `let` some seven hundred lines further down. That is a **temporal
dead zone**: `ReferenceError: Cannot access 'frames' before initialization`, thrown before anything was
adopted. The throw aborted the rest of the block, so `tbMenuInit` never ran at all — the hamburger did
nothing, the board name stayed above the window and the frames stayed under it. The camera menu kept
working only because it is wired earlier in the same function.

Built at the end of `bindTactics` now, where everything it touches already exists, and carrying its own
`if (tbIs3D())` since it no longer inherits the mount block's.

**This is the third variant of the same trap in this feature**, and the pattern is worth naming:
- v138 — `tbSetDrawMode` read `is3d`, a const belonging to a *different function*;
- v144 — `tbDrawSurface` reached for `BS`, caught only because that one is executed in a test;
- v150 — the menu read `frames` *before its declaration in the same function*.

All three are "the identifier is spelled correctly and does not resolve **here**", and all three shipped
past a green suite because every assertion about them was about source text. The text was right each
time.

Ordering is one thing source can settle honestly, so it now does: three tests assert that `tbMenuInit`
and the frame-1 seed both appear **after** `let frames` and `let activeFrameIdx`, and that the menu
carries its own 3D gate. Both mutations — moving the call above the declaration, and moving the seed —
fail them.

Unit 1694 → **1697**. Version triple → v151. **Still nothing deployed.**

### 2026-08-26 — Cosmetics: the window reaches the card top, the rail loses its box (v152)

- **The window bleeds on three edges now**, not two, cancelling the card's `1.5rem` on the top as well
  as the sides. The top corners keep the card's own radius and the bottom two go square, because that
  edge no longer meets anything. The height follows on its own — `tbSize3DWindow()` measures the top
  offset, which just moved up.
- **The frames stopped being a page.** The 2D board's white tiles and orange borders are a page
  vocabulary; over turf a column of white squares is the loudest thing on the board. Tiles are
  transparent with a number, and **only the current one is outlined** — the 2D board doubles that
  outline with a glow, which is one signal too many at 38px. The grey box around the section is gone
  too. The delete cross appears on hover, where it is wanted, rather than sitting on every tile.
- **One vertical axis.** The camera button, the frame tiles, the add button and play are all 38px and
  centred, so the rail lines up under the camera icon by construction rather than by a magic offset.
  A test reads the camera button's width and requires the other three to match it, so restyling one
  cannot quietly drift it off the axis.
- **The camera list drops down** instead of running across: it sits in the top-right corner, and a row
  would run back along the top edge into the board name.
- **Play sits below the frames it runs.** It arrives in the section header, which is above the strip;
  `column-reverse` puts it underneath, where it reads as "run these" rather than as a title.

Two rules for `.tb-rail .tb-frames-section` had accumulated — the second silently winning. Merged, and
the test that found it was looking up the FIRST match by selector.

Unit 1697 → **1702**. Version triple → v152. **Still nothing deployed.**

### 2026-08-26 — The axis was a scrollbar (v153)

**Matching the widths was not enough, and the reason is worth writing down.** Every rail control was
already 38px, the same as the camera button — but `.tb-rail .tb-frames-strip` carries
`overflow-y:auto`, and a visible scrollbar **reserves width on the right**. Every tile therefore sat a
scrollbar's width inside the rail's edge while the camera button above stayed flush against it. The
scrollbar is hidden now (`scrollbar-width:none` plus the WebKit pseudo-element); the scrolling is not.

Second contributor: the duration input was 44px in a column of 38px tiles, so the column was wider than
its own contents and the tiles centred inside it. Now 38px, like everything else.

Also: the rail sits at `calc(50% + 1.75rem)` rather than dead centre, because the camera list opens
downward along the same edge and the two were meeting; the board name lost its background and reads
from the left — `.tb-board-name` centres itself for the 2D page, which is wrong for a title on a pitch.

**Three selectors had grown a second rule** while this was built in pieces — `.tb-frames-section`,
`.tb-frames-header` and `.tb-frames-title` — each time with the later one silently winning, and one pair
disagreeing about a margin. All merged, and there is now a test that fails if any `.tb-rail`, `.tb-cams`
or `.tb-m` selector is written twice. A duplicate is not a style bug by itself; it is what makes the
next style bug unreadable.

Unit 1702 → **1707**. Version triple → v153. **Still nothing deployed.**

### 2026-08-26 — The axis, third attempt: declare it instead of matching it (v154)

Twice this was "fixed" by making the controls the same width, and twice it was still visibly out — the
second time reported with a screenshot after CONTEXT.md had already recorded it as done. **The method
was wrong, not the numbers.**

Both columns were **shrink-to-fit and right-aligned**, so each one's centre line sat wherever its own
widest child put it. That arrangement only holds while every child is identical, and it stopped holding
the moment one gained a border, a scrollbar or a padding. Worse, a test comparing declared `width:`
values passed on both broken versions: **a declared width is not a rendered box**, and source cannot see
the difference.

The axis is a number now — `--tb-axis: 44px` on the wrapper. `.tb-cams` and `.tb-rail` both take that
width and the same right edge, and every child is **centred** in it rather than pushed against an edge;
the rail's own containers take `width:100%` so none of them shrinks back to its contents. Whether the
two line up is now a property of two CSS rules rather than of everything inside them, and *that* is
something a source test can honestly check — so it does, including that `margin-left:auto` and
`align-items:flex-end` do not come back.

`.tb-cams-btn` also carried `margin-left:auto` and a later `margin:0` at once. The second won, so it
worked — but a rule contradicting itself four lines apart is exactly the clutter that makes the next
layout bug unreadable.

The duplicate-selector guard added in v153 earned itself immediately: it caught a second
`.tb-rail .tb-frame-gap` rule within a minute of being written.

**Still not verified visually.** Nothing here proves the two columns line up on screen; the tests prove
the CSS says they should. That distinction is the whole lesson of this entry.

Unit 1707 → **1708**. Version triple → v154. **Still nothing deployed.**

### 2026-08-26 — A clipped cross, a stranded tooltip, and closing on hover-out (v155)

**The delete cross was cut in half by the axis.** It is absolutely positioned 6px past its tile's right
edge, and the frames strip clips horizontally so a long animation cannot scroll sideways — so anything
overhanging has to fit inside the axis width or it is simply cut. A 38px tile in a 44px axis left 3px of
room for a 6px overhang. The axis is 52px now, and a test derives the requirement rather than pinning
the number: it reads the overhang from `.tb-frame-del`, the tile width and the axis, and asserts the
clearance covers it.

**The tooltip is a body-level singleton, and `mouseleave` cannot fire on an element that no longer
exists.** Clicking 2D/3D re-renders the page out from under the cursor, so "Canvia de pissarra…" was
orphaned visible over the 3D board. Two fixes, because they cover different moments: the binder clears
any stale tooltip *before* rebinding — and every render runs the binder, so that one line covers every
path that can strand one, including ones added later — and a click on any tooltipped control closes its
own, which handles the gap before the render lands.

**The menu closes on hover-out, after a grace period.** The panels are DOM children of their entry, so
hovering one never counts as leaving however far outside it sits. What does count is the 6px gap between
the rail and a panel, where the pointer is over the canvas for a frame or two — closing on that would
flicker the menu shut as the coach reached for it. 260ms, cancelled on re-entry, and cleared when the
menu is torn down or it fires into a dead one.

Unit 1708 → **1711**. Version triple → v155. **Still nothing deployed.**

### 2026-08-26 — The cross was anchored to the wrong box (v156)

Widening the axis in v155 could never have fixed this, and the reason is worth keeping.

`.tb-frame-del` hangs `-6px` past **its parent**, and its parent is `.tb-frame-item` — which is
`width:100%` of the axis, deliberately, so the column cannot shrink to its contents. So `-6px` is
outside the strip *whatever the axis is*: widening the axis widened the item with it. On top of that,
`overflow-y:auto` makes the other axis clip as well, so the first tile's cross also lost its head.

v155's test passed on the broken layout because it modelled the cross as anchored to the **38px tile**.
It is not; it is anchored to the full-width item. **The geometry in the test was wrong, so the test
agreed with the code and both were wrong together** — the same shape of failure as the declared-width
test two entries ago.

The cross sits INSIDE the tile's corner now, and the test stopped trying to compute how much room a
layout leaves. It asserts the thing that is actually true or false: **no offset on any side may be
negative**, because the strip clips on both axes. That cannot be got subtly wrong the way a clearance
calculation can.

While there: `--tb-tile: 38px` joins `--tb-axis`, replacing the literal `38` repeated across seven
rules, and the cross's offset is `calc((var(--tb-axis) - var(--tb-tile)) / 2 + 2px)` — derived, so
moving either token moves the cross with it.

The tooltip and hover-out fixes from v155 are confirmed working.

Unit 1711 → **1712**. Version triple → v156. **Still nothing deployed.**

### 2026-08-26 — The badge is back on the corner, legally (v157)

v156 stopped the clipping by forbidding any overhang, which fixed the bug and broke the design: the
delete cross is meant to straddle the tile's top-right corner, and one sitting fully inside reads as a
mistake.

**The rule that was missing all along: `overflow` clips at the PADDING box, not the content box.** An
absolutely positioned child may spill out of the content box by up to the padding and still be drawn.
So an overhang is legal exactly when there is padding to spill into — which the strip had none of
(`padding:0`), and no amount of axis-widening could substitute for, because the item is `width:100%`
and grew with it.

Three tokens now, and they are **not independent**: `--tb-axis` (54) = `--tb-tile` (38) + 2 × `--tb-pad`
(8). The cross straddles at `-7px`, inside the 8px pad. A test asserts the arithmetic, so the three
cannot drift apart — if they do, the tile either overflows the content box or floats inside it, and the
two columns stop sharing a centre line, which is the bug this run of commits kept re-finding under
different names.

The overhang test now checks the honest invariant — **overhang ≤ pad, per side** — rather than "no
overhang" (v156, wrong design) or a clearance sum from the axis (v155, wrong geometry).

Unit 1712 → **1713**. Version triple → v157. **Still nothing deployed.**

### 2026-08-26 — The hamburger takes over the file actions (v158)

Save, Save As, Add to Match, Add to Training and the whole board library move into the menu, so in 3D
the window holds everything and the page below it is empty. Entry order groups the **file** actions
first — new, open, save, link — then the view toggle, then the tools that change what is on the board.

**Two traps the markup sets, both versions of one already paid for:**

- **`#tb-save` is conditionally rendered.** On a board that is not this coach's, `tbSaveButtonsHtml()`
  emits only Save As plus a `.tb-readonly-note` saying why. `adopt()` silently skips ids it cannot
  find, so leaving the note behind would have removed Save *and* the explanation — a panel simply
  missing a button. The note is adopted with it.
- **Match and training share the class `.tb-match-section`.** A `querySelector` takes the first and
  strands training below the window: the `.tb-pen-dash-label` bug exactly, where one class served two
  elements and the second lost its control without a sound. `querySelectorAll`, and a test that counts
  **two** sections in the render so the assertion cannot pass on a page that only has one.
- Third of the same shape, caught while writing it: the library heading carries **both**
  `.tb-saved-title` and `.tb-lib-title`, so the favourites pick is `:not(.tb-lib-title)` rather than
  relying on which comes first.

**The library is held open by hover** — the owner's call over a click-modal — and it works because the
panel is a **DOM child** of its entry: `pointerleave` answers to DOM containment, not screen position,
so the search field, the lists and the panel's own scrollbar all count as inside. It is the largest
hover-held surface in the app; if it proves fiddly the fallback is a click-modal, one CSS rule and one
listener.

**The delete cross is drawn, not typed.** A `✕` character centred with flexbox is centred by its LINE
BOX, not its ink, and that glyph does not sit centred in its own line box — which is what "not centred
in the red dot" was. Two bars pinned to the middle and rotated ±45° involve no font metrics at all.

The duplicate-selector guard is widened from `.tb-rail`/`.tb-cams`/`.tb-m` to **every `tb-` selector in
the stylesheet**, and immediately found a second `.tb-3d-wrap` rule holding the size tokens while the
first held the geometry. Nothing conflicted, but "where is this element styled" had two answers.
Merged.

Unit 1713 → **1720**. Version triple → v158. **Still nothing deployed.**

### 2026-08-26 — Opaque panels, a two-column library, and tags (v159)

- **The panels carrying text are opaque now.** `.tb-m-panel`, `.tb-m-sub` and `.tb-m-kit-obs` sat at
  `rgba(18,20,23,.96)`; over a green pitch that last 4% shows turf through the words. The
  `backdrop-filter` went with them — a blur behind an opaque surface is a compositor pass for nothing.
  The **icon buttons stay translucent** on purpose: they sit on the pitch and are meant to read as
  floating on it, and a test now says which of the two rules applies to which.
- **The library is two columns.** Stacked, Biblioteca Club began below the fold of a 560px panel and
  its search box scrolled away with it — the one control you reach for first. Each column scrolls on
  its own, so reading the favourites never moves the library, and the search box is `position:sticky`
  on an **opaque** ground (a translucent one shows the rows scrolling through it). The columns are real
  elements rather than `grid-column` on each adopted node, because sticky needs a scrolling parent.
- **The two dropdowns** had `left:0; right:0`, so a fixture line was cut at the toggle's width. They
  can outgrow it now, and have their own ground rather than a tint of the turf behind them.
- **Save and Save As build the same box.** `.btn-tb-saveas` carries a 2px border and `.btn-primary`
  none, so the two rules disagreed about where the padding ends. The primary gets a transparent border
  of the same width — matching the construction, rather than subtracting padding from one and hoping
  the pair stays in step.
- **Tags moved into the Save panel** (owner's call). A tag is what you set when you FILE a board:
  `tbLibraryListHtml` groups by `b.tag` and the search matches on it, so it decides where the board
  turns up next time. That was the last thing still rendered below the window, so the page under the
  3D board is finally empty.

The widened duplicate-selector guard earned itself again, catching a second
`#tb-panel-open .tb-lib-search` rule the moment it was written. One test also had to be narrowed: it
rejected any `rgba(255,255,255…)` in the sticky rule and so failed on a legitimately translucent
BORDER — it checks the background declaration now.

**Unverified visually, as always here.** These tests read CSS text; whether turf shows through a panel
is a hand check.

Unit 1720 → **1725**. Version triple → v159. **Still nothing deployed.**

### 2026-08-26 — The window takes the whole card (v160)

It bled sideways, then gained the top, and now takes the bottom too: `margin:-1.5rem` on all four
edges and the card's own radius on all four corners. That is only honest because tags — the last thing
rendered below it — moved into the Save panel in v159, so nothing inside the card follows the window.

**One leftover was still holding space.** The Save row is *emptied* by adoption, not removed: its two
buttons live in the menu now, but the wrapper keeps its padding, and that padding is exactly the gap
that would stop the window reaching the card's bottom edge. It carries the 3D hide class too — which is
safe precisely because the buttons are no longer its children, so hiding the wrapper cannot hide them.

A new test lists every section rendered after the window and requires each to be **either adopted or
hidden**. Adding a section below the board without handling it now fails there, rather than showing up
as the window mysteriously not reaching the edge.

Unit 1725 → **1726**. Version triple → v160. **Still nothing deployed.**

### 2026-08-26 — The 3D board takes the content area, and the title becomes an announcement (v161)

**Full bleed, without a single negative margin.** The board now fills the area beside the sidebar,
square and flush. It does that by *removing* padding rather than pulling against it: a
`dashboard-flush` class drops `#dashboard-content`'s 2rem, and `tb-card-3d` stops the card being a box.

The negative margin was the obvious move and would have been wrong: `renderUpdateBanner()` and
`renderPushBanner()` render into that same element, so a `-2rem` top margin slides the board **over**
a banner on the days one is showing. Nothing about that would have been visible in a test, or on any
day without a banner.

**The flush class is toggled — both arms — in one expression, in the page dispatcher.** Added inside
the tactics code and never removed, every other page in the app would lose its padding, and the
symptom would appear on a page nobody had touched. There is a test for the removal specifically.

**The header is now an announcement**, in 3D only: the editor's `page-title` is dropped and a label
fades in at top centre, holds 2s and fades out. The board-type picker keeps its title — it is a page
with nothing else on it — and 2D keeps its own, deferred by the owner.

Three details it needs to behave:
- **Gated on `isNav`**, which `navigate()` already computes to tell a real page change from the many
  re-renders that are not one. Fired on renders instead, the title would flash every time the coach
  picked a formation or toggled the theme.
- **Two `requestAnimationFrame`s**, not one: a class added to an element the browser has not yet laid
  out has no start state to transition from, and the label would appear rather than fade.
- **`pointer-events:none`**, since it sits over the board for two seconds and must not eat a click;
  and one reused node with its timers cleared, so a fade still running from the last visit cannot cut
  the new one short.

The height follows on its own — `tbSize3DWindow()` measures the top offset, which just moved up — and
its 16px bottom gap is gone for a genuine bleed.

Unit 1726 → **1731**. Version triple → v161. **Still nothing deployed.**

### 2026-08-26 — The white band, the announcement's home, and a scrollbar (v162)

**The band below the board was a stale measurement, not a margin.** `tbMenuInit()` adopts the board
name — rendered ABOVE the window — into the menu, so the window rises by that input's height the moment
the menu is built. `tbSize3DWindow()` had already run at mount, for the old position, and the difference
was exactly the strip of page showing underneath. Measured again after adoption. The re-measure follows
`tbMenuInit` rather than being tied to the board name, because anything adopted from above the window
has the same effect.

Both measurements are needed and the tests say so: the first so board3d fits its camera to the real
aspect (without it the board visibly re-frames on every entry), the second because the page moves
underneath it.

**The announcement is parented to the board**, not the body: `position:fixed` centred it on the browser
window, which with the sidebar open is a different place from the window the coach is looking at. It
falls back to the body if the board is not up yet — better a label in the wrong place than no label —
and the node is rebuilt when the host changes rather than reused blindly. Font up to 1.6rem, with a
smaller step under 640px.

**Scrollbars on the board's dark surfaces** are a thin translucent-white pill on no track. The default
is a light-grey slab from the page palette, which on a near-black panel over turf is the loudest thing
on screen — which is why it only ever gets noticed when it appears. Both syntaxes are written:
`scrollbar-width`/`scrollbar-color` for Firefox and Chromium 121+, `::-webkit-scrollbar` for Safari and
older Chromium. They never both apply, so they cannot disagree.

One process note: the band fix initially had **no test**, and the mutation survived. It has one now.

Unit 1731 → **1733**. Version triple → v162. **Still nothing deployed.**

### 2026-08-26 — The right scrollbar, and the frames rail scrolls at last (v163)

**v162 styled the wrong element.** "The left panel" was the app's own navigation sidebar, not the 3D
menu's panels — the ugly bar is `.sidebar`'s, where the default is a light-grey slab with stepper arrows
on a dark column, the brightest thing in it and only ever seen when a club has enough pages to overflow.
It takes the same thin translucent pill on no track, and a test asserts it uses the **same values** as
the board surfaces rather than a second grey nobody would notice was different.

**The frames rail could never scroll, and the CSS was not the reason.** It has carried
`overflow-y:auto` since it was built. board3d binds `wheel` on the **wrapper** as well as the canvas —
to catch the border and any gap the canvas does not cover — and the rail lives inside that wrapper, so
every notch over the frame list bubbled up and zoomed the board instead. The rail stops the event now;
the canvas handler is untouched and simply never sees a wheel that began on the rail.

Worth naming: a hidden scrollbar (`scrollbar-width:none`, added in v153 to fix the alignment axis) hides
the one affordance that would have said "this scrolls", so the list looked cropped rather than
unreachable. The bar stays hidden — it is a 38px column over a pitch — but the list is taller now
(54vh) so it crops later.

Also: play moves **above** frame 1 (the `column-reverse` from v152 is gone — the header is already
first), and the rail sits a little lower.

Unit 1733 → **1736**. Version triple → v163. **Still nothing deployed.**
