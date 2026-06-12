// Tests for scripts/master-metadata.mjs — the Dropbox master-filename grammar
// (the artist's metadata channel) and the data-entry writer. Validation must be
// EXACT (unknown tokens reject with the valid vocabulary listed — never guessed)
// and the writer must preserve pieces.js's newest-first invariant, which the
// data-integrity suite enforces on the real file.
import { describe, it, expect } from 'vitest'
import {
  slugify,
  titleOf,
  parseMasterName,
  formatPieceEntry,
  formatFlashEntry,
  insertEntryLines,
} from '../scripts/master-metadata.mjs'

describe('titleOf', () => {
  it('returns the first " -- " segment without the extension', () => {
    expect(titleOf('Koi -- forearm -- colour -- 2026-01-01.jpg')).toBe('Koi')
    expect(titleOf('Plain Name.jpg')).toBe('Plain Name')
    expect(slugify(titleOf('Peacock butterfly -- forearm -- colour -- 2026-01-01.jpg'))).toBe('peacock-butterfly')
  })
})

describe('parseMasterName — portfolio', () => {
  const NAME = 'Peacock butterfly -- arm -- colour+realism -- 2026-05-15.jpg'

  it('parses a valid 4-part name with an explicit date (subject defaults to the title)', () => {
    const r = parseMasterName('portfolio', NAME)
    expect(r.ok).toBe(true)
    expect(r.value).toMatchObject({
      slug: 'peacock-butterfly',
      title: 'Peacock butterfly',
      subject: 'peacock butterfly',
      subjectDefaulted: true,
      styles: ['colour', 'realism'],
      placement: 'arm',
      date: '2026-05-15',
      dateDefaulted: false,
    })
    // decorative placeholder defaults, valid against the renderer maps
    expect(r.value.tone).toBe('t-stone')
    expect(r.value.glyph).toBe('sprig')
  })

  it('takes an optional 5th part as the subject/alt-text override', () => {
    const r = parseMasterName('portfolio', 'Peacock -- arm -- colour -- 2026-05-15 -- a peacock butterfly and carnations.jpg')
    expect(r.ok).toBe(true)
    expect(r.value.subject).toBe('a peacock butterfly and carnations')
    expect(r.value.subjectDefaulted).toBe(false)
  })

  it('makes the date optional — a 3-part name uses the supplied upload date', () => {
    const r = parseMasterName('portfolio', 'Koi -- leg -- fine-line.jpg', { uploadDate: '2026-02-02' })
    expect(r.ok).toBe(true)
    expect(r.value).toMatchObject({
      slug: 'koi', placement: 'leg', styles: ['fine-line'],
      date: '2026-02-02', dateDefaulted: true, subjectDefaulted: true,
    })
  })

  it('falls back to today when neither a date nor an upload date is given', () => {
    const r = parseMasterName('portfolio', 'Koi -- leg -- fine-line.jpg')
    expect(r.ok).toBe(true)
    expect(r.value.dateDefaulted).toBe(true)
    expect(r.value.date).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })

  it('reads a non-date 4th part as the subject and still auto-dates', () => {
    const r = parseMasterName('portfolio', 'Koi -- leg -- fine-line -- a leaping koi.jpg', { uploadDate: '2026-02-02' })
    expect(r.ok).toBe(true)
    expect(r.value.subject).toBe('a leaping koi')
    expect(r.value.subjectDefaulted).toBe(false)
    expect(r.value.date).toBe('2026-02-02')
    expect(r.value.dateDefaulted).toBe(true)
  })

  it('is forgiving about case and separator spacing, but not about tokens', () => {
    const r = parseMasterName('portfolio', 'Koi--ARM--Fine-Line -- 2026-05-15.jpg')
    expect(r.ok).toBe(true)
    expect(r.value.placement).toBe('arm')
    expect(r.value.styles).toEqual(['fine-line'])
  })

  it('rejects an unknown placement, listing the valid tokens', () => {
    const r = parseMasterName('portfolio', 'Koi -- shoulder -- colour -- 2026-05-15.jpg')
    expect(r.ok).toBe(false)
    expect(r.reason).toMatch(/"shoulder" isn't a placement/)
    expect(r.reason).toMatch(/arm · body · leg/)
  })

  it('rejects an unknown style, listing the valid tokens — never fuzzy-matches', () => {
    const r = parseMasterName('portfolio', 'Koi -- arm -- fineline -- 2026-05-15.jpg')
    expect(r.ok).toBe(false)
    expect(r.reason).toMatch(/"fineline" isn't a style/)
    expect(r.reason).toMatch(/fine-line/)
  })

  it('rejects a date-shaped but malformed or impossible date (not silently a subject)', () => {
    expect(parseMasterName('portfolio', 'Koi -- arm -- colour -- 15-05-2026.jpg').ok).toBe(false)
    expect(parseMasterName('portfolio', 'Koi -- arm -- colour -- 2026-13-45.jpg').ok).toBe(false)
  })

  it('rejects the wrong part count with the grammar in the message', () => {
    const r = parseMasterName('portfolio', 'Koi -- arm.jpg')
    expect(r.ok).toBe(false)
    expect(r.reason).toMatch(/needs 3, 4, or 5/)
    expect(r.reason).toMatch(/Title -- placement -- style/)
  })

  it('rejects a title that slugifies to nothing', () => {
    const r = parseMasterName('portfolio', '桜 -- arm -- colour -- 2026-05-15.jpg')
    expect(r.ok).toBe(false)
    expect(r.reason).toMatch(/empty slug/)
  })
})

describe('parseMasterName — flash', () => {
  const NAME = 'Luna moth -- 4in -- £220 -- forearm, spine -- black-grey.jpg'

  it('parses a valid name and generates the specs caption', () => {
    const r = parseMasterName('flash', NAME, { drop: 13 })
    expect(r.ok).toBe(true)
    expect(r.value).toMatchObject({
      slug: 'luna-moth', title: 'Luna moth', price: 220, size: 4, drop: 13, status: 'available',
    })
    expect(r.value.specs).toBe('4 inches · Forearm, spine · Black & grey')
  })

  it('accepts size/price spelling variants and singular inch', () => {
    const r = parseMasterName('flash', 'Dot -- 1 inch -- 90 -- wrist -- dotwork.jpg', { drop: 13 })
    expect(r.ok).toBe(true)
    expect(r.value.size).toBe(1)
    expect(r.value.price).toBe(90)
    expect(r.value.specs).toBe('1 inch · Wrist · Dotwork')
  })

  it('requires a drop folder for new flash pieces', () => {
    const r = parseMasterName('flash', NAME, { drop: null })
    expect(r.ok).toBe(false)
    expect(r.reason).toMatch(/drop-<N>/)
  })

  it('rejects bad size/price/style with actionable messages', () => {
    expect(parseMasterName('flash', 'X -- big -- £220 -- wrist -- dotwork.jpg', { drop: 1 }).reason).toMatch(/isn't a size/)
    expect(parseMasterName('flash', 'X -- 3in -- twenty -- wrist -- dotwork.jpg', { drop: 1 }).reason).toMatch(/isn't a price/)
    expect(parseMasterName('flash', 'X -- 3in -- £220 -- wrist -- sketchy.jpg', { drop: 1 }).reason).toMatch(/isn't a style/)
  })
})

describe('formatPieceEntry / formatFlashEntry', () => {
  it('emits a pieces.js line in the file style, escaping quotes', () => {
    const line = formatPieceEntry(
      { slug: 'gods-timing', title: "God's timing", subject: 'a sword', styles: ['fine-line', 'script'], placement: 'leg', date: '2025-09-11', tone: 't-stone', glyph: 'sprig' },
      { w: 800, h: 1067 },
    )
    expect(line).toBe(
      // biome-ignore lint/suspicious/noTemplateCurlyInString: the emitted line literally carries the data file's `${IMG}` placeholder
      "  { slug: 'gods-timing', title: 'God\\'s timing', subject: 'a sword', styles: ['fine-line', 'script'], placement: 'leg', date: '2025-09-11', tone: 't-stone', glyph: 'sprig', img: `${IMG}/gods-timing`, w: 800, h: 1067 },",
    )
  })

  it('emits a flash.js line with the id/img derived from the slug', () => {
    const line = formatFlashEntry(
      { slug: 'luna-moth', title: 'Luna moth', specs: '4 inches · Forearm, spine · Black & grey', price: 220, size: 4, drop: 13, status: 'available', tone: 'ci-sage', glyph: 'sprig' },
      { w: 600, h: 600 },
    )
    expect(line).toContain("id: 'luna-moth'")
    expect(line).toContain("img: '/images/flash/luna-moth'")
    expect(line).toContain('price: 220, size: 4, drop: 13')
    expect(line).toContain('w: 600, h: 600')
  })
})

describe('insertEntryLines', () => {
  const SRC = `// header comment
const IMG = '/images/tattoos'

export const pieces = [
  { slug: 'new1', date: '2026-05-15', x: 1 },
  { slug: 'new2', date: '2026-05-15', x: 2 },
  { slug: 'old', date: '2025-03-11', x: 3 },
]
`

  it('inserts a dated entry keeping the array newest-first', () => {
    const line = "  { slug: 'mid', date: '2025-09-11', x: 9 },"
    const out = insertEntryLines(SRC, [line], { arrayName: 'pieces', byDate: true })
    const order = [...out.matchAll(/slug: '([a-z0-9-]+)'/g)].map(m => m[1])
    expect(order).toEqual(['new1', 'new2', 'mid', 'old'])
  })

  it('places a same-date entry after the existing same-date group (stable)', () => {
    const line = "  { slug: 'same-day', date: '2026-05-15', x: 9 },"
    const out = insertEntryLines(SRC, [line], { arrayName: 'pieces', byDate: true })
    const order = [...out.matchAll(/slug: '([a-z0-9-]+)'/g)].map(m => m[1])
    expect(order).toEqual(['new1', 'new2', 'same-day', 'old'])
  })

  it('inserts several entries at once, themselves date-ordered', () => {
    const lines = [
      "  { slug: 'older', date: '2025-01-01', x: 9 },",
      "  { slug: 'newest', date: '2026-06-01', x: 9 },",
    ]
    const out = insertEntryLines(SRC, lines, { arrayName: 'pieces', byDate: true })
    const order = [...out.matchAll(/slug: '([a-z0-9-]+)'/g)].map(m => m[1])
    expect(order).toEqual(['newest', 'new1', 'new2', 'old', 'older'])
  })

  it('prepends to the array top when not date-ordered (flash: newest drop first)', () => {
    const src = 'export const flash = [\n  { id: \'a\' },\n]\n'
    const out = insertEntryLines(src, ["  { id: 'b' },"], { arrayName: 'flash', byDate: false })
    expect(out.indexOf("id: 'b'")).toBeLessThan(out.indexOf("id: 'a'"))
  })

  it('refuses to guess when the array cannot be found', () => {
    expect(() => insertEntryLines('nope', ['x'], { arrayName: 'pieces', byDate: true }))
      .toThrow(/could not find/)
  })
})
