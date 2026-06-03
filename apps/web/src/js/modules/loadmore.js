const PAGE_SIZE = 16

export function initLoadMore() {
  const loadMoreBtn     = document.getElementById('load-more-btn')
  if (!loadMoreBtn) return

  const showingCount    = document.getElementById('showing-count')
  const totalCount      = document.getElementById('total-count')
  const progressFill    = document.getElementById('progress-fill')
  const loadMoreSection = document.getElementById('load-more-section')

  // Re-query each time: a sort can reorder the tiles in the DOM.
  const getTiles = () => Array.from(document.querySelectorAll('.masonry-tile'))
  const total    = getTiles().length

  let shownCount = Math.min(PAGE_SIZE, total)
  let onReveal   = null

  // Mark which tiles are within the current window so filter.js knows which are
  // loaded. Only ever sets display for hidden tiles / un-hides ones we hid —
  // matched-ness is the filter's job (applyFilters runs after).
  function applyWindow() {
    getTiles().forEach((tile, i) => {
      const shown = i < shownCount
      tile.dataset.shown = shown ? 'true' : 'false'
      if (!shown) tile.style.display = 'none'
      else if (tile.style.display === 'none') tile.style.display = ''
    })
  }

  function updateUI() {
    if (showingCount) showingCount.textContent = shownCount
    if (totalCount)   totalCount.textContent   = total
    if (progressFill) progressFill.style.width = `${(shownCount / total) * 100}%`
    if (loadMoreSection) {
      loadMoreSection.style.display = shownCount >= total ? 'none' : ''
    }
  }

  loadMoreBtn.addEventListener('click', () => {
    const tiles = getTiles()
    const next  = Math.min(shownCount + PAGE_SIZE, total)

    tiles.slice(shownCount, next).forEach(tile => {
      tile.dataset.shown = 'true'
      tile.style.display = ''
      tile.style.opacity = '0'
      requestAnimationFrame(() => {
        tile.style.transition = 'opacity 400ms ease'
        tile.style.opacity    = '1'
      })
    })

    shownCount = next
    updateUI()
    onReveal?.()   // let the filter hide any newly-revealed non-matching tiles
  })

  // Reset the window to the first page — used after a sort reorders the tiles.
  function reset() {
    shownCount = Math.min(PAGE_SIZE, total)
    applyWindow()
    updateUI()
  }

  applyWindow()
  updateUI()

  return {
    reset,
    setOnReveal: fn => { onReveal = fn },
  }
}
