# HANDOFF — EsquerrApp

_Rolling document, overwritten each session. Last updated: 2026-08-20._

**Production is on v97.** Tests **698 passing** (499 unit + 134 rules + 56 functions + 9 backfill).

Two blocks of work: the tactical-board features (v86–v94) and a mobile/push audit that turned into
real fixes (v95 onwards).

---

## ⚠ START HERE — test the RPE push notifications first

Push is **proven end to end**: a convocatòria sent from staff arrived on an Android home-screen PWA
(2026-08-19). Token → FCM → service worker → notification all work, after the v97 fix.

What is **not** proven is any of the three **scheduled** reminders. They share `sendToTokens` and
the same token, so delivery is settled — but the trigger, the audience and the preconditions are
untested. **Start with the RPE reminder.**

Intended behaviour, as stated by the owner: *an RPE reminder goes only to a player who **attended
the training**, or who **was in the convocatòria** for a match.*

### The training half matches that. The match half does not.

`functions/index.js` ~685, inside `scheduledRpeReminder`:

```js
if (todayMatch) {
  const all = await getTeamMembersByRole(teamId, "player");   // EVERY player in the club
  all.forEach((uid) => {
    if (!rpeIds.has(uid + "_match_" + todayMatch.id)) missing.add(uid);
  });
}
```

`getTeamMembersByRole` filters by **role only** — no category, no letter, no convocatòria. So on a
match day **every player in the club is nagged for a match they were never called up to**, including
players in an entirely different category. The training branch is correct (only `yes`/`late`
answers, and only the session's own squad via `squadForSession`).

The fix is to use the convocatòria's own list — `fa_convocatoria_sent[matchId].players`, which is
exactly "was called up" — instead of every player with the role. Worth doing **before** the test,
or the test will faithfully reproduce the wrong behaviour.

### How to test it

The reminder runs at **23:00 Europe/Madrid** and needs, for a training: `teams/{id}.trainingDates`
to contain today, a session today, the player answered `yes`/`late`, and **no** `rpe` doc yet for
it. Deleting that one `rpe` doc is the cheapest way to make yourself eligible.

Watch it with `firebase functions:log --only scheduledRpeReminder --project esquerrapp` — it logs
`rpeReminder {teamId, sessions, missing}` before sending, so a zero `missing` tells you the
preconditions failed rather than the push.

---

## The two template-save defects — FIXED in v96

Kept as a note because the symptom was misleading and may recur in another form. Reported as
*"I'm not sure the edits are being saved correctly"*; the drawing always saved.

- **`saveTemplate` wrote `category` unconditionally.** The editor's entry carries none — a
  template's category is *library* metadata edited in the Biblioteca table — so every Save from the
  editor reset it to `''`. Now guarded on the entry carrying one. **`tag` stays unconditional on
  purpose**: the editor *has* a tag control, so it owns the tag and must be able to clear it. That
  contrast is the rule.
- **`_abLoad` short-circuits on `loaded`**, so returning to the Biblioteca re-rendered the pre-edit
  row. The payload had saved; the row was lying — which is almost certainly what was seen, since
  re-opening the template showed the edit. `_abInvalidate()` hangs off the two save paths rather
  than the exit button, because the sidebar is also a way back.

Also v96b: a promoted template's category now defaults to **the author's highest category** from
`clubs/{id}/boardAuthors` rather than the board's `getCurrentCategory()` stamp, falling back to the
stamp when `ownerUid` is `''` (every migrated and seeded board). The Biblioteca dropdown stays — it
is a default, not a constraint.

---

## The owner may now have access to two Macs

Stated 2026-08-19. This **changes the iOS answer**, which until now was "not startable".

With a Mac, the App Store path opens: local builds, simulator, and real APNs debugging — the part
that is genuinely painful on cloud CI. Claude Code and GitHub both work fine from macOS.

**Still required, and not free:** the **Apple Developer Program, $99/year**. Individual enrolment
takes a day or two; **organisation** enrolment needs a **D-U-N-S number** for the club and takes
longer, but publishes under the club's name rather than a person's — for a football club that is
almost certainly what you want.

What iOS would need, in order (none of it exists today):

1. `npx cap add ios` — the trivial part.
2. **`NSPhotoLibraryUsageDescription`** in `Info.plist`. The profile-photo picker
   (`index.html:216`) opens the photo library; without the string the app **crashes at runtime**,
   which is a review failure *and* a user crash.
3. **`PrivacyInfo.xcprivacy`** — mandatory since 2024, must declare required-reason API use.
4. **An `apns` block in `sendToTokens`** ([functions/index.js](functions/index.js)). There is none;
   `buildMessage` builds web and android shapes only. Without `aps` and `apns-push-type`, APNs
   rejects or drops the message.
5. APNs key (.p8) uploaded to Firebase, push entitlement, `remote-notification` background mode.

**Do this before spending anything:** iOS 16.4+ already supports web push for a PWA added to the
home screen, and v95 shipped everything needed for it (see below). If that serves the club's iPhone
users, the $99 and the build pipeline may simply not be worth it.

---

## What shipped

### Tactical boards (v86–v94)

Superadmin catalogue of every club's boards, and a platform template library. Club boards are
**read-only** there by decision; the only way one leaves its club is `promoteBoardTemplate`, which
takes an anonymised copy. Templates land as **drafts** (`published: false`) and
`seedClubFromTemplates` refuses anything unpublished.

Then a run of defects, each found by the owner testing:

- **v88** — the opposition flashed on and off around playback: `renderReadOnlyBoard` decided
  visibility **twice, differently** (the static render tested `showOpp`, the animation did not).
- **v89** — an animated board opened on its **last** frame. `positions` is whatever was on screen at
  Save, and `tbHydrateEditor` reset the frame index to 0 — so the editor believed frame 0 and
  displayed frame N. Worse: `autoSaveFrame()` then **overwrote frame 0** on the next drag.
- **v90/v91** — per-player colours for the opposition (the picker was offered and silently
  reverted by `saveState`), then forward-only propagation for both teams.
- **v92** — **undo had been scrambling the board since v90**: `popUndo` restored through two
  index-aligned arrays and v90 added an entry to one and not the other. Now one list of pairs.
- **v93/v94** — striped kits, and the shirt number on a two-colour kit.

**The structural win:** `darkenHex` went from **22 callers to zero** in `app.js`. Five separate
places draw a circle, and nothing but a source assertion notices when they drift — which is exactly
how v88 and v90 happened.

### Push and store readiness (v95 →)

An audit of "can this ship to the stores, and does push work" found four **live** defects on the
web app the club actually uses:

- `webpush.fcmOptions.link` was `"/"` while the app is on a GitHub Pages **subpath**, so
  cold-start notification clicks opened the domain root.
- **Logging out never removed your push token.** `_removeWebToken` called `getToken()` with no
  options, fell back to `/firebase-messaging-sw.js` (which does not exist here), threw, and the
  error was swallowed. On a shared device the next push for the previous user still arrived.
- **Duplicate notifications**: one message went to every token, so the SDK displayed the
  `notification` payload and `sw.js` displayed it again. Now split by the `platform` field the
  client already stored — **web gets data-only**, native gets `notification` +
  `android.notification`.
- **The permission prompt was being spent for nothing** — it ran from the auth-state handler with
  no user gesture. Browsers auto-deny that and **iOS ignores it outright**. It is behind a tap now,
  which is also what unlocks iOS.

Plus: the `tag` never reached Android (wrong field, so reminders stacked there), and the
**500-token multicast cap** was never chunked.

**iOS web push is now possible with no Mac and no money**: the gesture fix plus an
Add-to-Home-Screen banner for iOS Safari. `manifest.json` was already correct.

### Build and exposure

- A missing `google-services.json` now **throws** instead of producing a successful build with
  silently dead push. Escape hatch: `-PallowNoFirebase=true`.
- **`versionCode` derives from `APP_VERSION`.** It was hardcoded `1` while the app was at 95 — the
  second Play upload would have been rejected.
- Release signing and `bundleRelease` **exist but are dormant**, guarded on a keystore secret.
- `npm install` → `npm ci`; Capacitor CLI pinned to 8.x (was 7.6.1 driving 8.3.0).
- **The APK was shipping the repo** — `CONTEXT.md` (239 KB), the whole `test/` suite,
  `firestore.rules`, deploy scripts, and five debug pages that were live routes in the WebView.
  Now one shared definition, `scripts/build-www.js`, which checks itself.
- **So was the website.** Pages serves the whole branch, so `/CONTEXT.md` and `/firestore.rules`
  were returning 200. Fixed with `_config.yml`. **Adding a `.nojekyll` would publish it all again.**
- `privacy.html` is drafted and live, with `⚠` placeholders. **It needs the club's details and a
  qualified review** — it makes representations about health and minors' data.

### Verified against the artifacts, not the scripts

- **Native push IS wired in every CI APK** and has been: `assets/capacitor.plugins.json` lists both
  plugins and the FCM app id is in `resources.arsc`. The stale committed Gradle files only bite a
  local build.
- The mirror trim is confirmed **in the binary**: `assets/public/` is the app plus `privacy.html`,
  with `CONTEXT.md`, `test/` and `firestore.rules` at zero entries.
- Pages 404s the excluded files now, and still 200s the app.

---

## Parking lot

1. **The two template-save defects above.**
2. **Test push on real devices** — Android, and an iPhone with the app added to the home screen.
   Everything upstream of the device is verified; **delivery is not**. Nothing else on this list
   matters as much, because push is what makes the app useful.
3. **Fill in `privacy.html`** and have it reviewed. Blocks both stores, no code dependency.
4. **Play Console** — $25, see below. Then four secrets turn on the dormant AAB build.
5. **Training detail / session planning** (reported 2026-08-09, untouched): expected-player count
   beside "Assistència Jugadors"; strike through no-shows in the exercise teams; equalise the
   "Planificació entrenament" panel width; make that panel free-text editable. v85 changed the
   squad plumbing underneath — read that part of CONTEXT.md first.
6. **Drop dual-write** — `TB_DUAL_WRITE` still mirrors the board library into `fa_tactic_saved` for
   the v43-era APK. **Gated on a current APK actually being on the phones.**
7. **The APK itself** — CI has built through v95; the phones are on v43-era. Set
   `clubs/nDLJCpJfDvFHs8MnwtzW.minAppVersion` only once a current APK is installed. Blocks 6.
8. **Readiness thresholds** — every measurement so far is against synthetic demo data. Re-measure
   against real data before touching another one.
9. **Old-APK rules shim** — `clubs/{clubId}` still lets a lead write `fcfLinks`/`schedules`
   directly. Delete once a v55+ APK circulates.
10. **Push governance** — `firestore.rules:197` lets **any team member** enqueue a push to the whole
    team, with no staff check and no validation of `title`/`body`. `Push.sendToTeam` is dead code.
11. Smaller: three stranded accounts on `teamId: 'default'`; availability still club-wide readable;
    orphaned shards when a category is emptied; uncategorised players inconsistent across three
    staff pages; `backfill-training-teams.js` has no `preflight()`.

---

## Current state

- Repo: `c:\DATA\CLAUDE\EsquerrApp` → https://github.com/ScaredMeeseks/EsquerrApp. Firebase project
  `esquerrapp`. Frontend = GitHub Pages from `main`; APK = CI on push; rules/functions =
  `.\deploy.ps1`.
- **`main` is at v95, working tree clean.** Verified SERVED, not merely pushed.
- Tests: `cd test && npm test`. Fast path `npm run test:unit` (~1s). If a suite says
  `Could not spawn java -version`:
  `$env:PATH = "C:\Program Files\Microsoft\jdk-21.0.12.8-hotspot\bin;$env:PATH"`
- **New test files must be added to `test:unit` / `test:functions` by hand.**
- `gh` is **not** installed. The GitHub REST API with `curl` works; unauthenticated is **60
  requests/hour**, which a polling loop exhausts in minutes. A read-only fine-grained PAT (Actions:
  Read, Contents: Read) lifts it to 5000 and is the only way to read Actions logs or download
  artifacts.

### Clubs in production

- `nDLJCpJfDvFHs8MnwtzW` — **Esquerra de l'Eixample F.C.**, lead `marna96@gmail.com`, `amateur` only.
- `Tm96gel58VSQvxgynf45` — **demo club** ("C.E. Sant Andreu del Palomar", the seeder's default
  `--name`), join code `9CA4RR`, `coach@demo.esquerrapp.app` / `DemoEsquerra2026!`.
  3 teams / 77 members.
- `lly4GkUxIpBkSgZvzldT` — F.C.Barcelona test club. **Holds seeded boards from template testing.**

### Demo club data — state as of 2026-08-19

`--verify` is clean: 78 members, 6977 availability, 6496 rpe, 48 training dates, 34 match dates,
season from 2026-03-01, every stored score already agreeing with its events. The club is populated,
not empty.

`topup-demo-season.js` (dry run) finds only small gaps, all of them dated **after the seed run
(~5 Aug)** — the seeder writes availability and RPE only for sessions already in the past when it
runs, so everything played since is thin:

```
matches marked played : 0     RPE (training) : 64
convocatòries         : 0     RPE (match)    : added in the last fix, re-run to see
availability records  : 0
```

Live injuries are **6 amateur / 3 juvenil** — normal. An earlier run reported 23 and 12 because the
script tested `status !== "recovered"` while the seeder writes `active|recovering|resolved`, so
every historical injury counted as live. That was a bug in the script, not in the data.

**"Inclou càrrega estimada (no ha reportat RPE)"** appears when a player has availability but no RPE
for that session — readiness then borrows the squad average. It is the visible symptom of the gap
above, and of missing **match** RPE, which the first version of the top-up did not handle at all.

### ⚠ Never run `seed-demo-club.js --apply` at the demo club

`apply()` builds a club **from nothing**. Pointed at the populated demo club it destroys it three
ways, silently: it rewrites the whole `categories` map, it **replaces** data shards with a bare
`set()` — and `fa_users` is routed by category with no team letter, so `fa_users__amateur` would
lose amateur-B and juvenil-A — and it resets all 77 Auth passwords. It is guarded by neither the
`demoSeed` stamp nor `PROTECTED_CLUBS`; only `--purge` and `--add-team` are.

What is safe:

```bash
node functions/seed-demo-club.js --verify --club Tm96gel58VSQvxgynf45   # read-only
node functions/topup-demo-season.js --club Tm96gel58VSQvxgynf45         # dry run
node functions/topup-demo-season.js --club Tm96gel58VSQvxgynf45 --apply # additive only
```

`--purge` works but deletes the club, all 77 Auth accounts, and invalidates `9CA4RR` and the
handed-out credentials. **Do not run `cleanup-seed.js`** — it still keys on pre-Phase-1 numeric
uids and would treat much of the current demo corpus as garbage.

---

## Lessons that keep repeating

- **Check the artefact, not the operation.** This session: a deploy that reported success while the
  function was unreachable (403 at Cloud Run's IAM layer); a push that reported success while the
  site served the previous version; a mirror script that looked right until the APK was unzipped.
  Every one had a free, unambiguous probe available from the start.
- **Read the implementation, not just the type.** `invoker: "public"` type-checks on `onCall` and is
  silently dropped.
- **A test that pins a no-op is worse than no test** — it goes green for ever while the thing stays
  broken.
- **A parallel-array invariant that nothing checks will be broken by an unrelated change.** Two
  lists that must stay index-aligned is what broke undo in v90.
- **"Is this legacy?" is the right question, and the answer is often no.** Two prior fixes in the
  same area made "already fixed" the tempting reply to the v88 flash. It was live.
- **A failure that looks like misconfiguration may be infrastructure.** Three Pages deploys failed
  in `Set up job` with zero jobs and no message; it was GitHub 429ing its own action download.
