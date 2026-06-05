// @vitest-environment jsdom
//
// Behaviour tests for the aftercare route chooser (src/js/modules/aftercare.js).
// The page hides all step content until a dressing route is picked; the module
// then reveals the switcher + stage, reflects the selection across the cards,
// the slim switch-tabs and the panels, supports arrow-key roving on the tabs,
// and honours a #second-skin / #cling-film deep link on load.
//
// Two things are stubbed so this stays a unit test: the smooth-scroll path leans
// on Lenis, and ./lenis.js runs gsap.registerPlugin at module load — importing it
// for real would drag the whole animation toolchain into the run — so we mock it
// to `{ lenis: null }`, which makes choose() take the window.scrollTo fallback we
// can spy on. aftercare.js also reads window.matchMedia at module-evaluation time,
// so we stub matchMedia and load the module dynamically once it's in place.
import { describe, it, expect, beforeEach, vi } from 'vitest'

vi.mock('../src/js/modules/lenis.js', () => ({ lenis: null }))

let initAftercare

beforeEach(async () => {
  window.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} })
  globalThis.requestAnimationFrame = cb => { cb(0); return 0 }
  window.scrollTo = vi.fn()
  location.hash = ''
  vi.resetModules()
  ;({ initAftercare } = await import('../src/js/modules/aftercare.js'))
  document.body.innerHTML = ''
})

// Mirrors apps/web/aftercare/index.html: a chooser with two route cards, a hidden
// switcher (tabs) and a hidden stage holding one panel per route.
function setup() {
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
    </div>
  `
}

const card  = m => document.querySelector(`.choice-card[data-method="${m}"]`)
const tab   = m => document.querySelector(`.switch-tab[data-method="${m}"]`)
const panel = m => document.getElementById('panel-' + m)
const click = el => el.dispatchEvent(new window.Event('click', { bubbles: true }))
const arrow = (el, key) => el.dispatchEvent(new window.KeyboardEvent('keydown', { key, bubbles: true }))

describe('initAftercare', () => {
  it('no-ops when the chooser is absent (safe on every other page)', () => {
    document.body.innerHTML = '<div></div>'
    expect(() => initAftercare()).not.toThrow()
  })

  it('no-ops when the chooser has no cards', () => {
    document.body.innerHTML = '<section id="care-chooser"></section><div id="care-stage"></div>'
    expect(() => initAftercare()).not.toThrow()
  })

  describe('first pick', () => {
    it('reveals the switcher + stage and reflects the route across card, tab and panel', () => {
      setup()
      initAftercare()
      const wrap = document.getElementById('care-switch-wrap')
      const stage = document.getElementById('care-stage')
      expect(wrap.hidden).toBe(true)   // nothing shown until a route is chosen
      expect(stage.hidden).toBe(true)

      click(card('second-skin'))

      expect(wrap.hidden).toBe(false)
      expect(stage.hidden).toBe(false)
      expect(wrap.classList.contains('shown')).toBe(true)
      expect(stage.classList.contains('shown')).toBe(true)

      expect(card('second-skin').classList.contains('selected')).toBe(true)
      expect(card('second-skin').getAttribute('aria-pressed')).toBe('true')
      expect(tab('second-skin').classList.contains('active')).toBe(true)
      expect(tab('second-skin').getAttribute('aria-selected')).toBe('true')
      expect(tab('second-skin').tabIndex).toBe(0)
      expect(panel('second-skin').classList.contains('active')).toBe(true)

      // the other route stays entirely off
      expect(card('cling-film').classList.contains('selected')).toBe(false)
      expect(tab('cling-film').tabIndex).toBe(-1)
      expect(panel('cling-film').classList.contains('active')).toBe(false)
    })

    it('scrolls to the stage on a card pick (Lenis absent → window.scrollTo)', () => {
      setup()
      initAftercare()
      click(card('cling-film'))
      expect(window.scrollTo).toHaveBeenCalledTimes(1)
    })
  })

  describe('the slim switcher', () => {
    it('flips routes without scrolling (keeps your reading position)', () => {
      setup()
      initAftercare()
      click(card('second-skin'))      // reveal + the one initial scroll
      window.scrollTo.mockClear()

      click(tab('cling-film'))
      expect(panel('cling-film').classList.contains('active')).toBe(true)
      expect(panel('second-skin').classList.contains('active')).toBe(false)
      expect(card('cling-film').classList.contains('selected')).toBe(true)
      expect(window.scrollTo).not.toHaveBeenCalled()
    })

    it('ArrowRight moves focus to the next route and selects it', () => {
      setup()
      initAftercare()
      click(tab('second-skin'))
      arrow(tab('second-skin'), 'ArrowRight')
      expect(document.activeElement).toBe(tab('cling-film'))
      expect(panel('cling-film').classList.contains('active')).toBe(true)
    })

    it('ArrowLeft wraps from the first route round to the last', () => {
      setup()
      initAftercare()
      click(tab('second-skin'))
      arrow(tab('second-skin'), 'ArrowLeft')
      expect(document.activeElement).toBe(tab('cling-film'))
    })
  })

  describe('deep link', () => {
    it('opens the route named in the URL hash on load, without scrolling', () => {
      setup()
      location.hash = '#cling-film'
      initAftercare()
      expect(document.getElementById('care-stage').hidden).toBe(false)
      expect(panel('cling-film').classList.contains('active')).toBe(true)
      expect(window.scrollTo).not.toHaveBeenCalled()
    })

    it('ignores an unrelated hash and stays unrevealed', () => {
      setup()
      location.hash = '#nope'
      initAftercare()
      expect(document.getElementById('care-stage').hidden).toBe(true)
      expect(document.querySelectorAll('.care-panel.active')).toHaveLength(0)
    })
  })
})
