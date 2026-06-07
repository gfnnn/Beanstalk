// @vitest-environment jsdom
//
// Tests for the entrance/scroll animation orchestrator (src/js/modules/animations.js).
// GSAP's *visual* output is GSAP's job and is verified by the E2E/visual tier; what
// is unit-testable here — and what actually regresses — is the orchestration LOGIC:
//   · the reduced-motion gating (freeze the hero sprig + build nothing; scroll no-ops)
//   · the no-op guards (no hero heading / no grid items / no sprig markup)
//   · the documented "no flash" reveal decision — above-the-fold grids cascade on
//     LOAD (delay, no ScrollTrigger), below-the-fold reveal on scroll
//   · the per-item (`each`) stagger choice, the viewport-conditional offsets
//   · the mobile sticky-CTA IntersectionObserver wiring, and the debounced
//     ScrollTrigger.refresh on resize.
//
// So we mock GSAP + ScrollTrigger (the codebase already keeps the animation
// toolchain out of unit runs — see the lenis mocks in flash/aftercare) and assert
// which calls the module makes, on which targets, under which conditions. `reduced`
// is captured at module-evaluation time, so each test stubs matchMedia first and
// imports the module fresh (vi.resetModules), mirroring aftercare.test.js.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

// Shared recorder for the GSAP calls the module makes, created before the mock
// factory runs (vi.hoisted) so the mock can write into it.
const hoisted = vi.hoisted(() => {
  const calls = {
    registerPlugin: 0,
    timelines: [], // opts passed to gsap.timeline()
    tlFrom: [],    // { targets, vars } for a timeline's .from()
    tlFromTo: [],  // { targets, fromVars, toVars } for a timeline's .fromTo()
    from: [],      // { targets, vars } for gsap.from()
    to: [],        // { targets, vars } for gsap.to()
    mmAdds: [],    // queries passed to gsap.matchMedia().add()
    refresh: 0,    // ScrollTrigger.refresh() count
  }
  const reset = () => Object.assign(calls, {
    registerPlugin: 0, refresh: 0,
    timelines: [], tlFrom: [], tlFromTo: [], from: [], to: [], mmAdds: [],
  })
  return { calls, reset }
})

vi.mock('gsap', () => {
  // Faithful to the bits of gsap.utils.toArray the module relies on.
  const toArray = (x) => {
    if (!x) return []
    if (typeof x === 'string') return [...document.querySelectorAll(x)]
    if (x instanceof Element) return [x]
    if (typeof x.length === 'number') return [...x]
    return [x]
  }
  const timeline = (opts) => {
    hoisted.calls.timelines.push(opts || {})
    const tl = {
      from(t, vars) { hoisted.calls.tlFrom.push({ targets: toArray(t), vars }); return tl },
      fromTo(t, fromVars, toVars) { hoisted.calls.tlFromTo.push({ targets: toArray(t), fromVars, toVars }); return tl },
    }
    return tl
  }
  const gsap = {
    registerPlugin() { hoisted.calls.registerPlugin++ },
    matchMedia: () => ({
      add(query, fn) {
        hoisted.calls.mmAdds.push(query)
        if (window.matchMedia(query).matches) fn()
      },
    }),
    timeline,
    from(t, vars) { hoisted.calls.from.push({ targets: toArray(t), vars }) },
    to(t, vars) { hoisted.calls.to.push({ targets: toArray(t), vars }) },
    utils: { toArray },
  }
  return { default: gsap, gsap }
})

vi.mock('gsap/ScrollTrigger', () => ({
  ScrollTrigger: { refresh() { hoisted.calls.refresh++ } },
}))

const { calls } = hoisted

// Drive which media queries match: the reduced-motion flag + the viewport tier.
// gsap.matchMedia()'s mock consults this too, so the same stub picks the
// mobile/desktop reveal branch.
function stubMatchMedia({ reduced = false, viewport = 'desktop' } = {}) {
  window.matchMedia = (q) => {
    let matches = false
    if (q.includes('prefers-reduced-motion')) matches = reduced
    else if (q.includes('max-width: 899px')) matches = viewport === 'mobile'
    else if (q.includes('min-width: 900px')) matches = viewport === 'desktop'
    return { matches, addEventListener() {}, removeEventListener() {} }
  }
}

// Import the module fresh so its load-time `reduced` flag reflects the stub.
async function load({ reduced = false, viewport = 'desktop' } = {}) {
  stubMatchMedia({ reduced, viewport })
  vi.resetModules()
  hoisted.reset()
  return import('../src/js/modules/animations.js')
}

let ioInstances
class MockIO {
  constructor(cb, opts) { this.cb = cb; this.opts = opts; this.observed = []; ioInstances.push(this) }
  observe(el) { this.observed.push(el) }
  disconnect() {}
  fire(entry) { this.cb([entry]) } // sticky-CTA reads [e]
}

function mountFullHero() {
  document.body.innerHTML = `
    <section class="hero">
      <p class="hero-eyebrow">Eyebrow</p>
      <h1>Quiet ink</h1>
      <p class="hero-body">Body copy</p>
      <div class="hero-actions"><a class="btn">A</a><a class="btn">B</a></div>
      <div class="studio-notices">notices</div>
      <div class="hero-media">media</div>
      <svg class="hero-sprig" viewBox="0 0 140 300">
        <g class="hero-sprig-art">
          <path class="sprig-seed" pathLength="1"></path>
          <path class="sprig-stem" pathLength="1"></path>
          <g class="sprig-leaf" data-ox="70" data-oy="50" data-side="left"><path class="hero-sprig-path"></path></g>
          <g class="sprig-leaf" data-ox="70" data-oy="98" data-side="right"><path class="hero-sprig-path"></path></g>
          <path class="sprig-nub" pathLength="1"></path>
        </g>
      </svg>
    </section>`
}

const fromFor = el => calls.from.find(c => c.targets.includes(el))

beforeEach(() => {
  document.body.innerHTML = ''
  ioInstances = []
  vi.stubGlobal('IntersectionObserver', MockIO)
})
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers() })

describe('initHeroAnimation', () => {
  describe('reduced motion', () => {
    it('freezes the hero sprig and builds no entrance timeline', async () => {
      const { initHeroAnimation } = await load({ reduced: true })
      document.body.innerHTML = '<svg class="hero-sprig"></svg><section class="hero"><h1>x</h1></section>'
      const svg = document.querySelector('.hero-sprig')
      svg.pauseAnimations = vi.fn() // freezes the looping feTurbulence wobble (SMIL)
      initHeroAnimation()
      expect(svg.pauseAnimations).toHaveBeenCalledTimes(1)
      expect(calls.timelines).toHaveLength(0) // returned before any timeline
      expect(calls.tlFrom).toHaveLength(0)
      expect(calls.from).toHaveLength(0)
    })

    it('is safe when the hero sprig is absent', async () => {
      const { initHeroAnimation } = await load({ reduced: true })
      expect(() => initHeroAnimation()).not.toThrow()
      expect(calls.timelines).toHaveLength(0)
    })
  })

  describe('full motion', () => {
    it('no-ops when there is no hero heading', async () => {
      const { initHeroAnimation } = await load()
      document.body.innerHTML = '<section class="hero"><p class="hero-eyebrow">x</p></section>'
      initHeroAnimation()
      expect(calls.timelines).toHaveLength(0)
      expect(calls.from).toHaveLength(0)
    })

    it('animates every hero part that is present', async () => {
      const { initHeroAnimation } = await load()
      mountFullHero()
      initHeroAnimation()
      const targets = calls.tlFrom.flatMap(c => c.targets)
      expect(targets).toContain(document.querySelector('.hero h1'))
      expect(targets).toContain(document.querySelector('.hero-eyebrow'))
      expect(targets).toContain(document.querySelector('.hero-body'))
      expect(targets).toContain(document.querySelector('.studio-notices'))
      // the action buttons (a NodeList) are animated as a group too
      expect(calls.tlFrom.some(c => c.targets.includes(document.querySelector('.hero-actions .btn')))).toBe(true)
    })

    it('omits the optional parts that are absent (heading-only hero)', async () => {
      const { initHeroAnimation } = await load()
      document.body.innerHTML = '<section class="hero"><h1>Only a heading</h1></section>'
      initHeroAnimation()
      // exactly one beat — the heading — and no sprout timeline (no sprig present)
      expect(calls.timelines).toHaveLength(1)
      expect(calls.tlFrom).toHaveLength(1)
      expect(calls.tlFrom[0].targets).toContain(document.querySelector('h1'))
    })

    it('grows the sprout on its own timeline when the sprig markup is present', async () => {
      const { initHeroAnimation } = await load()
      mountFullHero()
      initHeroAnimation()
      // two timelines: the hero-text entrance + the sprout growth
      expect(calls.timelines).toHaveLength(2)
      const grown = calls.tlFromTo.flatMap(c => c.targets)
      expect(grown).toContain(document.querySelector('.sprig-stem'))
      expect(grown.some(el => el.classList.contains('sprig-leaf'))).toBe(true)
      expect(grown).toContain(document.querySelector('.hero-sprig-art')) // the perpetual sway
    })

    it('skips the sprout growth when the sprig is absent', async () => {
      const { initHeroAnimation } = await load()
      document.body.innerHTML = '<section class="hero"><h1>H</h1></section>'
      initHeroAnimation()
      expect(calls.timelines).toHaveLength(1) // hero-text only, no grow timeline
      expect(calls.tlFromTo).toHaveLength(0)
    })

    it('slides the media column in from the right on desktop', async () => {
      const { initHeroAnimation } = await load({ viewport: 'desktop' })
      mountFullHero()
      initHeroAnimation()
      expect(calls.mmAdds).toEqual(expect.arrayContaining(['(max-width: 899px)', '(min-width: 900px)']))
      const media = fromFor(document.querySelector('.hero-media'))
      expect(media).toBeTruthy()
      expect(media.vars.x).toBe(24)        // slides from the right edge
      expect(media.vars.y).toBeUndefined()
    })

    it('raises the media column up on mobile', async () => {
      const { initHeroAnimation } = await load({ viewport: 'mobile' })
      mountFullHero()
      initHeroAnimation()
      const media = fromFor(document.querySelector('.hero-media'))
      expect(media.vars.y).toBe(20)
      expect(media.vars.x).toBeUndefined()
    })
  })
})

describe('initScrollAnimations', () => {
  it('does nothing under reduced motion', async () => {
    const { initScrollAnimations } = await load({ reduced: true })
    document.body.innerHTML =
      '<section class="hero"></section><svg class="hero-sprig"></svg>' +
      '<div class="masonry"><article class="masonry-tile"></article></div><div id="mobile-cta"></div>'
    initScrollAnimations()
    expect(calls.to).toHaveLength(0)
    expect(calls.from).toHaveLength(0)
    expect(calls.mmAdds).toHaveLength(0)
    expect(ioInstances).toHaveLength(0) // no sticky-CTA observer wired
  })

  it('parallaxes the hero sprig with a scrubbed ScrollTrigger', async () => {
    const { initScrollAnimations } = await load()
    document.body.innerHTML = '<section class="hero"></section><svg class="hero-sprig"></svg>'
    initScrollAnimations()
    const depth = calls.to.find(c => c.targets.includes(document.querySelector('.hero-sprig')))
    expect(depth).toBeTruthy()
    expect(depth.vars.yPercent).toBe(-14)
    expect(depth.vars.scrollTrigger.scrub).toBe(true)
  })

  it('reveals an above-the-fold grid as an on-load cascade (no ScrollTrigger)', async () => {
    const { initScrollAnimations } = await load()
    // jsdom gives a zero-rect (top 0) → above the fold.
    document.body.innerHTML =
      '<div class="masonry"><article class="masonry-tile"></article><article class="masonry-tile"></article></div>'
    initScrollAnimations()
    const reveal = fromFor(document.querySelector('.masonry-tile'))
    expect(reveal).toBeTruthy()
    expect(reveal.vars.scrollTrigger).toBeUndefined() // plays on load, not on scroll
    expect(reveal.vars.delay).toBe(0.5)               // sequenced just after the header
  })

  it('reveals a below-the-fold grid on scroll', async () => {
    const { initScrollAnimations } = await load()
    document.body.innerHTML = '<div class="masonry"><article class="masonry-tile"></article></div>'
    const grid = document.querySelector('.masonry')
    grid.getBoundingClientRect = () => ({ top: 5000, left: 0, right: 0, bottom: 0, width: 0, height: 0 })
    initScrollAnimations()
    const reveal = fromFor(document.querySelector('.masonry-tile'))
    expect(reveal.vars.scrollTrigger).toMatchObject({ start: 'top 85%', once: true })
    expect(reveal.vars.delay).toBeUndefined()
  })

  it('uses a constant per-item stagger (each), never a fixed total (amount)', async () => {
    const { initScrollAnimations } = await load()
    document.body.innerHTML = '<div class="masonry"><article class="masonry-tile"></article></div>'
    initScrollAnimations()
    const reveal = fromFor(document.querySelector('.masonry-tile'))
    expect(reveal.vars.stagger).toMatchObject({ each: expect.any(Number), from: 'start' })
    expect(reveal.vars.stagger.amount).toBeUndefined()
  })

  it('no-ops a grid that has no items', async () => {
    const { initScrollAnimations } = await load()
    document.body.innerHTML = '<div class="process-grid"></div>' // no .process-step children
    initScrollAnimations()
    expect(calls.from).toHaveLength(0)
    expect(calls.to).toHaveLength(0)
  })

  it('applies the larger desktop reveal offset', async () => {
    const { initScrollAnimations } = await load({ viewport: 'desktop' })
    document.body.innerHTML = '<p class="eyebrow">x</p>'
    initScrollAnimations()
    expect(fromFor(document.querySelector('.eyebrow')).vars.x).toBe(-20)
  })

  it('applies the smaller mobile reveal offset', async () => {
    const { initScrollAnimations } = await load({ viewport: 'mobile' })
    document.body.innerHTML = '<p class="eyebrow">x</p>'
    initScrollAnimations()
    expect(fromFor(document.querySelector('.eyebrow')).vars.x).toBe(-14)
  })

  it('toggles the mobile sticky CTA as the hero enters/leaves the viewport', async () => {
    const { initScrollAnimations } = await load()
    document.body.innerHTML = '<section class="hero"></section><div id="mobile-cta" aria-hidden="true"></div>'
    initScrollAnimations()
    expect(ioInstances).toHaveLength(1)
    expect(ioInstances[0].observed).toContain(document.querySelector('.hero'))

    const cta = document.getElementById('mobile-cta')
    ioInstances[0].fire({ isIntersecting: false }) // hero scrolled out → CTA shows
    expect(cta.classList.contains('visible')).toBe(true)
    expect(cta.getAttribute('aria-hidden')).toBe('false')

    ioInstances[0].fire({ isIntersecting: true })  // hero back in view → CTA hides
    expect(cta.classList.contains('visible')).toBe(false)
    expect(cta.getAttribute('aria-hidden')).toBe('true')
  })

  it('debounces a single ScrollTrigger.refresh across rapid resizes', async () => {
    const { initScrollAnimations } = await load()
    document.body.innerHTML = '<section class="hero"></section>'
    // Capture *this* instance's resize handler so we drive it in isolation —
    // a global `dispatchEvent` would also fire handlers leaked by other tests'
    // fresh module loads (window persists across vi.resetModules).
    let resizeHandler
    const realAdd = window.addEventListener.bind(window)
    vi.spyOn(window, 'addEventListener').mockImplementation((type, fn, opts) => {
      if (type === 'resize') resizeHandler = fn
      else realAdd(type, fn, opts)
    })
    initScrollAnimations()
    window.addEventListener.mockRestore()
    expect(resizeHandler).toBeTypeOf('function')

    vi.useFakeTimers()
    resizeHandler()
    resizeHandler() // within the 150ms debounce window
    expect(calls.refresh).toBe(0)   // nothing fired yet
    vi.advanceTimersByTime(150)
    expect(calls.refresh).toBe(1)   // one coalesced refresh
  })
})
