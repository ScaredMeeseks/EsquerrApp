/* =========================================================
   FCF link parsing — the server's copy
   =========================================================

   This is fcfGrupId() from js/utils.js, duplicated on purpose. The functions
   deploy uploads functions/ and nothing else, so js/ does not exist at
   runtime here; a require would resolve on this machine and fail in
   production, which is the worst of both.

   The copy earns its keep: firestore.rules still carries a back-compat shim
   letting a lead write fcfLinks straight onto the club doc from an old APK,
   so setClubCategories is the only checkpoint that sees the value at all when
   it comes through the callable. A link with no grupId in it cannot be
   fetched, and a lead who is told so at save time does not spend a week
   wondering why the standings are blank.

   test/fcf.test.js runs the SAME input table through both copies and asserts
   they agree — the property that matters is agreement, not each side's
   behaviour in isolation, and two separate test suites would happily drift
   past each other.
   ========================================================= */

/**
 * The `grupId` of a pasted FCF link, as a digit string, or "".
 * Accepts the whole address bar, or the bare id.
 */
function fcfGrupIdOf(url) {
  const s = String(url === undefined || url === null ? "" : url).trim();
  if (/^\d{1,15}$/.test(s)) return s;
  const m = /[?&]grupId=(\d{1,15})\b/.exec(s);
  return m ? m[1] : "";
}

module.exports = {fcfGrupIdOf};
