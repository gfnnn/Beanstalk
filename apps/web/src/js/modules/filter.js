// Portfolio filter / sort. Scoped to the masonry grid so it never runs on the
// flash page (which also has a #filter-bar but is driven by flash.js).
//
// `resetWindow` (from initLoadMore) re-windows the "load more" set after a sort
// reorders the tiles. The returned `applyFilters` is handed back to load-more so
// newly-revealed tiles get filtered too (see main.js).
import { initStickyShadow } from './sticky.js'

export function initFilter({ resetWindow } = {}) {
  const grid = document.getElementById('masonry-grid')
  if (!grid) return

  const filterBar     = document.getElementById('filter-bar')
  const filterChips   = document.querySelector('.filter-chips')
  const chipMoreBtn   = document.getElementById('chip-more-btn')
  const chips         = [...document.querySelectorAll('.chip')]
  const tiles         = [...grid.querySelectorAll('.masonry-tile')]
  const placementSel  = document.getElementById('placement-filter')
  const sortSel       = document.getElementById('sort-order')
  const loadMoreSection = document.getElementById('load-more-section')
  const emptyState    = document.getElementById('empty-state')
  const filterSummary = document.getElementById('filter-summary')
  const summaryText   = document.getElementById('summary-text')
  const filterClear   = document.getElementById('filter-clear')
  const emptyClear    = document.getElementById('empty-clear')

  let activeStyle     = 'all'
  let activePlacement = 'all'

  // A piece can carry several styles, e.g. data-style="botanical fine-line".
  const stylesOf = tile => (tile.dataset.style || '').split(/\s+/).filter(Boolean)

  // ── Sticky detection (shadow when filter bar is pinned) ──────────────────
  initStickyShadow(filterBar)

  // ── Chip counts — from the full catalogue, not the loaded window ──────────
  function updateCounts() {
    chips.forEach(chip => {
      const f       = chip.dataset.filter
      const countEl = chip.querySelector('.chip-count')
      if (!countEl) return
      const n = f === 'all'
        ? tiles.length
        : tiles.filter(t => stylesOf(t).includes(f)).length
      countEl.textContent  = n
      countEl.dataset.count = n
    })
  }

  // ── Filter application ───────────────────────────────────────────────────
  function applyFilters() {
    const filtered = activeStyle !== 'all' || activePlacement !== 'all'
    let visible = 0

    tiles.forEach(tile => {
      const styleMatch     = activeStyle === 'all'     || stylesOf(tile).includes(activeStyle)
      const placementMatch = activePlacement === 'all' || tile.dataset.placement === activePlacement
      const match = styleMatch && placementMatch

      // Unfiltered browse respects the load-more window (show the first page, hide
      // the rest). An active filter searches the WHOLE catalogue, so a match that
      // hasn't been paged in yet — e.g. the single Script piece — is still found
      // instead of falling into a false "no results" empty state.
      const inWindow = tile.dataset.shown !== 'false'
      const show = filtered ? match : (match && inWindow)

      tile.style.display = show ? '' : 'none'
      if (show) visible++
    })

    if (emptyState) emptyState.classList.toggle('visible', visible === 0)

    // Load-more only paginates the unfiltered grid. While a filter is active every
    // match is already shown, so hide the control; unfiltered, show it only while
    // the window is still holding tiles back.
    if (loadMoreSection) {
      const moreInWindow = tiles.some(t => t.dataset.shown === 'false')
      loadMoreSection.style.display = (!filtered && moreInWindow) ? '' : 'none'
    }

    if (filterSummary) filterSummary.classList.toggle('visible', filtered)
    if (summaryText) {
      const parts = []
      if (activeStyle !== 'all') parts.push(activeStyle.replace('-', ' '))
      if (activePlacement !== 'all') parts.push(activePlacement)
      summaryText.textContent = parts.join(' · ')
    }
  }

  // ── Sort — reorder tiles in the DOM, then re-window + re-filter ───────────
  function applySort() {
    const order = sortSel ? sortSel.value : 'newest'
    const sorted = [...tiles].sort((a, b) => {
      const ao = +a.dataset.order || 0
      const bo = +b.dataset.order || 0
      return order === 'oldest' ? ao - bo : bo - ao
    })
    sorted.forEach(t => grid.appendChild(t))
    resetWindow?.()   // load-more re-windows to the new order (first page shown)
    applyFilters()
  }

  function clearFilters() {
    activeStyle     = 'all'
    activePlacement = 'all'
    chips.forEach(c => c.classList.toggle('active', c.dataset.filter === 'all'))
    if (placementSel) placementSel.value = 'all'
    applyFilters()
  }

  // ── "More" toggle + overflow-aware collapse ──────────────────────────────
  // The secondary style chips (illustrative, dotwork, colour, script) collapse
  // behind a "More" toggle whenever they don't fit — always on narrow viewports
  // (pure CSS), and on desktop too once the row can't hold every chip alongside
  // the selects. The desktop case is measured here in JS and collapses chips
  // ONE AT A TIME from the end (priority-nav pattern): we hide only as many as
  // the width demands — and reserve room for the "More" button and the selects —
  // so we never drop four chips while there's still room for two, nor push the
  // toggle itself off the row.
  const desktopMq = window.matchMedia?.('(min-width: 640px)') ?? null
  // Priority chips (always shown) lead the list; the rest live in
  // `.chips-secondary` and are the ones that collapse, dropped last-first.
  const priorityCount = chips.filter(c => !c.closest('.chips-secondary')).length

  function setExpanded(expanded) {
    filterChips.classList.toggle('expanded', expanded)
    if (chipMoreBtn) chipMoreBtn.setAttribute('aria-expanded', String(expanded))
  }

  function applyChipOverflow() {
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
    const gap   = parseFloat(getComputedStyle(filterChips).columnGap) || 0
    const widths = chips.map(c => c.offsetWidth)
    const moreW  = chipMoreBtn ? chipMoreBtn.offsetWidth : 0

    // Floor = priority chips + "More". Pinning the chip row to this width makes
    // the selects (not the chips) wrap to a second line once they can't share a
    // row, so the toggle can never be clipped. Read `avail` AFTER it's applied.
    const prioritySum = widths.slice(0, priorityCount).reduce((a, b) => a + b, 0)
    const floor = prioritySum + moreW + gap * priorityCount
    filterChips.style.minWidth = floor + 'px'
    const avail = filterChips.clientWidth
    filterBar.classList.remove('measuring')

    const totalAll = widths.reduce((a, b) => a + b, 0) + gap * (chips.length - 1)

    // Everything fits → show all, no "More", no open state.
    if (totalAll <= avail) {
      filterBar.classList.remove('needs-more')
      setExpanded(false)
      return
    }

    // Doesn't fit → the "More" toggle is needed.
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

  if (chipMoreBtn && filterChips) {
    chipMoreBtn.addEventListener('click', () => {
      setExpanded(!filterChips.classList.contains('expanded'))
      applyChipOverflow()
    })

    applyChipOverflow()
    if (typeof ResizeObserver !== 'undefined') {
      // rAF-debounced so our own height changes (the bar grows when "More"
      // opens) don't retrigger a ResizeObserver loop.
      let scheduled = false
      new ResizeObserver(() => {
        if (scheduled) return
        scheduled = true
        requestAnimationFrame(() => { scheduled = false; applyChipOverflow() })
      }).observe(filterBar)
    } else {
      window.addEventListener('resize', applyChipOverflow)
    }
    desktopMq?.addEventListener?.('change', applyChipOverflow)
    document.fonts?.ready.then(applyChipOverflow)   // labels resize once fonts load
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

  // ── Sort select ──────────────────────────────────────────────────────────
  if (sortSel) sortSel.addEventListener('change', applySort)

  // ── Clear buttons ────────────────────────────────────────────────────────
  if (filterClear) {
    filterClear.addEventListener('click', clearFilters)
    filterClear.addEventListener('keydown', e => {
      if (e.key === 'Enter' || e.key === ' ') clearFilters()
    })
  }
  if (emptyClear) emptyClear.addEventListener('click', clearFilters)

  // ── Deep link — apply a style from the URL (?style=…) on load ─────────────
  // The homepage specialism cards link here as /portfolio/?style=<token>, so the
  // customer lands with that style already filtered. Only honour a token that
  // maps to a real chip (ignore unknown/empty values → normal "All" browse).
  function applyStyleFromUrl() {
    const wanted = new URLSearchParams(location.search).get('style')
    if (!wanted) return
    const chip = chips.find(c => c.dataset.filter === wanted)
    if (!chip) return
    chips.forEach(c => c.classList.remove('active'))
    chip.classList.add('active')
    activeStyle = wanted
  }

  applyStyleFromUrl()
  updateCounts()
  applyFilters()

  // Expose so loadmore can re-run after revealing new tiles
  return { applyFilters }
}
