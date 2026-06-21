// ─────────────────────────────────────────────────────────────────────────────
// Build-time recipe: the brand-mark watermark baked into the full-res image tier
// ─────────────────────────────────────────────────────────────────────────────
// The portfolio photos are the artist's work; this stamps the studio's sprig into
// the IMAGE PIXELS (not a CSS overlay a download bypasses) so a saved/screenshot
// full-res image carries a quiet brand mark. Small, bottom-left, low-opacity — a
// deterrent, not a billboard.
//
// One recipe, two consumers (so the mark is identical everywhere):
//   • scripts/process-media.mjs — composites it during master processing, so every
//     NEW image from the Dropbox flow ships watermarked (single encode).
//   • scripts/watermark-existing.mjs — composites it onto the already-live tiers
//     whose masters are gone (the one-time in-place migration).
//
// The mark is the same traced sprig as the favicon (MARK_PATH), filled CREAM over a
// faint blurred INK halo so it reads on both light and dark photos. It is rendered
// as a full-tier-sized SVG overlay (transparent except the corner mark) and handed
// to sharp().composite() — placement is encoded in the SVG, so the caller needs no
// per-tier gravity maths. Pure + deterministic (no randomness/time; numbers rounded)
// so re-runs are byte-identical and never churn committed tiers.
import { MARK_FILL_RULE, MARK_PATH, MARK_TIGHT_VIEWBOX } from './favicon.js'
import { activePalette } from './palette.js'

// Tunable recipe — the single place to adjust how the mark looks. Keep it subtle.
export const WATERMARK = {
  heightFraction: 0.10, // mark height = 10% of the image height
  margin: 0.035, //         corner inset = 3.5% of the smaller dimension
  opacity: 0.28, //         cream mark fill opacity
  haloOpacity: 0.22, //     ink halo fill opacity (blurred — keeps the mark legible)
}

// The ONE tier per lane that carries the mark: the full-res image people actually
// view close-up / download. Portfolio's lightbox loads -1200 (data-full), flash's
// largest is -900. Smaller thumbnails stay clean (see docs/MEDIA.md). A renderer
// that swaps in a different base tier must keep these in step.
export const WATERMARK_WIDTH = { portfolio: 1200, flash: 900 }

// The tight viewBox is the box around just the ink: "minX minY vbW vbH". Parse it
// (don't re-hardcode) so a re-trace of the mark flows through unchanged.
const [vbMinX, vbMinY, vbW, vbH] = MARK_TIGHT_VIEWBOX.split(/\s+/).map(Number)

// A full `width × height` SVG overlay with the sprig in the bottom-left corner and
// nothing else. Composited over a photo, the transparent area leaves the photo
// untouched. Returned as a string (unit-testable); see watermarkSvgBuffer below.
export function renderWatermarkSvg({ width, height, palette = activePalette, opts = WATERMARK }) {
  const markH = Math.round(height * opts.heightFraction)
  const markW = Math.round(markH * (vbW / vbH))
  const margin = Math.round(Math.min(width, height) * opts.margin)
  const scale = markW / vbW
  const blur = Math.max(1, Math.round(markW * 0.03))

  // Bottom-left placement. The inner translate cancels the tight viewBox origin so
  // the ink lands at (0,0) before we scale and move it into the corner.
  const tx = margin
  const ty = height - margin - markH
  const transform = `translate(${tx} ${ty}) scale(${scale.toFixed(5)}) translate(${-vbMinX} ${-vbMinY})`

  // Halo first (blurred ink), mark on top (cream) — a light glyph with a soft dark
  // edge stays visible whether the photo behind it is pale or dark.
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
<defs><filter id="wm" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="${blur}"/></filter></defs>
<g transform="${transform}">
<path d="${MARK_PATH}" fill="${palette.colors.ink}" fill-rule="${MARK_FILL_RULE}" fill-opacity="${opts.haloOpacity}" filter="url(#wm)"/>
<path d="${MARK_PATH}" fill="${palette.colors.cream}" fill-rule="${MARK_FILL_RULE}" fill-opacity="${opts.opacity}"/>
</g>
</svg>`
}

// The same overlay as a Buffer, ready to drop straight into
// sharp().composite([{ input: <buffer>, gravity: 'northwest' }]). Sharp rasterises
// the SVG at its declared pixel size via its bundled librsvg.
export function watermarkSvgBuffer(args) {
  return Buffer.from(renderWatermarkSvg(args))
}
