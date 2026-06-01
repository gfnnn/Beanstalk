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

export function clientIp(event) {
  const h = event.headers || {}
  return String(h['x-nf-client-connection-ip'] || h['x-forwarded-for'] || '')
    .split(',')[0].trim() || 'unknown'
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
