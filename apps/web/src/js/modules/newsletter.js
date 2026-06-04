import { NEWSLETTER_FN_URL } from './config.js'
import { track } from './analytics.js'

// Newsletter signup — POSTs { fields } to the Netlify function, which adds the
// subscriber to a Resend Audience. No-ops on pages without the form.
export function initNewsletter() {
  const form = document.getElementById('newsletter-form')
  if (!form) return

  const submitBtn = document.getElementById('newsletter-submit')
  const feedback  = document.getElementById('newsletter-feedback')
  const successEl = document.getElementById('newsletter-success')
  const consent   = form.querySelector('input[name="consent"]')
  const emailIn   = form.querySelector('input[name="email"]')

  const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/

  function showError(msg) {
    if (!feedback) return
    feedback.textContent = msg
    feedback.hidden = false
  }
  function clearError() {
    if (!feedback) return
    feedback.textContent = ''
    feedback.hidden = true
  }

  form.addEventListener('submit', async e => {
    e.preventDefault()
    clearError()

    const fields = {}
    new FormData(form).forEach((v, k) => { fields[k] = v })

    // ── Client-side validation ──────────────────────────────────────────────
    const email = String(fields.email || '').trim()
    if (!EMAIL_RE.test(email)) {
      showError('Please enter a valid email address.')
      emailIn?.focus()
      return
    }
    if (consent && !consent.checked) {
      showError('Please tick the box to confirm you’re happy to receive emails.')
      return
    }

    const label = submitBtn ? submitBtn.textContent : ''
    if (submitBtn) { submitBtn.disabled = true; submitBtn.textContent = 'Subscribing…' }

    try {
      const res  = await fetch(NEWSLETTER_FN_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fields }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(json.error || 'Something went wrong. Please try again.')

      track('newsletter_signup', { already: !!json.already })
      // Success — swap the form for the confirmation panel.
      if (successEl) {
        if (json.already) {
          const note = successEl.querySelector('[data-already]')
          if (note) note.hidden = false
        }
        form.hidden = true
        successEl.hidden = false
        successEl.focus?.()
      }
    } catch (err) {
      console.error('Newsletter signup error:', err)
      showError(err.message || 'Couldn’t subscribe just now. Please try again, or email hello@beansprout.ink.')
    } finally {
      if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = label }
    }
  })
}
