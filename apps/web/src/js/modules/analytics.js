// Vendor-agnostic analytics scaffold.
//
// `track(event, props)` is the single call site every conversion moment uses
// (enquiry submit, flash claim, newsletter signup, outbound social clicks).
// It deliberately no-ops in production until a provider is wired into `send()`
// below, so the rest of the app never has to change when a tool is chosen —
// and there's nothing to consent to until one is, so no cookie banner is owed.
//
// To enable a provider later, fill in `send()`. Examples:
//   Plausible (cookieless):  window.plausible?.(event, { props })
//   Fathom (cookieless):     window.fathom?.trackEvent(event)
//   GA4 (needs consent):     window.gtag?.('event', event, props)
// and add the provider's snippet to each page <head> (or inject it here).

function send(event, props) {
  // No vendor configured yet — wire one in here. Until then, surface events in
  // dev so the wiring is verifiable without shipping a tracker to real visitors.
  if (import.meta.env.DEV) console.debug('[track]', event, props || {})
}

// Fire a conversion/interaction event. Analytics must never break the UX, so
// any provider error is swallowed.
export function track(event, props) {
  try { send(event, props) } catch (_) { /* never throw from tracking */ }
}

// Wire outbound social-link tracking (Instagram / TikTok). No-ops if a page has
// no such links. Other conversion events are fired inline from their modules.
export function initAnalytics() {
  const links = document.querySelectorAll(
    'a[href*="instagram.com"], a[href*="tiktok.com"]'
  )
  links.forEach(a => {
    a.addEventListener('click', () => {
      const network  = /tiktok\.com/.test(a.href) ? 'tiktok' : 'instagram'
      const location = a.closest('footer') ? 'footer' : 'nav'
      track('social_click', { network, location })
    })
  })
}
