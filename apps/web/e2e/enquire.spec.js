// The enquiry form's browser-only paths — the part the jsdom unit tier explicitly
// can't reach (enquire.test.js says so): the live image preview (URL.createObjectURL)
// and, on submit, the real downscale pipeline (createImageBitmap → canvas → toBlob
// → base64). We drive the actual multi-step form end-to-end, attach a real file,
// and assert the request the browser builds — with the Worker stubbed so nothing
// leaves the machine.
import { test, expect } from '@playwright/test'
import { stubWorker, TINY_PNG } from './helpers.js'

// The radio-cards and consent rows hide the real <input> behind a styled label,
// and the form sits under the `position:fixed` nav — so a coordinate click on the
// input is intercepted (by the label, then the nav). Tick the control directly and
// fire the events the module listens for. This is form *setup*; the spec's actual
// subject (the real file → downscale → POST pipeline) still runs through the
// browser untouched.
async function tick(page, selector) {
  await page.evaluate(sel => {
    const el = document.querySelector(sel)
    if (!el) throw new Error(`tick(): no element for ${sel}`)
    el.checked = true
    el.dispatchEvent(new Event('input', { bubbles: true }))
    el.dispatchEvent(new Event('change', { bubbles: true }))
  }, selector)
}

// Walk the 4-step form to the submit button. `attachImage` drives the file input +
// downscale path; the consent boxes are the only step-4 gate.
async function fillEnquiry(page, { attachImage = true } = {}) {
  // Step 1 — identity (all required)
  await page.fill('#first-name', 'Robin')
  await page.fill('#last-name', 'Tester')
  await page.fill('#email', 'robin@example.com')
  await page.fill('#dob', '1990-06-15')
  await page.click('#step1-next')

  // Step 2 — a tattoo type is the required gate
  await tick(page, 'input[name="tattoo_type"][value="custom"]')
  await page.fill('#idea', 'A small botanical sprig on the forearm.')
  await page.click('#step2-next')

  // Step 3 — references (optional) → exercise the real file input
  if (attachImage) {
    await page.setInputFiles('#refs', { name: 'reference.png', mimeType: 'image/png', buffer: TINY_PNG })
    await expect(page.locator('#thumb-row .thumb')).toHaveCount(1) // preview rendered (createObjectURL)
  }
  await page.click('#step3-next')

  // Step 4 — the three consent checkboxes are required
  await tick(page, '#check-policy')
  await tick(page, '#check-age')
  await tick(page, '#check-deposit')
}

test('renders a live thumbnail preview the moment a reference image is chosen', async ({ page }) => {
  await stubWorker(page)
  await page.goto('/enquire/')
  // #refs lives in step 3, but the change handler builds the preview regardless of
  // which step is visible — assert the thumbnail (an <img> with a blob URL) appears.
  await page.setInputFiles('#refs', { name: 'ref.png', mimeType: 'image/png', buffer: TINY_PNG })
  const thumb = page.locator('#thumb-row .thumb img')
  await expect(thumb).toHaveCount(1)
  await expect(thumb).toHaveAttribute('src', /^blob:/) // a live object URL (regex-matched)
})

test('submits the downscaled image as base64 and lands on the confirmation page', async ({ page }) => {
  await stubWorker(page) // newsletter/flash-status default stubs

  // Capture the exact JSON the browser POSTs to the Worker.
  let payload = null
  await page.route('**/enquiry', async route => {
    payload = route.request().postDataJSON()
    await route.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' })
  })

  await page.goto('/enquire/')
  await fillEnquiry(page, { attachImage: true })
  await page.click('#submit-btn')

  // Success navigates to the (noindex) confirmation page.
  await page.waitForURL(/\/enquiry-received\/$/)

  // The captured payload proves the browser-only pipeline ran end to end.
  expect(payload).toBeTruthy()
  expect(payload.fields.first_name).toBe('Robin')
  expect(payload.fields.tattoo_type).toBe('custom')
  expect(Array.isArray(payload.images)).toBe(true)
  expect(payload.images).toHaveLength(1)
  expect(payload.images[0].data.length).toBeGreaterThan(0) // base64 body present
  expect(payload.images[0].name).toMatch(/\.jpg$/)         // downscaled → re-encoded as jpeg
})

test('a Worker error surfaces the inline banner and keeps the user on the form', async ({ page }) => {
  await stubWorker(page, { enquiry: { status: 500, body: { error: 'Mail service unavailable.' } } })

  await page.goto('/enquire/')
  await fillEnquiry(page, { attachImage: false })
  await page.click('#submit-btn')

  await expect(page.locator('#form-error-banner')).toHaveText(/Mail service unavailable\./)
  await expect(page).toHaveURL(/\/enquire\/$/)               // not redirected on failure
  await expect(page.locator('#submit-btn')).toBeEnabled()    // restored for a retry
})
