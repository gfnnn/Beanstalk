// Pins the webhook's unexpected-throw contract (the catch in handler()): an
// exception that escapes the per-step fail-safes must reply 500 — NOT a 200 ack —
// so Stripe redelivers and the payment confirmation is never silently swallowed.
// (An earlier revision acked errors with 200 { error: true }; this test makes that
// regression impossible.) Every db.js helper is internally fail-safe, so the only
// way to exercise the catch is to mock the storage module into genuinely throwing.
import { it, expect, vi } from 'vitest'

vi.mock('../src/lib/db.js', () => ({
  hasWebhookEvent:    vi.fn(async () => false),
  recordWebhookEvent: vi.fn(async () => ({ fresh: true })),
  getPayment:         vi.fn(async () => { throw new Error('unexpected explosion') }),
  markPaymentStatus:  vi.fn(async () => true),
  promoteFlashClaim:  vi.fn(async () => true),
  releaseFlashPiece:  vi.fn(async () => {}),
}))

import { handler } from '../src/handlers/stripe-webhook.js'
import { hmacHex } from '../src/lib/stripe.js'
import { recordWebhookEvent } from '../src/lib/db.js'

const SECRET = 'whsec_test'

it('an unexpected throw inside processing returns 500 and never records the event as seen', async () => {
  vi.spyOn(console, 'error').mockImplementation(() => {})
  const evt = {
    id: 'evt_boom', type: 'payment_intent.succeeded',
    data: { object: { id: 'pi_1', amount: 100, metadata: { reference: 'BSF-x-1', piece_id: 'x' } } },
  }
  const raw = JSON.stringify(evt)
  const t   = Math.floor(Date.now() / 1000)
  const v1  = await hmacHex(SECRET, `${t}.${raw}`)
  const res = await handler(
    { httpMethod: 'POST', headers: { 'stripe-signature': `t=${t},v1=${v1}` }, body: raw },
    { STRIPE_WEBHOOK_SECRET: SECRET },
  )
  expect(res.statusCode).toBe(500)                       // redeliver, don't ack
  expect(recordWebhookEvent).not.toHaveBeenCalled()      // retry won't be deduped away
})
