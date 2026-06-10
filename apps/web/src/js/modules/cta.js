// Mobile sticky CTA — the pinned "Enquire" bar on small screens.
//
// Two behaviours, one module:
//   • Homepage (a .hero exists): appears once the hero scrolls out of view,
//     via an IntersectionObserver on the hero.
//   • Inner pages (no .hero): shown immediately on small screens.
//
// This is a FUNCTIONAL control, not decoration — so it deliberately lives
// outside animations.js and is never gated on prefers-reduced-motion (it used
// to be, which hid the homepage CTA from reduced-motion users entirely).
// No-ops when the page has no #mobile-cta.
export function initMobileCta() {
  const mobileCta = document.getElementById('mobile-cta')
  if (!mobileCta) return

  const hero = document.querySelector('.hero')
  if (hero) {
    const obs = new IntersectionObserver(([e]) => {
      const show = !e.isIntersecting
      mobileCta.classList.toggle('visible', show)
      mobileCta.setAttribute('aria-hidden', String(!show))
    }, { threshold: 0 })
    obs.observe(hero)
  } else if (window.innerWidth < 640) {
    mobileCta.classList.add('visible')
    mobileCta.setAttribute('aria-hidden', 'false')
  }
}
