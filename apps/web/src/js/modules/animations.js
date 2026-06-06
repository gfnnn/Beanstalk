import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'

gsap.registerPlugin(ScrollTrigger)

const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches

// ── Hero entrance ─────────────────────────────────────────────────────────────
export function initHeroAnimation() {
  if (reduced) {
    // CSS prefers-reduced-motion can't reach SMIL: freeze the hero sprig's
    // looping feTurbulence wobble so the page holds completely still.
    document.querySelector('.hero-sprig')?.pauseAnimations?.()
    return
  }

  const eyebrow = document.querySelector('.hero-eyebrow')
  const heading = document.querySelector('.hero h1')
  const body    = document.querySelector('.hero-body')
  const actions = document.querySelectorAll('.hero-actions .btn')
  const notices = document.querySelector('.studio-notices')
  const media   = document.querySelector('.hero-media')

  if (!heading) return

  // Text column entrance — identical on all viewports
  const tl = gsap.timeline({
    defaults: { ease: 'power3.out' },
    delay: 0.15,
  })

  if (eyebrow) tl.from(eyebrow, { opacity: 0, duration: 0.7 })

  tl.from(heading, {
    opacity: 0, y: 30, filter: 'blur(8px)', duration: 0.9, ease: 'power4.out',
  }, eyebrow ? '-=0.4' : 0)

  if (body)         tl.from(body,    { opacity: 0, y: 18, filter: 'blur(5px)', duration: 0.7 }, '-=0.5')
  if (actions.length) tl.from(actions, { opacity: 0, y: 14, stagger: 0.1, duration: 0.6 }, '-=0.45')
  if (notices)      tl.from(notices, { opacity: 0, y: 10, duration: 0.6 }, '-=0.35')

  // Botanical sprout *grows* (§3-A) on its own timeline, independent of the text
  // beats above so the choreography reads cleanly: seed → stem → leaves → crown,
  // then it settles into a slow living sway. This is a placeholder whose job is to
  // show off the motion for the artist, so it leans into GSAP's sequencing,
  // per-leaf stagger and springy eases rather than a single flat line-draw.
  growSprout()

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

// ── Hero sprout growth (placeholder showcase) ─────────────────────────────────
// Choreographs the botanical placeholder so it actually demonstrates the motion
// library: a seed splits, the stem climbs, leaf pairs spring open from their stem
// joints while inking in (staggered low → high), a young crown pops at the tip,
// then the whole sprig breathes in a slow perpetual sway. Every part self-inks via
// stroke-dashoffset (paths carry pathLength="1"); the unfurl is transform-only so
// it stays on the compositor. No-ops if the markup isn't present. Reduced motion is
// already handled by the early return in initHeroAnimation + the CSS fallback.
function growSprout() {
  const svg = document.querySelector('.hero-sprig')
  if (!svg) return

  const art    = svg.querySelector('.hero-sprig-art')
  const seed   = svg.querySelectorAll('.sprig-seed')
  const stem   = svg.querySelector('.sprig-stem')
  const leaves = gsap.utils.toArray(svg.querySelectorAll('.sprig-leaf'))
  const nub    = svg.querySelector('.sprig-nub')

  const grow = gsap.timeline({ delay: 0.35 })

  // 1. Seed casing + soil ink in.
  if (seed.length) {
    grow.fromTo(seed,
      { strokeDashoffset: 1, opacity: 0 },
      { strokeDashoffset: 0, opacity: 0.85, duration: 0.5, ease: 'power1.out' }, 0)
  }

  // 2. Stem climbs out of the seed.
  if (stem) {
    grow.fromTo(stem,
      { strokeDashoffset: 1 },
      { strokeDashoffset: 0, duration: 1.3, ease: 'power2.out' }, 0.15)
  }

  // 3. Leaf pairs unfurl as the stem passes them — each springs open from its joint
  //    (scale + rotate about its stem point) and inks in at the same time.
  leaves.forEach((leaf, i) => {
    const ox    = leaf.dataset.ox
    const oy    = leaf.dataset.oy
    const fold  = leaf.dataset.side === 'left' ? 40 : -40   // folded toward the stem
    const crown = leaf.dataset.oy === '98'                  // tip leaves pop livelier
    const blades = leaf.querySelectorAll('.hero-sprig-path')
    const at = 0.55 + i * 0.22

    grow.fromTo(leaf,
      { scale: 0, rotation: fold, svgOrigin: `${ox} ${oy}` },
      { scale: 1, rotation: 0, duration: 0.8, ease: crown ? 'back.out(2.2)' : 'back.out(1.6)' },
      at)
    grow.fromTo(blades,
      { strokeDashoffset: 1 },
      { strokeDashoffset: 0, duration: 0.6, ease: 'power1.out' },
      at + 0.05)
  })

  // 4. The growing tip curl inks in to finish the sprout.
  if (nub) {
    grow.fromTo(nub,
      { strokeDashoffset: 1 },
      { strokeDashoffset: 0, duration: 0.5, ease: 'power1.out' }, '>-0.25')
  }

  // 5. Settled and grown — a slow living sway from the base, forever (pairs with the
  //    feTurbulence "living ink" wobble). Small amplitude: felt, not noticed (§0).
  if (art) {
    grow.fromTo(art,
      { rotation: -1.2, svgOrigin: '70 288' },
      { rotation: 1.2, duration: 6.5, ease: 'sine.inOut', yoyo: true, repeat: -1 },
      '>-0.1')
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

// ── Helper: reveal a group of items (cards / tiles) as a staggered cascade ────
// The homepage feel. Two non-obvious choices make it read "graceful" everywhere:
//
//   1. Per-item stagger (`each`), not a fixed total (`amount`). A fixed total
//      divided across a big grid (the portfolio has 16+ tiles) leaves only ~15ms
//      between tiles — they fade in together as one "flash". A constant per-item
//      gap keeps the cascade visible no matter how many items there are; the
//      on-screen ones cascade, the rest finish off-screen unseen.
//   2. Above-the-fold groups (the portfolio / flash grids sit right under the
//      header) play a deliberate on-LOAD cascade sequenced just after the header,
//      instead of a ScrollTrigger that fires instantly and competes with it.
//      Below the fold they reveal on scroll as you reach them.
function revealGroup(items, { trigger, y = 22, duration = 0.7, ease = 'power2.out', each = 0.055, blur = 0 } = {}) {
  const list = gsap.utils.toArray(items)
  if (!list.length) return
  const root = trigger || list[0].parentElement
  const vars = { opacity: 0, y, duration, ease, stagger: { each, from: 'start' } }
  if (blur) vars.filter = `blur(${blur}px)`
  const aboveFold = root.getBoundingClientRect().top < window.innerHeight * 0.85
  if (aboveFold) {
    gsap.from(list, { ...vars, delay: 0.5 })   // continue the header's entrance
  } else {
    gsap.from(list, { ...vars, scrollTrigger: { trigger: root, start: 'top 85%', once: true } })
  }
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

  // ── Card / tile groups — staggered cascade (see revealGroup) ───────────────
  //    Homepage teaser grid + specialisms / process / testimonials (all below the
  //    fold → reveal on scroll), and the portfolio masonry + flash grids (above
  //    the fold → a deliberate on-load cascade after the header, no more "flash").
  document.querySelectorAll('.portfolio-grid').forEach(grid =>
    revealGroup(grid.querySelectorAll('.tile'), { trigger: grid, y: 24 }))

  document.querySelectorAll('.masonry, .gallery--masonry').forEach(grid =>
    revealGroup(grid.querySelectorAll('.masonry-tile, .tile'), { trigger: grid, y: 20 }))

  const specGrid = document.querySelector('.specialism-grid')
  if (specGrid) revealGroup(specGrid.querySelectorAll('.specialism-card'),
    { trigger: specGrid, y: 28, duration: 0.8, ease: 'power3.out', each: 0.1 })

  const procGrid = document.querySelector('.process-grid')
  if (procGrid) revealGroup(procGrid.querySelectorAll('.process-step'),
    { trigger: procGrid, y: 24, each: 0.09 })

  const testGrid = document.querySelector('.testimonials-grid')
  if (testGrid) revealGroup(testGrid.querySelectorAll('.testimonial'),
    { trigger: testGrid, y: 20, each: 0.09 })

  const flashGrid = document.querySelector('.flash-grid')
  if (flashGrid) revealGroup(flashGrid.querySelectorAll('.flash-card'),
    { trigger: flashGrid, y: 18 })

  // ── Page header (inner pages) — entrance timeline, mirrors the home hero ────
  //    Inner pages lead with `.page-header` (eyebrow · title · descriptor), the
  //    above-the-fold counterpart to the homepage hero. Give it the same on-load
  //    entrance so navigating into a page feels continuous instead of snapping in.
  //    (motion.css guards these so they don't flash before this runs.)
  const pageTitle = document.querySelector('.page-title')
  const pageEye   = document.querySelector('.page-eyebrow')
  const pageDesc  = document.querySelector('.page-descriptor')
  if (pageTitle) {
    const tl = gsap.timeline({ defaults: { ease: 'power3.out' }, delay: 0.1 })
    if (pageEye)  tl.from(pageEye,  { opacity: 0, duration: 0.65 })
    tl.from(pageTitle, { opacity: 0, y: 28, filter: 'blur(6px)', duration: 0.8 }, pageEye ? '-=0.35' : 0)
    if (pageDesc) tl.from(pageDesc, { opacity: 0, y: 16, duration: 0.7 }, '-=0.45')
  }

  // ── Filter bar (portfolio / flash) — chips + controls cascade in between the
  //    header and the grid, so the top of the page settles top-down instead of the
  //    bar popping in. Animate the children (not the sticky .filter-bar itself, so
  //    position:sticky is left untouched); above the fold → a brief on-load stagger
  //    sequenced after the header start. motion.css guards these against a flash.
  const filterBar = document.querySelector('.filter-bar')
  if (filterBar) {
    const controls = filterBar.querySelectorAll('.chip, .chip-more, .filter-select')
    if (controls.length) {
      gsap.from(controls, {
        opacity: 0, y: 8, duration: 0.5, ease: 'power2.out',
        stagger: { each: 0.035, from: 'start' }, delay: 0.3,
      })
    }
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
