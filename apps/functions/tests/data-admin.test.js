import { describe, it, expect } from 'vitest'
import {
  recordEmail,
  recordTimestamp,
  ageDays,
  isExpired,
  summarise,
  RETENTION_DAYS_DEFAULT,
} from '../scripts/data-admin.mjs'

// Pure helpers only — the CLI/Blobs plumbing isn't exercised here (no live store).

const enquiry = {
  id: 'enquiry/2026-01-01T10-00-00-000Z-ab12cd',
  kind: 'enquiry',
  receivedAt: '2026-01-01T10:00:00.000Z',
  emailStatus: 'sent',
  fields: { email: 'Visitor@Example.com', name: 'Vee' },
}

const consent = {
  id: '2026-01-01T10-00-00-000Z-sub_example.com',
  email: 'Sub@Example.com',
  consentedAt: '2026-01-01T10:00:00.000Z',
  consentVersion: 3,
}

describe('recordEmail', () => {
  it('reads fields.email (submissions) lowercased + trimmed', () => {
    expect(recordEmail(enquiry)).toBe('visitor@example.com')
  })
  it('reads top-level email (consent ledger)', () => {
    expect(recordEmail(consent)).toBe('sub@example.com')
  })
  it('is empty for junk input', () => {
    expect(recordEmail(null)).toBe('')
    expect(recordEmail({})).toBe('')
  })
})

describe('recordTimestamp', () => {
  it('prefers receivedAt / consentedAt', () => {
    expect(recordTimestamp(enquiry)).toBe('2026-01-01T10:00:00.000Z')
    expect(recordTimestamp(consent)).toBe('2026-01-01T10:00:00.000Z')
  })
  it('falls back to the timestamp embedded in the key', () => {
    expect(recordTimestamp({}, 'enquiry/2026-06-04T12-30-00-000Z-xx')).toBe(
      '2026-06-04T12:30:00Z',
    )
  })
  it('is null when undatable', () => {
    expect(recordTimestamp({}, 'no-date-here')).toBeNull()
  })
})

describe('ageDays / isExpired', () => {
  const now = Date.parse('2026-06-01T00:00:00.000Z') // 150 whole days after Jan 1 10:00

  it('computes whole-day age', () => {
    expect(ageDays(enquiry, enquiry.id, now)).toBe(150)
  })
  it('never prunes an undatable record', () => {
    expect(ageDays({}, 'no-date', now)).toBeNull()
    expect(isExpired({}, 'no-date', 30, now)).toBe(false)
  })
  it('expires only past the window', () => {
    expect(isExpired(enquiry, enquiry.id, 200, now)).toBe(false)
    expect(isExpired(enquiry, enquiry.id, 100, now)).toBe(true)
  })
  it('defaults retention to 12 months', () => {
    expect(RETENTION_DAYS_DEFAULT).toBe(365)
  })
})

describe('summarise', () => {
  it('shows email + kind for a submission', () => {
    const line = summarise(enquiry.id, enquiry)
    expect(line).toContain('visitor@example.com')
    expect(line).toContain('kind=enquiry')
    expect(line).toContain(enquiry.id)
  })
  it('shows consent version for a ledger entry', () => {
    expect(summarise(consent.id, consent)).toContain('consent v3')
  })
})
