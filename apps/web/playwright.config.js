// Playwright config for the web workspace's end-to-end / smoke tier.
//
// This tier is deliberately separate from the Vitest unit suites (tests/**):
// Vitest covers the pure renderers/data and the synchronous client-module logic
// under jsdom; Playwright covers what jsdom CAN'T — the genuinely browser-only
// paths (the portfolio lightbox, the enquiry image preview + downscale, the
// mobile nav drawer) and a whole-site smoke sweep that catches a broken bundle,
// a missing asset, or a page that throws on load before it ships.
//
// It runs against the REAL production build (`vite build` → `vite preview`), not
// the dev server, so it guards exactly the artifact that deploys to GitHub Pages.
// The forms' Cloudflare Worker is never hit — specs stub `*.workers.dev` (see
// e2e/helpers.js), so the suite is hermetic and offline.
//
// NOTE: the browser binary is downloaded by `npx playwright install chromium`,
// which needs network access to the Playwright CDN. CI does this; some sandboxes
// block that host, in which case the suite is authored/listed but not executed
// there — run it locally or in CI.
import { defineConfig, devices } from '@playwright/test'

const PORT = 4173
const baseURL = `http://localhost:${PORT}`

export default defineConfig({
  testDir: './e2e',
  testMatch: '**/*.spec.js',
  // Unit specs live in tests/ and are owned by Vitest — keep Playwright out of them.
  fullyParallel: true,
  forbidOnly: !!process.env.CI,   // a stray test.only fails CI rather than silently narrowing the run
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? [['html', { open: 'never' }], ['list']] : 'list',

  use: {
    baseURL,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },

  projects: [
    // Chromium-only by default: a smoke/E2E tier wants fast, stable signal, not a
    // cross-browser matrix. Add firefox/webkit projects here if real cross-browser
    // coverage is ever needed.
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  ],

  // Build the site and serve the built dist, exactly as deployed. Playwright waits
  // for the server to answer before the suite starts, and (locally) reuses one
  // that's already up so the build isn't repeated on every run.
  webServer: {
    command: `npm run build && npm run preview -- --port ${PORT} --strictPort`,
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
})
