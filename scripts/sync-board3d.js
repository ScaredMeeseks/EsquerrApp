#!/usr/bin/env node
/**
 * Copy js/board3d.js into functions/private/, which is the only place the
 * deployed function can read it from.
 *
 * WHY A COPY AT ALL. `firebase deploy --only functions` uploads the
 * functions/ directory and nothing else, so a module that lives in js/ is
 * simply not there at runtime. The alternative — bundling the source into
 * index.js as a string — would put 76 KB of JavaScript inside a JavaScript
 * literal, where every edit is an escaping problem.
 *
 * WHY A COPY IS DANGEROUS, and what stops it. A duplicate rots: edit the
 * real one, forget this, and the server serves a board two versions old with
 * nothing failing. `test/board3d-private.test.js` compares the two byte for
 * byte, so the suite goes red the moment they drift — and the message names
 * this script. Both deploy scripts run it before deploying functions.
 *
 * Run:  node scripts/sync-board3d.js          (copy, report)
 *       node scripts/sync-board3d.js --check  (verify only, exit 1 on drift)
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const SRC = path.join(ROOT, 'js', 'board3d.js');
const DST = path.join(ROOT, 'functions', 'private', 'board3d.js');

const check = process.argv.includes('--check');

if (!fs.existsSync(SRC)) {
  console.error('sync-board3d: js/board3d.js is missing');
  process.exit(1);
}
const src = fs.readFileSync(SRC);
const same = fs.existsSync(DST) && fs.readFileSync(DST).equals(src);

if (check) {
  if (same) {
    console.log('sync-board3d --check: functions/private/board3d.js is current');
    process.exit(0);
  }
  console.error('sync-board3d --check: functions/private/board3d.js is STALE.\n' +
      '  The deployed 3D board would be a different version from the one in\n' +
      '  js/. Run:  node scripts/sync-board3d.js');
  process.exit(1);
}

if (same) {
  console.log('sync-board3d: already current');
} else {
  fs.mkdirSync(path.dirname(DST), {recursive: true});
  /* Byte-for-byte, never a text round-trip: this file is compared with
     Buffer.equals, and re-encoding it on a Windows machine would rewrite
     every line ending and fail the very check it exists to pass. */
  fs.writeFileSync(DST, src);
  console.log('sync-board3d: copied ' + src.length + ' bytes to functions/private/');
}
