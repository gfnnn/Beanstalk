// Tests for the Stripe payment confirmation path: the signature lib (src/lib/
// stripe.js) on its own, and the webhook handler end-to-end. Signatures are minted
// the same way Stripe does (HMAC over `${t}.${rawBody}`), the D1 fake runs the real
// promote/ledger logic, and Resend is mocked via fetch. Headline guarantees:
// forged/stale signatures are rejected, redelivery is idempotent, and the amount is
// re-checked server-side before a piece is ever marked sold.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { handler } from '../src/handlers/stripe-webhook.js'
import { verifyStripeSignature, hmacHex } from '../src/lib/stripe.js'
import { recordPayment, reserveFlashPiece } from '../src/lib/db.js'
import { makeD1, flashMap } from './helpers/fake-d1.js'

const SECRET = 'whsec_test'
const PIECE  = 'flash-01'
const REF    = 'BSF-flash-01-a1b2'
const PRICE  = 18000

// Build a signed request body the way Stripe signs it.
async function sign(evtObj, { secret = SECRET, t = Math.floor(Date.now() / 1000) } = {}) {
  const raw = JSON.stringify(evtObj)
  const v1  = await hmacHex(secret, `${t}.${raw}`)
  return { raw, header: `t=${t},v1=${v1}` }
}
const post = (raw, header) => ({ httpMethod: 'POST', headers: { 'stripe-signature': header }, body: raw })
const succeeded = (over = {}, metaOver = {}) => ({
  id: 'evt_1', type: 'payment_intent.succeeded',
  data: { object: {
    id: 'pi_123', amount: PRICE, receipt_email: 'ada@example.com',
    metadata: { reference: REF, piece_id: PIECE, name: 'Ada', ...metaOver },
    ...over,
  } },
})

let d1, env, fetchMock
const H = (event, e = env) => handler(event, e)

// Seed the state a prior /checkout would have left: a pending hold + awaiting payment.
async function seedCheckout() {
  await reserveFlashPiece(env, PIECE, new Date(Date.now() + 3600e3).toISOString())
  await recordPayment(env, { id: REF, kind: 'flash', status: 'awaiting', provider: 'stripe', amountPence: PRICE, email: 'ada@example.com', pieceId: PIECE })
}

beforeEach(() => {
  d1  = makeD1()
  env = { STRIPE_WEBHOOK_SECRET: SECRET, RESEND_API_KEY: 're_test', FROM_EMAIL: 'hello@beansprout.ink', ARTIST_EMAIL: 'artist@studio.test', DB: d1.DB }
  fetchMock = vi.fn(async () => ({ ok: true, status: 200, text: async () => '' }))
  vi.stubGlobal('fetch', fetchMock)
})
afterEach(() => { vi.unstubAllGlobals() })

describe('verifyStripeSignature', () => {
  it('accepts a correctly-signed payload', async () => {
    const { raw, header } = await sign({ id: 'evt_x', hello: 'world' })
    expect(await verifyStripeSignature(raw, header, SECRET)).toBe(true)
  })

  it('rejects a tampered payload, a wrong secret, and a missing header', async () => {
    const { raw, header } = await sign({ id: 'evt_x', amount: 100 })
    expect(await verifyStripeSignature(`${raw} `, header, SECRET)).toBe(false)
    expect(await verifyStripeSignature(raw, header, 'whsec_other')).toBe(false)
    expect(await verifyStripeSignature(raw, '', SECRET)).toBe(false)
  })

  it('rejects a signature outside the timestamp tolerance (replay guard)', async () => {
    const old = Math.floor(Date.now() / 1000) - 1000
    const { raw, header } = await sign({ id: 'evt_x' }, { t: old })
    expect(await verifyStripeSignature(raw, header, SECRET)).toBe(false)             // default 300s
    expect(await verifyStripeSignature(raw, header, SECRET, { toleranceSec: 2000 })).toBe(true)
  })
})

describe('stripe-webhook — protocol & signature', () => {
  it('answers OPTIONS with 204 and rejects GET with 405', async () => {
    expect((await H({ httpMethod: 'OPTIONS', headers: {} })).statusCode).toBe(204)
    expect((await H({ httpMethod: 'GET', headers: {} })).statusCode).toBe(405)
  })

  it('returns 500 when the webhook secret is unset', async () => {
    const { raw, header } = await sign(succeeded())
    expect((await H(post(raw, header), { ...env, STRIPE_WEBHOOK_SECRET: '' })).statusCode).toBe(500)
  })

  it('rejects a bad signature with 400 and changes nothing', async () => {
    await seedCheckout()
    const { raw } = await sign(succeeded())
    const res = await H(post(raw, 't=1,v1=deadbeef'))
    expect(res.statusCode).toBe(400)
    expect(flashMap(d1.data)).toEqual({ [PIECE]: 'pending' })   // not promoted
    expect(d1.data.payments.get(REF).status).toBe('awaiting')
    expect(fetchMock).not.toHaveBeenCalled()
  })
})

describe('stripe-webhook — payment_intent.succeeded', () => {
  it('promotes the piece, marks the payment paid, and emails customer + artist', async () => {
    await seedCheckout()
    const { raw, header } = await sign(succeeded())
    const res = await H(post(raw, header))
    expect(res.statusCode).toBe(200)

    expect(flashMap(d1.data)).toEqual({ [PIECE]: 'claimed' })
    const pay = d1.data.payments.get(REF)
    expect(pay.status).toBe('paid')
    expect(pay.provider_ref).toBe('pi_123')
    expect(pay.paid_at).toBeTruthy()
    expect(fetchMock).toHaveBeenCalledTimes(2)   // customer + artist
  })

  it('is idempotent — a redelivered event id promotes / emails only once', async () => {
    await seedCheckout()
    const { raw, header } = await sign(succeeded())
    const first  = await H(post(raw, header))
    const second = await H(post(raw, header))
    expect(JSON.parse(first.body)).toEqual({ received: true })
    expect(JSON.parse(second.body)).toEqual({ received: true, duplicate: true })
    expect(fetchMock).toHaveBeenCalledTimes(2)   // not 4
  })

  it('does NOT promote when the intent amount disagrees with the recorded price', async () => {
    await seedCheckout()
    const { raw, header } = await sign(succeeded({ amount: 999 }))
    const res = await H(post(raw, header))
    expect(res.statusCode).toBe(200)
    expect(flashMap(d1.data)).toEqual({ [PIECE]: 'pending' })   // untouched
    expect(d1.data.payments.get(REF).status).toBe('awaiting')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('still confirms (fail-open) when no payment row exists — promotes + emails from intent data', async () => {
    // Only the hold exists (e.g. the checkout DB write failed open); the webhook
    // must still honour a real payment by promoting the piece.
    await reserveFlashPiece(env, PIECE, new Date(Date.now() + 3600e3).toISOString())
    const { raw, header } = await sign(succeeded())
    const res = await H(post(raw, header))
    expect(res.statusCode).toBe(200)
    expect(flashMap(d1.data)).toEqual({ [PIECE]: 'claimed' })
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })
})

describe('stripe-webhook — other events', () => {
  it('payment_intent.canceled releases the hold and marks the payment expired', async () => {
    await seedCheckout()
    const evt = { id: 'evt_c', type: 'payment_intent.canceled', data: { object: { id: 'pi_123', metadata: { reference: REF, piece_id: PIECE } } } }
    const { raw, header } = await sign(evt)
    const res = await H(post(raw, header))
    expect(res.statusCode).toBe(200)
    expect(flashMap(d1.data)).toEqual({})                       // hold freed
    expect(d1.data.payments.get(REF).status).toBe('expired')
  })

  it('acknowledges an unrelated event type without side effects', async () => {
    await seedCheckout()
    const evt = { id: 'evt_o', type: 'charge.updated', data: { object: {} } }
    const { raw, header } = await sign(evt)
    const res = await H(post(raw, header))
    expect(res.statusCode).toBe(200)
    expect(JSON.parse(res.body)).toEqual({ received: true })
    expect(flashMap(d1.data)).toEqual({ [PIECE]: 'pending' })
    expect(d1.data.payments.get(REF).status).toBe('awaiting')
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
