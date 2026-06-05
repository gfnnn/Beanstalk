// @vitest-environment jsdom
//
// Behaviour tests for the nav module (src/js/modules/nav.js) — synchronous DOM
// logic, no network. We cover the correctness-critical bits a regression would
// quietly break: current-page active-link marking (incl. the "active link lives
// inside the More dropdown → light the trigger too" case), the More dropdown
// open/close (toggle, outside-click, Escape), and the mobile hamburger/drawer
// (open/close, close-on-link, Escape, the body scroll-lock). The passive scroll
// listener that toggles `.scrolled` past 60px is exercised too.
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { initNav } from '../src/js/modules/nav.js'

const $ = id => document.getElementById(id)
const click = el => el.dispatchEvent(new window.Event('click', { bubbles: true }))
const keydown = k => document.dispatchEvent(new window.KeyboardEvent('keydown', { key: k, bubbles: true }))

function setup() {
  document.body.innerHTML = `
    <nav id="main-nav">
      <div class="nav-links">
        <a href="/">Home</a>
        <a href="/portfolio/">Portfolio</a>
        <div class="nav-dropdown" id="nav-more">
          <button id="nav-more-btn" aria-expanded="false">More</button>
          <a href="/faq/">FAQ</a>
        </div>
      </div>
      <button id="nav-hamburger" aria-expanded="false"></button>
      <div id="nav-drawer" class="nav-drawer" aria-hidden="true">
        <a href="/about/">About</a>
      </div>
    </nav>
  `
}

// nav reads window.location.pathname at init, so set the route up front.
const setPath = p => window.history.pushState({}, '', p)

beforeEach(() => { setPath('/'); document.body.innerHTML = '' })
afterEach(() => { document.body.style.overflow = ''; setPath('/') })

describe('initNav', () => {
  it('no-ops when there is no nav on the page', () => {
    document.body.innerHTML = '<div></div>'
    expect(() => initNav()).not.toThrow()
  })

  describe('active link', () => {
    it('marks the link matching the current path (aria-current=page), never "/"', () => {
      setPath('/portfolio/foxglove/')
      setup(); initNav()
      const portfolio = document.querySelector('a[href="/portfolio/"]')
      expect(portfolio.classList.contains('active')).toBe(true)
      expect(portfolio.getAttribute('aria-current')).toBe('page')
      // the home link must NOT light up just because every path startsWith "/"
      expect(document.querySelector('a[href="/"]').classList.contains('active')).toBe(false)
    })

    it('also lights the More trigger when the active link is inside the dropdown', () => {
      setPath('/faq/')
      setup(); initNav()
      expect(document.querySelector('a[href="/faq/"]').classList.contains('active')).toBe(true)
      expect($('nav-more-btn').classList.contains('active')).toBe(true)
    })
  })

  describe('More dropdown', () => {
    it('toggles open on the trigger and reflects aria-expanded', () => {
      setup(); initNav()
      const btn = $('nav-more-btn')
      click(btn)
      expect($('nav-more').classList.contains('open')).toBe(true)
      expect(btn.getAttribute('aria-expanded')).toBe('true')
    })

    it('closes on an outside document click', () => {
      setup(); initNav()
      click($('nav-more-btn'))           // open
      click(document.body)               // outside click
      expect($('nav-more').classList.contains('open')).toBe(false)
      expect($('nav-more-btn').getAttribute('aria-expanded')).toBe('false')
    })

    it('closes on Escape', () => {
      setup(); initNav()
      click($('nav-more-btn'))
      keydown('Escape')
      expect($('nav-more').classList.contains('open')).toBe(false)
    })
  })

  describe('mobile drawer', () => {
    it('opens and closes on the hamburger, toggling aria + body scroll-lock', () => {
      setup(); initNav()
      const burger = $('nav-hamburger')
      const drawer = $('nav-drawer')

      click(burger)
      expect(drawer.classList.contains('open')).toBe(true)
      expect(drawer.getAttribute('aria-hidden')).toBe('false')
      expect(burger.getAttribute('aria-expanded')).toBe('true')
      expect(document.body.style.overflow).toBe('hidden')

      click(burger)
      expect(drawer.classList.contains('open')).toBe(false)
      expect(drawer.getAttribute('aria-hidden')).toBe('true')
      expect(document.body.style.overflow).toBe('')
    })

    it('closes when a drawer link is followed', () => {
      setup(); initNav()
      click($('nav-hamburger'))                       // open
      click(document.querySelector('#nav-drawer a'))  // navigate
      expect($('nav-drawer').classList.contains('open')).toBe(false)
    })

    it('closes on Escape', () => {
      setup(); initNav()
      click($('nav-hamburger'))
      keydown('Escape')
      expect($('nav-drawer').classList.contains('open')).toBe(false)
      expect(document.body.style.overflow).toBe('')
    })
  })

  describe('scroll state', () => {
    it('adds .scrolled past 60px and removes it back at the top', () => {
      setup(); initNav()
      const nav = $('main-nav')
      window.scrollY = 120
      window.dispatchEvent(new window.Event('scroll'))
      expect(nav.classList.contains('scrolled')).toBe(true)
      window.scrollY = 0
      window.dispatchEvent(new window.Event('scroll'))
      expect(nav.classList.contains('scrolled')).toBe(false)
    })
  })
})
