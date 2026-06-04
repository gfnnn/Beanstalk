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
export async function getFlashClaims(env) {
  try {
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
export async function reserveFlashPiece(env, id) {
  if (!id) return { ok: true }
  try {
    const res = await env.DB.prepare(
      `INSERT INTO flash_claims (piece_id, status, updated_at)
       VALUES (?1, 'pending', ?2)
       ON CONFLICT(piece_id) DO NOTHING`,
    ).bind(id, nowIso()).run()
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
          await env.DB.batch([
            env.DB.prepare('INSERT INTO rate_events (bucket, ts) VALUES (?1, ?2)').bind(ipBucket, now),
            env.DB.prepare('INSERT INTO rate_events (bucket, ts) VALUES (?1, ?2)').bind(dayBucket, now),
            env.DB.prepare('DELETE FROM rate_events WHERE bucket = ?1 AND ts < ?2').bind(ipBucket, cutoff),
          ])
        } catch (_) { /* best-effort */ }
      },
    }
  } catch (err) {
    console.error(`Rate-limit DB unavailable (${storeName}) — failing open:`, err?.message || err)
    return { ok: true, commit: async () => {} }
  }
}
