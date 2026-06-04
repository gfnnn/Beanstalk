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
})
