// @vitest-environment node
//
// The cross-document View Transition opt-in is inlined into <head> (rather than
// left in atmosphere.css, one @import-hop behind main.css) so the browser arms the
// transition from the first parsed bytes — a late opt-in lets a slow inbound render
// skip the cross-fade and hard-cut. These cover the injector that puts it there.
import { describe, it, expect } from 'vitest'
import { VIEW_TRANSITION_STYLE, injectViewTransition } from '../src/build/transition.js'

const doc = head =>
  `<!doctype html><html><head>${head}</head><body><main></main></body></html>`

describe('VIEW_TRANSITION_STYLE', () => {
  it('is the opt-in only — navigation:auto, no ::view-transition animations', () => {
    expect(VIEW_TRANSITION_STYLE).toContain('@view-transition{navigation:auto}')
    expect(VIEW_TRANSITION_STYLE).toContain('id="vt-optin"')
    // The animations stay in atmosphere.css; the inline block must not carry them.
    expect(VIEW_TRANSITION_STYLE).not.toContain('::view-transition')
  })
})

describe('injectViewTransition', () => {
  it('inserts the opt-in inside the head', () => {
    const out = injectViewTransition(doc(''))
    expect(out).toContain('id="vt-optin"')
    expect(out.indexOf('id="vt-optin"')).toBeLessThan(out.indexOf('</head>'))
  })

  it('is idempotent — a second pass does not double-inject', () => {
    const twice = injectViewTransition(injectViewTransition(doc('')))
    expect(twice.match(/id="vt-optin"/g)).toHaveLength(1)
  })

  it('leaves a fragment with no head untouched (piece pages carry their own copy)', () => {
    const frag = '<div>just a fragment</div>'
    expect(injectViewTransition(frag)).toBe(frag)
  })
})
