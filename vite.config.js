import { defineConfig } from 'vite'
import { resolve } from 'path'
import { pieces } from './src/data/pieces.js'
import { renderPortfolioTiles } from './src/build/portfolio-tiles.js'

// Generate the portfolio masonry tiles from src/data/pieces.js (single source of
// truth) and inject them into the `<!-- pieces:masonry -->` marker. Runs in dev
// and build via transformIndexHtml, so tiles ship as static HTML. The marker only
// exists on portfolio/index.html, so every other page passes through untouched.
const portfolioTiles = {
  name: 'beansprout-portfolio-tiles',
  transformIndexHtml: {
    order: 'pre',
    handler(html) {
      if (!html.includes('<!-- pieces:masonry -->')) return html
      return html.replace('<!-- pieces:masonry -->', () => renderPortfolioTiles(pieces))
    },
  },
}

export default defineConfig({
  root: '.',
  plugins: [portfolioTiles],
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
      }
    }
  },
  css: {
    devSourcemap: true
  }
})
