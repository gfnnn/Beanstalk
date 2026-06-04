// @vitest-environment jsdom
//
// Behaviour tests for the multi-step enquiry form (src/js/modules/enquire.js).
// We cover the synchronous, correctness-critical logic: step-gating validation,
// the pill multi-select cap, and the conditional field groups that disable their
// inputs while hidden (the module's comment is explicit that disabled inputs are
// kept out of the submitted payload, so a flash enquiry can't carry stale
// custom-only answers). The submit/image-downscale path leans on browser-only
// APIs (FileReader, createImageBitmap, canvas, navigation) and belongs in an E2E
// tier, so it's intentionally out of scope here.
import { describe, it, expect, beforeEach } from 'vitest'
import { initEnquire } from '../src/js/modules/enquire.js'

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
})

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
})
