// Integration tests for src/handlers/newsletter.js via its handler. Mocks fetch
// (Resend Contacts API); the D1 binding is the in-memory fake. Notable behaviour
// pinned here: consent is mandatory, the honeypot is silent, an "already
// subscribed" response is idempotent success, and a consent record is filed.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { handler } from '../src/handlers/newsletter.js'
import { makeD1, brokenD1 } from './helpers/fake-d1.js'

// A real Resend Audience ID is a UUID; the function validates the shape.
const AUDIENCE_ID = '78261eea-1c2d-4e3f-9a0b-1c2d3e4f5a6b'

const post = (fields, headers = {}) => ({
  httpMethod: 'POST',
  headers: { origin: 'https://beansprout.ink', 'cf-connecting-ip': '7.7.7.7', ...headers },
  body: JSON.stringify({ fields }),
})
const valid = (over = {}) => ({ email: 'ada@example.com', consent: 'on', ...over })

let d1, env, fetchMock
const H = (event, e = env) => handler(event, e)

beforeEach(() => {
  d1 = makeD1()
  env = { RESEND_API_KEY: 're_test', RESEND_AUDIENCE_ID: AUDIENCE_ID, DB: d1.DB }
  fetchMock = vi.fn(async () => ({ ok: true, json: async () => ({ id: 'c1' }) }))
  vi.stubGlobal('fetch', fetchMock)
})
afterEach(() => { vi.unstubAllGlobals() })

describe('newsletter handler — protocol & config', () => {
  it('answers preflight with 204', async () => {
    expect((await H({ httpMethod: 'OPTIONS', headers: {} })).statusCode).toBe(204)
  })
  it('rejects non-POST with 405', async () => {
    expect((await H({ httpMethod: 'GET', headers: {} })).statusCode).toBe(405)
  })
  it('returns 500 when env vars are missing', async () => {
    expect((await H(post(valid()), { DB: d1.DB })).statusCode).toBe(500)
  })
  it('returns 500 (no Resend call) when the audience id is not a valid UUID', async () => {
    expect((await H(post(valid()), { ...env, RESEND_AUDIENCE_ID: 'not-a-uuid' })).statusCode).toBe(500)
    expect(fetchMock).not.toHaveBeenCalled()
  })
})

describe('newsletter handler — validation', () => {
  it('rejects an invalid email', async () => {
    expect((await H(post(valid({ email: 'nope' })))).statusCode).toBe(400)
    expect(fetchMock).not.toHaveBeenCalled()
  })
  it('rejects when consent is not given', async () => {
    expect((await H(post(valid({ consent: '' })))).statusCode).toBe(400)
  })
  it('silently accepts the honeypot without subscribing', async () => {
    const res = await H(post(valid({ _gotcha: 'bot' })))
    expect(res.statusCode).toBe(200)
    expect(fetchMock).not.toHaveBeenCalled()
  })
  it('rejects an oversized body before parsing it', async () => {
    const res = await H({ ...post(valid()), body: 'x'.repeat(64 * 1024 + 1) })
    expect(res.statusCode).toBe(413)
    expect(fetchMock).not.toHaveBeenCalled()
  })
})

describe('newsletter handler — Resend integration', () => {
  it('subscribes a valid signup and normalises the email to lowercase', async () => {
    const res = await H(post(valid({ email: 'ADA@Example.com', first_name: 'Ada' })))
    expect(res.statusCode).toBe(200)
    const body = JSON.parse(fetchMock.mock.calls[0][1].body)
    expect(body.email).toBe('ada@example.com')
    expect(body.first_name).toBe('Ada')
    expect(body.unsubscribed).toBe(false)
    expect(fetchMock.mock.calls[0][0]).toContain(`/audiences/${AUDIENCE_ID}/contacts`)
  })

  it('files a consent record on signup without sending any extra email', async () => {
    const res = await H(post(valid({ email: 'ADA@Example.com', first_name: 'Ada' })))
    expect(res.statusCode).toBe(200)
    expect(fetchMock).toHaveBeenCalledOnce() // only the Audience add — no confirmation mail

    expect(d1.data.consent.size).toBe(1)
    const record = [...d1.data.consent.values()][0]
    expect(record).toMatchObject({ email: 'ada@example.com', first_name: 'Ada', version: expect.any(String) })
    expect(record.statement).toBeTruthy()
    expect(record.consented_at).toBeTruthy()
  })

  it('also files a consent record when the subscriber already exists', async () => {
    fetchMock.mockResolvedValueOnce({ ok: false, status: 409, json: async () => ({}) })
    await H(post(valid()))
    expect(d1.data.consent.size).toBe(1)
  })

  it('treats a 409 (already subscribed) as idempotent success', async () => {
    fetchMock.mockResolvedValueOnce({ ok: false, status: 409, json: async () => ({}) })
    const res = await H(post(valid()))
    expect(res.statusCode).toBe(200)
    expect(JSON.parse(res.body)).toMatchObject({ ok: true, already: true })
  })

  it('treats an "already exists" message as success even without a 409 status', async () => {
    fetchMock.mockResolvedValueOnce({ ok: false, status: 400, json: async () => ({ message: 'Contact already exists' }) })
    expect((await H(post(valid()))).statusCode).toBe(200)
  })

  it('returns 502 on a genuine Resend error', async () => {
    fetchMock.mockResolvedValueOnce({ ok: false, status: 500, json: async () => ({ message: 'boom' }) })
    expect((await H(post(valid()))).statusCode).toBe(502)
  })

  it('returns 502 when fetch throws', async () => {
    fetchMock.mockRejectedValueOnce(new Error('network down'))
    expect((await H(post(valid()))).statusCode).toBe(502)
  })

  it('still subscribes (200) when the consent-ledger DB is down — signup is never blocked', async () => {
    // rate limiter fails open, the Resend add succeeds, and persistConsent fails
    // safe — so a DB outage costs the audit row, not the subscriber.
    const res = await H(post(valid()), { RESEND_API_KEY: 're_test', RESEND_AUDIENCE_ID: AUDIENCE_ID, DB: brokenD1() })
    expect(res.statusCode).toBe(200)
    expect(fetchMock).toHaveBeenCalledOnce()
  })
})

describe('newsletter handler — rate limiting', () => {
  it('blocks the same IP with 429 after the per-IP window fills', async () => {
    for (let i = 0; i < 5; i++) expect((await H(post(valid()))).statusCode).toBe(200)
    expect((await H(post(valid()))).statusCode).toBe(429)
  })
})
