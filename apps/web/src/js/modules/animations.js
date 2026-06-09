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

// ── Helper: reveal a group as a staggered cascade, on demand ──────────────────
// The homepage card feel, exposed for content a page MODULE reveals itself at
// runtime rather than on load — e.g. the aftercare step / rule lists, which live
// inside a `[hidden]` stage until a dressing route is picked, so a load-time
// scroll trigger can't measure them. Centralised here so every cascade across the
// site shares one vocabulary (per-item `each` stagger, gentle rise, blur-free).
// Reduced motion and empty inputs no-op; `clearProps:'transform'` strips the
// inline transform afterwards so hover / sticky states settle at their true spot.
export function cascadeReveal(items, { y = 16, each = 0.06, duration = 0.6, ease = 'power2.out', delay = 0 } = {}) {
  if (reduced) return
  const list = gsap.utils.toArray(items).filter(Boolean)
  if (!list.length) return
  gsap.from(list, {
    opacity: 0, y, duration, ease,
    stagger: { each, from: 'start' },
    delay, clearProps: 'transform',
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
  // clearProps:'transform' so GSAP strips the inline transform it would otherwise
  // leave on each card at the end of the cascade. That residual `transform:
  // translate(0,0)` is inline, so it overrides any CSS `:hover`/transition transform
  // on the same element (the flash cards lift on hover) — and if the entrance is
  // interrupted mid-flight (e.g. the flash grid re-sorting when the live-status fetch
  // resolves), it can leave a card resting a few px off. Clearing it lets each card
  // settle at its true CSS position with the hover transition intact.
  const vars = { opacity: 0, y, duration, ease, stagger: { each, from: 'start' }, clearProps: 'transform' }
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

  // ── Unified section reveal — ONE registry, every page ───────────────────────
  // Reveals each section's eyebrow / heading / body the same way site-wide: the
  // generic semantic classes the homepage uses, PLUS the per-page bespoke
  // equivalents inner pages invented (`.chooser-*`, `.contact-*`, `.newsletter-
  // band-*`) — so a page can't quietly fall out of motion coverage just by naming
  // its header differently. A faint blur-to-sharp ("coming into focus through
  // foliage", §3-C) rides the headings only; offsets shrink on mobile to protect
  // the budget.
  //
  // A CLAIM guard skips anything already animated by another pass — explicit
  // `.reveal` wrappers, the hero / page-header entrance timelines, the filter-bar
  // cascade, the grid card cascades (revealGroup), and the dynamic regions a page
  // module reveals itself (the aftercare stage, the enquiry steps) — so the
  // registry never DOUBLE-animates an element. Above-the-fold elements play an
  // on-LOAD cascade sequenced after the header; the rest reveal on their own
  // scroll trigger (matching `.reveal` + revealGroup). motion.css FOUC-guards the
  // above-the-fold bespoke headers so they don't flash before this runs. Adding a
  // new section header => use a listed class, or add its class here.
  const mobile = window.matchMedia('(max-width: 899px)').matches
  const roles = [
    ['.eyebrow, .chooser-eyebrow', 0,
      { opacity: 0, x: mobile ? -14 : -20, duration: mobile ? 0.6 : 0.65, ease: 'power2.out' }],
    ['.section-title, .page-hero__title, .chooser-heading, .contact-heading, .newsletter-band-title', 0.08,
      { opacity: 0, y: mobile ? 16 : 28, filter: `blur(${mobile ? 4 : 6}px)`, duration: mobile ? 0.7 : 0.85, ease: 'power3.out' }],
    ['.body-text, .serif-note, .chooser-sub, .contact-subhead, .newsletter-band-sub', 0.16,
      { opacity: 0, y: mobile ? 12 : 18, duration: mobile ? 0.6 : 0.7, ease: 'power2.out' }],
  ]
  const claimed =
    '.reveal, .hero, .page-header, .filter-bar, [hidden], .care-stage, .form-steps, ' +
    '.portfolio-grid, .masonry, .gallery--masonry, .specialism-grid, .process-grid, ' +
    '.testimonials-grid, .flash-grid'
  roles.forEach(([sel, base, vars]) => {
    document.querySelectorAll(sel).forEach(el => {
      if (el.closest(claimed)) return                 // already animated elsewhere
      const aboveFold = el.getBoundingClientRect().top < window.innerHeight * 0.9
      if (aboveFold) {
        gsap.from(el, { ...vars, delay: 0.4 + base })             // on-load, after the header
      } else {
        gsap.from(el, { ...vars, scrollTrigger: { trigger: el, start: 'top 88%', once: true } })
      }
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

  // ── Enquiry form column — a gentle on-load entrance so the form doesn't sit
  //    static while its aside cards (`.reveal`) settle in. Just the progress bar +
  //    the active step (the rest are display:none); a light rise only, NO blur so
  //    the fields stay crisp — and crucially NO opacity. The form is the page's
  //    whole purpose, so its visibility must never hinge on this tween finishing:
  //    motion.css holds it hidden only until `.motion-ready` (backed by the 2s
  //    failsafe), and from there CSS keeps it at opacity:1. Animating opacity here
  //    would let an interrupted / never-completed tween strand the form at
  //    opacity:0 with that failsafe already removed — the reported "enquiry form
  //    blank on mobile". A transform-only rise can't strand it: worst case the form
  //    rests a few px low but is fully visible. `clearProps` drops the inline
  //    transform on finish so the sticky progress bar settles at its true spot.
  const formIntro = [
    document.querySelector('.progress-wrap'),
    document.querySelector('.form-step.active'),
  ].filter(Boolean)
  if (formIntro.length) {
    gsap.from(formIntro, {
      y: 14, duration: 0.6, ease: 'power2.out', stagger: 0.1, delay: 0.45,
      clearProps: 'transform',
    })
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
  //    Below the fold → reveal on scroll as each crosses into view. Above the fold
  //    on load → play an on-LOAD reveal instead of a ScrollTrigger. A `from()` +
  //    ScrollTrigger whose `start` is ALREADY passed at creation (the element sits
  //    in the first viewport) doesn't animate — ScrollTrigger resolves it straight
  //    to its end state, so the element just appears with no blur-fade. That's the
  //    reported "blur fade-in broken on load" on inner pages (worst on 404 /
  //    enquiry-received / per-piece pages, whose whole entrance is this path). It's
  //    the same reason revealGroup sequences above-the-fold grids on load rather
  //    than on a trigger — match it here. `.reveal-d1/2/3` becomes the on-load
  //    stagger (the cascade #134 intends for those first-viewport blocks).
  document.querySelectorAll('.reveal').forEach(el => {
    const step = el.classList.contains('reveal-d3') ? 0.3
               : el.classList.contains('reveal-d2') ? 0.2
               : el.classList.contains('reveal-d1') ? 0.1 : 0
    const vars = { opacity: 0, y: 20, filter: 'blur(4px)', duration: 0.7, ease: 'power2.out' }
    const aboveFold = el.getBoundingClientRect().top < window.innerHeight * 0.9
    if (aboveFold) {
      gsap.from(el, { ...vars, delay: 0.4 + step })   // on-load cascade, after the header entrance
    } else {
      gsap.from(el, {
        ...vars,
        delay: step,
        scrollTrigger: { trigger: el, start: 'top 90%', once: true },
      })
    }
  })

  // ── Keep ScrollTrigger accurate across resize / orientation changes ────────
  let resizeTimer
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimer)
    resizeTimer = setTimeout(() => ScrollTrigger.refresh(), 150)
  }, { passive: true })

  // Orientation changes are handled in lenis.js (which also re-measures Lenis and
  // then refreshes ScrollTrigger after the same delay) — so we don't double-refresh
  // here. The resize handler above still covers plain window resizes.
}
