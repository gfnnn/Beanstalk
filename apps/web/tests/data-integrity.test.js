// Data-contract tests for src/data/pieces.js & src/data/flash.js.
//
// CLAUDE.md is explicit that the tokens in these files (styles, placement,
// glyph, status) must stay in lockstep with the renderer label maps — "change
// them together". The renderers fall back silently on an unknown token
// (`STYLE_LABELS[t] || t`, `GLYPHS[g] || GLYPHS.sprig`), so a typo wouldn't
// throw — it would just ship a broken filter or the wrong glyph.
//
// The valid-token sets are derived from the renderer maps themselves (the single
// source of truth), NOT a copy kept here. That's deliberate: when a feature adds
// a new glyph/style/placement to the renderer (+ its filter chip), data that
// uses it passes automatically — no fourth list to remember to update. The test
// still fails when the DATA names a token the renderer doesn't know, which is the
// actual bug worth catching.
//
// The filter chips/<select> live in portfolio/index.html — read as text below so
// the suite also guards the data→HTML side: a token a piece actually USES must be
// filterable on the page (a labelled-but-chipless token would render fine and be
// silently unreachable through the filter bar — the drift CLAUDE.md warns about).
import { describe, it, expect } from 'vitest'
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { pieces } from '../src/data/pieces.js'
import { flash } from '../src/data/flash.js'
import {
  GLYPHS as PORTFOLIO_GLYPHS_MAP,
  STYLE_LABELS,
  PLACEMENT_LABELS,
  renderPortfolioTiles,
} from '../src/build/portfolio-tiles.js'
import { GLYPHS as FLASH_GLYPHS_MAP, STATUS, renderFlashCards } from '../src/build/flash-cards.js'
import { renderPiecePage, piecePagesData } from '../src/build/piece-page.js'
import { renderSpecialisms } from '../src/build/specialisms.js'
import { homepage } from '../src/data/homepage.js'

// Mirrors the tone tokens with CSS rules: .status-pill.{moss|clay|faint} in
// nav.css and .notice-dot.{moss|clay|faint} in hero.css. An unknown tone falls
// back to moss in the renderer, so without this guard a typo'd tone would ship
// the wrong-coloured (or default) light/dot instead of failing CI.
const TONES = new Set(['moss', 'clay', 'faint'])

const PORTFOLIO_STYLES = new Set(Object.keys(STYLE_LABELS))
const PORTFOLIO_PLACEMENTS = new Set(Object.keys(PLACEMENT_LABELS))
const PORTFOLIO_GLYPHS = new Set(Object.keys(PORTFOLIO_GLYPHS_MAP))

const FLASH_STATUSES = new Set(Object.keys(STATUS))
const FLASH_GLYPHS = new Set(Object.keys(FLASH_GLYPHS_MAP))

describe('portfolio data (pieces.js)', () => {
  it('has unique slugs', () => {
    const slugs = pieces.map(p => p.slug)
    expect(new Set(slugs).size).toBe(slugs.length)
  })

  it('is authored newest-first by a valid date (drives the default order)', () => {
    const keys = pieces.map(p => {
      expect(p.date, `piece ${p.slug} date`).toMatch(/^\d{4}-\d{2}-\d{2}$/)
      expect(Number.isNaN(Date.parse(p.date)), `piece ${p.slug} date is real`).toBe(false)
      return Number(p.date.replace(/-/g, ''))
    })
    // The grid sorts by date desc with a stable tiebreak on list order, so same-day
    // pieces show in the order written here — guard that the file stays newest-first.
    const sorted = [...keys].sort((a, b) => b - a)
    expect(keys).toEqual(sorted)
  })

  it.each(pieces)('piece $slug is structurally valid', (p) => {
    expect(p.slug, 'slug').toBeTruthy()
    expect(p.title, 'title').toBeTruthy()
    expect(p.subject, 'subject').toBeTruthy()
    expect(Array.isArray(p.styles) && p.styles.length > 0, 'styles non-empty array').toBe(true)
    expect(p.date, 'date is YYYY-MM-DD').toMatch(/^\d{4}-\d{2}-\d{2}$/)
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

  it('every token a piece uses is filterable on the portfolio page', () => {
    const html = readFileSync(
      fileURLToPath(new URL('../portfolio/index.html', import.meta.url)), 'utf8')
    const chips   = new Set([...html.matchAll(/data-filter="([^"]+)"/g)].map(m => m[1]))
    const options = new Set([...html.matchAll(/<option value="([^"]+)"/g)].map(m => m[1]))

    const usedStyles     = new Set(pieces.flatMap(p => p.styles))
    const usedPlacements = new Set(pieces.map(p => p.placement))

    // A style/placement with a renderer label but no chip/option renders fine yet
    // is unreachable through the filter UI — the first piece to use one fails here.
    usedStyles.forEach(s =>
      expect(chips, `style "${s}" needs a filter chip in portfolio/index.html`).toContain(s))
    usedPlacements.forEach(pl =>
      expect(options, `placement "${pl}" needs a <select> option in portfolio/index.html`).toContain(pl))

    // …and the page never offers a filter the renderer can't label (dead chip).
    const styleTokens = new Set(Object.keys(STYLE_LABELS))
    ;[...chips].filter(c => c !== 'all').forEach(c =>
      expect(styleTokens, `chip "${c}" has no STYLE_LABELS entry`).toContain(c))
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

// Slugs/ids become URL segments, sitemap <loc>s and tier-file basenames — all
// contexts that nothing escapes (deliberately: the sync derives them via
// slugify(), which can only emit this shape). Guard hand-edits to the same shape.
describe('slug / id format', () => {
  it.each(pieces)('piece $slug slug is url-safe', (p) => {
    expect(p.slug).toMatch(/^[a-z0-9-]+$/)
  })
  it.each(flash)('flash $id id is url-safe', (f) => {
    expect(f.id).toMatch(/^[a-z0-9-]+$/)
  })
})

// The image contract, both directions. A data entry whose img points at missing
// tier files ships silent production 404s (the build can't catch it — tiers are
// plain public/ strings — and the E2E console sweep deliberately tolerates
// failed image loads); a tier set on disk with no data entry is invisible dead
// weight (a synced master whose entry was never added). Either way THIS is the
// net that catches it, in CI, before a merge.
describe('image tiers ↔ data files', () => {
  const publicDir = sub => fileURLToPath(new URL(`../public/images/${sub}`, import.meta.url))

  // Every /images/… URL the renderers actually emit for the current data —
  // src/srcset/data-full attributes plus og:image content — must exist on disk.
  // Derived from the real rendered markup, so a renderer tier change (e.g. new
  // widths) is covered automatically without a second list to maintain.
  const referencedPaths = () => {
    const html = [
      renderPortfolioTiles(pieces),
      renderFlashCards(flash),
      renderSpecialisms(pieces, homepage.specialisms),
      ...piecePagesData(pieces).map(({ piece, prev, next }) => renderPiecePage(piece, { prev, next })),
    ].join('\n')
    const urls = new Set()
    for (const [, v] of html.matchAll(/(?:src|data-full)="([^"]+)"/g)) {
      if (v.startsWith('/images/')) urls.add(v)
    }
    for (const [, set] of html.matchAll(/srcset="([^"]+)"/g)) {
      set.split(',').forEach(part => {
        const url = part.trim().split(/\s+/)[0]
        if (url.startsWith('/images/')) urls.add(url)
      })
    }
    for (const [, v] of html.matchAll(/content="[^"]*?(\/images\/[^"]+)"/g)) urls.add(v)
    return urls
  }

  it('every image URL the renderers emit resolves to a committed file', () => {
    const urls = referencedPaths()
    expect(urls.size).toBeGreaterThan(0) // the extraction itself works
    const missing = [...urls].filter(u =>
      !existsSync(fileURLToPath(new URL(`../public${u}`, import.meta.url))))
    expect(missing, `data references image files that don't exist:\n  ${missing.join('\n  ')}`).toEqual([])
  })

  it('no orphaned tier files (every committed tier belongs to a data entry)', () => {
    const referencedBases = {
      tattoos: new Set(pieces.filter(p => p.img).map(p => p.img.split('/').pop())),
      flash:   new Set(flash.filter(f => f.img).map(f => f.img.split('/').pop())),
    }
    for (const [sub, bases] of Object.entries(referencedBases)) {
      const files = readdirSync(publicDir(sub)).filter(f => !f.startsWith('.'))
      const orphans = files.filter(f => {
        const m = f.match(/^(.+)-\d+\.(?:avif|webp|jpg)$/)
        const base = m ? m[1] : f.replace(/\.[^.]+$/, '') // tier file vs single export
        return !bases.has(base) && !bases.has(f) // single exports are referenced with extension
      })
      expect(orphans, `public/images/${sub} has files no data entry references:\n  ${orphans.join('\n  ')}`).toEqual([])
    }
  })
})

describe('homepage data (homepage.js)', () => {
  it('status uses a known tone and a string label', () => {
    expect(TONES, `status tone "${homepage.status.tone}"`).toContain(homepage.status.tone)
    expect(typeof homepage.status.label, 'status label').toBe('string')
    expect(typeof homepage.status.show, 'status show').toBe('boolean')
  })

  it('has at most three notice bars', () => {
    expect(homepage.notices.length).toBeLessThanOrEqual(3)
  })

  it.each(homepage.notices)('notice "$label" is structurally valid', (n) => {
    expect(typeof n.show, 'show is a boolean').toBe('boolean')
    expect(TONES, `notice tone "${n.tone}"`).toContain(n.tone)
    expect(n.label, 'label').toBeTruthy()
    expect(typeof n.html, 'html is a string').toBe('string')
  })

  it('has the hero copy fields the renderer reads', () => {
    for (const k of ['eyebrow', 'headLead', 'headEm', 'body', 'mediaTag']) {
      expect(typeof homepage.hero[k], `hero.${k}`).toBe('string')
    }
  })

  // The "What I do" cards pull previews live from pieces.js by style token, so a
  // token the portfolio doesn't know would render an empty card (no matching
  // previews) and a dead "Browse … work" link. Guard the tokens against the same
  // STYLE_LABELS source of truth the pieces use, and that there's data to back
  // each featured style.
  it('specialisms feature known portfolio styles with copy fields', () => {
    expect(Array.isArray(homepage.specialisms), 'specialisms is an array').toBe(true)
    homepage.specialisms.forEach((s) => {
      expect(PORTFOLIO_STYLES, `specialism style "${s.style}"`).toContain(s.style)
      expect(typeof s.em, `specialism "${s.style}" em`).toBe('string')
      expect(typeof s.body, `specialism "${s.style}" body`).toBe('string')
      // at least one real, photographed piece backs the card's previews
      const backed = pieces.some(p => p.img && p.styles.includes(s.style))
      expect(backed, `specialism "${s.style}" has a photographed piece`).toBe(true)
    })
  })
})
