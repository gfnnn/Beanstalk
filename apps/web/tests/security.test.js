// Tests for src/build/security.js — the build-time CSP/Referrer meta. The policy
// must pin connect-src to whatever Worker origin the build points the forms at
// (the VITE_*_FN_URL vars), fall back to the documented default when unset, and
// keep the allowances the site actually needs (inline styles, Google fonts/maps,
// blob: image previews).
import { describe, it, expect } from 'vitest'
import { cspContent, workerConnectOrigins, renderSecurityMeta, REFERRER_POLICY } from '../src/build/security.js'

describe('workerConnectOrigins', () => {
  it('falls back to the default workers.dev origin when no env vars are set', () => {
    const origins = workerConnectOrigins({})
    expect(origins).toHaveLength(1)
    expect(origins[0]).toMatch(/workers\.dev$/)
  })

  it('derives distinct origins from the VITE_*_FN_URL build vars', () => {
    const origins = workerConnectOrigins({
      VITE_ENQUIRY_FN_URL: 'https://api.example.com/enquiry',
      VITE_NEWSLETTER_FN_URL: 'https://api.example.com/newsletter',
      VITE_FLASH_STATUS_FN_URL: 'https://other.example.com/flash-status',
    })
    expect(origins).toEqual(['https://api.example.com', 'https://other.example.com'])
  })

  it('ignores malformed URLs', () => {
    expect(workerConnectOrigins({ VITE_ENQUIRY_FN_URL: 'not a url' })).toHaveLength(1)
  })
})

describe('cspContent', () => {
  const csp = cspContent(['https://api.example.com'])

  it('locks the baseline to self and forbids objects/plugins', () => {
    expect(csp).toContain("default-src 'self'")
    expect(csp).toContain("object-src 'none'")
    expect(csp).toContain("base-uri 'self'")
  })

  it('pins connect-src to self plus the given Worker origin', () => {
    expect(csp).toContain("connect-src 'self' https://api.example.com")
  })

  it('allows the resources the site actually loads', () => {
    expect(csp).toContain('https://fonts.googleapis.com') // font CSS (style-src)
    expect(csp).toContain('https://fonts.gstatic.com')    // font files (font-src)
    expect(csp).toContain('blob:')                         // enquiry image preview
    expect(csp).toContain('https://maps.google.com')       // /visit/ embed (frame-src)
    expect(csp).toContain("style-src 'self' 'unsafe-inline'") // palette + inline style attrs
  })
})

describe('renderSecurityMeta', () => {
  it('emits both meta tags', () => {
    const meta = renderSecurityMeta(['https://api.example.com'])
    expect(meta).toContain('http-equiv="Content-Security-Policy"')
    expect(meta).toContain(`<meta name="referrer" content="${REFERRER_POLICY}">`)
  })
})
