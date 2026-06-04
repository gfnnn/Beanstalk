// Tests for src/handlers/flash-status.js — the read-only endpoint the flash grid
// calls on load to reflect live availability. The D1 binding is the in-memory fake.
import { describe, it, expect, beforeEach } from 'vitest'
import { handler } from '../src/handlers/flash-status.js'
import { makeD1 } from './helpers/fake-d1.js'

let d1, env
const H = (event) => handler(event, env)
const get = (headers = {}) => ({ httpMethod: 'GET', headers: { origin: 'https://beansprout.ink', ...headers } })

beforeEach(() => {
  d1 = makeD1()
  env = { DB: d1.DB }
})

describe('flash-status handler', () => {
  it('answers the CORS preflight with 204', async () => {
    const res = await H({ httpMethod: 'OPTIONS', headers: {} })
    expect(res.statusCode).toBe(204)
  })

  it('rejects non-GET methods with 405', async () => {
    expect((await H({ httpMethod: 'POST', headers: {} })).statusCode).toBe(405)
  })

  it('returns the live claims map', async () => {
    d1.data.flash.set('flash-03', { status: 'claimed', updated_at: 'x' })
    d1.data.flash.set('flash-07', { status: 'pending', updated_at: 'x' })
    const res = await H(get())
    expect(res.statusCode).toBe(200)
    expect(JSON.parse(res.body)).toEqual({ claims: { 'flash-03': 'claimed', 'flash-07': 'pending' } })
  })

  it('returns an empty map when nothing has been claimed', async () => {
    const res = await H(get())
    expect(res.statusCode).toBe(200)
    expect(JSON.parse(res.body)).toEqual({ claims: {} })
  })
})
