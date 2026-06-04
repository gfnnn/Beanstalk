// Integration tests for netlify/functions/newsletter.js via its handler.
// Mocks fetch (Resend Contacts API) and @netlify/blobs (rate limiter). Notable
// behaviour pinned here: consent is mandatory, the honeypot is silent, and an
// "already subscribed" response is treated as success (idempotent), not an error.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

const { stores } = vi.hoisted(() => ({ stores: new Map() }))
vi.mock('@netlify/blobs', () => ({
  getStore: (name) => {
    if (!stores.has(name)) stores.set(name, new Map())
    const m = stores.get(name)
    return {
      get: async (key) => (m.has(key) ? m.get(key) : null),
      set: async (key, val) => { m.set(key, val) },
      setJSON: async (key, val) => { m.set(key, val) },
    }
  },
}))

const { handler } = await import('../netlify/functions/newsletter.js')

const post = (fields, headers = {}) => ({
  httpMethod: 'POST',
  headers: { origin: 'https://beansprout.netlify.app', 'x-forwarded-for': '7.7.7.7', ...headers },
  body: JSON.stringify({ fields }),
})
const valid = (over = {}) => ({ email: 'ada@example.com', consent: 'on', ...over })

// A real Resend Audience ID is a UUID; the function now validates the shape.
const AUDIENCE_ID = '78261eea-1c2d-4e3f-9a0b-1c2d3e4f5a6b'

let fetchMock
beforeEach(() => {
  stores.clear()
  vi.stubEnv('RESEND_API_KEY', 're_test')
  vi.stubEnv('RESEND_AUDIENCE_ID', AUDIENCE_ID)
  fetchMock = vi.fn(async () => ({ ok: true, json: async () => ({ id: 'c1' }) }))
  vi.stubGlobal('fetch', fetchMock)
})
afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
})

describe('newsletter handler — protocol & config', () => {
  it('answers preflight with 204', async () => {
    expect((await handler({ httpMethod: 'OPTIONS', headers: {} })).statusCode).toBe(204)
  })
  it('rejects non-POST with 405', async () => {
    expect((await handler({ httpMethod: 'GET', headers: {} })).statusCode).toBe(405)
  })
  it('returns 500 when env vars are missing', async () => {
    vi.unstubAllEnvs()
    expect((await handler(post(valid()))).statusCode).toBe(500)
  })
  it('returns 500 (no Resend call) when the audience id is not a valid UUID', async () => {
    vi.stubEnv('RESEND_AUDIENCE_ID', 'not-a-uuid')
    expect((await handler(post(valid()))).statusCode).toBe(500)
    expect(fetchMock).not.toHaveBeenCalled()
  })
})

describe('newsletter handler — validation', () => {
  it('rejects an invalid email', async () => {
    expect((await handler(post(valid({ email: 'nope' })))).statusCode).toBe(400)
    expect(fetchMock).not.toHaveBeenCalled()
  })
  it('rejects when consent is not given', async () => {
    expect((await handler(post(valid({ consent: '' })))).statusCode).toBe(400)
  })
  it('silently accepts the honeypot without subscribing', async () => {
    const res = await handler(post(valid({ _gotcha: 'bot' })))
    expect(res.statusCode).toBe(200)
    expect(fetchMock).not.toHaveBeenCalled()
  })
})

describe('newsletter handler — Resend integration', () => {
  it('subscribes a valid signup and normalises the email to lowercase', async () => {
    const res = await handler(post(valid({ email: 'ADA@Example.com', first_name: 'Ada' })))
    expect(res.statusCode).toBe(200)
    const body = JSON.parse(fetchMock.mock.calls[0][1].body)
    expect(body.email).toBe('ada@example.com')
    expect(body.first_name).toBe('Ada')
    expect(body.unsubscribed).toBe(false)
    expect(fetchMock.mock.calls[0][0]).toContain(`/audiences/${AUDIENCE_ID}/contacts`)
  })

  it('files a consent record on signup without sending any extra email', async () => {
    const res = await handler(post(valid({ email: 'ADA@Example.com', first_name: 'Ada' })))
    expect(res.statusCode).toBe(200)
    expect(fetchMock).toHaveBeenCalledOnce() // only the Audience add — no confirmation mail

    const ledger = stores.get('newsletter-consent')
    expect(ledger.size).toBe(1)
    const record = [...ledger.values()][0]
    expect(record).toMatchObject({ email: 'ada@example.com', first_name: 'Ada', consentVersion: expect.any(String) })
    expect(record.consentStatement).toBeTruthy()
    expect(record.consentedAt).toBeTruthy()
  })

  it('also files a consent record when the subscriber already exists', async () => {
    fetchMock.mockResolvedValueOnce({ ok: false, status: 409, json: async () => ({}) })
    await handler(post(valid()))
    expect(stores.get('newsletter-consent').size).toBe(1)
  })

  it('treats a 409 (already subscribed) as idempotent success', async () => {
    fetchMock.mockResolvedValueOnce({ ok: false, status: 409, json: async () => ({}) })
    const res = await handler(post(valid()))
    expect(res.statusCode).toBe(200)
    expect(JSON.parse(res.body)).toMatchObject({ ok: true, already: true })
  })

  it('treats an "already exists" message as success even without a 409 status', async () => {
    fetchMock.mockResolvedValueOnce({ ok: false, status: 400, json: async () => ({ message: 'Contact already exists' }) })
    expect((await handler(post(valid()))).statusCode).toBe(200)
  })

  it('returns 502 on a genuine Resend error', async () => {
    fetchMock.mockResolvedValueOnce({ ok: false, status: 500, json: async () => ({ message: 'boom' }) })
    expect((await handler(post(valid()))).statusCode).toBe(502)
  })

  it('returns 502 when fetch throws', async () => {
    fetchMock.mockRejectedValueOnce(new Error('network down'))
    expect((await handler(post(valid()))).statusCode).toBe(502)
  })
})

describe('newsletter handler — rate limiting', () => {
  it('blocks the same IP with 429 after the per-IP window fills', async () => {
    for (let i = 0; i < 5; i++) expect((await handler(post(valid()))).statusCode).toBe(200)
    expect((await handler(post(valid()))).statusCode).toBe(429)
  })
})
