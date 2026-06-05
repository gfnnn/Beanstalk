// Shared helpers for the Playwright E2E/smoke tier.
import { expect } from '@playwright/test'

// The indexable routes (mirrors ROUTES in src/build/seo.js) plus the noindex
// post-enquiry page and a representative per-piece portfolio page. The smoke sweep
// loads every one of these. Keep in step with seo.js when adding a page.
export const PAGES = [
  { path: '/',                       name: 'home' },
  { path: '/portfolio/',             name: 'portfolio' },
  { path: '/flash/',                 name: 'flash' },
  { path: '/services/',              name: 'services' },
  { path: '/enquire/',               name: 'enquire' },
  { path: '/about/',                 name: 'about' },
  { path: '/visit/',                 name: 'visit' },
  { path: '/faq/',                   name: 'faq' },
  { path: '/aftercare/',             name: 'aftercare' },
  { path: '/newsletter/',            name: 'newsletter' },
  { path: '/privacy/',               name: 'privacy' },
  { path: '/terms/',                 name: 'terms' },
  { path: '/enquiry-received/',      name: 'enquiry-received (noindex)' },
]

// Stub the forms' Cloudflare Worker so the suite is hermetic and offline — no
// real Resend/D1 call, no CORS flake, no dependence on the Worker being up.
// Matches the three routes by suffix, regardless of the baked workers.dev host.
// Pass overrides to shape a specific response (e.g. a 409 on /enquiry).
export async function stubWorker(page, { enquiry, newsletter, flashStatus } = {}) {
  const json = (route, status, body) =>
    route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) })

  await page.route('**/flash-status', route =>
    json(route, flashStatus?.status ?? 200, flashStatus?.body ?? { claims: {} }))
  await page.route('**/enquiry', route =>
    json(route, enquiry?.status ?? 200, enquiry?.body ?? { ok: true }))
  await page.route('**/newsletter', route =>
    json(route, newsletter?.status ?? 200, newsletter?.body ?? { ok: true }))
}

// Attach diagnostics that turn an uncaught page exception or a real console error
// into a test failure. Returns a `assertClean()` to call at the end of a test.
//
// Uncaught exceptions (`pageerror`) always fail — that's a broken bundle/page.
// Console errors fail too, EXCEPT resource-load 404s: real photography is still
// being shot (CLAUDE.md), so some `/images/...` files legitimately 404 until the
// shoot lands. Those are content gaps, not code health, so they're filtered out.
export function watchForErrors(page) {
  const pageErrors = []
  const consoleErrors = []

  page.on('pageerror', err => pageErrors.push(err.message))
  page.on('console', msg => {
    if (msg.type() !== 'error') return
    const text = msg.text()
    if (/Failed to load resource/i.test(text)) return // tolerate not-yet-shot images
    consoleErrors.push(text)
  })

  return {
    assertClean() {
      expect(pageErrors, `uncaught page errors:\n${pageErrors.join('\n')}`).toEqual([])
      expect(consoleErrors, `console errors:\n${consoleErrors.join('\n')}`).toEqual([])
    },
  }
}

// A tiny valid PNG (1×1, red) as a Buffer — used to drive the real file-input /
// image-decode (createImageBitmap → canvas → toBlob) path in the enquiry form.
export const TINY_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
)
