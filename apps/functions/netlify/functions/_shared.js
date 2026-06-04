// netlify/functions/_shared.js
// ─────────────────────────────────────────────────────────────────────────────
// Shared abuse-protection helpers for the Beansprout serverless functions
// (enquiry + newsletter). The leading underscore tells Netlify this is a support
// module, NOT a deployable function — both handlers import from it so the CORS
// allowlist and rate-limit logic live in ONE place and can't drift apart.
// ─────────────────────────────────────────────────────────────────────────────
import { getStore } from '@netlify/blobs'

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
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
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
