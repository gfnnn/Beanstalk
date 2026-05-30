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
    smoothTouch: false,
    touchMultiplier: 2,
  })

  // Keep ScrollTrigger's scroll position in sync with Lenis
  lenis.on('scroll', ScrollTrigger.update)

  // Drive Lenis from GSAP's ticker so they share the same rAF loop
  gsap.ticker.add(time => lenis.raf(time * 1000))
  gsap.ticker.lagSmoothing(0)

  return lenis
}

// Pause/resume for modals, overlays, etc.
export function pauseScroll()  { lenis?.stop() }
export function resumeScroll() { lenis?.start() }

export { lenis }
