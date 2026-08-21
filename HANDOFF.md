# HANDOFF — EsquerrApp

_Rolling document, overwritten each session. Last updated: 2026-08-21._

**`main` is at v110 (`25c8090`), working tree clean, pushed.** At the moment of writing GitHub Pages
was still serving **v109** — the v110 deploy had not finished. **First thing next session: confirm it
landed**, because nothing else here is worth trusting until it has:

```bash
curl -s "https://scaredmeeseks.github.io/EsquerrApp/sw.js?cb=$RANDOM" | grep CACHE_NAME
curl -s "https://scaredmeeseks.github.io/EsquerrApp/js/app.js?cb=$RANDOM" | grep "const APP_VERSION"
# both must say 110
```

Unit tests **595 passing** (+17 this session). The rules and functions suites were **not re-run** —
nothing outside `js/app.js` changed — so the totals for those are whatever the last run said.

Two bugs fixed, both reported by the owner, both frontend only. **No functions deploy is pending.**

---

## What shipped today

### v109 — the new session's date could not be moved off the default day

Reported as "I can't add a training on a day that isn't in my defaults". The date **looked**
editable: the picker opened, a day could be clicked, the field showed it. Save wrote the seeded day.

`renderTrainingNew`'s date input is `readonly` and driven by the custom picker, which writes
`value` + `dataset.dateIso` programmatically and dispatches **`input`**. `bindTrainingNew` committed
field edits on `change` — which a programmatic write never fires, and a readonly field never fires at
all — and its `input` fallback was gated `&& !el.classList.contains('md-datepicker')`. **The one
field that only signals through `input` was the one field not listening for it.**

The gate existed to stop a re-render on every keystroke (it would blow away the field being typed
in). That reason is real and is kept — but as a branch on `isDate` rather than a skipped listener:
all text fields commit on `input`, only the date re-renders, which is also what keeps the clash
warnings matching the day now chosen.

Seeding is untouched — the proposed date is still the next slot on the team's own schedule, and was
always meant to be a suggestion. `bindStaffTraining` (the saved-sessions table) was never affected:
it delegates `input` on the whole `<tbody>` and re-reads the row from the DOM.

⚠ The commit subject is a bare `@` with the real subject on line 2 — PowerShell here-string syntax
passed to a bash call. Content is intact. Left as is rather than force-pushing `main`.

### v110 — a resolved injury that only the Medical page believed

Reported as: mark an injury resolved as a coach, and the player goes on showing as injured
everywhere else.

**Two sources of truth, and only one of them moved.** `deriveFitnessStatus()` reads the player's own
training answers (a last answer of `injured` means injured) *and* `fa_injuries`. The `fa_injuries`
branch runs last and can only **override** the answers (`active` → injured, `recovering` → doubt). It
has no way to **cancel** one. Resolving the record therefore just removed the override and let the
stale self-report through, and the record's own screen — the only one reading `fa_injuries` directly
— was the only one that changed.

The mechanism already existed: `fa_injury_dismissed`, a date up to which an `injured` answer counts
as a plain absence, written when staff *discard* a self-report. A resolution now supplies that date
too. It is **derived from the record, not written as a flag** — `max(dismissedUpTo, latest resolved
endDate)`, recomputed on every read — so **injuries resolved before this existed heal themselves on
the next render; no repair pass, no re-clicking**. An injury reported *after* the all-clear is newer
than the date and still counts, which is what makes it safe.

Three more leaks found in the same sweep:

- **`fa_injury_notes` / `fa_injury_zone` were never deleted.** Per-player maps that predate
  `fa_injuries`, written on every log, read by surfaces that know nothing about records — the status
  tooltips and the medical hover body map. A closed injury kept its text and its red zone.
  `clearStaleInjuryCaches()` drops them once no `active`/`recovering` record remains (a second open
  injury owns them). `_mergeUpdates` in `js/db.js` turns a removed field into `FieldValue.delete()`,
  so this syncs rather than resurrecting from another device.
- **The "currently injured" panel** on the staff training page derived nothing at all. It scanned
  `fa_training_availability` with the legacy `{uid}_{date}` key — which the move to session-id keys
  left matching almost nothing — then fell back to the roster's cached `fitnessStatus`. It knew about
  neither records, discards nor resolutions. It goes through `deriveFitnessStatus()` now, and its
  "weeks injured" count stops at the last all-clear.
- **Four call sites** (Resolve and Mark-recovering on both the Medical list and the detail page, plus
  the Edit modal's Save) each hand-rolled `updateInjury` + `deriveFitnessStatus`. They share
  `afterInjuryChange()` now, so the cleanup cannot be wired into three and forgotten in the fourth.

**Deliberately unchanged:** a player answering "Yes" does not close a staff-logged injury. The
medical record is staff-owned and only staff end it.

**Not verified in the real app.** Both fixes are pinned by unit tests over the real functions, and
the v110 headline case was run against `git show HEAD:js/app.js` first to confirm the old code fails
it — but neither has been clicked through in a browser. Worth five minutes once v110 is served:

1. Entrenaments → add a session → pick a weekday the team does not normally train → Save keeps it.
2. Medical → resolve an injury → the player turns green on the roster, the convocatòria and the
   training detail, not only on his own medical page.

---

## Possible follow-on: the demo club's 19-vs-9

The old parking-lot note "**19 players answered `injured` for the 2026-08-13 demo session while only
9 injuries are live**" is exactly the shape of what v110 fixed: self-reports and records disagreeing,
with nothing reconciling them. **This is a hypothesis, not a finding** — it was never checked, and
the top-up script writes those answers synthetically, so it may simply be seed data. Cheap to settle
now with `test/readiness-engine.test.js`'s harness pointed at production.

---

## ⚠ The Admin SDK runs locally — no Cloud Shell

`firebase-tools` stores `marna96@gmail.com`'s refresh token in
`~/.config/configstore/firebase-tools.json` (`additionalAccounts[]`), already in ADC's
**`authorized_user`** shape. Write `{type: "authorized_user", client_id, client_secret,
refresh_token}` to a scratch file, point `GOOGLE_APPLICATION_CREDENTIALS` at it, and every
`firebase-admin` script runs as that account. The client id/secret are firebase-tools' own public
pair, in `lib/api.js` of the global install. **Never print the token.** Delete the scratch file when
finished. Verified with `seed-demo-club.js --verify` against production.

**The technique that keeps paying off**: `test/readiness-engine.test.js` lifts a function out of
`js/app.js` with `grab()` and runs it over a fake `localStorage`. Point the same harness at
production data and you get the app's own answer for every player, without a browser. It needs four
things the tests stub: `getUsers`, `_clubConfig`, `CATEGORY_ORDER`, and
`utils.setSeasonBoundary(club.seasonBoundary)` — **leaving the boundary at the 08-15 default puts
every session outside the season window and reports `hasData` 0/75**, which looks like a catastrophic
finding for about a minute. Verify the harness before believing it.

---

## Push notifications — where they stand

**Proven end to end (2026-08-19):** a convocatòria sent by staff arrived on an Android home-screen
PWA. Token → FCM → service worker → notification all work.

**Still not proven: any of the three scheduled reminders.** They share `sendToTokens` and the same
token, so delivery is settled — triggers, audiences and preconditions are not. All three log their
audience *before* sending, so a zero reads as a precondition failure rather than a push failure:

```bash
firebase functions:log --only scheduledRpeReminder --project esquerrapp
```

- RPE, 23:00 Madrid: needs `teams/{id}.trainingDates` to contain today, a session today, the player
  answered `yes`/`late`, and **no** `rpe` doc yet — deleting that one doc is the cheapest way to
  become eligible.
- Availability, Friday 20:00.
- Training, hourly 3.5–4.5 h before a session. The demo club has future sessions again, so this is
  testable for the first time.

---

## The owner may have access to two Macs

Stated 2026-08-19; it changes the iOS answer from "not startable". Still required and not free: the
**Apple Developer Program, $99/year** (organisation enrolment needs a D-U-N-S number but publishes
under the club's name). What iOS would need, none of which exists: `npx cap add ios`;
**`NSPhotoLibraryUsageDescription`** in `Info.plist` (the profile-photo picker crashes at runtime
without it); **`PrivacyInfo.xcprivacy`**; an **`apns` block in `sendToTokens`** (`buildMessage` builds
web and android shapes only); an APNs .p8 key, push entitlement, `remote-notification` background
mode.

**Do this before spending anything:** iOS 16.4+ already supports web push for a home-screen PWA, and
v95 shipped everything needed for it. If that serves the club's iPhone users, the $99 and the build
pipeline may not be worth it.

---

## Parking lot

1. **The cross-category call-up — decide before building.** The owner's workflow: an amateur coach
   agrees with a juvenil player and calls him up despite his never having had the Friday availability
   push. **Within a category this already works** — `renderConvocatoria` filters the picker by
   category only, never by letter, so an amateur coach already sees A and B.

   **Across categories it does not**, and there are two independent blockers: the picker filters to
   the coach's current category, and `getVisibleCategories()` returns `[s.category]` for a player, so
   he never downloads `fa_convocatoria_sent__amateur` **or `fa_matches__amateur`** — the call-up and
   the match itself would be invisible in his app.

   **The push is NOT a blocker.** `Push.sendToPlayers(teamId, targetUids)` writes a `pushQueue` doc
   with `targetPlayers` and `onPushQueueCreate` calls `getTokensForUsers`; category never enters it.
   That is also the right distinction: the Friday reminder is a broadcast to a *squad* he is
   correctly not in; the convocatòria is addressed to *named individuals the coach chose*.

   So the work is the picker plus what he sees after tapping. Two shapes: **staff-side only** (he
   appears on the convocatòria and gets the push, but the match is still missing from his app) or
   **widen a player's shard scope**, which touches `firestore.rules` and undoes part of the isolation
   Phase 5 bought. The same hole already exists for a training `guests` entry from another category.

2. **Training detail / session planning** (reported 2026-08-09, untouched): expected-player count
   beside "Assistència Jugadors"; strike through no-shows in the exercise teams; equalise the
   "Planificació entrenament" panel width; make that panel free-text editable. v85 changed the squad
   plumbing underneath — read that part of CONTEXT.md first.
3. **Fill in `privacy.html`** and have it reviewed. Live at
   `https://scaredmeeseks.github.io/EsquerrApp/privacy.html` with every club-specific fact still a
   `⚠` placeholder. Blocks **both** stores, no code dependency.
4. **The APK** — CI has built through v110; the phones are on v43-era. Set
   `clubs/nDLJCpJfDvFHs8MnwtzW.minAppVersion` only once a current APK is actually installed.
5. **Drop dual-write** — `TB_DUAL_WRITE` still mirrors the board library into `fa_tactic_saved` for
   the v43-era APK. Gated on 4.
6. **Play Console** — $25 plus identity verification. Then four secrets
   (`ANDROID_KEYSTORE_BASE64`, `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS`,
   `ANDROID_KEY_PASSWORD`) turn on the signed AAB build already dormant in the workflow. Gated on 4.
7. **The free D-U-N-S lookup** — <https://developer.apple.com/enroll/duns-lookup/>. Long pole on iOS,
   costs nothing to check.
8. **Readiness thresholds** — every measurement is against demo data, and the demo data has since
   changed materially. Re-measure before touching a threshold.
9. **Old-APK rules shim** — `clubs/{clubId}` still lets a lead write `fcfLinks`/`schedules` directly.
   Delete once a v55+ APK circulates.
10. **Push governance** — `firestore.rules:197` lets **any team member** enqueue a push to the whole
    team, with no staff check and no validation of `title`/`body`. `Push.sendToTeam` is dead code.
11. Smaller: three stranded accounts on `teamId: 'default'`; availability still club-wide readable;
    orphaned shards when a category is emptied; uncategorised players inconsistent across three staff
    pages; `backfill-training-teams.js` has no `preflight()`.

---

## Current state

- Repo: `c:\DATA\CLAUDE\EsquerrApp` → https://github.com/ScaredMeeseks/EsquerrApp. Firebase project
  `esquerrapp`. Frontend = GitHub Pages from `main`; APK = CI on push; rules/functions =
  `.\deploy.ps1`; Admin SDK = local, see above.
- **Bump the version in THREE places together**: `CACHE_NAME` in `sw.js`, `APP_VERSION` in
  `js/app.js`, `CURRENT` in `functions/check-deploy.js`.
- Tests: `cd test && npm test`. Fast path `npm run test:unit` (~1s). If a suite says
  `Could not spawn java -version`:
  `$env:PATH = "C:\Program Files\Microsoft\jdk-21.0.12.8-hotspot\bin;$env:PATH"`
- **New test files must be added to `test:unit` / `test:functions` by hand.** `injuries.test.js` was
  added this session; `focus-plan`-style silent omissions have happened before.
- `gh` is **not** installed. The GitHub REST API with `curl` works; unauthenticated is **60
  requests/hour**. A read-only fine-grained PAT (Actions: Read, Contents: Read) lifts it to 5000 and
  is the only way to read Actions logs or download artifacts.
- **Never edit `www/`** — CI-generated mirror for the Capacitor build.

### Clubs in production

- `nDLJCpJfDvFHs8MnwtzW` — **Esquerra de l'Eixample F.C.**, lead `marna96@gmail.com`, `amateur` only.
- `Tm96gel58VSQvxgynf45` — **demo club** ("C.E. Sant Andreu del Palomar"), join code `9CA4RR`,
  `coach@demo.esquerrapp.app` / `DemoEsquerra2026!`. 3 teams / 77 members. Topped up 2026-08-20:
  131 sessions (36 future, to 2026-10-22), 102 matches (30 future), 6873 rpe, 6977 availability,
  1713 matchAvail, 67 trainingDates. **It goes stale**: `hasData` expires at `STALE_AFTER_DAYS = 10`,
  so a demo nobody tops up shows ~54 grey dashes ten days after the last run. Re-run the top-up
  before showing it to anyone.
- `lly4GkUxIpBkSgZvzldT` — F.C.Barcelona test club. Holds seeded boards from template testing.

### ⚠ Never run `seed-demo-club.js --apply` at the demo club

`apply()` builds a club **from nothing**. Pointed at the populated demo club it destroys it three
ways, silently: it rewrites the whole `categories` map, it **replaces** data shards with a bare
`set()` — and `fa_users` is routed by category with no team letter, so `fa_users__amateur` would lose
amateur-B and juvenil-A — and it resets all 77 Auth passwords. It is guarded by neither the
`demoSeed` stamp nor `PROTECTED_CLUBS`; only `--purge` and `--add-team` are.

```bash
node functions/seed-demo-club.js --verify --club Tm96gel58VSQvxgynf45   # read-only
node functions/topup-demo-season.js --club Tm96gel58VSQvxgynf45         # dry run
node functions/topup-demo-season.js --club Tm96gel58VSQvxgynf45 --apply # additive only
```

**Do not run `cleanup-seed.js`** — it keys on pre-Phase-1 numeric uids and would treat much of the
current demo corpus as garbage.

---

## Lessons that keep repeating

- **Two sources of truth need something that can cancel, not just override.** v110's whole bug was a
  branch that could raise a flag and not lower one. When a screen disagrees with another screen, look
  for the write that only half-happened before looking for a render bug.
- **A field that is `readonly` fires no `change`, and a programmatic `.value =` fires nothing at
  all.** v109. Any custom picker's own event is the only signal there is.
- **Prove the old code fails.** Both fixes this session were checked against
  `git show HEAD:js/app.js` in the same harness. A test written after the fix, never run against
  the bug, pins nothing.
- **Read the data, not the summary.** A tool that reports on its own work will report success.
- **Run the real implementation over the real data** — the test harness that lifts a function out of
  `app.js` is also a production diagnostic. Check the harness before believing the harness.
- **Check the artefact, not the operation** — `curl` the served `sw.js`, not the push output.
- **A parallel-array invariant that nothing checks will be broken by an unrelated change.**
- **"Is this legacy?" is the right question, and the answer is often no.**
