// netlify/functions/_shared.js
// ─────────────────────────────────────────────────────────────────────────────
// Shared abuse-protection helpers for the Beansprout serverless functions
// (enquiry + newsletter). The leading underscore tells Netlify this is a support
// module, NOT a deployable function — both handlers import from it so the CORS
// allowlist and rate-limit logic live in ONE place and can't drift apart.
// ─────────────────────────────────────────────────────────────────────────────
import { getStore } from '@netlify/blobs'

// Pragmatic email shape check (one @, a dot in the domain, no whitespace). Shared
// so the enquiry and newsletter validators agree on what "valid" means.
export const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/

// ── CORS — origin allowlist, not a blanket '*' ──────────────────────────────
// CORS is browser-enforced (it won't stop a scripted/curl POST — that's what the
// rate limiter is for), but locking it to known origins removes the casual
// cross-site-embed vector. Disallowed origins get the canonical origin echoed
// back, so the browser blocks them from reading replies.
export const ALLOWED_ORIGINS = new Set([
  'https://beansprout.ink',
  'https://www.beansprout.ink',
  'https://beansprout.netlify.app', // staging mirror (canonical for v2)
  'http://localhost:5173',          // vite dev
  'http://localhost:8888',          // netlify dev
])
export const CANONICAL_ORIGIN = 'https://beansprout.netlify.app'

export function corsFor(event) {
  const origin = event.headers?.origin || event.headers?.Origin || ''
  return {
    'Access-Control-Allow-Origin': ALLOWED_ORIGINS.has(origin) ? origin : CANONICAL_ORIGIN,
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Vary': 'Origin',
  }
}

// A `reply` bound to the right CORS headers for this request.
export function replyWith(cors) {
  return (statusCode, body) => ({
    statusCode,
    headers: { 'Content-Type': 'application/json', ...cors },
    body: JSON.stringify(body),
  })
}

// The client IP, used to bucket the per-IP rate limit. Trust ONLY the header
// Netlify's edge sets (`x-nf-client-connection-ip`) — `x-forwarded-for` is
// fully client-controlled, so honouring it lets an attacker mint a fresh bucket
// per request and defeat the per-IP window. If the trusted header is absent
// (e.g. local `netlify dev`), fall back to 'unknown' so those requests share a
// single bucket rather than bypassing the limit entirely.
export function clientIp(event) {
  const h = event.headers || {}
  return String(h['x-nf-client-connection-ip'] || '').split(',')[0].trim() || 'unknown'
}

// Durably record a submission BEFORE we attempt to email it, so an enquiry
// survives a mail-provider outage (the email is best-effort; this is the record
// of truth) and becomes queryable/recoverable. Best-effort and fail-safe: if the
// store is unavailable we log and return null rather than block a real customer.
// Pass an existing `id` to update a prior record in place (e.g. with the final
// email status). ⚠ GO-LIVE BLOCKER: records may contain special-category data
// (allergies, DOB), so before pointing the apex at this site the `submissions`
// store needs a retention period + an erasure path (delete-by-key). See
// docs/ENQUIRY-SETUP.md and the privacy page ("How long we keep it").
export async function persistSubmission(record, id) {
  try {
    const store = getStore('submissions')
    const stamp = new Date().toISOString().replace(/[:.]/g, '-')
    const sid   = id || `${record.kind || 'item'}/${stamp}-${Math.random().toString(36).slice(2, 8)}`
    await store.setJSON(sid, { id: sid, ...record })
    return sid
  } catch (err) {
    console.error('Submission persistence failed (continuing):', err?.message || err)
    return id || null
  }
}

// Durably record a newsletter consent BEFORE/at the point it's given, so the
// studio holds defensible proof of lawful consent (UK GDPR/PECR) WITHOUT sending
// any confirmation email — Resend Audiences store the contact but not WHEN it
// consented, to WHAT wording, or from which IP. This server-side ledger is that
// audit trail and the basis for single opt-in (no double opt-in, so no extra mail
// on the Resend quota). Best-effort and fail-safe: a store outage logs and returns
// null rather than blocking a genuine signup (the consent checkbox is still
// required and the contact still lands in the Audience).
export async function persistConsent(record) {
  try {
    const store = getStore('newsletter-consent')
    const stamp = new Date().toISOString().replace(/[:.]/g, '-')
    const safe  = String(record.email || 'unknown').replace(/[^\w.@-]+/g, '_').slice(0, 80)
    const key   = `${stamp}-${safe}`
    await store.setJSON(key, { id: key, ...record })
    return key
  } catch (err) {
    console.error('Consent persistence failed (continuing):', err?.message || err)
    return null
  }
}

// ── Flash inventory state ───────────────────────────────────────────────────
// A flash piece is one-of-a-kind, so a successful claim must RESERVE it or two
// people can claim the same design. State lives in a Blobs store keyed by piece
// id → 'pending' | 'claimed'; the flash grid reads it (flash-status function) to
// reflect live availability, and a claim reserves the piece here before emailing.
const FLASH_STORE = 'flash-claims'
const FLASH_KEY   = 'claims'

// The current map of claimed/pending flash piece ids → status. Fails safe to {}.
export async function getFlashClaims() {
  try {
    const store = getStore(FLASH_STORE)
    return (await store.get(FLASH_KEY, { type: 'json' })) || {}
  } catch (err) {
    console.error('flash-claims read failed:', err?.message || err)
    return {}
  }
}

// Reserve a flash piece. Returns { ok: true, reserved: true } if it was free and
// is now reserved ('pending'), or { ok: false, status } if it was already taken.
// FAILS OPEN: a Blobs outage allows the claim (worst case a double-claim the
// artist resolves) rather than blocking a real customer — but signals it did NOT
// actually write a reservation by omitting `reserved`, so the caller never tries
// to roll back a reservation that was never made. Likewise a missing id is a
// no-op `{ ok: true }`. Read-check-write is non-atomic, so two simultaneous
// claims of the same piece could both win — the window is tiny at studio volume
// and the artist sees both in the submissions store either way.
export async function reserveFlashPiece(id) {
  if (!id) return { ok: true }          // no id supplied → nothing to reserve
  try {
    const store  = getStore(FLASH_STORE)
    const claims = (await store.get(FLASH_KEY, { type: 'json' })) || {}
    if (claims[id]) return { ok: false, status: claims[id] }
    claims[id] = 'pending'
    await store.setJSON(FLASH_KEY, claims)
    return { ok: true, reserved: true }
  } catch (err) {
    console.error('flash-claims reserve failed (allowing claim):', err?.message || err)
    return { ok: true }
  }
}

// Release a reservation we made but couldn't follow through on (e.g. the claim
// email failed to send) so the piece doesn't get stranded as 'pending' — invisible
// to the artist yet showing as taken on the grid. Only ever clears a still-'pending'
// reservation; a piece marked 'claimed' (confirmed) is left untouched. Best-effort
// and never throws: a failed rollback just leaves the piece pending (the prior,
// safe state), which the artist can clear manually.
export async function releaseFlashPiece(id) {
  if (!id) return
  try {
    const store  = getStore(FLASH_STORE)
    const claims = (await store.get(FLASH_KEY, { type: 'json' })) || {}
    if (claims[id] === 'pending') {
      delete claims[id]
      await store.setJSON(FLASH_KEY, claims)
    }
  } catch (err) {
    console.error('flash-claims release failed (leaving pending):', err?.message || err)
  }
}

// Shared env-tunable limits (apply to every function; each keeps its own bucket
// via a distinct `storeName`, so their counts never mix).
export const DEFAULT_LIMITS = {
  maxPerIp:  Number(process.env.RATE_MAX_PER_IP)     || 5,
  windowMs: (Number(process.env.RATE_IP_WINDOW_MIN)  || 15) * 60_000,
  maxPerDay: Number(process.env.RATE_MAX_PER_DAY)    || 80,
}

// Per-IP sliding window + a global daily ceiling (the real backstop against a
// rotating-IP flood). Returns { ok, commit }. `commit()` records a successful
// action. FAILS OPEN: if the Blobs store is unavailable we never block a genuine
// visitor. `storeName` namespaces each function's counters.
export async function rateLimit(ip, { storeName, maxPerIp, windowMs, maxPerDay } = {}) {
  const limits = {
    maxPerIp:  maxPerIp  ?? DEFAULT_LIMITS.maxPerIp,
    windowMs:  windowMs  ?? DEFAULT_LIMITS.windowMs,
    maxPerDay: maxPerDay ?? DEFAULT_LIMITS.maxPerDay,
  }
  try {
    const store  = getStore(storeName || 'rate')
    const now    = Date.now()
    const dayKey = `count-${new Date().toISOString().slice(0, 10)}`
    const ipKey  = `ip-${ip}`

    const dayCount = Number(await store.get(dayKey)) || 0
    if (dayCount >= limits.maxPerDay) return { ok: false }

    const prior = (await store.get(ipKey, { type: 'json' })) || []
    const hits  = (Array.isArray(prior) ? prior : []).filter(t => now - t < limits.windowMs)
    if (hits.length >= limits.maxPerIp) return { ok: false }

    return {
      ok: true,
      commit: async () => {
        try {
          await store.setJSON(ipKey, [...hits, now])
          await store.set(dayKey, String(dayCount + 1))
        } catch (_) { /* best-effort */ }
      },
    }
  } catch (err) {
    console.error(`Rate-limit store (${storeName}) unavailable — failing open:`, err?.message || err)
    return { ok: true, commit: async () => {} }
  }
}
