// Build-time security headers, delivered as <meta> tags in every page's <head>.
// Two tags: a Content-Security-Policy and a Referrer-Policy. Wired by the
// `beansprout-security-headers` plugin in vite.config.js for the normal pages and
// passed into src/build/piece-page.js for the per-piece pages (which bypass Vite's
// HTML transforms), so the whole static site — present and future pages — carries
// the same policy.
//
// BUILD/preview only. The plugin sets `apply: 'build'`, so the Vite *dev* server
// is deliberately left without CSP: its HMR client injects inline scripts, uses
// eval, and opens a localhost websocket that a strict policy would break. What
// ships (npm run build → preview) is what's enforced.
//
// What a <meta> CSP CAN'T do (a real GitHub Pages limitation): `frame-ancestors`,
// `X-Frame-Options`, `Strict-Transport-Security` and `X-Content-Type-Options` are
// response-header-only — ignored as meta tags — so clickjacking defence on the
// HTML pages waits for the Cloudflare-front consolidation (ROADMAP → Tier 3 /
// "infrastructure consolidation"). The Worker's JSON responses set their own
// header set in apps/functions/src/lib/http.js.

// The Worker origin(s) the forms fetch() to, pinned in `connect-src`. Mirrors the
// default in apps/web/src/js/modules/config.js; per-build VITE_*_FN_URL overrides
// (the workers.dev subdomain is account-specific) are honoured so the policy
// tracks whatever origin the build actually points the forms at.
const DEFAULT_FN_ORIGIN = 'https://beansprout-forms.harrisonfisher1990.workers.dev'

function originOf(url) {
  try { return new URL(url).origin } catch { return null }
}

/** Distinct Worker origins from the three VITE_*_FN_URL build vars, or the default. */
export function workerConnectOrigins(env = (typeof process !== 'undefined' ? process.env : {})) {
  const origins = new Set()
  for (const url of [env.VITE_ENQUIRY_FN_URL, env.VITE_NEWSLETTER_FN_URL, env.VITE_FLASH_STATUS_FN_URL]) {
    const o = url && originOf(url)
    if (o) origins.add(o)
  }
  if (!origins.size) origins.add(DEFAULT_FN_ORIGIN)
  return [...origins]
}

// Why each directive (everything first-party unless noted):
//   default-src 'self'              — lock the baseline to same-origin.
//   script-src 'self'               — only the bundled main-*.js (gsap/lenis are
//                                     npm deps, so they ship in it). The JSON-LD
//                                     blocks are non-executable data, exempt.
//   style-src … 'unsafe-inline' …   — the injected <style id="palette"> block and
//                                     a few inline style="" attributes need inline;
//                                     fonts.googleapis.com serves the font CSS.
//   font-src … fonts.gstatic.com    — the Google Fonts files (until self-hosted, P3).
//   img-src 'self' data: blob:      — local images; blob: is the enquiry image
//                                     preview (URL.createObjectURL).
//   connect-src 'self' <worker>     — the form/flash-status fetch() targets.
//   frame-src google maps           — the embedded studio map on /visit/.
//   base-uri / object-src / form-action — tighten the usual injection footguns.
export function cspContent(connectOrigins = workerConnectOrigins()) {
  return [
    "default-src 'self'",
    "base-uri 'self'",
    "object-src 'none'",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' https://fonts.gstatic.com",
    "img-src 'self' data: blob:",
    `connect-src ${["'self'", ...connectOrigins].join(' ')}`,
    'frame-src https://www.google.com https://maps.google.com',
    "form-action 'self'",
  ].join('; ')
}

export const REFERRER_POLICY = 'strict-origin-when-cross-origin'

/** The CSP + Referrer-Policy <meta> tags as a head-ready string (no leading indent). */
export function renderSecurityMeta(connectOrigins) {
  return `<meta http-equiv="Content-Security-Policy" content="${cspContent(connectOrigins)}">\n` +
         `  <meta name="referrer" content="${REFERRER_POLICY}">`
}
