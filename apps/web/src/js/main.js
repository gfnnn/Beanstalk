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
import { initPageLoader, pageReady } from './modules/loader.js'
import { initMobileCta } from './modules/cta.js'

document.addEventListener('DOMContentLoaded', () => {
  // 0a. Manage the full-page preloader (#page-loader): cover the cold first load
  //     until fonts settle, then fade; drop it instantly on warm in-session
  //     navigations so the View Transition cross-fades real content. Resolves
  //     `pageReady` when the page should be revealed. No-ops without the overlay.
  //     See modules/loader.js + the build-time injection in src/build/loader.js.
  initPageLoader()

  // 1. Smooth scroll — must be first so GSAP ticker is driven by Lenis
  initLenis()

  // 2. Nav (scroll-aware header, mobile menu)
  initNav()

  // Entrance / reveal — gated on pageReady so it plays AS the cover lifts (cold
  // load) or immediately (warm nav / no cover), never wasted behind the overlay.
  // The class flip and the GSAP .from() start-states still land in one synchronous
  // tick (this callback) so the FOUC guard hands off with no painted in-between.
  pageReady.then(() => {
    // Reveal the elements the FOUC guard (styles/motion.css) holds hidden.
    document.documentElement.classList.add('motion-ready')
    // Hero entrance (home only) + all scroll-triggered reveals & on-load cascades.
    initHeroAnimation()
    initScrollAnimations()
  })

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

  // 11. Mobile sticky CTA — homepage: appears after the hero scrolls out;
  //     inner pages: shown immediately on small screens. A functional control,
  //     not motion — see modules/cta.js (never reduced-motion gated).
  initMobileCta()
})
