// ─────────────────────────────────────────────────────────────────────────────
// Build-time renderer: the active palette (src/data/palette.js) → CSS variables
// ─────────────────────────────────────────────────────────────────────────────
// The `palette` plugin in vite.config.js injects renderPaletteStyle() into every
// page's <head> (dev AND build), so the whole site's colours come from the one
// content file. The CSS only ever reads these custom properties — see
// src/styles/variables.css (derived tints/lines) and components/tones.css.
import { palettes, active } from '../data/palette.js'

// The palette in force. Falls back to the first defined palette if `active`
// names one that doesn't exist, so a typo can never ship a colourless site.
export const activePalette = palettes[active] || Object.values(palettes)[0]

// "#RRGGBB" / "#RGB" → "r, g, b" (the channels, for rgba(var(--x-rgb), .5)).
function hexChannels(hex) {
  let h = String(hex).trim().replace(/^#/, '')
  if (h.length === 3) h = h.split('').map(c => c + c).join('')
  const n = parseInt(h, 16)
  return `${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}`
}

// Build the `:root { … }` declarations for a palette: every brand colour as both
// `--name` (the hex) and `--name-rgb` (its channels), plus the per-tone
// from/to/text trio that components/tones.css paints the gradient swatches from.
export function paletteVars(palette = activePalette) {
  const lines = []
  for (const [name, hex] of Object.entries(palette.colors || {})) {
    lines.push(`--${name}: ${hex};`)
    lines.push(`--${name}-rgb: ${hexChannels(hex)};`)
  }
  for (const [name, t] of Object.entries(palette.tones || {})) {
    lines.push(`--tone-${name}-from: ${t.from};`)
    lines.push(`--tone-${name}-to: ${t.to};`)
    lines.push(`--tone-${name}-text: ${t.text};`)
  }
  return lines
}

// The injectable <style> block. `id="palette"` doubles as the idempotency guard
// (piece pages render their own head, so the plugin skips re-injecting there).
export function renderPaletteStyle(palette = activePalette) {
  return `<style id="palette">:root{\n  ${paletteVars(palette).join('\n  ')}\n}</style>`
}

// The browser-chrome colour (mobile address bar) — kept in step with the page
// background so it can't drift from the palette.
export const themeColor = activePalette.colors.bg
