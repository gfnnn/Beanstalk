// @vitest-environment jsdom
//
// Tests for the analytics scaffold (src/js/modules/analytics.js). The provider is
// deliberately unwired, so `track()` routes through `send()` which — in dev/test
// (import.meta.env.DEV) — surfaces the event via console.debug('[track]', …). We
// assert on that dev sink to prove the whole chain fires, and that the outbound
// social-link wiring tags each click with the right network + page location. The
// contract pinned here is what keeps conversion events flowing when a real
// provider is finally dropped into send().
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { track, initAnalytics } from '../src/js/modules/analytics.js'

let debugSpy
beforeEach(() => {
  document.body.innerHTML = ''
  debugSpy = vi.spyOn(console, 'debug').mockImplementation(() => {})
})
afterEach(() => { vi.restoreAllMocks() })

// The arguments of the most recent '[track]' console.debug call: [event, props].
const lastTracked = () => {
  const call = [...debugSpy.mock.calls].reverse().find(c => c[0] === '[track]')
  return call ? { event: call[1], props: call[2] } : null
}

describe('track', () => {
  it('surfaces the event (and an empty props default) through the dev sink', () => {
    track('newsletter_signup')
    expect(lastTracked()).toEqual({ event: 'newsletter_signup', props: {} })
  })

  it('passes props straight through', () => {
    track('flash_claim', { piece: 'moth' })
    expect(lastTracked()).toEqual({ event: 'flash_claim', props: { piece: 'moth' } })
  })

  it('never throws even if the underlying sink does', () => {
    debugSpy.mockImplementation(() => { throw new Error('provider blew up') })
    expect(() => track('enquiry_submit')).not.toThrow()
  })
})

describe('initAnalytics', () => {
  it('no-ops when the page has no social links', () => {
    document.body.innerHTML = '<a href="/about/">About</a>'
    expect(() => initAnalytics()).not.toThrow()
    document.querySelector('a').click()
    expect(lastTracked()).toBeNull() // a non-social link is never tracked
  })

  it('tags an Instagram click in the nav as instagram / nav', () => {
    document.body.innerHTML = '<nav><a href="https://instagram.com/beansprout">IG</a></nav>'
    initAnalytics()
    document.querySelector('a').click()
    expect(lastTracked()).toEqual({ event: 'social_click', props: { network: 'instagram', location: 'nav' } })
  })

  it('tags a TikTok click in the footer as tiktok / footer', () => {
    document.body.innerHTML = '<footer><a href="https://www.tiktok.com/@beansprout">TT</a></footer>'
    initAnalytics()
    document.querySelector('a').click()
    expect(lastTracked()).toEqual({ event: 'social_click', props: { network: 'tiktok', location: 'footer' } })
  })

  it('wires every social link on the page independently', () => {
    document.body.innerHTML =
      '<nav><a href="https://instagram.com/x">IG</a></nav>' +
      '<footer><a href="https://tiktok.com/@x">TT</a></footer>'
    initAnalytics()
    document.querySelectorAll('a')[0].click()
    expect(lastTracked().props).toEqual({ network: 'instagram', location: 'nav' })
    document.querySelectorAll('a')[1].click()
    expect(lastTracked().props).toEqual({ network: 'tiktok', location: 'footer' })
  })
})
