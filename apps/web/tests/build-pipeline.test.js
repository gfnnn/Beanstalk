// Integration test for the build wiring in vite.config.js. The renderer unit tests
// prove each render* function in isolation; this proves they're actually plumbed
// into the build — the right marker strings, the transformIndexHtml plugin order
// (palette + grids pre, SEO post), and the generateBundle emitters for the sitemap
// and the per-piece pages. It imports the REAL config so a renamed marker or an
// unregistered plugin fails here instead of silently shipping a broken page.
import { describe, it, expect } from 'vitest'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join, relative, resolve } from 'node:path'
import config from '../vite.config.js'
import { pieces } from '../src/data/pieces.js'
import { flash, season, live as flashLive } from '../src/data/flash.js'
import { replyTime } from '../src/data/business.js'
import { themeColor } from '../src/build/palette.js'
import { ROUTES } from '../src/build/seo.js'

const WEB_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')

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
    'beansprout-font-preload',
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

  it('replaces the hero-media marker with the launch still', () => {
    const out = transformHtml(page('<!-- homepage:hero-media -->'))
    expect(out).not.toContain('<!-- homepage:hero-media -->')
    expect(out).toContain('<img class="media-clip"')
    expect(out).not.toContain('class="video-placeholder"')
  })

  it('replaces the about:hero-media marker with the launch still', () => {
    const out = transformHtml(page('<!-- about:hero-media -->'))
    expect(out).not.toContain('<!-- about:hero-media -->')
    expect(out).toContain('<img class="media-clip"')
    expect(out).not.toContain('class="portrait-placeholder"')
  })

  it('holds the flash page back while flash.js says the drop is not live', () => {
    const nav = '<ul>\n  <li><a href="/portfolio/">Portfolio</a></li>\n  <li><a href="/flash/">Flash</a></li>\n</ul>\n<a href="/flash/">Flash</a>'
    const other = transformHtml(page(nav))
    expect(other).not.toContain('/flash/')
    expect(other).toContain('/portfolio/')
    expect(other).not.toContain('http-equiv="refresh"')
    const flashPage = transformHtml(page(`${nav}<!-- flash:grid -->`))
    expect(flashPage).toContain('<meta http-equiv="refresh" content="0; url=/portfolio/">')
    expect(flashPage).toContain('noindex')
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
    // the policy must pin the Worker connect-src and keep fonts same-origin
    expect(out).toContain('connect-src')
    expect(out).toContain('workers.dev')
    expect(out).toContain("font-src 'self';")
    expect(out).not.toContain('fonts.gstatic.com')
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
  // SITE_ENV=staging forces staging whatever else is true of the checkout (the
  // apex CNAME is committed now), so these assert unconditionally. They used to
  // derive "is this staging?" from the very output under test and return early.
  const emitted = emitWithEnv('staging')

  it('emits NO sitemap.xml on a staging build', () => {
    expect(emitted.some(f => f.fileName === 'sitemap.xml')).toBe(false)
  })

  it('emits a blanket Disallow robots.txt that never advertises the production sitemap', () => {
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

// The sitemap is built from ROUTES (src/build/seo.js), which is hand-kept in sync
// with the `input` map in vite.config.js — seo.js says as much. This locks that
// sync so it can't silently drift: every static page that ships gets indexed iff
// it's in ROUTES. A page is OUT of ROUTES only because it declares `noindex` in
// its own <head> (the post-submit confirmation page) — we derive that from the
// real signal rather than hardcoding a filename allowlist (which would just move
// the manual-sync problem up a level). 404.html is the one genuine special case:
// it's an error document, not a `/dir/` route, so it's never in ROUTES.
//
// Set-equality catches all three drift directions: a new indexable page with no
// ROUTES entry, a removed ROUTES entry whose page still builds, and a dead ROUTES
// path with no backing page (a sitemap URL that would soft-404). Per-piece
// /portfolio/<slug>/ routes are emitted via generateBundle (not the `input` map)
// and appended to the sitemap separately, so they're correctly outside this check.
describe('sitemap ROUTES ↔ vite input parity', () => {
  // Classify every build input by its source: { route, indexable } for the static
  // directory pages, or null for 404.html (not a route). Any unrecognised input
  // shape throws — a future page added in an unexpected form fails loudly here
  // rather than deriving a wrong route silently.
  const inputs = Object.values(config.build.rollupOptions.input)
  const classify = (absPath) => {
    const rel = relative(WEB_ROOT, absPath).split('\\').join('/')
    if (rel === '404.html') return null
    const m = /^(?:(.+)\/)?index\.html$/.exec(rel)
    if (!m) throw new Error(`Unrecognised build input shape: ${rel}`)
    const route = m[1] ? `/${m[1]}/` : '/'
    const noindex = /<meta[^>]+name=["']robots["'][^>]+noindex/i.test(readFileSync(absPath, 'utf8'))
    return { route, indexable: !noindex }
  }
  const pages = inputs.map(classify).filter(Boolean)
  const indexableRoutes = pages.filter(p => p.indexable).map(p => p.route)

  it('every built input has a recognised page shape (index.html or 404.html)', () => {
    // classify() above throws on an unknown shape; getting here proves they all parsed.
    expect(pages.length).toBe(inputs.length - 1) // all inputs minus 404.html
  })

  it('the indexable pages and ROUTES are exactly the same set', () => {
    expect(new Set(indexableRoutes)).toEqual(new Set(ROUTES.map(r => r.path)))
  })

  it('excludes the noindex confirmation page from ROUTES (for the right reason)', () => {
    const received = pages.find(p => p.route === '/enquiry-received/')
    expect(received).toBeTruthy()
    expect(received.indexable).toBe(false)
    expect(ROUTES.some(r => r.path === '/enquiry-received/')).toBe(false)
  })
})

// The per-marker tests above feed the pipeline synthetic one-marker pages, which
// proves a marker is handled but not that the REAL pages are fully processed.
// These run every authored page through the same pipeline and assert on what
// would ship: no generation marker left behind (a renamed marker or a renderer
// dropped from the plugin leaves a bare HTML comment and an empty section, with
// nothing else failing), and the sign-off markers handled per build mode.
describe('every authored page through the real pipeline', () => {
  const inputs = Object.entries(config.build.rollupOptions.input)
  const GENERATION_MARKER = /<!--\s*(?:[a-z]+:[a-z-]+|reply-time|testimonials)\s*-->/g
  const withSiteEnv = (val, fn) => {
    const prev = process.env.SITE_ENV
    process.env.SITE_ENV = val
    try { return fn() } finally {
      if (prev === undefined) delete process.env.SITE_ENV
      else process.env.SITE_ENV = prev
    }
  }
  const sources = inputs.map(([name, abs]) => [name, readFileSync(abs, 'utf8')])

  it('the authored pages do carry markers (so the checks below are not vacuous)', () => {
    expect(sources.length).toBeGreaterThan(10)
    expect(sources.filter(([, html]) => (html.match(GENERATION_MARKER) || []).length > 0).length).toBe(sources.length)
    expect(sources.some(([, html]) => html.includes('ARTIST-COPY'))).toBe(true)
  })

  it.each(sources)('%s: no generation marker survives the build', (_name, html) => {
    const out = withSiteEnv('production', () => transformHtml(html))
    expect(out.match(GENERATION_MARKER) || []).toEqual([])
  })

  it.each(sources)('%s: production strips the ARTIST-COPY sign-off markers and adds no noindex', (name, html) => {
    const out = withSiteEnv('production', () => transformHtml(html))
    expect(out).not.toContain('ARTIST-COPY')
    // A page that is noindex on purpose stays so: its own meta, or the flash page
    // while the drop is held back (the flash gate adds it).
    const heldBackFlash = name === 'flash' && !flashLive
    if (!heldBackFlash && !/name=["']robots["'][^>]+noindex/i.test(html)) {
      expect(out).not.toMatch(/name=["']robots["'][^>]+noindex/i)
    }
  })

  it.each(sources)('%s: staging is noindex and keeps the markers as a review aid', (_name, html) => {
    const out = withSiteEnv('staging', () => transformHtml(html))
    expect(out).toMatch(/<meta name="robots" content="noindex/)
    if (html.includes('ARTIST-COPY')) expect(out).toContain('ARTIST-COPY')
  })
})

// "A new page needs its folder + index.html AND an entry in the input map, or it
// won't be built" (CLAUDE.md). The parity check above starts from the input map,
// so a folder that was never added to it is invisible there. This starts from disk.
describe('page folders on disk ↔ vite input map', () => {
  const NOT_PAGES = new Set(['node_modules', 'dist', 'public', 'src', 'tests', 'e2e', 'scripts', 'coverage', 'playwright-report', 'test-results'])
  const onDisk = ['index.html', '404.html', ...readdirSync(WEB_ROOT, { withFileTypes: true })
    .filter(d => d.isDirectory() && !d.name.startsWith('.') && !NOT_PAGES.has(d.name))
    .filter(d => existsSync(join(WEB_ROOT, d.name, 'index.html')))
    .map(d => `${d.name}/index.html`)]
  const inMap = Object.values(config.build.rollupOptions.input)
    .map(abs => relative(WEB_ROOT, abs).split('\\').join('/'))

  it('every page on disk is built, and every input exists on disk', () => {
    expect(onDisk.length).toBeGreaterThan(10)
    expect([...inMap].sort()).toEqual([...onDisk].sort())
  })
})

// The E2E smoke sweep only vouches for the pages listed in e2e/helpers.js PAGES,
// which is kept in step with ROUTES by hand. Read as text: importing the helper
// would pull the Playwright runner into Vitest.
describe('E2E smoke PAGES ↔ ROUTES', () => {
  const helpers = readFileSync(resolve(WEB_ROOT, 'e2e/helpers.js'), 'utf8')
  const swept = [...helpers.matchAll(/path:\s*['`]([^'`]+)['`]/g)].map(m => m[1])

  it('sweeps every indexable route and the noindex confirmation page', () => {
    for (const { path } of ROUTES) expect(swept, `e2e/helpers.js PAGES is missing ${path}`).toContain(path)
    expect(swept).toContain('/enquiry-received/')
  })

  it('sweeps a generated per-piece page (a separate render path)', () => {
    expect(swept.some(p => p.startsWith('/portfolio/${'))).toBe(true)
  })

  it('lists no static path that is not a real page', () => {
    const real = new Set([...ROUTES.map(r => r.path), '/enquiry-received/'])
    for (const p of swept.filter(p => !p.includes('${'))) expect(real.has(p), p).toBe(true)
  })
})

// "No CSS hard-codes a colour" (CLAUDE.md): colour comes from src/data/palette.js
// as custom properties, so a palette swap recolours the whole site. A literal in
// a stylesheet silently opts that rule out of the palette.
describe('stylesheets take colour only from palette custom properties', () => {
  const walk = dir => readdirSync(dir, { withFileTypes: true }).flatMap(d =>
    d.isDirectory() ? walk(join(dir, d.name)) : d.name.endsWith('.css') ? [join(dir, d.name)] : [])
  const files = walk(resolve(WEB_ROOT, 'src/styles'))
  const NAMED = 'white|black|red|green|blue|gray|grey|silver|orange|yellow|purple|pink|brown|beige|ivory|tan|olive|navy|teal'

  // Declarations only (`prop: value`), comments stripped, so an id selector that
  // happens to look like hex (#fade) or prose in a comment can't trip it.
  const offences = source => {
    const css = source.replace(/\/\*[\s\S]*?\*\//g, '')
    const found = []
    for (const m of css.matchAll(/([\w-]+)\s*:\s*([^;{}]+)[;}]/g)) {
      const [, prop, value] = m
      if (/^(content|font-family|grid-template-areas|grid-area|transition|transition-property|will-change|animation|animation-name|view-transition-name)$/.test(prop)) continue
      const v = value.replace(/url\([^)]*\)/g, '').replace(/var\(--[\w-]+/g, 'var(')
      if (/#[0-9a-fA-F]{3,8}\b/.test(v)) found.push(`${prop}: ${value.trim()}`)
      else if (/\b(?:rgb|hsl|hwb|lab|lch|oklab|oklch)a?\(\s*[\d.]/.test(v)) found.push(`${prop}: ${value.trim()}`)
      else if (new RegExp(`(^|[\\s,(])(${NAMED})([\\s,);]|$)`, 'i').test(v)) found.push(`${prop}: ${value.trim()}`)
    }
    return found
  }

  it('finds the stylesheets', () => { expect(files.length).toBeGreaterThan(20) })

  it.each(files.map(f => [relative(WEB_ROOT, f), f]))('%s has no literal colour', (_rel, file) => {
    expect(offences(readFileSync(file, 'utf8'))).toEqual([])
  })

  it('the detector catches each kind of literal and passes palette-derived values (self-check)', () => {
    expect(offences('a{color:#B05138}')).toHaveLength(1)
    expect(offences('a{background: rgb(10 20 30 / .5);}')).toHaveLength(1)
    expect(offences('a{box-shadow: 0 1px 2px rgba(0,0,0,.2)}')).toHaveLength(1)
    expect(offences('a{border:1px solid white}')).toHaveLength(1)
    expect(offences('/* #fff */ #fade{color:rgb(var(--ink-rgb) / .2); background:var(--moss); border-color:transparent; fill:currentColor}')).toEqual([])
  })
})

// The FOUC guard and the JS entrance must stay paired: anything animated on-load
// above the fold must be held at opacity:0 until `.motion-ready`, or it flashes.
// These newly-woven elements were the gaps; pin them so the pairing can't silently
// drop (the guard lives in motion.css, the animation in animations.js).
describe('motion.css FOUC guard covers the woven-in above-the-fold elements', () => {
  const motionCss = readFileSync(resolve(WEB_ROOT, 'src/styles/motion.css'), 'utf8')
  it.each([
    '.newsletter-band-title',
    '.newsletter-band-sub',
    '.scroll-hint',
    '.hero-media',
    '.filter-bar .filter-toggle',
  ])('guards %s', sel => {
    expect(motionCss).toContain(sel)
  })
})
