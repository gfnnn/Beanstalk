// Tests for src/index.js — the Worker entry/router. This is the one shell that
// adapts a Workers Request to the handlers' `(event, env) → { statusCode, headers,
// body }` shape and back, so we pin down the routing contract in isolation: the
// three handlers are mocked to spies, leaving only the router's own behaviour
// under test — path dispatch, trailing-slash normalisation, the 404 for unknown
// paths, that handlers receive the adapted event + env, and that an empty/204
// body is emitted as a null Response body (required by the Fetch spec).
import { describe, it, expect, beforeEach, vi } from 'vitest'

// Mock the three route handlers so the router is tested on its own. Each spy
// records the (event, env) it was called with and returns a known reply shape.
const enquirySpy     = vi.fn()
const newsletterSpy  = vi.fn()
const flashStatusSpy = vi.fn()

vi.mock('../src/handlers/enquiry.js',      () => ({ handler: (...a) => enquirySpy(...a) }))
vi.mock('../src/handlers/newsletter.js',   () => ({ handler: (...a) => newsletterSpy(...a) }))
vi.mock('../src/handlers/flash-status.js', () => ({ handler: (...a) => flashStatusSpy(...a) }))

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
})

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
