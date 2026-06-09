// Portfolio filter bar — the mobile auto-hide on scroll. The unit tier drives the
// class-toggle logic under jsdom, but only a real browser exercises it with the
// bar actually `position: sticky`, real scroll (Lenis), and the CSS deciding the
// breakpoint. This guards the wiring against a CSS/JS drift that leaves the bar
// pinned over the grid on mobile, or hides it on desktop where it shouldn't.
import { test, expect } from '@playwright/test'
import { stubWorker } from './helpers.js'

test.describe('filter bar auto-hide (mobile)', () => {
  test.use({ viewport: { width: 390, height: 844 } }) // iPhone-ish portrait

  test.beforeEach(async ({ page }) => {
    await stubWorker(page)
    await page.goto('/portfolio/')
  })

  test('hides on scroll-down into the grid and reveals on scroll-up', async ({ page }) => {
    const bar = page.locator('#filter-bar')
    await expect(bar).not.toHaveClass(/bar-hidden/)

    // Scroll down well past the bar's resting position → it tucks away.
    await page.mouse.wheel(0, 900)
    await expect(bar).toHaveClass(/bar-hidden/)

    // Scroll back up → it comes straight back, re-anchored under the nav.
    await page.mouse.wheel(0, -300)
    await expect(bar).not.toHaveClass(/bar-hidden/)
  })
})

test.describe('filter bar auto-hide (desktop)', () => {
  test.use({ viewport: { width: 1280, height: 800 } })

  test('never hides on desktop, even after a long scroll', async ({ page }) => {
    await stubWorker(page)
    await page.goto('/portfolio/')

    const bar = page.locator('#filter-bar')
    await page.mouse.wheel(0, 1200)
    // Give the rAF-latched handler room to run, then assert it stayed put.
    await page.waitForTimeout(200)
    await expect(bar).not.toHaveClass(/bar-hidden/)
  })
})
