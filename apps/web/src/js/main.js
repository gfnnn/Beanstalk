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
import { initNewsletter } from './modules/newsletter.js'
import { initAnalytics } from './modules/analytics.js'

document.addEventListener('DOMContentLoaded', () => {
  // 1. Smooth scroll — must be first so GSAP ticker is driven by Lenis
  initLenis()

  // 2. Nav (scroll-aware header, mobile menu)
  initNav()

  // 3. Hero entrance (home page only — no-ops if .hero isn't present)
  initHeroAnimation()

  // 4. All scroll-triggered reveals
  initScrollAnimations()

  // 5. Portfolio page — load-more, filter/sort, and lightbox cooperate:
  //    load-more owns the visible window; the filter re-applies after a reveal
  //    or a sort. Each no-ops on pages without the masonry grid.
  const loadMore = initLoadMore()
  const filter   = initFilter({ resetWindow: loadMore?.reset })
  loadMore?.setOnReveal(filter?.applyFilters)
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

  // 11. Newsletter page — signup form → Resend Audience
  initNewsletter()

  // 11b. Analytics — outbound social-link tracking (conversion events fire
  //      inline from their own modules). No-op until a provider is configured.
  initAnalytics()

  // 12. Mobile sticky CTA — shown on inner pages on small screens
  const mobileCta = document.getElementById('mobile-cta')
  const hero      = document.querySelector('.hero')
  if (mobileCta && !hero && window.innerWidth < 640) {
    mobileCta.classList.add('visible')
    mobileCta.setAttribute('aria-hidden', 'false')
  }
})
