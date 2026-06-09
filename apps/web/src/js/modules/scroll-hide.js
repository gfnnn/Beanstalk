// Auto-hide a sticky bar on scroll-down, reveal it on scroll-up — mobile only.
//
// The portfolio filter bar pins under the nav (position: sticky), but on a narrow
// screen its two rows of chips + selects cover a big slice of the grid while you
// browse the photos. This slides the bar out of view as the customer scrolls
// DOWN into the work, and brings it straight back the moment they scroll UP —
// where it re-anchors under the nav. The bar stays sticky throughout; we only
// add/remove a `.bar-hidden` class, and the slide (plus the mobile gate) lives in
// components/filter-bar.css.
//
// Gated to a narrow viewport so the desktop single-row bar — which barely costs
// any height — is never touched (it matches the `min-width: 640px` desktop layout
// boundary). The handler is rAF-latched like nav.js (one read/toggle per frame),
// reads window.scrollY (so it rides the native scroll Lenis drives), and:
//   • keeps the bar shown until it's actually pinned under the nav — i.e. below
//     its pin point (offsetTop − nav height). Hiding it while it's still in flow,
//     mid-screen, would make it vanish abruptly; once pinned, sliding it up reads
//     naturally. (Using `offsetTop` alone left a nav-height dead band where the
//     bar was pinned and covering the grid but still refused to hide.)
//   • ignores a small scroll delta so momentum / sub-pixel jitter can't flicker it;
//   • reveals the bar if a control inside it takes focus (keyboard reach);
//   • clears the hidden state when the viewport grows past the mobile breakpoint.
// No-ops without the element. The slide is governed by the global reduced-motion
// guard (reset.css), so it's instant — not animated — when the user asks for that.
const MOBILE_MQ = '(max-width: 639px)'
const DEADZONE   = 4 // px of scroll delta to ignore — kills momentum/sub-pixel flicker

export function initScrollHide(el, { query = MOBILE_MQ } = {}) {
  if (!el) return

  const mobileMq = window.matchMedia?.(query) ?? null
  // Nav height — the bar pins flush under it (CSS: top: var(--nav-h)), so it's the
  // offset between the bar's flow position and the scroll point where it pins.
  const navH = parseInt(
    getComputedStyle(document.documentElement).getPropertyValue('--nav-h'), 10
  ) || 65
  let lastY   = window.scrollY
  let ticking = false

  const show = () => el.classList.remove('bar-hidden')
  const hide = () => el.classList.add('bar-hidden')

  function onScroll() {
    if (ticking) return
    ticking = true
    requestAnimationFrame(() => {
      ticking = false
      const y = window.scrollY

      // Desktop (or no matchMedia): the bar is always shown — never auto-hide it.
      if (!mobileMq?.matches) { show(); lastY = y; return }

      const delta    = y - lastY
      const pinPoint = Math.max(0, el.offsetTop - navH) // scrollY at which the bar pins
      if (y < pinPoint)           show()  // not pinned yet → keep it in view
      else if (delta >  DEADZONE) hide()  // pinned + scrolling down → tuck it away
      else if (delta < -DEADZONE) show()  // scrolling up → bring it back
      lastY = y
    })
  }

  window.addEventListener('scroll', onScroll, { passive: true })
  // A keyboard tab (or programmatic focus) into a hidden bar must reveal it.
  el.addEventListener('focusin', show)
  // Leaving the mobile breakpoint clears any hidden state the small screen set.
  mobileMq?.addEventListener?.('change', e => { if (!e.matches) show() })
}
