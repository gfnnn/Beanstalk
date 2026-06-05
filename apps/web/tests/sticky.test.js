// @vitest-environment jsdom
//
// Tests for the shared sticky-shadow helper (src/js/modules/sticky.js). It pins a
// `.stuck` class on a bar the moment it sits flush under the fixed nav — one
// IntersectionObserver whose rootMargin is offset by the --nav-h custom property,
// so "stuck" fires at the bottom of the nav, not the top of the viewport. jsdom
// implements neither IntersectionObserver nor custom-property resolution via
// getComputedStyle, so we install a mock observer (to drive the callback and read
// the constructor options) and stub getComputedStyle where the exact nav-h matters.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { initStickyShadow } from '../src/js/modules/sticky.js'

let instances
class MockIO {
  constructor(cb, opts) { this.cb = cb; this.opts = opts; this.observed = []; instances.push(this) }
  observe(el) { this.observed.push(el) }
  disconnect() {}
  // test helper: deliver one entry (sticky destructures `[entry]`)
  fire(entry) { this.cb([entry]) }
}

beforeEach(() => { instances = [] })
afterEach(() => { vi.unstubAllGlobals() })

const bar = () => {
  document.body.innerHTML = '<div id="bar"></div>'
  return document.getElementById('bar')
}

describe('initStickyShadow', () => {
  it('no-ops when the element is absent (no observer created)', () => {
    vi.stubGlobal('IntersectionObserver', MockIO)
    expect(() => initStickyShadow(null)).not.toThrow()
    expect(instances).toHaveLength(0)
  })

  it('no-ops when IntersectionObserver is unsupported', () => {
    // Nothing stubbed → jsdom has no IntersectionObserver, so the guard bails.
    expect('IntersectionObserver' in window).toBe(false)
    expect(() => initStickyShadow(bar())).not.toThrow()
  })

  it('observes the element and toggles .stuck with the intersection state', () => {
    vi.stubGlobal('IntersectionObserver', MockIO)
    const el = bar()
    initStickyShadow(el)
    expect(instances).toHaveLength(1)
    expect(instances[0].observed).toEqual([el])

    // Pinned under the nav (the sentinel scrolled out) → drop the shadow.
    instances[0].fire({ isIntersecting: false })
    expect(el.classList.contains('stuck')).toBe(true)

    // Released back into the flow → no shadow.
    instances[0].fire({ isIntersecting: true })
    expect(el.classList.contains('stuck')).toBe(false)
  })

  it('offsets the rootMargin by the --nav-h custom property', () => {
    vi.stubGlobal('IntersectionObserver', MockIO)
    vi.stubGlobal('getComputedStyle', () => ({ getPropertyValue: () => '80px' }))
    initStickyShadow(bar())
    expect(instances[0].opts.rootMargin).toBe('-80px 0px 0px 0px')
    expect(instances[0].opts.threshold).toBe(1)
  })

  it('falls back to 65px when --nav-h is unset', () => {
    vi.stubGlobal('IntersectionObserver', MockIO)
    // Real getComputedStyle returns '' for the unset custom prop → the `|| '65px'`
    // fallback in the module kicks in.
    initStickyShadow(bar())
    expect(instances[0].opts.rootMargin).toBe('-65px 0px 0px 0px')
  })
})
