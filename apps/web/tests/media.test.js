// @vitest-environment jsdom
//
// Tests for hero-clip playback (src/js/modules/media.js) — progressive enhancement
// layered on a build that ships every clip paused (no autoplay), so a no-JS or
// reduced-motion visitor sees only the poster. Covered: the reduced-motion freeze
// (a GIF swapped to its still poster, videos left paused), the no-Observer fallback
// (start the muted/looping clips once), and the on/off-screen play/pause via a
// mocked IntersectionObserver. jsdom implements neither HTMLMediaElement.play/pause
// nor IntersectionObserver, so both are stubbed.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { initMedia } from '../src/js/modules/media.js'

let instances
class MockIO {
  constructor(cb, opts) { this.cb = cb; this.opts = opts; this.observed = []; instances.push(this) }
  observe(el) { this.observed.push(el) }
  disconnect() {}
  // test helper: deliver a batch of entries
  fire(entries) { this.cb(entries) }
}

const reduceMatch = matches => () => ({ matches })

// A <video data-media> with stubbed play/pause (jsdom implements neither).
function addVideo({ preload = 'auto' } = {}) {
  const v = document.createElement('video')
  v.setAttribute('data-media', '')
  v.preload = preload
  v.play = vi.fn(() => Promise.resolve())
  v.pause = vi.fn()
  document.body.appendChild(v)
  return v
}

beforeEach(() => {
  instances = []
  document.body.innerHTML = ''
  window.matchMedia = reduceMatch(false)
})
afterEach(() => { vi.unstubAllGlobals() })

describe('initMedia', () => {
  it('no-ops when the page carries no clips', () => {
    expect(() => initMedia()).not.toThrow()
  })

  describe('prefers-reduced-motion', () => {
    beforeEach(() => { window.matchMedia = reduceMatch(true) })

    it('freezes a GIF to its still poster', () => {
      document.body.innerHTML =
        '<img data-media-gif data-poster="/videos/hero-poster.jpg" src="/videos/hero.gif">'
      initMedia()
      expect(document.querySelector('img').getAttribute('src')).toBe('/videos/hero-poster.jpg')
    })

    it('leaves videos paused on their poster — never plays, never observes', () => {
      vi.stubGlobal('IntersectionObserver', MockIO)
      const v = addVideo()
      initMedia()
      expect(v.play).not.toHaveBeenCalled()
      expect(instances).toHaveLength(0)
    })
  })

  it('without IntersectionObserver, starts each clip once (muted/looping fallback)', () => {
    expect('IntersectionObserver' in window).toBe(false) // jsdom default
    const a = addVideo()
    const b = addVideo()
    initMedia()
    expect(a.play).toHaveBeenCalledTimes(1)
    expect(b.play).toHaveBeenCalledTimes(1)
  })

  describe('with IntersectionObserver', () => {
    beforeEach(() => { vi.stubGlobal('IntersectionObserver', MockIO) })

    it('observes every clip but does not autoplay before it scrolls into view', () => {
      const v = addVideo()
      initMedia()
      expect(instances).toHaveLength(1)
      expect(instances[0].observed).toEqual([v])
      expect(v.play).not.toHaveBeenCalled()
    })

    it('plays a clip on entry (upgrading preload) and pauses it on exit', () => {
      const v = addVideo({ preload: 'none' })
      initMedia()

      instances[0].fire([{ target: v, isIntersecting: true }])
      expect(v.preload).toBe('auto')           // bumped from 'none' on first view
      expect(v.play).toHaveBeenCalledTimes(1)

      instances[0].fire([{ target: v, isIntersecting: false }])
      expect(v.pause).toHaveBeenCalledTimes(1)
    })

    it('swallows a rejected play() promise (autoplay policy) without throwing', () => {
      const v = addVideo()
      v.play = vi.fn(() => Promise.reject(new Error('NotAllowedError')))
      initMedia()
      expect(() => instances[0].fire([{ target: v, isIntersecting: true }])).not.toThrow()
      expect(v.play).toHaveBeenCalledTimes(1)
    })
  })
})
