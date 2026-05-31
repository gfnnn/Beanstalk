const PAGE_SIZE = 16

export function initLoadMore() {
  const loadMoreBtn     = document.getElementById('load-more-btn')
  if (!loadMoreBtn) return

  const allTiles        = Array.from(document.querySelectorAll('.masonry-tile'))
  const showingCount    = document.getElementById('showing-count')
  const totalCount      = document.getElementById('total-count')
  const progressFill    = document.getElementById('progress-fill')
  const loadMoreSection = document.getElementById('load-more-section')
  const total           = allTiles.length

  let shownCount = Math.min(PAGE_SIZE, total)

  // Mark initial state on every tile so filter.js knows which are loaded
  allTiles.forEach((tile, i) => {
    if (i < PAGE_SIZE) {
      tile.dataset.shown = 'true'
    } else {
      tile.dataset.shown = 'false'
      tile.style.display = 'none'
    }
  })

  function updateUI() {
    if (showingCount) showingCount.textContent = shownCount
    if (totalCount)   totalCount.textContent   = total
    if (progressFill) progressFill.style.width = `${(shownCount / total) * 100}%`
    if (loadMoreSection) {
      loadMoreSection.style.display = shownCount >= total ? 'none' : ''
    }
  }

  loadMoreBtn.addEventListener('click', () => {
    const next = Math.min(shownCount + PAGE_SIZE, total)

    allTiles.slice(shownCount, next).forEach(tile => {
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
  })

  updateUI()
}
