export function initScrollReveal() {
  const items = document.querySelectorAll('.gallery__item, .flash__item')
  if (!items.length) return

  const observer = new IntersectionObserver(
    entries => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-visible')
          observer.unobserve(entry.target)
        }
      })
    },
    { threshold: 0.08, rootMargin: '0px 0px -32px 0px' }
  )

  items.forEach((el, i) => {
    el.style.setProperty('--item-delay', `${i * 55}ms`)
    observer.observe(el)
  })
}

export function initHeroBg() {
  const bg = document.querySelector('.hero__bg-image')
  if (!bg) return
  // Trigger the subtle scale-in once loaded
  requestAnimationFrame(() => bg.classList.add('is-loaded'))
}
