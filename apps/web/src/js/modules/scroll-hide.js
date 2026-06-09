// Auto-hide a sticky bar on scroll-down, reveal it on scroll-up — mobile only.
//
// The portfolio / flash filter bar pins under the nav (position: sticky), but on a
// narrow screen its two rows of chips + selects cover a big slice of the grid while
// you browse the photos. This slides the bar out of view as the customer scrolls
// DOWN into the work, and brings it back when they scroll UP — where it re-anchors
// under the nav. The bar stays sticky throughout; we only add/remove a `.bar-hidden`
// class, and the slide (plus the mobile gate) lives in components/filter-bar.css.
//
// Gated to a narrow viewport so the desktop single-row bar — which barely costs any
// height — is never touched (it matches the `min-width: 640px` desktop layout
// boundary). The handler is rAF-latched like nav.js (one read/toggle per frame) and
// reads window.scrollY (so it rides the native scroll Lenis drives), and:
//   • keeps the bar shown until it's actually pinned under the nav — i.e. below its
//     pin point (offsetTop − nav height). Hiding it while it's still in flow,
//     mid-screen, would make it vanish abruptly; once pinned, sliding it up reads
//     naturally. (Using `offsetTop` alone left a nav-height dead band where the bar
//     was pinned and covering the grid but still refused to hide.)
//   • flips the bar only after a SUSTAINED scroll past a threshold in one direction,
//     not on a single frame's delta. A per-frame ±deadzone flickered on mobile:
//     momentum bounce, sub-pixel jitter and the address-bar show/hide each nudge
//     scrollY a few px the "wrong" way mid-scroll, and any nudge over the deadzone
//     toggled the bar — so it flashed as you scrolled down. Banking signed travel
//     (and zeroing it the instant the direction flips) means a brief wobble never
//     accumulates enough to reveal a hidden bar (or hide a shown one); only a
//     deliberate scroll of >THRESHOLD px crosses the line.
//   • clamps scrollY to [0, maxScroll] so iOS rubber-band overscroll — which carries
//     scrollY past either end and back — can't read as a phantom direction change
//     (the source of the bar reappearing when momentum settles at the bottom).
//   • reveals the bar if a control inside it takes focus (keyboard reach);
//   • clears the hidden state when the viewport grows past the mobile breakpoint.
// No-ops without the element. The slide is governed by the global reduced-motion
// guard (reset.css), so it's instant — not animated — when the user asks for that.
const MOBILE_MQ = '(max-width: 639px)'
const THRESHOLD = 12 // px of sustained directional travel before flipping the bar

export function initScrollHide(el, { query = MOBILE_MQ } = {}) {
  if (!el) return

  const mobileMq = window.matchMedia?.(query) ?? null
  // Nav height — the bar pins flush under it (CSS: top: var(--nav-h)), so it's the
  // offset between the bar's flow position and the scroll point where it pins.
  const navH = parseInt(
    getComputedStyle(document.documentElement).getPropertyValue('--nav-h'), 10
  ) || 65
  let lastY   = Math.max(0, window.scrollY)
  let travel  = 0 // signed px scrolled since the last direction change
  let ticking = false

  const show = () => el.classList.remove('bar-hidden')
  const hide = () => el.classList.add('bar-hidden')

  function onScroll() {
    if (ticking) return
    ticking = true
    requestAnimationFrame(() => {
      ticking = false

      // Clamp away rubber-band overscroll: iOS reports scrollY below 0 (top) or past
      // the maximum (bottom) at the boundaries, and the bounce back reads as a
      // direction change. Pinning y inside the real scroll range neutralises it.
      const maxScroll = document.documentElement.scrollHeight - window.innerHeight
      const raw       = Math.max(0, window.scrollY)
      const y         = maxScroll > 0 ? Math.min(raw, maxScroll) : raw

      // Desktop (or no matchMedia): the bar is always shown — never auto-hide it.
      if (!mobileMq?.matches) { show(); lastY = y; travel = 0; return }

      const delta = y - lastY
      lastY = y

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
