// Vitest config for the web workspace — kept separate from vite.config.js so the
// test run doesn't pull in the build-only `generatedGrids` plugin (which rewrites
// index.html markers). Tests target Node: the build renderers are plain modules
// with no DOM, so jsdom isn't needed. Client-side modules under src/js/modules/
// are DOM/scroll-coupled and belong in a future browser/E2E tier.
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.js'],
    coverage: {
      provider: 'v8',
      // src/build (renderers/seo/palette) and src/data (content contracts) are
      // pure Node modules the suites exercise directly. src/js/** is DOM/scroll-
      // coupled and belongs in a future browser/E2E tier — excluded so it doesn't
      // skew the report as 0%-covered until that tier exists.
      include: ['src/build/**', 'src/data/**'],
      reporter: ['text', 'html'],
    },
  },
})
