export function initNav() {
  const nav       = document.getElementById('main-nav')
  const hamburger = document.getElementById('nav-hamburger')
  const drawer    = document.getElementById('nav-drawer')
  const moreWrap  = document.getElementById('nav-more')
  const moreBtn   = document.getElementById('nav-more-btn')

  if (!nav) return

  // ── Scroll state ────────────────────────────────────────
  window.addEventListener('scroll', () => {
    nav.classList.toggle('scrolled', window.scrollY > 60)
  }, { passive: true })

  // ── Active link ─────────────────────────────────────────
  const currentPath = window.location.pathname
  nav.querySelectorAll('.nav-links a, .nav-drawer a').forEach(link => {
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
    document.body.style.overflow = 'hidden'
  }

  const closeDrawer = () => {
    hamburger.classList.remove('open')
    hamburger.setAttribute('aria-expanded', 'false')
    drawer.classList.remove('open')
    drawer.setAttribute('aria-hidden', 'true')
    document.body.style.overflow = ''
  }

  hamburger.addEventListener('click', () => {
    drawer.classList.contains('open') ? closeDrawer() : openDrawer()
  })

  drawer.querySelectorAll('a').forEach(link => {
    link.addEventListener('click', closeDrawer)
  })

  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') closeDrawer()
  })
}
