// WCAG 2.1 A + AA, checked by axe on every page at both widths, plus the three
// states where accessibility usually breaks: the open mobile nav drawer, the open
// portfolio lightbox, and the enquiry form showing validation errors. Any
// violation fails. This is the browser half of tests/a11y.test.js (structure
// under jsdom); contrast, names and ARIA need real CSS and a real DOM.
//
// Every scan runs with reduced motion emulated and after the preloader has gone.
// That is deliberate: under reduce nothing fades or blurs in, so axe measures
// the page at rest and content caught mid-fade can't give a false contrast
// result (or hide a real one).
//
// Exclusions: none so far. If one is ever needed, exclude that ELEMENT in the
// scan that needs it, with the reason beside it; never turn a rule off.
import AxeBuilder from '@axe-core/playwright'
import { test, expect } from '@playwright/test'
import { ALL_PAGES, VIEWPORTS, gotoRevealed, stubWorker } from './helpers.js'

test.use({ contextOptions: { reducedMotion: 'reduce' } })

const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']

// Wait out any CSS transition still running (the drawer, the lightbox), so a
// half-faded surface isn't what gets measured. Looping animations never finish
// and are skipped; the 2s cap is for one that is paused and so never would.
const atRest = page => page.evaluate(() => Promise.race([
  Promise.all(
    document.getAnimations()
      .filter(a => Number.isFinite(a.effect?.getComputedTiming().endTime))
      .map(a => a.finished.catch(() => {})),
  ),
  new Promise(resolve => setTimeout(resolve, 2000)),
]))

// Scan the page as it stands; fail with one line per offending element, naming
// the page, the width, the rule and the selector.
async function expectNoViolations(page, where) {
  await atRest(page)
  const { violations } = await new AxeBuilder({ page }).withTags(TAGS).analyze()
  const lines = violations.flatMap(v => v.nodes.map(n =>
    `${where}: ${v.id} (${v.impact}) at ${n.target.join(' ')}: ${v.help}`))
  expect(lines, lines.join('\n')).toEqual([])
}

for (const viewport of VIEWPORTS) {
  test.describe(`axe at ${viewport.width}px`, () => {
    test.use({ viewport })
    const at = what => `${what} at ${viewport.width}px`

    test.beforeEach(async ({ page }) => { await stubWorker(page) })

    for (const { path, name } of ALL_PAGES) {
      test(`${name} (${path})`, async ({ page }) => {
        await gotoRevealed(page, path)
        await expectNoViolations(page, at(path))
      })
    }

    test('the open portfolio lightbox', async ({ page }) => {
      await gotoRevealed(page, '/portfolio/')
      await page.locator('.masonry-tile').first().click()
      await expect(page.locator('#lightbox')).toHaveClass(/open/)
      await expectNoViolations(page, at('/portfolio/ (lightbox open)'))
    })

    test('the enquiry form showing validation errors', async ({ page }) => {
      await gotoRevealed(page, '/enquire/')
      await page.click('#step1-next') // every required field on step 1 is empty
      await expect(page.locator('.field.error').first()).toBeVisible()
      await expectNoViolations(page, at('/enquire/ (validation errors)'))
    })

    // The drawer only exists below the desktop breakpoint.
    if (viewport.width < 900) {
      test('the open mobile nav drawer', async ({ page }) => {
        await gotoRevealed(page, '/')
        await page.locator('#nav-hamburger').click()
        await expect(page.locator('#nav-drawer')).toHaveClass(/open/)
        await expectNoViolations(page, at('/ (nav drawer open)'))
      })
    }
  })
}
