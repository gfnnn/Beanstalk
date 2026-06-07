// @vitest-environment jsdom
//
// Behaviour tests for the flash module (src/js/modules/flash.js) — the richest
// client module, so the synchronous, correctness-critical logic gets pinned here
// (the browser-only transitions/focus-timing belong in an E2E tier). Covered: the
// drop/archive model (current drop = highest data-drop; earlier drops are the
// "Past" archive, excluded from all/available/claimed and the Past chip self-hides
// when empty), the drop-scoped count badges, filter + sort, the live-availability
// reconcile (fetch claims map → card status/badge/button, with the "never downgrade
// claimed→pending" guard), the empty-state + footer-CTA visibility, the claim
// modal open/close, and the submit path incl. the 409 "claimed first" branch.
//
// lenis is mocked so the suite doesn't pull GSAP; the sticky-shadow helper no-ops
// under jsdom (no IntersectionObserver). The network is mocked throughout.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

vi.mock('../src/js/modules/lenis.js', () => ({ pauseScroll: vi.fn(), resumeScroll: vi.fn() }))

import { initFlash } from '../src/js/modules/flash.js'

const $  = sel => document.querySelector(sel)
const $$ = sel => [...document.querySelectorAll(sel)]
const byId = id => document.getElementById(id)
const click = el => el.dispatchEvent(new window.Event('click', { bubbles: true }))
const change = el => el.dispatchEvent(new window.Event('change', { bubbles: true }))
const keydown = k => document.dispatchEvent(new window.KeyboardEvent('keydown', { key: k, bubbles: true }))
const flush = () => new Promise(r => setTimeout(r, 0))
const raf   = () => new Promise(r => requestAnimationFrame(() => r()))

// A status-map fetch (the live-availability call on init) returning the given
// claims; a POST (the claim submit) returns `submit`. Branch on method so a single
// mock serves both, regardless of call order/count.
function mockFetch({ claims = {}, submit } = {}) {
  return vi.fn((url, opts) => {
    if (opts && opts.method === 'POST') return Promise.resolve(submit)
    return Promise.resolve({ ok: true, json: () => Promise.resolve({ claims }) })
  })
}

// Current drop = 12. c1 available, c2 pending, c3 claimed (all current); c4 is an
// earlier drop (11) → the "Past" archive.
function card({ id, drop = 12, status, price, size, claimable = false }) {
  const badgeClass = status === 'available' ? 'available' : status === 'claimed' ? 'claimed-status' : 'pending'
  const btn = claimable
    ? `<button class="claim-btn" data-piece="Piece ${id}" data-price="£${price}">Claim</button>`
    : `<button class="claim-btn" disabled aria-disabled="true">${status === 'pending' ? 'Pending deposit' : 'Claimed'}</button>`
  return `
    <div class="flash-card" data-id="${id}" data-drop="${drop}" data-status="${status}" data-price="${price}" data-size="${size}">
      <span class="card-status ${badgeClass}">${status}</span>
      ${btn}
    </div>`
}

function setup() {
  document.body.innerHTML = `
    <span id="count-all"></span><span id="count-available"></span><span id="count-claimed"></span>
    <div id="filter-bar"></div>
    <button class="chip" data-filter="all">All</button>
    <button class="chip" data-filter="available">Available</button>
    <button class="chip" data-filter="claimed">Claimed</button>
    <button class="chip" id="chip-past" data-filter="past">Past <span class="chip-count"></span></button>
    <select id="sort-select">
      <option value="default">default</option>
      <option value="price-asc">price-asc</option>
      <option value="price-desc">price-desc</option>
      <option value="size-asc">size-asc</option>
    </select>
    <div id="flash-grid">
      ${card({ id: 'p1', status: 'available', price: 180, size: 3, claimable: true })}
      ${card({ id: 'p2', status: 'pending',   price: 220, size: 5 })}
      ${card({ id: 'p3', status: 'claimed',   price: 150, size: 2 })}
      ${card({ id: 'p4', status: 'available', price: 90,  size: 1, drop: 11, claimable: true })}
      <div id="flash-empty" style="display:none">Nothing here</div>
    </div>
    <div class="flash-cta">footer cta</div>

    <div id="claim-modal" hidden>
      <div class="modal">
        <h3 id="modal-piece-name"></h3>
        <form id="claim-form">
          <input id="claim-name" name="name" value="Robin">
          <input id="modal-piece-input" name="piece" type="hidden">
          <input id="modal-price-input" name="price" type="hidden">
          <input id="modal-id-input" name="id" type="hidden">
          <div class="modal-foot">
            <button type="button" id="modal-cancel">Cancel</button>
            <button type="button" id="modal-close">×</button>
            <button type="submit" id="modal-submit">Send</button>
          </div>
        </form>
      </div>
    </div>
  `
}

const cardById = id => $(`.flash-card[data-id="${id}"]`)
const visibleIds = () => $$('.flash-card').filter(c => c.style.display !== 'none').map(c => c.dataset.id)
const domOrder = () => $$('#flash-grid .flash-card').map(c => c.dataset.id)

beforeEach(() => {
  document.body.innerHTML = ''
  global.fetch = mockFetch() // default: no live claims
})
afterEach(() => { vi.restoreAllMocks(); delete global.fetch; document.body.style.overflow = '' })

describe('initFlash', () => {
  it('no-ops when there is no flash grid', () => {
    document.body.innerHTML = '<div></div>'
    expect(() => initFlash()).not.toThrow()
  })

  describe('count badges (scoped to the current drop)', () => {
    it('counts only current-drop cards; claimed includes pending; Past gets the archive count', () => {
      setup(); initFlash()
      expect(byId('count-all').textContent).toBe('(3)')        // p1,p2,p3 — p4 is archive
      expect(byId('count-available').textContent).toBe('(1)')  // p1
      expect(byId('count-claimed').textContent).toBe('(2)')    // p2 pending + p3 claimed
      expect($('#chip-past .chip-count').textContent).toBe('(1)') // p4
      expect(byId('chip-past').hidden).toBe(false)
    })

    it('self-hides the Past chip when there is no archive', () => {
      setup()
      cardById('p4')?.remove() // drop the only earlier-drop card
      // also clear it from being counted: remove leaves p1..p3 all on drop 12
      initFlash()
      expect(byId('chip-past').hidden).toBe(true)
    })
  })

  describe('filter + sort', () => {
    it('defaults to the current drop only (archive excluded) in newest-drop order', () => {
      setup(); initFlash()
      expect(visibleIds().sort()).toEqual(['p1', 'p2', 'p3'])
    })

    it('"available" shows only available current-drop cards', () => {
      setup(); initFlash()
      click($('.chip[data-filter="available"]'))
      expect(visibleIds()).toEqual(['p1'])
      expect($('.chip[data-filter="available"]').classList.contains('active')).toBe(true)
    })

    it('"claimed" shows claimed AND pending current-drop cards', () => {
      setup(); initFlash()
      click($('.chip[data-filter="claimed"]'))
      expect(visibleIds().sort()).toEqual(['p2', 'p3'])
    })

    it('"past" shows only the archive', () => {
      setup(); initFlash()
      click($('.chip[data-filter="past"]'))
      expect(visibleIds()).toEqual(['p4'])
    })

    it('re-orders the DOM by price ascending across all cards', () => {
      setup(); initFlash()
      const sel = byId('sort-select')
      sel.value = 'price-asc'; change(sel)
      expect(domOrder()).toEqual(['p4', 'p3', 'p1', 'p2']) // 90,150,180,220
    })

    it('re-orders by size ascending', () => {
      setup(); initFlash()
      const sel = byId('sort-select')
      sel.value = 'size-asc'; change(sel)
      expect(domOrder()).toEqual(['p4', 'p3', 'p1', 'p2']) // 1,2,3,5
    })

    it('shows the empty state and hides the footer CTA when a filter matches nothing', () => {
      setup()
      // make the only available current card claimed → "available" filter is empty
      cardById('p1').dataset.status = 'claimed'
      initFlash()
      click($('.chip[data-filter="available"]'))
      expect(byId('flash-empty').style.display).toBe('block')
      expect($('.flash-cta').hidden).toBe(true)
    })
  })

  describe('live availability reconcile', () => {
    it('applies the server claims map to the grid (status, badge, disabled button) and refreshes counts', async () => {
      global.fetch = mockFetch({ claims: { p1: 'claimed' } })
      setup(); initFlash()
      await flush()

      const c1 = cardById('p1')
      expect(c1.dataset.status).toBe('claimed')
      expect(c1.querySelector('.card-status').className).toContain('claimed-status')
      expect(c1.querySelector('.claim-btn').disabled).toBe(true)
      // counts refreshed: available 1 → 0, claimed 2 → 3
      expect(byId('count-available').textContent).toBe('(0)')
      expect(byId('count-claimed').textContent).toBe('(3)')
    })

    it('never downgrades a claimed card back to pending', async () => {
      global.fetch = mockFetch({ claims: { p3: 'pending' } }) // p3 is already claimed
      setup(); initFlash()
      await flush()
      expect(cardById('p3').dataset.status).toBe('claimed')
    })

    it('ignores ids not on the page and unknown statuses (fails safe)', async () => {
      global.fetch = mockFetch({ claims: { nope: 'claimed', p1: 'weird' } })
      setup(); initFlash()
      await flush()
      expect(cardById('p1').dataset.status).toBe('available') // unchanged
    })
  })

  describe('claim modal', () => {
    it('opens on an available card\'s Claim button, filling the piece/price/id fields', async () => {
      setup(); initFlash()
      click(cardById('p1').querySelector('.claim-btn'))
      expect(byId('claim-modal').hidden).toBe(false)
      expect(byId('modal-piece-name').textContent).toBe('Piece p1')
      expect(byId('modal-piece-input').value).toBe('Piece p1')
      expect(byId('modal-price-input').value).toBe('£180')
      expect(byId('modal-id-input').value).toBe('p1')
      await raf() // the rAF that adds the .open class
      expect(byId('claim-modal').classList.contains('open')).toBe(true)
    })

    it('closes on the close button (and finishes hidden after the transition)', () => {
      setup(); initFlash()
      click(cardById('p1').querySelector('.claim-btn'))
      click(byId('modal-close'))
      const overlay = byId('claim-modal')
      expect(overlay.classList.contains('open')).toBe(false)
      overlay.dispatchEvent(new window.Event('transitionend')) // jsdom won't fire it for us
      expect(overlay.hidden).toBe(true)
      expect(document.body.style.overflow).toBe('')
    })

    it('closes on Escape and on an overlay backdrop click', () => {
      setup(); initFlash()
      const overlay = byId('claim-modal')

      click(cardById('p1').querySelector('.claim-btn'))
      keydown('Escape')
      expect(overlay.classList.contains('open')).toBe(false)

      click(cardById('p1').querySelector('.claim-btn')) // reopen
      overlay.dispatchEvent(new window.Event('transitionend'))
      overlay.dispatchEvent(new window.Event('click', { bubbles: true })) // target === overlay
      expect(overlay.classList.contains('open')).toBe(false)
    })
  })

  describe('claim submit', () => {
    // Open the modal and let its rAF add `.open` before submitting, so the
    // post-submit open/closed assertion isn't racing the open animation frame.
    async function openAndSubmit(submitResponse) {
      global.fetch = mockFetch({ submit: submitResponse })
      setup(); initFlash()
      click(cardById('p1').querySelector('.claim-btn'))
      await raf()
      $('#claim-form').dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }))
    }

    it('POSTs { kind:"flash", fields } and on success marks the piece pending + closes + resets', async () => {
      global.fetch = mockFetch({ submit: { ok: true, status: 200, json: () => Promise.resolve({ ok: true }) } })
      setup(); initFlash()
      click(cardById('p1').querySelector('.claim-btn'))
      await raf()
      byId('claim-name').value = 'Typed over the default' // so a reset is observable
      $('#claim-form').dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }))
      await flush()

      const post = global.fetch.mock.calls.find(([, o]) => o && o.method === 'POST')
      expect(post).toBeTruthy()
      const payload = JSON.parse(post[1].body)
      expect(payload.kind).toBe('flash')
      expect(payload.fields.piece).toBe('Piece p1')
      expect(payload.fields.id).toBe('p1')

      expect(cardById('p1').dataset.status).toBe('pending') // markCard('pending')
      expect(byId('claim-modal').classList.contains('open')).toBe(false) // closed
      expect(byId('claim-name').value).toBe('Robin') // form.reset() restored the default
    })

    it('ignores a re-entrant submit while a claim is in flight (no duplicate claim)', async () => {
      // The disabled button blocks a second click, but a keyboard submit (Enter)
      // would re-enter the handler; the in-flight guard must stop a duplicate POST.
      global.fetch = mockFetch({ submit: { ok: true, status: 200, json: () => Promise.resolve({ ok: true }) } })
      setup(); initFlash()
      click(cardById('p1').querySelector('.claim-btn'))
      await raf()
      const form = $('#claim-form')
      form.dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true })) // first — POST in flight, button loading
      form.dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true })) // re-entrant — must be ignored
      await flush()
      const posts = global.fetch.mock.calls.filter(([, o]) => o && o.method === 'POST')
      expect(posts.length).toBe(1)
    })

    it('on a 409 marks the piece claimed, shows the inline error, and keeps the modal open', async () => {
      await openAndSubmit({ ok: false, status: 409, json: () => Promise.resolve({ error: 'Just claimed by someone else.' }) })
      await flush()

      expect(cardById('p1').dataset.status).toBe('claimed') // markCard('claimed')
      expect(byId('claim-error').textContent).toBe('Just claimed by someone else.')
      expect(byId('claim-modal').classList.contains('open')).toBe(true) // stays open so the message is seen
      expect(byId('modal-submit').disabled).toBe(false) // button restored
    })

    it('on a generic failure surfaces the error and re-enables submit', async () => {
      await openAndSubmit({ ok: false, status: 500, json: () => Promise.resolve({ error: 'Server error' }) })
      await flush()
      expect(byId('claim-error').textContent).toBe('Server error')
      expect(byId('modal-submit').disabled).toBe(false)
    })
  })
})
