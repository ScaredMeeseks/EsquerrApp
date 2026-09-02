# HANDOFF — EsquerrApp

_Rolling document, overwritten each session. Last updated: 2026-09-02._

_The **Parking lot** near the foot of this file is the owner's backlog. It is carried forward
verbatim when this document is rewritten — do not regenerate it from the session you just did._

> ⚠ **This file was eleven versions stale** when it was rewritten (it still described v199 and 2253
> unit tests while the tree was at v210). The v200–v210 work — Plantilla, Registracions, the weather
> strip, the sunset fix — is in CONTEXT.md and was never summarised here. If a section below reads
> older than the code, believe CONTEXT.md and the source.

## Where things stand

**Version triple is at 211** — `CACHE_NAME` (sw.js), `APP_VERSION` (js/app.js), `CURRENT`
(functions/check-deploy.js). All three move together; `version-check.test.js` fails the suite if two
of them disagree.

| | |
|---|---|
| Unit tests | **2593** — `cd test && npm run test:unit` (~8 s), all passing |
| Rules tests | 164 — **not re-run this session**; `firestore.rules` was not touched |
| Functions tests | 71 — **not re-run this session**; `functions/` logic was not touched |

Java 21 is installed and on PATH; the rules suite takes ~20 s and is **not** in `test:unit`.

`firestore.rules`, `storage.rules` and every deployed Cloud Function are **unchanged** — no rules
deploy, no functions deploy. The only edit under `functions/` is the version constant in
`check-deploy.js`, which is a diagnostic script, not a deployed function.

**Pushed to `main` at v211.** Pages serves it and the APK CI build ran on the same push.

---

## This session: v211. A tapped notification opens the screen it is about.

The owner's ask: an RPE reminder should open the **Accions** tab so the player can enter the score
immediately, and a convocatòria should open the **match detail** for that match.

**The routing already existed and was not the problem.** `applyPushNav`'s ancestor had been sitting
in the `push-navigate` listener since the original push work, and the payloads already carried what
it needed — `page: "player-actions"` on both RPE reminders, `type: "convocatoria"` + `matchId` out
of `onPushQueueCreate`. What was missing was the **delivery of the tap into that handler**, and it
was missing in three unrelated ways, none of them visible from the routing code.

### ⚠ 1. A tap on a foreground notification did nothing at all

This is the one that matters most, because it is the commonest case in the club: the 23:00 RPE
reminder arriving while the player still has the app open.

`pushNotificationReceived` does **not** let FCM display the push. It re-schedules it as a
**LocalNotification** carrying the payload in `extra`. A tap on that one is a `LocalNotifications`
event — so `pushNotificationActionPerformed` never fired for it, and nothing anywhere was listening
for `localNotificationActionPerformed`. Completely dead path. `js/push.js` now listens for it.

### 2. A PWA opened from a notification lost the deep link

`sw.js` can only `postMessage` to a client that already exists. With no window open it fell through
to `openWindow(data.url || './')` — and `url` is never set, because `onPushQueueCreate` strips it
deliberately. So the app opened on its home page and `page`/`matchId` were discarded.

The link now travels as `?pushPage=&pushType=&pushMatch=`, read once at the top of `init()` and
stripped with `history.replaceState` so a refresh does not re-navigate. **Built from those three
fields, never from `data.url`**: that strip exists so a coach cannot make a notification open an
arbitrary site, and `openWindow` was the last place still willing to honour one if it arrived.

### 3. A tap that beat the session was dropped

The handler opened `const s = getSession(); if (!s) return;`. On a cold start the native plugin
replays the pending intent as soon as `Push.init()` attaches the listener — which happens while
`onAuthStateChanged` is still awaiting the profile and the club config. It now buffers into
`_pendingPushNav`, drained by `_drainPushNav()` immediately after `navigate()`.

⚠ **After `navigate()`, never before.** `navigate()` → `renderDashboard` → `renderSidebar` resets
`currentPage` to the first sidebar item whenever it is not one itself — and `match-detail` is not a
sidebar item, so draining early would silently throw the convocatòria route away.

### One latent trap closed on the way past

`applyPushNav` now tests `type === 'convocatoria'` **before** the `page` branch. The coach's client
queues `page: 'convocatoria'` — a **staff** page. Only the server's incidental stripping of `page`
keeps players off it today, and every APK in the field goes on sending that field. The day it is
forwarded, every player tapping a call-up would be bounced to `fallbackPage()` with no explanation.

`detailMatchFrom` is also set now, so Back leads somewhere instead of following whatever detail view
the player happened to open last.

---

## ⚠ TONIGHT'S TEST — what it can and cannot prove

The plan is to watch a real RPE reminder after tonight's training. Two things to know before reading
the result:

**The foreground fix only reaches a phone that installs the new APK.** Capacitor bundles a copy of
the web assets, so `js/push.js` on the players' phones is whatever shipped with the build they have
— and the club is on v43-era APKs (parking lot item 6). A player on an old APK will behave exactly
as before, and that is not a failed fix. Test on a phone with the CI artifact from this push
installed, or in the browser PWA, which updates itself.

**A tap that works is only evidence for the path it took.** There are four: app open (the dead one),
app backgrounded, app force-stopped, and the PWA. They fail independently and always have — that is
the whole shape of this bug. If tonight's tap works, it proves the case it was in, not the others.

The RPE reminder fires on the `*/30 * * * *` schedule after the session ends, so there is no need to
trigger anything by hand — but if a faster loop is wanted, writing a doc into `teams/{id}/pushQueue`
with `type`/`title`/`body`/`matchId` + `targetPlayers` makes `onPushQueueCreate` fan out at once.

---

## ⚠ Things that bit, and will bite again

**The bug was never where the feature was.** Every line that decides where a notification goes was
correct and had been for months; three separate delivery paths were dropping the tap before it got
there. Reading the routing over and over would never have found it. **Follow the event from the OS
inwards, not from the handler outwards.**

**A Python round-trip truncated `js/app.js` to zero bytes.** The write raised
`UnicodeEncodeError: surrogates not allowed`, but `io.open(p,'w')` had already truncated the file, so
the exception left nothing. `node --check` passes on an empty file, which is how it briefly looked
fine. **Now a rule in CLAUDE.md**: use the editor for content edits of `app.js`; Python is for
read-only inspection.

**`replace(old, new, 1)` across 27k lines is a coin flip about which occurrence it hits.** Adding one
gate landed it in `renderTrainingDetail` — the *player* page — instead of the staff one. A
ReferenceError inside `innerHTML`, so: a blank page for every player, a green suite, and a passing
syntax check.

**A source-scanning test matches its own comment.** The rule keeps being relearned: strip comments
before scanning source.

**Deleting a large block silently swallows shared helpers.** Six of them once lived between two
renderers and `node --check` was perfectly happy. A crude scan for calls to functions that no longer
exist is the only thing that catches it.

**Nine assertions passed on the first run this session, so they were mutation-tested.** Six mutants,
six killed — including the page-branch-first ordering, a dropped `Number()` on the match id, and the
old no-id-convocatòria-to-the-staff-page behaviour. Mutation-testing is still the only thing that has
ever caught an assertion passing for the wrong reason. `<scratchpad>/mutate.js` has the harness: it
patches `js/app.js` in place, runs the suite, and restores the original from a string held in memory.
⚠ **It restores by rewriting the file** — if it is ever interrupted mid-run, `git diff` first.

---

## NEXT SESSION

**First: read the result of tonight's test** (see the section above for what it can prove). If the
foreground tap still does nothing on a phone running the NEW APK, the next thing to check is whether
`LocalNotifications` is actually registered in the Android shell — the listener is attached
defensively (`if (LN)`), so a missing plugin fails silently rather than throwing.

### The owner's next item — the tactical boards' animation playback

**⚠ Parking lot item 16, and the owner called it important.** A board with more than one frame
renders a `▶` and is supposed to tween between them; it does not play properly. **Nothing has been
diagnosed** — the pointers are in item 16, and the first job is to reproduce it in a browser and
write down which of four different bugs it is: does it not start, start and stop, play once, or
drift. No test covers playback and none can from the unit suite; it is timers plus DOM.

### Known rough edges, none blocking

- **The push deep link has no automated coverage past `applyPushNav`.** The nine new tests pin where
  a payload routes to. Nothing tests that the tap arrives — the LocalNotifications listener, the
  service worker's query string, and the `_pendingPushNav` drain are all browser and OS behaviour.
  Those three are exactly where the bugs were, and they are verified by hand or not at all.
- **`_pendingPushNav` survives a login.** A player who taps a push, is asked to sign in, and then
  lands on the right page is the intended behaviour — but the buffer is not cleared on the
  `_authFlowBusy` path, so it drains on whatever auth event comes next. Harmless today; worth knowing.
- **No jsdom coverage of anything that measures or animates.** The calendar's strip heights, the
  read-only board's scaling and the board playback only run in a browser.
- **A test harness can bake in the bug it exists to catch.** `calendar-render.test.js` stubbed
  `canEditPage: () => canEdit`, and stubbing `isStaffViewer` the same way would have hidden v198.
- **`fa_matchday` is write-retired but not removed.** Its shard route, `SYNCED_KEYS` and
  `SEASON_KEYS` entries all stay; dropping a synced key is a separate, riskier change.
- **The tree is committed CRLF.** `.gitattributes` says `eol=lf` but everything predates it. A
  `git add --renormalize .` is the fix and deserves its own quiet commit.
- **`mockup.html` sits untracked at the repo root.** Not from this session; left alone.
- The 2D board's own header was deferred by the owner and never revisited.
- The APK has no 3D at all, by design.

---

## Deployment

Frontend: **push to `main`** (GitHub Pages, plus the APK CI build). Rules/functions: `.\deploy.ps1`.

⚠ **`js/board3d.js` is NOT part of the frontend deploy** — it is the premium feature, excluded from
Pages (`_config.yml`) and from the APK mirror. It reaches the browser only through the `getBoard3d`
callable, which reads `functions/private/board3d.js`. **A change to it needs `.\deploy.ps1 functions`,
not a push.** This bit once (v179).

```powershell
cd c:\DATA\CLAUDE\EsquerrApp
.\deploy.ps1 rules -DryRun    # validate without releasing
.\deploy.ps1 rules            # firestore + storage rules
.\deploy.ps1 functions        # cloud functions  (-Install to npm install first)
```

**Accounts are per-directory.** `administracion@mov-ment.com` owns Movment and cannot see
`esquerrapp`; `firebase login:use <email>` binds an account to the current directory.

**`Cannot find module '@firebase/app'`, every function failing its health check** — not broken code.
`functions/package-lock.json` is gitignored; a local deploy uploads whatever lock is on disk and
Cloud Build runs `npm ci` against it. `deploy.ps1` refuses to start if the lock exists; move it aside.

**When the CLI and the API disagree, believe the API.** A functions deploy has printed
`Deploy failed (exit 2)` and then `No changes detected` on retry, reading as though nothing shipped.
It had — the Functions API showed the new revision and all functions ACTIVE.

### A local dev server

`node <scratch>/esquerrapp-dev-server.js` → http://localhost:8081. Serves the working tree off disk
with caching disabled and **deliberately 404s `sw.js`** (cache-first would serve you the code you
wrote twenty minutes ago, and a 404 also unregisters a worker already installed on that origin).
`GET /__version` prints what is actually on disk. **Do not serve on 8080** — that is the Firestore
emulator's port and it makes the whole rules suite fail with `501 Unsupported method ('PUT')`.

⚠ **The dev server cannot test any of this session's work.** Two of the three fixes are the service
worker and the Capacitor plugin; the dev server 404s `sw.js` on purpose and has no native shell.

---

## Tests

```
2593 unit      cd test && npm run test:unit          (~8 s, no emulator)
 164 rules     cd test && npm run test:rules         (emulator + Java)
  71 functions cd test && npm run test:functions     (emulator + Java)
```

> **New test files must be added to `test:unit` / `test:functions` BY HAND.**
> `suite-registry.test.js` fails if any suite on disk is unregistered — which is exactly what it is
> for, and it is why `push-nav.test.js` was registered in the same edit that created it.

> **`npm test` (the full chain) flakes** — the functions suite fails with
> `Cannot determine backend specification. Timeout after 10000` straight after the rules suite.
> Export `FUNCTIONS_DISCOVERY_TIMEOUT=120`, or run the suites separately.

New this session: `push-nav.test.js` (9). It lifts `applyPushNav` out of `js/app.js` with the same
`grab()` source-slicing the other app.js suites use — app.js is one IIFE and exports nothing, so
this is the only coverage any of it can have.

---

## How the FCF fixture import works

Full writeup in CONTEXT.md. The parts most likely to bite:

**The refresh button and the 06:00 job are two callers of ONE function** (`_syncFcfSquad`). Do not add
a client-side importer for either; that is how they would drift.

**The merge rule is the whole feature**: a field is the federation's for as long as it still equals
`fcfSnapshot`. Edit a kick-off and the sync stops touching it — for ever, and only that field.

> ⚠ **A fixture withdrawn by the FCF is MARKED, never deleted.** Call-ups, coach notes, availability
> answers and lineups all hang off the match id. An empty response is an outage, not a cancelled
> season, and is ignored.

**Imported fixtures take the acta number as their id** (~4e6, three orders below the `Date.now()` ids
the manual path mints, so they cannot collide). A double import is idempotent.

**`opponentPos` is NOT in `FCF_OWNED`** — that list is about which fields a coach's edit takes
ownership of, and a league position is never coach-editable. It is gated on kick-off instead, and
never deleted: a rival who drops out of the standings must not erase what we recorded about games
already played against them.

### The FCF API

Base `https://www.fcf.cat/api/competition/`. No key, no auth. An internal Next.js route set found by
reading their JS chunks, not a published contract.

> ⚠ **Numeric fields are home and away CONCATENATED as strings** in `classificacio`
> (`played:"1515"` = 30) and in `goleadores` (`goles`). `points`, `position`, `goalsFor`,
> `goalsAgainst` and `coefficient` are clean — which is why `parseFcfPositions` can read `position`
> directly.

---

## Reading production without a browser

ADC from firebase-tools' stored refresh token — no service-account key needed.
`~/.config/configstore/firebase-tools.json` → `additionalAccounts[]` (marna96@gmail.com). Write
`{type:"authorized_user", client_id, client_secret, refresh_token}` to a scratch file, point
`GOOGLE_APPLICATION_CREDENTIALS` at it. **Never print the token; delete after.**

> ⚠ **Take the token from `additionalAccounts[]`, NOT from the top-level `tokens`.** That file holds
> several accounts: `tokens` is whichever was primary — here `administracion@mov-ment.com`, the
> **Movment** account — while `activeAccounts` maps this directory to `marna96@gmail.com`. The
> Movment token is in a reauth state, so exchanging it fails with `400 invalid_grant`, which reads as
> a broken script rather than the wrong account.

- **A scratch script must live inside `functions/`**, or `require("firebase-admin")` cannot resolve.
- **`teams/{id}` is keyed by CLUB id.** There is no `clubId` field on a team doc — a
  `where("clubId","==",…)` query returns empty, which reads as "no teams" rather than "wrong query".

The same refresh token exchanges at `oauth2.googleapis.com/token` for a `cloud-platform` token,
which reaches Cloud Scheduler (the only way to see a cron's REAL schedule), Cloud Functions v2 (a new
revision is the proof a deploy took), Firestore REST (the ADMIN surface, not gated by
`firestore.rules`) and Firebase Rules (read the live ruleset back).

## Clubs in production

- `nDLJCpJfDvFHs8MnwtzW` — **Esquerra de l'Eixample F.C.**, lead `marna96@gmail.com`, `amateur` only.
  FCF group for 2026-27 is **grupId 58161881** (Quarta Catalana, Grup 10), FCF team id **35410**.
- `Tm96gel58VSQvxgynf45` — **demo club** ("C.E. Sant Andreu del Palomar"), join code `9CA4RR`,
  `coach@demo.esquerrapp.app` / `DemoEsquerra2026!`. 3 teams / 77 members, 102 matches.
  **It goes stale**: `hasData` expires at `STALE_AFTER_DAYS = 10`.
- `lly4GkUxIpBkSgZvzldT` — F.C.Barcelona test club.

### ⚠ Never run `seed-demo-club.js --apply` at the demo club

`apply()` builds a club from nothing. Pointed at the populated demo club it destroys it three ways,
silently: it rewrites the whole `categories` map, **replaces** data shards with a bare `set()`, and
resets all 77 Auth passwords. Guarded by neither the `demoSeed` stamp nor `PROTECTED_CLUBS`.

```bash
node functions/seed-demo-club.js --verify --club Tm96gel58VSQvxgynf45   # read-only
node functions/topup-demo-season.js --club Tm96gel58VSQvxgynf45         # dry run
node functions/topup-demo-season.js --club Tm96gel58VSQvxgynf45 --apply # additive only
```

**Do not run `cleanup-seed.js`** — it keys on pre-Phase-1 numeric uids.

---

## Parking lot

0. **The FCF's broken goal figures — deliberately NOT corrected.** `goles` is the home and away
   tallies concatenated as strings. Across 160 teams, 32% publish more scorer-goals than the team
   scored all season; after splitting home|away, 0% do. **The owner's call is to leave it**: this is a
   bug in FCF's new site they will likely fix, and if they fix it while we are splitting we would
   double-correct and be silently wrong. `FCF_SCORERS_RAW = true` in js/utils.js is the switch;
   `splitFcfTally` is written and tested for the day it is wanted.
1. **Fixture import covers the LEAGUE only.** A cup tie is a different `competicioId`; supporting
   cups means a second link per squad, or a competition picker.
2. **Results are not imported into the app's own fixtures.** The app computes its scoreline from
   coach-entered events. The referee index does store the federation's `gh`/`ga` per acta, so their
   result is already on the device if that decision is ever taken.
3. **Neither week strip re-renders on a timer.** Pre-existing.
4. **The cross-category call-up** — within a category it works; across them the picker filters to the
   coach's category and a player never downloads the other shard.
5. **Fill in `privacy.html`** — blocks both stores, no code dependency.
6. **The APK** — phones are on v43-era. Set `clubs/…​.minAppVersion` only once a current APK is
   actually installed.
7. **Drop dual-write** — `TB_DUAL_WRITE` still mirrors the board library into `fa_tactic_saved`.
   Gated on 6.
8. **Play Console** — $25 plus identity verification.
9. **iOS** — try web push on a home-screen PWA first (iOS 16.4+) before spending the $99.
10. **Readiness thresholds** — every measurement is against demo data that has since changed.
11. **Old-APK rules shim** — `clubs/{clubId}` still lets a lead write `fcfLinks`/`schedules` directly,
    bypassing the server-side validation in `setClubCategories`. Delete once a v55+ APK circulates.
12. Smaller: three stranded accounts on `teamId: 'default'`; availability still club-wide readable;
    orphaned shards when a category is emptied; `backfill-training-teams.js` has no `preflight()`.
13. **Follow-ball has no button any more.** The CODE is untouched (`setFollowBall`, `isFollowingBall`,
    the `followBall` flag); only the button is gone. Bringing it back is one entry in `tbCamsHtml()`
    and one branch in the click handler — but it is the only camera control that holds STATE, so it
    also needs its lit class read back from the view rather than toggled blind.
14. **Move hosting off GitHub Pages, so the repo can go private.** *(owner asked 2026-08-25)* The repo
    is public because Pages requires it (a private repo needs GitHub Pro). `firebase.json` has **no
    `hosting` block**, so this is real work. ⚠ **Do not serve `public: "."` without proving the
    exclusions** — both `"**/.*"` and `"**/.*/**"` are required, because `*` does not cross `/`.
    Sanity check: the CLI should report tens of files, not thousands. **What going private does not
    buy**: the frontend. `js/app.js` and the CSS ship unminified to every browser whatever the repo
    setting.

### The owner's roadmap *(given 2026-08-28)*

Not ordered by priority except the first, which is next. Sizes are a first read, not estimates.

**15. Player routing, and activities on the player home.** ✅ **Done — v197/v198/v199.** Routing
    fixed (`trainingDetailPageFor`), a view-only staff member sees the schedule again
    (`isStaffViewer`), and activities now show on the player home under their own name and badge with
    their availability buttons intact. All three were the same class of mistake: a permission or a
    field standing in for a question it does not answer. **Worth grepping `canEditPage(` and
    `.focus ||` for more of the same.**

**16. ⚠ IMPORTANT — the tactical boards' animation playback is broken.** *(owner, 2026-08-28)*
    A board with more than one frame renders a `▶` and is supposed to tween between them; it does
    not play properly. Nothing about it has been diagnosed yet, so treat the pointers below as where
    to look, not as the cause:

    - `bindRoBoardAnimations()` (js/app.js ~8631) binds every `.tb-ro-play` in the DOCUMENT, and the
      panels that re-render themselves call it again afterwards. There is a `btn._roBound` guard for
      exactly that, and a comment recording the last time a double listener made one click start and
      immediately stop the animation — a flash that reverts, with no error. **Check that guard still
      holds now that `stdRefreshPlan()` is a third caller** (v188 added it).
    - The frames travel in a `data-frames` attribute on the field (~8535), JSON with quotes escaped.
      `renderReadOnlyBoard` emits frame 0 when `frames.length > 1`.
    - The tween is `BS.tweenFrame` (js/board-state.js) over four tracks only — `positions`,
      `oppPositions`, `balls`, `cones`. Everything else comes from the target frame by design.
    - `_roPlaying` is a flag hung on the field ELEMENT (~8659), so anything that replaces that
      element mid-play leaves the old flag with it and the button out of step.
    - There is a stale-closure note at ~7230 about the frames array that names this same button.

    No test covers playback, and it cannot be seen in the unit suite: it is timers plus DOM. Reproduce
    it in the browser first and write down what "broken" is — does it not start, start and stop,
    play once, or drift — because those are four different bugs.

**Match and squad**

17. **Past line-ups should show the substitutions.** Today the line-up and bench are the starting
    state; the events already hold the subs (`fa_match_events`), so this is a read, not new data.
18. **Coaches and fitness grade a player's training or match.** New per-player, per-session record —
    the `trainingAvail`/`rpe` subcollections are the shape to copy, not a blob.
19. **Coaches and fitness enter weight and height.** Fields on the user profile; note that
    `roles`/`category` are server-owned and clients cannot write them, so check what a coach may
    write to another player's doc before designing the form.
20. **Fitness performance tests** — Squat Jump (both and single-leg), CMJ, Abalakov, Drop Jump.
    A test has a date, a value and a unit; keep it one record per test so a new test is data, not a
    schema change.
21. **Players vote for the MVP.** Only the called-up squad, never for themselves, and the vote is
    final once cast. ⚠ The "cannot change it" part has to be enforced in `firestore.rules`, not in
    the UI — a client-side lock on a client-written document is decoration.
22. **RPE hidden from players.** It is a coach's planning number; check every render path, not just
    the obvious one.

**Communication**

23. **Simple messaging to players**, able to carry links and tactical boards. Push already exists
    (`onPushQueueCreate`, `teams/{id}/pushQueue`) — the hard part is the thread model, not delivery.
24. **Discipline code with fines and tracking.** Money in the app; decide early whether it records
    or settles, because they are different products.
25. **Carpooling for away games.** Offers, seats, who has a place.

**Opponents and the federation**

26. **Opponent's last five matches.** The FCF payload already carries last-5 form for every team in
    the same response the standings come from — see the note in utils.js.
27. **Search the FCF by player name.**

**Tactical board**

28. **The 9.15 m corner arc**, drawn outside the pitch. `BG.MARKS` is where the regulation
    distances live; `board-markings-render.test.js` pins the rest.
29. **Advertising boards around the pitch.**

**Data**

30. **Wire the Xweather free API.** The strip is already reading `tr.weather`
    (`{cond, windMs, tempC}`) and rendering placeholders — this is the write side only. Wind stays
    in **m/s** and is banded at render time; the band is a presentation choice, the number is the
    fact.

---

## Lessons that keep repeating

- **The bug is often not where the feature is.** This session's routing code was correct throughout;
  three separate delivery paths were dropping the event before it reached it. Follow the event in
  from the edge — the OS, the service worker, the plugin — not out from the handler.
- **A mutation result is a claim about the TESTS, and only as good as the harness making it.**
  Restore by copy, and sync generated copies before running.
- **A passing test can be about the wrong quantity.** Or about a sibling element — two mutations
  survived once because the assertion matched a `cal-x` on an inner line rather than the wrapper.
- **A test that greps source will match its own comment.** Strip comments.
- **Check the thing against a value it did not come from.** The v117 "our row is highlighted" check
  passed FCF's own club name in as the club name, so it proved nothing.
- **An upstream field can be wrong, not just missing.** `played:"1515"` parses cleanly and is nonsense.
- **A broken feed and an empty one must not look alike.** Every no-data path renders a reason.
- **A silent `return` is a bug that leaves no trace.** `if (!s) return;` swallowed every cold-start
  notification tap, and there was nothing to find afterwards — no error, no log, no wrong screen,
  just the home page. Prefer buffering or logging to dropping.
- **One definition, or it drifts.** `_syncFcfSquad` serves both the button and the cron;
  `scheduleSlots` serves both the placeholders and the New Training page; `applyPushNav` now serves
  both the live tap and the replayed one. And when two states must agree, make them **share the
  rule**, not merely match: they drifted the day they were written as two lists.
- **An empty query result is not evidence of absence** — it is often the wrong query.
- **Check the artefact, not the operation** — `curl` the served `sw.js`, not the push output.
- **An old APK is an old client.** A frontend fix is not live for the club until a build circulates,
  and "it still does not work" from a phone is not evidence about the code until you know which
  build that phone is running.
- **`deploy.ps1` is Windows-only and Cloud Shell is not the local machine.**
- **Two correct jobs can leave a gap between them.** Ship it, then go and look.
