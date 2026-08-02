# HANDOFF — EsquerrApp

_Rolling document, overwritten each session. Last updated: 2026-08-02 (Phase 4 written, NOT yet deployed)._

## Current state

- Repo: `c:\DATA\CLAUDE\EsquerrApp` → https://github.com/ScaredMeeseks/EsquerrApp. Firebase project `esquerrapp`. Frontend = GitHub Pages from `main`; APK = CI build on push; rules/functions = `./deploy.sh` in Cloud Shell. One-off scripts live in `functions/` (root npm installs are broken on Cloud Shell).
- **Production is still on v22** (Phases 1, 2, 3a, 3b). The real club's teamId is literally `default`.
- **Phase 4 is written but UNDEPLOYED** — working tree only, no branch, no commit. Full change list in CONTEXT.md §2026-08-02.
- **Legacy availability/RPE `data/` docs remain FROZEN but not deleted** — still the 3b rollback net. `migrate-player-data.js --delete-legacy` still deliberately unrun.

## Phase 4 — what it does

The lead now decides who is staff (per `{category}-{letter}` email list in "Configura el teu club"); staff decide who plays (email list on Registrations). Registration is a **hard gate** against those lists — an unlisted address is refused with a Catalan message telling them to ask their coach. A listed address gets its role, category and team assigned server-side and skips the role-picker. Staff see only their own categories.

Both choices were made deliberately and are strict: unlisted people cannot register, and staff on no list see nothing.

## Pending / next steps (IN THIS ORDER)

1. **`node functions/prefill-rosters.js`** (dry-run — read the whole output). It seeds the lists from current members and prints an `UNPLACEABLE` report.
2. **Drive UNPLACEABLE to zero.** Assign a category (and, for players, a team letter) in Registrations for everyone listed, then re-run the dry-run. **Do not proceed until it reads 0** — with "unlisted staff see nothing", anyone the script cannot place goes blind the moment claims recompute.
3. `node functions/prefill-rosters.js --apply`
4. **`./deploy.sh`** in Cloud Shell — rules + functions. Confirm the "Deploying to" header says `esquerrapp`. The new `onRosterWritten` trigger is a fresh function; nothing gets deleted this time.
5. **Rules tests** (cannot run on this Windows box — no Java): `cd ~/EsquerrApp/test && npm install`, then `npx firebase emulators:exec --only firestore --project=demo-esquerrapp "npx mocha rules.test.js --timeout 15000"`. **These have never been executed** for the Phase 4 additions — run them before or immediately after the rules deploy.
6. **Frontend**: `sw.js` CACHE_NAME is already bumped to `esquerrapp-v23`. Commit + push `main` (Pages + APK build).
7. **Fresh APK on the phones** — old APKs still show the self-select Staff role screen and have no gate.
8. **`node functions/check-deploy.js`** — now `[1b/5]` also asserts every member is on a list, every staff member has categories, and the `cats` claim matches the doc.

## Smoke test (owed, and larger than usual this time)

Nothing in Phase 4 has been run against a live Firebase — no emulator locally, no deploy yet. Minimum before trusting it:

- unlisted email + valid club code → registration refused, **no orphan** left in `users/`
- listed player email → lands on the dashboard with the right category/team, never sees the role picker
- listed staff email → staff pages, correct categories only
- lead adds an already-registered person to a staff list → their **open** app gains staff pages within seconds (exercises `onRosterWritten` → `claimsUpdatedAt` → the users-doc listener); removing the address takes them away again
- cadet coach: cat-bar shows Cadet only, no "Totes"; medical / matchday / notifications show cadet only; A/B letter filters still work
- staff with no list entry: sees `error.no_categories`, not blank pages
- lead: types staff emails, adds a team letter → **typed emails must survive** the re-render
- **regression**: with Cadet selected in staff-training, edit a row's focus text, switch to Juvenil → juvenil sessions untouched (this was the index-misalignment bug)
- browser console as a player: `users/{self}` update with `{roles:['staff']}` → permission-denied; `setRole({uid:self, roles:['staff']})` → returns `role:'player'`

## Known trade-offs / notes

- **Category scoping is cosmetic, not a permission boundary.** All club data is club-wide blobs that every device downloads in full; rules cannot read inside a JSON string. Only the roster email lists are genuinely restricted. **Phase 5 (agreed, not planned in detail) splits the data per category** so it becomes real — see the plan file `~/.claude/plans/working-on-the-esquerrapp-ticklish-beaver.md` §Phase 2, which also notes it fixes the whole-blob clobber problem (CONTEXT.md "Known problem #1") and cuts every device's download to roughly a sixth.
- Whole-blob writes touched by the new filtering (matchday drafts, notifications) now carry out-of-scope entries through explicitly. Any FUTURE page that filters and then saves must do the same, or it deletes the categories it isn't showing.
- The lead and superuser always bypass the registration gate, so a new club can still be bootstrapped with empty lists.
- A member removed from every list keeps their last category/team on the doc (only roles and claims are revoked) — deliberate, so a mistaken removal doesn't erase their assignment.
- Deferred 3b tail still outstanding: injuries per-record collection, notifications collection, read-time fitness derivation.
- Future: move hosting to Firebase Hosting (cache-control; fixes the GitHub Pages stale-JS problem).
- Cloud Shell gotchas: `.firebaserc` is tracked — never `rm` it (deploy.sh checks it); scripts run from repo root (`node functions/<name>.js`); read every dry-run before `--apply`; backup bucket is `gs://esquerrapp-backup` (singular).
- This machine mojibakes Catalan accents through PowerShell `Set-Content` — use the editor for all file writes.
