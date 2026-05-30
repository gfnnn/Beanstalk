import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'

gsap.registerPlugin(ScrollTrigger)

const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches

// ── Hero entrance ─────────────────────────────────────────────────────────────
export function initHeroAnimation() {
  if (reduced) return

  const eyebrow   = document.querySelector('.hero__eyebrow')
  const lines     = document.querySelectorAll('.hero__title-line')
  const tagline   = document.querySelector('.hero__tagline')
  const actions   = document.querySelectorAll('.hero__actions .btn')
  const scroll    = document.querySelector('.hero__scroll')

  if (!lines.length) return

  const tl = gsap.timeline({
    defaults: { ease: 'power4.out' },
    delay: 0.15,
  })

  if (eyebrow) {
    tl.from(eyebrow, { opacity: 0, x: -24, duration: 0.8 })
  }

  tl.from(lines, {
    opacity: 0,
    y: 80,
    duration: 1.1,
    stagger: 0.1,
  }, eyebrow ? '-=0.45' : 0)

  if (tagline) {
    tl.from(tagline, { opacity: 0, y: 24, duration: 0.75, ease: 'power3.out' }, '-=0.55')
  }

  if (actions.length) {
    tl.from(actions, {
      opacity: 0, y: 18, duration: 0.65, stagger: 0.1, ease: 'power2.out',
    }, '-=0.45')
  }

  if (scroll) {
    tl.from(scroll, { opacity: 0, duration: 0.8 }, '-=0.3')
  }
}

// ── Hero bg parallax (runs on scroll) ─────────────────────────────────────────
function initHeroParallax() {
  const bg = document.querySelector('.hero__bg-image')
  if (!bg) return

  // Subtle load scale (CSS handles this via .is-loaded class)
  requestAnimationFrame(() => bg.classList.add('is-loaded'))

  gsap.to(bg, {
    scrollTrigger: {
      trigger: '.hero',
      start: 'top top',
      end: 'bottom top',
      scrub: true,
    },
    y: 100,
    ease: 'none',
  })
}

// ── Scroll-triggered reveals ──────────────────────────────────────────────────
function revealFrom(selector, vars, triggerVars = {}) {
  gsap.utils.toArray(selector).forEach(el => {
    gsap.from(el, {
      scrollTrigger: {
        trigger: el,
        start: 'top 88%',
        once: true,
        ...triggerVars,
      },
      ...vars,
    })
  })
}

function initRevealAnimations() {
  // Section labels — slide from left
  revealFrom('.section-label', {
    opacity: 0, x: -20, duration: 0.65, ease: 'power2.out',
  })

  // Section & page titles — lift up
  revealFrom('.section-title, .page-hero__title', {
    opacity: 0, y: 36, duration: 0.9, ease: 'power3.out',
  })

  // Body copy & subtitles
  revealFrom('.body-text, .section-subtitle', {
    opacity: 0, y: 22, duration: 0.75, ease: 'power2.out',
  })

  // Booking CTA title (larger offset for drama)
  revealFrom('.booking-cta__title', {
    opacity: 0, y: 48, duration: 1.05, ease: 'power3.out',
  }, { start: 'top 82%' })

  // Buttons inside content sections (not hero)
  revealFrom(
    '.about-snippet__text .btn, .booking-cta__action .btn, .contact-info .btn',
    { opacity: 0, y: 16, duration: 0.65, ease: 'power2.out' },
    { start: 'top 90%' }
  )
}

// ── Gallery — stagger per grid/masonry container ──────────────────────────────
function initGalleryAnimations() {
  // Bento / home grid
  const grids = document.querySelectorAll('.gallery--grid')
  grids.forEach(grid => {
    const items = grid.querySelectorAll('.gallery__item')
    if (!items.length) return

    gsap.from(items, {
      scrollTrigger: {
        trigger: grid,
        start: 'top 85%',
        once: true,
      },
      opacity: 0,
      y: 32,
      duration: 0.85,
      ease: 'power2.out',
      stagger: { amount: 0.55, from: 'start' },
    })
  })

  // Masonry — portfolio page
  const masonry = document.querySelectorAll('.gallery--masonry')
  masonry.forEach(grid => {
    const items = grid.querySelectorAll('.gallery__item')
    if (!items.length) return

    gsap.from(items, {
      scrollTrigger: {
        trigger: grid,
        start: 'top 85%',
        once: true,
      },
      opacity: 0,
      y: 28,
      duration: 0.8,
      ease: 'power2.out',
      stagger: { amount: 0.7, from: 'start' },
    })
  })
}

// ── Flash grid stagger ────────────────────────────────────────────────────────
function initFlashAnimations() {
  const grid = document.querySelector('.flash__grid')
  if (!grid) return

  const items = grid.querySelectorAll('.flash__item')
  if (!items.length) return

  gsap.from(items, {
    scrollTrigger: {
      trigger: grid,
      start: 'top 88%',
      once: true,
    },
    opacity: 0,
    y: 24,
    duration: 0.75,
    ease: 'power2.out',
    stagger: { amount: 0.45 },
  })
}

// ── About image parallax ──────────────────────────────────────────────────────
function initAboutParallax() {
  const img = document.querySelector('.about-snippet__image')
  if (!img) return

  gsap.to(img, {
    scrollTrigger: {
      trigger: '.about-snippet',
      start: 'top bottom',
      end: 'bottom top',
      scrub: 1.5,
    },
    y: -56,
    ease: 'none',
  })
}

// ── Page-hero title (inner pages) ─────────────────────────────────────────────
function initPageHero() {
  const title = document.querySelector('.page-hero__title')
  const label = document.querySelector('.page-hero .section-label')
  if (!title) return

  const tl = gsap.timeline({ defaults: { ease: 'power3.out' }, delay: 0.1 })
  if (label) tl.from(label, { opacity: 0, x: -16, duration: 0.65 })
  tl.from(title, { opacity: 0, y: 40, duration: 0.9 }, label ? '-=0.35' : 0)
}

// ── Master init ───────────────────────────────────────────────────────────────
export function initScrollAnimations() {
  if (reduced) return

  initHeroParallax()
  initRevealAnimations()
  initGalleryAnimations()
  initFlashAnimations()
  initAboutParallax()
  initPageHero()
}
