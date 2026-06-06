// ── Page preloader dismissal ──────────────────────────────────────────────────
// The overlay (#page-loader) and its critical CSS are injected at build time by
// src/build/loader.js — it covers every page from the first paint so the slow
// CSS/font arrival never shows as "broken" content (the reported iPad flash). This
// module fades it out the moment the page is genuinely ready.
//
// "Ready" = document.fonts.ready: the font swap is the main cause of the visible
// reflow, so we hold the cover until fonts have settled, then fade it out. A
// fast/cached load reveals the page with a smooth cross-fade rather than a snap
// (see the rAF note in fadeOut); a load that the overlay genuinely had to cover
// first plays one quick complete cycle of the sprig (.pl-finishing) so the
// animation reads as finished. A hard ceiling guarantees we never strand a visitor
// behind the overlay if a font/network hangs, and the CSS carries its own failsafe
// should this bundle never run.
//
// No-ops when the overlay is absent (e.g. a stripped test page), so it's safe in
// the shared main.js init on every page.
export function initPageLoader() {
  const loader = document.getElementById('page-loader')
  if (!loader) return

  const root    = document.documentElement
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  let dismissed = false

  // If the overlay was only up for a blink (warm cache / already-ready), it wasn't
  // really needed — fade straight out, no stall. If it genuinely covered a load,
  // let the sprig play one quick complete ink-in (.pl-finishing) before the fade,
  // so the animation reads as finished instead of being caught mid-draw.
  const INSTANT_MS     = 300
  const QUICK_CYCLE_MS = 600 // ≈ the .pl-finishing outro draw in the critical CSS

  // Fade the cover out. The double rAF lets the overlay paint a stable frame at full
  // opacity first, so the cross-fade animates from a committed state instead of
  // snapping straight to hidden on a fast load (~30ms, imperceptible — no hold).
  function fadeOut() {
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

  function dismiss() {
    if (dismissed) return
    dismissed = true

    // Under reduced motion the fade is disabled — remove the node straight away so
    // it can't intercept clicks or hold focus.
    if (reduced) { root.classList.add('page-loaded'); loader.remove(); return }

    // performance.now() at this point ≈ how long the overlay has been up since
    // navigation start — our proxy for "did this actually cover a load?".
    const shownFor = (typeof performance !== 'undefined' && performance.now)
      ? performance.now() : INSTANT_MS + 1

    if (shownFor < INSTANT_MS) { fadeOut(); return } // effectively instant — just fade

    // Real load: play one quick complete cycle, then fade.
    loader.classList.add('pl-finishing')
    setTimeout(fadeOut, QUICK_CYCLE_MS)
  }

  const fontsReady = (document.fonts && document.fonts.ready) || Promise.resolve()
  Promise.resolve(fontsReady).then(dismiss)
  setTimeout(dismiss, 3000) // hard ceiling — never trap the page behind the overlay
}
