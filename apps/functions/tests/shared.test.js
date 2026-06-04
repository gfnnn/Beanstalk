// Tests for netlify/functions/_shared.js — the shared abuse-protection layer.
// This is the highest-leverage backend code to pin: a regression here either
// blocks genuine enquiries (false positive) or removes the only real backstop
// against a scripted flood (false negative). We mock @netlify/blobs so the
// rate-limiter's window/ceiling and — crucially — its FAIL-OPEN behaviour are
// exercised deterministically, with no network or real Blobs store.
import { describe, it, expect, beforeEach, vi } from 'vitest'

// A controllable getStore mock (hoisted so the vi.mock factory can close over it).
const { getStoreMock } = vi.hoisted(() => ({ getStoreMock: vi.fn() }))
vi.mock('@netlify/blobs', () => ({ getStore: getStoreMock }))

const { corsFor, replyWith, clientIp, rateLimit, persistSubmission, getFlashClaims, reserveFlashPiece, ALLOWED_ORIGINS, CANONICAL_ORIGIN } =
  await import('../netlify/functions/_shared.js')

// In-memory stand-in for a Netlify Blobs store.
function makeStore(initial = {}) {
  const m = new Map(Object.entries(initial))
  return {
    get: vi.fn(async (key, opts) => {
      const v = m.get(key)
      if (v === undefined) return null
      return opts?.type === 'json' ? v : v
    }),
    set: vi.fn(async (key, val) => { m.set(key, val) }),
    setJSON: vi.fn(async (key, val) => { m.set(key, val) }),
    _map: m,
  }
}

beforeEach(() => {
  getStoreMock.mockReset()
})

describe('corsFor', () => {
  it('echoes an allowed origin back', () => {
    for (const origin of ALLOWED_ORIGINS) {
      expect(corsFor({ headers: { origin } })['Access-Control-Allow-Origin']).toBe(origin)
    }
  })

  it('falls back to the canonical origin for a disallowed origin', () => {
    const headers = corsFor({ headers: { origin: 'https://evil.example' } })
    expect(headers['Access-Control-Allow-Origin']).toBe(CANONICAL_ORIGIN)
  })

  it('handles a capitalised Origin header and a missing one', () => {
    expect(corsFor({ headers: { Origin: 'https://beansprout.ink' } })['Access-Control-Allow-Origin'])
      .toBe('https://beansprout.ink')
    expect(corsFor({ headers: {} })['Access-Control-Allow-Origin']).toBe(CANONICAL_ORIGIN)
  })

  it('always advertises POST/OPTIONS and varies on Origin', () => {
    const h = corsFor({ headers: {} })
    expect(h['Access-Control-Allow-Methods']).toContain('POST')
    expect(h['Vary']).toBe('Origin')
  })
})

describe('replyWith', () => {
  it('wraps a body as JSON and merges the CORS headers', () => {
    const reply = replyWith({ 'Access-Control-Allow-Origin': 'x' })
    const res = reply(400, { error: 'nope' })
    expect(res.statusCode).toBe(400)
    expect(res.headers['Content-Type']).toBe('application/json')
    expect(res.headers['Access-Control-Allow-Origin']).toBe('x')
    expect(JSON.parse(res.body)).toEqual({ error: 'nope' })
  })
})

describe('clientIp', () => {
  it('uses the Netlify edge connection-IP header', () => {
    expect(clientIp({ headers: { 'x-nf-client-connection-ip': '1.2.3.4' } })).toBe('1.2.3.4')
  })

  it('takes the first hop of the Netlify header if it carries a list', () => {
    expect(clientIp({ headers: { 'x-nf-client-connection-ip': '1.2.3.4, 10.0.0.1' } })).toBe('1.2.3.4')
  })

  it('ignores client-controlled x-forwarded-for (anti-spoof)', () => {
    // XFF is attacker-settable; honouring it would mint a fresh rate-limit
    // bucket per request. It must NOT influence the result.
    expect(clientIp({ headers: { 'x-forwarded-for': '9.9.9.9, 10.0.0.1' } })).toBe('unknown')
    expect(clientIp({ headers: { 'x-nf-client-connection-ip': '1.2.3.4', 'x-forwarded-for': '9.9.9.9' } })).toBe('1.2.3.4')
  })

  it('returns "unknown" when no trusted IP header is present', () => {
    expect(clientIp({ headers: {} })).toBe('unknown')
  })
})

describe('persistSubmission', () => {
  it('writes a JSON record and returns a generated id', async () => {
    const store = makeStore()
    getStoreMock.mockReturnValue(store)

    const id = await persistSubmission({ kind: 'enquiry', emailStatus: 'pending', fields: { email: 'a@b.co' } })
    expect(typeof id).toBe('string')
    expect(id.startsWith('enquiry/')).toBe(true)
    expect(store.setJSON).toHaveBeenCalledWith(id, expect.objectContaining({ id, emailStatus: 'pending' }))
  })

  it('updates a prior record in place when given its id', async () => {
    const store = makeStore()
    getStoreMock.mockReturnValue(store)

    const id = await persistSubmission({ kind: 'enquiry', emailStatus: 'pending' })
    await persistSubmission({ kind: 'enquiry', emailStatus: 'sent' }, id)
    expect(store._map.size).toBe(1)            // same key, overwritten
    expect(store._map.get(id).emailStatus).toBe('sent')
  })

  it('fails safe (returns the id / null, never throws) when the store is down', async () => {
    getStoreMock.mockImplementation(() => { throw new Error('blobs down') })
    await expect(persistSubmission({ kind: 'flash' })).resolves.toBeNull()
    await expect(persistSubmission({ kind: 'flash' }, 'keep-id')).resolves.toBe('keep-id')
  })
})

describe('flash inventory (getFlashClaims / reserveFlashPiece)', () => {
  it('reserves a free piece as pending and returns ok', async () => {
    const store = makeStore()
    getStoreMock.mockReturnValue(store)
    const r = await reserveFlashPiece('flash-07')
    expect(r).toEqual({ ok: true })
    expect(store._map.get('claims')).toEqual({ 'flash-07': 'pending' })
  })

  it('rejects a second claim of the same piece with its current status', async () => {
    const store = makeStore({ claims: { 'flash-07': 'pending' } })
    getStoreMock.mockReturnValue(store)
    const r = await reserveFlashPiece('flash-07')
    expect(r).toEqual({ ok: false, status: 'pending' })
    expect(store.setJSON).not.toHaveBeenCalled() // nothing re-written
  })

  it('treats a missing id as nothing to reserve (ok, no write)', async () => {
    const store = makeStore()
    getStoreMock.mockReturnValue(store)
    expect(await reserveFlashPiece('')).toEqual({ ok: true })
    expect(store.setJSON).not.toHaveBeenCalled()
  })

  it('getFlashClaims returns the map, or {} when empty / store down', async () => {
    getStoreMock.mockReturnValue(makeStore({ claims: { a: 'claimed' } }))
    expect(await getFlashClaims()).toEqual({ a: 'claimed' })
    getStoreMock.mockReturnValue(makeStore())
    expect(await getFlashClaims()).toEqual({})
    getStoreMock.mockImplementation(() => { throw new Error('down') })
    expect(await getFlashClaims()).toEqual({})
  })

  it('FAILS OPEN — allows the claim when the store is unavailable', async () => {
    getStoreMock.mockImplementation(() => { throw new Error('blobs down') })
    expect(await reserveFlashPiece('flash-07')).toEqual({ ok: true })
  })
})

describe('rateLimit', () => {
  it('allows a request under the per-IP limit and records it on commit', async () => {
    const store = makeStore()
    getStoreMock.mockReturnValue(store)

    const limiter = await rateLimit('1.1.1.1', { storeName: 's', maxPerIp: 3, maxPerDay: 100 })
    expect(limiter.ok).toBe(true)
    await limiter.commit()

    expect(store.setJSON).toHaveBeenCalledWith('ip-1.1.1.1', expect.any(Array))
    expect(store.set).toHaveBeenCalledWith(expect.stringContaining('count-'), '1')
  })

  it('blocks once the per-IP window is full', async () => {
    const now = Date.now()
    const store = makeStore({ 'ip-2.2.2.2': [now, now, now] }) // 3 recent hits
    getStoreMock.mockReturnValue(store)

    const limiter = await rateLimit('2.2.2.2', { storeName: 's', maxPerIp: 3, windowMs: 60_000 })
    expect(limiter.ok).toBe(false)
    expect(limiter.commit).toBeUndefined()
  })

  it('ignores hits that have aged out of the window', async () => {
    const now = Date.now()
    const store = makeStore({ 'ip-3.3.3.3': [now - 10 * 60_000, now - 9 * 60_000] }) // both stale
    getStoreMock.mockReturnValue(store)

    const limiter = await rateLimit('3.3.3.3', { storeName: 's', maxPerIp: 2, windowMs: 60_000 })
    expect(limiter.ok).toBe(true) // stale hits don't count
  })

  it('blocks on the global daily ceiling regardless of IP', async () => {
    const dayKey = `count-${new Date().toISOString().slice(0, 10)}`
    const store = makeStore({ [dayKey]: '80' })
    getStoreMock.mockReturnValue(store)

    const limiter = await rateLimit('fresh-ip', { storeName: 's', maxPerDay: 80 })
    expect(limiter.ok).toBe(false)
  })

  it('FAILS OPEN when the Blobs store is unavailable (never blocks a real visitor)', async () => {
    getStoreMock.mockImplementation(() => { throw new Error('blobs down') })

    const limiter = await rateLimit('1.1.1.1', { storeName: 's' })
    expect(limiter.ok).toBe(true)
    await expect(limiter.commit()).resolves.toBeUndefined() // no-op commit, doesn't throw
  })
})
