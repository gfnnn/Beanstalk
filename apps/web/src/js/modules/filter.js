// Portfolio filter / sort. Scoped to the masonry grid so it never runs on the
// flash page (which also has a #filter-bar but is driven by flash.js).
//
// `resetWindow` (from initLoadMore) re-windows the "load more" set after a sort
// reorders the tiles. The returned `applyFilters` is handed back to load-more so
// newly-revealed tiles get filtered too (see main.js).
import { initStickyShadow } from './sticky.js'
import { initChipOverflow } from './chip-overflow.js'

export function initFilter({ resetWindow } = {}) {
  const grid = document.getElementById('masonry-grid')
  if (!grid) return

  const filterBar     = document.getElementById('filter-bar')
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
  // The bar stays pinned under the nav (position: sticky) the whole time — no
  // scroll-driven hide/show; only a shadow fades in once it's stuck.
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

  // ── Responsive chip overflow (shared with the flash bar) ──────────────────
  // Collapses the secondary style chips behind "More" / wraps the selects when
  // the row is tight. See modules/chip-overflow.js.
  initChipOverflow(filterBar)

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
