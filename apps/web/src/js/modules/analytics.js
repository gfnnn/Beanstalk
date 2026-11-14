// Analytics: GA4 via gtag.js, behind the single `track()` API.
//
// Every conversion call site goes through `track(event, props)`; nothing else in
// the app touches gtag. gtag.js is loaded at runtime (no GTM, no npm dependency,
// no build step) and only when ALL of these hold:
//   1. the page's hostname maps to a non-empty Measurement ID in
//      src/data/analytics.js (staging hosts / the apex; localhost and unknown
//      hosts never load it, so dev, tests and the E2E tier send nothing), and
//   2. the visitor hasn't opted out, which means: no Global Privacy Control
//      signal, no opt-out flag saved from the /privacy/ control, and site storage
//      is readable (if it throws we can't honour a saved choice, so we treat the
//      visitor as opted out).
// The opt-out check runs BEFORE dataLayer exists or the script is injected, so an
// opted-out visitor makes zero requests to Google and gets no _ga cookies.
//
// Lawful basis + what's collected: docs/ANALYTICS.md. Hard rule: no PII and no
// form values ever leave the browser. That's enforced here, not trusted to call
// sites: only the events in EVENTS are sent, and only with their listed param
// values. Anything else is dropped.

import { analytics as CONFIG } from '../../data/analytics.js'

export const OPT_OUT_KEY = 'beansprout_analytics_optout'
const GTAG_SRC = 'https://www.googletagmanager.com/gtag/js'
const ID_RE = /^G-[A-Z0-9]+$/
// Keep the _ga cookies to ~13 months (GA's default is 2 years), in step with the
// 14-month retention set on the property.
const COOKIE_EXPIRES_S = 60 * 60 * 24 * 395
// How long a navigating caller waits for the hit to send before moving on anyway.
const NAV_TIMEOUT_MS = 800

// The complete allowlist of what can be sent: event → { param: allowed values }.
// Params are fixed enums, never anything a visitor typed.
const EVENTS = {
  generate_lead: { form: ['enquiry', 'flash'] },
  sign_up: { method: ['newsletter'] },
}

let activeId = '' // the ID gtag is live for on this page, or '' (no-op)
let scriptLoaded = false

/** The Measurement ID for a hostname, or '' when none applies (→ no script). */
export function measurementIdFor(hostname, config = CONFIG) {
  const host = String(hostname || '').toLowerCase()
  if (!host) return ''
  for (const env of Object.values(config)) {
    const match = (env.hosts || []).some(h => host === h || host.endsWith(`.${h}`))
    if (match) return ID_RE.test(env.measurementId || '') ? env.measurementId : ''
  }
  return ''
}

function gpcOn() {
  try { return navigator.globalPrivacyControl === true } catch { return false }
}

/**
 * Why analytics is off for this visitor, or null if it may run:
 * 'gpc' (browser privacy signal), 'storage' (can't read site storage, so a
 * saved choice can't be honoured) or 'choice' (opted out on /privacy/).
 */
export function optOutReason() {
  if (gpcOn()) return 'gpc'
  try {
    return localStorage.getItem(OPT_OUT_KEY) === '1' ? 'choice' : null
  } catch {
    return 'storage'
  }
}

export const isOptedOut = () => optOutReason() !== null

function saveOptOut(off) {
  try {
    if (off) localStorage.setItem(OPT_OUT_KEY, '1')
    else localStorage.removeItem(OPT_OUT_KEY)
    return true
  } catch {
    return false
  }
}

// Expire any _ga / _ga_<stream> cookies. GA sets them on the widest domain it
// can ("auto"), so try the bare host and each parent domain.
function clearGaCookies(hostname = location.hostname) {
  const names = document.cookie.split(';')
    .map(c => c.split('=')[0].trim())
    .filter(n => n === '_ga' || n.startsWith('_ga_'))
  if (!names.length) return
  const parts = hostname.split('.')
  const domains = ['']
  for (let i = 0; i < parts.length - 1; i++) domains.push(`; domain=.${parts.slice(i).join('.')}`)
  for (const name of names) {
    for (const d of domains) {
      // Cookie Store API isn't in every supported browser (Safari/Firefox), so assign directly.
      // biome-ignore lint/suspicious/noDocumentCookie: expiring GA's own cookies on opt-out
      document.cookie = `${name}=; Max-Age=0; path=/${d}`
    }
  }
}

function loadGtag(id) {
  window[`ga-disable-${id}`] = false
  activeId = id
  if (scriptLoaded) return
  scriptLoaded = true
  window.dataLayer = window.dataLayer || []
  // gtag.js reads the `arguments` object itself off dataLayer, so this must
  // push `arguments` (not a rest array), exactly as Google's snippet does.
  // biome-ignore lint/complexity/noArguments: gtag.js requires the arguments object
  window.gtag = function gtag() { window.dataLayer.push(arguments) }
  window.gtag('js', new Date())
  window.gtag('config', id, {
    allow_google_signals: false,
    allow_ad_personalization_signals: false,
    cookie_expires: COOKIE_EXPIRES_S,
  })
  const s = document.createElement('script')
  s.async = true
  s.src = `${GTAG_SRC}?id=${encodeURIComponent(id)}`
  document.head.appendChild(s)
}

function stopTracking(id) {
  if (id) window[`ga-disable-${id}`] = true
  activeId = ''
  clearGaCookies()
}

/** The params that may be sent for an event, or null if the event isn't allowed. */
export function safeParams(event, props) {
  const spec = EVENTS[event]
  if (!spec) return null
  const out = {}
  for (const [key, allowed] of Object.entries(spec)) {
    const v = props?.[key]
    if (allowed.includes(v)) out[key] = v
  }
  return out
}

function send(event, props, done) {
  const params = safeParams(event, props)
  if (import.meta.env.DEV) console.debug('[track]', event, params)
  if (!params || !activeId || typeof window.gtag !== 'function') return false
  window.gtag('event', event, done ? { ...params, event_callback: done } : params)
  return true
}

/**
 * Send an allowlisted event. Analytics must never break the UX, so errors are
 * swallowed. Pass `done` when the caller is about to navigate away: it runs once,
 * after the hit is sent or after a short timeout (immediately when analytics is
 * off), so a lead fired just before a redirect isn't lost.
 */
export function track(event, props, done) {
  let finished = false
  const finish = done ? () => {
    if (finished) return
    finished = true
    done()
  } : undefined
  let sent = false
  try { sent = send(event, props, finish) } catch { /* never throw from tracking */ }
  if (finish) {
    if (sent) setTimeout(finish, NAV_TIMEOUT_MS)
    else finish()
  }
}

// The opt-out control on /privacy/ (markup: [data-analytics-optout] holding a
// [data-analytics-status] line and a [data-analytics-toggle] button, hidden until
// this runs). No-ops on every other page.
const STATUS = {
  gpc: 'Your browser is sending a Global Privacy Control signal, so analytics is already off for you. Nothing else to do.',
  storage: 'Your browser is blocking site storage, so analytics stays off for you.',
  choice: 'Analytics is off in this browser. This choice is saved for future visits.',
  on: 'Analytics is on in this browser.',
  // A host with no Measurement ID (production before cutover, localhost) loads nothing.
  none: 'Analytics isn’t running on this site right now. You can still turn it off here, and the choice is saved for later.',
}

function initOptOutControl(id) {
  const root = document.querySelector('[data-analytics-optout]')
  const status = root?.querySelector('[data-analytics-status]')
  const btn = root?.querySelector('[data-analytics-toggle]')
  if (!root || !status || !btn) return

  const render = () => {
    const reason = optOutReason()
    status.textContent = STATUS[reason || (id ? 'on' : 'none')]
    btn.hidden = reason === 'gpc' || reason === 'storage'
    btn.textContent = reason === 'choice' ? 'Turn analytics back on' : 'Turn off analytics'
  }

  btn.addEventListener('click', () => {
    if (optOutReason() === 'choice') {
      if (saveOptOut(false) && id) loadGtag(id)
    } else {
      // Stop for this page even if the choice can't be saved.
      saveOptOut(true)
      stopTracking(id)
    }
    render()
  })

  root.hidden = false
  render()
}

// Called once from main.js on every page.
export function initAnalytics({ hostname = location.hostname } = {}) {
  const id = measurementIdFor(hostname)
  initOptOutControl(id)
  if (!id) return
  if (isOptedOut()) {
    window[`ga-disable-${id}`] = true
    return
  }
  loadGtag(id)
  // An opt-out made in another tab, or before Back restored this page from the
  // bfcache, must stop this page too, not just the one where the button was pressed.
  const recheck = () => { if (activeId && isOptedOut()) stopTracking(id) }
  window.addEventListener('storage', e => { if (e.key === OPT_OUT_KEY) recheck() })
  window.addEventListener('pageshow', e => { if (e.persisted) recheck() })
}

// Test-only: reset module state between cases.
export function _resetForTests() {
  activeId = ''
  scriptLoaded = false
}
