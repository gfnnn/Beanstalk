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

    it('reuses one error banner across consecutive failures (no stacking alerts)', async () => {
      global.fetch = mockFetch(false, { error: 'First failure' }, 500)
      const form = fullForm()
      initEnquire()
      fillValid()
      submit(form); await flush()
      expect($('form-error-banner').textContent).toBe('First failure')

      global.fetch = mockFetch(false, { error: 'Second failure' }, 500)
      submit(form); await flush()
      expect(document.querySelectorAll('#form-error-banner, .form-error-banner')).toHaveLength(1)
      expect($('form-error-banner').textContent).toBe('Second failure')
    })

    it('falls back to the generic message when the failure body is unparseable', async () => {
      global.fetch = vi.fn().mockResolvedValue({ ok: false, status: 500, json: () => Promise.reject(new Error('bad json')) })
      const form = fullForm()
      initEnquire()
      fillValid()
      submit(form); await flush()
      expect($('form-error-banner').textContent).toMatch(/something went wrong/i)
    })

    it('tracks the submit type as "unknown" when no tattoo_type was chosen', async () => {
      global.fetch = mockFetch(true, { ok: true })
      const form = fullForm()
      document.querySelector('[name="tattoo_type"]').remove()
      initEnquire()
      fillValid()
      submit(form); await flush()
      expect(vi.mocked(track)).toHaveBeenCalledWith('enquiry_submit', { type: 'unknown' })
    })

    it('treats a missing step as valid (a trimmed form still submits)', async () => {
      global.fetch = mockFetch(true, { ok: true })
      const form = fullForm()
      $('step-3').remove()   // validateStep(3) must return true, render must skip it
      initEnquire()
      fillValid()
      submit(form); await flush()
      expect(global.fetch).toHaveBeenCalledTimes(1)
    })
  })

  // The image half of submit, minus the genuinely browser-only downscale: jsdom
  // has File + FileReader but no createImageBitmap, so downscaleImage() falls back
  // to sending the original — which is exactly the HEIC/undecodable-photo path a
  // real browser takes. collectImages' caps and payload shape are all reachable.
  describe('submit (attachments via the jsdom fallback path)', () => {
    const submit = form =>
      form.dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }))
    const mockFetch = (ok, json, status = 200) =>
      vi.fn().mockResolvedValue({ ok, status, json: () => Promise.resolve(json) })
    const adultDob = () => {
      const d = new Date(); d.setFullYear(d.getFullYear() - 25)
      return d.toISOString().slice(0, 10)
    }

    function formWithFiles() {
      document.body.innerHTML = `
        <form id="enquiry-form" novalidate>
          <div id="progress-fill"></div>
          <div id="progress-pct"></div>
          <fieldset id="step-1" data-step="1">
            <div class="field"><input id="first-name" name="first_name" required value="Robin"></div>
            <div class="field"><input id="email" type="email" name="email" required value="r@example.com"></div>
            <div class="field"><input id="dob" type="date" name="dob" required></div>
          </fieldset>
          <fieldset id="step-2" data-step="2"></fieldset>
          <fieldset id="step-3" data-step="3">
            <input id="refs" name="refs" type="file" multiple>
            <input id="coverup-img" name="coverup_img" type="file" disabled>
          </fieldset>
          <fieldset id="step-4" data-step="4">
            <div class="field">
              <label class="checkbox-row"><input id="consent" type="checkbox" name="consent" required checked></label>
            </div>
            <div class="step-footer"></div>
            <button type="submit" id="submit-btn">Send</button>
          </fieldset>
        </form>`
      $('dob').value = adultDob()
      return $('enquiry-form')
    }
    const attach = (inputId, files) => {
      Object.defineProperty($(inputId), 'files', { value: files, configurable: true })
    }
    const file = (name, content = 'png-bytes', type = 'image/png') =>
      new window.File([content], name, { type })

    it('base64-encodes attached files into the payload (original kept when downscale is unavailable)', async () => {
      global.fetch = mockFetch(true, { ok: true })
      const form = formWithFiles()
      initEnquire()
      attach('refs', [file('moth-ref.png')])
      submit(form)
      await vi.waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(1))

      const payload = JSON.parse(global.fetch.mock.calls[0][1].body)
      expect(payload.images).toHaveLength(1)
      expect(payload.images[0].name).toBe('moth-ref.png')   // no .jpg rename — nothing was re-encoded
      expect(payload.images[0].type).toBe('image/png')
      expect(atob(payload.images[0].data)).toBe('png-bytes') // round-trips to the original bytes
    })

    it('skips files on a DISABLED input (the hidden cover-up upload never leaks)', async () => {
      global.fetch = mockFetch(true, { ok: true })
      const form = formWithFiles()
      initEnquire()
      attach('refs', [file('keep.png')])
      attach('coverup-img', [file('leak.png')])   // input stays disabled
      submit(form)
      await vi.waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(1))
      const payload = JSON.parse(global.fetch.mock.calls[0][1].body)
      expect(payload.images.map(i => i.name)).toEqual(['keep.png'])
    })

    it('rejects more than 8 images with the banner, before any network call', async () => {
      global.fetch = mockFetch(true, { ok: true })
      vi.spyOn(console, 'error').mockImplementation(() => {})
      const form = formWithFiles()
      initEnquire()
      attach('refs', Array.from({ length: 9 }, (_, i) => file(`r${i}.png`)))
      submit(form)
      await vi.waitFor(() => expect($('form-error-banner')).not.toBeNull())
      expect($('form-error-banner').textContent).toMatch(/no more than 8/)
      expect(global.fetch).not.toHaveBeenCalled()
      expect($('submit-btn').disabled).toBe(false)   // restored for another go
    })

    it('rejects an undecodable original over the per-file cap (mirrors the Worker limit)', async () => {
      global.fetch = mockFetch(true, { ok: true })
      vi.spyOn(console, 'error').mockImplementation(() => {})
      const form = formWithFiles()
      initEnquire()
      // A non-image type skips the downscale; an inflated `size` trips the 4 MB cap
      // without allocating 4 MB of fixture.
      const big = file('huge.heic', 'tiny', 'application/octet-stream')
      Object.defineProperty(big, 'size', { value: 5 * 1024 * 1024 })
      attach('refs', [big])
      submit(form)
      await vi.waitFor(() => expect($('form-error-banner')).not.toBeNull())
      expect($('form-error-banner').textContent).toMatch(/max 4 MB/)
      expect(global.fetch).not.toHaveBeenCalled()
    })
  })

  describe('date plausibility (dob + appointment window)', () => {
    // Text inputs, deliberately: jsdom's type=date value sanitiser would eat the
    // malformed fixtures before the validators ever saw them. The module keys
    // validators off element ids, not input types.
    function dateSetup() {
      document.body.innerHTML = `
        <form id="enquiry-form" novalidate>
          <div id="progress-fill"></div>
          <div id="progress-pct"></div>
          <fieldset id="step-1" data-step="1">
            <div class="field"><input id="dob" name="dob" required></div>
            <div class="field"><input id="date-from" name="date_from"></div>
            <div class="field"><input id="date-to" name="date_to"></div>
            <button type="button" id="step1-next">next</button>
          </fieldset>
          <fieldset id="step-2"></fieldset><fieldset id="step-3"></fieldset>
          <fieldset id="step-4"><div class="step-footer"></div><button type="submit" id="submit-btn">s</button></fieldset>
        </form>`
    }
    const iso = d => d.toISOString().slice(0, 10)
    const daysFromNow = n => { const d = new Date(); d.setDate(d.getDate() + n); return iso(d) }
    const yearsAgo = n => { const d = new Date(); d.setFullYear(d.getFullYear() - n); return iso(d) }
    const msgFor = id => $(id).closest('.field').querySelector('.field-error-msg')?.textContent || ''
    const judge = () => click($('step1-next'))
    const setDob = v => { $('dob').value = v }

    it('rejects an impossible or malformed date of birth', () => {
      dateSetup(); initEnquire()
      setDob('2000-02-31'); judge()
      expect(msgFor('dob')).toMatch(/doesn’t look right/)
      setDob('not-a-date'); judge()
      expect(msgFor('dob')).toMatch(/doesn’t look right/)
    })

    it('rejects a future date of birth and an implausibly ancient one', () => {
      dateSetup(); initEnquire()
      setDob(daysFromNow(30)); judge()
      expect(msgFor('dob')).toMatch(/in the future/)
      setDob(yearsAgo(130)); judge()
      expect(msgFor('dob')).toMatch(/double-check/)
    })

    it('turns 18 on the day: today’s 18th birthday passes, tomorrow’s fails', () => {
      dateSetup(); initEnquire()
      setDob(yearsAgo(18)); judge()                       // 18 today → exactly 18
      expect(msgFor('dob')).toBe('')
      const d = new Date(); d.setFullYear(d.getFullYear() - 18); d.setDate(d.getDate() + 1)
      setDob(iso(d)); judge()                              // 18 tomorrow → still 17
      expect(msgFor('dob')).toMatch(/over-18s/)
    })

    it('appointment window: optional when blank, but must be a real, future-ish date', () => {
      dateSetup(); initEnquire()
      setDob(yearsAgo(25))
      judge()
      expect(msgFor('date-from')).toBe('')                 // optional + empty = fine

      $('date-from').value = 'junk'; judge()
      expect(msgFor('date-from')).toMatch(/doesn’t look right/)
      $('date-from').value = daysFromNow(-7); judge()
      expect(msgFor('date-from')).toMatch(/still to come/)
      const far = new Date(); far.setFullYear(far.getFullYear() + 3)
      $('date-from').value = iso(far); judge()
      expect(msgFor('date-from')).toMatch(/within two years/)
      $('date-from').value = daysFromNow(30); judge()
      expect(msgFor('date-from')).toBe('')
    })

    it('the window’s end must sit on or after its start', () => {
      dateSetup(); initEnquire()
      setDob(yearsAgo(25))
      $('date-from').value = daysFromNow(30)
      $('date-to').value   = daysFromNow(10)
      judge()
      expect(msgFor('date-to')).toMatch(/on or after/)
      $('date-to').value = daysFromNow(40); judge()
      expect(msgFor('date-to')).toBe('')
    })

    it('bounds the native pickers: dob capped at today, the window floored at today', () => {
      // The fixture inputs are textual, but the bounds are set regardless — in the
      // real markup these are type=date so the picker can't offer the obvious mistakes.
      dateSetup(); initEnquire()
      const today = new Date()
      const iso0 = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`
      expect($('dob').max).toBe(iso0)
      expect($('date-from').min).toBe(iso0)
      expect($('date-to').min).toBe(iso0)
    })
  })

  describe('progress UI, restore & odds-and-ends', () => {
    function progressSetup() {
      document.body.innerHTML = `
        <form id="enquiry-form" novalidate>
          <div id="progress-wrap">
            <div class="progress-bar-track" role="progressbar" aria-valuemin="1" aria-valuemax="4" aria-valuenow="1">
              <div id="progress-fill"></div>
            </div>
            <div id="progress-pct"></div>
            <div class="progress-step"><span class="step-name">About you</span></div>
            <div class="progress-step"><span class="step-name">The idea</span></div>
            <div class="progress-step"></div>
            <div class="progress-step"><span class="step-name">Consent</span></div>
          </div>
          <fieldset id="step-1" data-step="1"><button type="button" id="step1-next">n</button></fieldset>
          <fieldset id="step-2" data-step="2"><button type="button" id="step2-next">n</button></fieldset>
          <fieldset id="step-3" data-step="3"><button type="button" id="step3-next">n</button></fieldset>
          <fieldset id="step-4" data-step="4"><div class="step-footer"></div><button type="submit" id="submit-btn">s</button></fieldset>
        </form>`
    }

    it('keeps the bar ARIA + label + step dots in lockstep with the active step', () => {
      progressSetup(); initEnquire()
      click($('step1-next'))   // step 1 has nothing required → advances
      expect(document.querySelector('.progress-bar-track').getAttribute('aria-valuenow')).toBe('2')
      expect($('progress-pct').textContent).toBe('Step 2 of 4 · The idea')
      const dots = [...document.querySelectorAll('.progress-step')]
      expect(dots[0].classList.contains('done')).toBe(true)
      expect(dots[1].classList.contains('current')).toBe(true)

      click($('step2-next'))   // a step whose dot has NO name → no “· name” suffix
      expect($('progress-pct').textContent).toBe('Step 3 of 4')
    })

    it('restores the saved step from sessionStorage, ignoring out-of-range values', () => {
      progressSetup()
      sessionStorage.setItem('beansprout_step', '3')
      initEnquire()
      expect($('step-3').classList.contains('active')).toBe(true)

      document.body.innerHTML = ''
      progressSetup()
      sessionStorage.setItem('beansprout_step', '9')   // out of range → ignored
      initEnquire()
      // No restore ran: setStep was never called, so the markup's initial state
      // stands (the real page ships step 1 active in HTML) and no later step lit up.
      expect($('progress-pct').textContent).toBe('')
      expect($('step-3').classList.contains('active')).toBe(false)
    })

    it('scrolls the newly opened step into view on small screens (after the settle delay)', async () => {
      vi.useFakeTimers()
      const spy = vi.fn()
      window.Element.prototype.scrollIntoView = spy
      window.innerWidth = 375
      progressSetup(); initEnquire()
      click($('step1-next'))
      expect(spy).not.toHaveBeenCalled()        // waits 100ms for the accordion to settle
      await vi.advanceTimersByTimeAsync(100)
      expect(spy).toHaveBeenCalledTimes(1)
      vi.useRealTimers()
      window.innerWidth = 1024
    })

    it('a required radio group blocks the step until one is picked', () => {
      document.body.innerHTML = `
        <form id="enquiry-form" novalidate>
          <div id="progress-fill"></div><div id="progress-pct"></div>
          <fieldset id="step-1" data-step="1">
            <div class="field">
              <label><input type="radio" name="kind" value="a" required>a</label>
              <label><input type="radio" name="kind" value="b" required>b</label>
            </div>
            <button type="button" id="step1-next">n</button>
          </fieldset>
          <fieldset id="step-2"></fieldset><fieldset id="step-3"></fieldset>
          <fieldset id="step-4"><div class="step-footer"></div><button type="submit" id="submit-btn">s</button></fieldset>
        </form>`
      initEnquire()
      click($('step1-next'))
      const field = document.querySelector('#step-1 .field')
      expect(field.classList.contains('error')).toBe(true)
      expect(field.querySelector('.field-error-msg').textContent).toMatch(/pick one/i)

      const radio = document.querySelector('[name="kind"][value="a"]')
      radio.checked = true; change(radio)
      click($('step1-next'))
      expect(field.classList.contains('error')).toBe(false)
      expect($('progress-pct').textContent).toBe('Step 2 of 4')
    })

    it('a pill group without a usable data-max never disables its pills', () => {
      document.body.innerHTML = `
        <form id="enquiry-form" novalidate>
          <div id="progress-fill"></div><div id="progress-pct"></div>
          <fieldset id="step-1" data-step="1">
            <div class="pill-group" data-max="">
              <label class="pill"><input type="checkbox" name="s[]" value="a"></label>
              <label class="pill"><input type="checkbox" name="s[]" value="b"></label>
            </div>
          </fieldset>
          <fieldset id="step-2"></fieldset><fieldset id="step-3"></fieldset>
          <fieldset id="step-4"><div class="step-footer"></div><button type="submit" id="submit-btn">s</button></fieldset>
        </form>`
      initEnquire()
      const [a, b] = [...document.querySelectorAll('[name="s[]"]')]
      a.checked = true; change(a)
      expect(b.disabled).toBe(false)
    })
  })

  describe('file preview thumbnails', () => {
    function previewSetup() {
      document.body.innerHTML = `
        <form id="enquiry-form" novalidate>
          <div id="progress-fill"></div><div id="progress-pct"></div>
          <fieldset id="step-1" data-step="1"></fieldset>
          <fieldset id="step-2"></fieldset>
          <fieldset id="step-3">
            <input id="refs" type="file" multiple>
            <div id="thumb-row"></div>
          </fieldset>
          <fieldset id="step-4"><div class="step-footer"></div><button type="submit" id="submit-btn">s</button></fieldset>
        </form>`
    }
    const attach = files =>
      Object.defineProperty($('refs'), 'files', { value: files, configurable: true })
    const file = name => new window.File(['x'], name, { type: 'image/png' })

    let created, revoked
    beforeEach(() => {
      created = 0; revoked = []
      window.URL.createObjectURL = () => `blob:fake-${++created}`
      window.URL.revokeObjectURL = url => revoked.push(url)
    })

    it('builds one thumb per file (capped at 8) with the filename as DOM-safe alt text', () => {
      previewSetup(); initEnquire()
      const hostile = '"><img src=x onerror=alert(1)>.png'
      attach([file(hostile), ...Array.from({ length: 9 }, (_, i) => file(`r${i}.png`))])
      change($('refs'))

      const thumbs = [...document.querySelectorAll('#thumb-row .thumb img')]
      expect(thumbs).toHaveLength(8)                    // 10 attached → capped
      expect(thumbs[0].alt).toBe(hostile)               // a DOM property, never markup
      // The attribute-break payload never became an element of its own.
      expect(document.querySelector('#thumb-row img[src="x"]')).toBeNull()
      expect(document.querySelectorAll('#thumb-row img')).toHaveLength(8)
    })

    it('revokes each blob URL once its image loads OR errors (no session-long leak)', () => {
      previewSetup(); initEnquire()
      attach([file('a.png'), file('b.png')])
      change($('refs'))
      const [imgA, imgB] = [...document.querySelectorAll('#thumb-row img')]
      imgA.onload()                                     // decoded fine
      imgB.onerror()                                    // undecodable — must still revoke
      expect(revoked.sort()).toEqual(['blob:fake-1', 'blob:fake-2'])
    })

    it('reselecting clears the previous previews', () => {
      previewSetup(); initEnquire()
      attach([file('a.png')]); change($('refs'))
      attach([file('b.png')]); change($('refs'))
      const thumbs = [...document.querySelectorAll('#thumb-row img')]
      expect(thumbs).toHaveLength(1)
      expect(thumbs[0].alt).toBe('b.png')
    })
  })

  describe('character counter (quiet until the last quarter)', () => {
    function counterSetup() {
      document.body.innerHTML = `
        <form id="enquiry-form" novalidate>
          <div id="progress-fill"></div><div id="progress-pct"></div>
          <fieldset id="step-1" data-step="1"></fieldset>
          <fieldset id="step-2">
            <div class="field"><textarea name="idea" maxlength="200"></textarea></div>
          </fieldset>
          <fieldset id="step-3"></fieldset>
          <fieldset id="step-4"><div class="step-footer"></div><button type="submit" id="submit-btn">s</button></fieldset>
        </form>`
    }
    const type = (t, text) => {
      t.value = text
      t.dispatchEvent(new window.Event('input', { bubbles: true }))
    }

    it('stays silent below 75% and counts down (with a low warning) inside the last quarter', () => {
      counterSetup(); initEnquire()
      const t = document.querySelector('textarea')
      const count = document.querySelector('.char-count')
      expect(count.textContent).toBe('')                 // empty box → no hovering number

      type(t, 'z'.repeat(100))
      expect(count.textContent).toBe('')                 // still under 75% of 200
      type(t, 'z'.repeat(150))
      expect(count.textContent).toBe('50 characters left')
      expect(count.classList.contains('low')).toBe(false)
      type(t, 'z'.repeat(199))
      expect(count.textContent).toBe('1 character left') // singular at exactly one
      expect(count.classList.contains('low')).toBe(true) // ≤ 40 → low
    })
  })

  describe('aria-invalid bookkeeping on multi-control fields', () => {
    it('moves with the first outstanding control and clears completely when the field passes', () => {
      // Two required consent boxes share one .field — exactly the step-4 shape.
      document.body.innerHTML = `
        <form id="enquiry-form" novalidate>
          <div id="progress-fill"></div><div id="progress-pct"></div>
          <fieldset id="step-1" data-step="1"><button type="button" id="step1-next">n</button></fieldset>
          <fieldset id="step-2"></fieldset><fieldset id="step-3"></fieldset>
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
      const submitForm = () =>
        $('enquiry-form').dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }))

      submitForm()                                       // both unticked → c1 is first-bad
      expect($('c1').getAttribute('aria-invalid')).toBe('true')
      expect($('c2').hasAttribute('aria-invalid')).toBe(false)

      $('c1').checked = true; change($('c1'))            // first-bad shifts to c2
      expect($('c1').hasAttribute('aria-invalid')).toBe(false) // the fixed box is no longer announced invalid
      expect($('c2').getAttribute('aria-invalid')).toBe('true')

      $('c2').checked = true; change($('c2'))            // field passes → nothing announced
      expect(document.querySelectorAll('[aria-invalid]')).toHaveLength(0)
    })
  })
})
