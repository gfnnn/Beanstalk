// Drift guard for the server-side price authority. The Worker charges flash
// pieces from the committed manifest (src/data/flash-prices.json), NOT from
// anything the browser sends — so the manifest must always match flash.js. If a
// price edit forgets `npm run sync:prices`, this fails CI instead of shipping a
// stale (or wrong) amount to a real customer.
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { flash } from '../../web/src/data/flash.js'
import { buildPriceMap, priceToPence } from '../scripts/sync-flash-prices.mjs'

const here = dirname(fileURLToPath(import.meta.url))
const manifest = JSON.parse(
  readFileSync(resolve(here, '../src/data/flash-prices.json'), 'utf8'),
)

describe('flash price manifest', () => {
  it('matches flash.js exactly — re-run `npm run sync:prices` if this fails', () => {
    expect(manifest).toEqual(buildPriceMap(flash))
  })

  it('covers every flash piece id', () => {
    for (const piece of flash) expect(manifest[piece.id]).toBeDefined()
  })

  it('every amount is a positive integer number of pence', () => {
    for (const [id, pence] of Object.entries(manifest)) {
      expect(Number.isInteger(pence), `${id} → ${pence}`).toBe(true)
      expect(pence).toBeGreaterThan(0)
    }
  })
})

describe('priceToPence', () => {
  it('converts pounds to integer pence', () => {
    expect(priceToPence(180)).toBe(18000)
    expect(priceToPence(12.5)).toBe(1250)
  })

  it('rejects zero, negative, and non-numeric prices (a bad price fails the build)', () => {
    expect(() => priceToPence(0, 'x')).toThrow()
    expect(() => priceToPence(-5, 'x')).toThrow()
    expect(() => priceToPence('abc', 'x')).toThrow()
    expect(() => priceToPence(null, 'x')).toThrow()
  })
})
