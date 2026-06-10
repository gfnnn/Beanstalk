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
import { initPageLoader } from '../src/js/modules/loader.js'

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
})
