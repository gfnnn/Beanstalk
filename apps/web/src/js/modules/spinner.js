// ── Shared button "busy" state ────────────────────────────────────────────────
// Swaps a button's contents for an animated spinner + label while an async action
// runs, then restores the original contents verbatim. Used by the portfolio
// load-more control and the enquiry / flash / newsletter form submits so the
// "is it actually doing something?" feedback is consistent across the site (and
// reduced-motion-aware — the spin is disabled in CSS, see components/buttons.css).
//
// The label strings are hard-coded call-site literals ('Loading…', 'Sending…',
// 'Subscribing…'), so the innerHTML write below carries no untrusted input.
const SPINNER = '<span class="btn-spinner" aria-hidden="true"></span>'

/** Put `btn` into its loading state. Idempotent — a second call is a no-op until
 *  cleared. Stashes the idle markup so clearButtonLoading can restore it exactly. */
export function setButtonLoading(btn, text = 'Sending…') {
  if (!btn || btn.dataset.loading === 'true') return
  btn.dataset.loading  = 'true'
  btn.dataset.idleHtml = btn.innerHTML
  btn.disabled = true
  btn.setAttribute('aria-busy', 'true')
  btn.innerHTML = `${SPINNER}<span class="btn-loading-label">${text}</span>`
}

/** Restore `btn` to the markup it had before setButtonLoading. No-op if it isn't
 *  currently in a loading state. */
export function clearButtonLoading(btn) {
  if (!btn || btn.dataset.loading !== 'true') return
  if (btn.dataset.idleHtml != null) btn.innerHTML = btn.dataset.idleHtml
  delete btn.dataset.idleHtml
  delete btn.dataset.loading
  btn.disabled = false
  btn.removeAttribute('aria-busy')
}
