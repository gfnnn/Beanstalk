// The cold-load preloader's font wait, in a real browser (jsdom has no
// FontFaceSet, so tests/loader.test.js can only mock document.fonts.load).
//
// The cover lifts once the KEY fonts have loaded (KEY_FONTS in
// src/js/modules/loader.js) and deliberately does not wait for Fraunces italic.
// Both halves are checked by holding one font request open:
//   • italic held  → the page is still revealed promptly;
//   • a key font held → the cover stays, until the 3s ceiling lifts it anyway.
// `html.page-loaded` is set the moment the cover starts to lift, so it is the
// signal read here (the overlay node itself goes ~0.5s later, after its fade).
import { test, expect } from '@playwright/test'
import { stubWorker } from './helpers.js'

const revealed = page => page.evaluate(() => document.documentElement.classList.contains('page-loaded'))

// Leave matching requests pending for the life of the page.
const hold = (page, glob) => page.route(glob, () => {})

test('the page is revealed without waiting for the italic font', async ({ page }) => {
  await stubWorker(page)
  await hold(page, '**/fonts/fraunces-italic-latin.woff2')
  await page.goto('/', { waitUntil: 'domcontentloaded' })

  // Well inside the 3s ceiling: this is the key fonts arriving, not the backstop.
  await expect.poll(() => revealed(page), { timeout: 2000 }).toBe(true)
  await expect(page.locator('#page-loader')).toHaveCount(0)
  await expect(page.locator('h1').first()).toBeVisible()
})

test('the cover waits for a key font, and the ceiling still frees the page', async ({ page }) => {
  await stubWorker(page)
  await hold(page, '**/fonts/karla-latin.woff2')
  await page.goto('/', { waitUntil: 'domcontentloaded' })

  await page.waitForTimeout(1500)
  expect(await revealed(page)).toBe(false) // body font still loading → still covered

  await expect.poll(() => revealed(page), { timeout: 4000 }).toBe(true) // the 3s ceiling
  await expect(page.locator('#page-loader')).toHaveCount(0)
})
