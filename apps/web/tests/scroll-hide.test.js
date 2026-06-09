// @vitest-environment jsdom
//
// Behaviour tests for the scroll-hide helper (src/js/modules/scroll-hide.js): the
// portfolio filter bar tucks away on scroll-DOWN and comes back on scroll-UP, on
// mobile only. jsdom has no layout/scroll engine, so we drive window.scrollY by
// hand, stub matchMedia for the breakpoint, and pin the bar's offsetTop (the
// "resting position" the helper keeps it shown above). The handler is rAF-latched,
// so each scroll is followed by a flushed frame before asserting.
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { initScrollHide } from '../src/js/modules/scroll-hide.js'

const frame = () => new Promise(r => requestAnimationFrame(r))

// Scroll to `y`, fire the native scroll event, and let the rAF latch run once.
async function scrollTo(y) {
  window.scrollY = y
  window.dispatchEvent(new window.Event('scroll'))
  await frame()
}

let mqListeners
// Mock matchMedia with a flippable `matches` and a captured change listener so a
// test can simulate crossing the breakpoint.
function mockMatchMedia(matches) {
  mqListeners = []
  const mq = {
    matches,
    addEventListener: (_t, cb) => mqListeners.push(cb),
  }
  window.matchMedia = () => mq
  return mq
}

function bar(offsetTop = 100) {
  document.body.innerHTML = '<div id="filter-bar"><button id="chip">All</button></div>'
  const el = document.getElementById('filter-bar')
  Object.defineProperty(el, 'offsetTop', { value: offsetTop, configurable: true })
  return el
}

const hidden = el => el.classList.contains('bar-hidden')

beforeEach(() => { window.scrollY = 0; document.body.innerHTML = '' })
afterEach(() => { delete window.matchMedia })

describe('initScrollHide', () => {
  it('no-ops when the element is absent', () => {
    mockMatchMedia(true)
    expect(() => initScrollHide(null)).not.toThrow()
  })

  it('hides the bar when scrolling down past its resting position (mobile)', async () => {
    mockMatchMedia(true)
    const el = bar(100)
    initScrollHide(el)

    await scrollTo(400) // well below offsetTop, moving down
    expect(hidden(el)).toBe(true)
  })

  it('reveals the bar again when scrolling back up (mobile)', async () => {
    mockMatchMedia(true)
    const el = bar(100)
    initScrollHide(el)

    await scrollTo(400)
    expect(hidden(el)).toBe(true)

    await scrollTo(250) // moved up (delta < 0) but still below the resting spot
    expect(hidden(el)).toBe(false)
  })

  it('keeps the bar shown while it has not pinned yet (below the pin point), even scrolling down', async () => {
    mockMatchMedia(true)
    const el = bar(300) // pins at offsetTop − nav ≈ 235 (65px nav fallback in jsdom)
    initScrollHide(el)

    await scrollTo(150) // scrolled DOWN, but the bar is still in flow (not pinned)
    expect(hidden(el)).toBe(false)
  })

  // Regression guard for the nav-height dead band: with the threshold at the bar's
  // full offsetTop, the bar would pin under the nav (cover the grid) yet refuse to
  // hide until scrolled a further nav-height down. It must hide as soon as it pins.
  it('hides as soon as the bar is pinned (no nav-height dead band)', async () => {
    mockMatchMedia(true)
    const el = bar(300) // pin point ≈ 235; full offsetTop is 300
    initScrollHide(el)

    await scrollTo(240) // just past the pin point, scrolling down — between 235 and 300
    expect(hidden(el)).toBe(true)
  })

  it('ignores a tiny scroll delta (no flicker from momentum/sub-pixel jitter)', async () => {
    mockMatchMedia(true)
    const el = bar(100)
    initScrollHide(el)

    await scrollTo(400)            // down → hidden
    await scrollTo(300)            // up   → shown again, still below the resting spot
    expect(hidden(el)).toBe(false)

    await scrollTo(302) // +2px, inside the deadzone → no change
    expect(hidden(el)).toBe(false)
  })

  it('never hides on desktop (the breakpoint does not match)', async () => {
    mockMatchMedia(false)
    const el = bar(100)
    initScrollHide(el)

    await scrollTo(800)
    expect(hidden(el)).toBe(false)
  })

  it('reveals a hidden bar when a control inside it takes focus', async () => {
    mockMatchMedia(true)
    const el = bar(100)
    initScrollHide(el)

    await scrollTo(400)
    expect(hidden(el)).toBe(true)

    el.dispatchEvent(new window.Event('focusin', { bubbles: true }))
    expect(hidden(el)).toBe(false)
  })

  it('clears the hidden state when the viewport grows past the breakpoint', async () => {
    const mq = mockMatchMedia(true)
    const el = bar(100)
    initScrollHide(el)

    await scrollTo(400)
    expect(hidden(el)).toBe(true)

    // Simulate crossing to desktop: flip the query and fire its change listener.
    mq.matches = false
    mqListeners.forEach(cb => cb({ matches: false }))
    expect(hidden(el)).toBe(false)
  })
})
