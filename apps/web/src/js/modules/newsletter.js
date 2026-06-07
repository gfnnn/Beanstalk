import { NEWSLETTER_FN_URL } from './config.js'
import { track } from './analytics.js'
import { setButtonLoading, clearButtonLoading } from './spinner.js'

// Newsletter signup — POSTs { fields } to the Cloudflare Worker, which adds the
// subscriber to a Resend Audience. Drives EVERY `form[data-newsletter]` on the
// page, so the dedicated /newsletter/ form and the inline capture band (see
// src/build/newsletter-inline.js) share one implementation. No-ops on pages with
// no such form. Per-form hooks (all scoped within the form unless noted):
//   input[name="email"]      the email field
//   input[name="consent"]    the consent checkbox (optional)
//   [type="submit"]          the submit button
//   [data-nl-feedback]       inline error region (role="alert")
//   data-nl-success="#id"    (on the form) selector for the success panel to
//                            reveal on success; the form is hidden in its place
const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/

export function initNewsletter() {
  const forms = document.querySelectorAll('form[data-newsletter]')
  forms.forEach(wireForm)
}

function wireForm(form) {
  const submitBtn = form.querySelector('[type="submit"]')
  const feedback  = form.querySelector('[data-nl-feedback]')
  const consent   = form.querySelector('input[name="consent"]')
  const emailIn   = form.querySelector('input[name="email"]')
  const successEl = form.dataset.nlSuccess
    ? document.querySelector(form.dataset.nlSuccess)
    : null

  const showError = msg => {
    if (!feedback) return
    feedback.textContent = msg
    feedback.hidden = false
  }
  const clearError = () => {
    if (!feedback) return
    feedback.textContent = ''
    feedback.hidden = true
  }

  form.addEventListener('submit', async e => {
    e.preventDefault()
    // Ignore a re-entrant submit (e.g. Enter pressed in the email field) while a
    // request is already in flight, so a keyboard submit can't fire a duplicate POST.
    if (submitBtn?.dataset.loading === 'true') return
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

    setButtonLoading(submitBtn, 'Subscribing…')

    try {
      const res  = await fetch(NEWSLETTER_FN_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fields }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(json.error || 'Something went wrong. Please try again.')

      track('newsletter_signup', { already: !!json.already })

      // Success — swap the form for its confirmation panel.
      if (successEl) {
        if (json.already) {
          const note = successEl.querySelector('[data-already]')
          if (note) note.hidden = false
        }
        form.hidden = true
        successEl.hidden = false
        successEl.focus?.()
      } else {
        // No panel wired — fall back to an inline confirmation in the feedback slot.
        if (feedback) {
          feedback.textContent = 'You’re on the list — thanks for signing up.'
          feedback.hidden = false
        }
      }
    } catch (err) {
      console.error('Newsletter signup error:', err)
      showError(err.message || 'Couldn’t subscribe just now. Please try again, or email hello@beansprout.ink.')
    } finally {
      clearButtonLoading(submitBtn)
    }
  })
}
