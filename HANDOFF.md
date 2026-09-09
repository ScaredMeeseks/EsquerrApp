# HANDOFF — EsquerrApp

_Rolling document, overwritten each session. Last updated: 2026-09-09._

_The **Parking lot** near the foot of this file is the owner's backlog. It is carried forward
verbatim when this document is rewritten — do not regenerate it from the session you just did._

## Where things stand

**Version triple is at 252** — `CACHE_NAME` (sw.js), `APP_VERSION` (js/app.js), `CURRENT`
(functions/check-deploy.js). All three move together; `version-check.test.js` fails the suite if two
of them disagree.

| | |
|---|---|
| Unit tests | **3344** — `cd test && npm run test:unit` (~13 s), all passing |
| Rules tests | **178** — last run at v236, when the `playerMetrics` block was added |
| Functions tests | 71 — **not re-run this session**; the only `functions/` edits were the record loops in `deleteMember`/`deleteTeam` and the version constant |

Java 21 is installed and on PATH; the rules suite takes ~20 s and is **not** in `test:unit`.

**Deploy state.** `firestore.rules` and `storage.rules` were changed and **deployed twice this
session** — at **v234** (the medical documents bucket) and at **v236** (the `playerMetrics`
collection). Both went out BEFORE the matching frontend push, because the other order leaves a
window where the new UI is on screen and every write it makes is refused. ⚠ **v237–v252 changed
neither file and need no rules deploy**; the frontend ships by pushing `main`.

⚠ **Not yet driven by hand.** Everything from v234 on is tested and rendered but not clicked in the
real app. Worth trying first, in this order:

- ⚠ **The v247 filter and band, which NO preview can show.** The previews have no `.cat-bar`, and
  Calendari has no preview builder at all. Four things to do on `localhost:8080`:
  pick squad **B** and confirm the chip is ink-filled on every page that draws one (Calendari,
  Plantilla, Convocatòria, Inici, Mèdic, Registracions, Notificacions — Registracions offers chips
  for the first time); confirm the selection **survives** walking Calendari → Plantilla →
  Registracions → Notificacions; pick a category with **one** squad and confirm it clamps to Totes
  rather than emptying the page; and compare the seven title bands for one height and one left edge.
- **Calendari** (v247) — the band is new: title and scope line left, `‹ mes ›` and **Avui** right,
  all in ink; legends on a thin strip below; the grid inset 40px.
- **Accions** (v245) as a **player**: log an RPE from the strip, change it with `Canviar`, and
  confirm the row hardens the day after next. Then the phone — the wheel must move the value and
  **not** the page under it, and the bottom sheet must open and log an extra.
- **Notificacions** (v245) as a **coach**: confirm visiting the page no longer clears the unread
  badge, that a row opens where the action happened, and that `Marca-ho tot` clears only the squad
  the filter is on.
- ⚠ **`sancions`** — the one page under the repainted `.cat-bar` that is not a paper page, and the
  only screen I have not looked at since v245 repainted it or since v246 changed how the bar sits.
- ⚠ **The bar next to a banner** (v246). The overlap that clipped an update/push banner is fixed by
  a `:first-child` rule, and the only way to see it is with a banner actually showing — which no
  preview does. Worth forcing once.
- **Les meves estadístiques** (v244) as a **player** account. Two things a test cannot check: that
  the figures agree with the match history the same account can see, and that **no RPE number is
  anywhere on the page** — that is the product decision, not a detail.
- **Mètriques end to end** — add a measurement, create a custom metric, delete an entry, flip
  chart↔table, tick players in and out, drag the table sideways, download it. Confirm a **fitness**
  account can do all of it and a **delegate** sees no controls at all.
- **The Excel download on a phone.** It deliberately does NOT download in the Android app — see
  parking lot 31. Confirm it shows the toast rather than doing nothing.
- **Mèdic documents** (v234–v235) — attach a file, exceed the size cap, and delete one; a delete
  must remove the Storage object as well as the Firestore row.
- **Body-map symmetry** (v235, and again on the season map in v244) — an injury on the right leg
  must light the right leg only.

---

## The session in order — v234 to v252

### v234. Mèdic, rebuilt to the eighth design handoff.

Six screens in the `.md2-` prefix, plus a documents bucket on `storage.rules`
(`medical/{teamId}/{category}/{injuryId}/{fileName}`). `test/medical.test.js` is new, 68 assertions.

⚠ **`medical.test.js` slices `.md2-` to the END of the stylesheet**, so anything appended after that
banner is read as Mèdic's and trips its scans. New CSS goes inside its own page's region, not at the
foot of the file. This is the same trap that took Inici down when Mèdic was appended after it.

⚠ Two comment hazards found here and worth remembering: a comment containing `*/` closed a block
early (caught by `node --check`), and `image/*` **inside a string** opened a phantom comment in the
naive strippers several suites use — it swallowed a whole block and took a passing Convocatòria
assertion with it. It is `MD2_DOC_ACCEPT` spelled out by extension now.

### v235. Both legs, a missing cap, and an orphaned file.

Three owner-reported fixes. The one worth recording: **selecting a body region lit the symmetrical
muscle too.** I matched zone fills by **label**, and `BODY_ZONES` holds each zone twice — once per
side — under the same label, so one injury lit both legs. `md2ZoneIdx()` matches by index now, at
five render sites. ⚠ **My own defect, introduced by following the prototype's markup rather than the
data behind it.**

Also: a maximum document size, and removing a file now deletes the Storage object and the Firestore
row rather than only the row.

### v236. Player metrics — parking lot 19 and 20, which are one feature.

Weight, height and fitness tests. Plantilla → player detail to add and chart one player; an
expandable **Mètriques** section for the whole squad.

⚠ **Two stores that behave in opposite ways, and that is the design, not an accident:**

- a **measurement** is a record in `teams/{id}/playerMetrics/{docId}` carrying **no category at
  all** — which is what makes it follow a promoted player and what makes the season rollover a
  no-op, since `archiveSeason` only destroys what is named in `SEASON_KEYS` or the archive record
  loop, and this is in neither;
- a **definition** is a row in `fa_metric_catalog`, category-sharded, so a metric belongs to the
  squad that invented it.

⚠ A design review caught the first version splitting a promoted player's history in two — cadet's
"Pes" and juvenil's "Pes" being different rows with different ids. Three things fix it: weight and
height are **reserved constants in code**, not catalogue rows; a custom metric carries an
accent-stripped **slug** and the UI groups by slug; and `name`/`unit` are **denormalised onto every
measurement**, so a record is self-describing even when its definition is in a shard the reader
cannot open.

⚠ A new **`player-metrics`** right in `STAFF_ROLE_ACCESS`. The fitness coach has
`manage-roster: 'view'`, so gating on the page would have locked out the one role whose job this is.

⚠ Read access is **staff-only**, stricter than the `sameTeam` precedent of the collections beside
it, and there is **no `allow update`** — "delete, not edit" was a product decision and it is free to
enforce in the rules. Known limit, stated rather than buried: any staff member of the club can read
every squad's numbers, because the record carries no category for a rule to test.

### v237. Four fixes from the owner's first use.

Picker below the title; outside-click closes the dropdown; chart↔table stops re-rendering the player
detail (`bindPlmControls` + `plmRefresh`); and a new metric can actually be created — `showAddMetric`
was reading the squad off the **page filters**, so on "Totes" the `__none` guard correctly refused
and the option vanished. It reads `p.category`/`p.team` off the **player** now.

### v238. ⚠ Plantilla rendered nothing — and 3080 tests said it was fine.

v237's extraction of `plScopedPlayers()` took `var curCat` out of `renderStaffRoster` along with the
filter that used it, leaving two uses behind. `var` is function-scoped, so both threw a
`ReferenceError` **before the function returned a single character**. The page painted nothing.

⚠ **The real failure was the suite.** All 30 Plantilla assertions read `renderStaffRoster` as
**text** — grab the source, regex it. Not one had ever *called* it, so a function throwing on its
fifth line scored exactly as green as a working one, and `node --check` cannot see it because it is
valid syntax. There is now a `renderStaffRoster — it runs` block that executes the real function
over stubs, with **every collaborator stubbed and nothing else**, so an identifier the function
should declare for itself throws in the test instead of on a phone.

### v239. A colour per player, and the last control that rebuilt the page.

`--pp-series-1..10` join the palette. ⚠ Not aliases of existing tokens: the palette guard reports a
hex **with the key name it belongs to**, so two keys sharing one value produce two report lines for
one hex and break the allowed list.

⚠ **A player's colour comes from his position in the whole squad, in id order.** Indexing by the
drawn set repaints everybody when one player is ticked off; indexing by the table repaints two when
one gains a kilo, because that table sorts by latest value. Both look reasonable in a diff; both
were mutations that round killed. Ten hues for up to twenty-two players, so the eleventh line
repeats the first **dashed, with a hollow swatch**.

Expanding the section stopped re-rendering too: `plmSectionHtml` always emits `#plm-secwrap`, open
or shut, so there is a stable node for `plmRefresh` to swap.

### v240. The squad table becomes a matrix.

One row per player, one column per measurement date. ⚠ A cell holds an **array** — a player can be
weighed twice in a day, which is what the random tail on the record id is for. Columns are the union
of dates across the whole squad so the grid lines up; a missing reading is `·`, not a blank and not
a zero.

Scroll box with drag-to-pan. ⚠ The overflow is on the **div, never the table**: a sticky cell
positions against its nearest scrolling ancestor, so a self-scrolling table would pin the frozen
column to the table and it would never move. Name, swatch and tick all ride in that sticky column.

### v241. Download the metric table.

⚠ **CSV, not .xlsx, and that is a decision.** A real xlsx is a ZIP archive — deflate streams, a
central directory, four XML parts, a CRC32 per entry — and this app has no build step and no
libraries.

Three things make it open cleanly, none of them visible on screen: a **UTF-8 BOM** (or Excel reads
the system codepage and accented names arrive mojibaked), a leading **`sep=` line** overriding the
locale's list separator, and ⚠ a separator and decimal mark that **match each other** and follow
`_lang` — `;` with `,` for ca/es, `,` with `.` for en. A comma decimal under a comma separator
splits every reading in half and the file still looks plausible.

`plmMatrix()` is new and is the point: the grid the table renders and the grid the CSV writes are
**one function**. The export rebuilds through it rather than scraping the DOM.

### v242. The download button becomes an arrow.

Same box as one GRÀFIC/TAULA segment — 26px tall, half the 150px control less its 7px gap — with
`title`/`aria-label` carrying the name and the `<svg>` `aria-hidden`. ⚠ The narrow breakpoint moves
**both**: `.plm-segs` already shrank there, and `.plm-xls` now shrinks with it.

### v243. The player's training page, rebuilt on the coach's.

Opening a training gave a player the old `.detail-*` cards — and, under them, **the coach's tactical
boards**. It is `renderStaffTrainingDetail`'s `.std-` page now, carrying three things and no more:
the title, the forecast, and who is coming. The planned RPE, the load in UA, the plan and material
rail, the team generator and the readiness/A-C/medical columns are all his, not hers.

Three geometry defects found by rendering `player-training-preview.html` in headless Chrome at 1440
and 390 — one of them (`.std-main` sizing itself to the table's `min-width` and sliding the whole
page sideways below 900px) had been **live on the coach's page since v188**. New
`test/training-detail.test.js` (32), which CALLS the renderer.

### v244. Les meves estadístiques, the tenth paper page.

The player's own stats page, `.ms-`, from the tenth design handoff — and the last screen still
wearing `.card`. It is the two product decisions the handoff bakes in, not a restyle:

- ⚠ **No RPE anywhere** (roadmap 22) — not a session figure, not a weekly-load chart, and not the
  four Readiness components, which are the coach's dosing weights. The player gets the derived trio:
  the **Preparació** score, the **aguda/crònica** ratio and the **dies des del darrer partit**, plus
  a sentence that explains the score *instead of* exposing the components. `buildChartsHtml()` and
  `buildReadinessCard()` are untouched and still on `renderStaffPlayerStats`, where they belong.
- ⚠ **No MVP** (roadmap 21) — the handoff's gold star is drawn against teammate voting, which does
  not exist. Nothing is built for it rather than wiring the star to a stand-in signal, which would
  look right and mean something else.

`renderStaffPlayerStats` and the `.mystats-*` block are deliberately untouched. Most of the page was
already in the repo: `computePlayerMatchStats`, `buildInjuryHistoryHtml(uid,{forPlayer:true})` (which
IS the zone-only privacy rule), `utils.bodyMapHtml` and `iniDonutHtml`.

⚠ **`.ms-` is now last in the stylesheet**, so `test/medical.test.js` finally got the end bound its
own v234 comment asked for. `test/ms.test.js` slices to EOF and carries the same warning forward.
⚠ **The body map counts zones by INDEX** — the handoff's sample script does `counts[z.label]`, which
is the v235 both-legs defect verbatim.
⚠ **The full-bleed negation sits in a 600px block, not the page's own 700px one**, because
`.dashboard-content`'s padding changes at 600 and the page's columns change at 700.

Unit 3160 → **3197**; new `test/ms.test.js` (37), five mutations killed. New
`scripts/build-ms-preview.js`; `ms-preview.html` added to `_config.yml` (⚠ that list is BY NAME).
Looked at at 1440, 650 and 390 — no horizontal overflow at any of them.

### v245. Accions and Notificacions, the eleventh and twelfth paper pages.

The last two screens on pre-redesign chrome, and the two a person touches every day. `.ac-` and
`.nf-`; `.action-*` and `.notif-*` are deleted.

⚠ **`Accions.dc.html` was missing from the handoff bundle** — only `Notificacions.dc.html`
shipped. Notificacions is built to its exact values; Accions is reconstructed from the two
screenshots and the README's prose. CONTEXT.md lists what was inferred.

**Four defects fixed, none cosmetic:** a saved RPE could not be seen or changed (there was no
lock, cutoff or edit path anywhere in the codebase); logged extras vanished on the next repaint
because the list was only ever filled at runtime; opening Notificacions marked everything read as
a side effect of rendering; and `typeBadge()` hardcoded English labels and hex colours, leaving
five `notif.*` keys dead. `Clear All` — which **deleted** rows rather than marking them read — is
gone.

**The RPE edit window is new**: until 23:59:59 of the day after the activity. ⚠ **Client-side
only, deliberately** — `firestore.rules` is unchanged and still accepts a late write. That is the
opposite call from the MVP vote (parking lot 21), and CONTEXT.md says why. An edit files a second
notification rather than amending the first.

**`playerActionModel()`** replaces the two copies of the pending filters the page and the sidebar
badge each kept. **Availability left Accions** — Inici owns it and has the changeable pill this
page never had.

**The notification record gained `team`, `answer`, `page`, `pageId` and two types** (`injury`,
`registration` — joining the club used to notify nobody). ⚠ Every record already in the blob has
none of them and must degrade the way a missing `category` already does: visible, unbadged,
unlinked.

⚠ **The shared `.cat-bar` was repainted for all nine of its pages.** `sancions` is the one page
under it that is not redesigned and now wears a paper filter bar above old chrome — the
deliberate choice, but **not yet looked at by hand**.

Five geometry defects found by rendering: the scale captions colliding, `.nf-rail` winning the
cascade over the override meant to fold it, `.nf-detail` at `100% + 35px`, an absolutely
positioned phone bar escaping to the viewport, and an answered row sorting above a pending one.
⚠ The preview harness had its own bug that looked exactly like an app bug — a frozen-clock shim
that forwarded only the first argument turned `new Date(y, m, d)` into 2.026 seconds after the
epoch, closing every edit window in 1970.

Unit 3198 → **3274**; `test/accions.test.js` (37) and `test/notificacions.test.js` (39), five
mutations killed. `test/ms.test.js` got its end bound; two grabs in `inici.test.js` and three in
`training.test.js` were repointed. Two new previews, both in `_config.yml` (⚠ BY NAME).

### v246. One page geometry for the paper system, and an RPE you can see.

Three reports off the owner's first local look at v245; two were the same bug.

**The chosen RPE came out grey.** `.ac-strip-set .ac-cell` is (0,2,0) and outranked both
`.ac-cell-on` and the ramp class the JS adds, which are (0,1,0) each — so `currentColor` resolved
to the dim and the ramp never rendered. It FILLS now, which is what the handoff said all along.
⚠ The phone wheel deliberately does not fill; there the ramp is on the text.

**The grey side bands and the short filter bar were one cause.** Ten paper roots had drifted into
two camps — `-2rem` and full bleed, or `-1rem` and a 16px band each side. And ⚠ **the bar and the
root are adjacent siblings**, so their margins collapse to `max(positive) + min(negative)`: the
bar leaves 1rem, so a `-2rem` root climbed 16px OVER it and covered its bottom rule. Both share
`--pp-paper`, so that read as the bar being shorter. Three bar heights across nine pages, one sum.

**One rule now, beside `.dashboard-content`** — `margin: -1rem -2rem -2rem` plus a `:first-child`
arm, the `.std-page` pattern from v188. `-1rem` on top cancels what the bar or a banner leaves;
`-2rem` on the sides is the container. Content inset normalised to 40px.

Two pre-existing defects fixed with it: ⚠ **the cat-bar rode 16px over an update/push banner** on
all ten CATEGORY_PAGES, and ⚠ **it switched at 500px while the container switches at 600**.

⚠ **`test/accions.test.js` had `assert.ok(at600 === '' || true)`** — unconditionally true, and the
one assertion that would have caught this. Revived and confirmed red first. The geometry is now
ONE test in `test/layout.test.js` across all ten roots; ten copies of a geometry assertion is how
ten copies of the geometry got there.

⚠ **Four preview harnesses wrapped the page in `padding:1rem`**, sized to the old `-1rem`, so they
reported a 16px overflow the real app does not have. They are 2rem now — a shell that does not
match the container makes every geometry check on it a lie. (And: those CSS blocks are inside JS
template literals, so a backtick in a comment ends the string.)
⚠ **The Accions preview never showed a chosen cell** — pending rows start null, answered ones
collapse to a figure — which is how the grey-RPE bug survived a look at the mockup. It renders the
mid-edit row now.

Unit 3274 → **3281**; three mutations killed. Push only.

### v247. One header, one filter, and a Calendari that has a title.

Five reports off the owner's look at v246.

**The selected squad chip was invisible on every page that draws one.** The JS marks it
`roster-team-btn-active`; v245's repaint styled `.active`, which never matches — and
`.cat-bar .cat-bar-letter` at (0,2,0) outranked the class anyway, so even the pre-v245 fill had
lost. ⚠ **Do not fix this by renaming the class in the JS**: `calendar-render.test.js` counts lit
chips by it and the roster's own chip row uses it. Same defect class as v246's grey RPE cell — a
repaint that guessed a class name.

**Six filter variables became one `_viewSquad`**, read through `getCurrentSquad()`, which
**clamps on read** — the eight-line reset block is gone, and with it two holes the reset never
covered (`catBarLettersHtml` never validated the letter, and `_clubConfig` loads async so an early
render could strand a stale 'B'). ⚠ `trainingTeamFilter` was **written twice and read nowhere** and
is deleted with its control. ⚠ `stdTeamFilter` is KEPT — a multi-select `Set` answering a different
question. Registracions was reading a letter it never offered a chip for; it offers them now, and
`regInvited`, which parsed the letter and never filtered on it, finally does.

⚠ **This reverses a test** — `calendar-render.test.js` asserted the calendar and roster filters
"must not share the state". Nothing in the source defended it; `renderCalendar`'s own comment says
the opposite, and so did the owner.

**One header band across nine pages, one title size.** Plantilla, Registracions and Convocatòria
gained the white band; four 38px titles came down to 36 and gained the phone override they never
had. ⚠ `.ini-name`/`.ms-name` stay 34px — a person's name, not a page title. Seven caption atoms
and four value rules collapsed to one each; 45 per-page rules deleted.

**Calendari gets a `.cal-page` root** — it never had one — so `ROOTS` in `layout.test.js` is
**eleven**. It has a title again, reversing v221 with the reason recorded: that trade was sound
while Calendari was alone in making it. Month nav in the band, in **ink**; legends on a strip below;
grid inset 40px, stepping down at **700**, the band's breakpoint. ⚠ The two banners render OUTSIDE
the root or the `:first-child` arm mis-fires.

⚠ **I defanged an assertion again.** The ghost-exclusion test compared the count against a scan of
the rendered blocks — both sides moved together, so it passed with ghosts counted, the one thing it
exists to catch. It is an exact number against a fixture now. Second time in two versions.

⚠ **Region-slice assertions had to MOVE, not be rewritten.** A rule naming nine pages does not live
in any page's slice, so `.ini-counters`, `.ini-hero`'s white and `.md2-counters` now match the whole
resolved stylesheet — what matters is that Mèdic's counters bottom-align, not where the declaration
sits. ⚠ `readCss()` expands `--pp-*` to literals, so ink is `#2D2926`, not `var(--pp-ink)`.

⚠ **Five preview builders broke on deleted identifiers**, including `training-plan`, whose `grab()`
end marker was a variable that no longer exists. All nine rebuild; six re-shot at 1440/650/390 with
no overflow. Unit 3281 → **3284**; seven mutations killed. Push only.

**Follow-up, same version: the inset was on the ROOT.** The owner reported Registres, Plantilla and
Convocatòria still not using the full page while Notificacions, Mèdic, Calendari and Inici did —
an exact split that names the cause. ⚠ **A band painted edge to edge cannot reach an edge its
ancestor holds it 40px away from.** Those three carried `padding: 28px 40px 48px` on `.pl-main`,
`.reg2-page` and `.cv-page`; the four that looked right have never had root padding and put their
inset on a `-body` wrapper. The root carries the bleed and nothing else now, and eight body
wrappers share one inset rule (`.pl-body`, `.reg2-body`, `.cv-body` are the new ones), stepping
down at **700** — the band's breakpoint, not the 900 those pages used.

⚠ **The plan said to do this and I shipped the band without it — then saw the defect and explained
it away.** Convocatòria's band visibly started 40px in, inside a frame, and I recorded it as "the
preview's own mock shell". The two previews really do differ, which is what made the wrong reading
available, but the difference worth checking was the one on the page. One measurement settled it.

`layout.test.js`'s inset test **moved rather than being rewritten** — right question, wrong element
— plus two new cases: **no page ROOT may declare padding**, and every body steps down with the
band. Unit 3284 → **3287**; three more mutations killed.

**Follow-up 2: Plantilla's attendance ring joins the band.** Asked for by the owner. It was the
first thing under the band, alone on a row that held nothing else. ⚠ **Dropped in at its old 84px
it made Plantilla's band 145px against every other page's 125** — measured, and exactly the
one-height ask the shared band exists for. So the band's ring is **56** and the rail's stays **84**,
and the band's legend flows **2×2** (four stacked rows are 78px on their own), scoped to
`.pl-title-row` so the rail's column legend is not re-flowed from here.

⚠ That **reverses `plantilla.test.js`'s "draws its donut at the same size as the team one"**. Its
reasoning was adjacency — the team ring used to sit directly over the roster table, inches from the
rail beside that same table. The team ring is in the header band now, ~500px up the page; the two
are never on one line. Both sizes are pinned so neither drifts. Unit 3287 → **3289**; three more
mutations killed.

**Follow-up 3: four owner reports on the rings and the bands.**

⚠ **The availability ring disagreed with the number in its own middle, and had since the page was
built.** *"In Inici the number is 1% yet the donut is all green."* The arcs were drawn against the
sum of the four ANSWERS; the centre percentage against the SLOTS — every player × every session. One
answer in ninety gave "1%" inside a full green ring. ⚠ **The docstring described the fix it never
had** ("the uncovered remainder of the track is the no-answer share"): nothing ever put the
unanswered slots in a denominator. `iniAvailSegs(n, slots)` now turns the difference into a fifth,
grey segment (`--pp-rule-4`, lighter than the `--pp-neutral` of a deliberate "No"). ⚠ **My-stats had
the same bug** — a lone green arc is always the whole ring — and was fixed with it, unreported.

**One ring size for every header band**: `HERO_DONUT = 56`. It was 88, 76, 88 and 56 across four
bands. ⚠ Not the 44px per-session ring in an Inici row, nor Plantilla's rail at 84. `.ms-attend`'s
62px phone override is deleted — it would now UPSCALE the ring on a phone.

**The centre number is derived from the ring** (`size * 0.215`); a fixed 18px overflowed the 56px
hole. **Registres' subtitle is one sentence**, and the shared scope-line rule is `nowrap` +
`ellipsis` + `min-width: 0` so no future string can push a band taller — wrapping again below 700.

⚠ **`inici.test.js` contained a test that documented the bug**: its assertion was about the builder,
its comment told a squad-of-22 story the code never implemented. Green through exactly the defect it
looked like it covered. ⚠ **The runnable Plantilla harness earned its keep again** — four cases went
red on `ReferenceError: HERO_DONUT` the moment the constant landed. ⚠ **And one of my mutations
silently failed to apply**, making a live assertion look dead; re-run with an assert on the
replacement, it killed. Unit 3289 → **3297**; five mutations confirmed.

### v249. A photo that never syncs, a misaligned eyebrow, a badge Inici threw away.

⚠ **`fa_users` never learned anything new about a person.** Reported as "his photo only shows on
his own profile" — his profile reads the personal document, every roster surface reads the blob, and
the reconcile in js/db.js was **add-only, once at init, with no `onSnapshot` on `users/`**. A row
already in the blob was frozen for good, so **every** change to a personal document was invisible to
everyone else: a rename, a new dorsal, a corrected position. It updates through `_mergeProfile` now.
⚠ **An allowlist, never `Object.assign`** — a row also carries `roles`, `category`, `team`,
`staffCategories`, `staffRole`, `isTeamLead`, all server-owned and all *stripped* from the client's
own write to `users/{uid}`; copying a document over a row silently demotes people. ⚠ It returns the
same object on a no-op, so booting does not rewrite the blob (and route a write) every time.

⚠ **A second cause no sync fix reaches**: a pre-v232 failed upload is a `data:` URI, kept on the
personal document and dropped from the shared blob by `stripHeavyPics` — by design. That person's
photo is visible to them alone and the only signal was a `console.warn`. `renderPage` now prompts
them to re-upload, latched so it fires once and not on every sync callback.

**Plantilla's "Assistència" eyebrow sat 5px high**: `.pl-att` centred its label against the ring
while the figures beside it hung from the bottom. ⚠ **And a defect of mine** — `.pl-fig`/`.pl-fig-v`
were in the v247 shared rules AND redeclared afterwards at 24px, so Plantilla's figures were 24px
where the other nine bands were 30px, and the v247 note claims that copy was collapsed. Deleted;
`layout.test.js` now guards the whole class of it. All five eyebrows measured level at a 125px band.

**Inici drew a monogram where Calendari drew the real crest.** `iniSideBadgeHtml(name)` took only a
name, under a comment saying "the club has no rival crest library". ⚠ **Calendari's own comment
records making the identical mistake and fixing it** — Inici was the last page still believing the
stale one, so it is deleted rather than softened. Both row builders now carry `oppBadge`.

Unit 3297 → **3319**; fifteen mutations killed, each asserted to have actually applied.

### v250. The crest the classificació omits.

Asked, not reported: "how come some clubs have the crest in some places but not in the
classificació?" ⚠ **The federation disagrees with itself.** Sampled live on group 58161881:
`/competition/partidos` carries `ESCUDO_*` for all sixteen clubs; `/competition/classificacio`
returns `team.logo: null` for four of them — Inspire Soccer, San Lorenzo, Barcelona City, Besos
Baron de Viver. Nothing in the app was inconsistent: `fcfBadgeUrl` and `fcfBadgeOf` are
byte-identical, same base and same `escutbase` filter. The two payloads differ.

`withFixtureBadges(rows)` fills an empty standings badge from our own fixtures, which carry
`opponentTeamId` beside `opponentBadge`. ⚠ **On the federation ID, never the name** — these payloads
are free text ("OLYMPIA - VIARO ,C.E A") and `normTeamName` exists because they do not compare
cleanly; a name match would put another club's badge on a row, which is worse than initials.
⚠ Returns NEW rows: they come from the persisted league cache, and writing a derived badge back
would store a crest the federation never sent for that endpoint. ⚠ Honest limit: our fixtures cover
our own group, so other groups still fall back to the monogram.

⚠ **`test/fixtures/fcf-preseason.json` no longer matches the live payload** — captured before those
clubs lost their logo, so every row carries one and it cannot produce the case. Left alone (a dozen
assertions are calibrated on it); the null is injected inside the new test where it is visible.

⚠ **Two runnable harnesses caught the new dependency** — `fcf-app.test.js` and the Inici preview
builder both went red on `getMatches`. ⚠ **And the preview then passed for the wrong reason**: the
map is lazy and every row in its fixture has a badge, so the call never fired — the first logo-less
club would have thrown inside `innerHTML`. Stubbed explicitly.

Unit 3319 → **3331**; eight mutations killed.

### v251. The loading-screen hang: `getMatches` never existed.

⚠ v250 shipped `fcfBadgeById` calling `getMatches()` — a function that exists NOWHERE in this app.
The ReferenceError landed inside a render, and `renderDashboard()` runs BEFORE `_hideSplash()`, so
the app never started. ⚠ **Three green signals, all the same mistake**: two harnesses and a preview
builder each named `getMatches` in a `new Function` parameter list, and `new Function` binds any
identifier you name. **Code that runs over stubs is not code that runs in the app** — the inverse of
v238 and nastier. New guard in `suite-registry.test.js`: every stub must name something the app
declares. Its own first runs taught it two things — `root.BG = api` is the only place the module
globals are named, and comments must be stripped, because the comment explaining this outage writes
`getMatches()` in prose.

### v252. Bare crests, one header type, a venue glyph — and the missing accessor.

**The architecture answer.** The v251 fix was correct; the architecture around it was the defect.
⚠ `getUsers`, `getTrainings`, `getInjuries` and `getMatchEvents` all exist and `getMatches` did
not — which is exactly why reaching for it was a trap. Added. The other 31 raw reads are parking-lot
35, not migrated: the trap is gone either way. ⚠ **The v251 guard then failed its own probe**,
correctly refusing to become a test of nothing once the name existed.

**Classificació**: a real crest is drawn bare — the disc belongs to the monogram
(`.ini-tbl-badge-plain`, the same call `.cal-crest-plain` makes). **Les meves estadístiques**: the
rival's crest left of the name; 🏠/✈️ instead of "Casa"/"Fora"; and ⚠ **one header type** —
`.ms-c-date` set its own 13px so it hit the HEADER cell too, and three columns had been patched
round it with a `.ms-head .ms-c-*` exception list. The list was the symptom; sizes now live on the
row and the header owns its own.

⚠ **A comment I had to correct before shipping**: I credited `line-height: 1` with centring the
glyph. Measured, it moves it 0.0px — `align-items: center` does that. What it really does is shrink
the glyph's box 20px → 13px so an emoji cannot set a row's floor. ⚠ **Two of my new assertions were
defanged and mutation caught both.** Unit 3334 → **3344**.

---

## Parking lot

### ⚠ NEXT SESSION STARTS HERE — the attendance donuts *(owner, 2026-09-09)*

**Do this first, before anything else.** Two faults, and they are probably one
cause: whatever counts a session as "attended" is being asked the question in
three places and answering differently.

**(a) A session should not count until it has STARTED.** Future sessions are
being included in both the render and the percentage, so a squad that has
answered nothing for next Tuesday is already carrying it as a miss (or a
yes — establish which, that is the first thing to measure). Attendance is a
record of what happened; a session in the future has not happened. ⚠ The
boundary is the session's START, not its date — a training at 21:00 today has
not been attended at 10:00 today. `sessionEndsAt`/`sessionWindow` already
exist and may or may not be the right hook; check before adding a fourth
opinion about when a session is live.

**(b) Inici, Les meves estadístiques and the player detail disagree** about one
player's attendance. Three surfaces, three numbers, same player.

⚠ **Find the shared rule before fixing any of the three.** The repo's own
standing lesson applies exactly here — *"when two views must agree, give them
one function, not two that match"* (`plmMatrix`, `_syncFcfSquad`,
`scheduleSlots`). Three call sites computing attendance separately is the
disease; making them agree by patching each is treating the symptom, and they
will drift again by the next release.

Known starting points, none of them verified as the cause:
- Inici's staff hero counts `sSlots` as every player × every session in
  `seasonTrainings`, filtered on `tr.date <= todayISO` — a DATE test, which is
  suspect for (a).
- Inici's player hero counts `pTotal` from `getEffectiveAnswer` over
  `training`, with a `pNa` bucket.
- Les meves estadístiques counts `answered` from `getEffectiveAnswer` over
  `trainingOnly(getTrainings())` and has NO date filter at all — which alone
  would explain (a) and part of (b).
- ⚠ `getEffectiveAnswer` **counts a silent player as a yes** (see the banner in
  `test/inici.test.js`). Whether that is right for a *future* session is the
  crux of (a), and it is a product decision, not a bug to quietly flip.
- v247.4 gave the rings a real denominator (`iniAvailSegs(n, slots)`), so the
  ring and its centre number now agree *within* a page. That work is what made
  the disagreement *between* pages visible; it did not cause it.

**Ask the owner which number is the RIGHT one before making the other two
match it.** "Sessions so far this season, of those the player was called to"
and "every session on the calendar" are different questions and the answer
decides the fix.

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
