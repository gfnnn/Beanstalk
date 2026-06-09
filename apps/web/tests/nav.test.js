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

// Mirror the PRODUCTION structure: the drawer is a SIBLING of #main-nav, not a
// descendant. (A previous version nested it inside #main-nav, which masked the
// bug where drawer links never picked up the current-page styling.) The drawer
// carries the full link set plus the enquiry CTA button, which must NOT be lit.
function setup() {
  document.body.innerHTML = `
    <nav id="main-nav">
      <div class="nav-links">
        <a href="/">Home</a>
        <a href="/portfolio/">Portfolio</a>
        <a href="/flash/">Flash</a>
        <div class="nav-dropdown" id="nav-more">
          <button id="nav-more-btn" aria-expanded="false">More</button>
          <a href="/faq/">FAQ</a>
        </div>
      </div>
      <button id="nav-hamburger" aria-expanded="false"></button>
    </nav>
    <div id="nav-drawer" class="nav-drawer" aria-hidden="true">
      <a href="/">Home</a>
      <a href="/portfolio/">Portfolio</a>
      <a href="/flash/">Flash</a>
      <a href="/about/">About</a>
      <a href="/enquire/" class="btn btn-primary">Start an enquiry →</a>
    </div>
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
      expect(document.querySelector('.nav-links a[href="/faq/"]').classList.contains('active')).toBe(true)
      expect($('nav-more-btn').classList.contains('active')).toBe(true)
    })

    it('lights the matching DRAWER link too, though the drawer sits outside #main-nav', () => {
      setPath('/flash/')
      setup(); initNav()
      // Regression: the burger-menu link for the current page must get the
      // current-page styling, not just the inline desktop link.
      const drawerLink = document.querySelector('#nav-drawer a[href="/flash/"]')
      expect(drawerLink.classList.contains('active')).toBe(true)
      expect(drawerLink.getAttribute('aria-current')).toBe('page')
    })

    it('never lights the drawer CTA button or the home link', () => {
      setPath('/enquire/')
      setup(); initNav()
      // The "Start an enquiry" CTA is a .btn, not a nav link — it must stay unlit
      // even when the path matches its href.
      expect(document.querySelector('#nav-drawer a.btn').classList.contains('active')).toBe(false)
      // "/" must not light up just because every path startsWith "/".
      expect(document.querySelector('#nav-drawer a[href="/"]').classList.contains('active')).toBe(false)
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

    it('stays open when a drawer link is followed, so the page transition carries it', () => {
      setup(); initNav()
      click($('nav-hamburger'))                       // open
      click(document.querySelector('#nav-drawer a'))  // navigate
      // The drawer is intentionally NOT closed here: animating it shut before the
      // route change read as two steps (menu collapses, THEN the page transitions).
      // Leaving it open lets the cross-document View Transition snapshot it and
      // cross-fade the whole page — menu included — in one motion.
      expect($('nav-drawer').classList.contains('open')).toBe(true)
    })

    it('resets a left-open drawer on a bfcache restore (pageshow.persisted)', () => {
      setup(); initNav()
      click($('nav-hamburger'))                       // open, then "navigate" away
      // Back/forward can restore the page from bfcache exactly as it was left —
      // open drawer, body still scroll-locked. The persisted pageshow resets it.
      const restore = new window.Event('pageshow')
      Object.defineProperty(restore, 'persisted', { value: true })
      window.dispatchEvent(restore)
      expect($('nav-drawer').classList.contains('open')).toBe(false)
      expect(document.body.style.overflow).toBe('')
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
    it('adds .scrolled past 60px and removes it back at the top', async () => {
      setup(); initNav()
      const nav = $('main-nav')
      // The handler is rAF-latched (one toggle per frame), so flush a frame before asserting.
      const frame = () => new Promise(r => requestAnimationFrame(r))
      window.scrollY = 120
      window.dispatchEvent(new window.Event('scroll'))
      await frame()
      expect(nav.classList.contains('scrolled')).toBe(true)
      window.scrollY = 0
      window.dispatchEvent(new window.Event('scroll'))
      await frame()
      expect(nav.classList.contains('scrolled')).toBe(false)
    })
  })
})
