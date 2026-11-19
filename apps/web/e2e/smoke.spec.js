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
      expect(res.status(), `${path} should serve a non-error status`).toBeLessThan(400)

      // The shared JS bundle mounts the nav on every page (initNav). Its presence
      // is a proxy for "the module bundle parsed and ran".
      await expect(page.locator('#main-nav')).toBeVisible()

      await expect(page).toHaveTitle(/.+/)             // non-empty <title>
      await expect(page.locator('h1').first()).toBeVisible()

      // The full-page preloader covers every page from the first paint; the bundle
      // must dismiss it once fonts settle (initPageLoader) so it never traps the
      // page. It's removed from the DOM after the fade.
      await expect(page.locator('#page-loader')).toHaveCount(0)

      errors.assertClean()
    })
  }
})

// 404.html is in the Vite input map but is not a route, so the sweep above never
// loads it. GitHub Pages serves this one file for EVERY unknown URL at any depth,
// which is why its asset URLs must be root-absolute: a relative one resolves
// against the missing path and the page arrives unstyled with no script.
test.describe('smoke: the not-found page', () => {
  test('404.html loads cleanly and offers a way back', async ({ page }) => {
    await stubWorker(page)
    const errors = watchForErrors(page)

    const res = await page.goto('/404.html', { waitUntil: 'networkidle' })
    expect(res.status()).toBeLessThan(400)
    await expect(page.locator('#main-nav')).toBeVisible()
    await expect(page.locator('h1').first()).toBeVisible()
    await expect(page.locator('#page-loader')).toHaveCount(0)
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', /noindex/)
    await expect(page.locator('main a[href="/"]').first()).toBeVisible()

    const assets = await page.evaluate(() => [
      ...[...document.querySelectorAll('script[src]')].map(el => el.getAttribute('src')),
      ...[...document.querySelectorAll('link[rel="stylesheet"], link[rel="modulepreload"]')].map(el => el.getAttribute('href')),
    ])
    expect(assets.length).toBeGreaterThan(0)
    for (const url of assets) expect(url, 'asset URL must be root-absolute').toMatch(/^\/(?!\/)/)

    errors.assertClean()
  })
})

test.describe('smoke: SEO/static endpoints', () => {
  test('serves a staging-aware robots.txt and matching sitemap', async ({ page }) => {
    const robots = await page.request.get('/robots.txt')
    expect(robots.ok()).toBeTruthy()
    const body = await robots.text()
    const sitemap = await page.request.get('/sitemap.xml')

    // robots.txt + sitemap are keyed off isProductionBuild() (apex CNAME /
    // SITE_ENV). The E2E tier builds staging by default, but stay mode-agnostic
    // so this holds on a local/apex build too. A line starting "Allow:" only
    // appears on the production variant ("Disallow:" doesn't match the anchor).
    const isProd = /^allow:/im.test(body)
    if (isProd) {
      // Apex build: crawlable, advertises + serves the sitemap.
      expect(body).toMatch(/^sitemap:/im)
      expect(sitemap.ok()).toBeTruthy()
      expect(await sitemap.text()).toContain('<urlset')
    } else {
      // Staging build: blanket Disallow, no Sitemap directive and no sitemap
      // emitted, so the pre-launch copy carries no real-life SEO artifacts.
      // (Anchor on the directive — a comment may mention the word "sitemap".)
      expect(body).toMatch(/disallow:\s*\/\s*$/im)
      expect(body).not.toMatch(/^sitemap:/im)
      // No real sitemap is emitted on staging. Don't assert on the status: the
      // preview server (Vite, appType 'spa') answers the missing /sitemap.xml
      // with the SPA/404 fallback HTML at 200, and a real host would 404 — both
      // fine. The invariant is just that an actual <urlset> sitemap isn't served.
      expect(await sitemap.text()).not.toContain('<urlset')
    }
  })

  test('home carries the canonical link + JSON-LD the build injects', async ({ page }) => {
    await stubWorker(page)
    await page.goto('/')
    await expect(page.locator('link[rel="canonical"]')).toHaveCount(1)
    await expect(page.locator('script[type="application/ld+json"]')).not.toHaveCount(0)
  })
})
