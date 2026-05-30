import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'

gsap.registerPlugin(ScrollTrigger)

const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches

// ── Hero entrance ─────────────────────────────────────────────────────────────
export function initHeroAnimation() {
  if (reduced) return

  const eyebrow  = document.querySelector('.hero-eyebrow')
  const heading  = document.querySelector('.hero h1')
  const body     = document.querySelector('.hero-body')
  const actions  = document.querySelectorAll('.hero-actions .btn')
  const notices  = document.querySelector('.studio-notices')
  const media    = document.querySelector('.hero-media')

  if (!heading) return

  const tl = gsap.timeline({
    defaults: { ease: 'power3.out' },
    delay: 0.1,
  })

  if (eyebrow) tl.from(eyebrow, { opacity: 0, x: -20, duration: 0.7 })

  tl.from(heading, {
    opacity: 0, y: 40, duration: 0.9, ease: 'power4.out',
  }, eyebrow ? '-=0.4' : 0)

  if (body)    tl.from(body,    { opacity: 0, y: 20, duration: 0.7 }, '-=0.5')
  if (actions.length) {
    tl.from(actions, { opacity: 0, y: 16, stagger: 0.1, duration: 0.6 }, '-=0.45')
  }
  if (notices) tl.from(notices, { opacity: 0, y: 12, duration: 0.6 }, '-=0.35')
  if (media)   tl.from(media,   { opacity: 0, x: 24, duration: 0.9, ease: 'power2.out' }, 0.1)
}

// ── Helper: reveal from vars on scroll ────────────────────────────────────────
function revealFrom(selector, fromVars, triggerVars = {}) {
  gsap.utils.toArray(selector).forEach(el => {
    gsap.from(el, {
      scrollTrigger: {
        trigger: el,
        start: 'top 88%',
        once: true,
        ...triggerVars,
      },
      ...fromVars,
    })
  })
}

// ── Scroll-triggered animations ───────────────────────────────────────────────
export function initScrollAnimations() {
  if (reduced) return

  // Eyebrows — slide from left
  revealFrom('.eyebrow', { opacity: 0, x: -20, duration: 0.65, ease: 'power2.out' })

  // Section titles
  revealFrom('.section-title, .page-hero__title', {
    opacity: 0, y: 28, duration: 0.85, ease: 'power3.out',
  })

  // Body / serif notes
  revealFrom('.body-text, .serif-note', {
    opacity: 0, y: 18, duration: 0.7, ease: 'power2.out',
  })

  // Portfolio tiles — stagger per grid
  const grids = document.querySelectorAll('.portfolio-grid')
  grids.forEach(grid => {
    const tiles = grid.querySelectorAll('.tile')
    if (!tiles.length) return
    gsap.from(tiles, {
      scrollTrigger: { trigger: grid, start: 'top 85%', once: true },
      opacity: 0, y: 28, duration: 0.8, ease: 'power2.out',
      stagger: { amount: 0.55, from: 'start' },
    })
  })

  // Masonry tiles (portfolio page)
  const masonry = document.querySelectorAll('.gallery--masonry')
  masonry.forEach(grid => {
    const tiles = grid.querySelectorAll('.tile')
    if (!tiles.length) return
    gsap.from(tiles, {
      scrollTrigger: { trigger: grid, start: 'top 85%', once: true },
      opacity: 0, y: 24, duration: 0.75, ease: 'power2.out',
      stagger: { amount: 0.6, from: 'start' },
    })
  })

  // Specialism cards
  const specGrid = document.querySelector('.specialism-grid')
  if (specGrid) {
    gsap.from(specGrid.querySelectorAll('.specialism-card'), {
      scrollTrigger: { trigger: specGrid, start: 'top 85%', once: true },
      opacity: 0, y: 32, duration: 0.85, ease: 'power3.out',
      stagger: { amount: 0.4 },
    })
  }

  // Process steps
  const procGrid = document.querySelector('.process-grid')
  if (procGrid) {
    gsap.from(procGrid.querySelectorAll('.process-step'), {
      scrollTrigger: { trigger: procGrid, start: 'top 85%', once: true },
      opacity: 0, y: 28, duration: 0.8, ease: 'power2.out',
      stagger: { amount: 0.5 },
    })
  }

  // Testimonials
  const testGrid = document.querySelector('.testimonials-grid')
  if (testGrid) {
    gsap.from(testGrid.querySelectorAll('.testimonial'), {
      scrollTrigger: { trigger: testGrid, start: 'top 85%', once: true },
      opacity: 0, y: 24, duration: 0.75, ease: 'power2.out',
      stagger: { amount: 0.35 },
    })
  }

  // Flash grid
  const flashGrid = document.querySelector('.flash__grid')
  if (flashGrid) {
    gsap.from(flashGrid.querySelectorAll('.flash__item'), {
      scrollTrigger: { trigger: flashGrid, start: 'top 88%', once: true },
      opacity: 0, y: 20, duration: 0.7, ease: 'power2.out',
      stagger: { amount: 0.4 },
    })
  }

  // Page-hero (inner pages) — immediate timeline
  const pageTitle = document.querySelector('.page-hero__title')
  const pageEye   = document.querySelector('.page-hero .eyebrow')
  if (pageTitle) {
    const tl = gsap.timeline({ defaults: { ease: 'power3.out' }, delay: 0.1 })
    if (pageEye) tl.from(pageEye,   { opacity: 0, x: -16, duration: 0.65 })
    tl.from(pageTitle, { opacity: 0, y: 32, duration: 0.85 }, pageEye ? '-=0.35' : 0)
  }

  // Mobile sticky CTA — appears after hero scrolls out
  const mobileCta = document.getElementById('mobile-cta')
  const hero      = document.querySelector('.hero')

  if (mobileCta && hero) {
    const obs = new IntersectionObserver(([e]) => {
      const show = !e.isIntersecting
      mobileCta.classList.toggle('visible', show)
      mobileCta.setAttribute('aria-hidden', String(!show))
    }, { threshold: 0 })
    obs.observe(hero)
  }
}
