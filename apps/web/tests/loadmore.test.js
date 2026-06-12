// @vitest-environment jsdom
//
// Behaviour tests for the load-more pagination window (src/js/modules/loadmore.js).
// It owns the "visible window" the filter cooperates with: the first PAGE_SIZE
// tiles are shown and flagged data-shown="true", the rest hidden and flagged
// "false". Clicking reveals the next page; reset() returns to the first page after
// a sort. We pin that windowing and the progress UI against a fixture DOM.
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { initLoadMore } from '../src/js/modules/loadmore.js'

const PAGE_SIZE = 16

function setup(total) {
  const tiles = Array.from(
    { length: total },
    (_, i) => `<article class="masonry-tile" data-order="${i}"></article>`,
  ).join('')
  document.body.innerHTML = `
    <div id="masonry-grid">${tiles}</div>
    <button id="load-more-btn"></button>
    <span id="showing-count"></span>
    <span id="total-count"></span>
    <div id="progress-fill"></div>
    <div id="load-more-section"></div>
  `
}

const tiles = () => [...document.querySelectorAll('.masonry-tile')]
const shownTiles = () => tiles().filter(t => t.dataset.shown === 'true')
const click = el => el.dispatchEvent(new window.Event('click', { bubbles: true }))

beforeEach(() => {
  // loadmore schedules the reveal opacity bump on requestAnimationFrame; run it
  // synchronously so the click handler completes deterministically in jsdom.
  globalThis.requestAnimationFrame = cb => { cb(0); return 0 }
  document.body.innerHTML = ''
})

describe('initLoadMore', () => {
  it('no-ops (returns undefined) when there is no load-more button', () => {
    document.body.innerHTML = '<div id="masonry-grid"></div>'
    expect(initLoadMore()).toBeUndefined()
  })

  it('opens with exactly one page shown and the rest paged out', () => {
    setup(20)
    initLoadMore()
    expect(shownTiles()).toHaveLength(PAGE_SIZE)
    // Tiles beyond the first page are flagged and hidden.
    expect(tiles()[PAGE_SIZE].dataset.shown).toBe('false')
    expect(tiles()[PAGE_SIZE].style.display).toBe('none')
  })

  it('reflects the window in the count + progress UI', () => {
    setup(20)
    initLoadMore()
    expect(document.getElementById('showing-count').textContent).toBe('16')
    expect(document.getElementById('total-count').textContent).toBe('20')
    expect(document.getElementById('progress-fill').style.width).toBe('80%')
    expect(document.getElementById('load-more-section').style.display).toBe('')
  })

  it('keeps the progressbar ARIA in step with the visual fill', () => {
    setup(20)
    // The markup ships placeholder values; the module owns them once it knows
    // the real catalogue size.
    const fill = document.getElementById('progress-fill')
    const bar = document.createElement('div')
    bar.setAttribute('role', 'progressbar')
    fill.replaceWith(bar); bar.appendChild(fill)
    initLoadMore()
    expect(bar.getAttribute('aria-valuenow')).toBe('16')
    expect(bar.getAttribute('aria-valuemax')).toBe('20')
    click(document.getElementById('load-more-btn'))
    expect(bar.getAttribute('aria-valuenow')).toBe('20')
  })

  it('ignores clicks while the button is disabled (no double reveal)', () => {
    setup(40)
    initLoadMore()
    const btn = document.getElementById('load-more-btn')
    click(btn)                  // reveals page 2, button now in its loading state
    expect(btn.disabled).toBe(true)
    click(btn)                  // must NOT reveal page 3
    expect(shownTiles()).toHaveLength(32)
  })

  it('re-shows a within-window tile that was left display:none (post-sort window restore)', () => {
    setup(10)
    tiles()[0].style.display = 'none'   // hidden by an earlier window state
    initLoadMore()
    expect(tiles()[0].style.display).toBe('')
    expect(tiles()[0].dataset.shown).toBe('true')
  })

  it('handles an empty catalogue: 0% fill and the control hidden', () => {
    setup(0)
    initLoadMore()
    expect(document.getElementById('progress-fill').style.width).toBe('0%')
    expect(document.getElementById('load-more-section').style.display).toBe('none')
  })

  it('clicking reveals the next page and fires the onReveal hook', () => {
    setup(20)
    const api = initLoadMore()
    const onReveal = vi.fn()
    api.setOnReveal(onReveal)

    click(document.getElementById('load-more-btn'))

    expect(shownTiles()).toHaveLength(20)
    expect(document.getElementById('showing-count').textContent).toBe('20')
    expect(onReveal).toHaveBeenCalledTimes(1)
  })

  it('hides the load-more control once the whole catalogue is shown', () => {
    setup(20)
    initLoadMore()
    click(document.getElementById('load-more-btn'))
    expect(document.getElementById('load-more-section').style.display).toBe('none')
  })

  it('shows everything immediately and hides the control when total ≤ one page', () => {
    setup(10)
    initLoadMore()
    expect(shownTiles()).toHaveLength(10)
    expect(document.getElementById('load-more-section').style.display).toBe('none')
  })

  it('reset() returns to the first page after a reveal', () => {
    setup(20)
    const api = initLoadMore()
    click(document.getElementById('load-more-btn'))
    expect(shownTiles()).toHaveLength(20)
    api.reset()
    expect(shownTiles()).toHaveLength(PAGE_SIZE)
    expect(document.getElementById('showing-count').textContent).toBe('16')
  })

  it('drops the inline fade styles once a revealed tile finishes transitioning', () => {
    setup(20)
    initLoadMore()
    click(document.getElementById('load-more-btn'))
    // The first tile of the freshly-revealed batch is mid-fade (rAF ran inline).
    const revealed = tiles()[PAGE_SIZE]
    expect(revealed.style.opacity).toBe('1')
    expect(revealed.style.transition).not.toBe('')
    // transitionend cleans the leftover inline styles so they don't linger.
    revealed.dispatchEvent(new window.Event('transitionend'))
    expect(revealed.style.transition).toBe('')
    expect(revealed.style.opacity).toBe('')
  })

  it('holds the loading state until the revealed batch images load, then restores', async () => {
    vi.useFakeTimers()
    setup(20)
    // Give the second-page tiles a still-loading image so settleBatch must wait on
    // them (jsdom never fires load on its own — we control it).
    tiles().slice(PAGE_SIZE).forEach(t => {
      const img = document.createElement('img')
      Object.defineProperty(img, 'complete', { value: false })
      t.appendChild(img)
    })
    initLoadMore()
    const btn = document.getElementById('load-more-btn')
    btn.innerHTML = 'Load more work →'

    click(btn)
    expect(btn.disabled).toBe(true) // pinned open while the images are pending

    // Settle the pending images → the race resolves and (after the floor) restores.
    document.querySelectorAll('.masonry-tile img').forEach(img =>
      img.dispatchEvent(new window.Event('load')),
    )
    await vi.runAllTimersAsync()

    expect(btn.disabled).toBe(false)
    expect(btn.innerHTML).toBe('Load more work →')
    vi.useRealTimers()
  })

  it('restores even if a pending image errors rather than loads', async () => {
    vi.useFakeTimers()
    setup(20)
    tiles().slice(PAGE_SIZE).forEach(t => {
      const img = document.createElement('img')
      Object.defineProperty(img, 'complete', { value: false })
      t.appendChild(img)
    })
    initLoadMore()
    const btn = document.getElementById('load-more-btn')
    click(btn)
    document.querySelectorAll('.masonry-tile img').forEach(img =>
      img.dispatchEvent(new window.Event('error')),
    )
    await vi.runAllTimersAsync()
    expect(btn.disabled).toBe(false)
    vi.useRealTimers()
  })

  it('puts the button into a spinner/aria-busy loading state on click, then restores it', async () => {
    vi.useFakeTimers()
    setup(20)
    initLoadMore()
    const btn = document.getElementById('load-more-btn')
    btn.innerHTML = 'Load more work →'

    click(btn)

    // Immediately busy: disabled, announced, and showing the shared spinner.
    expect(btn.disabled).toBe(true)
    expect(btn.getAttribute('aria-busy')).toBe('true')
    expect(btn.querySelector('.btn-spinner')).not.toBeNull()
    expect(btn.textContent).toContain('Loading')

    // The revealed batch here has no images, so it settles on the minimum floor.
    await vi.runAllTimersAsync()

    expect(btn.disabled).toBe(false)
    expect(btn.hasAttribute('aria-busy')).toBe(false)
    expect(btn.innerHTML).toBe('Load more work →') // restored verbatim
    vi.useRealTimers()
  })
})
