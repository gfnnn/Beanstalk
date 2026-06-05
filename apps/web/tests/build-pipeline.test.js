// Integration test for the build wiring in vite.config.js. The renderer unit tests
// prove each render* function in isolation; this proves they're actually plumbed
// into the build — the right marker strings, the transformIndexHtml plugin order
// (palette + grids pre, SEO post), and the generateBundle emitters for the sitemap
// and the per-piece pages. It imports the REAL config so a renamed marker or an
// unregistered plugin fails here instead of silently shipping a broken page.
import { describe, it, expect } from 'vitest'
import config from '../vite.config.js'
import { pieces } from '../src/data/pieces.js'
import { flash } from '../src/data/flash.js'
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

  it('replaces the hero-media marker (placeholder while the clip is off)', () => {
    const out = transformHtml(page('<!-- homepage:hero-media -->'))
    expect(out).not.toContain('<!-- homepage:hero-media -->')
    expect(out).toContain('class="video-placeholder"')
  })

  it('replaces the about:portrait marker (placeholder while the clip is off)', () => {
    const out = transformHtml(page('<!-- about:portrait -->'))
    expect(out).not.toContain('<!-- about:portrait -->')
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
})

describe('sitemap generateBundle', () => {
  const emitted = []
  byName('beansprout-sitemap').generateBundle.call({ emitFile: f => emitted.push(f) })
  const sm = emitted.find(f => f.fileName === 'sitemap.xml')

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
})
