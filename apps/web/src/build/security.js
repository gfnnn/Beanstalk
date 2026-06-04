// ─────────────────────────────────────────────────────────────────────────────
// Content-Security-Policy — defence-in-depth for the static site
// ─────────────────────────────────────────────────────────────────────────────
// The site has no XSS/injection sinks today (all user input is escaped server-
// side before it reaches an email, and the front-end never interpolates untrusted
// values into HTML — see the review on this branch). This CSP is a backstop: if a
// sink is ever introduced by accident, the policy still blocks the most common
// exploitation paths (inline/remote script injection, exfiltration to an
// attacker origin, framing of the page).
//
// Delivered as a `<meta http-equiv>` tag because the canonical site is served
// from GitHub Pages, which can't set custom response HTTP headers. Two directives
// are therefore unavailable here and intentionally omitted (the browser ignores
// them in a meta tag): `frame-ancestors` (clickjacking) and
// `report-uri`/`report-to` — both require a real HTTP header. Clickjacking
// protection would need an `X-Frame-Options`/`frame-ancestors` *header*, which
// Pages can't emit; revisit if the site ever moves behind a host that can.
//
// Injected at BUILD time only (vite.config.js, `generateBundle`), never in the
// dev server — a strict policy would otherwise break Vite's HMR client (inline
// bootstrap + websocket). See the `beansprout-security-head` plugin.

// What the deployed site actually loads, and nothing more:
//   script  — only the same-origin bundled module (gsap/lenis are npm deps, bundled).
//             No inline <script> executes (the homepage JSON-LD is data, not script,
//             and isn't governed by script-src). No 'unsafe-inline'/'unsafe-eval'.
//   style   — same-origin CSS + the build-injected palette <style> + inline style
//             attributes and JS-set .style, so 'unsafe-inline' is required here;
//             plus Google Fonts' stylesheet origin.
//   font    — Google Fonts' file origin (woff2).
//   img     — self, data: (the favicon SVG embeds a data: image), and blob: (the
//             enquiry form's client-side reference-image thumbnails).
//   connect — the Netlify function origin(s) the forms fetch() (derived below).
//   frame   — the Google Maps embed on /visit/.
const FONT_STYLE_ORIGIN = 'https://fonts.googleapis.com'
const FONT_FILE_ORIGIN  = 'https://fonts.gstatic.com'
const MAPS_ORIGINS      = ['https://maps.google.com', 'https://www.google.com']

// The function endpoints the front-end POSTs/GETs to. Mirrors the fallbacks in
// src/js/modules/config.js and honours the same VITE_*_FN_URL build-time
// overrides, so connect-src tracks wherever the functions actually live.
const FN_URLS = [
  process.env.VITE_ENQUIRY_FN_URL      || 'https://beansprout.netlify.app/.netlify/functions/enquiry',
  process.env.VITE_NEWSLETTER_FN_URL   || 'https://beansprout.netlify.app/.netlify/functions/newsletter',
  process.env.VITE_FLASH_STATUS_FN_URL || 'https://beansprout.netlify.app/.netlify/functions/flash-status',
]

function originOf(url) {
  try { return new URL(url).origin } catch { return '' }
}

// Distinct origins the functions live on (usually just one).
const FN_ORIGINS = [...new Set(FN_URLS.map(originOf).filter(Boolean))]

// Build the policy as an ordered list of directives.
export function cspContent() {
  const directives = [
    ["default-src", ["'self'"]],
    ["base-uri",    ["'self'"]],
    ["object-src",  ["'none'"]],
    ["script-src",  ["'self'"]],
    ["style-src",   ["'self'", "'unsafe-inline'", FONT_STYLE_ORIGIN]],
    ["font-src",    ["'self'", FONT_FILE_ORIGIN]],
    ["img-src",     ["'self'", 'data:', 'blob:']],
    ["connect-src", ["'self'", ...FN_ORIGINS]],
    ["frame-src",   MAPS_ORIGINS],
    ["form-action", ["'self'"]],
  ]
  return directives.map(([name, values]) => `${name} ${values.join(' ')}`).join('; ')
}

// The `<meta>` tag to drop into every page's <head> at build.
export function renderCspMeta() {
  return `<meta http-equiv="Content-Security-Policy" content="${cspContent()}">`
}
