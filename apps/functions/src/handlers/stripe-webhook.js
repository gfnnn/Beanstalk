// src/handlers/stripe-webhook.js
// ─────────────────────────────────────────────────────────────────────────────
// POST /webhooks/stripe — the out-of-band confirmation that turns a reserved
// flash piece into a paid sale. This is the SOURCE OF TRUTH for "did they pay",
// not the browser returning from checkout (which a user can abandon mid-redirect).
//
//   verify the Stripe signature (no SDK — see ../lib/stripe.js)
//     → dedupe by event id (recordWebhookEvent; replays just 200)
//     → on payment_intent.succeeded:  promote piece pending→claimed,
//                                      mark the payment 'paid',
//                                      email the customer receipt + artist notice
//     → on payment_intent.canceled:   mark 'expired' + release the hold
//     → any other event: acknowledge (200) and ignore
//
// Required env:
//   STRIPE_WEBHOOK_SECRET   whsec_… (Worker secret; the endpoint's signing secret)
//   RESEND_API_KEY, FROM_EMAIL, ARTIST_EMAIL   (emails are best-effort)
//   DB                      D1 binding
//
// Every sub-step is idempotent / fail-safe, so Stripe's at-least-once redelivery
// can't double-promote or double-charge, and a DB/Resend hiccup never throws back
// a 500 that traps the event in a retry loop. Always acks 200 once the signature
// checks out (except a hard bad-signature 400).
// ─────────────────────────────────────────────────────────────────────────────
import { corsFor, replyWith } from '../lib/http.js'
import { verifyStripeSignature } from '../lib/stripe.js'
import {
  recordWebhookEvent, getPayment, markPaymentStatus,
  promoteFlashClaim, releaseFlashPiece,
} from '../lib/db.js'

const nowIso = () => new Date().toISOString()

export async function handler(event, env = {}) {
  const cors  = corsFor(event)
  const reply = replyWith(cors)

  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: cors, body: '' }
  if (event.httpMethod !== 'POST')    return reply(405, { error: 'Method not allowed.' })

  if (!env.STRIPE_WEBHOOK_SECRET) {
    console.error('stripe-webhook: STRIPE_WEBHOOK_SECRET missing')
    return reply(500, { error: 'Not configured.' })
  }

  // Verify against the EXACT raw body Stripe signed.
  const raw = typeof event.body === 'string' ? event.body : ''
  const sig = event.headers?.['stripe-signature'] || ''
  const ok  = await verifyStripeSignature(raw, sig, env.STRIPE_WEBHOOK_SECRET)
  if (!ok) {
    console.warn('stripe-webhook: rejected — bad/missing signature')
    return reply(400, { error: 'Invalid signature.' })
  }

  let evt
  try { evt = JSON.parse(raw || '{}') } catch { return reply(400, { error: 'Invalid payload.' }) }

  // Idempotency — process each event id exactly once; a replay just acks.
  const { fresh } = await recordWebhookEvent(env, evt.id, evt.type)
  if (!fresh) return reply(200, { received: true, duplicate: true })

  // Past this point we always ack 200 (the event is recorded as seen); the work is
  // idempotent and fail-safe, so there's nothing a Stripe retry would usefully redo.
  try {
    if (evt.type === 'payment_intent.succeeded') {
      await onSucceeded(env, evt.data?.object || {})
    } else if (evt.type === 'payment_intent.canceled') {
      await onCanceled(env, evt.data?.object || {})
    }
    return reply(200, { received: true })
  } catch (err) {
    console.error('stripe-webhook: handler error (acked):', err?.message || err)
    return reply(200, { received: true, error: true })
  }
}

// A PaymentIntent succeeded → confirm the sale.
async function onSucceeded(env, pi) {
  const reference = pi.metadata?.reference
  const pieceId   = pi.metadata?.piece_id
  if (!reference) { console.warn('stripe-webhook: succeeded without our reference', pi.id); return }

  // Defence in depth: only honour the amount we recorded at checkout. A mismatch
  // (a tampered/replayed intent) is logged and NOT promoted.
  const payment = await getPayment(env, reference)
  if (payment && Number(pi.amount) !== Number(payment.amount_pence)) {
    console.error('stripe-webhook: amount mismatch — not promoting', reference, pi.amount, payment.amount_pence)
    return
  }

  await markPaymentStatus(env, reference, 'paid', { providerRef: pi.id, paidAt: nowIso() })
  if (pieceId) await promoteFlashClaim(env, pieceId)

  // Best-effort notifications — never let an email failure throw out of the webhook.
  await sendEmails(env, { pi, reference, pieceId, payment })
    .catch(e => console.error('stripe-webhook: email failed (continuing):', e?.message || e))
}

// A PaymentIntent was canceled (gave up) → free the hold so the piece returns.
async function onCanceled(env, pi) {
  const reference = pi.metadata?.reference
  const pieceId   = pi.metadata?.piece_id
  if (reference) await markPaymentStatus(env, reference, 'expired')
  if (pieceId)   await releaseFlashPiece(env, pieceId)
}

// ── Emails (Resend) ───────────────────────────────────────────────────────────
async function sendEmails(env, { pi, reference, pieceId, payment }) {
  const { RESEND_API_KEY, ARTIST_EMAIL, FROM_EMAIL } = env
  if (!RESEND_API_KEY || !FROM_EMAIL) { console.warn('stripe-webhook: email skipped (no Resend config)'); return }

  const from   = FROM_EMAIL.includes('<') ? FROM_EMAIL : `Beansprout <${FROM_EMAIL}>`
  const email  = payment?.email || pi.receipt_email || ''
  const name   = String(pi.metadata?.name || 'there')
  const amount = `£${((Number(pi.amount) || 0) / 100).toFixed(2)}`

  const sends = []
  if (email) {
    sends.push(send(RESEND_API_KEY, {
      from, to: [email],
      subject: `You’re booked — ${pieceId} · beansprout.ink`,
      html: customerHtml({ name, pieceId, amount, reference }),
      text: customerText({ name, pieceId, amount, reference }),
    }))
  }
  if (ARTIST_EMAIL) {
    sends.push(send(RESEND_API_KEY, {
      from, to: [ARTIST_EMAIL], reply_to: email || undefined,
      subject: `Flash paid — ${pieceId} (${amount})`,
      html: artistHtml({ name, pieceId, amount, reference, email }),
      text: artistText({ name, pieceId, amount, reference, email }),
    }))
  }
  await Promise.all(sends)
}

async function send(key, payload) {
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  if (!res.ok) console.error('Resend (webhook) error', res.status, await res.text().catch(() => ''))
}

function esc(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

function customerHtml({ name, pieceId, amount, reference }) {
  return `<!doctype html><html><body style="margin:0;background:#F7F1E3;padding:24px;font-family:-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif">
  <table role="presentation" cellpadding="0" cellspacing="0" style="max-width:560px;margin:0 auto;background:#FBF8EE;border:1px solid rgba(44,42,36,.14);border-radius:12px;overflow:hidden">
    <tr><td style="background:#2C2A24;padding:18px 28px"><p style="margin:0;color:#F7F1E3;font-size:18px;font-weight:600">Payment received · beansprout<span style="color:#8A9A75">.ink</span></p></td></tr>
    <tr><td style="padding:20px 28px 28px;color:#2C2A24;font-size:15px;line-height:1.6">
      <p style="margin:0 0 12px">Hi ${esc(name)},</p>
      <p style="margin:0 0 12px">Your flash piece <strong>${esc(pieceId)}</strong> is reserved and paid — thank you! We’ll be in touch shortly to arrange your appointment.</p>
      <p style="margin:0 0 4px;color:#5C5A52;font-size:13px">Amount paid: <strong>${esc(amount)}</strong></p>
      <p style="margin:0;color:#8E8B81;font-size:12px">Reference: ${esc(reference)}</p>
    </td></tr>
  </table></body></html>`
}

function customerText({ name, pieceId, amount, reference }) {
  return `Hi ${name},\n\nYour flash piece ${pieceId} is reserved and paid — thank you! We’ll be in touch shortly to arrange your appointment.\n\nAmount paid: ${amount}\nReference: ${reference}\n\nbeansprout.ink`
}

function artistHtml({ name, pieceId, amount, reference, email }) {
  return `<!doctype html><html><body style="margin:0;background:#F7F1E3;padding:24px;font-family:-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif">
  <table role="presentation" cellpadding="0" cellspacing="0" style="max-width:560px;margin:0 auto;background:#FBF8EE;border:1px solid rgba(44,42,36,.14);border-radius:12px;overflow:hidden">
    <tr><td style="background:#4A5D3F;padding:16px 28px"><p style="margin:0;color:#F7F1E3;font-size:16px;font-weight:600">Flash paid — ${esc(pieceId)}</p></td></tr>
    <tr><td style="padding:18px 28px 24px;color:#2C2A24;font-size:14px;line-height:1.6">
      <p style="margin:0 0 8px"><strong>${esc(name)}</strong> paid <strong>${esc(amount)}</strong> for <strong>${esc(pieceId)}</strong>.</p>
      <p style="margin:0 0 4px;color:#5C5A52;font-size:13px">Contact: ${esc(email || '—')}</p>
      <p style="margin:0;color:#8E8B81;font-size:12px">Reference: ${esc(reference)} — the piece is now marked claimed.</p>
    </td></tr>
  </table></body></html>`
}

function artistText({ name, pieceId, amount, reference, email }) {
  return `Flash paid — ${pieceId}\n\n${name} paid ${amount} for ${pieceId}.\nContact: ${email || '—'}\nReference: ${reference} — the piece is now marked claimed.`
}
