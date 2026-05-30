import Lenis from 'lenis'
import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'

gsap.registerPlugin(ScrollTrigger)

let lenis = null

export function initLenis() {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return null

  lenis = new Lenis({
    duration: 1.2,
    easing: t => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
    smoothWheel: true,
    smoothTouch: false,  // native momentum scrolling on touch — don't override
    touchMultiplier: 2,
  })

  // Keep ScrollTrigger's scroll position in sync with Lenis
  lenis.on('scroll', ScrollTrigger.update)

  // Drive Lenis from GSAP's ticker so they share one rAF loop
  gsap.ticker.add(time => lenis.raf(time * 1000))
  gsap.ticker.lagSmoothing(0)

  // On orientation change, let the browser settle then recalculate
  // Lenis needs this to recompute scrollable height on mobile
  window.addEventListener('orientationchange', () => {
    setTimeout(() => {
      lenis.resize()
      ScrollTrigger.refresh()
    }, 350)
  }, { passive: true })

  return lenis
}

// Pause / resume for lightbox, overlays, etc.
export function pauseScroll()  { lenis?.stop() }
export function resumeScroll() { lenis?.start() }

export { lenis }
