// ─────────────────────────────────────────────────────────────────────────────
// Build-time renderer: pieces[] → homepage "What I do" specialism cards
// ─────────────────────────────────────────────────────────────────────────────
// Imported by vite.config.js. The generated-grids plugin swaps this into the
// `<!-- homepage:specialisms -->` marker on the homepage, in dev AND build, so
// the cards ship as static HTML (SEO / no-JS / LCP) while staying driven by the
// single portfolio data file.
//
// Each card showcases ONE style. The preview thumbnails are pulled live from
// src/data/pieces.js — the newest pieces (that have a real photo) carrying that
// style — so adding/retiring portfolio pieces keeps the homepage in step with no
// hand-editing here. Which styles are featured (and the per-card copy) lives in
// src/data/homepage.js → `specialisms`; this file only turns that into markup.

import { STYLE_LABELS, styleLabel, altText, dateKey } from './portfolio-tiles.js'
import { esc, HAS_EXT } from './html.js'

// How many preview thumbnails sit in each card (the .specialism-previews row).
const PREVIEWS = 3

// Image source for a preview thumbnail. Mirrors portfolio-tiles: an export that
// already carries an extension (e.g. "…/Koi.webp") is served as-is; a no-extension
// base path resolves to its 400px derivative (these tiles are small squares, so a
// single small source is plenty — no srcset needed).
const thumbSrc = p => (HAS_EXT.test(p.img) ? p.img : `${p.img}-400.jpg`)

// The newest pieces with a real photo that carry `style`, up to `n`. Newest-first
// by date with a stable tiebreak on source order (same as the portfolio grid), so
// the homepage previews track the catalogue's most recent work in that style.
export function piecesForStyle(pieces, style, n = PREVIEWS) {
  return (pieces || [])
    .map((p, i) => ({ p, i }))
    .filter(({ p }) => p.img && Array.isArray(p.styles) && p.styles.includes(style))
    .sort((a, b) => dateKey(b.p) - dateKey(a.p) || a.i - b.i)
    .slice(0, n)
    .map(o => o.p)
}

// One preview thumbnail → a link to the piece's own page (same target the masonry
// tiles use). Decorative-but-described: real alt text for SEO/a11y.
function preview(p) {
  return `<a class="preview" href="/portfolio/${esc(p.slug)}/">
          <img src="${esc(thumbSrc(p))}" alt="${esc(altText(p))}"
               width="${p.w}" height="${p.h}" loading="lazy" decoding="async">
        </a>`
}

// One specialism card. `style` must be a known portfolio style token; the title's
// plain part is its label (single source of truth, STYLE_LABELS), `em` + `body`
// are author copy. `i`/`total` drive the "0X / 0Y" numbering + the background
// numeral. The CTA deep-links to the matching portfolio style filter.
function card(spec, pieces, i, total) {
  const style = spec.style
  const num   = String(i + 1).padStart(2, '0')
  const denom = String(total).padStart(2, '0')
  const label = styleLabel(style)
  const previews = piecesForStyle(pieces, style).map(preview).join('\n          ')
  const em = spec.em ? ` <em>${esc(spec.em)}</em>` : ''
  return `    <article class="specialism-card" data-num="${num}">
      <div class="specialism-num">${num} / ${denom}</div>
      <div class="specialism-content">
        <div class="specialism-previews">
          ${previews}
        </div>
        <h3 class="specialism-title">${esc(label)}${em}</h3>
        <p class="specialism-body">${esc(spec.body)}</p>
        <a href="/portfolio/?style=${esc(style)}" class="specialism-link">Browse ${esc(label.toLowerCase())} work</a>
      </div>
    </article>`
}

// Render every configured specialism card. Entries naming an unknown style still
// render (styleLabel falls back to the raw token) — the data-contract test guards
// the tokens, the same way it does for pieces.js.
export function renderSpecialisms(pieces, specialisms = []) {
  const list = specialisms || []
  return list.map((spec, i) => card(spec, pieces, i, list.length)).join('\n')
}

// Re-exported so the data-contract test can derive the valid style set from the
// renderer maps (the single source of truth) rather than a copy that drifts.
export { STYLE_LABELS }
