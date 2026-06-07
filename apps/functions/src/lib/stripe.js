// src/lib/stripe.js
// ─────────────────────────────────────────────────────────────────────────────
// Verify a Stripe webhook signature WITHOUT the Stripe SDK, using Web Crypto
// (HMAC-SHA256) — available both in the Workers runtime and in Node 18+ (so the
// suite exercises the real thing). Mirrors Stripe's scheme: the signed payload is
// `${t}.${rawBody}`, HMAC'd with the endpoint secret and compared against the v1
// signature(s) in the `Stripe-Signature` header, within a timestamp tolerance to
// blunt replay. Everything here is pure + fail-closed (returns false, never throws).
// ─────────────────────────────────────────────────────────────────────────────

const enc = new TextEncoder()

// Constant-time compare of two equal-length hex strings (avoids leaking, via
// timing, how much of a forged signature matched).
function timingSafeEqualHex(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false
  let out = 0
  for (let i = 0; i < a.length; i++) out |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return out === 0
}

function toHex(buf) {
  const b = new Uint8Array(buf)
  let s = ''
  for (let i = 0; i < b.length; i++) s += b[i].toString(16).padStart(2, '0')
  return s
}

// HMAC-SHA256(secret, payload) as a lowercase hex string. Exported so tests can
// mint a valid header the same way Stripe does.
export async function hmacHex(secret, payload) {
  const key = await crypto.subtle.importKey(
    'raw', enc.encode(String(secret)), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'],
  )
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(String(payload)))
  return toHex(sig)
}

// Parse `t=…,v1=…,v0=…` into { t:Number|null, v1:[hex,…] } (multiple v1 are
// possible during a secret rotation).
function parseSigHeader(header) {
  const out = { t: null, v1: [] }
  for (const part of String(header || '').split(',')) {
    const i = part.indexOf('=')
    if (i < 0) continue
    const k = part.slice(0, i).trim()
    const v = part.slice(i + 1).trim()
    if (k === 't') out.t = Number(v)
    else if (k === 'v1' && v) out.v1.push(v)
  }
  return out
}

// True iff `header` is a valid Stripe signature for `payload` under `secret` and
// within `toleranceSec`. `payload` must be the EXACT raw request body. Never throws.
export async function verifyStripeSignature(
  payload, header, secret, { nowMs = Date.now(), toleranceSec = 300 } = {},
) {
  if (!secret || !header || typeof payload !== 'string') return false
  const { t, v1 } = parseSigHeader(header)
  if (!t || !Number.isFinite(t) || !v1.length) return false
  if (Math.abs(Math.floor(nowMs / 1000) - t) > toleranceSec) return false
  const expected = await hmacHex(secret, `${t}.${payload}`)
  return v1.some(sig => timingSafeEqualHex(sig, expected))
}
