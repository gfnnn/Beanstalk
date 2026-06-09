// Filter-bar mobile collapse — the "Filters" toggle (modules/filter-collapse.js),
// shared by the portfolio and flash pages. The unit tier covers the class/aria
// logic under jsdom; only a real browser confirms the CSS actually collapses the
// bar on a narrow viewport and shows it on desktop. This is deterministic (a tap,
// not inferred from scroll), so there's no mobile-toolbar flakiness to fight.
import { test, expect } from '@playwright/test'
import { stubWorker } from './helpers.js'

const PAGES = ['/portfolio/', '/flash/']

test.describe('mobile — bar collapses behind a "Filters" toggle', () => {
  test.use({ viewport: { width: 390, height: 844 } }) // iPhone-ish portrait

  for (const path of PAGES) {
    test(`${path} filter bar`, async ({ page }) => {
      await stubWorker(page)
      await page.goto(path)

      const bar    = page.locator('#filter-bar')
      const toggle = page.locator('#filter-toggle')
      const chips  = page.locator('#filter-bar .filter-chips')

      // Collapsed by default: the trigger shows, the chips are hidden.
      await expect(toggle).toBeVisible()
      await expect(chips).toBeHidden()
      await expect(bar).not.toHaveClass(/filters-open/)
      await expect(toggle).toHaveAttribute('aria-expanded', 'false')

      // Tap → expands.
      await toggle.click()
      await expect(bar).toHaveClass(/filters-open/)
      await expect(chips).toBeVisible()
      await expect(toggle).toHaveAttribute('aria-expanded', 'true')

      // Tap again → collapses.
      await toggle.click()
      await expect(bar).not.toHaveClass(/filters-open/)
      await expect(chips).toBeHidden()
    })
  }
})

test.describe('desktop — full bar shown, no toggle', () => {
  test.use({ viewport: { width: 1280, height: 800 } })

  for (const path of PAGES) {
    test(`${path} filter bar`, async ({ page }) => {
      await stubWorker(page)
      await page.goto(path)

      await expect(page.locator('#filter-toggle')).toBeHidden()
      await expect(page.locator('#filter-bar .filter-chips')).toBeVisible()
    })
  }
})
