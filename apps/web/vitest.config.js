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
      // pure Node modules the suites exercise directly. The synchronous,
      // correctness-critical client modules (enquire, filter, loadmore, flash,
      // newsletter, faq, nav, aftercare, chip-overflow, analytics, and the
      // IntersectionObserver helpers sticky/media) are tested under jsdom, so
      // src/js/** is IN the report too — its number should reflect what those
      // suites actually cover.
      include: ['src/build/**', 'src/data/**', 'src/js/**'],
      // The genuinely browser-only code is excluded so it doesn't masquerade as
      // "untested logic": the orchestrator (main.js, wired together only in a real
      // page), the GSAP timelines / Lenis smooth-scroll (animations/lenis), and the
      // lightbox can't run under jsdom and are covered by the Playwright E2E tier
      // instead (see apps/web/e2e/ + .github/workflows/e2e.yml). Excluding them
      // keeps the headline honest: it measures code the unit tier CAN reach. The
      // browser-only paths still have a gate — it's just the E2E job, not this one.
      exclude: [
        'src/js/main.js',
        'src/js/modules/animations.js',
        'src/js/modules/lenis.js',
        'src/js/modules/lightbox.js',
      ],
      reporter: ['text', 'html'],
    },
  },
})
