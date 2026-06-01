import { defineConfig } from 'vite'
import { resolve } from 'path'
import { pieces } from './src/data/pieces.js'
import { renderPortfolioTiles } from './src/build/portfolio-tiles.js'
import { flash } from './src/data/flash.js'
import { renderFlashCards } from './src/build/flash-cards.js'

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
      return html
    },
  },
}

export default defineConfig({
  root: '.',
  plugins: [generatedGrids],
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
