// Analytics (GA4) — the browser-level privacy guarantees the jsdom tier can only
// approximate. The suite serves the CSP-enforced production build on localhost,
// which maps to no Measurement ID, so:
//   • no page may make a single request to a Google analytics/tag host, and
//   • the /privacy/ opt-out control works for real and its choice survives a reload.
// (Loading gtag on a staging host is verified in GA4 DebugView/Realtime on staging,
// per the PR checklist, not here: that would send real hits.)
import { test, expect } from '@playwright/test'
import { PAGES, stubWorker, watchForErrors } from './helpers.js'

const GOOGLE_ANALYTICS = /(google-analytics\.com|analytics\.google\.com|googletagmanager\.com)/

test('localhost makes zero requests to Google analytics hosts on any page', async ({ page }) => {
  await stubWorker(page)
  const hits = []
  page.on('request', req => { if (GOOGLE_ANALYTICS.test(req.url())) hits.push(req.url()) })
  for (const { path } of PAGES) {
    await page.goto(path)
    await page.waitForLoadState('load')
  }
  expect(hits).toEqual([])
  expect(await page.evaluate(() => typeof window.gtag)).toBe('undefined')
})

test('the /privacy/ opt-out toggles, persists across a reload, and logs no errors', async ({ page }) => {
  await stubWorker(page)
  const errors = watchForErrors(page)
  await page.goto('/privacy/')

  const control = page.locator('[data-analytics-optout]')
  const status = page.locator('[data-analytics-status]')
  const toggle = page.locator('[data-analytics-toggle]')

  await expect(control).toBeVisible()
  await expect(status).toContainText(/on in this browser/i)
  await toggle.click()
  await expect(status).toContainText(/off in this browser/i)
  await expect(toggle).toHaveText('Turn analytics back on')

  await page.reload()
  await expect(status).toContainText(/off in this browser/i)

  await toggle.click()
  await expect(status).toContainText(/on in this browser/i)
  errors.assertClean()
})
