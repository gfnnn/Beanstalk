// ─────────────────────────────────────────────────────────────────────────────
// FLASH TICKETS — single source of truth
// ─────────────────────────────────────────────────────────────────────────────
// Every card on /flash/ is generated from this array at BUILD TIME by the
// generated-grids Vite plugin (see vite.config.js → renderer in
// src/build/flash-cards.js). Edit cards here — never hand-edit the markup in
// flash/index.html. Mirrors the portfolio's src/data/pieces.js setup.
//
// PER-CARD FIELDS
//   id          Stable identifier (also the slug for a future detail page)
//   title       Piece name shown on the card + used as the claim key      (COPY)
//   specs       "<size> · <placement options> · <style>" caption line      (COPY)
//   price       Number (pounds). Renders as £<price>; also the data-price
//               sort key and the claim button's £<price>.
//   size        Number (inches) — the data-size sort key.
//   drop        Drop number — the data-drop sort key (default = newest drop first).
//               The highest `drop` value present is the CURRENT drop; any record with
//               a lower number becomes the "Past drops" archive on /flash/ automatically
//               (flash.js moves them out of the live views into the Past chip).
//   status      'available' | 'pending' | 'claimed'
//                 available → claimable (live button)
//                 pending   → claim submitted, awaiting deposit (amber, disabled)
//                 claimed   → sold (dimmed + "Claimed" stamp, disabled)
//
// PLACEHOLDER FIELDS (until a real photo exists)
//   tone        Square placeholder tint: ci-moss·ci-sage·ci-cream·ci-warm·ci-blush·ci-ink·ci-deep·ci-clay
//               (the swatch COLOURS are defined in src/data/palette.js → `tones`)
//   glyph       Line-art placeholder (see GLYPHS in src/build/flash-cards.js)
//
// IMAGE FIELDS — fill in to swap the placeholder for a real square photo
//   img         Base path, no extension/size, e.g. "/images/flash/moth".
//               Renderer builds <picture> srcset (avif/webp/jpg) from it.
//   w, h        Intrinsic px dimensions (square crop). Required when img is set.
// ─────────────────────────────────────────────────────────────────────────────

// SEASON — the human label for the CURRENT drop, shown in the /flash/ page eyebrow
// next to the auto-derived drop number ("Drop 12 · Summer 2026"). The number tracks
// the cards automatically (highest `drop` below); the season is editorial, so it
// lives here as the single source of truth rather than hand-written in flash/index.html.
// Update it when a new drop lands. Empty string → the eyebrow shows just "Drop N".
// ARTIST-COPY · FLASH-D1 · pending approval — see docs/COPY-REVIEW.md
export const season = 'Summer 2026'

// NOTE: titles, specs and prices below are placeholders matched to each card's
// line-art glyph so the grid reads sensibly until real flash photos are added.
// Swap in the real piece names, sizes and prices (and `img`) per drop.
// ARTIST-COPY · FLASH-D2 · pending approval (titles/specs/prices) — see docs/COPY-REVIEW.md
export const flash = [
  { id: 'flash-01', title: 'Wildflower sprig', specs: '3 inches · Forearm, calf · Fine line',          price: 180, size: 3, drop: 12, status: 'available', tone: 'ci-sage',  glyph: 'sprig',  img: null, w: null, h: null },
  { id: 'flash-02', title: 'Poppy bud',        specs: '2 inches · Wrist, ankle · Fine line',           price: 160, size: 2, drop: 12, status: 'available', tone: 'ci-cream', glyph: 'bud',    img: null, w: null, h: null },
  { id: 'flash-03', title: 'Luna moth',        specs: '4 inches · Forearm, spine · Black & grey',      price: 220, size: 4, drop: 12, status: 'claimed',   tone: 'ci-ink',   glyph: 'moth',   img: null, w: null, h: null },
  { id: 'flash-04', title: 'Wheat stems',      specs: '3 inches · Forearm, spine · Fine line',         price: 200, size: 3, drop: 12, status: 'available', tone: 'ci-moss',  glyph: 'wheat',  img: null, w: null, h: null },
  { id: 'flash-05', title: 'Single tulip',     specs: '3 inches · Forearm, calf · Fine line',          price: 170, size: 3, drop: 12, status: 'available', tone: 'ci-warm',  glyph: 'tulip',  img: null, w: null, h: null },
  { id: 'flash-06', title: 'Fern frond',       specs: '3 inches · Forearm, calf · Fine line',          price: 190, size: 3, drop: 12, status: 'claimed',   tone: 'ci-deep',  glyph: 'leaf',   img: null, w: null, h: null },
  { id: 'flash-07', title: 'Mountain line',    specs: '2 inches · Wrist, ankle · Fine line',           price: 130, size: 2, drop: 12, status: 'available', tone: 'ci-blush', glyph: 'peaks',  img: null, w: null, h: null },
  { id: 'flash-08', title: 'Garden arch',      specs: '4 inches · Forearm, thigh · Fine line',         price: 240, size: 4, drop: 12, status: 'available', tone: 'ci-sage',  glyph: 'arch',   img: null, w: null, h: null },
  { id: 'flash-09', title: 'Harvest moon',     specs: '2 inches · Wrist, ankle · Dotwork',             price: 150, size: 2, drop: 12, status: 'pending',   tone: 'ci-cream', glyph: 'blob',   img: null, w: null, h: null },
  { id: 'flash-10', title: 'Berry branch',     specs: '3 inches · Forearm, calf · Fine line',          price: 180, size: 3, drop: 12, status: 'available', tone: 'ci-clay',  glyph: 'branch', img: null, w: null, h: null },
  { id: 'flash-11', title: 'North star',       specs: '2 inches · Wrist, ankle · Black & grey',        price: 160, size: 2, drop: 12, status: 'claimed',   tone: 'ci-warm',  glyph: 'star',   img: null, w: null, h: null },
  { id: 'flash-12', title: 'First sprout',     specs: '3 inches · Forearm, spine · Fine line',         price: 210, size: 3, drop: 12, status: 'available', tone: 'ci-moss',  glyph: 'sprout', img: null, w: null, h: null },
]
