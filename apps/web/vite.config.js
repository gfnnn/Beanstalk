import { defineConfig } from 'vite'
import { resolve } from 'path'
import { pieces } from './src/data/pieces.js'
import { renderPortfolioTiles } from './src/build/portfolio-tiles.js'
import { flash, season } from './src/data/flash.js'
import { renderFlashCards, renderFlashDrop, renderFlashSeason } from './src/build/flash-cards.js'
import { injectSeoHead, injectStagingNoindex, isProductionBuild, ROBOTS_NOINDEX, renderRobots, renderSitemap, ROUTES } from './src/build/seo.js'
import { renderNewsletterInline } from './src/build/newsletter-inline.js'
import { replyTime } from './src/data/business.js'
import { renderReplyTime } from './src/build/business.js'
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
import { renderFaviconSvg, renderMarkSvg } from './src/build/favicon.js'
import { renderSecurityMeta } from './src/build/security.js'
import { injectPageLoader } from './src/build/loader.js'
import { injectViewTransition } from './src/build/transition.js'

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
      // highest `drop` in flash.js so it tracks the cards.
      if (html.includes('<!-- flash:drop -->')) {
        html = html.replace('<!-- flash:drop -->', () => renderFlashDrop(flash))
      }
      // The current drop's season label, beside the number — authored in flash.js
      // (`season`) so the editorial text is a single source of truth, not hand-edited HTML.
      if (html.includes('<!-- flash:season -->')) {
        html = html.replace('<!-- flash:season -->', () => renderFlashSeason(season))
      }
      // The enquiry reply-time promise — authored once in src/data/business.js
      // (`replyTime`) and shown mid-sentence on /enquire/ and /enquiry-received/,
      // so the two pages can't drift on the turnaround they advertise.
      if (html.includes('<!-- reply-time -->')) {
        html = html.replace('<!-- reply-time -->', () => renderReplyTime(replyTime))
      }
      // Inline newsletter-capture band (homepage / flash / post-enquiry).
      if (html.includes('<!-- newsletter:inline -->')) {
        html = html.replace('<!-- newsletter:inline -->', () => renderNewsletterInline())
      }
      // Homepage testimonials (src/data/testimonials.js).
      if (html.includes('<!-- testimonials -->')) {
        html = html.replace('<!-- testimonials -->', () => renderTestimonials(testimonials))
      }
      // The brand mark (the traced sprig, src/build/favicon.js) — the nav lockup
      // on EVERY page, plus the /enquiry-received/ confirmation mark, hence
      // replaceAll (that page carries two markers).
      if (html.includes('<!-- brand:mark -->')) {
        html = html.replaceAll('<!-- brand:mark -->', () => renderMarkSvg())
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
// background, and emits the palette-coloured /favicon.svg (src/build/favicon.js
// — the SVG favicon is generated, not a public/ file, so a palette switch
// recolours it too; the raster icons stay static in public/). Idempotent: piece
// pages render their own <head> (with the palette already in it), so the
// `id="palette"` guard stops a double-inject in dev.
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
  configureServer(server) {
    server.middlewares.use((req, res, next) => {
      if ((req.url || '').split(/[?#]/)[0] !== '/favicon.svg') return next()
      res.setHeader('Content-Type', 'image/svg+xml')
      res.end(renderFaviconSvg())
    })
  },
  generateBundle() {
    this.emitFile({ type: 'asset', fileName: 'favicon.svg', source: renderFaviconSvg() })
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
    // Structural SEO tags, then the staging noindex (a no-op on the apex build —
    // see isProductionBuild in src/build/seo.js).
    handler: (html) => injectStagingNoindex(injectSeoHead(html)),
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

// Inject the full-page preloader — the critical <style> into <head> and the
// overlay markup right after <body> — into every page, in dev AND build, so the
// slow CSS/font arrival never shows as a flash of unstyled content (the reported
// iPad case). Runs late (order:'post') and is idempotent: the per-piece pages
// render their own copy (they bypass this transform), so the guards in
// injectPageLoader stop a double-inject when the dev middleware re-runs the
// transform over them. See src/build/loader.js + src/js/modules/loader.js.
const pageLoader = {
  name: 'beansprout-page-loader',
  transformIndexHtml: {
    order: 'post',
    handler: html => injectPageLoader(html),
  },
}

// Inline the cross-document View Transition opt-in into every page's <head> (dev
// AND build), so the browser arms the transition from the first parsed bytes
// rather than after the main.css → atmosphere.css @import waterfall — a late
// opt-in lets a slow inbound render skip the cross-fade (a hard cut, the
// AbortError modules/loader.js swallows). The per-piece pages bypass this
// transform and carry their own copy via piece-page.js; the id guard makes the
// dev re-run idempotent. See src/build/transition.js.
const viewTransition = {
  name: 'beansprout-view-transition',
  transformIndexHtml: {
    order: 'post',
    handler: html => injectViewTransition(html),
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
    // Emitted assets bypass the seoHead transform too, so apply the same staging
    // noindex here (no-op on the apex build).
    const robotsMeta = isProductionBuild() ? '' : ROBOTS_NOINDEX
    for (const { piece, prev, next } of piecePagesData(pieces)) {
      this.emitFile({
        type: 'asset',
        fileName: `portfolio/${piece.slug}/index.html`,
        source: renderPiecePage(piece, { prev, next, cssHref, jsHref, securityMeta, robotsMeta }),
      })
    }
  },
}

// Emit robots.txt and /sitemap.xml. robots.txt is generated (not a static
// public/ file) so it can be staging-aware: a production (apex) build allows
// crawling and advertises the sitemap, while a staging build (no apex CNAME —
// the GitHub Pages preview or the Cloudflare Pages dev environment from
// `develop`) blocks every crawler and emits NO sitemap, so the pre-launch copy
// carries no real-life SEO artifacts (no real-URL sitemap, no crawl invite).
// Both are served from the dev server too so they can be verified locally.
// The sitemap includes the per-piece portfolio routes.
const pieceRoutes = pieces.map(p => ({ path: `/portfolio/${p.slug}/`, priority: '0.6' }))
const allRoutes = [...ROUTES, ...pieceRoutes]
const sitemap = {
  name: 'beansprout-sitemap',
  configureServer(server) {
    server.middlewares.use((req, res, next) => {
      if (req.url === '/robots.txt') {
        res.setHeader('Content-Type', 'text/plain')
        res.end(renderRobots())
        return
      }
      if (req.url === '/sitemap.xml') {
        res.setHeader('Content-Type', 'application/xml')
        res.end(renderSitemap(allRoutes))
        return
      }
      next()
    })
  },
  generateBundle() {
    this.emitFile({ type: 'asset', fileName: 'robots.txt', source: renderRobots() })
    // Staging emits no sitemap — robots.txt blocks crawlers and a sitemap would
    // only publish the real apex URLs onto the pre-launch copy.
    if (isProductionBuild()) {
      this.emitFile({ type: 'asset', fileName: 'sitemap.xml', source: renderSitemap(allRoutes) })
    }
  },
}

export default defineConfig({
  root: '.',
  plugins: [palette, generatedGrids, seoHead, securityHeaders, pageLoader, viewTransition, piecePages, sitemap],
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
