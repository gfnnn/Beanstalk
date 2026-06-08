// Tests for the payments backbone in src/lib/db.js (migration 0002): the money
// ledger, flash-claim promotion, stale-hold expiry, and webhook idempotency. Like
// the rest of the storage suite these run the REAL SQL-issuing code against the
// in-memory D1 fake, and pin the FAIL-SAFE behaviour with a "broken" binding — a
// DB hiccup must never throw into a payment flow.
import { describe, it, expect } from 'vitest'
import {
  recordPayment, getPayment, markPaymentStatus,
  promoteFlashClaim, expirePendingClaims, recordWebhookEvent,
  reserveFlashPiece, getFlashClaims,
} from '../src/lib/db.js'
import { makeD1, brokenD1, flashMap } from './helpers/fake-d1.js'

const broken = { DB: brokenD1() }
const futureISO = () => new Date(Date.now() + 48 * 3600 * 1000).toISOString()

describe('payments ledger', () => {
  it('records an awaiting payment and reads it back with sensible defaults', async () => {
    const d1 = makeD1()
    const e = { DB: d1.DB }
    const ok = await recordPayment(e, {
      id: 'BSF-flash-01-a1b2', kind: 'flash', amountPence: 18000,
      email: 'a@b.co', pieceId: 'flash-01', submissionId: 'flash/123',
    })
    expect(ok).toBe(true)
    const row = await getPayment(e, 'BSF-flash-01-a1b2')
    expect(row.status).toBe('awaiting')   // default
    expect(row.provider).toBe('stripe')   // default
    expect(row.currency).toBe('gbp')      // default
    expect(row.amount_pence).toBe(18000)
    expect(row.piece_id).toBe('flash-01')
    expect(row.paid_at).toBeNull()
  })

  it('never overwrites an existing reference (ON CONFLICT DO NOTHING)', async () => {
    const d1 = makeD1()
    const e = { DB: d1.DB }
    await recordPayment(e, { id: 'ref', amountPence: 100, status: 'awaiting' })
    await recordPayment(e, { id: 'ref', amountPence: 999, status: 'paid' })
    const row = await getPayment(e, 'ref')
    expect(row.amount_pence).toBe(100)    // first write wins
    expect(row.status).toBe('awaiting')
  })

  it('marks paid with paid_at + the provider id, and COALESCE keeps them on a later status flip', async () => {
    const d1 = makeD1()
    const e = { DB: d1.DB }
    await recordPayment(e, { id: 'ref', amountPence: 100, providerRef: 'cs_123' })
    expect(await markPaymentStatus(e, 'ref', 'paid', { providerRef: 'pi_456', paidAt: '2026-06-07T00:00:00Z' })).toBe(true)
    let row = await getPayment(e, 'ref')
    expect(row.status).toBe('paid')
    expect(row.provider_ref).toBe('pi_456')
    expect(row.paid_at).toBe('2026-06-07T00:00:00Z')
    // A status-only flip (no ref/paid_at) must not wipe what's already there.
    await markPaymentStatus(e, 'ref', 'refunded')
    row = await getPayment(e, 'ref')
    expect(row.status).toBe('refunded')
    expect(row.provider_ref).toBe('pi_456')
    expect(row.paid_at).toBe('2026-06-07T00:00:00Z')
  })

  it('markPaymentStatus returns false for an unknown id', async () => {
    expect(await markPaymentStatus({ DB: makeD1().DB }, 'nope', 'paid')).toBe(false)
  })

  it('ignores a record with no id (returns false, writes nothing)', async () => {
    const d1 = makeD1()
    expect(await recordPayment({ DB: d1.DB }, { amountPence: 1 })).toBe(false)
    expect(d1.data.payments.size).toBe(0)
  })

  it('fails safe when the DB is down (never throws)', async () => {
    await expect(recordPayment(broken, { id: 'x', amountPence: 1 })).resolves.toBe(false)
    await expect(getPayment(broken, 'x')).resolves.toBeNull()
    await expect(markPaymentStatus(broken, 'x', 'paid')).resolves.toBe(false)
  })
})

describe('promoteFlashClaim', () => {
  it('promotes a pending reserve to claimed, clears its hold, and is idempotent', async () => {
    const d1 = makeD1()
    const e = { DB: d1.DB }
    await reserveFlashPiece(e, 'flash-01', futureISO())
    expect(await promoteFlashClaim(e, 'flash-01')).toBe(true)
    expect(flashMap(d1.data)).toEqual({ 'flash-01': 'claimed' })
    expect(d1.data.flash.get('flash-01').expires_at).toBeNull()   // sold → no expiry sweep
    expect(await promoteFlashClaim(e, 'flash-01')).toBe(false)     // re-delivered webhook = no-op
  })

  it('is a no-op on a piece that was never reserved', async () => {
    expect(await promoteFlashClaim({ DB: makeD1().DB }, 'ghost')).toBe(false)
  })

  it('fails safe when the DB is down', async () => {
    expect(await promoteFlashClaim(broken, 'flash-01')).toBe(false)
  })
})

describe('expirePendingClaims', () => {
  it('frees lapsed pending holds, but never claims, fresh holds, or no-expiry reserves', async () => {
    const d1 = makeD1()
    const e = { DB: d1.DB }
    await reserveFlashPiece(e, 'lapsed', '2000-01-01T00:00:00Z') // expired pending
    await reserveFlashPiece(e, 'fresh',  futureISO())            // valid pending
    await reserveFlashPiece(e, 'manual')                         // legacy reserve, no expiry
    await reserveFlashPiece(e, 'sold',   '2000-01-01T00:00:00Z') // past hold, but then sold
    await promoteFlashClaim(e, 'sold')

    const freed = await expirePendingClaims(e, '2020-01-01T00:00:00Z')
    expect(freed).toBe(1)
    expect(flashMap(d1.data)).toEqual({ fresh: 'pending', manual: 'pending', sold: 'claimed' })
  })

  it('fails safe → 0 when the DB is down', async () => {
    expect(await expirePendingClaims(broken)).toBe(0)
  })

  it('getFlashClaims sweeps lapsed holds on read when payments are ON (lazy release, no cron)', async () => {
    const d1 = makeD1()
    const e  = { DB: d1.DB, PAYMENTS_ENABLED: 'true' }
    await reserveFlashPiece(e, 'lapsed', '2000-01-01T00:00:00Z')   // expired
    await reserveFlashPiece(e, 'fresh',  futureISO())              // still held
    expect(await getFlashClaims(e)).toEqual({ fresh: 'pending' })  // lapsed gone
    expect(d1.data.flash.has('lapsed')).toBe(false)
  })

  it('getFlashClaims does NOT sweep when payments are OFF — the non-payment grid is untouched', async () => {
    const d1 = makeD1()
    const e  = { DB: d1.DB }   // no PAYMENTS_ENABLED
    await reserveFlashPiece(e, 'lapsed', '2000-01-01T00:00:00Z')
    // The sweep is skipped entirely, so even a (hypothetical) lapsed hold is reported as-is.
    expect(await getFlashClaims(e)).toEqual({ lapsed: 'pending' })
    expect(d1.data.flash.has('lapsed')).toBe(true)
  })
})

describe('reserveFlashPiece — hold expiry', () => {
  it('stores expires_at when given and leaves it null otherwise', async () => {
    const d1 = makeD1()
    const e = { DB: d1.DB }
    const exp = futureISO()
    await reserveFlashPiece(e, 'withexp', exp)
    await reserveFlashPiece(e, 'noexp')
    expect(d1.data.flash.get('withexp').expires_at).toBe(exp)
    expect(d1.data.flash.get('noexp').expires_at).toBeNull()
  })
})

describe('recordWebhookEvent (idempotency)', () => {
  it('is fresh on first delivery and a replay thereafter', async () => {
    const d1 = makeD1()
    const e = { DB: d1.DB }
    expect(await recordWebhookEvent(e, 'evt_1', 'checkout.session.completed')).toEqual({ fresh: true })
    expect(await recordWebhookEvent(e, 'evt_1', 'checkout.session.completed')).toEqual({ fresh: false })
  })

  it('treats a missing id as fresh (nothing to dedupe on)', async () => {
    expect(await recordWebhookEvent({ DB: makeD1().DB }, '')).toEqual({ fresh: true })
  })

  it('FAILS OPEN (fresh: true) when the DB is down — the downstream promote/markPaid are idempotent', async () => {
    expect(await recordWebhookEvent(broken, 'evt_x', 't')).toEqual({ fresh: true })
  })
})
