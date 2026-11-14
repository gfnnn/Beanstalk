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

  it('does nothing without the email env vars', async () => {
    seed('a', 'failed')
    expect(await failedDigest({ DB: d1.DB }, NOW)).toEqual({ reported: 0 })
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
