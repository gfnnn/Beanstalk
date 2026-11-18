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
// WHEN the script loads: not at init. gtag.js is a large third-party script
// that would otherwise download and run while the page is still arriving, so its
// injection waits until the page has been revealed and has finished loading (see
// afterPageSettles). The dataLayer and the gtag() stub exist from init, so an event
// tracked in that window queues, and tracking one brings the script forward at
// once rather than leaving a conversion waiting on an idle moment. The cost is
// that a visitor who leaves before the script loads is not counted
// (docs/ANALYTICS.md → Load timing).
//
// Lawful basis + what's collected: docs/ANALYTICS.md. Hard rule: no PII and no
// form values ever leave the browser. That's enforced here, not trusted to call
// sites: only the events in EVENTS are sent, and only with their listed param
// values. Anything else is dropped.

import { analytics as CONFIG } from '../../data/analytics.js'
import { pageReady } from './loader.js'

export const OPT_OUT_KEY = 'beansprout_analytics_optout'
// Owner flag: set per browser with ?owner=1, cleared with ?owner=0. While set,
// gtag.js is never loaded, so the owners' own visits send nothing at all
// (docs/ANALYTICS.md → Owner traffic).
export const OWNER_KEY = 'bs_owner'
const OWNER_PARAM = 'owner'
const GTAG_SRC = 'https://www.googletagmanager.com/gtag/js'
const ID_RE = /^G-[A-Z0-9]+$/
// ~13 months for the _ga cookies, in step with the 14-month retention on the
// property. Documentation only: see the note on the config call in loadGtag.
const COOKIE_EXPIRES_S = 60 * 60 * 24 * 395
// How long a navigating caller waits for the hit to send before moving on anyway.
const NAV_TIMEOUT_MS = 800

// The complete allowlist of what can be sent: event → { param: allowed values }.
// Params are fixed enums, never anything a visitor typed.
const EVENTS = {
  generate_lead: { form: ['enquiry', 'flash'] },
  sign_up: { method: ['newsletter'] },
}

// How long after the reveal the script loads anyway if `load` hasn't fired (a page
// with a slow image must not hold analytics back indefinitely), and how long the
// browser may then take to find an idle moment.
const LOAD_CAP_MS = 4000
const IDLE_TIMEOUT_MS = 2000

let activeId = '' // the ID gtag is live for on this page, or '' (no-op)
let configured = false // the gtag() stub exists and its js/config calls are queued
// Where the gtag.js <script> is: 'none' (not requested), 'waiting' (queued behind
// `defer`) or 'injected' (in the document).
let scriptState = 'none'

// Run `fn` once the page is out of its critical window: revealed (pageReady, the
// moment the preloader lifts), then loaded (or LOAD_CAP_MS later, whichever comes
// first), then at the next idle moment. Safari has no requestIdleCallback, so it
// gets a plain timeout.
function afterPageSettles(fn) {
  const idle = () => {
    if (typeof window.requestIdleCallback === 'function') {
      window.requestIdleCallback(fn, { timeout: IDLE_TIMEOUT_MS })
    } else {
      setTimeout(fn, 1)
    }
  }
  pageReady.then(() => {
    if (document.readyState === 'complete') { idle(); return }
    let fired = false
    const once = () => { if (!fired) { fired = true; idle() } }
    window.addEventListener('load', once, { once: true })
    setTimeout(once, LOAD_CAP_MS)
  })
}
// What defers the script. Only ever replaced by tests (see _resetForTests).
let defer = afterPageSettles

// Put the gtag.js <script> in the document, unless that is no longer wanted: the
// visitor may have opted out (here or in another tab) while it was waiting.
// Dropping back to 'none' lets a later opt-in queue it again.
function injectScript(id) {
  if (scriptState === 'injected') return
  if (activeId !== id || isOptedOut() || isOwner()) { scriptState = 'none'; return }
  scriptState = 'injected'
  const s = document.createElement('script')
  s.async = true
  s.src = `${GTAG_SRC}?id=${encodeURIComponent(id)}`
  document.head.appendChild(s)
}

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

/** True when this browser carries the owner flag (false if storage is unreadable). */
export function isOwner() {
  try { return localStorage.getItem(OWNER_KEY) === '1' } catch { return false }
}

// Act on ?owner=1 / ?owner=0, then take the param off the address bar. Runs
// before gtag's config call, so page_location never records it. Any other value
// changes nothing but is still stripped.
function applyOwnerParam() {
  let url
  try { url = new URL(location.href) } catch { return }
  if (!url.searchParams.has(OWNER_PARAM)) return
  const value = url.searchParams.get(OWNER_PARAM)
  try {
    if (value === '1') localStorage.setItem(OWNER_KEY, '1')
    else if (value === '0') localStorage.removeItem(OWNER_KEY)
  } catch { /* storage blocked: analytics is off for this browser anyway */ }
  url.searchParams.delete(OWNER_PARAM)
  try {
    history.replaceState(history.state, '', `${url.pathname}${url.search}${url.hash}`)
  } catch { /* leave the URL as it is */ }
}

// A small footer line so an owner can see the flag is set on this browser (the
// only check available on a phone or in an in-app browser).
function showOwnerNote() {
  const row = document.querySelector('.footer-bottom')
  if (!row || row.querySelector('[data-owner-mode]')) return
  const note = document.createElement('p')
  note.className = 'footer-copy'
  note.dataset.ownerMode = ''
  note.textContent = 'Owner mode · visits from this browser aren’t counted'
  row.appendChild(note)
}

function loadGtag(id) {
  // Owner browsers never load the tag. (Tagging their hits instead doesn't work:
  // the Google tag configures itself from the script URL and drops the params of
  // the on-page config call, so nothing set here reaches the first page_view.)
  if (isOwner()) return
  window[`ga-disable-${id}`] = false
  activeId = id
  if (!configured) {
    configured = true
    window.dataLayer = window.dataLayer || []
    // gtag.js reads the `arguments` object itself off dataLayer, so this must
    // push `arguments` (not a rest array), exactly as Google's snippet does.
    // biome-ignore lint/complexity/noArguments: gtag.js requires the arguments object
    window.gtag = function gtag() { window.dataLayer.push(arguments) }
    window.gtag('js', new Date())
    // These params are NOT what enforces the policy. The Google tag ignores the
    // on-page config (its "Ignore duplicate instances of on-page configuration"
    // setting is on), so signals, ad personalisation and the cookie lifetime are
    // set in GA4 admin (docs/ANALYTICS.md → GA4 admin setup). Kept as a fallback
    // should that setting ever be turned off.
    window.gtag('config', id, {
      allow_google_signals: false,
      allow_ad_personalization_signals: false,
      cookie_expires: COOKIE_EXPIRES_S,
    })
  }
  if (scriptState !== 'none') return
  scriptState = 'waiting'
  defer(() => injectScript(id))
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
  // An event means the visitor has done something worth counting, and the caller
  // may be about to navigate: don't leave the hit queued behind an idle moment.
  if (scriptState === 'waiting') injectScript(activeId)
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
  // A host with no Measurement ID (staging until its ID is set, localhost) loads nothing.
  owner: 'Owner mode is on in this browser, so analytics isn’t loaded and your visits aren’t counted.',
  none: 'Analytics isn’t running on this site right now. You can still turn it off here, and the choice is saved for later.',
}

function initOptOutControl(id) {
  const root = document.querySelector('[data-analytics-optout]')
  const status = root?.querySelector('[data-analytics-status]')
  const btn = root?.querySelector('[data-analytics-toggle]')
  if (!root || !status || !btn) return

  const render = () => {
    const reason = optOutReason()
    status.textContent = STATUS[reason || (isOwner() ? 'owner' : id ? 'on' : 'none')]
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
  applyOwnerParam()
  if (isOwner()) {
    showOwnerNote()
    clearGaCookies() // left over from visits before the flag was set
  }
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

// Test-only: reset module state between cases. Pass `{ defer }` to replace what
// defers the script (e.g. `fn => fn()` to inject at once); `{ defer: null }`
// restores the real one. Omitting it leaves it as it is.
export function _resetForTests(opts) {
  activeId = ''
  configured = false
  scriptState = 'none'
  if (opts && 'defer' in opts) defer = opts.defer || afterPageSettles
}
