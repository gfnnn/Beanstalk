// Flash page — the two things only a real browser proves (the claim submit
// success/409/error branches are already exhaustively covered in the jsdom unit
// tier, so they're not repeated here):
//   1. the claim modal's real open/close (the requestAnimationFrame `.open`
//      transition + body scroll-lock that jsdom can't run faithfully), and
//   2. the live-availability reconcile — the page fetches /flash-status on load
//      and overlays any piece claimed since the build onto the static grid.
// The Worker is stubbed, so we control the claim map without a real backend.
import { test, expect } from '@playwright/test'
import { stubWorker } from './helpers.js'

const availableCard = page => page.locator('.flash-card:has(.claim-btn[data-piece])').first()

test('opens the claim modal from an available card and closes on Escape', async ({ page }) => {
  await stubWorker(page)
  await page.goto('/flash/')

  const btn = availableCard(page).locator('.claim-btn[data-piece]')
  const piece = await btn.getAttribute('data-piece')
  await btn.click()

  const modal = page.locator('#claim-modal')
  await expect(modal).toBeVisible()
  await expect(modal).toHaveClass(/open/)                       // the rAF-added open state
  await expect(page.locator('#modal-piece-name')).toHaveText(piece)
  await expect(page.locator('#modal-piece-input')).toHaveValue(piece)
  expect(await page.evaluate(() => document.body.style.overflow)).toBe('hidden')

  await page.keyboard.press('Escape')
  await expect(modal).not.toHaveClass(/open/)
})

test('the cancel button dismisses the modal', async ({ page }) => {
  await stubWorker(page)
  await page.goto('/flash/')
  await availableCard(page).locator('.claim-btn[data-piece]').click()
  await expect(page.locator('#claim-modal')).toHaveClass(/open/)
  await page.locator('#modal-cancel').click()
  await expect(page.locator('#claim-modal')).not.toHaveClass(/open/)
})

test('reconciles live availability — a piece claimed since the build shows claimed', async ({ page }) => {
  // First load with an empty claim map to read a real available card's id.
  await stubWorker(page)
  await page.goto('/flash/')
  const id = await availableCard(page).getAttribute('data-id')
  expect(id).toBeTruthy()

  // Re-stub /flash-status to report that piece claimed, then reload so the grid
  // reconciles against the "live" map exactly as it does in production.
  await page.unroute('**/flash-status')
  await page.route('**/flash-status', route =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ claims: { [id]: 'claimed' } }) }))
  await page.reload()

  const card = page.locator(`.flash-card[data-id="${id}"]`)
  await expect(card).toHaveAttribute('data-status', 'claimed')
  await expect(card.locator('.card-status')).toContainText(/claimed/i)
  await expect(card.locator('.claim-btn')).toBeDisabled()
})
