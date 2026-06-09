// @vitest-environment jsdom
// Tests for src/js/modules/cta.js — the mobile sticky CTA. It's a functional
// control (the pinned "Enquire" bar), so unlike the animations module it must
// work identically with prefers-reduced-motion: there is no motion gate here.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { initMobileCta } from '../src/js/modules/cta.js'

let ioInstances
class MockIO {
  constructor(cb, opts) { this.cb = cb; this.opts = opts; this.observed = []; ioInstances.push(this) }
  observe(el) { this.observed.push(el) }
  disconnect() {}
  fire(entry) { this.cb([entry]) }
}

beforeEach(() => {
  document.body.innerHTML = ''
  ioInstances = []
  vi.stubGlobal('IntersectionObserver', MockIO)
})
afterEach(() => { vi.unstubAllGlobals() })

describe('initMobileCta', () => {
  it('no-ops on a page without the CTA', () => {
    document.body.innerHTML = '<section class="hero"></section>'
    initMobileCta()
    expect(ioInstances).toHaveLength(0)
  })

  it('toggles the homepage CTA as the hero enters/leaves the viewport', () => {
    document.body.innerHTML = '<section class="hero"></section><div id="mobile-cta" aria-hidden="true"></div>'
    initMobileCta()
    expect(ioInstances).toHaveLength(1)
    expect(ioInstances[0].observed).toContain(document.querySelector('.hero'))

    const cta = document.getElementById('mobile-cta')
    ioInstances[0].fire({ isIntersecting: false }) // hero scrolled out → CTA shows
    expect(cta.classList.contains('visible')).toBe(true)
    expect(cta.getAttribute('aria-hidden')).toBe('false')

    ioInstances[0].fire({ isIntersecting: true })  // hero back in view → CTA hides
    expect(cta.classList.contains('visible')).toBe(false)
    expect(cta.getAttribute('aria-hidden')).toBe('true')
  })

  it('shows the CTA immediately on a small-screen inner page (no hero)', () => {
    document.body.innerHTML = '<div id="mobile-cta" aria-hidden="true"></div>'
    vi.stubGlobal('innerWidth', 480)
    initMobileCta()
    const cta = document.getElementById('mobile-cta')
    expect(cta.classList.contains('visible')).toBe(true)
    expect(cta.getAttribute('aria-hidden')).toBe('false')
  })

  it('keeps the CTA hidden on a wide-viewport inner page', () => {
    document.body.innerHTML = '<div id="mobile-cta" aria-hidden="true"></div>'
    vi.stubGlobal('innerWidth', 1280)
    initMobileCta()
    expect(document.getElementById('mobile-cta').classList.contains('visible')).toBe(false)
  })
})
