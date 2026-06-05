// src/lib/http.js
// ─────────────────────────────────────────────────────────────────────────────
// HTTP plumbing shared by every handler: the CORS origin allowlist, the JSON
// reply helper, anti-spoof client-IP extraction, and the Request→event adapter
// that lets the handlers keep their simple `(event) → { statusCode, body }`
// shape on top of the Workers fetch() runtime.
// ─────────────────────────────────────────────────────────────────────────────

// Pragmatic email shape check (one @, a dot in the domain, no whitespace). Shared
// so the enquiry and newsletter validators agree on what "valid" means.
export const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/

// ── CORS — origin allowlist, not a blanket '*' ──────────────────────────────
// CORS is browser-enforced (it won't stop a scripted/curl POST — that's what the
// rate limiter is for), but locking it to known SITE origins removes the casual
// cross-site-embed vector. Disallowed origins get the canonical origin echoed
// back, so the browser blocks them from reading replies. These are the origins
// the *site* is served from — the worker's own *.workers.dev URL is the API, not
// a page, so it isn't listed here.
export const ALLOWED_ORIGINS = new Set([
  'https://beansprout.ink',
  'https://www.beansprout.ink',
  'https://gfnnn.github.io',  // GitHub Pages staging origin
  'http://localhost:5173',    // vite dev
  'http://localhost:8888',    // local proxy, if used
])
export const CANONICAL_ORIGIN = 'https://beansprout.ink'

export function corsFor(event) {
  const origin = event.headers?.origin || event.headers?.Origin || ''
  return {
    'Access-Control-Allow-Origin': ALLOWED_ORIGINS.has(origin) ? origin : CANONICAL_ORIGIN,
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Vary': 'Origin',
  }
}

// Security headers on every JSON response. These endpoints only ever return JSON,
// so the policy is maximally tight: `nosniff` stops content-type guessing,
// `default-src 'none'` means a response can't be coaxed into loading anything if a
// browser ever renders it, and `no-referrer` keeps the Worker URL out of referers.
// (Clickjacking/HSTS headers belong on the HTML pages — see src/build/security.js
// in apps/web — not on a JSON API, so they're intentionally omitted here.)
export const SECURITY_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'Content-Security-Policy': "default-src 'none'",
  'Referrer-Policy': 'no-referrer',
}

// A `reply` bound to the right CORS headers for this request.
export function replyWith(cors) {
  return (statusCode, body) => ({
    statusCode,
    headers: { 'Content-Type': 'application/json', ...SECURITY_HEADERS, ...cors },
    body: JSON.stringify(body),
  })
}

// The client IP, used to bucket the per-IP rate limit. Trust ONLY the header
// Cloudflare's edge sets (`cf-connecting-ip`) — `x-forwarded-for` is
// client-controlled, so honouring it lets an attacker mint a fresh bucket per
// request and defeat the per-IP window. If the trusted header is absent (e.g.
// local tooling) fall back to 'unknown' so those requests share one bucket
// rather than bypassing the limit entirely.
export function clientIp(event) {
  const h = event.headers || {}
  return String(h['cf-connecting-ip'] || '').split(',')[0].trim() || 'unknown'
}

// Adapt a Workers `Request` to the small `event` shape the handlers expect:
// `{ httpMethod, headers (lowercased), body (string) }`. Keeping this boundary
// thin means the handler bodies read almost identically to the original Netlify
// functions, and stay trivially unit-testable without a live runtime.
export async function toEvent(request) {
  const headers = {}
  for (const [k, v] of request.headers) headers[k.toLowerCase()] = v
  const body =
    request.method === 'GET' || request.method === 'HEAD' ? '' : await request.text()
  return { httpMethod: request.method, headers, body }
}
