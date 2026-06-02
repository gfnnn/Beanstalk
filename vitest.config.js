// Vitest config — kept separate from vite.config.js so the test run doesn't pull
// in the build-only `generatedGrids` plugin (which rewrites index.html markers).
// Tests target Node: the build renderers and the Netlify functions are plain
// modules with no DOM, so jsdom isn't needed. Client-side modules under
// src/js/modules/ are DOM/scroll-coupled and belong in a future browser/E2E tier.
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.js'],
    coverage: {
      provider: 'v8',
      include: ['src/build/**', 'netlify/functions/**'],
      reporter: ['text', 'html'],
    },
  },
})
