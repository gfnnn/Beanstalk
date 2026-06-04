// Content-Security-Policy tests — src/build/security.js. The policy is a
// defence-in-depth backstop, so pin down the security-relevant guarantees: that
// the dangerous escape hatches stay OUT of script-src, and that every origin the
// site genuinely needs stays IN (so a careless tightening doesn't silently break
// fonts, the form fetches, or the maps embed). We assert directive content rather
// than the exact string, so reordering doesn't break the suite.
import { describe, it, expect } from 'vitest'
import { cspContent, renderCspMeta } from '../src/build/security.js'

// Parse "name a b; name2 c" → { name: ['a','b'], name2: ['c'] }.
function parse(csp) {
  return Object.fromEntries(
    csp.split(';').map(d => d.trim()).filter(Boolean).map(d => {
      const [name, ...values] = d.split(/\s+/)
      return [name, values]
    }),
  )
}

describe('cspContent', () => {
  const csp = cspContent()
  const d = parse(csp)

  it('locks the default down to self', () => {
    expect(d['default-src']).toEqual(["'self'"])
    expect(d['object-src']).toEqual(["'none'"])
    expect(d['base-uri']).toEqual(["'self'"])
  })

  it('never allows inline or eval-d script — the whole point of the backstop', () => {
    expect(d['script-src']).toEqual(["'self'"]) // no 'unsafe-inline', no remote origins
    expect(csp).not.toContain("'unsafe-eval'")
  })

  it('allows the font + maps + function origins the site actually uses', () => {
    expect(d['style-src']).toContain('https://fonts.googleapis.com')
    expect(d['style-src']).toContain("'unsafe-inline'") // injected palette + inline styles
    expect(d['font-src']).toContain('https://fonts.gstatic.com')
    expect(d['img-src']).toEqual(expect.arrayContaining(["'self'", 'data:', 'blob:']))
    expect(d['connect-src']).toContain("'self'")
    expect(d['connect-src']).toContain('https://beansprout.netlify.app')
    expect(d['frame-src']).toContain('https://maps.google.com')
    expect(d['form-action']).toEqual(["'self'"])
  })

  it('omits header-only directives that a <meta> tag cannot carry', () => {
    expect(csp).not.toContain('frame-ancestors')
    expect(csp).not.toContain('report-uri')
    expect(csp).not.toContain('report-to')
  })
})

describe('renderCspMeta', () => {
  it('produces a well-formed http-equiv meta with no quote-breaking content', () => {
    const meta = renderCspMeta()
    expect(meta).toMatch(/^<meta http-equiv="Content-Security-Policy" content="[^"]+">$/)
    // The content is wrapped in double quotes, so a literal double quote in any
    // directive would break the attribute — guard against that.
    expect(cspContent()).not.toContain('"')
  })
})
