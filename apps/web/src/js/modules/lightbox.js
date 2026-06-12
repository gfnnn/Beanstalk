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
  const lbWrap        = document.getElementById('lightbox-img-wrap')

  let lbIndex = 0
  let lbTiles = []
  let lastFocused = null

  // Visible tiles = not hidden by filter OR load-more. `offsetParent === null` for a
  // display:none element, so this is robust to *how* a tile was hidden — unlike a
  // brittle [style*="display: none"] attribute-substring match.
  function getVisibleTiles() {
    return Array.from(document.querySelectorAll('.masonry-tile'))
      .filter(t => t.offsetParent !== null)
  }

  function openLightbox(index) {
    lastFocused = document.activeElement
    lbTiles = getVisibleTiles()
    lbIndex = index
    updateLightbox()
    lightbox.classList.add('open')
    lightbox.setAttribute('aria-hidden', 'false')
    lightbox.removeAttribute('inert')
    document.body.style.overflow = 'hidden'
    pauseScroll()
    lbClose?.focus()
  }

  function closeLightbox() {
    lightbox.classList.remove('open')
    lightbox.setAttribute('aria-hidden', 'true')
    // Closed dialog keeps its controls out of the tab order / a11y tree.
    lightbox.setAttribute('inert', '')
    document.body.style.overflow = ''
    resumeScroll()
    // Return focus to the tile that opened the dialog — `inert` on a focused
    // descendant otherwise drops focus to <body>, stranding keyboard users at
    // the top of the page (the flash modal already does this).
    lastFocused?.focus()
  }

  // ── Focus trap — one listener, active only while open (mirrors the flash
  // modal). Recomputes bounds each Tab so disabled prev/next at the ends are
  // skipped; without this, aria-modal promises a trap the dialog didn't have.
  lightbox.addEventListener('keydown', e => {
    if (!lightbox.classList.contains('open') || e.key !== 'Tab') return
    const focusable = [...lightbox.querySelectorAll(
      'button, [href], [tabindex]:not([tabindex="-1"])'
    )].filter(el => !el.disabled)
    if (!focusable.length) return
    const first = focusable[0]
    const last  = focusable[focusable.length - 1]
    if (e.shiftKey) {
      if (document.activeElement === first) { e.preventDefault(); last.focus() }
    } else {
      if (document.activeElement === last)  { e.preventDefault(); first.focus() }
    }
  })

  function updateLightbox() {
    const tile = lbTiles[lbIndex]
    if (!tile) return

    const title = tile.querySelector('.tile-title')?.textContent || ''
    const sub   = tile.querySelector('.tile-sub')?.textContent   || ''

    if (lbTitle)   lbTitle.textContent   = title
    if (lbSub)     lbSub.textContent     = sub
    if (lbCounter) lbCounter.textContent =
      `${String(lbIndex + 1).padStart(2, '0')} / ${String(lbTiles.length).padStart(2, '0')}`

    // Real photo if the tile has one; otherwise the palette placeholder. Both
    // nodes are kept and toggled — replacing the placeholder with the first
    // photo used to delete it, so paging photo → placeholder piece then showed
    // the PREVIOUS piece's image under the new piece's title.
    const tileImg = tile.querySelector('img')
    const ph = document.getElementById('lightbox-placeholder')
    let img  = document.getElementById('lightbox-img')
    if (tileImg) {
      if (!img) {
        img = document.createElement('img')
        img.id = 'lightbox-img'
        lbWrap?.prepend(img)
      }
      img.hidden = false
      if (ph) ph.hidden = true
      // data-full lets a tile point at a higher-res file than its grid thumbnail.
      img.src = tileImg.dataset.full || tileImg.currentSrc || tileImg.src
      img.alt = tileImg.alt || title
    } else {
      if (img) img.hidden = true
      if (ph) {
        ph.hidden = false
        const swatches = ['t-moss','t-cream','t-ink','t-sage','t-clay','t-warm','t-deep','t-blush','t-stone','t-dark']
        ph.className = `lightbox-placeholder ${swatches[lbIndex % swatches.length]}`
      }
    }

    const atStart = lbIndex === 0
    const atEnd   = lbIndex === lbTiles.length - 1
    if (lbPrev) { lbPrev.disabled = atStart; lbPrev.style.opacity = atStart ? '0.3' : '1' }
    if (lbNext) { lbNext.disabled = atEnd;   lbNext.style.opacity = atEnd   ? '0.3' : '1' }
  }

  // ── Open on tile click ───────────────────────────────────────────────────
  document.querySelectorAll('.masonry-tile').forEach(tile => {
    tile.addEventListener('click', e => {
      // A modified or non-primary click means "open the piece page in a new
      // tab/window" — let the tile's link do its job instead of the lightbox.
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return
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
