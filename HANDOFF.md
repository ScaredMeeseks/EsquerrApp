# HANDOFF — EsquerrApp

_Rolling document, overwritten each session. Last updated: 2026-08-02 (Phase 4 written, NOT yet deployed)._

## Current state

- Repo: `c:\DATA\CLAUDE\EsquerrApp` → https://github.com/ScaredMeeseks/EsquerrApp. Firebase project `esquerrapp`. Frontend = GitHub Pages from `main`; APK = CI build on push; rules/functions = `./deploy.sh` in Cloud Shell. One-off scripts live in `functions/` (root npm installs are broken on Cloud Shell).
- **Production is still on v22** (Phases 1, 2, 3a, 3b).
- **Clubs in production** (verified 2026-08-02, superseding the old "teamId is literally `default`" note — the real club was migrated to a generated id at some point):
  - `nDLJCpJfDvFHs8MnwtzW` — **Esquerra de l'Eixample F.C.**, lead `marna96@gmail.com`, only `amateur` enabled (A: 2 players, B: 11). 14 users, of whom the single "staff" is the lead himself.
  - `lly4GkUxIpBkSgZvzldT` — F.C.Barcelona, lead `test@test.com`, `juvenil` enabled. Test club, 1 user.
  - **3 users still carry `teamId: 'default'` with no matching `clubs/default` doc.** They are already stranded (`navigate()` sends `default` to the join-club screen) — but from Phase 4 on they cannot rejoin either, because the gate will refuse an address that is on no roster list. Identify them before anyone reports being locked out; if any is a real person, add their address to a roster list first.
- **Phase 4 is written and committed but UNDEPLOYED** — branch `phase4-roster-membership` (commit `6434427`), pushed to GitHub. `main` is untouched, so nothing has published: Pages and the APK workflow both only fire on `main`. Full change list in CONTEXT.md §2026-08-02.
- **Legacy availability/RPE `data/` docs remain FROZEN but not deleted** — still the 3b rollback net. `migrate-player-data.js --delete-legacy` still deliberately unrun.

## Phase 4 — what it does

The lead now decides who is staff (per `{category}-{letter}` email list in "Configura el teu club"); staff decide who plays (email list on Registrations). Registration is a **hard gate** against those lists — an unlisted address is refused with a Catalan message telling them to ask their coach. A listed address gets its role, category and team assigned server-side and skips the role-picker. Staff see only their own categories.

Both choices were made deliberately and are strict: unlisted people cannot register, and staff on no list see nothing.

## Pending / next steps (IN THIS ORDER)

1. ~~Rules tests~~ **DONE 2026-08-02: 60 passing** (22 new). They now run on the Windows box — `winget install Microsoft.OpenJDK.21` + `npm i -g firebase-tools` were installed, so `cd test && npm test` works locally against the fake project `demo-esquerrapp`. No Cloud Shell round-trip needed for rules changes any more.
2. ~~`prefill-rosters.js` dry-run~~ **DONE 2026-08-02: all members placed, UNPLACEABLE 0.** Verified the counts are real (13 players across amateur-A/B; 0 staff is correct — the club's only staff user is the lead, who is skipped). Re-run the dry-run if anyone joins before the deploy.
3. `node functions/prefill-rosters.js --apply` ← **NEXT**
4. **`./deploy.sh all`** in Cloud Shell — rules + functions. Confirm the "Deploying to" header says `esquerrapp`. `onRosterWritten` is a brand-new function; nothing gets deleted this time.
5. **Frontend**: `sw.js` CACHE_NAME is already bumped to `esquerrapp-v23`. Merge `phase4-roster-membership` into `main` and push (Pages + APK build). **Must come after step 4** or the new UI writes into a ruleset that rejects it.
6. **Fresh APK on the phones** — old APKs still show the self-select Staff role screen and have no gate.
7. **`node functions/check-deploy.js`** — now `[1b/5]` also asserts every member is on a list, every staff member has categories, and the `cats` claim matches the doc.

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
