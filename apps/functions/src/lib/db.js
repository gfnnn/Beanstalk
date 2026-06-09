// src/lib/db.js
// ─────────────────────────────────────────────────────────────────────────────
// D1 (SQLite) storage layer — the system of record behind the form worker.
// Replaces the old Netlify Blobs helpers; the public shape is the same so the
// handlers barely changed. Every function takes the Worker `env` (for `env.DB`,
// the D1 binding) and is FAIL-SAFE / FAIL-OPEN: a storage hiccup logs and returns
// a benign value rather than blocking a genuine submission — exactly as before.
//
// Why D1 over a blob store: personal/special-category data lives here, so it must
// be queryable for UK-GDPR access/erasure/retention. Those are now one SQL
// statement each (see docs/DATA-COMPLIANCE.md).
// ─────────────────────────────────────────────────────────────────────────────

const nowIso = () => new Date().toISOString()
const rand   = () => Math.random().toString(36).slice(2, 8)

// Env-tunable abuse limits (Resend free tier = 100 sends/day, so default ceiling
// sits under it). Read from `env` so they're configurable per-deploy.
export function limitsFrom(env = {}) {
  return {
    maxPerIp:  Number(env.RATE_MAX_PER_IP)    || 5,
    windowMs: (Number(env.RATE_IP_WINDOW_MIN) || 15) * 60_000,
    maxPerDay: Number(env.RATE_MAX_PER_DAY)   || 80,
  }
}

// Durably record a submission BEFORE we attempt to email it, so an enquiry
// survives a mail-provider outage (the email is best-effort; this is the record
// of truth). Pass an existing `id` to update a prior record in place (its email
// status). Fail-safe: on a DB error we log and return the id / null rather than
// block a real customer.
export async function persistSubmission(env, record, id) {
  const sid =
    id || `${record.kind || 'item'}/${nowIso().replace(/[:.]/g, '-')}-${rand()}`
  try {
    await env.DB.prepare(
      `INSERT INTO submissions
         (id, kind, email, received_at, ip, fields, image_count, image_names, skipped, email_status)
       VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10)
       ON CONFLICT(id) DO UPDATE SET email_status = excluded.email_status`,
    )
      .bind(
        sid,
        record.kind || 'item',
        String(record.fields?.email || '').trim().toLowerCase() || null,
        record.receivedAt || nowIso(),
        record.ip || null,
        JSON.stringify(record.fields || {}),
        record.imageCount || 0,
        JSON.stringify(record.imageNames || []),
        record.skipped || 0,
        record.emailStatus || 'pending',
      )
      .run()
    return sid
  } catch (err) {
    console.error('persistSubmission failed (continuing):', err?.message || err)
    return id || null
  }
}

// Durably record a newsletter consent at the point it's given — proof of lawful
// basis (single opt-in), no email sent. Fail-safe: a DB error logs and returns
// null rather than blocking a genuine signup.
export async function persistConsent(env, record) {
  const safe = String(record.email || 'unknown').replace(/[^\w.@-]+/g, '_').slice(0, 80)
  const id   = `${nowIso().replace(/[:.]/g, '-')}-${safe}`
  try {
    await env.DB.prepare(
      `INSERT INTO newsletter_consent
         (id, email, first_name, consented_at, statement, version, source, ip)
       VALUES (?1,?2,?3,?4,?5,?6,?7,?8)`,
    )
      .bind(
        id,
        record.email,
        record.first_name || null,
        record.consentedAt || nowIso(),
        record.consentStatement || null,
        record.consentVersion || null,
        record.source || null,
        record.ip || null,
      )
      .run()
    return id
  } catch (err) {
    console.error('persistConsent failed (continuing):', err?.message || err)
    return null
  }
}

// ── Flash inventory ─────────────────────────────────────────────────────────

// The current map of claimed/pending flash piece ids → status. Fails safe to {}.
// When payments are ON it first lazily releases any lapsed pending hold
// (expirePendingClaims), so a piece from an abandoned checkout shows as available
// again on the next grid load without a cron. The sweep is GATED on PAYMENTS_ENABLED
// (and is fail-safe regardless): with payments off there are no holds to sweep, so
// this path stays byte-for-byte identical to before — no extra query, no dependency
// on the payments migration (0002). It never blocks the read.
export async function getFlashClaims(env) {
  try {
    if (String(env.PAYMENTS_ENABLED) === 'true') await expirePendingClaims(env)
    const { results } = await env.DB.prepare(
      'SELECT piece_id, status FROM flash_claims',
    ).all()
    const map = {}
    for (const row of results || []) map[row.piece_id] = row.status
    return map
  } catch (err) {
    console.error('flash-claims read failed:', err?.message || err)
    return {}
  }
}

// Reserve a flash piece. Returns { ok: true, reserved: true } if it was free and
// is now reserved ('pending'), or { ok: false, status } if already taken. The
// piece_id PK makes this atomic via ON CONFLICT DO NOTHING (no read-modify-write
// race). FAILS OPEN: a DB outage allows the claim (worst case a double-claim the
// artist resolves) but omits `reserved` so the caller won't try to roll back a
// reservation that was never written. A missing id is a no-op `{ ok: true }`.
//
// `expiresAt` (ISO 8601) sets a hold TTL so an abandoned *checkout* reserve frees
// itself (see expirePendingClaims). The legacy manual claim passes none, so its
// reserve never auto-expires — exactly as before.
export async function reserveFlashPiece(env, id, expiresAt = null) {
  if (!id) return { ok: true }
  try {
    // The legacy claim-by-enquiry path passes NO expiry and uses the original
    // 3-column insert, so it has zero dependency on the payments migration (0002).
    // Only a checkout-created hold (with an expiry) references the expires_at column.
    const stmt = expiresAt
      ? env.DB.prepare(
          `INSERT INTO flash_claims (piece_id, status, updated_at, expires_at)
           VALUES (?1, 'pending', ?2, ?3) ON CONFLICT(piece_id) DO NOTHING`,
        ).bind(id, nowIso(), expiresAt)
      : env.DB.prepare(
          `INSERT INTO flash_claims (piece_id, status, updated_at)
           VALUES (?1, 'pending', ?2) ON CONFLICT(piece_id) DO NOTHING`,
        ).bind(id, nowIso())
    const res = await stmt.run()
    if ((res?.meta?.changes ?? 0) > 0) return { ok: true, reserved: true }
    // Already taken — report its current status.
    const row = await env.DB.prepare(
      'SELECT status FROM flash_claims WHERE piece_id = ?1',
    ).bind(id).first()
    return { ok: false, status: row?.status || 'pending' }
  } catch (err) {
    console.error('flash-claims reserve failed (allowing claim):', err?.message || err)
    return { ok: true }
  }
}

// Release a reservation we made but couldn't follow through on (e.g. the claim
// email failed) so the piece isn't stranded as 'pending'. Only clears a still-
// 'pending' row; a confirmed 'claimed' piece is left untouched. Never throws.
export async function releaseFlashPiece(env, id) {
  if (!id) return
  try {
    await env.DB.prepare(
      `DELETE FROM flash_claims WHERE piece_id = ?1 AND status = 'pending'`,
    ).bind(id).run()
  } catch (err) {
    console.error('flash-claims release failed (leaving pending):', err?.message || err)
  }
}

// Promote a piece to a confirmed sale on verified payment. An UPSERT, not a bare
// UPDATE: a verified payment must always end with the piece marked 'claimed',
// even if its pending hold was already swept by expirePendingClaims (a customer
// can complete a PaymentIntent after the 48h hold lapsed — without this the paid
// piece would silently read available again). Idempotent: an existing 'claimed'
// row is a no-op, so a re-delivered webhook can't double-promote. Clears the
// hold's expiry so a sold piece can never be swept. Returns true iff THIS call
// marked it claimed. Fail-safe → false.
export async function promoteFlashClaim(env, id) {
  if (!id) return false
  try {
    const res = await env.DB.prepare(
      `INSERT INTO flash_claims (piece_id, status, updated_at)
       VALUES (?1, 'claimed', ?2)
       ON CONFLICT(piece_id) DO UPDATE
         SET status = 'claimed', updated_at = excluded.updated_at, expires_at = NULL
         WHERE flash_claims.status = 'pending'`,
    ).bind(id, nowIso()).run()
    return (res?.meta?.changes ?? 0) > 0
  } catch (err) {
    console.error('promoteFlashClaim failed:', err?.message || err)
    return false
  }
}

// Free any 'pending' reservation whose hold has lapsed, so an abandoned checkout
// can't lock a one-of-a-kind piece forever. Only expired pending rows are deleted;
// confirmed claims and holds with no expiry (the legacy manual reserve) are left
// untouched. Returns the number freed. Fail-safe → 0.
export async function expirePendingClaims(env, now = nowIso()) {
  try {
    const res = await env.DB.prepare(
      `DELETE FROM flash_claims
       WHERE status = 'pending' AND expires_at IS NOT NULL AND expires_at < ?1`,
    ).bind(now).run()
    return res?.meta?.changes ?? 0
  } catch (err) {
    console.error('expirePendingClaims failed (leaving holds):', err?.message || err)
    return 0
  }
}

// ── Payments ledger ──────────────────────────────────────────────────────────
// The record of truth for money (table in migration 0002). Every helper is
// fail-safe like the rest of this module: a DB hiccup logs and returns a benign
// value rather than throwing into a payment flow.

// Record a checkout attempt BEFORE talking to the provider, so a payment is
// durable from its first moment. Status starts 'awaiting'; the verified webhook
// flips it to 'paid'. `id` is OUR reference (stable across providers); a re-insert
// of the same id is a no-op (ON CONFLICT DO NOTHING). Returns true on write.
export async function recordPayment(env, p = {}) {
  if (!p.id) return false
  try {
    await env.DB.prepare(
      `INSERT INTO payments
         (id, kind, status, provider, provider_ref, amount_pence, currency, email, piece_id, submission_id, created_at, paid_at)
       VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12)
       ON CONFLICT(id) DO NOTHING`,
    )
      .bind(
        p.id,
        p.kind || 'flash',
        p.status || 'awaiting',
        p.provider || 'stripe',
        p.providerRef || null,
        Number(p.amountPence) || 0,
        p.currency || 'gbp',
        p.email || null,
        p.pieceId || null,
        p.submissionId || null,
        p.createdAt || nowIso(),
        p.paidAt || null,
      )
      .run()
    return true
  } catch (err) {
    console.error('recordPayment failed (continuing):', err?.message || err)
    return false
  }
}

// Read a payment row by our reference id. Fails safe to null.
export async function getPayment(env, id) {
  if (!id) return null
  try {
    return await env.DB.prepare('SELECT * FROM payments WHERE id = ?1').bind(id).first()
  } catch (err) {
    console.error('getPayment failed:', err?.message || err)
    return null
  }
}

// Move a payment to a terminal status — 'paid' (with paid_at + the provider's
// payment id) from the webhook, or 'failed'/'expired' on rollback. COALESCE means
// a null providerRef/paidAt leaves the existing value intact, so a status-only
// flip never wipes the provider id. Idempotent. Returns true iff a row changed.
export async function markPaymentStatus(env, id, status, { providerRef = null, paidAt = null } = {}) {
  if (!id || !status) return false
  try {
    const res = await env.DB.prepare(
      `UPDATE payments
          SET status = ?2,
              provider_ref = COALESCE(?3, provider_ref),
              paid_at = COALESCE(?4, paid_at)
        WHERE id = ?1`,
    ).bind(id, status, providerRef, paidAt).run()
    return (res?.meta?.changes ?? 0) > 0
  } catch (err) {
    console.error('markPaymentStatus failed:', err?.message || err)
    return false
  }
}

// Webhook idempotency: record an event id the first time it's seen. Returns
// { fresh: true } on the first delivery (process it) and { fresh: false } on a
// replay (skip). FAILS OPEN ({ fresh: true }) if the DB is down — the downstream
// promote/markPaid are themselves idempotent, so re-processing a possible
// duplicate is safer than dropping a real payment confirmation.
export async function recordWebhookEvent(env, id, type) {
  if (!id) return { fresh: true }
  try {
    const res = await env.DB.prepare(
      `INSERT INTO webhook_events (id, type, received_at)
       VALUES (?1, ?2, ?3) ON CONFLICT(id) DO NOTHING`,
    ).bind(id, type || null, nowIso()).run()
    return { fresh: (res?.meta?.changes ?? 0) > 0 }
  } catch (err) {
    console.error('recordWebhookEvent failed (processing anyway):', err?.message || err)
    return { fresh: true }
  }
}

// ── Rate limiting ───────────────────────────────────────────────────────────
// Per-IP sliding window + a global daily ceiling (the real backstop against a
// rotating-IP flood). Returns { ok, commit }. `commit()` records a successful
// action and prunes that IP's expired rows. FAILS OPEN: if D1 is unavailable we
// never block a genuine visitor. `storeName` namespaces each function's buckets.
export async function rateLimit(env, ip, { storeName = 'rate', maxPerIp, windowMs, maxPerDay } = {}) {
  const d = limitsFrom(env)
  const limits = {
    maxPerIp:  maxPerIp  ?? d.maxPerIp,
    windowMs:  windowMs  ?? d.windowMs,
    maxPerDay: maxPerDay ?? d.maxPerDay,
  }
  try {
    const now       = Date.now()
    const dayBucket = `${storeName}:day:${new Date().toISOString().slice(0, 10)}`
    const ipBucket  = `${storeName}:ip:${ip}`
    const cutoff    = now - limits.windowMs

    const day = await env.DB.prepare(
      'SELECT COUNT(*) AS n FROM rate_events WHERE bucket = ?1',
    ).bind(dayBucket).first()
    if ((day?.n || 0) >= limits.maxPerDay) return { ok: false }

    const ipRow = await env.DB.prepare(
      'SELECT COUNT(*) AS n FROM rate_events WHERE bucket = ?1 AND ts > ?2',
    ).bind(ipBucket, cutoff).first()
    if ((ipRow?.n || 0) >= limits.maxPerIp) return { ok: false }

    return {
      ok: true,
      commit: async () => {
        try {
          // Drop stale per-day counter rows (older than ~2 days) so the table is
          // genuinely self-pruning — not just the per-IP window. Never touches the
          // current/previous day, so the daily-ceiling COUNT (keyed on today's
          // bucket) is unaffected.
          const dayKeep = now - 2 * 24 * 60 * 60 * 1000
          await env.DB.batch([
            env.DB.prepare('INSERT INTO rate_events (bucket, ts) VALUES (?1, ?2)').bind(ipBucket, now),
            env.DB.prepare('INSERT INTO rate_events (bucket, ts) VALUES (?1, ?2)').bind(dayBucket, now),
            env.DB.prepare('DELETE FROM rate_events WHERE bucket = ?1 AND ts < ?2').bind(ipBucket, cutoff),
            env.DB.prepare('DELETE FROM rate_events WHERE bucket LIKE ?1 AND ts < ?2').bind(`${storeName}:day:%`, dayKeep),
          ])
        } catch (_) { /* best-effort */ }
      },
    }
  } catch (err) {
    console.error(`Rate-limit DB unavailable (${storeName}) — failing open:`, err?.message || err)
    return { ok: true, commit: async () => {} }
  }
}
