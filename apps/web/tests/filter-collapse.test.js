// @vitest-environment jsdom
//
// Behaviour tests for the filter-bar mobile collapse (src/js/modules/filter-collapse.js):
// a "Filters" toggle that opens/closes the bar on a narrow screen. jsdom has no
// layout, so the CSS collapse itself is covered by the Playwright spec; here we
// pin the JS contract — the class + aria-expanded toggle, and that growing past
// the mobile breakpoint clears the open state. matchMedia is stubbed (jsdom has none).
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { initFilterCollapse } from '../src/js/modules/filter-collapse.js'

let mqListeners
function mockMatchMedia(matches) {
  mqListeners = []
  const mq = { matches, addEventListener: (_t, cb) => mqListeners.push(cb) }
  window.matchMedia = () => mq
  return mq
}

function setup() {
  document.body.innerHTML = `
    <div class="filter-bar" id="filter-bar">
      <button class="filter-toggle" id="filter-toggle" aria-expanded="false">Filters</button>
      <div class="filter-chips"></div>
      <div class="filter-right"><select class="filter-select"></select></div>
    </div>`
  return document.getElementById('filter-bar')
}

const bar    = () => document.getElementById('filter-bar')
const toggle = () => document.getElementById('filter-toggle')
const click  = el => el.dispatchEvent(new window.Event('click', { bubbles: true }))
const isOpen = () => bar().classList.contains('filters-open')

beforeEach(() => { document.body.innerHTML = '' })
afterEach(() => { delete window.matchMedia })

describe('initFilterCollapse', () => {
  it('no-ops when the filter bar is absent', () => {
    mockMatchMedia(true)
    expect(() => initFilterCollapse(null)).not.toThrow()
  })

  it('no-ops when there is no toggle button', () => {
    mockMatchMedia(true)
    document.body.innerHTML = '<div id="filter-bar"></div>'
    expect(() => initFilterCollapse(document.getElementById('filter-bar'))).not.toThrow()
  })

  it('starts collapsed and opens on the first tap (aria-expanded follows)', () => {
    mockMatchMedia(true)
    initFilterCollapse(setup())
    expect(isOpen()).toBe(false)
    expect(toggle().getAttribute('aria-expanded')).toBe('false')

    click(toggle())
    expect(isOpen()).toBe(true)
    expect(toggle().getAttribute('aria-expanded')).toBe('true')
  })

  it('collapses again on a second tap', () => {
    mockMatchMedia(true)
    initFilterCollapse(setup())
    click(toggle())
    click(toggle())
    expect(isOpen()).toBe(false)
    expect(toggle().getAttribute('aria-expanded')).toBe('false')
  })

  it('clears the open state when the viewport grows past the mobile breakpoint', () => {
    const mq = mockMatchMedia(true)
    initFilterCollapse(setup())
    click(toggle())
    expect(isOpen()).toBe(true)

    mq.matches = false
    mqListeners.forEach(cb => cb({ matches: false })) // simulate crossing to desktop
    expect(isOpen()).toBe(false)
    expect(toggle().getAttribute('aria-expanded')).toBe('false')
  })
})
