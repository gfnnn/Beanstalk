// src/handlers/checkout.js
// ─────────────────────────────────────────────────────────────────────────────
// POST /checkout — begin a flash payment (Phase 1).
//
// Embedded, on-site: returns a Stripe **PaymentIntent client_secret** the browser
// mounts in a Payment Element (card + Klarna). The charged amount is OUR price from
// the build-time manifest (src/data/flash-prices.json) — the client never sends an
// amount, so it can't be tampered with. A durable 'awaiting' payment row is written
// and the piece is reserved (48h hold) BEFORE Stripe is called; both are rolled
// back if the Stripe call fails, so an error never strands a one-of-a-kind piece.
//
// Receives JSON { kind:'flash', piece_id, fields:{ name, email, placement? } }.
// Returns 200 { clientSecret, reference, amount, currency }.
//
// Required env:
//   STRIPE_SECRET_KEY  sk_… (Worker secret)
//   PAYMENTS_ENABLED   'true' to accept checkouts (anything else → 503, so the code
//                      ships "dark" until live keys are in place)
//   DB                 D1 binding (payment ledger + flash inventory + rate limit)
// The webhook (src/handlers/stripe-webhook.js) confirms the payment out-of-band.
// Abuse protection (CORS allowlist + D1 rate limit) is shared — see ../lib.
// ─────────────────────────────────────────────────────────────────────────────
import { corsFor, replyWith, clientIp, EMAIL_RE } from '../lib/http.js'
import {
  rateLimit, reserveFlashPiece, releaseFlashPiece,
  recordPayment, markPaymentStatus,
} from '../lib/db.js'
import FLASH_PRICES from '../data/flash-prices.json'

const HOLD_MS        = 48 * 60 * 60 * 1000  // how long an unpaid reserve is held
const MAX_BODY_BYTES = 64 * 1024            // no images here — a checkout body is tiny
const MAX_FIELD_LEN  = 2000
const CURRENCY       = 'gbp'
const STRIPE_API     = 'https://api.stripe.com/v1/payment_intents'

export async function handler(event, env = {}) {
  const cors  = corsFor(event)
  const reply = replyWith(cors)

  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: cors, body: '' }
  if (event.httpMethod !== 'POST')    return reply(405, { error: 'Method not allowed.' })

  // Ship dark: the route exists but declines until the studio flips the flag (and
  // has set live keys). Keeps the whole integration deployable behind one switch.
  if (String(env.PAYMENTS_ENABLED) !== 'true') {
    return reply(503, { error: 'Online payment isn’t live yet. Complete your claim by enquiry and we’ll arrange payment.' })
  }
  if (!env.STRIPE_SECRET_KEY) {
    console.error('checkout: STRIPE_SECRET_KEY missing')
    return reply(500, { error: 'Payment isn’t configured yet. Please try again shortly.' })
  }

  // Reject an oversized body before parsing it.
  if (typeof event.body === 'string' && event.body.length > MAX_BODY_BYTES) {
    return reply(413, { error: 'Your request is too large.' })
  }
  let payload
  try { payload = JSON.parse(event.body || '{}') }
  catch { return reply(400, { error: 'Invalid request.' }) }

  const fields = payload.fields && typeof payload.fields === 'object' ? payload.fields : {}

  // Honeypot — a bot filled the hidden field. Pretend success, charge nothing.
  if (String(fields._gotcha || '').trim()) return reply(200, { ok: true })

  // Phase 1 is flash only; a custom enquiry is never auto-priced here.
  if (payload.kind !== 'flash') {
    return reply(400, { error: 'Online payment is only available for flash pieces.' })
  }

  // ── Validate ────────────────────────────────────────────────────────────────
  const name    = String(fields.name || '').trim().slice(0, MAX_FIELD_LEN)
  const email   = String(fields.email || '').trim().slice(0, MAX_FIELD_LEN)
  const pieceId = String(payload.piece_id || fields.piece_id || '').trim()
  if (!name || !email)       return reply(400, { error: 'Please complete the required fields.' })
  if (!EMAIL_RE.test(email)) return reply(400, { error: 'Please enter a valid email address.' })

  // ── Server-side price authority ──────────────────────────────────────────────
  // The amount is looked up by piece id from the manifest — NEVER read from the
  // request — so a tampered client can't change what it's charged.
  const amountPence = FLASH_PRICES[pieceId]
  if (!Number.isInteger(amountPence) || amountPence <= 0) {
    return reply(404, { error: 'We couldn’t find that piece. Please pick one from the flash page.' })
  }

  // ── Rate limit — gate BEFORE any reserve/charge work ─────────────────────────
  const limiter = await rateLimit(env, clientIp(event), { storeName: 'checkout-rate' })
  if (!limiter.ok) {
    return reply(429, { error: 'You’ve started a few checkouts already. Please email hello@beansprout.ink and we’ll help.' })
  }

  // ── Reserve the piece (48h hold) — 409 if already taken ──────────────────────
  const expiresAt   = new Date(Date.now() + HOLD_MS).toISOString()
  const reservation = await reserveFlashPiece(env, pieceId, expiresAt)
  if (!reservation.ok) {
    return reply(409, {
      error: 'Sorry — that piece was just claimed by someone else. Have a look at what’s still available.',
      status: reservation.status,
    })
  }
  const reservedHere = reservation.reserved === true

  // ── Persist 'awaiting' BEFORE charging, so the payment is durable from t0 ─────
  const reference = makeRef(pieceId)
  await recordPayment(env, {
    id: reference, kind: 'flash', status: 'awaiting', provider: 'stripe',
    amountPence, currency: CURRENCY, email, pieceId,
  })

  // ── Create the Stripe PaymentIntent (embedded Payment Element) ───────────────
  try {
    const body = new URLSearchParams()
    body.set('amount', String(amountPence))
    body.set('currency', CURRENCY)
    body.set('automatic_payment_methods[enabled]', 'true')  // card + Klarna, configured in the dashboard
    body.set('receipt_email', email)
    body.set('description', `Flash · ${pieceId}`)
    body.set('metadata[reference]', reference)               // the key the webhook reconciles on
    body.set('metadata[piece_id]', pieceId)
    body.set('metadata[name]', name)
    if (fields.placement) body.set('metadata[placement]', String(fields.placement).slice(0, MAX_FIELD_LEN))

    const res = await fetch(STRIPE_API, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.STRIPE_SECRET_KEY}`,
        'Content-Type': 'application/x-www-form-urlencoded',
        // A retried checkout with the same reference reuses the intent, never doubles it.
        'Idempotency-Key': reference,
      },
      body: body.toString(),
    })
    const intent = await res.json().catch(() => ({}))
    if (!res.ok || !intent.client_secret) {
      console.error('Stripe PaymentIntent error', res.status, intent?.error?.message || '')
      await markPaymentStatus(env, reference, 'failed')
      if (reservedHere) await releaseFlashPiece(env, pieceId)   // don't strand the piece
      return reply(502, { error: 'We couldn’t start the payment just now. Please try again shortly.' })
    }
    // Save the provider id (status stays 'awaiting' until the webhook confirms paid).
    await markPaymentStatus(env, reference, 'awaiting', { providerRef: intent.id })
    await limiter.commit()
    return reply(200, { clientSecret: intent.client_secret, reference, amount: amountPence, currency: CURRENCY })
  } catch (err) {
    console.error('checkout: Stripe call failed', err)
    await markPaymentStatus(env, reference, 'failed')
    if (reservedHere) await releaseFlashPiece(env, pieceId)
    return reply(502, { error: 'We couldn’t start the payment just now. Please try again shortly.' })
  }
}

// Our payment reference: BSF-<piece-id>-<4 lowercase base36 chars>. A stable id WE
// own (the Stripe pi_… is stored alongside as provider_ref); it's the metadata key
// the webhook reconciles on and the Stripe idempotency key.
function makeRef(pieceId) {
  const rand = Math.random().toString(36).slice(2, 6).padEnd(4, '0')
  return `BSF-${pieceId}-${rand}`
}
