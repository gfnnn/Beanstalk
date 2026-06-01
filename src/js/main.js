import { initNav } from './modules/nav.js'
import { initAftercare } from './modules/aftercare.js'
import { initGallery } from './modules/gallery.js'
import { initLenis } from './modules/lenis.js'
import { initHeroAnimation, initScrollAnimations } from './modules/animations.js'
import { initFilter } from './modules/filter.js'
import { initLightbox } from './modules/lightbox.js'
import { initLoadMore } from './modules/loadmore.js'
import { initFaq } from './modules/faq.js'
import { initEnquire } from './modules/enquire.js'
import { initFlash } from './modules/flash.js'

document.addEventListener('DOMContentLoaded', () => {
  // 1. Smooth scroll — must be first so GSAP ticker is driven by Lenis
  initLenis()

  // 2. Nav (scroll-aware header, mobile menu)
  initNav()

  // 3. Hero entrance (home page only — no-ops if .hero isn't present)
  initHeroAnimation()

  // 4. All scroll-triggered reveals
  initScrollAnimations()

  // 5. Portfolio page — each guards with an element check and no-ops elsewhere
  initLoadMore()
  initFilter()
  initLightbox()

  // 6. Portfolio page gallery — stub for future
  initGallery()

  // 7. Aftercare page — tab switcher + sticky shadow
  initAftercare()

  // 8. FAQ page — accordion, category filter, search
  initFaq()

  // 9. Enquire page — multi-step form, progress, conditional fields
  initEnquire()

  // 10. Flash page — filter/sort, claim modal
  initFlash()

  // 10. Mobile sticky CTA — shown on inner pages on small screens
  const mobileCta = document.getElementById('mobile-cta')
  const hero      = document.querySelector('.hero')
  if (mobileCta && !hero && window.innerWidth < 640) {
    mobileCta.classList.add('visible')
    mobileCta.setAttribute('aria-hidden', 'false')
  }
})
