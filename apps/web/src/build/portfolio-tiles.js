// ─────────────────────────────────────────────────────────────────────────────
// Build-time renderer: pieces[] → portfolio masonry tile HTML
// ─────────────────────────────────────────────────────────────────────────────
// Imported by vite.config.js. The `beansprout-portfolio-tiles` plugin replaces
// the `<!-- pieces:masonry -->` marker in portfolio/index.html with this output,
// at dev-server load AND in the production build — so tiles ship as static HTML
// (good for SEO / no-JS / LCP) while staying driven by a single data file.

// Line-art placeholders, shown until a piece has a real `img`. Inner SVG only —
// wrapped with shared attrs in `placeholder()`. Keep the set small; these are
// throwaway scaffolding that disappears the moment a photo is dropped in.
// Exported so the data-contract tests validate src/data against this single
// source of truth (instead of a hand-maintained copy that drifts).
export const GLYPHS = {
  sprig:    '<path d="M50 12C42 32 42 55 50 90C58 55 58 32 50 12Z"/><path d="M50 32L32 37 M50 52L28 57 M50 72L32 77"/>',
  moth:     '<path d="M28 78C28 52 36 32 50 26C64 32 72 52 72 78"/><path d="M34 52C40 46 46 46 50 52C54 46 60 46 66 52"/>',
  leaf:     '<path d="M50 15C35 30 30 50 38 72C44 88 56 88 62 72C70 50 65 30 50 15Z"/><path d="M50 38L50 90 M38 55L62 55"/>',
  mushroom: '<circle cx="50" cy="56" r="18"/><path d="M50 38L50 18 M32 56L50 74L68 56"/><path d="M38 26L50 18L62 26"/>',
  waves:    '<path d="M20 50C30 35 40 35 50 50C60 65 70 65 80 50 M20 70C30 55 40 55 50 70C60 85 70 85 80 70"/>',
  wheat:    '<path d="M50 90L50 30L35 15L50 30L65 15 M50 50L40 55 M50 65L60 70"/>',
  lily:     '<path d="M50 85L50 30C50 20 40 18 38 26C36 18 26 20 26 30L26 50"/><path d="M50 30C50 20 60 18 62 26C64 18 74 20 74 30L74 50"/>',
  branch:   '<path d="M30 80C35 50 50 30 70 25C60 45 55 65 50 85"/>',
}

// Display labels for the tile overlay + alt text. These mirror the example chip /
// placement labels in the COPY comments; if the artist renames a category, update
// the chip label in portfolio/index.html and the matching entry here together.
export const STYLE_LABELS = {
  'fine-line':   'Fine line',
  botanical:     'Botanical',
  'black-grey':  'Black & grey',
  illustrative:  'Illustrative',
  dotwork:       'Dotwork',
  colour:        'Colour',
  script:        'Script',
}
export const PLACEMENT_LABELS = {
  forearm: 'Forearm', wrist: 'Wrist', back: 'Back', spine: 'Spine',
  leg: 'Leg', chest: 'Chest', hand: 'Hand',
}

const styleLabel = t => STYLE_LABELS[t] || t
const placeLabel = t => PLACEMENT_LABELS[t] || t

// Escape for text content and double-quoted attribute values.
const esc = s => String(s ?? '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')

// Alt text formula (kept consistent for SEO): "<style> tattoo of <subject> on <placement>"
const altText = p =>
  `${styleLabel(p.styles[0])} tattoo of ${p.subject} on ${placeLabel(p.placement)}`

// Real-photo markup — responsive <picture> with AVIF/WebP + JPEG fallback.
// `eager` is passed for the first row so the LCP image isn't lazy-loaded.
function photo(p, eager) {
  const srcset = ext => `${p.img}-400.${ext} 400w, ${p.img}-800.${ext} 800w, ${p.img}-1200.${ext} 1200w`
  const sizes  = '(min-width:1200px) 23vw, (min-width:900px) 31vw, 47vw'
  const loading = eager ? 'eager" fetchpriority="high' : 'lazy'
  return `<picture>
        <source type="image/avif" srcset="${srcset('avif')}" sizes="${sizes}">
        <source type="image/webp" srcset="${srcset('webp')}" sizes="${sizes}">
        <img src="${esc(p.img)}-800.jpg" alt="${esc(altText(p))}"
             width="${p.w}" height="${p.h}" loading="${loading}" decoding="async">
      </picture>`
}

// Single pre-formatted image — used when `img` already carries a file extension
// (e.g. an artist-exported "/images/tattoos/Koi.webp"). We serve that one file
// as-is rather than building a multi-size srcset: these are final web exports,
// not masters to derive 400/800/1200 tiers from. Still ships `width`/`height`
// so the aspect-ratio box is reserved (no layout shift), and the lightbox reads
// the same <img> as the responsive path.
const HAS_EXT = /\.(avif|webp|jpe?g|png)$/i
function singlePhoto(p, eager) {
  const loading = eager ? 'eager" fetchpriority="high' : 'lazy'
  return `<img src="${esc(p.img)}" alt="${esc(altText(p))}"
             width="${p.w}" height="${p.h}" loading="${loading}" decoding="async">`
}

// Placeholder markup — palette swatch + line-art glyph. Fills the tile's
// (uniform 3:4) cell via CSS; no fixed height needed in the grid layout.
function placeholder(p) {
  const glyph = GLYPHS[p.glyph] || GLYPHS.sprig
  return `<div class="tile-placeholder ${p.tone}">
        <svg viewBox="0 0 100 100" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">${glyph}</svg>
      </div>`
}

// Grid sort key: the piece's `date` (YYYY-MM-DD) as a comparable integer, e.g.
// '2025-09-11' → 20250911. Higher = newer. This is the single definition of the
// ordering — the data file authors a human `date`, this turns it into the sort
// key, and it's mirrored into `data-order` so the client-side Newest/Oldest sort
// stays in lockstep with the build-time order. Exported for the data-contract test.
export const dateKey = p => Number(String(p.date).replace(/-/g, ''))

function tile(p, eager) {
  const dataStyle = p.styles.join(' ')          // space-separated → multi-style filter
  const sub = `${styleLabel(p.styles[0])} · ${placeLabel(p.placement)}`
  const media = p.img ? (HAS_EXT.test(p.img) ? singlePhoto(p, eager) : photo(p, eager)) : placeholder(p)
  return `    <a href="/portfolio/${esc(p.slug)}/" class="masonry-tile ${p.tone}"
       data-style="${esc(dataStyle)}" data-placement="${esc(p.placement)}" data-order="${dateKey(p)}">
      ${media}
      <div class="tile-overlay">
        <p class="tile-title">${esc(p.title)}</p>
        <p class="tile-sub">${esc(sub)}</p>
      </div>
    </a>`
}

export function renderPortfolioTiles(pieces) {
  // Newest first by date (matches the default Sort option). Stable: pieces sharing
  // a date keep the order they're listed in pieces.js. The first row (~4 tiles)
  // renders eager so the largest contentful paint isn't lazy.
  const ordered = pieces
    .map((p, i) => ({ p, i }))
    .sort((a, b) => dateKey(b.p) - dateKey(a.p) || a.i - b.i)
    .map(o => o.p)
  return ordered.map((p, i) => tile(p, i < 4)).join('\n')
}
