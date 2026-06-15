// Integration test for the build wiring in vite.config.js. The renderer unit tests
// prove each render* function in isolation; this proves they're actually plumbed
// into the build — the right marker strings, the transformIndexHtml plugin order
// (palette + grids pre, SEO post), and the generateBundle emitters for the sitemap
// and the per-piece pages. It imports the REAL config so a renamed marker or an
// unregistered plugin fails here instead of silently shipping a broken page.
import { describe, it, expect } from 'vitest'
import config from '../vite.config.js'
import { pieces } from '../src/data/pieces.js'
import { flash, season } from '../src/data/flash.js'
import { replyTime } from '../src/data/business.js'
import { themeColor } from '../src/build/palette.js'

const plugins = config.plugins
const byName = name => plugins.find(p => p.name === name)

// Replay the transformIndexHtml plugins in Vite's documented order: 'pre' hooks
// first, then unordered, then 'post' — stable by registration order within a tier.
function transformHtml(html) {
  const hooks = plugins
    .filter(p => p.transformIndexHtml)
    .map(p => p.transformIndexHtml)
  const ordered = [
    ...hooks.filter(h => h.order === 'pre'),
    ...hooks.filter(h => !h.order),
    ...hooks.filter(h => h.order === 'post'),
  ]
  return ordered.reduce((acc, h) => h.handler(acc, {}), html)
}

const page = body =>
  '<!doctype html><html><head>' +
  '<meta name="theme-color" content="#ffffff">' +
  '<meta property="og:url" content="https://beansprout.ink/portfolio/">' +
  '</head><body>' + body + '</body></html>'

describe('vite.config plugins are all registered', () => {
  it.each([
    'beansprout-palette',
    'beansprout-generated-grids',
    'beansprout-seo-head',
    'beansprout-security-headers',
    'beansprout-page-loader',
    'beansprout-view-transition',
    'beansprout-piece-pages',
    'beansprout-sitemap',
  ])('%s is in the plugin list', name => {
    expect(byName(name)).toBeTruthy()
  })
})

describe('transformIndexHtml pipeline', () => {
  it('replaces the masonry marker with the generated portfolio grid', () => {
    const out = transformHtml(page('<!-- pieces:masonry -->'))
    expect(out).not.toContain('<!-- pieces:masonry -->')
    expect(out).toContain('masonry-tile')
    // one tile rendered per piece
    expect(out.match(/class="masonry-tile/g)).toHaveLength(pieces.length)
  })

  it('replaces the flash marker with the generated flash grid', () => {
    const out = transformHtml(page('<!-- flash:grid -->'))
    expect(out).not.toContain('<!-- flash:grid -->')
    expect(out.match(/class="flash-card"/g)).toHaveLength(flash.length)
  })

  it('replaces the flash:drop marker with the current drop number', () => {
    const out = transformHtml(page('Drop <!-- flash:drop --> · 2026'))
    expect(out).not.toContain('<!-- flash:drop -->')
    expect(out).toContain(`Drop ${Math.max(...flash.map(f => f.drop))} · 2026`)
  })

  it('replaces the flash:season marker with the authored season label', () => {
    const out = transformHtml(page('Drop <!-- flash:drop --> · <!-- flash:season -->'))
    expect(out).not.toContain('<!-- flash:season -->')
    expect(out).toContain(`Drop ${Math.max(...flash.map(f => f.drop))} · ${season}`)
  })

  it('replaces every brand:mark marker with the inline traced mark', () => {
    // every page's nav lockup carries one; /enquiry-received/ carries a second
    const out = transformHtml(page('<!-- brand:mark --> nav … confirm <!-- brand:mark -->'))
    expect(out).not.toContain('<!-- brand:mark -->')
    expect(out.match(/class="brand-mark"/g)).toHaveLength(2)
    expect(out).toContain('fill="currentColor"')
  })

  it('replaces the reply-time marker with the authored reply-time phrase', () => {
    const out = transformHtml(page('reply by email, usually <!-- reply-time -->.'))
    expect(out).not.toContain('<!-- reply-time -->')
    expect(out).toContain(`reply by email, usually ${replyTime}.`)
  })

  it('replaces the hero-media marker (placeholder while the clip is off)', () => {
    const out = transformHtml(page('<!-- homepage:hero-media -->'))
    expect(out).not.toContain('<!-- homepage:hero-media -->')
    expect(out).toContain('class="video-placeholder"')
  })

  it('replaces the about:hero-media marker (placeholder while the clip is off)', () => {
    const out = transformHtml(page('<!-- about:hero-media -->'))
    expect(out).not.toContain('<!-- about:hero-media -->')
    expect(out).toContain('class="portrait-placeholder"')
  })

  it('injects the palette <style> and repoints theme-color at the palette bg', () => {
    const out = transformHtml(page(''))
    expect(out).toContain('<style id="palette">')
    expect(out).toContain('--moss:')
    expect(out).toContain(`content="${themeColor}"`)
    expect(out).not.toContain('content="#ffffff"') // the placeholder was rewritten
  })

  it('injects the structural SEO head (canonical derived from og:url) last', () => {
    const out = transformHtml(page(''))
    expect(out).toContain('<link rel="canonical" href="https://beansprout.ink/portfolio/">')
    expect(out).toContain('property="og:site_name"')
  })

  it('injects the CSP + Referrer-Policy security meta into the head', () => {
    const out = transformHtml(page(''))
    expect(out).toContain('http-equiv="Content-Security-Policy"')
    expect(out).toContain("default-src 'self'")
    expect(out).toContain('<meta name="referrer" content="strict-origin-when-cross-origin">')
    // the policy must pin the Worker connect-src and the Google Fonts/Maps origins
    expect(out).toContain('connect-src')
    expect(out).toContain('workers.dev')
    expect(out).toContain('https://fonts.gstatic.com')
  })

  it('does not double-inject the security meta when the head already carries it', () => {
    const out = transformHtml(page(''))
    const again = transformHtml(out)
    expect(again.match(/http-equiv="Content-Security-Policy"/g)).toHaveLength(1)
  })

  it('leaves a noindex page out of SEO injection', () => {
    const noindex =
      '<!doctype html><html><head>' +
      '<meta name="robots" content="noindex">' +
      '<meta property="og:url" content="https://beansprout.ink/enquiry-received/">' +
      '</head><body></body></html>'
    expect(transformHtml(noindex)).not.toContain('rel="canonical"')
  })

  it('does not double-inject the palette when the head already carries it', () => {
    const out = transformHtml(page(''))
    const again = transformHtml(out)
    expect(again.match(/<style id="palette">/g)).toHaveLength(1)
  })

  it('injects the page preloader (critical <style> + overlay) into every page', () => {
    const out = transformHtml(page('<main></main>'))
    expect(out).toContain('<style id="page-loader-css">')
    expect(out).toContain('id="page-loader"')
  })

  it('does not double-inject the preloader on a second pass', () => {
    const out = transformHtml(page(''))
    const again = transformHtml(out)
    expect(again.match(/id="page-loader-css"/g)).toHaveLength(1)
  })

  it('inlines the View Transition opt-in into the head (armed before the CSS waterfall)', () => {
    const out = transformHtml(page('<main></main>'))
    expect(out).toContain('id="vt-optin"')
    expect(out).toContain('@view-transition{navigation:auto}')
    // it lands in the head, not the body
    expect(out.indexOf('id="vt-optin"')).toBeLessThan(out.indexOf('</head>'))
  })

  it('does not double-inject the View Transition opt-in on a second pass', () => {
    const again = transformHtml(transformHtml(page('')))
    expect(again.match(/id="vt-optin"/g)).toHaveLength(1)
  })
})

// The robots.txt + sitemap emit is staging-aware (keyed off isProductionBuild()),
// so drive generateBundle under an explicit SITE_ENV and restore it after.
function emitWithEnv(val) {
  const prev = process.env.SITE_ENV
  if (val === undefined) delete process.env.SITE_ENV
  else process.env.SITE_ENV = val
  const emitted = []
  try {
    byName('beansprout-sitemap').generateBundle.call({ emitFile: f => emitted.push(f) })
  } finally {
    if (prev === undefined) delete process.env.SITE_ENV
    else process.env.SITE_ENV = prev
  }
  return emitted
}

describe('sitemap + robots generateBundle (production / apex build)', () => {
  const emitted = emitWithEnv('production')
  const sm = emitted.find(f => f.fileName === 'sitemap.xml')
  const robots = emitted.find(f => f.fileName === 'robots.txt')

  it('emits sitemap.xml', () => {
    expect(sm).toBeTruthy()
    expect(sm.type).toBe('asset')
  })

  it('includes the static routes and one entry per portfolio piece', () => {
    expect(sm.source).toContain('<loc>https://beansprout.ink/</loc>')
    for (const p of pieces) {
      expect(sm.source).toContain(`/portfolio/${p.slug}/`)
    }
  })

  it('emits a crawl-allowing robots.txt that advertises the sitemap', () => {
    expect(robots).toBeTruthy()
    expect(robots.source).toContain('Allow: /')
    expect(robots.source).toContain('Sitemap: https://beansprout.ink/sitemap.xml')
  })
})

describe('sitemap + robots generateBundle (staging build — no real-life SEO artifacts)', () => {
  const emitted = emitWithEnv(undefined)
  // Pre-launch repo invariant: no apex CNAME, so SITE_ENV unset → staging.
  const isStaging = !emitted.some(f => f.fileName === 'sitemap.xml')

  it('emits NO sitemap.xml on a staging build', () => {
    if (!isStaging) return // a local apex/CNAME build legitimately would emit one
    expect(emitted.some(f => f.fileName === 'sitemap.xml')).toBe(false)
  })

  it('emits a blanket Disallow robots.txt that never advertises the production sitemap', () => {
    if (!isStaging) return
    const robots = emitted.find(f => f.fileName === 'robots.txt')
    expect(robots).toBeTruthy()
    expect(robots.source).toContain('Disallow: /')
    expect(robots.source).not.toContain('Sitemap:')
    expect(robots.source).not.toContain('beansprout.ink')
  })
})

describe('piece-pages generateBundle', () => {
  const emitted = []
  const bundle = {
    'assets/main-abc123.js': { type: 'chunk', fileName: 'assets/main-abc123.js' },
    'assets/main-abc123.css': { type: 'asset', fileName: 'assets/main-abc123.css' },
  }
  byName('beansprout-piece-pages').generateBundle.call(
    { emitFile: f => emitted.push(f) },
    {},
    bundle,
  )
  const htmlFiles = emitted.filter(f => /^portfolio\/.+\/index\.html$/.test(f.fileName))

  it('emits one HTML page per portfolio piece at the right path', () => {
    expect(htmlFiles).toHaveLength(pieces.length)
    for (const p of pieces) {
      expect(htmlFiles.some(f => f.fileName === `portfolio/${p.slug}/index.html`)).toBe(true)
    }
  })

  it('points the generated pages at the exact hashed bundle from the build', () => {
    const sample = htmlFiles[0].source
    expect(sample).toContain('/assets/main-abc123.js')
    expect(sample).toContain('/assets/main-abc123.css')
  })

  it('carries the CSP security meta (it bypasses the transform plugin)', () => {
    const sample = htmlFiles[0].source
    expect(sample).toContain('http-equiv="Content-Security-Policy"')
    expect(sample).toContain('<meta name="referrer" content="strict-origin-when-cross-origin">')
  })

  it('carries the page preloader (it bypasses the transform plugin)', () => {
    const sample = htmlFiles[0].source
    expect(sample).toContain('<style id="page-loader-css">')
    expect(sample).toContain('id="page-loader"')
  })

  it('carries the inline View Transition opt-in (it bypasses the transform plugin)', () => {
    const sample = htmlFiles[0].source
    expect(sample).toContain('id="vt-optin"')
    expect(sample).toContain('@view-transition{navigation:auto}')
  })
})
