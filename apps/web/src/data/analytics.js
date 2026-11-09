// ─────────────────────────────────────────────────────────────────────────────
// ANALYTICS — GA4 Measurement IDs + the hostnames each one serves
// ─────────────────────────────────────────────────────────────────────────────
// Read at RUNTIME by src/js/modules/analytics.js (not by a build renderer, which
// is why this is its own file rather than a field in business.js, whose values
// are build-time copy injected through markers). The module looks up the page's
// hostname here and loads gtag.js only when the matching ID is non-empty, so:
//
//   • a staging host with an empty ID     → no script, track() is a no-op
//   • the production host with an empty ID → no script (the state until cutover)
//   • any other host (localhost, previews of other projects, unknown) → no script
//
// FIELDS (per environment)
//   measurementId  The GA4 web-stream ID, 'G-XXXXXXXXXX', or '' to stay off.
//                  IDs are public (they ship in every page), so they live here.
//   hosts          Hostnames this ID applies to. A host also matches its own
//                  subdomains, so 'beanstalk-e61.pages.dev' covers the Cloudflare
//                  Pages branch previews (<branch>.beanstalk-e61.pages.dev) and
//                  'beansprout.ink' covers www.beansprout.ink.
//
// Staging hosts mirror the site origins the Worker's CORS allowlist trusts
// (apps/functions/src/lib/http.js): the GitHub Pages URL and the Cloudflare
// Pages staging project. Keep the two lists in step if a project is renamed.
//
// 👤 Owner steps (see docs/ANALYTICS.md): paste the staging property's ID into
// staging.measurementId; at cutover paste the production ID into
// production.measurementId (docs/CUTOVER.md).
export const analytics = {
  staging: {
    measurementId: '',
    hosts: ['gfnnn.github.io', 'beanstalk-e61.pages.dev'],
  },
  production: {
    measurementId: '',
    hosts: ['beansprout.ink'],
  },
}
