// Shared sticky-shadow helper. A bar that pins to the top of the viewport (the
// portfolio filter bar, the flash filter bar, the enquiry progress bar) gets a
// `.stuck` class the moment it sits flush under the fixed nav, so CSS can drop a
// shadow. One IntersectionObserver, watching the element cross the nav-height
// line. No-ops when the element is absent or IntersectionObserver is unsupported.
export function initStickyShadow(el) {
  if (!el || !('IntersectionObserver' in window)) return
  // Offset by the nav height (any CSS unit — the value is used verbatim in
  // rootMargin) so "stuck" fires when the bar reaches the bottom of the nav, not
  // the very top of the viewport.
  const navH = getComputedStyle(document.documentElement)
    .getPropertyValue('--nav-h').trim() || '65px'
  const obs = new IntersectionObserver(
    ([entry]) => el.classList.toggle('stuck', !entry.isIntersecting),
    { threshold: 1, rootMargin: `-${navH} 0px 0px 0px` }
  )
  obs.observe(el)
}
