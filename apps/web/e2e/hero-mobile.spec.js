// Mobile homepage hero — the full-screen portrait video opener. jsdom can't
// measure layout or run the IntersectionObserver that flips the nav transparent,
// so this is browser-only: it checks the clip covers the first viewport, the nav
// overlays it transparently and the tagline/headline sit over it, the rest of the
// hero is genuinely below the fold, and scrolling past the clip turns the nav
// solid. The clip is the placeholder here (media.hero.show:false) — the layout is
// identical either way, so the design is verifiable before the real video lands.
import { test, expect } from '@playwright/test'
import { stubWorker, watchForErrors } from './helpers.js'

test.describe('mobile full-screen hero opener', () => {
  test.use({ viewport: { width: 390, height: 844 } }) // iPhone-ish portrait

  test.beforeEach(async ({ page }) => {
    await stubWorker(page)
    await page.goto('/')
  })

  test('the clip covers the first viewport and the nav overlays it transparently', async ({ page }) => {
    const errors = watchForErrors(page)
    const vh = page.viewportSize().height

    // The media layer (placeholder/video) fills the first screen.
    const media = page.locator('.hero-media')
    const box = await media.boundingBox()
    expect(box.height).toBeGreaterThanOrEqual(vh - 4)

    // Nav is transparent over the clip at the top (set by nav.js while the video
    // still sits behind it), and the tagline + headline overlay it.
    const nav = page.locator('#main-nav')
    await expect(nav).toHaveClass(/over-hero/)
    await expect(page.locator('.hero-intro h1')).toBeVisible()
    await expect(page.locator('.hero-intro .hero-eyebrow')).toBeVisible()

    errors.assertClean()
  })

  test('the rest of the hero is below the fold and the nav goes solid once the clip is scrolled past', async ({ page }) => {
    const vh = page.viewportSize().height

    // The body/buttons/notices live below the full-screen clip.
    const detailTop = await page.locator('.hero-detail').evaluate(
      el => el.getBoundingClientRect().top)
    expect(detailTop).toBeGreaterThanOrEqual(vh - 4)

    // Scroll past the clip → nav loses the transparent state and turns solid.
    await page.evaluate(() => window.scrollTo(0, window.innerHeight + 50))
    await expect(page.locator('#main-nav')).not.toHaveClass(/over-hero/)
  })

  test('opening the drawer forces the (otherwise transparent) nav solid', async ({ page }) => {
    const nav = page.locator('#main-nav')
    await expect(nav).toHaveClass(/over-hero/)
    await page.locator('#nav-hamburger').click()
    await expect(nav).toHaveClass(/drawer-open/)
    // background is no longer transparent while the drawer is open
    const bg = await nav.evaluate(el => getComputedStyle(el).backgroundColor)
    expect(bg).not.toBe('rgba(0, 0, 0, 0)')
  })
})

test.describe('mobile hero under reduced motion', () => {
  test.use({ viewport: { width: 390, height: 844 } })

  test('the overlay text and nav are visible (no reveal), not stuck hidden', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await stubWorker(page)
    await page.goto('/')

    // The FOUC guard is scoped to no-preference, and animations.js bails under
    // reduce — so the nav + headline must simply be visible, never animated in.
    await expect(page.locator('.hero-intro h1')).toBeVisible()
    await expect(page.locator('.nav-logo')).toBeVisible()
    await expect(page.locator('#nav-hamburger')).toBeVisible()
    const logoOpacity = await page.locator('.nav-logo').evaluate(
      el => Number(getComputedStyle(el).opacity))
    expect(logoOpacity).toBe(1)
  })
})
