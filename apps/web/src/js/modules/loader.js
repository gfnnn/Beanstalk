// ── Page preloader dismissal ──────────────────────────────────────────────────
// The overlay (#page-loader) and its critical CSS are injected at build time by
// src/build/loader.js — it covers every page from the first paint so the slow
// CSS/font arrival never shows as "broken" content (the reported iPad flash). This
// module fades it out the moment the page is genuinely ready.
//
// "Ready" = document.fonts.ready: the font swap is the main cause of the visible
// reflow, so we hold the cover until fonts have settled, then dismiss immediately
// (no artificial minimum — fast/cached loads feel instant). A hard ceiling
// guarantees we never strand a visitor behind the overlay if a font/network hangs,
// and the CSS carries its own failsafe for the case where this bundle never runs.
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
    root.classList.add('page-loaded')

    // Under reduced motion the fade is disabled — remove the node straight away so
    // it can't intercept clicks or hold focus.
    if (reduced) { loader.remove(); return }

    let removed = false
    const remove = () => { if (!removed) { removed = true; loader.remove() } }
    loader.addEventListener('transitionend', e => {
      if (e.propertyName === 'opacity') remove()
    }, { once: true })
    // transitionend can be skipped (backgrounded tab, interrupted transition), so
    // guarantee the node is gone shortly after the fade would have finished.
    setTimeout(remove, 700)
  }

  const fontsReady = (document.fonts && document.fonts.ready) || Promise.resolve()
  Promise.resolve(fontsReady).then(dismiss)
  setTimeout(dismiss, 3000) // hard ceiling — never trap the page behind the overlay
}
