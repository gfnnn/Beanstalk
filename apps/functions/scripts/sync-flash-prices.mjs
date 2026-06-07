#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────────────────────
// Server-side price authority for flash checkout.
//
// The browser must NEVER tell the Worker how much to charge. `apps/web/src/data/
// flash.js` is the single source of truth for prices, but the Worker can't import
// across the workspace boundary without coupling the two deploys (the monorepo's
// whole point is that they ship independently). So this build-time script reads
// flash.js (pure data, no imports) and writes a committed manifest the Worker
// trusts:  apps/functions/src/data/flash-prices.json  → { "<piece-id>": <pence> }.
//
// Run it whenever a drop's prices change, and commit the regenerated JSON:
//   node apps/functions/scripts/sync-flash-prices.mjs      (or: npm run sync:prices)
//
// A drift guard (tests/flash-prices.test.js) fails CI if the manifest and flash.js
// disagree, so a price edit that forgets this step can't ship a stale amount.
// ─────────────────────────────────────────────────────────────────────────────
import { writeFileSync, mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const FLASH_DATA = resolve(here, '../../web/src/data/flash.js')
const OUT_FILE   = resolve(here, '../src/data/flash-prices.json')

// Turn a pounds price into integer pence, rejecting anything that isn't a real,
// positive amount — a bad price must fail the build, not silently bake in £0.
export function priceToPence(price, id = 'piece') {
  const pence = Math.round(Number(price) * 100)
  if (!Number.isFinite(pence) || pence <= 0) {
    throw new Error(`flash piece "${id}" has an invalid price: ${JSON.stringify(price)}`)
  }
  return pence
}

// Build the { id: pence } manifest from the flash data array.
export function buildPriceMap(flash) {
  const prices = {}
  for (const piece of flash) {
    if (!piece || !piece.id) continue
    if (prices[piece.id] !== undefined) {
      throw new Error(`duplicate flash piece id "${piece.id}" — ids must be unique`)
    }
    prices[piece.id] = priceToPence(piece.price, piece.id)
  }
  return prices
}

async function main() {
  const { flash } = await import(pathToFileURL(FLASH_DATA).href)
  if (!Array.isArray(flash)) throw new Error(`expected a 'flash' array export from ${FLASH_DATA}`)

  const prices = buildPriceMap(flash)
  mkdirSync(dirname(OUT_FILE), { recursive: true })
  writeFileSync(OUT_FILE, JSON.stringify(prices, null, 2) + '\n')
  console.log(`Wrote ${Object.keys(prices).length} flash prices → ${OUT_FILE}`)
}

// Only run when invoked directly (so the helpers above stay importable in tests).
if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  main().catch(err => { console.error(err.message || err); process.exit(1) })
}
