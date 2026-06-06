// Cross-handler rate-limit isolation. The enquiry and newsletter handlers share
// the same D1 instance and the same per-IP rate limiter, distinguished only by
// their `storeName` ('enquiry-rate' vs 'newsletter-rate'). This pins, end to end
// through both public handlers, that exhausting one endpoint's allowance for an IP
// does NOT throttle the other for that same IP — a regression that namespacing
// alone (a single shared bucket) would silently introduce.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { handler as enquiry } from '../src/handlers/enquiry.js'
import { handler as newsletter } from '../src/handlers/newsletter.js'
import { makeD1 } from './helpers/fake-d1.js'

const AUDIENCE_ID = '78261eea-1c2d-4e3f-9a0b-1c2d3e4f5a6b'
const IP = '5.5.5.5'

const enquiryPost = () => ({
  httpMethod: 'POST',
  headers: { origin: 'https://beansprout.ink', 'cf-connecting-ip': IP },
  body: JSON.stringify({
    kind: 'enquiry',
    fields: {
      first_name: 'Ada', last_name: 'Lovelace', email: 'ada@example.com',
      policy_accepted: 'on', age_confirmed: 'on', deposit_understood: 'on',
    },
  }),
})
const newsletterPost = () => ({
  httpMethod: 'POST',
  headers: { origin: 'https://beansprout.ink', 'cf-connecting-ip': IP },
  body: JSON.stringify({ fields: { email: 'ada@example.com', consent: 'on' } }),
})

let d1, env
beforeEach(() => {
  d1 = makeD1()
  env = {
    RESEND_API_KEY: 're_test', ARTIST_EMAIL: 'artist@studio.test',
    FROM_EMAIL: 'hello@beansprout.ink', RESEND_AUDIENCE_ID: AUDIENCE_ID, DB: d1.DB,
  }
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, text: async () => '', json: async () => ({ id: 'x' }) })))
})
afterEach(() => { vi.unstubAllGlobals() })

describe('enquiry and newsletter rate buckets are independent', () => {
  it('an IP throttled on enquiries can still subscribe to the newsletter', async () => {
    // Exhaust the per-IP enquiry window (default 5), then confirm the 6th is blocked.
    for (let i = 0; i < 5; i++) expect((await enquiry(enquiryPost(), env)).statusCode).toBe(200)
    expect((await enquiry(enquiryPost(), env)).statusCode).toBe(429)

    // Same IP, same DB — the newsletter bucket is untouched, so signup succeeds.
    expect((await newsletter(newsletterPost(), env)).statusCode).toBe(200)
  })

  it('an IP throttled on the newsletter can still send an enquiry', async () => {
    for (let i = 0; i < 5; i++) expect((await newsletter(newsletterPost(), env)).statusCode).toBe(200)
    expect((await newsletter(newsletterPost(), env)).statusCode).toBe(429)

    expect((await enquiry(enquiryPost(), env)).statusCode).toBe(200)
  })
})
