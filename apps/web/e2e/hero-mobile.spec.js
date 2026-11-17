// Homepage hero + captions — "the work first": nothing is written over a photo.
// jsdom can't measure layout, so this is browser-only. It checks that on a phone
// the hero photo fills the first screen under a solid nav with nothing on it and
// the headline follows beneath; that on desktop the whole photo and its caption
// sit inside the first screen and the caption links to the piece; and that grid
// captions sit under their photos, always visible, at the agreed column counts.
import { test, expect } from '@playwright/test'
import { stubWorker, watchForErrors } from './helpers.js'

// True when the two elements' boxes don't intersect (1px tolerance for rounding).
const clear = (a, b) =>
  a.y + a.height <= b.y + 1 || b.y + b.height <= a.y + 1 ||
  a.x + a.width <= b.x + 1 || b.x + b.width <= a.x + 1

// Every caption sits below its own photo frame and is rendered at ≥ 11px.
async function expectCaptionsUnder(page, tileSel) {
  const tiles = page.locator(tileSel).filter({ visible: true })
  const n = await tiles.count()
  expect(n).toBeGreaterThan(0)
  for (let i = 0; i < Math.min(n, 6); i++) {
    const tile = tiles.nth(i)
    const frame = await tile.locator('.tile-media').boundingBox()
    const cap = tile.locator('.tile-caption')
    await expect(cap).toBeVisible()
    const capBox = await cap.boundingBox()
    expect(capBox.y).toBeGreaterThanOrEqual(frame.y + frame.height - 1)
    const size = await tile.locator('.tile-sub').evaluate(el => parseFloat(getComputedStyle(el).fontSize))
    expect(size).toBeGreaterThanOrEqual(11)
    await expect(tile.locator('.tile-sub')).toHaveCSS('opacity', '1')
  }
}

// How many columns a grid lays its tiles out in (distinct left edges).
const columns = (page, sel) => page.locator(sel).evaluateAll(els =>
  new Set(els.filter(e => e.offsetParent).map(e => Math.round(e.getBoundingClientRect().left))).size)

test.describe('mobile (390px): the photo fills the first screen, the headline follows', () => {
  test.use({ viewport: { width: 390, height: 844 } }) // iPhone-ish portrait

  test.beforeEach(async ({ page }) => {
    await stubWorker(page)
    await page.goto('/')
  })

  test('the hero photo fills the first screen under a solid nav, with nothing on it', async ({ page }) => {
    const errors = watchForErrors(page)
    const vh = page.viewportSize().height

    const nav = await page.locator('#main-nav').boundingBox()
    const frame = await page.locator('.hero-media-frame').boundingBox()
    // The frame starts under the nav and runs to the bottom of the first screen.
    expect(frame.y).toBeGreaterThanOrEqual(nav.y + nav.height - 1)
    expect(frame.y + frame.height).toBeGreaterThanOrEqual(vh - 4)
    expect(frame.y + frame.height).toBeLessThanOrEqual(vh + 4)
    expect(frame.width).toBeGreaterThanOrEqual(390 - 1)

    // The nav is the ordinary solid bar — never transparent over the photo.
    await expect(page.locator('#main-nav')).not.toHaveClass(/over-hero/)
    const bg = await page.locator('#main-nav').evaluate(el => getComputedStyle(el).backgroundColor)
    expect(bg).not.toBe('rgba(0, 0, 0, 0)')

    // Nothing textual overlaps the photo: headline, eyebrow, caption all clear it.
    for (const sel of ['.hero h1', '.hero-eyebrow', '.hero-body', '.media-caption']) {
      const box = await page.locator(sel).first().boundingBox()
      expect(clear(box, frame), `${sel} must not sit on the photo`).toBe(true)
    }
    // …and the headline follows beneath it.
    const h1 = await page.locator('.hero h1').boundingBox()
    expect(h1.y).toBeGreaterThanOrEqual(frame.y + frame.height - 1)

    errors.assertClean()
  })

  test('grid captions sit under the photos; home teaser is 1 column, portfolio 2', async ({ page }) => {
    await expectCaptionsUnder(page, '.portfolio-grid .tile')
    expect(await columns(page, '.portfolio-grid .tile')).toBe(1)

    await page.goto('/portfolio/')
    await expectCaptionsUnder(page, '.masonry-tile')
    expect(await columns(page, '.masonry-tile')).toBe(2)
  })
})

test.describe('desktop (1280×800): the whole hero photo sits inside the first screen', () => {
  test.use({ viewport: { width: 1280, height: 800 } })

  test.beforeEach(async ({ page }) => {
    await stubWorker(page)
    await page.goto('/')
  })

  test('the photo and its caption fit the first screen; the caption links to the piece', async ({ page }) => {
    const errors = watchForErrors(page)
    const frame = await page.locator('.hero-media-frame').boundingBox()
    const caption = page.locator('.hero-media .media-caption a')
    const capBox = await caption.boundingBox()

    expect(frame.y).toBeGreaterThanOrEqual(0)
    expect(frame.y + frame.height).toBeLessThanOrEqual(800)
    expect(capBox.y + capBox.height).toBeLessThanOrEqual(800)
    // The caption is under the photo, not on it.
    expect(capBox.y).toBeGreaterThanOrEqual(frame.y + frame.height - 1)

    // Uncropped: the frame keeps the photo's own aspect ratio.
    const ratio = await page.locator('.hero-media img.media-clip').evaluate(
      img => (img.naturalWidth / img.naturalHeight) / (img.clientWidth / img.clientHeight))
    expect(ratio).toBeGreaterThan(0.98)
    expect(ratio).toBeLessThan(1.02)

    // It names the piece and goes to that piece's page.
    const href = await caption.getAttribute('href')
    expect(href).toMatch(/^\/portfolio\/[a-z0-9-]+\/$/)
    await caption.click()
    await expect(page).toHaveURL(new RegExp(`${href}$`))
    await expect(page.locator('.piece-title')).toBeVisible()

    errors.assertClean()
  })

  test('grid captions are visible without hover, under the photos', async ({ page }) => {
    await expectCaptionsUnder(page, '.portfolio-grid .tile')
    await page.goto('/portfolio/')
    await expectCaptionsUnder(page, '.masonry-tile')
  })

  test('the piece page photo is uncropped, no taller than the screen, and shows no date', async ({ page }) => {
    await page.goto('/portfolio/lioness/')
    const img = page.locator('.piece-media img')
    const box = await img.boundingBox()
    expect(box.height).toBeLessThanOrEqual(800)
    expect(box.y + box.height).toBeLessThanOrEqual(800) // whole photo in the first screen
    // The photo column is ~60% of the layout.
    const share = await page.locator('.piece-layout').evaluate(el => {
      const [a, b] = getComputedStyle(el).gridTemplateColumns.split(' ').map(parseFloat)
      return a / (a + b)
    })
    expect(share).toBeGreaterThan(0.57)
    expect(share).toBeLessThan(0.63)
    await expect(page.locator('.piece-facts')).toContainText('Placement')
    await expect(page.locator('main time')).toHaveCount(0)
  })
})

test.describe('reduced motion', () => {
  for (const viewport of [{ width: 390, height: 844 }, { width: 1280, height: 800 }]) {
    test(`the hero is static and fully visible at ${viewport.width}px`, async ({ page }) => {
      await page.setViewportSize(viewport)
      await page.emulateMedia({ reducedMotion: 'reduce' })
      await stubWorker(page)
      await page.goto('/')

      // The FOUC guard is scoped to no-preference, and animations.js bails under
      // reduce — so everything is simply visible, never animated in.
      for (const sel of ['.hero h1', '.hero-media', '.media-caption', '.nav-logo']) {
        await expect(page.locator(sel).first()).toBeVisible()
        const opacity = await page.locator(sel).first().evaluate(el => Number(getComputedStyle(el).opacity))
        expect(opacity, sel).toBe(1)
      }
      const transform = await page.locator('.hero-media').evaluate(el => getComputedStyle(el).transform)
      expect(transform).toBe('none')
    })
  }
})
