export function initAftercare() {
  const tabs       = document.querySelectorAll('.bandage-tab')
  const panels     = document.querySelectorAll('.care-panel')
  const selectorWrap = document.getElementById('bandage-selector-wrap')
  const nav        = document.getElementById('main-nav')

  if (!tabs.length) return

  // ── Tab switcher ─────────────────────────────────────────
  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      tabs.forEach(t => {
        t.classList.remove('active')
        t.setAttribute('aria-selected', 'false')
      })
      tab.classList.add('active')
      tab.setAttribute('aria-selected', 'true')

      const target = tab.dataset.panel
      panels.forEach(p => p.classList.remove('active'))
      const active = document.getElementById('panel-' + target)
      if (active) active.classList.add('active')

      // Scroll so first step is visible below the sticky selector
      if (selectorWrap && nav) {
        const y = selectorWrap.getBoundingClientRect().bottom + window.scrollY - nav.offsetHeight
        window.scrollTo({ top: y, behavior: 'smooth' })
      }
    })

    // Keyboard: arrow keys navigate between tabs
    tab.addEventListener('keydown', e => {
      if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return
      const all = Array.from(tabs)
      const i   = all.indexOf(tab)
      const next = e.key === 'ArrowRight'
        ? all[(i + 1) % all.length]
        : all[(i - 1 + all.length) % all.length]
      next.focus()
      next.click()
    })
  })

  // ── Selector sticky shadow ───────────────────────────────
  if (selectorWrap) {
    const obs = new IntersectionObserver(
      ([entry]) => selectorWrap.classList.toggle('stuck', !entry.isIntersecting),
      {
        threshold: 1,
        rootMargin: `-${parseInt(getComputedStyle(document.documentElement)
          .getPropertyValue('--nav-h'))}px 0px 0px 0px`
      }
    )
    obs.observe(selectorWrap)
  }
}
