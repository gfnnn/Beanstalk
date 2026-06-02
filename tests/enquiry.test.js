// Integration tests for netlify/functions/enquiry.js, driven through the public
// `handler(event)` (so the private helpers — sniffImage, safeName, validation,
// email building — are covered via real behaviour, not by reaching inside).
// fetch (Resend) and @netlify/blobs (rate limiter) are mocked; the in-memory
// blobs stub accumulates across calls so the rate-limit path is real.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

// In-memory @netlify/blobs stub, namespaced per storeName, accumulates within a test.
const { stores } = vi.hoisted(() => ({ stores: new Map() }))
vi.mock('@netlify/blobs', () => ({
  getStore: (name) => {
    if (!stores.has(name)) stores.set(name, new Map())
    const m = stores.get(name)
    return {
      get: async (key) => (m.has(key) ? m.get(key) : null),
      set: async (key, val) => { m.set(key, val) },
      setJSON: async (key, val) => { m.set(key, val) },
    }
  },
}))

const { handler } = await import('../netlify/functions/enquiry.js')

// ── Fixtures ──────────────────────────────────────────────────────────────────
const b64 = (bytes) => {
  const buf = Buffer.alloc(16)
  bytes.forEach((v, i) => { buf[i] = v })
  return buf.toString('base64')
}
const IMG = {
  jpeg: b64([0xFF, 0xD8, 0xFF, 0xE0]),
  png: b64([0x89, 0x50, 0x4E, 0x47]),
  gif: b64([0x47, 0x49, 0x46, 0x38]),
  webp: b64([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50]),
  heic: b64([0, 0, 0, 0, 0x66, 0x74, 0x79, 0x70, 0x68, 0x65, 0x69, 0x63]), // 'ftyp''heic'
  avif: b64([0, 0, 0, 0, 0x66, 0x74, 0x79, 0x70, 0x61, 0x76, 0x69, 0x66]), // 'ftyp''avif'
}
const validEnquiry = (over = {}) => ({
  kind: 'enquiry',
  fields: {
    first_name: 'Ada', last_name: 'Lovelace', email: 'ada@example.com',
    policy_accepted: 'on', age_confirmed: 'on', deposit_understood: 'on',
    ...over,
  },
})
const post = (body, headers = {}) => ({
  httpMethod: 'POST',
  headers: { origin: 'https://beansprout.netlify.app', 'x-forwarded-for': '5.5.5.5', ...headers },
  body: JSON.stringify(body),
})
const sentBody = (fetchMock) => JSON.parse(fetchMock.mock.calls[0][1].body)

let fetchMock
beforeEach(() => {
  stores.clear()
  vi.stubEnv('RESEND_API_KEY', 're_test')
  vi.stubEnv('ARTIST_EMAIL', 'artist@studio.test')
  vi.stubEnv('FROM_EMAIL', 'hello@beansprout.ink')
  fetchMock = vi.fn(async () => ({ ok: true, text: async () => '', json: async () => ({ id: 'e1' }) }))
  vi.stubGlobal('fetch', fetchMock)
})
afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
})

describe('enquiry handler — protocol', () => {
  it('answers the CORS preflight with 204 and no body', async () => {
    const res = await handler({ httpMethod: 'OPTIONS', headers: {} })
    expect(res.statusCode).toBe(204)
    expect(res.body).toBe('')
  })

  it('rejects non-POST methods with 405', async () => {
    expect((await handler({ httpMethod: 'GET', headers: {} })).statusCode).toBe(405)
  })

  it('returns 500 when Resend env vars are missing', async () => {
    vi.unstubAllEnvs()
    const res = await handler(post(validEnquiry()))
    expect(res.statusCode).toBe(500)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('returns 400 on an unparseable JSON body', async () => {
    const res = await handler({ httpMethod: 'POST', headers: {}, body: '{not json' })
    expect(res.statusCode).toBe(400)
  })
})

describe('enquiry handler — validation', () => {
  it('rejects when required fields are missing', async () => {
    const res = await handler(post(validEnquiry({ first_name: '' })))
    expect(res.statusCode).toBe(400)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('rejects a malformed email address', async () => {
    expect((await handler(post(validEnquiry({ email: 'nope' })))).statusCode).toBe(400)
  })

  it('rejects when a required consent box is unchecked', async () => {
    const res = await handler(post(validEnquiry({ age_confirmed: '' })))
    expect(res.statusCode).toBe(400)
  })

  it('silently accepts (200) but sends nothing when the honeypot is filled', async () => {
    const res = await handler(post(validEnquiry({ _gotcha: 'i am a bot' })))
    expect(res.statusCode).toBe(200)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('does not require consent boxes for a flash claim', async () => {
    const res = await handler(post({ kind: 'flash', fields: { name: 'Ada', email: 'ada@example.com', piece: 'Moth' } }))
    expect(res.statusCode).toBe(200)
    expect(fetchMock).toHaveBeenCalledOnce()
  })
})

describe('enquiry handler — happy path & email', () => {
  it('sends via Resend with reply-to set to the enquirer and returns 200', async () => {
    const res = await handler(post(validEnquiry()))
    expect(res.statusCode).toBe(200)
    expect(JSON.parse(res.body)).toEqual({ ok: true })
    const body = sentBody(fetchMock)
    expect(body.to).toEqual(['artist@studio.test'])
    expect(body.reply_to).toBe('ada@example.com')
    expect(body.from).toContain('hello@beansprout.ink')
    expect(body.subject).toContain('Ada Lovelace')
    expect(body.html).toContain('Ada')
    expect(typeof body.text).toBe('string')
  })

  it('escapes user input in the rendered email (no HTML injection)', async () => {
    await handler(post(validEnquiry({ idea: '<img src=x onerror=alert(1)>' })))
    const sent = sentBody(fetchMock)
    expect(sent.html).not.toContain('<img src=x')
    expect(sent.html).toContain('&lt;img')
  })

  it('returns 502 when Resend responds with an error', async () => {
    fetchMock.mockResolvedValueOnce({ ok: false, status: 422, text: async () => 'bad', json: async () => ({}) })
    expect((await handler(post(validEnquiry()))).statusCode).toBe(502)
  })
})

describe('enquiry handler — image sniffing & filenames', () => {
  it.each([
    ['jpeg', 'image/jpeg', 'jpg'],
    ['png', 'image/png', 'png'],
    ['gif', 'image/gif', 'gif'],
    ['webp', 'image/webp', 'webp'],
    ['heic', 'image/heic', 'heic'],
    ['avif', 'image/avif', 'avif'],
  ])('accepts a real %s by magic bytes and labels it correctly', async (fmt, type, ext) => {
    await handler({
      ...post(validEnquiry()),
      body: JSON.stringify({ ...validEnquiry(), images: [{ name: `ref.${fmt}`, type: 'application/octet-stream', data: IMG[fmt] }] }),
    })
    const att = sentBody(fetchMock).attachments
    expect(att).toHaveLength(1)
    expect(att[0].content_type).toBe(type)
    expect(att[0].filename.endsWith(`.${ext}`)).toBe(true)
  })

  it('drops files that are not a recognised image and tells the artist how many', async () => {
    const notAnImage = Buffer.from('this is plain text, definitely not an image').toString('base64')
    await handler({
      ...post(validEnquiry()),
      body: JSON.stringify({ ...validEnquiry(), images: [{ name: 'evil.txt', type: 'image/png', data: notAnImage }] }),
    })
    const body = sentBody(fetchMock)
    expect(body.attachments).toBeUndefined() // nothing attached
    expect(body.html).toContain('skipped')
  })

  it('renames attachments to the sniffed extension, stripping path & double extensions', async () => {
    await handler({
      ...post(validEnquiry()),
      body: JSON.stringify({ ...validEnquiry(), images: [{ name: '../../etc/passwd.jpg.exe', type: 'image/jpeg', data: IMG.jpeg }] }),
    })
    const name = sentBody(fetchMock).attachments[0].filename
    expect(name).not.toContain('/')
    expect(name.endsWith('.exe')).toBe(false)
    expect(name.endsWith('.jpg')).toBe(true)
  })

  it('rejects more than the maximum number of images with 400', async () => {
    const images = Array.from({ length: 9 }, (_, i) => ({ name: `r${i}.jpg`, type: 'image/jpeg', data: IMG.jpeg }))
    const res = await handler({ ...post(validEnquiry()), body: JSON.stringify({ ...validEnquiry(), images }) })
    expect(res.statusCode).toBe(400)
    expect(fetchMock).not.toHaveBeenCalled()
  })
})

describe('enquiry handler — rate limiting', () => {
  it('blocks with 429 once the same IP exceeds the per-IP window (default 5)', async () => {
    for (let i = 0; i < 5; i++) {
      expect((await handler(post(validEnquiry()))).statusCode).toBe(200)
    }
    const blocked = await handler(post(validEnquiry()))
    expect(blocked.statusCode).toBe(429)
  })

  it('does not count a failed send against the limit (commit only on success)', async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 500, text: async () => 'x', json: async () => ({}) })
    for (let i = 0; i < 6; i++) {
      expect((await handler(post(validEnquiry()))).statusCode).toBe(502) // never 429
    }
  })
})
