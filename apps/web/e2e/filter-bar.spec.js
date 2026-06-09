// Filter bar auto-hide on scroll — shared by the portfolio and flash pages, which
// use the same `.filter-bar` markup (driven by filter.js and flash.js, both wiring
// the modules/scroll-hide.js helper). The unit tier drives the class-toggle logic
// under jsdom; only a real browser exercises it with the bar actually `position:
// sticky`, the real CSS transform, and the media query deciding the breakpoint.
// This guards against a CSS/JS drift that leaves the bar pinned over the grid on
// mobile, or hides it on desktop where it shouldn't — and that the pages stay uniform.
//
// We run under `reducedMotion: 'reduce'` on purpose: that disables Lenis smooth
// scroll (lenis.js bails on that query), so the native scroll position we set with
// `window.scrollTo` sticks instead of being animated back by Lenis's rAF loop. We
// also dispatch the scroll event explicitly: the helper is rAF-latched and reads
// window.scrollY, so this drives it deterministically without depending on how a
// synthetic wheel propagates through headless Chromium. The behaviour under test —
// toggling `.bar-hidden` from the real scroll position — is motion-independent.
import { test, expect } from '@playwright/test'
import { stubWorker } from './helpers.js'

const PAGES = ['/portfolio/', '/flash/']

// Set the real scroll position and notify listeners (Lenis is off under reduced motion).
const scrollWindow = (page, y) =>
  page.evaluate(n => { window.scrollTo(0, n); window.dispatchEvent(new Event('scroll')) }, y)

test.describe('mobile — hides on scroll-down into the grid, reveals on scroll-up', () => {
  test.use({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' }) // iPhone-ish portrait

  for (const path of PAGES) {
    test(`${path} filter bar`, async ({ page }) => {
      await stubWorker(page)
      await page.goto(path)

      const bar = page.locator('#filter-bar')
      await expect(bar).not.toHaveClass(/bar-hidden/)

      // Scroll down to the bottom (well past the bar's pin point) → it tucks away.
      await scrollWindow(page, 100000)
      await expect(bar).toHaveClass(/bar-hidden/)
      // …and the CSS transform actually pulls the bar up out of view: its top edge
      // ends above the viewport (it sat at +nav-height when pinned/shown). Polled so
      // we don't race the slide — the transform settles the top to roughly -height.
      await expect.poll(async () => (await bar.boundingBox())?.y ?? 0).toBeLessThan(0)

      // A tiny upward wobble (momentum bounce / address-bar reveal) must NOT pop the
      // bar back over the grid — only a sustained scroll-up should. Nudge a few px up
      // from the clamped bottom and confirm it stays tucked away.
      const atBottom = await page.evaluate(() => window.scrollY)
      await scrollWindow(page, atBottom - 6)
      await page.waitForTimeout(100)
      await expect(bar).toHaveClass(/bar-hidden/)

      // Scroll back up → it comes straight back, re-anchored under the nav.
      await scrollWindow(page, 150)
      await expect(bar).not.toHaveClass(/bar-hidden/)
    })
  }
})

test.describe('desktop — never hides, even after a long scroll', () => {
  test.use({ viewport: { width: 1280, height: 800 }, reducedMotion: 'reduce' })

  for (const path of PAGES) {
    test(`${path} filter bar`, async ({ page }) => {
      await stubWorker(page)
      await page.goto(path)

      const bar = page.locator('#filter-bar')
      await scrollWindow(page, 100000)
      // Give the rAF-latched handler room to run, then assert it stayed put.
      await page.waitForTimeout(200)
      await expect(bar).not.toHaveClass(/bar-hidden/)
    })
  }
})
