// Filter bar auto-hide on scroll — shared by the portfolio and flash pages, which
// use the same `.filter-bar` markup (driven by filter.js and flash.js, both wiring
// the modules/scroll-hide.js helper). The unit tier drives the class-toggle logic
// under jsdom; only a real browser exercises it with the bar actually `position:
// sticky`, real scroll (Lenis), and the CSS deciding the mobile breakpoint. This
// guards against a CSS/JS drift that leaves the bar pinned over the grid on mobile,
// or hides it on desktop where it shouldn't — and that the two pages stay uniform.
import { test, expect } from '@playwright/test'
import { stubWorker } from './helpers.js'

const PAGES = ['/portfolio/', '/flash/']

test.describe('mobile — hides on scroll-down into the grid, reveals on scroll-up', () => {
  test.use({ viewport: { width: 390, height: 844 } }) // iPhone-ish portrait

  for (const path of PAGES) {
    test(`${path} filter bar`, async ({ page }) => {
      await stubWorker(page)
      await page.goto(path)

      const bar = page.locator('#filter-bar')
      await expect(bar).not.toHaveClass(/bar-hidden/)

      // Scroll down well past the bar's resting position → it tucks away.
      await page.mouse.wheel(0, 900)
      await expect(bar).toHaveClass(/bar-hidden/)

      // Scroll back up → it comes straight back, re-anchored under the nav.
      await page.mouse.wheel(0, -300)
      await expect(bar).not.toHaveClass(/bar-hidden/)
    })
  }
})

test.describe('desktop — never hides, even after a long scroll', () => {
  test.use({ viewport: { width: 1280, height: 800 } })

  for (const path of PAGES) {
    test(`${path} filter bar`, async ({ page }) => {
      await stubWorker(page)
      await page.goto(path)

      const bar = page.locator('#filter-bar')
      await page.mouse.wheel(0, 1200)
      // Give the rAF-latched handler room to run, then assert it stayed put.
      await page.waitForTimeout(200)
      await expect(bar).not.toHaveClass(/bar-hidden/)
    })
  }
})
