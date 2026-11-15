// The mobile sticky "Enquire" bar (#mobile-cta) and two shared CSS tokens it sits
// beside. Browser-only: the bug this guards was a cascade one (a page stylesheet
// redeclaring .mobile-cta globally and hiding the bar on phones on every page),
// which only a real layout engine computing styles can catch.
import { test, expect } from '@playwright/test'
import { live as flashLive } from '../src/data/flash.js'
import { activePalette } from '../src/build/palette.js'
import { stubWorker } from './helpers.js'

// Every page that carries the bar. Flash redirects while held back, so it only
// counts when live.
const CTA_PAGES = [
  '/', '/portfolio/', '/services/', '/about/', '/faq/', '/visit/',
  '/newsletter/', '/privacy/', '/terms/', '/aftercare/',
  ...(flashLive ? ['/flash/'] : []),
]

const channels = hex => {
  const h = hex.replace('#', '')
  return [0, 2, 4].map(i => parseInt(h.slice(i, i + 2), 16)).join(', ')
}

test.describe('mobile CTA at a phone viewport', () => {
  test.use({ viewport: { width: 375, height: 740 } })

  for (const path of CTA_PAGES) {
    test(`shows on ${path}`, async ({ page }) => {
      await stubWorker(page)
      await page.goto(path)
      // The homepage reveals it once the hero scrolls out; inner pages at once.
      if (path === '/') await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight))
      const cta = page.locator('#mobile-cta')
      await expect(cta).toHaveCSS('display', 'block')
      await expect(cta).toHaveClass(/visible/)
      await expect(cta).toBeInViewport()
    })
  }
})

test.describe('mobile CTA above the phone breakpoint', () => {
  test.use({ viewport: { width: 768, height: 1024 } })

  for (const path of ['/', '/aftercare/', '/faq/']) {
    test(`is hidden on ${path}`, async ({ page }) => {
      await stubWorker(page)
      await page.goto(path)
      await expect(page.locator('#mobile-cta')).toHaveCSS('display', 'none')
    })
  }
})

test.describe('shared CSS tokens', () => {
  test('status-pill halos derive from the active palette', async ({ page }) => {
    await stubWorker(page)
    await page.goto('/faq/')
    const rgb = await page.evaluate(() => {
      const el = document.createElement('span')
      document.body.append(el)
      const read = tone => {
        el.className = `status-pill ${tone}`
        return getComputedStyle(el).getPropertyValue('--pill-rgb').trim()
      }
      return { moss: read('moss'), clay: read('clay'), faint: read('faint') }
    })
    const { colors } = activePalette
    expect(rgb.moss).toBe(channels(colors.moss))
    expect(rgb.clay).toBe(channels(colors.clay))
    expect(rgb.faint).toBe(channels(colors['ink-faint']))
  })

  test('footer and newsletter band cap at 1200px', async ({ page }) => {
    await page.setViewportSize({ width: 1600, height: 900 })
    await stubWorker(page)
    await page.goto('/')
    const maxW = await page.evaluate(() =>
      [...document.querySelectorAll('.footer-top, .footer-bottom, .newsletter-band-inner')]
        .map(el => getComputedStyle(el).maxWidth))
    expect(maxW.length).toBe(3) // footer top + bottom + newsletter band
    for (const w of maxW) expect(w).toBe('1200px')
  })
})
