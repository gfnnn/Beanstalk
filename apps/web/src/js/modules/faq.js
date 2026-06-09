import { lenis } from './lenis.js'

export function initFaq() {
  const items = [...document.querySelectorAll('.faq-item')]
  if (!items.length) return

  const cats        = [...document.querySelectorAll('.faq-cat')]
  const searchInput = document.getElementById('faq-search-input')
  const empty       = document.getElementById('faq-empty')
  const faqList     = document.getElementById('faq-list')

  const navH = () =>
    parseInt(getComputedStyle(document.documentElement).getPropertyValue('--nav-h'), 10) || 0

  // The topic list sits above the accordion only on the single-column mobile
  // layout; from 900px up it's a sticky sidebar beside the questions, so there's
  // nothing to scroll to. Mirrors the .faq-shell grid breakpoint in faq.css.
  const isStacked = () => !window.matchMedia('(min-width: 900px)').matches

  // On mobile, picking a topic should bring the (now-filtered) questions into
  // view — otherwise the list updates below the fold, under the chips, with no
  // visible feedback. Lands the first question just below the sticky nav.
  function scrollToQuestions() {
    if (!faqList || !isStacked()) return
    const top = faqList.getBoundingClientRect().top + window.scrollY - navH() - 12
    if (lenis) {
      lenis.scrollTo(top, { duration: 0.7 })
    } else {
      const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
      window.scrollTo({ top, behavior: reduced ? 'auto' : 'smooth' })
    }
  }

  // Single source of truth for what's shown. The category chips and the search box
  // are two filters over the same list, so they're tracked here and applied
  // together — never by each writing item.style.display behind the other's back
  // (which left the chips and the search field disagreeing about the list).
  let activeCat = 'all'
  let query     = ''

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
  cats.forEach(cat => {
    cat.addEventListener('click', () => {
      cats.forEach(c => c.classList.toggle('active', c === cat))
      activeCat = cat.dataset.cat
      // Picking a topic is a fresh browse: drop any search so the box and the
      // visible list can't disagree (a stale query lingering in the field while
      // category results show).
      if (searchInput) searchInput.value = ''
      query = ''
      apply()
      // Mobile only: bring the filtered list into view (no-op on the desktop
      // sidebar layout — see scrollToQuestions).
      scrollToQuestions()
    })
  })

  // ── Search ────────────────────────────────────────────────────────────────
  if (searchInput) {
    searchInput.addEventListener('input', () => {
      query = searchInput.value.toLowerCase().trim()
      // A search spans every topic, so snap the category chips back to "All" to
      // match what's being searched.
      if (query) {
        activeCat = 'all'
        cats.forEach(c => c.classList.toggle('active', c.dataset.cat === 'all'))
      }
      apply()
    })
  }

  // ── Apply both filters together ─────────────────────────────────────────────
  function apply() {
    let anyVisible = false
    items.forEach(item => {
      const matchCat  = activeCat === 'all' || item.dataset.category === activeCat
      const matchText = !query || haystack(item).includes(query)
      const show = matchCat && matchText
      item.style.display = show ? '' : 'none'
      if (show) {
        reveal(item)
        anyVisible = true
      }
    })
    if (empty) empty.style.display = anyVisible ? 'none' : 'block'
  }

  // The question text (data-question) + the answer body, lowercased, for search.
  function haystack(item) {
    return (`${item.dataset.question || ''} ${item.querySelector('.faq-answer-inner')?.textContent || ''}`).toLowerCase()
  }

  // Guarantee a filtered-in item is actually seen. Each .faq-item carries the
  // scroll-reveal entrance (.reveal), so once motion is ready GSAP holds the
  // below-the-fold ones at an inline opacity:0 (plus offset/blur) until their
  // ScrollTrigger fires. Filtering can surface such an item without ever scrolling
  // to it — leaving it display:block but invisible ("the right question, not
  // showing"). Clearing the inline hide styles the entrance left makes it visible.
  function reveal(item) {
    item.style.opacity   = ''
    item.style.transform = ''
    item.style.filter    = ''
  }
}
