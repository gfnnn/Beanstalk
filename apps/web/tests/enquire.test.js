// @vitest-environment jsdom
//
// Behaviour tests for the multi-step enquiry form (src/js/modules/enquire.js).
// We cover the synchronous, correctness-critical logic: step-gating validation,
// the pill multi-select cap, the conditional field groups that disable their
// inputs while hidden (the module's comment is explicit that disabled inputs are
// kept out of the submitted payload, so a flash enquiry can't carry stale
// custom-only answers), and — for an enquiry with no image attachments — the
// submit path: the full re-validation gate, the `{ fields, images }` POST shape,
// the in-flight re-entrant guard, and the success / server-error / network-throw
// branches with the button restored. Only the *image preview + downscale* half of
// submit (URL.createObjectURL, createImageBitmap, canvas, FileReader) leans on
// browser-only APIs and stays in the E2E tier — exercising the submit path with no
// files attached keeps `collectImages()` off those APIs, so the rest is reachable
// under jsdom (matching the newsletter/flash submit suites).
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { initEnquire } from '../src/js/modules/enquire.js'
import { track } from '../src/js/modules/analytics.js'

// Stub analytics so the success path's track() call is observable and side-effect
// free (the real module no-ops until a provider is wired in, but mocking lets us
// assert the event fires and keeps the suite independent of that).
vi.mock('../src/js/modules/analytics.js', () => ({ track: vi.fn() }))

function setup() {
  document.body.innerHTML = `
    <form id="enquiry-form" novalidate>
      <div id="progress-fill"></div>
      <div id="progress-pct"></div>

      <fieldset id="step-1">
        <div class="field"><input name="name" required></div>
        <button type="button" id="step1-next">next</button>
      </fieldset>

      <fieldset id="step-2">
        <div class="field">
          <div class="pill-group" data-max="2">
            <label class="pill"><input type="checkbox" name="styles[]" value="a"></label>
            <label class="pill"><input type="checkbox" name="styles[]" value="b"></label>
            <label class="pill"><input type="checkbox" name="styles[]" value="c"></label>
          </div>
        </div>
        <div id="idea-field"><textarea name="idea"></textarea></div>
        <label><input type="radio" name="tattoo_type" value="custom">custom</label>
        <label><input type="radio" name="tattoo_type" value="flash">flash</label>
        <button type="button" id="step2-back">back</button>
        <button type="button" id="step2-next">next</button>
      </fieldset>

      <fieldset id="step-3">
        <label><input type="radio" name="coverup" value="yes">yes</label>
        <label><input type="radio" name="coverup" value="no">no</label>
        <div id="coverup-field"><input name="coverup_note"></div>
        <button type="button" id="step3-back">back</button>
        <button type="button" id="step3-next">next</button>
      </fieldset>

      <fieldset id="step-4">
        <div class="field">
          <label class="checkbox-row"><input type="checkbox" name="consent" required></label>
        </div>
        <button type="button" id="step4-back">back</button>
        <div class="step-footer"></div>
        <button type="submit" id="submit-btn">Send</button>
      </fieldset>
    </form>
  `
}

const $ = id => document.getElementById(id)
const click = el => el.dispatchEvent(new window.Event('click', { bubbles: true }))
const change = el => el.dispatchEvent(new window.Event('change', { bubbles: true }))

beforeEach(() => {
  try { sessionStorage.clear() } catch (_) {}
  document.body.innerHTML = ''
  // jsdom doesn't implement scrollIntoView (universal in real browsers); stub it
  // so the submit path's "jump to first error" doesn't reject.
  window.Element.prototype.scrollIntoView = () => {}
})
afterEach(() => { vi.restoreAllMocks(); vi.mocked(track).mockClear(); delete global.fetch })

describe('initEnquire', () => {
  it('no-ops when the first step is absent (runs safely on non-enquiry pages)', () => {
    document.body.innerHTML = '<div></div>'
    expect(() => initEnquire()).not.toThrow()
  })

  describe('step-gating validation', () => {
    it('blocks advancing past a step with an empty required field and flags it', () => {
      setup()
      initEnquire()
      click($('step1-next'))
      expect(document.querySelector('#step-1 .field').classList.contains('error')).toBe(true)
      expect($('progress-pct').textContent).toBe('') // setStep never ran → still on step 1
    })

    it('advances once the required field is filled, clearing the error', () => {
      setup()
      initEnquire()
      click($('step1-next')) // fails first
      document.querySelector('[name="name"]').value = 'Robin'
      click($('step1-next'))
      expect($('progress-pct').textContent).toBe('Step 2 of 4')
      expect(document.querySelector('#step-1 .field').classList.contains('error')).toBe(false)
    })

    it('back never validates — it always steps backward', () => {
      setup()
      initEnquire()
      document.querySelector('[name="name"]').value = 'Robin'
      click($('step1-next')) // → step 2
      click($('step2-back')) // → step 1, no validation gate
      expect($('progress-pct').textContent).toBe('Step 1 of 4')
    })
  })

  describe('pill multi-select cap (data-max)', () => {
    it('disables the remaining pills once the cap is reached, and re-enables on deselect', () => {
      setup()
      initEnquire()
      const [a, b, c] = [...document.querySelectorAll('[name="styles[]"]')]

      a.checked = true; change(a)
      b.checked = true; change(b)
      expect(c.disabled).toBe(true) // at the cap of 2 → third is locked out
      expect(c.closest('.pill').classList.contains('disabled')).toBe(true)

      b.checked = false; change(b)
      expect(c.disabled).toBe(false) // back under the cap → re-enabled
    })
  })

  describe('accordion (collapse / reveal / edit)', () => {
    it('collapses a finished step and reveals only the next one', () => {
      setup()
      initEnquire()
      document.querySelector('[name="name"]').value = 'Robin'
      click($('step1-next'))

      expect($('step-1').classList.contains('complete')).toBe(true)   // collapsed up
      expect($('step-2').classList.contains('active')).toBe(true)     // now open
      expect($('step-3').classList.contains('upcoming')).toBe(true)   // still hidden
      expect($('step-4').classList.contains('upcoming')).toBe(true)
      expect($('step-3').hasAttribute('inert')).toBe(true)            // out of the a11y tree
    })

    it('re-opens a completed step when its header is clicked, keeping later steps reachable', () => {
      setup()
      // Give step-1 a real header so the edit click can be wired.
      const header = document.createElement('div')
      header.className = 'step-header'
      $('step-1').prepend(header)
      $('step-1').dataset.step = '1'

      initEnquire()
      document.querySelector('[name="name"]').value = 'Robin'
      click($('step1-next')) // → step 2, step 1 collapsed

      header.dispatchEvent(new window.Event('click', { bubbles: true }))
      expect($('step-1').classList.contains('active')).toBe(true)
      // step 2 was reached, so it stays available (collapsed), not hidden away
      expect($('step-2').classList.contains('upcoming')).toBe(false)
      expect($('step-2').classList.contains('complete')).toBe(true)
    })
  })

  describe('field validation (regex / plausibility)', () => {
    function richSetup() {
      document.body.innerHTML = `
        <form id="enquiry-form" novalidate>
          <div id="progress-fill"></div>
          <div id="progress-pct"></div>
          <fieldset id="step-1" data-step="1">
            <div class="field"><input id="first-name" name="first_name" required></div>
            <div class="field"><input id="email" type="email" name="email" required></div>
            <div class="field"><input id="dob" type="date" name="dob" required></div>
            <button type="button" id="step1-next">next</button>
          </fieldset>
          <fieldset id="step-2"><button type="button" id="step2-next">next</button></fieldset>
          <fieldset id="step-3"><button type="button" id="step3-next">next</button></fieldset>
          <fieldset id="step-4"><div class="step-footer"></div><button type="submit" id="submit-btn">Send</button></fieldset>
        </form>`
    }
    const adultDob = () => {
      const d = new Date(); d.setFullYear(d.getFullYear() - 25)
      return d.toISOString().slice(0, 10)
    }
    const childDob = () => {
      const d = new Date(); d.setFullYear(d.getFullYear() - 10)
      return d.toISOString().slice(0, 10)
    }
    const fillValid = () => {
      $('first-name').value = 'Robin'
      $('email').value = 'robin@example.com'
      $('dob').value = adultDob()
    }

    it('rejects a malformed email and a junk name, then passes once corrected', () => {
      richSetup(); initEnquire()
      fillValid()
      $('email').value = 'not-an-email'
      $('first-name').value = 'R0b1n123'
      click($('step1-next'))
      expect($('email').closest('.field').classList.contains('error')).toBe(true)
      expect($('first-name').closest('.field').classList.contains('error')).toBe(true)
      expect($('progress-pct').textContent).toBe('') // never advanced

      fillValid()
      click($('step1-next'))
      expect($('progress-pct').textContent).toBe('Step 2 of 4')
    })

    it('rejects a date of birth under 18', () => {
      richSetup(); initEnquire()
      fillValid()
      $('dob').value = childDob()
      click($('step1-next'))
      expect($('dob').closest('.field').classList.contains('error')).toBe(true)
      expect($('dob').closest('.field').querySelector('.field-error-msg').textContent)
        .toMatch(/over-18s/)
    })

    it('keeps a multi-checkbox field in error until every required box is ticked', () => {
      document.body.innerHTML = `
        <form id="enquiry-form" novalidate>
          <div id="progress-fill"></div><div id="progress-pct"></div>
          <fieldset id="step-1" data-step="1"><button type="button" id="step1-next">n</button></fieldset>
          <fieldset id="step-2"><button type="button" id="step2-next">n</button></fieldset>
          <fieldset id="step-3"><button type="button" id="step3-next">n</button></fieldset>
          <fieldset id="step-4" data-step="4">
            <div class="field">
              <div class="checkbox-row"><input type="checkbox" id="c1" required></div>
              <div class="checkbox-row"><input type="checkbox" id="c2" required></div>
            </div>
            <div class="step-footer"></div>
            <button type="submit" id="submit-btn">Send</button>
          </fieldset>
        </form>`
      initEnquire()
      const field = $('c1').closest('.field')
      // Submitting flags the field (both unticked)
      $('enquiry-form').dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }))
      expect(field.classList.contains('error')).toBe(true)
      // Ticking only the first must NOT clear the field — the second is still required
      $('c1').checked = true
      $('c1').dispatchEvent(new window.Event('change', { bubbles: true }))
      expect(field.classList.contains('error')).toBe(true)
      // Ticking the second clears it
      $('c2').checked = true
      $('c2').dispatchEvent(new window.Event('change', { bubbles: true }))
      expect(field.classList.contains('error')).toBe(false)
    })

    it('clears a field error live once the value is corrected', () => {
      richSetup(); initEnquire()
      click($('step1-next')) // flags the empty required fields
      const field = $('email').closest('.field')
      expect(field.classList.contains('error')).toBe(true)
      $('email').value = 'robin@example.com'
      $('email').dispatchEvent(new window.Event('input', { bubbles: true }))
      expect(field.classList.contains('error')).toBe(false)
    })

    it('reward early / punish late: typing lifts the error at once, blur re-judges', () => {
      richSetup(); initEnquire()
      fillValid()
      $('email').value = 'not-an-email'
      click($('step1-next')) // flags the bad email
      const field = $('email').closest('.field')
      expect(field.classList.contains('error')).toBe(true)

      // Mid-correction, still not a valid email — but the red lifts immediately so
      // a slow typer isn't scolded while they work.
      $('email').value = 'robin@exa'
      $('email').dispatchEvent(new window.Event('input', { bubbles: true }))
      expect(field.classList.contains('error')).toBe(false)

      // Leaving the field re-checks it — still invalid, so it flags again.
      $('email').dispatchEvent(new window.Event('blur', { bubbles: true }))
      expect(field.classList.contains('error')).toBe(true)

      // Finish the correction; blur now leaves it clean.
      $('email').value = 'robin@example.com'
      $('email').dispatchEvent(new window.Event('input', { bubbles: true }))
      $('email').dispatchEvent(new window.Event('blur', { bubbles: true }))
      expect(field.classList.contains('error')).toBe(false)
    })

    it('never validates a field live until it has first been flagged', () => {
      richSetup(); initEnquire()
      const field = $('email').closest('.field')
      // Type a bad value before ever submitting — no nagging, no error.
      $('email').value = 'nope'
      $('email').dispatchEvent(new window.Event('input', { bubbles: true }))
      $('email').dispatchEvent(new window.Event('blur', { bubbles: true }))
      expect(field.classList.contains('error')).toBe(false)
    })

    it('distinguishes an over-long name from a stray-character one', () => {
      richSetup(); initEnquire()
      fillValid()
      $('first-name').value = 'a'.repeat(60)
      click($('step1-next'))
      expect($('first-name').closest('.field').querySelector('.field-error-msg').textContent)
        .toMatch(/shorten/i)

      $('first-name').value = 'Ann@'
      $('first-name').dispatchEvent(new window.Event('input', { bubbles: true }))
      $('first-name').dispatchEvent(new window.Event('blur', { bubbles: true }))
      expect($('first-name').closest('.field').querySelector('.field-error-msg').textContent)
        .toMatch(/letters|hyphens|apostrophes/i)
    })
  })

  describe('conditional field groups', () => {
    it('hides the idea field and disables its inputs when flash is chosen', () => {
      setup()
      initEnquire()
      const flash = document.querySelector('[name="tattoo_type"][value="flash"]')
      flash.checked = true; change(flash)

      expect($('idea-field').style.display).toBe('none')
      expect(document.querySelector('[name="idea"]').disabled).toBe(true)
    })

    it('restores the idea field and re-enables its inputs when custom is chosen', () => {
      setup()
      initEnquire()
      const flash = document.querySelector('[name="tattoo_type"][value="flash"]')
      flash.checked = true; change(flash)
      const custom = document.querySelector('[name="tattoo_type"][value="custom"]')
      custom.checked = true; change(custom)

      expect($('idea-field').style.display).toBe('')
      expect(document.querySelector('[name="idea"]').disabled).toBe(false)
    })

    it('starts the cover-up field hidden with its input disabled (kept out of the payload)', () => {
      setup()
      initEnquire()
      expect($('coverup-field').style.display).toBe('none')
      expect(document.querySelector('[name="coverup_note"]').disabled).toBe(true)
    })

    it('reveals the cover-up field and enables its input when "yes" is chosen', () => {
      setup()
      initEnquire()
      const yes = document.querySelector('[name="coverup"][value="yes"]')
      yes.checked = true; change(yes)
      expect($('coverup-field').style.display).toBe('')
      expect(document.querySelector('[name="coverup_note"]').disabled).toBe(false)
    })
  })

  // The submit path with NO attachments — so collectImages() returns [] without
  // touching the browser-only image APIs. We pin the full re-validation gate, the
  // payload shape, the in-flight guard, and the success / failure branches.
  describe('submit (no attachments)', () => {
    const submit = form =>
      form.dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }))
    const flush = () => new Promise(r => setTimeout(r, 0))
    const mockFetch = (ok, json, status = 200) =>
      vi.fn().mockResolvedValue({ ok, status, json: () => Promise.resolve(json) })

    // A complete four-step form with all required fields valid: steps 2 & 3 carry
    // no required/validated fields, so the whole form passes once 1 & 4 are filled.
    const adultDob = () => {
      const d = new Date(); d.setFullYear(d.getFullYear() - 25)
      return d.toISOString().slice(0, 10)
    }
    const DOB = adultDob()
    function fullForm() {
      document.body.innerHTML = `
        <form id="enquiry-form" novalidate>
          <div id="progress-fill"></div>
          <div id="progress-pct"></div>
          <fieldset id="step-1" data-step="1">
            <div class="field"><input id="first-name" name="first_name" required></div>
            <div class="field"><input id="email" type="email" name="email" required></div>
            <div class="field"><input id="dob" type="date" name="dob" required></div>
            <button type="button" id="step1-next">next</button>
          </fieldset>
          <fieldset id="step-2" data-step="2">
            <label><input type="radio" name="tattoo_type" value="custom" checked>custom</label>
            <button type="button" id="step2-next">next</button>
          </fieldset>
          <fieldset id="step-3" data-step="3"><button type="button" id="step3-next">next</button></fieldset>
          <fieldset id="step-4" data-step="4">
            <div class="field">
              <label class="checkbox-row"><input id="consent" type="checkbox" name="consent" required></label>
            </div>
            <div class="step-footer"></div>
            <button type="submit" id="submit-btn">Send</button>
          </fieldset>
        </form>`
      return $('enquiry-form')
    }
    const fillValid = () => {
      $('first-name').value = 'Robin'
      $('email').value = 'robin@example.com'
      $('dob').value = DOB
      $('consent').checked = true
    }

    it('re-validates every step on submit and jumps to the first gap without POSTing', () => {
      global.fetch = mockFetch(true, { ok: true })
      const form = fullForm()
      initEnquire()
      // Step 4's consent is unticked → the submit must be blocked even though Next
      // only ever gated steps 1-3.
      $('first-name').value = 'Robin'
      $('email').value = 'robin@example.com'
      $('dob').value = DOB
      submit(form)
      expect(global.fetch).not.toHaveBeenCalled()
      expect($('consent').closest('.field').classList.contains('error')).toBe(true)
      expect($('progress-pct').textContent).toBe('Step 4 of 4') // jumped to the gap
    })

    it('POSTs { fields, images: [] } as JSON, tracks the event, and clears the saved step', async () => {
      global.fetch = mockFetch(true, { ok: true })
      const form = fullForm()
      initEnquire()
      fillValid()
      submit(form)
      await flush()

      expect(global.fetch).toHaveBeenCalledTimes(1)
      const [, opts] = global.fetch.mock.calls[0]
      expect(opts.method).toBe('POST')
      expect(opts.headers['Content-Type']).toBe('application/json')
      expect(JSON.parse(opts.body)).toEqual({
        fields: { first_name: 'Robin', email: 'robin@example.com', dob: DOB, tattoo_type: 'custom', consent: 'on' },
        images: [],
      })
      expect(vi.mocked(track)).toHaveBeenCalledWith('enquiry_submit', { type: 'custom' })
      expect(sessionStorage.getItem('beansprout_step')).toBeNull()
    })

    it('ignores a re-entrant submit while one is already in flight (no duplicate POST)', async () => {
      // A keyboard submit (Enter) can re-enter the handler even though the button is
      // disabled; the dataset.loading guard must stop the second POST.
      let resolveFetch
      global.fetch = vi.fn(() => new Promise(r => { resolveFetch = r }))
      const form = fullForm()
      initEnquire()
      fillValid()
      submit(form)   // first — validates, enters loading, then awaits collectImages
      await flush()  // let it reach the (now pending) fetch
      expect(global.fetch).toHaveBeenCalledTimes(1)
      submit(form)   // re-entrant while the fetch is still in flight — must be ignored
      expect(global.fetch).toHaveBeenCalledTimes(1)
      resolveFetch({ ok: true, status: 200, json: () => Promise.resolve({ ok: true }) })
      await flush()
      expect(global.fetch).toHaveBeenCalledTimes(1)
    })

    it('surfaces the worker error message in a banner and restores the button on a non-ok response', async () => {
      global.fetch = mockFetch(false, { error: 'Inbox full, try again shortly.' }, 500)
      const form = fullForm()
      initEnquire()
      fillValid()
      submit(form)
      await flush()

      expect($('form-error-banner').textContent).toBe('Inbox full, try again shortly.')
      const btn = $('submit-btn')
      expect(btn.dataset.loading).toBeUndefined() // clearButtonLoading ran
      expect(btn.disabled).toBe(false)
    })

    it('recovers from a network throw with a friendly banner and a restored button', async () => {
      global.fetch = vi.fn().mockRejectedValue(new Error('offline'))
      vi.spyOn(console, 'error').mockImplementation(() => {})
      const form = fullForm()
      initEnquire()
      fillValid()
      submit(form)
      await flush()

      expect($('form-error-banner').textContent).toBe('offline')
      expect($('submit-btn').disabled).toBe(false)
    })
  })
})
