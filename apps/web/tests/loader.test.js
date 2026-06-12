// @vitest-environment jsdom
//
// The full-page preloader has two halves, both covered here:
//   · src/build/loader.js     — injects the overlay + its critical CSS at build
//   · src/js/modules/loader.js — dismisses it once the page is ready
// The overlay covers every page from the first paint so the slow CSS/font arrival
// never shows as unstyled "broken" content; the module fades it out on
// document.fonts.ready (with a hard ceiling so it can never trap the page).
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { injectPageLoader, LOADER_STYLE, LOADER_MARKUP } from '../src/build/loader.js'
import { initPageLoader, QUICK_LIFT_MS, MIN_SHOW_MS } from '../src/js/modules/loader.js'

const doc = body =>
  `<!doctype html><html><head><title>t</title></head><body>${body}</body></html>`

describe('injectPageLoader (build-time)', () => {
  it('adds the critical <style> into the head and the overlay after <body>', () => {
    const out = injectPageLoader(doc(''))
    expect(out).toContain('<style id="page-loader-css">')
    expect(out).toContain('id="page-loader"')
    // overlay sits at the very start of the body, before existing content
    expect(out.indexOf('id="page-loader"')).toBeGreaterThan(out.indexOf('<body>'))
    // the style lands inside the head (before </head>)
    expect(out.indexOf('page-loader-css')).toBeLessThan(out.indexOf('</head>'))
  })

  it('is idempotent — a second pass does not double-inject', () => {
    const once  = injectPageLoader(doc('<main></main>'))
    const twice = injectPageLoader(once)
    expect(twice.match(/id="page-loader-css"/g)).toHaveLength(1)
    expect(twice.match(/id="page-loader"[^-]/g)).toHaveLength(1)
  })

  it('carries an accessible label and a pure-CSS failsafe reveal', () => {
    expect(LOADER_MARKUP).toContain('role="status"')
    expect(LOADER_MARKUP).toContain('aria-label="Loading"')
    // the failsafe animation guarantees the page shows even if the bundle never runs
    expect(LOADER_STYLE).toContain('pl-failsafe')
  })

  it('shows the preloader mark complete — never a reveal-from-invisible (mobile regression guard)', () => {
    // The cover dismisses on fonts.ready, near-instant on a mobile/cached load, so
    // the mark must NOT animate from hidden — a clip-path/opacity reveal here left
    // it unseen on quick covers. It only breathes; the ink-rise draw lives on the
    // nav + confirmation marks (atmosphere.css), past the dismiss race.
    expect(LOADER_STYLE).not.toContain('clip-path')
    expect(LOADER_STYLE).not.toContain('pl-draw')
    expect(LOADER_STYLE).toContain('pl-breathe') // the gentle shown-complete idle
  })

  it('leaves a document with no head/body untouched', () => {
    const frag = '<div>just a fragment</div>'
    expect(injectPageLoader(frag)).toBe(frag)
  })
})

describe('initPageLoader (runtime dismissal)', () => {
  const setReducedMotion = matches => { window.matchMedia = () => ({ matches }) }

  beforeEach(() => {
    document.documentElement.className = ''
    document.body.innerHTML = ''
    // jsdom has no FontFaceSet; the module falls back to Promise.resolve().
    delete document.fonts
    // The warm/cold decision is read from sessionStorage; clear it so each test
    // controls it explicitly. (Without this the flag leaks between tests and a
    // "cold" case silently runs the warm path — which is how the cold dismissal
    // branch went uncovered before.)
    try { sessionStorage.clear() } catch (_) {}
  })
  afterEach(() => { vi.restoreAllMocks() })

  // Dispatch a transitionend the module's listener will act on. jsdom has no
  // TransitionEvent constructor, so stamp propertyName onto a plain Event.
  const transitionEnd = (el, propertyName) => {
    const ev = new window.Event('transitionend')
    Object.defineProperty(ev, 'propertyName', { value: propertyName })
    el.dispatchEvent(ev)
  }

  const mountOverlay = () => {
    document.body.innerHTML = LOADER_MARKUP
  }
  const flush = () => new Promise(res => setTimeout(res, 0))

  it('no-ops when the overlay is absent', () => {
    expect(() => initPageLoader()).not.toThrow()
    expect(document.documentElement.classList.contains('page-loaded')).toBe(false)
  })

  it('flips the page-loaded class and removes the overlay once ready (reduced motion)', async () => {
    // Reduced motion → immediate removal (no fade), so the assertion is deterministic.
    setReducedMotion(true)
    mountOverlay()
    initPageLoader()
    await flush()
    expect(document.documentElement.classList.contains('page-loaded')).toBe(true)
    expect(document.getElementById('page-loader')).toBeNull()
  })

  it('cold full motion: marks page-loaded, then removes the overlay via the 700ms failsafe', async () => {
    setReducedMotion(false)
    vi.useFakeTimers()
    mountOverlay()
    initPageLoader() // cold (sessionStorage cleared) → holds the cover, then fades
    // let the fonts.ready microtask settle, then run the removal-failsafe timer
    await vi.runAllTimersAsync()
    expect(document.documentElement.classList.contains('page-loaded')).toBe(true)
    expect(document.getElementById('page-loader')).toBeNull()
    vi.useRealTimers()
  })

  it('cold full motion: removes the overlay promptly on the opacity transitionend', async () => {
    setReducedMotion(false)
    mountOverlay()
    initPageLoader()
    await flush() // fonts.ready (Promise.resolve) → dismiss() runs, fade listener attached
    const loader = document.getElementById('page-loader')
    expect(document.documentElement.classList.contains('page-loaded')).toBe(true)
    expect(loader).not.toBeNull() // still present, mid-fade

    // The opacity transition end removes it — no need to wait for the 700ms failsafe.
    transitionEnd(loader, 'opacity')
    expect(document.getElementById('page-loader')).toBeNull()
  })

  it('cold full motion: a non-opacity transitionend does not remove early; the 700ms failsafe does', async () => {
    setReducedMotion(false)
    vi.useFakeTimers()
    mountOverlay()
    initPageLoader()
    await vi.advanceTimersByTimeAsync(0) // dismiss() runs, fade listener attached
    const loader = document.getElementById('page-loader')
    // A transform transition ending is the wrong signal — the cover must stay.
    transitionEnd(loader, 'transform')
    expect(document.getElementById('page-loader')).not.toBeNull()
    // …but the 700ms removal failsafe guarantees it's gone even if opacity never fires.
    await vi.advanceTimersByTimeAsync(700)
    expect(document.getElementById('page-loader')).toBeNull()
    vi.useRealTimers()
  })

  it('cold: the 3s hard ceiling dismisses even if fonts.ready never resolves', async () => {
    setReducedMotion(false)
    document.fonts = { ready: new Promise(() => {}) } // never resolves → only the ceiling can fire
    vi.useFakeTimers()
    mountOverlay()
    initPageLoader()
    await vi.advanceTimersByTimeAsync(0)
    expect(document.getElementById('page-loader')).not.toBeNull() // still covered before the ceiling
    await vi.advanceTimersByTimeAsync(3000) // hard ceiling → dismiss
    expect(document.documentElement.classList.contains('page-loaded')).toBe(true)
    await vi.advanceTimersByTimeAsync(700)  // removal failsafe
    expect(document.getElementById('page-loader')).toBeNull()
    vi.useRealTimers()
  })

  it('warm in-session navigation: drops the cover instantly, no fade or timers', () => {
    setReducedMotion(false)
    sessionStorage.setItem('bs-visited', '1') // a page already loaded this session
    mountOverlay()
    initPageLoader()
    // Removed synchronously, before the View Transition snapshots the new page —
    // no flush, no timers.
    expect(document.documentElement.classList.contains('page-loaded')).toBe(true)
    expect(document.getElementById('page-loader')).toBeNull()
  })

  describe('bimodal dismissal — all-or-nothing, never a half-played cover', () => {
    // The cover's visible time is measured from first-contentful-paint (the cover
    // IS the FCP). Stub an entry that puts it `ms` in the past at decision time.
    let savedGetEntriesByName
    beforeEach(() => { savedGetEntriesByName = performance.getEntriesByName })
    afterEach(() => {
      performance.getEntriesByName = savedGetEntriesByName
      vi.useRealTimers() // recover even if a fake-timer assertion failed mid-test
    })
    const coverVisibleFor = ms => {
      performance.getEntriesByName = () => [{ startTime: performance.now() - ms }]
    }

    it('QUICK: a cover seen under the lift budget lifts immediately, no hold', async () => {
      setReducedMotion(false)
      coverVisibleFor(QUICK_LIFT_MS / 4) // a sub-perceptual glimpse
      mountOverlay()
      initPageLoader()
      await flush() // fonts.ready → dismiss decides → no hold
      expect(document.documentElement.classList.contains('page-loaded')).toBe(true)
    })

    it('COMMIT: a registered cover holds to the minimum show, then fades — never mid-arc', async () => {
      setReducedMotion(false)
      // Fake ONLY the timers the hold uses — a blanket useFakeTimers() swaps the
      // performance internals, and the module would no longer see the FCP stub.
      vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
      coverVisibleFor(1000) // past QUICK, 600ms short of MIN_SHOW → must hold 600ms
      mountOverlay()
      initPageLoader()
      await vi.advanceTimersByTimeAsync(0) // fonts.ready resolves → dismiss decides
      // Committed: the page must NOT be revealed mid-performance…
      expect(document.documentElement.classList.contains('page-loaded')).toBe(false)
      // …the cover completes MIN_SHOW, then the fade (and the entrance) begin.
      await vi.advanceTimersByTimeAsync(MIN_SHOW_MS - 1000)
      expect(document.documentElement.classList.contains('page-loaded')).toBe(true)
    })

    it('a cover already past the minimum show fades without any extra hold', async () => {
      setReducedMotion(false)
      coverVisibleFor(MIN_SHOW_MS + 500) // slow load: the performance already played
      mountOverlay()
      initPageLoader()
      await flush()
      expect(document.documentElement.classList.contains('page-loaded')).toBe(true)
    })

    it('reduced motion skips the hold — lifts as soon as the page is ready', async () => {
      setReducedMotion(true)
      coverVisibleFor(1000) // would commit under full motion
      mountOverlay()
      initPageLoader()
      await flush()
      expect(document.documentElement.classList.contains('page-loaded')).toBe(true)
      expect(document.getElementById('page-loader')).toBeNull() // removed, no fade
    })
  })

  it('treats a mid-session RELOAD as cold — the cover is not instant-dropped', () => {
    // A reload re-fetches the render-blocking CSS/fonts and has no inbound View
    // Transition, so the warm instant-drop would re-expose the font-swap flash.
    setReducedMotion(false)
    sessionStorage.setItem('bs-visited', '1') // would otherwise read as warm
    const saved = performance.getEntriesByType
    performance.getEntriesByType = () => [{ type: 'reload' }]
    try {
      mountOverlay()
      initPageLoader()
      // Warm removes synchronously; a reload must keep the cover up (cold path)…
      expect(document.getElementById('page-loader')).not.toBeNull()
      // …including the cold-start flag for the nav-logo draw.
      expect(document.documentElement.classList.contains('cold-start')).toBe(true)
    } finally {
      performance.getEntriesByType = saved
    }
  })

  it('cold load flags <html> with cold-start (for the one-time nav-logo draw)', () => {
    setReducedMotion(false)
    mountOverlay()
    initPageLoader() // cold (sessionStorage cleared)
    expect(document.documentElement.classList.contains('cold-start')).toBe(true)
  })

  it('warm navigation does NOT flag cold-start (so the nav logo is not re-drawn)', () => {
    setReducedMotion(false)
    sessionStorage.setItem('bs-visited', '1')
    mountOverlay()
    initPageLoader()
    expect(document.documentElement.classList.contains('cold-start')).toBe(false)
  })

  describe('pagereveal coordination (cross-document View Transitions)', () => {
    const pagereveal = viewTransition => {
      const ev = new window.Event('pagereveal')
      if (viewTransition) ev.viewTransition = viewTransition
      window.dispatchEvent(ev)
    }

    it('warm: the belt-and-braces pagereveal after the instant drop is an inert second call', () => {
      setReducedMotion(false)
      sessionStorage.setItem('bs-visited', '1')
      mountOverlay()
      initPageLoader()                 // warm → removed synchronously
      expect(document.getElementById('page-loader')).toBeNull()
      expect(() => pagereveal({})).not.toThrow()   // removeNow() again → gone guard
      expect(document.documentElement.classList.contains('page-loaded')).toBe(true)
    })

    it('cold: a pagereveal CARRYING a view transition drops the cover before the VT snapshots it', () => {
      setReducedMotion(false)
      mountOverlay()
      initPageLoader()                 // cold → cover up, waiting on fonts
      expect(document.getElementById('page-loader')).not.toBeNull()
      pagereveal({ vt: true })         // an incoming cross-document transition
      expect(document.getElementById('page-loader')).toBeNull()
      expect(document.documentElement.classList.contains('page-loaded')).toBe(true)
    })

    it('cold: a pagereveal WITHOUT a view transition leaves the cover to the normal dismissal', () => {
      setReducedMotion(false)
      mountOverlay()
      initPageLoader()
      pagereveal(undefined)            // no VT → nothing to compose with
      expect(document.getElementById('page-loader')).not.toBeNull()
    })

    it('a commit-held fadeOut that fires after a pagereveal removal is an inert no-op', async () => {
      // The hold timer and the pagereveal race: if the VT removal wins, the held
      // fadeOut must hit the `gone` guard, not re-run the fade on a removed node.
      setReducedMotion(false)
      const saved = performance.getEntriesByName
      performance.getEntriesByName = () => [{ startTime: performance.now() - 1000 }] // → COMMIT, ~600ms hold
      vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
      try {
        mountOverlay()
        initPageLoader()
        await vi.advanceTimersByTimeAsync(0)  // fonts.ready → dismiss() arms the hold
        pagereveal({ vt: true })              // VT removal wins the race
        expect(document.getElementById('page-loader')).toBeNull()
        await expect(vi.runAllTimersAsync()).resolves.not.toThrow() // held fadeOut + 3s ceiling no-op
        expect(document.documentElement.classList.contains('page-loaded')).toBe(true)
      } finally {
        performance.getEntriesByName = saved
        vi.useRealTimers()
      }
    })
  })
})
