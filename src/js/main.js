import { initNav } from './modules/nav.js'
import { initGallery } from './modules/gallery.js'
import { initLenis } from './modules/lenis.js'
import { initHeroAnimation, initScrollAnimations } from './modules/animations.js'

document.addEventListener('DOMContentLoaded', () => {
  // 1. Smooth scroll — must be first so GSAP ticker is driven by Lenis
  initLenis()

  // 2. Nav (scroll-aware header, mobile menu)
  initNav()

  // 3. Hero entrance (immediate, not scroll-triggered)
  initHeroAnimation()

  // 4. All scroll-triggered reveals and parallax
  initScrollAnimations()

  // 5. Gallery interactions (lightbox etc. — future)
  initGallery()
})
