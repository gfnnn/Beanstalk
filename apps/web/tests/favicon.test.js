// Tests for src/build/favicon.js — the traced brand mark and the palette-coloured
// favicon.svg the `palette` plugin emits. The mark path is a pixel-faithful trace
// of the final artwork; these tests don't re-verify the tracing (that was a
// one-off, eyeballed against the source raster) — they pin the contract: the
// favicon is a valid standalone SVG whose colours come from the active palette,
// so a palette switch genuinely recolours it.
import { describe, it, expect } from 'vitest'
import {
  MARK_PATH,
  MARK_VIEWBOX,
  MARK_TIGHT_VIEWBOX,
  MARK_FILL_RULE,
  renderFaviconSvg,
} from '../src/build/favicon.js'
import { activePalette } from '../src/build/palette.js'

describe('the mark', () => {
  it('is a non-trivial multi-subpath vector with its fill rule pinned', () => {
    expect(MARK_PATH.length).toBeGreaterThan(1000)
    expect((MARK_PATH.match(/M/g) || []).length).toBeGreaterThan(1) // strokes + the curl's hole
    expect(MARK_FILL_RULE).toBe('evenodd') // potrace subtractive subpaths need it
  })

  it('declares its coordinate spaces', () => {
    expect(MARK_VIEWBOX).toMatch(/^0 0 \d+ \d+$/)
    expect(MARK_TIGHT_VIEWBOX).toMatch(/^\d+ \d+ \d+ \d+$/)
  })
})

describe('renderFaviconSvg', () => {
  const svg = renderFaviconSvg()

  it('is a standalone square SVG document', () => {
    expect(svg).toMatch(/^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg"/)
    expect(svg).toContain('viewBox="0 0 1000 1000"')
    expect(svg.trim()).toMatch(/<\/svg>$/)
  })

  it('takes its colours from the active palette (tile = bg, mark = ink)', () => {
    expect(svg).toContain(`fill="${activePalette.colors.bg}"`)
    expect(svg).toContain(`fill="${activePalette.colors.ink}"`)
  })

  it('recolours when handed a different palette', () => {
    const other = { colors: { bg: '#101010', ink: '#FAFAFA' } }
    const dark = renderFaviconSvg(other)
    expect(dark).toContain('fill="#101010"')
    expect(dark).toContain('fill="#FAFAFA"')
    expect(dark).not.toContain(activePalette.colors.bg)
  })

  it('carries the mark with its fill rule', () => {
    expect(svg).toContain(`fill-rule="${MARK_FILL_RULE}"`)
    expect(svg).toContain(MARK_PATH.slice(0, 60))
  })
})
