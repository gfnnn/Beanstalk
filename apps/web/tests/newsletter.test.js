// @vitest-environment jsdom
//
// Behaviour tests for the newsletter signup module (src/js/modules/newsletter.js).
// It drives every `form[data-newsletter]` on the page — the dedicated form and the
// inline capture band share this one implementation — so the correctness-critical
// logic worth pinning is: client-side validation (email shape + consent gate),
// the POST payload shape, and the success/already/error branches (success-panel
// swap vs. inline fallback, the "already subscribed" note, button restore). The
// network is mocked; no real Worker/Resend call. The module reads its endpoint
// from config.js, so we assert the request happened rather than the exact URL.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { initNewsletter } from '../src/js/modules/newsletter.js'

const $ = sel => document.querySelector(sel)
const submit = form => form.dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }))
// Let the async submit handler's awaited fetch/json microtasks settle.
const flush = () => new Promise(r => setTimeout(r, 0))

// A form with the full set of hooks the module looks for, plus a success panel.
function setup({ withConsent = true, withSuccessPanel = true } = {}) {
  document.body.innerHTML = `
    <form data-newsletter ${withSuccessPanel ? 'data-nl-success="#nl-success"' : ''}>
      <input name="email" value="">
      ${withConsent ? '<input type="checkbox" name="consent">' : ''}
      <p data-nl-feedback hidden></p>
      <button type="submit">Subscribe</button>
    </form>
    ${withSuccessPanel ? '<div id="nl-success" hidden tabindex="-1"><span data-already hidden>Already on the list</span></div>' : ''}
  `
  return $('form[data-newsletter]')
}

const fillValid = form => {
  form.querySelector('[name="email"]').value = 'reader@example.com'
  const consent = form.querySelector('[name="consent"]')
  if (consent) consent.checked = true
}

const mockFetch = (ok, json, status = 200) =>
  vi.fn().mockResolvedValue({ ok, status, json: () => Promise.resolve(json) })

beforeEach(() => { document.body.innerHTML = '' })
afterEach(() => { vi.restoreAllMocks(); delete global.fetch })

describe('initNewsletter', () => {
  it('no-ops when there is no newsletter form on the page', () => {
    document.body.innerHTML = '<div></div>'
    expect(() => initNewsletter()).not.toThrow()
  })

  describe('client-side validation (no network)', () => {
    it('rejects an invalid email and shows the feedback message without fetching', () => {
      global.fetch = mockFetch(true, {})
      const form = setup()
      initNewsletter()
      form.querySelector('[name="email"]').value = 'not-an-email'
      submit(form)
      expect($('[data-nl-feedback]').hidden).toBe(false)
      expect($('[data-nl-feedback]').textContent).toMatch(/valid email/i)
      expect(global.fetch).not.toHaveBeenCalled()
    })

    it('blocks submission when the consent box is present but unticked', () => {
      global.fetch = mockFetch(true, {})
      const form = setup()
      initNewsletter()
      form.querySelector('[name="email"]').value = 'reader@example.com' // valid email…
      // …but consent left unchecked
      submit(form)
      expect($('[data-nl-feedback]').textContent).toMatch(/tick the box/i)
      expect(global.fetch).not.toHaveBeenCalled()
    })
  })

  describe('successful subscribe', () => {
    it('POSTs { fields } as JSON and reveals the success panel, hiding the form', async () => {
      global.fetch = mockFetch(true, { ok: true })
      const form = setup()
      initNewsletter()
      fillValid(form)
      submit(form)
      await flush()

      expect(global.fetch).toHaveBeenCalledTimes(1)
      const [, opts] = global.fetch.mock.calls[0]
      expect(opts.method).toBe('POST')
      expect(opts.headers['Content-Type']).toBe('application/json')
      expect(JSON.parse(opts.body)).toEqual({ fields: { email: 'reader@example.com', consent: 'on' } })

      expect(form.hidden).toBe(true)
      expect($('#nl-success').hidden).toBe(false)
    })

    it('ignores a re-entrant submit while one is in flight (no duplicate POST)', async () => {
      // The disabled button blocks a second click, but a keyboard submit (Enter in
      // the email field) would re-enter the handler; the in-flight guard must stop it.
      let resolveFetch
      global.fetch = vi.fn(() => new Promise(r => { resolveFetch = r }))
      const form = setup()
      initNewsletter()
      fillValid(form)
      submit(form) // first submit — fetch now pending, button in loading state
      submit(form) // re-entrant submit while still in flight — must be ignored
      expect(global.fetch).toHaveBeenCalledTimes(1)
      resolveFetch({ ok: true, status: 200, json: () => Promise.resolve({ ok: true }) })
      await flush()
      expect(global.fetch).toHaveBeenCalledTimes(1)
    })

    it('reveals the "already subscribed" note when the worker reports already:true', async () => {
      global.fetch = mockFetch(true, { already: true })
      const form = setup()
      initNewsletter()
      fillValid(form)
      submit(form)
      await flush()
      expect($('#nl-success [data-already]').hidden).toBe(false)
    })

    it('falls back to an inline confirmation when no success panel is wired', async () => {
      global.fetch = mockFetch(true, { ok: true })
      const form = setup({ withSuccessPanel: false })
      initNewsletter()
      fillValid(form)
      submit(form)
      await flush()
      expect(form.hidden).toBe(false) // no panel to swap to
      expect($('[data-nl-feedback]').hidden).toBe(false)
      expect($('[data-nl-feedback]').textContent).toMatch(/on the list/i)
    })
  })

  describe('failure handling', () => {
    it('surfaces the worker error message and re-enables the button', async () => {
      global.fetch = mockFetch(false, { error: 'Audience unavailable' }, 500)
      const form = setup()
      initNewsletter()
      fillValid(form)
      const btn = form.querySelector('[type="submit"]')
      submit(form)
      await flush()

      expect($('[data-nl-feedback]').textContent).toBe('Audience unavailable')
      expect(form.hidden).toBe(false)          // form stays put on error
      expect(btn.disabled).toBe(false)         // restored in finally
      expect(btn.textContent).toBe('Subscribe') // original label restored
    })

    it('recovers from a network throw with a friendly message', async () => {
      global.fetch = vi.fn().mockRejectedValue(new Error('offline'))
      vi.spyOn(console, 'error').mockImplementation(() => {})
      const form = setup()
      initNewsletter()
      fillValid(form)
      submit(form)
      await flush()
      expect($('[data-nl-feedback]').hidden).toBe(false)
      expect($('[data-nl-feedback]').textContent).toBe('offline')
    })
  })
})
