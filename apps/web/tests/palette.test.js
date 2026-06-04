// Tests for src/build/palette.js — turns the active palette (src/data/palette.js)
// into the :root CSS custom properties injected into every page's <head>. A wrong
// hex→channels conversion or a missing token ships sitewide colour corruption with
// no error, so we pin the maths and the per-palette token contract here.
import { describe, it, expect } from 'vitest'
import {
  activePalette,
  paletteVars,
  renderPaletteStyle,
  themeColor,
} from '../src/build/palette.js'
import { palettes, active } from '../src/data/palette.js'

describe('activePalette', () => {
  it('resolves to the palette named by `active`', () => {
    expect(activePalette).toBe(palettes[active])
  })
})

describe('paletteVars', () => {
  const vars = paletteVars()
  const joined = vars.join('\n')

  it('emits both --name and --name-rgb for every colour', () => {
    for (const [name, hex] of Object.entries(activePalette.colors)) {
      expect(joined).toContain(`--${name}: ${hex};`)
      expect(joined).toContain(`--${name}-rgb:`)
    }
  })

  it('emits the from/to/text trio for every tone', () => {
    for (const [name, t] of Object.entries(activePalette.tones)) {
      expect(joined).toContain(`--tone-${name}-from: ${t.from};`)
      expect(joined).toContain(`--tone-${name}-to: ${t.to};`)
      expect(joined).toContain(`--tone-${name}-text: ${t.text};`)
    }
  })

  it('converts a 6-digit hex to comma-separated 0-255 channels', () => {
    // moss #4A5D3F → 74, 93, 63
    const out = paletteVars({ colors: { moss: '#4A5D3F' }, tones: {} })
    expect(out).toContain('--moss: #4A5D3F;')
    expect(out).toContain('--moss-rgb: 74, 93, 63;')
  })

  it('expands a 3-digit shorthand hex before converting', () => {
    // #abc → #aabbcc → 170, 187, 204
    const out = paletteVars({ colors: { x: '#abc' }, tones: {} })
    expect(out).toContain('--x-rgb: 170, 187, 204;')
  })

  it('handles pure black and white at the channel extremes', () => {
    const out = paletteVars({ colors: { black: '#000000', white: '#FFFFFF' }, tones: {} })
    expect(out).toContain('--black-rgb: 0, 0, 0;')
    expect(out).toContain('--white-rgb: 255, 255, 255;')
  })

  it('tolerates a palette with no tones', () => {
    expect(() => paletteVars({ colors: { bg: '#fff' } })).not.toThrow()
  })
})

describe('renderPaletteStyle', () => {
  const style = renderPaletteStyle()

  it('wraps the vars in a :root block inside <style id="palette"> (the idempotency guard)', () => {
    expect(style.startsWith('<style id="palette">:root{')).toBe(true)
    expect(style.endsWith('}</style>')).toBe(true)
  })

  it('contains the active background colour token', () => {
    expect(style).toContain(`--bg: ${activePalette.colors.bg};`)
  })
})

describe('themeColor', () => {
  it('tracks the active palette background so browser chrome cannot drift', () => {
    expect(themeColor).toBe(activePalette.colors.bg)
  })
})

// CLAUDE.md: "keep its colors/tones keys in step with the others so a switch
// can't leave a token undefined." A palette swap that referenced a missing token
// would ship a colourless surface — catch the divergence here instead.
describe('palette token contract across all palettes', () => {
  const names = Object.keys(palettes)
  const colorKeys = new Set(Object.keys(palettes[names[0]].colors))
  const toneKeys = new Set(Object.keys(palettes[names[0]].tones))

  it.each(names)('palette "%s" defines the same colour keys as the others', (name) => {
    expect(new Set(Object.keys(palettes[name].colors))).toEqual(colorKeys)
  })

  it.each(names)('palette "%s" defines the same tone keys as the others', (name) => {
    expect(new Set(Object.keys(palettes[name].tones))).toEqual(toneKeys)
  })

  it.each(names)('palette "%s" uses valid hex colours throughout', (name) => {
    const HEX = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i
    for (const [k, v] of Object.entries(palettes[name].colors)) {
      expect(HEX.test(v), `${name}.colors.${k} = ${v}`).toBe(true)
    }
    for (const [k, t] of Object.entries(palettes[name].tones)) {
      for (const stop of ['from', 'to', 'text']) {
        expect(HEX.test(t[stop]), `${name}.tones.${k}.${stop} = ${t[stop]}`).toBe(true)
      }
    }
  })
})
