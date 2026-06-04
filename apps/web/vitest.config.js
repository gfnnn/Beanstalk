// Vitest config for the web workspace — kept separate from vite.config.js so the
// test run doesn't pull in the build-only `generatedGrids` plugin (which rewrites
// index.html markers). The default environment is Node: the build renderers/data
// are plain modules with no DOM. The three client-module suites that DO need a DOM
// (enquire/filter/loadmore) opt into jsdom per-file via a `// @vitest-environment
// jsdom` pragma, so only they pay for it — the pure suites stay on Node.
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.js'],
    coverage: {
      provider: 'v8',
      // src/build (renderers/seo/palette) and src/data (content contracts) are
      // pure Node modules the suites exercise directly. src/js/** is only partly
      // exercised (the browser-only paths — image downscale, GSAP, navigation —
      // need a real browser), so it's excluded so it doesn't skew the report as
      // mostly-uncovered until a browser/E2E tier exists.
      include: ['src/build/**', 'src/data/**'],
      reporter: ['text', 'html'],
    },
  },
})
