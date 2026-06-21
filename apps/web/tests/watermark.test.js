// Unit tests for src/build/watermark.js — the SVG overlay recipe is a pure,
// deterministic function (no sharp, no disk), so these are fast string assertions.
// The pixel-level "is the mark actually baked in the bottom-left" behaviour is
// covered against real sharp in process-media.test.js.
import { describe, it, expect } from 'vitest'
import { renderWatermarkSvg, WATERMARK_WIDTH } from '../src/build/watermark.js'
import { MARK_PATH } from '../src/build/favicon.js'
import { activePalette } from '../src/build/palette.js'

describe('renderWatermarkSvg', () => {
  const args = { width: 1200, height: 1600, lane: 'portfolio' }

  it('is a full-tier overlay carrying the traced brand mark', () => {
    const svg = renderWatermarkSvg(args)
    expect(svg).toContain('viewBox="0 0 1200 1600"')
    expect(svg).toContain('width="1200"')
    expect(svg).toContain('height="1600"')
    expect(svg).toContain(MARK_PATH) // the real sprig, not a redrawing
  })

  it('draws a cream mark over a blurred ink halo (legible on light + dark photos)', () => {
    const svg = renderWatermarkSvg(args)
    expect(svg).toContain(activePalette.colors.cream)
    expect(svg).toContain(activePalette.colors.ink)
    expect(svg).toContain('feGaussianBlur') // the halo blur
    // mark sits ON TOP of the halo → cream <path> comes after the ink <path>
    expect(svg.indexOf(activePalette.colors.cream)).toBeGreaterThan(svg.indexOf(activePalette.colors.ink))
  })

  it('places the mark in the bottom-left corner', () => {
    const svg = renderWatermarkSvg(args)
    // height 1600 × 0.10 → markH 160; margin = min(1200,1600) × 0.035 → 42.
    // ty = 1600 − 42 − 160 = 1398; tx = margin = 42.
    expect(svg).toContain('translate(42 1398)')
  })

  it('is pure — identical args yield byte-identical output (no churn)', () => {
    expect(renderWatermarkSvg(args)).toBe(renderWatermarkSvg(args))
  })

  it('marks the full-res tier per lane', () => {
    expect(WATERMARK_WIDTH).toEqual({ portfolio: 1200, flash: 900 })
  })
})
