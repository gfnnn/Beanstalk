import { initNav } from './modules/nav.js'
import { initAftercare } from './modules/aftercare.js'
import { initLenis } from './modules/lenis.js'
import { initHeroAnimation, initScrollAnimations } from './modules/animations.js'
import { initFilter } from './modules/filter.js'
import { initLightbox } from './modules/lightbox.js'
import { initLoadMore } from './modules/loadmore.js'
import { initFaq } from './modules/faq.js'
import { initEnquire } from './modules/enquire.js'
import { initFlash } from './modules/flash.js'
import { initNewsletter } from './modules/newsletter.js'
import { initMedia } from './modules/media.js'
import { initAnalytics } from './modules/analytics.js'

document.addEventListener('DOMContentLoaded', () => {
  // 0. Reveal the elements the FOUC guard (styles/motion.css) holds hidden until
  //    the motion layer is live. Done FIRST and synchronously so this class flip
  //    and the GSAP .from() start-states set below land in the same frame — the
  //    browser never paints the in-between, so there's no flash. Under reduced
  //    motion the guard is inert (its media query) and GSAP bails, so the elements
  //    are already visible and this is a harmless no-op.
  document.documentElement.classList.add('motion-ready')

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

  // 6. Aftercare page — tab switcher + sticky shadow
  initAftercare()

  // 7. FAQ page — accordion, category filter, search
  initFaq()

  // 8. Enquire page — multi-step form, progress, conditional fields
  initEnquire()

  // 9. Flash page — filter/sort, claim modal
  initFlash()

  // 10. Newsletter page — signup form → Resend Audience
  initNewsletter()

  // 10a. Hero media clips (homepage + About hero) — reduced-motion +
  //      on-screen-only playback. No-ops when the page has no generated clip.
  initMedia()

  // 10b. Analytics — outbound social-link tracking (conversion events fire
  //      inline from their own modules). No-op until a provider is configured.
  initAnalytics()

  // 11. Mobile sticky CTA — shown on inner pages on small screens
  const mobileCta = document.getElementById('mobile-cta')
  const hero      = document.querySelector('.hero')
  if (mobileCta && !hero && window.innerWidth < 640) {
    mobileCta.classList.add('visible')
    mobileCta.setAttribute('aria-hidden', 'false')
  }
})
