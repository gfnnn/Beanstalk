import { defineConfig } from 'vite'
import { resolve } from 'path'
import { pieces } from './src/data/pieces.js'
import { renderPortfolioTiles } from './src/build/portfolio-tiles.js'
import { flash } from './src/data/flash.js'
import { renderFlashCards } from './src/build/flash-cards.js'
import { injectSeoHead, renderSitemap } from './src/build/seo.js'
import { homepage } from './src/data/homepage.js'
import {
  renderStatus, renderNotices,
  renderHeroEyebrow, renderHeroHeadline, renderHeroBody, renderHeroMediaTag,
} from './src/build/homepage.js'

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

// Emit /sitemap.xml at build time and serve it from the dev server so it can be
// verified locally. robots.txt is a static file in public/ (copied as-is).
const sitemap = {
  name: 'beansprout-sitemap',
  configureServer(server) {
    server.middlewares.use((req, res, next) => {
      if (req.url === '/sitemap.xml') {
        res.setHeader('Content-Type', 'application/xml')
        res.end(renderSitemap())
        return
      }
      next()
    })
  },
  generateBundle() {
    this.emitFile({ type: 'asset', fileName: 'sitemap.xml', source: renderSitemap() })
  },
}

export default defineConfig({
  root: '.',
  plugins: [generatedGrids, seoHead, sitemap],
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
