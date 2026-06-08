import { lenis } from './lenis.js'
import { initStickyShadow } from './sticky.js'

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
    panels.forEach(p => p.classList.toggle('active', p.id === 'panel-' + method))
  }

  // ── First choice unfolds the switcher + step content ─────────────────────
  function reveal() {
    switchWrap.hidden = false
    stage.hidden = false
    void stage.offsetHeight            // commit layout before transitioning
    switchWrap.classList.add('shown')
    stage.classList.add('shown')
    revealed = true
    // Pin-shadow via the shared IntersectionObserver helper (no per-scroll reflow);
    // started here, once the switcher is actually shown.
    initStickyShadow(switchWrap)
  }

  function scrollToStage() {
    const switchH = switchWrap ? switchWrap.offsetHeight : 0
    const top = stage.getBoundingClientRect().top + window.scrollY - navH() - switchH - 12
    if (lenis) lenis.scrollTo(top, { duration: 0.7 })
    else window.scrollTo({ top, behavior: reduced ? 'auto' : 'smooth' })
  }

  function choose(method, { scroll }) {
    if (!revealed) reveal()
    setSelection(method)
    if (scroll) requestAnimationFrame(scrollToStage)
  }

  // Choice cards — the primary fork; also re-selects after the reveal
  cards.forEach(card => {
    card.addEventListener('click', () => choose(card.dataset.method, { scroll: true }))
  })

  // Slim switcher — flip routes without losing your reading position
  switchTabs.forEach(tab => {
    tab.addEventListener('click', () => choose(tab.dataset.method, { scroll: false }))
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
