# HANDOFF — EsquerrApp

_Rolling document, overwritten each session. Last updated: 2026-09-19._

_The **Parking lot** near the foot of this file is the owner's backlog. It is carried forward
verbatim when this document is rewritten — do not regenerate it from the session you just did._

## Where things stand

**Version triple is at 267** — `CACHE_NAME` (sw.js), `APP_VERSION` (js/app.js), `CURRENT`
(functions/check-deploy.js). `version-check.test.js` fails the suite if two of them disagree.

| | |
|---|---|
| Unit tests | **3585** — `cd test && npm run test:unit` (~21 s), all passing |
| Functions tests | **89** — `npm run test:functions`, all passing |
| Rules tests | 178 — **not re-run this session**; `firestore.rules` was not touched |

**Deploy state.** `main` is current and deployed: merge `23524bf`, then v265 `a7198c2`, v266
`be4edc9`, v267 `9e80496`. `.\deploy.ps1 functions` was run after each. Pages was verified live by
curling the served `sw.js` (→ `esquerrapp-v267`) and `css/style.css`, not by trusting the push.

⚠ **The service worker serves the old bundle until it is unregistered.** Bumping `CACHE_NAME` is
not enough on its own, and this cost two rounds of "still not working" against code that was
already live. The snippet that settles it:

```js
navigator.serviceWorker.getRegistrations()
  .then(rs => Promise.all(rs.map(r => r.unregister())))
  .then(() => caches.keys())
  .then(ks => Promise.all(ks.map(k => caches.delete(k))))
  .then(() => location.reload());
```

**The FCF referee chain now works end to end on the real club** — the 2026-09-19 fixture named its
referee. It had never worked before: the feature could not have displayed anything since it shipped.

⚠ **Not yet exercised unattended.** Next Friday's `fcfWeeklyRefs` (`0 6,7,8 * * 5`) is the first run
of the whole chain with nobody watching. `appointed` in its log is the number to read.

## The session in order

### Demo club (C.E. Sant Andreu del Palomar) — for a sales showing

`topup-demo-season.js` was re-run: +1,784 records (944 availability, 668 training RPE, 172 match
RPE) and 12 matches marked played with events and convocatòries. It had last run 2026-08-20, and
readiness `hasData` expires at 10 days — **that staleness is the recurring "the demo looks empty"
complaint, not a new bug each time. Re-run it the morning of any showing.**

**`functions/topup-demo-extras.js`** (new) — coach match notes and the anada briefing. Nothing in
the repo wrote `teams/{id}/matchNotes`, so every notes block was blank, and the briefing never
rendered because `findFirstLeg()` pairs by NAME, which is only a suggestion until the coach answers
it. Writing `firstLegId` is exactly what that "yes" would have written. 75 notes created; then
`--link-existing` filled the one missing field on notes that already existed, taking it to 51 of 51
second legs carrying a briefing.

**`functions/topup-demo-referees.js`** (new, **never run**) — mocks federation referees, and carries
its own `--remove`. It is a deliberate trade: `fcfLinks` is also the master switch for Classificació,
Sancions and El rival, which then fetch live and fail against a grup id the federation does not have.

⚠ **The demo season ends 2026-10-24** and nothing generates a new fixture list. `topup-demo-season`
extends training only as far as the last fixture, so it will report `0` for ever once that date
passes. That is a seeding job, not a top-up.

### Real club — why the referee panel was empty (four faults, in order)

Each was real, each was verified, and the first three changed nothing on screen.

1. **`fcfCrawl/config.enabled` was `false`.** `fcfCrawlConfig()` reads `c.enabled === true`, so every
   crawl returned `{skipped:"disabled"}`; the appointments pass had **never run**.
   ⚠ **Correction to an earlier diagnosis, also corrected in CONTEXT.md**: `seasons: ["22","21"]`
   were NOT stale ids. `22` is the current season. `enabled` was the whole config fault.
2. **`parseFcfActa` could not read the page any more.** fcf.cat moved the referee row from bare text
   to nested children carrying a role and a territory; `([^<]+)` failed on character one and
   returned `[]` silently. Caught by the v117 alarm — 178 played actas, 0 referees.
3. **`fcfActasDue` read an unplayed acta exactly once.** `cur && (cur.c || !closed)` skipped anything
   already stored, so an appointment posted after the first sight was unreachable — which is every
   appointment, since the federation posts them the Thursday before. Now re-read until it has
   officials, bounded by `FCF_APPOINTMENT_HORIZON_DAYS = 10`.
4. **v266 — the loader sat behind the condition that needed its own result.** `mdLoadAllRefIndices()`
   had ONE caller, inside `mdRefDetailHtml`, which `renderMatchDetail` reaches only in
   `else if (isStaff)` — i.e. only once `mdRefereeFor` has already returned a referee. Nothing ever
   fetched the index. The load now lives inside `mdRefereeFor`, at the point of use.

v265 (`refPageNeedsRedraw`) was also a real bug: both loaders are fire-and-forget on the render path
and only ever redrew `matchday`, never `match-detail`.

v267 — **the referee and notes headings had no underline.** `ptHead()` emits `.pt-sec-head`, which
has one; both cards bring their own `.card-title`, which said `border: none`. Invisible for as long
as the referee feature was broken, because the empty path falls back to `ptHead()`.

### Tools left behind

- **`functions/diagnose-referees.js`** — READ-ONLY, no write path anywhere in it, safe to point at a
  PROTECTED club. Walks all five links of the referee chain and names the broken one. This is what
  settled the investigation, after three rounds of reasoning from the code did not.
- **`functions/set-fcf-crawl-config.js`** — derives `seasons` from the `temporadaId` in the club's
  own `fcfLinks` and narrows `onlyGroups` to its groups. Dry run by default.

## Pending

- **The B team's `fcfLinks` still points at last season** (`temporadaId=21`, Quarta Catalana). The
  owner knows and will change it. Afterwards re-run
  `set-fcf-crawl-config.js --club <id> --enable --apply`.
- **`21_54888305` holds 238 played actas with no referees** — crawled while the parser was broken,
  now marked `c:1`, and `cur.c` short-circuits the due rule, so no scheduled run will ever revisit
  them. Recovering it means stripping the refereeless entries from that document and re-crawling
  once. **The owner decided this is not needed yet.**
- `onlyGroups` is scoped to Esquerra's two groups, so no other club gets referees. Widening it is a
  Firestore edit rather than a deploy — but read the horizon note in `fcfActasDue` first.
- `topup-demo-referees.js` has never been run; the demo club still shows clean empty FCF cards.

---

## Parking lot

### ✅ DONE at v253 — the attendance donuts *(owner asked 2026-09-09, fixed the same day)*

Both faults were one cause, and there were **five** call sites, not three:
Inici's player hero, Inici's staff hero, Les meves estadístiques, Plantilla's
band and rail, and the load charts on `staff-player-stats`. They disagreed on
four independent axes — who is counted, which season, when a session counts,
and what a silence means.

**What (a) actually was, measured before anything was changed:** a future
session counted as a **yes**, not as a miss. `getEffectiveAnswer` returns
`'yes'` for an unlocked silence and `isTrainingLocked` only turns true
`lockHours` (default 3) before kick-off, so next Tuesday's unanswered session
was already banked as attendance on the two sites that used it. Two others
escaped only via their date filters, which is precisely why the pages differed.

**Two faults the owner's note had not spotted:** Inici's two heroes and Les
meves estadístiques had **no season bound at all**, so last season was still in
the figure; and Les meves estadístiques and the staff load charts never applied
`playerIsCalled`, so a juvenil player's percentage included the amateur squad's
sessions.

**The owner's three decisions**, now the banner on `seasonAttendance()`:

1. **The population** is the sessions the player was CALLED to (guests in,
   excluded out), inside the current season.
2. **A session counts once it has STARTED** — the boundary is its start, never
   its date. `sessionHasStarted()` is built on the existing `sessionWindow()`,
   so there is no fourth opinion about when a session is live.
3. **A silence on a started session is an attendance.** It folds into `yes`,
   so a season ring has no grey arc. ⚠ The grey stays on the **per-session**
   rings (the 44px ones in an Inici week row), where "who has not replied yet"
   is the actual question.

⚠ **`seasonAttendance()` deliberately does NOT use `getEffectiveAnswer()`.**
That helper answers "what does the availability UI show for this row", and its
`locked ? 'na' : 'yes'` inverts exactly where the figure needs it — a started
session is always past its lock, so every silence would arrive as `'na'` and
decision 3 would be unreachable. It reads the raw records once instead.

**What was left alone, and on purpose:** the `M matches` half of the staff
hero's `ini.sess_matches` legend still uses `m.date <= todayISO`, so a match
kicking off tonight is counted this morning. It is the same class of bug one
line away, but matches are a different figure with no `matchHasStarted` helper,
and widening the brief risked a second change nobody asked for. **Worth doing
next; it is small.**

**Tests.** `test/attendance.test.js` is new — 23 assertions over the real rule
with an injected clock, including the "21:00 session at 10:00" case that cannot
be written against the wall clock anywhere else. It also carries a **drift
guard**: a scan that fails if any site reads the availability blobs and divides
to make its own percentage. That guard is the point — every other assertion
would go on passing while a sixth site quietly counted for itself.

⚠ **`inici.test.js` now CALLS both heroes.** It never had. Every assertion in
that file read them as text or exercised the pill builders beside them, which
is how the two rings disagreed for four versions with the suite green — the
same shape as v238's Plantilla, which painted nothing past 3080 green tests.
Three mutants survived the first pass because of it.

**Mutation-tested, 14 mutants, 0 survivors.** The three that survived the first
run were all at render sites and all fixed by the two additions above.

35. **`fa_matches` is read raw in 31 places.** *(v252)* `getUsers`,
    `getTrainings`, `getInjuries` and `getMatchEvents` all exist; `getMatches`
    did not until v252, which is exactly why reaching for it was a trap and how
    v250 took the app down. The accessor exists now and the new code uses it,
    but the other 31 sites still spell the parse out by hand. Migrating them is
    mechanical and low value on its own — the trap is gone either way — so it is
    here rather than done.


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
4. **The cross-category call-up — mostly NOT open, and the wording here was misleading for a
   long time.** It **works today** for anyone whose remit covers both squads: a coach with
   `staffCategories: ['amateur','juvenil']` on "Totes", or any lead or admin, sees both squads in
   Disponibles and can drag a juvenil player onto an amateur fixture's acta. Verified against the
   real render, not inferred. Since v229 that player also STAYS on the acta whatever the filter
   says, and is badged on both sides.

   The only person who cannot is a coach the club has **not** made staff of that category — and for
   him it is the correct answer, not a defect. `staffCategories` is written server-side from the
   club's rosters, `getVisibleCategories()` intersects it with the enabled list, `DB.setScope` turns
   that into `where('category','in',…)`, and `firestore.rules` would REFUSE the read anyway
   (`resource.data.category in request.auth.token.cats`). `fa_users` is sharded per category, so the
   other squad's names are not on his device at all. That is Phase 5 working: before it, one
   club-wide blob per key let any coach read every squad's medical records.

   ⚠ So "let him convoke outside his categories" is not a fix, it is **widening his `cats` claim** —
   which widens medical-record access with it. Club policy, not a bug.
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
12b. **A failed profile-photo upload poisoned `fa_users`.** ✅ **Fixed — v232.** Both upload paths
    fell back to a `FileReader` data URI of up to 2 MB, which `setSession` persisted into
    `users/{uid}` and the synced `fa_users` blob — a document capped at 1 MB, so one failed upload
    could stop `fa_users` syncing for the whole club. Three layers now: every upload is downscaled
    to 256px first (`iniShrinkImage`, which fails OPEN so it can never be the reason a photo cannot
    be set); a failed upload says so and stores nothing; and `stripHeavyPics()` in `saveUsers()`
    refuses to carry an oversized value into the blob at all — which also REPAIRS one already
    poisoned in production. `setSession` guards the personal document the same way. See CONTEXT.md
    (v232) and `test/profile-pic.test.js`.
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

**16. ~~⚠ IMPORTANT — the tactical boards' animation playback is broken.~~** ✅ **FIXED, and this entry was stale.** *(owner, 2026-08-28; found already done in v214.)* `test/ro-playback.test.js` opens by naming SIX defects and the two that mattered — the per-tick `scaleRoField` relayout, and the RAF loop guarding on a `_roPlaying` expando that a detached node keeps. Both fixes are in the source (`roDead()` guards on `isConnected`; the width is measured once at click time) and 41 assertions pin them. The pointers below are kept only because they are still an accurate map of that code.
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

17. **Past line-ups should show the substitutions.** ✅ **Already done — discovered in v214, not
    built.** `mnLineupChipsHtml` has drawn on/off marks through `matchPlayerMarks` since the
    briefing was written, and the v216 anada block shows them with minutes beside them.
18. **Coaches and fitness grade a player's training or match.** New per-player, per-session record —
    the `trainingAvail`/`rpe` subcollections are the shape to copy, not a blob.
19. **Coaches and fitness enter weight and height.** ✅ **Done — v236, together with 20.** They are
    NOT fields on the user profile as this entry proposed: they are two reserved rows in the metric
    store, so weight over a season is a chart like any other and the two behave identically to a
    coach's own metric. The note about `roles`/`category` being server-owned still stands and is
    why nothing here touches the user doc at all.
20. **Fitness performance tests** — Squat Jump (both and single-leg), CMJ, Abalakov, Drop Jump.
    ✅ **Done — v236.** The note was right on both counts: one record per test, and a new test is
    data rather than a schema change — a coach types a name and a unit and it exists. Plantilla →
    player detail to add and to chart one player; an expandable **Mètriques** section on Plantilla
    for the whole squad, one line per player with hover-to-highlight.
    ⚠ **Measurements follow the PLAYER and definitions belong to the SQUAD**, which is why they are
    two stores and not one — see CONTEXT.md (v236). The catalogue is category-sharded; the
    measurements carry no category at all, which is what makes a promoted player keep his history
    and what makes the season rollover a no-op.
    ⚠ A new **`player-metrics`** right in `STAFF_ROLE_ACCESS`: the fitness coach has
    `manage-roster: 'view'`, so gating on the page would have locked out the one role whose job
    this is.
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

26. **Opponent's last five matches.** ✅ **Done — v214.** The note was right: `form` was in the
    classificacio payload all along, five entries, most recent first, G/E/P from that row's own
    point of view. `parseFcfForm` maps to W/D/L (P is the letter for a WIN in English) and drops an
    unknown letter rather than inventing a draw. ⚠ Pre-season every row's `form` is `[]`, so the
    strip renders nothing rather than five blanks.
27. **Search the FCF by player name.**

**Tactical board**

28. **The 9.15 m corner arc**, drawn outside the pitch. `BG.MARKS` is where the regulation
    distances live; `board-markings-render.test.js` pins the rest.
29. **Advertising boards around the pitch.**

**Data**

30. **Wire the Xweather free API.** ✅ **Done — v208–v210, and this entry was ~25 versions stale.**
    `functions/weather.js` (`summarise`, `wxDue`, `nightOf`), the `scheduledWeatherSync` job, the
    `XWEATHER_CLIENT_ID`/`XWEATHER_CLIENT_SECRET` secrets and the sunmoon call for a real sunset
    rather than the hourly `isDay` flag. Wind is still in **m/s**, banded at render time, as this
    note asked. Spotted 2026-09-07 while picking the next item off the list.


31. **The Excel download does nothing in the Android app** — and says so rather than failing
    silently. *(v241)* The Capacitor WebView has no download handler wired up, so a blob link there
    produces no error and no file; `plmSaveCsv` detects the native shell and shows a toast pointing
    at the browser instead. Wiring a real save means `@capacitor/filesystem` (plus `@capacitor/share`
    if the file should go anywhere but app storage), a `cap sync` and a new APK — so it is gated on
    item 6 like everything else that needs a build. Only two Capacitor plugins are installed today:
    local-notifications and push-notifications.

32. **Metrics: the squad letter is a UI filter, not a boundary.** *(v236)* `fa_metric_catalog` shards
    by CATEGORY — the letter cannot be a shard, because `Shard.SEP` splits `key__cat`, `_absorbDoc`
    rejects any cat outside `Shard.ORDER`, and the claims carry categories only. So a juvenil coach
    cannot read amateur's catalogue at all, but within one category an Amateur B coach can see
    Amateur A's rows in the raw data even though the UI hides them. That satisfies "not across the
    club" and stops short of "not across the letter". ⚠ Related and deliberate: **every staff member
    of the club can read every squad's measurements**, because the record carries no category for a
    rule to test — which is exactly what makes a promoted player's history follow him. Narrowing one
    breaks the other.

33. **Metrics charts have no drag-to-scroll**, unlike the RPE and ACWR charts beside them. The whole
    date span is drawn into the plot by construction, so there is nothing off-screen to drag to. If
    a squad ever has years of weekly weights, the answer is a date-range window — and then
    `plDragRect`, which windows by item INDEX, does not fit a continuous time axis and would need
    writing again.

34. **Editing a measurement is deliberately impossible.** *(v236)* "Delete, not edit" was the
    owner's call and `firestore.rules` has no `allow update` on `playerMetrics` to match. If that is
    ever revisited, the rule has to change with the UI — a client-side lock on a client-written
    document is decoration.

---

## Lessons that keep repeating

### New this session (2026-09-18/19)

- ⚠ **When a fix is correct and changes nothing, stop fixing and check REACHABILITY.** Three
  consecutive fixes — the acta parser, the re-fetch rule, the redraw gate — were each a genuine bug,
  each verified against real data, and not one could show anything, because the code that loads the
  index was never called at all. `grep -n "mdLoadAllRefIndices()"` returned two lines, one of them
  the definition, and settled it in ten seconds. That grep belonged after the FIRST fix failed to
  move the symptom, not after the third.
- ⚠ **Read whether the metric can even see what you are asking it.** `withRef: 0` looked like a dead
  parser; it counts only CLOSED actas and the run had fetched 76 unplayed ones. Same shape as
  `--verify` reporting green on a month-stale demo club, and as the dead-end training calendar
  reporting healthy figures about a calendar that could never grow. Three times in one session a
  summary could not see the thing it was being read to judge.
- ⚠ **A guard can be the only reason a change is safe — find it before relying on it.** Setting
  `fcfLinks` enrols a club in `fcfSync`, and every fixture stamped with an `fcfActaId` becomes a
  candidate for `fcfRemoved`. Only `if ((incoming || []).length)` — "an empty incoming is an outage,
  not a cancelled season" — keeps 102 fixtures alive.
- ⚠ **One bug can mask another, and fixing the first exposes the second.** The missing heading
  underline had been there all along, invisible while the referee column was empty because the
  empty path renders a different builder.
- ⚠ **Python rewrites break more than encoding.** `functions/index.js` came back CRLF and every
  `grab()` in `reminders.test.js` lost its anchor, aborting the whole suite before a single test
  ran. CLAUDE.md bans Python rewrites of `app.js` for the encoding hazard; the line-ending hazard
  applies to **every** file the tests slice.
- ⚠ **`readCss()` resolves `--pp-*` to literals**, so a CSS assertion written against
  `var(--pp-ink)` can never fire. Compare the two rules' resolved values to each other instead —
  that the neighbours agree is the real requirement anyway.
- **An assertion that passes while the code crashed is worth nothing.** Four of seven probe
  assertions were green while the script died on line one of its loop, because "this document was
  not touched" is trivially true of a run that touched nothing. Only the assertions demanding that
  something POSITIVE happen caught it.
- **`&&` is not a statement separator in PowerShell 5.1**, and `~/EsquerrApp` is Cloud Shell, not
  the dev box. Three pastes went into the wrong terminal. Name the shell every time.
- **A script FILE resolves modules from its own directory, not the cwd** — only `node -e` uses the
  cwd. An Admin SDK helper written to `/tmp` cannot find `firebase-admin`.

### From the previous session (v254–v264)


- ⚠ **When the owner's screen and your probe disagree, the probe is wrong — go and get their
  numbers.** v259–v261 were three fixes shipped against a symptom that never changed, because every
  probe reproduced a board I had chosen: full width, my board type, my label. A read-only console
  snippet returning the stored tuple and the rendered values settled it in one message. Cheaper than
  one wrong round, let alone three.
- ⚠ **"Correct" is not the same as "right".** v259 made 2D and 3D agree on a note's size to the
  centimetre and produced a 39 m billboard on the pitch. The arithmetic was never in question; the
  premise was — a caption is measured against the screen, not against the world. When the fix is
  exact and the result is absurd, re-read the premise instead of re-checking the sums.
- ⚠ **A declared scale is not a measured one.** `--tb-ppm` was computed from `tbFieldWidthPx`, which
  is a MAXIMUM, while the board renders at whatever its container gives it. Everything metric was
  wrong together, so nothing looked wrong. Anything derived from "how big this is" must come from
  measuring the thing, and be re-measured when it can change.
- ⚠ **Ask where a value lives when nobody has touched it.** A label's width sits in a CSS variable
  after a render and in an inline pixel width only just after a drag; reading one of the two erased
  the other on every save. The bug is invisible while the live element still holds the old value —
  it only surfaces in whatever re-reads storage.
- ⚠ **A `var()` with no fallback kills the whole declaration.** `right: calc(var(--tb-axis) + 8px)`
  resolved only inside the element that declares the variable; anywhere else the panel silently lost
  its right edge. Same family as the `--tb-ppm` missing-unit bug: an invalid value is dropped
  entirely, not clamped or approximated.
- ⚠ **An overlay box has four corners and they are allocated.** Menu top-left, cameras top-right,
  rail down the right edge — so a new panel at bottom-left landed on the orbit hint and the owner
  read the overlap as a duplicated, blurry note. There is a test pinning the two apart now.
- **A blunt guard needs a named exemption, not a workaround.** `board3d.test.js` bans every
  `createElement('div')` as a proxy for "builds its own menu". A hidden measuring probe tripped it;
  renaming it a `<span>` would have been the same exemption with the reason hidden, so it was cut
  out by name with the reason written beside it — and deleted again when the probe went.
- **Assert the call is on the live path, not merely present.** Two mutants survived a run because
  the tests checked that `wrapLines` and `document.fonts.load` were *called somewhere*; both
  survived inside a dead branch. Run the function, or pin the condition that reaches it.
- ⚠ **A cold Firebase emulator reports failures that are not there**, and a cold `node_modules`
  fails `deploy.ps1` with a message the script itself tells you to ignore. Re-run once before
  investigating either.
- ⚠ **Never pipe a long deploy through `grep`.** The pipeline buffers until exit, so a two-hour hang
  and a silent success look identical. Redirect to a log and tail it.
- **A CSS slice bound is found by `indexOf`, so prose counts.** The `.gu-` block named its successor
  banner in a comment; the suite found that mention first and cut the block to one paragraph,
  failing six assertions for a reason none of them named.

### Carried forward

- ⚠ **A test that reads the source is not a test that the code RUNS.** v238 is the whole lesson in
  one line: `renderStaffRoster` threw a `ReferenceError` on its fifth line and 3080 green assertions
  had nothing to say, because every one of them regexed the function instead of calling it. For each
  page builder keep one test that simply runs it over stubs — and stub the collaborators and
  **nothing else**, so a variable the function should declare for itself throws in the test. The
  same shape recurred twice more in the same session at a smaller scale: a scroll-restore test that
  asserted the code *mentions* `scrollLeft` (true after the restoring line was deleted), and a
  native-shell test that asserted source ORDER (true after the check moved). Both were found by
  mutation, not by reading.
- **The bug is often not where the feature is.** Follow the event in from the edge — the OS, the
  service worker, the plugin — not out from the handler.
- **A mutation result is a claim about the TESTS, and only as good as the harness making it.**
  Restore by copy, and sync generated copies before running.
- **A passing test can be about the wrong quantity.** Or about a sibling element. v239's
  roster-scoping test put its non-player fixture in squad A while filtering to squad B, so the
  *letter* filter excluded him and deleting the player-role filter changed nothing at all.
- **A test that greps source will match its own comment.** Strip comments.
- **Check the thing against a value it did not come from.** The v117 "our row is highlighted" check
  passed FCF's own club name in as the club name, so it proved nothing.
- ⚠ **When two views must agree, give them one function — not two that match.** v241's export and
  the table on screen are both `plmMatrix()`, because "which dates are columns, which values are in
  a cell, which order the rows go in" written twice is two things that can drift, with the drift
  visible only to whoever compares the file with the screen. Same rule as `_syncFcfSquad` serving
  both the button and the cron, and `scheduleSlots` serving both the placeholders and the New
  Training page: **share the rule, do not merely match.**
- ⚠ **Extracting a function can strand the variables it took with it.** `var` is function-scoped, so
  lifting a block out silently removes declarations the rest of the function still reads. `node
  --check` sees nothing; it is valid syntax. After any extraction, grep the remains for every name
  the moved block declared.
- **An upstream field can be wrong, not just missing.** `played:"1515"` parses cleanly and is nonsense.
- **A broken feed and an empty one must not look alike.** Every no-data path renders a reason.
- **A silent `return` is a bug that leaves no trace.** Prefer buffering or logging to dropping. The
  same instinct is why the Excel button explains itself on Android instead of quietly doing nothing.
- **An empty query result is not evidence of absence** — it is often the wrong query.
- **Check the artefact, not the operation** — `curl` the served `sw.js`, not the push output.
- **An old APK is an old client.** A frontend fix is not live for the club until a build circulates,
  and "it still does not work" from a phone is not evidence about the code until you know which
  build that phone is running.
- **`deploy.ps1` is Windows-only and Cloud Shell is not the local machine.**
- **Two correct jobs can leave a gap between them.** Ship it, then go and look.
