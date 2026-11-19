// The reduced-motion contract (docs/MOTION.md), on every page at both widths.
// A visitor who asks for reduced motion gets a still page: no preloader hold, no
// smooth-scroll, nothing animated in on load and nothing animated in on scroll.
//
// Each of those is a JS early return (loader.js, lenis.js, animations.js) or a
// CSS media query, so one dropped guard would break it silently. What is read
// here is the result, not the guard: the entrance and scroll-reveal targets are
// at opacity 1 with no transform, straight after the reveal and again after
// scrolling to the bottom. GSAP leaves an inline opacity/transform on anything it
// touches, and holds a below-the-fold target at opacity 0 until its trigger
// fires, so an animation that ran (or is waiting to) shows up either way.
import { test, expect } from '@playwright/test'
import { ALL_PAGES, VIEWPORTS, gotoRevealed, stubWorker } from './helpers.js'

test.use({ contextOptions: { reducedMotion: 'reduce' } })

// What the motion layer animates on load and on scroll: the `.from()` targets of
// initHeroAnimation and initScrollAnimations in src/js/modules/animations.js (the
// home hero, the inner-page header, the section registry, the card/tile groups,
// the filter bar, the enquiry form, `.reveal`). Not covered: `cascadeReveal`,
// which a page module calls after an interaction (the aftercare route picker).
const MOTION_TARGETS = [
  '.reveal',
  '.hero-eyebrow', '.hero h1', '.hero-body', '.hero-actions .btn', '.studio-notices',
  '.hero-media', '.scroll-hint',
  '.page-eyebrow', '.page-title', '.page-descriptor',
  '.eyebrow', '.chooser-eyebrow', '.section-eyebrow',
  '.section-title', '.page-hero__title', '.chooser-heading', '.contact-heading', '.newsletter-band-title',
  '.body-text', '.serif-note', '.chooser-sub', '.contact-subhead', '.newsletter-band-sub',
  '.portfolio-grid .tile', '.masonry-tile', '.specialism-card', '.process-step',
  '.testimonial', '.flash-card',
  '.progress-wrap', '.form-step.active',
  '.filter-bar .filter-toggle', '.filter-bar .chip', '.filter-bar .chip-more', '.filter-bar .filter-select',
].join(', ')

// How many targets the page has, and those that are not fully shown and at rest,
// as `selector: what is wrong`.
const motionTargets = page => page.evaluate(selector => {
  const name = el => el.tagName.toLowerCase() + (el.id ? `#${el.id}` : '') +
    [...el.classList].map(c => `.${c}`).join('')
  const targets = document.querySelectorAll(selector)
  const moving = []
  for (const el of targets) {
    const cs = getComputedStyle(el)
    const wrong = []
    if (cs.opacity !== '1') wrong.push(`opacity ${cs.opacity}`)
    if (cs.transform !== 'none') wrong.push(`transform ${cs.transform}`)
    if (wrong.length) moving.push(`${name(el)}: ${wrong.join(', ')}`)
  }
  return { count: targets.length, moving }
}, MOTION_TARGETS)

// Under reduce the cover is removed in the same task that reveals the page
// (`page-loaded`), with no fade. Otherwise it stays in the DOM while it fades, so
// "gone eventually" can't tell the two apart. Record, from before the bundle runs,
// whether the cover was still there just after the reveal.
const watchCover = page => page.addInitScript(() => {
  new MutationObserver((_, observer) => {
    if (!document.documentElement?.classList.contains('page-loaded')) return
    window.__coverOutlivedReveal = !!document.getElementById('page-loader')
    observer.disconnect()
  // `document`, not <html>: an init script runs before the parser has made one.
  }).observe(document, { subtree: true, attributes: true, attributeFilter: ['class'] })
})

const hasLenis = page => page.evaluate(() => document.documentElement.classList.contains('lenis'))

// Walk the page to the bottom a screen at a time, so every scroll trigger's
// start line is crossed rather than jumped over.
const scrollToBottom = page => page.evaluate(async () => {
  for (let y = 0; y < document.documentElement.scrollHeight; y += window.innerHeight) {
    window.scrollTo({ top: y, behavior: 'instant' })
    await new Promise(requestAnimationFrame)
  }
  window.scrollTo({ top: document.documentElement.scrollHeight, behavior: 'instant' })
  await new Promise(requestAnimationFrame)
})

for (const viewport of VIEWPORTS) {
  test.describe(`reduced motion at ${viewport.width}px`, () => {
    test.use({ viewport })

    for (const { path, name } of ALL_PAGES) {
      test(`${name} (${path}) holds still, on load and after scrolling`, async ({ page }) => {
        const where = `${path} at ${viewport.width}px`
        await stubWorker(page)
        await watchCover(page)
        await gotoRevealed(page, path)

        expect(await page.evaluate(() => window.__coverOutlivedReveal),
          `${where}: the preloader faded out instead of being removed at once`).toBe(false)
        expect(await hasLenis(page), `${where}: <html> has the lenis class`).toBe(false)
        const onLoad = await motionTargets(page)
        // Every page has something the motion layer would animate; none found means
        // the selectors have drifted from animations.js and the check is empty.
        expect(onLoad.count, `${where}: no motion targets found`).toBeGreaterThan(0)
        expect(onLoad.moving, `${where}: animated on load`).toEqual([])

        await scrollToBottom(page)
        expect((await motionTargets(page)).moving, `${where}: animated on scroll`).toEqual([])
        expect(await hasLenis(page), `${where}: <html> has the lenis class after scrolling`).toBe(false)
        await expect(page.locator('#page-loader')).toHaveCount(0)
      })
    }

    test('home: the hero is visible and the sprig’s SMIL animation is paused', async ({ page }) => {
      await stubWorker(page)
      await gotoRevealed(page, '/')

      for (const sel of ['.hero h1', '.hero-media', '.media-caption', '.nav-logo']) {
        await expect(page.locator(sel).first()).toBeVisible()
        await expect(page.locator(sel).first(), sel).toHaveCSS('opacity', '1')
      }
      // CSS can't reach SMIL: the looping feTurbulence wobble is paused from JS.
      await expect.poll(() => page.locator('.hero-sprig').evaluate(svg => svg.animationsPaused())).toBe(true)
    })
  })
}
