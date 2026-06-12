// Integration tests for src/handlers/checkout.js, driven through the public
// handler(event, env). Stripe is mocked via global fetch; the D1 binding is the
// in-memory fake running the REAL src/lib/db.js logic, so the reserve / payment-
// ledger / rate-limit paths are exercised for real. The headline guarantees:
// server-side price authority (the client can't set the amount), and that a Stripe
// failure rolls BOTH the reservation and the payment row back.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { handler } from '../src/handlers/checkout.js'
import { makeD1, brokenD1, flashMap } from './helpers/fake-d1.js'
import FLASH_PRICES from '../src/data/flash-prices.json'

const PIECE = 'flash-01'
const PRICE = FLASH_PRICES[PIECE]   // 18000 pence — the manifest is the authority

const claim = (over = {}, fieldsOver = {}) => ({
  kind: 'flash', piece_id: PIECE,
  fields: { name: 'Ada Lovelace', email: 'ada@example.com', placement: 'forearm', ...fieldsOver },
  ...over,
})
const post = (body, headers = {}) => ({
  httpMethod: 'POST',
  headers: { origin: 'https://beansprout.ink', 'cf-connecting-ip': '5.5.5.5', ...headers },
  body: JSON.stringify(body),
})
const json = (res) => JSON.parse(res.body)
// The body of the (only) Stripe call, parsed back into URLSearchParams.
const stripeBody = (fetchMock) => new URLSearchParams(fetchMock.mock.calls[0][1].body)

let d1, env, fetchMock
const H = (event, e = env) => handler(event, e)

beforeEach(() => {
  d1  = makeD1()
  env = { STRIPE_SECRET_KEY: 'sk_test', PAYMENTS_ENABLED: 'true', DB: d1.DB }
  // A successful Stripe PaymentIntent create.
  fetchMock = vi.fn(async () => ({
    ok: true, status: 200,
    json: async () => ({ id: 'pi_123', client_secret: 'pi_123_secret_abc' }),
  }))
  vi.stubGlobal('fetch', fetchMock)
})
afterEach(() => { vi.unstubAllGlobals() })

describe('checkout handler — protocol & gating', () => {
  it('answers the CORS preflight with 204 and no body', async () => {
    const res = await H({ httpMethod: 'OPTIONS', headers: {} })
    expect(res.statusCode).toBe(204)
    expect(res.body).toBe('')
  })

  it('rejects non-POST methods with 405', async () => {
    expect((await H({ httpMethod: 'GET', headers: {} })).statusCode).toBe(405)
  })

  it('is OFF by default — 503 and no Stripe call unless PAYMENTS_ENABLED === "true"', async () => {
    const res = await H(post(claim()), { ...env, PAYMENTS_ENABLED: 'false' })
    expect(res.statusCode).toBe(503)
    expect(fetchMock).not.toHaveBeenCalled()
    expect(flashMap(d1.data)).toEqual({})   // nothing reserved
  })

  it('returns 500 when the Stripe key is missing', async () => {
    const res = await H(post(claim()), { PAYMENTS_ENABLED: 'true', DB: d1.DB })
    expect(res.statusCode).toBe(500)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('rejects invalid JSON with 400', async () => {
    const res = await H({ httpMethod: 'POST', headers: {}, body: '{not json' })
    expect(res.statusCode).toBe(400)
  })

  it('silently accepts a honeypot hit without charging or reserving', async () => {
    const res = await H(post(claim({}, { _gotcha: 'bot' })))
    expect(res.statusCode).toBe(200)
    expect(json(res)).toEqual({ ok: true })
    expect(fetchMock).not.toHaveBeenCalled()
    expect(flashMap(d1.data)).toEqual({})
  })
})

describe('checkout handler — validation & price authority', () => {
  it('rejects a non-flash kind (custom enquiries are never auto-priced here)', async () => {
    const res = await H(post(claim({ kind: 'enquiry' })))
    expect(res.statusCode).toBe(400)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('requires name + email and a valid email', async () => {
    expect((await H(post(claim({}, { name: '' })))).statusCode).toBe(400)
    expect((await H(post(claim({}, { email: '' })))).statusCode).toBe(400)
    expect((await H(post(claim({}, { email: 'nope' })))).statusCode).toBe(400)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('404s an unknown piece id — the price must exist in the manifest', async () => {
    const res = await H(post(claim({ piece_id: 'flash-999' })))
    expect(res.statusCode).toBe(404)
    expect(fetchMock).not.toHaveBeenCalled()
    expect(flashMap(d1.data)).toEqual({})
  })

  it('rejects an oversized body with 413 before parsing it', async () => {
    const res = await H({ httpMethod: 'POST', headers: {}, body: 'x'.repeat(64 * 1024 + 1) })
    expect(res.statusCode).toBe(413)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('tolerates a missing body and a non-object fields value (no throw, 400)', async () => {
    // No body at all → empty payload → not a flash checkout.
    expect((await H({ httpMethod: 'POST', headers: {} })).statusCode).toBe(400)
    // fields as a string must not crash field extraction — required fields missing.
    expect((await H(post({ kind: 'flash', piece_id: PIECE, fields: 'junk' }))).statusCode).toBe(400)
    // piece_id absent everywhere → unknown piece.
    expect((await H(post({ kind: 'flash', fields: { name: 'Ada', email: 'ada@example.com' } }))).statusCode).toBe(404)
  })

  it('accepts the piece id from fields.piece_id when the top-level key is absent', async () => {
    const res = await H(post({ kind: 'flash', fields: { name: 'Ada', email: 'ada@example.com', piece_id: PIECE } }))
    expect(res.statusCode).toBe(200)
    expect(json(res).amount).toBe(PRICE)
    expect(flashMap(d1.data)).toEqual({ [PIECE]: 'pending' })
  })

  it('charges the MANIFEST price, ignoring any amount the client tries to send', async () => {
    // A tampered client supplies its own (tiny) amount/price everywhere it could.
    const res = await H(post(claim({ amount: 1, price: 1 }, { amount: 1, price: 1 })))
    expect(res.statusCode).toBe(200)
    const body = stripeBody(fetchMock)
    expect(body.get('amount')).toBe(String(PRICE))   // 18000, not 1
    expect(body.get('currency')).toBe('gbp')
    expect(json(res).amount).toBe(PRICE)
  })
})

describe('checkout handler — happy path', () => {
  it('reserves the piece (with a future hold), records an awaiting payment, returns the client secret', async () => {
    const res = await H(post(claim()))
    expect(res.statusCode).toBe(200)
    const out = json(res)
    expect(out.clientSecret).toBe('pi_123_secret_abc')
    expect(out.reference).toMatch(/^BSF-flash-01-[a-z0-9]{8}$/)
    expect(out.amount).toBe(PRICE)

    // Piece reserved as pending, with a hold expiry in the future.
    expect(flashMap(d1.data)).toEqual({ [PIECE]: 'pending' })
    expect(new Date(d1.data.flash.get(PIECE).expires_at).getTime()).toBeGreaterThan(Date.now())

    // Payment row is awaiting, priced by the manifest, with the Stripe id attached.
    const pay = d1.data.payments.get(out.reference)
    expect(pay.status).toBe('awaiting')
    expect(pay.amount_pence).toBe(PRICE)
    expect(pay.provider).toBe('stripe')
    expect(pay.provider_ref).toBe('pi_123')
    expect(pay.email).toBe('ada@example.com')
    expect(pay.piece_id).toBe(PIECE)

    // Stripe was asked with our key + an idempotency key = our reference.
    const [url, opts] = fetchMock.mock.calls[0]
    expect(url).toBe('https://api.stripe.com/v1/payment_intents')
    expect(opts.headers.Authorization).toBe('Bearer sk_test')
    expect(opts.headers['Idempotency-Key']).toBe(out.reference)
    expect(stripeBody(fetchMock).get('metadata[reference]')).toBe(out.reference)
  })

  it('spends a rate-limit slot only on success', async () => {
    await H(post(claim()))
    expect(d1.data.rate.some(r => r.bucket.startsWith('checkout-rate:ip:'))).toBe(true)
  })
})

describe('checkout handler — conflicts & rollback', () => {
  it('409s when the piece is already reserved, without charging', async () => {
    d1.data.flash.set(PIECE, { status: 'pending', updated_at: 'x', expires_at: null })
    const res = await H(post(claim()))
    expect(res.statusCode).toBe(409)
    expect(json(res).status).toBe('pending')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('rolls BOTH the reservation and the payment back when Stripe rejects the intent', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: false, status: 402,
      json: async () => ({ error: { message: 'card_declined' } }),
    })
    const res = await H(post(claim()))
    expect(res.statusCode).toBe(502)
    expect(flashMap(d1.data)).toEqual({})                  // piece freed again
    const pay = [...d1.data.payments.values()][0]
    expect(pay.status).toBe('failed')                      // ledger records the failure
  })

  it('rolls back when the Stripe call throws (network error)', async () => {
    fetchMock.mockRejectedValueOnce(new Error('network'))
    const res = await H(post(claim()))
    expect(res.statusCode).toBe(502)
    expect(flashMap(d1.data)).toEqual({})
    expect([...d1.data.payments.values()][0].status).toBe('failed')
  })

  it('treats a 200 without a client_secret as a failure (rolls back)', async () => {
    fetchMock.mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ id: 'pi_x' }) })
    const res = await H(post(claim()))
    expect(res.statusCode).toBe(502)
    expect(flashMap(d1.data)).toEqual({})
  })

  it('treats an unparseable Stripe response body as a failure (rolls back)', async () => {
    fetchMock.mockResolvedValueOnce({ ok: true, status: 200, json: async () => { throw new Error('bad json') } })
    const res = await H(post(claim()))
    expect(res.statusCode).toBe(502)
    expect(flashMap(d1.data)).toEqual({})
    expect([...d1.data.payments.values()][0].status).toBe('failed')
  })
})

describe('checkout handler — rate limiting', () => {
  it('429s once the per-IP checkout window is full, before reserving or charging', async () => {
    const now = Date.now()
    for (let i = 0; i < 5; i++) d1.data.rate.push({ bucket: 'checkout-rate:ip:5.5.5.5', ts: now })
    const res = await H(post(claim()))
    expect(res.statusCode).toBe(429)
    expect(fetchMock).not.toHaveBeenCalled()
    expect(flashMap(d1.data)).toEqual({})
  })

  it('still works when the DB is down — fails open, charges, never throws', async () => {
    const res = await H(post(claim()), { ...env, DB: brokenD1() })
    expect(res.statusCode).toBe(200)
    expect(json(res).clientSecret).toBe('pi_123_secret_abc')
  })
})
