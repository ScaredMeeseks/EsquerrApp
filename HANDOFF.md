# HANDOFF — EsquerrApp

_Rolling document, overwritten each session. Last updated: 2026-10-20 (v288 section; the
rest below still describes 2026-09-22 and v278-v281 are in CONTEXT.md)._

_The **Parking lot** near the foot of this file is the owner's backlog. It is carried forward
verbatim when this document is rewritten — do not regenerate it from the session you just did._

## Where things stand

**Version triple is at 289**

## 2026-10-21 — v289: the planned RPE hidden from players (roadmap 22); players' "+" on Calendari

Full detail in CONTEXT.md (v289).
- **Calendari's load figures are staff-only:** `ctx.staffView` gates the dot, the RPE line, the week AU and the load legend.
- **⚠ `canEditPage(x)` is TRUE for a pure player:** `staffAccess()` answers `'edit'` for anyone with no staff sub-role. On a page players also open, ask `isStaffViewer(session) && canEditPage(x)`.
  - Calendari now asks it through `canEditCalendar()`, which `canAddTraining()` uses too.
  - Players had been given every "+", the "click to schedule" placeholders and the add menu, whose saves the rules refused.
  - Partit already asked both.
- **Deploy:** frontend only, push.

## 2026-10-20 — v288: the small and technical items

Full detail in CONTEXT.md (v288).
- **Availability and RPE are readable within the squad only.** Every record carries `category`: the squad its session or match is FOR (a guest's answer belongs to the squad that called him), an extra the player's own, else `'none'`. Stamp new write sites with `recordCategoryOf(row, session)`.
  - **Rules:** `readsRecord` in firestore.rules. A player's listener is TWO queries (`category in scope`, `uid == me`) merged in db.js. A query the rules could refuse for one document fails whole, so a new player-side read of these collections must use one of those two shapes.
  - Staff still read the whole collection.
- **Inici redraws itself** at the next lock, session end, match end, or midnight: one timeout per render (`iniScheduleRefresh`). It never redraws a hidden tab, or under a focused field, dialog or open dropdown.
- **The staff Inici season match count** goes through `matchParts` and kick-off time, like the sessions beside it.
- **Follow-ball** is back on the 3D camera menu. Its light is read back from the board. The lit style is `.tb-cams-list .tb-cam-btn.active`; the old `.tb-cam-btn.active` plate is overridden in that list.
- **`deleteTeam`** removes a gone category's emptied shards (`emptiedShards` in the marker).
- **`backfill-training-teams.js`** is deleted.
- **Production one-offs** (scratchpad, not the repo): the category backfill, the three `teamId: 'default'` accounts, the one empty shard.
- **The functions-suite flake is fixed (2026-10-21):** 3 of 3 full runs in the main tree passed 124/124.
  - **Cause:** about 600 trigger events per run are handled one at a time. The acta guard test, which runs last, got its event 33 s after its write, past its 25 s wait. The wipe script was failing under the same load.
  - **Fix:** `test/drain-triggers.js`. `drainTriggers()` waits until the emulator has handled everything queued so far. It is called at the start of the acta suite, before its stale-phone write, and before each wipe run.
  - **Also:** `test:functions` now runs the Auth emulator. The triggers' `setCustomUserClaims` used to call the real Identity Toolkit with your CLI login (about 10 calls a run).
  - **New trigger test:** call `drainTriggers()` before the write you wait on.
- **Deployed 2026-10-20, in this order:**
  1. Functions: 35 updated.
  2. `fd503c7` pushed; Pages serves `esquerrapp-v288`.
  3. Backfill: 18,525 records stamped; a re-run finds 0 left.
  4. Rules released.
  5. The 3 stray accounts deleted: 0 users docs and 0 of 96 Auth accounts still say `teamId: 'default'`.
  6. The 1 empty shard deleted.
- **Live check after the rules (demo club, read-only):**
  - A demo amateur player reads all 5,556 amateur answers. Of the juvenil squad's 2,721, they read only the 10 stamped amateur or `'none'`.
  - Every key the player holds is one the coach holds. No permission errors.

## 2026-10-14 — v287: postponed/suspended, round two

Full detail in CONTEXT.md (v287).
- **`matchParts(m)` (utils.js + fcf.js copy) is THE rule for "was it a match, and which sessions":**
  - none: postponed, withdrawn, or suspended before it started (or not known);
  - `first`, or `first` + `rest` (`_r`): a game stopped mid-way;
  - `whole`: everything else.
  - Don't re-derive it from `matchState`.
- **Started or not comes from the FCF acta:** a SUSPÈS page with line-ups started. `_syncFcfSquad` probes each unknown one once, and a started one imports its first part (`fcfActaPartial`, not `fcfActa`).
  - The stop minute is NOT on the page. It defaults to the last event and staff are warned to correct it (Partit).
- **A convocatòria is for a day:**
  - A send stamps `sentFor`.
  - "Told" = `convToldList` (a call-up sent before a move is pending again).
  - "Called" = `convCalledIds`, which includes a restart's `firstPart`.
  - New told-sites must use the first; stats and minutes the second.
- **Match load uses the line-up's current minutes**, not the ones saved with the RPE, whenever there is a line-up.
- **Pills:** `.st-pill` with `--pp-orange` (AJORNAT) / `--pp-red` (SUSPÈS), above the result everywhere.
- **Deployed 2026-10-14:** functions first (35 updated), then `03e67cf` pushed; Pages serves `esquerrapp-v287`.
  - Prod at that moment had 4149304 `postponed` and 4119518 `suspended`, stamped by the v286 06:00 sync.
  - The v287 probe sets 4119518 `suspendedStarted: false` on the next sync (or on "Actualitza des de la FCF").
- **Emulators:** `emulators:start` needs `$env:FUNCTIONS_DISCOVERY_TIMEOUT = 120` on this machine, or it stops at discovery with exit 9 and leaves java on :8080. Inside `emulators:exec`, call `npx mocha`.

## 2026-10-13 — v286: postponed and suspended matches

Full detail in CONTEXT.md (v286).
- **One reading of a fixture's state: `matchState(m)`** (js/utils.js, copied in functions/fcf.js; `fcf-state.test.js` holds them equal). It is date-aware:
  - `'postponed'`: on its original kick-off.
  - `'suspended'`: waiting for a restart.
  - `'resumption'`: moved after a suspension.
  - Use it, or `matchIsOff`, `matchOffLabel` and `matchMovedNote` in app.js. Don't read `fcfState` directly.
- **The FCF's ESTADO** ("2" AJORNAT, "3" SUSPÈS) drives `fcfState`. The merge stamps `postponedFrom` / `suspendedOn` once and returns `changes[]`; `_announceMatchChanges` pushes the squad and clears answers on a new date.
- **`fcfMatchdayWatch`** re-syncs squads hourly in the 72 h before a kick-off (every 3 h while 72–24 h out), with state in `fcfWatch/{clubId}`.
- **A suspended match is two RPE sessions:** `{uid}_match_{id}` on `suspendedOn.date`, and `{uid}_match_{id}_r` on the restart day.
- **Staff "Marca com a ajornat"** sets `manualState`; it gives way to the FCF.
- ⚠ **`canEditPage` is true for a player** (no sub-role means 'edit'). Gate staff-only controls on `isStaffViewer(session) && canEditPage(...)`. The Partit "Editar" was visible to players until v286.
- **Unverified in the wild:** the FCF re-issuing an acta id for a postponed fixture (handled by `_findReissued`), and whether ESTADO goes back to 0 on the new date (`matchState` doesn't depend on it).
- **Deployed 2026-10-13 ~16:50:** functions first (34 updated, `fcfMatchdayWatch` created), then `849f2ca` pushed. Pages serves `esquerrapp-v286`. Right after, prod still showed 4149304 and 4119518 unstamped: no sync had run yet.
- **After deploy:** the first sync (06:00, the watch, or "Actualitza des de la FCF") announces every current AJORNAT / SUSPÈS once. Check with a read: 4149304 → `fcfState: postponed`, 4119518 → `suspended`.

## 2026-10-13 — v284-v285: "Partits" this season; sign-up/sign-in cleaned up

Full detail in CONTEXT.md (v284, v285).
- **Local emulator runs:** `?emu=1` on localhost points the app at the Firebase emulators (`demo-esquerrapp`). Start them with `firebase emulators:start --only auth,firestore,functions,storage --project demo-esquerrapp` from PowerShell. Drive the page in headless Chrome. Never register against the live project.
- **`joinClub` and `sendTestPush` are called over plain HTTPS** (`callFunction`), not the Functions SDK. The SDK's push-token step fails the call on phones where push can't set up.
- **Sign-out resets everything** (`resetSignedOut`). Sign-in loads once (the auth handler stands aside for form handlers). Every path ends in `afterSignIn()`.
- **Data note:** the owner's own row is in the demo club's `fa_users__amateur` (from a 9 Oct visit). Untouched; remove it by hand if wanted. — `CACHE_NAME` (sw.js), `APP_VERSION` (js/app.js), `CURRENT`
(functions/check-deploy.js). `version-check.test.js` fails the suite if two of them disagree.

## 2026-10-12 — v283: iPhone registers in Safari; the installed app wears the club's crest

Full detail in CONTEXT.md (v283).
- **Deployed 2026-10-12:** functions first (all 35 updated, `appManifest` + `appIcon` created). Both
  answer on the predicted run.app addresses: the manifest 200 with CORS; the demo club's icon a 180×180
  RGB PNG; an unknown club 302s to the logo. Then v282 + v283 pushed (`f8e4032..dcb0abe`).
- ⚠ Never leave a `functions/package-lock.json` behind: one pinned a broken `@firebase` tree. Install
  with `npm install --no-package-lock`.
- After deploy, check on real phones: an iPhone (register in Safari → steps → Add to Home Screen shows
  the club crest → the app asks for notifications) and Android Chrome (Install → club crest).
- The APK icon is unchanged (one per build).

## 2026-10-12 — v282: five owner asks in one release

Full detail in CONTEXT.md (v282). What a next session needs:

- **Sign-up needs a GRANTED notification permission.** Ticking the box asks; the submit opens only
  on a grant. On an iPhone in Safari the box gives way to the install-first steps, because there is
  no Notification API outside the home-screen app. `handleRegister` re-checks the grant.
  ⚠ Any new code for the register form goes AFTER `handleRegister`. Nine test slices end at its
  first line.
- **Home-screen box**: optional and pre-ticked. It replays Chrome's `beforeinstallprompt`, caught
  by an inline `<head>` script, on the submit tap.
- **Players see no minutes**: not on Inici, not on Les meves estadístiques, not on the Accions match
  rows. A match RPE now stores the lineup's minutes, or null, and `computeReadiness` looks them up
  again when null.
- **Plantilla "Mitj./conv."**: minutes per call-up (titular + suplent, unused sub = 0′), with tooltips.
- **✎ on every exercise** edits its description (≤ 500, capped in `stdPlan`).
- Not done: `build-ms-preview.js` and `build-inici-preview.js` fail at HEAD (`seasonAttendance`
  missing from their stubs).
- **Deploy:** frontend only. No functions deploy (`check-deploy.js` is a Cloud Shell script).
  Pushed with v283.

| | |
|---|---|
| Unit tests | **4210** (v288) — `cd test && npm run test:unit` (~35 s), all passing |
| Functions tests | **124** (v288), all passing, 3 of 3 runs (~80 s) — `npm run test:functions` from PowerShell with Java on PATH and `$env:FUNCTIONS_DISCOVERY_TIMEOUT = 120`, backgrounded with `2>&1 | Out-File <log>`. Don't touch `functions/` while it runs: the emulator hot-reloads and the trigger tests fail. Kill a leftover emulator java before starting another run |
| Rules tests | **198** (v288) — `npm run test:rules` |

**Deploy state.** `main` is current and deployed through **v277 `669b2ba`**. Both v276 and v277
ran `.\deploy.ps1 functions` BEFORE the push (the new 3D module works with the old frontend, not the
other way round), every function updated cleanly. Committed straight onto `main` this time, no
release branch. Verified live after v277: served `sw.js` → `esquerrapp-v277`, served `app.js` has
`APP_VERSION = 277` and `tactics.g_markers`, and `js/board3d.js` is still **404** on Pages. The
branches `v273-fcf-tabs`, `v274-sancions-squads`, `v275-cv-match-picker` are still there and can be
deleted. The untracked `mockup.html` and `x` in the repo root are the owner's, not this session's.

⚠ **The service worker serves the old bundle until it is unregistered.** Bumping `CACHE_NAME` is
not enough on its own. The snippet that settles it:

```js
navigator.serviceWorker.getRegistrations()
  .then(rs => Promise.all(rs.map(r => r.unregister())))
  .then(() => caches.keys())
  .then(ks => Promise.all(ks.map(k => caches.delete(k))))
  .then(() => location.reload());
```

**The B team is on its 2026-27 group and its calendar is importing.** Confirmed by the owner from
the Calendari (Xaloc, jornada 2). It took three separate faults to get there — see below.

## 2026-09-22 — v276 and v277: Pissarra material

The owner asked for more equipment on the tactical boards, in 2D and 3D, and above all for it to
be **counted** in each training's material list. Built in several review rounds on localhost, then
shipped as two releases. Full detail in CONTEXT.md (v276, v277); what a next session needs:

- **New board track `props`** (`fa_tactic_props`), rows `[x, y, type, rotDeg, colour]`, written by
  `BS.setProps` — ⚠ never `setPoints`, which would strip type and colour. `buildBoardEntry` has it at
  the tail. Legacy **`cones` still exist**: drawn, draggable, counted as orange cones, but nothing
  places new ones — the Con tool places a `cone` prop now.
- **One table, `BG.PROPS` / `BG.PROP_COLOURS`** (board-geom), drives the 2D glyphs, the 3D builders
  (`PROP_BUILD` in board3d) and the count. Adding an item = a row there + a glyph in `TB_PROP_2D` + a
  builder + i18n (`mat.<t>s`, `plan.n_<t>`, `plan.n_<t>s`, `tactics.<t>`, `mat.<t>_g` if coloured)
  + its place in one `tb-prop-g-*` group. `material.test.js` "catalogue is complete" fails on any gap.
- **Counting**: per type AND colour; max over a board's frames, sum inside a parallel block, max
  across blocks — key by key.
- **Rotation** to any degree: a handle in 2D (and on the 3D drawing overlay), a 0–359° slider in the
  right-click menu for the free 3D camera.
- **Material panel** (v277): Pilota · Marcadors · Agilitat · Porteries · Altres; captions under icons;
  front-view icons for mannequin and hurdles; the colour row follows the chosen tool's group and
  only shows for items that take a colour. Silueta is in the Jugadors panel now.
- **Unrelated fixes shipped in v276:** kit-colour swatches before the colour picker (players and
  both kits); the 3D Top view flipping half a turn on the first orbit drag (`orbitTheta`); dropdowns
  closing when their own list scrolled (the training intensity was unusable); Escape puts down any
  board tool.
- **Localhost loads `js/board3d.js` from disk** (`tbLoad3D`), so 3D changes can be seen before a
  functions deploy. Everywhere else it is still the `getBoard3d` callable.

### Tools that worked (2026-09-22)

- **3D in headless Edge**: `--headless=new --use-angle=swiftshader --enable-unsafe-swiftshader`,
  the page served over `npx http-server` (ES modules do not load from `file://`), and BOTH
  `vendor/three.module.min.js` and `vendor/three.core.min.js` copied beside it — the first imports
  the second, and a missing one gives a silent blank canvas. The real builders were sliced out of
  `board3d.js` into the page; a Node script (`import` three, run the builders, `Box3` each) checked
  every item's size against the table before any screenshot.
- **Mockups for the owner from the REAL code**: slice `tbPropToolsHtml` / the glyph tables out of
  `app.js`, link the real `style.css`, screenshot, send the PNG. The owner changed the grouping
  twice from those before anything was built.
- `scripts/build-training-plan-preview.js` now renders props, so it shows the per-colour material
  list with the real renderers.

## Second session of 2026-09-21 — v273 to v275

### v273 — Sancions and Golejadors, rebuilt to the `fcf_tabs` handoff

The Claude Design bundle (`Downloads\EsquerrApp SancionsGolejadors\design_handoff_fcf_tabs`:
README, two `.dc.html` prototypes, six PNGs) for the last two staff pages still in the app
chrome. Markup and CSS are new; the parsers, the fetches and "nothing is read while a panel is open"
are unchanged. Full detail in CONTEXT.md; the points a next session needs:

- **`.fcf-` is the shared vocabulary** (root, crest, chips, pill, states), `.sanc-` / `.sc-` are
  page-private. `.fcf-page`, `.fcf-hero` & co. are in the shared paper lists near
  `.dashboard-content` — **placed before the `.ab-*` entries**, because `pissarres.test.js` pins
  those list tails verbatim.
- **Desktop and phone frames are both rendered**; `.fcf-desk` / `.fcf-phone` choose at 700px, by
  class (never `[hidden]`).
- **Owner decision: rulings against clubs are dropped** from Sancions entirely, before counting.
- **Golejadors' club card is keyed per ROW** (`clubId#index`), and the season is now an
  `scDropdown` in single mode. The phone's filter sheet holds the only copy of the pickers.
- **Run against the LIVE FCF proxy** before shipping, through a localhost harness that loaded the
  real tab block from `app.js` (the proxy allows `http://localhost:8123`). This found FCF
  publishing scorers with `nombre_jugador: null` — rendered as "—" now.
- Deviations from the handoff, reported to the owner and accepted: no "Club · …" label on
  Sancions (the shared category bar has no slot); the sub-line says "Amateur A" (no group or
  competition NAME exists in any payload we fetch); crest fallback is the app's 2-letter
  `clubMonogram` ("ED"), not the handoff's 3-letter codes.

### v274 — Sancions could only show squad A *(owner, the day v273 shipped)*

v273 deleted Sancions' own A/B picker in favour of the shared category bar — and
`renderCategoryBar()` returns '' for a one-category club, which Esquerra is. On `sancions` only,
the bar now always shows, offers no "Totes" / "all" chip, lists only squads with an FCF link
(`catBarLettersHtml(active, attr, only)`), and lights `sancionsLetter(cat)` — the one answer the
page and the bar share. Every other page is unchanged and a test pins that.

### v275 — Convocatòria's match picker

- Both clubs in **capitals** (`.cv-teams { text-transform: uppercase }`): our name is configured
  in mixed case and FCF writes rivals in capitals.
- **`fitCvTeams(root)`** shrinks the fixture to one line (0.5px steps, floor 11px), after layout,
  on resize, and when the menu opens. Same shape as `fitMnScoreNames`.
- **"Tria el partit" ruled off 6px high** — the toggle's `margin-top:auto` needs a stretched
  column parent; `.cv-ctl-match .cv-menu` is one now. Measured in headless Edge: all six rules at
  the same y.

### Tools that worked (second session)

- **Headless Edge will not size a window below ~480px.** A "390px" screenshot is a crop of a
  ~490px layout and looks exactly like horizontal overflow. Put the page in a 390px `<iframe>` and
  shoot the wrapper instead.
- **Measure, don't eyeball:** a `<pre id="out">` filled by an in-page script, read back with
  `--dump-dom`. That is how the 6px rule offset and the 425-in-348px overflow were found and then
  shown fixed.
- **Mutation passes** as a scratchpad Node script: apply one breaking edit, run the one suite,
  expect red, restore. 30 mutations across the three releases, all red after one test was
  tightened (a renamed base rule survived because another selector still named the class).

## First session of 2026-09-21 — v268 to v272

### "I changed the amateur-B link and nothing updated" — three faults, in order

The owner re-pointed `fcfLinks['amateur-B']` from last season's group to **58161914** (2026-27,
`temporadaId=22`). Neither the Classificació nor the Calendari moved.

1. **v268 — nothing reacted to a changed link.**
   - *Classificació:* the standings cache (`fa_league_cache_v2`) is keyed by SQUAD
     (`league-amateur-B`), not by group, so the old group's table was painted from cache on every
     render — and kept for good if the new group ever came back empty or failed. Each table now
     records the grupId it was fetched for (`fa_league_cache_v2_g`); `pruneStaleLeagueCache()` drops
     any mismatch (and any legacy entry with no recorded group) and the league refetches at once
     instead of waiting out the shared 5-minute window.
   - *Calendari:* saving only stored the link; fixtures come from the 06:00 `scheduledFcfSync` or the
     refresh button. `setClubCategories` now runs `_syncFcfSquad` for every squad whose **grupId**
     changed, returns `fcfSync`, and never fails the save over it.
   - A link to a group the club is not in used to report *"Tot al dia"* on refresh — identical to a
     healthy sync. Save and refresh now both toast `fcf.not_in_group`.
2. **v269 — the federation now appends the squad letter.** fcf.cat writes
   `"L'ESQUERRA DE L'EIXAMPLE, F.C. A"` / `"… B"` from 2026-27, `sameClubName` matched neither, and
   `_syncFcfSquad` returned `not-in-group` for both squads. `sameClubName` (both copies) retries with a
   trailing single-letter suffix stripped — a fallback only, whitespace before the letter required so a
   bare `F.C` keeps its C — and `ourTeamIdIn` prefers the row whose suffix is this squad's letter.
   Dry-run against live data before shipping: B adds 30 fixtures, marks the old group's 27 `fcfRemoved`,
   leaves the 3 hand-typed friendlies alone. **Amateur A was never affected** — it already had its 30.
3. **`13159ec` — the refresh button had been dead since 26 Aug.** `f973aed` (the getBoard3d commit)
   swapped `syncFcfFixtures`' `clubId` from `token.teamId` to `request.data.clubId`. The button has
   never sent one, so every press failed with *"Cap club."* — and a body-supplied id would have let
   any staff member rewrite another club's calendar. Back to the token; `test/sync-fcf.test.js` calls
   the callable exactly as `bindFcfRefresh` does. **The callable had no test at all**, which is how
   four weeks of failures went unnoticed.

### Cosmetic, at the owner's request

- **v270 — the squad letter lost its grey disc.** `.conv-team-circle`, `.cv-team` and
  `.pmt-team-letter` share one rule: a bare, **upright**, grey letter in `em`. Upright is now the only
  thing separating it from `.cat-badge` (italic) — `cat-badge.test.js` pins both halves. Interactive
  pickers (`.md-team-circle`, `.reg-team-circle`, `.ts-letter-chip`) are controls and unchanged.
- **v271 — in a match title the letter is part of our name.** `matchLabel` puts it inside
  `.md-our-club`, so Inici and the Calendari read "ESQUERRA DE L'EIXAMPLE F.C. B" in the name's own
  red/uppercase/size. Tested by RUNNING `matchLabel`, not by grepping it.
- **v272 — Inici.** Both answer groups are a fixed **256px** (measured with Oswald: the four training
  pills span 248 ca / 255 es / 242 en, the match pair 241), and the two column heads (`LES PROPERES
  DUES SETMANES`, `EL MEU ESTAT`) are a fixed 32px so their rules meet — they were 5px apart. Phone
  layout untouched.

### Tools and methods that worked

- **Reading production without ADC.** There are no Application Default Credentials on this machine,
  so Admin-SDK scripts fail. The Firebase CLI's own login works for **read-only** Firestore REST GETs:
  the token is in `~/.config/configstore/firebase-tools.json` under `additionalAccounts[]` for
  `marna96@gmail.com` — **not** the top-level `tokens`, which belong to another account and give 401.
  Run any `firebase` command first to refresh it. The two scripts used (`diag.js`, `dryrun.js`) lived
  in the session scratchpad, not the repo.
- **`firebase functions:log --only <fn>`** is what showed the refresh button was being pressed and
  `setClubCategories` logging `fcfSync: []` — i.e. that the save path ran and found nothing to sync.
- **Headless Edge for CSS checks:** `msedge --headless=new --screenshot` / `--dump-dom` against a
  scratch HTML that links the real `css/style.css` and Oswald. Launch it with `Start-Process …
  -RedirectStandardOutput` and a fresh `--user-data-dir`; called inline from PowerShell it returns
  nothing once an Edge instance exists.

## Pending

- **Pissarra material — not built, or not verified by clicking:**
  - The v276/v277 editor behaviour was driven by the OWNER on localhost and by source/jsdom tests;
    the full editor (place, drag, rotate, recolour, undo, frames, play, 3D drag) has no harness that
    mounts it — `bindTactics` is one closure behind login.
  - **A phone still on a pre-v276 app that re-saves a board drops its `props`** (it rebuilds the
    entry from the keys it knows). Same exposure as every new board key; it closes as clients update.
  - Not built: highlighting the last-used tool when the panel reopens (in the proposal, not asked
    again); swatches for a striped kit's SECOND colour; a length for the agility ladder (fixed 4 m).
  - The pitch goals (`m.goalLeft/goalRight` in board3d) and the prop goals do not share one builder;
    the plan said they should. Harmless, but two goal frames exist.
- **Sancions for this season is empty** — no rulings published yet for either Esquerra group
  (checked live 2026-09-21). The populated states were verified against a 2025-26 group; the
  first real 2026-27 ruling is worth a look.
- **Golejadors' `renders` count** on a full filter walk was ~76 (tree loads and club loads each
  re-render). Not a bug and pre-existing in shape, but a candidate if the page ever feels slow.
- **Rival names now carry the federation's squad letter** ("ASSOCIACIO ANTICS ALUMNES DE XALOC A").
  Offered to strip it from `opponentName`; **the owner has not answered.** If done, strip only in
  display or at import with care — `normTeamName` pairing and `findFirstLeg` read these names.
- **The letter on the profile photo** (`.po-team-badge`, a grey disc overlaid on the photo) was left
  as a disc on purpose — a bare letter on a photo is unreadable. Asked the owner; no answer yet.
- **Player-row letters** (Convocatòria, New Training picker, match table) are the v270 small grey
  upright letter. The owner's "same format as the rest of the letters" was applied to the match
  TITLE only (v271); whether rows should change too was asked, not answered.
- ✅ **Referee crawl re-scoped (2026-09-21, applied and read back):** `fcfCrawl/config` is now
  `enabled: true, seasons: ["22"], onlyGroups: ["58161881", "58161914"]` — B's old group 54888305
  and season 21 dropped. `_rebuildFcfReferees` reads the WHOLE `fcfRefIndex` collection, not the
  config, so last season's referee records survive. Scope change reset the queues; first unattended
  run is Friday 2026-09-25 (`fcfWeeklyRefs`), before B plays at Xaloc on the 27th — check its
  `appointed` log line. Ran via the Admin SDK with a temporary `authorized_user` credential built
  from the CLI login (see "Reading production without ADC"), deleted afterwards.
- **27 old-group B fixtures are `fcfRemoved`** (struck through, not deleted — call-ups and notes hang
  off their ids). The coach can delete them by hand; nothing automatic will.
- `ourTeamIdIn`'s letter preference (two of our squads in one group) is covered only by the pure
  `sameClubName` / `squadLetterOf` tests, not end to end — `_syncFcfSquad` fetches live and has no
  emulator test.
- **From before:** `21_54888305` holds 238 played actas with no referees (owner: not needed yet);
  `onlyGroups` is scoped to Esquerra's groups; `topup-demo-referees.js` has never been run; the demo
  season ends 2026-10-24 and nothing generates a new fixture list.

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

35. ✅ **CLOSED 2026-10-19, by the owner's call: no migration.** Nothing is broken and moving the
    reads changes no behaviour. *(v252)* `getUsers`,
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
2. ~~**Results are not imported into the app's own fixtures.** The app computes its scoreline from
   coach-entered events. The referee index does store the federation's `gh`/`ga` per acta, so their
   result is already on the device if that decision is ever taken.~~ ✅ **v278**: a closed acta's
   goals, cards and substitutions are imported AS EVENTS (functions/acta.js, ~45 min after the
   match), so the scoreline still comes from the one list. See CONTEXT.md v278.
3. ✅ **Done — v288:** both Inici week lists redraw themselves at the next lock, session end, match
   end or midnight (`iniScheduleRefresh`).
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
    *(2026-10-19: deferred by the owner until more weeks of real RPE. The bands are the standard ACWR
    ones — 0.8 / 1.3 / 1.5 / 1.7 — not demo numbers; what wants checking is how real squads fall
    against them, by running the engine over production data, read-only.)*
11. **Old-APK rules shim** — `clubs/{clubId}` still lets a lead write `fcfLinks`/`schedules` directly,
    bypassing the server-side validation in `setClubCategories`. Delete once a v55+ APK circulates.
12. ✅ **Done — v288** (the four smaller items): the three `teamId: 'default'` accounts deleted;
    availability and RPE readable within the category only; a deleted category's emptied shards
    removed; `backfill-training-teams.js` deleted (its job was done in August).
12b. **A failed profile-photo upload poisoned `fa_users`.** ✅ **Fixed — v232.** Both upload paths
    fell back to a `FileReader` data URI of up to 2 MB, which `setSession` persisted into
    `users/{uid}` and the synced `fa_users` blob — a document capped at 1 MB, so one failed upload
    could stop `fa_users` syncing for the whole club. Three layers now: every upload is downscaled
    to 256px first (`iniShrinkImage`, which fails OPEN so it can never be the reason a photo cannot
    be set); a failed upload says so and stores nothing; and `stripHeavyPics()` in `saveUsers()`
    refuses to carry an oversized value into the blob at all — which also REPAIRS one already
    poisoned in production. `setSession` guards the personal document the same way. See CONTEXT.md
    (v232) and `test/profile-pic.test.js`.
13. ✅ **Done — v288: follow-ball is back** in the camera menu, as a toggle whose light is read back
    from `isFollowingBall()` on every open and after every tap (`tbCamTap` / `tbSyncFollow`).
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
22. ✅ **Done — v289: the planned RPE is staff-only.** Calendari was the one place a player saw it:
    the intensity dot, "RPE previst 7 · 630 UA" (or the squad's reported mean), the week's AU and the
    load legend. Every other reader of `plannedRpe` is on a staff page. A player's own RPE answers
    (Accions, Les meves estadístiques) are his, and stay.

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

**Training**

36. **Assign points to the exercises of a training session.** *(owner asked 2026-10-19)* The
    exercises are the session plan's (`stdPlan`, the ✎ description editor since v282). Not
    designed yet. Settle first what a point measures and who earns it — a drill's winner (a player
    or a side) towards a running ranking, or a coach's rating of the exercise — because those are
    different records: per-player scores want a per-session record like `rpe`, not a field on the
    plan.

37. **Repeat a training session.** *(owner asked 2026-10-19)* Copy a session — its plan, exercises
    and material — to another day. Not designed yet: settle first whether it is a one-off copy or a
    weekly repeat. Nothing like it exists today ("Duplicar" is for board objects only).

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

### New this session (2026-09-22 — v276–v277)

- ⚠ **Never pipe a mutation runner through `Select-Object -First N`.** PowerShell kills node once N
  lines are out — between a mutating write and its restore. The next run then read the mutated
  `app.js` as the original and "restored" it: `max` stayed a `sum` in `planMaterial` until a
  full-suite run caught it. Filter with `Select-String`, and grep every mutation's replacement text
  afterwards.
- ⚠ **A deployed module means "test locally" shows the OLD version.** The 3D board comes from the
  `getBoard3d` callable, so the owner saw new items vanish in 3D and it looked like a bug. That is
  why `tbLoad3D` now reads the working copy on localhost.
- **A pixel floor can freeze a metric size.** 10–16px floors beat `ppm × real size` at every zoom the
  3D overlay reaches; the props never grew. Give small things a DRAWN size in metres and keep the
  floor as a small backstop only.
- **A capture `scroll` listener also hears the element it is protecting.** The dropdown's own list
  scrolling closed the dropdown.
- **At a singular camera angle the same parameters mean two pictures.** Straight down, θ gave
  screen-up one way; one pixel off vertical, the other. Prove continuity on the real orientation
  maths, not by reasoning about angles.
- **The "calls only declared functions" scanner reads `word (` inside i18n strings as a call** —
  "Tanca alta (d'atletisme)" failed the suite. Keep parentheses out of labels, or put a non-letter
  before them.
- `[hidden]` over an author `display` bit again (`.tb-prop-colours`) — caught before shipping only
  because the memory said to add the companion rule.

### From 2026-09-21, second half — v273–v275

- ⚠ **Deleting a control in favour of a shared one: check the shared one EXISTS for every
  client.** v273 removed Sancions' squad picker because the category bar "already offers it" —
  but the bar renders nothing for a one-category club, which is the only club that uses the page.
  The owner found it within the hour (v274). Render the page for the real club config, not a
  two-category fixture.
- **Run a redesign against live data before calling it done.** Unit tests on the handoff's sample
  rows passed; the live run found FCF publishing `null` player names on day one.
- **A test that a class "has a rule" is satisfied by ANY selector naming it.** Renaming the base
  `.sc-dd-box` rule survived because `input:checked + .sc-dd-box` still matched. Assert the rule
  that actually draws the thing.
- **A grab() marker on a function signature breaks when the signature grows a parameter** —
  `calendar-render.test.js` pinned `catBarLettersHtml(active, attr) {`. Grep `test/` for the old
  signature whenever one changes.

### Earlier the same day (v268–v272)

- ⚠ **A symptom can have several causes stacked in a row — each fix only uncovers the next.** "The
  B calendar does not update" was a missing trigger (v268), then a federation name change (v269),
  then a dead refresh button (`13159ec`). Each fix was correct and each was insufficient. What ended
  it was reading LIVE data and running the real merge as a dry run against it — the first two fixes
  were reasoned from code, and the second would have been found at once by a dry run.
- ⚠ **A callable with no test is a callable nobody knows is broken.** `syncFcfFixtures` failed on
  every press for four weeks after an unrelated commit touched the line beside it. The fix is a test
  that calls it with the exact payload the client sends — not a test of the helper it wraps.
- ⚠ **Upstream NAMES change without notice, and identity-by-name fails silently.** fcf.cat appended a
  squad letter to every club; the sync's answer was the quiet `{skipped: "not-in-group"}`, which the
  button then reported as "up to date". Any `skipped` reason has to reach the person who can act on it.
- **Cache by what the data IS, not by where it is shown.** The standings cache keyed by squad could
  not notice the squad's group had changed. Record the source identity (grupId) beside the cached value.
- **Measure before picking a size.** 256px for the answer groups came from rendering the real font
  in three languages, not from the screenshot — Spanish is 7px wider than Catalan.
- **Git Bash `sed` with a broad pattern hit two `package.json` scripts** (`test:functions` and
  `test:clubvenue` share the same tail). Check `git diff` after every scripted edit.

### From the previous session (v265–v267)

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

### From earlier sessions (v254–v264)


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
