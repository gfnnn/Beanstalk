import { defineConfig } from 'vite'
import { resolve } from 'path'
import { pieces } from './src/data/pieces.js'
import { renderPortfolioTiles } from './src/build/portfolio-tiles.js'
import { flash } from './src/data/flash.js'
import { renderFlashCards, renderFlashDrop } from './src/build/flash-cards.js'
import { injectSeoHead, renderSitemap, ROUTES } from './src/build/seo.js'
import { renderNewsletterInline } from './src/build/newsletter-inline.js'
import { renderPiecePage, piecePagesData } from './src/build/piece-page.js'
import { testimonials } from './src/data/testimonials.js'
import { renderTestimonials } from './src/build/testimonials.js'
import { homepage } from './src/data/homepage.js'
import {
  renderStatus, renderNotices,
  renderHeroEyebrow, renderHeroHeadline, renderHeroBody, renderHeroMediaTag,
  renderVideoCredit,
} from './src/build/homepage.js'
import { media } from './src/data/media.js'
import { renderHeroMedia } from './src/build/media.js'
import { renderSpecialisms } from './src/build/specialisms.js'
import { renderPaletteStyle, themeColor } from './src/build/palette.js'
import { renderSecurityMeta } from './src/build/security.js'

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
      // The current drop number in the /flash/ page eyebrow — derived from the
      // highest `drop` in flash.js so it tracks the cards (the season stays authored).
      if (html.includes('<!-- flash:drop -->')) {
        html = html.replace('<!-- flash:drop -->', () => renderFlashDrop(flash))
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
      if (html.includes('<!-- homepage:video-credit -->')) {
        html = html.replace('<!-- homepage:video-credit -->', () => renderVideoCredit(homepage.videoCredit))
      }
      // The two hero clips — homepage + About — both rendered by the SAME
      // component (src/build/media.js), differing only by which placeholder
      // shows while the clip is off. Each falls back to its placeholder until the
      // slot's show:true; markers live on one page each, so other pages pass through.
      if (html.includes('<!-- homepage:hero-media -->')) {
        html = html.replace('<!-- homepage:hero-media -->', () => renderHeroMedia(media.hero, { variant: 'hero' }))
      }
      if (html.includes('<!-- about:hero-media -->')) {
        html = html.replace('<!-- about:hero-media -->', () => renderHeroMedia(media.aboutHero, { variant: 'about' }))
      }
      // "What I do" specialism cards — previews pulled live from pieces.js.
      if (html.includes('<!-- homepage:specialisms -->')) {
        html = html.replace('<!-- homepage:specialisms -->', () => renderSpecialisms(pieces, homepage.specialisms))
      }
      return html
    },
  },
}

// Inject the active colour palette (src/data/palette.js) as CSS custom properties
// into every page's <head>, in dev AND build, so the whole site's colours come
// from that one content file. Also points the theme-color meta at the palette
// background. Idempotent: piece pages render their own <head> (with the palette
// already in it), so the `id="palette"` guard stops a double-inject in dev.
const palette = {
  name: 'beansprout-palette',
  transformIndexHtml: {
    order: 'pre',
    handler(html) {
      if (!html.includes('id="palette"')) {
        html = html.replace('</head>', `  ${renderPaletteStyle()}\n</head>`)
      }
      return html.replace(
        /(<meta\s+name=["']theme-color["']\s+content=)["'][^"']*["']/i,
        `$1"${themeColor}"`,
      )
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

// Inject the Content-Security-Policy + Referrer-Policy <meta> tags into every
// page's <head>, just before </head> so they govern all body scripts/fetches.
// BUILD/preview only (apply:'build') — the dev server's HMR client needs inline
// scripts/eval/ws that a strict CSP would break. The per-piece pages bypass this
// transform, so they get the same tags passed into renderPiecePage below. See
// src/build/security.js for the directive rationale and the Pages limitations.
const securityHeaders = {
  name: 'beansprout-security-headers',
  apply: 'build',
  transformIndexHtml: {
    order: 'post',
    handler(html) {
      if (html.includes('http-equiv="Content-Security-Policy"')) return html
      return html.replace('</head>', `  ${renderSecurityMeta()}\n</head>`)
    },
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
    // These pages skip the securityHeaders plugin's transform (emitted assets
    // bypass transformIndexHtml), so hand them the same CSP/Referrer meta here —
    // build only, matching the plugin's apply:'build'. Dev serves them without it.
    const securityMeta = renderSecurityMeta()
    for (const { piece, prev, next } of piecePagesData(pieces)) {
      this.emitFile({
        type: 'asset',
        fileName: `portfolio/${piece.slug}/index.html`,
        source: renderPiecePage(piece, { prev, next, cssHref, jsHref, securityMeta }),
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
  plugins: [palette, generatedGrids, seoHead, securityHeaders, piecePages, sitemap],
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
