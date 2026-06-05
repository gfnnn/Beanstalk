// Whole-site smoke sweep. For every page: it serves (2xx), the shared bundle runs
// (the nav mounts), the page has a title + an <h1>, and nothing throws on load /
// logs a console error. This is the cheap net that catches a broken build, a
// bundle that errors before it ships, a page missing from the Vite input map, or
// a renderer that blew up — the failures green unit tests can't see.
import { test, expect } from '@playwright/test'
import { PAGES, stubWorker, watchForErrors } from './helpers.js'

test.describe('smoke: every page loads cleanly', () => {
  for (const { path, name } of PAGES) {
    test(`${name} (${path})`, async ({ page }) => {
      await stubWorker(page)              // never touch the real Worker
      const errors = watchForErrors(page)

      const res = await page.goto(path, { waitUntil: 'networkidle' })
      expect(res, `no response for ${path}`).toBeTruthy()
      expect(res.status(), `${path} should serve 2xx`).toBeLessThan(400)

      // The shared JS bundle mounts the nav on every page (initNav). Its presence
      // is a proxy for "the module bundle parsed and ran".
      await expect(page.locator('#main-nav')).toBeVisible()

      await expect(page).toHaveTitle(/.+/)             // non-empty <title>
      await expect(page.locator('h1').first()).toBeVisible()

      errors.assertClean()
    })
  }
})

test.describe('smoke: SEO/static endpoints', () => {
  test('serves robots.txt and the sitemap', async ({ page }) => {
    const robots = await page.request.get('/robots.txt')
    expect(robots.ok()).toBeTruthy()
    expect(await robots.text()).toMatch(/sitemap/i)

    const sitemap = await page.request.get('/sitemap.xml')
    expect(sitemap.ok()).toBeTruthy()
    expect(await sitemap.text()).toContain('<urlset')
  })

  test('home carries the canonical link + JSON-LD the build injects', async ({ page }) => {
    await stubWorker(page)
    await page.goto('/')
    await expect(page.locator('link[rel="canonical"]')).toHaveCount(1)
    await expect(page.locator('script[type="application/ld+json"]')).not.toHaveCount(0)
  })
})
