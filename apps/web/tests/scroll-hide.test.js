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

    await scrollTo(302) // +2px, below the directional threshold → no change
    expect(hidden(el)).toBe(false)
  })

  // Regression guard for the mobile flicker: while scrolling DOWN, momentum bounce /
  // the address-bar reveal nudges scrollY a few px back up for a frame. The bar must
  // NOT pop back into view on those sub-threshold wobbles — only a sustained scroll-up
  // should reveal it. (The old per-frame ±4px deadzone revealed it on any > 4px nudge.)
  it('does not reveal a hidden bar on sub-threshold upward wobble while scrolling down', async () => {
    mockMatchMedia(true)
    const el = bar(100)
    initScrollHide(el)

    await scrollTo(400)        // down → hidden
    expect(hidden(el)).toBe(true)

    await scrollTo(392)        // −8px wobble (under the 12px threshold) → stay hidden
    expect(hidden(el)).toBe(true)
    await scrollTo(410)        // back down → stay hidden
    expect(hidden(el)).toBe(true)
    await scrollTo(404)        // −6px wobble → still hidden
    expect(hidden(el)).toBe(true)
  })

  // A deliberate, sustained scroll-up of more than the threshold still reveals it —
  // the wobble immunity must not make the reveal sluggish for a real upward scroll.
  it('reveals on a sustained upward scroll past the threshold', async () => {
    mockMatchMedia(true)
    const el = bar(100)
    initScrollHide(el)

    await scrollTo(400)        // down → hidden
    expect(hidden(el)).toBe(true)
    await scrollTo(380)        // −20px (> threshold) → shown
    expect(hidden(el)).toBe(false)
  })

  // Regression guard for the REPORTED bug (Android/iOS): a single flick retracts the
  // browser toolbar, which changes the viewport height AND perturbs scrollY for a few
  // frames. Those frames must not toggle the bar — only deltas against a STABLE
  // viewport count. jsdom has no visualViewport, so the helper falls back to
  // window.innerHeight; we move it to simulate the toolbar sliding away mid-scroll.
  it('does not flip the bar while the viewport height is changing (toolbar in motion)', async () => {
    mockMatchMedia(true)
    const el = bar(100)
    const realInnerHeight = window.innerHeight
    const setVH = h => Object.defineProperty(window, 'innerHeight', { value: h, configurable: true })
    initScrollHide(el)

    try {
      await scrollTo(400)             // clean scroll-down (stable viewport) → hidden
      expect(hidden(el)).toBe(true)

      // Toolbar retracts: viewport grows by ~56px AND scrollY blips back up. A naive
      // delta would read −50 as a scroll-up and reveal the bar; the resize gate
      // swallows it (and the settle window covers the frames just after).
      setVH(realInnerHeight + 56)
      await scrollTo(350)
      expect(hidden(el)).toBe(true)
      await scrollTo(360)             // settling artifact, still gated → stay hidden
      expect(hidden(el)).toBe(true)
    } finally {
      Object.defineProperty(window, 'innerHeight', { value: realInnerHeight, configurable: true })
    }
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
