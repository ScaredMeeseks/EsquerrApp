# HANDOFF — EsquerrApp

_Rolling document, overwritten each session. Last updated: 2026-09-18._

_The **Parking lot** near the foot of this file is the owner's backlog. It is carried forward
verbatim when this document is rewritten — do not regenerate it from the session you just did._

## Where things stand

**Version triple is at 264** — `CACHE_NAME` (sw.js), `APP_VERSION` (js/app.js), `CURRENT`
(functions/check-deploy.js). All three move together; `version-check.test.js` fails the suite if two
of them disagree.

| | |
|---|---|
| Unit tests | **3570** — `cd test && npm run test:unit` (~20 s), all passing |
| Functions tests | **89** — `npm run test:functions`, all passing (was 78; `templates.test.js` gained 11 for the widened callable) |
| Rules tests | 178 — **not re-run this session**; `firestore.rules` and `storage.rules` were not touched at any point in v254–v264 |

⚠ **The first `test:functions` run of a session is often a lie.** It took 2 minutes and reported 7
failures in `onMemberCategoryChanged`; the immediate re-run took 27 s and passed all 89. Cold
emulator. Re-run before believing a functions failure you did not cause.

**Deploy state.** No rules deploy all session. `.\deploy.ps1 functions` was run at **v254**,
**v257**, **v259**, **v262** and **v263**; v255/256, v258, v260, v261 and v264 were push-only.

⚠ **`deploy.ps1 functions` fails on a cold `node_modules` and the script says so itself** — *"'Cannot
determine backend specification. Timeout after 10000' means a COLD node_modules, not broken code.
Just run it again."* It happened twice this session and the retry worked both times. Separately, one
deploy **hung for two hours** with no output; killing it and re-running showed every function
"Skipped (No changes detected)", i.e. the hung run had in fact uploaded before stalling. Run the
deploy with its output going to a log you can tail — piping it through `grep` buffers everything
until it exits, so a hang looks identical to silence.

⚠ **`js/board3d.js` is not served from the working tree, not even on localhost.** `tbLoad3D` always
fetches the module through the `getBoard3d` callable, so **127.0.0.1 runs whatever was last deployed**
and a 3D change is invisible until `.\deploy.ps1 functions`. There is deliberately no local bypass —
`test/board3d-gate.test.js` exists because "the whole gate is undone by one static import". I told the
owner otherwise once and they tested old code for a round.

⚠ **Not yet driven by hand.** Everything below is tested, probed and rendered, but the owner has
only clicked the Pissarres 3D notes. Worth trying first, in this order:

- ⚠ **Configuració (v254), Gestió d'usuaris (v255/256) and Pissarres (v257/258) end to end.** All
  three were rebuilt into the paper system this session and only the third was exercised by the
  owner. In Configuració: the folded-in wizard tabs, the club ground link, the kit editor. In
  Gestió d'usuaris: change a role, move someone between squads, erase. In Pissarres: the club
  scope selector (it is a **query** now, so it re-reads), the pack chips, and a multi-club send.
- ⚠ **A text note on a HALF board, and on a resized pitch.** The metric conversion is exact for a
  board authored horizontally and off by 820/520 for one authored on a vertical full board —
  bounded, legacy-only, and it stops the first time that label is touched. Nobody has looked at a
  half board since.
- ⚠ **A note's box width after a reload** (v260). Any save used to wipe it. Drag a label wider,
  reload, move it, reload again — the width must survive both.
- **Right-clicking a note in 3D is gone (v263)** and that is deliberate — its menu is 2D-only now.
  If the owner wants edit/colour/delete on the rows in the bottom bar, that is the follow-up.
- **The 3D notes bar on a phone.** It is capped at 32% height under 600px and scrolls; the orbit
  hint is hidden under 640px entirely, so the corner collision cannot recur there.

---

## The session in order — v254 to v264

Two halves. **v254–v258** finished the three admin-tab redesigns from
`Baixades\EsquerrApp Configuracio UI\design_handoff_admin_tabs`. **v259–v264** was one bug the owner
reported from a Pissarres card — "3D text translates very badly to 2D" — which took six versions and
was three different faults plus one wrong premise.

### v254. Configuració becomes one page.

The `#view-team-setup` wizard folded into the page as tabs; `#view-team-setup` is now the
forced-onboarding shell only. `_tsEl`/`_tsAll` scope the shared setup sections to whichever screen
mounted them. `clubs/{clubId}` gained `town` and `homeLink` (the ground link reverted to raw
coordinates until `homeLink` existed to store it in), and `setClubCategories` validates both — the
one rules-adjacent change of the session, and it needed a functions deploy.

⚠ Kits were mixing between clubs, owner-reported and real: `_refreshTeamSetupKits` prefers
DOM-typed kits and the container was static markup never emptied between club switches. A
`data-kit-club` stamp fixed it.

### v255/v256. Gestió d'usuaris, and three functions that were not there.

⚠ **`90812ff` had deleted `detachMemberByEmail`, `loadArchivedSeasons` and `assignMemberToTeam`,
and nobody noticed for nine days.** Found only because this round's plan said to *reuse* the first
of them. `loadArchivedSeasons` was the worst: called straight from a renderer, so Temporades
arxivades threw mid-render and never appeared.

`test/suite-registry.test.js` gained **`the app only calls functions that exist`** — a strict scan
that strips string literals as well as comments (the i18n table is full of Catalan with brackets;
76 false positives without it). It runs at zero candidates.

v256 followed the owner's review: the selected filter chip was unreadable (`:hover` at (0,2,0)
beating `-on` at (0,1,0) — the same specificity trap as v254's over-quota count), and the team
filter moved to the shared `.cat-bar` rather than a second one of its own.

### v257/v258. Pissarres, and the read that grew with the platform.

Three tabs: the clubs' boards as a card grid, an editor launcher, the platform library with a pack
manager and multi-club send.

⚠ **`_abLoad` was `4 + N_clubs` queries and every board metadata doc on the platform**, on every
open and again after every promote and send. ~7 queries at three clubs; ~304 and 14,000+ document
reads at three hundred. The club scope is a `where()` now, `boardAuthors` is read only for the club
in view, and "Tots els clubs" carries a `limit()`. ⚠ Rules-satisfiable either way — the
`isSuperUser()` arm does not depend on the document — so **nothing would ever have complained**.

⚠ **First lazy loading in the app.** A mini pitch is a full pitch, a `ResizeObserver` and the whole
animation as a JSON attribute; `hydrateRoBoards` warmed every skeleton on the page. It now takes an
optional `roots` and the catalogue hydrates on intersection, **in batches** so `TB.warm` keeps its
ten-per-query behaviour.

⚠ **The silent trap:** `tbRoBoardHtml` must get `{boardId, name}`, never the metadata doc —
`tbResolveRef` returns any ref with `positions` OR `formation`, and a metadata doc **has**
`formation`, so the doc is mistaken for the drawing and hydration never returns.

`seedClubFromTemplates` widened to `clubIds[]`/`packs[]`, with two latent bugs fixed first:
`templateIds` was never deduped, and `already` was a pre-loop snapshot. `{clubId, pack}` stays
accepted forever — an APK installed today outlives any migration window.

v258 was the owner's card review: the board name was on the card twice, the frame badge sat in the
corner the playback pucks own, and those pucks were sized by `scaleRoField`'s **16px floor** rather
than its scale term (`30 * s` is ~9px on a card) — now `--ro-ctl-min`, default 16, lowered only by
the catalogue.

### v259–v264. One report, six versions: text in 3D.

⚠ **READ THIS BEFORE TOUCHING BOARD TEXT.** The full write-up is in `CONTEXT.md`; the shape of it:

1. **v259** — measured in a real browser that a resized label kept its editor pixel box at every
   board width (300px on a 242px card) while its font was *overwritten* to a fixed reference. Fixed
   by putting text on the metric table with the players: `BG.OBJ.text`, `--tb-tfs`/`--tb-tw`,
   convert-legacy-on-read. **This was the wrong premise** — see 6.
2. **v260** — a label's box width lives in `--tb-tw` when rendered from storage and in an inline
   `style.width` only just after the resize handle is dragged. `saveTexts` read only the inline one,
   so **the first save after any reload erased the width**. Invisible in 2D (the live element still
   held the variable); 3D re-reads storage, so it showed there.
3. **v261** — `--tb-ppm` was a **maximum, not a measurement**. `tbFieldScaleStyle` sets `max-width`,
   so a narrower board still declared 7.81 px/m: on a 514px board a 2.56 m label was drawn 20px,
   which is 6.7 m there. **Every metric object was equally wrong**, which is why it looked plausible
   — the whole 2D board was wrong together. The editor re-measures with a `ResizeObserver` now.
4. **v262** — with both views finally agreeing in metres, the result was absurd: the owner's real
   note stores **3.59 m per line in a 19.96 m box**, so 3D stood a **39 m column of text on a 105 m
   pitch**. ⚠ **A note is a CAPTION.** 2D sizes it against the screen; converting a reading size
   into metres turns a UI affordance into a physical object — the exact trap `BG.OBJ`'s own comment
   names. The words left the scene for a list under the board.
5. **v263** — the pin that replaced them read as a player, so nothing marks a note on the turf now
   (cost: **no right-click on a note in 3D**). And the draw-surface allow-list named
   `.tb-text-label`, so with a draw tool on the note was painted a *second* time over the scene.
6. **v264** — the remaining "blurry duplicate" was the **orbit hint**, sharing the bottom-left
   corner with the new notes panel. Moved to top-centre; the other three corners are the menu, the
   cameras and the frames rail.

⚠ **What actually ended it**: a fifteen-line read-only snippet pasted into the owner's console,
returning the stored tuple and the rendered numbers **from the machine with the problem**. Three
rounds of my own probes had reported "matches" because each reproduced a board I had chosen. Ask
for that first.

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

### New this session (v254–v264)

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
