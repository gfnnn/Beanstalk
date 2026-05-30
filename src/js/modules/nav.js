export function initNav() {
  const nav    = document.getElementById('nav')
  const toggle = nav?.querySelector('.nav__toggle')
  const links  = nav?.querySelector('.nav__links')
  if (!nav) return

  // Scrolled state via sentinel
  const sentinel = document.createElement('div')
  sentinel.style.cssText = 'position:absolute;top:0;height:1px;width:1px;pointer-events:none'
  document.body.prepend(sentinel)

  new IntersectionObserver(
    ([e]) => nav.classList.toggle('is-scrolled', !e.isIntersecting),
    { threshold: 0 }
  ).observe(sentinel)

  // Active link
  const currentPath = window.location.pathname.replace(/\/$/, '') || '/'
  nav.querySelectorAll('.nav__link').forEach(link => {
    const href = link.getAttribute('href')?.replace(/\/$/, '') || ''
    if (href && href !== '/' && currentPath.startsWith(href)) {
      link.classList.add('is-active')
    }
  })

  // Mobile toggle
  if (!toggle || !links) return

  const openMenu = () => {
    links.classList.add('is-open')
    toggle.classList.add('is-open')
    toggle.setAttribute('aria-expanded', 'true')
    document.body.style.overflow = 'hidden'
  }

  const closeMenu = () => {
    links.classList.remove('is-open')
    toggle.classList.remove('is-open')
    toggle.setAttribute('aria-expanded', 'false')
    document.body.style.overflow = ''
  }

  toggle.addEventListener('click', () => {
    links.classList.contains('is-open') ? closeMenu() : openMenu()
  })

  links.querySelectorAll('a').forEach(a => {
    a.addEventListener('click', closeMenu)
  })

  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') closeMenu()
  })
}
