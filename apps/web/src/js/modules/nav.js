export function initNav() {
  const nav       = document.getElementById('main-nav')
  const hamburger = document.getElementById('nav-hamburger')
  const drawer    = document.getElementById('nav-drawer')
  const moreWrap  = document.getElementById('nav-more')
  const moreBtn   = document.getElementById('nav-more-btn')

  if (!nav) return

  // ── Scroll state (rAF-latched: at most one read/toggle per frame) ─────────
  let scrollTick = false
  window.addEventListener('scroll', () => {
    if (scrollTick) return
    scrollTick = true
    requestAnimationFrame(() => {
      nav.classList.toggle('scrolled', window.scrollY > 60)
      scrollTick = false
    })
  }, { passive: true })

  // ── Homepage: transparent nav over the full-screen mobile hero ─────────────
  // Keep the nav transparent (cream logo/burger — nav.css) while the video still
  // sits behind it, then flip it solid once the video is scrolled past. The
  // `.scrolled` 60px toggle is too eager (the video is a full screen tall), so
  // this watches the intro overlay (the video's height) instead. Scoped to
  // .page-home + mobile; a no-op on every other page/viewport.
  const overTarget = document.querySelector('.hero-intro') || document.querySelector('.hero')
  if (overTarget && document.body.classList.contains('page-home') && 'IntersectionObserver' in window) {
    const desktop = window.matchMedia('(min-width: 900px)')
    let overObs = null
    const connectOver = () => {
      if (desktop.matches) {
        overObs?.disconnect()
        overObs = null
        nav.classList.remove('over-hero')
        return
      }
      if (overObs) return
      nav.classList.add('over-hero') // transparent from the first paint
      // Offset the trigger by the nav's own height — read from the --nav-h token
      // (the nav is `height: var(--nav-h)`), the same source sticky.js uses, rather
      // than re-measuring offsetHeight with a magic-number fallback.
      const navH = getComputedStyle(document.documentElement)
        .getPropertyValue('--nav-h').trim() || '65px'
      overObs = new IntersectionObserver(([e]) => {
        nav.classList.toggle('over-hero', e.isIntersecting)
      }, { rootMargin: `-${navH} 0px 0px 0px`, threshold: 0 })
      overObs.observe(overTarget)
    }
    connectOver()
    desktop.addEventListener?.('change', connectOver)
  }

  // ── Active link ─────────────────────────────────────────
  // The mobile drawer is a SIBLING of #main-nav, not a descendant, so a query
  // scoped to `nav` would never reach its links — that's why the current-page
  // styling silently failed in the burger menu on any page lacking a hardcoded
  // `class="active"`. Select the inline nav links and the drawer links by id so
  // both light up regardless of DOM nesting; the CTA buttons (.btn) are skipped
  // so only real nav links pick up the current-page styling.
  const currentPath = window.location.pathname
  document.querySelectorAll('#main-nav .nav-links a, #nav-drawer a:not(.btn)').forEach(link => {
    const href = link.getAttribute('href')
    if (href && href !== '/' && currentPath.startsWith(href)) {
      link.classList.add('active')
      link.setAttribute('aria-current', 'page')
    }
  })

  // If the active link is inside the More dropdown, also mark the trigger
  const activeDropdownLink = nav.querySelector('.nav-dropdown a.active')
  if (activeDropdownLink && moreBtn) {
    moreBtn.classList.add('active')
  }

  // ── More dropdown ────────────────────────────────────────
  if (moreBtn && moreWrap) {
    moreBtn.addEventListener('click', e => {
      e.stopPropagation()
      const open = moreWrap.classList.toggle('open')
      moreBtn.setAttribute('aria-expanded', String(open))
    })

    document.addEventListener('click', () => {
      moreWrap.classList.remove('open')
      moreBtn.setAttribute('aria-expanded', 'false')
    })

    document.addEventListener('keydown', e => {
      if (e.key === 'Escape') {
        moreWrap.classList.remove('open')
        moreBtn.setAttribute('aria-expanded', 'false')
      }
    })
  }

  // ── Mobile hamburger + drawer ────────────────────────────
  if (!hamburger || !drawer) return

  const openDrawer = () => {
    hamburger.classList.add('open')
    hamburger.setAttribute('aria-expanded', 'true')
    drawer.classList.add('open')
    drawer.setAttribute('aria-hidden', 'false')
    // Drawer is now visible — re-expose its links to the tab order / a11y tree.
    drawer.removeAttribute('inert')
    document.body.style.overflow = 'hidden'
    // Force the (otherwise transparent-over-video) homepage nav solid so it
    // matches the opaque drawer beneath it.
    nav.classList.add('drawer-open')
  }

  const closeDrawer = () => {
    hamburger.classList.remove('open')
    hamburger.setAttribute('aria-expanded', 'false')
    drawer.classList.remove('open')
    drawer.setAttribute('aria-hidden', 'true')
    // Hidden drawer keeps focusable links out of the tab order (matches aria-hidden).
    drawer.setAttribute('inert', '')
    document.body.style.overflow = ''
    nav.classList.remove('drawer-open')
  }

  hamburger.addEventListener('click', () => {
    drawer.classList.contains('open') ? closeDrawer() : openDrawer()
  })

  // Following a drawer link is a page navigation — and we deliberately DON'T close
  // the drawer here. Animating it shut (the 250ms slide-up) played out *before* the
  // route cross-fade, so the menu visibly collapsed and only then did the page
  // transition begin — two separate steps. Leaving the drawer in place lets the
  // cross-document View Transition (styles/components/atmosphere.css) snapshot it
  // open and cross-fade the whole page — menu included — to the next route in one
  // motion, so the transition starts the instant the link is chosen. The incoming
  // page is a fresh document with the drawer closed, so the forward nav needs no
  // reset. The one case that does is a bfcache restore (Back/forward returning to
  // this still-open, scroll-locked drawer): reset it on `pageshow.persisted`, which
  // only fires on that restore — never during the outgoing snapshot — so it can't
  // affect the transition.
  window.addEventListener('pageshow', e => { if (e.persisted) closeDrawer() })

  document.addEventListener('keydown', e => {
    // Only act when the drawer is actually open, so Escape elsewhere (closing the
    // lightbox / flash modal) can't clobber the body overflow another component set.
    if (e.key === 'Escape' && drawer.classList.contains('open')) closeDrawer()
  })
}
