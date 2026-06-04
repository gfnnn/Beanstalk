import { defineConfig } from 'vite'
import { resolve } from 'path'
import { pieces } from './src/data/pieces.js'
import { renderPortfolioTiles } from './src/build/portfolio-tiles.js'
import { flash } from './src/data/flash.js'
import { renderFlashCards } from './src/build/flash-cards.js'
import { injectSeoHead, renderSitemap, ROUTES } from './src/build/seo.js'
import { renderNewsletterInline } from './src/build/newsletter-inline.js'
import { renderPiecePage, piecePagesData } from './src/build/piece-page.js'
import { testimonials } from './src/data/testimonials.js'
import { renderTestimonials } from './src/build/testimonials.js'
import { homepage } from './src/data/homepage.js'
import {
  renderStatus, renderNotices,
  renderHeroEyebrow, renderHeroHeadline, renderHeroBody, renderHeroMediaTag,
} from './src/build/homepage.js'
import { renderSpecialisms } from './src/build/specialisms.js'

// Generate grids from their data files (single sources of truth) and inject them
// into per-page markers. Runs in dev AND build via transformIndexHtml, so the
// grids ship as static HTML. Each marker exists on only one page, so other pages
// pass through untouched. Replacements use a function so any `$` in the generated
// HTML isn't treated as a regex back-reference.
const generatedGrids = {
  name: 'beansprout-generated-grids',
  transformIndexHtml: {
    order: 'pre',
    handler(html) {
      if (html.includes('<!-- pieces:masonry -->')) {
        html = html.replace('<!-- pieces:masonry -->', () => renderPortfolioTiles(pieces))
      }
      if (html.includes('<!-- flash:grid -->')) {
        html = html.replace('<!-- flash:grid -->', () => renderFlashCards(flash))
      }
      // Inline newsletter-capture band (homepage / flash / post-enquiry).
      if (html.includes('<!-- newsletter:inline -->')) {
        html = html.replace('<!-- newsletter:inline -->', () => renderNewsletterInline())
      }
      // Homepage testimonials (src/data/testimonials.js).
      if (html.includes('<!-- testimonials -->')) {
        html = html.replace('<!-- testimonials -->', () => renderTestimonials(testimonials))
      }
      // Homepage content (src/data/homepage.js). The nav status "light" markers
      // live on every page; the hero/notice markers only on the homepage.
      if (html.includes('<!-- homepage:status -->')) {
        html = html.replace('<!-- homepage:status -->', () => renderStatus(homepage.status))
      }
      if (html.includes('<!-- homepage:status-drawer -->')) {
        html = html.replace('<!-- homepage:status-drawer -->', () => renderStatus(homepage.status, { center: true }))
      }
      if (html.includes('<!-- homepage:notices -->')) {
        html = html.replace('<!-- homepage:notices -->', () => renderNotices(homepage.notices))
      }
      if (html.includes('<!-- homepage:hero-eyebrow -->')) {
        html = html.replace('<!-- homepage:hero-eyebrow -->', () => renderHeroEyebrow(homepage.hero))
      }
      if (html.includes('<!-- homepage:hero-headline -->')) {
        html = html.replace('<!-- homepage:hero-headline -->', () => renderHeroHeadline(homepage.hero))
      }
      if (html.includes('<!-- homepage:hero-body -->')) {
        html = html.replace('<!-- homepage:hero-body -->', () => renderHeroBody(homepage.hero))
      }
      if (html.includes('<!-- homepage:hero-media-tag -->')) {
        html = html.replace('<!-- homepage:hero-media-tag -->', () => renderHeroMediaTag(homepage.hero))
      }
      // "What I do" specialism cards — previews pulled live from pieces.js.
      if (html.includes('<!-- homepage:specialisms -->')) {
        html = html.replace('<!-- homepage:specialisms -->', () => renderSpecialisms(pieces, homepage.specialisms))
      }
      return html
    },
  },
}

// Complete every page's <head> with the structural SEO tags (canonical, social
// card constants, twitter mirror) so they stay consistent and new pages get them
// for free. Per-page content (title/description/og:url) is still authored in the
// page itself; this only fills the derived/constant gaps. See src/build/seo.js.
const seoHead = {
  name: 'beansprout-seo-head',
  transformIndexHtml: {
    order: 'post',
    handler: (html) => injectSeoHead(html),
  },
}

// One shareable HTML page per portfolio piece at /portfolio/<slug>/ (the masonry
// tiles already link there). Rendered from pieces.js by src/build/piece-page.js.
// In dev we serve them from a middleware; at build we emit one HTML file each,
// pointing at the hashed main bundle (emitted assets skip Vite's HTML transform,
// so the renderer writes the whole document including SEO + nav status).
const pieceSlugs = new Set(pieces.map(p => p.slug))
const piecePages = {
  name: 'beansprout-piece-pages',
  configureServer(server) {
    server.middlewares.use(async (req, res, next) => {
      const m = /^\/portfolio\/([^/?#]+)\/?(?:[?#].*)?$/.exec(req.url || '')
      if (!m || !pieceSlugs.has(m[1])) return next()
      const { piece, prev, next: older } =
        piecePagesData(pieces).find(d => d.piece.slug === m[1])
      try {
        const html = await server.transformIndexHtml(
          req.url, renderPiecePage(piece, { prev, next: older }),
        )
        res.setHeader('Content-Type', 'text/html')
        res.end(html)
      } catch (e) { next(e) }
    })
  },
  generateBundle(_, bundle) {
    // Reference the exact hashed bundle the site ships: the shared chunk is
    // emitted as assets/main-<hash>.js (+ its main-<hash>.css). Match by filename
    // — order-independent and avoids the per-page facade chunks (home-*.js etc.)
    // that Vite eliminates before write.
    const jsFile  = Object.values(bundle).find(
      c => c.type === 'chunk' && /(^|\/)main-[\w-]+\.js$/.test(c.fileName),
    )
    const cssKey  = Object.keys(bundle).find(f => /(^|\/)main-[\w-]+\.css$/.test(f))
      || Object.keys(bundle).find(f => f.endsWith('.css'))
    const jsHref  = jsFile ? '/' + jsFile.fileName : '/src/js/main.js'
    const cssHref = cssKey ? '/' + cssKey : '/src/styles/main.css'
    for (const { piece, prev, next } of piecePagesData(pieces)) {
      this.emitFile({
        type: 'asset',
        fileName: `portfolio/${piece.slug}/index.html`,
        source: renderPiecePage(piece, { prev, next, cssHref, jsHref }),
      })
    }
  },
}

// Emit /sitemap.xml at build time and serve it from the dev server so it can be
// verified locally. Includes the per-piece portfolio routes. robots.txt is a
// static file in public/ (copied as-is).
const pieceRoutes = pieces.map(p => ({ path: `/portfolio/${p.slug}/`, priority: '0.6' }))
const allRoutes = [...ROUTES, ...pieceRoutes]
const sitemap = {
  name: 'beansprout-sitemap',
  configureServer(server) {
    server.middlewares.use((req, res, next) => {
      if (req.url === '/sitemap.xml') {
        res.setHeader('Content-Type', 'application/xml')
        res.end(renderSitemap(allRoutes))
        return
      }
      next()
    })
  },
  generateBundle() {
    this.emitFile({ type: 'asset', fileName: 'sitemap.xml', source: renderSitemap(allRoutes) })
  },
}

export default defineConfig({
  root: '.',
  plugins: [generatedGrids, seoHead, piecePages, sitemap],
  build: {
    outDir: 'dist',
    rollupOptions: {
      input: {
        home:     resolve(__dirname, 'index.html'),
        portfolio: resolve(__dirname, 'portfolio/index.html'),
        about:    resolve(__dirname, 'about/index.html'),
        aftercare: resolve(__dirname, 'aftercare/index.html'),
        enquire:  resolve(__dirname, 'enquire/index.html'),
        faq:      resolve(__dirname, 'faq/index.html'),
        visit:    resolve(__dirname, 'visit/index.html'),
        flash:    resolve(__dirname, 'flash/index.html'),
        services: resolve(__dirname, 'services/index.html'),
        received: resolve(__dirname, 'enquiry-received/index.html'),
        privacy:  resolve(__dirname, 'privacy/index.html'),
        terms:    resolve(__dirname, 'terms/index.html'),
        newsletter: resolve(__dirname, 'newsletter/index.html'),
        notfound: resolve(__dirname, '404.html'),
      }
    }
  },
  css: {
    devSourcemap: true
  }
})
