// Portfolio lightbox — a genuinely browser-only module (src/js/modules/lightbox.js)
// the jsdom unit tier can't reach: it opens on a tile click (intercepting the
// tile's link navigation), pulls the title/sub/counter from the clicked tile,
// pages prev/next (with the ends disabled), and closes on the ✕, the backdrop,
// and Escape — restoring body scroll. These are the interactions a regression
// would silently break.
import { test, expect } from '@playwright/test'
import { stubWorker } from './helpers.js'

test.beforeEach(async ({ page }) => {
  await stubWorker(page)
  await page.goto('/portfolio/')
})

test('opens on a tile click instead of navigating away', async ({ page }) => {
  const lightbox = page.locator('#lightbox')
  await expect(lightbox).not.toHaveClass(/open/)

  await page.locator('.masonry-tile').first().click()

  await expect(lightbox).toHaveClass(/open/)
  await expect(lightbox).toHaveAttribute('aria-hidden', 'false')
  await expect(page).toHaveURL(/\/portfolio\/$/)                 // didn't follow the tile link
  await expect(page.locator('#lightbox-title')).not.toBeEmpty()
  await expect(page.locator('#lightbox-counter')).toContainText('/')
  expect(await page.evaluate(() => document.body.style.overflow)).toBe('hidden')
})

test('the first tile disables Prev; Next advances and updates the counter', async ({ page }) => {
  await page.locator('.masonry-tile').first().click()

  await expect(page.locator('#lightbox-prev')).toBeDisabled()    // at the start
  await expect(page.locator('#lightbox-counter')).toContainText('01 /')

  await page.locator('#lightbox-next').click()
  await expect(page.locator('#lightbox-counter')).toContainText('02 /')
  await expect(page.locator('#lightbox-prev')).toBeEnabled()
})

test('ArrowRight / ArrowLeft page through, then Escape closes and restores scroll', async ({ page }) => {
  await page.locator('.masonry-tile').first().click()

  await page.keyboard.press('ArrowRight')
  await expect(page.locator('#lightbox-counter')).toContainText('02 /')
  await page.keyboard.press('ArrowLeft')
  await expect(page.locator('#lightbox-counter')).toContainText('01 /')

  await page.keyboard.press('Escape')
  await expect(page.locator('#lightbox')).not.toHaveClass(/open/)
  await expect(page.locator('#lightbox')).toHaveAttribute('aria-hidden', 'true')
  expect(await page.evaluate(() => document.body.style.overflow)).toBe('')
})

test('the close button dismisses the lightbox', async ({ page }) => {
  await page.locator('.masonry-tile').first().click()
  await expect(page.locator('#lightbox')).toHaveClass(/open/)
  await page.locator('#lightbox-close').click()
  await expect(page.locator('#lightbox')).not.toHaveClass(/open/)
})

test('keyboard: focus is trapped inside the open dialog and returned to the tile on close', async ({ page }) => {
  // aria-modal promises a trap: Tab must cycle within the dialog, never walk
  // into the scroll-locked page behind it.
  const firstTile = page.locator('.masonry-tile').first()
  await firstTile.click()
  await expect(page.locator('#lightbox')).toHaveClass(/open/)

  // Tab forward more times than the dialog has controls — focus must stay inside.
  for (let i = 0; i < 8; i++) {
    await page.keyboard.press('Tab')
    expect(await page.evaluate(() =>
      document.getElementById('lightbox').contains(document.activeElement),
    )).toBe(true)
  }

  // Closing hands focus back to the element that opened the dialog (the tile),
  // not <body> — `inert` on a focused subtree would otherwise strand keyboard
  // users at the top of the page.
  await page.keyboard.press('Escape')
  await expect(page.locator('#lightbox')).not.toHaveClass(/open/)
  expect(await page.evaluate(() =>
    document.activeElement?.classList.contains('masonry-tile'),
  )).toBe(true)
})
