// Tests for src/index.js — the Worker entry/router. This is the one shell that
// adapts a Workers Request to the handlers' `(event, env) → { statusCode, headers,
// body }` shape and back, so we pin down the routing contract in isolation: the
// handlers are mocked to spies, leaving only the router's own behaviour under
// test — path dispatch, trailing-slash normalisation, the 404 for unknown
// paths, that handlers receive the adapted event + env, that an empty/204
// body is emitted as a null Response body (required by the Fetch spec), and
// that the cron entry hands the failed-send digest to `ctx.waitUntil`.
import { describe, it, expect, beforeEach, vi } from 'vitest'

// Mock every route handler so the router is tested on its own. Each spy
// records the (event, env) it was called with and returns a known reply shape.
const enquirySpy       = vi.fn()
const newsletterSpy    = vi.fn()
const flashStatusSpy   = vi.fn()
const checkoutSpy      = vi.fn()
const stripeWebhookSpy = vi.fn()
const failedDigestSpy  = vi.fn()

vi.mock('../src/handlers/enquiry.js',      () => ({ handler: (...a) => enquirySpy(...a) }))
vi.mock('../src/handlers/newsletter.js',   () => ({ handler: (...a) => newsletterSpy(...a) }))
vi.mock('../src/handlers/flash-status.js', () => ({ handler: (...a) => flashStatusSpy(...a) }))
vi.mock('../src/handlers/checkout.js',       () => ({ handler: (...a) => checkoutSpy(...a) }))
vi.mock('../src/handlers/stripe-webhook.js', () => ({ handler: (...a) => stripeWebhookSpy(...a) }))
vi.mock('../src/handlers/failed-digest.js',  () => ({ failedDigest: (...a) => failedDigestSpy(...a) }))

// Imported after the mocks are registered (vi.mock is hoisted, but keep it explicit).
const { default: worker } = await import('../src/index.js')

const env = { DB: {}, RESEND_API_KEY: 'x' }
const reply = (statusCode, body = '') => ({
  statusCode,
  headers: { 'Content-Type': 'application/json' },
  body,
})

beforeEach(() => {
  enquirySpy.mockReset().mockResolvedValue(reply(200, '{"ok":true}'))
  newsletterSpy.mockReset().mockResolvedValue(reply(200, '{"ok":true}'))
  flashStatusSpy.mockReset().mockResolvedValue(reply(200, '{"claims":{}}'))
  checkoutSpy.mockReset().mockResolvedValue(reply(503, '{"error":"off"}'))
  stripeWebhookSpy.mockReset().mockResolvedValue(reply(200, '{"received":true}'))
  failedDigestSpy.mockReset().mockResolvedValue({ reported: 0 })
})

const allRouteSpies = () => [enquirySpy, newsletterSpy, flashStatusSpy, checkoutSpy, stripeWebhookSpy]

describe('Worker router', () => {
  it('routes POST /enquiry to the enquiry handler with the adapted event + env', async () => {
    const req = new Request('https://w.example/enquiry', {
      method: 'POST', headers: { Origin: 'https://beansprout.ink' }, body: '{"a":1}',
    })
    const res = await worker.fetch(req, env)

    expect(enquirySpy).toHaveBeenCalledTimes(1)
    const [event, passedEnv] = enquirySpy.mock.calls[0]
    expect(event.httpMethod).toBe('POST')
    expect(event.headers.origin).toBe('https://beansprout.ink') // toEvent lowercases
    expect(event.body).toBe('{"a":1}')
    expect(passedEnv).toBe(env)

    expect(res.status).toBe(200)
    expect(await res.text()).toBe('{"ok":true}')
  })

  it('routes POST /newsletter to the newsletter handler', async () => {
    await worker.fetch(new Request('https://w.example/newsletter', { method: 'POST', body: '{}' }), env)
    expect(newsletterSpy).toHaveBeenCalledTimes(1)
    expect(enquirySpy).not.toHaveBeenCalled()
  })

  it('routes GET /flash-status to the flash-status handler (empty body for GET)', async () => {
    await worker.fetch(new Request('https://w.example/flash-status'), env)
    expect(flashStatusSpy).toHaveBeenCalledTimes(1)
    expect(flashStatusSpy.mock.calls[0][0].body).toBe('')
  })

  it('routes POST /checkout to the checkout handler only', async () => {
    const res = await worker.fetch(new Request('https://w.example/checkout', { method: 'POST', body: '{"pieceId":"f1"}' }), env)
    expect(checkoutSpy).toHaveBeenCalledTimes(1)
    expect(checkoutSpy.mock.calls[0][0].body).toBe('{"pieceId":"f1"}')
    expect(checkoutSpy.mock.calls[0][1]).toBe(env)
    expect(res.status).toBe(503)
    expect(allRouteSpies().filter(s => s !== checkoutSpy).some(s => s.mock.calls.length)).toBe(false)
  })

  it('routes POST /webhooks/stripe with the raw body and signature header intact', async () => {
    // Signature verification is over the exact bytes Stripe sent, so the router
    // must hand the handler the unparsed body and the (lowercased) header.
    const raw = '{"id":"evt_1",  "type":"payment_intent.succeeded"}'
    await worker.fetch(new Request('https://w.example/webhooks/stripe', {
      method: 'POST', headers: { 'Stripe-Signature': 't=1,v1=abc' }, body: raw,
    }), env)
    expect(stripeWebhookSpy).toHaveBeenCalledTimes(1)
    const [event] = stripeWebhookSpy.mock.calls[0]
    expect(event.body).toBe(raw)
    expect(event.headers['stripe-signature']).toBe('t=1,v1=abc')
    expect(allRouteSpies().filter(s => s !== stripeWebhookSpy).some(s => s.mock.calls.length)).toBe(false)
  })

  it('does not treat a partial or nested path as a route', async () => {
    for (const p of ['/webhooks', '/webhooks/stripe/extra', '/enquiry/x', '/Enquiry']) {
      const res = await worker.fetch(new Request(`https://w.example${p}`, { method: 'POST', body: '{}' }), env)
      expect(res.status, p).toBe(404)
    }
    expect(allRouteSpies().some(s => s.mock.calls.length)).toBe(false)
  })

  it('normalises a trailing slash so /enquiry/ still routes', async () => {
    await worker.fetch(new Request('https://w.example/enquiry/', { method: 'POST', body: '{}' }), env)
    expect(enquirySpy).toHaveBeenCalledTimes(1)
  })

  it('strips multiple trailing slashes too', async () => {
    await worker.fetch(new Request('https://w.example/flash-status///'), env)
    expect(flashStatusSpy).toHaveBeenCalledTimes(1)
  })

  it('ignores the query string when matching the route', async () => {
    await worker.fetch(new Request('https://w.example/flash-status?cb=123'), env)
    expect(flashStatusSpy).toHaveBeenCalledTimes(1)
  })

  it('answers an unknown path with a 404 JSON error and calls no handler', async () => {
    const res = await worker.fetch(new Request('https://w.example/nope'), env)
    expect(res.status).toBe(404)
    expect(res.headers.get('Content-Type')).toBe('application/json')
    expect(JSON.parse(await res.text())).toEqual({ error: 'Not found.' })
    expect(enquirySpy).not.toHaveBeenCalled()
    expect(newsletterSpy).not.toHaveBeenCalled()
    expect(flashStatusSpy).not.toHaveBeenCalled()
  })

  it('puts the JSON security headers on the 404 it builds itself', async () => {
    // Handler replies get these from replyWith(); the router's own 404 doesn't go
    // through it, so it has to add them explicitly.
    const res = await worker.fetch(new Request('https://w.example/nope'), env)
    expect(res.headers.get('X-Content-Type-Options')).toBe('nosniff')
    expect(res.headers.get('Content-Security-Policy')).toBe("default-src 'none'")
    expect(res.headers.get('Referrer-Policy')).toBe('no-referrer')
  })

  it('treats the root path "/" as unknown (404)', async () => {
    const res = await worker.fetch(new Request('https://w.example/'), env)
    expect(res.status).toBe(404)
  })

  it('emits a null body for a 204 reply (Fetch spec: no body allowed)', async () => {
    flashStatusSpy.mockResolvedValue(reply(204, '')) // preflight-style empty reply
    const res = await worker.fetch(new Request('https://w.example/flash-status', { method: 'OPTIONS' }), env)
    expect(res.status).toBe(204)
    expect(res.body).toBeNull()
    expect(await res.text()).toBe('')
  })

  it('passes the handler status + headers straight through to the Response', async () => {
    enquirySpy.mockResolvedValue({
      statusCode: 429,
      headers: { 'Content-Type': 'application/json', 'Retry-After': '60' },
      body: '{"error":"slow down"}',
    })
    const res = await worker.fetch(new Request('https://w.example/enquiry', { method: 'POST', body: '{}' }), env)
    expect(res.status).toBe(429)
    expect(res.headers.get('Retry-After')).toBe('60')
  })
})

describe('Worker cron entry (scheduled)', () => {
  it('runs the failed-send digest with env and keeps the Worker alive for it', async () => {
    const digest = Promise.resolve({ reported: 2 })
    failedDigestSpy.mockReturnValue(digest)
    const ctx = { waitUntil: vi.fn() }

    await worker.scheduled({ cron: '0 8 * * *' }, env, ctx)

    expect(failedDigestSpy).toHaveBeenCalledTimes(1)
    expect(failedDigestSpy).toHaveBeenCalledWith(env)
    // Without waitUntil the runtime may end the invocation before the email sends.
    expect(ctx.waitUntil).toHaveBeenCalledTimes(1)
    expect(ctx.waitUntil.mock.calls[0][0]).toBe(digest)
    expect(allRouteSpies().some(s => s.mock.calls.length)).toBe(false)
  })
})
