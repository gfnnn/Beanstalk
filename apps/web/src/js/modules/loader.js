// ── Page preloader dismissal ──────────────────────────────────────────────────
// The overlay (#page-loader) and its critical CSS are injected at build time by
// src/build/loader.js — it covers every page from the first paint so the slow
// CSS/font arrival never shows as "broken" content (the reported iPad flash). This
// module fades it out the moment the page is genuinely ready.
//
// "Ready" = document.fonts.ready: the font swap is the main cause of the visible
// reflow, so we hold the cover until fonts have settled, then fade it out — no
// artificial minimum hold, just the fade itself, so a fast/cached load reveals the
// page with a smooth cross-fade rather than a snap (see the rAF note in dismiss).
// A hard ceiling guarantees we never strand a visitor behind the overlay if a
// font/network hangs, and the CSS carries its own failsafe should this bundle
// never run.
//
// No-ops when the overlay is absent (e.g. a stripped test page), so it's safe in
// the shared main.js init on every page.
export function initPageLoader() {
  const loader = document.getElementById('page-loader')
  if (!loader) return

  const root    = document.documentElement
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  let dismissed = false

  function dismiss() {
    if (dismissed) return
    dismissed = true

    // Under reduced motion the fade is disabled — remove the node straight away so
    // it can't intercept clicks or hold focus.
    if (reduced) { root.classList.add('page-loaded'); loader.remove(); return }

    // On a fast/cached load, fonts.ready can resolve before the overlay has painted
    // a stable frame at full opacity — flip the class now and the browser jumps
    // straight to opacity:0 (a "snap") instead of animating. Let it paint one frame
    // first, then flip, so the CSS fade always engages. Two rAFs ≈ one paint (~30ms,
    // imperceptible) and it never holds the page open.
    requestAnimationFrame(() => requestAnimationFrame(() => {
      root.classList.add('page-loaded')

      let removed = false
      const remove = () => { if (!removed) { removed = true; loader.remove() } }
      loader.addEventListener('transitionend', e => {
        if (e.propertyName === 'opacity') remove()
      }, { once: true })
      // transitionend can be skipped (backgrounded tab, interrupted transition), so
      // guarantee the node is gone just after the fade would have finished.
      setTimeout(remove, 800)
    }))
  }

  const fontsReady = (document.fonts && document.fonts.ready) || Promise.resolve()
  Promise.resolve(fontsReady).then(dismiss)
  setTimeout(dismiss, 3000) // hard ceiling — never trap the page behind the overlay
}
