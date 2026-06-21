// @vitest-environment jsdom
//
// faq.js and aftercare.js both prefer Lenis for their scroll-to (so the motion
// matches the site's smooth-scroll) and fall back to native window.scrollTo when
// Lenis never initialised (reduced motion / jsdom). Their main suites mock lenis
// as null and pin the fallback; this file mocks it PRESENT and pins the preferred
// path — that the scroll goes through lenis.scrollTo with the shared duration,
// and never through window.scrollTo.
import { describe, it, expect, beforeEach, vi } from 'vitest'

const scrollToSpy = vi.fn()
vi.mock('../src/js/modules/lenis.js', () => ({
  lenis: { scrollTo: (...args) => scrollToSpy(...args) },
}))
vi.mock('../src/js/modules/animations.js', () => ({ cascadeReveal: vi.fn() }))

// aftercare.js reads window.matchMedia at IMPORT time, so the modules are pulled
// in dynamically after the stubs are up (same pattern as aftercare.test.js).
let initFaq, initAftercare

beforeEach(async () => {
  window.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} })
  globalThis.requestAnimationFrame = cb => { cb(0); return 0 }
  window.scrollTo = vi.fn()
  vi.resetModules()
  ;({ initFaq } = await import('../src/js/modules/faq.js'))
  ;({ initAftercare } = await import('../src/js/modules/aftercare.js'))
  document.body.innerHTML = ''
  scrollToSpy.mockClear()
})

describe('with Lenis live', () => {
  it('faq: picking a topic on the stacked layout scrolls via lenis, not window', () => {
    // isStacked() = NOT (min-width: 900px) — report mobile for every query.
    window.matchMedia = q => ({
      matches: false,
      media: q, addEventListener() {}, removeEventListener() {},
    })
    document.body.innerHTML = `
      <button class="faq-cat active" data-cat="all">All</button>
      <button class="faq-cat" data-cat="booking">Booking</button>
      <main id="faq-list">
        <div class="faq-item" data-category="booking" data-question="how do i book">
          <button class="faq-item-trigger" aria-expanded="false">Booking Q</button>
          <div class="faq-answer-inner">Use the enquiry form.</div>
        </div>
      </main>`
    initFaq()
    document.querySelector('.faq-cat[data-cat="booking"]')
      .dispatchEvent(new window.Event('click', { bubbles: true }))
    expect(scrollToSpy).toHaveBeenCalledTimes(1)
    expect(scrollToSpy.mock.calls[0][1]).toEqual({ duration: 0.7 })
    expect(window.scrollTo).not.toHaveBeenCalled()
  })

  it('aftercare: picking a route card scrolls to the stage via lenis, not window', () => {
    window.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} })
    window.innerWidth = 1024
    document.body.innerHTML = `
      <nav id="main-nav"></nav>
      <section class="care-chooser" id="care-chooser">
        <button class="choice-card" data-method="second-skin" aria-pressed="false">Second skin</button>
        <button class="choice-card" data-method="cling-film"  aria-pressed="false">Cling film</button>
      </section>
      <div class="care-switch-wrap" id="care-switch-wrap" hidden>
        <div role="tablist">
          <button class="switch-tab" data-method="second-skin" aria-selected="false" tabindex="-1">Second skin</button>
          <button class="switch-tab" data-method="cling-film"  aria-selected="false" tabindex="-1">Cling film</button>
        </div>
      </div>
      <div class="care-stage" id="care-stage" hidden>
        <div class="care-panel" id="panel-second-skin">…</div>
        <div class="care-panel" id="panel-cling-film">…</div>
      </div>`
    initAftercare()
    document.querySelector('.choice-card[data-method="second-skin"]')
      .dispatchEvent(new window.Event('click', { bubbles: true }))
    expect(scrollToSpy).toHaveBeenCalledTimes(1)
    expect(scrollToSpy.mock.calls[0][1]).toEqual({ duration: 0.7 })
    expect(window.scrollTo).not.toHaveBeenCalled()
  })
})
