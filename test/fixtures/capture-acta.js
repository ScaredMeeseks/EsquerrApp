/* Regenerates the acta fixtures next to this file.
 *
 *   node test/fixtures/capture-acta.js
 *
 * An acta page is ~400 KB, most of it the site's i18n payload and two squads'
 * worth of player names. This repo is PUBLIC and GitHub Pages serves it, so
 * committing whole pages would republish a few hundred footballers' names to
 * fix a parser that only ever looks at one box. What is saved instead is a
 * WINDOW of the real bytes — from well before the "Àrbitres" heading to just
 * past the section that follows it. Nothing is rewritten or hand-edited; the
 * middle and the ends are simply absent.
 *
 * The window deliberately starts far enough back to include the role legend
 * that precedes the referee box, so the parser is still shown a realistic
 * run-up rather than a heading with nothing in front of it.
 *
 * That leaves ONE property a window cannot test — that the right box is found
 * in a whole document, past the two decoys elsewhere on the page (the nav's
 * "Àrbitres" link and the same word inside the RSC payload). Neither decoy is
 * followed by `</h3>`, so neither can match; fcf-acta.test.js pins that with a
 * synthetic two-heading document instead of another 400 KB file.
 */
const fs = require("fs");
const path = require("path");

/* Season 2025-26, chosen so they can never change under us: every one of
   these matches has been played, and a closed acta is final. */
const WANTED = [
  ["acta-elit.html", 3784040,
    "Lliga Elit — MANLLEU 3-0 VILAFRANCA. A trio: principal + 2 assistants."],
  ["acta-tercera.html", 3781801,
    "Tercera Catalana — BASE ROSES 1-1 MONELLS. A single referee."],
  ["acta-unassigned.html", 4106975,
    "Season 2026-27, not yet played: 'Sense àrbitres assignats'."],
];

const BEFORE = 2500;
const AFTER = 600;

/* The yellow-card baseline, which the windows cannot carry.
   Every acta draws the same card-sized boxes at the foot of the sheet — they
   are a legend, not anybody's booking — and the crawler watches that count so
   it can say the day the federation starts publishing bookings. 3781800 is
   the one that settles it: `sanciones` records two sanctions on that match
   and its sheet still draws only the legend. */
const CARD_BASELINE = [
  [3784040, "played, Lliga Elit"],
  [3781801, "played, Tercera"],
  [4106975, "unplayed, no referees assigned"],
  [3781800, "played — TWO sanctions recorded against it"],
];

async function main() {
  for (const [name, actaId, note] of WANTED) {
    const url = "https://www.fcf.cat/ca/competicio/acta/" + actaId;
    const html = await (await fetch(url)).text();
    const at = html.indexOf("Àrbitres</h3>");
    if (at === -1) throw new Error("no referee heading in " + actaId);
    const end = html.indexOf("<h3", at + 1);
    const slice = html.slice(
        Math.max(0, at - BEFORE),
        end === -1 ? at + 4000 : end + AFTER);
    const header = "<!-- " + note + "\n     " + url +
      "\n     A window of the real page; see capture-acta.js. -->\n";
    fs.writeFileSync(path.join(__dirname, name), header + slice);
    console.log(name, slice.length, "bytes");
  }

  const {fcfActaCardMarks, FCF_ACTA_LEGEND_MARKS} =
    require(path.join(__dirname, "..", "..", "functions", "fcf.js"));
  console.log("\ncard marks per acta (legend baseline is " +
    FCF_ACTA_LEGEND_MARKS + "):");
  for (const [actaId, note] of CARD_BASELINE) {
    const html = await (await fetch(
        "https://www.fcf.cat/ca/competicio/acta/" + actaId)).text();
    const n = fcfActaCardMarks(html);
    console.log("  " + actaId + "  " + String(n).padStart(3) +
      (n > FCF_ACTA_LEGEND_MARKS ? "  ← MORE THAN THE LEGEND: bookings?" : "") +
      "   (" + note + ")");
  }
}

main();
