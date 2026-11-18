// Self-hosted fonts: the @font-face rules (src/styles/fonts.css), the files they
// point at (public/fonts/), the head preloads (src/build/fonts.js), and the rule
// that no page reaches for Google Fonts.
import { describe, it, expect } from 'vitest'
import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

import { injectFontPreloads, FONT_PRELOADS, PRELOADED_FONTS } from '../src/build/fonts.js'
import { renderPiecePage } from '../src/build/piece-page.js'
import { pieces } from '../src/data/pieces.js'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const css = readFileSync(join(root, 'src/styles/fonts.css'), 'utf8')
const faceUrls = [...css.matchAll(/url\('([^']+)'\)/g)].map(m => m[1])

// Every hand-written page: the root index/404 plus one index.html per folder.
const pageFiles = ['index.html', '404.html', ...readdirSync(root)
  .filter(d => !['node_modules', 'dist', 'public', 'src', 'tests', 'e2e', 'scripts'].includes(d))
  .filter(d => statSync(join(root, d)).isDirectory() && existsSync(join(root, d, 'index.html')))
  .map(d => `${d}/index.html`)]

describe('@font-face rules (src/styles/fonts.css)', () => {
  it('declares the four faces the site uses, all font-display: swap', () => {
    expect(faceUrls).toHaveLength(4)
    expect(css.match(/font-display: swap/g)).toHaveLength(4)
    for (const family of ['Fraunces', 'Karla', 'JetBrains Mono']) {
      expect(css).toContain(`font-family: '${family}'`)
    }
  })

  it('points only at same-origin woff2 files that exist in public/fonts/', () => {
    for (const url of faceUrls) {
      expect(url).toMatch(/^\/fonts\/[a-z0-9-]+\.woff2$/)
      expect(existsSync(join(root, 'public', url)), `${url} is missing from public/`).toBe(true)
    }
  })

  it('is the first import in main.css', () => {
    const main = readFileSync(join(root, 'src/styles/main.css'), 'utf8')
    expect(main.trimStart().startsWith("@import './fonts.css';")).toBe(true)
  })
})

describe('font preloads (src/build/fonts.js)', () => {
  it('preloads only fonts that have an @font-face rule, with crossorigin', () => {
    for (const href of PRELOADED_FONTS) expect(faceUrls).toContain(href)
    expect(FONT_PRELOADS.match(/<link rel="preload"[^>]*as="font" type="font\/woff2" crossorigin>/g))
      .toHaveLength(PRELOADED_FONTS.length)
  })

  it('injects them ahead of the first stylesheet, once', () => {
    const html = '<html><head>\n  <link rel="stylesheet" href="/src/styles/main.css" />\n</head><body></body></html>'
    const once = injectFontPreloads(html)
    expect(once.indexOf(PRELOADED_FONTS[0])).toBeLessThan(once.indexOf('rel="stylesheet"'))
    expect(injectFontPreloads(once)).toBe(once)
  })

  it('falls back to </head> without a stylesheet, and leaves fragments alone', () => {
    expect(injectFontPreloads('<head></head>')).toContain(`${FONT_PRELOADS}\n</head>`)
    expect(injectFontPreloads('<p>fragment</p>')).toBe('<p>fragment</p>')
  })

  it('is carried by the per-piece pages, which bypass the HTML transform', () => {
    expect(renderPiecePage(pieces[0])).toContain(FONT_PRELOADS)
  })
})

describe('no page loads Google Fonts', () => {
  it.each(pageFiles)('%s has no fonts.googleapis.com / fonts.gstatic.com reference', file => {
    const html = readFileSync(join(root, file), 'utf8')
    expect(html).not.toMatch(/fonts\.(googleapis|gstatic)\.com/)
  })

  it('nor do the per-piece pages', () => {
    expect(renderPiecePage(pieces[0])).not.toMatch(/fonts\.(googleapis|gstatic)\.com/)
  })
})
