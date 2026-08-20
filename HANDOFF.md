# HANDOFF — EsquerrApp

_Rolling document, overwritten each session. Last updated: 2026-08-20._

**Production is on v98** (frontend, served and verified) **and functions are deployed** (v97c).
Tests **721 passing** (522 unit + 134 rules + 56 functions + 9 backfill, +23 this session).

Both jobs agreed on 2026-08-19 are **done**. Two further defects were found on the way, both fixed:
**all three schedulers** were notifying the whole club, and the readiness score was borrowing load
across categories.

---

## What shipped today

### v97b — the RPE reminder's match branch nagged the whole club (functions, deployed)

The training half of `scheduledRpeReminder` has been squad-scoped since v71. The match half called
`getTeamMembersByRole(teamId, "player")`, which filters by **role alone** — so on a match day every
player in the club was told to log RPE for a match they were never called up to, including players
in a category that was not even playing.

`squadForMatch()` reads the audience from `fa_convocatoria_sent` — literally "was called up" — from
the shard of the **match's own category**. An entry that lists nobody notifies nobody; that is the
answer, not a reason to fall back. Only a *missing* entry falls back, because fixtures predate the
feature, and then to the match's own squad rather than the club.

`matches.find(m => m.date === today)` was the **same defect the training half already had fixed**:
two categories play the same Saturday, so the second one's match was never chased while its players
were nagged about the first. It filters and loops now, and the log line carries a per-match
`{id, source, called}` so a zero audience reads as "nobody called up" or "no convocatòria" without
opening Firestore.

**Deployed** 2026-08-20, all 17 functions updated. **Not yet proven end to end** — the reminder runs
at 23:00 Europe/Madrid, so the first honest evidence is tonight's log:
`firebase functions:log --only scheduledRpeReminder --project esquerrapp`. Look for `source` on the
match entries.

### v97c — the Friday availability reminder asked the whole club (functions, deployed)

The same defect, third scheduler. On a weekend with three fixtures — amateur A, amateur B, juvenil —
**every player in the club got three separate pushes**, two about teams he is not in, and they stack
rather than collapse because the tag is per match.

It **cannot** be fixed the way v97b was: this runs on **Friday, before a convocatòria exists**, and
exists precisely so the coach has availability answers to pick from on Saturday. So the audience is
the squad instead: **category plus team letter**. `matchAsSession()` is shared with
`squadForMatch`'s fallback, so the squad rule has exactly one definition.

**Injured players are still asked, deliberately** — availability is a question, not a status, and a
player recovering may be fit by Sunday. Pinned by a *behavioural* test after a first attempt
asserted `!/injur/i` over the source and failed against the comment explaining there is no filter.

Deployed 2026-08-20, all 17 functions updated. First real evidence is a Friday 20:00 run: the log
line now carries `{category, team, players, unanswered}`.

### v98 — readiness was counting the other category's training (frontend, served)

Found by running the **real** `computeReadiness` over the **real** demo-club data, not by reading it.

It iterated the whole downloaded `trainingList` with no `playerIsCalled()` filter — the one filter
every other player surface applies. Invisible from a phone, because a player's client downloads his
own category. **A coach downloads every category**, and on the staff roster each player was credited
with the other categories' sessions — not as a reading, but as an **estimate**, because the borrow
branch fires when the player has no availability record saying he was out, and he has none for a
session that was never his.

Measured: **54 of 75 scores moved, by up to 34 points**; the "includes estimated load" badge sat on
20 players where 9 earned it. Matches are deliberately not filtered the same way — a B-team player
called up for the A team is a normal Saturday, and the match branch already keys on his own RPE or
his own minutes.

Served and verified: `esquerrapp-v98`, `APP_VERSION = 98`, `playerIsCalled(t, me)` present in the
deployed `js/app.js`, and `/CONTEXT.md` + `/firestore.rules` still 404.

### The demo club — the fourth bug, and it was the whole story

Three rounds of "still not happy" had been answered from `topup-demo-season.js`'s own summary, which
kept reporting small gaps. Reading the data instead:

```
fa_training  93 rows   93 past /  0 future   → 2026-08-13
fa_matches  102 rows   72 past / 30 future   → 2026-10-24
```

**A club with a next match and no next session, ever.** Empty "pròxims entrenaments", nothing to
confirm availability for, `trainingDates` holding only past dates — so `scheduledTrainingReminder`
could never fire for it, which is *also* why that reminder had never been testable here.

Every step of the top-up is guarded by `t.date < todayStr`, by construction. **No number of re-runs
could have fixed it**, which is exactly why every dry run kept reporting a healthy-looking club.

Step 5 now extends the calendar, with the schedule **derived from the club's own sessions** —
weekdays, time, location, map link, focus rotation — rather than hardcoded to the seeder's
Tuesday/Thursday. Only the past gets availability and RPE.

A second, quieter bug went with it: `trainingDates`/`matchDates` were recomputed from the snapshot
the run **read**, not from what it was about to **write**. Harmless while every change was a status
flag or a per-record document — no shard gained a date. The calendar is the first change that adds
one, and the first dry run duly reported `trainingDates 48` for a club about to gain 19: a calendar
restored and still invisible to the reminder.

**Applied** (2026-08-20): +38 sessions to 2026-10-22, +64 training RPE, +313 match RPE,
`trainingDates` 48 → 67, rpe 6496 → 6873. `--verify` clean afterwards.

Measured with the real engine either side of the change:

|                | before  | after   |
|----------------|---------|---------|
| `hasData`      | 21 / 75 | 54 / 75 |
| estimated badge| 20 / 75 |  3 / 75 |

55/75 is the ceiling with every gap filled, so 54 is essentially maxed. The remaining 21 have nothing
recent to report *on* — not called up, or answered no/injured.

**The club goes stale again.** `hasData` expires at `STALE_AFTER_DAYS = 10`, so a demo nobody tops up
shows ~54 grey dashes about ten days after the last run. That is the shape of the recurring
complaint, not a new bug each time. Re-run the top-up before showing the demo to anyone.

---

## ⚠ The Admin SDK runs locally now — no Cloud Shell

This is the change that made today's diagnosis possible, and it replaces the old
"Admin SDK still needs Cloud Shell" note.

`firebase-tools` stores `marna96@gmail.com`'s refresh token in
`~/.config/configstore/firebase-tools.json` (`additionalAccounts[]`), and that is already in ADC's
**`authorized_user`** shape. Write `{type: "authorized_user", client_id, client_secret,
refresh_token}` to a scratch file, point `GOOGLE_APPLICATION_CREDENTIALS` at it, and every
`firebase-admin` script runs as that account. The client id/secret are firebase-tools' own public
pair, in `lib/api.js` of the global install. **Never print the token.** Delete the scratch file when
finished.

Verified with `seed-demo-club.js --verify` against production.

### The technique that found all three bugs

`test/readiness-engine.test.js` lifts `computeReadiness` out of `js/app.js` with `grab()` and runs it
over a fake `localStorage`. Point that same harness at **production data** and you get the app's own
answer for every player, without a browser. That is how "the badge is a data gap" was disproved and
the category leak found. The harness needs four things the tests stub: `getUsers`, `_clubConfig`,
`CATEGORY_ORDER`, and `utils.setSeasonBoundary(club.seasonBoundary)` — **leaving the boundary at the
08-15 default put every session outside the season window and reported `hasData` 0/75**, which looked
exactly like a catastrophic finding for about a minute. Verify the harness before believing it.

---

## Push notifications — where they stand

**Proven end to end (2026-08-19):** a convocatòria sent by staff arrived on an Android home-screen
PWA. Token → FCM → service worker → notification all work, after the v97 fix.

**Not proven:** the three scheduled reminders. They share `sendToTokens` and the same token, so
delivery is settled — triggers, audiences and preconditions are not.

The RPE reminder is now testable and worth watching tonight (23:00 Madrid). It needs
`teams/{id}.trainingDates` to contain today, a session today, the player answered `yes`/`late`, and
**no** `rpe` doc yet — deleting that one doc is the cheapest way to become eligible. It logs
`rpeReminder {teamId, sessions, matches, missing}` *before* sending, so a zero `missing` means the
preconditions failed rather than the push.

**The training reminder is testable for the first time**: the demo club has 36 future sessions, and
`trainingDates` now holds them, so the 3.5–4.5 h hourly tick has something to find. First candidate
session: **2026-08-25**.

One loose end: on one device the permission grant showed an error and the notification arrived
anyway. That fits `_requestWebPermission` throwing after the grant while `_ensureWebToken` succeeded
on the next render. Harmless; the console text would confirm it.

---

## The owner may now have access to two Macs

Stated 2026-08-19. This **changes the iOS answer**, which until now was "not startable".

With a Mac the App Store path opens: local builds, simulator, real APNs debugging. **Still required,
and not free:** the **Apple Developer Program, $99/year**. Individual enrolment takes a day or two;
**organisation** enrolment needs a **D-U-N-S number** and takes longer, but publishes under the
club's name — for a football club that is almost certainly what you want.

What iOS would need, in order (none of it exists today):

1. `npx cap add ios` — the trivial part.
2. **`NSPhotoLibraryUsageDescription`** in `Info.plist`. The profile-photo picker
   (`index.html:216`) opens the photo library; without the string the app **crashes at runtime**.
3. **`PrivacyInfo.xcprivacy`** — mandatory since 2024.
4. **An `apns` block in `sendToTokens`** ([functions/index.js](functions/index.js)). There is none;
   `buildMessage` builds web and android shapes only.
5. APNs key (.p8) uploaded to Firebase, push entitlement, `remote-notification` background mode.

**Do this before spending anything:** iOS 16.4+ already supports web push for a home-screen PWA, and
v95 shipped everything needed for it. If that serves the club's iPhone users, the $99 and the build
pipeline may not be worth it.

---

## Parking lot

1. **The cross-category call-up — decide before building.** The owner's workflow (2026-08-20): an
   amateur coach agrees with a juvenil player and calls him up despite his never having had the
   Friday availability push. **Within a category this already works** — `renderConvocatoria` filters
   the picker by category only, never by letter ([js/app.js:13097](js/app.js)), so an amateur coach
   already sees A and B and can call a B player up for an A fixture.

   **Across categories it does not**, and there are two independent blockers. The picker filters to
   the coach's current category. And `getVisibleCategories()` returns `[s.category]` for a player,
   so he never downloads `fa_convocatoria_sent__amateur` **or `fa_matches__amateur`** — the call-up
   and the match itself would be invisible in his app, and the push would open onto nothing.

   **The push is NOT a blocker** — an earlier note in this session said it was, wrongly. The
   convocatòria push is addressed by uid: `Push.sendToPlayers(teamId, targetUids)` writes a
   `pushQueue` doc with `targetPlayers`, and `onPushQueueCreate` calls
   `getTokensForUsers(data.targetPlayers)`. Category never enters it. A juvenil player called up to
   an amateur match **would** be notified today, if he could be selected. That is also the right
   behaviour and the right distinction: the Friday reminder is a broadcast to a *squad*, which he is
   correctly not in; the convocatòria is addressed to *named individuals the coach chose*.

   So the work is the picker plus what he sees after tapping. Two shapes: **staff-side only** (he
   appears on the convocatòria the coach sends and prints, and gets the push, but the match itself
   is still missing from his app) or **widen a player's shard scope**, which touches
   `firestore.rules` and undoes part of the isolation Phase 5 bought. The same hole already exists
   for a training `guests` entry from another category: `playerIsCalled` honours it, the guest's
   client never downloads the session.
2. **A category badge on player rows, when more than one category is on screen** (requested
   2026-08-20). A small grey capital beside the name: **J** juvenil, **C** cadet, **I** infantil,
   **A** aleví, **B** benjamí; amateur carries none, being the senior default. Show it only when the
   rendered list spans more than one category — a single-category club like Esquerra de l'Eixample
   must see no change.

   ⚠ **A and B already mean something else on these very rows.** `conv-team-circle` renders the
   *team letter*, so "A" would read as amateur-A and aleví depending on which badge it is. Decide
   before building: distinct shape/colour for the two badges, or two-letter initials for the
   colliding pair (`AL`, `BE`), or category-then-team with a separator. A grey capital alone is
   ambiguous exactly where the feature is meant to remove ambiguity.

   Natural home: a `CATEGORY_INITIALS` map next to `CATEGORY_LABELS` in `js/utils.js`, and one
   shared `catBadgeHtml(player)` used by every player-row renderer (convocatòria picker, roster,
   attendance, injuries) rather than per-surface markup.

3. **Club kits are hardcoded to Esquerra de l'Eixample** (requested 2026-08-20). `jerseySvg(variant)`
   knows exactly two values, `'white'` and `'yellow'`, with the hexes inline (`#FFFFFF`/`#FFD662`,
   collars `#CCCCCC`/`#e6b800`) and `img/logo.png` baked into the `<image>` tag. `sockSvg` knows
   `'striped'` (black-and-white hoops) and `'yellow'`. **Every club in the platform wears Esquerra's
   kit.** `fa_convocatoria_sent` stores those literals, so old records constrain any fix.

   Proposed shape — put the kit on the club and give the app **one** kit model, because there are
   currently two. The tactical board already has a good one: a hex plus `{on, n, dir}` stripes
   (`_stripeCfgOf` / `teamFill`), but it is stored **per board** (`fa_tactic_team_stripes`), not per
   club, which is why a new board does not know the club's colours either.

   ```
   clubs/{clubId}.kits = [
     { id: 'home', label: 'Local',
       shirt: { base: '#ffffff', stripes: {on: false} },
       socks: { base: '#ffffff', stripes: {on: true, n: 5, dir: 'h', color: '#222'} } },
     { id: 'away', label: 'Visitant', shirt: {...}, socks: {...} }
   ]
   ```

   Then: `jerseySvg`/`sockSvg` take a **kit object** instead of a literal; the convocatòria renders
   one button per configured kit instead of two hardcoded ones; `fa_convocatoria_sent` stores the
   kit **id**, with `'white'|'yellow'|'striped'` still resolving for records already written; the
   board's default team fill seeds from the club's first kit; and the shirt's `<image>` uses club
   branding rather than `img/logo.png`. Lead-only in the club settings page, and `firestore.rules`
   must restrict `kits` to the lead — it is `clubs/{clubId}`, which the old-APK shim still leaves
   partly writable (item 11).

   Note `seed-demo-club.js` and `topup-demo-season.js` both write `jersey: "white", socks:
   "striped"`; the fallback covers them, but the demo club should get its own kit once this exists.

4. **Watch tonight's 23:00 RPE reminder log**, then the Friday 20:00 availability run, then test the
   training reminder against the demo club's 2026-08-25 session. Delivery is proven; **no trigger
   is**. All three now log their audience before sending, so a zero reads as a precondition failure
   rather than a push failure.
5. **Fill in `privacy.html`** and have it reviewed. Live at
   `https://scaredmeeseks.github.io/EsquerrApp/privacy.html` with every club-specific fact still a
   `⚠` placeholder. Blocks **both** stores, no code dependency.
6. **The free D-U-N-S lookup** — <https://developer.apple.com/enroll/duns-lookup/>. Long pole on iOS,
   costs nothing to check.
7. **Play Console** — $25 plus identity verification. Then four secrets
   (`ANDROID_KEYSTORE_BASE64`, `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS`,
   `ANDROID_KEY_PASSWORD`) turn on the signed AAB build already dormant in the workflow.
8. **Training detail / session planning** (reported 2026-08-09, untouched): expected-player count
   beside "Assistència Jugadors"; strike through no-shows in the exercise teams; equalise the
   "Planificació entrenament" panel width; make that panel free-text editable. v85 changed the squad
   plumbing underneath — read that part of CONTEXT.md first.
9. **Drop dual-write** — `TB_DUAL_WRITE` still mirrors the board library into `fa_tactic_saved` for
   the v43-era APK. **Gated on a current APK actually being on the phones.**
10. **The APK itself** — CI has built through v98; the phones are on v43-era. Set
   `clubs/nDLJCpJfDvFHs8MnwtzW.minAppVersion` only once a current APK is installed. Blocks 7.
11. **Readiness thresholds** — every measurement is still against demo data, but the demo data is now
   materially different from what those measurements were taken on. Re-measure before touching a
   threshold.
12. **Old-APK rules shim** — `clubs/{clubId}` still lets a lead write `fcfLinks`/`schedules`
    directly. Delete once a v55+ APK circulates.
13. **Push governance** — `firestore.rules:197` lets **any team member** enqueue a push to the whole
    team, with no staff check and no validation of `title`/`body`. `Push.sendToTeam` is dead code.
14. Smaller: three stranded accounts on `teamId: 'default'`; availability still club-wide readable;
    orphaned shards when a category is emptied; uncategorised players inconsistent across three
    staff pages; `backfill-training-teams.js` has no `preflight()`. Also **19 players answered
    `injured` for the 2026-08-13 demo session while only 9 injuries are live** — probably just
    injuries that resolved since, but it has not been checked and it is the kind of detail a
    football person notices.

## Current state

- Repo: `c:\DATA\CLAUDE\EsquerrApp` → https://github.com/ScaredMeeseks/EsquerrApp. Firebase project
  `esquerrapp`. Frontend = GitHub Pages from `main`; APK = CI on push; rules/functions =
  `.\deploy.ps1`; Admin SDK = local, see above.
- **`main` is at v98 (`e9342e1`), working tree clean, pushed and SERVED.**
- Tests: `cd test && npm test`. Fast path `npm run test:unit` (~1s). If a suite says
  `Could not spawn java -version`:
  `$env:PATH = "C:\Program Files\Microsoft\jdk-21.0.12.8-hotspot\bin;$env:PATH"`
- **New test files must be added to `test:unit` / `test:functions` by hand.**
- `gh` is **not** installed. The GitHub REST API with `curl` works; unauthenticated is **60
  requests/hour**. A read-only fine-grained PAT (Actions: Read, Contents: Read) lifts it to 5000 and
  is the only way to read Actions logs or download artifacts.

### Clubs in production

- `nDLJCpJfDvFHs8MnwtzW` — **Esquerra de l'Eixample F.C.**, lead `marna96@gmail.com`, `amateur` only.
- `Tm96gel58VSQvxgynf45` — **demo club** ("C.E. Sant Andreu del Palomar"), join code `9CA4RR`,
  `coach@demo.esquerrapp.app` / `DemoEsquerra2026!`. 3 teams / 77 members. Topped up 2026-08-20:
  131 sessions (36 future, to 2026-10-22), 102 matches (30 future), 6873 rpe, 6977 availability,
  1713 matchAvail, 67 trainingDates.
- `lly4GkUxIpBkSgZvzldT` — F.C.Barcelona test club. **Holds seeded boards from template testing.**

### ⚠ Never run `seed-demo-club.js --apply` at the demo club

`apply()` builds a club **from nothing**. Pointed at the populated demo club it destroys it three
ways, silently: it rewrites the whole `categories` map, it **replaces** data shards with a bare
`set()` — and `fa_users` is routed by category with no team letter, so `fa_users__amateur` would lose
amateur-B and juvenil-A — and it resets all 77 Auth passwords. It is guarded by neither the
`demoSeed` stamp nor `PROTECTED_CLUBS`; only `--purge` and `--add-team` are.

What is safe:

```bash
node functions/seed-demo-club.js --verify --club Tm96gel58VSQvxgynf45   # read-only
node functions/topup-demo-season.js --club Tm96gel58VSQvxgynf45         # dry run
node functions/topup-demo-season.js --club Tm96gel58VSQvxgynf45 --apply # additive only
```

`--purge` works but deletes the club, all 77 Auth accounts, and invalidates `9CA4RR` and the
handed-out credentials. **Do not run `cleanup-seed.js`** — it still keys on pre-Phase-1 numeric uids
and would treat much of the current demo corpus as garbage.

---

## Lessons that keep repeating

- **Read the data, not the summary.** Four bugs in `topup-demo-season.js` were found only by
  distrusting its own output: the status literal, RPE nested inside the availability branch, match
  RPE missing entirely, and — the one that explained everything — a calendar with no future. Each
  cost a round trip that one Firestore read would have closed. The fourth cost three.
- **A tool that reports on its own work will report success.** Every dry run was truthful about what
  it could see, and every step it could see was guarded to the past. The gap was in a dimension the
  summary had no line for.
- **Run the real implementation over the real data.** The test harness that lifts a function out of
  `app.js` is also a production diagnostic. It settled in one run what three sessions of reasoning
  about the readiness badge had not — *and* it lied convincingly for one run first, because the
  season boundary was left at its default. Check the harness before believing the harness.
- **Check the artefact, not the operation.** Today: `curl` the served `sw.js` and `app.js`, not the
  push output; `--verify` the club, not the "Done" line.
- **A test that pins a no-op is worse than no test** — it goes green for ever while the thing stays
  broken. Every new test this session has a paired negative that fails on the old code.
- **A parallel-array invariant that nothing checks will be broken by an unrelated change.**
- **"Is this legacy?" is the right question, and the answer is often no.**
- **A failure that looks like misconfiguration may be infrastructure.**
