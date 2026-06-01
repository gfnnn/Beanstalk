export function initFaq() {
  const items = document.querySelectorAll('.faq-item')
  if (!items.length) return

  // ── Accordion ─────────────────────────────────────────────────────────────
  items.forEach(item => {
    const trigger = item.querySelector('.faq-item-trigger')
    if (!trigger) return

    trigger.addEventListener('click', () => {
      const isOpen = item.classList.contains('open')

      // Close all
      items.forEach(i => {
        i.classList.remove('open')
        const t = i.querySelector('.faq-item-trigger')
        if (t) t.setAttribute('aria-expanded', 'false')
      })

      // Open clicked (if was closed)
      if (!isOpen) {
        item.classList.add('open')
        trigger.setAttribute('aria-expanded', 'true')
      }
    })

    trigger.addEventListener('keydown', e => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault()
        trigger.click()
      }
    })
  })

  // ── Category filter ───────────────────────────────────────────────────────
  const cats = document.querySelectorAll('.faq-cat')
  cats.forEach(cat => {
    cat.addEventListener('click', () => {
      cats.forEach(c => c.classList.remove('active'))
      cat.classList.add('active')
      const chosen = cat.dataset.cat
      items.forEach(item => {
        const match = chosen === 'all' || item.dataset.category === chosen
        item.style.display = match ? '' : 'none'
      })
      checkEmpty()
    })
  })

  // ── Search ────────────────────────────────────────────────────────────────
  const searchInput = document.getElementById('faq-search-input')
  if (searchInput) {
    searchInput.addEventListener('input', () => {
      const q = searchInput.value.toLowerCase().trim()
      if (q) {
        cats.forEach(c => c.classList.toggle('active', c.dataset.cat === 'all'))
      }
      items.forEach(item => {
        if (!q) { item.style.display = ''; return }
        const text = (item.dataset.question || '') +
                     (item.querySelector('.faq-answer-inner')?.textContent || '')
        item.style.display = text.toLowerCase().includes(q) ? '' : 'none'
      })
      checkEmpty()
    })
  }

  function checkEmpty() {
    const empty = document.getElementById('faq-empty')
    if (!empty) return
    const anyVisible = Array.from(items).some(i => i.style.display !== 'none')
    empty.style.display = anyVisible ? 'none' : 'block'
  }
}
