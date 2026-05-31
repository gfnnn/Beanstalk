export function initFilter() {
  const filterBar   = document.getElementById('filter-bar')
  if (!filterBar) return

  const chips         = document.querySelectorAll('.chip')
  const tiles         = document.querySelectorAll('.masonry-tile')
  const placementSel  = document.getElementById('placement-filter')
  const emptyState    = document.getElementById('empty-state')
  const filterSummary = document.getElementById('filter-summary')
  const summaryText   = document.getElementById('summary-text')
  const filterClear   = document.getElementById('filter-clear')
  const emptyClear    = document.getElementById('empty-clear')

  let activeStyle     = 'all'
  let activePlacement = 'all'

  // ── Sticky detection (shadow when filter bar is pinned) ──────────────────
  const stickyObs = new IntersectionObserver(
    ([entry]) => filterBar.classList.toggle('stuck', !entry.isIntersecting),
    {
      threshold: 1,
      rootMargin: `-${getComputedStyle(document.documentElement)
        .getPropertyValue('--nav-h').trim()} 0px 0px 0px`,
    }
  )
  stickyObs.observe(filterBar)

  // ── Filter application ───────────────────────────────────────────────────
  function applyFilters() {
    let visible = 0

    tiles.forEach(tile => {
      // Don't reveal tiles that load-more is still hiding
      if (tile.dataset.shown === 'false') return

      const styleMatch     = activeStyle === 'all'     || tile.dataset.style === activeStyle
      const placementMatch = activePlacement === 'all' || tile.dataset.placement === activePlacement
      const show = styleMatch && placementMatch

      tile.style.display = show ? '' : 'none'
      if (show) visible++
    })

    if (emptyState)    emptyState.classList.toggle('visible', visible === 0)

    const filtered = activeStyle !== 'all' || activePlacement !== 'all'
    if (filterSummary) filterSummary.classList.toggle('visible', filtered)
    if (summaryText) {
      const parts = []
      if (activeStyle !== 'all') parts.push(activeStyle.replace('-', ' '))
      if (activePlacement !== 'all') parts.push(activePlacement)
      summaryText.textContent = parts.join(' · ')
    }
  }

  function clearFilters() {
    activeStyle     = 'all'
    activePlacement = 'all'
    chips.forEach(c => c.classList.toggle('active', c.dataset.filter === 'all'))
    if (placementSel) placementSel.value = 'all'
    applyFilters()
  }

  // ── Chip clicks ──────────────────────────────────────────────────────────
  chips.forEach(chip => {
    chip.addEventListener('click', () => {
      chips.forEach(c => c.classList.remove('active'))
      chip.classList.add('active')
      activeStyle = chip.dataset.filter
      applyFilters()
    })
  })

  // ── Placement select ─────────────────────────────────────────────────────
  if (placementSel) {
    placementSel.addEventListener('change', () => {
      activePlacement = placementSel.value
      applyFilters()
    })
  }

  // ── Clear buttons ────────────────────────────────────────────────────────
  if (filterClear) {
    filterClear.addEventListener('click', clearFilters)
    filterClear.addEventListener('keydown', e => {
      if (e.key === 'Enter' || e.key === ' ') clearFilters()
    })
  }
  if (emptyClear) emptyClear.addEventListener('click', clearFilters)

  // Expose so loadmore can re-run after revealing new tiles
  return { applyFilters }
}
