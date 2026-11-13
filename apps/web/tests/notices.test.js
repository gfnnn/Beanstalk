// @vitest-environment jsdom
// modules/notices.js — a dated homepage notice hides itself once its day has passed.
import { describe, it, expect } from 'vitest'
import { initNotices } from '../src/js/modules/notices.js'

const setup = () => {
  document.body.innerHTML = `
    <div class="studio-notices">
      <div class="notice-item" id="open">Books open</div>
      <div class="notice-item" id="dated" data-until="2026-07-26">Flash day 26 July</div>
    </div>`
}
const el = id => document.getElementById(id)

describe('dated studio notices', () => {
  it('keeps a notice through its last day', () => {
    setup(); initNotices('2026-07-26')
    expect(el('dated').hidden).toBe(false)
  })

  it('hides it the day after, leaving undated notices alone', () => {
    setup(); initNotices('2026-07-27')
    expect(el('dated').hidden).toBe(true)
    expect(el('open').hidden).toBe(false)
    expect(document.querySelector('.studio-notices').hidden).toBe(false)
  })

  it('hides the whole block when nothing is left', () => {
    setup(); el('open').remove(); initNotices('2026-07-27')
    expect(document.querySelector('.studio-notices').hidden).toBe(true)
  })

  it('no-ops on pages without notices', () => {
    document.body.innerHTML = ''
    expect(() => initNotices()).not.toThrow()
  })
})
