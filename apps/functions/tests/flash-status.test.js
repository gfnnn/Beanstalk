// Tests for netlify/functions/flash-status.js — the read-only endpoint the flash
// grid calls on load to reflect live availability. @netlify/blobs is mocked.
import { describe, it, expect, beforeEach, vi } from 'vitest'

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

const { handler } = await import('../netlify/functions/flash-status.js')
const get = (headers = {}) => ({ httpMethod: 'GET', headers: { origin: 'https://beansprout.netlify.app', ...headers } })

beforeEach(() => stores.clear())

describe('flash-status handler', () => {
  it('answers the CORS preflight with 204', async () => {
    const res = await handler({ httpMethod: 'OPTIONS', headers: {} })
    expect(res.statusCode).toBe(204)
  })

  it('rejects non-GET methods with 405', async () => {
    expect((await handler({ httpMethod: 'POST', headers: {} })).statusCode).toBe(405)
  })

  it('returns the live claims map', async () => {
    stores.set('flash-claims', new Map([['claims', { 'flash-03': 'claimed', 'flash-07': 'pending' }]]))
    const res = await handler(get())
    expect(res.statusCode).toBe(200)
    expect(JSON.parse(res.body)).toEqual({ claims: { 'flash-03': 'claimed', 'flash-07': 'pending' } })
  })

  it('returns an empty map when nothing has been claimed', async () => {
    const res = await handler(get())
    expect(res.statusCode).toBe(200)
    expect(JSON.parse(res.body)).toEqual({ claims: {} })
  })
})
