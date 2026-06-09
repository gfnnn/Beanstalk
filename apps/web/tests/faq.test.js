// @vitest-environment jsdom
//
// Behaviour tests for the FAQ module (src/js/modules/faq.js) — pure synchronous
// DOM logic, no network. Three cooperating controls worth pinning: the
// single-open accordion (+ keyboard activation and aria-expanded), the category
// filter (exclusive active chip, show/hide by data-category), and the live search
// (text match across the question + answer, which also resets the chips to "All").
// The shared empty-state ("no results") visibility is asserted alongside.
import { describe, it, expect, beforeEach } from 'vitest'
import { initFaq } from '../src/js/modules/faq.js'

const $  = sel => document.querySelector(sel)
const $$ = sel => [...document.querySelectorAll(sel)]
const click = el => el.dispatchEvent(new window.Event('click', { bubbles: true }))
const input = el => el.dispatchEvent(new window.Event('input', { bubbles: true }))
const key = (el, k) => el.dispatchEvent(new window.KeyboardEvent('keydown', { key: k, bubbles: true }))

function setup() {
  document.body.innerHTML = `
    <button class="faq-cat active" data-cat="all">All</button>
    <button class="faq-cat" data-cat="booking">Booking</button>
    <button class="faq-cat" data-cat="aftercare">Aftercare</button>
    <input id="faq-search-input">

    <div class="faq-item" data-category="booking" data-question="how do i book a slot">
      <button class="faq-item-trigger" aria-expanded="false">Booking Q</button>
      <div class="faq-answer-inner">Use the enquiry form to request a date.</div>
    </div>
    <div class="faq-item" data-category="aftercare" data-question="how to wash a fresh tattoo">
      <button class="faq-item-trigger" aria-expanded="false">Aftercare Q</button>
      <div class="faq-answer-inner">Wash gently with fragrance-free soap.</div>
    </div>

    <div id="faq-empty" style="display:none">No matches</div>
  `
}

const items = () => $$('.faq-item')
const visible = () => items().filter(i => i.style.display !== 'none')

beforeEach(() => { document.body.innerHTML = '' })

describe('initFaq', () => {
  it('no-ops when there are no FAQ items on the page', () => {
    document.body.innerHTML = '<div></div>'
    expect(() => initFaq()).not.toThrow()
  })

  describe('accordion', () => {
    it('opens the clicked item and sets aria-expanded', () => {
      setup(); initFaq()
      const [a] = items()
      click(a.querySelector('.faq-item-trigger'))
      expect(a.classList.contains('open')).toBe(true)
      expect(a.querySelector('.faq-item-trigger').getAttribute('aria-expanded')).toBe('true')
    })

    it('keeps only one item open at a time', () => {
      setup(); initFaq()
      const [a, b] = items()
      click(a.querySelector('.faq-item-trigger'))
      click(b.querySelector('.faq-item-trigger'))
      expect(a.classList.contains('open')).toBe(false)
      expect(b.classList.contains('open')).toBe(true)
    })

    it('toggles the same item closed on a second click', () => {
      setup(); initFaq()
      const [a] = items()
      const t = a.querySelector('.faq-item-trigger')
      click(t); click(t)
      expect(a.classList.contains('open')).toBe(false)
      expect(t.getAttribute('aria-expanded')).toBe('false')
    })

    it('activates via Enter/Space keyboard (a11y)', () => {
      setup(); initFaq()
      const [a] = items()
      key(a.querySelector('.faq-item-trigger'), 'Enter')
      expect(a.classList.contains('open')).toBe(true)
    })
  })

  describe('category filter', () => {
    it('shows only items in the chosen category and marks the chip active exclusively', () => {
      setup(); initFaq()
      click($('.faq-cat[data-cat="booking"]'))
      expect(visible()).toHaveLength(1)
      expect(visible()[0].dataset.category).toBe('booking')
      expect($$('.faq-cat.active')).toHaveLength(1)
      expect($('.faq-cat[data-cat="booking"]').classList.contains('active')).toBe(true)
    })

    it('"All" restores every item', () => {
      setup(); initFaq()
      click($('.faq-cat[data-cat="aftercare"]'))
      click($('.faq-cat[data-cat="all"]'))
      expect(visible()).toHaveLength(2)
    })

    it('reveals a filtered-in item the scroll entrance had left hidden', () => {
      setup(); initFaq()
      // Simulate GSAP holding a below-the-fold .reveal item at opacity:0 until its
      // ScrollTrigger fires — filtering to it must not leave it display:block-but-invisible.
      const aftercare = $('.faq-item[data-category="aftercare"]')
      aftercare.style.opacity = '0'
      click($('.faq-cat[data-cat="aftercare"]'))
      expect(aftercare.style.display).not.toBe('none')
      expect(aftercare.style.opacity).toBe('') // hide-style cleared, so it's actually seen
    })

    it('picking a category clears a stale search query (box and list agree)', () => {
      setup(); initFaq()
      const search = $('#faq-search-input')
      search.value = 'wash'
      input(search) // search → 1 result, chips snap to "All"
      expect(visible()).toHaveLength(1)

      click($('.faq-cat[data-cat="booking"]'))
      // The whole category shows (not the stale 1-item search subset)…
      expect(visible()).toHaveLength(1)
      expect(visible()[0].dataset.category).toBe('booking')
      // …and the search field is cleared so it can't disagree with the list.
      expect(search.value).toBe('')
    })
  })

  describe('search', () => {
    it('filters by text across the question + answer and snaps the chips back to "All"', () => {
      setup(); initFaq()
      click($('.faq-cat[data-cat="booking"]')) // move off "All" first
      const search = $('#faq-search-input')
      search.value = 'wash'
      input(search)
      expect(visible()).toHaveLength(1)
      expect(visible()[0].dataset.category).toBe('aftercare') // matched "wash a fresh tattoo"
      expect($('.faq-cat[data-cat="all"]').classList.contains('active')).toBe(true)
    })

    it('shows the empty state when nothing matches, and clears it when the query is emptied', () => {
      setup(); initFaq()
      const search = $('#faq-search-input')
      search.value = 'zzzz-no-match'
      input(search)
      expect(visible()).toHaveLength(0)
      expect($('#faq-empty').style.display).toBe('block')

      search.value = ''
      input(search)
      expect(visible()).toHaveLength(2)
      expect($('#faq-empty').style.display).toBe('none')
    })
  })
})
