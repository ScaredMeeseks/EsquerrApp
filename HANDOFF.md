# HANDOFF — EsquerrApp

_Rolling document, overwritten each session. Last updated: 2026-07-19 (Phase 3b DEPLOYED to production; all checks green)._

## Current state

- Repo: `c:\DATA\CLAUDE\EsquerrApp` → https://github.com/ScaredMeeseks/EsquerrApp. Firebase project `esquerrapp`. Frontend = GitHub Pages from `main`; APK = CI build on push; rules/functions = `./deploy.sh` in Cloud Shell. One-off scripts live in `functions/` (root npm installs are broken on Cloud Shell).
- **Phases 1, 2, 3a AND 3b all DEPLOYED to production.** Frontend **v22** live on Pages. The real club's teamId is literally `default`.
- **Phase 3b deployed 2026-07-19** (branch `phase3b-legacy-retirement`, merged to main): records are the ONLY write path for availability/RPE (dual-writes removed), rules are claims-only (`me()` fallback gone) with the legacy availability/RPE `data/` keys staff-only, `bridgeLegacyPlayerData` deleted, `pruneOldRpe` deletes record docs. Full change list in CONTEXT.md §2026-07-19.
- **Verification (2026-07-19)**: bridge-extinction logging gate was clean before deploy; rules emulator suite (updated for 3b: legacy writes denied, claims-only section) PASSED in Cloud Shell; `check-deploy.js` ALL GREEN — 18/18 claims, reconcile missing=0 on all teams, legacy write inert (bridge gone), v22 live. Deployed WITHOUT the manual two-device UX pass (user time constraint) — that pass is still owed.
- **Legacy availability/RPE `data/` docs are FROZEN but NOT deleted** — they are the rollback net. `migrate-player-data.js --delete-legacy` (guarded dry-run/apply) exists but has deliberately not been run.

## Pending / next steps (IN THIS ORDER)

1. **Fresh APK on the phones** — grab the artifact from the latest GitHub Actions run (the merge push built v22). No urgency (old APKs were already extinct per the gate), but new installs should be v22.
2. **Smoke test / manual UX pass (still owed)** — minimum: player answers a training → green confirmed ring → second device sees it in seconds; un-answer propagates; browser-console probe as player: legacy write to `teams/default/data/fa_training_availability` → permission-denied. Fuller checklist in this file's history (commit `2d25088`, §"deferred test suite"), now against v22.
3. **`--delete-legacy`** — after v22 has been stable for a while (suggest ≥2–4 weeks of normal club activity): `node functions/migrate-player-data.js --delete-legacy` (dry-run, read it) then `--delete-legacy --apply`. Per-doc guard skips any doc whose record collection undercounts the blob. Backup first (bucket is `gs://esquerrapp-backup`, singular — CLAUDE.md corrected).
4. **Phase 3b deferred tail (new features — need their own testing session)**: injuries per-record collection (retire `fa_injuries` blob + notes/zone merge docs, then shrink the allowlist further), notifications collection, read-time fitness derivation, lead-controlled staff-role tightening (product decision).
5. Future: move hosting to Firebase Hosting (cache-control; fixes GitHub Pages stale-JS problem).

## Session summary (2026-07-19)

Implemented AND deployed Phase 3b core (legacy retirement) in one session, gated deploy on bridge extinction instead of the manual pass. Code: db.js record-keys out of SYNCED/MERGE sets + init awaits first record snapshots; app.js pruneOldRpe → role-scoped record deletes; rules claims-only + shrunken allowlist; bridge deleted; migrate script gained guarded `--delete-legacy`; check-deploy inverted (asserts bridge GONE, blob divergence → warning, expects v22); rules tests updated. Deploy hiccup: CLAUDE.md had the backup bucket as `esquerrapp-backups` — real bucket is `esquerrapp-backup` (fixed). Session incident: PowerShell `Set-Content` mojibake'd two files during a version bump (same class as the Mundial gotcha) — caught via git diff, restored, redone with the Edit tool.

## Known trade-offs / notes

- Any straggler old APK now gets permission-denied on availability/RPE writes (no bridge, no allowlist). The logging gate showed none active; if one resurfaces, its writes fail with the error toast, not silently.
- Legacy availability/RPE docs are frozen mirrors: archiveSeason still resets them (harmless), check-deploy compares against them (warnings only, divergence is expected as records get deleted post-freeze). They disappear at step 3.
- `fa_injury_notes`/`fa_injury_zone`/`fa_injuries`/`fa_users`/`fa_staff_notifications` still player-writable by design until the deferred tail lands.
- First login on v22: availability/RPE blobs populate from record snapshots awaited inside `DB.init`; offline with cold cache → empty until connectivity (listeners self-heal).
- Cloud Shell gotchas: `.firebaserc` is tracked — never `rm` it (deploy.sh checks it); scripts run from repo root (`node functions/<name>.js`); read every dry-run before `--apply`; backup bucket is `gs://esquerrapp-backup` (singular).
