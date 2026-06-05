// ─────────────────────────────────────────────────────────────────────────────
// Build-time renderer: flash[] → flash card HTML
// ─────────────────────────────────────────────────────────────────────────────
// Imported by vite.config.js. The generated-grids plugin replaces the
// `<!-- flash:grid -->` marker in flash/index.html with this output (dev + build).
// The markup is exactly what flash.js expects to read: a .flash-card with
// data-status/price/size/drop, a .card-status badge, and a .claim-btn carrying
// data-piece/data-price (live) or disabled (pending/claimed).
import { esc } from './html.js'

// Square line-art placeholders, shown until a card has a real `img`. Inner SVG
// only — wrapped with shared attrs in `placeholder()`. Exported so the
// data-contract tests validate src/data/flash.js against this single source of
// truth (instead of a hand-maintained copy that drifts).
export const GLYPHS = {
  sprig:  '<path d="M50 10C35 30 35 50 50 90M50 30L30 35M50 50L25 55M50 70L30 75"/>',
  bud:    '<circle cx="50" cy="50" r="22"/><path d="M50 28L50 12M38 30L50 12L62 30"/>',
  moth:   '<path d="M30 80C30 50 40 30 50 25C60 30 70 50 70 80M35 50C40 45 45 45 50 50C55 45 60 45 65 50"/>',
  wheat:  '<path d="M50 90L50 30L35 15L50 30L65 15M50 50L40 55M50 60L60 65"/>',
  tulip:  '<circle cx="50" cy="55" r="20"/><path d="M50 35L50 15M30 55L50 75L70 55"/>',
  leaf:   '<path d="M50 15C35 25 30 45 40 65L40 85L60 85L60 65C70 45 65 25 50 15"/>',
  peaks:  '<path d="M20 50L35 35L50 50L65 35L80 50M25 65L75 65"/>',
  arch:   '<path d="M25 75C25 50 35 35 50 35C65 35 75 50 75 75M40 50L60 50"/>',
  blob:   '<path d="M30 30Q50 10 70 30Q90 50 70 70Q50 90 30 70Q10 50 30 30"/>',
  branch: '<path d="M30 85C35 50 50 30 70 25C60 45 55 65 50 85"/>',
  star:   '<path d="M50 20L55 40L75 40L60 55L65 75L50 65L35 75L40 55L25 40L45 40Z"/>',
  sprout: '<path d="M50 85L50 50C50 40 40 35 35 25M50 50C50 40 60 35 65 25M50 65C50 55 60 50 70 45"/>',
}

export const STATUS = {
  available: { cls: 'available',      label: 'Available' },
  pending:   { cls: 'pending',        label: 'Pending'   },
  claimed:   { cls: 'claimed-status', label: 'Claimed'   },
}

// Real square photo — responsive <picture>. Styled by `.flash-card .card-image img`.
function photo(p) {
  const srcset = ext => `${p.img}-300.${ext} 300w, ${p.img}-600.${ext} 600w, ${p.img}-900.${ext} 900w`
  const sizes  = '(min-width:1100px) 23vw, (min-width:900px) 31vw, 47vw'
  return `<picture>
          <source type="image/avif" srcset="${srcset('avif')}" sizes="${sizes}">
          <source type="image/webp" srcset="${srcset('webp')}" sizes="${sizes}">
          <img src="${esc(p.img)}-600.jpg" alt="${esc(p.title)}, flash tattoo design"
               width="${p.w}" height="${p.h}" loading="lazy" decoding="async">
        </picture>`
}

function placeholder(p) {
  const glyph = GLYPHS[p.glyph] || GLYPHS.sprig
  return `<div class="card-image-placeholder ${p.tone}">
          <svg viewBox="0 0 100 100" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">${glyph}</svg>
        </div>`
}

function button(p) {
  if (p.status === 'available') {
    return `<button class="claim-btn" data-piece="${esc(p.title)}" data-price="£${p.price}">Claim this</button>`
  }
  const label = p.status === 'pending' ? 'Pending deposit' : 'Claimed'
  return `<button class="claim-btn" disabled aria-disabled="true">${label}</button>`
}

function card(p) {
  const s = STATUS[p.status] || STATUS.available
  return `    <div class="flash-card" data-id="${esc(p.id)}" data-status="${esc(p.status)}" data-price="${p.price}" data-size="${p.size}" data-drop="${p.drop}">
      <div class="card-image">
        ${p.img ? photo(p) : placeholder(p)}
      </div>
      <div class="card-body">
        <div class="price-row">
          <span class="card-price">£${p.price}</span>
          <span class="card-status ${s.cls}">${s.label}</span>
        </div>
        <p class="card-title">${esc(p.title)}</p>
        <p class="card-specs">${esc(p.specs)}</p>
        ${button(p)}
      </div>
    </div>`
}

export function renderFlashCards(items) {
  // DOM order here = initial display order. flash.js's default sort is newest drop
  // first (data-drop desc); keep this array in the order you want shown by default.
  // Past-drop records (lower `drop`) belong in this same array — flash.js routes them
  // into the "Past drops" view, so they need no separate file or page.
  return items.map(card).join('\n')
}

// The CURRENT drop number — the highest `drop` value in the data. Same definition
// the client uses to scope the live grid (src/js/modules/flash.js → currentDrop) and
// that src/data/flash.js documents, so the page eyebrow ("Drop N") can never drift
// from the cards: add a new drop's records and this follows automatically. Empty
// data → '' (the eyebrow then reads as just its authored season text).
export function renderFlashDrop(items = []) {
  if (!items.length) return ''
  return String(Math.max(...items.map(i => +i.drop || 0)))
}
