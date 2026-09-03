/* The coach-notes RENDERERS, run for real.
 *
 * `js/app.js` has no other coverage: the grab() convention slices a block of
 * source out of it and runs it in a `new Function` over stubs. That is worth
 * the awkwardness here for one reason — these renderers are ~250 lines of
 * string building that no test would otherwise execute, and the failure mode
 * of a mistyped identifier is a BLANK MATCH PAGE for every coach in the club,
 * discovered by a human.
 *
 * What this pins:
 *   - the block parses and every helper it calls exists;
 *   - a note is never rendered for a session that is not staff;
 *   - the leg banner appears exactly when there is an unanswered suggestion;
 *   - "no result recorded" does not render as a 0-0 draw;
 *   - every user-supplied string goes through sanitize().
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const appSrc = fs.readFileSync(path.join(root, 'js', 'app.js'), 'utf8');
const U = require(path.join(root, 'js', 'utils.js'));
/* The REAL module, for its pure half. `PHASES` and `blank()` are what the
   renderers loop over, and a hand-written stub of them is a second opinion
   about how many phases there are — which is exactly what went wrong when
   `live` was added in v213 and the briefing kept rendering two. */
const RealMN = require(path.join(root, 'js', 'match-notes.js'));

function grab(src, from, to, label) {
  const i = src.indexOf(from);
  const j = src.indexOf(to, i);
  assert.ok(i !== -1 && j !== -1, 'marker not found in ' + label + ': ' + from);
  return src.slice(i, j);
}

const CLUB = 'Esquerra';

/* Every app.js helper the block reaches for, stubbed at the seam. Real ones
   where the behaviour matters (sanitize, the utils leg helpers), inert ones
   where it does not (board rendering, position circles). */
function makeRenderers(opts) {
  opts = opts || {};
  const matches = opts.matches || [];
  const notes = opts.notes || {};
  const store = opts.store || {};

  /* The REAL predicate the notes card is gated on, sliced in rather than
     stubbed — only `canEditPage` stays injected, so the sub-role half is a
     knob while the staff half is the shipped rule.

     Stubbing the whole thing would bake in the bug it exists to catch:
     the notes card used to ask `canEditPage('staff-matchday')`, an id
     absent from every sub-role table, and `staffAccess` resolves an
     unknown id to 'edit' — so a fitness coach could edit a coach's notes.
     A flat stub answers whatever the test tells it and never notices.
     calendar-render.test.js uses the real isStaffViewer for exactly this
     reason: stubbing it would have hidden v198 completely. */
  const gate = grab(appSrc,
      '  function isStaffViewer(session) {',
      '  /* The staff-home shortcut attributes', 'js/app.js');

  const logic = gate + grab(appSrc,
      '  /* ═══════════════════════════════════════════════════════════\n' +
      '     Coach match notes, and the anada/tornada briefing.',
      '  function renderMatchDetail()', 'js/app.js');

  const MN = {
    PHASES: RealMN.PHASES,
    phaseKey: RealMN.phaseKey,
    get: (id) => notes[String(id)] || null,
    getOrBlank: (m) => notes[String(m && m.id)] || RealMN.blank(m),
    firstLegId: (id) => (notes[String(id)] || {}).firstLegId || null,
    legAnswered: (id) => {
      const n = notes[String(id)];
      return !!(n && (n.firstLegId || n.legDismissed));
    },
  };

  const factory = new Function(
      'getSession', 'MN', 'findFirstLeg', 'opponentOf', 'getClubName',
      'isOurTeam', 'getMatchEvents', 'calcMatchScore', 't', 'sanitize',
      'tDateShort', 'getUsers', 'getStartingXI', 'posRankGlobal',
      'posCirclesHtmlGlobal', 'tbRoBoardHtml', 'matchScoreboardHtml',
      'matchTimelineHtml', 'canEditPage', 'staffAccess', 'TB', 'localStorage',
      'safeHttpUrl', 'matchSideBadgeHtml',
      logic + '\n return {mnEnabled, mnLegSuggestion, mnLinkedFirstLeg,' +
        ' mnResultLine, mnBriefingHtml, mnNotesCardHtml, mnLegBannerHtml,' +
        ' mnLineupChipsHtml};');

  // `'session' in opts`, not `opts.session || …` — the default must not
  // swallow an explicit `session: null`, which is a case under test.
  const session = ('session' in opts) ? opts.session : {roles: ['staff']};

  return factory(
      () => session,
      MN,
      U.findFirstLeg,
      U.opponentOf,
      () => CLUB,
      (name) => name === CLUB,
      (id) => (opts.events || {})[String(id)] || [],
      (events) => {
        let home = 0; let away = 0;
        events.forEach((e) => {
          if (e.type === 'goal') { if (e.side === 'home') home++; else away++; }
        });
        return {home, away};
      },
      (k) => k,
      // The real escaping rule, minus the DOM: this is what the XSS
      // assertions below actually test.
      (s) => String(s === undefined || s === null ? '' : s)
          .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
          .replace(/"/g, '&quot;'),
      (d) => d || '—',
      () => opts.users || [],
      (id) => (opts.xi || {})[String(id)] || [],
      // Stubbed flat by default (order is irrelevant to most of these), but
      // the squad-ordering test injects the REAL one.
      opts.posRank || (() => 0),
      () => '<span class="pos"></span>',
      (ref) => '<div class="ro-board" data-id="' + ref.boardId + '"></div>',
      (m) => '<div class="sb">' + m.home + ' v ' + m.away + '</div>',
      () => '<div class="tl"></div>',
      () => opts.canEdit !== false,
      () => opts.tacticsAccess || 'edit',
      {ready: () => false, library: () => [], meta: () => null},
      {getItem: (k) => (k === 'fa_matches' ? JSON.stringify(matches) : store[k]) || null},
      // The REAL one — the scheme assertions below are testing it, not a stub.
      U.safeHttpUrl,
      /* Crests are a v118 addition to the scoreline. Stubbed to a marker
         rather than rendered: what these tests are about is the scoreline's
         STRUCTURE, and the only property that matters here is that a badge
         is a child of the name span — the scoreline fitter measures children,
         so one that lands outside the flex row would break the fit silently. */
      (m, side) => '<img class="sb-badge" data-side="' + side + '">');
}

let _id = 500;
function match(o) {
  return {
    id: o.id !== undefined ? o.id : ++_id,
    home: o.at === 'home' ? CLUB : o.rival,
    away: o.at === 'home' ? o.rival : CLUB,
    date: o.date, time: '12:00', score: o.score || null,
    status: 'played', location: '', mapLink: '',
    team: o.team !== undefined ? o.team : 'A',
    category: o.category !== undefined ? o.category : 'amateur',
  };
}

describe('mnEnabled — nothing renders for a player', () => {
  it('is false for a player and true for staff', () => {
    assert.strictEqual(makeRenderers({session: {roles: ['player']}}).mnEnabled(), false);
    assert.strictEqual(makeRenderers({session: {roles: ['staff']}}).mnEnabled(), true);
    assert.strictEqual(makeRenderers({session: null}).mnEnabled(), false);
    assert.strictEqual(makeRenderers({session: {}}).mnEnabled(), false);
  });
});

describe('mnLegBannerHtml', () => {
  const first = match({rival: 'C.F. Gràcia', at: 'home', date: '2026-09-14'});
  const second = match({rival: 'Gracia CF', at: 'away', date: '2026-11-23'});
  const all = [first, second];

  it('offers the suggestion when nothing has been answered', () => {
    const html = makeRenderers({matches: all}).mnLegBannerHtml(second, all);
    assert.ok(html.includes('mn-leg-banner'), 'no banner rendered');
    assert.ok(html.includes('mn-leg-link'));
    assert.ok(html.includes('data-first-id="' + first.id + '"'));
  });

  it('is silent once the coach has LINKED', () => {
    const notes = {[String(second.id)]: {firstLegId: String(first.id)}};
    assert.strictEqual(makeRenderers({matches: all, notes}).mnLegBannerHtml(second, all), '');
  });

  it('is silent once the coach has DECLINED', () => {
    // The whole reason legDismissed exists.
    const notes = {[String(second.id)]: {legDismissed: true}};
    assert.strictEqual(makeRenderers({matches: all, notes}).mnLegBannerHtml(second, all), '');
  });

  it('is silent when there is no candidate', () => {
    assert.strictEqual(makeRenderers({matches: [second]}).mnLegBannerHtml(second, [second]), '');
  });
});

describe('the leg pairs itself when the FEDERATION already knows (v118)', () => {
  /* Two imported fixtures carry an acta id and the rival's own team id, so
     "same rival, venue swapped, earlier date" stops being an inference. There
     is nothing for a coach to confirm, so no banner is offered and the
     briefing links silently.

     Everything else still goes through the question — which is why
     normTeamName and legDismissed are still here. */
  const fcf = (o) => Object.assign(match(o),
      {fcfActaId: o.acta, opponentTeamId: o.rivalId});

  const firstF = fcf({rival: 'GRACIA, C.F.', at: 'home', date: '2026-09-14',
    acta: '111', rivalId: '900'});
  const secondF = fcf({rival: 'GRACIA, C.F.', at: 'away', date: '2026-11-23',
    acta: '222', rivalId: '900'});
  const bothFcf = [firstF, secondF];

  it('offers NO banner for two official fixtures', () => {
    assert.strictEqual(
        makeRenderers({matches: bothFcf}).mnLegBannerHtml(secondF, bothFcf), '');
  });

  it('...and links them anyway, with nothing stored', () => {
    const linked = makeRenderers({matches: bothFcf})
        .mnLinkedFirstLeg(secondF, bothFcf);
    assert.ok(linked, 'the official pair was not linked');
    assert.strictEqual(linked.id, firstF.id);
  });

  it('STILL asks when only one side is official', () => {
    // A friendly against the same club, then the league game. Exactly the
    // ambiguity legDismissed exists for.
    const friendly = match({rival: 'C.F. Gràcia', at: 'home', date: '2026-09-14'});
    const mixed = [friendly, secondF];
    const html = makeRenderers({matches: mixed}).mnLegBannerHtml(secondF, mixed);
    assert.ok(html.includes('mn-leg-banner'), 'the question was skipped');
  });

  it('STILL asks when neither side is official', () => {
    const a = match({rival: 'C.F. Gràcia', at: 'home', date: '2026-09-14'});
    const b = match({rival: 'Gracia CF', at: 'away', date: '2026-11-23'});
    const html = makeRenderers({matches: [a, b]}).mnLegBannerHtml(b, [a, b]);
    assert.ok(html.includes('mn-leg-banner'));
  });

  it('a coach who declined is not overruled by the federation', () => {
    /* He may have declined for a reason the data cannot see. Re-deriving
       over the top of a deliberate "no" is the one thing an automatic link
       must never do. */
    const notes = {[String(secondF.id)]: {legDismissed: true}};
    const R = makeRenderers({matches: bothFcf, notes});
    assert.strictEqual(R.mnLegBannerHtml(secondF, bothFcf), '');
    assert.strictEqual(R.mnLinkedFirstLeg(secondF, bothFcf), null);
  });

  it('a coach\'s own link outranks the derived one', () => {
    const other = fcf({rival: 'GRACIA, C.F.', at: 'home', date: '2026-08-01',
      acta: '333', rivalId: '900'});
    const all3 = [other, firstF, secondF];
    const notes = {[String(secondF.id)]: {firstLegId: String(other.id)}};
    const linked = makeRenderers({matches: all3, notes})
        .mnLinkedFirstLeg(secondF, all3);
    assert.strictEqual(linked.id, other.id);
  });
});

describe('mnResultLine', () => {
  const m = match({rival: 'Gràcia', at: 'away', date: '2026-09-14'});

  it('reads the score from OUR side', () => {
    // We are away; home scored 1, away scored 2 → we won 2-1.
    const events = {[String(m.id)]: [
      {type: 'goal', side: 'home'},
      {type: 'goal', side: 'away'},
      {type: 'goal', side: 'away'},
    ]};
    const html = makeRenderers({events}).mnResultLine(m);
    assert.ok(html.includes('2-1'), html);
    assert.ok(html.includes('mn-res-win'), html);
    assert.ok(html.includes('mn.at_away'), html);
  });

  it('a match with NO result is not a 0-0 draw', () => {
    // The distinction the mn-res-none class exists for: "nobody entered a
    // result" and "it finished goalless" are different statements.
    const html = makeRenderers({}).mnResultLine(m);
    assert.ok(html.includes('mn-res-none'), html);
    assert.ok(!html.includes('mn-res-draw'), html);
    assert.ok(html.includes('—'), html);
  });

  it('a real goalless draw IS a draw', () => {
    const events = {[String(m.id)]: [{type: 'yellow', side: 'home'}]};
    const html = makeRenderers({events}).mnResultLine(m);
    assert.ok(html.includes('mn-res-draw'), html);
    assert.ok(html.includes('0-0'), html);
  });
});

describe('mnBriefingHtml', () => {
  const first = match({rival: 'Gràcia', at: 'home', date: '2026-09-14'});
  const second = match({rival: 'Gràcia', at: 'away', date: '2026-11-23'});
  const all = [first, second];

  it('renders nothing until a first leg is linked', () => {
    assert.strictEqual(makeRenderers({matches: all}).mnBriefingHtml(second, all), '');
  });

  const NOTES = {
    [String(second.id)]: {firstLegId: String(first.id)},
    [String(first.id)]: {
      pre: {text: 'press their number 6'},
      post: {text: 'we sat too deep'},
      videos: [{title: 'Full match', url: 'https://x/y', comment: 'from 12:00'}],
      boards: [{boardId: 'tb_1', name: 'Sortida', tag: 'Salida'}],
    },
  };

  it('is there in full, already OPEN — nothing to click to read it', () => {
    const html = makeRenderers({matches: all, notes: NOTES}).mnBriefingHtml(second, all);
    assert.ok(html.includes('mn-brief'), 'no briefing');
    assert.ok(html.includes('press their number 6'), 'pre notes missing');
    assert.ok(html.includes('we sat too deep'), 'post notes missing');
    assert.ok(html.includes('data-video-url="https://x/y"'), 'video missing');
    assert.ok(html.includes('data-id="tb_1"'), 'board missing');
    // Collapsible, but never collapsed unless the coach asked for it.
    assert.ok(/<details class="mn-brief" open>/.test(html),
        'the briefing must start open: ' + html.slice(0, 120));
  });

  it('stays collapsed once the coach has put it away', () => {
    // A local, per-device UI preference — the button is useless if every
    // match re-opens it.
    const store = {fa_mn_brief_collapsed: '1'};
    const html = makeRenderers({matches: all, notes: NOTES, store})
        .mnBriefingHtml(second, all);
    assert.ok(/<details class="mn-brief">/.test(html),
        'collapsed state not honoured: ' + html.slice(0, 120));
    // Collapsed is not empty: the content is present, just not shown.
    assert.ok(html.includes('press their number 6'));
  });

  it('the header carries only what it is, where, and when', () => {
    /* The score, the rival and the result all live in the left column. A
       header repeating any of them has to be read rather than glanced at. */
    const header = makeRenderers({matches: all, notes: NOTES})
        .mnBriefingHtml(second, all).split('</summary>')[0];
    assert.ok(header.includes('mn.first_leg_summary'), 'no title');
    assert.ok(header.includes('2026-09-14'), 'no date');
    assert.ok(header.includes('mn-brief-caret'), 'no collapse control');
    // Home/away as an icon, from OUR side — `first` is played at home.
    assert.ok(header.includes('🏠'), 'no venue icon: ' + header);
    assert.ok(!header.includes('Gràcia'), 'the rival is back in the header');
    assert.ok(!header.includes('mn-sb'), 'the score is back in the header');
  });

  it('shows a plane for an away first leg', () => {
    const f = match({rival: 'Gràcia', at: 'away', date: '2026-09-14'});
    const s = match({rival: 'Gràcia', at: 'home', date: '2026-11-23'});
    const notes = {[String(s.id)]: {firstLegId: String(f.id)}};
    const header = makeRenderers({matches: [f, s], notes})
        .mnBriefingHtml(s, [f, s]).split('</summary>')[0];
    assert.ok(header.includes('✈️'), 'no away icon: ' + header);
    assert.ok(!header.includes('🏠'));
  });

  const USERS = [{id: 'u1', name: 'Pau', playerNumber: '4'}];
  const STORE = {fa_convocatoria_sent: JSON.stringify({
    [String(first.id)]: {
      players: ['u1'], startingXI: ['u1'],
      videos: [{title: 'Squad clip', url: 'https://x/sent'}],
    },
  }), fa_tactic_match_boards: JSON.stringify({
    [String(first.id)]: [{boardId: 'tb_sent', name: 'Pressing', tag: ''}],
  })};
  const full = () => makeRenderers({
    matches: all, notes: NOTES, users: USERS, store: STORE,
    xi: {[String(first.id)]: ['u1']},
  }).mnBriefingHtml(second, all);

  it('is three columns: what HAPPENED, who PLAYED, what was SAID', () => {
    // The grid only — the last column's chunk would otherwise run on into
    // the media row and this would assert nothing about where things sit.
    const cols = full().split('class="mn-brief-media"')[0]
        .split('class="mn-brief-col"');
    assert.strictEqual(cols.length, 4, 'expected exactly three columns');
    const [, happened, played, said] = cols;
    assert.ok(happened.includes('mn-sb'), 'scoreline not in column 1');
    assert.ok(played.includes('mn-squad'), 'squad not in column 2');
    assert.ok(said.includes('press their number 6'), 'pre notes not in column 3');
    assert.ok(said.includes('we sat too deep'), 'post notes not in column 3');
    // The media moved out of the columns entirely.
    assert.ok(!said.includes('data-video-url'), 'videos still inside a column');
  });

  it('splits the media by AUDIENCE, private first', () => {
    /* The distinction that matters: what only the staff saw, versus what
       went to the squad with the convocatòria. Getting a board into the
       wrong one of those is the mistake this row exists to prevent. */
    const media = full().split('class="mn-brief-media"')[1];
    assert.ok(media, 'no media row');
    const cols = media.split('class="mn-media-col"');
    assert.strictEqual(cols.length, 3, 'expected private and sent: ' + media);
    const [, priv, sent] = cols;
    assert.ok(priv.includes('mn.media_private'), 'private column mislabelled');
    assert.ok(priv.includes('https://x/y'), "the coach's own video is missing");
    assert.ok(priv.includes('data-id="tb_1"'), "the coach's own board is missing");
    assert.ok(sent.includes('mn.media_sent'), 'sent column mislabelled');
    assert.ok(sent.includes('https://x/sent'), 'the convocatòria video is missing');
    assert.ok(sent.includes('data-id="tb_sent"'), 'the convocatòria board is missing');
  });

  it('gives the two media columns different board id prefixes', () => {
    /* The same board can legitimately be both private and sent. Identical
       prefixes would then put duplicate element ids on one page, and
       tbRoBoardHtml builds its ids from the prefix. */
    // Lazy and multiline: the argument list spans lines and contains its own
    // parentheses (`t('mn.media_private')`), so `[^)]*` stops at the first.
    const calls = [...appSrc.matchAll(/mnMediaColHtml\([\s\S]{0,200}?'(mn[a-z]-)'\)/g)]
        .map((mm) => mm[1]);
    assert.strictEqual(calls.length, 2, 'expected two media columns: ' + calls);
    assert.notStrictEqual(calls[0], calls[1],
        'the two media columns share a board id prefix: ' + calls);
  });

  it('omits an empty column rather than leaving a gap', () => {
    const notes = {[String(second.id)]: {firstLegId: String(first.id)}};
    const html = makeRenderers({matches: all, notes}).mnBriefingHtml(second, all);
    // No note, no squad → only the scoreline column, and no media row.
    assert.strictEqual(html.split('class="mn-brief-col"').length, 2,
        'an empty column was rendered: ' + html);
    assert.ok(!html.includes('mn-brief-media'), 'an empty media row was rendered');
  });

  it('colours the scoreline by OUR outcome, in home-away order', () => {
    /* The score stays home-away because it sits between the two club names;
       the COLOUR is ours. We are away in `first`, so 1-2 is a win. */
    const events = {[String(first.id)]: [
      {type: 'goal', side: 'home'},
      {type: 'goal', side: 'away'},
    ]};
    const notes = {[String(second.id)]: {firstLegId: String(first.id)}};
    const draw = makeRenderers({matches: all, notes, events}).mnBriefingHtml(second, all);
    assert.ok(draw.includes('mn-sb-draw'), 'not a draw: ' + draw);
    assert.ok(draw.includes('1 - 1'), 'score not in home-away order: ' + draw);
  });

  it('a first leg with no result is grey, not a green 0-0', () => {
    const notes = {[String(second.id)]: {firstLegId: String(first.id)}};
    const html = makeRenderers({matches: all, notes}).mnBriefingHtml(second, all);
    assert.ok(html.includes('mn-sb-none'), 'not marked as "no result": ' + html);
    assert.ok(!html.includes('mn-sb-draw'));
  });

  it('never offers a way OUT of the second leg', () => {
    /* The coach preparing the return fixture must not be navigated to the
       first leg's page: the whole point is that the information comes to
       him. Nothing here may set detailMatchId. */
    const html = makeRenderers({matches: all, notes: NOTES}).mnBriefingHtml(second, all);
    assert.ok(!html.includes('mn-open-leg'), 'a jump-to-first-leg control came back');
    assert.ok(!html.includes('data-match-id'), 'a navigation hook came back: ' + html);
  });

  it('is READ-ONLY — no event controls anywhere in it', () => {
    // matchTimelineHtml is called with staff=false, and the "+ Event" forms
    // are not built at all. Editing the first leg happens on the first leg.
    const html = makeRenderers({matches: all, notes: NOTES}).mnBriefingHtml(second, all);
    assert.ok(!html.includes('ev-delete'), 'delete-event buttons in the briefing');
    assert.ok(!html.includes('ev-add-btn'), 'add-event button in the briefing');
    assert.ok(!html.includes('starter-toggle'), 'starter toggles in the briefing');
    assert.ok(!html.includes('<textarea'), 'an editable field in the briefing');
  });

  it('survives a linked first leg that has no note of its own', () => {
    // The common case: a coach links the legs but never wrote anything the
    // first time. The result and events are still worth showing.
    const notes = {[String(second.id)]: {firstLegId: String(first.id)}};
    const html = makeRenderers({matches: all, notes}).mnBriefingHtml(second, all);
    assert.ok(html.includes('mn-brief'));
  });

  it('renders nothing when the linked match has been DELETED', () => {
    const notes = {[String(second.id)]: {firstLegId: '999999'}};
    assert.strictEqual(makeRenderers({matches: all, notes}).mnBriefingHtml(second, all), '');
  });
});

describe('mnNotesCardHtml', () => {
  const m = match({rival: 'Gràcia', at: 'home', date: '2026-11-23'});

  it('renders EVERY phase and the lock marker', () => {
    /* Over RealMN.PHASES, not a written-out pre/post pair. v213 added
       `live` and this assertion is what would have caught the card going on
       rendering two of three — the module would have had the phase, the
       editor would have had no column for it, and nothing would have
       errored. */
    const html = makeRenderers({matches: [m]}).mnNotesCardHtml(m);
    assert.ok(html.includes('mn-lock'), 'no staff-only marker');
    RealMN.PHASES.forEach((p) => {
      assert.ok(html.includes('data-mn-phase="' + p + '"'),
          'the notes card has no column for the ' + p + ' phase');
    });
    assert.ok(html.includes('data-mn-match="' + m.id + '"'));
  });

  it('gives each phase its own placeholder, not the plan\'s three times', () => {
    /* `t()` is stubbed to return the key here, so this is really "the
       placeholder is derived from the phase" — which is the bit that was
       an inline `phase === 'post' ? post_ph : pre_ph` and silently gave
       DURANT EL PARTIT the plan's prompt. */
    const html = makeRenderers({matches: [m]}).mnNotesCardHtml(m);
    RealMN.PHASES.forEach((p) => {
      assert.ok(html.includes('mn.' + p + '_ph'),
          'the ' + p + ' box does not have its own placeholder');
    });
  });

  it('hides the boards block from a sub-role that cannot open Pissarra', () => {
    const hidden = makeRenderers({matches: [m], tacticsAccess: 'hidden'}).mnNotesCardHtml(m);
    assert.ok(!hidden.includes('mn-boards-edit'), 'boards leaked to a non-tactics sub-role');
    const shown = makeRenderers({matches: [m], tacticsAccess: 'edit'}).mnNotesCardHtml(m);
    assert.ok(shown.includes('mn-boards-edit'));
  });

  it('renders nothing at all when read-only and empty', () => {
    const html = makeRenderers({
      matches: [m], canEdit: false, tacticsAccess: 'hidden',
    }).mnNotesCardHtml(m);
    assert.strictEqual(html, '');
  });
});

describe('every user-supplied string is escaped', () => {
  const XSS = '<img src=x onerror=alert(1)>';

  /* `!includes('<img')` is the assertion these tests want: a payload that
     survives as escaped TEXT still contains "onerror=", so asserting on that
     alone would fail against correctly-escaped output.
     v118 gave the scoreline club crests, so the renderer now emits `<img>`
     tags of its own. Those are stripped first — by the exact marker the badge
     stub emits, never by a loose `<img[^>]*>` — so a real payload cannot hide
     inside the exemption. */
  const withoutBadges = (html) =>
    html.split('<img class="sb-badge" data-side="home">').join('')
        .split('<img class="sb-badge" data-side="away">').join('');

  it('in a rival name on the leg banner', () => {
    const first = match({rival: XSS, at: 'home', date: '2026-09-14'});
    const second = match({rival: XSS, at: 'away', date: '2026-11-23'});
    const all = [first, second];
    const html = makeRenderers({matches: all}).mnLegBannerHtml(second, all);
    assert.ok(!html.includes('<img'), 'unescaped rival name: ' + html);
  });

  it('in note text, a video title and a video URL', () => {
    const first = match({rival: 'Gràcia', at: 'home', date: '2026-09-14'});
    const second = match({rival: 'Gràcia', at: 'away', date: '2026-11-23'});
    const all = [first, second];
    const notes = {
      [String(second.id)]: {firstLegId: String(first.id)},
      [String(first.id)]: {
        pre: {text: XSS}, post: {text: ''},
        videos: [{title: XSS, url: 'javascript:alert(1)"' + XSS, comment: XSS}],
        boards: [],
      },
    };
    // The BODY builder — that is where note content is rendered now.
    const html = makeRenderers({matches: all, notes}).mnBriefingHtml(second, all);
    // `<img` and a bare `"` are the two ways out — a payload that survives
    // as ESCAPED text still contains the substring `onerror=`, so asserting
    // on that alone would fail on correctly-escaped output.
    assert.ok(!withoutBadges(html).includes('<img'), 'unescaped note content: ' + html);
    assert.ok(!/data-video-url="[^"]*"[^>]*onerror/.test(html),
        'attribute broken out of: ' + html);
  });

  it('in the rival name on the briefing SUMMARY', () => {
    const f = match({rival: XSS, at: 'home', date: '2026-09-14'});
    const s = match({rival: XSS, at: 'away', date: '2026-11-23'});
    const all2 = [f, s];
    const notes = {[String(s.id)]: {firstLegId: String(f.id)}};
    const html = makeRenderers({matches: all2, notes}).mnBriefingHtml(s, all2);
    assert.ok(!withoutBadges(html).includes('<img'), 'unescaped rival on the summary: ' + html);
  });

  it('refuses a javascript: video URL rather than handing it to window.open', () => {
    // sanitize() stops the string escaping the attribute; it does nothing
    // about the SCHEME, and the click handler calls window.open() on it.
    const first = match({rival: 'Gràcia', at: 'home', date: '2026-09-14'});
    const second = match({rival: 'Gràcia', at: 'away', date: '2026-11-23'});
    const all = [first, second];
    const notes = {
      [String(second.id)]: {firstLegId: String(first.id)},
      [String(first.id)]: {
        pre: {text: ''}, post: {text: ''}, boards: [],
        videos: [
          {title: 'bad', url: 'javascript:alert(1)'},
          {title: 'also bad', url: 'data:text/html,<script>x</script>'},
          {title: 'good', url: 'https://youtu.be/abc'},
        ],
      },
    };
    const html = makeRenderers({matches: all, notes}).mnBriefingHtml(second, all);
    assert.ok(!html.includes('javascript:'), 'javascript: URL survived: ' + html);
    assert.ok(!html.includes('data:text/html'), 'data: URL survived: ' + html);
    assert.ok(html.includes('data-video-url="https://youtu.be/abc"'), 'good URL dropped');
    // Refused, but still visible — a silently vanished row hides the mistake.
    assert.ok(html.includes('mn-video-bad'), 'refused URL rendered no label');
    assert.ok(html.includes('bad'));
  });

  it('in the editor textarea and video inputs', () => {
    const m = match({rival: 'Gràcia', at: 'home', date: '2026-11-23'});
    const notes = {[String(m.id)]: {
      pre: {text: XSS}, post: {text: ''},
      videos: [{title: XSS, url: XSS, comment: XSS, phase: 'pre'}],
      boards: [],
    }};
    const html = makeRenderers({matches: [m], notes}).mnNotesCardHtml(m);
    assert.ok(!html.includes('<img'), 'unescaped editor value: ' + html);
  });
});

describe('mnLineupChipsHtml', () => {
  const m = match({rival: 'Gràcia', at: 'home', date: '2026-09-14'});
  const users = [
    {id: 'u1', name: 'Pau', playerNumber: '4'},
    {id: 'u2', name: 'Marc', playerNumber: '9'},
  ];

  const store = {fa_convocatoria_sent: JSON.stringify({
    [String(m.id)]: {players: ['u1', 'u2'], startingXI: ['u2']},
  })};
  const withXi = () => makeRenderers({
    matches: [m], users, store, xi: {[String(m.id)]: ['u2']},
  }).mnLineupChipsHtml(m, users);

  it('is TWO columns — Alineació beside Suplents', () => {
    const html = withXi();
    assert.ok(html.includes('Pau') && html.includes('Marc'));
    assert.ok(html.includes('mn.lineup'), 'no Alineació heading');
    assert.ok(html.includes('mn.subs'), 'no Suplents heading');
    assert.strictEqual(html.split('class="mn-squad-col"').length, 3,
        'expected exactly two squad columns: ' + html);
    // One in each list, not two in one.
    assert.strictEqual((html.match(/conv-count">1</g) || []).length, 2,
        'counts are wrong: ' + html);
  });

  it('lists each column VERTICALLY, goalkeeper first', () => {
    /* posRankGlobal sorts on POS_ORDER, which starts at 'GK' — a team sheet
       is read down the spine of the team. The REAL ranking is injected here:
       a stub would pass whatever order the call-up happened to be in. */
    const squad = [
      {id: 'a', name: 'Striker', playerNumber: '9', position: 'ST'},
      {id: 'b', name: 'Keeper', playerNumber: '1', position: 'GK'},
      {id: 'c', name: 'Centreback', playerNumber: '4', position: 'CB'},
    ];
    const st = {fa_convocatoria_sent: JSON.stringify({
      [String(m.id)]: {players: ['a', 'b', 'c'], startingXI: ['a', 'b', 'c']},
    })};
    const html = makeRenderers({
      matches: [m], users: squad, store: st,
      xi: {[String(m.id)]: ['a', 'b', 'c']},
      posRank: U.posRankGlobal,
    }).mnLineupChipsHtml(m, squad);

    assert.ok(html.includes('mn-players'), 'not a vertical list: ' + html);
    assert.ok(!html.includes('mn-chips'), 'still the old wrapping chip row');
    // Keeper → Centreback → Striker, whatever order they were called up in.
    assert.ok(html.indexOf('Keeper') < html.indexOf('Centreback'),
        'keeper is not first: ' + html);
    assert.ok(html.indexOf('Centreback') < html.indexOf('Striker'),
        'not sorted by position: ' + html);
  });

  it('marks the XI by outline ALONE — no star', () => {
    // In a chip this size the star says the same thing the border does.
    const html = withXi();
    assert.ok(html.includes('mn-chip-xi'), 'no starter marked');
    assert.ok(!html.includes('★'), 'the star came back: ' + html);
  });

  it('puts the XI list first', () => {
    // Marc is the starter and is second in the call-up list.
    const html = withXi();
    assert.ok(html.indexOf('Marc') < html.indexOf('Pau'),
        'the XI is not first: ' + html);
  });

  it('a squad with no XI recorded is one Suplents list, not an empty XI', () => {
    const noXi = makeRenderers({matches: [m], users, store}).mnLineupChipsHtml(m, users);
    assert.ok(!noXi.includes('mn.lineup'), 'empty Alineació heading rendered');
    assert.ok(noXi.includes('mn.subs'));
    assert.ok(!noXi.includes('mn-chip-xi'));
  });

  it('is chips, not the full player rows', () => {
    // Eighteen `.detail-player` rows beside the match you came to look at is
    // a wall, not a briefing.
    const html = withXi();
    assert.ok(!html.includes('detail-player'), 'fell back to full rows');
    assert.ok(html.includes('mn-chip'));
  });

  it('renders nothing when no call-up was ever sent', () => {
    assert.strictEqual(makeRenderers({matches: [m], users}).mnLineupChipsHtml(m, users), '');
  });
});
