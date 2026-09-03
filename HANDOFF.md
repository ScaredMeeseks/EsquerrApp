# HANDOFF — EsquerrApp

_Rolling document, overwritten each session. Last updated: 2026-09-03._

_The **Parking lot** near the foot of this file is the owner's backlog. It is carried forward
verbatim when this document is rewritten — do not regenerate it from the session you just did._

## Where things stand

**Version triple is at 227** — `CACHE_NAME` (sw.js), `APP_VERSION` (js/app.js), `CURRENT`
(functions/check-deploy.js). All three move together; `version-check.test.js` fails the suite if two
of them disagree.

| | |
|---|---|
| Unit tests | **2828** — `cd test && npm run test:unit` (~10 s), all passing |
| Rules tests | 164 — **not re-run this session**; `firestore.rules` was not touched |
| Functions tests | 71 — **not re-run this session**; `functions/` logic was not touched |

Java 21 is installed and on PATH; the rules suite takes ~20 s and is **not** in `test:unit`.

`firestore.rules`, `storage.rules` and every deployed Cloud Function are **unchanged** — no rules
deploy, no functions deploy. The only edit under `functions/` is the version constant in
`check-deploy.js`, which is a diagnostic script, not a deployed function.

---

## This session: v227. Convocatòria, the sixth design handoff.

The staff call-up tab rebuilt to `Baixades/EsquerrApp Convocatòria UI/design_handoff_convocatoria/`.
It was the last staff screen in the old idiom and sat one click from the redesigned Partit page.
**Per-version detail is in CONTEXT.md**; this is what a reader needs before touching it again.

**What shipped.** `renderConvocatoria` is `cv-` builders over one paper surface in bands: title,
three controls (fixture · citation · kit), two lists, Pissarres, vídeos, footer. `bindConvocatoria`
is rewritten around one `place()`. New `test/convocatoria.test.js` (74 tests, 14 driving the real
binder in jsdom) and `scripts/build-convocatoria-preview.js`. Unit 2754 → 2828.

**The bug inside the repaint.** `fa_convocatoria[matchId]` IS the acta order, and the old render
sorted it away with `posRank` on the way out — so **dragging a player between two others did nothing,
every time, and had never worked**. Anything that reorders the Convocats list must go through
`place(id, targetId, toCalled)` and nothing may sort that array on the way to the screen.

**Two gaps filled**: a `+ Vincula una pissarra` picker (boards could only be attached from the
tactics editor before), and `safeHttpUrl` on the video rows, which had no validation at all.

**Four things the owner asked for before it shipped**, all detailed in CONTEXT.md: the fitness
glyph and readiness score are back in the row (through the shared `playerStatusHtml`, so this screen
and New Training cannot disagree); **no circle behind a crest** in the fixture picker — the real
badge is an `<img>` and the monogram's ground is squared off, the same lesson as v226; the picker
offers **only the visible/selected categories**, which is what `getCurrentCategory()`'s `''` has
always meant and what `!curCat || …` never implemented; and fixtures are sorted **soonest first**,
which also makes the default selection the next one.

### ⚠ Five departures from the handoff, all deliberate

Each is argued in CONTEXT.md and each has a test that dies if it is "fixed" back.

1. **Classes are `cv-`, not `.conv-`** — six other surfaces still draw with the `.conv-` family.
   Borrowed families (`.conv-pos-circle`, `.cat-badge`, `.pt-crest`) are scoped under `.cv-page`.
2. **No `Tard` availability state** — nothing in the app produces one.
3. **Unsend kept, `Buida-ho tot` dropped.**
4. **Drop-on-row inserts in Convocats only** — Disponibles has nowhere to store an order.
5. **The board thumbnail expands** rather than drawing a live 34×24 pitch.

### Traps worth knowing before editing THIS screen

- **The fixture picker is not gated on `ro`.** It is the only control that is not: which match you
  are looking at is view state, not a write, and a delegate needs it. Gating the whole page on `ro`
  is the easy way to lose it.
- **The three control groups share one baseline** via `align-items: stretch` plus `margin-top: auto`
  on each group's own control. The citation group's rule is carried by the **pills** — which is why
  the read-only variant needs `cv-time-ruled`, or the middle column has nothing on the line.
- **Menu open state lives in the DOM, not in the render.** The page re-renders on every drop; a
  menu whose openness the render read back would reopen itself mid-drop.
- **`cvMenu` is the page's only dropdown** — fixture, three kits, boards. `stdSelect` cannot serve
  here: it renders text labels only, and two of these toggles carry images.
- **String-builder tests cannot see geometry.** Two real defects this session — the fixture
  dropdown laying its two lines side by side, and the missing read-only rule — were found by
  screenshotting `convocatoria-preview.html` in headless Chrome, with 46 assertions green.
- **jsdom swallows exceptions thrown inside listeners.** A handler that dies on a missing stub looks
  exactly like one that decided to do nothing. The wired tests drain a window `error` collector;
  keep doing that.

### Left undone, deliberately

- **The board thumbnail is the designed placeholder**, not a live board. Clicking the row opens the
  real `tbRoBoardHtml` beneath it. A real thumbnail means rendering a pitch at 34×24 and waiting on
  `hydrateRoBoards`.
- **The readiness palette is a third copy** of the same values, after `.std-table` and
  `.pl-ready`. Each paper page scopes its own; that is the convention, not an oversight.
- **The kit dropdowns show the KIT's name** ("1a equipació"), where the design shows garment names
  ("Pantalons negres"). The app's model has one label per kit, not per garment.
- **`.conv-player`, `.conv-list`, `.conv-count` and friends are still in the old idiom.** They are
  the New Training squad list and four other surfaces; repainting them is its own piece of work.

---

## Prior session: v212–v226. Partit, the fourth design handoff — and four rounds of the owner
## finding what the tests could not.

The match detail screen, redesigned to `Baixades/EsquerrApp Match UI/design_handoff_partit/`, plus
everything the owner found once it was in front of him. **Per-version detail is in CONTEXT.md**;
this is what a reader needs to know before touching it again.

**What shipped.** `renderMatchDetail` is `pt-` builders over horizontal bands. One dropdown in the
app (`stdSelect`) — `.ev-custom-select` and every native `<select>` on these screens are gone. The
anada block, the events timeline and its inline form, the linked-board overlay, the rival's last
five, the rival's kit. The fixture dialog, the Calendari's add chooser, Nou entrenament and the
Add-Player modal are all in the paper idiom. New `test/partit.test.js`; unit 2593 → 2750.

### ⚠ The four things the owner had to tell me, and the pattern under them

1. **The timeline followed the wrong axis.** v213 read the handoff's "our events on the left"
   literally. The scoreboard above prints `home — away`, so at an away ground our column sat under
   the rival's name. **The handoff describes a screen, not a data model** — its mockup is a home
   fixture, and "our events on the left" is a fact about that picture, not a rule about ownership.
2. **Nested `<button>`s.** The board thumbnails were wrapped in a button and contain their own.
   Invalid HTML, so one click ran two handlers and the ✕ was parsed out of the card. **Every test
   matched the markup STRING**, where the nesting is invisible; only a parser shows it.
3. **`border-bottom` does not override `border`.** The Add-Player restyle sat on base rules still in
   the stylesheet, and left every row drawn as a box. **The question is never "does my declaration
   say the right thing" but "does it beat the one underneath".**
4. **Binders that loop over the document belong to the render.** `bindStdSelects` and the
   `[data-tooltip]` badges were both invisible to overlays injected into `document.body`. It bit
   three times before being fixed by delegation.

**All four were green the whole time.** The suite was 2750 assertions and none of them could see a
column on the wrong side, an invalid nesting the parser silently repairs, a losing CSS override, or
a listener that was never attached.

### Traps worth knowing before editing the Partit screens

- **Kit sizes are ARGUMENTS, never CSS.** `PT_KIT_PX` is 36 (multiple of 18: nine bands across S/2);
  `PT_OPP_KIT_PX` is 32 (multiple of 16: the FCF's four and eight). They differ on purpose. Do not
  tidy them to one value, and do not resize a kit in a stylesheet.
- **A `stdSelect` root has no `.value`** — it carries `dataset.value` and fires no `change`. A missed
  call site does not throw; it files a fixture under an empty category or stops a field saving.
- **There is no global `[hidden]{display:none}`** in `css/style.css`. Anything given a `display` rule
  that is also hidden from JS needs its own `[hidden]` guard, or the filter looks dead.
- **`playerMatchMinutesKnown` returns null OR a number**, and 0 is a number. `—` and `0'` are
  different answers.
- **A player never sees the starting eleven before kick-off.** `ptCallupHtml`'s `showXI` is the one
  decision; `test/match-lineup.test.js` pins that it is read in exactly two places.

### Left undone from that session, deliberately

- `mnBriefingHtml`, `mnScoreBlockHtml`, `mnLineupChipsHtml` and `fitMnScoreNames` have **no caller**
  since the anada was rebuilt. Still covered by tests, dead in the app — they want a pruning pass,
  not a deletion in the middle of a layout change.
- **Rejecting a wrongly linked first leg has no route** once the suggestion has been answered: the
  owner asked for both anada links removed, and the banner only shows while unanswered.
  `MN.dismissLeg` is untouched, so restoring it is one button.
- The board overlay has **no frame pills**. `applyRoFrame` is a closure inside
  `bindRoBoardAnimations`, which `test/ro-playback.test.js` pins with 41 assertions; pills mean
  lifting it out first. A test asserts they are absent so adding them is deliberate.
- `computePlayerStats` still uses the old inline `isOurTeam(m.home) ? 'home' : 'away'`, which never
  tests the away side. Same blind spot `ptOurSide` fixed; outside this redesign.
- `mdKitCellHtml`'s comment says `MD_KIT_PX is 32`; the constant is 48. Only the comment is wrong.

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
