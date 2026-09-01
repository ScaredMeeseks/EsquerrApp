/* The forecast on a session, from XWeather's payload to the strip.
 *
 * Pure logic, no emulator and no API key: `npm run test:weather`.
 *
 * Two rules here are load-bearing and neither is visible from the code that
 * draws the strip:
 *
 *  1. `rainPct` is a share of the SESSION, not a probability. XWeather
 *     publishes `pop`, a probability per hour; the app promises "es preveu
 *     pluja durant el 50% de l'entrenament". summarise() converts one into the
 *     other by weighting each hourly period by the MINUTES it overlaps the
 *     session — so an 18:00–19:30 session whose first hour is wet is 67%, not
 *     50%. Get that wrong and the number still looks plausible on screen,
 *     which is why it is pinned here rather than eyeballed.
 *
 *  2. Nothing is fetched more than 3 days out, and nothing is refreshed once
 *     an event has started. wxDue() owns the first; the second lives in
 *     scheduledWeatherSync and is asserted through the render side, which must
 *     keep drawing a frozen forecast for a session in the past.
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const wx = require('../functions/weather');

const src = fs.readFileSync(path.join(__dirname, '..', 'js', 'app.js'), 'utf8');

function grab(from, to) {
  const i = src.indexOf(from);
  const j = src.indexOf(to, i);
  assert.ok(i !== -1 && j !== -1, 'marker not found in js/app.js: ' + from);
  return src.slice(i, j);
}

const sanitize = (s) => String(s === undefined || s === null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

/* ── functions/weather.js ─────────────────────────────────── */

describe('coordsFromMapLink — where is this played', () => {
  it('reads the ?query= form fcfMapsLink writes', () => {
    // The exact string functions/fcf.js stores on every imported fixture.
    const c = wx.coordsFromMapLink(
        'https://www.google.com/maps/search/?api=1&query=41.3874,2.1686');
    assert.deepStrictEqual(c, {lat: 41.3874, lon: 2.1686});
  });

  it('reads a pasted maps address bar (@lat,lon)', () => {
    const c = wx.coordsFromMapLink(
        'https://www.google.com/maps/place/Camp/@41.4,2.17,17z/data=!3m1');
    assert.deepStrictEqual(c, {lat: 41.4, lon: 2.17});
  });

  it('reads the !3d/!4d embed form', () => {
    const c = wx.coordsFromMapLink('https://maps.google.com/x!3d-33.87!4d151.21');
    assert.deepStrictEqual(c, {lat: -33.87, lon: 151.21});
  });

  it('gives up on a share.google short link', () => {
    /* TRAINING_DEFAULT_MAP is exactly this shape. It is an opaque id only
       Google can resolve, so the club's home coordinates are the answer and
       a null here is what routes the caller to them. */
    assert.strictEqual(
        wx.coordsFromMapLink('https://share.google/pfbMOc661aRSNlynk'), null);
  });

  it('refuses 0,0 — FCF says "unknown" that way', () => {
    assert.strictEqual(wx.coordsFromMapLink(
        'https://www.google.com/maps/search/?api=1&query=0,0'), null);
  });

  it('refuses coordinates off the planet', () => {
    assert.strictEqual(wx.coordsFromMapLink('?query=91.0,2.0'), null);
    assert.strictEqual(wx.coordsFromMapLink('?query=41.0,181.0'), null);
  });

  it('survives nothing at all', () => {
    assert.strictEqual(wx.coordsFromMapLink(''), null);
    assert.strictEqual(wx.coordsFromMapLink(null), null);
    assert.strictEqual(wx.coordsFromMapLink(undefined), null);
  });
});

describe('isShortMapLink — worth a redirect hop?', () => {
  it('accepts the shorteners the Maps app actually produces', () => {
    /* maps.app.goo.gl is the Share button's output, so it is the link an
       ordinary lead pastes. Treating it as unusable made the common case
       the broken one. */
    assert.strictEqual(wx.isShortMapLink('https://maps.app.goo.gl/abc123'), true);
    assert.strictEqual(wx.isShortMapLink('https://goo.gl/maps/abc'), true);
    assert.strictEqual(wx.isShortMapLink('https://g.co/kgs/abc'), true);
  });

  it('REFUSES share.google — verified unresolvable, not assumed', () => {
    /* It 302s to google.com/share.google?q=…, a JS-driven page with no
       coordinate pair in the HTML. A redirect hop would cost a request and
       return nothing, and pretending otherwise would silence the warning
       that is the only thing telling a lead to fix the link. */
    assert.strictEqual(wx.isShortMapLink('https://share.google/pfbMOc661aRSNlynk'), false);
  });

  it('ignores anything that is not one of those hosts', () => {
    assert.strictEqual(wx.isShortMapLink('https://example.com/x'), false);
    assert.strictEqual(wx.isShortMapLink('Escola Industrial'), false);
    assert.strictEqual(wx.isShortMapLink(''), false);
    assert.strictEqual(wx.isShortMapLink(null), false);
  });
});

describe('coordsFromLink — the resolved-short-link map', () => {
  const SHORT = 'https://maps.app.goo.gl/abc123';
  const resolved = new Map([[SHORT, {lat: 41.4288862, lon: 2.1905122}]]);

  it('prefers coordinates already IN the url over the map', () => {
    const long = 'https://www.google.com/maps/search/?api=1&query=41.38,2.16';
    const r = new Map([[long, {lat: 1, lon: 1}]]);
    assert.deepStrictEqual(wx.coordsFromLink(long, r), {lat: 41.38, lon: 2.16});
  });

  it('falls back to the resolved map for a short link', () => {
    assert.deepStrictEqual(wx.coordsFromLink(SHORT, resolved),
        {lat: 41.4288862, lon: 2.1905122});
  });

  it('is null for a short link nobody resolved', () => {
    assert.strictEqual(wx.coordsFromLink(SHORT, new Map()), null);
    assert.strictEqual(wx.coordsFromLink(SHORT, null), null);
  });

  it('feeds the schedule index, so a goo.gl club is located', () => {
    /* The C.E. Sant Andreu case exactly: every schedule link a short one.
       Before the redirect hop this club got noCoords on every session. */
    const club = {schedules: {'amateur-A': {
      training: [{day: 'tue', location: 'Narcís Sala', link: SHORT}],
    }}};
    const bare = wx.scheduleCoordIndex(club);
    assert.strictEqual(bare.any, null, 'unresolved: nothing to index');
    const idx = wx.scheduleCoordIndex(club, resolved);
    assert.deepStrictEqual(idx.any, {lat: 41.4288862, lon: 2.1905122});
    assert.deepStrictEqual(idx.place.get(wx.placeKey('Narcís Sala')),
        {lat: 41.4288862, lon: 2.1905122});
  });
});

describe('the two SHORT_MAP_HOSTS lists agree', () => {
  it('js/app.js mirrors functions/weather.js', () => {
    /* functions/ deploys alone so js/ cannot require it. If they drift, the
       client warns amber about a link the server resolves perfectly well —
       or stays silent about one it cannot. */
    const code = grab('  var SHORT_MAP_HOSTS = [', '\n\n  function _refreshTeamSetupVenue');
    const client = new Function(code + '\n return SHORT_MAP_HOSTS;')();
    assert.deepStrictEqual(client.slice().sort(), wx.SHORT_MAP_HOSTS.slice().sort());
  });

  it('and so do the two predicates', () => {
    const code = grab('  function isResolvableShortLink(v) {', '\n\n  function _refreshTeamSetupVenue');
    const hosts = grab('  var SHORT_MAP_HOSTS = [', '\n\n  function isResolvableShortLink');
    const isShort = new Function(hosts + '\n' + code +
      '\n return isResolvableShortLink;')();
    [
      'https://maps.app.goo.gl/abc', 'https://goo.gl/maps/x', 'https://g.co/kgs/x',
      'https://share.google/x', 'https://example.com/x', '', 'not a url',
    ].forEach((u) => {
      assert.strictEqual(isShort(u), wx.isShortMapLink(u), u);
    });
  });
});

describe('coordsOf — a club document is years old', () => {
  it('takes numbers', () => {
    assert.deepStrictEqual(wx.coordsOf({lat: 41.4, lon: 2.1}),
        {lat: 41.4, lon: 2.1});
  });
  it('takes the same values as strings', () => {
    // Written by an older client, or by hand in the console.
    assert.deepStrictEqual(wx.coordsOf({lat: '41.4', lon: '2.1'}),
        {lat: 41.4, lon: 2.1});
  });
  it('skips a half-written one rather than throwing', () => {
    assert.strictEqual(wx.coordsOf({lat: 41.4}), null);
    assert.strictEqual(wx.coordsOf({lat: 'x', lon: 'y'}), null);
    assert.strictEqual(wx.coordsOf(null), null);
    assert.strictEqual(wx.coordsOf('41.4,2.1'), null);
  });
});

describe('scheduleCoordIndex — the grounds a lead already configured', () => {
  const LINK_A = 'https://www.google.com/maps/place/x/@41.3874,2.1686,17z';
  const LINK_B = 'https://www.google.com/maps/search/?api=1&query=41.98,2.82';

  /* `cadet-A` is FIRST on purpose, so `any` resolves to Girona (B) while the
     Escola Industrial ground is A. Without that the two fallbacks agree and
     every test below passes whether or not the ground-name step exists —
     which is exactly what a mutation run caught. */
  const CLUB = {
    schedules: {
      'cadet-A': {
        training: [{day: 'wed', time: '18:00', location: 'Camp de Girona', link: LINK_B}],
        homeGame: {day: 'sun', time: '10:00', location: '', link: ''},
      },
      'amateur-A': {
        training: [
          {day: 'tue', time: '21:00', location: 'Escola Industrial', link: LINK_A},
          {day: 'thu', time: '21:00', location: 'Escola Industrial', link: LINK_A},
        ],
        homeGame: {day: 'sat', time: '18:00', location: 'Escola Industrial', link: LINK_A},
      },
    },
  };

  it('indexes each ground by name, squad and first-seen', () => {
    const idx = wx.scheduleCoordIndex(CLUB);
    assert.deepStrictEqual(idx.place.get(wx.placeKey('Escola Industrial')),
        {lat: 41.3874, lon: 2.1686});
    assert.deepStrictEqual(idx.place.get(wx.placeKey('Camp de Girona')),
        {lat: 41.98, lon: 2.82});
    assert.deepStrictEqual(idx.squad.get('cadet-A'), {lat: 41.98, lon: 2.82});
    assert.deepStrictEqual(idx.squad.get('amateur-A'), {lat: 41.3874, lon: 2.1686});
    assert.deepStrictEqual(idx.any, {lat: 41.98, lon: 2.82});
  });

  it('reads the homeGame link too, not only the training slots', () => {
    const idx = wx.scheduleCoordIndex({schedules: {'amateur-A': {
      training: [{day: 'tue', location: 'Escola Industrial', link: ''}],
      homeGame: {day: 'sat', location: 'Camp Nou', link: LINK_B},
    }}});
    assert.deepStrictEqual(idx.squad.get('amateur-A'), {lat: 41.98, lon: 2.82});
  });

  it('skips links that carry no coordinates rather than storing nulls', () => {
    /* The app's own TRAINING_DEFAULT_MAP is a share.google short link, and
       an unconfigured squad has an empty box. Neither is an error; both are
       simply absent from the index. */
    const idx = wx.scheduleCoordIndex({schedules: {'amateur-A': {
      training: [
        {day: 'tue', location: 'Escola Industrial',
          link: 'https://share.google/pfbMOc661aRSNlynk'},
        {day: 'thu', location: 'Escola Industrial', link: ''},
      ],
    }}});
    assert.strictEqual(idx.any, null);
    assert.strictEqual(idx.place.size, 0);
    assert.strictEqual(idx.squad.size, 0);
  });

  it('survives a club with no schedules at all', () => {
    [{}, {schedules: {}}, null].forEach((c) => {
      const idx = wx.scheduleCoordIndex(c);
      assert.strictEqual(idx.any, null);
      assert.strictEqual(idx.place.size, 0);
    });
  });

  describe('coordsForRow — most specific answer wins', () => {
    const idx = wx.scheduleCoordIndex(CLUB);
    const HOME = {lat: 1, lon: 1};
    const A = {lat: 41.3874, lon: 2.1686};
    const B = {lat: 41.98, lon: 2.82};

    it('1. prefers the row\'s OWN link — an away fixture', () => {
      /* The whole point of the order: a cadet playing away in Girona must
         not be forecast at the club's own ground. */
      const row = {category: 'cadet', team: 'A', location: 'Camp de Salt',
        mapLink: 'https://www.google.com/maps/search/?api=1&query=41.97,2.79'};
      assert.deepStrictEqual(wx.coordsForRow(row, idx, HOME),
          {lat: 41.97, lon: 2.79});
    });

    it('2. falls back to the same ground NAME, across squads', () => {
      /* `cadet-B` has no schedule of its own and its short link is
         unreadable, but the AMATEURS configured this ground. The answer must
         be A — B is what every weaker fallback would give. */
      const row = {category: 'cadet', teams: ['B'], location: 'Escola Industrial',
        mapLink: 'https://share.google/pfbMOc661aRSNlynk'};
      assert.deepStrictEqual(wx.coordsForRow(row, idx, HOME), A);
    });

    it('2b. matches a ground name through accents and punctuation', () => {
      const row = {category: 'cadet', teams: ['B'], location: 'escola  industrial'};
      assert.deepStrictEqual(wx.coordsForRow(row, idx, HOME), A);
    });

    it('3. falls back to where THIS squad trains', () => {
      // Location blank, so the ground name says nothing — but amateur-A's
      // own schedule does, and it is not the first-seen ground.
      const row = {category: 'amateur', teams: ['A'], location: ''};
      assert.deepStrictEqual(wx.coordsForRow(row, idx, HOME), A);
    });

    it('3b. reads `team` on a match and `teams` on a training', () => {
      assert.deepStrictEqual(
          wx.coordsForRow({category: 'amateur', team: 'A'}, idx, HOME), A);
      assert.deepStrictEqual(
          wx.coordsForRow({category: 'amateur', teams: ['A']}, idx, HOME), A);
    });

    it('4. falls back to any configured ground — the one-pitch club', () => {
      // Unknown squad, unrecognised location: first-seen is all that is left.
      const row = {category: 'benjami', teams: ['C'], location: 'un lloc nou'};
      assert.deepStrictEqual(wx.coordsForRow(row, idx, HOME), B);
    });

    it('5. uses homeCoords only when NO link anywhere is readable', () => {
      const bare = wx.scheduleCoordIndex({schedules: {'amateur-A': {
        training: [{day: 'tue', location: 'x',
          link: 'https://share.google/pfbMOc661aRSNlynk'}],
      }}});
      assert.deepStrictEqual(
          wx.coordsForRow({category: 'amateur', teams: ['A']}, bare, HOME), HOME);
    });

    it('is null when there is nothing anywhere', () => {
      const bare = wx.scheduleCoordIndex({});
      assert.strictEqual(wx.coordsForRow({category: 'x'}, bare, null), null);
      assert.strictEqual(wx.coordsForRow(null, bare, null), null);
    });
  });
});

describe('coordKey — one call per ground', () => {
  it('collapses a club\'s pitch and its home fixtures onto one key', () => {
    assert.strictEqual(wx.coordKey({lat: 41.38741, lon: 2.16862}),
        wx.coordKey({lat: 41.38739, lon: 2.16858}));
  });
  it('keeps two different towns apart', () => {
    assert.notStrictEqual(wx.coordKey({lat: 41.38, lon: 2.16}),
        wx.coordKey({lat: 41.98, lon: 2.82}));
  });
});

describe('wxCondOf — XWeather codes into the seven the UI can draw', () => {
  const cond = (coded, clouds) =>
    wx.wxCondOf({weatherPrimaryCoded: coded, cloudsCoded: clouds});

  it('maps thunder to storm', () => {
    assert.strictEqual(cond('S:L:T'), 'storm');
    assert.strictEqual(cond('::TO'), 'storm');
  });
  it('maps every frozen type to snow', () => {
    ['S', 'SW', 'BS', 'WM', 'IP', 'ZR', 'RS'].forEach((ty) => {
      assert.strictEqual(cond(':L:' + ty), 'snow', ty);
    });
  });
  it('maps rain and hail to rain', () => {
    assert.strictEqual(cond('C:L:RW'), 'rain');
    assert.strictEqual(cond('::R'), 'rain');
    assert.strictEqual(cond('::A'), 'rain');
  });
  it('maps fog, mist and haze to fog', () => {
    assert.strictEqual(cond('::F'), 'fog');
    assert.strictEqual(cond('::BR'), 'fog');
    assert.strictEqual(cond('::H'), 'fog');
  });
  it('falls through to the cloud cover when there is no weather', () => {
    // "::FW" is XWeather's way of saying "nothing but some cloud".
    assert.strictEqual(cond('::FW', 'FW'), 'sun');
    assert.strictEqual(cond('', 'CL'), 'sun');
    assert.strictEqual(cond('', 'SC'), 'cloud');
    assert.strictEqual(cond('', 'BK'), 'overcast');
    assert.strictEqual(cond('', 'OV'), 'overcast');
  });
  it('degrades an unknown code to cloud instead of throwing', () => {
    // The vendor adds codes. A new one must render as an ordinary hour, not
    // blank the strip for everyone.
    assert.strictEqual(cond('::ZZ'), 'cloud');
    assert.strictEqual(cond('', 'ZZ'), 'cloud');
    assert.strictEqual(wx.wxCondOf({}), 'cloud');
    assert.strictEqual(wx.wxCondOf(null), 'cloud');
  });
  it('only ever returns something the UI can draw', () => {
    ['S:L:T', '::R', '::F', '::FW', '::ZZ'].forEach((c) => {
      assert.ok(wx.WX_CONDS.includes(wx.wxCondOf({weatherPrimaryCoded: c})), c);
    });
  });
});

describe('isWetPeriod — what counts as rain', () => {
  it('is the WET_POP threshold and nothing else', () => {
    assert.strictEqual(wx.isWetPeriod({pop: wx.WET_POP}), true);
    assert.strictEqual(wx.isWetPeriod({pop: wx.WET_POP - 1}), false);
  });
  it('treats a missing pop as dry', () => {
    assert.strictEqual(wx.isWetPeriod({}), false);
    assert.strictEqual(wx.isWetPeriod({pop: null}), false);
  });
});

describe('overlapMins — an hour is only partly the session', () => {
  const p = (iso) => ({dateTimeISO: iso});
  // 18:00–19:30 UTC, so the arithmetic is readable without a timezone in it.
  const S = Date.parse('2026-03-04T18:00:00Z');
  const E = Date.parse('2026-03-04T19:30:00Z');

  it('counts a whole hour inside the window', () => {
    assert.strictEqual(wx.overlapMins(p('2026-03-04T18:00:00Z'), S, E), 60);
  });
  it('clamps the hour the session ends in', () => {
    assert.strictEqual(wx.overlapMins(p('2026-03-04T19:00:00Z'), S, E), 30);
  });
  it('ignores an hour outside the window entirely', () => {
    assert.strictEqual(wx.overlapMins(p('2026-03-04T20:00:00Z'), S, E), 0);
    assert.strictEqual(wx.overlapMins(p('2026-03-04T17:00:00Z'), S, E), 0);
  });
  it('is 0 for an unparseable stamp', () => {
    assert.strictEqual(wx.overlapMins(p('not a date'), S, E), 0);
    assert.strictEqual(wx.overlapMins({}, S, E), 0);
  });
});

describe('summarise — the session line', () => {
  const S = Date.parse('2026-03-04T18:00:00Z');
  const E = Date.parse('2026-03-04T19:30:00Z');

  const period = (hour, over) => Object.assign({
    dateTimeISO: '2026-03-04T' + hour + ':00:00Z',
    weatherPrimaryCoded: '::FW',
    cloudsCoded: 'FW',
    pop: 0,
    windSpeedMPS: 2,
    tempC: 12,
  }, over || {});

  it('weights the rain share by MINUTES, not by period count', () => {
    /* THE test of rule 1. 18:00 is wet (60 min in the window), 19:00 is dry
       (30 min in), so 60/90 = 67%. Counting periods would say 50% — a
       plausible-looking number that is simply not what the app promises. */
    const out = wx.summarise([
      period('18', {pop: 80, weatherPrimaryCoded: 'L:L:RW'}),
      period('19', {pop: 10}),
    ], S, E);
    assert.strictEqual(out.rainPct, 67);
  });

  it('is 100% when every overlapping hour is wet', () => {
    const out = wx.summarise([
      period('18', {pop: 90, weatherPrimaryCoded: 'L:L:R'}),
      period('19', {pop: 90, weatherPrimaryCoded: 'L:L:R'}),
    ], S, E);
    assert.strictEqual(out.rainPct, 100);
  });

  it('is 0% when the rain is outside the session', () => {
    const out = wx.summarise([
      period('18'),
      period('19'),
      period('20', {pop: 100, weatherPrimaryCoded: 'D:H:R'}),
    ], S, E);
    assert.strictEqual(out.rainPct, 0);
  });

  it('takes the MAX wind, not the mean — the gust moves the ball', () => {
    /* The gust is FIRST and the calm hour last, deliberately. With them the
       other way round "max", "mean" and "whatever the last period said" all
       produce 11 and the assertion proves nothing. */
    const out = wx.summarise([
      period('18', {windSpeedMPS: 11}),
      period('19', {windSpeedMPS: 2}),
    ], S, E);
    assert.strictEqual(out.windMs, 11);
  });

  it('takes the overlap-weighted MEAN temperature', () => {
    // 12° for 60 min, 18° for 30 min → 14, not 15.
    const out = wx.summarise([
      period('18', {tempC: 12}),
      period('19', {tempC: 18}),
    ], S, E);
    assert.strictEqual(out.tempC, 14);
  });

  it('lets a storm in the last half hour win the condition', () => {
    const out = wx.summarise([
      period('18'),
      period('19', {weatherPrimaryCoded: 'S:L:T', pop: 60}),
    ], S, E);
    assert.strictEqual(out.cond, 'storm');
  });

  it('reports the most notable condition even when it comes FIRST', () => {
    /* The mirror of the storm case above. Between the two, "first wins",
       "last wins" and "most notable wins" are three different answers — one
       test alone cannot tell them apart. */
    const out = wx.summarise([
      period('18', {weatherPrimaryCoded: 'C:L:RW', pop: 55}),
      period('19', {weatherPrimaryCoded: '::OV', cloudsCoded: 'OV'}),
    ], S, E);
    assert.strictEqual(out.cond, 'rain');
  });

  it('is null when nothing overlaps — never a zeroed forecast', () => {
    /* A {tempC: 0} written into a session would show a coach a plausible
       freezing evening he has no way to disbelieve. */
    assert.strictEqual(wx.summarise([period('06'), period('07')], S, E), null);
    assert.strictEqual(wx.summarise([], S, E), null);
    assert.strictEqual(wx.summarise(null, S, E), null);
    assert.strictEqual(wx.summarise([period('18')], E, S), null);
  });
});

describe('wxDue — when a forecast is refreshed', () => {
  it('never runs overnight', () => {
    for (let d = 0; d <= 3; d++) {
      [0, 3, 7, 22, 23].forEach((h) => {
        assert.strictEqual(wx.wxDue(d, h), false, 'd' + d + ' h' + h);
      });
    }
  });

  it('runs every hour on the day itself', () => {
    for (let h = wx.WX_HOUR_FROM; h <= wx.WX_HOUR_TO; h++) {
      assert.strictEqual(wx.wxDue(0, h), true, 'h' + h);
    }
  });

  it('runs every 2 hours the day before', () => {
    const on = [];
    for (let h = 0; h < 24; h++) if (wx.wxDue(1, h)) on.push(h);
    assert.deepStrictEqual(on, [8, 10, 12, 14, 16, 18, 20]);
  });

  it('runs every 4 hours two days out', () => {
    const on = [];
    for (let h = 0; h < 24; h++) if (wx.wxDue(2, h)) on.push(h);
    assert.deepStrictEqual(on, [8, 12, 16, 20]);
  });

  it('runs ONCE three days out', () => {
    const on = [];
    for (let h = 0; h < 24; h++) if (wx.wxDue(3, h)) on.push(h);
    assert.deepStrictEqual(on, [wx.WX_HOUR_FROM]);
  });

  it('refuses anything beyond the 3-day window', () => {
    // The app promises "available 3 days before" for exactly this range.
    for (let h = 0; h < 24; h++) {
      assert.strictEqual(wx.wxDue(4, h), false, 'h' + h);
      assert.strictEqual(wx.wxDue(30, h), false, 'h' + h);
    }
  });

  it('refuses an event already in the past', () => {
    assert.strictEqual(wx.wxDue(-1, 12), false);
  });

  it('refuses nonsense rather than guessing', () => {
    assert.strictEqual(wx.wxDue(null, 12), false);
    assert.strictEqual(wx.wxDue(1, NaN), false);
  });
});

describe('dayGap', () => {
  it('counts whole days', () => {
    assert.strictEqual(wx.dayGap('2026-03-04', '2026-03-07'), 3);
    assert.strictEqual(wx.dayGap('2026-03-04', '2026-03-04'), 0);
    assert.strictEqual(wx.dayGap('2026-03-04', '2026-03-03'), -1);
  });
  it('is unmoved by a DST change', () => {
    // Europe/Madrid springs forward on 2026-03-29. Midday UTC on both sides
    // is what keeps this an integer.
    assert.strictEqual(wx.dayGap('2026-03-28', '2026-03-30'), 2);
  });
  it('is null for an unusable date', () => {
    assert.strictEqual(wx.dayGap('', '2026-03-04'), null);
    assert.strictEqual(wx.dayGap('2026-03-04', 'soon'), null);
  });
});

describe('weatherChanged — is this write worth a re-render', () => {
  const base = {cond: 'cloud', windMs: 3.2, tempC: 17, rainPct: 0};

  it('ignores a drift below display precision', () => {
    /* A shard write re-fires updateTeamDates and re-renders the calendar on
       every open client. 0.04 m/s is not worth that. */
    assert.strictEqual(weatherChangedFrom(base, {windMs: 3.24}), false);
    assert.strictEqual(weatherChangedFrom(base, {tempC: 17.4}), false);
  });
  it('notices a change a user could see', () => {
    assert.strictEqual(weatherChangedFrom(base, {cond: 'rain'}), true);
    assert.strictEqual(weatherChangedFrom(base, {windMs: 3.3}), true);
    assert.strictEqual(weatherChangedFrom(base, {tempC: 17.6}), true);
    assert.strictEqual(weatherChangedFrom(base, {rainPct: 40}), true);
  });
  it('ignores `at` — it moves on every fetch by definition', () => {
    const after = Object.assign({}, base, {at: '2026-03-04T09:00:00.000Z'});
    assert.strictEqual(wx.weatherChanged(base, after), false);
  });
  it('is true for a first forecast and false for no forecast', () => {
    assert.strictEqual(wx.weatherChanged(undefined, base), true);
    assert.strictEqual(wx.weatherChanged(base, null), false);
  });

  function weatherChangedFrom(before, over) {
    return wx.weatherChanged(before, Object.assign({}, before, over));
  }
});

/* ── js/app.js — the strip ────────────────────────────────── */

describe('sessionWeatherHtml — what a coach actually sees', () => {
  const I18N = {
    'wx.wind': 'Vent', 'wx.calm': 'Sense vent', 'wx.breeze': 'Brisa',
    'wx.moderate': 'Moderat', 'wx.strong': 'Fort',
    'wx.sun': 'Sol', 'wx.cloud': 'Alguns núvols', 'wx.overcast': 'Ennuvolat',
    'wx.rain': 'Pluja', 'wx.storm': 'Tempesta', 'wx.snow': 'Neu',
    'wx.fog': 'Boira',
    'wx.too_far': 'Previsió disponible 3 dies abans',
    'wx.rain_share_training': 'Es preveu pluja durant el {n}% de l\'entrenament',
    'wx.rain_share_match': 'Es preveu pluja durant el {n}% del partit',
  };

  const code =
    grab('  const STP_WEATHER_ICON = {', '\n  /** A colour disc.');
  const render = new Function('t', 'sanitize',
      code + '\n return { sessionWeatherHtml: sessionWeatherHtml,' +
      ' wxDaysOut: wxDaysOut };')(
      (k) => I18N[k] || k, sanitize);

  /** An ISO date `n` days from today, in the browser's own local time. */
  function inDays(n) {
    const d = new Date();
    d.setDate(d.getDate() + n);
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') +
      '-' + String(d.getDate()).padStart(2, '0');
  }

  const WX = {cond: 'rain', windMs: 6.1, tempC: 11, rainPct: 40,
    at: '2026-03-04T09:00:00.000Z'};

  it('draws the strip for a session inside the window', () => {
    const html = render.sessionWeatherHtml(
        {date: inDays(1), weather: WX}, 'training');
    assert.ok(html.indexOf('std-wx') !== -1);
    assert.ok(html.indexOf('🌧️') !== -1);
    assert.ok(html.indexOf('6.1 m/s') !== -1);
    assert.ok(html.indexOf('11°') !== -1);
  });

  it('adds the rain line as a share of the TRAINING', () => {
    const html = render.sessionWeatherHtml(
        {date: inDays(1), weather: WX}, 'training');
    assert.ok(html.indexOf('durant el 40% de l&#039;entrenament') !== -1 ||
      html.indexOf('durant el 40% de l\'entrenament') !== -1, html);
  });

  it('says "del partit" on a fixture', () => {
    const html = render.sessionWeatherHtml(
        {date: inDays(1), weather: WX}, 'match');
    assert.ok(html.indexOf('40% del partit') !== -1, html);
  });

  it('says nothing about rain when there is none', () => {
    const dry = Object.assign({}, WX, {cond: 'sun', rainPct: 0});
    const html = render.sessionWeatherHtml(
        {date: inDays(1), weather: dry}, 'training');
    // "0% de pluja" is a sentence a coach reads to learn nothing.
    assert.strictEqual(html.indexOf('std-wx-rain'), -1, html);
  });

  it('promises the forecast beyond 3 days instead of going blank', () => {
    const html = render.sessionWeatherHtml({date: inDays(5)}, 'training');
    assert.ok(html.indexOf('std-wx-soon') !== -1, html);
    assert.ok(html.indexOf('3 dies abans') !== -1, html);
    assert.strictEqual(html.indexOf('std-wx-i'), -1, 'no icon this far out');
  });

  it('draws exactly 3 days out — the window is inclusive', () => {
    // wxDue(3, 8) fetches it, so the app must not still be saying "later".
    const html = render.sessionWeatherHtml(
        {date: inDays(3), weather: WX}, 'training');
    assert.ok(html.indexOf('std-wx-soon') === -1, html);
    assert.ok(html.indexOf('std-wx') !== -1);
  });

  it('keeps drawing a FROZEN forecast for a session in the past', () => {
    /* The whole point of the freeze: the last report before kick-off is the
       record of what the session was played in, and it must survive. */
    const html = render.sessionWeatherHtml(
        {date: inDays(-4), weather: WX}, 'training');
    assert.ok(html.indexOf('std-wx') !== -1, html);
    assert.ok(html.indexOf('🌧️') !== -1);
  });

  it('says nothing for a past session that never had one', () => {
    // Predates the feature. There is nothing useful to tell anyone.
    assert.strictEqual(render.sessionWeatherHtml({date: inDays(-4)}, 'training'), '');
  });

  it('says nothing inside the window until the first run fills it', () => {
    assert.strictEqual(render.sessionWeatherHtml({date: inDays(1)}, 'training'), '');
  });

  it('does not invent a forecast for a row with no date', () => {
    assert.strictEqual(render.sessionWeatherHtml({}, 'training'), '');
    assert.strictEqual(render.sessionWeatherHtml(null, 'training'), '');
  });
});

describe('wxDaysOut — the client half of the 3-day window', () => {
  const code = grab('  function wxDaysOut(row) {', '\n\n  /** A colour disc.');
  const wxDaysOut = new Function(code + '\n return wxDaysOut;')();

  function inDays(n) {
    const d = new Date();
    d.setDate(d.getDate() + n);
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') +
      '-' + String(d.getDate()).padStart(2, '0');
  }

  it('agrees with dayGap on the boundary the server fetches to', () => {
    /* These are two copies of one rule — one in js/, one in functions/ — and
       the deploy boundary is why. If they disagree the app promises a
       forecast the server never takes, or hides one it did. */
    assert.strictEqual(wxDaysOut({date: inDays(3)}), 3);
    assert.strictEqual(wxDaysOut({date: inDays(4)}), 4);
    assert.strictEqual(wxDaysOut({date: inDays(0)}), 0);
    assert.strictEqual(wxDaysOut({date: inDays(-2)}), -2);
  });

  it('is -1 for a row with no usable date', () => {
    assert.strictEqual(wxDaysOut({}), -1);
    assert.strictEqual(wxDaysOut({date: 'demà'}), -1);
    assert.strictEqual(wxDaysOut(null), -1);
  });
});

/* ── The two copies of the coordinate parser ──────────────── */

describe('parseCoordsInput mirrors coordsFromMapLink', () => {
  const code = grab('  function parseCoordsInput(v) {',
      '\n\n  function _refreshTeamSetupVenue');
  const parse = new Function(code + '\n return parseCoordsInput;')();

  it('agrees with the server copy on every link form', () => {
    /* functions/ deploys alone, so js/ cannot require it — same duplication
       fcfGrupIdOf lives with, and the same guard: agreement is the property
       that matters, and two suites testing each side would drift past. */
    [
      'https://www.google.com/maps/search/?api=1&query=41.3874,2.1686',
      'https://www.google.com/maps/place/Camp/@41.4,2.17,17z',
      'https://maps.google.com/x!3d-33.87!4d151.21',
      'https://share.google/pfbMOc661aRSNlynk',
      'https://www.google.com/maps/search/?api=1&query=0,0',
      '?query=91.0,2.0',
      '',
    ].forEach((url) => {
      assert.deepStrictEqual(parse(url), wx.coordsFromMapLink(url), url);
    });
  });

  it('additionally takes the bare "lat, lon" a lead copies by hand', () => {
    // The server never sees this form — it only ever reads stored mapLinks —
    // so this is the one place the two copies deliberately differ.
    assert.deepStrictEqual(parse('41.3874, 2.1686'), {lat: 41.3874, lon: 2.1686});
    assert.deepStrictEqual(parse('  -33.87,151.21 '), {lat: -33.87, lon: 151.21});
  });

  it('rejects a half-typed pair rather than sending a NaN', () => {
    assert.strictEqual(parse('41.3874,'), null);
    assert.strictEqual(parse('41.3874'), null);
    assert.strictEqual(parse('Escola Industrial'), null);
  });
});

describe('_linkCoordAttrs — the lead finds out while pasting', () => {
  const code = grab('  function _linkCoordAttrs(link) {',
      '\n\n  function _refreshTeamSetupVenue');
  const attrs = new Function('t', 'sanitize', 'parseCoordsInput', 'isResolvableShortLink',
      code + '\n return _linkCoordAttrs;')(
      (k) => k === 'club.link_nocoord' ? 'Aquest enllaç no porta coordenades' : k,
      sanitize,
      (v) => wx.coordsFromMapLink(v),
      (v) => wx.isShortMapLink(v));

  it('marks a link that carries no coordinates', () => {
    /* The exact case that prompted this: the app's own training default
       opens the right place and produces no forecast, silently. */
    const out = attrs('https://share.google/pfbMOc661aRSNlynk');
    assert.ok(out.indexOf('ts-nocoord') !== -1, out);
    assert.ok(out.indexOf('no porta coordenades') !== -1, out);
  });

  it('leaves a usable link alone', () => {
    assert.strictEqual(
        attrs('https://www.google.com/maps/place/x/@41.3874,2.1686,17z'), '');
  });

  it('does NOT warn about a maps.app.goo.gl link the server can resolve', () => {
    // Warning here would put an amber box in front of almost every lead for
    // a problem that is already solved one redirect away.
    assert.strictEqual(attrs('https://maps.app.goo.gl/abc123'), '');
  });

  it('leaves an EMPTY box alone', () => {
    // A club that has not filled in its schedule is not doing anything
    // wrong; warning here would amber the whole section on first open.
    assert.strictEqual(attrs(''), '');
    assert.strictEqual(attrs('   '), '');
    assert.strictEqual(attrs(undefined), '');
  });
});
