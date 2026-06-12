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

// Seed the state a prior /checkout would have left: a pending hold (tied to the
// payment's reference, as checkout reserves it) + an awaiting payment row.
async function seedCheckout() {
  await reserveFlashPiece(env, PIECE, new Date(Date.now() + 3600e3).toISOString(), REF)
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

  it('rejects a malformed header: missing t, non-numeric t, or no v1 signature', async () => {
    const { raw, header } = await sign({ id: 'evt_x' })
    const v1 = header.split('v1=')[1]
    expect(await verifyStripeSignature(raw, `v1=${v1}`, SECRET)).toBe(false)          // no t
    expect(await verifyStripeSignature(raw, `t=abc,v1=${v1}`, SECRET)).toBe(false)    // NaN t
    expect(await verifyStripeSignature(raw, header.split(',')[0], SECRET)).toBe(false) // t only, no v1
  })

  it('rejects a wrong-length v1 (the constant-time compare fails closed)', async () => {
    const t = Math.floor(Date.now() / 1000)
    const { raw } = await sign({ id: 'evt_x' }, { t })
    expect(await verifyStripeSignature(raw, `t=${t},v1=deadbeef`, SECRET)).toBe(false)
  })

  it('skips junk header parts without "=" and a non-string payload fails closed', async () => {
    const { raw, header } = await sign({ id: 'evt_x' })
    // A stray comma-part with no key=value must not break parsing of the real sig.
    expect(await verifyStripeSignature(raw, `junk,${header}`, SECRET)).toBe(true)
    // Nor an empty v1= part during a (malformed) secret rotation.
    expect(await verifyStripeSignature(raw, `v1=,${header}`, SECRET)).toBe(true)
    expect(await verifyStripeSignature(null, header, SECRET)).toBe(false)
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

  it('rejects a correctly-signed but non-JSON payload with 400', async () => {
    const raw = 'not json at all'
    const t   = Math.floor(Date.now() / 1000)
    const v1  = await hmacHex(SECRET, `${t}.${raw}`)
    const res = await H(post(raw, `t=${t},v1=${v1}`))
    expect(res.statusCode).toBe(400)
    expect(JSON.parse(res.body).error).toMatch(/invalid payload/i)
  })

  it('rejects a request with a non-string body or no headers at all (no throw)', async () => {
    // The adapter always provides a string body, but the handler must fail closed
    // (not crash) if either is missing — both collapse to a failed signature.
    expect((await H({ httpMethod: 'POST', headers: { 'stripe-signature': 't=1,v1=ab' }, body: null })).statusCode).toBe(400)
    expect((await H({ httpMethod: 'POST', body: '{}' })).statusCode).toBe(400)
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

  it('claims the piece even when the 48h hold was already swept (paid after lapse)', async () => {
    // The pending hold expired and the lazy sweep deleted it, but the customer
    // still completed the PaymentIntent. A verified payment must end with the
    // piece claimed — never silently relisted for a second sale.
    await seedCheckout()
    d1.data.flash.delete(PIECE)   // simulate expirePendingClaims having run
    const { raw, header } = await sign(succeeded())
    const res = await H(post(raw, header))
    expect(res.statusCode).toBe(200)
    expect(flashMap(d1.data)).toEqual({ [PIECE]: 'claimed' })
    expect(d1.data.payments.get(REF).status).toBe('paid')
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

  it('a delayed cancel never releases a NEWER customer’s hold on the same piece', async () => {
    // Checkout A's hold lapsed and was swept; customer B then reserved the piece
    // under their own reference. A's late `canceled` event must not free B's hold.
    await recordPayment(env, { id: REF, kind: 'flash', status: 'awaiting', provider: 'stripe', amountPence: PRICE, email: 'ada@example.com', pieceId: PIECE })
    await reserveFlashPiece(env, PIECE, new Date(Date.now() + 3600e3).toISOString(), 'BSF-flash-01-newcust1')
    const evt = { id: 'evt_late', type: 'payment_intent.canceled', data: { object: { id: 'pi_123', metadata: { reference: REF, piece_id: PIECE } } } }
    const { raw, header } = await sign(evt)
    const res = await H(post(raw, header))
    expect(res.statusCode).toBe(200)
    expect(flashMap(d1.data)).toEqual({ [PIECE]: 'pending' })   // B's hold survives
    expect(d1.data.payments.get(REF).status).toBe('expired')    // A's ledger row still settles
  })

  it('replies 500 when ONLY the inventory promote fails — a paid piece must never be acked unclaimed', async () => {
    // The dangerous partial: the ledger write sticks but the flash_claims write
    // hits a transient D1 error. Acking would leave the paid piece 'pending' →
    // swept by expirePendingClaims → silently relisted for a second sale. The
    // handler must ask Stripe to redeliver instead, then settle on the retry.
    await seedCheckout()
    const { raw, header } = await sign(succeeded())

    const realPrepare = d1.DB.prepare.bind(d1.DB)
    d1.DB.prepare = (sql) => {
      if (/INSERT INTO flash_claims/i.test(sql) && /claimed/.test(sql)) throw new Error('D1 blip')
      return realPrepare(sql)
    }
    const failed = await H(post(raw, header))
    expect(failed.statusCode).toBe(500)
    expect(fetchMock).not.toHaveBeenCalled()                    // no "you're booked" email
    expect(flashMap(d1.data)).toEqual({ [PIECE]: 'pending' })   // not promoted

    // D1 recovers; the redelivery (same event id — must NOT be deduped) completes.
    d1.DB.prepare = realPrepare
    const retried = await H(post(raw, header))
    expect(retried.statusCode).toBe(200)
    expect(JSON.parse(retried.body)).toEqual({ received: true })
    expect(flashMap(d1.data)).toEqual({ [PIECE]: 'claimed' })
    expect(d1.data.payments.get(REF).status).toBe('paid')
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('replies 500 (so Stripe redelivers) when nothing durable could be written, and recovers on retry', async () => {
    await seedCheckout()
    const { raw, header } = await sign(succeeded())

    // Simulate a transient D1 outage for the processing run: every statement
    // throws. The handler must NOT record the event as seen, and must surface a
    // 5xx so Stripe's at-least-once redelivery becomes the recovery path.
    const realPrepare = d1.DB.prepare.bind(d1.DB)
    d1.DB.prepare = () => { throw new Error('D1 down') }
    const failed = await H(post(raw, header))
    expect(failed.statusCode).toBe(500)
    expect(fetchMock).not.toHaveBeenCalled()                    // no premature emails

    // D1 recovers; the redelivered event processes cleanly (not deduped away).
    d1.DB.prepare = realPrepare
    const retried = await H(post(raw, header))
    expect(retried.statusCode).toBe(200)
    expect(JSON.parse(retried.body)).toEqual({ received: true })
    expect(flashMap(d1.data)).toEqual({ [PIECE]: 'claimed' })
    expect(d1.data.payments.get(REF).status).toBe('paid')
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

  it('settles a succeeded intent that carries no reference of ours (not our checkout — ack, no retry loop)', async () => {
    await seedCheckout()
    const evt = { id: 'evt_nr', type: 'payment_intent.succeeded', data: { object: { id: 'pi_x', amount: 100, metadata: {} } } }
    const { raw, header } = await sign(evt)
    const res = await H(post(raw, header))
    expect(res.statusCode).toBe(200)                            // settled, not 500
    expect(flashMap(d1.data)).toEqual({ [PIECE]: 'pending' })   // nothing touched
    expect(fetchMock).not.toHaveBeenCalled()
    // …and the event was recorded as processed, so a redelivery dedupes.
    expect(JSON.parse((await H(post(raw, header))).body)).toEqual({ received: true, duplicate: true })
  })

  it('a canceled intent without metadata is acknowledged without touching anything', async () => {
    await seedCheckout()
    const evt = { id: 'evt_nm', type: 'payment_intent.canceled', data: { object: { id: 'pi_x' } } }
    const { raw, header } = await sign(evt)
    expect((await H(post(raw, header))).statusCode).toBe(200)
    expect(flashMap(d1.data)).toEqual({ [PIECE]: 'pending' })   // hold survives
    expect(d1.data.payments.get(REF).status).toBe('awaiting')
  })
})

describe('stripe-webhook — notification emails', () => {
  // The emails are best-effort decoration on the money path: every failure mode
  // here must end in a 200 with the promotion already durable — a mail problem
  // must never make Stripe redeliver (or worse, look like a failed payment).
  const fired = () => fetchMock.mock.calls.map(c => JSON.parse(c[1].body))

  it('skips emails entirely (still 200, still promoted) without Resend config', async () => {
    await seedCheckout()
    env = { ...env, RESEND_API_KEY: '', FROM_EMAIL: '' }
    const { raw, header } = await sign(succeeded())
    expect((await H(post(raw, header))).statusCode).toBe(200)
    expect(flashMap(d1.data)).toEqual({ [PIECE]: 'claimed' })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('survives the email POST rejecting outright — payment still confirmed and recorded', async () => {
    await seedCheckout()
    fetchMock.mockRejectedValue(new Error('resend down'))
    const { raw, header } = await sign(succeeded())
    const res = await H(post(raw, header))
    expect(res.statusCode).toBe(200)
    expect(flashMap(d1.data)).toEqual({ [PIECE]: 'claimed' })
    expect(d1.data.payments.get(REF).status).toBe('paid')
    // Recorded as processed: the redelivery dedupes instead of re-promoting.
    expect(JSON.parse((await H(post(raw, header))).body)).toEqual({ received: true, duplicate: true })
  })

  it('logs (and still 200s) when Resend answers non-ok — even if reading its body fails', async () => {
    await seedCheckout()
    fetchMock.mockResolvedValue({ ok: false, status: 500, text: async () => { throw new Error('no body') } })
    const { raw, header } = await sign(succeeded())
    expect((await H(post(raw, header))).statusCode).toBe(200)
    expect(flashMap(d1.data)).toEqual({ [PIECE]: 'claimed' })
  })

  it('uses a pre-formatted FROM_EMAIL verbatim and falls back to receipt_email with no payment row', async () => {
    // No payment row (fail-open checkout) → the customer address comes from the
    // intent's receipt_email; a display-name FROM_EMAIL must not be re-wrapped.
    await reserveFlashPiece(env, PIECE, new Date(Date.now() + 3600e3).toISOString())
    env = { ...env, FROM_EMAIL: 'Beansprout Studio <hello@beansprout.ink>' }
    const { raw, header } = await sign(succeeded())
    expect((await H(post(raw, header))).statusCode).toBe(200)
    const payloads = fired()
    expect(payloads).toHaveLength(2)
    for (const p of payloads) expect(p.from).toBe('Beansprout Studio <hello@beansprout.ink>')
    expect(payloads.some(p => p.to.includes('ada@example.com'))).toBe(true)   // receipt_email fallback
  })

  it('sends only the artist notice when no customer address is known anywhere', async () => {
    await reserveFlashPiece(env, PIECE, new Date(Date.now() + 3600e3).toISOString())
    const { raw, header } = await sign(succeeded({ receipt_email: null }, { name: undefined }))
    expect((await H(post(raw, header))).statusCode).toBe(200)
    const payloads = fired()
    expect(payloads).toHaveLength(1)
    expect(payloads[0].to).toEqual(['artist@studio.test'])
    expect(payloads[0].reply_to).toBeUndefined()
  })

  it('sends only the customer receipt when no ARTIST_EMAIL is configured', async () => {
    await seedCheckout()
    env = { ...env, ARTIST_EMAIL: '' }
    const { raw, header } = await sign(succeeded())
    expect((await H(post(raw, header))).statusCode).toBe(200)
    const payloads = fired()
    expect(payloads).toHaveLength(1)
    expect(payloads[0].to).toEqual(['ada@example.com'])
  })
})
