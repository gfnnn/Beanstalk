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
  '<!doctype html><html><head><title>t</title></head><body>' + body + '</body></html>'

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
  })
  afterEach(() => { vi.restoreAllMocks() })

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

  it('on a near-instant load, fades straight out without the quick-cycle outro', async () => {
    setReducedMotion(false)
    vi.useFakeTimers()
    vi.spyOn(performance, 'now').mockReturnValue(50) // < INSTANT_MS → effectively instant
    mountOverlay()
    initPageLoader()
    await vi.runAllTimersAsync()
    expect(document.documentElement.classList.contains('page-loaded')).toBe(true)
    expect(document.getElementById('page-loader')).toBeNull()
    vi.useRealTimers()
  })

  it('when it actually covered a load, plays the quick cycle (.pl-finishing) then fades', async () => {
    setReducedMotion(false)
    vi.useFakeTimers()
    vi.spyOn(performance, 'now').mockReturnValue(1200) // > INSTANT_MS → real load
    mountOverlay()
    initPageLoader()

    // The fonts.ready microtask runs first; the outro class lands before the fade.
    await vi.advanceTimersByTimeAsync(0)
    expect(document.getElementById('page-loader').classList.contains('pl-finishing')).toBe(true)
    expect(document.documentElement.classList.contains('page-loaded')).toBe(false)

    // Then the quick cycle elapses and the cover fades out + is removed.
    await vi.runAllTimersAsync()
    expect(document.documentElement.classList.contains('page-loaded')).toBe(true)
    expect(document.getElementById('page-loader')).toBeNull()
    vi.useRealTimers()
  })
})
