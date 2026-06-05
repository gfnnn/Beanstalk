// @vitest-environment jsdom
//
// Behaviour tests for the portfolio filter/sort module (src/js/modules/filter.js).
// This is the front-end logic most worth pinning: it cooperates with the load-more
// window, and the module's own comments flag the subtle case — an active filter
// must search the WHOLE catalogue, so a match that hasn't been paged into the
// window yet (e.g. the single Script piece) is still found instead of falling into
// a false "no results" empty state. We drive it against a fixture DOM in jsdom.
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { initFilter } from '../src/js/modules/filter.js'

const chip = (f, label) =>
  `<button class="chip" data-filter="${f}"><span class="chip-count"></span>${label}</button>`

// Render the masonry DOM filter.js queries. Each tile carries the data- attributes
// the renderer emits (space-separated styles, placement, sort order) plus the
// data-shown flag the load-more window owns ('false' = paged out / not yet loaded).
function setup(tiles) {
  document.body.innerHTML = `
    <div id="filter-bar">
      ${chip('all', 'All')}
      ${chip('fine-line', 'Fine line')}
      ${chip('blackwork', 'Blackwork')}
      ${chip('script', 'Script')}
      <select id="placement-filter">
        <option value="all">all</option>
        <option value="forearm">forearm</option>
        <option value="wrist">wrist</option>
      </select>
      <select id="sort-order">
        <option value="newest">newest</option>
        <option value="oldest">oldest</option>
      </select>
      <button id="filter-clear">clear</button>
    </div>
    <div id="masonry-grid">
      ${tiles
        .map(
          (t, i) =>
            `<article class="masonry-tile" data-style="${t.style}" ` +
            `data-placement="${t.placement}" data-order="${t.order ?? i}" ` +
            `data-shown="${t.shown ?? 'true'}"></article>`,
        )
        .join('')}
    </div>
    <div id="load-more-section"></div>
    <div id="empty-state"></div>
    <div id="filter-summary"><span id="summary-text"></span></div>
  `
}

const tilesEl = () => [...document.querySelectorAll('.masonry-tile')]
const visible = () => tilesEl().filter(t => t.style.display !== 'none')
const chipCount = f =>
  document.querySelector(`.chip[data-filter="${f}"] .chip-count`).textContent
const click = el => el.dispatchEvent(new window.Event('click', { bubbles: true }))

beforeEach(() => {
  document.body.innerHTML = ''
})

// Some tests stub the layout APIs jsdom doesn't implement (matchMedia for the
// desktop breakpoint, ResizeObserver for the overflow watcher). Clean them up so
// they don't leak into the unrelated tests.
afterEach(() => {
  delete window.matchMedia
  delete global.ResizeObserver
})

// Build the real filter-bar markup (priority chips + "More" + collapsible
// secondary cluster + selects) and stub the layout reads the desktop overflow
// logic depends on: a desktop viewport, a fixed width per chip, and a given
// chips-row width. Returns the bar element.
function setupDesktopChips({ chipWidth, rowWidth }) {
  window.matchMedia = () => ({ matches: true, addEventListener() {} })
  global.ResizeObserver = class { observe() {} disconnect() {} }

  document.body.innerHTML = `
    <div id="filter-bar">
      <div class="filter-chips">
        ${chip('all', 'All')}${chip('fine-line', 'Fine line')}
        <button class="chip-more" id="chip-more-btn" aria-expanded="false">More</button>
        <span class="chips-secondary">${chip('script', 'Script')}${chip('dotwork', 'Dotwork')}</span>
      </div>
      <div class="filter-right">
        <select id="sort-order"><option value="newest">newest</option></select>
      </div>
    </div>
    <div id="masonry-grid">
      <article class="masonry-tile" data-style="all" data-placement="forearm" data-order="0" data-shown="true"></article>
    </div>
  `
  document.querySelectorAll('.chip').forEach(c =>
    Object.defineProperty(c, 'offsetWidth', { value: chipWidth, configurable: true }))
  Object.defineProperty(document.querySelector('.filter-chips'), 'clientWidth', {
    value: rowWidth,
    configurable: true,
  })
  return document.getElementById('filter-bar')
}

describe('initFilter', () => {
  it('no-ops (returns undefined) when there is no masonry grid', () => {
    document.body.innerHTML = '<div id="filter-bar"></div>'
    expect(initFilter()).toBeUndefined()
  })

  it('counts each chip from the full catalogue, not the loaded window', () => {
    setup([
      { style: 'fine-line', placement: 'forearm' },
      { style: 'fine-line botanical', placement: 'wrist' },
      { style: 'blackwork', placement: 'wrist', shown: 'false' }, // paged out
    ])
    initFilter()
    expect(chipCount('all')).toBe('3')
    expect(chipCount('fine-line')).toBe('2') // multi-style tile counts too
    expect(chipCount('blackwork')).toBe('1') // counted despite being out of window
    expect(chipCount('script')).toBe('0')
  })

  it('shows only the loaded window while unfiltered (paged-out tiles stay hidden)', () => {
    setup([
      { style: 'fine-line', placement: 'forearm', shown: 'true' },
      { style: 'blackwork', placement: 'wrist', shown: 'false' },
    ])
    initFilter()
    expect(visible()).toHaveLength(1)
    expect(visible()[0].dataset.style).toBe('fine-line')
  })

  it('filtering by style hides non-matching tiles', () => {
    setup([
      { style: 'fine-line', placement: 'forearm' },
      { style: 'blackwork', placement: 'wrist' },
    ])
    initFilter()
    click(document.querySelector('.chip[data-filter="blackwork"]'))
    expect(visible()).toHaveLength(1)
    expect(visible()[0].dataset.style).toBe('blackwork')
  })

  // The headline regression guard: a filter must reach a matching tile that the
  // load-more window has not paged in yet, rather than report "no results".
  it('reveals a matching tile that is outside the load-more window', () => {
    setup([
      { style: 'fine-line', placement: 'forearm', shown: 'true' },
      { style: 'fine-line', placement: 'forearm', shown: 'true' },
      { style: 'script', placement: 'wrist', shown: 'false' }, // the lone, paged-out Script piece
    ])
    initFilter()
    expect(visible()).toHaveLength(2) // unfiltered: Script is hidden
    click(document.querySelector('.chip[data-filter="script"]'))
    const shown = visible()
    expect(shown).toHaveLength(1)
    expect(shown[0].dataset.style).toBe('script')
    expect(document.getElementById('empty-state').classList.contains('visible')).toBe(false)
  })

  // Homepage specialism cards deep-link as /portfolio/?style=<token>; the filter
  // must honour that on load so the customer lands with the style pre-applied.
  it('pre-applies a known style from the URL (?style=…) on load', () => {
    setup([
      { style: 'fine-line', placement: 'forearm', shown: 'true' },
      { style: 'script', placement: 'wrist', shown: 'true' },
    ])
    window.history.replaceState({}, '', '/portfolio/?style=script')
    initFilter()
    window.history.replaceState({}, '', '/') // restore so other tests are unaffected
    expect(
      document.querySelector('.chip[data-filter="script"]').classList.contains('active'),
    ).toBe(true)
    expect(visible()).toHaveLength(1)
    expect(visible()[0].dataset.style).toBe('script')
  })

  it('ignores an unknown ?style= value and browses unfiltered', () => {
    setup([
      { style: 'fine-line', placement: 'forearm', shown: 'true' },
      { style: 'script', placement: 'wrist', shown: 'true' },
    ])
    window.history.replaceState({}, '', '/portfolio/?style=bogus')
    initFilter()
    window.history.replaceState({}, '', '/')
    expect(document.querySelectorAll('.chip.active')).toHaveLength(0)
    expect(visible()).toHaveLength(2)
  })

  it('shows the empty state when a filter matches nothing', () => {
    setup([{ style: 'fine-line', placement: 'forearm' }])
    initFilter()
    click(document.querySelector('.chip[data-filter="script"]'))
    expect(visible()).toHaveLength(0)
    expect(document.getElementById('empty-state').classList.contains('visible')).toBe(true)
  })

  it('combines an active style chip with the placement select', () => {
    setup([
      { style: 'fine-line', placement: 'forearm' },
      { style: 'fine-line', placement: 'wrist' },
    ])
    initFilter()
    click(document.querySelector('.chip[data-filter="fine-line"]'))
    const sel = document.getElementById('placement-filter')
    sel.value = 'wrist'
    sel.dispatchEvent(new window.Event('change'))
    expect(visible()).toHaveLength(1)
    expect(visible()[0].dataset.placement).toBe('wrist')
  })

  it('reflects the active filter in the summary text and toggles the summary on', () => {
    setup([{ style: 'fine-line', placement: 'forearm' }])
    initFilter()
    click(document.querySelector('.chip[data-filter="fine-line"]'))
    expect(document.getElementById('filter-summary').classList.contains('visible')).toBe(true)
    expect(document.getElementById('summary-text').textContent).toContain('fine line')
  })

  it('clear resets to the unfiltered window and hides the summary', () => {
    setup([
      { style: 'fine-line', placement: 'forearm', shown: 'true' },
      { style: 'blackwork', placement: 'wrist', shown: 'true' },
    ])
    initFilter()
    click(document.querySelector('.chip[data-filter="blackwork"]'))
    expect(visible()).toHaveLength(1)
    click(document.getElementById('filter-clear'))
    expect(visible()).toHaveLength(2)
    expect(document.getElementById('filter-summary').classList.contains('visible')).toBe(false)
    expect(
      document.querySelector('.chip[data-filter="all"]').classList.contains('active'),
    ).toBe(true)
  })

  it('the "More" toggle expands the secondary chips and tracks aria-expanded', () => {
    // Mirror the real markup: a `.filter-chips` wrapper with a `#chip-more-btn`
    // toggle that flips `.expanded` (CSS reveals `.chips-secondary` on mobile).
    document.body.innerHTML = `
      <div id="filter-bar">
        <div class="filter-chips">
          ${chip('all', 'All')}
          <button class="chip-more" id="chip-more-btn" aria-expanded="false">More</button>
          <span class="chips-secondary" id="chips-secondary">${chip('script', 'Script')}</span>
        </div>
      </div>
      <div id="masonry-grid">
        <article class="masonry-tile" data-style="all" data-placement="forearm" data-order="0" data-shown="true"></article>
      </div>
    `
    initFilter()
    const btn = document.getElementById('chip-more-btn')
    const wrap = document.querySelector('.filter-chips')
    expect(wrap.classList.contains('expanded')).toBe(false)
    expect(btn.getAttribute('aria-expanded')).toBe('false')
    click(btn)
    expect(wrap.classList.contains('expanded')).toBe(true)
    expect(btn.getAttribute('aria-expanded')).toBe('true')
    click(btn)
    expect(wrap.classList.contains('expanded')).toBe(false)
    expect(btn.getAttribute('aria-expanded')).toBe('false')
  })

  it('collapses the secondary chips behind "More" when a desktop row is too tight', () => {
    // 4 chips × 100px = 400px of chips into a 250px row → they don't fit.
    const bar = setupDesktopChips({ chipWidth: 100, rowWidth: 250 })
    initFilter()
    expect(bar.classList.contains('needs-more')).toBe(true)
  })

  it('keeps every chip inline when a desktop row has room for them all', () => {
    // 4 chips × 100px = 400px into a 1000px row → plenty of room, no "More".
    const bar = setupDesktopChips({ chipWidth: 100, rowWidth: 1000 })
    initFilter()
    expect(bar.classList.contains('needs-more')).toBe(false)
  })

  it('exposes applyFilters so load-more can re-filter newly revealed tiles', () => {
    setup([{ style: 'fine-line', placement: 'forearm' }])
    const api = initFilter()
    expect(typeof api.applyFilters).toBe('function')
  })

  it('sorting oldest-first reorders the tiles in the DOM and re-windows', () => {
    setup([
      { style: 'fine-line', placement: 'forearm', order: 3 },
      { style: 'fine-line', placement: 'forearm', order: 1 },
      { style: 'fine-line', placement: 'forearm', order: 2 },
    ])
    let reset = 0
    initFilter({ resetWindow: () => { reset++ } })
    const sel = document.getElementById('sort-order')
    sel.value = 'oldest'
    sel.dispatchEvent(new window.Event('change'))
    const order = tilesEl().map(t => t.dataset.order)
    expect(order).toEqual(['1', '2', '3'])
    expect(reset).toBe(1) // load-more was asked to re-window after the reorder
  })
})
