import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'

gsap.registerPlugin(ScrollTrigger)

const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches

// ── Hero entrance ─────────────────────────────────────────────────────────────
export function initHeroAnimation() {
  if (reduced) return

  const eyebrow = document.querySelector('.hero-eyebrow')
  const heading = document.querySelector('.hero h1')
  const body    = document.querySelector('.hero-body')
  const actions = document.querySelectorAll('.hero-actions .btn')
  const notices = document.querySelector('.studio-notices')
  const media   = document.querySelector('.hero-media')
  const sprig   = document.querySelector('.hero-sprig-path')

  if (!heading) return

  // Text column entrance — identical on all viewports
  const tl = gsap.timeline({
    defaults: { ease: 'power3.out' },
    delay: 0.15,
  })

  if (eyebrow) tl.from(eyebrow, { opacity: 0, x: -20, duration: 0.7 })

  tl.from(heading, {
    opacity: 0, y: 30, filter: 'blur(8px)', duration: 0.9, ease: 'power4.out',
  }, eyebrow ? '-=0.4' : 0)

  if (body)         tl.from(body,    { opacity: 0, y: 18, filter: 'blur(5px)', duration: 0.7 }, '-=0.5')
  if (actions.length) tl.from(actions, { opacity: 0, y: 14, stagger: 0.1, duration: 0.6 }, '-=0.45')
  if (notices)      tl.from(notices, { opacity: 0, y: 10, duration: 0.6 }, '-=0.35')

  // Botanical sprig inks itself in (§3-A), a slow draw that lingers just past the
  // text settle. Explicit from:1 so the start state is correct regardless of CSS.
  if (sprig) {
    tl.fromTo(sprig,
      { strokeDashoffset: 1 },
      { strokeDashoffset: 0, duration: 1.9, ease: 'power1.inOut' },
      0.25)
  }

  // Media column — direction depends on CSS layout at the current viewport
  if (media) {
    const mm = gsap.matchMedia()

    // Mobile: media stacks above text, animate from slight upward position
    mm.add('(max-width: 899px)', () => {
      gsap.from(media, { opacity: 0, y: 20, duration: 0.85, ease: 'power2.out', delay: 0 })
    })

    // Desktop: media is the right column, slide in from the right edge
    mm.add('(min-width: 900px)', () => {
      gsap.from(media, { opacity: 0, x: 24, duration: 0.95, ease: 'power2.out', delay: 0.1 })
    })
  }
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

  // ── Shallow hero depth (§3-D) ───────────────────────────────────────────────
  // The botanical sprig drifts slightly slower than the page as the hero scrolls
  // away — a touch of "looking into a canopy" depth. Transform-only → compositor.
  const heroEl  = document.querySelector('.hero')
  const sprigEl = document.querySelector('.hero-sprig')
  if (heroEl && sprigEl) {
    gsap.to(sprigEl, {
      yPercent: -14,
      ease: 'none',
      scrollTrigger: { trigger: heroEl, start: 'top top', end: 'bottom top', scrub: true },
    })
  }

  const mm = gsap.matchMedia()

  // ── Text reveals — smaller offsets on mobile, full on desktop. A faint
  //    blur-to-sharp ("coming into focus through foliage", §3-C) rides on the
  //    headings only; tile grids stay blur-free to protect the mobile budget. ─
  mm.add('(max-width: 899px)', () => {
    revealFrom('.eyebrow', { opacity: 0, x: -14, duration: 0.6, ease: 'power2.out' })
    revealFrom('.section-title, .page-hero__title', {
      opacity: 0, y: 16, filter: 'blur(4px)', duration: 0.7, ease: 'power3.out',
    })
    revealFrom('.body-text, .serif-note', {
      opacity: 0, y: 12, duration: 0.6, ease: 'power2.out',
    })
  })

  mm.add('(min-width: 900px)', () => {
    revealFrom('.eyebrow', { opacity: 0, x: -20, duration: 0.65, ease: 'power2.out' })
    revealFrom('.section-title, .page-hero__title', {
      opacity: 0, y: 28, filter: 'blur(6px)', duration: 0.85, ease: 'power3.out',
    })
    revealFrom('.body-text, .serif-note', {
      opacity: 0, y: 18, duration: 0.7, ease: 'power2.out',
    })
  })

  // ── Portfolio tiles — stagger per grid ────────────────────────────────────
  document.querySelectorAll('.portfolio-grid').forEach(grid => {
    const tiles = grid.querySelectorAll('.tile')
    if (!tiles.length) return
    gsap.from(tiles, {
      scrollTrigger: { trigger: grid, start: 'top 85%', once: true },
      opacity: 0, y: 24, duration: 0.75, ease: 'power2.out',
      stagger: { amount: 0.5, from: 'start' },
    })
  })

  // ── Masonry tiles (gallery--masonry, legacy inner pages) ──────────────────
  document.querySelectorAll('.gallery--masonry').forEach(grid => {
    const tiles = grid.querySelectorAll('.tile')
    if (!tiles.length) return
    gsap.from(tiles, {
      scrollTrigger: { trigger: grid, start: 'top 85%', once: true },
      opacity: 0, y: 20, duration: 0.7, ease: 'power2.out',
      stagger: { amount: 0.5, from: 'start' },
    })
  })

  // ── Specialism cards ──────────────────────────────────────────────────────
  const specGrid = document.querySelector('.specialism-grid')
  if (specGrid) {
    gsap.from(specGrid.querySelectorAll('.specialism-card'), {
      scrollTrigger: { trigger: specGrid, start: 'top 85%', once: true },
      opacity: 0, y: 28, duration: 0.8, ease: 'power3.out',
      stagger: { amount: 0.4 },
    })
  }

  // ── Process steps ─────────────────────────────────────────────────────────
  const procGrid = document.querySelector('.process-grid')
  if (procGrid) {
    gsap.from(procGrid.querySelectorAll('.process-step'), {
      scrollTrigger: { trigger: procGrid, start: 'top 85%', once: true },
      opacity: 0, y: 24, duration: 0.75, ease: 'power2.out',
      stagger: { amount: 0.45 },
    })
  }

  // ── Testimonials ──────────────────────────────────────────────────────────
  const testGrid = document.querySelector('.testimonials-grid')
  if (testGrid) {
    gsap.from(testGrid.querySelectorAll('.testimonial'), {
      scrollTrigger: { trigger: testGrid, start: 'top 85%', once: true },
      opacity: 0, y: 20, duration: 0.7, ease: 'power2.out',
      stagger: { amount: 0.3 },
    })
  }

  // ── Flash grid ────────────────────────────────────────────────────────────
  const flashGrid = document.querySelector('.flash-grid')
  if (flashGrid) {
    gsap.from(flashGrid.querySelectorAll('.flash-card'), {
      scrollTrigger: { trigger: flashGrid, start: 'top 88%', once: true },
      opacity: 0, y: 18, duration: 0.65, ease: 'power2.out',
      stagger: { amount: 0.35 },
    })
  }

  // ── Page-hero (inner pages) — immediate timeline ───────────────────────────
  const pageTitle = document.querySelector('.page-hero__title')
  const pageEye   = document.querySelector('.page-hero .eyebrow')
  if (pageTitle) {
    const tl = gsap.timeline({ defaults: { ease: 'power3.out' }, delay: 0.1 })
    if (pageEye) tl.from(pageEye,   { opacity: 0, x: -16, duration: 0.65 })
    tl.from(pageTitle, { opacity: 0, y: 28, filter: 'blur(6px)', duration: 0.8 }, pageEye ? '-=0.35' : 0)
  }

  // ── Generic .reveal elements (about, visit, and other inner pages) ──────────
  document.querySelectorAll('.reveal').forEach(el => {
    const delay = el.classList.contains('reveal-d3') ? 0.3
                : el.classList.contains('reveal-d2') ? 0.2
                : el.classList.contains('reveal-d1') ? 0.1 : 0
    gsap.from(el, {
      scrollTrigger: { trigger: el, start: 'top 90%', once: true },
      opacity: 0, y: 20, filter: 'blur(4px)', duration: 0.7, ease: 'power2.out',
      delay,
    })
  })

  // ── Mobile sticky CTA — appears after hero scrolls out (home page only) ───
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

  // ── Keep ScrollTrigger accurate across resize / orientation changes ────────
  let resizeTimer
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimer)
    resizeTimer = setTimeout(() => ScrollTrigger.refresh(), 150)
  }, { passive: true })

  window.addEventListener('orientationchange', () => {
    // Extra delay for iOS to finish viewport recalculation
    setTimeout(() => ScrollTrigger.refresh(), 350)
  }, { passive: true })
}
