// Tests for src/lib/db.js — the D1 storage layer. The highest-leverage backend
// code to pin: a regression here either blocks genuine enquiries (false positive)
// or removes the only real backstop against a scripted flood (false negative). The
// in-memory D1 fake runs the real SQL-issuing code, and a "broken" binding pins
// the FAIL-SAFE / FAIL-OPEN behaviour (a DB outage must never block a real user).
import { describe, it, expect } from 'vitest'
import {
  limitsFrom, persistSubmission, persistConsent, getFlashClaims,
  reserveFlashPiece, releaseFlashPiece, rateLimit,
} from '../src/lib/db.js'
import { makeD1, brokenD1, flashMap } from './helpers/fake-d1.js'

const env = () => ({ DB: makeD1().DB })
const broken = { DB: brokenD1() }

describe('persistSubmission', () => {
  it('writes a record and returns a generated id', async () => {
    const d1 = makeD1()
    const id = await persistSubmission({ DB: d1.DB }, { kind: 'enquiry', emailStatus: 'pending', fields: { email: 'a@b.co' } })
    expect(typeof id).toBe('string')
    expect(id.startsWith('enquiry/')).toBe(true)
    expect(d1.data.submissions.get(id).email).toBe('a@b.co') // denormalised
  })

  it('updates a prior record in place when given its id', async () => {
    const d1 = makeD1()
    const e = { DB: d1.DB }
    const id = await persistSubmission(e, { kind: 'enquiry', emailStatus: 'pending', fields: {} })
    await persistSubmission(e, { kind: 'enquiry', emailStatus: 'sent', fields: {} }, id)
    expect(d1.data.submissions.size).toBe(1)
    expect(d1.data.submissions.get(id).email_status).toBe('sent')
  })

  it('on conflict updates ONLY email_status — the durable record is never rewritten', async () => {
    // The status flips pending → sent/failed as the send resolves, but the captured
    // submission (ip, email, the fields blob) must stay exactly as first written —
    // a later re-persist with drifted data must not clobber the record of truth.
    const d1 = makeD1()
    const e = { DB: d1.DB }
    const id = await persistSubmission(e, {
      kind: 'enquiry', emailStatus: 'pending', ip: '5.5.5.5',
      fields: { email: 'first@b.co' },
    })
    await persistSubmission(e, {
      kind: 'enquiry', emailStatus: 'sent', ip: '9.9.9.9',
      fields: { email: 'tampered@b.co' },
    }, id)
    const rec = d1.data.submissions.get(id)
    expect(rec.email_status).toBe('sent')      // the one field that updates
    expect(rec.ip).toBe('5.5.5.5')             // untouched
    expect(rec.email).toBe('first@b.co')       // untouched
    expect(JSON.parse(rec.fields).email).toBe('first@b.co')
  })

  it('fails safe (returns the id / null, never throws) when the DB is down', async () => {
    await expect(persistSubmission(broken, { kind: 'flash' })).resolves.toBeNull()
    await expect(persistSubmission(broken, { kind: 'flash' }, 'keep-id')).resolves.toBe('keep-id')
  })
})

describe('flash inventory', () => {
  it('reserves a free piece as pending and signals it actually reserved', async () => {
    const d1 = makeD1()
    expect(await reserveFlashPiece({ DB: d1.DB }, 'flash-07')).toEqual({ ok: true, reserved: true })
    expect(flashMap(d1.data)).toEqual({ 'flash-07': 'pending' })
  })

  it('rejects a second claim of the same piece with its current status', async () => {
    const d1 = makeD1()
    const e = { DB: d1.DB }
    await reserveFlashPiece(e, 'flash-07')
    expect(await reserveFlashPiece(e, 'flash-07')).toEqual({ ok: false, status: 'pending' })
  })

  it('treats a missing id as nothing to reserve (ok, no write)', async () => {
    const d1 = makeD1()
    expect(await reserveFlashPiece({ DB: d1.DB }, '')).toEqual({ ok: true })
    expect(flashMap(d1.data)).toEqual({})
  })

  it('getFlashClaims returns the map, or {} when empty / DB down', async () => {
    const d1 = makeD1()
    d1.data.flash.set('a', { status: 'claimed', updated_at: 'x' })
    expect(await getFlashClaims({ DB: d1.DB })).toEqual({ a: 'claimed' })
    expect(await getFlashClaims(env())).toEqual({})
    expect(await getFlashClaims(broken)).toEqual({})
  })

  it('FAILS OPEN — allows the claim when the DB is unavailable (no reserved flag)', async () => {
    expect(await reserveFlashPiece(broken, 'flash-07')).toEqual({ ok: true })
  })

  it('releaseFlashPiece frees a still-pending reservation but never a confirmed claim', async () => {
    const d1 = makeD1()
    const e = { DB: d1.DB }
    d1.data.flash.set('flash-07', { status: 'pending', updated_at: 'x' })
    await releaseFlashPiece(e, 'flash-07')
    expect(flashMap(d1.data)).toEqual({})

    d1.data.flash.set('flash-09', { status: 'claimed', updated_at: 'x' })
    await releaseFlashPiece(e, 'flash-09')
    expect(flashMap(d1.data)).toEqual({ 'flash-09': 'claimed' }) // untouched

    await expect(releaseFlashPiece(broken, 'flash-07')).resolves.toBeUndefined() // never throws
  })
})

describe('persistConsent', () => {
  it('files a dated consent record keyed by timestamp + email', async () => {
    const d1 = makeD1()
    const key = await persistConsent({ DB: d1.DB }, { email: 'ada@example.com', consentVersion: '2026-06' })
    expect(typeof key).toBe('string')
    expect(key).toContain('ada@example.com')
    expect(d1.data.consent.get(key).version).toBe('2026-06')
  })

  it('fails safe (returns null, never throws) when the DB is down', async () => {
    await expect(persistConsent(broken, { email: 'a@b.co' })).resolves.toBeNull()
  })
})

describe('limitsFrom', () => {
  it('falls back to the built-in defaults when nothing is configured', () => {
    expect(limitsFrom()).toEqual({ maxPerIp: 5, windowMs: 15 * 60_000, maxPerDay: 80 })
    expect(limitsFrom({})).toEqual({ maxPerIp: 5, windowMs: 15 * 60_000, maxPerDay: 80 })
  })

  it('reads per-deploy overrides from env (minutes → ms for the window)', () => {
    expect(limitsFrom({ RATE_MAX_PER_IP: '3', RATE_IP_WINDOW_MIN: '5', RATE_MAX_PER_DAY: '10' }))
      .toEqual({ maxPerIp: 3, windowMs: 5 * 60_000, maxPerDay: 10 })
  })

  it('ignores a non-numeric / zero override and keeps the default (|| fallback)', () => {
    expect(limitsFrom({ RATE_MAX_PER_IP: 'nope', RATE_MAX_PER_DAY: '0' }))
      .toEqual({ maxPerIp: 5, windowMs: 15 * 60_000, maxPerDay: 80 })
  })
})

describe('rateLimit', () => {
  const today = () => new Date().toISOString().slice(0, 10)

  it('honours env-configured limits when no explicit options are passed', async () => {
    // The handlers call rateLimit with only a storeName, so the per-IP ceiling has
    // to come from env via limitsFrom — pin that wiring, not just the option path.
    const d1 = makeD1()
    const env = { DB: d1.DB, RATE_MAX_PER_IP: '2' }
    const now = Date.now()
    for (let i = 0; i < 2; i++) d1.data.rate.push({ bucket: 's:ip:4.4.4.4', ts: now })
    const limiter = await rateLimit(env, '4.4.4.4', { storeName: 's' })
    expect(limiter.ok).toBe(false) // blocked at the env ceiling of 2, not the default 5
  })

  it('commit() prunes the IP bucket of hits that have aged past the window', async () => {
    const d1 = makeD1()
    const now = Date.now()
    const stale = now - 30 * 60_000 // older than the default 15-min window
    d1.data.rate.push({ bucket: 's:ip:6.6.6.6', ts: stale })
    const limiter = await rateLimit({ DB: d1.DB }, '6.6.6.6', { storeName: 's' })
    expect(limiter.ok).toBe(true)
    await limiter.commit()
    const ipRows = d1.data.rate.filter(r => r.bucket === 's:ip:6.6.6.6')
    expect(ipRows).toHaveLength(1)            // the stale row swept, the fresh one kept
    expect(ipRows[0].ts).toBe(now)
  })

  it('commit() prunes stale per-day counter rows (older than ~2 days)', async () => {
    const d1 = makeD1()
    const now = Date.now()
    const oldDay = now - 5 * 24 * 60 * 60 * 1000 // a previous day's counter, 5 days old
    d1.data.rate.push({ bucket: 's:day:2000-01-01', ts: oldDay })
    const limiter = await rateLimit({ DB: d1.DB }, '7.7.7.7', { storeName: 's' })
    expect(limiter.ok).toBe(true)
    await limiter.commit()
    // the ancient day-counter row is swept; today's freshly-written one stays
    expect(d1.data.rate.some(r => r.bucket === 's:day:2000-01-01')).toBe(false)
    expect(d1.data.rate.some(r => r.bucket === `s:day:${today()}`)).toBe(true)
  })

  it('keeps each storeName an independent bucket (enquiry vs newsletter never bleed)', async () => {
    const d1 = makeD1()
    const ip = '8.8.8.8'
    // Exhaust the enquiry bucket for this IP.
    const a = await rateLimit({ DB: d1.DB }, ip, { storeName: 'enquiry-rate', maxPerIp: 1 })
    await a.commit()
    const aBlocked = await rateLimit({ DB: d1.DB }, ip, { storeName: 'enquiry-rate', maxPerIp: 1 })
    expect(aBlocked.ok).toBe(false)
    // The newsletter bucket for the SAME IP is untouched.
    const b = await rateLimit({ DB: d1.DB }, ip, { storeName: 'newsletter-rate', maxPerIp: 1 })
    expect(b.ok).toBe(true)
  })

  it('allows a request under the per-IP limit and records it on commit', async () => {
    const d1 = makeD1()
    const limiter = await rateLimit({ DB: d1.DB }, '1.1.1.1', { storeName: 's', maxPerIp: 3, maxPerDay: 100 })
    expect(limiter.ok).toBe(true)
    await limiter.commit()
    expect(d1.data.rate.some(r => r.bucket === 's:ip:1.1.1.1')).toBe(true)
    expect(d1.data.rate.some(r => r.bucket === `s:day:${today()}`)).toBe(true)
  })

  it('blocks once the per-IP window is full', async () => {
    const d1 = makeD1()
    const now = Date.now()
    for (let i = 0; i < 3; i++) d1.data.rate.push({ bucket: 's:ip:2.2.2.2', ts: now })
    const limiter = await rateLimit({ DB: d1.DB }, '2.2.2.2', { storeName: 's', maxPerIp: 3, windowMs: 60_000 })
    expect(limiter.ok).toBe(false)
    expect(limiter.commit).toBeUndefined()
  })

  it('ignores hits that have aged out of the window', async () => {
    const d1 = makeD1()
    const now = Date.now()
    d1.data.rate.push({ bucket: 's:ip:3.3.3.3', ts: now - 10 * 60_000 })
    d1.data.rate.push({ bucket: 's:ip:3.3.3.3', ts: now - 9 * 60_000 })
    const limiter = await rateLimit({ DB: d1.DB }, '3.3.3.3', { storeName: 's', maxPerIp: 2, windowMs: 60_000 })
    expect(limiter.ok).toBe(true) // stale hits don't count
  })

  it('blocks on the global daily ceiling regardless of IP', async () => {
    const d1 = makeD1()
    for (let i = 0; i < 80; i++) d1.data.rate.push({ bucket: `s:day:${today()}`, ts: Date.now() })
    const limiter = await rateLimit({ DB: d1.DB }, 'fresh-ip', { storeName: 's', maxPerDay: 80 })
    expect(limiter.ok).toBe(false)
  })

  it('FAILS OPEN when the DB is unavailable (never blocks a real visitor)', async () => {
    const limiter = await rateLimit(broken, '1.1.1.1', { storeName: 's' })
    expect(limiter.ok).toBe(true)
    await expect(limiter.commit()).resolves.toBeUndefined()
  })
})
