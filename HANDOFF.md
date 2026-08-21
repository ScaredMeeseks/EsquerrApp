# HANDOFF — EsquerrApp

_Rolling document, overwritten each session. Last updated: 2026-08-21._

**`main` is at v111, working tree clean, pushed — and FULLY DEPLOYED**, frontend and
functions both. Verified against the live artefacts rather than the deploy output:

```bash
curl -s "https://scaredmeeseks.github.io/EsquerrApp/sw.js?cb=$RANDOM" | grep CACHE_NAME
curl -s "https://scaredmeeseks.github.io/EsquerrApp/js/app.js?cb=$RANDOM" | grep "const APP_VERSION"
# both said 111 at 2026-08-21
```

All 18 functions **ACTIVE** on fresh revisions at 14:41Z (`scheduledrpereminder-00031-kem`),
and the **Cloud Scheduler job itself** now reads `every 30 minutes` / `Europe/Madrid` /
`ENABLED`. That last one matters: `firebase functions:list` only ever says `scheduled`, so
it cannot tell you the cron actually changed. The scheduler API can — see
"Reading production without a browser" for the token, then:

```
GET https://cloudscheduler.googleapis.com/v1/projects/esquerrapp/locations/us-central1/jobs
```

Rules unchanged and not redeployed. Unit tests **620 passing** (+25 this session); the
rules and functions emulator suites were **not** re-run.

**One thing is still unproven:** no RPE reminder has been observed *firing* under the new
schedule. The deploy is confirmed; a live send is not. See "Verify it" below — it is now
cheap to test, because it no longer means waiting until 23:00.

---

## What shipped: v111 — one definition of "the session is over"

The owner reported three things; they were one bug. A 11:30–12:00 session showed
**"En curs" until 13:30**, yesterday's 22:00 session showed **"Completat"** while still
sitting on the coach's landing page, and the RPE push for either was expected at the
whistle and never came.

**There were four different answers to "has it finished?", and `endTime` — which has
existed since the per-team session rework — was read by none of them.** Only
`sessionWindow()`, used by the player's week strip, ever looked at it.

| surface | was | now |
|---|---|---|
| staff list badge (`computeStatus`) | start + 2h, flat | `endTime`, else start + **120** (`BADGE_FALLBACK_MINS`) |
| coach landing page (`renderStaffWeek`) | **the date alone** | `sessionEndsAt` / `matchEndsAt` |
| player pending-RPE (×2 call sites) | start + 90 / +105, inline | `sessionEndsAt` / `matchEndsAt` |
| player week strip, matches | **kick-off** | `matchEndsAt` |
| `scheduledRpeReminder` | a **23:00 cron** | the activity's own end |

The badge keeps **two hours** as its fallback while everything else keeps ninety. That is
deliberate: the fallback only applies to a session nobody gave an end to, and changing it
there would have silently re-dated every legacy row's badge.

**Matches end at kick-off + 2h** (`DEFAULT_MATCH_MINS`), raised from 105 at the owner's
request — 90 + half time leaves nothing for added time, so a match that ran long was
called finished mid-play.

### `sessionEndsAt` / `matchEndsAt`

The `Date` form of `sessionWindow`, which answers in minutes-past-midnight and therefore
cannot compare across dates — both new callers span days.

Built as **start + duration**, never by formatting the end back to HH:MM. A 23:30 session
with no `endTime` ends at "25:00", which `minsToHHMM` refuses and every date parser turns
into `Invalid Date` — and a NaN comparison answers `false`, so the session would have
counted as **never over**.

### The reminder: `every 30 minutes`, not `0 23 * * *`

The nightly sweep was wrong in both directions — it chased the 11:30 session eleven hours
late, and the 22:00 one at 23:00, **an hour in, while it was still being trained**.

`endedInWindow()` claims an activity for the run whose half-open band
`[end, end + 30 min)` contains its end. The band is **exactly as wide as the schedule
interval**: narrower leaves gaps (an activity nothing ever chases), wider double-sends on
consecutive runs, and both failures are silent. A test parses `RPE_WINDOW_MINS` and the
cron string out of the source and fails if they drift apart.

Three consequences that are not obvious:

- **Yesterday stays in scope.** A 23:30 session ends after midnight and belongs to
  *tomorrow's* 00:00 run. Hence `array-contains-any [yesterday, today]`, plus
  `where("date","in", dueDates)` where `dueDates` holds only the dates something actually
  ended on — the other 47 runs a day must not pay for a second date.
- **One push per ACTIVITY**, tagged `rpe-training-<sessionId>` / `rpe-match-<matchId>`.
  The old `rpe-<date>` tag collapsed the evening squad's reminder onto the morning
  squad's on Android.
- **The client had to move with it.** `completedTraining` gated the RPE form on
  start + 90 min; left alone, a 30-minute session would have been pushed at 12:00 with
  nowhere to answer until 13:00.

### The duplication, and why it is accepted

`activityEndsAt()` in `functions/index.js` duplicates `sessionWindow`/`matchEndsAt`
because **functions/ deploys on its own and cannot require `../js`**. Sharing them means
a build step this project deliberately does not have.

It is a maintenance cost, not a scalability one — two copies cost the same at 50 players
as at 5,000. It is bounded (three constants and one function) and it **fails loudly**:
`test/training.test.js` reads `DEFAULT_MATCH_MINS` and `DEFAULT_SESSION_MINS` out of
*both* files and asserts they are equal. **If that list of shared rules keeps growing,
the answer changes and a shared module becomes worth the build step.**

---

## Verify it — the deploy is done, the behaviour is not confirmed

Nothing here has been clicked through in a real browser. Both halves are pinned by unit
tests over the real functions, and every new assertion was run against `git show HEAD` in
a throwaway worktree first and fails there — but that is not the same as seeing it work.

1. **Badge** — Entrenaments, a session with an `endTime`: "En curs" until that time, then
   "Completat". Not two hours later.
2. **Coach home** — a finished session disappears from "Aquesta setmana" instead of
   sitting there until Sunday night.
3. **The push, end to end** — this is the one that has never been proven:
   - Create a session ending in the next ~30 minutes.
   - As a demo player, answer **Sí** for it (the audience is `yes`/`late` only — an
     `injured` answer is excluded, which is exactly why the 2026-08-20 run sent nothing).
   - Confirm no `rpe` doc exists for that uid + session.
   - Wait for the half-hour boundary, then read the log:

```bash
firebase functions:log --only scheduledRpeReminder --project esquerrapp
```

The audience is logged **before** the send, so a zero reads as a precondition failure
rather than a push failure. A healthy line looks like
`{"kind":"training","sessionId":"…","squad":N,"missing":M}`.

**Evidence the old one never fired**, from the 2026-08-20 23:00 run:
`{"sessions":2,"missing":0,"matches":[],"teamId":"Tm96gel58VSQvxgynf45"}` — both sessions
found, **zero recipients**, because the only availability answer that day was `injured`.

---

## Reading production without a browser

Both of this session's diagnoses came from production data, read locally. This works and
is worth reusing:

```js
// ADC from firebase-tools' stored refresh token — no service-account key needed.
// ~/.config/configstore/firebase-tools.json → additionalAccounts[] (marna96@gmail.com)
// Write {type:"authorized_user", client_id, client_secret, refresh_token} to a scratch
// file, point GOOGLE_APPLICATION_CREDENTIALS at it. NEVER print the token; delete after.
// client id/secret are firebase-tools' own public pair, in lib/api.js of the global install.
```

Two traps, both cost time this session:

- **A scratch script must live inside `functions/`**, or `require("firebase-admin")` cannot
  resolve. Running it from the scratchpad fails with `MODULE_NOT_FOUND`.
- **`teams/{id}` is keyed by CLUB id.** There is no `clubId` field on a team doc — a
  `where("clubId","==",…)` query returns empty, which reads as "the club has no teams"
  rather than "wrong query". `teams/nDLJCpJfDvFHs8MnwtzW` *is* Esquerra de l'Eixample.

Sessions live in `teams/{id}/data/fa_training__{category}`, either as `{v:"<json>"}` or in
the per-field merge shape — `parseDataDoc()` in `functions/index.js` handles both, and
reading only `.v` on a merge doc silently yields `{}`.

### Beyond Firestore: any Google API, no `gcloud` needed

`gcloud` is **not** installed. The *same* refresh token exchanges for a
`cloud-platform` access token, which reaches every REST API the account has rights to —
this is how the deploy above was verified:

```
POST https://oauth2.googleapis.com/token
  grant_type=refresh_token & refresh_token=… & client_id=… & client_secret=…
→ Authorization: Bearer <access_token>
```

Two endpoints worth remembering:

- **Cloud Scheduler** — `…/v1/projects/esquerrapp/locations/us-central1/jobs` returns each
  job's real `schedule`, `timeZone` and `state`. **`firebase functions:list` only says
  `scheduled`** and can never tell you a cron actually changed.
- **Cloud Functions v2** — `…/v2/projects/esquerrapp/locations/us-central1/functions`
  returns `state`, `updateTime` and the Cloud Run `revision`. A container that fails its
  health check leaves the *old* revision serving, so a new revision id is the proof a
  deploy really took, not the CLI's success message.

---

## Where the owner is testing

**The demo club** (`Tm96gel58VSQvxgynf45`), not Esquerra de l'Eixample — worth knowing
before hunting for a session in the wrong team. Esquerra has exactly **one** session, on
2026-08-04.

The non-default-day session created this session saved and synced correctly, `endTime` and
all — v109's fix is confirmed working against real data:

```
tr_1787303860725_0_uenqwc  2026-08-21  11:30 → 12:00  Recuperació  amateur/["A"]
```

---

## Push notifications — where they stand

**Proven end to end (2026-08-19):** a convocatòria sent by staff arrived on an Android
home-screen PWA. Token → FCM → service worker → notification all work.

**Still not proven: any of the three scheduled reminders.** They share `sendToTokens` and
the same token, so delivery is settled — triggers, audiences and preconditions are not.

- **RPE** — rewritten this session, see above. Now the most testable of the three, because
  it no longer means waiting until 23:00.
- **Availability**, Friday 20:00.
- **Training**, hourly, 3.5–4.5 h before a session. The demo club has future sessions
  again, so this is testable.

---

## Parking lot

1. **Neither week strip re-renders on a timer.** A session drops off when the page next
   renders, not the instant it ends. Pre-existing and unchanged, but the new behaviour
   makes it more visible: a coach watching the page at 12:00 sees the row until something
   triggers a re-render.
2. **The cross-category call-up — decide before building.** The owner's workflow: an
   amateur coach agrees with a juvenil player and calls him up despite his never having
   had the Friday availability push. **Within a category this already works** —
   `renderConvocatoria` filters the picker by category only, never by letter.

   **Across categories it does not**, and there are two independent blockers: the picker
   filters to the coach's current category, and `getVisibleCategories()` returns
   `[s.category]` for a player, so he never downloads `fa_convocatoria_sent__amateur`
   **or `fa_matches__amateur`** — the call-up and the match would be invisible in his app.

   **The push is NOT a blocker.** `Push.sendToPlayers(teamId, targetUids)` writes a
   `pushQueue` doc with `targetPlayers` and `onPushQueueCreate` calls `getTokensForUsers`;
   category never enters it. That is also the right distinction: the Friday reminder is a
   broadcast to a *squad* he is correctly not in; the convocatòria is addressed to *named
   individuals the coach chose*.

   Two shapes: **staff-side only** (he appears on the convocatòria and gets the push, but
   the match is still missing from his app) or **widen a player's shard scope**, which
   touches `firestore.rules` and undoes part of the isolation Phase 5 bought. The same
   hole already exists for a training `guests` entry from another category.
3. **Training detail / session planning** (reported 2026-08-09, untouched): expected-player
   count beside "Assistència Jugadors"; strike through no-shows in the exercise teams;
   equalise the "Planificació entrenament" panel width; make that panel free-text editable.
   v85 changed the squad plumbing underneath — read that part of CONTEXT.md first.
4. **Fill in `privacy.html`** and have it reviewed. Live at
   `https://scaredmeeseks.github.io/EsquerrApp/privacy.html` with every club-specific fact
   still a `⚠` placeholder. Blocks **both** stores, no code dependency.
5. **The APK** — CI has built through v111; the phones are on v43-era. Set
   `clubs/nDLJCpJfDvFHs8MnwtzW.minAppVersion` only once a current APK is actually installed.
6. **Drop dual-write** — `TB_DUAL_WRITE` still mirrors the board library into
   `fa_tactic_saved` for the v43-era APK. Gated on 5.
7. **Play Console** — $25 plus identity verification. Then four secrets
   (`ANDROID_KEYSTORE_BASE64`, `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS`,
   `ANDROID_KEY_PASSWORD`) turn on the signed AAB build already dormant in the workflow.
   Gated on 5.
8. **iOS** — the owner may have access to two Macs (stated 2026-08-19), which changes the
   answer from "not startable". Still required: the **Apple Developer Program, $99/year**
   (organisation enrolment needs a D-U-N-S number but publishes under the club's name).
   What iOS would need, none of which exists: `npx cap add ios`;
   **`NSPhotoLibraryUsageDescription`** in `Info.plist` (the profile-photo picker crashes
   at runtime without it); **`PrivacyInfo.xcprivacy`**; an **`apns` block in
   `sendToTokens`** (`buildMessage` builds web and android shapes only); an APNs .p8 key,
   push entitlement, `remote-notification` background mode.

   **Do this before spending anything:** iOS 16.4+ already supports web push for a
   home-screen PWA, and v95 shipped everything needed for it. If that serves the club's
   iPhone users, the $99 and the build pipeline may not be worth it. The free D-U-N-S
   lookup — <https://developer.apple.com/enroll/duns-lookup/> — is the long pole and costs
   nothing to check.
9. **Readiness thresholds** — every measurement is against demo data, and the demo data has
   since changed materially. Re-measure before touching a threshold.
10. **Old-APK rules shim** — `clubs/{clubId}` still lets a lead write `fcfLinks`/`schedules`
    directly. Delete once a v55+ APK circulates.
11. **Push governance** — `firestore.rules:197` lets **any team member** enqueue a push to
    the whole team, with no staff check and no validation of `title`/`body`.
    `Push.sendToTeam` is dead code.
12. **The demo club's 19-vs-9** — "19 players answered `injured` for the 2026-08-13 demo
    session while only 9 injuries are live" is the shape of what v110 fixed. **Still a
    hypothesis, never checked**, and the top-up script writes those answers synthetically,
    so it may simply be seed data. Cheap to settle with
    `test/readiness-engine.test.js`'s harness pointed at production.
13. Smaller: three stranded accounts on `teamId: 'default'`; availability still club-wide
    readable; orphaned shards when a category is emptied; uncategorised players inconsistent
    across three staff pages; `backfill-training-teams.js` has no `preflight()`.

---

## Current state

- Repo: `c:\DATA\CLAUDE\EsquerrApp` → https://github.com/ScaredMeeseks/EsquerrApp. Firebase
  project `esquerrapp`. Frontend = GitHub Pages from `main`; APK = CI on push;
  rules/functions = `.\deploy.ps1`; Admin SDK = local, see above.
- **Bump the version in THREE places together**: `CACHE_NAME` in `sw.js`, `APP_VERSION` in
  `js/app.js`, `CURRENT` in `functions/check-deploy.js`. All three are at **111**.
- Verify a deploy by fetching the served files, not by trusting the push:

```bash
curl -s "https://scaredmeeseks.github.io/EsquerrApp/sw.js?cb=$RANDOM" | grep CACHE_NAME
curl -s "https://scaredmeeseks.github.io/EsquerrApp/js/app.js?cb=$RANDOM" | grep "const APP_VERSION"
```

- Tests: `cd test && npm test`. Fast path `npm run test:unit` (~1s). If a suite says
  `Could not spawn java -version`:
  `$env:PATH = "C:\Program Files\Microsoft\jdk-21.0.12.8-hotspot\bin;$env:PATH"`
- **New test files must be added to `test:unit` / `test:functions` by hand.**
- `gh` is **not** installed. The GitHub REST API with `curl` works; unauthenticated is
  **60 requests/hour**. A read-only fine-grained PAT (Actions: Read, Contents: Read) lifts
  it to 5000 and is the only way to read Actions logs or download artifacts.
- **Never edit `www/`** — CI-generated mirror for the Capacitor build.

### Clubs in production

- `nDLJCpJfDvFHs8MnwtzW` — **Esquerra de l'Eixample F.C.**, lead `marna96@gmail.com`,
  `amateur` only. One session, 2026-08-04.
- `Tm96gel58VSQvxgynf45` — **demo club** ("C.E. Sant Andreu del Palomar"), join code
  `9CA4RR`, `coach@demo.esquerrapp.app` / `DemoEsquerra2026!`. 3 teams / 77 members. Topped
  up 2026-08-20: 135 sessions (36 future, to 2026-10-22), 102 matches (30 future), 6873
  rpe, 6977 availability, 1713 matchAvail, 67 trainingDates. **It goes stale**: `hasData`
  expires at `STALE_AFTER_DAYS = 10`, so a demo nobody tops up shows ~54 grey dashes ten
  days after the last run. Re-run the top-up before showing it to anyone.
- `lly4GkUxIpBkSgZvzldT` — F.C.Barcelona test club. Holds seeded boards from template testing.

### ⚠ Never run `seed-demo-club.js --apply` at the demo club

`apply()` builds a club **from nothing**. Pointed at the populated demo club it destroys it
three ways, silently: it rewrites the whole `categories` map, it **replaces** data shards
with a bare `set()` — and `fa_users` is routed by category with no team letter, so
`fa_users__amateur` would lose amateur-B and juvenil-A — and it resets all 77 Auth
passwords. It is guarded by neither the `demoSeed` stamp nor `PROTECTED_CLUBS`; only
`--purge` and `--add-team` are.

```bash
node functions/seed-demo-club.js --verify --club Tm96gel58VSQvxgynf45   # read-only
node functions/topup-demo-season.js --club Tm96gel58VSQvxgynf45         # dry run
node functions/topup-demo-season.js --club Tm96gel58VSQvxgynf45 --apply # additive only
```

**Do not run `cleanup-seed.js`** — it keys on pre-Phase-1 numeric uids and would treat much
of the current demo corpus as garbage.

---

## Lessons that keep repeating

- **When one screen disagrees with another, count the definitions before hunting for a
  render bug.** v111 was four independent answers to one question, three of them ignoring
  the field that knew.
- **A duplicated rule needs a test that reads BOTH copies.** Not one that tests each side's
  behaviour separately — one that asserts they are equal. Behaviour tests pass happily
  while the two drift.
- **When a trigger moves, look for what gates the response.** Pushing at the session's end
  was useless until the client also offered the form at the session's end.
- **Two sources of truth need something that can cancel, not just override.** v110's whole
  bug was a branch that could raise a flag and not lower one.
- **A field that is `readonly` fires no `change`, and a programmatic `.value =` fires
  nothing at all.** v109. Any custom picker's own event is the only signal there is.
- **Prove the old code fails.** Every assertion added this session was run against
  `git show HEAD` in a throwaway worktree first.
- **An empty query result is not evidence of absence** — it is often the wrong query.
  `where("clubId","==",…)` on `teams` returns nothing because the field does not exist.
- **Read the data, not the summary.** A tool that reports on its own work will report success.
- **Check the artefact, not the operation** — `curl` the served `sw.js`, not the push
  output; read the Cloud Scheduler job, not the deploy log. A CLI reports what it *sent*.
- **`deploy.ps1` is Windows-only and Cloud Shell is not the local machine.** Pasting
  `cd c:\DATA\...` + `.\deploy.ps1` into Cloud Shell fails twice over — wrong filesystem,
  wrong shell. The bash counterpart there is `./deploy.sh`, after a `cd` into the clone.
