# HANDOFF — EsquerrApp

_Rolling document, overwritten each session. Last updated: 2026-08-21._

> **⚠️ v115 is WRITTEN AND TESTED BUT NOT DEPLOYED, NOT COMMITTED.** Working tree dirty.
> It touches `firestore.rules` and `functions/index.js` as well as the frontend, so
> `./deploy.ps1` must cover **rules + functions + hosting** — a hosting-only push would
> ship a client that reads a `staffRole` no function ever writes, and every staff member
> would silently stay a coach. See "Deploying v115" below.

**`main` is at v114 and fully deployed**, frontend and functions both, verified against the
live artefacts rather than the deploy output:

```bash
curl -s "https://scaredmeeseks.github.io/EsquerrApp/sw.js?cb=$RANDOM" | grep CACHE_NAME
curl -s "https://scaredmeeseks.github.io/EsquerrApp/js/app.js?cb=$RANDOM" | grep "const APP_VERSION"
# both said 114 at 2026-08-21
```

All 18 functions **ACTIVE** on fresh revisions, and the **Cloud Scheduler job itself** reads
`*/30 * * * *` / `Europe/Madrid` / `ENABLED`. That last one matters: `firebase functions:list`
only ever says `scheduled`, so it cannot tell you the cron actually changed. The scheduler
API can — see "Reading production without a browser" for the token, then:

```
GET https://cloudscheduler.googleapis.com/v1/projects/esquerrapp/locations/us-central1/jobs
```

Unit tests **671 passing**, rules tests **139 passing** (both re-run this session). The
**functions** emulator suite was not re-run — worth doing before deploying v115, since
`onRosterWritten` changed.

**The push chain is PROVEN end to end.** The scheduler fired at `2026-08-21T15:30:01Z`,
exactly on the wall clock — which is also the proof the cron change took — and the owner
received the resulting RPE notification on his phone. That closes the oldest open question
in this file: the scheduled reminders work, not just the manual convocatòria push.

---

## What's written but NOT shipped: v115 — three staff sub-roles

`staff` was one role: `buildSidebarItems()` and `STAFF_PAGES` both gated on the same
`roles.includes('staff')`, so every staff member got all ten staff sections with full edit
rights. The club wanted to hand accounts to a fitness coach and a match delegate without also
handing over the tactical boards, the medical file and the ability to delete a fixture.

**Where it lives.** A parallel map on the roster doc the lead already owns:

```
clubs/{clubId}/rosters/{cat}-{letter}
  staffEmails : ["a@x.com", "b@x.com"]      // unchanged
  staffRoles  : { "b@x.com": "fitness" }    // NEW — absent ⇒ "coach"
```

Chosen over turning `staffEmails` into objects: no shim in `normEmails`, no migration, and
`firestore.rules` already pins staff to `hasOnly(['playerEmails','updatedAt'])` and gives the
lead everything — so `staffRoles` is lead-only with no rule change. The lead sets it from a
dropdown next to each address in **Config Club**; `onRosterWritten` re-derives
`users/{uid}.staffRole` for everyone the edit touched.

**Absent means coach, everywhere** — server, client, `check-deploy.js`. Every existing account
behaves bit-identically, which is the whole reason for that default.

| Section | coach | fitness | delegate |
|---|---|---|---|
| Inici, Plantilla, perfil de jugador | edit | view | view |
| Registres | edit | view | view |
| Sessions d'entrenament (+ nova sessió) | edit | view (hidden) | view (hidden) |
| Calendari | edit | view | **edit** |
| Convocatòria | edit | **hidden** | view |
| Jornada | edit | edit | edit |
| Mèdic | edit | **edit** | **hidden** |
| Pissarra tàctica | edit | hidden | hidden |
| Notificacions | edit | edit | **hidden** |

**It is a UI gate, not a security boundary — a decision, not an oversight.** All three still
carry `role:'staff'` and can still write the same documents. It could not be otherwise today:
Calendari, Jornada **and** Convocatòria all write the same `fa_matches__{cat}` doc as one
opaque blob, so "Jornada but not Calendari" is not expressible in a rule. See the v115 entry
in CONTEXT.md for exactly which cross-writes have to be split first.

**The two things most likely to bite whoever picks this up:**

1. `onRosterWritten`'s membership signature had to carry the sub-role (`"s:" + role`). Without
   it, changing only the dropdown is a roster write the trigger reads as a no-op — it returns,
   and `users/{uid}.staffRole` stays stale. Nothing else in the change is as easy to miss.
2. `set({merge:true})` **deep-merges a map field**. Sending the new `staffRoles` alone only ever
   ADDS keys, so demoting someone back to Coach would leave `fitness` in the doc forever. Keys
   that have gone are deleted with `FieldValue.delete()`.

New: `test/staff-roles.test.js` (20 tests) — **and it had to be added to `test:unit` in
`test/package.json` by hand**, which is the standing trap in this repo.

### Deploying v115

```powershell
cd c:\DATA\CLAUDE\EsquerrApp
cd test; npm run test:functions; cd ..   # onRosterWritten changed — not yet re-run
.\deploy.ps1                             # rules + functions + hosting, NOT hosting-only
git add -A; git commit; git push         # push also builds the APK
```

Then, as the lead: Config Club → set one staff address to Preparador físic and another to
Delegat → Save. **Confirm both halves landed**: `clubs/{c}/rosters/{key}.staffRoles` in the
console, *and* that each affected `users/{uid}.staffRole` was re-stamped. The second is what
catches a missed `sigOf`. Then sign in as each and walk the table above — including typing a
hidden page's id and using the Back button, which must land on `staff-home`, never a blank
screen.

No `minAppVersion` bump: the change is UI-only, so an old APK simply behaves as it does today.

---

## What shipped: v114 — the RPE form stops asking for what the club already knows

**1. The push says "Entrenament", not the focus.** `session.focus` is the coach's planning
label — "Força i prevenció", "Partit condicionat" — and means nothing on a lock screen.
Dropped from both bodies.

**2. A training's Minutes box is pre-filled with the session's length.** `sessionMinutes()`
is `sessionWindow`'s duration, so it honours `endTime` and falls back to 90.

**3. A match's Minutes box is pre-filled from the substitution events.** The derivation
already existed — `playerMatchMinutes`, from the starting XI and the `change` events, built
for the readiness estimator — it just was never offered to the player. **Checked against
production first**: the demo club holds 199 substitution events across 72 matches, with a
`startingXI` on 73 of 75 convocatòries.

`playerMatchMinutesKnown()` is new for one reason: `playerMatchMinutes` collapses "played
nothing" and "no line-up recorded" into **0**. Right for load maths, wrong for a form
default — pre-filling 0 for a squad whose coach never entered an XI invites everyone to
submit a zero and flatten the club's load data. A null renders an empty box instead.
**Esquerra de l'Eixample has no matches at all, so that is the branch it will hit.**

**The match cap is 100** (90 + added time); training stays 300. It was a flat 300 for both,
so a mistyped match length sailed through as 300. The cap is `data-max` per card **and is
re-checked at submit** — a PRE-FILLED value fires no `input` event, and neither does an
autofill, so the keystroke clamp cannot be the only check. This change created that trap
itself.

---

## What shipped: v113 — the pre-session push, and the club's own clock

Asked for directly, two parts.

### a) The push goes to everyone COUNTED, not only the unanswered

Attendance here is **opt-out**: `getEffectiveAnswer` returns `yes` for an unlocked session
nobody answered. The reminder went only to players with no record — the wrong half. A
player who said nothing and one who said "Sí" are in the same position, both expected at
training, and only one was being told.

`countedFor()` is the audience now: **everyone except a `no`/`injured`**, from the player
or his coach. Telling a player the staff has dropped that "we are counting on you" is the
one thing this message must never do. It is the deliberate mirror of `attendedFor` —
*before* a session silence means expected, *after* one it means never marked present. Same
two stores, opposite defaults.

The body carries the deadline: *"Comptem amb tu — si no pots venir, canvia-ho abans de les
HH:MM."* That time is `start − lockHours`, the exact instant `isTrainingLocked` starts
refusing changes, so the push cannot promise a window the app then denies.

### b) `pushHours` / `lockHours` are per club

`clubs/{id}.reminders`, edited in Config Club (the team-setup screen), saved through
`setClubCategories`. **Defaults 4 and 3.**

⚠ `lockHours` replaces a **hardcoded one hour** in `isTrainingLocked`, so **every existing
club's answering window now closes two hours earlier** until its lead changes it. Requested,
not a side effect — but it is the one change here a coach will notice without being told.

`push > lock` is enforced in three places, each load-bearing: the client (a typo costs no
round trip), the callable (these two numbers drive a push to every player in the club), and
`remindersOf` on read (a pair written by anything bypassing the callable falls back rather
than announcing a deadline already past).

### Two latent bugs fixed on the way

- **`every 60 minutes` → `0 * * * *`** — the same interval-vs-wall-clock trap as v112.
- **The band was inclusive at both ends** (`< 3.5 || > 4.5`), so a session landing exactly
  on the boundary — **any session at half past the hour** — was reminded **twice**. Now
  half-open: `[pushHours − 0.5, pushHours + 0.5)`.

**Not done, deliberately:** the lock is client-side only. `firestore.rules` cannot cheaply
reach a session's start time, so a determined user could still write a late answer — as was
already true before this change.

---

## What shipped: v112 — the coach's override reaches the server

Asked as a question: *"if a player hasn't answered and the coach overrides him and adds
him, does he still get the RPE push?"* **He did not.** Two gaps, in opposite directions,
both older than v111:

- A player the coach **added by hand** was never chased. `_ntMarkAttending` writes
  `fa_training_staff_override` and never a record under the player's own key —
  deliberately, so the app does not forge an answer as him — while the reminder read only
  the `trainingAvail` collection. He saw the RPE waiting on his home screen and was never
  told about it.
- A player the coach marked **absent** was chased anyway, because his own stale `yes` was
  the only thing being read.

**Two stores, one never consulted** — the same shape as v110's injuries and v111's
`endTime`. The client has always applied `override || answer` in `renderPlayerActions`;
this is the server learning the rule it already had.

`attendedFor(overrides, answers, uid, session)` replaces the bare `answeredFor` call.
**The coach wins in both directions** — an override is a human saying he was or was not
there, which outranks the player's answer *and* his silence. `overrideFor()` mirrors
`readRecord`: session key first, legacy date key second, and **never** the legacy key for
a guest.

`mergeMapShards()` merges **every** category's shard, which matters here specifically:
`fa_training_staff_override` is in `ROSTER_JOINED_KEYS` as `uidPrefix`, so it is routed by
the **player's** category — a juvenil guest at an amateur session has his override in
`…__juvenil`. Reading only the session's shard would miss exactly the borrowed players a
coach is most likely to have added by hand. No extra query: `readDataShards` already reads
the whole `data/` collection.

**Matches are unaffected** — there is no staff override for a match; the convocatòria is
already the coach's own list.

Both gaps were reproduced against `git show HEAD`, and with no override present the old
and new answers are identical — that is the part that matters.

### And the schedule became real cron

v111 shipped `schedule: "every 30 minutes"` — the **App Engine interval** form, which waits
N minutes after the previous run *finishes*. Consecutive runs therefore drift apart by each
run's duration and `endedInWindow`'s bands stop tiling: the last seconds of one band belong
to no run, and an activity ending there is chased by nobody. Silent, rare, and exactly what
the fixed-width band existed to prevent.

`*/30 * * * *` fires on the wall clock at :00 and :30 whatever a run costs. A test now
asserts the schedule is **not** an `every N` interval, alongside the one pinning
`RPE_WINDOW_MINS` to the cron's number.

**This came from evidence, not from re-reading the code**: after the v111 deploy the
scheduler's `lastAttemptTime` was still the previous day's 23:00 run, long past when a
wall-clock half-hourly job should have fired. `scheduledTrainingReminder` still uses
`every 60 minutes` with a 1-hour band — **same latent gap, untouched, worth fixing.**

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
3. **The push, end to end** — ✅ **PROVEN 2026-08-21**, an RPE notification arrived on the
   owner's phone from the scheduled job. Re-run this only when changing the audience logic:
   - Create a session ending in the next ~30 minutes.
   - As a demo player, answer **Sí** for it (the audience is `yes`/`late` only — an
     `injured` answer is excluded, which is exactly why the 2026-08-20 run sent nothing).
   - **Or test v112's path instead**: leave a player unanswered and *add* him to the
     session as a coach. He should now be chased. The inverse is worth one click too —
     set a player's staff answer to **No** and confirm he is not.
4. **v113's pre-session push** — create a session starting in ~4 h and wait for the next
   o'clock run. Everyone not excused should get it, including players who have answered
   nothing *and* players who answered Sí. The body must name `start − lockHours`.
5. **v113's config** — Config Club → Avisos d'entrenament. Set push 6 / lock 5, save,
   reopen and confirm they persisted. Then try push 2 / lock 5: it must refuse, both in the
   app and (if you bypass the form) in the callable.
6. **The lock moved from 1 h to 3 h.** Open a session starting in two hours as a player —
   the availability badge should be frozen, with a tooltip naming the time it closed.
7. **v114's pre-filled Minutes.** A training card should open with the session's own length
   already in the box; a match card with the minutes derived from the substitutions. Try
   typing 900 into a match card — it must clamp to 100, and submitting a pre-filled value
   above the cap must be refused rather than silently stored.
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
11. **`scheduledMatchAvailReminder` is the last `onSchedule` not yet checked** for the
    interval/band traps v112 and v113 fixed. It is a weekly `0 20 * * 5` cron, so the
    wall-clock issue does not apply — but nothing has verified its audience or that it
    fires at all.
12. **Push governance** — `firestore.rules:197` lets **any team member** enqueue a push to
    the whole team, with no staff check and no validation of `title`/`body`.
    `Push.sendToTeam` is dead code.
13. **The demo club's 19-vs-9** — "19 players answered `injured` for the 2026-08-13 demo
    session while only 9 injuries are live" is the shape of what v110 fixed. **Still a
    hypothesis, never checked**, and the top-up script writes those answers synthetically,
    so it may simply be seed data. Cheap to settle with
    `test/readiness-engine.test.js`'s harness pointed at production.
14. Smaller: three stranded accounts on `teamId: 'default'`; availability still club-wide
    readable; orphaned shards when a category is emptied; uncategorised players inconsistent
    across three staff pages; `backfill-training-teams.js` has no `preflight()`.

---

## Current state

- Repo: `c:\DATA\CLAUDE\EsquerrApp` → https://github.com/ScaredMeeseks/EsquerrApp. Firebase
  project `esquerrapp`. Frontend = GitHub Pages from `main`; APK = CI on push;
  rules/functions = `.\deploy.ps1`; Admin SDK = local, see above.
- **Bump the version in THREE places together**: `CACHE_NAME` in `sw.js`, `APP_VERSION` in
  `js/app.js`, `CURRENT` in `functions/check-deploy.js`. All three are at **115**
  (v115 is written but not yet deployed — see the top of this file).
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
- **Two stores means the server probably reads one of them.** v112, v111 and v110 were all
  this. When a client resolves `a || b` and a Cloud Function reads only `b`, the two will
  disagree exactly where a human intervened — which is the case that matters most.
- **"Does X still happen if…" is worth answering by reading the code, not by intuition.**
  The v112 gaps had been live for months and nothing surfaced them.
- **A schedule string is not a schedule.** `every 30 minutes` and `*/30 * * * *` look
  interchangeable and are not — one is an interval from the previous run's *end*. Reading
  `lastAttemptTime` back off the deployed job is what exposed it.
- **A band with `<=` on both ends double-fires.** v113's training window was
  `< 3.5 || > 4.5`, so any session at half past the hour was reminded twice. Half-open
  intervals, every time.
- **Ask which default a question carries.** `countedFor` and `attendedFor` read the same
  two stores and disagree only about silence — before a session it means "expected", after
  it means "never showed". Getting that backwards sends a push to exactly the wrong people.
- **A cross-file guard built with a constructed RegExp can silently check nothing.** The
  first version of the v113 constants guard had `'(\d+)'` collapse to `(d+)` and passed
  while matching nothing. String slicing, and then *mutate one side to prove it fails*.
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
