import { pauseScroll, resumeScroll } from './lenis.js'

export function initLightbox() {
  const lightbox      = document.getElementById('lightbox')
  if (!lightbox) return

  const lbClose       = document.getElementById('lightbox-close')
  const lbPrev        = document.getElementById('lightbox-prev')
  const lbNext        = document.getElementById('lightbox-next')
  const lbTitle       = document.getElementById('lightbox-title')
  const lbSub         = document.getElementById('lightbox-sub')
  const lbCounter     = document.getElementById('lightbox-counter')
  const lbPlaceholder = document.getElementById('lightbox-placeholder')

  let lbIndex = 0
  let lbTiles = []

  // Visible tiles = not hidden by filter OR load-more
  function getVisibleTiles() {
    return Array.from(document.querySelectorAll(
      '.masonry-tile:not([style*="display: none"])'
    ))
  }

  function openLightbox(index) {
    lbTiles = getVisibleTiles()
    lbIndex = index
    updateLightbox()
    lightbox.classList.add('open')
    lightbox.setAttribute('aria-hidden', 'false')
    document.body.style.overflow = 'hidden'
    pauseScroll()
    lbClose?.focus()
  }

  function closeLightbox() {
    lightbox.classList.remove('open')
    lightbox.setAttribute('aria-hidden', 'true')
    document.body.style.overflow = ''
    resumeScroll()
  }

  function updateLightbox() {
    const tile = lbTiles[lbIndex]
    if (!tile) return

    const title = tile.querySelector('.tile-title')?.textContent || ''
    const sub   = tile.querySelector('.tile-sub')?.textContent   || ''

    if (lbTitle)   lbTitle.textContent   = title
    if (lbSub)     lbSub.textContent     = sub
    if (lbCounter) lbCounter.textContent =
      `${String(lbIndex + 1).padStart(2, '0')} / ${String(lbTiles.length).padStart(2, '0')}`

    /*
      When real <img> tags replace the placeholder divs, swap in the image:

      const src = tile.querySelector('img')?.src
      const alt = tile.querySelector('img')?.alt
      let img = document.getElementById('lightbox-img')
      if (!img) {
        img = document.createElement('img')
        img.id = 'lightbox-img'
        lbPlaceholder?.replaceWith(img)
      }
      img.src = src
      img.alt = alt
    */

    // Cycle through palette swatches for placeholder state
    if (lbPlaceholder) {
      const swatches = ['t-moss','t-cream','t-ink','t-sage','t-clay','t-warm','t-deep','t-blush','t-stone','t-dark']
      lbPlaceholder.className = 'lightbox-placeholder ' + swatches[lbIndex % swatches.length]
    }

    const atStart = lbIndex === 0
    const atEnd   = lbIndex === lbTiles.length - 1
    if (lbPrev) { lbPrev.disabled = atStart; lbPrev.style.opacity = atStart ? '0.3' : '1' }
    if (lbNext) { lbNext.disabled = atEnd;   lbNext.style.opacity = atEnd   ? '0.3' : '1' }
  }

  // ── Open on tile click ───────────────────────────────────────────────────
  document.querySelectorAll('.masonry-tile').forEach(tile => {
    tile.addEventListener('click', e => {
      e.preventDefault()
      const visible = getVisibleTiles()
      openLightbox(visible.indexOf(tile))
    })
  })

  // ── Close ────────────────────────────────────────────────────────────────
  lbClose?.addEventListener('click', closeLightbox)

  lightbox.addEventListener('click', e => {
    const inner = lightbox.querySelector('.lightbox-inner')
    if (e.target === lightbox || e.target === inner) closeLightbox()
  })

  // ── Prev / Next ──────────────────────────────────────────────────────────
  lbPrev?.addEventListener('click', () => {
    if (lbIndex > 0) { lbIndex--; updateLightbox() }
  })
  lbNext?.addEventListener('click', () => {
    if (lbIndex < lbTiles.length - 1) { lbIndex++; updateLightbox() }
  })

  // ── Keyboard ─────────────────────────────────────────────────────────────
  document.addEventListener('keydown', e => {
    if (!lightbox.classList.contains('open')) return
    if (e.key === 'Escape')                                        closeLightbox()
    if (e.key === 'ArrowLeft'  && lbIndex > 0)                   { lbIndex--; updateLightbox() }
    if (e.key === 'ArrowRight' && lbIndex < lbTiles.length - 1)  { lbIndex++; updateLightbox() }
  })

  // ── Touch swipe ──────────────────────────────────────────────────────────
  let touchStartX = 0
  lightbox.addEventListener('touchstart', e => {
    touchStartX = e.touches[0].clientX
  }, { passive: true })
  lightbox.addEventListener('touchend', e => {
    const diff = touchStartX - e.changedTouches[0].clientX
    if (Math.abs(diff) < 50) return
    if (diff > 0 && lbIndex < lbTiles.length - 1) { lbIndex++; updateLightbox() }
    if (diff < 0 && lbIndex > 0)                   { lbIndex--; updateLightbox() }
  })
}
