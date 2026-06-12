import { setButtonLoading, clearButtonLoading } from './spinner.js'

const PAGE_SIZE = 16
const now = () => (typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now())

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
    if (progressFill) {
      progressFill.style.width = `${total ? (shownCount / total) * 100 : 0}%`
      // Keep the progressbar's ARIA in step with the visual fill (the markup
      // ships placeholder values; the catalogue size is only known here).
      const bar = progressFill.closest('[role="progressbar"]')
      if (bar) {
        bar.setAttribute('aria-valuenow', shownCount)
        bar.setAttribute('aria-valuemax', total)
      }
    }
    if (loadMoreSection) {
      loadMoreSection.style.display = shownCount >= total ? 'none' : ''
    }
  }

  loadMoreBtn.addEventListener('click', () => {
    if (loadMoreBtn.disabled) return
    const tiles = getTiles()
    const next  = Math.min(shownCount + PAGE_SIZE, total)
    const batch = tiles.slice(shownCount, next)

    // The tiles are already in the DOM — clicking only un-hides them, so the real
    // "nothing is happening" gap is their lazy-loaded images fetching. Hold the
    // button in its loading state until those images settle so the wait reads as
    // progress, not a frozen page.
    setButtonLoading(loadMoreBtn, 'Loading…')

    batch.forEach(tile => {
      tile.dataset.shown = 'true'
      tile.style.display = ''
      tile.style.opacity = '0'
    })
    // A transition can't start from display:none, and rAF runs BEFORE the
    // frame's style recalc — so the old single-rAF version computed
    // `none → opacity:1` in one step: the fade never played and its
    // transitionend cleanup never fired (leaving the inline styles behind).
    // Committing one layout here makes opacity:0 the real start state.
    void loadMoreBtn.offsetWidth
    batch.forEach(tile => {
      tile.style.transition = 'opacity 400ms ease'
      tile.style.opacity    = '1'
      // Drop the inline transition/opacity once the fade-in is done so tiles
      // don't carry leftover inline styles for the rest of the page's life —
      // with a timer fallback, since transitionend can be skipped (backgrounded
      // tab, interrupted transition).
      const clearInline = () => {
        tile.style.transition = ''
        tile.style.opacity    = ''
      }
      tile.addEventListener('transitionend', clearInline, { once: true })
      setTimeout(clearInline, 500)
    })

    shownCount = next
    updateUI()
    onReveal?.()   // let the filter hide any newly-revealed non-matching tiles

    settleBatch(batch)
  })

  // Restore the button once the revealed batch's images have loaded. A small floor
  // keeps the spinner from just flashing on a fast/cached reveal; a ceiling stops a
  // slow (or off-screen, still-lazy) image from pinning it open indefinitely.
  function settleBatch(batch) {
    const started = now()
    const pending = batch
      .flatMap(tile => [...tile.querySelectorAll('img')])
      .filter(img => !img.complete)

    const loaded = pending.length
      ? Promise.all(pending.map(img => new Promise(res => {
          img.addEventListener('load',  res, { once: true })
          img.addEventListener('error', res, { once: true })
        })))
      : Promise.resolve()
    const ceiling = new Promise(res => setTimeout(res, 1600))

    Promise.race([loaded, ceiling]).then(() => {
      const floor = Math.max(0, 300 - (now() - started))
      setTimeout(() => clearButtonLoading(loadMoreBtn), floor)
    })
  }

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
