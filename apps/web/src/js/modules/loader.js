// ── Page preloader dismissal ──────────────────────────────────────────────────
// The overlay (#page-loader) and its critical CSS are injected at build time by
// src/build/loader.js. It exists for ONE job: the COLD first load, where the
// render-blocking CSS + `display=swap` fonts arrive slowly (the reported iPad
// flash). It covers from first paint, then fades once the page is genuinely ready
// (document.fonts.ready — the font swap is the main cause of the visible reflow),
// with a hard ceiling so a hung font/network never traps the visitor and a pure-CSS
// failsafe in case this bundle never runs.
//
// On a WARM in-session navigation the page is already cached (fonts + CSS resolve
// on first paint, no flash) and — where supported — a cross-document View
// Transition (styles/components/atmosphere.css) already cross-fades the pages. So
// the cover is pure friction there: worse, the View Transition snapshots the
// incoming page's first paint, which IS the cover, so every navigation became a
// fade *through* the cream loader. We therefore drop the cover instantly on warm
// navigations — synchronously here at DOMContentLoaded, which runs before the View
// Transition snapshots the new page, plus a `pagereveal` guard for the same — so a
// navigation reads as a clean content→content cross-fade.
//
// "Warm" = this tab has already loaded a page this session (sessionStorage flag).
// First load in the tab is cold (cover shown); everything after is warm.
//
// Entrance coordination: the cover hides the page until it lifts, so the GSAP
// entrance must not play *behind* it (wasted) on a slow cold load. `pageReady`
// resolves the moment the page should be revealed — immediately on a warm nav or
// a page with no cover, and as the cold cover *begins* to fade — and main.js
// gates `motion-ready` + the on-load entrance on it, so content rises in exactly
// as the cover lifts. It always resolves (even with no overlay) so the reveal can
// never be stranded; the motion.css failsafe is the backstop if this never runs.
//
// No-ops when the overlay is absent (e.g. a stripped test page), so it's safe in
// the shared main.js init on every page.
const SESSION_KEY = 'bs-visited'

let signalReady
/** Resolves when the page should be revealed (cover lifting / warm nav / no cover). */
export const pageReady = new Promise(resolve => { signalReady = resolve })

export function initPageLoader() {
  const loader = document.getElementById('page-loader')
  if (!loader) { signalReady(); return }

  const root    = document.documentElement
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches

  let warm = false
  try {
    warm = sessionStorage.getItem(SESSION_KEY) === '1'
    sessionStorage.setItem(SESSION_KEY, '1')
  } catch { /* private mode / disabled — treat as cold, the safe default */ }

  let gone = false
  const removeNow = () => {
    if (gone) return
    gone = true
    root.classList.add('page-loaded')
    loader.remove()
    signalReady()   // warm nav: reveal immediately (composes with the View Transition)
  }

  // Warm navigation: drop the cover with no fade of its own, before the incoming
  // View Transition captures it, so the VT cross-fades real content. A `pagereveal`
  // guard belts-and-braces the timing on browsers with cross-document transitions.
  if (warm) {
    removeNow()
    window.addEventListener('pagereveal', () => removeNow(), { once: true })
    return
  }
  window.addEventListener('pagereveal', e => { if (e.viewTransition) removeNow() }, { once: true })

  // Cold load: hold the cover until the page is ready, then fade it out.
  let dismissed = false
  function dismiss() {
    if (dismissed || gone) return
    dismissed = true
    root.classList.add('page-loaded')   // cover starts its fade here…
    signalReady()                        // …and the entrance starts with it

    // Reduced motion: no fade — remove straight away so it can't trap focus/clicks.
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

  const fontsReady = (document.fonts?.ready) || Promise.resolve()
  Promise.resolve(fontsReady).then(dismiss)
  setTimeout(dismiss, 3000) // hard ceiling — never trap the page behind the overlay
}
