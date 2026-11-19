// @vitest-environment jsdom
//
// Tests for src/js/modules/analytics.js: GA4 behind track(). Pins the privacy
// contract: gtag.js loads only on a configured host for a visitor who hasn't opted
// out (saved choice, GPC, or unreadable storage), nothing outside the event/param
// allowlist ever reaches gtag (no PII), and the /privacy/ control opts out/in.
// jsdom never fetches the injected <script>, so "zero Google requests" is asserted
// as "no gtag script element and no dataLayer".
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

vi.mock('../src/data/analytics.js', () => ({
  analytics: {
    staging: { measurementId: 'G-TEST123', hosts: ['staging.example'] },
    production: { measurementId: '', hosts: ['beansprout.ink'] },
  },
}))

import {
  track, initAnalytics, measurementIdFor, optOutReason, safeParams,
  OPT_OUT_KEY, OWNER_KEY, isOwner, _resetForTests, ENTRANCE_SETTLE_MS,
} from '../src/js/modules/analytics.js'
import { initPageLoader } from '../src/js/modules/loader.js'

const ID = 'G-TEST123'
const gtagScript = () => document.querySelector('script[src^="https://www.googletagmanager.com/gtag/js"]')
const setGpc = on => Object.defineProperty(navigator, 'globalPrivacyControl', { value: on, configurable: true })
// gtag pushes `arguments` objects; normalise to arrays.
const pushed = () => (window.dataLayer || []).map(a => Array.from(a))
const events = () => pushed().filter(a => a[0] === 'event')

beforeEach(() => {
  // Inject the script at once: the suites below are about WHETHER gtag loads.
  // WHEN it loads is covered in 'gtag.js load timing' at the bottom.
  _resetForTests({ defer: fn => fn() })
  document.head.innerHTML = ''
  document.body.innerHTML = ''
  delete window.dataLayer
  delete window.gtag
  delete window[`ga-disable-${ID}`]
  localStorage.clear()
  setGpc(undefined)
  vi.spyOn(console, 'debug').mockImplementation(() => {})
})
afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers() })

describe('measurementIdFor (hostname → ID)', () => {
  const config = {
    staging: { measurementId: 'G-STAGE1', hosts: ['gfnnn.github.io', 'beanstalk-e61.pages.dev'] },
    production: { measurementId: 'G-PROD1', hosts: ['beansprout.ink'] },
  }

  it('maps the staging hosts and Pages branch previews to the staging ID', () => {
    expect(measurementIdFor('gfnnn.github.io', config)).toBe('G-STAGE1')
    expect(measurementIdFor('beanstalk-e61.pages.dev', config)).toBe('G-STAGE1')
    expect(measurementIdFor('feat-x.beanstalk-e61.pages.dev', config)).toBe('G-STAGE1')
  })

  it('maps the apex and www to the production ID', () => {
    expect(measurementIdFor('beansprout.ink', config)).toBe('G-PROD1')
    expect(measurementIdFor('www.beansprout.ink', config)).toBe('G-PROD1')
  })

  it('returns nothing for localhost, unknown and look-alike hosts', () => {
    for (const host of ['localhost', '127.0.0.1', 'example.com', 'evilgfnnn.github.io',
      'beansprout.ink.evil.com', 'other.pages.dev', '']) {
      expect(measurementIdFor(host, config)).toBe('')
    }
  })

  it('treats an empty or malformed ID as off', () => {
    expect(measurementIdFor('beansprout.ink', { p: { measurementId: '', hosts: ['beansprout.ink'] } })).toBe('')
    expect(measurementIdFor('beansprout.ink', { p: { measurementId: 'UA-1', hosts: ['beansprout.ink'] } })).toBe('')
  })

  it('ships with valid-or-empty IDs and the staging hosts the Worker trusts', async () => {
    const { analytics } = await vi.importActual('../src/data/analytics.js')
    for (const env of Object.values(analytics)) expect(env.measurementId).toMatch(/^(G-[A-Z0-9]+)?$/)
    expect(analytics.staging.hosts).toEqual(['gfnnn.github.io', 'beanstalk-e61.pages.dev'])
    expect(analytics.production.hosts).toEqual(['beansprout.ink'])
  })

  it('maps the real staging hosts to the real staging ID (and the apex to production)', async () => {
    const { analytics } = await vi.importActual('../src/data/analytics.js')
    for (const host of ['gfnnn.github.io', 'beanstalk-e61.pages.dev']) {
      expect(measurementIdFor(host, analytics)).toBe(analytics.staging.measurementId)
    }
    expect(measurementIdFor('beansprout.ink', analytics)).toBe(analytics.production.measurementId)
  })
})

describe('initAnalytics (when gtag loads)', () => {
  it('loads gtag with signals and ad personalisation off on a configured host', () => {
    initAnalytics({ hostname: 'staging.example' })
    expect(gtagScript().src).toBe(`https://www.googletagmanager.com/gtag/js?id=${ID}`)
    expect(gtagScript().async).toBe(true)
    const config = pushed().find(a => a[0] === 'config')
    expect(config[1]).toBe(ID)
    expect(config[2]).toMatchObject({ allow_google_signals: false, allow_ad_personalization_signals: false })
  })

  it('loads nothing on localhost / unknown hosts', () => {
    initAnalytics({ hostname: 'localhost' })
    initAnalytics({ hostname: 'example.com' })
    expect(gtagScript()).toBeNull()
    expect(window.dataLayer).toBeUndefined()
  })

  it('loads nothing (and does not throw) on the production host while its ID is empty', () => {
    expect(() => initAnalytics({ hostname: 'beansprout.ink' })).not.toThrow()
    expect(gtagScript()).toBeNull()
    expect(window.dataLayer).toBeUndefined()
  })

  it('loads nothing once the visitor has opted out, and sets ga-disable', () => {
    localStorage.setItem(OPT_OUT_KEY, '1')
    initAnalytics({ hostname: 'staging.example' })
    expect(gtagScript()).toBeNull()
    expect(window.dataLayer).toBeUndefined()
    expect(window[`ga-disable-${ID}`]).toBe(true)
  })

  it('honours Global Privacy Control as an opt-out', () => {
    setGpc(true)
    initAnalytics({ hostname: 'staging.example' })
    expect(gtagScript()).toBeNull()
    expect(window.dataLayer).toBeUndefined()
    expect(optOutReason()).toBe('gpc')
  })

  it('treats unreadable storage as opted out', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('blocked') })
    initAnalytics({ hostname: 'staging.example' })
    expect(gtagScript()).toBeNull()
    expect(optOutReason()).toBe('storage')
  })
})

describe('track (allowlist: no PII ever reaches gtag)', () => {
  beforeEach(() => initAnalytics({ hostname: 'staging.example' }))

  it('sends the two conversion events with their fixed params', () => {
    track('generate_lead', { form: 'enquiry' })
    track('generate_lead', { form: 'flash' })
    track('sign_up', { method: 'newsletter' })
    expect(events()).toEqual([
      ['event', 'generate_lead', { form: 'enquiry' }],
      ['event', 'generate_lead', { form: 'flash' }],
      ['event', 'sign_up', { method: 'newsletter' }],
    ])
  })

  it('strips any param that is not allowlisted or not an allowed value', () => {
    track('generate_lead', {
      form: 'enquiry', email: 'robin@example.com', name: 'Robin', idea: 'allergic to nickel',
    })
    track('sign_up', { method: 'robin@example.com' })
    const sent = JSON.stringify(events())
    for (const v of ['robin@example.com', 'Robin', 'nickel']) expect(sent).not.toContain(v)
    expect(events()).toEqual([
      ['event', 'generate_lead', { form: 'enquiry' }],
      ['event', 'sign_up', {}],
    ])
  })

  it('drops events that are not allowlisted', () => {
    track('social_click', { network: 'instagram' })
    track('enquiry_submit', { type: 'custom' })
    expect(events()).toEqual([])
    expect(safeParams('anything', {})).toBeNull()
  })

  it('never throws, even if gtag does', () => {
    window.gtag = () => { throw new Error('provider blew up') }
    expect(() => track('sign_up', { method: 'newsletter' })).not.toThrow()
  })
})

describe('track(…, done) before a navigation', () => {
  it('runs done immediately when analytics is off', () => {
    const done = vi.fn()
    track('generate_lead', { form: 'enquiry' }, done)
    expect(done).toHaveBeenCalledTimes(1)
  })

  it('runs done once: on gtag\'s callback, or after the timeout if that never comes', () => {
    vi.useFakeTimers()
    initAnalytics({ hostname: 'staging.example' })
    const done = vi.fn()
    track('generate_lead', { form: 'enquiry' }, done)
    expect(done).not.toHaveBeenCalled() // waiting for the hit
    const [, , params] = events()[0]
    params.event_callback() // gtag confirms the send
    vi.advanceTimersByTime(1000) // and the fallback timer fires later
    expect(done).toHaveBeenCalledTimes(1)
  })

  it('falls back to the timeout when gtag never calls back', () => {
    vi.useFakeTimers()
    initAnalytics({ hostname: 'staging.example' })
    const done = vi.fn()
    track('generate_lead', { form: 'enquiry' }, done)
    vi.advanceTimersByTime(1000)
    expect(done).toHaveBeenCalledTimes(1)
  })
})

describe('the /privacy/ opt-out control', () => {
  const mount = () => {
    document.body.innerHTML = `
      <div data-analytics-optout hidden>
        <p data-analytics-status role="status"></p>
        <button type="button" data-analytics-toggle>Turn off analytics</button>
      </div>`
    initAnalytics({ hostname: 'staging.example' })
    return {
      root: document.querySelector('[data-analytics-optout]'),
      status: document.querySelector('[data-analytics-status]'),
      btn: document.querySelector('[data-analytics-toggle]'),
    }
  }

  it('reveals itself and reports analytics as on', () => {
    const { root, status, btn } = mount()
    expect(root.hidden).toBe(false)
    expect(status.textContent).toMatch(/on in this browser/i)
    expect(btn.textContent).toBe('Turn off analytics')
  })

  it('opting out saves the choice, disables gtag, clears _ga cookies and stops events', () => {
    // biome-ignore lint/suspicious/noDocumentCookie: seeding GA cookies for the test
    document.cookie = '_ga=GA1.1.123; path=/'
    // biome-ignore lint/suspicious/noDocumentCookie: seeding GA cookies for the test
    document.cookie = '_ga_ABC=GS1.1.456; path=/'
    const { status, btn } = mount()
    btn.click()
    expect(localStorage.getItem(OPT_OUT_KEY)).toBe('1')
    expect(window[`ga-disable-${ID}`]).toBe(true)
    expect(document.cookie).not.toMatch(/_ga/)
    expect(status.textContent).toMatch(/off in this browser/i)
    expect(btn.textContent).toBe('Turn analytics back on')
    track('sign_up', { method: 'newsletter' })
    expect(events()).toEqual([])
  })

  it('the choice persists: a later page load does not load gtag', () => {
    mount().btn.click()
    _resetForTests()
    document.head.innerHTML = ''
    delete window.dataLayer
    initAnalytics({ hostname: 'staging.example' })
    expect(gtagScript()).toBeNull()
  })

  it('opting back in clears the flag and resumes tracking', () => {
    const { btn } = mount()
    btn.click() // off
    btn.click() // back on
    expect(localStorage.getItem(OPT_OUT_KEY)).toBeNull()
    expect(window[`ga-disable-${ID}`]).toBe(false)
    track('sign_up', { method: 'newsletter' })
    expect(events()).toHaveLength(1)
    expect(document.querySelectorAll('script[src*="googletagmanager"]')).toHaveLength(1) // not re-injected
  })

  it('explains GPC and hides the button when the browser sends it', () => {
    setGpc(true)
    const { status, btn } = mount()
    expect(status.textContent).toMatch(/Global Privacy Control/)
    expect(btn.hidden).toBe(true)
  })

  it('says analytics isn\'t running (not "on") on a host with no ID', () => {
    document.body.innerHTML = `
      <div data-analytics-optout hidden>
        <p data-analytics-status></p><button type="button" data-analytics-toggle></button>
      </div>`
    initAnalytics({ hostname: 'beansprout.ink' }) // production, ID still empty
    const status = document.querySelector('[data-analytics-status]')
    expect(status.textContent).toMatch(/isn’t running/)
    expect(status.textContent).not.toMatch(/on in this browser/)
    document.querySelector('[data-analytics-toggle]').click()
    expect(localStorage.getItem(OPT_OUT_KEY)).toBe('1') // choice still saved for later
  })

  it('an opt-out from another tab stops this page sending', () => {
    initAnalytics({ hostname: 'staging.example' })
    localStorage.setItem(OPT_OUT_KEY, '1')
    window.dispatchEvent(new StorageEvent('storage', { key: OPT_OUT_KEY, newValue: '1' }))
    track('sign_up', { method: 'newsletter' })
    expect(events()).toEqual([])
    expect(window[`ga-disable-${ID}`]).toBe(true)
  })

  it('a page restored from the bfcache re-checks the opt-out', () => {
    initAnalytics({ hostname: 'staging.example' })
    localStorage.setItem(OPT_OUT_KEY, '1')
    const ev = new Event('pageshow')
    Object.defineProperty(ev, 'persisted', { value: true })
    window.dispatchEvent(ev)
    track('sign_up', { method: 'newsletter' })
    expect(events()).toEqual([])
  })

  it('no-ops on pages without the control', () => {
    document.body.innerHTML = '<p>nothing here</p>'
    expect(() => initAnalytics({ hostname: 'localhost' })).not.toThrow()
  })
})

describe('the owner flag (?owner=1 → gtag never loads)', () => {
  const visit = path => history.replaceState(null, '', path)
  afterEach(() => visit('/'))
  const nothingLoaded = () => gtagScript() === null && window.dataLayer === undefined

  it('an ordinary visitor loads gtag and sees no owner note', () => {
    initAnalytics({ hostname: 'staging.example' })
    expect(isOwner()).toBe(false)
    expect(gtagScript()).not.toBeNull()
    expect(document.querySelector('[data-owner-mode]')).toBeNull()
  })

  it('?owner=1 saves the flag and loads nothing on that same page load', () => {
    visit('/flash/?owner=1')
    initAnalytics({ hostname: 'staging.example' })
    expect(localStorage.getItem(OWNER_KEY)).toBe('1')
    expect(nothingLoaded()).toBe(true)
  })

  it('the flag persists: a later visit loads nothing and track() is a no-op', () => {
    localStorage.setItem(OWNER_KEY, '1')
    initAnalytics({ hostname: 'staging.example' })
    const done = vi.fn()
    track('generate_lead', { form: 'enquiry' }, done)
    expect(nothingLoaded()).toBe(true)
    expect(done).toHaveBeenCalledTimes(1)
  })

  it('?owner=0 clears the flag and analytics loads again', () => {
    localStorage.setItem(OWNER_KEY, '1')
    visit('/?owner=0')
    initAnalytics({ hostname: 'staging.example' })
    expect(localStorage.getItem(OWNER_KEY)).toBeNull()
    expect(gtagScript()).not.toBeNull()
    expect(location.search).toBe('')
  })

  it('strips the param before gtag is configured, keeping the rest of the URL', () => {
    visit('/portfolio/?style=fine-line&owner=0#top')
    let urlAtConfig
    // loadGtag reuses an existing dataLayer, so seed one that notes the URL.
    window.dataLayer = []
    window.dataLayer.push = function (entry) {
      if (entry?.[0] === 'config') urlAtConfig = location.href
      return Array.prototype.push.call(this, entry)
    }
    initAnalytics({ hostname: 'staging.example' })
    expect(urlAtConfig).toMatch(/\/portfolio\/\?style=fine-line#top$/)
    expect(location.href).not.toContain('owner')
  })

  it('strips the param on a host with no ID too, and ignores other values', () => {
    visit('/?owner=yes')
    initAnalytics({ hostname: 'localhost' })
    expect(location.search).toBe('')
    expect(isOwner()).toBe(false)
  })

  it('shows a footer note while the flag is set, once', () => {
    document.body.innerHTML = '<footer><div class="footer-bottom"></div></footer>'
    localStorage.setItem(OWNER_KEY, '1')
    initAnalytics({ hostname: 'localhost' })
    initAnalytics({ hostname: 'localhost' })
    const notes = document.querySelectorAll('.footer-bottom [data-owner-mode]')
    expect(notes).toHaveLength(1)
    expect(notes[0].textContent).toMatch(/Owner mode/)
  })

  it('expires _ga cookies left from before the flag was set', () => {
    // biome-ignore lint/suspicious/noDocumentCookie: seeding a GA cookie for the test
    document.cookie = '_ga=GA1.1.1.1; path=/'
    localStorage.setItem(OWNER_KEY, '1')
    initAnalytics({ hostname: 'staging.example' })
    expect(document.cookie).not.toContain('_ga')
  })

  it('the /privacy/ control says owner mode, and its toggle cannot load gtag', () => {
    document.body.innerHTML = `
      <div data-analytics-optout hidden>
        <p data-analytics-status></p>
        <button data-analytics-toggle></button>
      </div>`
    localStorage.setItem(OWNER_KEY, '1')
    initAnalytics({ hostname: 'staging.example' })
    expect(document.querySelector('[data-analytics-status]').textContent).toMatch(/Owner mode/)
    const btn = document.querySelector('[data-analytics-toggle]')
    btn.click() // opt out
    btn.click() // opt back in
    expect(nothingLoaded()).toBe(true)
  })

  it('unreadable storage: not an owner, and the param is still stripped', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('blocked') })
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('blocked') })
    visit('/?owner=1')
    expect(() => initAnalytics({ hostname: 'staging.example' })).not.toThrow()
    expect(isOwner()).toBe(false)
    expect(location.search).toBe('')
  })
})

describe('gtag.js load timing (deferred until the page has been revealed, its entrance has played, and it has loaded)', () => {
  // The real scheduler: pageReady (resolved here by a page with no preloader) →
  // ENTRANCE_SETTLE_MS for the entrance, and load → an idle moment. jsdom is
  // already `complete` and has no requestIdleCallback, so that last step is the
  // 1 ms timeout fallback.
  const flush = async () => { for (let i = 0; i < 5; i++) await Promise.resolve() }
  beforeEach(() => {
    _resetForTests({ defer: null })
    vi.useFakeTimers()
    initPageLoader()
  })

  it('sets up the queue at init but injects the script only afterwards', async () => {
    initAnalytics({ hostname: 'staging.example' })
    expect(gtagScript()).toBeNull()
    expect(pushed().some(a => a[0] === 'config' && a[1] === ID)).toBe(true)
    await flush()
    await vi.advanceTimersByTimeAsync(ENTRANCE_SETTLE_MS - 1)
    expect(gtagScript()).toBeNull() // revealed and loaded, but the entrance is still playing
    await vi.advanceTimersByTimeAsync(10)
    expect(gtagScript().src).toBe(`https://www.googletagmanager.com/gtag/js?id=${ID}`)
  })

  // A reduced-motion visitor skips the preloader's hold and the whole entrance,
  // but must still be counted: the reveal still resolves pageReady, so the script
  // still arrives after the same settle window. Fresh module instances, because
  // pageReady is a module-level promise the suite above has already resolved.
  it('a reduced-motion visitor is still counted: the script loads after the settle window', async () => {
    vi.resetModules()
    sessionStorage.clear() // a cold load: the cover is really shown
    window.matchMedia = () => ({ matches: true }) // prefers-reduced-motion: reduce
    document.body.innerHTML = '<div id="page-loader"></div>'
    try {
      const loader = await import('../src/js/modules/loader.js')
      const analytics = await import('../src/js/modules/analytics.js')
      loader.initPageLoader()
      analytics.initAnalytics({ hostname: 'staging.example' })
      expect(gtagScript()).toBeNull()
      await flush()
      expect(document.getElementById('page-loader')).toBeNull() // lifted with no hold
      await vi.advanceTimersByTimeAsync(ENTRANCE_SETTLE_MS - 1)
      expect(gtagScript()).toBeNull()
      await vi.advanceTimersByTimeAsync(10)
      expect(gtagScript().src).toBe(`https://www.googletagmanager.com/gtag/js?id=${ID}`)
    } finally {
      delete window.matchMedia
    }
  })

  it('an event tracked during the wait is queued and brings the script forward at once', async () => {
    initAnalytics({ hostname: 'staging.example' })
    expect(gtagScript()).toBeNull()
    track('sign_up', { method: 'newsletter' })
    expect(events()).toEqual([['event', 'sign_up', { method: 'newsletter' }]])
    expect(gtagScript()).not.toBeNull() // no waiting on load/idle: the caller may be about to navigate
    await flush()
    await vi.advanceTimersByTimeAsync(5000)
    expect(document.querySelectorAll('script[src*="googletagmanager"]')).toHaveLength(1) // the deferred run is a no-op
  })

  it('a dropped event does not bring the script forward', async () => {
    initAnalytics({ hostname: 'staging.example' })
    track('not_allowed', { anything: 'x' })
    expect(gtagScript()).toBeNull()
  })

  it('never injects the script if the visitor opts out while it is waiting', async () => {
    document.body.innerHTML = `<div data-analytics-optout hidden>
      <p data-analytics-status></p><button data-analytics-toggle></button></div>`
    initAnalytics({ hostname: 'staging.example' })
    document.querySelector('[data-analytics-toggle]').click() // off, before the script loads
    await flush()
    await vi.advanceTimersByTimeAsync(5000)
    expect(gtagScript()).toBeNull()
    expect(window[`ga-disable-${ID}`]).toBe(true)
  })

  it('loads once after opting out and back in during the wait', async () => {
    document.body.innerHTML = `<div data-analytics-optout hidden>
      <p data-analytics-status></p><button data-analytics-toggle></button></div>`
    initAnalytics({ hostname: 'staging.example' })
    const btn = document.querySelector('[data-analytics-toggle]')
    btn.click() // off
    btn.click() // back on
    await flush()
    await vi.advanceTimersByTimeAsync(5000)
    expect(document.querySelectorAll('script[src*="googletagmanager"]')).toHaveLength(1)
  })

  it('opting out, letting the wait run out, then opting back in configures gtag only once', async () => {
    document.body.innerHTML = `<div data-analytics-optout hidden>
      <p data-analytics-status></p><button data-analytics-toggle></button></div>`
    initAnalytics({ hostname: 'staging.example' })
    const btn = document.querySelector('[data-analytics-toggle]')
    btn.click() // off
    await flush()
    await vi.advanceTimersByTimeAsync(5000) // the deferred run finds the opt-out and stands down
    expect(gtagScript()).toBeNull()
    btn.click() // back on: queues the script again
    await flush()
    await vi.advanceTimersByTimeAsync(5000)
    expect(document.querySelectorAll('script[src*="googletagmanager"]')).toHaveLength(1)
    expect(pushed().filter(a => a[0] === 'config')).toHaveLength(1)
    expect(pushed().filter(a => a[0] === 'js')).toHaveLength(1)
  })
})
