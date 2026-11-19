// @vitest-environment jsdom
//
// Form contract: the REAL enquiry page markup, driven by the REAL client module,
// posted into the REAL Worker handler. The module suites (enquire.test.js) run
// against a hand-built fixture whose field names have drifted from the page, and
// the Worker suite posts hand-built payloads, so neither notices when the three
// pieces stop agreeing: a control renamed in enquire/index.html still validates,
// still submits, still gets a 200, and silently never appears in the artist's
// email. This file is the only place the page, the bundle and the Worker meet
// outside production. No network: both fetch() hops are mocked, D1 is the fake.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { initEnquire } from '../src/js/modules/enquire.js'
import { ENQUIRY_FN_URL } from '../src/js/modules/config.js'
import { initNewsletter } from '../src/js/modules/newsletter.js'
import { NEWSLETTER_FN_URL } from '../src/js/modules/config.js'
import { renderNewsletterInline } from '../src/build/newsletter-inline.js'
import { handler as enquiryWorker } from '../../functions/src/handlers/enquiry.js'
import { handler as newsletterWorker } from '../../functions/src/handlers/newsletter.js'
import { makeD1 } from '../../functions/tests/helpers/fake-d1.js'

// track() is stubbed to a no-op, so success doesn't navigate away.
vi.mock('../src/js/modules/analytics.js', () => ({ track: vi.fn() }))

const readPage = rel => readFileSync(resolve(process.cwd(), rel), 'utf8')   // Vitest runs from apps/web
const pageHtml = readPage('enquire/index.html')

const iso = d => d.toISOString().slice(0, 10)
const daysFromNow = n => { const d = new Date(); d.setDate(d.getDate() + n); return iso(d) }

// Distinctive values for the free-text controls, so each can be found in the email.
const TEXT = {
  first_name: 'Zadie', last_name: 'Quillfeather', email: 'zadie@example.com',
  idea: 'IDEA-7f3a a heron in reeds', placement: 'PLACEMENT-91c inner forearm', size: 'SIZE-22b about 10cm',
  allergies: 'ALLERGY-5d1 latex', additional_notes: 'NOTES-c08 prefers mornings',
  date_of_birth: '1990-04-12', date_from: daysFromNow(30), date_to: daysFromNow(60),
}

function loadPage() {
  const doc = new window.DOMParser().parseFromString(pageHtml, 'text/html')
  document.body.innerHTML = doc.body.innerHTML
  window.Element.prototype.scrollIntoView = () => {}
}

// Fill every control the page has, whatever it is called: named text values where
// we have one, otherwise the first real option. Returns nothing; reads from the DOM.
function fillEverything({ tattooType = 'custom' } = {}) {
  const form = document.getElementById('enquiry-form')
  const fire = (el, type) => el.dispatchEvent(new window.Event(type, { bubbles: true }))
  const pick = (name, value) => {
    const el = form.querySelector(`[name="${name}"][value="${value}"]`)
    el.checked = true
    fire(el, 'change')
  }
  pick('tattoo_type', tattooType)
  for (const el of form.elements) {
    if (!el.name || el.name === '_gotcha' || el.type === 'file' || el.type === 'submit' || el.type === 'button') continue
    if (el.disabled) continue   // hidden conditional group: a visitor can't reach it either
    if (el.tagName === 'SELECT') { el.value = el.options[1].value; fire(el, 'change'); continue }
    if (el.type === 'radio') {
      if (!form.querySelector(`[name="${el.name}"]:checked`)) { el.checked = true; fire(el, 'change') }
      continue
    }
    if (el.type === 'checkbox') {
      // Multi-selects: take the first of each group only (the style group is capped).
      if (el.name.endsWith('[]') && form.querySelector(`[name="${el.name}"]:checked`)) continue
      el.checked = true; fire(el, 'change')
      continue
    }
    expect(TEXT, `the page has a text control named "${el.name}" this test has no value for`).toHaveProperty(el.name)
    el.value = TEXT[el.name]
    fire(el, 'input')
  }
}

async function submitAndCapture() {
  const fetchMock = vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ ok: true }) }))
  vi.stubGlobal('fetch', fetchMock)
  const form = document.getElementById('enquiry-form')
  form.dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }))
  await vi.waitFor(() => {
    expect(document.querySelectorAll('.field.error').length, 'the real form failed its own validation').toBe(0)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })
  const [url, init] = fetchMock.mock.calls[0]
  return { url, payload: JSON.parse(init.body) }
}

// Post a payload to the real Worker handler; return its status and the artist email.
async function toWorker(payload) {
  const resend = vi.fn(async () => ({ ok: true, status: 200, text: async () => '', json: async () => ({ id: 'e' }) }))
  vi.stubGlobal('fetch', resend)
  const env = { RESEND_API_KEY: 're_test', ARTIST_EMAIL: 'artist@studio.test', FROM_EMAIL: 'hello@beansprout.ink', DB: makeD1().DB }
  const res = await enquiryWorker({
    httpMethod: 'POST',
    headers: { origin: 'https://beansprout.ink', 'cf-connecting-ip': '9.9.9.9' },
    body: JSON.stringify(payload),
  }, env)
  const artist = resend.mock.calls.map(c => JSON.parse(c[1].body)).find(b => b.to?.includes('artist@studio.test'))
  return { status: res.statusCode, body: res.body, html: artist?.html, subject: artist?.subject }
}

afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); document.body.innerHTML = '' })

describe('enquiry form: real page → real module → real Worker', () => {
  beforeEach(() => { try { sessionStorage.clear() } catch (_) {} ; loadPage(); initEnquire() })

  it('the page has the form and every step the module drives', () => {
    for (const id of ['enquiry-form', 'step-1', 'step-2', 'step-3', 'step-4', 'submit-btn', 'idea-field', 'style-field', 'coverup-field', 'refs', 'check-health']) {
      expect(document.getElementById(id), `#${id} is missing from enquire/index.html`).toBeTruthy()
    }
  })

  it('a fully completed form posts to the enquiry route and the Worker accepts it', async () => {
    fillEverything()
    const { url, payload } = await submitAndCapture()
    expect(url).toBe(ENQUIRY_FN_URL)
    expect(payload.fields._gotcha).toBe('')            // honeypot present and empty
    expect(Array.isArray(payload.images)).toBe(true)

    const { status, body, html, subject } = await toWorker(payload)
    expect(status, body).toBe(200)
    expect(subject).toContain('Zadie Quillfeather')
    for (const key of ['idea', 'placement', 'size', 'allergies', 'additional_notes']) {
      expect(html, `the artist email is missing the "${key}" answer`).toContain(TEXT[key].split(' ')[0])
    }
    expect(html).toContain('zadie@example.com')
  })

  // The generic check: remove one submitted field at a time and the Worker must
  // notice, either by rejecting (a required/consent field) or by sending a
  // different email (a rendered field). A field that changes nothing is one the
  // page collects and the Worker drops on the floor.
  it('every field the page submits is either required or rendered by the Worker', async () => {
    fillEverything()
    const { payload } = await submitAndCapture()
    const full = await toWorker(payload)
    expect(full.status).toBe(200)

    const names = Object.keys(payload.fields).filter(k => k !== '_gotcha')
    expect(names.length).toBeGreaterThan(20)
    const ignored = []
    for (const name of names) {
      const { [name]: _dropped, ...rest } = payload.fields
      const without = await toWorker({ ...payload, fields: rest })
      if (without.status === 200 && without.html === full.html && without.subject === full.subject) ignored.push(name)
    }
    expect(ignored, 'submitted by the page but ignored by the Worker').toEqual([])
  })

  it('the Worker’s required and consent fields are all real controls on the page', async () => {
    // Derived from behaviour, not from a copied list: drop each submitted field and
    // collect the ones the Worker refuses to do without.
    fillEverything()
    const { payload } = await submitAndCapture()
    const needed = []
    for (const name of Object.keys(payload.fields)) {
      const { [name]: _dropped, ...rest } = payload.fields
      if ((await toWorker({ ...payload, fields: rest })).status !== 200) needed.push(name)
    }
    expect(needed.sort()).toEqual(['age_confirmed', 'deposit_understood', 'email', 'first_name', 'health_consent', 'last_name', 'policy_accepted'])
    const form = document.getElementById('enquiry-form')
    for (const name of needed.filter(n => n !== 'health_consent')) {
      expect(form.querySelector(`[name="${name}"]`).required, `${name} is not marked required on the page`).toBe(true)
    }
  })

  it('a flash enquiry leaves the custom-only idea and style answers out of the payload', async () => {
    fillEverything({ tattooType: 'flash' })
    for (const id of ['idea-field', 'style-field']) {
      const group = document.getElementById(id)
      expect(group.style.display).toBe('none')
      const controls = [...group.querySelectorAll('input, textarea, select')]
      expect(controls.length).toBeGreaterThan(0)
      expect(controls.every(c => c.disabled)).toBe(true)
    }
    const { payload } = await submitAndCapture()
    expect(payload.fields.tattoo_type).toBe('flash')
    expect(payload.fields).not.toHaveProperty('idea')
    expect(payload.fields).not.toHaveProperty('style[]')
    expect((await toWorker(payload)).status).toBe(200)
  })

  it('health details without the consent box are stopped by the page AND by the Worker', async () => {
    fillEverything()
    const consent = document.getElementById('check-health')
    consent.checked = false
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    document.getElementById('enquiry-form').dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }))
    await new Promise(r => setTimeout(r, 20))
    expect(fetchMock).not.toHaveBeenCalled()
    expect(consent.closest('.field, .checkbox-row, .checkbox-group')).toBeTruthy()

    // …and a client that skipped the page's check is refused server-side.
    consent.checked = true
    const { payload } = await submitAndCapture()
    const { health_consent: _c, ...rest } = payload.fields
    expect((await toWorker({ ...payload, fields: rest })).status).toBe(400)
  })
})

// The newsletter form exists twice: authored on /newsletter/ and generated into
// the inline band on other pages. Both post to the same Worker route, which files
// a dated consent record quoting the statement the visitor agreed to — so that
// statement has to be the words actually printed next to the checkbox.
describe.each([
  ['the /newsletter/ page', () => new window.DOMParser().parseFromString(readPage('newsletter/index.html'), 'text/html').body.innerHTML],
  ['the inline band',       () => renderNewsletterInline()],
])('newsletter signup from %s: real markup → real module → real Worker', (_label, markup) => {
  const AUDIENCE = '78261eea-1c2d-4e3f-9a0b-1c2d3e4f5a6b'
  let form
  beforeEach(() => {
    document.body.innerHTML = markup()
    form = document.querySelector('form[data-newsletter]')
    initNewsletter()
  })

  async function signUp() {
    const fetchMock = vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ ok: true }) }))
    vi.stubGlobal('fetch', fetchMock)
    form.querySelector('input[name="email"]').value = 'Reader@Example.com'
    const name = form.querySelector('input[name="first_name"]')
    if (name) name.value = 'Robin'
    form.querySelector('input[name="consent"]').checked = true
    form.dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }))
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))
    const [url, init] = fetchMock.mock.calls[0]
    return { url, payload: JSON.parse(init.body) }
  }

  async function toWorker(payload) {
    const d1 = makeD1()
    const resend = vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ id: 'c1' }) }))
    vi.stubGlobal('fetch', resend)
    const res = await newsletterWorker({
      httpMethod: 'POST',
      headers: { origin: 'https://beansprout.ink', 'cf-connecting-ip': '9.9.9.9' },
      body: JSON.stringify(payload),
    }, { RESEND_API_KEY: 're_test', RESEND_AUDIENCE_ID: AUDIENCE, DB: d1.DB })
    return { status: res.statusCode, resend, consent: [...d1.data.consent.values()] }
  }

  it('has the form, an empty honeypot and a required consent box', () => {
    expect(form).toBeTruthy()
    expect(form.querySelector('input[name="_gotcha"]').value).toBe('')
    expect(form.querySelector('input[name="consent"]').required).toBe(true)
    expect(form.querySelector('input[name="consent"]').checked).toBe(false)   // never pre-ticked
  })

  it('a completed signup reaches the audience and files the consent record', async () => {
    const { url, payload } = await signUp()
    expect(url).toBe(NEWSLETTER_FN_URL)
    const { status, resend, consent } = await toWorker(payload)
    expect(status).toBe(200)
    expect(resend.mock.calls[0][0]).toContain(`/audiences/${AUDIENCE}/contacts`)
    const contact = JSON.parse(resend.mock.calls[0][1].body)
    expect(contact.email).toBe('reader@example.com')
    if (form.querySelector('input[name="first_name"]')) expect(contact.first_name).toBe('Robin')
    expect(consent).toHaveLength(1)
    expect(consent[0].email).toBe('reader@example.com')
  })

  it('the consent record quotes the words printed beside the checkbox', async () => {
    const { payload } = await signUp()
    const { consent } = await toWorker(payload)
    const box = form.querySelector('input[name="consent"]')
    const norm = t => t.replace(/[\u2018\u2019]/g, "'").replace(/\s+/g, ' ').trim()
    const labels = [...form.querySelectorAll(`label[for="${box.id}"]`), box.closest('label')].filter(Boolean)
    const printed = labels.map(l => norm(l.textContent)).filter(Boolean)
    expect(printed.length).toBeGreaterThan(0)
    expect(printed).toContain(norm(consent[0].statement))
  })

  it('the Worker refuses the same payload without consent', async () => {
    const { payload } = await signUp()
    const { consent: _c, ...rest } = payload.fields
    expect((await toWorker({ fields: rest })).status).toBe(400)
  })
})
