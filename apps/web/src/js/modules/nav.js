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
  }

  const closeDrawer = () => {
    hamburger.classList.remove('open')
    hamburger.setAttribute('aria-expanded', 'false')
    drawer.classList.remove('open')
    drawer.setAttribute('aria-hidden', 'true')
    // Hidden drawer keeps focusable links out of the tab order (matches aria-hidden).
    drawer.setAttribute('inert', '')
    document.body.style.overflow = ''
  }

  hamburger.addEventListener('click', () => {
    drawer.classList.contains('open') ? closeDrawer() : openDrawer()
  })

  drawer.querySelectorAll('a').forEach(link => {
    link.addEventListener('click', closeDrawer)
  })

  document.addEventListener('keydown', e => {
    // Only act when the drawer is actually open, so Escape elsewhere (closing the
    // lightbox / flash modal) can't clobber the body overflow another component set.
    if (e.key === 'Escape' && drawer.classList.contains('open')) closeDrawer()
  })
}
