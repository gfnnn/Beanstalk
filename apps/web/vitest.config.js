// Vitest config for the web workspace — kept separate from vite.config.js so the
// test run doesn't pull in the build-only `generatedGrids` plugin (which rewrites
// index.html markers). The default environment is Node: the build renderers/data
// are plain modules with no DOM. The client-module suites that DO need a DOM
// (enquire/filter/loadmore/flash/newsletter/faq/nav) opt into jsdom per-file via a
// `// @vitest-environment jsdom` pragma, so only they pay for it — the pure suites
// stay on Node.
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.js'],
    coverage: {
      provider: 'v8',
      // src/build (renderers/seo/palette) and src/data (content contracts) are
      // pure Node modules the suites exercise directly. src/js/** is only PARTLY
      // exercisable here: the synchronous, correctness-critical modules (enquire,
      // filter, loadmore, flash, newsletter, faq, nav, aftercare, chip-overflow,
      // and the IntersectionObserver helpers sticky/media) are tested under jsdom,
      // but the irreducibly browser-only paths — image downscale, GSAP/smooth-
      // scroll (animations/lenis), the lightbox — need a real browser and live in
      // the Playwright E2E tier. So src/js/** is excluded from the headline report
      // so those unavoidable gaps don't skew it.
      include: ['src/build/**', 'src/data/**'],
      reporter: ['text', 'html'],
    },
  },
})
