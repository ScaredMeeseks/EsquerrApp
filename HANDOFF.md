# HANDOFF — EsquerrApp

_Rolling document, overwritten each session. Last updated: 2026-07-19 (Phase 3b implemented on branch `phase3b-legacy-retirement`, NOT yet deployed)._

## Current state

- Repo: `c:\DATA\CLAUDE\EsquerrApp` → https://github.com/ScaredMeeseks/EsquerrApp. Firebase project `esquerrapp`. Frontend = GitHub Pages from `main`; APK = CI build on push; rules/functions = `./deploy.sh` in Cloud Shell. One-off scripts live in `functions/` (root npm installs are broken on Cloud Shell).
- **Production**: Phases 1, 2, 3a + the v21 record-listener fix — all deployed and verified (adversarial audit + rules emulator suite green, 2026-07-11). Frontend **v21** live. The real club's teamId is literally `default`.
- **Phase 3b (legacy retirement) IMPLEMENTED, not deployed** — branch `phase3b-legacy-retirement`, frontend **v22**. Done at the user's request WITHOUT the manual UX pass; risk contained by (a) the deploy's step-1 bridge-extinction gate, (b) legacy blob docs kept (`--delete-legacy` written but NOT run — rollback stays a redeploy). Full change list in CONTEXT.md §2026-07-19. In short: availability/RPE dual-writes removed (records are the only write path), `me()` rules fallback removed (claims-only), legacy `data/` keys staff-only, `bridgeLegacyPlayerData` deleted, `pruneOldRpe` deletes record docs, check-deploy inverted bridge check + v22.
- **DEPLOY GATE (step 1, non-negotiable)**: Cloud Logging must show ≈0 `bridgeLegacyPlayerData` invocations (old APKs extinct). If it shows recent invocations, DO NOT deploy — old devices would silently stop syncing.

## Pending / next steps (IN THIS ORDER)

1. **Phase 3b deploy (Cloud Shell)** — the command block was delivered 2026-07-19 (also reconstructible from CONTEXT.md deploy order): gate check → backup → `./deploy.sh functions` (CONFIRM the bridge deletion prompt) → `migrate-player-data.js --apply` + `--verify` → `./deploy.sh rules` → `cd ~/EsquerrApp/test && npm test` (rules suite, updated for 3b) → merge `phase3b-legacy-retirement` to main + push (frontend v22 + APK) → `node functions/check-deploy.js`.
2. **Manual UX pass (still owed)** — the deferred two-device checklist (see git history of this file, §"deferred test suite", commit `2d25088`), now against v22. Highest-value items post-3b: two players answering concurrently, un-answer propagating cross-device, airplane-mode ack flow, console probe that a player can NO LONGER write `data/fa_training_availability`, forced scheduler run, archiveSeason on a test team.
3. **`--delete-legacy`** — only after v22 has been stable for a while: `node functions/migrate-player-data.js --delete-legacy` (dry-run) then `--apply`. Per-doc guard skips any doc whose record collection undercounts the blob.
4. **Phase 3b deferred tail (new features, need their own testing)**: injuries per-record collection (retire `fa_injuries` blob + notes/zone merge docs), notifications collection, read-time fitness derivation, lead-controlled staff-role tightening (product decision).
5. Future: move hosting to Firebase Hosting (cache-control; fixes GitHub Pages stale-JS problem).

## Session summary (2026-07-19)

Implemented Phase 3b core on `phase3b-legacy-retirement` (user had no time for testing; scope deliberately = removal half only). js/db.js: 3 record-backed keys out of SYNCED/MERGE sets, init awaits first record snapshots (replaces legacy-doc preload), record caches flushed on team switch. js/app.js: pruneOldRpe → record deletes (role-scoped); dual-write helpers now write a local-only cache. Rules: claims-only helpers, allowlist minus availability/RPE. Functions: bridge deleted; migrate script gained guarded `--delete-legacy`; check-deploy expects v22, asserts the bridge is GONE, migration mismatches → warnings. Tests: legacy-write flips to denied + new claims-only suite. sw.js v22. Incident during the session: a PowerShell `Set-Content` bump mojibake'd `check-deploy.js`/`sw.js` (same class as the Mundial gotcha) — caught via git diff, restored, redone with the Edit tool; final diff verified mojibake-free and CRLF-clean.

## Known trade-offs / notes

- Old APKs (if ANY remain) break silently on the 3b rules: legacy writes get permission-denied and no bridge materializes records. That's what the deploy gate is for.
- Legacy availability/RPE `data/` docs are FROZEN, not deleted: archiveSeason still resets them (harmless), check-deploy compares against them (warnings only). They disappear at step 3 (`--delete-legacy`).
- `fa_injury_notes`/`fa_injury_zone`/`fa_injuries`/`fa_users`/`fa_staff_notifications` still player-writable by design until the deferred tail lands.
- First login on v22 populates availability/RPE from record snapshots awaited inside `DB.init` — if Firestore is unreachable AND nothing is cached, blobs start empty until connectivity (listeners self-heal).
- Cloud Shell gotchas: `.firebaserc` is tracked — never `rm` it (deploy.sh checks it); scripts must run from repo root (`node functions/<name>.js`); read every dry-run before `--apply`; `firebase deploy --only functions` will PROMPT to delete `bridgeLegacyPlayerData` — answer yes (that deletion is the point).
