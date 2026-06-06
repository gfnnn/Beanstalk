// ── Page transitions — fade the current page out before navigating ────────────
// A same-origin navigation should feel like the page leaves (fades away, header
// rules retract) and the next one arrives (builds in via its entrance), rather
// than a hard cut. This intercepts in-site link clicks, adds `html.is-leaving`
// (atmosphere.css does the fade + line retract), then navigates once the fade has
// run. The incoming page's normal load + entrance is the "arrive" half.
//
// Progressive enhancement / safety:
//   · reduced motion → we don't intercept at all (instant navigation).
//   · we only handle plain left-clicks on same-origin <a href> links — never
//     modified clicks (new tab), downloads, target=_blank, external/other-scheme
//     links, same-page hashes, or anything a closer handler already handled
//     (e.preventDefault, e.g. the portfolio lightbox tiles or the flash modal).
//   · a hard fallback timer guarantees navigation even if transitionend is missed.
//   · `pageshow` clears the class so a bfcache restore (Back button) is never left
//     showing a faded page.
const EXIT_MS = 460

export function initPageTransitions() {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return

  const root = document.documentElement
  let leaving = false

  // Back/forward (bfcache) can restore this document mid-leave — clear the state.
  window.addEventListener('pageshow', () => { leaving = false; root.classList.remove('is-leaving') })

  document.addEventListener('click', e => {
    if (leaving) { e.preventDefault(); return }
    // Let modified clicks, non-primary buttons and already-handled clicks through.
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return

    const a = e.target.closest('a[href]')
    if (!a || a.target === '_blank' || a.hasAttribute('download') || 'noTransition' in a.dataset) return

    let url
    try { url = new URL(a.href, location.href) } catch { return }
    if (url.origin !== location.origin) return                       // external / mailto / tel
    if (url.href === location.href) return                           // same URL
    if (url.pathname === location.pathname && url.hash) return       // in-page anchor

    e.preventDefault()
    leaving = true
    root.classList.add('is-leaving')

    const go = () => { window.location.href = url.href }
    let navigated = false
    const nav = () => { if (!navigated) { navigated = true; go() } }

    // Navigate the moment the fade finishes, with a fallback if transitionend
    // doesn't fire (e.g. a backgrounded tab or an interrupted transition).
    const main = document.querySelector('main')
    main?.addEventListener('transitionend', ev => {
      if (ev.propertyName === 'opacity') nav()
    }, { once: true })
    setTimeout(nav, EXIT_MS + 120)
  })
}
