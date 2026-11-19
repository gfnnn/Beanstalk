// Tests for src/handlers/failed-digest.js — the daily cron that tells the artist
// about submissions stored in D1 whose notification email never went out.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { failedDigest } from '../src/handlers/failed-digest.js'
import { makeD1 } from './helpers/fake-d1.js'

const NOW = Date.parse('2026-06-10T08:00:00Z')
let d1, env, fetchMock

const seed = (id, email_status, received_at = '2026-06-09T12:00:00.000Z', kind = 'enquiry') =>
  d1.data.submissions.set(id, { id, kind, email: `${id}@example.com`, received_at, email_status, fields: '{}' })
const status = id => d1.data.submissions.get(id).email_status

beforeEach(() => {
  d1 = makeD1()
  env = { RESEND_API_KEY: 're_test', ARTIST_EMAIL: 'artist@studio.test', FROM_EMAIL: 'hello@beansprout.ink', DB: d1.DB }
  fetchMock = vi.fn(async () => ({ ok: true, text: async () => '' }))
  vi.stubGlobal('fetch', fetchMock)
})
afterEach(() => { vi.unstubAllGlobals() })

describe('failed-send digest', () => {
  it('sends nothing when every submission was emailed', async () => {
    seed('a', 'sent')
    expect(await failedDigest(env, NOW)).toEqual({ reported: 0 })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('emails the artist the failed and stale-pending submissions, once', async () => {
    seed('a', 'failed', undefined, 'flash')
    seed('b', 'pending')                              // stale: received yesterday
    seed('c', 'pending', '2026-06-10T07:59:00.000Z')  // in flight: within the grace window
    seed('d', 'sent')
    expect(await failedDigest(env, NOW)).toEqual({ reported: 2 })

    const body = JSON.parse(fetchMock.mock.calls[0][1].body)
    expect(body.to).toEqual(['artist@studio.test'])
    expect(body.text).toContain('Flash claim from a@example.com')
    expect(body.text).toContain('Enquiry from b@example.com')
    expect(body.text).not.toContain('c@example.com')
    expect(body.text).not.toContain('d@example.com')
    expect([status('a'), status('b'), status('c')]).toEqual(['failed_reported', 'failed_reported', 'pending'])

    fetchMock.mockClear()
    expect(await failedDigest(env, NOW)).toEqual({ reported: 0 })   // not re-sent
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('leaves rows unreported so the next run retries when the digest itself fails', async () => {
    seed('a', 'failed')
    fetchMock.mockResolvedValueOnce({ ok: false, status: 500, text: async () => 'down' })
    expect(await failedDigest(env, NOW)).toEqual({ reported: 0 })
    expect(status('a')).toBe('failed')
  })

  it('leaves rows unreported when the send throws (network down), and never throws itself', async () => {
    seed('a', 'failed')
    fetchMock.mockRejectedValueOnce(new Error('network down'))
    await expect(failedDigest(env, NOW)).resolves.toEqual({ reported: 0 })
    expect(status('a')).toBe('failed')
  })

  it('reports again on the next run after a failed digest', async () => {
    seed('a', 'failed')
    fetchMock.mockResolvedValueOnce({ ok: false, status: 500, text: async () => 'down' })
    await failedDigest(env, NOW)
    expect(await failedDigest(env, NOW)).toEqual({ reported: 1 })
    expect(status('a')).toBe('failed_reported')
  })

  it('treats a pending row exactly at the 15-minute grace boundary as still in flight', async () => {
    seed('edge', 'pending', new Date(NOW - 15 * 60_000).toISOString())
    seed('past', 'pending', new Date(NOW - 15 * 60_000 - 1).toISOString())
    expect(await failedDigest(env, NOW)).toEqual({ reported: 1 })
    expect([status('edge'), status('past')]).toEqual(['pending', 'failed_reported'])
  })

  it('lists submissions oldest first and words the subject for one vs many', async () => {
    seed('late', 'failed', '2026-06-09T18:00:00.000Z')
    seed('early', 'failed', '2026-06-08T09:00:00.000Z')
    await failedDigest(env, NOW)
    const many = JSON.parse(fetchMock.mock.calls[0][1].body)
    expect(many.subject).toContain('2 submissions did not reach you')
    expect(many.text.indexOf('early@example.com')).toBeLessThan(many.text.indexOf('late@example.com'))
    expect(many.text.indexOf('early@example.com')).toBeGreaterThan(-1)

    seed('solo', 'failed')
    await failedDigest(env, NOW)
    const one = JSON.parse(fetchMock.mock.calls[1][1].body)
    expect(one.subject).toContain('1 submission did not reach you')
    expect(one.text).toContain('1 form submission did not')
  })

  it('escapes a hostile stored address in the HTML body and copes with a missing one', async () => {
    seed('x', 'failed')
    d1.data.submissions.get('x').email = '<img src=x onerror="alert(1)">@evil.test'
    seed('y', 'failed')
    d1.data.submissions.get('y').email = null
    await failedDigest(env, NOW)
    const { html, text } = JSON.parse(fetchMock.mock.calls[0][1].body)
    expect(html).not.toContain('<img')
    expect(html).toContain('&lt;img src=x onerror=&quot;alert(1)&quot;&gt;@evil.test')
    expect(text).toContain('from unknown address')
  })

  it('sends with the API key, and wraps a bare FROM_EMAIL but keeps a display-name one', async () => {
    seed('a', 'failed')
    await failedDigest(env, NOW)
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('https://api.resend.com/emails')
    expect(init.headers.Authorization).toBe('Bearer re_test')
    expect(JSON.parse(init.body).from).toBe('Beansprout <hello@beansprout.ink>')

    seed('b', 'failed')
    await failedDigest({ ...env, FROM_EMAIL: 'Roxy <roxy@beansprout.ink>' }, NOW)
    expect(JSON.parse(fetchMock.mock.calls[1][1].body).from).toBe('Roxy <roxy@beansprout.ink>')
  })

  it('fails safe when the database is down: no email, no throw', async () => {
    const broken = { ...env, DB: { prepare() { throw new Error('D1 down') }, batch() { throw new Error('D1 down') } } }
    await expect(failedDigest(broken, NOW)).resolves.toEqual({ reported: 0 })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('still counts the send when marking rows reported fails (the email did go out)', async () => {
    seed('a', 'failed')
    const flaky = { ...env, DB: { prepare: d1.DB.prepare.bind(d1.DB), batch() { throw new Error('D1 write down') } } }
    await expect(failedDigest(flaky, NOW)).resolves.toEqual({ reported: 1 })
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(status('a')).toBe('failed')   // will be re-reported next run rather than lost
  })

  it('does nothing without the email env vars', async () => {
    seed('a', 'failed')
    expect(await failedDigest({ DB: d1.DB }, NOW)).toEqual({ reported: 0 })
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
