# HANDOFF — EsquerrApp

_Rolling document, overwritten each session. Last updated: 2026-07-07 (first session)._

## Current state

- Repo: `c:\DATA\CLAUDE\EsquerrApp` → https://github.com/ScaredMeeseks/EsquerrApp. Firebase project `esquerrapp`. Frontend = GitHub Pages from `main`; APK = CI build on push; rules/functions = `./deploy.sh` in Cloud Shell.
- Full senior-dev review completed; 3-phase overhaul plan approved (see CONTEXT.md summary; full plan at `~/.claude/plans/i-have-another-project-inherited-castle.md`).
- Part A (workflow setup) done this session. Phase 1 implementation in progress on branch `phase1-reliability-security`.

## Session summary (2026-07-07)

1. Reviewed the entire codebase. Attendance-loss root causes: silent fire-and-forget writes, whole-blob clobbers (RPE/users/notifications), `seedMockAvailability` injecting random answers into real clubs, admin reset mirroring demo data, multi-tab persistence failure. Club isolation broken (self-assignable teamId, world-readable club codes, players can delete any team data key). Scalability issues (blob docs, 22 listeners + full re-render, full-scan schedulers). Live bug: training reminder reads `.v` on merge-format docs.
2. Part A: `.firebaserc`, `.gitattributes`, `deploy.sh` guard script, `CLAUDE.md`, `CONTEXT.md`, `HANDOFF.md`, storage.rules wired into firebase.json.

## Pending / next steps

1. Finish Phase 1 (branch `phase1-reliability-security`) and run the §1.8 deploy sequence: backup export → `./deploy.sh functions` → `node scripts/setup-club-codes.js` → `node functions/cleanup-seed.js` dry-run→apply → `./deploy.sh rules` → push to main (CACHE_NAME v18) → test devices per the Phase 1 verification checklist.
2. USER: add `c:\DATA\CLAUDE\EsquerrApp` to the VS Code workspace; first-time Cloud Shell clone: `git clone https://github.com/ScaredMeeseks/EsquerrApp.git ~/EsquerrApp`; create backup bucket once: `gsutil mb -p esquerrapp gs://esquerrapp-backups`.
3. Phase 2 (per-record data model + custom claims) and Phase 3 (performance) in later sessions, each gated on the previous phase's verification checklist.
4. Future item: move hosting to Firebase Hosting (cache-control; fixes GitHub Pages stale-JS problem).
