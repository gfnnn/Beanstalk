// Auto-hide a sticky bar on scroll-down, reveal it on scroll-up — mobile only.
//
// The portfolio / flash filter bar pins under the nav (position: sticky), but on a
// narrow screen its two rows of chips + selects cover a big slice of the grid while
// you browse the photos. This slides the bar out of view as the customer scrolls
// DOWN into the work, and brings it back when they scroll UP — where it re-anchors
// under the nav. The bar stays sticky throughout; we only add/remove a `.bar-hidden`
// class, and the slide (plus the mobile gate) lives in components/filter-bar.css.
//
// THE HARD PART — mobile browser toolbars. The decision can't be a naive
// frame-to-frame scrollY delta: on Android Chrome (and iOS) a single flick retracts
// the dynamic URL/toolbar, and while that toolbar animates it (a) changes the
// viewport height every frame and (b) perturbs window.scrollY non-monotonically. A
// delta-based bar then reads those layout artifacts as little "scroll ups" and
// flickers — reappearing mid-scroll and often ending up shown. The toolbar is ~50px,
// so no fixed delta threshold can separate "user scrolled up" from "toolbar moved".
// The fix is to distrust scroll while the viewport is resizing: we watch the visual
// viewport height (visualViewport API, falling back to innerHeight) and, on any frame
// where it moved — plus a short settle window after — we make NO decision, we just
// track position. Only deltas measured against a STABLE viewport flip the bar.
//
// Gated to a narrow viewport so the desktop single-row bar — which barely costs any
// height — is never touched (it matches the `min-width: 640px` desktop layout
// boundary). The handler is rAF-latched like nav.js (one read/toggle per frame),
// reads window.scrollY (so it rides the native scroll Lenis drives), and:
//   • keeps the bar shown until it's actually pinned under the nav — i.e. below its
//     pin point (offsetTop − nav height). Hiding it while it's still in flow,
//     mid-screen, would make it vanish abruptly; once pinned, sliding it up reads
//     naturally. (Using `offsetTop` alone left a nav-height dead band.)
//   • flips the bar only after a SUSTAINED scroll past a threshold in one direction,
//     zeroing the accumulator the instant the direction flips, so momentum / sub-pixel
//     jitter can't toggle it;
//   • skips the decision entirely while the viewport height is changing (toolbar in
//     motion) and for a brief settle window after — see above;
//   • reveals the bar if a control inside it takes focus (keyboard reach);
//   • clears the hidden state when the viewport grows past the mobile breakpoint.
// No-ops without the element. The slide is governed by the global reduced-motion
// guard (reset.css), so it's instant — not animated — when the user asks for that.
const MOBILE_MQ = '(max-width: 639px)'
const THRESHOLD = 12  // px of sustained directional travel before flipping the bar
const SETTLE_MS = 350 // ignore scroll toggles for this long after the viewport resizes

export function initScrollHide(el, { query = MOBILE_MQ } = {}) {
  if (!el) return

  const mobileMq = window.matchMedia?.(query) ?? null
  const vv = window.visualViewport ?? null
  // Nav height — the bar pins flush under it (CSS: top: var(--nav-h)), so it's the
  // offset between the bar's flow position and the scroll point where it pins.
  const navH = parseInt(
    getComputedStyle(document.documentElement).getPropertyValue('--nav-h'), 10
  ) || 65

  const viewportH = () => (vv ? vv.height : window.innerHeight)
  const now       = () => (typeof performance !== 'undefined' ? performance.now() : Date.now())

  let lastY       = Math.max(0, window.scrollY)
  let lastVH      = viewportH()
  let travel      = 0 // signed px scrolled since the last direction change
  let settleUntil = 0 // while now() < this, the toolbar is moving → make no decision
  let ticking     = false

  const show = () => el.classList.remove('bar-hidden')
  const hide = () => el.classList.add('bar-hidden')

  function onScroll() {
    if (ticking) return
    ticking = true
    requestAnimationFrame(() => {
      ticking = false

      const vh        = viewportH()
      const y         = Math.max(0, window.scrollY)
      const delta     = y - lastY
      const vhChanged = vh !== lastVH
      lastY  = y
      lastVH = vh

      // Desktop (or no matchMedia): the bar is always shown — never auto-hide it.
      if (!mobileMq?.matches) { show(); travel = 0; return }

      // Toolbar in motion (viewport height moved this frame, or we're still inside
      // the settle window after it did): the scroll delta is a layout artifact, not
      // a user scroll — make no decision, just keep tracking position.
      if (vhChanged) settleUntil = now() + SETTLE_MS
      if (now() < settleUntil) { travel = 0; return }

      // Not pinned yet (still in flow, mid-screen) → keep it shown, and reset the
      // accumulator so a fresh downward run is needed once it does pin.
      const pinPoint = Math.max(0, el.offsetTop - navH)
      if (y < pinPoint) { show(); travel = 0; return }

      // Zero the accumulator whenever the direction flips, so a wobble can't carry
      // over; then bank this frame's movement and toggle once it's decisive.
      if ((delta < 0) !== (travel < 0)) travel = 0
      travel += delta
      if (travel > THRESHOLD)       hide()
      else if (travel < -THRESHOLD) show()
    })
  }

  window.addEventListener('scroll', onScroll, { passive: true })
  // A keyboard tab (or programmatic focus) into a hidden bar must reveal it.
  el.addEventListener('focusin', show)
  // Leaving the mobile breakpoint clears any hidden state the small screen set.
  mobileMq?.addEventListener?.('change', e => { if (!e.matches) show() })
}
