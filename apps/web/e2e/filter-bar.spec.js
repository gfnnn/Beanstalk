// Filter bar auto-hide on scroll — shared by the portfolio and flash pages, which
// use the same `.filter-bar` markup (driven by filter.js and flash.js, both wiring
// the modules/scroll-hide.js helper). The unit tier drives the class-toggle logic
// under jsdom; only a real browser exercises it with the bar actually `position:
// sticky`, the real CSS transform, and the media query deciding the breakpoint.
// This guards against a CSS/JS drift that leaves the bar pinned over the grid on
// mobile, or hides it on desktop where it shouldn't — and that the pages stay uniform.
//
// We run under `reducedMotion: 'reduce'` on purpose: that disables Lenis smooth
// scroll (lenis.js bails on that query), so we can drive native `window.scrollTo`
// deterministically instead of fighting Lenis's rAF-animated virtual scroll, which
// a synthetic wheel can't move reliably in headless Chromium. The behaviour under
// test — toggling `.bar-hidden` from `window.scrollY` — is motion-independent; only
// the slide's animation (not whether it happens) is governed by reduced-motion.
import { test, expect } from '@playwright/test'
import { stubWorker } from './helpers.js'

const PAGES = ['/portfolio/', '/flash/']

const scrollTo = (page, y) => page.evaluate(n => window.scrollTo(0, n), y)

test.describe('mobile — hides on scroll-down into the grid, reveals on scroll-up', () => {
  test.use({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' }) // iPhone-ish portrait

  for (const path of PAGES) {
    test(`${path} filter bar`, async ({ page }) => {
      await stubWorker(page)
      await page.goto(path)

      const bar = page.locator('#filter-bar')
      await expect(bar).not.toHaveClass(/bar-hidden/)

      // Scroll down to the bottom, well past the bar's resting position → it tucks away.
      await scrollTo(page, await page.evaluate(() => document.body.scrollHeight))
      await expect(bar).toHaveClass(/bar-hidden/)
      // …and the CSS transform really slid it clear of the viewport (bottom edge ≤ top).
      const box = await bar.boundingBox()
      expect(box.y + box.height).toBeLessThanOrEqual(1)

      // Scroll back up → it comes straight back, re-anchored under the nav.
      await scrollTo(page, 150)
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
      await scrollTo(page, await page.evaluate(() => document.body.scrollHeight))
      // Give the rAF-latched handler room to run, then assert it stayed put.
      await page.waitForTimeout(200)
      await expect(bar).not.toHaveClass(/bar-hidden/)
    })
  }
})
