// ── Page preloader dismissal ──────────────────────────────────────────────────
// The overlay (#page-loader) and its critical CSS are injected at build time by
// src/build/loader.js. It exists for ONE job: the COLD first load, where the
// render-blocking CSS + `display=swap` fonts arrive slowly (the reported iPad
// flash). It covers from first paint, then lifts once the page is genuinely ready
// (document.fonts.ready — the font swap is the main cause of the visible reflow),
// with a hard ceiling so a hung font/network never traps the visitor and a pure-CSS
// failsafe in case this bundle never runs.
//
// HOW LONG the cover stays is bimodal — all-or-nothing, tuned to perception.
// Lifting the moment the page was ready (the old behaviour) made awkward middles:
// a load that took ~0.5–1.5s showed the cover just long enough to register, then
// yanked it away mid-breathe — the reported "flash / half-played" jank. So at
// ready-time the dismissal decides once:
//   · QUICK — the cover has been visible ≤ QUICK_LIFT_MS: lift immediately. The
//     glimpse is sub-perceptual, and the page entrance starts as the fade begins,
//     so the visitor never sits longer than that without content or motion.
//   · COMMIT — seen any longer: the visitor has consciously registered the cover,
//     so it holds to MIN_SHOW_MS total visible time (a full breathe beat), then
//     fades. The performance always completes; it never half-plays.
// Visible time is measured from first-contentful-paint — the cover IS the first
// contentful paint. Where paint timing is unavailable the clock starts at init,
// which under-counts and so errs toward holding, never toward the flash. Reduced
// motion skips the hold (there is no performance to finish).
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
// "Warm" = this tab has already loaded a page this session (sessionStorage flag) —
// EXCEPT a mid-session RELOAD, which counts as cold: a reload re-fetches the
// render-blocking CSS/fonts and has no inbound View Transition, so the instant
// warm drop would re-expose exactly the unstyled/font-swap flash the cover exists
// to hide.
//
// Entrance coordination: the cover hides the page until it lifts, so the GSAP
// entrance must not play *behind* it (wasted) on a slow cold load. `pageReady`
// resolves the moment the page should be revealed — immediately on a warm nav or
// a page with no cover, and as the cold cover *begins* to fade (after any commit
// hold) — and main.js gates `motion-ready` + the on-load entrance on it, so
// content rises in exactly as the cover lifts. It always resolves (even with no
// overlay) so the reveal can never be stranded; the motion.css failsafe is the
// backstop if this never runs.
//
// No-ops when the overlay is absent (e.g. a stripped test page), so it's safe in
// the shared main.js init on every page.
const SESSION_KEY = 'bs-visited'

// The bimodal thresholds (see above). QUICK_LIFT_MS is the perception budget for
// "no preloader ran" — under it, a lift reads as the page simply arriving;
// MIN_SHOW_MS is the committed cover's minimum total visible time, sized so the
// mark plays a full breathe beat (half the 3.2s pl-breathe cycle) before the fade.
export const QUICK_LIFT_MS = 400
export const MIN_SHOW_MS = 1600

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
  // Mid-session reloads count as cold (see header): no View Transition is coming
  // and the render-blocking CSS/fonts are re-fetched, so the cover's job is back on.
  if (warm && performance.getEntriesByType?.('navigation')?.[0]?.type === 'reload') {
    warm = false
  }

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

  // A genuine cold first load (this is the only place the cover is actually shown).
  // Marks <html> so the orchestrated entrance can give the nav logo its one-time
  // ink-rise draw as the cover lifts — and ONLY here, so warm in-session navs let
  // the page transition carry the header instead of re-drawing it every time
  // (atmosphere.css: html.cold-start.motion-ready .nav-logo .brand-mark).
  root.classList.add('cold-start')

  // Cold load: when the page is ready, lift the cover — immediately if it was
  // barely seen (QUICK), or after completing MIN_SHOW_MS if it registered (COMMIT).
  const initAt = performance.now()
  const visibleSince = () => {
    const fcp = performance.getEntriesByName?.('first-contentful-paint')?.[0]
    return fcp ? fcp.startTime : initAt
  }

  function fadeOut() {
    if (gone) return
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

  let dismissed = false
  function dismiss() {
    if (dismissed || gone) return
    dismissed = true
    // Reduced motion: no performance to finish — lift as soon as the page is ready.
    if (reduced) { fadeOut(); return }
    const visible = performance.now() - visibleSince()
    const hold = visible <= QUICK_LIFT_MS ? 0 : Math.max(0, MIN_SHOW_MS - visible)
    if (hold > 0) setTimeout(fadeOut, hold)
    else fadeOut()
  }

  const fontsReady = (document.fonts?.ready) || Promise.resolve()
  Promise.resolve(fontsReady).then(dismiss)
  setTimeout(dismiss, 3000) // hard ceiling — never trap the page behind the overlay
}
