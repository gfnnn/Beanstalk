// @vitest-environment jsdom
//
// Tests for the shared button busy-state helper (src/js/modules/spinner.js). It's
// the single source of "is it actually doing something?" feedback used by the
// load-more control and the enquiry / flash / newsletter submits, so the contract
// worth pinning is: it disables + announces (aria-busy) + swaps in the spinner and
// label, it is idempotent (a second call can't clobber the stashed idle markup),
// and clearButtonLoading restores the original innerHTML verbatim (and no-ops when
// the button was never put into a loading state). The load-more/newsletter/flash
// suites only exercise this indirectly; this pins it directly.
import { describe, it, expect, beforeEach } from 'vitest'
import { setButtonLoading, clearButtonLoading } from '../src/js/modules/spinner.js'

let btn
beforeEach(() => {
  document.body.innerHTML = '<button id="b">Send <span class="arrow">→</span></button>'
  btn = document.getElementById('b')
})

describe('setButtonLoading', () => {
  it('disables, announces busy, and swaps in the spinner + given label', () => {
    setButtonLoading(btn, 'Sending…')
    expect(btn.disabled).toBe(true)
    expect(btn.getAttribute('aria-busy')).toBe('true')
    expect(btn.querySelector('.btn-spinner')).not.toBeNull()
    expect(btn.querySelector('.btn-spinner').getAttribute('aria-hidden')).toBe('true')
    expect(btn.querySelector('.btn-loading-label').textContent).toBe('Sending…')
  })

  it('defaults the label to "Sending…" when none is given', () => {
    setButtonLoading(btn)
    expect(btn.querySelector('.btn-loading-label').textContent).toBe('Sending…')
  })

  it('stashes the idle markup so it can be restored exactly', () => {
    const idle = btn.innerHTML
    setButtonLoading(btn, 'Loading…')
    expect(btn.dataset.idleHtml).toBe(idle)
    expect(btn.dataset.loading).toBe('true')
  })

  it('is idempotent — a second call cannot clobber the stashed idle markup', () => {
    const idle = btn.innerHTML
    setButtonLoading(btn, 'Loading…')
    // A second call while already loading must NOT re-stash the (now spinner) HTML.
    setButtonLoading(btn, 'Subscribing…')
    expect(btn.dataset.idleHtml).toBe(idle)
    // …and the first label stands (the second call no-ops entirely).
    expect(btn.querySelector('.btn-loading-label').textContent).toBe('Loading…')
  })

  it('no-ops on a missing element (safe call site)', () => {
    expect(() => setButtonLoading(null)).not.toThrow()
  })
})

describe('clearButtonLoading', () => {
  it('restores the original innerHTML verbatim and clears the busy state', () => {
    const idle = btn.innerHTML
    setButtonLoading(btn, 'Sending…')
    clearButtonLoading(btn)
    expect(btn.innerHTML).toBe(idle)        // including the nested <span class="arrow">
    expect(btn.disabled).toBe(false)
    expect(btn.hasAttribute('aria-busy')).toBe(false)
    expect(btn.dataset.loading).toBeUndefined()
    expect(btn.dataset.idleHtml).toBeUndefined()
  })

  it('no-ops when the button was never put into a loading state', () => {
    const idle = btn.innerHTML
    clearButtonLoading(btn)
    expect(btn.innerHTML).toBe(idle)
    expect(btn.disabled).toBe(false)
  })

  it('no-ops on a missing element (safe call site)', () => {
    expect(() => clearButtonLoading(null)).not.toThrow()
  })

  it('round-trips cleanly so a button can be reused for a second action', () => {
    const idle = btn.innerHTML
    setButtonLoading(btn, 'Sending…'); clearButtonLoading(btn)
    setButtonLoading(btn, 'Loading…')
    expect(btn.dataset.idleHtml).toBe(idle) // re-stashed correctly the second time
    clearButtonLoading(btn)
    expect(btn.innerHTML).toBe(idle)
  })
})
