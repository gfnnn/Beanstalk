// Integration tests for src/handlers/enquiry.js, driven through the public
// `handler(event, env)` (so the private helpers — sniffImage, safeName,
// validation, email building — are covered via real behaviour, not by reaching
// inside). fetch (Resend) is mocked; the D1 binding is an in-memory fake that
// runs the real src/lib/db.js logic and accumulates across calls, so the
// rate-limit and flash-reservation paths are exercised for real.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { handler } from '../src/handlers/enquiry.js'
import { makeD1, flashMap } from './helpers/fake-d1.js'

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
  headers: { origin: 'https://beansprout.ink', 'cf-connecting-ip': '5.5.5.5', ...headers },
  body: JSON.stringify(body),
})
const sentBody = (fetchMock) => JSON.parse(fetchMock.mock.calls[0][1].body)

let d1, env, fetchMock
// Drive the handler with the test env (the fake D1 + Resend secrets).
const H = (event, e = env) => handler(event, e)

beforeEach(() => {
  d1 = makeD1()
  env = { RESEND_API_KEY: 're_test', ARTIST_EMAIL: 'artist@studio.test', FROM_EMAIL: 'hello@beansprout.ink', DB: d1.DB }
  fetchMock = vi.fn(async () => ({ ok: true, text: async () => '', json: async () => ({ id: 'e1' }) }))
  vi.stubGlobal('fetch', fetchMock)
})
afterEach(() => { vi.unstubAllGlobals() })

describe('enquiry handler — protocol', () => {
  it('answers the CORS preflight with 204 and no body', async () => {
    const res = await H({ httpMethod: 'OPTIONS', headers: {} })
    expect(res.statusCode).toBe(204)
    expect(res.body).toBe('')
  })

  it('rejects non-POST methods with 405', async () => {
    expect((await H({ httpMethod: 'GET', headers: {} })).statusCode).toBe(405)
  })

  it('returns 500 when Resend env vars are missing', async () => {
    const res = await H(post(validEnquiry()), { DB: d1.DB })
    expect(res.statusCode).toBe(500)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('returns 400 on an unparseable JSON body', async () => {
    const res = await H({ httpMethod: 'POST', headers: {}, body: '{not json' })
    expect(res.statusCode).toBe(400)
  })
})

describe('enquiry handler — validation', () => {
  it('rejects when required fields are missing', async () => {
    const res = await H(post(validEnquiry({ first_name: '' })))
    expect(res.statusCode).toBe(400)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('rejects a malformed email address', async () => {
    expect((await H(post(validEnquiry({ email: 'nope' })))).statusCode).toBe(400)
  })

  it('rejects when a required consent box is unchecked', async () => {
    const res = await H(post(validEnquiry({ age_confirmed: '' })))
    expect(res.statusCode).toBe(400)
  })

  it('silently accepts (200) but sends nothing when the honeypot is filled', async () => {
    const res = await H(post(validEnquiry({ _gotcha: 'i am a bot' })))
    expect(res.statusCode).toBe(200)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('does not require consent boxes for a flash claim', async () => {
    const res = await H(post({ kind: 'flash', fields: { name: 'Ada', email: 'ada@example.com', piece: 'Moth' } }))
    expect(res.statusCode).toBe(200)
    expect(fetchMock).toHaveBeenCalledOnce()
  })
})

describe('enquiry handler — happy path & email', () => {
  it('sends via Resend with reply-to set to the enquirer and returns 200', async () => {
    const res = await H(post(validEnquiry()))
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
    await H(post(validEnquiry({ idea: '<img src=x onerror=alert(1)>' })))
    const sent = sentBody(fetchMock)
    expect(sent.html).not.toContain('<img src=x')
    expect(sent.html).toContain('&lt;img')
  })

  it('returns 502 when Resend responds with an error', async () => {
    fetchMock.mockResolvedValueOnce({ ok: false, status: 422, text: async () => 'bad', json: async () => ({}) })
    expect((await H(post(validEnquiry()))).statusCode).toBe(502)
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
    await H({
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
    await H({
      ...post(validEnquiry()),
      body: JSON.stringify({ ...validEnquiry(), images: [{ name: 'evil.txt', type: 'image/png', data: notAnImage }] }),
    })
    const body = sentBody(fetchMock)
    expect(body.attachments).toBeUndefined() // nothing attached
    expect(body.html).toContain('skipped')
  })

  it('renames attachments to the sniffed extension, stripping path & double extensions', async () => {
    await H({
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
    const res = await H({ ...post(validEnquiry()), body: JSON.stringify({ ...validEnquiry(), images }) })
    expect(res.statusCode).toBe(400)
    expect(fetchMock).not.toHaveBeenCalled()
  })
})

describe('enquiry handler — persistence & size limits', () => {
  const rows = () => [...d1.data.submissions.values()]

  it('persists the submission with email status "sent" on a successful send', async () => {
    const res = await H(post(validEnquiry()))
    expect(res.statusCode).toBe(200)
    expect(d1.data.submissions.size).toBe(1)            // one record, updated in place
    const rec = rows()[0]
    expect(rec.email_status).toBe('sent')
    expect(rec.kind).toBe('enquiry')
    expect(rec.ip).toBe('5.5.5.5')
    expect(JSON.parse(rec.fields).email).toBe('ada@example.com')
    expect(rec.email).toBe('ada@example.com')            // denormalised for erasure
  })

  it('still persists the enquiry (status "failed") when Resend errors — nothing is lost', async () => {
    fetchMock.mockResolvedValueOnce({ ok: false, status: 500, text: async () => 'x', json: async () => ({}) })
    const res = await H(post(validEnquiry()))
    expect(res.statusCode).toBe(502)
    const rec = rows()[0]
    expect(rec.email_status).toBe('failed')
    expect(JSON.parse(rec.fields).email).toBe('ada@example.com')
  })

  it('rejects an oversized request body before parsing it (413)', async () => {
    const huge = 'x'.repeat(6 * 1024 * 1024 + 1)
    const res = await H({ httpMethod: 'POST', headers: { origin: 'https://beansprout.ink' }, body: huge })
    expect(res.statusCode).toBe(413)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('drops a single image that exceeds the per-image ceiling, but still sends', async () => {
    const tooBig = IMG.jpeg + 'A'.repeat(6_000_000) // ~4.5 MB decoded, over the 4 MB cap
    const res = await H({
      ...post(validEnquiry()),
      body: JSON.stringify({ ...validEnquiry(), images: [{ name: 'big.jpg', type: 'image/jpeg', data: tooBig }] }),
    })
    expect(res.statusCode).toBe(200)
    const body = sentBody(fetchMock)
    expect(body.attachments).toBeUndefined() // the oversized image was skipped
    expect(body.html).toContain('skipped')
  })
})

describe('enquiry handler — flash inventory', () => {
  const flashClaim = (over = {}) => ({
    kind: 'flash',
    fields: { name: 'Ada', email: 'ada@example.com', piece: 'Moth', piece_id: 'flash-03', ...over },
  })

  it('reserves the piece on a successful claim and emails once', async () => {
    const res = await H(post(flashClaim()))
    expect(res.statusCode).toBe(200)
    expect(fetchMock).toHaveBeenCalledOnce()
    expect(flashMap(d1.data)).toEqual({ 'flash-03': 'pending' })
  })

  it('rejects a second claim of the same piece with 409 and sends no email', async () => {
    expect((await H(post(flashClaim()))).statusCode).toBe(200) // first reserves
    fetchMock.mockClear()
    const res = await H(post(flashClaim({ email: 'bob@example.com' })))
    expect(res.statusCode).toBe(409)
    expect(JSON.parse(res.body).status).toBe('pending')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('still sends a claim that carries no piece_id (nothing to reserve)', async () => {
    const res = await H(post(flashClaim({ piece_id: '' })))
    expect(res.statusCode).toBe(200)
    expect(fetchMock).toHaveBeenCalledOnce()
  })

  it('releases the reservation when the send fails, so the piece is claimable again', async () => {
    fetchMock.mockResolvedValueOnce({ ok: false, status: 500, text: async () => 'boom', json: async () => ({}) })
    const res = await H(post(flashClaim()))
    expect(res.statusCode).toBe(502)
    // Rolled back — not stranded as 'pending'.
    expect(flashMap(d1.data)).toEqual({})

    // …and a retry can reserve + send cleanly.
    const retry = await H(post(flashClaim()))
    expect(retry.statusCode).toBe(200)
    expect(flashMap(d1.data)).toEqual({ 'flash-03': 'pending' })
  })
})

describe('enquiry handler — rate limiting', () => {
  it('blocks with 429 once the same IP exceeds the per-IP window (default 5)', async () => {
    for (let i = 0; i < 5; i++) {
      expect((await H(post(validEnquiry()))).statusCode).toBe(200)
    }
    const blocked = await H(post(validEnquiry()))
    expect(blocked.statusCode).toBe(429)
  })

  it('does not count a failed send against the limit (commit only on success)', async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 500, text: async () => 'x', json: async () => ({}) })
    for (let i = 0; i < 6; i++) {
      expect((await H(post(validEnquiry()))).statusCode).toBe(502) // never 429
    }
  })

  it('gates BEFORE the flash reservation and persistence — a throttled claim writes nothing', async () => {
    for (let i = 0; i < 5; i++) {
      expect((await H(post(validEnquiry()))).statusCode).toBe(200) // exhaust the IP window
    }
    const blocked = await H(post({
      kind: 'flash',
      fields: { name: 'Bo', email: 'bo@example.com', piece: 'Moth', piece_id: 'flash-99' },
    }))
    expect(blocked.statusCode).toBe(429)
    // The expensive path never ran: no piece reserved, no submission row written.
    expect(flashMap(d1.data)['flash-99']).toBeUndefined()
    expect(d1.data.submissions.size).toBe(5) // only the 5 that got through
    expect(fetchMock).toHaveBeenCalledTimes(5)
  })
})
