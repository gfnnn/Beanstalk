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

  it('portfolio bar: collapses secondary chips one at a time', () => {
    // 2 priority + 2 secondary, room for one secondary + "More" (300) not two.
    const bar = setupBar(`
      <div id="filter-bar">
        <div class="filter-chips">
          ${chip('all', 'All')}${chip('fine-line', 'Fine line')}
          <button class="chip-more" id="chip-more-btn" aria-expanded="false">More</button>
          <span class="chips-secondary">${chip('script', 'Script')}${chip('dotwork', 'Dotwork')}</span>
        </div>
        <div class="filter-right"><select id="sort-order"><option>n</option></select></div>
      </div>
    `, { chipWidth: 100, rowWidth: 360 })
    initChipOverflow(bar)
    expect(bar.classList.contains('needs-more')).toBe(true)
    expect(collapsed().map(c => c.dataset.filter)).toEqual(['dotwork'])
  })
})
