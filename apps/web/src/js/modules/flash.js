import { pauseScroll, resumeScroll } from './lenis.js'
import { ENQUIRY_FN_URL, FLASH_STATUS_FN_URL } from './config.js'
import { track } from './analytics.js'
import { initStickyShadow } from './sticky.js'
import { initFilterCollapse } from './filter-collapse.js'
import { initChipOverflow } from './chip-overflow.js'
import { setButtonLoading, clearButtonLoading } from './spinner.js'

export function initFlash() {
  const grid = document.getElementById('flash-grid')
  if (!grid) return

  const cards      = [...grid.querySelectorAll('.flash-card')]
  const emptyState = document.getElementById('flash-empty')
  const footerCta  = document.querySelector('.flash-cta')
  const filterBar  = document.getElementById('filter-bar')
  const sortSel    = document.getElementById('sort-select')

  if (!cards.length) return

  // ── Drops & the "Past drops" archive ──────────────────────────────────────
  // The live grid shows the CURRENT drop = the highest data-drop value present.
  // Any card from an earlier drop is treated as archive ("Past drops"): kept out of
  // the All / Available / Claimed views and surfaced only under the Past chip. Fully
  // data-driven — to open an archive, leave (or add) records in src/data/flash.js
  // with a lower `drop` number than the current one. When there are none (the
  // default), the Past chip hides itself, so it's never a dead control.
  const currentDrop = Math.max(...cards.map(c => +c.dataset.drop || 0))
  const isPast = c => (+c.dataset.drop || 0) < currentDrop
  const pastChip = document.getElementById('chip-past')

  // ── Count badges (scoped to the current drop; Past gets its own) ──────────
  function updateCounts() {
    const current = cards.filter(c => !isPast(c))
    const total   = current.length
    const avail   = current.filter(c => c.dataset.status === 'available').length
    const claimed = current.filter(c =>
      c.dataset.status === 'claimed' || c.dataset.status === 'pending'
    ).length
    const past    = cards.length - current.length

    const el = id => document.getElementById(id)
    const all  = el('count-all');       if (all)     all.textContent     = `(${total})`
    const av   = el('count-available'); if (av)      av.textContent      = `(${avail})`
    const cl   = el('count-claimed');   if (cl)      cl.textContent      = `(${claimed})`

    // Past chip only exists when there's actually an archive to show.
    if (pastChip) {
      const badge = pastChip.querySelector('.chip-count')
      if (badge) badge.textContent = `(${past})`
      pastChip.hidden = past === 0
    }
  }
  updateCounts()

  // ── Filter bar sticky shadow + responsive chip overflow ───────────────────
  // Same responsive collapse/select-wrap as the portfolio bar. Flash has only a
  // few status chips so they rarely overflow, but this keeps the behaviour
  // consistent and stops the sort select being clipped on a narrow desktop. The
  // bar stays pinned under the nav (position: sticky) — no scroll-driven hide.
  initStickyShadow(filterBar)
  initChipOverflow(filterBar)
  // Mobile collapse: the bar starts collapsed behind a "Filters" toggle so it
  // doesn't cover the grid; a tap reveals it. No-op on desktop. (Same helper as
  // the portfolio bar — see modules/filter-collapse.js.)
  initFilterCollapse(filterBar)

  // ── Filter + sort ────────────────────────────────────────────────────────
  let activeFilter = 'all'

  document.querySelectorAll('.chip[data-filter]').forEach(chip => {
    chip.addEventListener('click', () => {
      // 'past' is a normal filter now — it shows the archive of earlier drops
      // (see isPast / applyFilterSort). The chip only exists when there's an archive.
      activeFilter = chip.dataset.filter
      document.querySelectorAll('.chip[data-filter]').forEach(c =>
        c.classList.toggle('active', c === chip)
      )
      applyFilterSort()
    })
  })

  if (sortSel) sortSel.addEventListener('change', applyFilterSort)

  // Run once on load so the default "all" view is already drop-scoped (archive
  // excluded) and in default sort order, not just after the first interaction.
  applyFilterSort()

  // ── Live availability ──────────────────────────────────────────────────────
  // The grid ships static (status baked in at build), so a piece claimed since
  // then would still look available. On load, reconcile against the server's
  // live claim map. Best-effort: if the call fails, the static grid still works.
  function applyCardStatus(id, status) {
    if (!id || (status !== 'pending' && status !== 'claimed')) return false
    const card = cards.find(c => c.dataset.id === id)
    if (!card || card.dataset.status === status) return false
    if (card.dataset.status === 'claimed' && status === 'pending') return false // don't downgrade
    card.dataset.status = status
    const badge = card.querySelector('.card-status')
    if (badge) {
      badge.className   = `card-status ${status === 'claimed' ? 'claimed-status' : 'pending'}`
      badge.textContent = status === 'claimed' ? 'Claimed' : 'Pending'
    }
    const btn = card.querySelector('.claim-btn')
    if (btn) {
      btn.disabled = true
      btn.setAttribute('aria-disabled', 'true')
      btn.textContent = status === 'pending' ? 'Pending deposit' : 'Claimed'
    }
    return true
  }

  async function loadLiveStatus() {
    try {
      const res = await fetch(FLASH_STATUS_FN_URL)
      if (!res.ok) return
      const { claims } = await res.json().catch(() => ({}))
      if (!claims || typeof claims !== 'object') return
      let changed = false
      for (const [id, status] of Object.entries(claims)) {
        if (applyCardStatus(id, status)) changed = true
      }
      if (changed) { updateCounts(); applyFilterSort() }
    } catch (_) { /* availability is best-effort */ }
  }
  loadLiveStatus()

  function applyFilterSort() {
    const sortVal = sortSel ? sortSel.value : 'default'

    // Re-order cards in DOM by sort value
    const sorted = [...cards].sort((a, b) => {
      if (sortVal === 'price-asc')  return +a.dataset.price - +b.dataset.price
      if (sortVal === 'price-desc') return +b.dataset.price - +a.dataset.price
      if (sortVal === 'size-asc')   return +a.dataset.size  - +b.dataset.size
      return +b.dataset.drop - +a.dataset.drop // newest first (default)
    })

    // Only touch the DOM when the order actually changes. Besides avoiding a needless
    // reflow, this stops us yanking the cards mid-entrance: loadLiveStatus() re-runs this
    // on its async resolve, and a status update never changes the order — reordering then
    // would move the cards while the on-load cascade (modules/animations.js) is still
    // running and could strand a card's transform a few px off. (insertBefore keeps cards
    // before the empty state, which the static markup already guarantees.)
    const domOrder = [...grid.querySelectorAll('.flash-card')]
    if (sorted.some((c, i) => c !== domOrder[i])) {
      sorted.forEach(c => grid.insertBefore(c, emptyState))
    }

    // Show / hide. The archive (earlier drops) appears only under the 'past'
    // filter; every other view is scoped to the current drop.
    let visible = 0
    sorted.forEach(c => {
      const match = activeFilter === 'past'
        ? isPast(c)
        : !isPast(c) && (
            activeFilter === 'all' ||
            c.dataset.status === activeFilter ||
            (activeFilter === 'claimed' &&
              (c.dataset.status === 'claimed' || c.dataset.status === 'pending'))
          )

      c.style.display = match ? '' : 'none'
      if (match) visible++
    })

    if (emptyState) {
      emptyState.classList.toggle('visible', visible === 0)
      emptyState.style.display = visible === 0 ? 'block' : 'none'
    }

    // The empty state already offers a "Start a custom enquiry" CTA, so the
    // footer CTA would be a redundant second banner — hide it when empty.
    if (footerCta) footerCta.hidden = visible === 0
  }

  // ── Claim modal ───────────────────────────────────────────────────────────
  const overlay = document.getElementById('claim-modal')
  if (!overlay) return

  const closeBtn   = document.getElementById('modal-close')
  const cancelBtn  = document.getElementById('modal-cancel')
  const submitBtn  = document.getElementById('modal-submit')
  const form       = document.getElementById('claim-form')
  const pieceName  = document.getElementById('modal-piece-name')
  const pieceInput = document.getElementById('modal-piece-input')
  const priceInput = document.getElementById('modal-price-input')
  const idInput    = document.getElementById('modal-id-input')
  const firstField = document.getElementById('claim-name')

  let lastFocused = null
  // Synchronous open/closed state — NOT derived from the .open class, which only
  // lands on the next animation frame: a stale close firing in that gap would
  // read the class as "closed" and hide a modal the visitor just reopened.
  let modalOpen = false

  function openModal(name, price, id) {
    lastFocused = document.activeElement
    modalOpen = true

    if (pieceName)  pieceName.textContent = name
    if (pieceInput) pieceInput.value      = name
    if (priceInput) priceInput.value      = price
    if (idInput)    idInput.value         = id || ''

    overlay.hidden = false
    // Commit the un-hidden frame before .open lands: with [hidden] now genuinely
    // display:none (reset.css), flipping both in one style recalc would skip the
    // opacity fade (transitions can't start from display:none).
    void overlay.offsetHeight
    requestAnimationFrame(() => overlay.classList.add('open'))
    document.body.style.overflow = 'hidden'
    pauseScroll()

    setTimeout(() => firstField?.focus(), 100)
  }

  function closeModal() {
    modalOpen = false
    overlay.classList.remove('open')
    // Hide on the fade-out, with a timeout fallback for the reduced-motion /
    // no-transition case where `transitionend` never fires (which would otherwise
    // leave the overlay in the a11y tree). Belt-and-braces, like the page loader.
    // The modalOpen re-check guards the close→reopen race: reopening within the
    // fade window must not let the stale transitionend/timeout from the PREVIOUS
    // close hide a modal the visitor has just reopened (it would vanish
    // mid-interaction with the page scroll still locked).
    let hidden = false
    const hide = () => {
      if (hidden || modalOpen) return
      hidden = true
      overlay.hidden = true
    }
    overlay.addEventListener('transitionend', hide, { once: true })
    setTimeout(hide, 400)
    document.body.style.overflow = ''
    resumeScroll()
    lastFocused?.focus()
  }

  // Wire claim buttons
  cards.forEach(card => {
    const btn = card.querySelector('.claim-btn:not(:disabled)')
    if (btn) {
      btn.addEventListener('click', () =>
        openModal(btn.dataset.piece, btn.dataset.price, card.dataset.id)
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

  // Reflect a just-changed piece in the grid (by id) and refresh counts/filter.
  function markCard(status) {
    if (idInput && applyCardStatus(idInput.value, status)) {
      updateCounts()
      applyFilterSort()
    }
  }

  // Form submit → Cloudflare Worker (kind: 'flash') → Resend
  if (form) {
    form.addEventListener('submit', async e => {
      e.preventDefault()
      // Ignore a re-entrant submit (e.g. Enter pressed in a field) while a claim
      // is already in flight — the disabled button blocks a second click, but a
      // keyboard submit would otherwise fire a duplicate claim POST.
      if (submitBtn?.dataset.loading === 'true') return
      clearModalError()

      setButtonLoading(submitBtn, 'Sending…')

      const fields = {}
      new FormData(form).forEach((v, k) => { fields[k] = v })

      try {
        const res = await fetch(ENQUIRY_FN_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ kind: 'flash', fields }),
        })
        const json = await res.json().catch(() => ({}))

        // Someone claimed this piece first — mark it claimed in the grid and
        // keep the modal open so the message is seen.
        if (res.status === 409) {
          markCard('claimed')
          showModalError(json.error || 'That piece was just claimed by someone else.')
          clearButtonLoading(submitBtn)
          return
        }
        if (!res.ok) throw new Error(json.error || 'Something went wrong. Please try again.')

        track('flash_claim', { piece: pieceInput ? pieceInput.value : 'unknown' })
        markCard('pending')
        closeModal()
        form.reset()
        clearButtonLoading(submitBtn)
      } catch (err) {
        console.error('Flash claim error:', err)
        showModalError(err.message || 'Couldn’t send. Please try again, or email hello@beansprout.ink.')
        clearButtonLoading(submitBtn)
      }
    })
  }

  // ── Focus trap — one listener, active only while the modal is open ─────────
  // Attached once (not per-open) so reopening can't stack duplicate handlers.
  // Recomputes the focusable bounds each Tab so it tracks the modal's live contents.
  overlay.addEventListener('keydown', e => {
    if (overlay.hidden || e.key !== 'Tab') return
    // Disabled controls can't take focus — including them in the trap's bounds
    // would let Tab escape the modal when a wrap lands on one.
    const focusable = [...overlay.querySelectorAll(
      'button, input, textarea, select, [tabindex]:not([tabindex="-1"])'
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
}
