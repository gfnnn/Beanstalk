// Tests for src/lib/http.js — the shared HTTP plumbing. CORS must echo only
// allowlisted origins (and fall back to the canonical one otherwise), and the
// client-IP extraction must trust ONLY Cloudflare's header, never the spoofable
// x-forwarded-for, or the per-IP rate-limit bucket can be trivially evaded.
import { describe, it, expect } from 'vitest'
import { corsFor, replyWith, clientIp, toEvent, ALLOWED_ORIGINS, CANONICAL_ORIGIN } from '../src/lib/http.js'

describe('corsFor', () => {
  it('echoes an allowed origin back', () => {
    for (const origin of ALLOWED_ORIGINS) {
      expect(corsFor({ headers: { origin } })['Access-Control-Allow-Origin']).toBe(origin)
    }
  })

  it('falls back to the canonical origin for a disallowed origin', () => {
    expect(corsFor({ headers: { origin: 'https://evil.example' } })['Access-Control-Allow-Origin']).toBe(CANONICAL_ORIGIN)
  })

  it('handles a capitalised Origin header and a missing one', () => {
    expect(corsFor({ headers: { Origin: 'https://beansprout.ink' } })['Access-Control-Allow-Origin']).toBe('https://beansprout.ink')
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
    const res = replyWith({ 'Access-Control-Allow-Origin': 'x' })(400, { error: 'nope' })
    expect(res.statusCode).toBe(400)
    expect(res.headers['Content-Type']).toBe('application/json')
    expect(res.headers['Access-Control-Allow-Origin']).toBe('x')
    expect(JSON.parse(res.body)).toEqual({ error: 'nope' })
  })
})

describe('clientIp', () => {
  it('uses the Cloudflare edge connection-IP header', () => {
    expect(clientIp({ headers: { 'cf-connecting-ip': '1.2.3.4' } })).toBe('1.2.3.4')
  })

  it('takes the first hop if the header carries a list', () => {
    expect(clientIp({ headers: { 'cf-connecting-ip': '1.2.3.4, 10.0.0.1' } })).toBe('1.2.3.4')
  })

  it('ignores client-controlled x-forwarded-for (anti-spoof)', () => {
    expect(clientIp({ headers: { 'x-forwarded-for': '9.9.9.9, 10.0.0.1' } })).toBe('unknown')
    expect(clientIp({ headers: { 'cf-connecting-ip': '1.2.3.4', 'x-forwarded-for': '9.9.9.9' } })).toBe('1.2.3.4')
  })

  it('returns "unknown" when no trusted IP header is present', () => {
    expect(clientIp({ headers: {} })).toBe('unknown')
  })
})

describe('toEvent', () => {
  it('lowercases headers and reads the body for a POST', async () => {
    const req = new Request('https://x/enquiry', {
      method: 'POST', headers: { 'Content-Type': 'application/json', Origin: 'https://beansprout.ink' }, body: '{"a":1}',
    })
    const event = await toEvent(req)
    expect(event.httpMethod).toBe('POST')
    expect(event.headers['content-type']).toBe('application/json')
    expect(event.headers.origin).toBe('https://beansprout.ink')
    expect(event.body).toBe('{"a":1}')
  })

  it('leaves the body empty for a GET', async () => {
    const event = await toEvent(new Request('https://x/flash-status'))
    expect(event.httpMethod).toBe('GET')
    expect(event.body).toBe('')
  })
})
