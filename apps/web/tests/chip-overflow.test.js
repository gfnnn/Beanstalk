// @vitest-environment jsdom
//
// The responsive filter-bar chip logic shared by the portfolio (filter.js) and
// flash (flash.js) bars. jsdom has no layout engine, so we stub the reads it
// depends on (matchMedia for the breakpoint, ResizeObserver, and per-element
// offset/client widths) and assert the collapse decisions.
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { initChipOverflow } from '../src/js/modules/chip-overflow.js'

const chip = (f, label) =>
  `<button class="chip" data-filter="${f}">${label}</button>`

afterEach(() => {
  delete window.matchMedia
  delete global.ResizeObserver
})

beforeEach(() => {
  document.body.innerHTML = ''
})

// Stub a desktop viewport + fixed chip width + a given chip-row width.
function setupBar(html, { chipWidth, rowWidth }) {
  window.matchMedia = () => ({ matches: true, addEventListener() {} })
  global.ResizeObserver = class { observe() {} disconnect() {} }
  document.body.innerHTML = html
  document.querySelectorAll('.chip').forEach(c =>
    Object.defineProperty(c, 'offsetWidth', { value: chipWidth, configurable: true }))
  Object.defineProperty(document.querySelector('.filter-chips'), 'clientWidth', {
    value: rowWidth,
    configurable: true,
  })
  return document.getElementById('filter-bar')
}

const collapsed = () => [...document.querySelectorAll('.chip.is-collapsed')]
const click = el => el.dispatchEvent(new window.Event('click', { bubbles: true }))

// A flash-style bar: a handful of status chips, no "More" toggle and no
// `.chips-secondary` cluster, plus the sort select on the right.
const flashBar = `
  <div id="filter-bar">
    <div class="filter-chips">
      ${chip('all', 'All')}${chip('available', 'Available')}${chip('claimed', 'Claimed')}
    </div>
    <div class="filter-right">
      <select id="sort-select"><option value="default">Newest first</option></select>
    </div>
  </div>
`

// A portfolio-style bar: two priority chips, a "More" toggle and a
// `.chips-secondary` cluster (the chips that collapse), plus the sort select.
const portfolioBar = `
  <div id="filter-bar">
    <div class="filter-chips">
      ${chip('all', 'All')}${chip('fine-line', 'Fine line')}
      <button class="chip-more" id="chip-more-btn" aria-expanded="false">More</button>
      <span class="chips-secondary">${chip('script', 'Script')}${chip('dotwork', 'Dotwork')}</span>
    </div>
    <div class="filter-right"><select id="sort-order"><option>n</option></select></div>
  </div>
`

describe('initChipOverflow', () => {
  it('no-ops without a .filter-chips container', () => {
    document.body.innerHTML = '<div id="filter-bar"></div>'
    expect(() => initChipOverflow(document.getElementById('filter-bar'))).not.toThrow()
  })

  it('flash bar: never collapses chips (there is nothing to collapse)', () => {
    // 3 chips × 100px into a 150px row → far too tight, but a flash bar has no
    // secondary cluster, so no chip may be hidden; the select wraps instead.
    const bar = setupBar(flashBar, { chipWidth: 100, rowWidth: 150 })
    initChipOverflow(bar)
    expect(collapsed()).toHaveLength(0)
    // The chip row is pinned (min-width set) so the SELECT is what wraps below.
    expect(document.querySelector('.filter-chips').style.minWidth).not.toBe('')
  })

  it('flash bar: leaves a roomy row untouched', () => {
    const bar = setupBar(flashBar, { chipWidth: 100, rowWidth: 1000 })
    initChipOverflow(bar)
    expect(bar.classList.contains('needs-more')).toBe(false)
    expect(collapsed()).toHaveLength(0)
  })

  it('portfolio bar: keeps every chip inline when the row has room', () => {
    // 4 chips × 100px = 400px into a 1000px row → plenty of room, no "More".
    const bar = setupBar(portfolioBar, { chipWidth: 100, rowWidth: 1000 })
    initChipOverflow(bar)
    expect(bar.classList.contains('needs-more')).toBe(false)
    expect(collapsed()).toHaveLength(0)
  })

  it('portfolio bar: collapses secondary chips one at a time', () => {
    // 2 priority + 2 secondary, room for one secondary + "More" (300) not two.
    const bar = setupBar(portfolioBar, { chipWidth: 100, rowWidth: 360 })
    initChipOverflow(bar)
    expect(bar.classList.contains('needs-more')).toBe(true)
    expect(collapsed().map(c => c.dataset.filter)).toEqual(['dotwork'])
  })

  it('portfolio bar: collapses every secondary chip when the row is very tight', () => {
    // 4 chips × 100px = 400px into a 250px row → only the two priority chips +
    // "More" fit, so both secondary chips collapse.
    const bar = setupBar(portfolioBar, { chipWidth: 100, rowWidth: 250 })
    initChipOverflow(bar)
    expect(bar.classList.contains('needs-more')).toBe(true)
    expect(collapsed().map(c => c.dataset.filter)).toEqual(['script', 'dotwork'])
  })

  it('the "More" toggle reveals the secondary chips and tracks aria-expanded', () => {
    // No matchMedia stub → the desktop measure pass bails, so apply() never
    // resets the expanded state; this pins the toggle wiring itself.
    document.body.innerHTML = portfolioBar
    const bar = document.getElementById('filter-bar')
    const chips = bar.querySelector('.filter-chips')
    const btn = document.getElementById('chip-more-btn')
    initChipOverflow(bar)

    expect(chips.classList.contains('expanded')).toBe(false)
    expect(btn.getAttribute('aria-expanded')).toBe('false')
    click(btn)
    expect(chips.classList.contains('expanded')).toBe(true)
    expect(btn.getAttribute('aria-expanded')).toBe('true')
    click(btn)
    expect(chips.classList.contains('expanded')).toBe(false)
    expect(btn.getAttribute('aria-expanded')).toBe('false')
  })

  it('no-ops when called without a bar, or with a chip-less chip row', () => {
    expect(() => initChipOverflow(null)).not.toThrow()
    document.body.innerHTML = '<div id="filter-bar"><div class="filter-chips"></div></div>'
    expect(() => initChipOverflow(document.getElementById('filter-bar'))).not.toThrow()
  })

  it('debounces ResizeObserver bursts to one rAF re-apply, and re-arms after it runs', () => {
    const bar = setupBar(portfolioBar, { chipWidth: 100, rowWidth: 360 })
    // Swap in an observable RO + rAF AFTER setupBar's stubs, BEFORE init wires them.
    let roCallback
    global.ResizeObserver = class {
      constructor(cb) { roCallback = cb }
      observe() {}
      disconnect() {}
    }
    const rafQueue = []
    const realRaf = globalThis.requestAnimationFrame
    globalThis.requestAnimationFrame = cb => { rafQueue.push(cb); return rafQueue.length }
    try {
      initChipOverflow(bar)
      // The bar's own size changes (e.g. "More" opening) fire RO several times a
      // frame — the latch must queue exactly one re-apply.
      roCallback(); roCallback(); roCallback()
      expect(rafQueue).toHaveLength(1)
      rafQueue[0]()                       // the frame runs → re-applies, latch resets
      roCallback()
      expect(rafQueue).toHaveLength(2)    // re-armed for the next frame
    } finally {
      globalThis.requestAnimationFrame = realRaf
    }
  })

  it('a re-apply while the user has expanded the row keeps everything revealed', () => {
    const bar = setupBar(portfolioBar, { chipWidth: 100, rowWidth: 360 })
    let roCallback
    global.ResizeObserver = class {
      constructor(cb) { roCallback = cb }
      observe() {}
      disconnect() {}
    }
    const realRaf = globalThis.requestAnimationFrame
    globalThis.requestAnimationFrame = cb => { cb(0); return 0 }   // synchronous
    try {
      initChipOverflow(bar)
      expect(collapsed().length).toBeGreaterThan(0)   // tight row → collapsed
      click(document.getElementById('chip-more-btn')) // user opens "More"
      expect(collapsed()).toHaveLength(0)
      roCallback()                                    // a resize re-apply fires…
      expect(collapsed()).toHaveLength(0)             // …but respects the expansion
      expect(bar.classList.contains('needs-more')).toBe(true)
    } finally {
      globalThis.requestAnimationFrame = realRaf
    }
  })
})
