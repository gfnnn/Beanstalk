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
//   glyph       Line-art placeholder (see GLYPHS in src/build/flash-cards.js)
//
// IMAGE FIELDS — fill in to swap the placeholder for a real square photo
//   img         Base path, no extension/size, e.g. "/images/flash/moth".
//               Renderer builds <picture> srcset (avif/webp/jpg) from it.
//   w, h        Intrinsic px dimensions (square crop). Required when img is set.
// ─────────────────────────────────────────────────────────────────────────────

export const flash = [
  { id: 'flash-01', title: 'Lorem ipsum dolor',     specs: '0 inches · Lorem ipsum, lorem lorem · Lorem', price: 180, size: 3, drop: 12, status: 'available', tone: 'ci-sage',  glyph: 'sprig',  img: null, w: null, h: null },
  { id: 'flash-02', title: 'Lorem ipsum dolor sit', specs: '0 inches · Lorem ipsum · Lorem lorem',         price: 160, size: 2, drop: 12, status: 'available', tone: 'ci-cream', glyph: 'bud',    img: null, w: null, h: null },
  { id: 'flash-03', title: 'Lorem ipsum dolor',     specs: '0 inches · Lorem ipsum · Lorem',               price: 220, size: 4, drop: 12, status: 'claimed',   tone: 'ci-ink',   glyph: 'moth',   img: null, w: null, h: null },
  { id: 'flash-04', title: 'Lorem ipsum',           specs: '0 inches · Lorem lorem ipsum · Lorem',         price: 200, size: 3, drop: 12, status: 'available', tone: 'ci-moss',  glyph: 'wheat',  img: null, w: null, h: null },
  { id: 'flash-05', title: 'Lorem ipsum dolor sit', specs: '0 inches · Lorem ipsum · Lorem lorem',         price: 170, size: 3, drop: 12, status: 'available', tone: 'ci-warm',  glyph: 'tulip',  img: null, w: null, h: null },
  { id: 'flash-06', title: 'Lorem ipsum dolor',     specs: '0 inches · Lorem ipsum · Lorem',               price: 190, size: 3, drop: 12, status: 'claimed',   tone: 'ci-deep',  glyph: 'leaf',   img: null, w: null, h: null },
  { id: 'flash-07', title: 'Lorem ipsum',           specs: '0 inches · Lorem ipsum · Lorem lorem',         price: 130, size: 2, drop: 12, status: 'available', tone: 'ci-blush', glyph: 'peaks',  img: null, w: null, h: null },
  { id: 'flash-08', title: 'Lorem ipsum dolor sit', specs: '0 inches · Lorem ipsum lorem · Lorem',         price: 240, size: 4, drop: 12, status: 'available', tone: 'ci-sage',  glyph: 'arch',   img: null, w: null, h: null },
  { id: 'flash-09', title: 'Lorem ipsum dolor',     specs: '0 inches · Lorem ipsum · Lorem lorem',         price: 150, size: 2, drop: 12, status: 'pending',   tone: 'ci-cream', glyph: 'blob',   img: null, w: null, h: null },
  { id: 'flash-10', title: 'Lorem ipsum',           specs: '0 inches · Lorem ipsum lorem · Lorem',         price: 180, size: 3, drop: 12, status: 'available', tone: 'ci-clay',  glyph: 'branch', img: null, w: null, h: null },
  { id: 'flash-11', title: 'Lorem ipsum dolor sit', specs: '0 inches · Lorem ipsum · Lorem',               price: 160, size: 2, drop: 12, status: 'claimed',   tone: 'ci-warm',  glyph: 'star',   img: null, w: null, h: null },
  { id: 'flash-12', title: 'Lorem ipsum dolor',     specs: '0 inches · Lorem ipsum, lorem · Lorem',        price: 210, size: 3, drop: 12, status: 'available', tone: 'ci-moss',  glyph: 'sprout', img: null, w: null, h: null },
]
