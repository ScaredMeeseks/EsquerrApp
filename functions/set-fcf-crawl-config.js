#!/usr/bin/env node
/**
 * set-fcf-crawl-config.js — point the FCF crawler at a club's own groups.
 *
 *   node functions/set-fcf-crawl-config.js --club <id>                 # DRY RUN
 *   node functions/set-fcf-crawl-config.js --club <id> --enable --apply
 *   node functions/set-fcf-crawl-config.js --show
 *
 * ⚠ `fcfCrawl/config` is GLOBAL, not per club. It governs what the nightly
 * backfill and the Friday appointments pass crawl for EVERY club. This script
 * derives sensible values from ONE club's links, which is the narrow, cheap
 * starting point — not a statement that only that club matters.
 *
 * ─── What it sets, and why each one ─────────────────────────────────────
 *
 *   enabled     fcfCrawlConfig() reads `c.enabled === true`. Anything else —
 *               false, absent, the string "true" — makes every crawl return
 *               {skipped:"disabled"} and write nothing. On screen that is
 *               indistinguishable from a season nobody has been appointed
 *               for yet, which is how it can sit switched off unnoticed.
 *               Only set by --enable, never implicitly.
 *
 *   seasons     the FCF `temporada` ids, passed straight to
 *               `competicions?temporada=`. Derived from the `temporadaId` in
 *               the club's OWN fcfLinks, because that is the season the lead
 *               actually pasted and therefore the season its grup ids belong
 *               to. A config naming another season builds a queue that
 *               cannot contain this club's groups however long it runs — and
 *               it fails silently, because an empty queue is not an error.
 *
 *   onlyGroups  the club's grup ids. The crawl is otherwise every group of
 *               every senior tier, which fcf.js describes as "days of
 *               crawling". Starting narrow means the first run finishes in
 *               seconds and the result is visible immediately; widening is
 *               another edit of the same document with no deploy.
 *
 * `tiers`, `budgetMs` and `concurrency` are left exactly as they are.
 *
 * ⚠ Changing `seasons`, `tiers` or `onlyGroups` changes fcfScopeKey(), which
 * makes fcfShouldRebuild() discard the stored queue and start from position
 * 0 on the next run. That is what you want here, but it does mean an
 * in-progress backfill loses its place.
 *
 * ─── After this, the crawl still has to RUN ─────────────────────────────
 *
 * Nothing here fetches anything. The schedules are `crawlFcfActas` (nightly,
 * played actas only) and `fcfWeeklyRefs` (0 6,7,8 * * 5 — Friday mornings
 * only). Appointments for a coming fixture are read by the SECOND of those
 * and by nothing else, so a Saturday match appointed on a Thursday will not
 * appear until the following Friday unless the crawl is kicked by hand:
 *
 *   the `runFcfCrawl` callable, superuser only, with
 *   {wantUnplayed: true, weekly: true, restart: true, aggregate: true}
 */
"use strict";

const path = require("path");
const U = require(path.join(__dirname, "..", "js", "utils.js"));

const argv = process.argv.slice(2);
const has = (f) => argv.includes(f);
const val = (f, d) => {
  const i = argv.indexOf(f);
  return i !== -1 && argv[i + 1] ? argv[i + 1] : d;
};
const CLUB = val("--club", "");
const APPLY = has("--apply");
const ENABLE = has("--enable");
const DISABLE = has("--disable");
const ALL_GROUPS = has("--all-groups");
const SHOW = has("--show");

function die(msg) { console.error("\nERROR: " + msg + "\n"); process.exit(1); }
const log = (s) => console.log(s);
const step = (s) => console.log("\n── " + s + " " + "─".repeat(Math.max(0, 56 - s.length)));

const admin = require("firebase-admin");
admin.initializeApp({projectId: "esquerrapp"});
const db = admin.firestore();
const CFG = "fcfCrawl/config";

function dump(label, c) {
  log(`\n  ${label}`);
  log(`    enabled    : ${c.enabled === true}`);
  log(`    seasons    : ${(c.seasons || []).join(", ") || "(none)"}`);
  log(`    tiers      : ${(c.tiers || []).join(", ") || "(default: all senior)"}`);
  log(`    onlyGroups : ${(c.onlyGroups || []).join(", ") || "(none — EVERY group)"}`);
  log(`    budgetMs   : ${c.budgetMs || "(default)"}   concurrency: ${c.concurrency || "(default)"}`);
}

async function main() {
  const cur = (await db.doc(CFG).get()).data() || {};
  step("Current fcfCrawl/config");
  dump("now", cur);
  if (SHOW) return;
  if (!CLUB) die("--club <id> is required (or --show to just read it).");
  if (ENABLE && DISABLE) die("--enable and --disable are mutually exclusive.");

  const clubSnap = await db.collection("clubs").doc(CLUB).get();
  if (!clubSnap.exists) die(`clubs/${CLUB} does not exist.`);
  const club = clubSnap.data() || {};
  const links = club.fcfLinks || {};
  const keys = Object.keys(links);
  if (!keys.length) die(`clubs/${CLUB}.fcfLinks is empty — nothing to derive from.`);

  step(`Deriving from ${club.name || CLUB}`);
  const grupIds = []; const seasons = [];
  keys.forEach((k) => {
    const g = U.fcfGrupId(links[k]);
    const t = /[?&]temporadaId=(\d{1,4})\b/.exec(String(links[k] || ""));
    log(`  ${k}: grupId ${g || "(none)"}   temporadaId ${t ? t[1] : "(none)"}`);
    if (g && grupIds.indexOf(g) === -1) grupIds.push(g);
    if (t && seasons.indexOf(t[1]) === -1) seasons.push(t[1]);
  });
  if (!grupIds.length) die("No grup ids could be parsed from the club's links.");
  if (!seasons.length) {
    die("No temporadaId in any of the club's links, so the season cannot be\n" +
        "    derived. Re-paste a full FCF URL (one carrying ?temporadaId=…)\n" +
        "    in Configuració, or set `seasons` by hand.");
  }

  const next = Object.assign({}, cur, {
    seasons,
    onlyGroups: ALL_GROUPS ? [] : grupIds,
  });
  if (ENABLE) next.enabled = true;
  if (DISABLE) next.enabled = false;

  dump("after", next);

  /* The scope fingerprint decides whether the stored queue survives. Say so
     rather than let a restarted backfill look like a bug next morning. */
  const scopeOf = (c) => [(c.seasons || []).join(","),
    (c.tiers || []).join(","), (c.onlyGroups || []).slice().sort().join(",")].join("|");
  if (scopeOf(cur) !== scopeOf(next)) {
    log("\n  ⚠ scope changed — the stored crawl queue is discarded and both");
    log("    passes restart from position 0 on their next run.");
  }
  if (next.enabled !== true) {
    log("\n  ⚠ enabled is still not true, so every crawl will remain a no-op.");
    log("    Pass --enable if that is not what you want.");
  }

  if (!APPLY) {
    log("\nDRY RUN — nothing was written. Re-run with --apply to commit.");
    return;
  }
  await db.doc(CFG).set(next, {merge: true});
  log("\n  fcfCrawl/config written.");
  log("\nNothing has been FETCHED yet. The next scheduled run will do it:");
  log("  · crawlFcfActas  nightly, PLAYED actas only");
  log("  · fcfWeeklyRefs  Fridays 06/07/08 Madrid — the only pass that reads");
  log("                   appointments for fixtures not yet played");
  log("\nTo do it now, call the runFcfCrawl callable as the superuser with");
  log("  {wantUnplayed: true, weekly: true, restart: true, aggregate: true}");
}

main().catch((e) => die(e.message));
