import { pauseScroll, resumeScroll } from './lenis.js'
import { ENQUIRY_FN_URL } from './config.js'

export function initFlash() {
  const grid = document.getElementById('flash-grid')
  if (!grid) return

  const cards      = [...grid.querySelectorAll('.flash-card')]
  const emptyState = document.getElementById('flash-empty')
  const filterBar  = document.getElementById('filter-bar')
  const sortSel    = document.getElementById('sort-select')

  if (!cards.length) return

  // ── Count badges ────────────────────────────────────────────────────────
  function updateCounts() {
    const total   = cards.length
    const avail   = cards.filter(c => c.dataset.status === 'available').length
    const claimed = cards.filter(c =>
      c.dataset.status === 'claimed' || c.dataset.status === 'pending'
    ).length

    const el = id => document.getElementById(id)
    const all  = el('count-all');       if (all)     all.textContent     = `(${total})`
    const av   = el('count-available'); if (av)      av.textContent      = `(${avail})`
    const cl   = el('count-claimed');   if (cl)      cl.textContent      = `(${claimed})`
  }
  updateCounts()

  // ── Filter bar sticky shadow ─────────────────────────────────────────────
  if (filterBar && 'IntersectionObserver' in window) {
    const navH = parseInt(
      getComputedStyle(document.documentElement).getPropertyValue('--nav-h')
    ) || 65
    const obs = new IntersectionObserver(
      ([e]) => filterBar.classList.toggle('stuck', !e.isIntersecting),
      { threshold: 1, rootMargin: `-${navH}px 0px 0px 0px` }
    )
    obs.observe(filterBar)
  }

  // ── Filter + sort ────────────────────────────────────────────────────────
  let activeFilter = 'all'

  document.querySelectorAll('.chip[data-filter]').forEach(chip => {
    chip.addEventListener('click', () => {
      const f = chip.dataset.filter

      if (f === 'past') {
        // DEV NOTE: navigate to /flash/archive or fetch past drops from CMS
        console.info('Past drops archive — not yet implemented.')
        return
      }

      activeFilter = f
      document.querySelectorAll('.chip[data-filter]').forEach(c =>
        c.classList.toggle('active', c === chip)
      )
      applyFilterSort()
    })
  })

  if (sortSel) sortSel.addEventListener('change', applyFilterSort)

  function applyFilterSort() {
    const sortVal = sortSel ? sortSel.value : 'default'

    // Re-order cards in DOM by sort value
    const sorted = [...cards].sort((a, b) => {
      if (sortVal === 'price-asc')  return +a.dataset.price - +b.dataset.price
      if (sortVal === 'price-desc') return +b.dataset.price - +a.dataset.price
      if (sortVal === 'size-asc')   return +a.dataset.size  - +b.dataset.size
      return +b.dataset.drop - +a.dataset.drop // newest first (default)
    })

    sorted.forEach(c => grid.insertBefore(c, emptyState))

    // Show / hide by status
    let visible = 0
    sorted.forEach(c => {
      const match =
        activeFilter === 'all' ||
        c.dataset.status === activeFilter ||
        (activeFilter === 'claimed' &&
          (c.dataset.status === 'claimed' || c.dataset.status === 'pending'))

      c.style.display = match ? '' : 'none'
      if (match) visible++
    })

    if (emptyState) {
      emptyState.classList.toggle('visible', visible === 0)
      emptyState.style.display = visible === 0 ? 'block' : 'none'
    }
  }

  // ── Claim modal ───────────────────────────────────────────────────────────
  const overlay = document.getElementById('claim-modal')
  if (!overlay) return

  const modal      = overlay.querySelector('.modal')
  const closeBtn   = document.getElementById('modal-close')
  const cancelBtn  = document.getElementById('modal-cancel')
  const submitBtn  = document.getElementById('modal-submit')
  const form       = document.getElementById('claim-form')
  const pieceName  = document.getElementById('modal-piece-name')
  const pieceInput = document.getElementById('modal-piece-input')
  const priceInput = document.getElementById('modal-price-input')
  const firstField = document.getElementById('claim-name')

  let lastFocused = null

  function openModal(name, price) {
    lastFocused = document.activeElement

    if (pieceName)  pieceName.textContent = name
    if (pieceInput) pieceInput.value      = name
    if (priceInput) priceInput.value      = price

    overlay.hidden = false
    requestAnimationFrame(() => overlay.classList.add('open'))
    document.body.style.overflow = 'hidden'
    pauseScroll()

    setTimeout(() => firstField?.focus(), 100)
    trapFocus(overlay)
  }

  function closeModal() {
    overlay.classList.remove('open')
    overlay.addEventListener('transitionend', () => {
      overlay.hidden = true
    }, { once: true })
    document.body.style.overflow = ''
    resumeScroll()
    lastFocused?.focus()
  }

  // Wire claim buttons
  cards.forEach(card => {
    const btn = card.querySelector('.claim-btn:not(:disabled)')
    if (btn) {
      btn.addEventListener('click', () =>
        openModal(btn.dataset.piece, btn.dataset.price)
      )
    }
  })

  if (closeBtn)  closeBtn.addEventListener('click', closeModal)
  if (cancelBtn) cancelBtn.addEventListener('click', closeModal)
  overlay.addEventListener('click', e => { if (e.target === overlay) closeModal() })

  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && !overlay.hidden) closeModal()
  })

  // ── Inline error + "mark pending" helpers ──────────────────────────────────
  function showModalError(msg) {
    let el = document.getElementById('claim-error')
    if (!el) {
      el = document.createElement('p')
      el.id = 'claim-error'
      el.setAttribute('role', 'alert')
      el.style.cssText = 'margin:0 0 4px;font-size:13px;color:var(--clay,#C45A3E);line-height:1.45'
      form.querySelector('.modal-foot')?.before(el)
    }
    el.textContent = msg
  }
  const clearModalError = () => document.getElementById('claim-error')?.remove()

  function markPending() {
    if (!pieceInput) return
    const claimedCard = cards.find(c =>
      c.querySelector('.claim-btn')?.dataset.piece === pieceInput.value
    )
    if (!claimedCard) return
    claimedCard.dataset.status = 'pending'
    const statusEl = claimedCard.querySelector('.card-status')
    if (statusEl) { statusEl.className = 'card-status pending'; statusEl.textContent = 'Pending' }
    const claimBtnEl = claimedCard.querySelector('.claim-btn')
    if (claimBtnEl) { claimBtnEl.disabled = true; claimBtnEl.textContent = 'Pending deposit' }
    updateCounts()
  }

  // Form submit → Netlify function (kind: 'flash') → Resend
  if (form) {
    form.addEventListener('submit', async e => {
      e.preventDefault()
      clearModalError()

      if (ENQUIRY_FN_URL.includes('YOUR-SITE')) {
        showModalError('Claims aren’t connected yet. (Set VITE_ENQUIRY_FN_URL.)')
        return
      }

      const label = submitBtn ? submitBtn.textContent : ''
      if (submitBtn) { submitBtn.disabled = true; submitBtn.textContent = 'Sending…' }

      const fields = {}
      new FormData(form).forEach((v, k) => { fields[k] = v })

      try {
        const res = await fetch(ENQUIRY_FN_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ kind: 'flash', fields }),
        })
        const json = await res.json().catch(() => ({}))
        if (!res.ok) throw new Error(json.error || 'Something went wrong. Please try again.')

        markPending()
        closeModal()
        form.reset()
        if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = label }
      } catch (err) {
        console.error('Flash claim error:', err)
        showModalError(err.message || 'Couldn’t send. Please try again, or email hello@beansprout.ink.')
        if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = label }
      }
    })
  }

  // ── Focus trap helper ─────────────────────────────────────────────────────
  function trapFocus(container) {
    const focusable = container.querySelectorAll(
      'button, input, textarea, select, [tabindex]:not([tabindex="-1"])'
    )
    const first = focusable[0]
    const last  = focusable[focusable.length - 1]

    const handler = e => {
      if (container.hidden) { container.removeEventListener('keydown', handler); return }
      if (e.key !== 'Tab') return
      if (e.shiftKey) {
        if (document.activeElement === first) { e.preventDefault(); last.focus() }
      } else {
        if (document.activeElement === last)  { e.preventDefault(); first.focus() }
      }
    }

    container.addEventListener('keydown', handler)
  }
}
