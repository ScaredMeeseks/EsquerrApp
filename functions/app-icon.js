/* The installed app's icon, per club (v283).
 *
 * The web app's icon is whatever its manifest names at the moment it is
 * installed — Chrome's install dialog, and Safari's "Add to Home Screen",
 * which reads <link rel="apple-touch-icon">. Both used to be L'Esquerra's
 * crest for every club. The page now points both at these two endpoints once
 * it knows the member's club:
 *
 *   appManifest?club=<id>&app=<the app's base URL>   → a manifest
 *   appIcon?club=<id>&s=<180|192|512>[&m=1]          → a square PNG
 *
 * Real URLs, not a blob: manifest built in the page. Chrome on Android mints
 * the installed app through a Google server that FETCHES the manifest and its
 * icons, and a blob: URL cannot be fetched by anyone but the page.
 *
 * ⚠ The Android APK is untouched: its icon is compiled in, one for everyone.
 *
 * Pure helpers here; index.js wires them to onRequest. `test/app-icon.test.js`
 * runs them, sharp included.
 */
'use strict';

/* Where the app may be served from. start_url and scope MUST be same-origin
   with the page, so the page says where it is — and only these are believed.
   Anything else gets the production address. */
const PROD_APP = 'https://scaredmeeseks.github.io/EsquerrApp/';
const APP_BASES = [
  /^https:\/\/scaredmeeseks\.github\.io\/EsquerrApp\/$/,
  /^http:\/\/(localhost|127\.0\.0\.1):\d{2,5}\/$/,
];

/* Badges are uploads to Firebase Storage, written only by the superadmin. The
   host list stops the function being pointed at anything else, should a club
   document ever carry another URL. */
const BADGE_HOSTS = ['firebasestorage.googleapis.com', 'storage.googleapis.com'];

const ICON_SIZES = [180, 192, 512];
const CLUB_ID = /^[A-Za-z0-9_-]{1,64}$/;

function appBase(raw) {
  const s = String(raw || '');
  return APP_BASES.some((re) => re.test(s)) ? s : PROD_APP;
}

function safeBadgeUrl(raw) {
  try {
    const u = new URL(String(raw || ''));
    return (u.protocol === 'https:' && BADGE_HOSTS.includes(u.hostname)) ? u.href : '';
  } catch (e) {
    return '';
  }
}

function validClubId(raw) {
  const s = String(raw || '');
  return CLUB_ID.test(s) ? s : '';
}

function iconSize(raw) {
  const n = Number(raw);
  return ICON_SIZES.includes(n) ? n : 512;
}

/**
 * The manifest. Same name, colours and start_url as manifest.json, so an
 * existing install is the SAME app (Chrome keys it on start_url): only the
 * icons and the description follow the club.
 *
 * @param {Object} o clubId, clubName, hasBadge, app (validated base URL),
 *   iconBase (this project's appIcon endpoint).
 */
function buildManifest(o) {
  const app = appBase(o.app);
  const icons = o.hasBadge && o.clubId
    ? [
      {src: o.iconBase + '?club=' + o.clubId + '&s=192', sizes: '192x192', type: 'image/png', purpose: 'any'},
      {src: o.iconBase + '?club=' + o.clubId + '&s=512', sizes: '512x512', type: 'image/png', purpose: 'any'},
      {src: o.iconBase + '?club=' + o.clubId + '&s=512&m=1', sizes: '512x512', type: 'image/png', purpose: 'maskable'},
    ]
    // No crest on file: the app's own, exactly as manifest.json has it.
    : [
      {src: app + 'img/logo-192.png', sizes: '192x192', type: 'image/png', purpose: 'any maskable'},
      {src: app + 'img/logo-512.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable'},
    ];
  return {
    name: 'EsquerrApp',
    short_name: 'EsquerrApp',
    description: o.clubName ? String(o.clubName).slice(0, 120) : 'EsquerrApp',
    start_url: app + 'index.html',
    scope: app,
    display: 'standalone',
    background_color: '#ffffff',
    theme_color: '#BD162C',
    orientation: 'portrait-primary',
    icons,
    gcm_sender_id: '103953800507',
  };
}

/**
 * The crest on a white square. White, because iOS paints a transparent
 * home-screen icon's background black; padded, so a round crest is not
 * cropped by the launcher's mask. A maskable icon keeps the crest inside the
 * 80% safe zone the mask may cut to.
 */
async function renderIcon(sharp, input, size, maskable) {
  const pad = Math.round(size * (maskable ? 0.2 : 0.08));
  const inner = size - 2 * pad;
  const crest = await sharp(input)
      .resize(inner, inner, {fit: 'contain', background: {r: 255, g: 255, b: 255, alpha: 0}})
      .png().toBuffer();
  /* ⚠ TWO passes. sharp runs `composite` LAST in a pipeline whatever order
     the calls are written in, so a flatten chained here would run before the
     crest arrived — and the crest would bring its alpha channel back. */
  const square = await sharp({create: {width: size, height: size, channels: 4,
    background: {r: 255, g: 255, b: 255, alpha: 1}}})
      .composite([{input: crest, top: pad, left: pad}])
      .png().toBuffer();
  return sharp(square).flatten({background: '#ffffff'}).png().toBuffer();
}

module.exports = {
  PROD_APP, BADGE_HOSTS, ICON_SIZES,
  appBase, safeBadgeUrl, validClubId, iconSize, buildManifest, renderIcon,
};
