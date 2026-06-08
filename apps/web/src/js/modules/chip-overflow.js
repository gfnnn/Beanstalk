// Responsive filter-bar chips — shared by the portfolio (filter.js) and flash
// (flash.js) bars, which use the same `.filter-bar` markup.
//
// On desktop the chips sit on one row beside the selects. As that row tightens
// the secondary chips (those inside `.chips-secondary`) collapse ONE AT A TIME
// behind the "More" toggle — only as many as the width demands. The chip row is
// pinned to a measured min-width (its priority chips + "More") so that when even
// those can't fit beside the selects, the SELECTS wrap to their own row rather
// than anything being clipped.
//
// It no-ops safely on a bar with no "More"/secondary chips (e.g. flash, whose
// few status chips never need collapsing): nothing hides, but the min-width
// floor still lets the sort select wrap instead of the chips being cut off.

const DESKTOP_MQ = '(min-width: 640px)'

export function initChipOverflow(filterBar) {
  if (!filterBar) return
  const filterChips = filterBar.querySelector('.filter-chips')
  if (!filterChips) return
  const chips       = [...filterChips.querySelectorAll('.chip')]
  const chipMoreBtn = filterBar.querySelector('.chip-more')
  if (!chips.length) return

  const desktopMq = window.matchMedia?.(DESKTOP_MQ) ?? null
  // Priority chips (always shown) lead the list; the rest live in
  // `.chips-secondary` and are the ones that collapse, dropped last-first. A bar
  // without a secondary cluster (flash) has every chip as "priority" → nothing
  // collapses, but the floor still drives the select-wrap.
  const priorityCount = chips.filter(c => !c.closest('.chips-secondary')).length

  function setExpanded(expanded) {
    filterChips.classList.toggle('expanded', expanded)
    if (chipMoreBtn) chipMoreBtn.setAttribute('aria-expanded', String(expanded))
  }

  function apply() {
    // Mobile (or no matchMedia): the pure-CSS collapse owns it — clear any
    // desktop state we may have set.
    if (!desktopMq?.matches) {
      chips.forEach(c => c.classList.remove('is-collapsed'))
      filterBar.classList.remove('needs-more')
      filterChips.style.minWidth = ''
      return
    }

    // Measure true widths in a clean state: every chip + "More" on one nowrap
    // row. Synchronous (no paint between add/remove), so there's no flicker.
    chips.forEach(c => c.classList.remove('is-collapsed'))
    filterBar.classList.add('measuring')
    const gap    = parseFloat(getComputedStyle(filterChips).columnGap) || 0
    const widths = chips.map(c => c.offsetWidth)
    const moreW  = chipMoreBtn ? chipMoreBtn.offsetWidth : 0

    // Floor = priority chips + "More". Pinning the chip row to this width makes
    // the selects (not the chips) wrap once they can't share a row, so the
    // toggle can never be clipped. Read `avail` AFTER it's applied.
    const prioritySum = widths.slice(0, priorityCount).reduce((a, b) => a + b, 0)
    const floor = prioritySum + moreW + gap * priorityCount
    filterChips.style.minWidth = `${floor}px`
    const avail = filterChips.clientWidth
    filterBar.classList.remove('measuring')

    const totalAll = widths.reduce((a, b) => a + b, 0) + gap * (chips.length - 1)

    // Everything fits → show all, no "More".
    if (totalAll <= avail) {
      filterBar.classList.remove('needs-more')
      setExpanded(false)
      return
    }

    // Doesn't fit → the "More" toggle is needed (where one exists).
    filterBar.classList.add('needs-more')

    // User has opened it → reveal everything (it wraps to further rows).
    if (filterChips.classList.contains('expanded')) return

    // Keep priority chips + as many secondary as fit alongside "More".
    let keep = chips.length - priorityCount
    while (keep > 0) {
      const secSum = widths.slice(priorityCount, priorityCount + keep).reduce((a, b) => a + b, 0)
      const shown  = priorityCount + keep + 1 // + the "More" button
      if (prioritySum + secSum + moreW + gap * (shown - 1) <= avail) break
      keep--
    }
    chips.forEach((c, i) => c.classList.toggle('is-collapsed', i >= priorityCount + keep))
  }

  if (chipMoreBtn) {
    chipMoreBtn.addEventListener('click', () => {
      setExpanded(!filterChips.classList.contains('expanded'))
      apply()
    })
  }

  apply()
  if (typeof ResizeObserver !== 'undefined') {
    // rAF-debounced so our own height changes (the bar grows when the selects
    // wrap / "More" opens) don't retrigger a ResizeObserver loop.
    let scheduled = false
    new ResizeObserver(() => {
      if (scheduled) return
      scheduled = true
      requestAnimationFrame(() => { scheduled = false; apply() })
    }).observe(filterBar)
  } else {
    window.addEventListener('resize', apply)
  }
  desktopMq?.addEventListener?.('change', apply)
  document.fonts?.ready.then(apply)   // labels resize once fonts load

  return apply
}
