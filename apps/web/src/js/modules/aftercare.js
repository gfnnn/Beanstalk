import { lenis } from './lenis.js'
import { initStickyShadow } from './sticky.js'
import { cascadeReveal } from './animations.js'

const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches

export function initAftercare() {
  const chooser = document.getElementById('care-chooser')
  if (!chooser) return

  const cards      = Array.from(document.querySelectorAll('.choice-card'))
  const switchWrap = document.getElementById('care-switch-wrap')
  const switchTabs = Array.from(document.querySelectorAll('.switch-tab'))
  const stage      = document.getElementById('care-stage')
  const panels     = Array.from(document.querySelectorAll('.care-panel'))
  const nav        = document.getElementById('main-nav')

  if (!cards.length || !stage) return

  let revealed = false

  const navH = () =>
    parseInt(getComputedStyle(document.documentElement).getPropertyValue('--nav-h'), 10)
    || (nav ? nav.offsetHeight : 0)

  // Mobile = the single-column stack (below the 900px two-column/sticky-aside
  // layout). Matches the breakpoint enquire.js uses for its scroll-on-advance.
  const isMobile = () => window.innerWidth < 900

  // ── Reflect the chosen route across cards, switch tabs, and panels ────────
  function setSelection(method) {
    cards.forEach(c => {
      const on = c.dataset.method === method
      c.classList.toggle('selected', on)
      c.setAttribute('aria-pressed', String(on))
    })
    switchTabs.forEach(t => {
      const on = t.dataset.method === method
      t.classList.toggle('active', on)
      t.setAttribute('aria-selected', String(on))
      t.tabIndex = on ? 0 : -1
    })
    panels.forEach(p => p.classList.toggle('active', p.id === `panel-${method}`))
  }

  // ── First choice unfolds the switcher + step content ─────────────────────
  function reveal() {
    switchWrap.hidden = false
    stage.hidden = false
    // When the children will cascade in (full motion), drop the stage's own block
    // slide so the two don't compound — the container just fades, the steps carry
    // the movement. Under reduced motion the CSS handles a plain instant reveal.
    if (!reduced) stage.style.transform = 'none'
    void stage.offsetHeight            // commit layout before transitioning
    switchWrap.classList.add('shown')
    stage.classList.add('shown')
    revealed = true
    // Pin-shadow via the shared IntersectionObserver helper (no per-scroll reflow);
    // started here, once the switcher is actually shown.
    initStickyShadow(switchWrap)
  }

  // ── Cascade the just-revealed route's steps + the shared rules in, the same
  //    homepage-style stagger the rest of the site uses (no-ops under reduced
  //    motion). Only on the FIRST reveal; later route switches keep the quick
  //    CSS panel-fade so toggling back and forth doesn't re-perform every time.
  function cascadeStage(method) {
    const panel = document.getElementById(`panel-${method}`)
    if (panel) {
      const aside = panel.querySelector('.steps-aside')
      const steps = panel.querySelectorAll('.step')
      cascadeReveal([aside, ...steps], { y: 16, each: 0.05 })
    }
    cascadeReveal(document.querySelectorAll('.rule-item'), { y: 18, each: 0.08, delay: 0.1 })
  }

  function scrollToStage() {
    const switchH = switchWrap ? switchWrap.offsetHeight : 0
    const top = stage.getBoundingClientRect().top + window.scrollY - navH() - switchH - 12
    if (lenis) lenis.scrollTo(top, { duration: 0.7 })
    else window.scrollTo({ top, behavior: reduced ? 'auto' : 'smooth' })
  }

  function choose(method, { scroll }) {
    const first = !revealed
    if (first) reveal()
    setSelection(method)
    if (first) cascadeStage(method)   // cascade the now-active route's content in
    if (scroll) requestAnimationFrame(scrollToStage)
  }

  // Choice cards — the primary fork; also re-selects after the reveal
  cards.forEach(card => {
    card.addEventListener('click', () => choose(card.dataset.method, { scroll: true }))
  })

  // Slim switcher — on desktop, flip routes without losing your reading position
  // (the aside is sticky alongside the steps). On mobile the steps stack in one
  // column, so switching in place can leave the new route's steps below the fold
  // under the sticky bar — scroll down to them the way a choice card does.
  switchTabs.forEach(tab => {
    tab.addEventListener('click', () => choose(tab.dataset.method, { scroll: isMobile() }))
    tab.addEventListener('keydown', e => {
      if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return
      e.preventDefault()
      const i = switchTabs.indexOf(tab)
      const next = e.key === 'ArrowRight'
        ? switchTabs[(i + 1) % switchTabs.length]
        : switchTabs[(i - 1 + switchTabs.length) % switchTabs.length]
      next.focus()
      next.click()
    })
  })

  // ── Deep link — /aftercare/#second-skin or #cling-film opens that route ──
  const hash = (location.hash || '').replace('#', '')
  if (hash === 'second-skin' || hash === 'cling-film') {
    choose(hash, { scroll: false })
  }
}
