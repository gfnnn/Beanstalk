// Data-contract tests for src/data/pieces.js & src/data/flash.js.
//
// CLAUDE.md is explicit that the tokens in these files (styles, placement,
// glyph, status) must stay in lockstep with the filter chips / <select> options
// and the renderer label maps — "change them together". The renderers fall back
// silently on an unknown token (`STYLE_LABELS[t] || t`, `GLYPHS[g] || GLYPHS.sprig`),
// so a typo wouldn't throw — it would just ship a broken filter or the wrong
// glyph. These tests are the guard rail: the allowed-token sets below mirror the
// documented contract, so drift in the data fails CI instead of reaching prod.
import { describe, it, expect } from 'vitest'
import { pieces } from '../src/data/pieces.js'
import { flash } from '../src/data/flash.js'

// Mirrors STYLE_LABELS / PLACEMENT_LABELS / GLYPHS in src/build/portfolio-tiles.js
const PORTFOLIO_STYLES = new Set(['fine-line', 'botanical', 'blackwork', 'script', 'colour'])
const PORTFOLIO_PLACEMENTS = new Set(['forearm', 'wrist', 'back', 'spine', 'leg', 'chest', 'hand'])
const PORTFOLIO_GLYPHS = new Set(['sprig', 'moth', 'leaf', 'mushroom', 'waves', 'wheat', 'lily', 'branch'])

// Mirrors STATUS / GLYPHS in src/build/flash-cards.js
const FLASH_STATUSES = new Set(['available', 'pending', 'claimed'])
const FLASH_GLYPHS = new Set(['sprig', 'bud', 'moth', 'wheat', 'tulip', 'leaf', 'peaks', 'arch', 'blob', 'branch', 'star', 'sprout'])

describe('portfolio data (pieces.js)', () => {
  it('has unique slugs', () => {
    const slugs = pieces.map(p => p.slug)
    expect(new Set(slugs).size).toBe(slugs.length)
  })

  it('has unique order values (so the sort is deterministic)', () => {
    const orders = pieces.map(p => p.order)
    expect(new Set(orders).size).toBe(orders.length)
  })

  it.each(pieces)('piece $slug is structurally valid', (p) => {
    expect(p.slug, 'slug').toBeTruthy()
    expect(p.title, 'title').toBeTruthy()
    expect(p.subject, 'subject').toBeTruthy()
    expect(Array.isArray(p.styles) && p.styles.length > 0, 'styles non-empty array').toBe(true)
    expect(typeof p.order, 'order is a number').toBe('number')
    p.styles.forEach(s => expect(PORTFOLIO_STYLES, `style "${s}"`).toContain(s))
    expect(PORTFOLIO_PLACEMENTS, `placement "${p.placement}"`).toContain(p.placement)
    expect(PORTFOLIO_GLYPHS, `glyph "${p.glyph}"`).toContain(p.glyph)
  })

  it.each(pieces)('piece $slug supplies w & h whenever img is set (no layout shift)', (p) => {
    if (p.img) {
      expect(typeof p.w, 'width').toBe('number')
      expect(typeof p.h, 'height').toBe('number')
    }
  })
})

describe('flash data (flash.js)', () => {
  it('has unique ids', () => {
    const ids = flash.map(f => f.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it.each(flash)('card $id is structurally valid', (f) => {
    expect(f.id, 'id').toBeTruthy()
    expect(f.title, 'title').toBeTruthy()
    expect(FLASH_STATUSES, `status "${f.status}"`).toContain(f.status)
    expect(FLASH_GLYPHS, `glyph "${f.glyph}"`).toContain(f.glyph)
    expect(typeof f.price, 'price is a number').toBe('number')
    expect(typeof f.size, 'size is a number').toBe('number')
    expect(typeof f.drop, 'drop is a number').toBe('number')
  })

  it.each(flash)('card $id supplies w & h whenever img is set', (f) => {
    if (f.img) {
      expect(typeof f.w, 'width').toBe('number')
      expect(typeof f.h, 'height').toBe('number')
    }
  })
})
