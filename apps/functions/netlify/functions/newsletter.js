// netlify/functions/newsletter.js
// ─────────────────────────────────────────────────────────────────────────────
// Beansprout newsletter signup — adds a subscriber to a Resend Audience.
//
// Receives JSON  { fields: { email, first_name?, consent, _gotcha? } }
// validates it, and creates the contact via the Resend Contacts API.
//
// Required environment variables (Netlify → Site configuration → Environment):
//   RESEND_API_KEY      re_xxxxxxxx   (resend.com → API Keys — same key the
//                                      enquiry function already uses)
//   RESEND_AUDIENCE_ID  the Audience to add subscribers to
//                       (resend.com → Audiences → your audience → Settings)
//
// Single opt-in: Resend Audiences has no native double opt-in, so the consent
// checkbox on the form is the record of consent. (A confirm-email flow could be
// layered on later if double opt-in is wanted.)
//
// Abuse protection (CORS allowlist + Blobs rate limiting) is shared with the
// enquiry function — see ./_shared.js. Uses the global fetch otherwise;
// @netlify/blobs is the only dependency.
// ─────────────────────────────────────────────────────────────────────────────
import { corsFor, replyWith, clientIp, rateLimit, persistConsent, EMAIL_RE } from './_shared.js'

// A Resend Audience ID is a UUID. Validating its SHAPE here turns a silent
// misconfiguration (which would otherwise only surface as a 502 at signup time,
// every signup) into a fast, obvious config error in the logs.
const AUDIENCE_ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// The exact statement the subscriber ticks, recorded in the consent ledger so the
// audit trail captures WHAT was agreed, not merely that a box was checked. Bump
// CONSENT_VERSION whenever this wording (or the privacy policy it points at)
// changes — keep it in step with the label in apps/web/newsletter/index.html and
// src/build/newsletter-inline.js.
const CONSENT_VERSION   = '2026-06'
const CONSENT_STATEMENT =
  'I’d like to receive emails from Beansprout and agree to the privacy policy.'

export async function handler(event) {
  const cors  = corsFor(event)
  const reply = replyWith(cors)

  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: cors, body: '' }
  if (event.httpMethod !== 'POST')    return reply(405, { error: 'Method not allowed.' })

  const { RESEND_API_KEY, RESEND_AUDIENCE_ID } = process.env
  if (!RESEND_API_KEY || !RESEND_AUDIENCE_ID || !AUDIENCE_ID_RE.test(RESEND_AUDIENCE_ID)) {
    console.error('Missing/invalid env vars:', {
      RESEND_API_KEY: !!RESEND_API_KEY,
      RESEND_AUDIENCE_ID: !RESEND_AUDIENCE_ID ? 'missing' : (AUDIENCE_ID_RE.test(RESEND_AUDIENCE_ID) ? 'ok' : 'malformed'),
    })
    return reply(500, { error: 'Signups aren’t configured yet. Please email us to be added in the meantime.' })
  }

  let payload
  try { payload = JSON.parse(event.body || '{}') }
  catch { return reply(400, { error: 'Invalid request.' }) }

  const fields = payload.fields && typeof payload.fields === 'object' ? payload.fields : {}

  // Honeypot — a bot filled the hidden field. Pretend success, add nothing.
  if (String(fields._gotcha || '').trim()) return reply(200, { ok: true })

  // ── Validate ────────────────────────────────────────────────────────────────
  const email = String(fields.email || '').trim().toLowerCase()
  if (!EMAIL_RE.test(email)) return reply(400, { error: 'Please enter a valid email address.' })
  if (!fields.consent)       return reply(400, { error: 'Please confirm you’re happy to receive emails.' })

  const first_name = String(fields.first_name || '').trim().slice(0, 80)

  // The consent record to file the moment this signup is accepted — proof of
  // lawful basis (single opt-in), no email sent. `source` lets the inline capture
  // band and the dedicated page be told apart later if needed.
  const consent = {
    email,
    first_name,
    consentedAt:      new Date().toISOString(),
    consentStatement: CONSENT_STATEMENT,
    consentVersion:   CONSENT_VERSION,
    source:           String(fields.source || 'newsletter').slice(0, 40),
    ip:               clientIp(event),
  }

  // ── Rate limit — only valid signups count (its own bucket vs. enquiry) ──────
  const limiter = await rateLimit(clientIp(event), { storeName: 'newsletter-rate' })
  if (!limiter.ok) {
    return reply(429, { error: 'You’ve tried a few times already. Please email hello@beansprout.ink and we’ll add you.' })
  }

  // ── Add to the Resend Audience ──────────────────────────────────────────────
  try {
    const res = await fetch(`https://api.resend.com/audiences/${RESEND_AUDIENCE_ID}/contacts`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, first_name, unsubscribed: false }),
    })

    const data = await res.json().catch(() => ({}))
    if (res.ok) { await persistConsent(consent); await limiter.commit(); return reply(200, { ok: true }) }

    // Already subscribed → idempotent success, not an error to the visitor. Still
    // file the consent: a returning subscriber re-affirming consent is worth a
    // fresh, dated record.
    const msg = String((data && (data.message || data.error || data.name)) || '').toLowerCase()
    if (res.status === 409 || msg.includes('already')) { await persistConsent(consent); await limiter.commit(); return reply(200, { ok: true, already: true }) }

    console.error('Resend audience error', res.status, data)
    return reply(502, { error: 'We couldn’t add you just now. Please try again shortly.' })
  } catch (err) {
    console.error('Newsletter signup failed', err)
    return reply(502, { error: 'We couldn’t add you just now. Please try again shortly.' })
  }
}
