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
//
// While the bar is off-screen it is `aria-hidden` AND `inert`: aria-hidden alone
// hides it from screen readers but leaves its link in the tab order, so keyboard
// focus could land on a control nobody can see. The markup ships in that hidden
// state, so it is right before (and without) JS.
// No-ops when the page has no #mobile-cta.
export function initMobileCta() {
  const mobileCta = document.getElementById('mobile-cta')
  if (!mobileCta) return

  const setShown = show => {
    mobileCta.classList.toggle('visible', show)
    mobileCta.setAttribute('aria-hidden', String(!show))
    mobileCta.toggleAttribute('inert', !show)
  }

  const hero = document.querySelector('.hero')
  if (hero) {
    const obs = new IntersectionObserver(([e]) => {
      setShown(!e.isIntersecting)
    }, { threshold: 0 })
    obs.observe(hero)
  } else {
    // Live media query, not a one-shot innerWidth read: a tablet rotated into
    // portrait after load would otherwise have the bar's box displayed by the
    // CSS breakpoint but never given .visible — present yet off-screen forever.
    const mq = window.matchMedia('(max-width: 639px)')
    const apply = () => setShown(mq.matches)
    apply()
    mq.addEventListener?.('change', apply)
  }
}
