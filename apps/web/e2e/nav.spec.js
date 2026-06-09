// Navigation — the mobile drawer and the desktop "More" dropdown. The unit tier
// drives these under jsdom, but only a real browser exercises them at an actual
// viewport with the real CSS deciding which control is shown (hamburger on mobile,
// dropdown on desktop). This guards the wiring against a CSS/JS drift that hides a
// control or leaves the body scroll-locked after close.
import { test, expect } from '@playwright/test'
import { stubWorker } from './helpers.js'

test.describe('mobile drawer', () => {
  test.use({ viewport: { width: 390, height: 844 } }) // iPhone-ish portrait

  test.beforeEach(async ({ page }) => {
    await stubWorker(page)
    await page.goto('/')
  })

  test('hamburger opens the drawer and locks body scroll; Escape closes and restores it', async ({ page }) => {
    const drawer = page.locator('#nav-drawer')
    await expect(drawer).not.toHaveClass(/open/)

    await page.locator('#nav-hamburger').click()
    await expect(drawer).toHaveClass(/open/)
    await expect(drawer).toHaveAttribute('aria-hidden', 'false')
    await expect(page.locator('#nav-hamburger')).toHaveAttribute('aria-expanded', 'true')
    expect(await page.evaluate(() => document.body.style.overflow)).toBe('hidden')

    await page.keyboard.press('Escape')
    await expect(drawer).not.toHaveClass(/open/)
    expect(await page.evaluate(() => document.body.style.overflow)).toBe('')
  })

  test('a second hamburger tap closes the drawer', async ({ page }) => {
    const burger = page.locator('#nav-hamburger')
    await burger.click()
    await expect(page.locator('#nav-drawer')).toHaveClass(/open/)
    await burger.click()
    await expect(page.locator('#nav-drawer')).not.toHaveClass(/open/)
  })

  test('following a drawer link navigates and lands on a fresh, closed drawer', async ({ page }) => {
    await page.locator('#nav-hamburger').click()
    await page.locator('#nav-drawer a[href="/portfolio/"]').first().click()
    await expect(page).toHaveURL(/\/portfolio\/$/)
    // The drawer is deliberately left open through the navigation (so the page
    // cross-fade carries the menu out in one motion rather than collapsing it
    // first); the destination is a fresh document, so it loads with the drawer
    // closed and the body scroll-lock cleared.
    await expect(page.locator('#nav-drawer')).not.toHaveClass(/open/)
    expect(await page.evaluate(() => document.body.style.overflow)).toBe('')
  })
})

test.describe('desktop "More" dropdown', () => {
  test.use({ viewport: { width: 1280, height: 800 } })

  test('toggles open on the trigger and closes on an outside click', async ({ page }) => {
    await stubWorker(page)
    await page.goto('/')

    const moreBtn = page.locator('#nav-more-btn')
    // The dropdown only exists when the nav overflows into it; guard so the spec
    // stays valid if the nav layout changes.
    test.skip(!(await moreBtn.isVisible()), 'no overflow "More" dropdown in this layout')

    await moreBtn.click()
    await expect(page.locator('#nav-more')).toHaveClass(/open/)
    await expect(moreBtn).toHaveAttribute('aria-expanded', 'true')

    await page.locator('main, body').first().click({ position: { x: 5, y: 5 } })
    await expect(page.locator('#nav-more')).not.toHaveClass(/open/)
  })
})
